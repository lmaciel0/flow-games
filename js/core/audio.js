/**
 * Sintetizador Web Audio — efeitos gerados por osciladores, sem arquivos de áudio.
 */

let audioCtx = null;
let somAtivo = true;

function iniciar() {
  if (!audioCtx) {
    const Contexto = window.AudioContext || window.webkitAudioContext;
    if (Contexto) audioCtx = new Contexto();
  }
  if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
}

export function playTone(freq, type = 'sine', duration = 0.1, gainValue = 0.15) {
  if (!somAtivo) return;
  try {
    iniciar();
    if (!audioCtx) return;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, audioCtx.currentTime);

    gain.gain.setValueAtTime(gainValue, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + duration);

    osc.connect(gain);
    gain.connect(audioCtx.destination);

    osc.start();
    osc.stop(audioCtx.currentTime + duration);
  } catch {
    // áudio indisponível: o jogo segue sem som
  }
}

export function playSound(nome) {
  if (!somAtivo) return;
  iniciar();

  if (nome === 'move-x') {
    playTone(520, 'sine', 0.12, 0.2);
  } else if (nome === 'move-o') {
    playTone(330, 'triangle', 0.15, 0.25);
  } else if (nome === 'win') {
    [440, 554.37, 659.25, 880].forEach((freq, idx) => {
      setTimeout(() => playTone(freq, 'triangle', 0.25, 0.25), idx * 90);
    });
  } else if (nome === 'defeat') {
    [400, 360, 320, 260].forEach((freq, idx) => {
      setTimeout(() => playTone(freq, 'sawtooth', 0.2, 0.15), idx * 110);
    });
  } else if (nome === 'tie') {
    playTone(300, 'sine', 0.25, 0.2);
    setTimeout(() => playTone(300, 'sine', 0.25, 0.2), 160);
  } else if (nome === 'click') {
    playTone(600, 'sine', 0.04, 0.08);
  }
}

export function isSoundEnabled() {
  return somAtivo;
}

/** Atualiza todos os ícones de som presentes no DOM (jogo da velha e drawer). */
export function atualizarIcones() {
  const icone = somAtivo ? '🔊' : '🔇';
  document.querySelectorAll('.sound-icon-global, .sound-icon-drawer').forEach((el) => {
    el.textContent = icone;
  });
}

export function toggleSound() {
  somAtivo = !somAtivo;
  atualizarIcones();
  if (somAtivo) playSound('click');
  return somAtivo;
}
