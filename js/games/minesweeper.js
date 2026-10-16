/**
 * Campo Minado — primeiro clique seguro, três dificuldades e melhor tempo por nível.
 */

// Dificuldade da lógica -> chave do recorde salvo.
const NIVEIS = { easy: 'facil', medium: 'medio', hard: 'dificil' };
const NOMES_NIVEL = { facil: 'fácil', medio: 'médio', dificil: 'difícil' };

function formatar(segundos) {
  const m = String(Math.floor(segundos / 60)).padStart(2, '0');
  const s = String(segundos % 60).padStart(2, '0');
  return `${m}:${s}`;
}

const HTML = `
      <header class="app-header">
        <div class="header-badge mine-badge">
          <span class="badge-dot mine-dot"></span>
          <span class="badge-text">DESAFIO DE LÓGICA</span>
        </div>
        <h1 class="app-title">Campo <span class="gradient-text-mine">Minado</span></h1>
        <p class="app-subtitle">Abra todas as casas seguras sem detonar nenhuma das minas ocultas!</p>
      </header>

      <div class="mine-top-bar glass-card">
        <div class="mine-stat-box">
          <span class="mine-stat-icon">🚩</span>
          <span class="mine-stat-val" id="mine-flags-left">10</span>
        </div>

        <div class="mine-difficulty-select">
          <select id="mine-difficulty" class="custom-select-small">
            <option value="easy" selected>Fácil (9x9 - 10 minas)</option>
            <option value="medium">Médio (12x12 - 22 minas)</option>
            <option value="hard">Difícil (14x14 - 36 minas)</option>
          </select>
        </div>

        <button id="mine-face-btn" class="mine-face-btn" title="Reiniciar">
          <span id="mine-face-icon">🙂</span>
        </button>

        <div class="mine-stat-box">
          <span class="mine-stat-icon">⏱️</span>
          <span class="mine-stat-val" id="mine-timer">000</span>
        </div>
      </div>

      <p class="mine-best-line">Melhor tempo: <strong id="mine-best">--:--</strong></p>

      <div class="mine-mode-toggle">
        <button id="mine-mode-dig" class="mine-mode-btn active">
          <span>⛏️ Abrir Casa</span>
        </button>
        <button id="mine-mode-flag" class="mine-mode-btn">
          <span>🚩 Marcar Bandeira</span>
        </button>
      </div>

      <main class="mine-board-wrapper">
        <div class="mine-grid-container" id="mine-grid"></div>
      </main>

      <div class="info-card glass-card">
        <div class="info-header">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="8" x2="12" y2="12"/>
            <line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          <strong>Dica do Campo Minado:</strong>
        </div>
        <p><strong>Clique normal:</strong> abre a casa (o 1º clique é 100% livre de minas). <strong>Botão direito</strong> ou toque longo: fixa a bandeira 🚩.</p>
      </div>
`;

