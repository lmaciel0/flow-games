/**
 * Block Strike — efeitos sonoros sintetizados em Web Audio (ruído filtrado, osciladores e pan).
 * `audio.contexto()` (core) entrega o AudioContext, ou null com o som desligado; este módulo
 * não toca em window/document. Tudo é agendado no relógio do áudio, sem setTimeout.
 */

const DIST_AUDIVEL = 70; // metros até o som sumir
const REF_DIST = 10; // até aqui o volume cai pouco
const CORTE_PERTO = 16000; // Hz do passa-baixa para sons perto; longe fica abafado
const CORTE_LONGE = 900;

// Tiro em três camadas: estalo (ruído agudo), corpo (ruído grave) e soco (seno que despenca).
// estalo/corpo: [freq Hz, duração s, ganho]; soco: [freq inicial, freq final, duração, ganho].
const TIROS = {
  rifle: { estalo: [2600, 0.07, 0.55], corpo: [900, 0.24, 0.6], soco: [150, 45, 0.12, 0.7] },
  smg: { estalo: [3300, 0.05, 0.42], corpo: [1300, 0.15, 0.45], soco: [180, 60, 0.08, 0.5] },
  sniper: { estalo: [2000, 0.12, 0.75], corpo: [600, 0.65, 0.85], soco: [110, 32, 0.26, 0.95] },
  escopeta: { estalo: [1800, 0.1, 0.6], corpo: [520, 0.45, 0.9], soco: [100, 32, 0.22, 1] },
  pistola: { estalo: [3000, 0.05, 0.45], corpo: [1500, 0.12, 0.4], soco: [210, 70, 0.08, 0.45] },
  fuzil: { estalo: [2300, 0.08, 0.6], corpo: [800, 0.28, 0.68], soco: [130, 40, 0.14, 0.8] },
  miniSmg: { estalo: [3600, 0.04, 0.38], corpo: [1500, 0.12, 0.4], soco: [200, 70, 0.06, 0.42] },
  // Silenciadas: "pff" curto e baixo, sem o estrondo do corpo.
  rifleS: { estalo: [4200, 0.03, 0.2], corpo: [1800, 0.07, 0.14], soco: [260, 90, 0.04, 0.16] },
  smgS: { estalo: [4600, 0.025, 0.17], corpo: [2000, 0.06, 0.12], soco: [280, 100, 0.035, 0.14] },
};

// Atenuação por distância: quase cheio até REF_DIST e zero em DIST_AUDIVEL.
export function ganhoDistancia(d) {
  if (d >= DIST_AUDIVEL) return 0;
  const queda = REF_DIST / (REF_DIST + Math.max(0, d - REF_DIST) * 0.6);
  return queda * (1 - d / DIST_AUDIVEL);
}

