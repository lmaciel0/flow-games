/**
 * Block Strike — cérebro dos bots: rota, combate, cobertura, recuo e dificuldade.
 * Módulo puro: sem Three.js e sem DOM. Unidades em metros e segundos; ângulos em radianos.
 * `pensar` devolve o mesmo Comando que a entrada do jogador (yaw/pitch absolutos).
 */

import { ARMAS, BOMBA, DIFICULDADE, RECUO_MAX, familia } from './config.js';
import { olho, direcao, temVisada } from './fisica.js';
import { caminho, maisProximo, coberturaPerto } from './navegacao.js';
import { siteEm } from './bomba.js';
import { visadaLivre } from './granadas.js';

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
// Onde cada T fica no bombsite (m em volta do centro, pelo índice no time): espalhados, não empilhados.
const ESPALHAR = [[0, 0], [-3.5, -2.5], [3.5, -2.5], [-3.5, 2.5], [3.5, 2.5]];
const PERTO_DO_SITE = 8; // m do centro: a partir daqui o T vai para o seu ponto no site
const ESPERA_RECUO = 5;
const LIMITE_ROTA = 20; // |x| que separa corredor, meio e túnel
const REFAZER_ROTA = 2; // s entre recálculos da rota até o alvo
// Distância (m) até onde o bot avança no alvo, nas pausas entre os tiros.
const ALCANCE_IDEAL = { sniper: 60, rifle: 20, smg: 12, escopeta: 7, pistola: 15 };

const ALCANCE_OUVIDO = 15; // m: passo de inimigo até aqui chama a atenção do bot
const OLHAR_RUIDO = 1; // s olhando para onde veio o barulho
const GRANADA_INTERVALO = [6, 12]; // s entre arremessos do mesmo bot
const ALCANCE_HE = [9, 28];
const ALCANCE_FLASH = [6, 25];
const FUMACA_RECUO = 6; // m à frente para a smoke que cobre a fuga
const DESVIO_MIRA = 0.15; // rad: variação da mira parada no posto entre os CTs

const PESOS = [
  ['rifle', 0.35], ['fuzil', 0.1], ['rifleS', 0.1], ['smg', 0.13], ['miniSmg', 0.06], ['smgS', 0.06], ['escopeta', 0.2],
];

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

// Rota do começo do round. Os Ts indo ao bombsite se dividem como num time de CS: metade pela rota do
// próprio site, metade pelo meio. Sem isso os cinco seguiam o mesmo caminho mais curto, em fila.
function rotaDoRound(ent, grafo, caixas, destino, bomba, mundo, indice) {
  if (!bomba?.chave.startsWith('site:') || ent.time !== mundo.bomba.terroristas || mundo.bomba.plantada) {
    return rotaAte(ent, grafo, caixas, destino);
  }
  const passagem = mundo.mapa.bombsites[bomba.chave.slice(5)].rotas?.[indice % 2];
  const ida = passagem === undefined ? [] : rotaAte(ent, grafo, caixas, passagem);
  if (!ida.length) return rotaAte(ent, grafo, caixas, destino);
  return [...ida, ...caminho(grafo, passagem, destino).slice(1)];
}

