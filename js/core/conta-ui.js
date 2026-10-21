/**
 * Interface de conta: área no topo do drawer (Entrar, ou avatar + nome com
 * menu Trocar avatar / Sair) e o modal Entrar / Criar conta / Trocar avatar.
 * Texto vindo do servidor ou do usuário só entra por textContent/setAttribute.
 * Os métodos de `conta` são lidos na hora de cada chamada (testes trocam por espiões).
 */
import { ICONES, decodificarAvatar, redimensionarFoto } from './conta/avatar.js';

const TEXTOS = {
  entrar: { titulo: 'Entrar', botao: 'Entrar' },
  criar: { titulo: 'Criar conta', botao: 'Criar conta' },
  avatar: { titulo: 'Trocar avatar', botao: 'Salvar' },
};
const FOCAVEIS = 'button:not([disabled]), input:not([disabled]):not([type="file"]), [tabindex]:not([tabindex="-1"])';

// attrs só recebe valores estáticos deste arquivo.
function el(tag, classe, texto, attrs = {}) {
  const e = document.createElement(tag);
  if (classe) e.className = classe;
  if (texto !== undefined) e.textContent = texto;
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  return e;
}

const botao = (classe, texto, attrs = {}) => el('button', classe, texto, { type: 'button', ...attrs });

