/**
 * Block Strike — granadas: flash (cega), HE (dano em área), smoke (nuvem de blocos que corta a visão)
 * e molotov (poça de fogo que queima e fecha a passagem).
 * Módulo puro: sem Three.js e sem DOM. Unidades em metros e segundos.
 * `mundo.granadas` guarda as que estão no ar; `mundo.fumacas`, as nuvens ativas (blocos que somem
 * quando um tiro ou uma HE passa e voltam depois de alguns segundos); `mundo.fogos`, as poças de fogo.
 */

import { GRANADA, ORDEM_GRANADAS } from './config.js';
import { criarArma } from './armas.js';
import { moverComColisao, olho, direcao, temVisada } from './fisica.js';

const distancia = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

// Pode lançar? (`treino`: granadas infinitas; com economia, só as compradas.)
export function granadasDe(mundo, e) {
  if (mundo.modo === 'treino') return { smoke: 99, flash: 99, he: 99, molotov: 99 };
  return e.equip?.granadas ?? { smoke: 0, flash: 0, he: 0, molotov: 0 };
}

// Lança a granada `tipo` de `e`. Sem `alvo`, segue a mira (com um arco para cima);
// com `alvo` (bots), calcula o arco que cai nele em ~0,9 s (e ignora `forca`).
// `forca`: 'longe', 'medio' ou 'curto' (o curto sai 0,3 m mais baixo).
export function lancar(mundo, e, tipo, eventos, alvo = null, forca = 'longe') {
  const estoque = granadasDe(mundo, e);
  if (!e.vivo || !(estoque[tipo] > 0) || mundo.tempo < (e.proxGranada ?? 0)) return false;
  if (mundo.modo !== 'treino') estoque[tipo] -= 1;
  e.proxGranada = mundo.tempo + GRANADA.intervalo;
  const o = olho(e);
  let vel;
  if (alvo) {
    const T = 0.9;
    vel = {
      x: (alvo.x - o.x) / T, z: (alvo.z - o.z) / T,
      y: (alvo.y - o.y + 0.5 * GRANADA.gravidade * T * T) / T,
    };
  } else {
    const d = direcao(e.yaw, e.pitch);
    const { velocidade, subida } = GRANADA.forcas[forca];
    vel = { x: d.x * velocidade, y: d.y * velocidade + subida, z: d.z * velocidade };
  }
  const d0 = direcao(e.yaw, e.pitch);
  const g = {
    tipo, dono: e.id, time: e.time, nasceEm: mundo.tempo, fusivel: GRANADA.fusivel[tipo],
    pos: { x: o.x + d0.x * 0.4, y: o.y + d0.y * 0.4 - 0.15 - (!alvo && forca === 'curto' ? 0.3 : 0), z: o.z + d0.z * 0.4 },
    vel, quiques: 0,
  };
  (mundo.granadas ??= []).push(g);
  eventos.push({ tipo: 'arremesso', atirador: e.id, granada: tipo, ponto: { ...g.pos } });
  return true;
}

// Próximo tipo de ORDEM_GRANADAS depois de `atual` (circular) com estoque; null se não houver.
export function proximaGranada(estoque, atual) {
  const i = ORDEM_GRANADAS.indexOf(atual);
  for (let k = 1; k <= ORDEM_GRANADAS.length; k++) {
    const t = ORDEM_GRANADAS[(i + k + ORDEM_GRANADAS.length) % ORDEM_GRANADAS.length];
    if (estoque[t] > 0) return t;
  }
  return null;
}

// Estado da granada na mão: tipo escolhido (`sel`) e pino ({ esq, dir } enquanto segura, senão null).
export function criarMao() {
  return { ...criarArma('granada'), sel: null, pino: null };
}

// Um passo com a granada na mão: botão puxa o pino, soltar os dois arremessa.
// Esquerdo = longe, direito = curto, os dois juntos = médio.
export function atualizarMao(mundo, e, cmd, eventos) {
  const mao = e.armas.granada;
  if (!mao.pino) {
    if (!cmd.atirar && !cmd.zoom) return false;
    mao.pino = { esq: false, dir: false };
  }
  mao.pino.esq ||= !!cmd.atirar;
  mao.pino.dir ||= !!cmd.zoom;
  if (cmd.atirar || cmd.zoom) return false;
  const { esq, dir } = mao.pino;
  mao.pino = null;
  return lancar(mundo, e, mao.sel, eventos, null, esq && dir ? 'medio' : esq ? 'longe' : 'curto');
}

