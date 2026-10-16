/**
 * Block Strike — estado do mundo e movimento das entidades.
 * Módulo puro: sem Three.js e sem DOM. Unidades em metros e segundos.
 */

import { JOGADOR, NOMES_BOTS } from './config.js';
import { moverComColisao, direcao } from './fisica.js';

const PITCH_MAX = 1.5;
const DIST_PASSO = 0.4;
const ID_JOGADOR = 0;

function criarEntidade(id, nome, time, bot, primariaEscolhida) {
  return {
    id, nome, time, bot,
    pos: { x: 0, y: 0, z: 0 }, velY: 0, yaw: 0, pitch: 0,
    agachado: false, noChao: false, hp: JOGADOR.hp, vivo: true,
    slot: 'primaria', armas: null, primariaEscolhida,
    kills: 0, mortes: 0, killsCabeca: 0,
    distAndada: 0, passoAcc: 0,
  };
}

export function criarMundo({ mapa, primariaJogador, dificuldade, rng }) {
  const entidades = [criarEntidade(ID_JOGADOR, 'Você', 'azul', false, primariaJogador)];
  for (let i = 1; i < 10; i++) {
    const time = i < 5 ? 'azul' : 'laranja';
    entidades.push(criarEntidade(i, `Bot ${NOMES_BOTS[i - 1]}`, time, true, 'rifle'));
  }
  return { mapa, entidades, jogadorId: ID_JOGADOR, tempo: 0, dificuldade, rng };
}

export function posicionarParaRound(mundo, ladoAzul) {
  const ladoLaranja = ladoAzul === 'A' ? 'B' : 'A';
  mundo.entidades.forEach((e, i) => {
    const lado = e.time === 'azul' ? ladoAzul : ladoLaranja;
    const idx = e.time === 'azul' ? i : i - 5;
    e.pos = { ...mundo.mapa.spawns[lado][idx] };
    e.yaw = mundo.mapa.yawSpawn[lado];
    e.pitch = 0;
    e.velY = 0;
    e.agachado = false;
    e.noChao = false;
    e.hp = JOGADOR.hp;
    e.vivo = true;
    e.slot = 'primaria';
    e.passoAcc = 0;
  });
}

const idle = (e) => ({
  frente: 0, lado: 0, pular: false, agachar: false, devagar: false, atirar: false,
  zoom: false, recarregar: false, slot: null, yaw: e.yaw, pitch: e.pitch,
});

// Só levanta se o corpo em pé couber (sem teto em cima).
function podeLevantar(e, caixas) {
  const r = moverComColisao(e.pos, { x: 0, y: 0.001, z: 0 }, JOGADOR.raio, JOGADOR.altura, caixas);
  return !r.bateuTeto;
}

function moverEntidade(e, cmd, dt, caixas, congelado, eventos) {
  e.yaw = cmd.yaw;
  e.pitch = Math.max(-PITCH_MAX, Math.min(PITCH_MAX, cmd.pitch));

  if (cmd.agachar) e.agachado = true;
  else if (e.agachado && podeLevantar(e, caixas)) e.agachado = false;

  let vx = 0;
  let vz = 0;
  const correndo = !e.agachado && !cmd.devagar;
  if (!congelado) {
    const f = direcao(e.yaw, 0);
    const dx = f.x * cmd.frente + -f.z * cmd.lado;
    const dz = f.z * cmd.frente + f.x * cmd.lado;
    const norma = Math.hypot(dx, dz);
    if (norma > 0) {
      const vel = e.agachado ? JOGADOR.velAgachado : cmd.devagar ? JOGADOR.velDevagar : JOGADOR.velCorrer;
      vx = (dx / norma) * vel;
      vz = (dz / norma) * vel;
    }
  }

  if (cmd.pular && e.noChao && !congelado) e.velY = JOGADOR.pulo;
  e.velY -= JOGADOR.gravidade * dt;

  const altura = e.agachado ? JOGADOR.alturaAgachado : JOGADOR.altura;
  const antes = e.pos;
  const r = moverComColisao(e.pos, { x: vx * dt, y: e.velY * dt, z: vz * dt }, JOGADOR.raio, altura, caixas);
  e.pos = r.pos;
  e.noChao = r.noChao;
  if (r.noChao && e.velY < 0) e.velY = 0;
  if (r.bateuTeto && e.velY > 0) e.velY = 0;

  const andou = Math.hypot(e.pos.x - antes.x, e.pos.z - antes.z);
  e.distAndada += andou;
  if (correndo && e.noChao) {
    e.passoAcc += andou;
    while (e.passoAcc >= DIST_PASSO) {
      e.passoAcc -= DIST_PASSO;
      eventos.push({ tipo: 'passo', id: e.id });
    }
  } else {
    e.passoAcc = 0;
  }
}

export function passo(mundo, dt, comandos, { congelado = false } = {}) {
  const eventos = [];
  for (const e of mundo.entidades) {
    if (!e.vivo) continue;
    const cmd = comandos.get(e.id) ?? idle(e);
    moverEntidade(e, cmd, dt, mundo.mapa.caixas, congelado, eventos);
  }
  mundo.tempo += dt;
  return eventos;
}

export function vivosPorTime(mundo) {
  const r = { azul: { n: 0, hp: 0 }, laranja: { n: 0, hp: 0 } };
  for (const e of mundo.entidades) {
    if (!e.vivo) continue;
    r[e.time].n += 1;
    r[e.time].hp += e.hp;
  }
  return r;
}
