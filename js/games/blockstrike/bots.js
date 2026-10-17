/**
 * Block Strike — cérebro dos bots: rota, combate, cobertura, recuo e dificuldade.
 * Módulo puro: sem Three.js e sem DOM. Unidades em metros e segundos; ângulos em radianos.
 * `pensar` devolve o mesmo Comando que a entrada do jogador (yaw/pitch absolutos).
 */

import { ARMAS, DIFICULDADE, RECUO_MAX } from './config.js';
import { olho, direcao, temVisada } from './fisica.js';
import { caminho, maisProximo, coberturaPerto } from './navegacao.js';

const ALCANCE_VISAO = 60;
const MEIO_CONE = (110 / 2) * (Math.PI / 180);
const VISAO_360 = 3;
const GIRO_MAX = 8; // rad/s
const PERDER_ALVO = 1; // s sem visada até voltar para a rota
const CHEGOU = 0.8; // m até o waypoint contar como alcançado
const MIRA_OK = 0.12; // rad: só atira com a mira perto do ponto desejado
const STRAFE_TROCA = 0.6;
const HP_RECUO = 30;
const TROCA_ERRO = 0.15; // s entre sorteios do erro de mira
const ERRO_PITCH = 0.2; // erro vertical = esta fração do horizontal (senão a mira no tronco vira cabeçada)
const PRESO_TEMPO = 1;
const ESPERA_COBERTURA = [1.5, 3];
const ESPERA_RECUO = 5;
const LIMITE_ROTA = 20; // |x| que separa corredor, meio e túnel
const REFAZER_ROTA = 2; // s entre recálculos da rota até o alvo
// Distância (m) até onde o bot avança no alvo, nas pausas entre os tiros.
const ALCANCE_IDEAL = { sniper: 60, rifle: 20, smg: 12, escopeta: 7, pistola: 15 };

const ALCANCE_OUVIDO = 15; // m: passo de inimigo até aqui chama a atenção do bot
const OLHAR_RUIDO = 1; // s olhando para onde veio o barulho

const PESOS = [['rifle', 0.55], ['smg', 0.25], ['escopeta', 0.2]];

export function escolherPrimaria(indiceNoTime, rng) {
  if (indiceNoTime === 0) return 'sniper';
  let r = rng();
  for (const [tipo, peso] of PESOS) {
    if (r < peso) return tipo;
    r -= peso;
  }
  return 'rifle';
}

const sortear = (rng, [a, b]) => a + rng() * (b - a);
const angulo = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const distXZ = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

function gauss(rng) {
  const u = Math.max(rng(), 1e-12);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng());
}

// Yaw que olha de `de` para `para` (yaw 0 olha para -z).
const yawPara = (de, para) => Math.atan2(-(para.x - de.x), -(para.z - de.z));

function waypointPerto(grafo, pos, caixas) {
  return maisProximo(grafo, pos, caixas) ?? maisProximo(grafo, pos, caixas, { exigirVisada: false });
}

function rotaAte(ent, grafo, caixas, destinoId) {
  const de = waypointPerto(grafo, ent.pos, caixas);
  if (de === null || destinoId === null) return [];
  return caminho(grafo, de, destinoId);
}

// Faixa da rota pelo índice no time: corredor (x<-20), meio ou túnel (x>20).
function faixa(w) {
  if (w.x < -LIMITE_ROTA) return 0;
  if (w.x > LIMITE_ROTA) return 2;
  return 1;
}

// Waypoint sorteado na metade inimiga, preferindo a faixa pedida.
function objetivo(ent, grafo, rng, faixaPedida = null) {
  const meuLado = Math.sign(ent.pos.z) || 1;
  const inimigos = grafo.nos.filter((w) => Math.sign(w.z) === -meuLado);
  const naFaixa = faixaPedida === null ? inimigos : inimigos.filter((w) => faixa(w) === faixaPedida);
  const opcoes = naFaixa.length ? naFaixa : inimigos.length ? inimigos : grafo.nos;
  if (!opcoes.length) return null;
  return opcoes[Math.floor(rng() * opcoes.length)].id;
}

export function criarCerebro(ent, grafo, rng, caixas = []) {
  const indice = ent.id % 5;
  const ordem = [1, 2, 0]; // meio, túnel, corredor
  const destino = objetivo(ent, grafo, rng, ordem[indice % 3]);
  return {
    estado: 'rota', rota: rotaAte(ent, grafo, caixas, destino), alvoId: null, vistoHa: 0,
    rajada: 0, pausaAte: 0, ultimoDanoDe: null,
    passoRota: 0, ultimaPos: null, perdidoHa: 0, esperaAte: 0, chegou: false,
    erro: { yaw: 0, pitch: 0 }, erroAte: 0, cabeca: false, municaoVista: null,
    gatilho: false, emRajada: false, preso: 0, queriaAndar: false,
    ouvidoEm: -Infinity, ouvidoAte: 0, ouvidoPos: null,
  };
}

