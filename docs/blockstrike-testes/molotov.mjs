const B = process.argv[2];
const { MAPA } = await import(`${B}/mapa.js`);
const M = await import(`${B}/mundo.js`);
const G = await import(`${B}/granadas.js`);
const { criarRng } = await import(`${B}/rng.js`);
const E = await import(`${B}/economia.js`);
const { temVisada } = await import(`${B}/fisica.js`);
const ok = (c, m) => { if (!c) { console.log('FALHA', m); process.exitCode = 1; } else console.log('ok  ', m); };

function novo() {
  const mundo = M.criarMundo({ mapa: MAPA, primariaJogador: 'rifle', dificuldade: 'medio', rng: criarRng(3) });
  E.iniciarEconomia(mundo);
  M.posicionarParaRound(mundo, 'A');
  return mundo;
}
const parados = (mundo) => new Map(mundo.entidades.map((e) => [e.id, { frente: 0, lado: 0, yaw: e.yaw, pitch: e.pitch }]));
const rodar = (mundo, seg, cmds = parados(mundo)) => { const evs = []; for (let t = 0; t < seg; t += 1 / 60) evs.push(...M.passo(mundo, 1 / 60, cmds)); return evs; };

// 1) Molotov no chão perto de um inimigo: acende, queima, mata ou fere, e apaga em ~7 s.
let mundo = novo();
const eu = mundo.entidades[0];
const alvo = mundo.entidades.find((e) => e.time !== eu.time);
alvo.pos = { x: 0, y: 0, z: 0 };
eu.pos = { x: 0, y: 0, z: 12 };
eu.equip.granadas.molotov = 1;
const evs0 = [];
G.lancar(mundo, eu, 'molotov', evs0, { x: 0, y: 0, z: 0 });
ok(eu.equip.granadas.molotov === 0, 'gasta a molotov do estoque');
let evs = rodar(mundo, 1.5);
const fogo = evs.find((e) => e.tipo === 'fogo');
ok(Boolean(fogo), 'acende ao bater no chão');
ok(mundo.fogos.length === 1 && mundo.fogos[0].celulas.length > 20, `poça com células (${mundo.fogos[0]?.celulas.length})`);
const hpAntes = alvo.hp;
evs = rodar(mundo, 1.0);
const danosFogo = evs.filter((e) => e.tipo === 'acerto' && e.alvo === alvo.id && e.arma === 'molotov');
ok(danosFogo.length >= 3 && alvo.hp < hpAntes, `queima quem está no fogo (${hpAntes} -> ${alvo.hp})`);
ok(!evs.some((e) => e.tipo === 'acerto' && e.alvo === eu.id), 'não queima quem está fora');
evs = rodar(mundo, 6);
ok(mundo.fogos.length === 0 && evs.some((e) => e.tipo === 'fogo-fim'), 'apaga sozinho');
ok(!alvo.vivo, 'quem fica parado no fogo morre (40/s)');

// 2) Smoke em cima apaga; molotov dentro da smoke chia.
mundo = novo();
const eu2 = mundo.entidades[0];
eu2.pos = { x: 0, y: 0, z: 12 };
eu2.equip.granadas = { smoke: 1, flash: 0, he: 0, molotov: 1 };
G.lancar(mundo, eu2, 'molotov', [], { x: 0, y: 0, z: 0 });
rodar(mundo, 1.2);
ok(mundo.fogos.length === 1, 'fogo aceso antes da smoke');
eu2.proxGranada = 0;
G.lancar(mundo, eu2, 'smoke', [], { x: 0, y: 0, z: 0 });
evs = rodar(mundo, 2.5);
const fum = mundo.fumacas[0];
const restam = mundo.fogos[0]?.celulas ?? [];
ok(evs.some((e) => e.tipo === 'fogo-apagado') && restam.every((c) => Math.hypot(c.x - fum.pos.x, c.z - fum.pos.z) > fum.raio || !temVisada(fum.pos, { x: c.x, y: 0.4, z: c.z }, MAPA.caixas)), `smoke apaga as células dentro dela (restam ${restam.length} fora)`);
eu2.equip.granadas.molotov = 1; eu2.proxGranada = 0;
eu2.pos = { x: fum.pos.x, y: 0, z: fum.pos.z + 8 };
G.lancar(mundo, eu2, 'molotov', [], { x: fum.pos.x, y: 0, z: fum.pos.z });
evs = rodar(mundo, 1.2);
ok(evs.some((e) => e.tipo === 'fogo-apagado') && !evs.some((e) => e.tipo === 'fogo'), 'molotov na smoke não acende');

