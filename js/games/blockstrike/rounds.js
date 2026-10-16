/**
 * Block Strike — regras de round e partida (MR12: vence quem chegar a 13).
 * Módulo puro: recebe os vivos de cada time e devolve os eventos da fase.
 * Fases: freeze → jogo → fim-round → (freeze | fim-partida).
 */

import { ROUND } from './config.js';

const DT_MAX = 0.05;

export function criarPartida() {
  return {
    placar: { azul: 0, laranja: 0 },
    round: 1,
    fase: 'freeze',
    tempo: ROUND.freeze,
    vencedorRound: undefined,
    motivo: null,
    resultado: null,
  };
}

// Lado da base do time azul: troca depois do round `trocaLados`.
export function ladoAzul(round) {
  return round <= ROUND.trocaLados ? 'A' : 'B';
}

// Fim por tempo: mais vivos, depois mais HP somado; igual em tudo, ninguém.
export function vencedorPorTempo(vivos) {
  const { azul, laranja } = vivos;
  if (azul.n !== laranja.n) return azul.n > laranja.n ? 'azul' : 'laranja';
  if (azul.hp !== laranja.hp) return azul.hp > laranja.hp ? 'azul' : 'laranja';
  return null;
}

function encerrarRound(p, vencedor, motivo) {
  if (vencedor) p.placar[vencedor] += 1;
  p.vencedorRound = vencedor;
  p.motivo = motivo;
  p.fase = 'fim-round';
  p.tempo = ROUND.fimRound;
  return ['fim-round'];
}

function resultadoFinal(placar) {
  if (placar.azul === placar.laranja) return 'empate';
  return placar.azul > placar.laranja ? 'azul' : 'laranja';
}

export function tickPartida(p, dt, vivos) {
  const passo = Math.min(dt, DT_MAX);
  if (p.fase === 'freeze') {
    p.tempo -= passo;
    if (p.tempo > 0) return [];
    p.fase = 'jogo';
    p.tempo = ROUND.duracao;
    p.vencedorRound = undefined;
    p.motivo = null;
    return ['inicio-round'];
  }
  if (p.fase === 'jogo') {
    p.tempo -= passo;
    const { azul, laranja } = vivos;
    if (azul.n === 0 && laranja.n === 0) return encerrarRound(p, null, 'eliminacao');
    if (laranja.n === 0) return encerrarRound(p, 'azul', 'eliminacao');
    if (azul.n === 0) return encerrarRound(p, 'laranja', 'eliminacao');
    if (p.tempo <= 0) return encerrarRound(p, vencedorPorTempo(vivos), 'tempo');
    return [];
  }
  if (p.fase === 'fim-round') {
    p.tempo -= passo;
    if (p.tempo > 0) return [];
    const { azul, laranja } = p.placar;
    if (azul >= ROUND.vencer || laranja >= ROUND.vencer || p.round >= ROUND.maxRounds) {
      p.fase = 'fim-partida';
      p.tempo = 0;
      p.resultado = resultadoFinal(p.placar);
      return ['fim-partida'];
    }
    p.round += 1;
    p.fase = 'freeze';
    p.tempo = ROUND.freeze;
    return p.round === ROUND.trocaLados + 1 ? ['novo-round', 'troca-lados'] : ['novo-round'];
  }
  return [];
}
