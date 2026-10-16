/**
 * Block Strike — FPS 5x5 contra bots (Three.js).
 * Menu, avisos de compatibilidade e o loop da partida: rounds MR12 (rounds.js),
 * bots (bots.js) e modo espectador quando o jogador morre.
 * `data-fase` na raiz reflete a fase: menu, freeze, jogo, fim-round ou fim-partida.
 */

import { MAPA } from './mapa.js';
import { criarMundo, posicionarParaRound, passo, vivosPorTime } from './mundo.js';
import { criarEntrada } from './entrada.js';
import { criarRng } from './rng.js';
import { criarSons } from './sons.js';
import { ARMAS } from './config.js';
import { olho } from './fisica.js';
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
        <div class="bs-menu" id="bs-menu">
          <h2 class="bs-menu-titulo">Block Strike</h2>
          <p class="bs-menu-texto" id="bs-menu-texto">FPS 5x5 contra bots</p>
          <button id="bs-jogar" class="action-btn primary-btn">Jogar</button>
        </div>
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

function montar(raiz, ctx) {
  raiz.dataset.fase = 'menu';
  raiz.dataset.pausado = 'false';
  const menu = raiz.querySelector('#bs-menu');
  const aviso = raiz.querySelector('#bs-aviso');

  const bloquear = (texto) => {
    menu.hidden = true;
    aviso.textContent = texto;
    aviso.hidden = false;
  };

  if (soToque()) bloquear('Disponível apenas no computador');
  else if (!temWebGL()) bloquear('Seu navegador não suporta WebGL');

  if (menu.hidden) return { pause() {}, resume() {}, destruir() {} };

  const canvas = raiz.querySelector('#bs-canvas');
  const botao = raiz.querySelector('#bs-jogar');
  const texto = raiz.querySelector('#bs-menu-texto');
  const sons = criarSons(ctx.audio);
  let partida = null; // { mundo, render, entrada, grafo, rngBots, partida (regras), idVista, raf, antes }
  let iniciando = false;

  const mostrarMenu = (titulo, rotulo) => {
    texto.textContent = titulo;
    botao.textContent = rotulo;
    menu.hidden = false;
  };

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
        if (ev.atirador === eu.id) sons.acerto(ev.parte === 'cabeca');
      } else if (ev.tipo === 'morte') {
        if (ev.assassino === eu.id || ev.vitima === eu.id) sons.morte();
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
    p.idVista = p.mundo.jogadorId;
  }

  function aplicarEventosPartida(p, eventos) {
    const { partida, mundo } = p;
    for (const ev of eventos) {
      if (ev === 'novo-round') novoRound(p);
      else if (ev === 'fim-round' && partida.vencedorRound) {
        sons.fimRound(partida.vencedorRound === mundo.entidades[mundo.jogadorId].time);
      }
    }
    if (raiz.dataset.fase !== partida.fase) raiz.dataset.fase = partida.fase;
  }

  function quadro(agora) {
    const p = partida;
    const dt = Math.min((agora - p.antes) / 1000, DT_MAX);
    p.antes = agora;
    const { mundo, partida: regras } = p;
    const jogador = mundo.entidades[mundo.jogadorId];
    const cmd = p.entrada.comando(jogador.yaw, jogador.pitch);
    if (regras.fase !== 'fim-partida') {
      // Só se atira com o round em jogo; fora disso o mundo roda sem tiros.
      const atira = regras.fase === 'jogo';
      const comandos = new Map([[jogador.id, atira ? cmd : { ...cmd, atirar: false }]]);
      for (const e of mundo.entidades) {
        if (!e.bot || !e.vivo) continue;
        const c = pensar(e, mundo, p.grafo, mundo.dificuldade, dt, p.rngBots);
        comandos.set(e.id, atira ? c : { ...c, atirar: false });
      }
      reagir(p, passo(mundo, dt, comandos, { congelado: regras.fase === 'freeze' }));
      aplicarEventosPartida(p, tickPartida(regras, dt, vivosPorTime(mundo)));
    }
    // Morto, o jogador assiste os aliados; um clique passa para o próximo.
    if (jogador.vivo) p.idVista = jogador.id;
    else if ((cmd.atirar && !p.cliqueAntes) || !mundo.entidades[p.idVista].vivo) {
      p.idVista = proximaVista(mundo, p.idVista);
    }
    p.cliqueAntes = cmd.atirar;
    const zoomFov = cmd.zoom && jogador.vivo ? ARMAS[jogador.armas[jogador.slot].tipo].zoomFov : undefined;
    p.render.desenhar(mundo, p.idVista, { zoomFov });
    p.raf = requestAnimationFrame(quadro);
  }

  function agendar() {
    partida.entrada.ativar(true);
    partida.antes = performance.now();
    partida.raf = requestAnimationFrame(quadro);
  }

  function pausarPartida() {
    if (!partida || partida.raf === null) return;
    cancelAnimationFrame(partida.raf);
    partida.raf = null;
    partida.entrada.ativar(false);
    if (document.pointerLockElement === canvas) document.exitPointerLock();
    raiz.dataset.pausado = 'true';
    mostrarMenu('Pausado', 'Continuar');
  }

  function destruirPartida() {
    if (!partida) return;
    if (partida.raf !== null) cancelAnimationFrame(partida.raf);
    partida.entrada.destruir();
    partida.render.destruir();
    partida = null;
  }

  async function iniciar() {
    if (iniciando) return;
    iniciando = true;
    destruirPartida();
    const entrada = criarEntrada(canvas, { sensibilidade: 1 });
    entrada.travar(); // precisa estar dentro do gesto de clique
    try {
      const { criarRender } = await import('./render.js');
      const mundo = criarMundo({
        mapa: MAPA, primariaJogador: 'rifle', dificuldade: 'medio', rng: criarRng(Date.now()),
      });
      posicionarParaRound(mundo, 'A');
      const grafo = criarGrafo(MAPA.waypoints, MAPA.arestas);
      const rngBots = criarRng(Date.now() ^ 0x5bd1e995);
      recriarCerebros(mundo, grafo, rngBots);
      const render = criarRender(canvas, MAPA);
      entrada.aoPerderTrava(pausarPartida);
      partida = {
        mundo, render, entrada, grafo, rngBots, partida: criarPartida(),
        idVista: mundo.jogadorId, cliqueAntes: false, raf: null, antes: 0,
      };
      menu.hidden = true;
      raiz.dataset.fase = partida.partida.fase;
      raiz.dataset.pausado = 'false';
      agendar();
    } catch (erro) {
      entrada.destruir();
      bloquear('Não foi possível iniciar o jogo');
      console.error(erro);
    } finally {
      iniciando = false;
    }
  }

  botao.addEventListener('click', () => {
    if (partida && partida.raf === null) {
      partida.entrada.travar();
      menu.hidden = true;
      raiz.dataset.pausado = 'false';
      agendar();
    } else if (!partida) {
      iniciar();
    }
  });

  return { pause: pausarPartida, resume() {}, destruir: destruirPartida };
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
    const melhorKD = storage.get('melhorKD', 0);
    return `${vitorias} vitórias · K/D ${melhorKD.toFixed(2)}`;
  }
};
