/**
 * Block Strike — interface em DOM sobre o canvas: menu, HUD, placar, pausa e fim de partida.
 * Só toca no DOM dentro de `raiz`; `atualizar` escreve apenas quando o valor muda.
 */

import { ARMAS, ITENS, familia } from './config.js';
import { MODELOS_ARMA } from './modelos.js';
import { ESTILOS_MIRA, LIMITES_MIRA, MIRA_PADRAO, aberturaMira } from './mira.js';

const PRIMARIAS = ['rifle', 'fuzil', 'rifleS', 'smg', 'miniSmg', 'smgS', 'sniper', 'escopeta'];
const TECLAS_LOADOUT = PRIMARIAS.map((_, i) => `Digit${i + 1}`);
const DIFICULDADES = [['facil', 'Fácil'], ['medio', 'Médio'], ['dificil', 'Difícil']];
const MODOS = [
  ['partida', 'Partida 5x5', 'Desarme com economia · primeiro a 13'],
  ['treino', 'Treino livre', 'Sozinho no mapa · munição infinita'],
];
const TAMANHOS = [['normal', 'Normal'], ['grande', 'Grande']];
// Loadout no estilo do CS2: uma coluna por categoria, com a cor da categoria na base do card.
const COLUNAS_LOADOUT = [
  ['Pistola', ['pistola']],
  ['Intermediárias', ['smg', 'miniSmg', 'smgS', 'escopeta']],
  ['Rifles', ['rifle', 'fuzil', 'rifleS', 'sniper']],
];
const COR_CATEGORIA = { pistola: '#4b69ff', smg: '#8847ff', escopeta: '#8847ff', rifle: '#d32ce6', sniper: '#eb4b4b' };
const BONECOS = [['azul', 'CT'], ['laranja', 'T']];
const CORES_MIRA = [['#4ade80', 'Verde'], ['#ffffff', 'Branca'], ['#22d3ee', 'Ciano'], ['#facc15', 'Amarela'], ['#f472b6', 'Rosa']];
const CONTROLES = [
  ['WASD', 'andar'], ['Mouse', 'mirar'], ['Clique', 'atirar'], ['Botão direito', 'luneta / estocada'],
  ['R', 'recarregar'], ['Espaço', 'pular'], ['C', 'agachar'], ['Shift', 'andar em silêncio'],
  ['E (segurar)', 'plantar / desarmar C4'], ['1 2 3 / roda', 'armas'], ['4', 'granada · 4 troca · esq. longe · dir. curto · ambos médio'], ['Q', 'última arma'], ['F', 'inspecionar arma'], ['Tab', 'placar'], ['B', 'trocar arma (treino)'],
];
// Nome do tipo de granada na mão, no lugar da munição.
const NOMES_GRANADA = { he: 'HE', flash: 'Flash', smoke: 'Smoke' };
const ZERAR_MS = 4000;
const RADAR_ESCALA = 2.6; // px por metro
const RADAR_LADO = 132; // px
const MAX_LINHAS_FEED = 5;
const VIDA_FEED_MS = 5000;
const VIDA_DANO_MS = 600;
const VIDA_HIT_MS = 180;
const MOTIVOS = {
  eliminacao: 'Time adversário eliminado', tempo: 'Tempo esgotado',
  'bomba-explodiu': 'A C4 explodiu', 'bomba-desarmada': 'A C4 foi desarmada',
};
const FEITOS_MVP = {
  desarmou: () => 'desarmou a C4', plantou: () => 'plantou a C4',
  abates: (n) => `${n} ${n === 1 ? 'abate' : 'abates'}`,
};
const PAPEIS = { T: 'Terrorista', CT: 'Contra-terrorista' };
const DICAS_C4 = {
  plantar: 'Segure E para plantar a C4', desarmar: 'Segure E para desarmar a C4',
};
const VIDA_ANUNCIO_MS = 3000;
const VIDA_GANHO_MS = 1800;
const GRUPOS_COMPRA = [['arma', 'Armas'], ['equip', 'Equipamento'], ['granada', 'Granadas']];
const TECLAS_COMPRA = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9', 'Digit0'];
const ROTULO_MOTIVO = { dinheiro: 'sem $', 'ja-tem': 'tem', papel: 'só CT' };
const dolar = (n) => `$${n}`;

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

// Miniatura de lado: as caixas do modelo projetadas no plano z/y, com o cano para a direita.
function desenharMiniatura(tipo, largura = 264, altura = 104) {
  const tela = el('canvas', { width: largura, height: altura, class: 'bs-miniatura' });
  const c = tela.getContext('2d');
  if (!c) return tela;
  const caixas = MODELOS_ARMA[tipo].caixas;
  const xs = caixas.flatMap(([, , d, , , z]) => [-z - d / 2, -z + d / 2]);
  const ys = caixas.flatMap(([, h, , , y]) => [y - h / 2, y + h / 2]);
  const x0 = Math.min(...xs);
  const y1 = Math.max(...ys);
  const larg = Math.max(...xs) - x0;
  const alt = y1 - Math.min(...ys);
  const esc = Math.min((largura - 24) / larg, (altura - 20) / alt);
  const ox = (largura - larg * esc) / 2;
  const oy = (altura - alt * esc) / 2;
  for (const [, h, d, , y, z, madeira] of caixas) {
    const x = ox + (-z - d / 2 - x0) * esc;
    const topo = oy + (y1 - (y + h / 2)) * esc;
    c.fillStyle = madeira ? '#a57a45' : '#7d858f';
    c.fillRect(x, topo, d * esc, h * esc);
    c.fillStyle = 'rgba(255, 255, 255, 0.18)'; // brilho na aresta de cima
    c.fillRect(x, topo, d * esc, Math.max(1.5, h * esc * 0.2));
  }
  return tela;
}

