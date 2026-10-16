/**
 * Block Strike — FPS 5x5 contra bots (Three.js).
 * Menu, avisos de compatibilidade e, por enquanto, um loop provisório:
 * o jogador anda pelo mapa e os bots ficam parados nos spawns.
 */

import { MAPA } from './mapa.js';
import { criarMundo, posicionarParaRound, passo } from './mundo.js';
import { criarEntrada } from './entrada.js';
import { criarRng } from './rng.js';

const DT_MAX = 0.05;

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

function montar(raiz) {
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
  let partida = null; // { mundo, render, entrada, raf, antes }
  let iniciando = false;

  const mostrarMenu = (titulo, rotulo) => {
    texto.textContent = titulo;
    botao.textContent = rotulo;
    menu.hidden = false;
  };

  function quadro(agora) {
    const p = partida;
    const dt = Math.min((agora - p.antes) / 1000, DT_MAX);
    p.antes = agora;
    const jogador = p.mundo.entidades[p.mundo.jogadorId];
    const cmd = p.entrada.comando(jogador.yaw, jogador.pitch);
    passo(p.mundo, dt, new Map([[jogador.id, cmd]]), { congelado: false });
    p.render.desenhar(p.mundo, p.mundo.jogadorId, {});
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
      const render = criarRender(canvas, MAPA);
      entrada.aoPerderTrava(pausarPartida);
      partida = { mundo, render, entrada, raf: null, antes: 0 };
      menu.hidden = true;
      raiz.dataset.fase = 'jogo';
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