// Move um eixo por vez para saber em qual parede bateu e quicar (parede 55%, chão 40% com atrito).
// Devolve true se bateu de cima em algum piso (chão ou topo de caixa): é aí que a molotov acende.
function moverGranada(g, dt, caixas, eventos) {
  g.vel.y -= GRANADA.gravidade * dt;
  const r = GRANADA.raio;
  const tenta = (eixo) => {
    const alvo = g.pos[eixo] + g.vel[eixo] * dt;
    const d = { x: 0, y: 0, z: 0 };
    d[eixo] = g.vel[eixo] * dt;
    const res = moverComColisao({ x: g.pos.x, y: g.pos.y - r, z: g.pos.z }, d, r, 2 * r, caixas);
    const novo = eixo === 'y' ? res.pos.y + r : res.pos[eixo];
    const bateu = Math.abs(novo - alvo) > 1e-6;
    g.pos[eixo] = novo;
    return bateu;
  };
  const bx = tenta('x');
  const bz = tenta('z');
  const by = tenta('y');
  let quicou = false;
  let pousou = false;
  if (bx) { g.vel.x *= -0.55; quicou = true; }
  if (bz) { g.vel.z *= -0.55; quicou = true; }
  if (by) {
    if (g.vel.y < 0) {
      pousou = true;
      g.vel.y = Math.abs(g.vel.y) > 1.5 ? -g.vel.y * 0.4 : 0;
      g.vel.x *= 0.7;
      g.vel.z *= 0.7;
    } else {
      g.vel.y *= -0.3;
    }
    quicou = true;
  }
  if (quicou && Math.hypot(g.vel.x, g.vel.y, g.vel.z) > 1.5) {
    g.quiques += 1;
    eventos.push({ tipo: 'granada-quique', granada: g.tipo, ponto: { ...g.pos } });
  }
  return pousou;
}

// Linha de visão que também respeita a fumaça: usar no lugar de `temVisada` quando há `mundo`.
export function visadaLivre(mundo, a, b) {
  if (!temVisada(a, b, mundo.mapa.caixas)) return false;
  for (const f of mundo.fumacas ?? []) {
    if (!segmentoPerto(a, b, f.pos, f.raio + 0.7)) continue;
    for (const c of f.cubos) {
      if (c.vivo && mundo.tempo >= f.nasceEm + c.atraso && segmentoCortaCubo(a, b, c, f.cubo)) return false;
    }
  }
  return true;
}

// Distância do ponto `p` ao segmento ab menor que `r`?
function segmentoPerto(a, b, p, r) {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const abz = b.z - a.z;
  const len2 = abx * abx + aby * aby + abz * abz;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * abx + (p.y - a.y) * aby + (p.z - a.z) * abz) / len2));
  return Math.hypot(a.x + abx * t - p.x, a.y + aby * t - p.y, a.z + abz * t - p.z) <= r;
}

function segmentoCortaCubo(a, b, c, lado) {
  const h = lado / 2;
  let t0 = 0;
  let t1 = 1;
  for (const eixo of ['x', 'y', 'z']) {
    const d = b[eixo] - a[eixo];
    const min = c[eixo] - h;
    const max = c[eixo] + h;
    if (Math.abs(d) < 1e-9) {
      if (a[eixo] < min || a[eixo] > max) return false;
      continue;
    }
    let ta = (min - a[eixo]) / d;
    let tb = (max - a[eixo]) / d;
    if (ta > tb) [ta, tb] = [tb, ta];
    t0 = Math.max(t0, ta);
    t1 = Math.min(t1, tb);
    if (t0 > t1) return false;
  }
  return true;
}

