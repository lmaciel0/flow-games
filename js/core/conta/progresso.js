/**
 * Formato único do progresso que vai e volta do servidor (sincronizar_progresso_v2)
 * e é lido/gravado no storage local. `normalizar` aceita qualquer coisa e devolve
 * sempre o formato completo, com inteiros >= 0.
 *   termo {wins, streak} · game2048, snake, tetris: maior pontuação
 *   minas {facil, medio, dificil}: menor tempo em segundos (0 = sem recorde)
 *   velha: vitórias contra a IA · blockstrike {vitorias, partidas, melhorKD}
 */

function inteiro(valor) {
  const n = Number(valor);
  return Number.isFinite(n) ? Math.max(0, Math.trunc(n)) : 0;
}

function decimal(valor) {
  const n = Number(valor);
  return Number.isFinite(n) ? Math.max(0, Math.round(n * 100) / 100) : 0;
}

export function normalizar(p) {
  return {
    termo: { wins: inteiro(p?.termo?.wins), streak: inteiro(p?.termo?.streak) },
    game2048: inteiro(p?.game2048),
    snake: inteiro(p?.snake),
    tetris: inteiro(p?.tetris),
    velha: inteiro(p?.velha),
    minas: {
      facil: inteiro(p?.minas?.facil),
      medio: inteiro(p?.minas?.medio),
      dificil: inteiro(p?.minas?.dificil),
    },
    blockstrike: {
      vitorias: inteiro(p?.blockstrike?.vitorias),
      partidas: inteiro(p?.blockstrike?.partidas),
      melhorKD: decimal(p?.blockstrike?.melhorKD),
    },
  };
}
