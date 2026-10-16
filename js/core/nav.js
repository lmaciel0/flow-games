/**
 * Navegação — rotas por hash (#/ = home, #/<id> = jogo), drawer e home com cards.
 * Não conhece nenhum jogo: só lê o registro e chama mount/pause/resume.
 */
import { listar, buscar } from './registry.js';

const URL_REPOSITORIO = 'https://github.com/lmaciel0/flow-games';

function idDaRota() {
  const m = location.hash.match(/^#\/([a-z0-9]+)$/i);
  return m ? m[1] : '';
}

function textoRecorde(jogo, escopo) {
  try {
    return jogo.recorde(escopo(jogo.id)) || null;
  } catch {
    return null;
  }
}

function itemDrawer({ href, icone, iconeClasse = '', titulo, subtitulo, badge }) {
  const a = document.createElement('a');
  a.className = 'nav-item';
  a.href = href;
  a.innerHTML = `
    <div class="nav-icon ${iconeClasse}">${icone}</div>
    <div class="nav-label">
      <span class="nav-title">${titulo}</span>
      <span class="nav-subtitle">${subtitulo}</span>
    </div>
    ${badge ? `<span class="nav-badge ${badge.cor}">${badge.texto}</span>` : ''}`;
  return a;
}

export function iniciarNav({ app, audio, confetti, escopo }) {
  const drawer = document.getElementById('sidebar-drawer');
  const backdrop = document.getElementById('drawer-backdrop');
  const menuBtn = document.getElementById('menu-toggle-btn');
  const closeBtn = document.getElementById('drawer-close-btn');
  const somBtn = document.getElementById('drawer-sound-toggle');
  const nav = drawer.querySelector('.drawer-nav');

  const jogos = listar();
  const montados = new Map();
  let atual = null;

  // --- Drawer ---
  const itens = new Map();
  const inicio = itemDrawer({
    href: '#/', icone: '🏠', titulo: 'Início', subtitulo: 'Todos os jogos'
  });
  itens.set('', inicio);
  nav.append(inicio);
  for (const j of jogos) {
    const item = itemDrawer({
      href: `#/${j.id}`, icone: j.icone, iconeClasse: j.iconeClasse,
      titulo: j.nome, subtitulo: j.descricao, badge: j.badge
    });
    itens.set(j.id, item);
    nav.append(item);
  }

  function abrirDrawer() {
    drawer.classList.add('open');
    backdrop.classList.add('active');
    menuBtn.classList.add('open');
    menuBtn.setAttribute('aria-expanded', 'true');
    audio.playSound('click');
  }

  function fecharDrawer() {
    drawer.classList.remove('open');
    backdrop.classList.remove('active');
    menuBtn.classList.remove('open');
    menuBtn.setAttribute('aria-expanded', 'false');
  }

  menuBtn.addEventListener('click', () => {
    if (drawer.classList.contains('open')) fecharDrawer();
    else abrirDrawer();
  });
  // Clicar no item da rota atual não dispara hashchange: fecha o drawer aqui também.
  nav.addEventListener('click', (e) => {
    if (e.target.closest('.nav-item')) fecharDrawer();
  });
  closeBtn.addEventListener('click', fecharDrawer);
  backdrop.addEventListener('click', fecharDrawer);
  somBtn.addEventListener('click', () => audio.toggleSound());
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && drawer.classList.contains('open')) fecharDrawer();
  });

  // --- Home ---
  const home = document.createElement('section');
  home.id = 'view-home';
  home.className = 'game-view';
  home.innerHTML = `
    <header class="home-hero">
      <h1 class="app-title">Arcade <span class="gradient-text">Hub</span></h1>
      <p class="app-subtitle">Seis jogos clássicos em JavaScript puro. Escolha um e jogue.</p>
    </header>
    <div class="home-grid"></div>
    <footer class="home-footer">
      <a href="${URL_REPOSITORIO}" target="_blank" rel="noopener noreferrer">Código no GitHub</a>
    </footer>`;
  const grade = home.querySelector('.home-grid');
  const recordes = new Map();
  for (const j of jogos) {
    const card = document.createElement('a');
    card.className = 'game-card';
    card.href = `#/${j.id}`;
    card.innerHTML = `
      <div class="nav-icon game-card-icon ${j.iconeClasse}">${j.icone}</div>
      <div class="game-card-body">
        <span class="game-card-title">${j.nome}</span>
        <span class="game-card-desc">${j.descricao}</span>
        <span class="game-card-record" hidden></span>
      </div>
      ${j.badge ? `<span class="nav-badge ${j.badge.cor}">${j.badge.texto}</span>` : ''}`;
    recordes.set(j.id, card.querySelector('.game-card-record'));
    grade.append(card);
  }
  app.append(home);

  function atualizarRecordes() {
    for (const j of jogos) {
      const el = recordes.get(j.id);
      const texto = textoRecorde(j, escopo);
      el.hidden = !texto;
      el.textContent = texto || '';
    }
  }

  // --- Rotas ---
  function montar(jogo) {
    const raiz = document.createElement('section');
    raiz.id = `view-${jogo.id}`;
    raiz.className = 'game-view';
    app.append(raiz);
    montados.set(jogo.id, raiz);
    jogo.mount(raiz, { audio, confetti, storage: escopo(jogo.id) });
    return raiz;
  }

  function rotear(primeira) {
    const jogo = buscar(idDaRota());
    if (!primeira && jogo === atual) return;

    if (atual) atual.pause();
    app.querySelectorAll('.game-view.active').forEach((v) => v.classList.remove('active'));

    const chave = jogo ? jogo.id : '';
    for (const [id, item] of itens) {
      const ativo = id === chave;
      item.classList.toggle('active', ativo);
      if (ativo) item.setAttribute('aria-current', 'page');
      else item.removeAttribute('aria-current');
    }
    document.body.classList.toggle('rota-home', !jogo);

    if (jogo) {
      const raiz = montados.get(jogo.id) || montar(jogo);
      raiz.classList.add('active');
      jogo.resume();
    } else {
      atualizarRecordes();
      home.classList.add('active');
    }
    atual = jogo;

    if (!primeira) audio.playSound('click');
    fecharDrawer();
  }

  window.addEventListener('hashchange', () => rotear(false));
  rotear(true);
}
