/**
 * Block Strike — FPS 5x5 contra bots (Three.js).
 * Loop da partida: rounds MR12 (rounds.js), bots (bots.js), modo espectador, e a ligação
 * com a interface (hud.js): menu, loadout, HUD, placar, pausa e fim de partida.
 * `data-fase` na raiz reflete a fase: menu, freeze, jogo, fim-round ou fim-partida.
 */

import { MAPA } from './mapa.js';
import { criarMundo, posicionarParaRound, passo, vivosPorTime, relatorioDano, registrarMvp } from './mundo.js';
import { criarEntrada } from './entrada.js';
import { criarRng } from './rng.js';
import { criarSons } from './sons.js';
import { ARMAS, DIFICULDADE, ECONOMIA, FOV_PADRAO, familia } from './config.js';
import { olho, direcao } from './fisica.js';
import { visadaLivre, granadasDe } from './granadas.js';
import { criarArma, calcularSpread, velocidadeDe } from './armas.js';
import { criarHud } from './hud.js';
import { lerMira } from './mira.js';
import { contarEventos, contarPartida, lerCarreira, novaCarreira, resumoCarreira } from './carreira.js';
import { criarGrafo } from './navegacao.js';
import { criarCerebro, pensar } from './bots.js';
import { criarPartida, ladoAzul, tickPartida } from './rounds.js';
import { criarBomba, acaoPossivel } from './bomba.js';
import {
  iniciarEconomia, resetarEconomia, premiarRound, botComprar, comprar, estadoCompra,
} from './economia.js';

const DT_MAX = 0.05;
const FOGO_AVISO = 0.5; // s entre hitmarkers/dor do mesmo par atacante→vítima no fogo
const AVISTAR_A_CADA = 0.25; // s entre recálculos dos inimigos avistados (radar)
const ALCANCE_AVISTAR = 50;
const MODOS = ['partida', 'treino'];
const TAMANHOS = ['normal', 'grande'];

const distancia = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

// Compras dos bots no começo do freeze (arma preferida, colete, kit, granadas conforme o dinheiro).
function comprasDosBots(mundo, regras) {
  for (const e of mundo.entidades) {
    if (e.bot) botComprar(e, e.time === regras.terroristas ? 'T' : 'CT');
  }
}

// Cérebros novos a cada round: rotas e alvos antigos não valem depois do reposicionamento.
function recriarCerebros(mundo, grafo, rng) {
  for (const e of mundo.entidades) if (e.bot) e.cerebro = criarCerebro(e, grafo, rng, MAPA.caixas, mundo);
}

// Espectador: o próximo aliado vivo depois de `idAtual`; sem nenhum vivo, mantém a vista.
function proximaVista(mundo, idAtual) {
  const eu = mundo.entidades[mundo.jogadorId];
  const aliados = mundo.entidades.filter((e) => e.time === eu.time && e.id !== eu.id);
  const vivos = aliados.filter((e) => e.vivo);
  if (vivos.length === 0) return idAtual;
  return (vivos.find((e) => e.id > idAtual) ?? vivos[0]).id;
}

const HTML = `
      <header class="app-header">
        <div class="header-badge bs-badge">
          <span class="badge-dot bs-dot"></span>
          <span class="badge-text">FPS 5X5 · SÓ NO COMPUTADOR</span>
        </div>
        <h1 class="app-title">Block <span class="gradient-text-bs">Strike</span></h1>
        <p class="app-subtitle">Desarme 5x5 contra bots com economia e C4, ou treino livre. Primeiro a 13 vence.</p>
      </header>

      <div class="bs-stage glass-card">
        <canvas id="bs-canvas"></canvas>
        <div class="bs-aviso" id="bs-aviso" role="alert" hidden></div>
      </div>`;

// Só toque (sem mouse) não consegue mirar: o jogo é exclusivo para computador.
function soToque() {
  return matchMedia('(pointer: coarse)').matches && !matchMedia('(pointer: fine)').matches;
}

function temWebGL() {
  try {
    const sonda = document.createElement('canvas');
    const gl = sonda.getContext('webgl2') || sonda.getContext('webgl');
    if (!gl) return false;
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return true;
  } catch {
    return false;
  }
}

const clamp = (n, min, max) => Math.max(min, Math.min(max, n));

// Preferências salvas, validadas: valor estranho no storage cai no padrão.
function lerConfig(storage) {
  const primaria = storage.get('primaria', 'rifle');
  const dificuldade = storage.get('dificuldade', 'medio');
  const modo = storage.get('modo', 'partida');
  const tamanho = storage.get('tamanho', 'normal');
  const volume = Number(storage.get('volume', 0.8));
  return {
    primaria: ARMAS[primaria]?.slot === 'primaria' ? primaria : 'rifle',
    dificuldade: DIFICULDADE[dificuldade] ? dificuldade : 'medio',
    sensibilidade: clamp(Number(storage.get('sensibilidade', 1)) || 1, 0.2, 3),
    modo: MODOS.includes(modo) ? modo : 'partida',
    tamanho: TAMANHOS.includes(tamanho) ? tamanho : 'normal',
    mira: lerMira(storage.get('mira', null), storage.get('corMira', null)), // corMira: a versão antiga só tinha a cor
    volume: Number.isFinite(volume) ? clamp(volume, 0, 1) : 0.8,
    sensLuneta: clamp(Number(storage.get('sensLuneta', 1)) || 1, 0.3, 2),
    boneco: storage.get('boneco', 'azul') === 'laranja' ? 'laranja' : 'azul',
  };
}

