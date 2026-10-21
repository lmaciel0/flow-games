/**
 * Jogo 2048 — motor lógico, animações e controles touch/teclado.
 */

import { criarPlacarPainel } from '../core/placar-painel.js';

const HTML = `
    <div class="jogo-com-placar">
      <div class="jogo-com-placar-jogo">
      <header class="app-header">
        <div class="header-badge g2048-badge">
          <span class="badge-dot g2048-dot"></span>
          <span class="badge-text">CLÁSSICO QUEBRA-CABEÇA</span>
        </div>
        <h1 class="app-title">Jogo <span class="gradient-text-2048">2048</span></h1>
        <p class="app-subtitle">Use as setas do teclado ou deslize os blocos para somar os números e alcançar <strong>2048</strong>!</p>
      </header>

      <div class="g2048-top-bar glass-card">
        <div class="g2048-scores">
          <div class="g2048-score-box">
            <span class="g2048-score-title">PONTOS</span>
            <span class="g2048-score-num" id="g2048-current-score">0</span>
            <span class="g2048-score-add" id="g2048-score-add"></span>
          </div>
          <div class="g2048-score-box best">
            <span class="g2048-score-title">MELHOR</span>
            <span class="g2048-score-num" id="g2048-best-score">0</span>
          </div>
        </div>

        <div class="g2048-actions">
          <button id="g2048-undo-btn" class="action-btn-small" title="Desfazer último movimento">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M3 7v6h6"/>
              <path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"/>
            </svg>
            <span>Desfazer</span>
          </button>
          <button id="g2048-new-game-btn" class="action-btn-small primary-2048">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
              <path d="M3 3v5h5"/>
            </svg>
            <span>Novo Jogo</span>
          </button>
        </div>
      </div>

      <main class="g2048-board-wrapper">
        <div class="g2048-container" id="g2048-grid-container">
          <div class="g2048-grid">
            <div class="g2048-cell"></div><div class="g2048-cell"></div><div class="g2048-cell"></div><div class="g2048-cell"></div>
            <div class="g2048-cell"></div><div class="g2048-cell"></div><div class="g2048-cell"></div><div class="g2048-cell"></div>
            <div class="g2048-cell"></div><div class="g2048-cell"></div><div class="g2048-cell"></div><div class="g2048-cell"></div>
            <div class="g2048-cell"></div><div class="g2048-cell"></div><div class="g2048-cell"></div><div class="g2048-cell"></div>
          </div>

          <div class="g2048-tile-container" id="g2048-tile-container"></div>

          <div class="g2048-overlay" id="g2048-overlay">
            <div class="g2048-message-box">
              <h2 id="g2048-overlay-title">Fim de Jogo!</h2>
              <p id="g2048-overlay-text">Não há mais movimentos possíveis.</p>
              <div class="overlay-buttons">
                <button id="g2048-keep-playing-btn" class="action-btn secondary-btn" style="display: none;">Continuar Jogando</button>
                <button id="g2048-restart-overlay-btn" class="action-btn primary-btn">Tentar Novamente</button>
              </div>
            </div>
          </div>
        </div>
      </main>

      <div class="info-card glass-card">
        <div class="info-header">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
          </svg>
          <strong>Como Jogar o 2048:</strong>
        </div>
        <p>
          Utilize as <strong>Setas do Teclado (↑ ↓ ← →)</strong> ou <strong>W, A, S, D</strong> para mover os blocos. Quando blocos iguais se colidem, <strong>eles se unem somando seus valores</strong>!
        </p>
      </div>
      </div>
      <aside class="placar-lateral" aria-label="Placar"></aside>
    </div>
`;

