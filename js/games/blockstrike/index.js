/**
 * Block Strike — FPS 5x5 contra bots (Three.js).
 * Esqueleto: menu e avisos de compatibilidade. A partida entra nas próximas tasks.
 */

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
          <p class="bs-menu-texto">FPS 5x5 contra bots</p>
          <button id="bs-jogar" class="action-btn primary-btn" disabled>Jogar</button>
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
  const menu = raiz.querySelector('#bs-menu');
  const aviso = raiz.querySelector('#bs-aviso');

  const bloquear = (texto) => {
    menu.hidden = true;
    aviso.textContent = texto;
    aviso.hidden = false;
  };

  if (soToque()) bloquear('Disponível apenas no computador');
  else if (!temWebGL()) bloquear('Seu navegador não suporta WebGL');

  return { pause() {}, resume() {} };
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