// Nuvem de smoke: blocos numa esfera ao redor do ponto, nascendo do centro para fora (`atraso`).
// Blocos dentro de parede ou abaixo do chão não entram.
function criarFumaca(mundo, ponto) {
  const { raio, cubo } = GRANADA.fumaca;
  const centro = { x: ponto.x, y: Math.max(ponto.y, 0.4) + 0.9, z: ponto.z };
  const cubos = [];
  const n = Math.ceil(raio / cubo);
  for (let i = -n; i <= n; i++) {
    for (let j = -n; j <= n; j++) {
      for (let k = -n; k <= n; k++) {
        const p = { x: centro.x + i * cubo, y: centro.y + j * cubo, z: centro.z + k * cubo };
        const d = distancia(p, centro);
        if (d > raio || p.y < cubo / 2 - 0.2 || dentroDeCaixa(mundo.mapa.caixas, p)) continue;
        cubos.push({ ...p, vivo: true, voltaEm: 0, atraso: (d / raio) * GRANADA.fumaca.abrir });
      }
    }
  }
  return { pos: centro, raio, cubo, cubos, nasceEm: mundo.tempo, fim: mundo.tempo + GRANADA.fumaca.duracao, versao: 0 };
}

function dentroDeCaixa(caixas, p) {
  return caixas.some((c) => c.max.y > 0.01 && p.x > c.min.x && p.x < c.max.x && p.y > c.min.y && p.y < c.max.y &&
    p.z > c.min.z && p.z < c.max.z);
}

// Tiro (ou explosão) que atravessa a nuvem abre buracos: os blocos a menos de `r` do segmento somem por alguns segundos.
export function abrirBuracos(mundo, a, b, r = GRANADA.fumaca.raioTiro) {
  for (const f of mundo.fumacas ?? []) {
    if (!segmentoPerto(a, b, f.pos, f.raio + r)) continue;
    for (const c of f.cubos) {
      if (c.vivo && segmentoPerto(a, b, c, r)) {
        c.vivo = false;
        c.voltaEm = mundo.tempo + GRANADA.fumaca.buraco;
        f.versao += 1;
      }
    }
  }
}

// Cegueira de uma flash: some com a distância e com o ângulo (de costas quase não pega) e não passa por parede/smoke.
export function duracaoFlash(mundo, ponto, e) {
  const o = olho(e);
  const d = distancia(ponto, o);
  if (d > GRANADA.flash.alcance || !visadaLivre(mundo, ponto, o)) return 0;
  const dir = direcao(e.yaw, e.pitch);
  const para = { x: ponto.x - o.x, y: ponto.y - o.y, z: ponto.z - o.z };
  const cos = d < 1e-6 ? 1 : (dir.x * para.x + dir.y * para.y + dir.z * para.z) / d;
  const angulo = cos >= 0.7 ? 1 : cos >= -0.2 ? 0.35 + ((cos + 0.2) / 0.9) * 0.65 : 0.15;
  const perto = Math.max(0.25, 1 - d / GRANADA.flash.alcance);
  return GRANADA.flash.duracao * angulo * perto;
}

// Piso que apoia uma célula de fogo em `y`: o topo de alguma caixa (o chão também é uma caixa) sob (x, z).
const temPiso = (caixas, x, y, z) => caixas.some((c) => Math.abs(c.max.y - y) < 0.2 &&
  x >= c.min.x && x <= c.max.x && z >= c.min.z && z <= c.max.z);

// Poça de fogo: células numa grade ao redor de onde a molotov caiu. Só entram as que têm piso embaixo,
// não estão dentro de parede e têm visada do centro (o fogo não atravessa parede). `atraso`: espalha do centro.
function criarFogo(mundo, g, ponto) {
  const { raio, celula, duracao, espalhar } = GRANADA.fogo;
  const caixas = mundo.mapa.caixas;
  const centro = { x: ponto.x, y: ponto.y + 0.3, z: ponto.z };
  const celulas = [];
  const n = Math.ceil(raio / celula);
  for (let i = -n; i <= n; i++) {
    for (let k = -n; k <= n; k++) {
      const x = ponto.x + i * celula;
      const z = ponto.z + k * celula;
      const d = Math.hypot(x - ponto.x, z - ponto.z);
      const meio = { x, y: ponto.y + 0.3, z };
      const centroDaPoca = i === 0 && k === 0; // onde a garrafa quebrou sempre queima (a borda de caixa não a tira)
      if (!centroDaPoca && (d > raio || !temPiso(caixas, x, ponto.y, z) || dentroDeCaixa(caixas, meio))) continue;
      if (!centroDaPoca && !temVisada(centro, meio, caixas)) continue;
      celulas.push({ x, z, atraso: (d / raio) * espalhar });
    }
  }
  return {
    pos: { ...ponto }, y: ponto.y, raio, celula, celulas, dono: g.dono, time: g.time,
    nasceEm: mundo.tempo, fim: mundo.tempo + duracao, proxDano: mundo.tempo,
  };
}