// Avatar só de ICONES/avatarVisual; a foto cai no emoji padrão se não carregar.
function criarAvatar(visual) {
  const av = el('span', 'conta-av', undefined, { 'aria-hidden': 'true' });
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

function campo(id, rotulo, tipo, autocomplete) {
  const caixa = el('div', 'conta-campo');
  const input = el('input', 'conta-input', undefined, {
    id, name: id, type: tipo, autocomplete, autocapitalize: 'none', spellcheck: 'false', required: '',
  });
  caixa.append(el('label', null, rotulo, { for: id }), input);
  return { caixa, input };
}

function montarModal() {
  const fundo = el('div', 'conta-fundo', undefined, { hidden: '' });
  const modal = el('div', 'conta-modal', undefined, {
    role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'conta-modal-titulo', tabindex: '-1',
  });
  const topo = el('div', 'conta-topo');
  const titulo = el('h2', 'conta-titulo', undefined, { id: 'conta-modal-titulo' });
  const fechar = botao('conta-fechar', '×', { 'aria-label': 'Fechar' });
  topo.append(titulo, fechar);

  const abas = el('div', 'conta-abas', undefined, { role: 'tablist', 'aria-label': 'Entrar ou criar conta' });
  const aba = {};
  for (const modo of ['entrar', 'criar']) {
    aba[modo] = botao('conta-aba', TEXTOS[modo].titulo, {
      id: `conta-aba-${modo}`, 'data-aba': modo, role: 'tab', 'aria-controls': 'conta-form',
    });
    abas.append(aba[modo]);
  }

  const form = el('form', 'conta-form', undefined, { id: 'conta-form', novalidate: '' });
  const usuario = campo('conta-usuario', 'Nome de usuário', 'text', 'username');
  usuario.input.maxLength = 16;
  const senha = campo('conta-senha', 'Senha', 'password', 'current-password');
  const credenciais = el('div', 'conta-credenciais');
  credenciais.append(usuario.caixa, senha.caixa);

  const avatares = el('fieldset', 'conta-avatares-caixa');
  const grade = el('div', 'conta-avatares');
  for (const emoji of ICONES) {
    grade.append(botao('conta-av-opcao', emoji, { 'data-icone': emoji, 'aria-label': `Avatar ${emoji}` }));
  }
  const fotoBtn = botao('conta-av-opcao conta-foto-btn', undefined, { 'aria-label': 'Enviar sua própria foto' });
  fotoBtn.append(el('span', 'conta-foto-icone', '📷'));
  grade.append(fotoBtn);
  avatares.append(el('legend', 'conta-legenda', 'Escolha seu avatar'), grade,
    el('p', 'conta-dica', '📷 = enviar sua própria foto'));

  const arquivo = el('input', 'conta-arquivo', undefined, {
    type: 'file', accept: 'image/*', hidden: '', tabindex: '-1', 'aria-hidden': 'true',
  });
  const erro = el('p', 'conta-erro', undefined, { role: 'alert', tabindex: '-1' });
  const enviar = el('button', 'conta-enviar', undefined, { type: 'submit' });
  form.append(credenciais, avatares, arquivo, erro, enviar);
  modal.append(topo, abas, form);
  fundo.append(modal);
  document.body.append(fundo);
  return {
    fundo, modal, titulo, fechar, abas, aba, form, credenciais, usuario: usuario.input,
    senha: senha.input, avatares, grade, fotoBtn, arquivo, erro, enviar,
  };
}

export function iniciarContaUI({ conta, audio }) {
  const slot = document.getElementById('conta-slot');
  if (!slot) return;
  const m = montarModal();
  let modo = 'entrar';
  let escolha = null; // { icone } | { arquivo: File } | null (sem mudança)
  let previa = null;
  let seqFoto = 0;
  let enviando = false;
  let abridor = null;
  let aviso = '';

  const estado = () => { try { return conta.estado() ?? {}; } catch { return {}; } };
  const mostrarErro = (t) => { m.erro.textContent = t; };
  const visiveis = () => [...m.modal.querySelectorAll(FOCAVEIS)]
    .filter((x) => x.getClientRects().length && !x.closest('[hidden]'));

  function selecionar(alvo) {
    for (const b of m.grade.children) b.setAttribute('aria-pressed', String(b === alvo));
  }

  function limparPrevia() {
    if (previa) URL.revokeObjectURL(previa);
    previa = null;
    m.fotoBtn.replaceChildren(el('span', 'conta-foto-icone', '📷'));
  }

  function aplicarModo(novo) {
    modo = novo;
    m.titulo.textContent = TEXTOS[modo].titulo;
    m.enviar.textContent = enviando ? 'Aguarde…' : TEXTOS[modo].botao;
    m.abas.hidden = m.credenciais.hidden = modo === 'avatar';
    m.avatares.hidden = modo === 'entrar';
    m.senha.setAttribute('autocomplete', modo === 'criar' ? 'new-password' : 'current-password');
    for (const [k, b] of Object.entries(m.aba)) {
      b.setAttribute('aria-selected', String(k === modo));
      b.tabIndex = k === modo ? 0 : -1;
    }
    mostrarErro('');
  }

  function abrir(novo) {
    abridor = document.activeElement;
    aviso = '';
    seqFoto++;
    limparPrevia();
    m.form.reset();
    const atual = decodificarAvatar(estado().usuario?.avatar);
    const icone = novo === 'avatar' ? (atual.tipo === 'icone' ? atual.emoji : null) : ICONES[0];
    escolha = icone ? { icone } : null;
    selecionar(icone ? m.grade.querySelector(`[data-icone="${icone}"]`) : null);
    aplicarModo(novo);
    m.fundo.hidden = false;
    audio?.playSound?.('click');
    (modo === 'avatar' ? m.grade.querySelector('[aria-pressed="true"]') ?? m.grade.firstElementChild : m.usuario).focus();
  }

  function fechar() {
    if (m.fundo.hidden) return;
    m.fundo.hidden = true;
    seqFoto++;
    limparPrevia();
    m.senha.value = '';
    // Sem o abridor (ex.: o convite do placar sumiu com o login), o foco só volta ao slot se o
    // drawer estiver aberto; fechado, ele fica fora da tela mas ainda focável. Aí o foco vai
    // para o <body>, onde os jogos já recebem o teclado.
    const drawer = slot.closest('#sidebar-drawer');
    const slotVisivel = !drawer || drawer.classList.contains('open');
    const volta = abridor?.isConnected && !abridor.closest('[hidden]') ? abridor
      : slotVisivel ? slot.querySelector('button') : null;
    abridor = null;
    if (volta) volta.focus();
    else document.activeElement?.blur();
  }

  m.fechar.addEventListener('click', fechar);
  let pressionouFundo = false;
  m.fundo.addEventListener('pointerdown', (e) => { pressionouFundo = e.target === m.fundo; });
  m.fundo.addEventListener('click', (e) => { if (pressionouFundo && e.target === m.fundo) fechar(); });
  // Com o modal aberto, nenhuma tecla chega aos jogos nem ao drawer (Esc fecha só o modal),
  // mesmo se o foco cair no <body>: captura na janela, antes de qualquer outro ouvinte.
  window.addEventListener('keydown', (e) => {
    if (m.fundo.hidden) return;
    e.stopPropagation();
    if (e.key === 'Escape') { e.preventDefault(); fechar(); return; }
    if (e.target.matches('.conta-aba') && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
      if (enviando) return;
      aplicarModo(modo === 'entrar' ? 'criar' : 'entrar');
      m.aba[modo].focus();
      return;
    }
    if (e.key !== 'Tab') return;
    const lista = visiveis();
    const [primeiro, ultimo] = [lista[0], lista[lista.length - 1]];
    const ativo = document.activeElement;
    if (!m.modal.contains(ativo) || (e.shiftKey && ativo === primeiro) || (!e.shiftKey && ativo === ultimo)) {
      e.preventDefault();
      (e.shiftKey ? ultimo : primeiro)?.focus();
    }
  }, true);
  document.addEventListener('focusin', (e) => {
    if (!m.fundo.hidden && !m.modal.contains(e.target)) visiveis()[0]?.focus();
  });
  for (const b of Object.values(m.aba)) {
    b.addEventListener('click', () => { if (!enviando) aplicarModo(b.dataset.aba); });
  }

  m.grade.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b || b === m.fotoBtn) return;
    seqFoto++;
    limparPrevia();
    escolha = { icone: b.dataset.icone };
    selecionar(b);
    mostrarErro('');
  });
  m.fotoBtn.addEventListener('click', () => m.arquivo.click());
  m.arquivo.addEventListener('change', async () => {
    const f = m.arquivo.files?.[0];
    m.arquivo.value = '';
    if (!f) return;
    const minha = ++seqFoto;
    mostrarErro('');
    let blob;
    try {
      blob = await redimensionarFoto(f);
    } catch (err) {
      if (minha === seqFoto) mostrarErro(err?.message || 'Não foi possível usar essa imagem.');
      return;
    }
    if (minha !== seqFoto) return;
    limparPrevia();
    previa = URL.createObjectURL(blob);
    m.fotoBtn.replaceChildren(el('img', null, undefined, { alt: '', src: previa }));
    escolha = { arquivo: f };
    selecionar(m.fotoBtn);
  });

  // Uma chamada por envio: o botão trava em "Aguarde…" até a resposta.
  m.form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (enviando) return;
    if (modo === 'avatar' && !escolha) { fechar(); return; }
    enviando = true;
    if (m.enviar === document.activeElement) m.modal.focus(); // botão desabilitado perderia o foco
    m.enviar.disabled = true;
    m.enviar.textContent = 'Aguarde…';
    mostrarErro('');
    const nome = m.usuario.value.trim();
    let r;
    try {
      if (modo === 'entrar') r = await conta.entrar(nome, m.senha.value);
      else if (modo === 'criar') r = await conta.criarConta(nome, m.senha.value, escolha);
      else r = await conta.trocarAvatar(escolha);
    } catch {
      r = null;
    } finally {
      enviando = false;
      m.enviar.disabled = false;
      m.enviar.textContent = TEXTOS[modo].botao;
    }
    if (!r?.ok) {
      mostrarErro(r?.erro || 'Algo deu errado. Tente novamente em instantes.');
      const ativo = document.activeElement;
      if (!m.fundo.hidden && (ativo === m.modal || !m.modal.contains(ativo))) m.erro.focus();
      return;
    }
    fechar();
    aviso = r.aviso || '';
    render();
  });

  const comAcao = (b, acao) => { b.addEventListener('click', acao); return b; };

  function render() {
    const tinhaFoco = slot.contains(document.activeElement);
    const { logado, usuario } = estado();
    slot.replaceChildren();
    if (!logado || !usuario) {
      slot.append(comAcao(botao('conta-entrar', 'Entrar'), () => abrir('entrar')),
        el('p', 'conta-slot-dica', 'Sem conta, o progresso fica só neste aparelho.'));
    } else {
      let visual;
      try { visual = conta.avatarVisual(usuario.avatar, usuario.id); } catch { visual = null; }
      const menu = el('div', 'conta-menu', undefined, { id: 'conta-menu', hidden: '' });
      const perfil = botao('conta-perfil', undefined, { 'aria-expanded': 'false', 'aria-controls': 'conta-menu' });
      comAcao(perfil, () => alternarMenu(menu.hidden));
      perfil.append(criarAvatar(visual), el('span', 'conta-nome', String(usuario.username ?? '')),
        el('span', 'conta-seta', '▾'));
      const sair = botao('conta-menu-item', 'Sair', { 'data-acao': 'sair' });
      comAcao(sair, async () => {
        sair.disabled = true;
        try { await conta.sair(); } finally { sair.disabled = false; }
      });
      menu.append(comAcao(botao('conta-menu-item', 'Trocar avatar', { 'data-acao': 'avatar' }), () => abrir('avatar')), sair);
      slot.append(perfil, menu);
    }
    if (aviso) slot.append(el('p', 'conta-aviso', aviso));
    if (tinhaFoco) slot.querySelector('button')?.focus();
  }

  function alternarMenu(abrirMenu) {
    const perfil = slot.querySelector('.conta-perfil');
    const menu = slot.querySelector('.conta-menu');
    if (!perfil || !menu) return;
    menu.hidden = !abrirMenu;
    perfil.setAttribute('aria-expanded', String(abrirMenu));
  }

  // Esc com o menu aberto fecha só o menu; clique fora também fecha.
  slot.addEventListener('keydown', (e) => {
    const menu = slot.querySelector('.conta-menu');
    if (e.key !== 'Escape' || !menu || menu.hidden) return;
    e.stopPropagation();
    alternarMenu(false);
    slot.querySelector('.conta-perfil').focus();
  });
  document.addEventListener('click', (e) => { if (!slot.contains(e.target)) alternarMenu(false); });

  conta.assinar((e) => {
    if (e?.tipo !== 'sessao') return;
    render();
    if (modo === 'avatar' && !estado().logado) fechar();
  });
  render();
}
