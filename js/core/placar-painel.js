/**
 * Painel de placar: top N de um jogo com medalhas, avatar, nome e valor, a linha
 * da própria pessoa sempre visível e os estados carregando / vazio / erro.
 * Usado ao lado do Termo e do 2048 (limite 5) e na página #/placar (limite 50).
 * Texto vindo do servidor só entra por textContent/setAttribute.
 * `conta.lerPlacar` é lido na hora de cada chamada (testes trocam por espiões).
 */
import { ICONES } from './conta/avatar.js';

const MEDALHAS = ['🥇', '🥈', '🥉'];
const TEXTO_VAZIO = 'Ninguém jogou ainda — seja o primeiro!';
const TEXTO_ERRO = 'Não foi possível carregar o placar';

// attrs só recebe valores estáticos deste arquivo.
function el(tag, classe, texto, attrs = {}) {
  const e = document.createElement(tag);
  if (classe) e.className = classe;
  if (texto !== undefined) e.textContent = texto;
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  return e;
}

// Emoji só de avatarVisual/ICONES; a foto cai no emoji padrão se não carregar.
function criarAvatar(conta, linha) {
  const av = el('span', 'placar-av', undefined, { 'aria-hidden': 'true' });
  let visual = null;
  try { visual = conta.avatarVisual(linha.avatar, linha.userId); } catch { /* emoji padrão */ }
  if (visual?.url) {
    const img = el('img', null, undefined, { alt: '', loading: 'lazy' });
    img.addEventListener('error', () => { img.remove(); av.textContent = ICONES[0]; });
    img.src = visual.url;
    av.append(img);
  } else {
    av.textContent = visual?.emoji ?? ICONES[0];
  }
  return av;
}

function formatar(valor) {
  const n = Number(valor);
  return Number.isFinite(n) ? n.toLocaleString('pt-BR') : '0';
}

function criarLinha(conta, linha, indice) {
  const posicao = Number.isInteger(linha.posicao) && linha.posicao > 0 ? linha.posicao : indice + 1;
  const li = el('li', linha.eu ? 'placar-linha eu' : 'placar-linha');
  const pos = el('span', 'placar-pos', MEDALHAS[posicao - 1] ?? String(posicao));
  if (posicao <= MEDALHAS.length) pos.setAttribute('aria-label', `${posicao}º`);
  const nome = el('span', 'placar-nome');
  const usuario = typeof linha.username === 'string' ? linha.username : '';
  nome.append(el('span', 'placar-usuario', usuario, { title: usuario }));
  if (linha.eu) nome.append(el('span', 'placar-voce', ' (você)'));
  li.append(pos, criarAvatar(conta, linha), nome, el('span', 'placar-valor', formatar(linha.valor)));
  return li;
}

// Abre o modal de conta pelo botão "Entrar" que a interface de conta põe no drawer.
function abrirEntrar() {
  document.querySelector('#conta-slot .conta-entrar')?.click();
}

export function criarPlacarPainel({ conta, jogo, limite = 5, rotulo }) {
  const compacto = limite <= 10;
  const raiz = el('section', `placar-painel glass-card${compacto ? ' compacto' : ''}`);
  const topo = el('header', 'placar-topo');
  topo.append(el('h2', 'placar-titulo', '🏆 Placar'));
  if (rotulo) topo.append(el('span', 'placar-rotulo', rotulo));
  const estadoEl = el('p', 'placar-estado', 'Carregando…', { role: 'status' });
  const repetir = el('button', 'placar-repetir', 'Tentar de novo', { type: 'button', hidden: '' });
  const lista = el('ol', 'placar-lista', undefined, { hidden: '' });
  const convite = el('button', 'placar-convite', 'Entre para aparecer aqui', { type: 'button', hidden: '' });
  raiz.append(topo, estadoEl, repetir, lista, convite);
  if (compacto) raiz.append(el('a', 'placar-completo', 'Ver placar completo', { href: '#/placar' }));

  repetir.addEventListener('click', () => { atualizar(); });
  convite.addEventListener('click', abrirEntrar);
  // Enter e Espaço acionam o botão ou link focado aqui: não chegam aos atalhos
  // globais do jogo (o Termo enviaria a linha). As outras teclas (letras, setas,
  // Backspace, Esc) seguem para o jogo, mesmo com o foco no painel.
  raiz.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') e.stopPropagation(); });

  let seq = 0;
  let destruido = false;
  let temDados = false;
  let agendado = false;

  const logado = () => { try { return Boolean(conta.estado()?.logado); } catch { return false; } };

  function mostrarEstado(texto, erro = false) {
    estadoEl.textContent = texto;
    estadoEl.hidden = false;
    estadoEl.classList.toggle('erro', erro);
    repetir.hidden = !erro;
  }

  function render(dados) {
    convite.hidden = logado();
    if (!dados) {
      temDados = false;
      lista.hidden = true;
      lista.replaceChildren();
      mostrarEstado(TEXTO_ERRO, true);
      return;
    }
    const todas = Array.isArray(dados.linhas) ? dados.linhas : [];
    const visiveis = todas.slice(0, limite);
    const eu = dados.eu ?? null;
    const itens = visiveis.map((l, i) => criarLinha(conta, l, i));
    const euVisivel = eu && visiveis.some((l) => l.eu || (eu.userId && l.userId === eu.userId));
    if (eu && !euVisivel) {
      itens.push(el('li', 'placar-sep', '⋯', { 'aria-hidden': 'true' }), criarLinha(conta, { ...eu, eu: true }, visiveis.length));
    }
    temDados = true;
    lista.replaceChildren(...itens);
    lista.hidden = itens.length === 0;
    if (itens.length === 0) mostrarEstado(TEXTO_VAZIO);
    else { estadoEl.hidden = true; repetir.hidden = true; }
  }

  // A resposta mais nova vence: uma atrasada de uma chamada anterior é descartada.
  async function atualizar() {
    if (destruido) return;
    const minha = ++seq;
    if (!temDados) mostrarEstado('Carregando…');
    raiz.setAttribute('aria-busy', 'true');
    let dados = null;
    try { dados = await conta.lerPlacar(jogo, limite); } catch { dados = null; }
    if (destruido || minha !== seq) return;
    raiz.removeAttribute('aria-busy');
    render(dados);
  }

  // 'sessao' e 'progresso' costumam chegar juntos: uma leitura só.
  function agendar() {
    if (agendado) return;
    agendado = true;
    queueMicrotask(() => { agendado = false; atualizar(); });
  }

  let desassinar = () => {};
  try {
    desassinar = conta.assinar((evento) => {
      if (evento?.tipo === 'sessao') convite.hidden = logado();
      if (evento?.tipo === 'sessao' || evento?.tipo === 'progresso') agendar();
    }) ?? desassinar;
  } catch { /* sem eventos: o painel ainda atualiza por chamada */ }

  function destruir() {
    if (destruido) return;
    destruido = true;
    seq++;
    desassinar();
    raiz.remove();
  }

  return { el: raiz, atualizar, destruir };
}
