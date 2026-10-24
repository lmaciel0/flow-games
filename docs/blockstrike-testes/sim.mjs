const B = process.argv[2];
const { MAPA } = await import(`${B}/mapa.js`);
const M = await import(`${B}/mundo.js`);
const { criarRng } = await import(`${B}/rng.js`);
const { criarGrafo } = await import(`${B}/navegacao.js`);
const { criarCerebro, pensar } = await import(`${B}/bots.js`);
const { criarPartida, ladoAzul, tickPartida } = await import(`${B}/rounds.js`);
const { criarBomba } = await import(`${B}/bomba.js`);
const E = await import(`${B}/economia.js`);
const { ECONOMIA } = await import(`${B}/config.js`);

const C = await import(`${B}/carreira.js`);
const car = C.novaCarreira();
const seed = Number(process.argv[3] ?? 1);
const mundo = M.criarMundo({ mapa: MAPA, primariaJogador: 'rifle', dificuldade: 'medio', rng: criarRng(seed) });
mundo.entidades[0].bot = true;
const regras = criarPartida({ freeze: ECONOMIA.freezeCompra });
E.iniciarEconomia(mundo);
const compras = () => { for (const e of mundo.entidades) E.botComprar(e, e.time === regras.terroristas ? 'T' : 'CT'); };
compras();
M.posicionarParaRound(mundo, 'A');
mundo.bomba = criarBomba(mundo, 'laranja');
const grafo = criarGrafo(MAPA.waypoints, MAPA.arestas);
const rng = criarRng(seed ^ 77);
const cerebros = () => { for (const e of mundo.entidades) e.cerebro = criarCerebro(e, grafo, rng, MAPA.caixas, mundo); };
cerebros();
const dt = 1 / 60;
let pegas = 0, soltas = 0, fogos = 0, killsMolotov = 0, preso = 0;
let falhas = 0, assists = 0, capacetes = 0, mvps = 0, rounds = 0;
const falha = (m) => { falhas++; if (falhas < 10) console.log('FALHA', m); };
for (let i = 0; i < 60 * 60 * 40 && regras.fase !== 'fim-partida'; i++) {
  const atira = regras.fase === 'jogo';
  const cmds = new Map();
  for (const e of mundo.entidades) {
    if (!e.vivo || regras.fase === 'freeze') continue;
    const c = pensar(e, mundo, grafo, 'medio', dt, rng);
    cmds.set(e.id, atira ? c : { ...c, atirar: false });
  }
  const evs = M.passo(mundo, dt, cmds, { congelado: regras.fase === 'freeze', comBomba: atira });
  C.contarEventos(car, evs, 0);
  for (const ev of evs) {
    if (ev.tipo === 'fogo') fogos++;
    if (ev.tipo === 'arma-pega') pegas++;
    if (ev.tipo === 'arma-solta') soltas++;
    if (ev.tipo === 'morte' && ev.arma === 'molotov') killsMolotov++;
    if (ev.tipo === 'acerto' && ev.capacete) { capacetes++; if (ev.parte !== 'cabeca') falha('capacete fora da cabeça'); }
    if (ev.tipo === 'morte' && ev.assistente != null) {
      assists++;
      const a = mundo.entidades[ev.assistente], k = mundo.entidades[ev.assassino];
      const d = mundo.danos.get(`${a.id}>${ev.vitima}`)?.dano ?? 0;
      if (a.time !== k.time || a.id === k.id || d <= 40) falha(`assist inválida d=${d}`);
    }
  }
  // Dano registrado numa vítima nunca passa de 100 (a vida tirada de fato).
  for (const v of mundo.entidades) {
    let t = 0; for (const o of mundo.entidades) t += mundo.danos.get(`${o.id}>${v.id}`)?.dano ?? 0;
    if (t > 100) falha(`dano ${t} em ${v.id}`);
    if (!v.vivo && regras.fase === 'jogo' && t === 0 && !mundo.bomba?.explodiu) {} // morte por C4 sem dano registrado: ok
  }
  const pe = tickPartida(regras, dt, M.vivosPorTime(mundo), mundo.bomba);
  if (pe.includes('troca-lados')) E.resetarEconomia(mundo, regras);
  for (const ev of pe) {
    if (ev === 'fim-round') {
      rounds++;
      E.premiarRound(mundo, regras, regras.vencedorRound ?? null);
      const antesMvp = mundo.entidades.reduce((a, e) => a + e.mvps, 0);
      const mvp = M.registrarMvp(mundo, regras.vencedorRound ?? null, regras.motivo);
      if (mundo.entidades.reduce((a, e) => a + e.mvps, 0) !== antesMvp + (mvp ? 1 : 0)) falha('contagem mvps');
      const rel = M.relatorioDano(mundo, 0);
      if (mvp) {
        mvps++;
        const e = mundo.entidades[mvp.id];
        if (mvp.motivo !== 'abates' && mvp.motivo === 'desarmou' && e.hp <= 0) falha('desarmador morto');
        if (e.time !== regras.vencedorRound) falha('mvp do time perdedor');
        if (rounds <= 4) console.log(`round ${rounds}: ${regras.vencedorRound} (${regras.motivo}) MVP ${e.nome} ${mvp.motivo} k=${mvp.kills ?? '-'} | relatório jogador:`, rel.map((l) => `${l.nome} deu ${l.deu.dano}/${l.deu.acertos} levou ${l.levou.dano}/${l.levou.acertos}`).join('; '));
      }
    }
    if (ev === 'novo-round') { compras(); M.posicionarParaRound(mundo, ladoAzul(regras.round)); mundo.bomba = criarBomba(mundo, regras.terroristas); cerebros(); if (mundo.danos.size) falha('danos não zerados'); }
  }
}
const eu0 = mundo.entidades[0];
if (car.kills !== eu0.kills || car.mortes !== eu0.mortes || car.assists !== eu0.assists || car.headshots !== eu0.killsCabeca || car.acertos > car.tiros) falha('carreira ' + JSON.stringify(car));
console.log('carreira', C.resumoCarreira(car));
const somaA = mundo.entidades.reduce((s, e) => s + e.assists, 0);
if (somaA !== assists) falha('soma de assists');
console.log({ fogos, killsMolotov, soltas, pegas, noChao: mundo.armasChao.length });
for (const e of mundo.entidades) if (e.vivo && e.armas && !e.armas[e.slot]) falha('slot vazio na mão ' + e.id);
console.log({ fase: regras.fase, placar: regras.placar, rounds, assists, capacetes, mvps, falhas });
