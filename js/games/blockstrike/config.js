/**
 * Block Strike — constantes de jogo (unidades: metros e segundos).
 * Módulo puro: sem Three.js e sem DOM.
 */

export const JOGADOR = {
  raio: 0.35,
  altura: 1.8,
  alturaAgachado: 1.2,
  olho: 1.6,
  olhoAgachado: 1.1,
  velCorrer: 5.5,
  velDevagar: 2.6,
  velAgachado: 2.0,
  gravidade: 20,
  pulo: 6.5,
  hp: 100,
};

export const ROUND = {
  freeze: 5,
  duracao: 115,
  fimRound: 3,
  vencer: 13,
  maxRounds: 24,
  trocaLados: 12,
};

// Multiplicador de dano por parte do corpo atingida.
export const MULT_PARTE = { cabeca: 4, tronco: 1, pernas: 0.75 };

// Teto do recuo acumulado (rad): a mira sobe até aqui e para.
export const RECUO_MAX = 0.08;

// rpm = tiros por minuto; recarga em segundos; spreadBase/spreadMov em radianos.
export const ARMAS = {
  rifle: {
    nome: 'Rifle', slot: 'primaria', dano: 36, rpm: 600, pente: 30, reserva: 90,
    recarga: 2.5, auto: true, spreadBase: 0.004, spreadMov: 0.06, recuo: 0.012,
  },
  smg: {
    nome: 'SMG', slot: 'primaria', dano: 26, rpm: 850, pente: 30, reserva: 120,
    recarga: 2.0, auto: true, spreadBase: 0.008, spreadMov: 0.02, recuo: 0.008,
  },
  sniper: {
    nome: 'Sniper', slot: 'primaria', dano: 115, rpm: 41, pente: 5, reserva: 20,
    recarga: 3.6, auto: false, spreadBase: 0.0005, spreadMov: 0.15, recuo: 0.05,
    zoomFov: 25, spreadSemZoom: 0.08,
  },
  escopeta: {
    nome: 'Escopeta', slot: 'primaria', dano: 20, rpm: 70, pente: 8, reserva: 32,
    recarga: 3.0, auto: false, spreadBase: 0.06, spreadMov: 0.03, recuo: 0.04,
    chumbos: 8,
  },
  pistola: {
    nome: 'Pistola', slot: 'pistola', dano: 30, rpm: 400, pente: 12, reserva: 36,
    recarga: 2.2, auto: false, spreadBase: 0.006, spreadMov: 0.03, recuo: 0.02,
  },
  faca: {
    nome: 'Faca', slot: 'faca', dano: 50, rpm: 75, pente: Infinity, reserva: 0,
    recarga: 0, auto: false, spreadBase: 0, spreadMov: 0, recuo: 0,
    alcance: 2,
  },
};

// reacao em segundos; erroMira em radianos; chanceCabeca em [0,1].
export const DIFICULDADE = {
  facil: { reacao: 0.6, erroMira: 0.07, chanceCabeca: 0.1 },
  medio: { reacao: 0.38, erroMira: 0.04, chanceCabeca: 0.2 },
  dificil: { reacao: 0.2, erroMira: 0.02, chanceCabeca: 0.35 },
};

// Exibidos como `Bot <nome>`.
export const NOMES_BOTS = ['Tijolo', 'Bloco', 'Cubo', 'Pixel', 'Voxel', 'Quina', 'Laje', 'Prisma', 'Viga'];
