/**
 * Block Strike — estado e regras das armas (cadência, recarga, spread e recuo).
 * Módulo puro: sem Three.js e sem DOM. Tempo em segundos; ângulos em radianos.
 */

import { ARMAS, MULT_PARTE, RECUO_MAX } from './config.js';

const RECUO_VOLTA = 0.1; // rad/s, enquanto o gatilho está solto
const FATOR_AGACHADO = 0.6;

export function criarArma(tipo) {
  const def = ARMAS[tipo];
  return {
    tipo, municao: def.pente, reserva: def.reserva,
    prontaEm: 0, recarregandoAte: 0, recuoAcum: 0, gatilhoSolto: true,
  };
}

export function danoDe(tipo, parte) {
  return Math.round(ARMAS[tipo].dano * MULT_PARTE[parte]);
}

export function podeAtirar(arma, agora, gatilho) {
  if (!gatilho) return false;
  if (arma.recarregandoAte > 0) return false;
  if (arma.municao <= 0) return false;
  if (agora < arma.prontaEm) return false;
  if (!ARMAS[arma.tipo].auto && !arma.gatilhoSolto) return false;
  return true;
}

// Cone de erro (rad) para o estado de movimento atual.
function calcularSpread(def, { velHoriz, velMax, noChao, agachado, zoom }) {
  const base = def.spreadSemZoom !== undefined && !zoom ? def.spreadSemZoom : def.spreadBase;
  let s = base + (velHoriz / velMax) * def.spreadMov;
  if (agachado) s *= FATOR_AGACHADO;
  if (!noChao) s += 2 * def.spreadMov;
  return s;
}

export function disparar(arma, agora, estado, rng) {
  const def = ARMAS[arma.tipo];
  arma.municao -= 1;
  arma.prontaEm = agora + 60 / def.rpm;
  arma.recuoAcum = Math.min(RECUO_MAX, arma.recuoAcum + def.recuo);
  arma.gatilhoSolto = false;
  const spread = calcularSpread(def, estado);
  const desvios = [];
  for (let i = 0; i < (def.chumbos ?? 1); i++) {
    desvios.push({
      dx: (rng() * 2 - 1) * spread,
      dy: (rng() * 2 - 1) * spread + arma.recuoAcum, // recuo sobe a mira (pitch + é para cima)
    });
  }
  return desvios;
}

export function iniciarRecarga(arma, agora) {
  const def = ARMAS[arma.tipo];
  if (arma.recarregandoAte > 0 || arma.municao >= def.pente || arma.reserva <= 0) return false;
  arma.recarregandoAte = agora + def.recarga;
  return true;
}

export function atualizarArma(arma, agora, dt, gatilho) {
  arma.gatilhoSolto = !gatilho;
  if (!gatilho) arma.recuoAcum = Math.max(0, arma.recuoAcum - RECUO_VOLTA * dt);
  if (arma.recarregandoAte > 0 && agora >= arma.recarregandoAte) {
    const levar = Math.min(ARMAS[arma.tipo].pente - arma.municao, arma.reserva);
    arma.municao += levar;
    arma.reserva -= levar;
    arma.recarregandoAte = 0;
  }
  if (gatilho && arma.municao <= 0) iniciarRecarga(arma, agora);
}