// Centro da cabeça e do tronco (escalados se agachado), como nas hitboxes.
// `alturaTronco`: o bot fácil mira mais baixo, e o spray sobe menos até a cabeça.
function pontosDoCorpo(alvo, alturaTronco = 1.1) {
  const k = alvo.agachado ? 1.2 / 1.8 : 1;
  const { x, y, z } = alvo.pos;
  return { cabeca: { x, y: y + 1.6 * k, z }, tronco: { x, y: y + alturaTronco * k, z } };
}

// Inimigos visíveis do olho do bot, do mais perto ao mais longe.
function enxergar(ent, mundo) {
  const o = olho(ent);
  const caixas = mundo.mapa.caixas;
  const vistos = [];
  for (const outro of mundo.entidades) {
    if (!outro.vivo || outro.time === ent.time) continue;
    const d = distXZ(o, outro.pos);
    if (d > ALCANCE_VISAO) continue;
    if (d > VISAO_360 && Math.abs(angulo(yawPara(o, outro.pos) - ent.yaw)) > MEIO_CONE) continue;
    const p = pontosDoCorpo(outro);
    if (!temVisada(o, p.cabeca, caixas) && !temVisada(o, p.tronco, caixas)) continue;
    vistos.push({ ent: outro, d });
  }
  vistos.sort((a, b) => a.d - b.d);
  return vistos;
}

// Ruído de inimigo mais recente ao alcance do ouvido que o bot ainda não tratou; null se não houver.
export function ouvir(ent, mundo, c) {
  let melhor = null;
  for (const r of mundo.ruidos ?? []) {
    if (r.time === ent.time || r.em <= c.ouvidoEm) continue;
    if (distXZ(ent.pos, r) > ALCANCE_OUVIDO) continue;
    if (melhor === null || r.em > melhor.em) melhor = r;
  }
  return melhor;
}

// Gira no máximo GIRO_MAX*dt em direção ao ângulo desejado.
function girar(atual, desejado, dt) {
  const delta = angulo(desejado - atual);
  const max = GIRO_MAX * dt;
  return atual + Math.max(-max, Math.min(max, delta));
}

const comandoBase = (ent) => ({
  frente: 0, lado: 0, pular: false, agachar: false, devagar: false, atirar: false,
  zoom: false, recarregar: false, slot: null, yaw: ent.yaw, pitch: ent.pitch,
});

// Mira (com erro humano e giro limitado) e decide o gatilho. Mexe só em yaw/pitch/atirar/zoom/lado.
function atacar(ent, c, alvo, mundo, dif, dt, rng, cmd, { strafe }) {
  const agora = mundo.tempo;
  const arma = ent.armas[ent.slot];
  const def = ARMAS[arma.tipo];
  if (agora >= c.erroAte) {
    c.erro = { yaw: gauss(rng) * dif.erroMira, pitch: gauss(rng) * dif.erroMira * ERRO_PITCH };
    c.erroAte = agora + TROCA_ERRO;
  }
  const o = olho(ent);
  const p = pontosDoCorpo(alvo, dif.alturaTronco);
  // Parte escolhida escondida (atrás de caixa baixa, por exemplo) → mira na outra.
  let ponto = c.cabeca ? p.cabeca : p.tronco;
  if (!temVisada(o, ponto, mundo.mapa.caixas)) ponto = c.cabeca ? p.tronco : p.cabeca;
  const yawAlvo = yawPara(o, ponto) + c.erro.yaw;
  // `disparar` soma o recuo antes de aplicar: compensa o valor que o próximo tiro vai usar.
  const compensa = Math.min(arma.recuoAcum + def.recuo, RECUO_MAX);
  const pitchAlvo = Math.atan2(ponto.y - o.y, distXZ(o, ponto)) + c.erro.pitch - compensa;
  cmd.yaw = girar(ent.yaw, yawAlvo, dt);
  cmd.pitch = ent.pitch + Math.max(-GIRO_MAX * dt, Math.min(GIRO_MAX * dt, pitchAlvo - ent.pitch));
  cmd.zoom = arma.tipo === 'sniper';

  // Tiros que saíram desde o último pensar (a munição caiu) contam na rajada.
  if (c.municaoVista && c.municaoVista.slot === ent.slot && arma.municao < c.municaoVista.n) {
    c.rajada -= c.municaoVista.n - arma.municao;
    if (!def.auto) c.cabeca = rng() < dif.chanceCabeca;
  }
  c.municaoVista = { slot: ent.slot, n: arma.municao };

  const mirando = Math.abs(angulo(yawAlvo - cmd.yaw)) < MIRA_OK;
  const pronto = c.vistoHa >= dif.reacao && mirando && arma.recarregandoAte === 0 && arma.municao > 0;
  if (def.auto) {
    if (c.rajada <= 0 && c.emRajada) {
      c.emRajada = false;
      c.pausaAte = agora + sortear(rng, [0.25, 0.4]);
      c.cabeca = rng() < dif.chanceCabeca;
    }
    if (!c.emRajada && agora >= c.pausaAte && pronto) {
      c.emRajada = true;
      c.rajada = 3 + Math.floor(rng() * 3);
    }
    cmd.atirar = c.emRajada && pronto;
    c.disparando = c.emRajada && c.vistoHa >= dif.reacao;
  } else {
    cmd.atirar = pronto && !c.gatilho && agora >= arma.prontaEm;
    c.disparando = c.vistoHa >= dif.reacao && agora >= arma.prontaEm - 0.15;
  }
  c.gatilho = cmd.atirar;
  if (strafe && (arma.tipo === 'smg' || arma.tipo === 'escopeta')) {
    cmd.lado = Math.floor(agora / STRAFE_TROCA) % 2 ? 1 : -1;
  }
}

