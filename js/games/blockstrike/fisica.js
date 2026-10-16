/**
 * Física do Block Strike — colisão AABB, raycast e hitboxes.
 * Módulo puro: sem Three.js e sem DOM. y é para cima; `pos` fica nos pés.
 */

import { JOGADOR } from './config.js';

const PASSO_MAX = 0.1;
const EPS = 1e-9;
const EIXOS = ['x', 'y', 'z'];

// Encostar (faces iguais) não conta como interseção.
function sobrepoe(pos, raio, altura, c) {
  return (
    pos.x - raio < c.max.x - EPS && pos.x + raio > c.min.x + EPS &&
    pos.y < c.max.y - EPS && pos.y + altura > c.min.y + EPS &&
    pos.z - raio < c.max.z - EPS && pos.z + raio > c.min.z + EPS
  );
}

// Move `pos` em um único eixo e encosta na face mais restritiva, se houver.
// Retorna true se foi bloqueado.
function moverEixo(pos, eixo, d, raio, altura, caixas) {
  if (d === 0) return false;
  pos[eixo] += d;
  const abaixo = eixo === 'y' ? 0 : raio; // extensão do corpo atrás de pos no eixo
  const acima = eixo === 'y' ? altura : raio;
  let alvo = pos[eixo];
  let bloqueou = false;
  for (const c of caixas) {
    if (!sobrepoe(pos, raio, altura, c)) continue;
    bloqueou = true;
    const limite = d > 0 ? c.min[eixo] - acima : c.max[eixo] + abaixo;
    alvo = d > 0 ? Math.min(alvo, limite) : Math.max(alvo, limite);
  }
  pos[eixo] = alvo;
  return bloqueou;
}

export function moverComColisao(pos, desloc, raio, altura, caixas) {
  const p = { x: pos.x, y: pos.y, z: pos.z };
  const maior = Math.max(Math.abs(desloc.x), Math.abs(desloc.y), Math.abs(desloc.z));
  const passos = Math.max(1, Math.ceil(maior / PASSO_MAX));
  const dx = desloc.x / passos;
  const dy = desloc.y / passos;
  const dz = desloc.z / passos;
  let noChao = false;
  let bateuTeto = false;
  for (let i = 0; i < passos; i++) {
    moverEixo(p, 'x', dx, raio, altura, caixas);
    moverEixo(p, 'z', dz, raio, altura, caixas);
    if (moverEixo(p, 'y', dy, raio, altura, caixas)) {
      if (dy < 0) noChao = true;
      else bateuTeto = true;
    }
  }
  // Parado sobre o chão (sem deslocamento vertical) também conta como noChao.
  if (!noChao && desloc.y <= 0) {
    const sonda = { x: p.x, y: p.y - 1e-4, z: p.z };
    noChao = caixas.some((c) => sobrepoe(sonda, raio, altura, c));
  }
  return { pos: p, noChao, bateuTeto };
}

// Método slab. Retorna a entrada mais próxima de `origem` (ignora origem dentro da caixa).
function raioContraCaixa(o, d, c) {
  let tmin = -Infinity;
  let tmax = Infinity;
  let eixoEntrada = null;
  for (const eixo of EIXOS) {
    if (d[eixo] === 0) {
      if (o[eixo] < c.min[eixo] || o[eixo] > c.max[eixo]) return null;
      continue;
    }
    let t1 = (c.min[eixo] - o[eixo]) / d[eixo];
    let t2 = (c.max[eixo] - o[eixo]) / d[eixo];
    if (t1 > t2) [t1, t2] = [t2, t1];
    if (t1 > tmin) {
      tmin = t1;
      eixoEntrada = eixo;
    }
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return null;
  }
  if (eixoEntrada === null || tmin < 0) return null;
  return { t: tmin, eixo: eixoEntrada };
}

export function raycastCaixas(origem, dir, caixas, maxDist) {
  let melhor = null;
  for (const c of caixas) {
    const r = raioContraCaixa(origem, dir, c);
    if (!r || r.t > maxDist) continue;
    if (melhor === null || r.t < melhor.t) melhor = { t: r.t, eixo: r.eixo };
  }
  if (melhor === null) return null;
  const normal = { x: 0, y: 0, z: 0 };
  normal[melhor.eixo] = dir[melhor.eixo] > 0 ? -1 : 1;
  return {
    dist: melhor.t,
    ponto: {
      x: origem.x + dir.x * melhor.t,
      y: origem.y + dir.y * melhor.t,
      z: origem.z + dir.z * melhor.t,
    },
    normal,
  };
}

const LARGURA_CORPO = 0.25; // meia-largura de pernas e tronco
const LARGURA_CABECA = 0.2;
const ESCALA_AGACHADO = 1.2 / 1.8;

export function hitboxes(ent) {
  const k = ent.agachado ? ESCALA_AGACHADO : 1;
  const { x, y, z } = ent.pos;
  const caixa = (parte, y0, y1, meia) => ({
    parte,
    min: { x: x - meia, y: y + y0 * k, z: z - meia },
    max: { x: x + meia, y: y + y1 * k, z: z + meia },
  });
  return [
    caixa('pernas', 0, 0.8, LARGURA_CORPO),
    caixa('tronco', 0.8, 1.4, LARGURA_CORPO),
    caixa('cabeca', 1.4, 1.8, LARGURA_CABECA),
  ];
}

export function raycastEntidades(origem, dir, entidades, maxDist, ignorarId) {
  let melhor = null;
  for (const ent of entidades) {
    if (!ent.vivo || ent.id === ignorarId) continue;
    for (const hb of hitboxes(ent)) {
      const r = raioContraCaixa(origem, dir, hb);
      if (!r || r.t > maxDist) continue;
      if (melhor === null || r.t < melhor.dist) {
        melhor = {
          ent,
          parte: hb.parte,
          dist: r.t,
          ponto: {
            x: origem.x + dir.x * r.t,
            y: origem.y + dir.y * r.t,
            z: origem.z + dir.z * r.t,
          },
        };
      }
    }
  }
  return melhor;
}

export function temVisada(a, b, caixas) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dz = b.z - a.z;
  const dist = Math.hypot(dx, dy, dz);
  if (dist < EPS) return true;
  const dir = { x: dx / dist, y: dy / dist, z: dz / dist };
  return raycastCaixas(a, dir, caixas, dist) === null;
}

// Posição do olho (câmera / origem dos tiros).
export function olho(ent) {
  const h = ent.agachado ? JOGADOR.olhoAgachado : JOGADOR.olho;
  return { x: ent.pos.x, y: ent.pos.y + h, z: ent.pos.z };
}

// Vetor unitário de visada. yaw 0 olha para -z; yaw positivo vira à esquerda.
export function direcao(yaw, pitch) {
  const c = Math.cos(pitch);
  return { x: -Math.sin(yaw) * c, y: Math.sin(pitch), z: -Math.cos(yaw) * c };
}
