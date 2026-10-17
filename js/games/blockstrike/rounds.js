/**
 * Block Strike — regras de round e partida (MR12: vence quem chegar a 13).
 * Módulo puro: recebe os vivos de cada time e devolve os eventos da fase.
 * Fases: freeze → jogo → fim-round → (freeze | fim-partida).
 */

import { ROUND } from './config.js';

const DT_MAX = 0.05;

// Quem planta a C4: laranja na primeira metade e azul depois da troca de lados.
export function terroristasDe(round) {
  return round <= ROUND.trocaLados ? 'laranja' : 'azul';
}

// `freeze`: duração (s) da contagem antes de cada round; a partida com economia usa uma maior para dar tempo de comprar.
export function criarPartida({ freeze = ROUND.freeze } = {}) {
  return {
    freeze,
    derrotasSeguidas: { azul: 0, laranja: 0 },
    placar: { azul: 0, laranja: 0 },
    terroristas: terroristasDe(1),
    round: 1,
    fase: 'freeze',
    tempo: freeze,
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

// Round com C4 (`bomba` = { plantada, explodiu, desarmada }): terroristas vencem plantando e explodindo
// (ou eliminando os CTs); CTs vencem eliminando os Ts sem plantio, desarmando ou esgotando o tempo.
function tickJogoBomba(p, passo, vivos, bomba) {
  const t = p.terroristas;
  const ct = t === 'azul' ? 'laranja' : 'azul';
  if (bomba.explodiu) return encerrarRound(p, t, 'bomba-explodiu');
  if (bomba.desarmada) return encerrarRound(p, ct, 'bomba-desarmada');
  if (!bomba.plantada) p.tempo -= passo;
  if (vivos[ct].n === 0 && vivos[t].n === 0) return encerrarRound(p, bomba.plantada ? t : null, 'eliminacao');
  if (vivos[ct].n === 0) return encerrarRound(p, t, 'eliminacao');
  if (vivos[t].n === 0 && !bomba.plantada) return encerrarRound(p, ct, 'eliminacao');
  if (!bomba.plantada && p.tempo <= 0) return encerrarRound(p, ct, 'tempo');
  return [];
}

export function tickPartida(p, dt, vivos, bomba) {
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
  if (p.fase === 'jogo' && bomba) return tickJogoBomba(p, passo, vivos, bomba);
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
    p.terroristas = terroristasDe(p.round);
    p.fase = 'freeze';
    p.tempo = p.freeze ?? ROUND.freeze;
    return p.round === ROUND.trocaLados + 1 ? ['novo-round', 'troca-lados'] : ['novo-round'];
  }
  return [];
}
