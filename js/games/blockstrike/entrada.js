/**
 * Block Strike — entrada do jogador (teclado, mouse e pointer lock).
 * Só toca no DOM aqui; o comando devolvido é um objeto simples.
 */

const SENS_MIN = 0.2;
const SENS_MAX = 3;
const RAD_POR_PIXEL = 0.002;
const SLOTS = { Digit1: 'primaria', Digit2: 'pistola', Digit3: 'faca', Digit4: 'granada', KeyQ: 'anterior' }; // Q: última arma
const BLOQUEADAS = new Set(['Tab', 'Space']);

export function criarEntrada(canvas, { sensibilidade = 1 } = {}) {
  const doc = canvas.ownerDocument;
  const teclas = new Set();
  const botoes = new Set();
  let sens = Math.max(SENS_MIN, Math.min(SENS_MAX, sensibilidade));
  let fatorMira = 1; // luneta aberta: o giro encolhe junto com o campo de visão
  let dYaw = 0; // giro do mouse acumulado desde o último comando
  let dPitch = 0;
  let slotPendente = null;
  let recarregarPendente = false;
  let ativa = true; // pausado/em outra tela: não captura teclas do resto do hub
  let cursorLivre = false; // soltou o mouse de propósito (B na compra): perder a trava não pausa nem retrava
  let aoPerder = () => {};
  let aoTabFn = () => {};
  let aoTeclaFn = () => {};

  const limpar = () => {
    teclas.clear();
    botoes.clear();
    dYaw = 0;
    dPitch = 0;
  };

  function onKeyDown(e) {
    if (!ativa) return;
    if (BLOQUEADAS.has(e.code)) e.preventDefault();
    if (e.repeat) return;
    teclas.add(e.code);
    if (SLOTS[e.code]) slotPendente = SLOTS[e.code];
    if (e.code === 'KeyR') recarregarPendente = true;
    if (e.code === 'Tab') aoTabFn(true);
    if (aoTeclaFn(e.code) === true) slotPendente = null; // tecla usada pelo jogo (painel de armas)
  }

  function onKeyUp(e) {
    teclas.delete(e.code);
    if (!ativa) return;
    if (BLOQUEADAS.has(e.code)) e.preventDefault();
    if (e.code === 'Tab') aoTabFn(false);
  }

  function onMouseMove(e) {
    if (doc.pointerLockElement !== canvas) return;
    dYaw -= e.movementX * sens * fatorMira * RAD_POR_PIXEL;
    dPitch -= e.movementY * sens * fatorMira * RAD_POR_PIXEL;
  }

  function travar() {
    cursorLivre = false;
    try {
      const p = canvas.requestPointerLock();
      if (p && typeof p.catch === 'function') p.catch(() => {});
    } catch {
      // sem pointer lock (headless): o jogo segue sem mira por mouse
    }
  }

  // Solta o mouse sem abrir a pausa, para clicar no menu de compra.
  function soltarCursor() {
    cursorLivre = true;
    limpar();
    doc.exitPointerLock();
  }

  function onMouseDown(e) {
    if (doc.pointerLockElement === canvas) botoes.add(e.button);
    else if (ativa && !cursorLivre && e.target === canvas) travar(); // retrava com um clique no jogo
  }

  function onMouseUp(e) {
    botoes.delete(e.button);
  }

  // Roda do mouse troca de arma (ordem primária → pistola → faca).
  function onWheel(e) {
    if (doc.pointerLockElement !== canvas || !ativa) return;
    e.preventDefault();
    if (e.deltaY !== 0) slotPendente = e.deltaY > 0 ? 'roda+' : 'roda-';
  }

  function onLockChange() {
    if (doc.pointerLockElement === canvas) return;
    limpar();
    if (!cursorLivre) aoPerder();
  }

  // Chrome recusa a trava logo após um Esc: volta ao menu de pausa em vez de ficar sem mira.
  function onLockError() {
    limpar();
    aoPerder();
  }

  const onContext = (e) => e.preventDefault();
  const onBlur = limpar;

  doc.addEventListener('keydown', onKeyDown);
  doc.addEventListener('keyup', onKeyUp);
  doc.addEventListener('mousemove', onMouseMove);
  doc.addEventListener('mousedown', onMouseDown);
  doc.addEventListener('mouseup', onMouseUp);
  doc.addEventListener('pointerlockchange', onLockChange);
  doc.addEventListener('pointerlockerror', onLockError);
  canvas.addEventListener('contextmenu', onContext);
  canvas.addEventListener('wheel', onWheel, { passive: false });
  canvas.ownerDocument.defaultView?.addEventListener('blur', onBlur);

  const eixo = (mais, menos) => (teclas.has(mais) ? 1 : 0) - (teclas.has(menos) ? 1 : 0);

  return {
    comando(yawAtual, pitchAtual) {
      const yaw = yawAtual + dYaw;
      const pitch = Math.max(-1.5, Math.min(1.5, pitchAtual + dPitch));
      dYaw = 0;
      dPitch = 0;
      const cmd = {
        frente: eixo('KeyW', 'KeyS'),
        lado: eixo('KeyD', 'KeyA'),
        pular: teclas.has('Space'),
        agachar: teclas.has('KeyC'),
        devagar: teclas.has('ShiftLeft') || teclas.has('ShiftRight'),
        atirar: botoes.has(0),
        zoom: botoes.has(2),
        recarregar: recarregarPendente,
        usar: teclas.has('KeyE'), // segurar: plantar ou desarmar a C4
        granada: null, // o jogador arremessa pela mão (clique); o campo fica para os bots
        slot: slotPendente,
        yaw,
        pitch,
      };
      recarregarPendente = false;
      slotPendente = null;
      return cmd;
    },
    travar,
    soltarCursor,
    // Fim do cursor solto sem prender: o próximo clique no canvas retrava e não vira tiro.
    liberarClique() { cursorLivre = false; },
    cursorSolto: () => cursorLivre,
    travado: () => doc.pointerLockElement === canvas,
    aoPerderTrava(fn) { aoPerder = fn; },
    aoTab(fn) { aoTabFn = fn; },
    aoTecla(fn) { aoTeclaFn = fn; },
    // Extra: o jogo pausado não pode engolir Tab/Espaço do resto do hub.
    ativar(valor) {
      ativa = valor;
      if (!valor) limpar();
    },
    definirSensibilidade(n) { sens = Math.max(SENS_MIN, Math.min(SENS_MAX, n)); },
    definirFatorMira(f) { fatorMira = f; },
    destruir() {
      doc.removeEventListener('keydown', onKeyDown);
      doc.removeEventListener('keyup', onKeyUp);
      doc.removeEventListener('mousemove', onMouseMove);
      doc.removeEventListener('mousedown', onMouseDown);
      doc.removeEventListener('mouseup', onMouseUp);
      doc.removeEventListener('pointerlockchange', onLockChange);
      doc.removeEventListener('pointerlockerror', onLockError);
      canvas.removeEventListener('contextmenu', onContext);
      canvas.removeEventListener('wheel', onWheel);
      canvas.ownerDocument.defaultView?.removeEventListener('blur', onBlur);
      limpar();
    },
  };
}
