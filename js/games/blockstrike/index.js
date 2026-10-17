/**
 * Block Strike — FPS 5x5 contra bots (Three.js).
 * Loop da partida: rounds MR12 (rounds.js), bots (bots.js), modo espectador, e a ligação
 * com a interface (hud.js): menu, loadout, HUD, placar, pausa e fim de partida.
 * `data-fase` na raiz reflete a fase: menu, freeze, jogo, fim-round ou fim-partida.
 */

import { MAPA } from './mapa.js';
import { criarMundo, posicionarParaRound, passo, vivosPorTime } from './mundo.js';
import { criarEntrada } from './entrada.js';
import { criarRng } from './rng.js';
import { criarSons } from './sons.js';
import { ARMAS, DIFICULDADE } from './config.js';
import { olho, direcao, temVisada } from './fisica.js';
import { criarArma, calcularSpread, velocidadeDe } from './armas.js';
import { criarHud } from './hud.js';
import { criarGrafo } from './navegacao.js';
import { criarCerebro, pensar } from './bots.js';
import { criarPartida, ladoAzul, tickPartida } from './rounds.js';

const DT_MAX = 0.05;
const AVISTAR_A_CADA = 0.25; // s entre recálculos dos inimigos avistados (radar)
const ALCANCE_AVISTAR = 50;
const MODOS = ['partida', 'treino'];
const TAMANHOS = ['normal', 'grande'];
const COR_MIRA = /^#[0-9a-f]{6}$/i;

const distancia = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

