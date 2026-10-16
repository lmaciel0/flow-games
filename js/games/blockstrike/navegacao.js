/**
 * Navegação do Block Strike — A* sobre o grafo de waypoints.
 * Módulo puro: sem Three.js e sem DOM. Unidades em metros; custo das arestas =
 * distância euclidiana em xz. Visadas checadas na altura da cintura.
 */

import { temVisada } from './fisica.js';

const ALTURA_CINTURA = 0.9;

// Grafo: { nos: waypoints (índice === id), vizinhos: [[{ id, custo }]] }.
export function criarGrafo(waypoints, arestas) {
  const vizinhos = waypoints.map(() => []);
  for (const [a, b] of arestas) {
    const custo = Math.hypot(waypoints[a].x - waypoints[b].x, waypoints[a].z - waypoints[b].z);
    vizinhos[a].push({ id: b, custo });
    vizinhos[b].push({ id: a, custo });
  }
  return { nos: waypoints, vizinhos };
}

function distXZ(grafo, a, b) {
  return Math.hypot(grafo.nos[a].x - grafo.nos[b].x, grafo.nos[a].z - grafo.nos[b].z);
}

// Ids do caminho mais curto, incluindo as duas pontas; [] se não houver.
export function caminho(grafo, deId, paraId) {
  if (deId === paraId) return [deId];
  const g = new Map([[deId, 0]]);
  const veio = new Map();
  const aberta = [deId];
  const fechada = new Set();
  const f = (id) => g.get(id) + distXZ(grafo, id, paraId);
  while (aberta.length) {
    let melhor = 0;
    for (let i = 1; i < aberta.length; i++) if (f(aberta[i]) < f(aberta[melhor])) melhor = i;
    const atual = aberta.splice(melhor, 1)[0];
    if (atual === paraId) {
      const rota = [atual];
      while (veio.has(rota[0])) rota.unshift(veio.get(rota[0]));
      return rota;
    }
    fechada.add(atual);
    for (const { id, custo } of grafo.vizinhos[atual]) {
      if (fechada.has(id)) continue;
      const novo = g.get(atual) + custo;
      if (g.has(id) && novo >= g.get(id)) continue;
      g.set(id, novo);
      veio.set(id, atual);
      if (!aberta.includes(id)) aberta.push(id);
    }
  }
  return [];
}

function cintura(p) {
  return { x: p.x, y: ALTURA_CINTURA, z: p.z };
}

// Waypoint mais próximo de `pos` (com visada, se exigida); null se nenhum.
export function maisProximo(grafo, pos, caixas, { exigirVisada = true } = {}) {
  const origem = cintura(pos);
  let melhor = null;
  let melhorD = Infinity;
  for (const w of grafo.nos) {
    const d = Math.hypot(w.x - pos.x, w.z - pos.z);
    if (d >= melhorD) continue;
    if (exigirVisada && !temVisada(origem, cintura(w), caixas)) continue;
    melhor = w.id;
    melhorD = d;
  }
  return melhor;
}

// Waypoint `cobertura` mais próximo de `pos` sem visada para `ameacaPos`.
export function coberturaPerto(grafo, pos, ameacaPos, caixas) {
  const ameaca = cintura(ameacaPos);
  let melhor = null;
  let melhorD = Infinity;
  for (const w of grafo.nos) {
    if (!w.cobertura) continue;
    const d = Math.hypot(w.x - pos.x, w.z - pos.z);
    if (d >= melhorD) continue;
    if (temVisada(cintura(w), ameaca, caixas)) continue;
    melhor = w.id;
    melhorD = d;
  }
  return melhor;
}
