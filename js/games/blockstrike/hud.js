/**
 * Block Strike — interface em DOM sobre o canvas: menu, HUD, placar, pausa e fim de partida.
 * Só toca no DOM dentro de `raiz`; `atualizar` escreve apenas quando o valor muda.
 */

import { ARMAS } from './config.js';

const PRIMARIAS = ['rifle', 'smg', 'sniper', 'escopeta'];
const DIFICULDADES = [['facil', 'Fácil'], ['medio', 'Médio'], ['dificil', 'Difícil']];
const MODOS = [
  ['partida', 'Partida 5x5', 'Contra bots · primeiro a 13 rounds'],
  ['treino', 'Treino livre', 'Sozinho no mapa · munição infinita'],
];
const TAMANHOS = [['normal', 'Normal'], ['grande', 'Grande']];
const CORES_MIRA = [['#4ade80', 'Verde'], ['#ffffff', 'Branca'], ['#22d3ee', 'Ciano'], ['#facc15', 'Amarela'], ['#f472b6', 'Rosa']];
const CONTROLES = [
  ['WASD', 'andar'], ['Mouse', 'mirar'], ['Clique', 'atirar'], ['Botão direito', 'luneta / estocada'],
  ['R', 'recarregar'], ['Espaço', 'pular'], ['C', 'agachar'], ['Shift', 'andar em silêncio'],
  ['1 2 3 / roda', 'armas'], ['Q', 'última arma'], ['Tab', 'placar'], ['B', 'trocar arma (treino)'],
];
const RADAR_ESCALA = 2.6; // px por metro
const RADAR_LADO = 132; // px
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

