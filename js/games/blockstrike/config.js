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
  velCorrer: 6.2, // com a faca; cada arma tem a sua `vel` (ARMAS)
  fatorDevagar: 0.52, // Shift: andar sem fazer barulho
  fatorAgachado: 0.34,
  fatorZoom: 0.55, // sniper com a luneta aberta
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

// Modo desarme: tempos em segundos, raios em metros. `explode` conta a partir da plantada.
export const BOMBA = {
  plantar: 3.2, desarmar: 10, desarmarKit: 5, explode: 40,
  raioAcao: 1.6, // distância da C4 para desarmar
  raioPegar: 1.2, // distância da C4 solta para o terrorista pegar
  raioExplosao: 14, // todo mundo a menos disto morre
};

// Granadas: tempos em segundos, distâncias em metros. O arremesso sai do olho na direção da mira.
export const GRANADA = {
  // Força do arremesso: longe (botão esquerdo), médio (os dois) e curto (direito).
  forcas: { longe: { velocidade: 18, subida: 4 }, medio: { velocidade: 12, subida: 3 }, curto: { velocidade: 7, subida: 2 } },
  gravidade: 20, raio: 0.12,
  fusivel: { flash: 1.5, he: 1.6, smoke: 1.8 },
  intervalo: 0.7, // entre arremessos do mesmo jogador
  he: { raio: 9, dano: 75 },
  flash: { alcance: 40, duracao: 3.5 },
  fumaca: { raio: 3.2, cubo: 0.8, duracao: 18, buraco: 2, abrir: 0.9, max: 3, raioTiro: 0.55, raioHE: 3.6 },
};

// Economia (só na partida): preços, recompensas e colete. Valores em dólares.
export const ECONOMIA = {
  inicial: 800, maximo: 16000, vitoria: 3250,
  derrota: [1400, 1900, 2400, 2900, 3400], // bônus de quem perde: sobe a cada derrota seguida
  recompensaKill: { rifle: 300, pistola: 300, sniper: 100, escopeta: 900, faca: 900, smg: 600 },
  freezeCompra: 12, // s de freeze com o menu de compra
};

// id → { nome, preco, grupo }. `kit` só vale para CT; as granadas têm limite por tipo.
export const ITENS = {
  rifle: { nome: 'Rifle', preco: 2700, grupo: 'arma' },
  fuzil: { nome: 'Fuzil', preco: 3100, grupo: 'arma' },
  rifleS: { nome: 'Rifle-S', preco: 2900, grupo: 'arma' },
  smg: { nome: 'SMG', preco: 1250, grupo: 'arma' },
  miniSmg: { nome: 'Mini SMG', preco: 1050, grupo: 'arma' },
  smgS: { nome: 'SMG-S', preco: 1400, grupo: 'arma' },
  sniper: { nome: 'Sniper', preco: 4750, grupo: 'arma' },
  escopeta: { nome: 'Escopeta', preco: 1200, grupo: 'arma' },
  colete: { nome: 'Colete', preco: 650, grupo: 'equip' },
  coleteCapacete: { nome: 'Colete + capacete', preco: 1000, grupo: 'equip' },
  kit: { nome: 'Kit de desarme', preco: 400, grupo: 'equip' },
  smoke: { nome: 'Smoke', preco: 300, grupo: 'granada' },
  flash: { nome: 'Flash', preco: 200, grupo: 'granada' },
  he: { nome: 'Granada HE', preco: 300, grupo: 'granada' },
};
// Ordem do ciclo das granadas na mão (tecla 4).
export const ORDEM_GRANADAS = ['he', 'flash', 'smoke'];
export const MAX_GRANADAS = { smoke: 1, flash: 2, he: 1 };

// Colete: o corpo leva `corpo` do dano; o capacete protege a cabeça (`cabeca`). O resto do dano gasta o colete.
export const COLETE = { pontos: 100, corpo: 0.55, cabeca: 0.6 };

// Multiplicador de dano por parte do corpo atingida.
export const MULT_PARTE = { cabeca: 4, tronco: 1, pernas: 0.75 };

// Campo de visão sem zoom (graus); a luneta usa o `zoomFov` da arma.
export const FOV_PADRAO = 75;

// Teto do recuo acumulado (rad): a mira sobe até aqui e para.
export const RECUO_MAX = 0.08;