// Giro do mouse com a luneta: encolhe na proporção do campo de visão (como no CS) vezes o ajuste do jogador.
const fatorLuneta = (zoomFov, sens) => sens * Math.tan((zoomFov * Math.PI) / 360) / Math.tan((FOV_PADRAO * Math.PI) / 360);

// Treino: sem rounds, o relógio só conta o tempo em jogo.
function criarTreino() {
  return {
    placar: { azul: 0, laranja: 0 }, round: 1, fase: 'jogo', tempo: 0,
    vencedorRound: undefined, motivo: null, resultado: null,
  };
}

// Ângulo (graus, horário, 0 = à frente) de `origem` em relação à vista de `eu`.
function anguloDe(eu, origem) {
  const f = direcao(eu.yaw, 0);
  const vx = origem.pos.x - eu.pos.x;
  const vz = origem.pos.z - eu.pos.z;
  return (Math.atan2(vx * -f.z + vz * f.x, vx * f.x + vz * f.z) * 180) / Math.PI;
}

// Pan estéreo [-1, 1] de um ponto do mundo em relação à vista de `eu`.
const panPonto = (eu, pt) => Math.sin((anguloDe(eu, { pos: pt }) * Math.PI) / 180);

function montar(raiz, ctx) {
  raiz.dataset.fase = 'menu';
  raiz.dataset.pausado = 'false';
  const aviso = raiz.querySelector('#bs-aviso');
  const motivo = soToque() ? 'Disponível apenas no computador'
    : !temWebGL() ? 'Seu navegador não suporta WebGL' : null;
  const bloquear = (texto) => {
    aviso.textContent = texto;
    aviso.hidden = false;
  };
  if (motivo) {
    bloquear(motivo);
    return { pause() {}, resume() {}, destruir() {} };
  }

  const canvas = raiz.querySelector('#bs-canvas');
  const palco = raiz.querySelector('.bs-stage');
  const sons = criarSons(ctx.audio);
  const cfg = lerConfig(ctx.storage);
  sons.definirVolume(cfg.volume);
  raiz.dataset.tamanho = cfg.tamanho;
  raiz.dataset.modo = cfg.modo;

  // Tela cheia do palco (o HUD e os menus vão junto). Sair com Esc também solta o mouse → pausa.
  const docTela = () => document.fullscreenElement ?? document.webkitFullscreenElement ?? null;
  function alternarTelaCheia() {
    try {
      if (docTela()) {
        (document.exitFullscreen ?? document.webkitExitFullscreen)?.call(document);
        return;
      }
      const pedir = palco.requestFullscreen ?? palco.webkitRequestFullscreen;
      const r = pedir?.call(palco, { navigationUI: 'hide' });
      if (r && typeof r.catch === 'function') r.catch(() => {});
    } catch {
      // sem suporte a tela cheia: o botão não faz nada
    }
  }
  const aoMudarTela = () => {
    const ligada = docTela() === palco;
    raiz.classList.toggle('bs-tela-cheia', ligada);
    hud.estadoTelaCheia(ligada);
  };
  document.addEventListener('fullscreenchange', aoMudarTela);
  document.addEventListener('webkitfullscreenchange', aoMudarTela);
  let partida = null; // { mundo, render, entrada, grafo, rngBots, partida (regras), idVista, lock, raf, antes }
  let iniciando = false;
  let geracao = 0; // cada iniciar() guarda a sua; sair/destruir invalida a que ainda espera o import
  let pausaPendente = false; // o hub pediu pausa enquanto a partida ainda carregava

  let previaMenu = null; // arma clicada no loadout e ainda não equipada: só o boneco do menu segura
  const hud = criarHud(raiz, {
    jogar: () => iniciar(),
    escolherPrimaria(tipo) {
      cfg.primaria = tipo;
      ctx.storage.set('primaria', tipo);
      if (!partida) return;
      const eu = partida.mundo.entidades[partida.mundo.jogadorId];
      eu.primariaEscolhida = tipo;
      // Só no freeze troca a arma em mãos; nos outros momentos vale a partir do próximo round.
      // No treino troca na hora (e já vem na mão) e fecha o painel.
      if (partida.mundo.economia) return; // com economia a arma vem da compra
      if (partida.partida.fase === 'freeze') eu.armas.primaria = criarArma(tipo);
      else if (partida.treino && eu.vivo) {
        eu.armas.primaria = criarArma(tipo);
        if (eu.slot !== 'primaria') eu.slotAnterior = eu.slot;
        eu.slot = 'primaria';
        partida.loadoutAberto = false;
        sons.saque(tipo);
      }
    },
    comprar(item) {
      if (!partida || !partida.mundo.economia || partida.partida.fase !== 'freeze') return false;
      const eu = partida.mundo.entidades[partida.mundo.jogadorId];
      if (!eu.vivo) return false;
      const r = comprar(eu, item, eu.time === partida.partida.terroristas ? 'T' : 'CT');
      if (!r.ok) {
        sons.vazio();
        return false;
      }
      sons.compra();
      if (ARMAS[item]) sons.saque(item);
      return true;
    },
    mudarModo(m) {
      cfg.modo = m;
      raiz.dataset.modo = m;
      ctx.storage.set('modo', m);
    },
    mudarVolume(n) {
      cfg.volume = n;
      ctx.storage.set('volume', n);
      sons.definirVolume(n);
    },
    mudarTamanho(t) {
      cfg.tamanho = t;
      raiz.dataset.tamanho = t;
      ctx.storage.set('tamanho', t);
    },
    mudarMira(m) {
      cfg.mira = m;
      ctx.storage.set('mira', m);
    },
    telaCheia: () => alternarTelaCheia(),
    mudarDificuldade(d) {
      cfg.dificuldade = d;
      ctx.storage.set('dificuldade', d);
      if (partida) partida.mundo.dificuldade = d;
    },
    mudarSensibilidade(n) {
      cfg.sensibilidade = n;
      ctx.storage.set('sensibilidade', n);
      if (partida) partida.entrada.definirSensibilidade(n);
    },
    mudarSensLuneta(n) {
      cfg.sensLuneta = n;
      ctx.storage.set('sensLuneta', n);
    },
    previaArma(tipo) {
      previaMenu = tipo;
    },
    zerarCarreira() {
      carreira = novaCarreira();
      salvarCarreira();
    },
    mudarBoneco(time) {
      cfg.boneco = time;
      ctx.storage.set('boneco', time);
    },
    continuar: () => retomar(),
    sairParaMenu: () => voltarAoMenu(),
    jogarDeNovo: () => iniciar(),
  });
  hud.definirConfig(cfg);

  // Carreira (só partidas 5x5): conta em memória e grava no fim de cada round, da partida e ao sair.
  let carreira = lerCarreira(ctx.storage.get('carreira', null));
  function salvarCarreira() {
    ctx.storage.set('carreira', carreira);
    hud.definirCarreira(resumoCarreira(carreira));
  }
  hud.definirCarreira(resumoCarreira(carreira));
  // Fechar a aba ou sair da rota no meio do round também grava.
  const salvarSeEmPartida = () => { if (partida && !partida.treino) salvarCarreira(); };
  window.addEventListener('pagehide', salvarSeEmPartida);

  // Fundo 3D do menu: o render carrega sob demanda, como na partida, e sai antes dela.
  let fundo = null;
  async function ligarFundo() {
    if (fundo || partida) return;
    const f = { render: null, raf: null };
    fundo = f;
    try {
      const { criarRender } = await import('./render.js');
      if (fundo !== f) return; // desligado enquanto carregava
      f.render = criarRender(canvas, MAPA);
      const quadro = () => {
        f.render.desenharVitrine(cfg.boneco, previaMenu ?? cfg.primaria);
        f.raf = requestAnimationFrame(quadro);
      };
      quadro();
    } catch (erro) {
      if (fundo === f) fundo = null;
      console.error(erro);
    }
  }
  function desligarFundo() {
    if (!fundo) return;
    if (fundo.raf !== null) cancelAnimationFrame(fundo.raf);
    if (fundo.render) fundo.render.destruir();
    fundo = null;
  }
  void ligarFundo();

  // Liga os eventos do passo a som e efeitos visuais, do ponto de vista do jogador.
  // Sons de outros saem com pan estéreo (esquerda/direita) e abafados pela distância.
  function reagir(p, eventos) {
    const { mundo, render } = p;
    const eu = mundo.entidades[mundo.jogadorId];
    const ouvido = olho(eu);
    const distDe = (id) => distancia(ouvido, mundo.entidades[id].pos);
    const panDe = (id) => (id === eu.id ? 0 : Math.sin((anguloDe(eu, mundo.entidades[id]) * Math.PI) / 180));
    for (const ev of eventos) {
      if (ev.tipo === 'tiro') {
        sons.tiro(ev.arma, distDe(ev.atirador), panDe(ev.atirador));
        if (ev.atirador === p.idVista) {
          if (!ARMAS[ev.arma].silenciador) render.flash();
          render.recuoVisual();
        }
        if (ev.atirador !== eu.id) p.ultimoTiro.set(ev.atirador, mundo.tempo);
      } else if (ev.tipo === 'raio') {
        render.rastro(ev.de, ev.ate, ev.atirador === p.idVista);
      } else if (ev.tipo === 'impacto') {
        render.impacto(ev.ponto, ev.normal);
        if (distancia(ouvido, ev.ponto) < 6) sons.ricochete(distancia(ouvido, ev.ponto));
      } else if (ev.tipo === 'golpe') {
        sons.golpe(ev.forte, ev.acerto, distDe(ev.atirador), panDe(ev.atirador));
        if (ev.atirador === p.idVista) render.golpe(ev.forte);
      } else if (ev.tipo === 'acerto') {
        // Fogo: pulsos a cada 0,25 s. Sem sangue, e hitmarker e dor no máximo a cada FOGO_AVISO.
        const fogo = ev.arma === 'molotov';
        if (fogo && mundo.tempo - (p.avisoFogo.get(`${ev.atirador}>${ev.alvo}`) ?? -Infinity) < FOGO_AVISO) continue;
        if (fogo) p.avisoFogo.set(`${ev.atirador}>${ev.alvo}`, mundo.tempo);
        if (ev.ponto && !fogo) render.sangue(ev.ponto, ev.parte === 'cabeca');
        if (ev.capacete && ev.ponto) {
          render.fagulhasCapacete(ev.ponto);
          // O "plink" substitui o som de headshot de quem atirou; os outros ouvem pela distância.
          const proprio = ev.atirador === eu.id;
          sons.plink(proprio ? 0 : distancia(ouvido, ev.ponto), proprio ? 0 : panPonto(eu, ev.ponto));
        }
        if (ev.atirador === eu.id) {
          if (!ev.capacete && !fogo) sons.acerto(ev.parte === 'cabeca');
          hud.acerto(ev.parte === 'cabeca');
        }
        if (ev.alvo === eu.id) {
          sons.dano();
          hud.dano(fogo ? null : anguloDe(eu, mundo.entidades[ev.atirador]));
        }
      } else if (ev.tipo === 'morte') {
        if (ev.assassino === eu.id) {
          sons.abate(ev.cabeca);
          if (!p.treino) hud.ganhou(ECONOMIA.recompensaKill[familia(ev.arma)] ?? 300, 'Abate');
        }
        if (ev.vitima === eu.id) sons.morte();
        else sons.oof(distDe(ev.vitima), panDe(ev.vitima));
        render.desmanchar(mundo.entidades[ev.vitima]);
        hud.morte({
          assassino: mundo.entidades[ev.assassino] ?? null, assistente: mundo.entidades[ev.assistente] ?? null,
          vitima: mundo.entidades[ev.vitima],
          arma: ev.arma, cabeca: ev.cabeca,
        });
      } else if (ev.tipo === 'recarga') {
        const ent = mundo.entidades[ev.atirador];
        const tipo = ent.armas?.[ent.slot]?.tipo;
        sons.recarga(ARMAS[tipo]?.recarga ?? 2.5, distDe(ev.atirador), panDe(ev.atirador));
      } else if (ev.tipo === 'saque') {
        if (ev.id === p.idVista) sons.saque(ev.arma);
      } else if (ev.tipo === 'passo') {
        sons.passo(distDe(ev.id), panDe(ev.id), ev.id === eu.id);
      } else if (ev.tipo === 'pulo') {
        if (ev.id === eu.id) sons.pulo();
      } else if (ev.tipo === 'pouso') {
        sons.pouso(distDe(ev.id), panDe(ev.id));
      } else if (ev.tipo === 'arremesso' || ev.tipo === 'granada-quique' || ev.tipo === 'explosao-he' ||
        ev.tipo === 'flash' || ev.tipo === 'cegueira' || ev.tipo === 'fumaca' ||
        ev.tipo === 'fogo' || ev.tipo === 'fogo-apagado' || ev.tipo === 'molotov-ar') {
        reagirGranada(p, ev, { eu, ouvido });
      } else {
        reagirBomba(p, ev, { eu, ouvido });
      }
    }
  }

  // Eventos das granadas: sons com distância e pan, clarões e o zumbido de quem foi cegado.
  function reagirGranada(p, ev, { eu, ouvido }) {
    const { render } = p;
    const pt = ev.ponto;
    const dist = pt ? distancia(ouvido, pt) : 0;
    const pan = pt ? panPonto(eu, pt) : 0;
    if (ev.tipo === 'arremesso') sons.arremesso(ev.atirador === eu.id ? 0 : dist, ev.atirador === eu.id ? 0 : pan);
    else if (ev.tipo === 'granada-quique') sons.quiqueGranada(dist, pan);
    else if (ev.tipo === 'explosao-he') {
      sons.he(dist, pan);
      render.explosao(pt, true);
    } else if (ev.tipo === 'flash') {
      sons.flash(dist, pan);
      render.clarao(pt);
    } else if (ev.tipo === 'fumaca') sons.fumaca(dist, pan);
    else if (ev.tipo === 'fogo') sons.molotov(dist, pan);
    else if (ev.tipo === 'fogo-apagado') sons.apagar(dist, pan);
    else if (ev.tipo === 'molotov-ar') {
      sons.molotov(dist, pan);
      render.clarao(pt, 0xff8a1f); // estourou no ar: só o clarão laranja, sem fogo
    }
    else if (ev.tipo === 'cegueira' && ev.id === eu.id) sons.zumbido(ev.dur);
  }

  // Eventos da C4: sons, avisos na tela e o efeito da explosão.
  function reagirBomba(p, ev, { eu, ouvido }) {
    const { mundo, render } = p;
    const dist = (pt) => (pt ? distancia(ouvido, pt) : 0);
    const pan = (pt) => (pt ? panPonto(eu, pt) : 0);
    if (ev.tipo === 'acao-inicio') {
      const ent = mundo.entidades[ev.id];
      sons.acaoC4(ev.acao, dist(ent.pos), ev.id === eu.id ? 0 : pan(ent.pos));
    } else if (ev.tipo === 'plantada') {
      sons.plantada(dist(ev.ponto), pan(ev.ponto));
      hud.anuncio(`C4 plantada no bombsite ${ev.site ?? ''}`.trim(), 'perigo');
    } else if (ev.tipo === 'desarmada') {
      sons.desarmada();
      hud.anuncio('C4 desarmada', 'ok');
    } else if (ev.tipo === 'explosao') {
      sons.explosao(dist(ev.ponto), pan(ev.ponto));
      render.explosao(ev.ponto);
      hud.flashExplosao(dist(ev.ponto));
    } else if (ev.tipo === 'bomba-solta') {
      if (mundo.bomba?.terroristas === eu.time) hud.anuncio('A C4 caiu no chão', 'aviso');
    } else if (ev.tipo === 'bomba-pega') {
      if (mundo.bomba?.terroristas === eu.time) hud.anuncio(`${mundo.entidades[ev.id].nome} pegou a C4`, 'aviso');
    }
  }

  // Crepitar do fogo das molotovs, de cada poça, enquanto o round corre.
  const CREPITAR_A_CADA = 0.13;
  function crepitarFogos(p, dt) {
    const fogos = p.mundo.fogos;
    if (!fogos?.length || p.partida.fase !== 'jogo') return;
    p.proxCrepito = (p.proxCrepito ?? 0) - dt;
    if (p.proxCrepito > 0) return;
    p.proxCrepito = CREPITAR_A_CADA;
    const eu = p.mundo.entidades[p.mundo.jogadorId];
    for (const f of fogos) sons.crepitar(distancia(olho(eu), f.pos), panPonto(eu, f.pos));
  }

  // Bipe da C4 plantada, cada vez mais rápido; sai do ponto onde ela está.
  function bipesDaBomba(p, dt) {
    const b = p.mundo.bomba;
    if (!b || !b.plantada || b.explodiu || b.desarmada || p.partida.fase !== 'jogo') return;
    p.proxBip -= dt;
    if (p.proxBip > 0) return;
    p.proxBip = 0.12 + 0.88 * (b.restante / 40) ** 1.5;
    const eu = p.mundo.entidades[p.mundo.jogadorId];
    sons.bipC4(distancia(olho(eu), b.pos), panPonto(eu, b.pos), b.restante);
  }

  // Inimigos que algum aliado vivo enxerga (ou que atiraram há pouco): aparecem no radar.
  function avistar(p) {
    const { mundo } = p;
    const eu = mundo.entidades[mundo.jogadorId];
    const aliados = mundo.entidades.filter((e) => e.vivo && e.time === eu.time);
    const vistos = new Set();
    for (const e of mundo.entidades) {
      if (!e.vivo || e.time === eu.time) continue;
      if (mundo.tempo - (p.ultimoTiro.get(e.id) ?? -Infinity) < 1.5) { vistos.add(e.id); continue; }
      const alvo = olho(e);
      if (aliados.some((a) => distancia(olho(a), alvo) < ALCANCE_AVISTAR && visadaLivre(mundo, olho(a), alvo))) {
        vistos.add(e.id);
      }
    }
    p.avistados = vistos;
  }

  // Troca de round: reposiciona todos, recria os cérebros, limpa as marcas e volta a vista ao jogador.
  function novoRound(p) {
    if (!p.treino) comprasDosBots(p.mundo, p.partida);
    posicionarParaRound(p.mundo, ladoAzul(p.partida.round));
    p.mundo.bomba = p.treino ? null : criarBomba(p.mundo, p.partida.terroristas);
    p.proxBip = 0;
    recriarCerebros(p.mundo, p.grafo, p.rngBots);
    p.render.limparImpactos();
    hud.limparEfeitos();
    p.idVista = p.mundo.jogadorId;
    p.mvp = null;
  }

  // Fim de partida: solta o mouse, mostra o resultado e grava as estatísticas (uma vez).
  function finalizarPartida(p) {
    const { partida: regras, mundo } = p;
    p.entrada.ativar(false);
    if (document.pointerLockElement === canvas) document.exitPointerLock();
    hud.mostrarTabela(false);
    hud.mostrarFim(regras.resultado, regras.placar);
    const eu = mundo.entidades[mundo.jogadorId];
    const st = ctx.storage;
    st.set('partidas', (Number(st.get('partidas', 0)) || 0) + 1);
    if (regras.resultado === 'azul') {
      st.set('vitorias', (Number(st.get('vitorias', 0)) || 0) + 1);
      ctx.confetti?.();
    }
    const kd = eu.kills / Math.max(1, eu.mortes);
    if (kd > (Number(st.get('melhorKD', 0)) || 0)) st.set('melhorKD', kd);
    contarPartida(carreira, regras.resultado);
    salvarCarreira();
    ctx.conta?.registrar('blockstrike', { tipo: 'partida', venceu: regras.resultado === 'azul', kd });
  }

  function aplicarEventosPartida(p, eventos) {
    const { partida, mundo } = p;
    const eu = mundo.entidades[mundo.jogadorId];
    // Intervalo: dinheiro e equipamento voltam ao começo antes de os bots comprarem no novo round.
    if (eventos.includes('troca-lados')) resetarEconomia(mundo, partida);
    for (const ev of eventos) {
      if (ev === 'novo-round') novoRound(p);
      else if (ev === 'inicio-round') sons.inicioRound();
      else if (ev === 'fim-round') {
        const antes = eu.dinheiro;
        premiarRound(mundo, partida, partida.vencedorRound ?? null);
        hud.ganhou(eu.dinheiro - antes, 'Fim de round');
        const mvp = registrarMvp(mundo, partida.vencedorRound ?? null, partida.motivo);
        const ent = mvp && mundo.entidades[mvp.id];
        p.mvp = ent ? { nome: ent.nome, motivo: mvp.motivo, kills: mvp.kills, voce: ent.id === eu.id } : null;
        if (p.mvp?.voce) carreira.mvps += 1;
        salvarCarreira();
        // A fanfarra do MVP substitui a vinheta de vitória.
        if (p.mvp?.voce) sons.mvp();
        else if (partida.vencedorRound) sons.fimRound(partida.vencedorRound === eu.time);
      } else if (ev === 'fim-partida') finalizarPartida(p);
    }
    if (raiz.dataset.fase !== partida.fase) raiz.dataset.fase = partida.fase;
  }

  // C4 para o HUD (null no treino): relógio, bombsite, progresso de plantar/desarmar e a dica do que dá para fazer.
  function estadoBomba(p, eu) {
    const b = p.mundo.bomba;
    if (!b) return null;
    const aoVivo = eu.vivo && p.partida.fase === 'jogo';
    const acao = aoVivo ? acaoPossivel(p.mundo, eu) : null;
    const meu = b.acao && b.acao.id === eu.id ? b.acao : null;
    return {
      plantada: b.plantada, restante: b.restante, site: b.site, solta: b.portador === null && !b.plantada,
      levaC4: aoVivo && b.portador === eu.id, dica: acao,
      progresso: meu ? Math.min(1, meu.t / meu.dur) : 0, acao: meu ? meu.tipo : null,
    };
  }

  // Dados do HUD para este frame: vida e arma são de quem está sendo visto (o jogador ou o aliado assistido).
  function estadoVisivel(p, cmd) {
    const { mundo, partida: regras } = p;
    const eu = mundo.entidades[mundo.jogadorId];
    const alvo = mundo.entidades[p.idVista];
    const arma = alvo.armas?.[alvo.slot] ?? null;
    let spread = 0;
    if (arma && eu.vivo) {
      spread = calcularSpread(ARMAS[arma.tipo], {
        velHoriz: alvo.velHoriz, velMax: velocidadeDe(arma.tipo), noChao: alvo.noChao, agachado: alvo.agachado, zoom: cmd.zoom,
      }) + arma.recuoAcum;
    }
    const def = arma && ARMAS[arma.tipo];
    const progressoRecarga = arma && arma.recarregandoAte > 0
      ? 1 - (arma.recarregandoAte - mundo.tempo) / def.recarga : 0;
    return {
      bomba: estadoBomba(p, eu), papel: eu.time === regras.terroristas ? 'T' : 'CT',
      compra: eu.vivo && p.mundo.economia && regras.fase === 'freeze'
        ? estadoCompra(eu, eu.time === regras.terroristas ? 'T' : 'CT') : null,
      dinheiro: p.mundo.economia ? eu.dinheiro : null,
      equip: p.mundo.economia
        ? { colete: eu.equip.colete, capacete: eu.equip.capacete, kit: eu.equip.kit, granadas: { ...eu.equip.granadas } } : null,
      cegueira: eu.vivo && mundo.tempo < (eu.cegoAte ?? 0)
        ? Math.min(1, (eu.cegoAte - mundo.tempo) / Math.max(0.2, eu.cegoDur * 0.5)) : 0,
      fase: regras.fase, round: regras.round, tempo: regras.tempo, placar: regras.placar,
      hp: alvo.hp, vivo: eu.vivo, arma: arma && (arma.tipo === 'granada'
        ? { tipo: 'granada', sel: arma.sel, n: arma.sel ? granadasDe(mundo, alvo)[arma.sel] : 0 }
        : { ...arma, pente: def.pente }), spread, progressoRecarga,
      luneta: eu.vivo && Boolean(cmd.zoom && def?.zoomFov),
      loadout: p.treino && p.loadoutAberto, modo: p.treino ? 'treino' : 'partida',
      vencedorRound: regras.vencedorRound, motivo: regras.motivo, mvp: p.mvp ?? null,
      espectando: eu.vivo ? null : alvo.nome, entidades: mundo.entidades,
      // Fora do treino, morto durante o round ou no fim dele.
      relatorio: !p.treino && (regras.fase === 'fim-round' || (!eu.vivo && regras.fase === 'jogo'))
        ? relatorioDano(mundo, eu.id) : null,
    };
  }

  function quadro(agora) {
    const p = partida;
    const dt = Math.min((agora - p.antes) / 1000, DT_MAX);
    p.antes = agora;
    const { mundo, partida: regras } = p;
    const jogador = mundo.entidades[mundo.jogadorId];
    const cmd = p.entrada.comando(jogador.yaw, jogador.pitch);
    // Só se atira com o round em jogo; fora disso (inclusive em fim-partida) o mundo segue sem tiros.
    // No freeze as teclas 1–8 escolhem a primária (hud.teclaLoadout): o slot do comando é ignorado.
    const atira = regras.fase === 'jogo';
    const cmdJogador = atira ? cmd : { ...cmd, atirar: false, usar: false, granada: null, slot: regras.fase === 'freeze' ? null : cmd.slot };
    // Painel de armas aberto no treino: 1–8 escolhem a primária, não trocam de slot.
    if (p.treino && p.loadoutAberto) cmdJogador.slot = null;
    const armaMao = jogador.vivo && jogador.armas[jogador.slot];
    if (atira && cmd.atirar && !p.cliqueAntes && armaMao && armaMao.tipo !== 'granada' && armaMao.municao === 0 && armaMao.reserva === 0) sons.vazio();
    const comandos = new Map([[jogador.id, cmdJogador]]);
    // No freeze os bots não pensam (mundo.passo usa o comando parado): senão o desencalhe
    // pularia waypoints da rota enquanto eles esperam o fim do freeze.
    for (const e of mundo.entidades) {
      if (!e.bot || !e.vivo || regras.fase === 'freeze') continue;
      const c = pensar(e, mundo, p.grafo, mundo.dificuldade, dt, p.rngBots);
      comandos.set(e.id, atira ? c : { ...c, atirar: false });
    }
    const eventos = passo(mundo, dt, comandos, { congelado: regras.fase === 'freeze', comBomba: atira });
    if (!p.treino) contarEventos(carreira, eventos, mundo.jogadorId);
    reagir(p, eventos);
    bipesDaBomba(p, dt);
    crepitarFogos(p, dt);
    if (p.treino) regras.tempo += dt;
    else if (regras.fase !== 'fim-partida') {
      const segAntes = Math.ceil(regras.tempo);
      aplicarEventosPartida(p, tickPartida(regras, dt, vivosPorTime(mundo), mundo.bomba));
      // Bipe nos últimos 5 s do round e da contagem do freeze.
      const seg = Math.ceil(regras.tempo);
      if ((regras.fase === 'jogo' || regras.fase === 'freeze') && seg !== segAntes && seg <= 5 && seg > 0) sons.bipe();
    }
    // Morto, o jogador assiste os aliados; um clique passa para o próximo.
    if (jogador.vivo) p.idVista = jogador.id;
    else if ((cmd.atirar && !p.cliqueAntes) || !mundo.entidades[p.idVista].vivo) {
      p.idVista = proximaVista(mundo, p.idVista);
    }
    p.cliqueAntes = cmd.atirar;
    const zoomFov = cmd.zoom && jogador.vivo ? ARMAS[jogador.armas[jogador.slot].tipo].zoomFov : undefined;
    p.entrada.definirFatorMira(zoomFov ? fatorLuneta(zoomFov, cfg.sensLuneta) : 1);
    p.render.desenhar(mundo, p.idVista, { zoomFov });
    hud.atualizar(estadoVisivel(p, cmd));
    p.avistarEm -= dt;
    if (p.avistarEm <= 0) {
      p.avistarEm = AVISTAR_A_CADA;
      avistar(p);
    }
    const vista = mundo.entidades[p.idVista];
    hud.radar({
      caixas: MAPA.caixas, eu: vista, entidades: mundo.entidades, avistados: p.avistados,
      sites: p.treino ? null : MAPA.bombsites, bomba: mundo.bomba,
    });
    // Freeze acabou com o mouse solto pelo B: devolve ao clique de sempre (retrava sem atirar).
    if (regras.fase !== 'freeze' && p.entrada.cursorSolto()) p.entrada.liberarClique();
    // Dica enquanto o mouse não está preso e não foi solto de propósito: perder uma trava presa abre a pausa.
    hud.mostrarDica(!p.entrada.travado() && !p.entrada.cursorSolto() && (regras.fase === 'freeze' || regras.fase === 'jogo'));
    p.raf = requestAnimationFrame(quadro);
  }

  // Pausado: só redesenha a cena (a janela pode ter sido redimensionada); a simulação não anda.
  function quadroPausado() {
    const p = partida;
    p.render.desenhar(p.mundo, p.idVista, {});
    p.raf = requestAnimationFrame(quadroPausado);
  }

  function agendar() {
    partida.entrada.ativar(true);
    partida.antes = performance.now();
    partida.raf = requestAnimationFrame(quadro);
  }

  // `forcado`: o hub pediu pausa (troca de rota). Perda de trava só pausa depois de uma trava bem-sucedida.
  // Sem rAF ativo (raf nulo) a partida já está pausada. Pausa por perda de trava continua desenhando a cena.
  // `manual`: o jogador apertou Esc sem nunca ter travado o mouse (não há perda de trava para avisar).
  function pausarPartida(forcado = true, manual = false) {
    if (!partida) {
      if (forcado && iniciando) pausaPendente = true;
      return;
    }
    if (partida.pausado) {
      if (forcado && partida.raf !== null) { // já pausada (Esc) e o hub saiu da rota: nem redesenha
        cancelAnimationFrame(partida.raf);
        partida.raf = null;
      }
      return;
    }
    const fimDeJogo = partida.partida.fase === 'fim-partida';
    if (!forcado && (fimDeJogo || (!manual && !partida.lock.travou))) return;
    if (partida.raf !== null) cancelAnimationFrame(partida.raf);
    partida.raf = null;
    partida.pausado = true;
    partida.entrada.ativar(false);
    if (document.pointerLockElement === canvas) document.exitPointerLock();
    hud.mostrarTabela(false);
    hud.mostrarDica(false);
    raiz.dataset.pausado = 'true';
    if (!fimDeJogo) hud.mostrarPausa(true);
    if (!forcado) partida.raf = requestAnimationFrame(quadroPausado);
  }

  // Volta à rota: só redesenha a cena pausada. Quem retoma a simulação é o botão Continuar.
  function reexibir() {
    if (raiz.dataset.fase === 'menu') void ligarFundo();
    if (partida && partida.pausado && partida.raf === null) partida.raf = requestAnimationFrame(quadroPausado);
  }

  function retomar() {
    if (!partida || !partida.pausado) return;
    if (partida.raf !== null) cancelAnimationFrame(partida.raf);
    partida.pausado = false;
    hud.mostrarPausa(false);
    raiz.dataset.pausado = 'false';
    partida.entrada.travar();
    agendar();
  }

  function destruirPartida() {
    if (!partida) return;
    if (partida.raf !== null) cancelAnimationFrame(partida.raf);
    partida.desligarTrava();
    partida.entrada.destruir();
    partida.render.destruir();
    partida = null;
  }

  // Invalida um iniciar() que ainda espera o import do render.
  function cancelarInicio() {
    geracao++;
    iniciando = false;
    pausaPendente = false;
  }

  function voltarAoMenu() {
    salvarSeEmPartida(); // abates do round pela metade não se perdem
    cancelarInicio();
    destruirPartida();
    hud.mostrarPausa(false);
    hud.esconderFim();
    hud.mostrarHud(false);
    hud.mostrarTabela(false);
    hud.limparEfeitos();
    hud.mostrarMenu();
    raiz.dataset.fase = 'menu';
    raiz.dataset.pausado = 'false';
    void ligarFundo();
  }

  async function iniciar() {
    if (iniciando) return;
    iniciando = true;
    pausaPendente = false;
    destruirPartida();
    desligarFundo();
    const minha = ++geracao;
    const entrada = criarEntrada(canvas, { sensibilidade: cfg.sensibilidade });
    // Os ouvintes de trava entram antes do travar(): uma trava que cai depois de ter funcionado abre a pausa.
    const lock = { travou: false };
    const aoTravar = () => { if (document.pointerLockElement === canvas) lock.travou = true; };
    document.addEventListener('pointerlockchange', aoTravar);
    entrada.aoPerderTrava(() => pausarPartida(false));
    entrada.aoTab((v) => hud.mostrarTabela(v));
    entrada.aoTecla((code) => {
      if (!partida) return;
      const eu = partida.mundo.entidades[partida.mundo.jogadorId];
      if (code === 'KeyF' && eu.vivo && partida.partida.fase !== 'fim-partida') partida.render.inspecionar();
      let usada = false;
      if (partida.partida.fase === 'freeze' && partida.mundo.economia && code === 'KeyB') {
        // CS2: B solta o mouse para clicar na compra e trava de novo, sem abrir a pausa.
        if (partida.entrada.cursorSolto()) partida.entrada.travar(); else partida.entrada.soltarCursor();
        return true;
      }
      if (partida.partida.fase === 'freeze') usada = partida.mundo.economia ? hud.teclaCompra(code) : hud.teclaLoadout(code);
      else if (partida.treino) {
        if (code === 'KeyB') partida.loadoutAberto = !partida.loadoutAberto;
        else if (partida.loadoutAberto) usada = hud.teclaLoadout(code);
      }
      // Sem trava nunca houve pointerlockchange para abrir a pausa: o Esc abre direto.
      if (code === 'Escape' && !partida.entrada.travado()) pausarPartida(false, true);
      return usada;
    });
    entrada.travar(); // precisa estar dentro do gesto de clique
    try {
      const { criarRender } = await import('./render.js');
      if (minha !== geracao) { // saiu para o menu ou destruiu enquanto carregava
        document.removeEventListener('pointerlockchange', aoTravar);
        entrada.destruir();
        if (document.pointerLockElement === canvas) document.exitPointerLock();
        return;
      }
      const treino = cfg.modo === 'treino';
      const mundo = criarMundo({
        mapa: MAPA, primariaJogador: cfg.primaria, dificuldade: cfg.dificuldade, rng: criarRng(Date.now()),
        modo: cfg.modo,
      });
      const regrasIniciais = treino ? criarTreino() : criarPartida({ freeze: ECONOMIA.freezeCompra });
      if (!treino) {
        iniciarEconomia(mundo);
        comprasDosBots(mundo, regrasIniciais);
      }
      posicionarParaRound(mundo, 'A');
      if (!treino) mundo.bomba = criarBomba(mundo, 'laranja');
      const grafo = criarGrafo(MAPA.waypoints, MAPA.arestas);
      const rngBots = criarRng(Date.now() ^ 0x5bd1e995);
      recriarCerebros(mundo, grafo, rngBots);
      const render = criarRender(canvas, MAPA);
      partida = {
        mundo, render, entrada, grafo, rngBots, partida: regrasIniciais, treino,
        loadoutAberto: false, ultimoTiro: new Map(), avisoFogo: new Map(), avistados: new Set(), avistarEm: 0, proxBip: 0,
        idVista: mundo.jogadorId, cliqueAntes: false, raf: null, antes: 0, lock, pausado: false,
        desligarTrava: () => document.removeEventListener('pointerlockchange', aoTravar),
      };
      hud.esconderMenu();
      hud.esconderFim();
      hud.mostrarPausa(false);
      hud.limparEfeitos();
      hud.textoLoadout(treino ? 'Teclas 1 a 8 escolhem · B fecha.' : 'Teclas 1 a 8. Vale para este round e os seguintes.');
      hud.mostrarHud(true);
      raiz.dataset.fase = partida.partida.fase;
      raiz.dataset.pausado = 'false';
      if (pausaPendente) { // o hub saiu da rota durante o carregamento: nasce pausada
        pausaPendente = false;
        partida.entrada.ativar(false);
        partida.pausado = true;
        if (document.pointerLockElement === canvas) document.exitPointerLock();
        raiz.dataset.pausado = 'true';
        hud.mostrarPausa(true);
      } else {
        agendar();
      }
    } catch (erro) {
      document.removeEventListener('pointerlockchange', aoTravar);
      entrada.destruir();
      hud.esconderMenu();
      hud.mostrarHud(false);
      bloquear('Não foi possível iniciar o jogo');
      console.error(erro);
    } finally {
      if (minha === geracao) iniciando = false;
    }
  }

  return {
    pause() {
      if (docTela() === palco) alternarTelaCheia(); // saiu da rota: não deixa a tela cheia presa
      pausarPartida(true);
      desligarFundo();
    },
    resume: reexibir,
    destruir() {
      salvarSeEmPartida();
      window.removeEventListener('pagehide', salvarSeEmPartida);
      cancelarInicio();
      destruirPartida();
      desligarFundo();
      document.removeEventListener('fullscreenchange', aoMudarTela);
      document.removeEventListener('webkitfullscreenchange', aoMudarTela);
      if (docTela() === palco) alternarTelaCheia();
      hud.destruir();
    },
  };
}

let instancia = null;

export default {
  id: 'blockstrike',
  nome: 'Block Strike',
  icone: '🔫',
  iconeClasse: 'bs-icon',
  descricao: 'FPS 5x5 contra bots',
  badge: { texto: 'FPS', cor: 'orange' },
  mount(raiz, ctx) {
    if (instancia) instancia.destruir();
    raiz.innerHTML = HTML;
    instancia = montar(raiz, ctx);
  },
  pause() {
    if (instancia) instancia.pause();
  },
  resume() {
    if (instancia) instancia.resume();
  },
  recorde(storage) {
    if (storage.get('partidas', 0) === 0) return null;
    const vitorias = storage.get('vitorias', 0);
    const melhorKD = Number(storage.get('melhorKD', 0)) || 0;
    return `${vitorias} vitórias · K/D ${melhorKD.toFixed(2)}`;
  }
};
