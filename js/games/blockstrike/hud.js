/**
 * Block Strike — interface em DOM sobre o canvas: menu, HUD, placar, pausa e fim de partida.
 * Só toca no DOM dentro de `raiz`; `atualizar` escreve apenas quando o valor muda.
 */

import { ARMAS } from './config.js';

const PRIMARIAS = ['rifle', 'smg', 'sniper', 'escopeta'];
const DIFICULDADES = [['facil', 'Fácil'], ['medio', 'Médio'], ['dificil', 'Difícil']];
const MAX_LINHAS_FEED = 5;
const VIDA_FEED_MS = 5000;
const VIDA_DANO_MS = 600;
const VIDA_HIT_MS = 180;
const MOTIVOS = { eliminacao: 'Time adversário eliminado', tempo: 'Tempo esgotado' };

const el = (tag, props = {}, ...filhos) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') e.className = v;
    else if (k === 'texto') e.textContent = v;
    else if (k in e) e[k] = v;
    else e.setAttribute(k, v);
  }
  for (const f of filhos) if (f) e.append(f);
  return e;
};

// Escreve no DOM só quando o valor muda.
const escrever = (e, v) => { if (e.textContent !== v) e.textContent = v; };
const mostrar = (e, visivel) => { if (e.hidden === visivel) e.hidden = !visivel; };

const mmss = (s) => {
  const t = Math.max(0, Math.ceil(s));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
};

// Botões de escolha de primária (menu e loadout compartilham a estrutura).
function criarGradeArmas(id, aoEscolher, comTecla) {
  const grade = el('div', { class: 'bs-armas', id });
  PRIMARIAS.forEach((tipo, i) => {
    const b = el('button', { type: 'button', class: 'bs-arma-btn', 'data-arma': tipo });
    if (comTecla) b.append(el('kbd', { texto: String(i + 1) }));
    b.append(el('span', { texto: ARMAS[tipo].nome }));
    b.addEventListener('click', () => aoEscolher(tipo));
    grade.append(b);
  });
  return grade;
}

function marcarSelecionada(grade, tipo) {
  for (const b of grade.children) b.classList.toggle('selecionada', b.dataset.arma === tipo);
}