// rpm = tiros por minuto; recarga em segundos; spreadBase/spreadMov em radianos.
// `familia`: variantes contam como a arma base na recompensa do abate e no jeito do bot lutar.
// `silenciador`: tiro baixo, sem clarão na ponta e ouvido pelos bots só de perto.
// vel = velocidade correndo (m/s) com a arma na mão: faca > pistola > SMG > escopeta > rifle > sniper.
export const ARMAS = {
  rifle: {
    nome: 'Rifle', slot: 'primaria', vel: 5.1, dano: 36, rpm: 600, pente: 30, reserva: 90,
    recarga: 2.5, auto: true, spreadBase: 0.004, spreadMov: 0.06, recuo: 0.012,
  },
  fuzil: {
    nome: 'Fuzil', slot: 'primaria', familia: 'rifle', vel: 5.0, dano: 40, rpm: 540, pente: 25, reserva: 75,
    recarga: 2.6, auto: true, spreadBase: 0.005, spreadMov: 0.07, recuo: 0.016,
  },
  rifleS: {
    nome: 'Rifle-S', slot: 'primaria', familia: 'rifle', silenciador: true, vel: 5.1, dano: 33, rpm: 600, pente: 20,
    reserva: 80, recarga: 2.4, auto: true, spreadBase: 0.003, spreadMov: 0.06, recuo: 0.01,
  },
  smg: {
    nome: 'SMG', slot: 'primaria', vel: 5.6, dano: 26, rpm: 850, pente: 30, reserva: 120,
    recarga: 2.0, auto: true, spreadBase: 0.008, spreadMov: 0.02, recuo: 0.008,
  },
  miniSmg: {
    nome: 'Mini SMG', slot: 'primaria', familia: 'smg', vel: 5.7, dano: 21, rpm: 1050, pente: 32, reserva: 128,
    recarga: 1.8, auto: true, spreadBase: 0.01, spreadMov: 0.025, recuo: 0.007,
  },
  smgS: {
    nome: 'SMG-S', slot: 'primaria', familia: 'smg', silenciador: true, vel: 5.6, dano: 24, rpm: 800, pente: 25,
    reserva: 100, recarga: 2.1, auto: true, spreadBase: 0.007, spreadMov: 0.02, recuo: 0.007,
  },
  sniper: {
    nome: 'Sniper', slot: 'primaria', vel: 4.8, dano: 115, rpm: 41, pente: 5, reserva: 20,
    recarga: 3.6, auto: false, spreadBase: 0.0005, spreadMov: 0.15, recuo: 0.05,
    zoomFov: 25, spreadSemZoom: 0.08,
  },
  escopeta: {
    nome: 'Escopeta', slot: 'primaria', vel: 5.3, dano: 20, rpm: 70, pente: 8, reserva: 32,
    recarga: 3.0, auto: false, spreadBase: 0.06, spreadMov: 0.03, recuo: 0.04,
    chumbos: 8,
  },
  pistola: {
    nome: 'Pistola', slot: 'pistola', vel: 5.8, dano: 30, rpm: 400, pente: 12, reserva: 36,
    recarga: 2.2, auto: false, spreadBase: 0.006, spreadMov: 0.03, recuo: 0.02,
  },
  // Corpo a corpo: botão esquerdo = golpe leve, direito = estocada. `costas` vale pelas costas do alvo.
  faca: {
    nome: 'Faca', slot: 'faca', vel: 6.2, dano: 40, rpm: 150, pente: Infinity, reserva: 0,
    recarga: 0, auto: true, spreadBase: 0, spreadMov: 0, recuo: 0,
    alcance: 2,
    golpes: {
      leve: { dano: 40, costas: 90, intervalo: 0.4, alcance: 2 },
      forte: { dano: 65, costas: 180, intervalo: 1.0, alcance: 1.6 },
    },
  },
  // Granada na mão (tecla 4): sem munição; o tipo e a força vêm de granadas.js.
  granada: {
    nome: 'Granada', slot: 'granada', vel: 6.2, dano: 0, rpm: 0, pente: 0, reserva: 0, recarga: 0,
    auto: false, spreadBase: 0, spreadMov: 0, recuo: 0,
  },
};

// Tipo base da arma (a própria, se não for variante).
export const familia = (tipo) => ARMAS[tipo]?.familia ?? tipo;

// reacao em segundos; erroMira em radianos; chanceCabeca em [0,1]; alturaTronco em m (ponto de mira no corpo).
export const DIFICULDADE = {
  facil: { reacao: 0.6, erroMira: 0.07, chanceCabeca: 0.03, alturaTronco: 0.95 },
  medio: { reacao: 0.38, erroMira: 0.04, chanceCabeca: 0.3 },
  dificil: { reacao: 0.2, erroMira: 0.02, chanceCabeca: 0.45 },
};

// Exibidos como `Bot <nome>`.
export const NOMES_BOTS = ['Tijolo', 'Bloco', 'Cubo', 'Pixel', 'Voxel', 'Quina', 'Laje', 'Prisma', 'Viga'];