// A smoke `f` cobre o ponto `p` do fogo? Mesma altura (não apaga andar de baixo) e sem parede no meio.
const fumacaCobre = (mundo, f, p) => Math.hypot(p.x - f.pos.x, p.z - f.pos.z) <= f.raio &&
  Math.abs(p.y + 0.4 - f.pos.y) <= f.raio && temVisada(f.pos, { x: p.x, y: p.y + 0.4, z: p.z }, mundo.mapa.caixas);
const naFumaca = (mundo, p) => (mundo.fumacas ?? []).some((f) => fumacaCobre(mundo, f, p));

// Molotov que bateu no piso: acende a poça (ou só chia, se caiu dentro de uma smoke).
function acender(mundo, g, eventos) {
  const ponto = { x: g.pos.x, y: g.pos.y - GRANADA.raio, z: g.pos.z };
  if (naFumaca(mundo, ponto)) {
    eventos.push({ tipo: 'fogo-apagado', ponto });
    return;
  }
  const f = criarFogo(mundo, g, ponto);
  if (!f.celulas.length) { // sem piso de verdade (quina de muro fino): estoura sem fogo e não toma a vaga de outra poça
    eventos.push({ tipo: 'molotov-ar', ponto });
    return;
  }
  const lista = (mundo.fogos ??= []);
  lista.push(f);
  while (lista.length > GRANADA.fogo.max) lista.shift();
  eventos.push({ tipo: 'fogo', ponto, fogo: f });
}

// Smoke nova sobre o fogo: as células dentro da nuvem apagam; poça sem célula some.
function apagarFogos(mundo, fumaca, eventos) {
  const fogos = mundo.fogos ?? [];
  for (let i = fogos.length - 1; i >= 0; i--) {
    const f = fogos[i];
    const antes = f.celulas.length;
    f.celulas = f.celulas.filter((c) => !fumacaCobre(mundo, fumaca, { x: c.x, y: f.y, z: c.z }));
    if (f.celulas.length === antes) continue;
    eventos.push({ tipo: 'fogo-apagado', ponto: { ...f.pos } });
    if (!f.celulas.length) fogos.splice(i, 1);
  }
}

// Poça de fogo que cobre `p` (os pés: quem só encosta a borda do corpo não queima), ou null.
// `margem` em metros para quem quer passar longe; `timeIgnorado`: o fogo do próprio time não queima, então os bots não fogem dele.
// Até 1,1 m acima do fogo ainda queima (o pulo não salva), mas o topo de uma caixa de 1,2 m não.
export function noFogo(mundo, p, margem = 0, timeIgnorado = null) {
  for (const f of mundo.fogos ?? []) {
    if (f.time === timeIgnorado || mundo.tempo >= f.fim) continue;
    if (p.y < f.y - 0.5 || p.y > f.y + 1.1) continue;
    if (Math.hypot(p.x - f.pos.x, p.z - f.pos.z) > f.raio + f.celula + margem) continue;
    const meio = f.celula / 2 + margem;
    const idade = mundo.tempo - f.nasceEm;
    if (f.celulas.some((c) => idade >= c.atraso && Math.abs(p.x - c.x) <= meio && Math.abs(p.z - c.z) <= meio)) return f;
  }
  return null;
}

// Fogo: pulsos de dano em quem pisa nas células acesas; acaba no fim da duração.
function atualizarFogos(mundo, eventos, danoDireto) {
  const fogos = mundo.fogos ?? [];
  const { dps, tick } = GRANADA.fogo;
  for (let i = fogos.length - 1; i >= 0; i--) {
    const f = fogos[i];
    if (mundo.tempo >= f.fim) {
      fogos.splice(i, 1);
      eventos.push({ tipo: 'fogo-fim', ponto: { ...f.pos } });
      continue;
    }
    if (mundo.tempo < f.proxDano) continue;
    f.proxDano += tick;
    const dono = mundo.entidades[f.dono];
    for (const e of mundo.entidades) {
      if (!e.vivo || e.hp <= 0 || e.time === f.time) continue; // fogo amigo desligado, como na HE
      if (noFogo(mundo, e.pos)) danoDireto(dono, e, Math.round(dps * tick), 'molotov', eventos);
    }
  }
}

