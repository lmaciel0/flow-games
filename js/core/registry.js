/**
 * Registro de jogos — a navegação e a home leem daqui, sem conhecer cada jogo.
 */

const jogos = [];

export function registrar(jogo) {
  if (jogos.some((j) => j.id === jogo.id)) {
    throw new Error(`jogo duplicado no registro: ${jogo.id}`);
  }
  jogos.push(jogo);
}

export function listar() {
  return jogos.slice();
}

export function buscar(id) {
  return jogos.find((j) => j.id === id) || null;
}
