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
import { ARMAS, DIFICULDADE, JOGADOR } from './config.js';
import { olho, direcao } from './fisica.js';
import { criarArma, calcularSpread } from './armas.js';
import { criarHud } from './hud.js';
import { criarGrafo } from './navegacao.js';
import { criarCerebro, pensar } from './bots.js';
import { criarPartida, ladoAzul, tickPartida } from './rounds.js';

const DT_MAX = 0.05;

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
        <p class="app-subtitle">Seu time de 5 contra 5 bots. Plante, defenda e vença o round.</p>
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
  return {
    primaria: ARMAS[primaria]?.slot === 'primaria' ? primaria : 'rifle',
    dificuldade: DIFICULDADE[dificuldade] ? dificuldade : 'medio',
    sensibilidade: clamp(Number(storage.get('sensibilidade', 1)) || 1, 0.2, 3),
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
  const sons = criarSons(ctx.audio);
  const cfg = lerConfig(ctx.storage);
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
      if (partida.partida.fase === 'freeze') eu.armas.primaria = criarArma(tipo);
    },
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
  function reagir(p, eventos) {
    const { mundo, render } = p;
    const eu = mundo.entidades[mundo.jogadorId];
    const ouvido = olho(eu);
    const distDe = (id) => distancia(ouvido, mundo.entidades[id].pos);
    for (const ev of eventos) {
      if (ev.tipo === 'tiro') {
        sons.tiro(ev.arma, distDe(ev.atirador));
        if (ev.atirador === eu.id) {
          render.flash();
          render.recuoVisual();
        }
      } else if (ev.tipo === 'impacto') {
        render.impacto(ev.ponto, ev.normal);
      } else if (ev.tipo === 'acerto') {
        if (ev.atirador === eu.id) {
          sons.acerto(ev.parte === 'cabeca');
          hud.acerto(ev.parte === 'cabeca');
        }
        if (ev.alvo === eu.id) hud.dano(anguloDe(eu, mundo.entidades[ev.atirador]));
      } else if (ev.tipo === 'morte') {
        if (ev.assassino === eu.id || ev.vitima === eu.id) sons.morte();
        hud.morte({
          assassino: mundo.entidades[ev.assassino], vitima: mundo.entidades[ev.vitima],
          arma: ev.arma, cabeca: ev.cabeca,
        });
      } else if (ev.tipo === 'recarga') {
        if (ev.atirador === eu.id) sons.recarga();
      } else if (ev.tipo === 'passo') {
        sons.passo(distDe(ev.id));
      }
    }
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
        velHoriz: alvo.velHoriz, velMax: JOGADOR.velCorrer, noChao: alvo.noChao, agachado: alvo.agachado, zoom: cmd.zoom,
      }) + arma.recuoAcum;
    }
    return {
      fase: regras.fase, round: regras.round, tempo: regras.tempo, placar: regras.placar,
      hp: alvo.hp, vivo: eu.vivo, arma: arma && { ...arma, pente: ARMAS[arma.tipo].pente }, spread,
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
    const comandos = new Map([[jogador.id, cmdJogador]]);
    // No freeze os bots não pensam (mundo.passo usa o comando parado): senão o desencalhe
    // pularia waypoints da rota enquanto eles esperam o fim do freeze.
    for (const e of mundo.entidades) {
      if (!e.bot || !e.vivo || regras.fase === 'freeze') continue;
      const c = pensar(e, mundo, p.grafo, mundo.dificuldade, dt, p.rngBots);
      comandos.set(e.id, atira ? c : { ...c, atirar: false });
    }
    reagir(p, passo(mundo, dt, comandos, { congelado: regras.fase === 'freeze' }));
    if (regras.fase !== 'fim-partida') aplicarEventosPartida(p, tickPartida(regras, dt, vivosPorTime(mundo)));
    // Morto, o jogador assiste os aliados; um clique passa para o próximo.
    if (jogador.vivo) p.idVista = jogador.id;
    else if ((cmd.atirar && !p.cliqueAntes) || !mundo.entidades[p.idVista].vivo) {
      p.idVista = proximaVista(mundo, p.idVista);
    }
    p.cliqueAntes = cmd.atirar;
    const zoomFov = cmd.zoom && jogador.vivo ? ARMAS[jogador.armas[jogador.slot].tipo].zoomFov : undefined;
    p.render.desenhar(mundo, p.idVista, { zoomFov });
    hud.atualizar(estadoVisivel(p, cmd));
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
  function pausarPartida(forcado = true) {
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
    if (!forcado && (!partida.lock.travou || fimDeJogo)) return;
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
      if (partida && partida.partida.fase === 'freeze') hud.teclaLoadout(code);
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
      const mundo = criarMundo({
        mapa: MAPA, primariaJogador: cfg.primaria, dificuldade: cfg.dificuldade, rng: criarRng(Date.now()),
      });
      posicionarParaRound(mundo, 'A');
      const grafo = criarGrafo(MAPA.waypoints, MAPA.arestas);
      const rngBots = criarRng(Date.now() ^ 0x5bd1e995);
      recriarCerebros(mundo, grafo, rngBots);
      const render = criarRender(canvas, MAPA);
      partida = {
        mundo, render, entrada, grafo, rngBots, partida: criarPartida(),
        idVista: mundo.jogadorId, cliqueAntes: false, raf: null, antes: 0, lock, pausado: false,
        desligarTrava: () => document.removeEventListener('pointerlockchange', aoTravar),
      };
      hud.esconderMenu();
      hud.esconderFim();
      hud.mostrarPausa(false);
      hud.limparEfeitos();
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
    pause: () => pausarPartida(true),
    resume: reexibir,
    destruir() {
      cancelarInicio();
      destruirPartida();
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
