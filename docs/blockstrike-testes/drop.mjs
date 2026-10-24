const B = process.argv[2];
const { MAPA } = await import(`${B}/mapa.js`);
const M = await import(`${B}/mundo.js`);
const A = await import(`${B}/armasChao.js`);
const { criarRng } = await import(`${B}/rng.js`);
const { criarArma } = await import(`${B}/armas.js`);
const E = await import(`${B}/economia.js`);
const ok = (c, m) => { if (!c) { console.log('FALHA', m); process.exitCode = 1; } else console.log('ok  ', m); };
function novo() {
  const mundo = M.criarMundo({ mapa: MAPA, primariaJogador: 'rifle', dificuldade: 'medio', rng: criarRng(3) });
  E.iniciarEconomia(mundo);
  for (const e of mundo.entidades) e.equip.primaria = 'rifle';
  M.posicionarParaRound(mundo, 'A');
  return mundo;
}
const cmdDe = (e, extra = {}) => ({ frente: 0, lado: 0, yaw: e.yaw, pitch: e.pitch, ...extra });
const rodar = (mundo, seg, cmds = new Map(), opts) => { const evs = []; for (let t = 0; t < seg; t += 1 / 60) evs.push(...M.passo(mundo, 1 / 60, cmds, opts)); return evs; };

// 1) G solta a primária, saca a pistola, a arma cai e para.
let mundo = novo();
let eu = mundo.entidades[0];
eu.armas.primaria.municao = 13;
let evs = M.passo(mundo, 1 / 60, new Map([[0, cmdDe(eu, { soltar: true })]]));
ok(!eu.armas.primaria && eu.slot === 'pistola' && evs.some((e) => e.tipo === 'arma-solta'), 'G solta a primária e saca a pistola');
ok(eu.equip.primaria === null, 'primária solta não volta no próximo round');
rodar(mundo, 2);
const chao = mundo.armasChao[0];
ok(chao && chao.noChao && chao.pos.y < 0.2 && chao.arma.municao === 13, `arma parou no chão com a munição (y=${chao?.pos.y.toFixed(2)})`);
// 2) Quem solta não pega de volta na hora; passar por cima depois de 1 s pega, sem trocar a arma da mão.
eu.pos = { x: chao.pos.x, y: 0, z: chao.pos.z };
rodar(mundo, 0.1);
ok(eu.armas.primaria?.municao === 13 && eu.slot === 'pistola' && mundo.armasChao.length === 0, 'passando por cima pega (slot vazio) sem trocar a da mão');
ok(eu.equip.primaria === 'rifle', 'arma pega volta a valer no próximo round');

// 3) E na mira troca: rifle na mão, sniper no chão à frente.
mundo = novo();
eu = mundo.entidades[0];
eu.pos = { x: 0, y: 0, z: 26 }; eu.yaw = 0; eu.pitch = -0.6;
mundo.armasChao.push({ id: 99, arma: criarArma('sniper'), pos: { x: 0, y: 0, z: 25 }, vel: { x: 0, y: 0, z: 0 }, rotY: 0, giro: 0, noChao: true, soltaPor: 7, soltaEm: 0 });
ok(A.alvoPegar(mundo, eu)?.id === 99, 'sniper na mira é o alvo do E');
evs = M.passo(mundo, 1 / 60, new Map([[0, cmdDe(eu, { pegar: true })]]));
ok(eu.armas.primaria.tipo === 'sniper' && eu.slot === 'primaria' && mundo.armasChao.some((a) => a.arma.tipo === 'rifle'), 'E pega a sniper e solta o rifle (troca)');
ok(eu.equip.primaria === 'sniper', 'equip vira sniper');
eu.pitch = 0.8;
ok(A.alvoPegar(mundo, eu) === null, 'olhando para cima não pega');

// 4) Morte: cai a primária com a munição; round novo limpa o chão.
mundo = novo();
const vit = mundo.entidades[6];
vit.armas.primaria.municao = 7;
vit.hp = 0;
rodar(mundo, 1.5);
const caiu = mundo.armasChao.find((a) => a.soltaPor === vit.id);
ok(!vit.vivo && caiu && caiu.arma.tipo === 'rifle' && caiu.arma.municao === 7 && caiu.noChao, 'ao morrer cai a primária com a munição');
const semPrim = mundo.entidades[7];
semPrim.armas.primaria = null; semPrim.slot = 'pistola'; semPrim.hp = 0;
rodar(mundo, 0.1);
ok(mundo.armasChao.some((a) => a.soltaPor === semPrim.id && a.arma.tipo === 'pistola'), 'sem primária, cai a pistola');
M.posicionarParaRound(mundo, 'B');
ok(mundo.armasChao.length === 0, 'round novo limpa as armas do chão');

// 5) Freeze: dá para soltar (comprar e passar para um aliado).
mundo = novo();
eu = mundo.entidades[0];
M.passo(mundo, 1 / 60, new Map([[0, cmdDe(eu, { soltar: true })]]), { congelado: true, comBomba: false });
ok(!eu.armas.primaria && mundo.armasChao.length === 1, 'solta no freeze');

// 6) Bot sem primária busca a do chão e troca para ela.
{
  const { criarGrafo } = await import(`${B}/navegacao.js`);
  const { criarCerebro, pensar } = await import(`${B}/bots.js`);
  mundo = novo();
  const grafo = criarGrafo(MAPA.waypoints, MAPA.arestas);
  const rng = criarRng(4);
  const bot = mundo.entidades[1];
  for (const e of mundo.entidades) if (e !== bot) { e.vivo = false; e.pos = { x: 100, y: -50, z: 100 }; }
  bot.armas.primaria = null; bot.equip.primaria = null; bot.slot = 'pistola';
  bot.cerebro = criarCerebro(bot, grafo, rng, MAPA.caixas, mundo);
  mundo.armasChao.push({ id: 50, arma: criarArma('smg'), pos: { x: bot.pos.x + 5, y: 0, z: bot.pos.z - 3 }, vel: { x: 0, y: 0, z: 0 }, rotY: 0, giro: 0, noChao: true, soltaPor: 9, soltaEm: 0 });
  let pegou = null;
  for (let i = 0; i < 60 * 5 && pegou === null; i++) {
    const c = pensar(bot, mundo, grafo, 'medio', 1 / 60, rng);
    M.passo(mundo, 1 / 60, new Map([[bot.id, c]]));
    if (bot.armas.primaria) pegou = i / 60;
  }
  for (let i = 0; i < 30; i++) M.passo(mundo, 1 / 60, new Map([[bot.id, pensar(bot, mundo, grafo, 'medio', 1 / 60, rng)]]));
  ok(pegou !== null && bot.armas.primaria.tipo === 'smg' && bot.slot === 'primaria', `bot busca a SMG no chão (${pegou?.toFixed(2)} s) e saca`);
}
