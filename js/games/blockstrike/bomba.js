/**
 * Block Strike — C4 do modo desarme: sorteio do portador, plantar, desarmar, explodir e soltar ao morrer.
 * Módulo puro: sem Three.js e sem DOM. Unidades em metros e segundos.
 * Os terroristas (`bomba.terroristas`) plantam num bombsite segurando a tecla de uso parados;
 * os CTs desarmam perto da C4 plantada. Quem age fica parado e sem atirar (ver `passo` em mundo.js).
 */

import { BOMBA } from './config.js';

const distXZ = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

// 'A' | 'B' se o ponto está dentro de um bombsite; senão null.
export function siteEm(mapa, pos) {
  for (const [nome, s] of Object.entries(mapa.bombsites ?? {})) {
    if (pos.x >= s.min.x && pos.x <= s.max.x && pos.z >= s.min.z && pos.z <= s.max.z) return nome;
  }
  return null;
}

// C4 nova para o round: portador sorteado entre os terroristas vivos e o bombsite preferido deles.
export function criarBomba(mundo, terroristas) {
  const ts = mundo.entidades.filter((e) => e.time === terroristas && e.vivo);
  const portador = ts[Math.floor(mundo.rng() * ts.length)] ?? null;
  return {
    terroristas, portador: portador ? portador.id : null, pos: null,
    siteAlvo: mundo.rng() < 0.5 ? 'A' : 'B', site: null,
    plantada: false, explodiu: false, desarmada: false, restante: BOMBA.explode,
    acao: null, // { tipo: 'plantar' | 'desarmar', id, t, dur } enquanto alguém segura a tecla
  };
}

// Ação que `e` poderia fazer agora com a tecla de uso: 'plantar', 'desarmar' ou null.
export function acaoPossivel(mundo, e) {
  const b = mundo.bomba;
  if (!b || !e.vivo || b.explodiu || b.desarmada) return null;
  if (e.time === b.terroristas) {
    return !b.plantada && b.portador === e.id && e.noChao && siteEm(mundo.mapa, e.pos) ? 'plantar' : null;
  }
  return b.plantada && e.noChao && distXZ(e.pos, b.pos) <= BOMBA.raioAcao ? 'desarmar' : null;
}

function matarNaExplosao(mundo, eventos) {
  const b = mundo.bomba;
  for (const e of mundo.entidades) {
    if (!e.vivo || e.hp <= 0) continue;
    if (Math.hypot(e.pos.x - b.pos.x, e.pos.y - b.pos.y, e.pos.z - b.pos.z) > BOMBA.raioExplosao) continue;
    e.hp = 0;
    e.mortes += 1;
    eventos.push({ tipo: 'morte', vitima: e.id, assassino: null, arma: 'c4', cabeca: false });
  }
}

// Um passo da C4. `agindo`: Map id → 'plantar' | 'desarmar' de quem está segurando a tecla de uso.
// Chamado depois de todos agirem e antes de `vivo` cair (a explosão mata e a queda acontece no fim do passo).
export function tickBomba(mundo, dt, agindo, eventos) {
  const b = mundo.bomba;
  if (!b || b.explodiu || b.desarmada) return;
  // Portador morto solta a C4 onde caiu; qualquer terrorista vivo que passe por cima a pega.
  if (b.portador !== null && !mundo.entidades[b.portador].vivo) {
    const p = mundo.entidades[b.portador];
    b.portador = null;
    b.pos = { ...p.pos };
    eventos.push({ tipo: 'bomba-solta', ponto: { ...p.pos } });
  }
  if (!b.plantada && b.portador === null && b.pos) {
    const pega = mundo.entidades.find((e) => e.vivo && e.time === b.terroristas && e.hp > 0 &&
      Math.hypot(e.pos.x - b.pos.x, e.pos.z - b.pos.z) <= BOMBA.raioPegar && e.noChao);
    if (pega) {
      b.portador = pega.id;
      b.pos = null;
      eventos.push({ tipo: 'bomba-pega', id: pega.id });
    }
  }
  // Plantar e desarmar: o progresso só anda enquanto o mesmo agente segura; soltar ou morrer zera.
  const atual = b.acao;
  if (atual && agindo.get(atual.id) !== atual.tipo) {
    b.acao = null;
    eventos.push({ tipo: 'acao-cancelada', id: atual.id });
  }
  if (!b.acao) {
    const quem = [...agindo].find(([id, tipo]) => tipo === (b.plantada ? 'desarmar' : 'plantar') && mundo.entidades[id].vivo);
    if (quem) {
      const [id, tipo] = quem;
      const dur = tipo === 'plantar' ? BOMBA.plantar : mundo.entidades[id].kit ? BOMBA.desarmarKit : BOMBA.desarmar;
      b.acao = { tipo, id, t: 0, dur };
      eventos.push({ tipo: 'acao-inicio', id, acao: tipo });
    }
  }
  if (b.acao) {
    b.acao.t += dt;
    if (b.acao.t >= b.acao.dur) {
      const e = mundo.entidades[b.acao.id];
      if (b.acao.tipo === 'plantar') {
        b.plantada = true;
        b.pos = { ...e.pos };
        b.site = siteEm(mundo.mapa, e.pos);
        b.portador = null;
        b.restante = BOMBA.explode;
        eventos.push({ tipo: 'plantada', id: e.id, site: b.site, ponto: { ...b.pos } });
      } else {
        b.desarmada = true;
        eventos.push({ tipo: 'desarmada', id: e.id });
      }
      b.acao = null;
    }
  }
  if (b.plantada && !b.desarmada) {
    b.restante -= dt;
    if (b.restante <= 0) {
      b.explodiu = true;
      b.restante = 0;
      eventos.push({ tipo: 'explosao', ponto: { ...b.pos } });
      matarNaExplosao(mundo, eventos);
    }
  }
}