// Um quadradinho por jogador do time; os mortos ficam apagados.
function marcarVivos(caixa, entidades, time) {
  const doTime = entidades.filter((e) => e.time === time);
  const chave = doTime.map((e) => (e.vivo ? 1 : 0)).join('');
  if (caixa.dataset.chave === chave) return;
  caixa.dataset.chave = chave;
  caixa.replaceChildren(...doTime.map((e) => el('i', { class: e.vivo ? '' : 'morto' })));
}

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
  const estado = {
    primaria: 'rifle', dificuldade: 'medio', sensibilidade: 1, modo: 'partida', volume: 0.8,
    tamanho: 'normal', corMira: CORES_MIRA[0][0],
  };
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

  // Modo: partida 5x5 (MR12) ou treino sozinho.
  const gradeModos = el('div', { class: 'bs-modos', id: 'bs-modos' });
  for (const [v, titulo, sub] of MODOS) {
    const b = el('button', { type: 'button', class: 'bs-modo-btn', 'data-modo': v },
      el('strong', { texto: titulo }), el('small', { texto: sub }));
    b.addEventListener('click', () => {
      estado.modo = v;
      marcarModo();
      handlers.mudarModo(v);
    });
    gradeModos.append(b);
  }
  const campoDif = el('label', { class: 'bs-campo' }, el('span', { class: 'bs-rotulo', texto: 'Dificuldade' }), selDif);
  const marcarModo = () => {
    for (const b of gradeModos.children) b.classList.toggle('selecionada', b.dataset.modo === estado.modo);
    selDif.disabled = estado.modo === 'treino';
    campoDif.classList.toggle('bs-desligado', estado.modo === 'treino');
  };

  const rngVol = el('input', { type: 'range', id: 'bs-volume', min: '0', max: '1', step: '0.05', value: '0.8' });
  const rotuloVol = el('span', { class: 'bs-valor', texto: '80%' });
  rngVol.addEventListener('input', () => {
    const n = Number(rngVol.value);
    estado.volume = n;
    escrever(rotuloVol, `${Math.round(n * 100)}%`);
    handlers.mudarVolume(n);
  });

  const selMira = el('select', { id: 'bs-cor-mira', class: 'bs-select' });
  for (const [v, rotulo] of CORES_MIRA) selMira.append(el('option', { value: v, texto: rotulo }));
  selMira.addEventListener('change', () => {
    estado.corMira = selMira.value;
    palco.style.setProperty('--cor-mira', selMira.value);
    handlers.mudarCorMira(selMira.value);
  });

  // Tamanho do palco e tela cheia (também na pausa).
  const criarControlesTela = (sufixo) => {
    const sel = el('select', { id: `bs-tamanho${sufixo}`, class: 'bs-select' });
    for (const [v, rotulo] of TAMANHOS) sel.append(el('option', { value: v, texto: rotulo }));
    sel.addEventListener('change', () => {
      estado.tamanho = sel.value;
      for (const s2 of selsTamanho) s2.value = sel.value;
      handlers.mudarTamanho(sel.value);
    });
    const btn = el('button', { type: 'button', class: 'action-btn secondary-btn bs-btn-tela', id: `bs-tela-cheia${sufixo}`, texto: 'Tela cheia' });
    btn.addEventListener('click', () => handlers.telaCheia());
    selsTamanho.push(sel);
    btnsTela.push(btn);
    return el('div', { class: 'bs-linha bs-linha-tela' },
      el('label', { class: 'bs-campo' }, el('span', { class: 'bs-rotulo', texto: 'Tamanho' }), sel), btn);
  };
  const selsTamanho = [];
  const btnsTela = [];
  const ajuda = el('details', { class: 'bs-ajuda' }, el('summary', { texto: 'Controles' }),
    el('ul', {}, ...CONTROLES.map(([k, o]) => el('li', {}, el('kbd', { texto: k }), el('span', { texto: o })))));
  const menuTexto = el('p', { class: 'bs-menu-texto', id: 'bs-menu-texto', texto: 'FPS 5x5 contra bots' });
  const menu = el('div', { class: 'bs-overlay bs-menu', id: 'bs-menu' },
    el('h2', { class: 'bs-menu-titulo', texto: 'Block Strike' }),
    menuTexto,
    gradeModos,
    el('div', { class: 'bs-campo' }, el('span', { class: 'bs-rotulo', texto: 'Arma primária' }), gradeMenu),
    el('div', { class: 'bs-linha' },
      campoDif,
      el('label', { class: 'bs-campo' },
        el('span', { class: 'bs-rotulo', texto: 'Sensibilidade' }),
        el('span', { class: 'bs-slider' }, rngSens, rotuloSens)),
      el('label', { class: 'bs-campo' },
        el('span', { class: 'bs-rotulo', texto: 'Volume' }),
        el('span', { class: 'bs-slider' }, rngVol, rotuloVol)),
      el('label', { class: 'bs-campo' }, el('span', { class: 'bs-rotulo', texto: 'Mira' }), selMira)),
    criarControlesTela(''),
    btnJogar,
    ajuda);

  // SECOES
  palco.append(menu);

  // Aplica o que está salvo no storage aos controles do menu.
  hud.definirConfig = ({ primaria, dificuldade, sensibilidade, modo, volume, tamanho, corMira }) => {
    Object.assign(estado, { primaria, dificuldade, sensibilidade, modo, volume, tamanho, corMira });
    marcarModo();
    rngVol.value = String(volume);
    escrever(rotuloVol, `${Math.round(volume * 100)}%`);
    for (const sel of selsTamanho) sel.value = tamanho;
    selMira.value = corMira;
    palco.style.setProperty('--cor-mira', corMira);
    marcarSelecionada(gradeMenu, primaria);
    marcarSelecionada(gradeLoadout, primaria);
    selDif.value = dificuldade;
    rngSens.value = String(sensibilidade);
    escrever(rotuloSens, Number(sensibilidade).toFixed(1));
  };
  // Texto do botão de tela cheia conforme o estado atual.
  hud.estadoTelaCheia = (ligada) => {
    for (const b of btnsTela) escrever(b, ligada ? 'Sair da tela cheia' : 'Tela cheia');
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
  // Vivos de cada time: um quadradinho por jogador, apagado quando morre.
  const vivosAzul = el('div', { class: 'bs-vivos bs-vivos-azul', id: 'bs-vivos-azul' });
  const vivosLaranja = el('div', { class: 'bs-vivos bs-vivos-laranja', id: 'bs-vivos-laranja' });
  const recarga = el('div', { class: 'bs-recarga', id: 'bs-recarga', hidden: true },
    el('small', { texto: 'RECARREGANDO' }), el('div', { class: 'bs-recarga-barra' }, el('i')));
  const avisoMunicao = el('div', { class: 'bs-aviso-municao', id: 'bs-aviso-municao', hidden: true });
  const luneta = el('div', { class: 'bs-luneta', id: 'bs-luneta', hidden: true });
  const vinheta = el('div', { class: 'bs-vinheta', id: 'bs-vinheta' });
  const dicaTreino = el('div', { class: 'bs-dica-treino', id: 'bs-dica-treino', hidden: true,
    texto: 'Treino · B troca a arma · Esc pausa' });
  const radar = el('canvas', { class: 'bs-radar', id: 'bs-radar', width: RADAR_LADO, height: RADAR_LADO });
  const hudEl = el('div', { class: 'bs-hud', id: 'bs-hud', hidden: true },
    luneta, vinheta,
    el('div', { class: 'bs-topo' },
      el('div', { class: 'bs-placar' }, vivosAzul, placarAzul, timerEl, placarLaranja, vivosLaranja), roundEl),
    radar, killfeed, mira, hitmarker, danoArco, espectando, fimRound, dicaTrava, dicaTreino, recarga, avisoMunicao,
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
    vinheta.classList.remove('anim');
    void vinheta.offsetWidth;
    vinheta.classList.add('anim');
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
  // --- Radar (canto superior esquerdo): mapa de cima girando com a mira, aliados e inimigos avistados ---
  let fundoRadar = null; // { img, minX, minZ } desenhado uma vez a partir das caixas
  const ctxRadar = radar.getContext?.('2d') ?? null;
  function desenharFundo(caixas) {
    const xs = caixas.flatMap((c) => [c.min.x, c.max.x]);
    const zs = caixas.flatMap((c) => [c.min.z, c.max.z]);
    const minX = Math.min(...xs);
    const minZ = Math.min(...zs);
    const img = document.createElement('canvas');
    img.width = Math.ceil((Math.max(...xs) - minX) * RADAR_ESCALA);
    img.height = Math.ceil((Math.max(...zs) - minZ) * RADAR_ESCALA);
    const c = img.getContext('2d');
    c.fillStyle = 'rgba(40, 46, 58, 0.9)';
    c.fillRect(0, 0, img.width, img.height);
    for (const cx of caixas) {
      if (cx.max.y <= 0.01) continue; // o chão
      c.fillStyle = cx.max.y - cx.min.y >= 3 ? 'rgba(200, 205, 215, 0.85)' : 'rgba(150, 140, 120, 0.8)';
      c.fillRect((cx.min.x - minX) * RADAR_ESCALA, (cx.min.z - minZ) * RADAR_ESCALA,
        Math.max(1, (cx.max.x - cx.min.x) * RADAR_ESCALA), Math.max(1, (cx.max.z - cx.min.z) * RADAR_ESCALA));
    }
    return { img, minX, minZ };
  }
  // r: { caixas, eu: { pos, yaw, time }, entidades, avistados: Set<id> }
  hud.radar = (r) => {
    if (!ctxRadar) return;
    if (!fundoRadar) fundoRadar = desenharFundo(r.caixas);
    const c = ctxRadar;
    const meio = RADAR_LADO / 2;
    c.clearRect(0, 0, RADAR_LADO, RADAR_LADO);
    c.save();
    c.translate(meio, meio);
    c.rotate(r.eu.yaw); // a frente do jogador aponta para cima
    c.drawImage(fundoRadar.img, -(r.eu.pos.x - fundoRadar.minX) * RADAR_ESCALA, -(r.eu.pos.z - fundoRadar.minZ) * RADAR_ESCALA);
    for (const e of r.entidades) {
      if (!e.vivo || e === r.eu) continue;
      const aliado = e.time === r.eu.time;
      if (!aliado && !r.avistados.has(e.id)) continue;
      c.fillStyle = aliado ? '#60a5fa' : '#ef4444';
      c.beginPath();
      c.arc((e.pos.x - r.eu.pos.x) * RADAR_ESCALA, (e.pos.z - r.eu.pos.z) * RADAR_ESCALA, 3.5, 0, Math.PI * 2);
      c.fill();
    }
    c.restore();
    // O jogador: seta fixa no centro.
    c.fillStyle = '#fff';
    c.beginPath();
    c.moveTo(meio, meio - 6);
    c.lineTo(meio + 4.5, meio + 5);
    c.lineTo(meio - 4.5, meio + 5);
    c.closePath();
    c.fill();
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
    el('small', { class: 'bs-loadout-dica', texto: 'Teclas 1 a 4. Vale para este round e os seguintes.' }));
  palco.append(loadout);
  marcarSelecionada(gradeLoadout, estado.primaria);
  // Digit1–Digit4 no freeze: o index chama isto a partir de entrada.aoTecla.
  hud.loadoutAberto = () => !loadout.hidden;
  hud.textoLoadout = (texto) => escrever(loadout.querySelector('.bs-loadout-dica'), texto);
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
    t.append(el('thead', {}, el('tr', {}, ...['', 'K', 'D', 'K/D', 'HS%'].map((x, i) =>
      el('th', { texto: i === 0 ? titulo : x })))));
    const corpo = el('tbody');
    for (const e of ents) {
      const hs = e.kills > 0 ? Math.round((e.killsCabeca / e.kills) * 100) : 0;
      const tr = el('tr', { class: e.id === 0 ? 'voce' : '' });
      tr.append(el('td', { texto: e.nome }), el('td', { texto: String(e.kills) }),
        el('td', { texto: String(e.mortes) }), el('td', { texto: (e.kills / Math.max(1, e.mortes)).toFixed(2) }),
        el('td', { texto: `${hs}%` }));
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
    el('h2', { class: 'bs-menu-titulo', texto: 'Pausado' }), btnContinuar, criarControlesTela('-pausa'), btnSair);
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
    const treino = v.modo === 'treino';
    escrever(roundEl, treino ? 'Treino livre' : `Round ${v.round}`);
    escrever(timerEl, v.fase === 'freeze' ? String(Math.max(0, Math.ceil(v.tempo))) : mmss(v.tempo));
    timerEl.classList.toggle('acabando', !treino && v.fase === 'jogo' && v.tempo <= 10);
    hudEl.classList.toggle('bs-treino', treino);
    mostrar(dicaTreino, treino && v.vivo);
    marcarVivos(vivosAzul, v.entidades, 'azul');
    marcarVivos(vivosLaranja, v.entidades, 'laranja');
    escrever(hpEl, String(Math.max(0, Math.ceil(v.hp))));
    hpEl.classList.toggle('baixo', v.hp <= 30);
    const faca = !v.arma || !Number.isFinite(v.arma.pente);
    escrever(municaoEl, faca ? '—' : `${v.arma.municao} / ${treino ? '∞' : v.arma.reserva}`);
    const recarregando = Boolean(v.arma && v.arma.recarregandoAte > 0);
    mostrar(recarga, recarregando && v.vivo);
    if (recarregando) {
      const p = Math.round(Math.max(0, Math.min(1, v.progressoRecarga)) * 100);
      if (recarga.dataset.p !== String(p)) {
        recarga.dataset.p = String(p);
        recarga.querySelector('i').style.width = `${p}%`;
      }
    }
    const pouca = !faca && !recarregando && v.arma.municao <= Math.ceil(v.arma.pente * 0.25);
    municaoEl.classList.toggle('baixo', pouca);
    const semNada = pouca && v.arma.municao === 0 && v.arma.reserva === 0;
    mostrar(avisoMunicao, pouca && v.vivo && v.fase !== 'freeze');
    if (pouca) escrever(avisoMunicao, semNada ? 'Sem munição · troque de arma' : 'R para recarregar');
    mostrar(luneta, Boolean(v.luneta));
    mira.classList.toggle('escondida', Boolean(v.luneta));
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
    mostrar(loadout, (v.fase === 'freeze' || v.loadout) && v.vivo);
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

  hud.reiniciarRadar = () => { fundoRadar = null; };
  hud.destruir = () => {
    for (const t of timers) clearTimeout(t);
    timers.clear();
    for (const e of [menu, hudEl, loadout, tabela, pausa, fim]) e.remove();
  };
  // FIM-SECOES
  return hud;
}