// Anda pela rota: devolve o próximo waypoint (e vira para ele) ou null se acabou.
function seguirRota(ent, c, grafo, dt, cmd) {
  while (c.passoRota < c.rota.length && distXZ(ent.pos, grafo.nos[c.rota[c.passoRota]]) < CHEGOU) {
    c.passoRota += 1;
  }
  if (c.passoRota >= c.rota.length) {
    c.preso = 0;
    return null;
  }
  // Desencalha: quase parado por ~1 s tentando andar a rota → pula e passa para o waypoint seguinte.
  // Quadro em que o bot não tentava andar (parado de propósito) não conta.
  c.preso = c.queriaAndar && ent.velHoriz < 1 ? c.preso + dt : 0;
  if (c.preso > PRESO_TEMPO) {
    c.preso = 0;
    cmd.pular = true;
    if (c.passoRota < c.rota.length - 1) c.passoRota += 1;
  }
  const w = grafo.nos[c.rota[c.passoRota]];
  cmd.yaw = girar(ent.yaw, yawPara(ent.pos, w), dt);
  cmd.pitch = ent.pitch + Math.max(-GIRO_MAX * dt, Math.min(GIRO_MAX * dt, -ent.pitch));
  return w;
}

// Calcula frente/lado a partir do yaw que vai valer neste passo.
function andarPara(pos, yaw, alvo) {
  const dx = alvo.x - pos.x;
  const dz = alvo.z - pos.z;
  const n = Math.hypot(dx, dz);
  if (n < 1e-6) return { frente: 0, lado: 0 };
  const f = direcao(yaw, 0);
  return { frente: (dx * f.x + dz * f.z) / n, lado: (dx * -f.z + dz * f.x) / n };
}

// Longe demais para a arma e fora da rajada: anda pela rota até o alvo, sem tirar a mira dele.
function avancar(ent, c, alvo, grafo, caixas, agora, dt, cmd) {
  const tipo = ent.armas[ent.slot].tipo;
  if (c.disparando || distXZ(ent.pos, alvo.pos) <= ALCANCE_IDEAL[tipo]) return null;
  if (agora >= (c.refazerEm ?? 0)) {
    const perto = waypointPerto(grafo, alvo.pos, caixas);
    c.rota = perto === null ? [] : rotaAte(ent, grafo, caixas, perto);
    c.passoRota = 0;
    c.refazerEm = agora + REFAZER_ROTA;
  }
  const { yaw, pitch } = cmd;
  const destino = seguirRota(ent, c, grafo, dt, cmd);
  cmd.yaw = yaw;
  cmd.pitch = pitch;
  return destino;
}

function irParaCobertura(ent, c, grafo, caixas, ameacaPos, estado) {
  const id = coberturaPerto(grafo, ent.pos, ameacaPos, caixas);
  if (id === null) return false;
  const rota = rotaAte(ent, grafo, caixas, id);
  if (!rota.length) return false;
  Object.assign(c, { estado, rota, passoRota: 0, chegou: false, preso: 0 });
  return true;
}

function voltarParaRota(ent, c, grafo, caixas, destinoId) {
  Object.assign(c, {
    estado: 'rota', rota: rotaAte(ent, grafo, caixas, destinoId), passoRota: 0,
    alvoId: null, vistoHa: 0, chegou: false, preso: 0, emRajada: false,
  });
}

function recarregarSePreciso(ent, cmd, temAlvo) {
  const arma = ent.armas[ent.slot];
  const def = ARMAS[arma.tipo];
  if (arma.municao === 0 && arma.reserva === 0 && ent.slot === 'primaria') {
    cmd.slot = 'pistola';
    return;
  }
  if (cmd.atirar || arma.recarregandoAte > 0 || arma.reserva <= 0) return;
  // Pente vazio recarrega sempre (em combate o gatilho fica solto, então a arma não recarrega sozinha).
  const vazio = arma.municao === 0;
  const baixo = arma.municao < 0.3 * def.pente && !temAlvo;
  if (vazio || baixo) cmd.recarregar = true;
}