function detonar(mundo, g, eventos, danoDireto) {
  const ponto = { ...g.pos };
  if (g.tipo === 'molotov') {
    eventos.push({ tipo: 'molotov-ar', ponto }); // fusível acabou ainda no ar: estoura sem fogo
  } else if (g.tipo === 'smoke') {
    const f = criarFumaca(mundo, ponto);
    const lista = (mundo.fumacas ??= []);
    lista.push(f);
    while (lista.length > GRANADA.fumaca.max) lista.shift();
    eventos.push({ tipo: 'fumaca', ponto, fumaca: f });
    apagarFogos(mundo, f, eventos);
  } else if (g.tipo === 'flash') {
    eventos.push({ tipo: 'flash', ponto });
    for (const e of mundo.entidades) {
      if (!e.vivo) continue;
      const dur = duracaoFlash(mundo, { x: ponto.x, y: ponto.y + 0.1, z: ponto.z }, e);
      if (dur <= 0.05) continue;
      e.cegoAte = Math.max(e.cegoAte ?? 0, mundo.tempo + dur);
      e.cegoDur = dur;
      eventos.push({ tipo: 'cegueira', id: e.id, dur, atirador: g.dono });
    }
  } else {
    eventos.push({ tipo: 'explosao-he', ponto });
    const dono = mundo.entidades[g.dono];
    const { raio, dano } = GRANADA.he;
    const centro = { x: ponto.x, y: ponto.y + 0.3, z: ponto.z };
    for (const e of mundo.entidades) {
      if (!e.vivo || e.hp <= 0 || e.time === g.time) continue; // fogo amigo desligado, como nos tiros
      const peito = { x: e.pos.x, y: e.pos.y + 0.9, z: e.pos.z };
      const d = distancia(centro, peito);
      if (d > raio || !visadaLivre(mundo, centro, peito)) continue;
      danoDireto(dono, e, Math.max(1, Math.round(dano * (1 - d / raio))), 'he', eventos);
    }
    const hb = GRANADA.fumaca.raioHE;
    abrirBuracos(mundo, centro, centro, hb); // a explosão também abre um buraco esférico na fumaça
  }
}

// Um passo: granadas no ar (voo, quique, fusível), nuvens (blocos que voltam, fim), fogo e cegueira que acaba.
// `danoDireto(dono, alvo, dano, tipoArma, eventos)` aplica o dano da HE e do fogo (mundo.js usa o mesmo cálculo dos tiros).
export function atualizarGranadas(mundo, dt, eventos, danoDireto) {
  const ativas = mundo.granadas ?? [];
  for (let i = ativas.length - 1; i >= 0; i--) {
    const g = ativas[i];
    const pousou = moverGranada(g, dt, mundo.mapa.caixas, eventos);
    if (g.tipo === 'molotov' && pousou) {
      ativas.splice(i, 1);
      acender(mundo, g, eventos);
    } else if (mundo.tempo - g.nasceEm >= g.fusivel) {
      ativas.splice(i, 1);
      detonar(mundo, g, eventos, danoDireto);
    }
  }
  const nuvens = mundo.fumacas ?? [];
  for (let i = nuvens.length - 1; i >= 0; i--) {
    const f = nuvens[i];
    if (mundo.tempo >= f.fim) {
      nuvens.splice(i, 1);
      eventos.push({ tipo: 'fumaca-fim', fumaca: f });
      continue;
    }
    for (const c of f.cubos) {
      if (!c.vivo && mundo.tempo >= c.voltaEm) { c.vivo = true; f.versao += 1; }
    }
  }
  atualizarFogos(mundo, eventos, danoDireto);
}

// Fim do round / novo round: nada no ar, nenhuma nuvem nem fogo; ninguém cego.
export function limparGranadas(mundo) {
  mundo.granadas = [];
  mundo.fumacas = [];
  mundo.fogos = [];
  for (const e of mundo.entidades) {
    e.cegoAte = 0;
    e.cegoDur = 0;
  }
}
