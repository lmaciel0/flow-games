/**
 * Campo Minado — Lógica Completa com Primeiro Clique Seguro
 */

(function () {
  'use strict';

  const gridContainer = document.getElementById('mine-grid');
  const flagsLeftEl = document.getElementById('mine-flags-left');
  const timerEl = document.getElementById('mine-timer');
  const difficultySelect = document.getElementById('mine-difficulty');
  const faceBtn = document.getElementById('mine-face-btn');
  const faceIcon = document.getElementById('mine-face-icon');
  const modeDigBtn = document.getElementById('mine-mode-dig');
  const modeFlagBtn = document.getElementById('mine-mode-flag');

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

  function startTimer() {
    clearInterval(timerInterval);
    timeElapsed = 0;
    timerEl.textContent = '000';
    timerInterval = setInterval(() => {
      timeElapsed++;
      if (timeElapsed > 999) timeElapsed = 999;
      timerEl.textContent = timeElapsed.toString().padStart(3, '0');
    }, 1000);
  }

  function stopTimer() {
    clearInterval(timerInterval);
  }

  function initGame() {
    stopTimer();
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

    if (window.ArcadeAudio) window.ArcadeAudio.playTone(400, 'sine', 0.04, 0.1);

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
      if (window.ArcadeAudio) window.ArcadeAudio.playTone(600, 'sine', 0.05, 0.15);
    } else {
      cell.element.textContent = '';
      flagsPlaced--;
      if (window.ArcadeAudio) window.ArcadeAudio.playTone(350, 'sine', 0.05, 0.15);
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
      if (window.ArcadeAudio) window.ArcadeAudio.playSound('win');
      if (typeof window.triggerConfetti === 'function') window.triggerConfetti();
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
      if (window.ArcadeAudio) window.ArcadeAudio.playSound('defeat');
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

  setDifficulty('easy');
})();
