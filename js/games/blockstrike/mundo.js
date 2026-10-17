/**
 * Block Strike — estado do mundo e movimento das entidades.
 * Módulo puro: sem Three.js e sem DOM. Unidades em metros e segundos.
 */

import { JOGADOR, NOMES_BOTS, ARMAS } from './config.js';
import { moverComColisao, direcao, olho, hitboxes, raycastCaixas, raycastEntidades } from './fisica.js';
import {
  criarArma, podeAtirar, disparar, atualizarArma, iniciarRecarga, danoDe, velocidadeDe, SAQUE,
} from './armas.js';
import { escolherPrimaria } from './bots.js';

const PITCH_MAX = 1.5;
const DIST_PASSO = 1.8;
const ID_JOGADOR = 0;
const ALCANCE_TIRO = 200;
const ALCANCE_RASTRO = 80; // tiro que não bate em nada: o rastro visual para aqui
const QUEDA_POUSO = 4; // m/s de queda a partir dos quais o pouso faz barulho
const COSTAS = -0.5; // cosseno: atacante atrás do alvo (faca pelas costas)
const VIDA_RUIDO = 2; // s que um ruído de passo continua audível para os bots

function criarEntidade(id, nome, time, bot, primariaEscolhida) {
  return {
    id, nome, time, bot,
    pos: { x: 0, y: 0, z: 0 }, velY: 0, yaw: 0, pitch: 0,
    agachado: false, noChao: false, hp: JOGADOR.hp, vivo: true,
    slot: 'primaria', armas: null, primariaEscolhida,
    kills: 0, mortes: 0, killsCabeca: 0,
    distAndada: 0, passoAcc: 0, velHoriz: 0,
  };
}

// modo 'treino': só o jogador no mapa, munição de reserva infinita e sem rounds.
export function criarMundo({ mapa, primariaJogador, dificuldade, rng, modo = 'partida' }) {
  const entidades = [criarEntidade(ID_JOGADOR, 'Você', 'azul', false, primariaJogador)];
  // Índice entre os bots do time: o 0 (sniper) é o primeiro bot, já que o jogador fica com a dele.
  for (let i = 1; i < (modo === 'treino' ? 1 : 10); i++) {
    const time = i < 5 ? 'azul' : 'laranja';
    const indice = i < 5 ? i - 1 : i - 5;
    entidades.push(criarEntidade(i, `Bot ${NOMES_BOTS[i - 1]}`, time, true, escolherPrimaria(indice, rng)));
  }
  return { mapa, entidades, jogadorId: ID_JOGADOR, tempo: 0, dificuldade, rng, modo, ruidos: [] };
}