// 3) Jogada para o alto: estoura no ar sem fogo.
mundo = novo();
const eu3 = mundo.entidades[0];
eu3.pos = { x: 0, y: 0, z: 0 };
eu3.equip.granadas.molotov = 1;
const g0 = [];
G.lancar(mundo, eu3, 'molotov', g0);
mundo.granadas[0].vel = { x: 0, y: 30, z: 0 };
evs = rodar(mundo, 2.5);
ok(evs.some((e) => e.tipo === 'molotov-ar') && !mundo.fogos.length, 'estoura no ar sem fogo');

// 4) Fogo não atravessa parede: célula do outro lado de uma caixa alta não entra.
mundo = novo();
const alta = MAPA.caixas.find((c) => c.max.y >= 2 && c.min.y >= -0.01 && (c.max.x - c.min.x) < 4 && (c.max.z - c.min.z) < 4 && (c.max.x - c.min.x) > 0.8);
console.log('     caixa alta', JSON.stringify(alta));
const cx = (alta.min.x + alta.max.x) / 2;
const zFrente = alta.max.z + 0.7;
const eu4 = mundo.entidades[0];
eu4.pos = { x: cx, y: 0, z: zFrente + 8 };
eu4.equip.granadas.molotov = 1;
G.lancar(mundo, eu4, 'molotov', [], { x: cx, y: 0, z: zFrente });
rodar(mundo, 1.2);
const f4 = mundo.fogos[0];
const atras = f4?.celulas.filter((c) => c.z < alta.min.z && c.x > alta.min.x && c.x < alta.max.x) ?? [];
const dentro = f4?.celulas.filter((c) => c.z > alta.min.z && c.z < alta.max.z && c.x > alta.min.x && c.x < alta.max.x) ?? [];
ok(f4 && atras.length === 0 && dentro.length === 0, `parede segura o fogo (atrás=${atras.length}, dentro=${dentro.length})`);

// 5) Compra: molotov no menu, limite 1, e conta no limite de 4 granadas.
mundo = novo();
const comprador = mundo.entidades[0];
comprador.dinheiro = 5000;
comprador.equip.granadas = { smoke: 0, flash: 0, he: 0, molotov: 0 };
ok(E.comprar(comprador, 'molotov', 'T').ok, 'compra molotov');
ok(!E.comprar(comprador, 'molotov', 'T').ok, 'só uma molotov');
comprador.equip.granadas = { smoke: 1, flash: 2, he: 0, molotov: 1 };
ok(E.comprar(comprador, 'he', 'T').motivo === 'ja-tem', 'molotov conta no limite de 4');

// 6) Bot queimando sai do fogo; bot fora não entra.
{
  const { criarGrafo } = await import(`${B}/navegacao.js`);
  const { criarCerebro, pensar } = await import(`${B}/bots.js`);
  const mundo = novo();
  const grafo = criarGrafo(MAPA.waypoints, MAPA.arestas);
  const rng = criarRng(9);
  const t = mundo.entidades.find((e) => e.time === 'laranja');
  const ct = mundo.entidades.find((e) => e.time === 'azul' && e.id !== 0);
  for (const e of mundo.entidades) if (e !== t && e !== ct) { e.vivo = false; e.pos = { x: 100, y: -50, z: 100 }; }
  // CT no meio do caminho do T: o T acende o fogo bem nos pés do CT.
  ct.pos = { x: 0, y: 0, z: 22 };
  ct.cerebro = criarCerebro(ct, grafo, rng, MAPA.caixas, mundo);
  t.pos = { x: 0, y: 0, z: 29 };
  t.equip.granadas.molotov = 1;
  G.lancar(mundo, t, 'molotov', [], { x: 0, y: 0, z: 22 });
  for (let i = 0; i < 60 * 1.2; i++) M.passo(mundo, 1 / 60, new Map());
  ok(mundo.fogos.length === 1 && G.noFogo(mundo, ct.pos), 'CT está no fogo');
  const hp0 = ct.hp;
  let fora = null;
  for (let i = 0; i < 60 * 3; i++) {
    const c = pensar(ct, mundo, grafo, 'medio', 1 / 60, rng);
    M.passo(mundo, 1 / 60, new Map([[ct.id, c]]));
    if (fora === null && !G.noFogo(mundo, ct.pos)) fora = i / 60;
  }
  ok(fora !== null && fora < 1.5, `bot sai do fogo em ${fora?.toFixed(2)} s (perdeu ${hp0 - ct.hp} hp)`);
  let reentrou = false;
  for (let i = 0; i < 60 * 2.5; i++) {
    const c = pensar(ct, mundo, grafo, 'medio', 1 / 60, rng);
    M.passo(mundo, 1 / 60, new Map([[ct.id, c]]));
    if (mundo.fogos.length && G.noFogo(mundo, ct.pos)) reentrou = true;
  }
  ok(!reentrou, 'bot não volta para dentro do fogo aceso');
}