function montar(raiz, { audio, confetti, storage, conta }) {
  const byId = (id) => raiz.querySelector('#' + id);


  // --- Estado do 2048 ---
  const state = {
    size: 4,
    grid: [], // Matriz 4x4 com números
    score: 0,
    bestScore: 0,
    previousState: null, // Para a funcionalidade Desfazer
    won: false,
    keepPlaying: false,
    gameOver: false,
    tileIdCounter: 1
  };

  // --- Elementos do DOM ---
  const view2048 = raiz;
  const container = byId('g2048-grid-container');
  const tileContainer = byId('g2048-tile-container');
  const currentScoreEl = byId('g2048-current-score');
  const bestScoreEl = byId('g2048-best-score');
  const scoreAddEl = byId('g2048-score-add');
  const undoBtn = byId('g2048-undo-btn');
  const newGameBtn = byId('g2048-new-game-btn');
  const overlay = byId('g2048-overlay');
  const overlayTitle = byId('g2048-overlay-title');
  const overlayText = byId('g2048-overlay-text');
  const keepPlayingBtn = byId('g2048-keep-playing-btn');
  const restartOverlayBtn = byId('g2048-restart-overlay-btn');

  // --- Gerenciamento de Sons ---
  function playSound(type) {
    if (audio.isSoundEnabled()) {
      if (type === 'slide') audio.playTone(380, 'sine', 0.06, 0.12);
      if (type === 'merge') audio.playTone(580, 'triangle', 0.12, 0.2);
      if (type === 'gameover') audio.playSound('defeat');
      if (type === 'win') {
        audio.playSound('win');
        confetti();
      }
    }
  }

  // --- Inicialização da Matriz ---
  function initGrid() {
    state.grid = [];
    for (let r = 0; r < state.size; r++) {
      state.grid[r] = [];
      for (let c = 0; c < state.size; c++) {
        state.grid[r][c] = 0;
      }
    }
  }

  // Adiciona um novo número (2 ou 4) em célula vazia
  function spawnRandomTile() {
    const emptyCells = [];
    for (let r = 0; r < state.size; r++) {
      for (let c = 0; c < state.size; c++) {
        if (state.grid[r][c] === 0) {
          emptyCells.push({ r, c });
        }
      }
    }

    if (emptyCells.length === 0) return null;

    const chosen = emptyCells[Math.floor(Math.random() * emptyCells.length)];
    const value = Math.random() < 0.9 ? 2 : 4;
    state.grid[chosen.r][chosen.c] = value;
    return { r: chosen.r, c: chosen.c, value, isNew: true };
  }

  // Clona a matriz para histórico
  function cloneGrid(grid) {
    return grid.map(row => [...row]);
  }

  function savePreviousState() {
    state.previousState = {
      grid: cloneGrid(state.grid),
      score: state.score
    };
    if (undoBtn) undoBtn.disabled = false;
  }

  function undoMove() {
    if (!state.previousState) return;
    state.grid = cloneGrid(state.previousState.grid);
    state.score = state.previousState.score;
    state.previousState = null;
    state.gameOver = false;
    if (overlay) overlay.classList.remove('active');
    if (undoBtn) undoBtn.disabled = true;
    updateScoreUI(0);
    renderTiles();
    audio.playTone(450, 'sine', 0.08, 0.15);
  }

  // --- Posicionamento dos Blocos ---
  function getTileDimensions() {
    if (!tileContainer) return { size: 0, gap: 12 };
    const width = tileContainer.clientWidth;
    const gap = window.innerWidth <= 480 ? 8 : 12;
    const tileSize = (width - gap * (state.size - 1)) / state.size;
    return { size: tileSize, gap };
  }

  function renderTiles(lastSpawn = null) {
    if (!tileContainer) return;
    tileContainer.innerHTML = '';
    const { size, gap } = getTileDimensions();

    for (let r = 0; r < state.size; r++) {
      for (let c = 0; c < state.size; c++) {
        const val = state.grid[r][c];
        if (val !== 0) {
          const tile = document.createElement('div');
          tile.className = `g2048-tile tile-${val <= 2048 ? val : 'super'}`;
          tile.textContent = val;

          tile.style.width = `${size}px`;
          tile.style.height = `${size}px`;

          const x = c * (size + gap);
          const y = r * (size + gap);
          tile.style.transform = `translate(${x}px, ${y}px)`;

          if (lastSpawn && lastSpawn.r === r && lastSpawn.c === c) {
            tile.classList.add('tile-new');
          }

          tileContainer.appendChild(tile);
        }
      }
    }
  }

  // --- Movimentação e Fusão ---
  function slideRow(row) {
    let filtered = row.filter(val => val !== 0);
    let scoreGained = 0;
    let merged = [];

    for (let i = 0; i < filtered.length; i++) {
      if (i < filtered.length - 1 && filtered[i] === filtered[i + 1]) {
        const combined = filtered[i] * 2;
        merged.push(combined);
        scoreGained += combined;
        i++; // pula o próximo elemento já fundido
      } else {
        merged.push(filtered[i]);
      }
    }

    while (merged.length < state.size) {
      merged.push(0);
    }

    return { row: merged, scoreGained };
  }

  function move(direction) {
    if (state.gameOver) return false;

    const oldGrid = cloneGrid(state.grid);
    let totalScoreGained = 0;
    let moved = false;

    if (direction === 'left') {
      for (let r = 0; r < state.size; r++) {
        const result = slideRow(state.grid[r]);
        state.grid[r] = result.row;
        totalScoreGained += result.scoreGained;
      }
    } else if (direction === 'right') {
      for (let r = 0; r < state.size; r++) {
        const reversed = [...state.grid[r]].reverse();
        const result = slideRow(reversed);
        state.grid[r] = result.row.reverse();
        totalScoreGained += result.scoreGained;
      }
    } else if (direction === 'up') {
      for (let c = 0; c < state.size; c++) {
        let col = [];
        for (let r = 0; r < state.size; r++) col.push(state.grid[r][c]);
        const result = slideRow(col);
        for (let r = 0; r < state.size; r++) state.grid[r][c] = result.row[r];
        totalScoreGained += result.scoreGained;
      }
    } else if (direction === 'down') {
      for (let c = 0; c < state.size; c++) {
        let col = [];
        for (let r = 0; r < state.size; r++) col.push(state.grid[r][c]);
        col.reverse();
        const result = slideRow(col);
        result.row.reverse();
        for (let r = 0; r < state.size; r++) state.grid[r][c] = result.row[r];
        totalScoreGained += result.scoreGained;
      }
    }

    // Verificar se houve mudança na matriz
    for (let r = 0; r < state.size; r++) {
      for (let c = 0; c < state.size; c++) {
        if (state.grid[r][c] !== oldGrid[r][c]) {
          moved = true;
          break;
        }
      }
      if (moved) break;
    }

    if (moved) {
      state.previousState = { grid: oldGrid, score: state.score };
      if (undoBtn) undoBtn.disabled = false;

      state.score += totalScoreGained;
      updateScoreUI(totalScoreGained);

      if (totalScoreGained > 0) {
        playSound('merge');
      } else {
        playSound('slide');
      }

      const newTile = spawnRandomTile();
      renderTiles(newTile);

      // Checa se o jogador alcançou 2048
      if (!state.won && !state.keepPlaying && hasTile(2048)) {
        state.won = true;
        showWinOverlay();
        playSound('win');
      } else if (isGameOver()) {
        state.gameOver = true;
        enviarRecorde();
        showGameOverOverlay();
        playSound('gameover');
      }

      return true;
    }

    return false;
  }

  function hasTile(target) {
    for (let r = 0; r < state.size; r++) {
      for (let c = 0; c < state.size; c++) {
        if (state.grid[r][c] === target) return true;
      }
    }
    return false;
  }

  function isGameOver() {
    // Se há células vazias, o jogo continua
    for (let r = 0; r < state.size; r++) {
      for (let c = 0; c < state.size; c++) {
        if (state.grid[r][c] === 0) return false;
      }
    }

    // Se há vizinhos iguais adjacentes na horizontal ou vertical
    for (let r = 0; r < state.size; r++) {
      for (let c = 0; c < state.size; c++) {
        const val = state.grid[r][c];
        if (r < state.size - 1 && val === state.grid[r + 1][c]) return false;
        if (c < state.size - 1 && val === state.grid[r][c + 1]) return false;
      }
    }

    return true;
  }

  function showWinOverlay() {
    overlayTitle.textContent = '🎉 Você Venceu!';
    overlayText.textContent = 'Parabéns, você criou o bloco 2048!';
    keepPlayingBtn.style.display = 'inline-block';
    overlay.classList.add('active');
  }

  function showGameOverOverlay() {
    overlayTitle.textContent = 'Fim de Jogo!';
    overlayText.textContent = 'Não há mais movimentos disponíveis.';
    keepPlayingBtn.style.display = 'none';
    overlay.classList.add('active');
  }

  // --- Placar e Armazenamento Local ---
  // Recorde novo vai para o placar da conta com debounce: uma chamada por rajada de jogadas, não por movimento.
  const DEBOUNCE_RECORDE_MS = 1500;
  let recordePendente = 0;
  let timerRecorde = null;

  function agendarRecorde(valor) {
    if (!conta) return;
    recordePendente = Math.max(recordePendente, valor);
    clearTimeout(timerRecorde);
    timerRecorde = setTimeout(enviarRecorde, DEBOUNCE_RECORDE_MS);
  }

  // Fim de partida não espera o debounce: envia o pendente na hora.
  function enviarRecorde() {
    clearTimeout(timerRecorde);
    timerRecorde = null;
    if (recordePendente <= 0) return;
    const valor = recordePendente;
    recordePendente = 0;
    conta?.registrar('game2048', { tipo: 'pontos', valor });
  }

  function updateScoreUI(gained = 0) {
    currentScoreEl.textContent = state.score;

    if (gained > 0 && scoreAddEl) {
      scoreAddEl.textContent = `+${gained}`;
      scoreAddEl.classList.remove('animate');
      // Forçar reflow para reiniciar animação
      void scoreAddEl.offsetWidth;
      scoreAddEl.classList.add('animate');
    }

    if (state.score > state.bestScore) {
      state.bestScore = state.score;
      bestScoreEl.textContent = state.bestScore;
      storage.set('recorde', state.bestScore);
      agendarRecorde(state.bestScore);
    }
  }

  function loadBestScore() {
    state.bestScore = storage.get('recorde', 0);
    bestScoreEl.textContent = state.bestScore;
  }

  function newGame() {
    enviarRecorde();
    initGrid();
    state.score = 0;
    state.previousState = null;
    state.won = false;
    state.keepPlaying = false;
    state.gameOver = false;
    if (undoBtn) undoBtn.disabled = true;
    if (overlay) overlay.classList.remove('active');

    updateScoreUI(0);
    spawnRandomTile();
    spawnRandomTile();
    renderTiles();
  }

  // --- Controles de Teclado ---
  window.addEventListener('keydown', (e) => {
    // Só responde se o 2048 estiver visível
    if (!view2048 || !view2048.classList.contains('active')) return;

    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyW', 'KeyS', 'KeyA', 'KeyD'].includes(e.code)) {
      e.preventDefault();
    }

    switch (e.code) {
      case 'ArrowLeft':
      case 'KeyA':
        move('left');
        break;
      case 'ArrowRight':
      case 'KeyD':
        move('right');
        break;
      case 'ArrowUp':
      case 'KeyW':
        move('up');
        break;
      case 'ArrowDown':
      case 'KeyS':
        move('down');
        break;
    }
  });

  // --- Controles Touch e Arraste com Mouse ---
  let touchStartX = 0;
  let touchStartY = 0;

  if (container) {
    container.addEventListener('touchstart', (e) => {
      if (e.touches.length > 0) {
        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
      }
    }, { passive: true });

    container.addEventListener('touchend', (e) => {
      if (!touchStartX || !touchStartY || e.changedTouches.length === 0) return;

      const touchEndX = e.changedTouches[0].clientX;
      const touchEndY = e.changedTouches[0].clientY;

      const dx = touchEndX - touchStartX;
      const dy = touchEndY - touchStartY;

      const absDx = Math.abs(dx);
      const absDy = Math.abs(dy);

      // Limiar mínimo de 25px para evitar toques acidentais
      if (Math.max(absDx, absDy) > 25) {
        if (absDx > absDy) {
          move(dx > 0 ? 'right' : 'left');
        } else {
          move(dy > 0 ? 'down' : 'up');
        }
      }

      touchStartX = 0;
      touchStartY = 0;
    }, { passive: true });
  }

  // --- Listeners de Botões ---
  if (newGameBtn) newGameBtn.addEventListener('click', newGame);
  if (undoBtn) undoBtn.addEventListener('click', undoMove);

  if (restartOverlayBtn) {
    restartOverlayBtn.addEventListener('click', () => {
      newGame();
    });
  }

  if (keepPlayingBtn) {
    keepPlayingBtn.addEventListener('click', () => {
      state.keepPlaying = true;
      overlay.classList.remove('active');
    });
  }

  window.addEventListener('resize', () => {
    if (view2048 && view2048.classList.contains('active')) {
      renderTiles();
    }
  });

  // Login/logout reescreve o recorde no storage: relê para a tela mostrar o da conta.
  // O recorde pendente era da conta anterior: descarta, para não enviá-lo à nova.
  conta?.assinar((evento) => {
    if (evento?.tipo !== 'progresso') return;
    clearTimeout(timerRecorde);
    timerRecorde = null;
    recordePendente = 0;
    loadBestScore();
  });

  loadBestScore();
  newGame();

  return { render: renderTiles };
}

let instancia = null;
let painel = null;

export default {
  id: 'game2048',
  nome: 'Jogo 2048',
  icone: '2048',
  iconeClasse: 'num-icon',
  descricao: 'Junte os blocos numéricos',
  badge: { texto: 'POPULAR', cor: 'hot' },
  mount(raiz, ctx) {
    raiz.innerHTML = HTML;
    instancia = montar(raiz, ctx);
    if (ctx.conta) {
      painel = criarPlacarPainel({ conta: ctx.conta, jogo: 'game2048', limite: 5, rotulo: 'Maior pontuação' });
      raiz.querySelector('.placar-lateral').append(painel.el);
    }
  },
  pause() {},
  resume() {
    painel?.atualizar();
    // As peças são posicionadas por medida: reposiciona depois que a seção fica visível.
    setTimeout(() => instancia && instancia.render(), 50);
  },
  recorde(storage) {
    const n = storage.get('recorde', 0);
    return n > 0 ? `Recorde ${n}` : null;
  }
};