export function criarSons(audio) {
  let ctx = null;
  let mestre = null;
  let ruido = null;
  let volume = 0.8;

  // Liga a cadeia na primeira vez (ou quando o core recria o contexto): mestre → compressor → saída.
  function pronto() {
    const c = audio.contexto?.() ?? null;
    if (!c) return null;
    if (c !== ctx) {
      ctx = c;
      const comp = c.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.ratio.value = 6;
      mestre = c.createGain();
      mestre.gain.value = volume;
      mestre.connect(comp);
      comp.connect(c.destination);
      const n = Math.floor(c.sampleRate * 2);
      ruido = c.createBuffer(1, n, c.sampleRate);
      const dados = ruido.getChannelData(0);
      for (let i = 0; i < n; i++) dados[i] = Math.random() * 2 - 1;
    }
    return ctx;
  }

  // Entrada de uma voz: ganho → passa-baixa (distância) → pan → mestre. null se inaudível.
  function voz({ distancia = 0, pan = 0, ganho = 1 } = {}) {
    const c = pronto();
    if (!c) return null;
    const g = ganho * ganhoDistancia(distancia);
    if (g < 0.002) return null;
    const entrada = c.createGain();
    entrada.gain.value = g;
    const filtro = c.createBiquadFilter();
    filtro.type = 'lowpass';
    const t = Math.min(1, distancia / 45);
    filtro.frequency.value = CORTE_PERTO * (1 - t) + CORTE_LONGE * t;
    entrada.connect(filtro);
    let ultimo = filtro;
    if (pan !== 0 && c.createStereoPanner) {
      const p = c.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, pan));
      ultimo.connect(p);
      ultimo = p;
    }
    ultimo.connect(mestre);
    return { c, entrada, t0: c.currentTime };
  }

  function envelope(param, t, ataque, dur, pico) {
    param.setValueAtTime(0.0001, t);
    param.linearRampToValueAtTime(pico, t + ataque);
    param.exponentialRampToValueAtTime(0.0001, t + dur);
  }

  // Rajada de ruído filtrado. tipo: lowpass | highpass | bandpass; freqFim varre o filtro.
  function chiado(v, t, { tipo = 'bandpass', freq, freqFim, q = 1, dur, ganho, ataque = 0.002 }) {
    const { c, entrada } = v;
    const fonte = c.createBufferSource();
    fonte.buffer = ruido;
    const f = c.createBiquadFilter();
    f.type = tipo;
    f.Q.value = q;
    f.frequency.setValueAtTime(freq, t);
    if (freqFim) f.frequency.exponentialRampToValueAtTime(freqFim, t + dur);
    const g = c.createGain();
    envelope(g.gain, t, ataque, dur, ganho);
    fonte.connect(f);
    f.connect(g);
    g.connect(entrada);
    fonte.start(t, Math.random() * 0.5);
    fonte.stop(t + dur + 0.02);
  }

  function tom(v, t, { onda = 'sine', freq, freqFim, dur, ganho, ataque = 0.002 }) {
    const { c, entrada } = v;
    const o = c.createOscillator();
    o.type = onda;
    o.frequency.setValueAtTime(freq, t);
    if (freqFim) o.frequency.exponentialRampToValueAtTime(freqFim, t + dur);
    const g = c.createGain();
    envelope(g.gain, t, ataque, dur, ganho);
    o.connect(g);
    g.connect(entrada);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  // Clique mecânico (peça de metal): ruído agudo curtíssimo mais um tom metálico.
  function clique(v, t, freq = 2400, ganho = 0.35) {
    chiado(v, t, { tipo: 'bandpass', freq, q: 6, dur: 0.03, ganho });
    tom(v, t, { onda: 'square', freq: freq / 3, dur: 0.025, ganho: ganho * 0.25 });
  }

  const varia = (x, p = 0.06) => x * (1 + (Math.random() * 2 - 1) * p);

  return {
    definirVolume(n) {
      volume = Math.max(0, Math.min(1, n));
      if (mestre) mestre.gain.value = volume;
    },

    tiro(tipo, distancia = 0, pan = 0) {
      const d = TIROS[tipo] ?? TIROS.rifle;
      const v = voz({ distancia, pan });
      if (!v) return;
      const t = v.t0;
      chiado(v, t, { tipo: 'highpass', freq: varia(d.estalo[0]), dur: d.estalo[1], ganho: d.estalo[2] });
      chiado(v, t, { tipo: 'lowpass', freq: varia(d.corpo[0]), freqFim: 180, dur: d.corpo[1], ganho: d.corpo[2], ataque: 0.004 });
      tom(v, t, { freq: varia(d.soco[0]), freqFim: d.soco[1], dur: d.soco[2], ganho: d.soco[3] });
      if (tipo === 'escopeta' || tipo === 'sniper') {
        // Eco curto: o estampido "rola" pelo mapa.
        chiado(v, t + 0.09, { tipo: 'lowpass', freq: 700, freqFim: 150, dur: 0.5, ganho: d.corpo[2] * 0.3, ataque: 0.03 });
      }
    },

    passo(distancia = 0, pan = 0, proprio = false) {
      const v = voz({ distancia, pan, ganho: proprio ? 0.35 : 0.6 });
      if (!v) return;
      chiado(v, v.t0, { tipo: 'lowpass', freq: varia(650, 0.2), freqFim: 200, dur: 0.07, ganho: 0.5 });
      chiado(v, v.t0, { tipo: 'bandpass', freq: varia(2200, 0.2), q: 2, dur: 0.025, ganho: 0.12 });
    },

    pouso(distancia = 0, pan = 0) {
      const v = voz({ distancia, pan, ganho: 0.6 });
      if (!v) return;
      chiado(v, v.t0, { tipo: 'lowpass', freq: 500, freqFim: 120, dur: 0.12, ganho: 0.6 });
      tom(v, v.t0, { freq: 90, freqFim: 45, dur: 0.1, ganho: 0.35 });
    },

    pulo() {
      const v = voz({ ganho: 0.3 });
      if (v) chiado(v, v.t0, { tipo: 'bandpass', freq: 900, freqFim: 400, q: 1.5, dur: 0.08, ganho: 0.4, ataque: 0.01 });
    },

    // Hitmarker: estalinho seco. Cabeça: o "dink" metálico do capacete.
    acerto(cabeca) {
      const v = voz({ ganho: 0.6 });
      if (!v) return;
      if (cabeca) {
        for (const [f, g] of [[2900, 0.4], [4350, 0.22], [6100, 0.12]]) {
          tom(v, v.t0, { onda: 'sine', freq: f, dur: 0.35, ganho: g });
        }
        chiado(v, v.t0, { tipo: 'highpass', freq: 5000, dur: 0.02, ganho: 0.3 });
      } else {
        chiado(v, v.t0, { tipo: 'bandpass', freq: 1700, q: 3, dur: 0.04, ganho: 0.5 });
        tom(v, v.t0, { freq: 320, freqFim: 160, dur: 0.05, ganho: 0.25 });
      }
    },

    // Bala no capacete: "PLINK" agudo e curto, com o estalo do metal na frente. Ouve quem estiver perto.
    plink(distancia = 0, pan = 0) {
      const v = voz({ distancia, pan, ganho: 0.7 });
      if (!v) return;
      chiado(v, v.t0, { tipo: 'highpass', freq: 6000, dur: 0.015, ganho: 0.45 });
      for (const [f, g] of [[3700, 0.45], [5550, 0.25], [8300, 0.12]]) {
        tom(v, v.t0, { onda: 'sine', freq: f, freqFim: f * 0.97, dur: 0.2, ganho: g });
      }
    },

    // Levou tiro: baque abafado no peito.
    dano() {
      const v = voz({ ganho: 0.7 });
      if (!v) return;
      tom(v, v.t0, { freq: 120, freqFim: 50, dur: 0.16, ganho: 0.6 });
      chiado(v, v.t0, { tipo: 'lowpass', freq: 400, dur: 0.12, ganho: 0.4 });
    },

    // Abate confirmado (o jogador matou): dois toques curtos e brilhantes.
    abate(cabeca) {
      const v = voz({ ganho: 0.4 });
      if (!v) return;
      tom(v, v.t0 + 0.05, { onda: 'triangle', freq: cabeca ? 1320 : 990, dur: 0.12, ganho: 0.35 });
      tom(v, v.t0 + 0.12, { onda: 'triangle', freq: cabeca ? 1760 : 1320, dur: 0.18, ganho: 0.3 });
    },

    morte() {
      const v = voz({ ganho: 0.7 });
      if (!v) return;
      tom(v, v.t0, { onda: 'sawtooth', freq: 220, freqFim: 55, dur: 0.6, ganho: 0.25 });
      chiado(v, v.t0, { tipo: 'lowpass', freq: 600, freqFim: 100, dur: 0.5, ganho: 0.3 });
    },

    // Arremesso: sopro do braço e o pino saindo.
    arremesso(distancia = 0, pan = 0) {
      const v = voz({ distancia, pan, ganho: 0.5 });
      if (!v) return;
      chiado(v, v.t0, { tipo: 'bandpass', freq: 500, freqFim: 1800, q: 1, dur: 0.16, ganho: 0.25, ataque: 0.05 });
      clique(v, v.t0 + 0.02, 2000, 0.25);
    },

    quiqueGranada(distancia = 0, pan = 0) {
      const v = voz({ distancia, pan, ganho: 0.45 });
      if (!v) return;
      tom(v, v.t0, { onda: 'triangle', freq: varia(1300, 0.15), freqFim: 700, dur: 0.07, ganho: 0.25 });
      chiado(v, v.t0, { tipo: 'bandpass', freq: 2500, q: 3, dur: 0.03, ganho: 0.25 });
    },

    // HE: estrondo mais curto que o da C4.
    he(distancia = 0, pan = 0) {
      const v = voz({ distancia: distancia * 0.6, pan, ganho: 0.95 });
      if (!v) return;
      chiado(v, v.t0, { tipo: 'highpass', freq: 2200, dur: 0.1, ganho: 0.7 });
      chiado(v, v.t0, { tipo: 'lowpass', freq: 1400, freqFim: 100, dur: 0.9, ganho: 0.85, ataque: 0.004 });
      tom(v, v.t0, { freq: 120, freqFim: 35, dur: 0.6, ganho: 0.9 });
    },

    // Molotov acendendo: vidro estilhaçando (chiado agudo e tinidos soltos) e o "vuush" do fogo pegando.
    molotov(distancia = 0, pan = 0) {
      const v = voz({ distancia: distancia * 0.8, pan, ganho: 0.85 });
      if (!v) return;
      chiado(v, v.t0, { tipo: 'highpass', freq: 4000, dur: 0.08, ganho: 0.6 });
      for (let i = 0; i < 5; i++) {
        tom(v, v.t0 + 0.01 + Math.random() * 0.12, { freq: 3000 + Math.random() * 4000, dur: 0.06, ganho: 0.12 });
      }
      chiado(v, v.t0 + 0.04, { tipo: 'lowpass', freq: 300, freqFim: 1600, dur: 0.6, ganho: 0.55, ataque: 0.15 });
    },

    // Fogo queimando: estalinhos aleatórios e um ronco grave. index.js chama em intervalos curtos enquanto há fogo.
    crepitar(distancia = 0, pan = 0) {
      const v = voz({ distancia, pan, ganho: 0.45 });
      if (!v) return;
      const n = 2 + Math.floor(Math.random() * 3);
      for (let i = 0; i < n; i++) {
        chiado(v, v.t0 + Math.random() * 0.14, {
          tipo: 'bandpass', freq: 1200 + Math.random() * 3800, q: 4, dur: 0.012 + Math.random() * 0.02, ganho: 0.35 + Math.random() * 0.3,
        });
      }
      chiado(v, v.t0, { tipo: 'lowpass', freq: 380, dur: 0.2, ganho: 0.22, ataque: 0.05 });
    },

    // Fogo apagado pela smoke (ou molotov que estourou no ar): chiado que morre.
    apagar(distancia = 0, pan = 0) {
      const v = voz({ distancia, pan, ganho: 0.6 });
      if (!v) return;
      chiado(v, v.t0, { tipo: 'highpass', freq: 2500, freqFim: 900, dur: 0.7, ganho: 0.4, ataque: 0.02 });
    },

    // Flash: estalo agudo seco.
    flash(distancia = 0, pan = 0) {
      const v = voz({ distancia: distancia * 0.7, pan, ganho: 0.8 });
      if (!v) return;
      chiado(v, v.t0, { tipo: 'highpass', freq: 3500, dur: 0.12, ganho: 0.8 });
      tom(v, v.t0, { freq: 220, freqFim: 60, dur: 0.1, ganho: 0.6 });
    },

    // Zumbido de quem foi cegado: seno agudo que decai por `dur` segundos.
    zumbido(dur = 3) {
      const v = voz({ ganho: 0.35 });
      if (!v) return;
      tom(v, v.t0, { onda: 'sine', freq: 3500, dur, ganho: 0.3, ataque: 0.02 });
      tom(v, v.t0, { onda: 'sine', freq: 3720, dur: dur * 0.8, ganho: 0.12, ataque: 0.02 });
    },

    // Smoke estourando: chiado longo.
    fumaca(distancia = 0, pan = 0) {
      const v = voz({ distancia, pan, ganho: 0.6 });
      if (!v) return;
      chiado(v, v.t0, { tipo: 'bandpass', freq: 3500, freqFim: 1800, q: 0.7, dur: 1.4, ganho: 0.3, ataque: 0.05 });
      tom(v, v.t0, { freq: 140, freqFim: 70, dur: 0.15, ganho: 0.4 });
    },

    // Compra aceita: caixa registradora curtinha.
    compra() {
      const v = voz({ ganho: 0.5 });
      if (!v) return;
      clique(v, v.t0, 2800, 0.25);
      tom(v, v.t0 + 0.05, { onda: 'triangle', freq: 1760, dur: 0.12, ganho: 0.2 });
      tom(v, v.t0 + 0.1, { onda: 'triangle', freq: 2349, dur: 0.18, ganho: 0.18 });
    },

    // Bipe da C4 plantada; nos últimos 5 s fica mais agudo.
    bipC4(distancia = 0, pan = 0, restante = 40) {
      const v = voz({ distancia, pan, ganho: 0.6 });
      if (!v) return;
      tom(v, v.t0, { onda: 'square', freq: restante < 5 ? 1500 : 1050, dur: 0.09, ganho: 0.3 });
      if (restante < 10) tom(v, v.t0, { onda: 'sine', freq: 520, dur: 0.12, ganho: 0.25 });
    },

    // Começou a plantar (três bipes rápidos) ou a desarmar (cliques descendo).
    acaoC4(acao, distancia = 0, pan = 0) {
      const v = voz({ distancia, pan, ganho: 0.6 });
      if (!v) return;
      if (acao === 'plantar') {
        [0, 0.16, 0.32].forEach((d) => tom(v, v.t0 + d, { onda: 'square', freq: 800, dur: 0.07, ganho: 0.2 }));
      } else {
        [0, 0.12, 0.24, 0.36].forEach((d, i) => clique(v, v.t0 + d, 2600 - i * 350, 0.3));
      }
    },

    plantada(distancia = 0, pan = 0) {
      const v = voz({ distancia, pan, ganho: 0.8 });
      if (!v) return;
      tom(v, v.t0, { onda: 'square', freq: 700, dur: 0.1, ganho: 0.2 });
      tom(v, v.t0 + 0.14, { onda: 'square', freq: 900, dur: 0.1, ganho: 0.2 });
      tom(v, v.t0 + 0.3, { onda: 'square', freq: 1200, dur: 0.45, ganho: 0.25 });
    },

    desarmada() {
      const v = voz({ ganho: 0.7 });
      if (!v) return;
      clique(v, v.t0, 2000, 0.3);
      [523, 659, 784].forEach((f, i) => tom(v, v.t0 + 0.12 + i * 0.1, { onda: 'triangle', freq: f, dur: 0.35, ganho: 0.3 }));
    },

    // Explosão: estalo, estrondo grave que rola e subgrave. Ouve-se no mapa inteiro (distância encolhida).
    explosao(distancia = 0, pan = 0) {
      const v = voz({ distancia: distancia * 0.35, pan, ganho: 1 });
      if (!v) return;
      const t = v.t0;
      chiado(v, t, { tipo: 'highpass', freq: 2500, dur: 0.18, ganho: 0.8 });
      chiado(v, t, { tipo: 'lowpass', freq: 1800, freqFim: 90, dur: 1.9, ganho: 0.95, ataque: 0.005 });
      tom(v, t, { freq: 95, freqFim: 28, dur: 1.5, ganho: 1 });
      chiado(v, t + 0.25, { tipo: 'lowpass', freq: 600, freqFim: 120, dur: 1.2, ganho: 0.35, ataque: 0.08 });
    },

    // "Oof" de boneco de blocos: voz grave que cai de tom, com um sopro de ar no começo.
    oof(distancia = 0, pan = 0) {
      const v = voz({ distancia, pan, ganho: 0.7 });
      if (!v) return;
      const t = v.t0;
      tom(v, t, { onda: 'sawtooth', freq: varia(320, 0.08), freqFim: 140, dur: 0.3, ganho: 0.22, ataque: 0.01 });
      tom(v, t, { onda: 'triangle', freq: varia(160, 0.08), freqFim: 85, dur: 0.34, ganho: 0.3, ataque: 0.01 });
      chiado(v, t, { tipo: 'bandpass', freq: 650, freqFim: 380, q: 3, dur: 0.26, ganho: 0.2, ataque: 0.01 });
      chiado(v, t, { tipo: 'lowpass', freq: 1200, dur: 0.07, ganho: 0.3 });
    },

    inicioRound() {
      const v = voz({ ganho: 0.4 });
      if (!v) return;
      tom(v, v.t0, { onda: 'square', freq: 660, dur: 0.12, ganho: 0.18 });
      tom(v, v.t0 + 0.14, { onda: 'square', freq: 880, dur: 0.22, ganho: 0.2 });
    },

    // Últimos segundos do round: bipe curto.
    bipe() {
      const v = voz({ ganho: 0.3 });
      if (v) tom(v, v.t0, { onda: 'square', freq: 1500, dur: 0.06, ganho: 0.15 });
    },

    fimRound(venceu) {
      const v = voz({ ganho: 0.5 });
      if (!v) return;
      const notas = venceu ? [523, 659, 784, 1047] : [440, 370, 311, 262];
      notas.forEach((f, i) => tom(v, v.t0 + i * 0.12, {
        onda: venceu ? 'triangle' : 'sawtooth', freq: f, dur: 0.3, ganho: venceu ? 0.35 : 0.18,
      }));
    },

    // MVP do round (o jogador): arpejo subindo e o acorde final segurado, em duas vozes.
    mvp() {
      const v = voz({ ganho: 0.5 });
      if (!v) return;
      [523, 659, 784, 1047].forEach((f, i) => {
        tom(v, v.t0 + i * 0.1, { onda: 'triangle', freq: f, dur: 0.22, ganho: 0.3 });
        tom(v, v.t0 + i * 0.1, { onda: 'square', freq: f * 2, dur: 0.08, ganho: 0.05 });
      });
      for (const f of [523, 659, 784, 1047]) tom(v, v.t0 + 0.45, { onda: 'triangle', freq: f, dur: 1.1, ganho: 0.16, ataque: 0.02 });
    },

    // Recarga em três tempos ao longo de `duracao`: pente sai, pente entra, ferrolho.
    recarga(duracao = 2.5, distancia = 0, pan = 0) {
      const v = voz({ distancia, pan, ganho: 0.8 });
      if (!v) return;
      const t = v.t0;
      clique(v, t + duracao * 0.12, 1800, 0.3);
      chiado(v, t + duracao * 0.15, { tipo: 'bandpass', freq: 1200, q: 1, dur: 0.12, ganho: 0.15, ataque: 0.02 });
      chiado(v, t + duracao * 0.55, { tipo: 'lowpass', freq: 900, dur: 0.06, ganho: 0.4 });
      clique(v, t + duracao * 0.56, 2200, 0.35);
      clique(v, t + duracao * 0.85, 2600, 0.4);
      clique(v, t + duracao * 0.85 + 0.07, 1900, 0.35);
    },

    // Soltar arma: sopro do braço.
    soltarArma(distancia = 0, pan = 0) {
      const v = voz({ distancia, pan, ganho: 0.45 });
      if (v) chiado(v, v.t0, { tipo: 'bandpass', freq: 600, freqFim: 1400, q: 1, dur: 0.14, ganho: 0.22, ataque: 0.04 });
    },

    // Arma batendo no chão: baque metálico com um tinido curto.
    armaChao(distancia = 0, pan = 0) {
      const v = voz({ distancia, pan, ganho: 0.6 });
      if (!v) return;
      chiado(v, v.t0, { tipo: 'lowpass', freq: 700, dur: 0.07, ganho: 0.5 });
      tom(v, v.t0, { onda: 'triangle', freq: 1900, freqFim: 1700, dur: 0.12, ganho: 0.12 });
    },

    // Pegou uma arma do chão: dois cliques de encaixe.
    pegarArma() {
      const v = voz({ ganho: 0.5 });
      if (!v) return;
      clique(v, v.t0, 2100, 0.3);
      clique(v, v.t0 + 0.08, 1600, 0.3);
    },

    // Sacar a arma: pano raspando e um clique.
    saque(tipo) {
      const v = voz({ ganho: 0.5 });
      if (!v) return;
      if (tipo === 'faca') {
        chiado(v, v.t0, { tipo: 'highpass', freq: 3000, freqFim: 7000, dur: 0.18, ganho: 0.18, ataque: 0.05 });
        return;
      }
      chiado(v, v.t0, { tipo: 'bandpass', freq: 800, q: 0.8, dur: 0.12, ganho: 0.18, ataque: 0.03 });
      clique(v, v.t0 + 0.1, 2300, 0.3);
    },

    // Faca: zunido do golpe; acerto no corpo é um baque, na parede um tinido.
    golpe(forte, acerto, distancia = 0, pan = 0) {
      const v = voz({ distancia, pan, ganho: 0.7 });
      if (!v) return;
      const t = v.t0;
      chiado(v, t, {
        tipo: 'bandpass', freq: forte ? 900 : 1400, freqFim: forte ? 3000 : 4500, q: 1.2,
        dur: forte ? 0.22 : 0.14, ganho: 0.4, ataque: 0.04,
      });
      const ta = t + (forte ? 0.12 : 0.07);
      if (acerto === 'corpo') {
        tom(v, ta, { freq: 160, freqFim: 60, dur: 0.12, ganho: 0.6 });
        chiado(v, ta, { tipo: 'lowpass', freq: 1200, dur: 0.1, ganho: 0.45 });
      } else if (acerto === 'parede') {
        tom(v, ta, { onda: 'triangle', freq: 3100, dur: 0.15, ganho: 0.25 });
        chiado(v, ta, { tipo: 'highpass', freq: 4000, dur: 0.04, ganho: 0.3 });
      }
    },

    // Bala batendo perto do jogador ou na parede: estalo curto.
    ricochete(distancia = 0, pan = 0) {
      const v = voz({ distancia, pan, ganho: 0.25 });
      if (!v) return;
      chiado(v, v.t0, { tipo: 'bandpass', freq: varia(3500, 0.2), q: 4, dur: 0.04, ganho: 0.4 });
    },

    // Gatilho com pente vazio e sem reserva.
    vazio() {
      const v = voz({ ganho: 0.5 });
      if (v) clique(v, v.t0, 3000, 0.3);
    },
  };
}