// 7) Bot encurralado na parede (revisão): fogo entre ele e o espaço aberto.
{
  const { criarGrafo } = await import(`${B}/navegacao.js`);
  const { criarCerebro, pensar } = await import(`${B}/bots.js`);
  const mundo = novo();
  const grafo = criarGrafo(MAPA.waypoints, MAPA.arestas);
  const rng = criarRng(5);
  const t = mundo.entidades.find((e) => e.time === 'laranja');
  const ct = mundo.entidades.find((e) => e.time === 'azul' && e.id !== 0);
  for (const e of mundo.entidades) if (e !== t && e !== ct) { e.vivo = false; e.pos = { x: 100, y: -50, z: 100 }; }
  ct.pos = { x: -39.6, y: 0, z: 18 };
  ct.cerebro = criarCerebro(ct, grafo, rng, MAPA.caixas, mundo);
  t.pos = { x: -37, y: 0, z: 26 };
  const fake = { tipo: 'molotov', dono: t.id, time: t.time, pos: { x: -37.2, y: 0.12, z: 18 } };
  mundo.fogos.push({ pos: { x: -37.2, y: 0, z: 18 }, y: 0, raio: 3, celula: 0.8, dono: t.id, time: t.time, nasceEm: mundo.tempo, fim: mundo.tempo + 7, proxDano: mundo.tempo,
    celulas: (() => { const cs = []; for (let i = -4; i <= 4; i++) for (let k = -4; k <= 4; k++) { const x = -37.2 + i * 0.8, z = 18 + k * 0.8; if (Math.hypot(x + 37.2, z - 18) <= 3 && x > -40) cs.push({ x, z, atraso: 0 }); } return cs; })() });
  ok(G.noFogo(mundo, ct.pos), 'CT encostado na parede está no fogo');
  let fora = null;
  for (let i = 0; i < 60 * 4 && ct.vivo; i++) {
    const c = pensar(ct, mundo, grafo, 'medio', 1 / 60, rng);
    M.passo(mundo, 1 / 60, new Map([[ct.id, c]]));
    if (i % 10 === 0 && fora === null) console.log('     t', (i / 60).toFixed(2), ct.pos.x.toFixed(2), ct.pos.z.toFixed(2), 'f', c.frente.toFixed(2), 'l', c.lado.toFixed(2), 'v', ct.velHoriz.toFixed(2), ct.cerebro.estado);
    if (fora === null && !G.noFogo(mundo, ct.pos)) fora = i / 60;
  }
  ok(ct.vivo && fora !== null && fora < 2, `encurralado sai do fogo em ${fora?.toFixed(2)} s, vivo=${ct.vivo} hp=${ct.hp}`);
}
// 8) Topo de caixa de 1,2 m perto do fogo não queima (revisão).
{
  const mundo = novo();
  mundo.fogos.push({ pos: { x: -0.5, y: 0, z: 3.8 }, y: 0, raio: 3, celula: 0.8, dono: 5, time: 'laranja', nasceEm: 0, fim: 99, proxDano: 0, celulas: [{ x: -0.5, z: 3.8, atraso: 0 }, { x: -1.3, z: 3.8, atraso: 0 }] });
  ok(!G.noFogo(mundo, { x: -0.7, y: 1.2, z: 3.8 }), 'em cima da caixa de 1,2 m não queima');
  ok(Boolean(G.noFogo(mundo, { x: -0.7, y: 1.0, z: 3.8 })), 'pulando (1,0 m) ainda queima');
  ok(!G.noFogo(mundo, { x: -0.7, y: 0, z: 3.8 }, 0, 'laranja'), 'bot ignora o fogo do próprio time');
}