function marcarSelecionada(grade, tipo) {
  for (const b of grade.children) b.classList.toggle('selecionada', b.dataset.arma === tipo);
}

export function criarHud(raiz, handlers) {
  const palco = raiz.querySelector('.bs-stage');
  const estado = {
    primaria: 'rifle', dificuldade: 'medio', sensibilidade: 1, modo: 'partida', volume: 0.8,
    tamanho: 'normal', mira: { ...MIRA_PADRAO }, sensLuneta: 1, boneco: 'azul',
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
    previa = tipo;
    marcarLoadout();
    marcarSelecionada(gradeLoadout, tipo);
    handlers.escolherPrimaria(tipo);
  };

  // --- Menu ---
  // Clicar no card mostra a arma na mão do boneco; Equipar salva (vale no treino e no menu).
  let previa = estado.primaria;
  const cardsLoadout = new Map();
  const btnEquipar = el('button', { type: 'button', id: 'bs-equipar', class: 'bs-equipar', texto: 'Equipada' });
  const gradeEquip = el('div', { class: 'bs-equip-grade', id: 'bs-menu-armas' });
  for (const [titulo, tipos] of COLUNAS_LOADOUT) {
    const col = el('div', { class: 'bs-equip-col' }, el('h4', { class: 'bs-equip-cat', texto: titulo }));
    for (const tipo of tipos) {
      const card = el('button', { type: 'button', class: 'bs-card-arma', 'data-arma': tipo },
        desenharMiniatura(tipo), el('span', { texto: ARMAS[tipo].nome }));
      card.style.setProperty('--cor-cat', COR_CATEGORIA[familia(tipo)]);
      card.addEventListener('click', () => verPrevia(tipo));
      cardsLoadout.set(tipo, card);
      col.append(card);
    }
    gradeEquip.append(col);
  }
  const marcarLoadout = () => {
    for (const [tipo, card] of cardsLoadout) {
      card.classList.toggle('selecionada', tipo === previa);
      card.classList.toggle('equipada', tipo === estado.primaria || tipo === 'pistola');
    }
    for (const col of gradeEquip.children) {
      col.classList.toggle('ativa', Boolean(col.querySelector(`[data-arma="${estado.primaria}"]`)));
    }
    const inicial = ARMAS[previa].slot !== 'primaria';
    btnEquipar.disabled = inicial || previa === estado.primaria;
    escrever(btnEquipar, inicial ? 'Inicial' : previa === estado.primaria ? 'Equipada' : 'Equipar');
  };
  const verPrevia = (tipo) => {
    previa = tipo;
    marcarLoadout();
    handlers.previaArma(tipo === estado.primaria ? null : tipo);
  };
  btnEquipar.addEventListener('click', () => {
    if (ARMAS[previa].slot === 'primaria') escolher(previa);
    handlers.previaArma(null);
  });
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
  const rngLuneta = el('input', {
    type: 'range', id: 'bs-sens-luneta', min: '0.3', max: '2', step: '0.05', value: '1',
  });
  const rotuloLuneta = el('span', { class: 'bs-valor', texto: '1.00' });
  rngLuneta.addEventListener('input', () => {
    const n = Number(rngLuneta.value);
    estado.sensLuneta = n;
    escrever(rotuloLuneta, n.toFixed(2));
    handlers.mudarSensLuneta(n);
  });
  // Boneco do fundo do menu: CT (azul) ou T (laranja). Só visual.
  const gradeBoneco = el('div', { class: 'bs-armas', id: 'bs-boneco' });
  for (const [time, rotulo] of BONECOS) {
    const b = el('button', { type: 'button', class: 'bs-arma-btn', 'data-time': time, texto: rotulo });
    b.addEventListener('click', () => {
      estado.boneco = time;
      marcarBoneco();
      handlers.mudarBoneco(time);
    });
    gradeBoneco.append(b);
  }
  const marcarBoneco = () => {
    for (const b of gradeBoneco.children) b.classList.toggle('selecionada', b.dataset.time === estado.boneco);
  };
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

  // --- Crosshair Lab: estilo, sliders, ponto e cor, com a prévia sobre um pedaço do mapa ---
  const novaMira = (id) => el('div', { class: 'bs-mira', id },
    el('i', { class: 'bs-mira-t' }), el('i', { class: 'bs-mira-b' }),
    el('i', { class: 'bs-mira-e' }), el('i', { class: 'bs-mira-d' }), el('i', { class: 'bs-mira-p' }));
  const mira = novaMira('bs-mira'); // a do HUD: vai para o palco junto com o resto do HUD, mais abaixo
  const miraPrevia = novaMira('bs-mira-previa-alvo');
  const previaMira = el('div', { class: 'bs-mira-previa', id: 'bs-mira-previa' }, miraPrevia);
  const gradeEstilos = el('div', { class: 'bs-armas bs-mira-estilos', id: 'bs-mira-estilo' });
  for (const [v, rotulo] of ESTILOS_MIRA) {
    const b = el('button', { type: 'button', class: 'bs-arma-btn', 'data-estilo': v, texto: rotulo });
    b.addEventListener('click', () => mudarMira({ estilo: v }));
    gradeEstilos.append(b);
  }
  const slidersMira = {};
  const sliderMira = (chave) => {
    const [min, max, step] = LIMITES_MIRA[chave];
    const rng = el('input', { type: 'range', id: `bs-mira-${chave}`, class: 'bs-mira-rng', min: String(min), max: String(max), step: String(step) });
    const rotulo = el('span', { class: 'bs-valor' });
    rng.addEventListener('input', () => mudarMira({ [chave]: Number(rng.value) }));
    slidersMira[chave] = { rng, rotulo };
    return el('span', { class: 'bs-slider' }, rng, rotulo);
  };
  const chkPonto = el('input', { type: 'checkbox', id: 'bs-mira-ponto' });
  chkPonto.addEventListener('change', () => mudarMira({ ponto: chkPonto.checked }));
  const coresMira = el('div', { class: 'bs-mira-cores', id: 'bs-mira-cores' });
  for (const [v, rotulo] of CORES_MIRA) {
    const b = el('button', { type: 'button', class: 'bs-mira-cor', 'data-cor': v, title: rotulo, 'aria-label': `Cor ${rotulo}` });
    b.style.background = v;
    b.addEventListener('click', () => mudarMira({ cor: v }));
    coresMira.append(b);
  }
  const corLivre = el('input', { type: 'color', id: 'bs-mira-cor', class: 'bs-mira-cor-livre', title: 'Outra cor' });
  corLivre.addEventListener('input', () => mudarMira({ cor: corLivre.value }));
  coresMira.append(corLivre);
  const btnMiraPadrao = el('button', { type: 'button', class: 'action-btn secondary-btn bs-btn-tela', id: 'bs-mira-padrao', texto: 'Restaurar padrão' });
  btnMiraPadrao.addEventListener('click', () => mudarMira({ ...MIRA_PADRAO }));
  // --- Carreira: números das partidas 5x5 salvos no navegador ---
  const carreiraEl = el('div', { class: 'bs-carreira', id: 'bs-carreira' });
  const btnZerar = el('button', { type: 'button', class: 'action-btn secondary-btn bs-btn-tela', id: 'bs-zerar-carreira', texto: 'Zerar estatísticas', 'aria-live': 'polite' });
  // Dois cliques: o primeiro só pede confirmação por alguns segundos.
  let timerZerar = null;
  btnZerar.addEventListener('click', () => {
    if (!timerZerar) {
      escrever(btnZerar, 'Clique de novo para zerar');
      timerZerar = depois(() => { timerZerar = null; escrever(btnZerar, 'Zerar estatísticas'); }, ZERAR_MS);
      return;
    }
    clearTimeout(timerZerar);
    timers.delete(timerZerar);
    timerZerar = null;
    escrever(btnZerar, 'Zerar estatísticas');
    handlers.zerarCarreira();
  });
  const nomeArma = (tipo) => ARMAS[tipo]?.nome ?? NOMES_GRANADA[tipo] ?? tipo;
  hud.definirCarreira = (r) => {
    if (r.partidas === 0 && r.kills === 0 && r.mortes === 0) {
      carreiraEl.replaceChildren(el('p', { class: 'bs-carreira-vazia', texto: 'Jogue uma partida 5x5 para ver suas estatísticas aqui.' }));
      return;
    }
    const bloco = (rotulo, valor, detalhe) => el('div', { class: 'bs-stat' },
      el('small', { texto: rotulo }), el('strong', { texto: String(valor) }), detalhe ? el('span', { texto: detalhe }) : null);
    const grade = el('div', { class: 'bs-stats' },
      bloco('K/D', r.kd.toFixed(2), `${r.kills} K · ${r.mortes} D`),
      bloco('Precisão', `${r.precisao}%`, 'tiros que acertaram'),
      bloco('Headshot', `${r.hs}%`, 'dos abates'),
      bloco('Vitórias', `${r.taxaVitoria}%`, `${r.vitorias} V · ${r.derrotas} D${r.empates ? ` · ${r.empates} E` : ''}`),
      bloco('MVPs', r.mvps, `${r.partidas} ${r.partidas === 1 ? 'partida' : 'partidas'}`),
      bloco('Assistências', r.assists, ''));
    const armas = el('ol', { class: 'bs-armas-fav' },
      ...r.armasFav.map(([tipo, n]) => el('li', {}, el('span', { texto: nomeArma(tipo) }), el('b', { texto: `${n} ${n === 1 ? 'abate' : 'abates'}` }))));
    carreiraEl.replaceChildren(grade,
      r.armasFav.length ? el('div', { class: 'bs-campo' }, el('span', { class: 'bs-rotulo', texto: 'Armas favoritas' }), armas) : null);
  };

  // Desenho da mira via CSS: tamanho, espessura, estilo e ponto em variáveis/atributos do elemento.
  const desenharMira = (alvo, m) => {
    alvo.dataset.estilo = m.estilo;
    alvo.dataset.ponto = m.ponto ? '1' : '0';
    alvo.style.setProperty('--comp', `${m.tamanho}px`);
    alvo.style.setProperty('--esp', `${m.espessura}px`);
    // Recuo inteiro até o meio: com espessura ímpar a mira fica 0,5px fora do centro, mas nítida.
    alvo.style.setProperty('--meio', `${-Math.floor(m.espessura / 2)}px`);
    alvo.style.setProperty('--meio-pt', `${-Math.floor((m.estilo === 'ponto' ? m.espessura + 2 : m.espessura) / 2)}px`);
  };
  const marcarMira = () => {
    const m = estado.mira;
    const marcar = (b, sel) => { b.classList.toggle('selecionada', sel); b.setAttribute('aria-pressed', String(sel)); };
    for (const b of gradeEstilos.children) marcar(b, b.dataset.estilo === m.estilo);
    for (const [chave, { rng, rotulo }] of Object.entries(slidersMira)) {
      rng.value = String(m[chave]);
      escrever(rotulo, `${m[chave]}px`);
    }
    chkPonto.disabled = m.estilo === 'ponto';
    chkPonto.checked = m.ponto || chkPonto.disabled; // só o ponto: o ponto aparece sempre
    for (const b of coresMira.querySelectorAll('.bs-mira-cor')) marcar(b, b.dataset.cor === m.cor);
    corLivre.value = m.cor;
    palco.style.setProperty('--cor-mira', m.cor);
    desenharMira(miraPrevia, m);
    miraPrevia.style.setProperty('--abertura', `${aberturaMira(m, 0)}px`);
    desenharMira(mira, m);
    mira.dataset.abertura = ''; // a abertura do HUD é recalculada no próximo quadro
  };
  const mudarMira = (parcial) => {
    estado.mira = { ...estado.mira, ...parcial };
    marcarMira();
    handlers.mudarMira({ ...estado.mira });
  };

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
  const ajuda = el('div', { class: 'bs-ajuda' },
    el('ul', {}, ...CONTROLES.map(([k, o]) => el('li', {}, el('kbd', { texto: k }), el('span', { texto: o })))));
  const menuTexto = el('p', { class: 'bs-menu-texto', id: 'bs-menu-texto', texto: 'FPS 5x5 contra bots' });
  const campo = (rotulo, ...filhos) => el('label', { class: 'bs-campo' }, el('span', { class: 'bs-rotulo', texto: rotulo }), ...filhos);
  // Grade de botões: num <label>, clicar no rótulo apertaria o primeiro botão.
  const grupo = (rotulo, ...filhos) => el('div', { class: 'bs-campo', role: 'group', 'aria-label': rotulo },
    el('span', { class: 'bs-rotulo', texto: rotulo }), ...filhos);
  // Menu no estilo do CS2: abas na barra do topo, painel à esquerda e o Jogar fixo no canto.
  const ABAS = [
    ['jogar', 'Jogar', [gradeModos, campoDif]],
    ['loadout', 'Loadout', [
      el('div', { class: 'bs-equip-topo' }, el('span', { class: 'bs-rotulo', texto: 'Arma primária · treino e menu' }), btnEquipar),
      gradeEquip,
      el('div', { class: 'bs-campo' }, el('span', { class: 'bs-rotulo', texto: 'Boneco do menu' }), gradeBoneco),
    ]],
    ['mira', 'Mira', [
      previaMira,
      grupo('Estilo', gradeEstilos),
      campo('Tamanho', sliderMira('tamanho')),
      campo('Espessura', sliderMira('espessura')),
      campo('Abertura', sliderMira('abertura')),
      el('label', { class: 'bs-check' }, chkPonto, el('span', { texto: 'Ponto central' })),
      grupo('Cor', coresMira),
      btnMiraPadrao,
    ]],
    ['carreira', 'Carreira', [carreiraEl, btnZerar]],
    ['opcoes', 'Opções', [
      campo('Sensibilidade', el('span', { class: 'bs-slider' }, rngSens, rotuloSens)),
      campo('Sensibilidade da luneta', el('span', { class: 'bs-slider' }, rngLuneta, rotuloLuneta)),
      campo('Volume', el('span', { class: 'bs-slider' }, rngVol, rotuloVol)),
      criarControlesTela(''),
    ]],
    ['controles', 'Controles', [ajuda]],
  ];
  const abas = el('nav', { class: 'bs-menu-abas', id: 'bs-menu-abas' });
  const paineis = [];
  for (const [id, rotulo, conteudo] of ABAS) {
    const b = el('button', { type: 'button', class: 'bs-menu-aba', 'data-aba': id, texto: rotulo });
    b.addEventListener('click', () => abrirAba(id));
    abas.append(b);
    paineis.push(el('div', { class: 'bs-menu-painel', 'data-aba': id }, ...conteudo));
  }
  const abrirAba = (id) => {
    menu.dataset.aba = id;
    for (const b of abas.children) b.classList.toggle('selecionada', b.dataset.aba === id);
    for (const pn of paineis) mostrar(pn, pn.dataset.aba === id);
    if (id !== 'loadout' && previa !== estado.primaria) verPrevia(estado.primaria); // saiu sem equipar: volta a arma equipada
  };
  const menu = el('div', { class: 'bs-overlay bs-menu', id: 'bs-menu' },
    el('header', { class: 'bs-menu-topo' }, el('h2', { class: 'bs-menu-titulo', texto: 'Block Strike' }), abas),
    el('section', { class: 'bs-menu-lado' }, menuTexto, ...paineis),
    btnJogar);
  abrirAba('jogar');

  // SECOES
  palco.append(menu);

  // Aplica o que está salvo no storage aos controles do menu.
  hud.definirConfig = ({ primaria, dificuldade, sensibilidade, modo, volume, tamanho, mira: cfgMira, sensLuneta, boneco }) => {
    Object.assign(estado, { primaria, dificuldade, sensibilidade, modo, volume, tamanho, mira: { ...cfgMira }, sensLuneta, boneco });
    marcarModo();
    marcarBoneco();
    rngLuneta.value = String(sensLuneta);
    escrever(rotuloLuneta, Number(sensLuneta).toFixed(2));
    rngVol.value = String(volume);
    escrever(rotuloVol, `${Math.round(volume * 100)}%`);
    for (const sel of selsTamanho) sel.value = tamanho;
    marcarMira();
    previa = primaria;
    marcarLoadout();
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
  // Relatório de dano do round (morto ou no fim do round): o que deu e levou de cada inimigo.
  const relatorio = el('div', { class: 'bs-relatorio', id: 'bs-relatorio', hidden: true });
  // Não bloqueia nada: só avisa que o mouse ainda não está preso ao jogo.
  const dicaTrava = el('div', { class: 'bs-dica-trava', id: 'bs-dica-trava', hidden: true,
    texto: 'Clique na tela para mirar' });
  const fimRoundTitulo = el('strong');
  const fimRoundMotivo = el('small');
  const fimRoundMvp = el('div', { class: 'bs-mvp', id: 'bs-mvp', hidden: true });
  const fimRound = el('div', { class: 'bs-fim-round', id: 'bs-fim-round', hidden: true },
    fimRoundTitulo, fimRoundMotivo, fimRoundMvp);
  // Vivos de cada time: um quadradinho por jogador, apagado quando morre.
  const vivosAzul = el('div', { class: 'bs-vivos bs-vivos-azul', id: 'bs-vivos-azul' });
  const vivosLaranja = el('div', { class: 'bs-vivos bs-vivos-laranja', id: 'bs-vivos-laranja' });
  const recarga = el('div', { class: 'bs-recarga', id: 'bs-recarga', hidden: true },
    el('small', { texto: 'RECARREGANDO' }), el('div', { class: 'bs-recarga-barra' }, el('i')));
  const avisoMunicao = el('div', { class: 'bs-aviso-municao', id: 'bs-aviso-municao', hidden: true });
  const luneta = el('div', { class: 'bs-luneta', id: 'bs-luneta', hidden: true });
  const vinheta = el('div', { class: 'bs-vinheta', id: 'bs-vinheta' });
  const dicaTreino = el('div', { class: 'bs-dica-treino', id: 'bs-dica-treino', hidden: true,
    texto: 'Treino · B troca a arma · 4 granada · Esc pausa' });
  const radar = el('canvas', { class: 'bs-radar', id: 'bs-radar', width: RADAR_LADO, height: RADAR_LADO });
  // C4: aviso do bombsite, barra de plantar/desarmar, dica de tecla, anúncio central e clarão da explosão.
  const bombaInfo = el('div', { class: 'bs-bomba-info', id: 'bs-bomba-info', hidden: true });
  const acaoBarra = el('div', { class: 'bs-acao', id: 'bs-acao', hidden: true },
    el('small'), el('div', { class: 'bs-recarga-barra' }, el('i')));
  const dicaC4 = el('div', { class: 'bs-dica-c4', id: 'bs-dica-c4', hidden: true });
  const anuncio = el('div', { class: 'bs-anuncio', id: 'bs-anuncio', hidden: true });
  const clarao = el('div', { class: 'bs-explosao', id: 'bs-explosao', hidden: true });
  const cegueira = el('div', { class: 'bs-cegueira', id: 'bs-cegueira', hidden: true });
  const hudEl = el('div', { class: 'bs-hud', id: 'bs-hud', hidden: true },
    luneta, vinheta,
    el('div', { class: 'bs-topo' },
      el('div', { class: 'bs-placar' }, vivosAzul, placarAzul, timerEl, placarLaranja, vivosLaranja), roundEl),
    radar, killfeed, mira, hitmarker, danoArco, espectando, relatorio, fimRound, dicaTrava, dicaTreino, recarga, avisoMunicao,
    bombaInfo, acaoBarra, dicaC4, anuncio, clarao, cegueira,
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
  hud.morte = ({ assassino, assistente, vitima, arma, cabeca }) => {
    const nome = (e) => el('b', { class: `bs-time-${e.time}`, texto: e.nome });
    // Morte pela explosão da C4 não tem assassino: só a vítima e o rótulo da bomba.
    const linha = el('div', { class: 'bs-feed-linha' }, assassino ? nome(assassino) : null,
      assistente ? el('span', { class: 'bs-feed-assist', texto: '+' }) : null, assistente ? nome(assistente) : null,
      el('span', { class: 'bs-feed-arma', texto: `[${ARMAS[arma]?.nome ?? 'C4'}]` }));
    if (cabeca) linha.append(el('span', { class: 'bs-feed-cabeca', texto: '☠', title: 'Headshot' }));
    linha.append(nome(vitima));
    killfeed.append(linha);
    while (killfeed.children.length > MAX_LINHAS_FEED) killfeed.firstChild.remove();
    depois(() => linha.remove(), VIDA_FEED_MS);
  };
  // Anúncio grande no centro (C4 plantada, desarmada...) e clarão branco da explosão (mais forte de perto).
  let timerAnuncio = null;
  hud.anuncio = (texto, tom = 'aviso') => {
    anuncio.className = `bs-anuncio ${tom}`;
    escrever(anuncio, texto);
    mostrar(anuncio, true);
    if (timerAnuncio) { clearTimeout(timerAnuncio); timers.delete(timerAnuncio); }
    timerAnuncio = depois(() => mostrar(anuncio, false), VIDA_ANUNCIO_MS);
  };
  hud.flashExplosao = (distancia = 0) => {
    clarao.style.setProperty('--forca', String(Math.max(0.25, Math.min(1, 1.1 - distancia / 40))));
    clarao.classList.remove('anim');
    mostrar(clarao, true);
    void clarao.offsetWidth;
    clarao.classList.add('anim');
    depois(() => mostrar(clarao, false), 1400);
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
  // Bombsites (retângulo com a letra) e a C4 solta ou plantada, no mesmo referencial do radar.
  function desenharBombsites(c, r) {
    const px = (x) => (x - r.eu.pos.x) * RADAR_ESCALA;
    const pz = (z) => (z - r.eu.pos.z) * RADAR_ESCALA;
    c.lineWidth = 1.5;
    c.strokeStyle = 'rgba(250, 204, 21, 0.9)';
    c.fillStyle = 'rgba(250, 204, 21, 0.12)';
    c.font = 'bold 13px sans-serif';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    for (const [nome, s] of Object.entries(r.sites)) {
      c.fillRect(px(s.min.x), pz(s.min.z), (s.max.x - s.min.x) * RADAR_ESCALA, (s.max.z - s.min.z) * RADAR_ESCALA);
      c.strokeRect(px(s.min.x), pz(s.min.z), (s.max.x - s.min.x) * RADAR_ESCALA, (s.max.z - s.min.z) * RADAR_ESCALA);
      c.save();
      c.translate(px(s.centro.x), pz(s.centro.z));
      c.rotate(-r.eu.yaw); // a letra fica em pé, mesmo com o mapa girando
      c.fillStyle = '#facc15';
      c.fillText(nome, 0, 0);
      c.restore();
    }
    const b = r.bomba;
    if (b && b.pos && !b.desarmada) {
      const pisca = b.plantada && Math.floor(performance.now() / 300) % 2 === 0;
      c.fillStyle = b.plantada ? (pisca ? '#ffffff' : '#ef4444') : '#facc15';
      c.fillRect(px(b.pos.x) - 3, pz(b.pos.z) - 3, 6, 6);
    }
  }
  // r: { caixas, eu: { pos, yaw, time }, entidades, avistados: Set<id>, sites?, bomba? }
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
    if (r.sites) desenharBombsites(c, r);
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
    mostrar(anuncio, false);
    mostrar(clarao, false);
    killfeed.replaceChildren();
    mostrar(hitmarker, false);
    mostrar(danoArco, false);
  };
  let chaveRelatorio = '';
  const textoDano = (r) => (r.acertos ? `${r.dano} em ${r.acertos}` : '—');
  const renderRelatorio = (linhas) => {
    const chave = linhas.map((l) => `${l.id}:${l.vivo}:${l.deu.dano}:${l.deu.acertos}:${l.levou.dano}:${l.levou.acertos}`).join('|');
    if (chave === chaveRelatorio) return;
    chaveRelatorio = chave;
    const corpo = el('tbody');
    for (const l of linhas) {
      corpo.append(el('tr', { class: l.vivo ? '' : 'morto' },
        el('td', {}, el('b', { class: `bs-time-${l.time}`, texto: l.nome })),
        el('td', { class: 'bs-rel-deu', texto: textoDano(l.deu) }), el('td', { class: 'bs-rel-levou', texto: textoDano(l.levou) })));
    }
    relatorio.replaceChildren(el('table', {},
      el('thead', {}, el('tr', {}, ...['Dano no round', 'Deu', 'Levou'].map((x) => el('th', { texto: x })))), corpo));
  };

  // --- Loadout (só no freeze) ---
  const gradeLoadout = criarGradeArmas('bs-loadout-armas', escolher, true);
  const loadout = el('div', { class: 'bs-loadout', id: 'bs-loadout', hidden: true },
    el('strong', { texto: 'Escolha sua arma' }), gradeLoadout,
    el('small', { class: 'bs-loadout-dica', texto: 'Teclas 1 a 8. Vale para este round e os seguintes.' }));
  palco.append(loadout);
  marcarSelecionada(gradeLoadout, estado.primaria);
  // Digit1–Digit4 no freeze: o index chama isto a partir de entrada.aoTecla.
  // --- Menu de compra (partida com economia): como no CS, um número abre o grupo e o seguinte compra o item ---
  const ordemItens = Object.keys(ITENS);
  const itensDoGrupo = GRUPOS_COMPRA.map(([grupo]) => ordemItens.filter((i) => ITENS[i].grupo === grupo));
  let grupoAtivo = -1;
  const botoesCompra = new Map();
  const compraTitulo = el('strong', { texto: 'Compra' });
  const compraColunas = el('div', { class: 'bs-compra-colunas' });
  for (const [g, [, rotulo]] of GRUPOS_COMPRA.entries()) {
    const col = el('div', { class: 'bs-compra-col' }, el('small', {}, el('kbd', { texto: String(g + 1) }), ` ${rotulo}`));
    for (const [n, id] of itensDoGrupo[g].entries()) {
      const b = el('button', { type: 'button', class: 'bs-compra-item', 'data-item': id },
        el('kbd', { texto: String(n + 1) }),
        el('span', { texto: ITENS[id].nome }), el('em', { texto: dolar(ITENS[id].preco) }));
      b.addEventListener('click', () => handlers.comprar(id));
      botoesCompra.set(id, b);
      col.append(b);
    }
    compraColunas.append(col);
  }
  const compra = el('div', { class: 'bs-loadout bs-compra', id: 'bs-compra', hidden: true },
    compraTitulo, compraColunas,
    el('small', { class: 'bs-loadout-dica', texto: 'Número do grupo e depois do item (Backspace volta), ou aperte B e clique. O que sobreviver continua com você.' }));
  palco.append(compra);
  let chaveCompra = '';
  const renderCompra = (v) => {
    escrever(compraTitulo, `Compra · ${dolar(v.dinheiro)} · fecha em ${Math.max(0, Math.ceil(v.tempo))}s`);
    const chave = v.compra.map((i) => `${i.id}:${i.motivo ?? ''}`).join('|');
    if (chave === chaveCompra) return;
    chaveCompra = chave;
    for (const i of v.compra) {
      const b = botoesCompra.get(i.id);
      b.classList.toggle('sem-dinheiro', i.motivo === 'dinheiro');
      b.classList.toggle('tem', i.motivo === 'ja-tem');
      b.classList.toggle('indisponivel', i.motivo === 'papel');
      b.title = i.motivo ? ROTULO_MOTIVO[i.motivo] ?? '' : '';
    }
  };
  const abrirGrupo = (g) => {
    grupoAtivo = g;
    compraColunas.classList.toggle('escolhendo', g >= 0);
    [...compraColunas.children].forEach((col, i) => col.classList.toggle('ativa', i === g));
  };
  hud.teclaCompra = (code) => {
    if (compra.hidden) {
      if (grupoAtivo >= 0) abrirGrupo(-1);
      return false;
    }
    if (code === 'Backspace' && grupoAtivo >= 0) {
      abrirGrupo(-1);
      return true;
    }
    const i = TECLAS_COMPRA.indexOf(code);
    if (i < 0) return false;
    if (grupoAtivo < 0) {
      if (i < GRUPOS_COMPRA.length) abrirGrupo(i);
    } else {
      const id = itensDoGrupo[grupoAtivo][i];
      if (id) handlers.comprar(id);
      abrirGrupo(-1);
    }
    return true;
  };
  // Dinheiro e equipamento na base da tela; "+$" sobe quando entra dinheiro.
  const dinheiroEl = el('div', { class: 'bs-dinheiro', id: 'bs-dinheiro', hidden: true });
  const ganhoEl = el('div', { class: 'bs-ganho', id: 'bs-ganho', hidden: true });
  let timerGanho = null;
  hud.ganhou = (valor, motivo = '') => {
    if (!valor || valor <= 0) return;
    escrever(ganhoEl, `+${dolar(valor)}${motivo ? ` · ${motivo}` : ''}`);
    mostrar(ganhoEl, true);
    if (timerGanho) { clearTimeout(timerGanho); timers.delete(timerGanho); }
    timerGanho = depois(() => mostrar(ganhoEl, false), VIDA_GANHO_MS);
  };
  hudEl.append(dinheiroEl, ganhoEl);
  hud.loadoutAberto = () => !loadout.hidden;
  hud.textoLoadout = (texto) => escrever(loadout.querySelector('.bs-loadout-dica'), texto);
  hud.teclaLoadout = (code) => {
    const i = TECLAS_LOADOUT.indexOf(code);
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
    t.append(el('thead', {}, el('tr', {}, ...['', 'K', 'A', 'D', 'K/D', 'HS%'].map((x, i) =>
      el('th', { texto: i === 0 ? titulo : x })))));
    const corpo = el('tbody');
    for (const e of ents) {
      const hs = e.kills > 0 ? Math.round((e.killsCabeca / e.kills) * 100) : 0;
      const tr = el('tr', { class: e.id === 0 ? 'voce' : '' });
      tr.append(el('td', { texto: e.mvps ? `${e.nome} ★${e.mvps}` : e.nome }), el('td', { texto: String(e.kills) }), el('td', { texto: String(e.assists) }),
        el('td', { texto: String(e.mortes) }), el('td', { texto: (e.kills / Math.max(1, e.mortes)).toFixed(2) }),
        el('td', { texto: `${hs}%` }));
      corpo.append(tr);
    }
    t.append(corpo);
    return t;
  };
  const renderTabela = (entidades) => {
    const chave = entidades.map((e) => `${e.id}:${e.kills}:${e.assists}:${e.mortes}:${e.killsCabeca}:${e.mvps}`).join('|');
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
    escrever(roundEl, treino ? 'Treino livre' : `Round ${v.round} · ${PAPEIS[v.papel] ?? ''}`);
    const b = v.bomba;
    const plantada = Boolean(b && b.plantada && v.fase === 'jogo');
    // Plantada: o relógio do round dá lugar ao da C4.
    const texto = v.fase === 'freeze' ? String(Math.max(0, Math.ceil(v.tempo)))
      : plantada ? String(Math.max(0, Math.ceil(b.restante))) : mmss(v.tempo);
    escrever(timerEl, texto);
    timerEl.classList.toggle('acabando', !treino && !plantada && v.fase === 'jogo' && v.tempo <= 10);
    timerEl.classList.toggle('bomba', plantada);
    mostrar(bombaInfo, plantada);
    if (plantada) escrever(bombaInfo, `C4 plantada · bombsite ${b.site ?? ''}`.trim());
    // Plantar/desarmar: barra de progresso e a dica da tecla.
    const agindo = Boolean(b && b.acao && v.vivo);
    mostrar(acaoBarra, agindo);
    if (agindo) {
      escrever(acaoBarra.firstChild, b.acao === 'plantar' ? 'PLANTANDO' : 'DESARMANDO');
      const p = String(Math.round(b.progresso * 100));
      if (acaoBarra.dataset.p !== p) {
        acaoBarra.dataset.p = p;
        acaoBarra.querySelector('i').style.width = `${p}%`;
      }
    }
    const dica = b && v.vivo && !agindo
      ? DICAS_C4[b.dica] ?? (b.levaC4 ? 'Você leva a C4 · vá a um bombsite (A ou B)' : '') : '';
    mostrar(dicaC4, Boolean(dica));
    if (dica) escrever(dicaC4, dica);
    hudEl.classList.toggle('bs-treino', treino);
    mostrar(dicaTreino, treino && v.vivo);
    marcarVivos(vivosAzul, v.entidades, 'azul');
    marcarVivos(vivosLaranja, v.entidades, 'laranja');
    escrever(hpEl, String(Math.max(0, Math.ceil(v.hp))));
    hpEl.classList.toggle('baixo', v.hp <= 30);
    const granada = v.arma?.tipo === 'granada';
    const faca = !v.arma || !Number.isFinite(v.arma.pente);
    if (granada) escrever(municaoEl, `${NOMES_GRANADA[v.arma.sel] ?? ''} ${treino ? '∞' : v.arma.n}`.trim());
    else escrever(municaoEl, faca ? '—' : `${v.arma.municao} / ${treino ? '∞' : v.arma.reserva}`);
    const recarregando = Boolean(v.arma && v.arma.recarregandoAte > 0);
    mostrar(recarga, recarregando && v.vivo);
    if (recarregando) {
      const p = Math.round(Math.max(0, Math.min(1, v.progressoRecarga)) * 100);
      if (recarga.dataset.p !== String(p)) {
        recarga.dataset.p = String(p);
        recarga.querySelector('i').style.width = `${p}%`;
      }
    }
    const pouca = !faca && !granada && !recarregando && v.arma.municao <= Math.ceil(v.arma.pente * 0.25);
    municaoEl.classList.toggle('baixo', pouca);
    const semNada = pouca && v.arma.municao === 0 && v.arma.reserva === 0;
    mostrar(avisoMunicao, pouca && v.vivo && v.fase !== 'freeze');
    if (pouca) escrever(avisoMunicao, semNada ? 'Sem munição · troque de arma' : 'R para recarregar');
    mostrar(luneta, Boolean(v.luneta));
    mira.classList.toggle('escondida', Boolean(v.luneta));
    escrever(armaEl, v.arma ? ARMAS[v.arma.tipo].nome : '');
    // Abertura da mira em px, quantizada: o spread (rad) vira fração da altura do palco (só na dinâmica).
    const abertura = aberturaMira(estado.mira, Math.min(44, Math.round(Math.tan(v.spread) * palco.clientHeight * 0.75)));
    if (mira.dataset.abertura !== String(abertura)) {
      mira.dataset.abertura = String(abertura);
      mira.style.setProperty('--abertura', `${abertura}px`);
    }
    mostrar(mira, v.vivo);
    mostrar(relatorio, Boolean(v.relatorio?.length));
    if (v.relatorio?.length) renderRelatorio(v.relatorio);
    mostrar(espectando, !v.vivo && Boolean(v.espectando));
    if (v.espectando) escrever(espectando, `Assistindo: ${v.espectando}`);
    mostrar(loadout, !v.compra && (v.fase === 'freeze' || v.loadout) && v.vivo);
    // Flash: tela branca que some aos poucos (a intensidade vem pronta, de 0 a 1).
    mostrar(cegueira, v.cegueira > 0);
    if (v.cegueira > 0) cegueira.style.opacity = String(v.cegueira.toFixed(2));
    mostrar(compra, Boolean(v.compra));
    if (v.compra) renderCompra(v);
    mostrar(dinheiroEl, v.dinheiro !== null && v.dinheiro !== undefined);
    if (v.dinheiro !== null && v.dinheiro !== undefined) {
      const eq = v.equip;
      const g = eq.granadas;
      escrever(dinheiroEl, [dolar(v.dinheiro), eq.colete > 0 ? `${eq.capacete ? 'colete+capacete' : 'colete'} ${eq.colete}` : '',
        eq.kit ? 'kit' : '', g.flash ? `flash ${g.flash}` : '', g.smoke ? `smoke ${g.smoke}` : '', g.he ? `HE ${g.he}` : '']
        .filter(Boolean).join(' · '));
    }
    // vencedorRound/motivo persistem no freeze seguinte: só valem em fim-round.
    const emFimRound = v.fase === 'fim-round';
    mostrar(fimRound, emFimRound);
    if (emFimRound) {
      const t = v.vencedorRound;
      escrever(fimRoundTitulo, t === 'azul' ? 'Azul venceu o round'
        : t === 'laranja' ? 'Laranja venceu o round' : 'Round empatado');
      escrever(fimRoundMotivo, MOTIVOS[v.motivo] ?? '');
      mostrar(fimRoundMvp, Boolean(v.mvp));
      if (v.mvp) {
        fimRoundMvp.classList.toggle('voce', v.mvp.voce);
        escrever(fimRoundMvp, `★ MVP do round: ${v.mvp.nome} · ${FEITOS_MVP[v.mvp.motivo](v.mvp.kills)}`);
      }
    }
    const verTabela = fimVisivel || tabVisivel;
    mostrar(tabela, verTabela);
    if (verTabela) renderTabela(v.entidades);
  };

  hud.reiniciarRadar = () => { fundoRadar = null; };
  hud.destruir = () => {
    for (const t of timers) clearTimeout(t);
    timers.clear();
    for (const e of [menu, hudEl, loadout, compra, tabela, pausa, fim]) e.remove();
  };
  // FIM-SECOES
  return hud;
}