export function pensar(ent, mundo, grafo, dificuldade, dt, rng) {
  const cmd = comandoBase(ent);
  if (!ent.vivo || !ent.armas) return cmd;
  const dif = typeof dificuldade === 'string' ? DIFICULDADE[dificuldade] : dificuldade;
  const caixas = mundo.mapa.caixas;
  const c = ent.cerebro ?? (ent.cerebro = criarCerebro(ent, grafo, rng, caixas));
  const agora = mundo.tempo;

  // Visão: mantém o alvo atual enquanto visível; senão, o inimigo mais perto.
  const vistos = enxergar(ent, mundo);
  const alvo = (vistos.find((v) => v.ent.id === c.alvoId) ?? vistos[0])?.ent ?? null;
  if (alvo) {
    if (alvo.id !== c.alvoId) {
      Object.assign(c, { alvoId: alvo.id, vistoHa: 0, emRajada: false, rajada: 0, refazerEm: 0 });
      c.cabeca = rng() < dif.chanceCabeca;
    }
    c.vistoHa += dt;
    c.perdidoHa = 0;
    c.ultimaPos = { ...alvo.pos };
  }

  // Levou dano de quem não vê: procura cobertura contra o atirador.
  if (c.ultimoDanoDe !== null) {
    const atirador = mundo.entidades.find((e) => e.id === c.ultimoDanoDe);
    c.ultimoDanoDe = null;
    const visto = vistos.some((v) => v.ent.id === atirador?.id);
    if (atirador && !visto && c.estado !== 'recuo') irParaCobertura(ent, c, grafo, caixas, atirador.pos, 'cobertura');
  }
  if (alvo && ent.hp < HP_RECUO && c.estado !== 'recuo') {
    irParaCobertura(ent, c, grafo, caixas, alvo.pos, 'recuo');
  }

  let destino = null;
  if (c.estado === 'recuo' || c.estado === 'cobertura') {
    destino = seguirRota(ent, c, grafo, dt, cmd);
    if (!destino) {
      if (!c.chegou) {
        c.chegou = true;
        c.esperaAte = agora + (c.estado === 'recuo' ? ESPERA_RECUO : sortear(rng, ESPERA_COBERTURA));
      }
      if (c.estado === 'recuo') cmd.agachar = true;
      if (alvo) atacar(ent, c, alvo, mundo, dif, dt, rng, cmd, { strafe: false });
      else if (agora >= c.esperaAte) voltarParaRota(ent, c, grafo, caixas, objetivo(ent, grafo, rng));
    } else if (alvo && c.estado === 'cobertura') {
      atacar(ent, c, alvo, mundo, dif, dt, rng, cmd, { strafe: false });
    }
  } else if (alvo) {
    c.estado = 'combate';
    atacar(ent, c, alvo, mundo, dif, dt, rng, cmd, { strafe: true });
    destino = avancar(ent, c, alvo, grafo, caixas, agora, dt, cmd);
  } else if (c.estado === 'combate') {
    c.perdidoHa += dt;
    cmd.yaw = girar(ent.yaw, yawPara(ent.pos, c.ultimaPos), dt);
    if (c.perdidoHa > PERDER_ALVO) {
      voltarParaRota(ent, c, grafo, caixas, waypointPerto(grafo, c.ultimaPos, caixas));
    }
  } else {
    destino = seguirRota(ent, c, grafo, dt, cmd);
    if (!destino) {
      voltarParaRota(ent, c, grafo, caixas, objetivo(ent, grafo, rng));
      destino = seguirRota(ent, c, grafo, dt, cmd);
    }
    // Ouviu passos de inimigo: segue a rota, mas com a mira virada para o barulho.
    const ruido = ouvir(ent, mundo, c);
    if (ruido) {
      c.ouvidoEm = ruido.em;
      c.ouvidoAte = agora + OLHAR_RUIDO;
      c.ouvidoPos = { x: ruido.x, z: ruido.z };
    }
    if (c.ouvidoPos && agora < c.ouvidoAte) cmd.yaw = girar(ent.yaw, yawPara(ent.pos, c.ouvidoPos), dt);
  }
  if (destino) {
    const mov = andarPara(ent.pos, cmd.yaw, destino);
    cmd.frente = mov.frente;
    cmd.lado = mov.lado;
  }
  c.queriaAndar = cmd.frente !== 0 || cmd.lado !== 0;
  recarregarSePreciso(ent, cmd, Boolean(alvo));
  return cmd;
}