function montar(raiz, { audio, confetti, storage }) {
  const byId = (id) => raiz.querySelector('#' + id);
  let controle;


  const gridContainer = byId('mine-grid');
  const flagsLeftEl = byId('mine-flags-left');
  const timerEl = byId('mine-timer');
  const difficultySelect = byId('mine-difficulty');
  const faceBtn = byId('mine-face-btn');
  const faceIcon = byId('mine-face-icon');
  const modeDigBtn = byId('mine-mode-dig');
  const modeFlagBtn = byId('mine-mode-flag');
  const bestEl = byId('mine-best');

  const CONFIGS = {
    easy: { rows: 9, cols: 9, mines: 10 },
    medium: { rows: 12, cols: 12, mines: 22 },
    hard: { rows: 14, cols: 14, mines: 36 }
  };

  let currentDiff = 'easy';
  let rows = 9;
  let cols = 9;
  let totalMines = 10;
  let board = []; // { isMine, isRevealed, isFlagged, count, element }
  let firstClick = true;
  let isGameOver = false;
  let timerInterval = null;
  let timeElapsed = 0;
  let flagsPlaced = 0;
  let isFlagMode = false; // Alternador para mobile

  function setDifficulty(diff) {
    currentDiff = diff;
    rows = CONFIGS[diff].rows;
    cols = CONFIGS[diff].cols;
    totalMines = CONFIGS[diff].mines;
    initGame();
  }

  function tick() {
    timeElapsed++;
    if (timeElapsed > 999) timeElapsed = 999;
    timerEl.textContent = timeElapsed.toString().padStart(3, '0');
  }

  function startTimer() {
    clearInterval(timerInterval);
    timeElapsed = 0;
    timerEl.textContent = '000';
    timerInterval = setInterval(tick, 1000);
  }

  function mostrarMelhor() {
    const t = storage.get('recordes', {})[NIVEIS[currentDiff]];
    bestEl.textContent = Number.isFinite(t) && t > 0 ? formatar(t) : '--:--';
  }

  function stopTimer() {
    clearInterval(timerInterval);
  }

  function initGame() {
    stopTimer();
    mostrarMelhor();
    timeElapsed = 0;
    timerEl.textContent = '000';
    firstClick = true;
    isGameOver = false;
    flagsPlaced = 0;
    flagsLeftEl.textContent = totalMines.toString().padStart(2, '0');
    faceIcon.textContent = '🙂';

    gridContainer.innerHTML = '';
    gridContainer.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
    gridContainer.style.gridTemplateRows = `repeat(${rows}, 1fr)`;

    board = [];
    for (let r = 0; r < rows; r++) {
      board[r] = [];
      for (let c = 0; c < cols; c++) {
        const cellEl = document.createElement('div');
        cellEl.className = 'mine-cell';
        cellEl.dataset.r = r;
        cellEl.dataset.c = c;

        // Listeners de clique
        cellEl.addEventListener('click', (e) => handleCellClick(r, c, e));
        cellEl.addEventListener('contextmenu', (e) => {
          e.preventDefault();
          toggleFlag(r, c);
        });

        gridContainer.appendChild(cellEl);

        board[r][c] = {
          isMine: false,
          isRevealed: false,
          isFlagged: false,
          count: 0,
          element: cellEl
        };
      }
    }
  }

  // Gera as minas garantindo que o primeiro clique (e vizinhos) sejam 100% seguros
  function placeMines(safeR, safeC) {
    let placed = 0;
    while (placed < totalMines) {
      const r = Math.floor(Math.random() * rows);
      const c = Math.floor(Math.random() * cols);

      // Não colocar na casa clicada nem em seus 8 vizinhos imediatos
      const isNeighborOrSelf = Math.abs(r - safeR) <= 1 && Math.abs(c - safeC) <= 1;

      if (!board[r][c].isMine && !isNeighborOrSelf) {
        board[r][c].isMine = true;
        placed++;
      }
    }

    // Calcula contagem de vizinhos
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (!board[r][c].isMine) {
          let count = 0;
          for (let dr = -1; dr <= 1; dr++) {
            for (let dc = -1; dc <= 1; dc++) {
              const nr = r + dr;
              const nc = c + dc;
              if (nr >= 0 && nr < rows && nc >= 0 && nc < cols && board[nr][nc].isMine) {
                count++;
              }
            }
          }
          board[r][c].count = count;
        }
      }
    }
  }

  function handleCellClick(r, c, e) {
    if (isGameOver) return;
    const cell = board[r][c];

    if (isFlagMode) {
      toggleFlag(r, c);
      return;
    }

    if (cell.isFlagged || cell.isRevealed) return;

    if (firstClick) {
      firstClick = false;
      placeMines(r, c);
      startTimer();
    }

    if (cell.isMine) {
      cell.element.classList.add('detonated');
      gameOver(false);
      return;
    }

    revealCell(r, c);
    checkWinCondition();
  }

  function revealCell(r, c) {
    const cell = board[r][c];
    if (cell.isRevealed || cell.isFlagged) return;

    cell.isRevealed = true;
    cell.element.classList.add('revealed');

    audio.playTone(400, 'sine', 0.04, 0.1);

    if (cell.count > 0) {
      cell.element.textContent = cell.count;
      cell.element.classList.add(`mine-n-${cell.count}`);
    } else {
      // Flood fill automático para casas vazias
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          const nr = r + dr;
          const nc = c + dc;
          if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) {
            revealCell(nr, nc);
          }
        }
      }
    }
  }

  function toggleFlag(r, c) {
    if (isGameOver) return;
    const cell = board[r][c];
    if (cell.isRevealed) return;

    cell.isFlagged = !cell.isFlagged;
    if (cell.isFlagged) {
      cell.element.textContent = '🚩';
      flagsPlaced++;
      audio.playTone(600, 'sine', 0.05, 0.15);
    } else {
      cell.element.textContent = '';
      flagsPlaced--;
      audio.playTone(350, 'sine', 0.05, 0.15);
    }

    const remaining = totalMines - flagsPlaced;
    flagsLeftEl.textContent = remaining.toString().padStart(2, '0');
    checkWinCondition();
  }

  function checkWinCondition() {
    let unrevealedSafeCells = 0;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (!board[r][c].isMine && !board[r][c].isRevealed) {
          unrevealedSafeCells++;
        }
      }
    }

    if (unrevealedSafeCells === 0) {
      gameOver(true);
    }
  }

  function gameOver(won) {
    isGameOver = true;
    stopTimer();

    if (won) {
      faceIcon.textContent = '😎';
      flagsLeftEl.textContent = '00';
      // Marca todas as minas com bandeira
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          if (board[r][c].isMine && !board[r][c].isFlagged) {
            board[r][c].element.textContent = '🚩';
          }
        }
      }
      const recordes = storage.get('recordes', {});
      const nivel = NIVEIS[currentDiff];
      const tempo = Math.max(1, timeElapsed);
      if (!(recordes[nivel] > 0) || tempo < recordes[nivel]) {
        recordes[nivel] = tempo;
        storage.set('recordes', recordes);
        mostrarMelhor();
      }
      audio.playSound('win');
      confetti();
    } else {
      faceIcon.textContent = '😵';
      // Revela todas as minas
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const cell = board[r][c];
          if (cell.isMine) {
            cell.element.textContent = '💣';
            cell.element.classList.add('revealed');
          } else if (cell.isFlagged && !cell.isMine) {
            cell.element.textContent = '❌'; // Bandeira errada
          }
        }
      }
      audio.playSound('defeat');
    }
  }

  // --- Controles de Modo (Abrir vs Bandeira) ---
  if (modeDigBtn) {
    modeDigBtn.addEventListener('click', () => {
      isFlagMode = false;
      modeDigBtn.classList.add('active');
      modeFlagBtn.classList.remove('active');
    });
  }

  if (modeFlagBtn) {
    modeFlagBtn.addEventListener('click', () => {
      isFlagMode = true;
      modeFlagBtn.classList.add('active');
      modeDigBtn.classList.remove('active');
    });
  }

  if (difficultySelect) {
    difficultySelect.addEventListener('change', (e) => {
      setDifficulty(e.target.value);
    });
  }

  if (faceBtn) faceBtn.addEventListener('click', initGame);

  // Chamado pelo nav: o cronômetro só corre enquanto a rota está aberta.
  controle = {
    pause: stopTimer,
    resume: () => {
      if (!firstClick && !isGameOver) {
        clearInterval(timerInterval);
        timerInterval = setInterval(tick, 1000);
      }
    }
  };

  setDifficulty('easy');

  return controle;
}

let instancia = null;

export default {
  id: 'minesweeper',
  nome: 'Campo Minado',
  icone: '💣',
  iconeClasse: 'mine-icon',
  descricao: 'Desarme o campo sem explodir',
  badge: { texto: 'LÓGICA', cor: 'red' },
  mount(raiz, ctx) {
    raiz.innerHTML = HTML;
    instancia = montar(raiz, ctx);
  },
  pause() {
    if (instancia) instancia.pause();
  },
  resume() {
    if (instancia) instancia.resume();
  },
  recorde(storage) {
    const r = storage.get('recordes', {});
    for (const nivel of ['facil', 'medio', 'dificil']) {
      const t = r[nivel];
      if (Number.isFinite(t) && t > 0) return `Melhor ${formatar(t)} (${NOMES_NIVEL[nivel]})`;
    }
    return null;
  }
};