export function criarCerebro(ent, grafo, rng, caixas = [], mundo = null) {
  const indice = ent.id % 5;
  const ordem = [1, 2, 0]; // meio, túnel, corredor
  const casaZ = ent.pos.z >= 0 ? 0 : 1; // metade do mapa onde nasceu
  // `ent.cerebro` ainda é o do round anterior (outra metade depois da troca de lados): passa a casa nova.
  const bomba = mundo ? destinoBomba(ent, mundo, casaZ) : null;
  const destino = bomba ? bomba.waypoint : objetivo(ent, grafo, rng, ordem[indice % 3]);
  return {
    estado: 'rota', rota: rotaDoRound(ent, grafo, caixas, destino, bomba, mundo, indice), alvoId: null, vistoHa: 0,
    rajada: 0, pausaAte: 0, ultimoDanoDe: null,
    passoRota: 0, ultimaPos: null, perdidoHa: 0, esperaAte: 0, chegou: false,
    erro: { yaw: 0, pitch: 0 }, erroAte: 0, cabeca: false, municaoVista: null,
    gatilho: false, emRajada: false, preso: 0, queriaAndar: false, recuou: false,
    ouvidoEm: -Infinity, ouvidoAte: 0, ouvidoPos: null, chaveBomba: bomba ? bomba.chave : null,
    proxGranada: 0, cegoVisto: 0, casaZ,
    desvioMira: sortear(rng, [-DESVIO_MIRA, DESVIO_MIRA]),
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
  const vistos = [];
  if (mundo.tempo < (ent.cegoAte ?? 0)) return vistos; // cego pela flash: não vê ninguém
  for (const outro of mundo.entidades) {
    if (!outro.vivo || outro.time === ent.time) continue;
    const d = distXZ(o, outro.pos);
    if (d > ALCANCE_VISAO) continue;
    if (d > VISAO_360 && Math.abs(angulo(yawPara(o, outro.pos) - ent.yaw)) > MEIO_CONE) continue;
    const p = pontosDoCorpo(outro);
    if (!visadaLivre(mundo, o, p.cabeca) && !visadaLivre(mundo, o, p.tronco)) continue; // fumaça também corta a visão
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
    if (distXZ(ent.pos, r) > (r.alcance ?? ALCANCE_OUVIDO)) continue;
    if (melhor === null || r.em > melhor.em) melhor = r;
  }
  return melhor;
}

// Para onde o bot vai por causa da C4: { chave, waypoint? , ponto? } ou null (sem bomba em jogo).
// A chave muda quando o objetivo muda (C4 plantada, caiu, outro bombsite): aí o bot refaz a rota.
// `casaZ`: metade onde o bot nasceu neste round (índice do `espera`).
function destinoBomba(ent, mundo, casaZ = ent.cerebro?.casaZ ?? (ent.pos.z >= 0 ? 0 : 1)) {
  const b = mundo.bomba;
  if (!b || b.explodiu || b.desarmada) return null;
  const sites = mundo.mapa.bombsites;
  if (ent.time === b.terroristas) {
    if (b.plantada) return { chave: `site:${b.site}`, waypoint: sites[b.site]?.waypoint };
    if (b.portador === null && b.pos) {
      // Só um terrorista vai buscar a C4 solta (o mais perto); os outros esperam no bombsite.
      // Quem já está indo continua até pegar ou morrer: a rota pode se afastar da C4 antes de chegar,
      // e comparar só a distância fazia dois bots trocarem a vez sem parar.
      const outros = mundo.entidades.filter((o) => o !== ent && o.vivo && o.time === ent.time && o.bot);
      const meu = distXZ(ent.pos, b.pos);
      const jaVou = ent.cerebro?.chaveBomba === 'solta';
      const outroVai = outros.some((o) => o.cerebro?.chaveBomba === 'solta');
      const maisPerto = outros.every((o) => distXZ(o.pos, b.pos) >= meu);
      if (jaVou || (!outroVai && maisPerto)) return { chave: 'solta', ponto: b.pos };
    }
    return { chave: `site:${b.siteAlvo}`, waypoint: sites[b.siteAlvo].waypoint };
  }
  if (b.plantada) return { chave: `site:${b.site}`, waypoint: sites[b.site]?.waypoint };
  // Antes da plantada, o CT segura o site de um pouco atrás, do lado da própria base (mira o corredor de entrada).
  const site = ent.id % 2 === 0 ? 'A' : 'B';
  return { chave: `espera:${site}`, waypoint: sites[site].espera[casaZ] };
}

// Visada limpa na altura da cintura entre o bot e um ponto do chão.
const veDireto = (ent, mundo, p) => temVisada(
  { x: ent.pos.x, y: 0.9, z: ent.pos.z }, { x: p.x, y: 0.9, z: p.z }, mundo.mapa.caixas);

// T que chegou perto do bombsite vai para o seu ponto em volta do centro e fica lá (ESPALHAR).
function espalharNoSite(ent, mundo, site) {
  const centro = mundo.mapa.bombsites[site]?.centro;
  if (!centro || distXZ(ent.pos, centro) > PERTO_DO_SITE) return { segurar: true };
  const [dx, dz] = ESPALHAR[ent.id % ESPALHAR.length];
  const ponto = { x: centro.x + dx, z: centro.z + dz };
  if (distXZ(ent.pos, ponto) < 0.6) return { parado: true, segurar: true };
  return veDireto(ent, mundo, ponto) ? { direto: ponto, segurar: true } : { segurar: true };
}

// Ações da C4 enquanto o bot não tem inimigo à vista. Devolve { direto?, parado?, segurar? } ou null:
// direto = anda reto até o ponto; parado = fica onde está (planta/desarma); segurar = rota acabou, espera.
function tarefaBomba(ent, mundo, cmd) {
  const b = mundo.bomba;
  if (!b || b.explodiu || b.desarmada) return null;
  if (ent.time === b.terroristas) {
    if (b.plantada) return espalharNoSite(ent, mundo, b.site);
    if (b.portador === ent.id) {
      if (!siteEm(mundo.mapa, ent.pos)) return null;
      cmd.usar = true;
      return { parado: true, segurar: true };
    }
    if (b.portador === null && b.pos && distXZ(ent.pos, b.pos) < 8 && veDireto(ent, mundo, b.pos)) {
      return { direto: b.pos, segurar: true };
    }
    return b.portador === null && b.pos ? null : espalharNoSite(ent, mundo, b.siteAlvo);
  }
  if (!b.plantada) return { segurar: true };
  const d = distXZ(ent.pos, b.pos);
  if (d <= BOMBA.raioAcao - 0.3) {
    if (!b.acao || b.acao.id === ent.id) cmd.usar = true; // só um CT desarma; o resto cobre
    return { parado: true, segurar: true };
  }
  return d < 16 && veDireto(ent, mundo, b.pos) ? { direto: b.pos, segurar: true } : null;
}

// Waypoint do próximo trecho: o da C4 se houver bomba em jogo, senão um sorteio na metade inimiga.
function proximoObjetivo(ent, c, mundo, grafo, rng) {
  const bomba = destinoBomba(ent, mundo);
  if (!bomba) return objetivo(ent, grafo, rng);
  c.chaveBomba = bomba.chave;
  return bomba.waypoint ?? waypointPerto(grafo, bomba.ponto, mundo.mapa.caixas);
}

// Granada no meio da briga: HE ou flash no inimigo à vista, com intervalo e um pouco de sorte.
// `granadaAlvo` é o ponto onde o arco deve cair (ver `lancar` em granadas.js).
function jogarGranada(ent, c, alvo, mundo, cmd, rng) {
  const g = ent.equip?.granadas;
  if (!g || mundo.tempo < c.proxGranada) return;
  const d = distXZ(ent.pos, alvo.pos);
  let tipo = null;
  if (g.he > 0 && d >= ALCANCE_HE[0] && d <= ALCANCE_HE[1] && rng() < 0.5) tipo = 'he';
  else if (g.flash > 0 && d >= ALCANCE_FLASH[0] && d <= ALCANCE_FLASH[1] && rng() < 0.4) tipo = 'flash';
  if (!tipo) return;
  cmd.granada = tipo;
  cmd.granadaAlvo = { x: alvo.pos.x, y: alvo.pos.y + (tipo === 'flash' ? 1.5 : 0.1), z: alvo.pos.z };
  c.proxGranada = mundo.tempo + sortear(rng, GRANADA_INTERVALO);
}

// Fuga: smoke na direção da ameaça para cobrir a retirada.
function fumacaDeFuga(ent, c, ameaca, mundo, cmd) {
  if (!(ent.equip?.granadas?.smoke > 0) || mundo.tempo < c.proxGranada) return;
  const d = Math.max(1, distXZ(ent.pos, ameaca));
  const k = Math.min(FUMACA_RECUO, d) / d;
  cmd.granada = 'smoke';
  cmd.granadaAlvo = { x: ent.pos.x + (ameaca.x - ent.pos.x) * k, y: 0.3, z: ent.pos.z + (ameaca.z - ent.pos.z) * k };
  c.proxGranada = mundo.tempo + sortear(() => 0.5, GRANADA_INTERVALO);
}

// Gira no máximo GIRO_MAX*dt em direção ao ângulo desejado.
function girar(atual, desejado, dt) {
  const delta = angulo(desejado - atual);
  const max = GIRO_MAX * dt;
  return atual + Math.max(-max, Math.min(max, delta));
}

const comandoBase = (ent) => ({
  frente: 0, lado: 0, pular: false, agachar: false, devagar: false, atirar: false,
  zoom: false, recarregar: false, usar: false, granada: null, slot: null, yaw: ent.yaw, pitch: ent.pitch,
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
  if (strafe && (familia(arma.tipo) === 'smg' || arma.tipo === 'escopeta')) {
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

// Passos de inimigo ouvidos há pouco viram a mira para o barulho (ganha da mira parada).
function olharRuido(ent, c, mundo, dt, cmd) {
  const ruido = ouvir(ent, mundo, c);
  if (ruido) {
    c.ouvidoEm = ruido.em;
    c.ouvidoAte = mundo.tempo + OLHAR_RUIDO;
    c.ouvidoPos = { x: ruido.x, z: ruido.z };
  }
  if (c.ouvidoPos && mundo.tempo < c.ouvidoAte) cmd.yaw = girar(ent.yaw, yawPara(ent.pos, c.ouvidoPos), dt);
}

// No posto sem alvo: mira a saída da rota inimiga (com o desvio do bot), pitch na horizontal.
function mirarEntrada(ent, c, mundo, dt, cmd) {
  const site = c.chaveBomba.slice('espera:'.length);
  const mira = mundo.mapa.bombsites[site].mira[c.casaZ];
  cmd.yaw = girar(ent.yaw, yawPara(ent.pos, mira) + c.desvioMira, dt);
  cmd.pitch = ent.pitch + Math.max(-GIRO_MAX * dt, Math.min(GIRO_MAX * dt, -ent.pitch));
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
  const c = ent.cerebro ?? (ent.cerebro = criarCerebro(ent, grafo, rng, caixas, mundo));
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
  // Ferido e vendo o inimigo: recua uma vez só por round. Recuar de novo a cada visada virava um vaivém
  // sem fim (cobertura, espera, volta à rota, vê o inimigo, cobertura...); depois do recuo ele luta.
  if (alvo && ent.hp < HP_RECUO && c.estado !== 'recuo' && !c.recuou) {
    if (irParaCobertura(ent, c, grafo, caixas, alvo.pos, 'recuo')) {
      c.recuou = true;
      fumacaDeFuga(ent, c, alvo.pos, mundo, cmd);
    }
  }
  // Cegado pela flash: larga o combate e vai para a cobertura mais perto do último inimigo visto.
  if (agora < (ent.cegoAte ?? 0) && c.cegoVisto !== ent.cegoAte) {
    c.cegoVisto = ent.cegoAte;
    if (c.ultimaPos && c.estado !== 'recuo') irParaCobertura(ent, c, grafo, caixas, c.ultimaPos, 'cobertura');
  }

  // No posto, a C4 mudou (plantada, por exemplo) → sai e segue para o novo objetivo.
  if (c.estado === 'posto' && destinoBomba(ent, mundo)?.chave !== c.chaveBomba) {
    voltarParaRota(ent, c, grafo, caixas, proximoObjetivo(ent, c, mundo, grafo, rng));
  }

  // Procurando o inimigo perdido: se ele reaparece, é combate normal.
  if (c.estado === 'procura' && alvo) c.estado = 'combate';

  let destino = null;
  if (c.estado === 'recuo' || c.estado === 'cobertura' || c.estado === 'procura') {
    destino = seguirRota(ent, c, grafo, dt, cmd);
    if (!destino) {
      if (!c.chegou) {
        c.chegou = true;
        c.esperaAte = agora + (c.estado === 'recuo' ? ESPERA_RECUO : sortear(rng, ESPERA_COBERTURA));
      }
      if (c.estado === 'recuo') cmd.agachar = true;
      if (alvo) atacar(ent, c, alvo, mundo, dif, dt, rng, cmd, { strafe: false });
      else if (agora >= c.esperaAte) voltarParaRota(ent, c, grafo, caixas, proximoObjetivo(ent, c, mundo, grafo, rng));
    } else if (alvo && c.estado === 'cobertura') {
      atacar(ent, c, alvo, mundo, dif, dt, rng, cmd, { strafe: false });
    }
  } else if (c.estado === 'posto') {
    // Segurando o ângulo: atira do lugar, sem avançar e sem perseguir; sem alvo, volta a mirar a entrada.
    if (alvo) {
      atacar(ent, c, alvo, mundo, dif, dt, rng, cmd, { strafe: false });
      jogarGranada(ent, c, alvo, mundo, cmd, rng);
    } else {
      c.perdidoHa += dt;
      if (c.perdidoHa > PERDER_ALVO) Object.assign(c, { alvoId: null, vistoHa: 0, emRajada: false });
      mirarEntrada(ent, c, mundo, dt, cmd);
      olharRuido(ent, c, mundo, dt, cmd);
    }
  } else if (alvo) {
    c.estado = 'combate';
    atacar(ent, c, alvo, mundo, dif, dt, rng, cmd, { strafe: true });
    jogarGranada(ent, c, alvo, mundo, cmd, rng);
    destino = avancar(ent, c, alvo, grafo, caixas, agora, dt, cmd);
  } else if (c.estado === 'combate') {
    c.perdidoHa += dt;
    cmd.yaw = girar(ent.yaw, yawPara(ent.pos, c.ultimaPos), dt);
    if (c.perdidoHa > PERDER_ALVO) {
      voltarParaRota(ent, c, grafo, caixas, waypointPerto(grafo, c.ultimaPos, caixas));
      c.estado = 'procura';
    }
  } else {
    // C4: o objetivo mudou (plantada, caiu, outro bombsite) → refaz a rota.
    const bomba = destinoBomba(ent, mundo);
    if (bomba && bomba.chave !== c.chaveBomba) {
      voltarParaRota(ent, c, grafo, caixas, proximoObjetivo(ent, c, mundo, grafo, rng));
    }
    destino = seguirRota(ent, c, grafo, dt, cmd);
    const tarefa = tarefaBomba(ent, mundo, cmd);
    if (tarefa?.direto) {
      cmd.yaw = girar(ent.yaw, yawPara(ent.pos, tarefa.direto), dt);
      destino = tarefa.direto;
    } else if (tarefa?.parado) {
      destino = null;
    } else if (!destino && !tarefa?.segurar) {
      voltarParaRota(ent, c, grafo, caixas, proximoObjetivo(ent, c, mundo, grafo, rng));
      destino = seguirRota(ent, c, grafo, dt, cmd);
    } else if (!destino && bomba && c.chaveBomba.startsWith('espera:') && c.rota.at(-1) === bomba.waypoint) {
      // CT antes da plantada que chegou ao `espera`: fica no posto segurando o ângulo.
      c.estado = 'posto';
    }
    // Ouviu passos de inimigo: segue a rota, mas com a mira virada para o barulho.
    olharRuido(ent, c, mundo, dt, cmd);
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