// Cérebros novos a cada round: rotas e alvos antigos não valem depois do reposicionamento.
function recriarCerebros(mundo, grafo, rng) {
  for (const e of mundo.entidades) if (e.bot) e.cerebro = criarCerebro(e, grafo, rng, MAPA.caixas);
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
        <p class="app-subtitle">Mata-mata 5x5 contra bots ou treino livre. Primeiro a 13 vence.</p>
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
  const corMira = String(storage.get('corMira', '#4ade80'));
  const volume = Number(storage.get('volume', 0.8));
  return {
    primaria: ARMAS[primaria]?.slot === 'primaria' ? primaria : 'rifle',
    dificuldade: DIFICULDADE[dificuldade] ? dificuldade : 'medio',
    sensibilidade: clamp(Number(storage.get('sensibilidade', 1)) || 1, 0.2, 3),
    modo: MODOS.includes(modo) ? modo : 'partida',
    tamanho: TAMANHOS.includes(tamanho) ? tamanho : 'normal',
    corMira: COR_MIRA.test(corMira) ? corMira : '#4ade80',
    volume: Number.isFinite(volume) ? clamp(volume, 0, 1) : 0.8,
  };
}

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
      if (partida.partida.fase === 'freeze') eu.armas.primaria = criarArma(tipo);
      else if (partida.treino && eu.vivo) {
        eu.armas.primaria = criarArma(tipo);
        if (eu.slot !== 'primaria') eu.slotAnterior = eu.slot;
        eu.slot = 'primaria';
        partida.loadoutAberto = false;
        sons.saque(tipo);
      }
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
    mudarCorMira(c) {
      cfg.corMira = c;
      ctx.storage.set('corMira', c);
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
    continuar: () => retomar(),
    sairParaMenu: () => voltarAoMenu(),
    jogarDeNovo: () => iniciar(),
  });
  hud.definirConfig(cfg);

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
          render.flash();
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
        if (ev.ponto) render.sangue(ev.ponto, ev.parte === 'cabeca');
        if (ev.atirador === eu.id) {
          sons.acerto(ev.parte === 'cabeca');
          hud.acerto(ev.parte === 'cabeca');
        }
        if (ev.alvo === eu.id) {
          sons.dano();
          hud.dano(anguloDe(eu, mundo.entidades[ev.atirador]));
        }
      } else if (ev.tipo === 'morte') {
        if (ev.assassino === eu.id) sons.abate(ev.cabeca);
        if (ev.vitima === eu.id) sons.morte();
        hud.morte({
          assassino: mundo.entidades[ev.assassino], vitima: mundo.entidades[ev.vitima],
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
      }
    }
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
      if (aliados.some((a) => distancia(olho(a), alvo) < ALCANCE_AVISTAR && temVisada(olho(a), alvo, mundo.mapa.caixas))) {
        vistos.add(e.id);
      }
    }
    p.avistados = vistos;
  }

  // Troca de round: reposiciona todos, recria os cérebros, limpa as marcas e volta a vista ao jogador.
  function novoRound(p) {
    posicionarParaRound(p.mundo, ladoAzul(p.partida.round));
    recriarCerebros(p.mundo, p.grafo, p.rngBots);
    p.render.limparImpactos();
    hud.limparEfeitos();
    p.idVista = p.mundo.jogadorId;
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
  }

  function aplicarEventosPartida(p, eventos) {
    const { partida, mundo } = p;
    for (const ev of eventos) {
      if (ev === 'novo-round') novoRound(p);
      else if (ev === 'inicio-round') sons.inicioRound();
      else if (ev === 'fim-round' && partida.vencedorRound) {
        sons.fimRound(partida.vencedorRound === mundo.entidades[mundo.jogadorId].time);
      } else if (ev === 'fim-partida') finalizarPartida(p);
    }
    if (raiz.dataset.fase !== partida.fase) raiz.dataset.fase = partida.fase;
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
      fase: regras.fase, round: regras.round, tempo: regras.tempo, placar: regras.placar,
      hp: alvo.hp, vivo: eu.vivo, arma: arma && { ...arma, pente: def.pente }, spread, progressoRecarga,
      luneta: eu.vivo && Boolean(cmd.zoom && def?.zoomFov),
      loadout: p.treino && p.loadoutAberto, modo: p.treino ? 'treino' : 'partida',
      vencedorRound: regras.vencedorRound, motivo: regras.motivo,
      espectando: eu.vivo ? null : alvo.nome, entidades: mundo.entidades,
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
    // No freeze as teclas 1–4 escolhem a primária (hud.teclaLoadout): o slot do comando é ignorado.
    const atira = regras.fase === 'jogo';
    const cmdJogador = atira ? cmd : { ...cmd, atirar: false, slot: regras.fase === 'freeze' ? null : cmd.slot };
    // Painel de armas aberto no treino: 1–4 escolhem a primária, não trocam de slot.
    if (p.treino && p.loadoutAberto) cmdJogador.slot = null;
    const armaMao = jogador.vivo && jogador.armas[jogador.slot];
    if (atira && cmd.atirar && !p.cliqueAntes && armaMao && armaMao.municao === 0 && armaMao.reserva === 0) sons.vazio();
    const comandos = new Map([[jogador.id, cmdJogador]]);
    // No freeze os bots não pensam (mundo.passo usa o comando parado): senão o desencalhe
    // pularia waypoints da rota enquanto eles esperam o fim do freeze.
    for (const e of mundo.entidades) {
      if (!e.bot || !e.vivo || regras.fase === 'freeze') continue;
      const c = pensar(e, mundo, p.grafo, mundo.dificuldade, dt, p.rngBots);
      comandos.set(e.id, atira ? c : { ...c, atirar: false });
    }
    reagir(p, passo(mundo, dt, comandos, { congelado: regras.fase === 'freeze' }));
    if (p.treino) regras.tempo += dt;
    else if (regras.fase !== 'fim-partida') {
      const segAntes = Math.ceil(regras.tempo);
      aplicarEventosPartida(p, tickPartida(regras, dt, vivosPorTime(mundo)));
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
    p.render.desenhar(mundo, p.idVista, { zoomFov });
    hud.atualizar(estadoVisivel(p, cmd));
    p.avistarEm -= dt;
    if (p.avistarEm <= 0) {
      p.avistarEm = AVISTAR_A_CADA;
      avistar(p);
    }
    const vista = mundo.entidades[p.idVista];
    hud.radar({ caixas: MAPA.caixas, eu: vista, entidades: mundo.entidades, avistados: p.avistados });
    // Dica só enquanto o mouse nunca prendeu: depois de uma trava, perder a trava abre a pausa.
    hud.mostrarDica(!p.lock.travou && (regras.fase === 'freeze' || regras.fase === 'jogo'));
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
  }

  async function iniciar() {
    if (iniciando) return;
    iniciando = true;
    pausaPendente = false;
    destruirPartida();
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
      let usada = false;
      if (partida.partida.fase === 'freeze') usada = hud.teclaLoadout(code);
      else if (partida.treino) {
        if (code === 'KeyB') partida.loadoutAberto = !partida.loadoutAberto;
        else if (partida.loadoutAberto) usada = hud.teclaLoadout(code);
      }
      // Sem trava nunca houve pointerlockchange para abrir a pausa: o Esc abre direto.
      if (code === 'Escape' && !partida.lock.travou) pausarPartida(false, true);
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
      posicionarParaRound(mundo, 'A');
      const grafo = criarGrafo(MAPA.waypoints, MAPA.arestas);
      const rngBots = criarRng(Date.now() ^ 0x5bd1e995);
      recriarCerebros(mundo, grafo, rngBots);
      const render = criarRender(canvas, MAPA);
      partida = {
        mundo, render, entrada, grafo, rngBots, partida: treino ? criarTreino() : criarPartida(), treino,
        loadoutAberto: false, ultimoTiro: new Map(), avistados: new Set(), avistarEm: 0,
        idVista: mundo.jogadorId, cliqueAntes: false, raf: null, antes: 0, lock, pausado: false,
        desligarTrava: () => document.removeEventListener('pointerlockchange', aoTravar),
      };
      hud.esconderMenu();
      hud.esconderFim();
      hud.mostrarPausa(false);
      hud.limparEfeitos();
      hud.textoLoadout(treino ? 'Teclas 1 a 4 escolhem · B fecha.' : 'Teclas 1 a 4. Vale para este round e os seguintes.');
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
    },
    resume: reexibir,
    destruir() {
      cancelarInicio();
      destruirPartida();
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
