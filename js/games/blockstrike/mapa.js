/**
 * Block Strike — mapa em blocos (unidades: metros, y para cima).
 * Módulo puro: só dados. Base A em z>0 olhando para -z (yaw 0), base B em z<0
 * (yaw PI). O lado B é gerado espelhando em z o lado A, então o mapa é simétrico.
 * Rotas: corredor longo à esquerda (x<0), meio com caixas, túnel à direita.
 * Bombsites A (corredor) e B (túnel) ficam em z perto de 0, nas saídas dessas rotas.
 * Para ajustar, abrir no navegador e andar.
 */

const AREIA = 0xd9c08a;
const TIJOLO = 0xa8523b;
const MADEIRA = 0x8a5a2b;
const PEDRA = 0x9a9a8f;
const CHAO = 0xc8b27a;

// Caixa por planta (x0,z0)-(x1,z1), altura h a partir de y0.
function caixa(x0, z0, x1, z1, h, cor, y0 = 0) {
  return { min: { x: x0, y: y0, z: z0 }, max: { x: x1, y: y0 + h, z: z1 }, cor };
}

function espelhar(c) {
  return { ...c, min: { ...c.min, z: -c.max.z }, max: { ...c.max, z: -c.min.z } };
}

// Lado A (z > 0). Nada cruza z = 0; o meio passa pelo espelho.
const ladoA = [
  // muros externos (4 m)
  caixa(-40.5, 30, 40.5, 30.5, 4, PEDRA),
  caixa(-40.5, 0, -40, 30, 4, PEDRA),
  caixa(40, 0, 40.5, 30, 4, PEDRA),
  // base A: barreira na frente (corta a visada entre spawns) e paredes laterais
  caixa(-9, 19, 9, 19.5, 4, TIJOLO),
  caixa(-12, 21, -11.5, 30, 4, TIJOLO),
  caixa(11.5, 21, 12, 30, 4, TIJOLO),
  caixa(-8, 27, -7, 28, 1.2, MADEIRA),
  caixa(7, 27, 8, 28, 1.2, MADEIRA),
  // rota esquerda: corredor longo (x -40..-33) com parede interna e caixas
  caixa(-33, 3, -32.5, 16, 4, AREIA),
  caixa(-39, 12, -37, 14, 2, MADEIRA),
  caixa(-37, 6, -35, 8, 1.2, MADEIRA),
  caixa(-38, 0.5, -36, 2.5, 1.2, MADEIRA),
  caixa(-37, 22, -35, 24, 2, TIJOLO),
  caixa(-30, 24, -27, 25, 2, AREIA),
  // meio: caixas baixas (1,2 m, agachar cobre) e altas (2 m)
  caixa(-1.5, 14, 1.5, 16, 2, TIJOLO),
  caixa(-8, 10, -5.5, 11.5, 1.2, MADEIRA),
  caixa(5.5, 10, 8, 11.5, 1.2, MADEIRA),
  caixa(-10, 4, -8, 6, 2, AREIA),
  caixa(8, 4, 10, 6, 2, AREIA),
  caixa(-3, 3, -1, 4.5, 1.2, MADEIRA),
  caixa(1, 3, 3, 4.5, 1.2, MADEIRA),
  caixa(-16, 13, -14, 15, 2, TIJOLO),
  caixa(-15.5, 13.5, -14.5, 14.5, 1, MADEIRA, 2),
  caixa(14, 13, 16, 15, 2, TIJOLO),
  caixa(14.5, 13.5, 15.5, 14.5, 1, MADEIRA, 2),
  caixa(-20, 8, -18, 9.5, 1.2, MADEIRA),
  // rota direita: túnel em curva (parede interna, divisória e teto)
  caixa(25, 4, 25.5, 21, 4, PEDRA),
  caixa(31, 1.5, 31.5, 14, 4, PEDRA),
  caixa(26, 8, 31, 14, 1, PEDRA, 3),
  caixa(35, 10, 37, 12, 2, TIJOLO),
  caixa(33, 3, 34.5, 4.5, 1.2, MADEIRA),
  caixa(27, 25, 29, 27, 2, MADEIRA),
  caixa(20, 24, 22, 25, 1.2, AREIA),
];

