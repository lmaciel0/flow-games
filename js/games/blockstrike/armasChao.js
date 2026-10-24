/**
 * Block Strike — armas no chão: soltar (G ou ao morrer), física simples de caixa com giro e pegar
 * (E na que está na mira, ou passando por cima com o slot vazio). A arma leva a munição que tinha.
 * Módulo puro: sem Three.js e sem DOM. `mundo.armasChao` guarda as armas soltas do round.
 */

import { ARMAS } from './config.js';
import { moverComColisao, olho, direcao } from './fisica.js';

const GRAVIDADE = 20;
const RAIO = 0.15; // caixa de colisão da arma
const ALTURA = 0.1;
const ALCANCE_PEGAR = 2.6; // m do olho até a arma para o E (em pé, alcança o chão a ~2 m dos pés)
const MIRA_PEGAR = 0.75; // cosseno: a arma tem de estar perto do centro da mira
const PERTO_AUTO = 0.9; // m (no plano) para pegar passando por cima
const ESPERA_AUTO = 1; // s até quem soltou poder pegar de volta passando por cima
const MAX_NO_CHAO = 24;

const SLOTS_SOLTAVEIS = ['primaria', 'pistola'];
export const podeSoltar = (slot) => SLOTS_SOLTAVEIS.includes(slot);

// Tira a arma do `slot` de `e` e joga no chão. `morte`: cai perto do corpo, sem o arremesso para a frente.
// Devolve true se soltou. A troca para outra arma na mão fica com quem chama (mundo.js).
export function soltarArma(mundo, e, slot, eventos, { morte = false } = {}) {
  const arma = e.armas?.[slot];
  if (!arma || !podeSoltar(slot)) return false;
  e.armas[slot] = null;
  arma.recarregandoAte = 0;
  arma.recuoAcum = 0;
  if (slot === 'primaria' && e.equip) e.equip.primaria = null; // não volta no próximo round
  const o = olho(e);
  const d = direcao(e.yaw, morte ? 0 : e.pitch);
  const forca = morte ? 1.5 : 4.5;
  const lista = (mundo.armasChao ??= []);
  mundo.proxIdArma = (mundo.proxIdArma ?? 0) + 1;
  lista.push({
    id: mundo.proxIdArma, arma,
    pos: { x: o.x + d.x * 0.4, y: o.y - (morte ? 0.6 : 0.2), z: o.z + d.z * 0.4 },
    vel: { x: d.x * forca, y: (morte ? 1 : d.y * forca) + 2, z: d.z * forca },
    rotY: e.yaw, giro: morte ? 3 : 9, noChao: false, soltaPor: e.id, soltaEm: mundo.tempo,
  });
  while (lista.length > MAX_NO_CHAO) lista.shift();
  eventos.push({ tipo: 'arma-solta', id: e.id, arma: arma.tipo, ponto: { ...o } });
  return true;
}

// Um eixo por vez, como a granada: quica na parede, para no chão com atrito.
function moverArma(a, dt, caixas, eventos) {
  a.vel.y -= GRAVIDADE * dt;
  const eixo = (k) => {
    const d = { x: 0, y: 0, z: 0 };
    d[k] = a.vel[k] * dt;
    const alvo = a.pos[k] + d[k];
    const r = moverComColisao({ x: a.pos.x, y: a.pos.y, z: a.pos.z }, d, RAIO, ALTURA, caixas);
    a.pos[k] = r.pos[k];
    return Math.abs(r.pos[k] - alvo) > 1e-6;
  };
  if (eixo('x')) a.vel.x *= -0.4;
  if (eixo('z')) a.vel.z *= -0.4;
  if (eixo('y')) {
    if (a.vel.y < 0) {
      const forte = a.vel.y < -3;
      a.vel.y = forte ? -a.vel.y * 0.25 : 0;
      a.vel.x *= 0.6;
      a.vel.z *= 0.6;
      if (forte) eventos.push({ tipo: 'arma-chao', ponto: { ...a.pos } });
      if (!forte && Math.hypot(a.vel.x, a.vel.z) < 0.3) {
        a.noChao = true;
        a.vel = { x: 0, y: 0, z: 0 };
      }
    } else a.vel.y = 0;
  }
  if (!a.noChao) a.rotY += a.giro * dt;
}

export function atualizarArmasChao(mundo, dt, eventos) {
  for (const a of mundo.armasChao ?? []) if (!a.noChao) moverArma(a, dt, mundo.mapa.caixas, eventos);
}

// Arma no chão que `e` pode pegar com o E: a mais perto do centro da mira, ao alcance. null se nenhuma.
export function alvoPegar(mundo, e) {
  const o = olho(e);
  const d = direcao(e.yaw, e.pitch);
  let melhor = null;
  let melhorCos = MIRA_PEGAR;
  for (const a of mundo.armasChao ?? []) {
    const v = { x: a.pos.x - o.x, y: a.pos.y - o.y, z: a.pos.z - o.z };
    const n = Math.hypot(v.x, v.y, v.z);
    if (n > ALCANCE_PEGAR) continue;
    const cos = n < 1e-6 ? 1 : (v.x * d.x + v.y * d.y + v.z * d.z) / n;
    if (cos > melhorCos) { melhorCos = cos; melhor = a; }
  }
  return melhor;
}

// Arma para pegar passando por cima: o slot dela está vazio e não foi `e` quem acabou de soltá-la.
export function alvoAutomatico(mundo, e) {
  for (const a of mundo.armasChao ?? []) {
    const slot = ARMAS[a.arma.tipo].slot;
    if (e.armas[slot]) continue;
    if (a.soltaPor === e.id && mundo.tempo - a.soltaEm < ESPERA_AUTO) continue;
    if (Math.abs(a.pos.y - e.pos.y) > 1 || Math.hypot(a.pos.x - e.pos.x, a.pos.z - e.pos.z) > PERTO_AUTO) continue;
    return a;
  }
  return null;
}

// Tira `a` do chão e põe no slot dela; quem tinha arma nesse slot solta a antiga antes (troca).
// Devolve o slot. Pegar uma primária vale também para os próximos rounds (equip).
export function pegarArma(mundo, e, a, eventos) {
  const slot = ARMAS[a.arma.tipo].slot;
  const lista = mundo.armasChao ?? [];
  const i = lista.indexOf(a);
  if (i < 0) return null;
  lista.splice(i, 1);
  if (e.armas[slot]) soltarArma(mundo, e, slot, eventos);
  e.armas[slot] = a.arma;
  if (slot === 'primaria' && e.equip) e.equip.primaria = a.arma.tipo;
  eventos.push({ tipo: 'arma-pega', id: e.id, arma: a.arma.tipo, ponto: { ...a.pos } });
  return slot;
}

// Arma primária no chão perto e visível para um bot sem primária buscar (posição) ou null.
export function primariaPerto(mundo, e, alcance, visivel) {
  let melhor = null;
  let dMelhor = alcance;
  for (const a of mundo.armasChao ?? []) {
    if (!a.noChao || ARMAS[a.arma.tipo].slot !== 'primaria' || a.arma.municao + a.arma.reserva === 0) continue;
    const d = Math.hypot(a.pos.x - e.pos.x, a.pos.z - e.pos.z);
    if (d < dMelhor && Math.abs(a.pos.y - e.pos.y) < 1 && visivel(a.pos)) { dMelhor = d; melhor = a; }
  }
  return melhor ? { ...melhor.pos } : null;
}
