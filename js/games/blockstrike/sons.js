/**
 * Block Strike — efeitos sonoros sintetizados.
 * `audio` é injetado (playTone do core); este módulo não toca em window/document.
 */

const DIST_AUDIVEL = 60; // metros até o som sumir

// freq (Hz), forma de onda, duração (s) e volume por arma.
const TIROS = {
  rifle: [140, 'sawtooth', 0.09, 0.2],
  smg: [200, 'square', 0.06, 0.14],
  sniper: [90, 'sawtooth', 0.35, 0.28],
  escopeta: [70, 'sawtooth', 0.22, 0.3],
  pistola: [260, 'square', 0.08, 0.18],
  faca: [520, 'triangle', 0.07, 0.1],
};

export function criarSons(audio) {
  const vol = (base, distancia = 0) => base * Math.max(0, 1 - distancia / DIST_AUDIVEL);
  const tom = (freq, tipo, dur, ganho, distancia) => {
    const g = vol(ganho, distancia);
    if (g > 0.001) audio.playTone(freq, tipo, dur, g);
  };
  const depois = (ms, fn) => setTimeout(fn, ms);

  return {
    tiro(tipo, distancia = 0) {
      const [f, onda, dur, g] = TIROS[tipo] ?? TIROS.rifle;
      tom(f, onda, dur, g, distancia);
      if (tipo === 'escopeta') tom(f * 1.6, 'square', dur * 0.5, g * 0.6, distancia);
    },
    passo(distancia = 0) {
      tom(70, 'triangle', 0.05, 0.05, distancia);
    },
    acerto(cabeca) {
      if (cabeca) tom(1100, 'square', 0.1, 0.16, 0);
      else tom(600, 'triangle', 0.06, 0.12, 0);
    },
    morte() {
      tom(180, 'sawtooth', 0.25, 0.16, 0);
    },
    fimRound(venceu) {
      const notas = venceu ? [440, 554, 659, 880] : [400, 340, 280, 220];
      notas.forEach((f, i) => depois(i * 110, () => tom(f, venceu ? 'triangle' : 'sawtooth', 0.22, 0.18, 0)));
    },
    recarga() {
      tom(320, 'square', 0.04, 0.1, 0);
      depois(180, () => tom(480, 'square', 0.05, 0.1, 0));
    },
  };
}
