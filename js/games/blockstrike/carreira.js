/**
 * Block Strike — estatísticas de carreira do jogador nas partidas 5x5 (o treino não conta).
 * Módulo puro: conta a partir dos eventos de `passo` (mundo.js) e resume para o painel do menu.
 */

const CAMPOS = ['partidas', 'vitorias', 'derrotas', 'empates', 'kills', 'mortes', 'assists', 'headshots', 'tiros', 'acertos', 'mvps'];

export function novaCarreira() {
  const c = { armas: {} };
  for (const k of CAMPOS) c[k] = 0;
  return c;
}

// Objeto salvo no storage, validado: campo estranho volta a zero.
export function lerCarreira(bruto) {
  const c = novaCarreira();
  if (!bruto || typeof bruto !== 'object') return c;
  const contagem = (v) => (Number.isInteger(v) && v >= 0 ? v : 0);
  for (const k of CAMPOS) c[k] = contagem(bruto[k]);
  if (bruto.armas && typeof bruto.armas === 'object') {
    for (const [tipo, n] of Object.entries(bruto.armas)) if (contagem(n) > 0) c.armas[tipo] = n;
  }
  return c;
}

// Eventos de um passo. Precisão por disparo: o tiro conta como acerto se algum chumbo pegou
// (a escopeta não passa de 100%). Só vale acerto da mesma arma do tiro: granada no mesmo passo não entra.
export function contarEventos(c, eventos, id) {
  let tiroAberto = null; // arma do disparo ainda sem acerto
  for (const ev of eventos) {
    if (ev.tipo === 'tiro' && ev.atirador === id) {
      c.tiros += 1;
      tiroAberto = ev.arma;
    } else if (ev.tipo === 'acerto' && ev.atirador === id && tiroAberto !== null && ev.arma === tiroAberto) {
      c.acertos += 1;
      tiroAberto = null;
    } else if (ev.tipo === 'morte') {
      if (ev.assassino === id) {
        c.kills += 1;
        if (ev.cabeca) c.headshots += 1;
        c.armas[ev.arma] = (c.armas[ev.arma] ?? 0) + 1;
      }
      if (ev.vitima === id) c.mortes += 1;
      if (ev.assistente === id) c.assists += 1;
    }
  }
}

// `resultado`: 'azul' | 'laranja' | 'empate'; o jogador é sempre do azul.
export function contarPartida(c, resultado) {
  c.partidas += 1;
  if (resultado === 'azul') c.vitorias += 1;
  else if (resultado === 'laranja') c.derrotas += 1;
  else c.empates += 1;
}

const pct = (a, b) => (b > 0 ? Math.round((a / b) * 100) : 0);

// Números prontos para o painel; `armasFav`: até 3 armas com mais abates.
export function resumoCarreira(c) {
  return {
    partidas: c.partidas, vitorias: c.vitorias, derrotas: c.derrotas, empates: c.empates,
    taxaVitoria: pct(c.vitorias, c.partidas),
    kills: c.kills, mortes: c.mortes, assists: c.assists, mvps: c.mvps,
    kd: c.kills / Math.max(1, c.mortes),
    precisao: pct(c.acertos, c.tiros), hs: pct(c.headshots, c.kills),
    armasFav: Object.entries(c.armas).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 3),
  };
}
