/**
 * Persistência unificada — chaves `arcade:<jogo>:<chave>` em localStorage.
 * Nunca lança: se o storage estiver bloqueado, os jogos só não persistem.
 */

const PREFIXO = 'arcade:';

function armazenamento() {
  try {
    return globalThis.localStorage || null;
  } catch {
    return null;
  }
}

// JSON válido de tipo errado (ex.: "abc" onde se espera número) conta como corrompido.
function tipoValido(valor, padrao) {
  if (valor === null) return false;
  if (typeof valor === 'number' && !Number.isFinite(valor)) return false;
  return padrao === null || typeof valor === typeof padrao;
}

export function get(chave, padrao = null) {
  const ls = armazenamento();
  if (!ls) return padrao;
  try {
    const bruto = ls.getItem(PREFIXO + chave);
    if (bruto === null) return padrao;
    const valor = JSON.parse(bruto);
    return tipoValido(valor, padrao) ? valor : padrao;
  } catch {
    return padrao;
  }
}

export function set(chave, valor) {
  const ls = armazenamento();
  if (!ls) return false;
  try {
    ls.setItem(PREFIXO + chave, JSON.stringify(valor));
    return true;
  } catch {
    return false;
  }
}

export function escopo(id) {
  return {
    get: (chave, padrao = null) => get(`${id}:${chave}`, padrao),
    set: (chave, valor) => set(`${id}:${chave}`, valor)
  };
}

function inteiro(bruto) {
  const n = parseInt(bruto, 10);
  return Number.isFinite(n) ? n : undefined;
}

// Cada conversor devolve undefined para pular valores inválidos.
const MIGRACOES = [
  {
    antiga: 'jogodavelha_scores',
    nova: 'tictactoe:placar',
    converter: (bruto) => {
      const o = JSON.parse(bruto);
      return { x: Number(o.x) || 0, o: Number(o.o) || 0, ties: Number(o.ties) || 0 };
    }
  },
  { antiga: '2048_best_score', nova: 'game2048:recorde', converter: inteiro },
  { antiga: 'snake_best_score', nova: 'snake:recorde', converter: inteiro },
  {
    antiga: 'termo_stats',
    nova: 'termo:stats',
    converter: (bruto) => {
      const o = JSON.parse(bruto);
      return { wins: Number(o.wins) || 0, streak: Number(o.streak) || 0 };
    }
  }
];

/** Copia as chaves antigas para as novas, uma vez. Não apaga as antigas. */
export function migrar() {
  const ls = armazenamento();
  if (!ls || get('migrado') === 1) return;
  for (const { antiga, nova, converter } of MIGRACOES) {
    try {
      const bruto = ls.getItem(antiga);
      if (bruto === null || ls.getItem(PREFIXO + nova) !== null) continue;
      const valor = converter(bruto);
      if (valor !== undefined) set(nova, valor);
    } catch {
      // valor antigo corrompido: ignora e segue
    }
  }
  set('migrado', 1);
}
