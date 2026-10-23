/**
 * Block Strike — economia da partida: dinheiro, compras, colete e bônus de round.
 * Módulo puro: sem Three.js e sem DOM. Só vale quando `mundo.economia` está ligado (partida 5x5).
 * O equipamento comprado (`e.equip`) vale enquanto o jogador sobrevive; morrer perde tudo.
 */

import { COLETE, ECONOMIA, ITENS, MAX_GRANADAS, familia } from './config.js';
import { criarArma } from './armas.js';

export const equipVazio = () => ({
  primaria: null, colete: 0, capacete: false, kit: false, granadas: { smoke: 0, flash: 0, he: 0 },
});

// Liga a economia: todo mundo começa com o dinheiro inicial e sem equipamento.
export function iniciarEconomia(mundo) {
  mundo.economia = true;
  for (const e of mundo.entidades) {
    e.dinheiro = ECONOMIA.inicial;
    e.equip = equipVazio();
  }
}

// Intervalo da partida: dinheiro e equipamento zeram, como no início.
export function resetarEconomia(mundo, partida) {
  for (const e of mundo.entidades) {
    e.dinheiro = ECONOMIA.inicial;
    e.equip = equipVazio();
  }
  partida.derrotasSeguidas = { azul: 0, laranja: 0 };
}

const limitar = (n) => Math.min(ECONOMIA.maximo, n);

// Dinheiro por abate, conforme a arma; só conta inimigo.
export function premiarKill(atirador, tipoArma) {
  if (atirador.dinheiro === undefined) return;
  atirador.dinheiro = limitar(atirador.dinheiro + (ECONOMIA.recompensaKill[familia(tipoArma)] ?? 300));
}

// Fim do round: o vencedor ganha o bônus de vitória; quem perde ganha o de derrota, que cresce a cada derrota seguida.
// `vencedor` null (empate) conta como derrota para os dois.
export function premiarRound(mundo, partida, vencedor) {
  const seq = partida.derrotasSeguidas ?? (partida.derrotasSeguidas = { azul: 0, laranja: 0 });
  for (const time of ['azul', 'laranja']) {
    let bonus;
    if (time === vencedor) {
      bonus = ECONOMIA.vitoria;
      seq[time] = Math.max(0, seq[time] - 1);
    } else {
      bonus = ECONOMIA.derrota[Math.min(seq[time], ECONOMIA.derrota.length - 1)];
      seq[time] += 1;
    }
    for (const e of mundo.entidades) if (e.time === time) e.dinheiro = limitar(e.dinheiro + bonus);
  }
}

// Morreu: perde primária, colete, kit e granadas.
export function perderEquip(e) {
  if (e.equip) e.equip = equipVazio();
}

// Dano depois do colete. Devolve { dano, colete } (colete = pontos que sobram).
export function danoComColete(equip, parte, dano) {
  if (!equip || equip.colete <= 0) return { dano, colete: equip?.colete ?? 0 };
  const fator = parte === 'cabeca' ? (equip.capacete ? COLETE.cabeca : 1) : COLETE.corpo;
  const final = Math.round(dano * fator);
  return { dano: final, colete: Math.max(0, equip.colete - (dano - final)) };
}

// Por que não dá para comprar `item` agora (null se dá).
export function motivoNaoComprar(e, item, papel) {
  const def = ITENS[item];
  if (!def) return 'inexistente';
  const eq = e.equip;
  if (def.grupo === 'arma' && eq.primaria === item) return 'ja-tem';
  if (item === 'colete' && eq.colete >= COLETE.pontos) return 'ja-tem';
  if (item === 'coleteCapacete' && eq.colete >= COLETE.pontos && eq.capacete) return 'ja-tem';
  if (item === 'kit' && (papel !== 'CT' || eq.kit)) return papel !== 'CT' ? 'papel' : 'ja-tem';
  if (def.grupo === 'granada' && eq.granadas[item] >= MAX_GRANADAS[item]) return 'ja-tem';
  if (def.grupo === 'granada' && totalGranadas(eq) >= 4) return 'ja-tem';
  return e.dinheiro < def.preco ? 'dinheiro' : null; // o que já se tem aparece como "tem", mesmo sem dinheiro
}
const totalGranadas = (eq) => eq.granadas.smoke + eq.granadas.flash + eq.granadas.he;

// Compra: tira o dinheiro, atualiza `e.equip` e, se a arma já está montada (freeze em andamento), já entrega.
export function comprar(e, item, papel) {
  const motivo = motivoNaoComprar(e, item, papel);
  if (motivo) return { ok: false, motivo };
  const def = ITENS[item];
  e.dinheiro -= def.preco;
  const eq = e.equip;
  if (def.grupo === 'arma') {
    eq.primaria = item;
    if (e.armas) {
      e.armas.primaria = criarArma(item);
      e.slotAnterior = e.slot;
      e.slot = 'primaria';
    }
  } else if (item === 'colete') eq.colete = COLETE.pontos;
  else if (item === 'coleteCapacete') {
    eq.colete = COLETE.pontos;
    eq.capacete = true;
  } else if (item === 'kit') {
    eq.kit = true;
    e.kit = true;
  } else eq.granadas[item] += 1;
  return { ok: true, item };
}

// Entrega o equipamento comprado ao reposicionar: armas novas e munição cheia.
export function armasDoEquip(e) {
  const armas = { pistola: criarArma('pistola'), faca: criarArma('faca') };
  if (e.equip.primaria) armas.primaria = criarArma(e.equip.primaria);
  return armas;
}

// Compra do bot no freeze: arma preferida (ou a mais cara que couber), depois colete, kit e granadas.
export function botComprar(e, papel) {
  const eq = e.equip;
  if (!eq.primaria) {
    const pref = e.primariaEscolhida;
    const ordem = [pref, 'rifle', 'smg', 'escopeta'].filter((t, i, a) => a.indexOf(t) === i);
    // A sniper só entra se sobrar dinheiro para o colete.
    const escolha = ordem.find((t) => ITENS[t].preco + (t === 'sniper' ? ITENS.colete.preco : 0) <= e.dinheiro);
    if (escolha) comprar(e, escolha, papel);
  }
  if (e.dinheiro >= ITENS.coleteCapacete.preco) comprar(e, 'coleteCapacete', papel);
  else if (e.dinheiro >= ITENS.colete.preco) comprar(e, 'colete', papel);
  if (papel === 'CT' && e.dinheiro >= ITENS.kit.preco) comprar(e, 'kit', papel);
  for (const g of ['he', 'flash', 'smoke']) if (e.dinheiro >= ITENS[g].preco) comprar(e, g, papel);
}

// Para o menu: cada item com preço e se dá para comprar (ou por que não).
export function estadoCompra(e, papel) {
  return Object.entries(ITENS).map(([id, def]) => ({
    id, nome: def.nome, preco: def.preco, grupo: def.grupo, motivo: motivoNaoComprar(e, id, papel),
  }));
}