// Waypoints do lado A: [x, z, cobertura?]. O lado B é o espelho (id + N).
const wpA = [
  [0, 23], [-10, 20.3], [10, 20.3], [-14, 17], [14, 17], // 0-4 base e saídas
  [-35, 19], [-34, 10], [-38, 15.2, true], [-38.5, 4.5, true], [-34, 3.5], // 5-9 corredor
  [-6.7, 12.8, true], [0, 17.5, true], [0, 12.5], [6.7, 12.8, true], // 10-13 meio
  [24, 23], [28, 19], [28, 11], [28, 2.5], [34, 19], [36, 13.2, true], // 14-19 túnel
];
// Waypoints no eixo z = 0 (ids 2N..2N+2): saída do corredor, meio e túnel.
const wpC = [[-34, 0], [0, 0], [33, 0]];
// Waypoints dos bombsites, no centro de cada um (ids 2N+3 e 2N+4).
const SITES = {
  A: { min: { x: -30, z: -4 }, max: { x: -19, z: 4 }, centro: { x: -24.5, z: 0 } },
  B: { min: { x: 14, z: -4 }, max: { x: 25, z: 4 }, centro: { x: 19.5, z: 0 } },
};
const N = wpA.length;
const espelharId = (i) => (i >= N ? i : i + N);

const arestasA = [
  [0, 1], [0, 2], [1, 3], [2, 4], [3, 5], [5, 6], [5, 7], [6, 9], [9, 8],
  [3, 10], [3, 11], [4, 11], [4, 13], [10, 12], [12, 13],
  [4, 14], [14, 15], [15, 16], [16, 17], [15, 18], [18, 19],
  [9, 2 * N], [12, 2 * N + 1], [17, 2 * N + 2],
];

export const MAPA = {
  caixas: [
    caixa(-40.5, -30.5, 40.5, 30.5, 1, CHAO, -1),
    ...ladoA,
    ...ladoA.map(espelhar),
  ],
  spawns: {
    A: [-4, -2, 0, 2, 4].map((x) => ({ x, y: 0, z: 26 })),
    B: [-4, -2, 0, 2, 4].map((x) => ({ x, y: 0, z: -26 })),
  },
  yawSpawn: { A: 0, B: Math.PI },
  waypoints: [
    ...wpA.map(([x, z, c]) => ({ x, z, ...(c && { cobertura: true }) })),
    ...wpA.map(([x, z, c]) => ({ x, z: -z, ...(c && { cobertura: true }) })),
    ...wpC.map(([x, z]) => ({ x, z })),
    { ...SITES.A.centro }, { ...SITES.B.centro },
  ].map((w, id) => ({ id, ...w })),
  arestas: [
    ...arestasA,
    ...arestasA.map(([a, b]) => [espelharId(a), espelharId(b)]),
    [2 * N, 2 * N + 1], [2 * N + 1, 2 * N + 2],
    [2 * N, 2 * N + 3], [2 * N + 1, 2 * N + 3], [2 * N + 1, 2 * N + 4], [2 * N + 2, 2 * N + 4],
  ],
  // Bombsites do modo desarme (retângulos no chão, em z perto de 0, entre as rotas).
  bombsites: {
    // `espera`: waypoint onde os CTs seguram o site antes da plantada ([metade z>0, metade z<0]), a ~10 m do site.
    // `mira`: para onde o CT no posto olha (a saída da rota inimiga), com o mesmo índice de `espera`.
    // `rotas`: por onde os Ts chegam ao site, divididos entre a rota do próprio site e o meio (waypoints em z = 0).
    A: { ...SITES.A, waypoint: 2 * N + 3, espera: [9, 9 + N], mira: [{ x: -36, z: -10 }, { x: -36, z: 10 }], rotas: [2 * N, 2 * N + 1] },
    B: { ...SITES.B, waypoint: 2 * N + 4, espera: [17, 17 + N], mira: [{ x: 28, z: -8 }, { x: 28, z: 8 }], rotas: [2 * N + 2, 2 * N + 1] },
  },
  ceu: 0x87ceeb,
  neblina: [30, 90],
};