export function criarHud(raiz, handlers) {
  const palco = raiz.querySelector('.bs-stage');
  const estado = { primaria: 'rifle', dificuldade: 'medio', sensibilidade: 1 };
  const timers = new Set();
  const depois = (fn, ms) => {
    const t = setTimeout(() => { timers.delete(t); fn(); }, ms);
    timers.add(t);
    return t;
  };

  const hud = {};
  const escolher = (tipo) => {
    estado.primaria = tipo;
    marcarSelecionada(gradeMenu, tipo);
    marcarSelecionada(gradeLoadout, tipo);
    handlers.escolherPrimaria(tipo);
  };

  // --- Menu ---
  const gradeMenu = criarGradeArmas('bs-menu-armas', escolher, false);
  const selDif = el('select', { id: 'bs-dificuldade' });
  for (const [v, rotulo] of DIFICULDADES) selDif.append(el('option', { value: v, texto: rotulo }));
  selDif.addEventListener('change', () => {
    estado.dificuldade = selDif.value;
    handlers.mudarDificuldade(selDif.value);
  });
  const rngSens = el('input', {
    type: 'range', id: 'bs-sensibilidade', min: '0.2', max: '3', step: '0.1', value: '1',
  });
  const rotuloSens = el('span', { class: 'bs-valor', texto: '1.0' });
  rngSens.addEventListener('input', () => {
    const n = Number(rngSens.value);
    estado.sensibilidade = n;
    escrever(rotuloSens, n.toFixed(1));
    handlers.mudarSensibilidade(n);
  });
  const btnJogar = el('button', { id: 'bs-jogar', type: 'button', class: 'action-btn primary-btn', texto: 'Jogar' });
  btnJogar.addEventListener('click', () => handlers.jogar());
  const menuTexto = el('p', { class: 'bs-menu-texto', id: 'bs-menu-texto', texto: 'FPS 5x5 contra bots' });
  const menu = el('div', { class: 'bs-overlay bs-menu', id: 'bs-menu' },
    el('h2', { class: 'bs-menu-titulo', texto: 'Block Strike' }),
    menuTexto,
    el('div', { class: 'bs-campo' }, el('span', { class: 'bs-rotulo', texto: 'Arma primária' }), gradeMenu),
    el('div', { class: 'bs-linha' },
      el('label', { class: 'bs-campo' }, el('span', { class: 'bs-rotulo', texto: 'Dificuldade' }), selDif),
      el('label', { class: 'bs-campo' },
        el('span', { class: 'bs-rotulo', texto: 'Sensibilidade' }),
        el('span', { class: 'bs-slider' }, rngSens, rotuloSens))),
    btnJogar);

  // SECOES
  palco.append(menu);

  // Aplica o que está salvo no storage aos controles do menu.
  hud.definirConfig = ({ primaria, dificuldade, sensibilidade }) => {
    Object.assign(estado, { primaria, dificuldade, sensibilidade });
    marcarSelecionada(gradeMenu, primaria);
    marcarSelecionada(gradeLoadout, primaria);
    selDif.value = dificuldade;
    rngSens.value = String(sensibilidade);
    escrever(rotuloSens, Number(sensibilidade).toFixed(1));
  };
  hud.mostrarMenu = (titulo = 'FPS 5x5 contra bots', rotulo = 'Jogar') => {
    escrever(menuTexto, titulo);
    escrever(btnJogar, rotulo);
    mostrar(menu, true);
  };
  hud.esconderMenu = () => mostrar(menu, false);
  // --- HUD em jogo ---
  const mira = el('div', { class: 'bs-mira', id: 'bs-mira' },
    el('i', { class: 'bs-mira-t' }), el('i', { class: 'bs-mira-b' }),
    el('i', { class: 'bs-mira-e' }), el('i', { class: 'bs-mira-d' }));
  const hitmarker = el('div', { class: 'bs-hitmarker', id: 'bs-hitmarker', hidden: true });
  const danoArco = el('div', { class: 'bs-dano', id: 'bs-dano', hidden: true }, el('i'));
  const hpEl = el('div', { class: 'bs-hp', id: 'bs-hp', texto: '100' });
  const municaoEl = el('div', { class: 'bs-municao', id: 'bs-municao', texto: '—' });
  const armaEl = el('div', { class: 'bs-arma-nome', texto: '' });
  const timerEl = el('div', { class: 'bs-timer', id: 'bs-timer', texto: '0:00' });
  const placarAzul = el('span', { class: 'bs-pl-azul', id: 'bs-placar-azul', texto: '0' });
  const placarLaranja = el('span', { class: 'bs-pl-laranja', id: 'bs-placar-laranja', texto: '0' });
  const roundEl = el('div', { class: 'bs-round', id: 'bs-round', texto: 'Round 1' });
  const killfeed = el('div', { class: 'bs-killfeed', id: 'bs-killfeed' });
  const espectando = el('div', { class: 'bs-espectando', id: 'bs-espectando', hidden: true });
  // Não bloqueia nada: só avisa que o mouse ainda não está preso ao jogo.
  const dicaTrava = el('div', { class: 'bs-dica-trava', id: 'bs-dica-trava', hidden: true,
    texto: 'Clique na tela para mirar' });
  const fimRound = el('div', { class: 'bs-fim-round', id: 'bs-fim-round', hidden: true },
    el('strong'), el('small'));
  const hudEl = el('div', { class: 'bs-hud', id: 'bs-hud', hidden: true },
    el('div', { class: 'bs-topo' },
      el('div', { class: 'bs-placar' }, placarAzul, timerEl, placarLaranja), roundEl),
    killfeed, mira, hitmarker, danoArco, espectando, fimRound, dicaTrava,
    el('div', { class: 'bs-base' }, el('div', { class: 'bs-vida' }, el('small', { texto: 'VIDA' }), hpEl),
      el('div', { class: 'bs-arma' }, armaEl, municaoEl)));
  palco.append(hudEl);
  hud.mostrarHud = (visivel) => mostrar(hudEl, visivel);
  hud.mostrarDica = (visivel) => mostrar(dicaTrava, visivel);

  // Efeitos pontuais: hitmarker, indicador de dano e kill feed.
  let timerHit = null;
  hud.acerto = (cabeca) => {
    hitmarker.classList.toggle('cabeca', cabeca);
    mostrar(hitmarker, true);
    if (timerHit) { clearTimeout(timerHit); timers.delete(timerHit); }
    timerHit = depois(() => mostrar(hitmarker, false), VIDA_HIT_MS);
  };
  let timerDano = null;
  hud.dano = (graus) => {
    danoArco.style.transform = `rotate(${Math.round(graus)}deg)`;
    danoArco.classList.remove('anim');
    mostrar(danoArco, true);
    void danoArco.offsetWidth; // reinicia a animação
    danoArco.classList.add('anim');
    if (timerDano) { clearTimeout(timerDano); timers.delete(timerDano); }
    timerDano = depois(() => mostrar(danoArco, false), VIDA_DANO_MS);
  };
  hud.morte = ({ assassino, vitima, arma, cabeca }) => {
    const nome = (e) => el('b', { class: `bs-time-${e.time}`, texto: e.nome });
    const linha = el('div', { class: 'bs-feed-linha' }, nome(assassino),
      el('span', { class: 'bs-feed-arma', texto: `[${ARMAS[arma].nome}]` }));
    if (cabeca) linha.append(el('span', { class: 'bs-feed-cabeca', texto: '☠', title: 'Headshot' }));
    linha.append(nome(vitima));
    killfeed.append(linha);
    while (killfeed.children.length > MAX_LINHAS_FEED) killfeed.firstChild.remove();
    depois(() => linha.remove(), VIDA_FEED_MS);
  };
  hud.limparEfeitos = () => {
    killfeed.replaceChildren();
    mostrar(hitmarker, false);
    mostrar(danoArco, false);
  };
  // --- Loadout (só no freeze) ---
  const gradeLoadout = criarGradeArmas('bs-loadout-armas', escolher, true);
  const loadout = el('div', { class: 'bs-loadout', id: 'bs-loadout', hidden: true },
    el('strong', { texto: 'Escolha sua arma' }), gradeLoadout,
    el('small', { texto: 'Teclas 1 a 4 ou clique. Vale para este round e os seguintes.' }));
  palco.append(loadout);
  marcarSelecionada(gradeLoadout, estado.primaria);
  // Digit1–Digit4 no freeze: o index chama isto a partir de entrada.aoTecla.
  hud.teclaLoadout = (code) => {
    const i = ['Digit1', 'Digit2', 'Digit3', 'Digit4'].indexOf(code);
    if (i < 0 || loadout.hidden) return false;
    escolher(PRIMARIAS[i]);
    return true;
  };

  // --- Placar (Tab e fim de partida) ---
  const tabela = el('div', { class: 'bs-tabela', id: 'bs-placar-tabela', hidden: true });
  palco.append(tabela);
  let chaveTabela = '';
  const tabelaTime = (time, titulo, ents) => {
    const t = el('table', { class: `bs-tab-${time}` });
    t.append(el('thead', {}, el('tr', {}, ...['', 'K', 'D', 'HS%'].map((x, i) =>
      el('th', { texto: i === 0 ? titulo : x })))));
    const corpo = el('tbody');
    for (const e of ents) {
      const hs = e.kills > 0 ? Math.round((e.killsCabeca / e.kills) * 100) : 0;
      const tr = el('tr', { class: e.id === 0 ? 'voce' : '' });
      tr.append(el('td', { texto: e.nome }), el('td', { texto: String(e.kills) }),
        el('td', { texto: String(e.mortes) }), el('td', { texto: `${hs}%` }));
      corpo.append(tr);
    }
    t.append(corpo);
    return t;
  };
  const renderTabela = (entidades) => {
    const chave = entidades.map((e) => `${e.id}:${e.kills}:${e.mortes}:${e.killsCabeca}`).join('|');
    if (chave === chaveTabela) return;
    chaveTabela = chave;
    const porKills = (time) => entidades.filter((e) => e.time === time)
      .sort((a, b) => b.kills - a.kills || a.mortes - b.mortes || a.id - b.id);
    tabela.replaceChildren(tabelaTime('azul', 'Azul', porKills('azul')),
      tabelaTime('laranja', 'Laranja', porKills('laranja')));
  };
  let tabVisivel = false;
  let fimVisivel = false;
  hud.mostrarTabela = (visivel) => {
    tabVisivel = visivel;
    mostrar(tabela, fimVisivel || visivel);
  };

  // --- Pausa ---
  const btnContinuar = el('button', {
    type: 'button', id: 'bs-continuar', class: 'action-btn primary-btn', texto: 'Continuar',
  });
  const btnSair = el('button', {
    type: 'button', id: 'bs-sair', class: 'action-btn secondary-btn', texto: 'Sair para o menu',
  });
  btnContinuar.addEventListener('click', () => handlers.continuar());
  btnSair.addEventListener('click', () => handlers.sairParaMenu());
  const pausa = el('div', { class: 'bs-overlay bs-pausa', id: 'bs-pausa', hidden: true },
    el('h2', { class: 'bs-menu-titulo', texto: 'Pausado' }), btnContinuar, btnSair);
  palco.append(pausa);
  hud.mostrarPausa = (visivel) => mostrar(pausa, visivel);

  // --- Fim de partida ---
  const fimTitulo = el('h2', { class: 'bs-menu-titulo', texto: '' });
  const fimPlacar = el('p', { class: 'bs-fim-placar', texto: '' });
  const fimCorpo = el('div', { class: 'bs-fim-corpo' });
  const btnDeNovo = el('button', {
    type: 'button', id: 'bs-jogar-de-novo', class: 'action-btn primary-btn', texto: 'Jogar de novo',
  });
  const btnVoltar = el('button', {
    type: 'button', id: 'bs-voltar-menu', class: 'action-btn secondary-btn', texto: 'Voltar ao menu',
  });
  btnDeNovo.addEventListener('click', () => handlers.jogarDeNovo());
  btnVoltar.addEventListener('click', () => handlers.sairParaMenu());
  const fim = el('div', { class: 'bs-overlay bs-fim', id: 'bs-fim', hidden: true },
    fimTitulo, fimPlacar, fimCorpo, el('div', { class: 'bs-linha' }, btnDeNovo, btnVoltar));
  palco.append(fim);
  const TITULO_FIM = { azul: 'Vitória!', laranja: 'Derrota', empate: 'Empate' };
  hud.mostrarFim = (resultado, placar) => {
    fimVisivel = true;
    fimTitulo.className = `bs-menu-titulo bs-fim-${resultado}`;
    escrever(fimTitulo, TITULO_FIM[resultado] ?? 'Empate');
    escrever(fimPlacar, `Azul ${placar.azul} x ${placar.laranja} Laranja`);
    fimCorpo.append(tabela);
    mostrar(fim, true);
  };
  hud.esconderFim = () => {
    fimVisivel = false;
    palco.append(tabela);
    mostrar(fim, false);
  };

  // --- Atualização por frame ---
  // v: { fase, round, tempo, placar, hp, vivo, arma, spread, vencedorRound, motivo, espectando, entidades }
  hud.atualizar = (v) => {
    escrever(placarAzul, String(v.placar.azul));
    escrever(placarLaranja, String(v.placar.laranja));
    escrever(roundEl, `Round ${v.round}`);
    escrever(timerEl, v.fase === 'freeze' ? String(Math.max(0, Math.ceil(v.tempo))) : mmss(v.tempo));
    escrever(hpEl, String(Math.max(0, Math.ceil(v.hp))));
    hpEl.classList.toggle('baixo', v.hp <= 30);
    const faca = !v.arma || !Number.isFinite(v.arma.pente);
    escrever(municaoEl, faca ? '—' : `${v.arma.municao} / ${v.arma.reserva}`);
    escrever(armaEl, v.arma ? ARMAS[v.arma.tipo].nome : '');
    // Abertura da mira em px, quantizada: o spread (rad) vira fração da altura do palco.
    const abertura = Math.min(48, Math.round(4 + Math.tan(v.spread) * palco.clientHeight * 0.75));
    if (mira.dataset.abertura !== String(abertura)) {
      mira.dataset.abertura = String(abertura);
      mira.style.setProperty('--abertura', `${abertura}px`);
    }
    mostrar(mira, v.vivo);
    mostrar(espectando, !v.vivo && Boolean(v.espectando));
    if (v.espectando) escrever(espectando, `Assistindo: ${v.espectando}`);
    mostrar(loadout, v.fase === 'freeze' && v.vivo);
    // vencedorRound/motivo persistem no freeze seguinte: só valem em fim-round.
    const emFimRound = v.fase === 'fim-round';
    mostrar(fimRound, emFimRound);
    if (emFimRound) {
      const t = v.vencedorRound;
      escrever(fimRound.firstChild, t === 'azul' ? 'Azul venceu o round'
        : t === 'laranja' ? 'Laranja venceu o round' : 'Round empatado');
      escrever(fimRound.lastChild, MOTIVOS[v.motivo] ?? '');
    }
    const verTabela = fimVisivel || tabVisivel;
    mostrar(tabela, verTabela);
    if (verTabela) renderTabela(v.entidades);
  };

  hud.destruir = () => {
    for (const t of timers) clearTimeout(t);
    timers.clear();
    for (const e of [menu, hudEl, loadout, tabela, pausa, fim]) e.remove();
  };
  // FIM-SECOES
  return hud;
}