// Passos e pousos viram ruído que os bots do outro time ouvem (ver `ouvir` em bots.js).
// Quem anda com Shift ou agachado não emite 'passo', então não deixa rastro aqui.
function registrarRuidos(mundo, eventos) {
  for (const ev of eventos) {
    if (ev.tipo !== 'passo' && ev.tipo !== 'pouso') continue;
    const e = mundo.entidades[ev.id];
    mundo.ruidos.push({ id: e.id, time: e.time, x: e.pos.x, z: e.pos.z, em: mundo.tempo });
  }
  const limite = mundo.tempo - VIDA_RUIDO;
  while (mundo.ruidos.length && mundo.ruidos[0].em < limite) mundo.ruidos.shift();
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
    e.slotAnterior = 'pistola';
    e.passoAcc = 0;
    e.velHoriz = 0;
    e.armas = {
      primaria: criarArma(e.primariaEscolhida),
      pistola: criarArma('pistola'),
      faca: criarArma('faca'),
    };
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
  const tipo = e.armas?.[e.slot]?.tipo;
  if (!congelado) {
    const f = direcao(e.yaw, 0);
    const dx = f.x * cmd.frente + -f.z * cmd.lado;
    const dz = f.z * cmd.frente + f.x * cmd.lado;
    const norma = Math.hypot(dx, dz);
    if (norma > 0) {
      const vel = velocidadeDe(tipo, { agachado: e.agachado, devagar: cmd.devagar, zoom: cmd.zoom });
      vx = (dx / norma) * vel;
      vz = (dz / norma) * vel;
    }
  }

  if (cmd.pular && e.noChao && !congelado) {
    e.velY = JOGADOR.pulo;
    eventos.push({ tipo: 'pulo', id: e.id });
  }
  e.velY -= JOGADOR.gravidade * dt;
  const queda = -e.velY;

  const altura = e.agachado ? JOGADOR.alturaAgachado : JOGADOR.altura;
  const antes = e.pos;
  const r = moverComColisao(e.pos, { x: vx * dt, y: e.velY * dt, z: vz * dt }, JOGADOR.raio, altura, caixas);
  e.pos = r.pos;
  if (r.noChao && !e.noChao && queda > QUEDA_POUSO) eventos.push({ tipo: 'pouso', id: e.id });
  e.noChao = r.noChao;
  if (r.noChao && e.velY < 0) e.velY = 0;
  if (r.bateuTeto && e.velY > 0) e.velY = 0;

  const andou = Math.hypot(e.pos.x - antes.x, e.pos.z - antes.z);
  e.distAndada += andou;
  e.velHoriz = dt > 0 ? andou / dt : 0;
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

// A faca com o olho dentro da hitbox do alvo: o raycast ignora origem interna, então testa à parte.
function alvoColado(o, entidades, ignorarId) {
  for (const ent of entidades) {
    if (!ent.vivo || ent.id === ignorarId) continue;
    for (const hb of hitboxes(ent)) {
      const dentro = o.x >= hb.min.x && o.x <= hb.max.x && o.y >= hb.min.y && o.y <= hb.max.y &&
        o.z >= hb.min.z && o.z <= hb.max.z;
      if (dentro) return { ent, parte: hb.parte, dist: 0, ponto: { ...o } };
    }
  }
  return null;
}

// `danoFixo`: a faca tira o mesmo em qualquer parte do corpo (só as costas mudam o valor).
function aplicarDano(atirador, tipo, golpe, eventos, danoFixo) {
  const alvo = golpe.ent;
  if (alvo.time === atirador.time) return; // fogo amigo desligado (mas o corpo bloqueia o tiro)
  if (alvo.hp <= 0) return; // morte já registrada neste passo, só falta o `vivo` cair
  const dano = danoFixo ?? danoDe(tipo, golpe.parte);
  alvo.hp = Math.max(0, alvo.hp - dano);
  eventos.push({ tipo: 'acerto', atirador: atirador.id, alvo: alvo.id, parte: golpe.parte, dano, ponto: golpe.ponto });
  if (alvo.bot && alvo.cerebro) alvo.cerebro.ultimoDanoDe = atirador.id;
  if (alvo.hp > 0) return;
  // `vivo` só cai no fim do passo (ver `passo`): quem ainda não agiu neste passo revida.
  atirador.kills += 1;
  alvo.mortes += 1;
  const cabeca = golpe.parte === 'cabeca';
  if (cabeca) atirador.killsCabeca += 1;
  eventos.push({ tipo: 'morte', vitima: alvo.id, assassino: atirador.id, arma: tipo, cabeca });
}

// Um raio (bala ou chumbo): para no primeiro entre caixa e entidade.
function atirarRaio(mundo, e, tipo, desvio, eventos) {
  const o = olho(e);
  const dir = direcao(e.yaw + desvio.dx, e.pitch + desvio.dy);
  const parede = raycastCaixas(o, dir, mundo.mapa.caixas, ALCANCE_TIRO);
  const golpe = raycastEntidades(o, dir, mundo.entidades, ALCANCE_TIRO, e.id);
  let ate;
  if (golpe && (!parede || golpe.dist <= parede.dist)) {
    aplicarDano(e, tipo, golpe, eventos);
    ate = golpe.ponto;
  } else if (parede) {
    eventos.push({ tipo: 'impacto', ponto: parede.ponto, normal: parede.normal });
    ate = parede.ponto;
  } else {
    ate = { x: o.x + dir.x * ALCANCE_RASTRO, y: o.y + dir.y * ALCANCE_RASTRO, z: o.z + dir.z * ALCANCE_RASTRO };
  }
  eventos.push({ tipo: 'raio', atirador: e.id, de: o, ate });
}

// Atacante atrás do alvo: o alvo olha para o lado oposto de quem ataca.
function pelasCostas(atacante, alvo) {
  const f = direcao(alvo.yaw, 0);
  const vx = atacante.pos.x - alvo.pos.x;
  const vz = atacante.pos.z - alvo.pos.z;
  const n = Math.hypot(vx, vz);
  return n > 1e-6 && (vx * f.x + vz * f.z) / n < COSTAS;
}

// Faca: botão esquerdo = golpe leve, direito = estocada. Corpo a corpo, sem tiro nem rastro.
function golpearFaca(mundo, e, cmd, arma, eventos) {
  if (!(cmd.atirar || cmd.zoom) || mundo.tempo < arma.prontaEm) return;
  const forte = !cmd.atirar;
  const g = ARMAS.faca.golpes[forte ? 'forte' : 'leve'];
  arma.prontaEm = mundo.tempo + g.intervalo;
  const o = olho(e);
  const dir = direcao(e.yaw, e.pitch);
  const parede = raycastCaixas(o, dir, mundo.mapa.caixas, g.alcance);
  const alvo = alvoColado(o, mundo.entidades, e.id) ?? raycastEntidades(o, dir, mundo.entidades, g.alcance, e.id);
  const noCorpo = alvo && (!parede || alvo.dist <= parede.dist);
  const costas = Boolean(noCorpo && pelasCostas(e, alvo.ent));
  eventos.push({ tipo: 'golpe', atirador: e.id, forte, acerto: noCorpo ? 'corpo' : parede ? 'parede' : null, costas });
  if (noCorpo) aplicarDano(e, 'faca', alvo, eventos, costas ? g.costas : g.dano);
}

const ORDEM_SLOTS = ['primaria', 'pistola', 'faca'];

// `slot` do comando: um slot, 'anterior' (Q, a última arma) ou 'roda+'/'roda-' (roda do mouse).
function slotPedido(e, slot) {
  if (slot === 'anterior') return e.slotAnterior;
  if (slot === 'roda+' || slot === 'roda-') {
    const i = ORDEM_SLOTS.indexOf(e.slot);
    return ORDEM_SLOTS[(i + (slot === 'roda+' ? 1 : ORDEM_SLOTS.length - 1)) % ORDEM_SLOTS.length];
  }
  return slot;
}

function combate(mundo, e, cmd, dt, eventos) {
  if (!e.armas) return;
  const pedido = slotPedido(e, cmd.slot);
  if (pedido && pedido !== e.slot && e.armas[pedido]) {
    e.armas[e.slot].recarregandoAte = 0; // trocar de arma cancela a recarga
    e.armas[e.slot].recuoAcum = 0; // e só a arma em mãos perde o recuo: sem isso a mira pularia ao voltar
    e.slotAnterior = e.slot;
    e.slot = pedido;
    const nova = e.armas[e.slot];
    nova.prontaEm = Math.max(nova.prontaEm, mundo.tempo + SAQUE[e.slot]); // sacar leva um instante
    eventos.push({ tipo: 'saque', id: e.id, arma: nova.tipo });
  }
  const arma = e.armas[e.slot];
  const agora = mundo.tempo;
  if (mundo.modo === 'treino') arma.reserva = ARMAS[arma.tipo].reserva; // treino: reserva nunca acaba
  if (arma.tipo === 'faca') {
    golpearFaca(mundo, e, cmd, arma, eventos);
    atualizarArma(arma, agora, dt, cmd.atirar);
    return;
  }
  if (cmd.recarregar && iniciarRecarga(arma, agora)) eventos.push({ tipo: 'recarga', atirador: e.id });
  if (podeAtirar(arma, agora, cmd.atirar)) {
    const estado = {
      velHoriz: e.velHoriz, velMax: velocidadeDe(arma.tipo), noChao: e.noChao, agachado: e.agachado, zoom: cmd.zoom,
    };
    const desvios = disparar(arma, agora, estado, mundo.rng);
    eventos.push({ tipo: 'tiro', atirador: e.id, arma: arma.tipo });
    for (const d of desvios) atirarRaio(mundo, e, arma.tipo, d, eventos);
  }
  const antes = arma.recarregandoAte;
  atualizarArma(arma, agora, dt, cmd.atirar);
  if (antes === 0 && arma.recarregandoAte > 0) eventos.push({ tipo: 'recarga', atirador: e.id }); // pente vazio
}

export function passo(mundo, dt, comandos, { congelado = false } = {}) {
  const eventos = [];
  for (const e of mundo.entidades) {
    if (!e.vivo) continue;
    const cmd = comandos.get(e.id) ?? idle(e);
    moverEntidade(e, cmd, dt, mundo.mapa.caixas, congelado, eventos);
    if (!congelado) combate(mundo, e, cmd, dt, eventos);
  }
  // Trocas no mesmo passo valem para os dois lados: as mortes só têm efeito depois de todos agirem.
  for (const e of mundo.entidades) if (e.vivo && e.hp <= 0) e.vivo = false;
  mundo.tempo += dt;
  registrarRuidos(mundo, eventos);
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
