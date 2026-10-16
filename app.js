/**
 * Arcade Hub — Navegação Global, Sintetizador de Áudio e Jogo da Velha (Minimax)
 */

(function () {
  'use strict';

  // --- Sintetizador Web Audio API Global ---
  let audioCtx = null;
  let globalSoundEnabled = true;

  function initAudio() {
    if (!audioCtx) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (AudioContext) {
        audioCtx = new AudioContext();
      }
    }
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
  }

  function playTone(freq, type = 'sine', duration = 0.1, gainValue = 0.15) {
    if (!globalSoundEnabled) return;
    try {
      initAudio();
      if (!audioCtx) return;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();

      osc.type = type;
      osc.frequency.setValueAtTime(freq, audioCtx.currentTime);

      gain.gain.setValueAtTime(gainValue, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + duration);

      osc.connect(gain);
      gain.connect(audioCtx.destination);

      osc.start();
      osc.stop(audioCtx.currentTime + duration);
    } catch (e) {}
  }

  function playSound(name) {
    if (!globalSoundEnabled) return;
    initAudio();

    if (name === 'move-x') {
      playTone(520, 'sine', 0.12, 0.2);
    } else if (name === 'move-o') {
      playTone(330, 'triangle', 0.15, 0.25);
    } else if (name === 'win') {
      const notes = [440, 554.37, 659.25, 880];
      notes.forEach((freq, idx) => {
        setTimeout(() => playTone(freq, 'triangle', 0.25, 0.25), idx * 90);
      });
    } else if (name === 'defeat') {
      const notes = [400, 360, 320, 260];
      notes.forEach((freq, idx) => {
        setTimeout(() => playTone(freq, 'sawtooth', 0.2, 0.15), idx * 110);
      });
    } else if (name === 'tie') {
      playTone(300, 'sine', 0.25, 0.2);
      setTimeout(() => playTone(300, 'sine', 0.25, 0.2), 160);
    } else if (name === 'click') {
      playTone(600, 'sine', 0.04, 0.08);
    }
  }

  window.ArcadeAudio = {
    playTone,
    playSound,
    isSoundEnabled: () => globalSoundEnabled,
    toggleSound: () => {
      globalSoundEnabled = !globalSoundEnabled;
      updateSoundIcons();
      if (globalSoundEnabled) playSound('click');
      return globalSoundEnabled;
    }
  };

  function updateSoundIcons() {
    const icon = globalSoundEnabled ? '🔊' : '🔇';
    document.querySelectorAll('.sound-icon-global').forEach(el => el.textContent = icon);
    const drawerSoundIcon = document.querySelector('.sound-icon-drawer');
    if (drawerSoundIcon) drawerSoundIcon.textContent = icon;
  }

  // --- Confete em Canvas (Partículas Nativas) ---
  const confettiCanvas = document.getElementById('confetti-canvas');
  let confettiCtx = confettiCanvas ? confettiCanvas.getContext('2d') : null;
  let particles = [];
  let confettiAnimationId = null;

  function resizeConfetti() {
    if (!confettiCanvas) return;
    confettiCanvas.width = window.innerWidth;
    confettiCanvas.height = window.innerHeight;
  }
  window.addEventListener('resize', resizeConfetti);
  resizeConfetti();

  function triggerConfetti() {
    if (!confettiCtx) return;
    cancelAnimationFrame(confettiAnimationId);
    particles = [];
    const colors = ['#00f2fe', '#4facfe', '#ff0844', '#ffb199', '#f6d365', '#ffffff', '#10b981', '#a855f7'];

    for (let i = 0; i < 90; i++) {
      particles.push({
        x: window.innerWidth / 2,
        y: window.innerHeight / 2 - 50,
        vx: (Math.random() - 0.5) * 16,
        vy: (Math.random() - 0.8) * 15,
        size: Math.random() * 8 + 4,
        color: colors[Math.floor(Math.random() * colors.length)],
        rotation: Math.random() * 360,
        rotationSpeed: (Math.random() - 0.5) * 12,
        opacity: 1
      });
    }

    function render() {
      confettiCtx.clearRect(0, 0, confettiCanvas.width, confettiCanvas.height);
      let aliveCount = 0;

      particles.forEach((p) => {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.35;
        p.rotation += p.rotationSpeed;
        p.opacity -= 0.009;

        if (p.opacity > 0) {
          aliveCount++;
          confettiCtx.save();
          confettiCtx.translate(p.x, p.y);
          confettiCtx.rotate((p.rotation * Math.PI) / 180);
          confettiCtx.fillStyle = p.color;
          confettiCtx.globalAlpha = Math.max(0, p.opacity);
          confettiCtx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
          confettiCtx.restore();
        }
      });

      if (aliveCount > 0) {
        confettiAnimationId = requestAnimationFrame(render);
      } else {
        confettiCtx.clearRect(0, 0, confettiCanvas.width, confettiCanvas.height);
      }
    }

    render();
  }
  window.triggerConfetti = triggerConfetti;

  // --- Menu Hambúrguer & Navegação Entre 6 Jogos ---
  const menuToggleBtn = document.getElementById('menu-toggle-btn');
  const sidebarDrawer = document.getElementById('sidebar-drawer');
  const drawerBackdrop = document.getElementById('drawer-backdrop');
  const drawerCloseBtn = document.getElementById('drawer-close-btn');
  const drawerSoundToggle = document.getElementById('drawer-sound-toggle');
  const btnToggleSound = document.getElementById('btn-toggle-sound');

  const navItems = document.querySelectorAll('.nav-item');
  const views = document.querySelectorAll('.game-view');

  function openDrawer() {
    sidebarDrawer.classList.add('open');
    drawerBackdrop.classList.add('active');
    menuToggleBtn.classList.add('open');
    playSound('click');
  }

  function closeDrawer() {
    sidebarDrawer.classList.remove('open');
    drawerBackdrop.classList.remove('active');
    menuToggleBtn.classList.remove('open');
  }

  if (menuToggleBtn) {
    menuToggleBtn.addEventListener('click', () => {
      if (sidebarDrawer.classList.contains('open')) {
        closeDrawer();
      } else {
        openDrawer();
      }
    });
  }

  if (drawerCloseBtn) drawerCloseBtn.addEventListener('click', closeDrawer);
  if (drawerBackdrop) drawerBackdrop.addEventListener('click', closeDrawer);

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && sidebarDrawer.classList.contains('open')) {
      closeDrawer();
    }
  });

  function switchView(targetId) {
    playSound('click');

    // Pausa loops de jogos anteriores se aplicável
    if (window.SnakeGame && typeof window.SnakeGame.pause === 'function') window.SnakeGame.pause();
    if (window.TetrisGame && typeof window.TetrisGame.pause === 'function') window.TetrisGame.pause();

    views.forEach(v => {
      if (v.id === targetId) {
        v.classList.add('active');
      } else {
        v.classList.remove('active');
      }
    });

    navItems.forEach(item => {
      if (item.getAttribute('data-target') === targetId) {
        item.classList.add('active');
      } else {
        item.classList.remove('active');
      }
    });

    // Ações de inicialização específica de visão
    if (targetId === 'view-2048') {
      setTimeout(() => {
        if (window.Game2048 && window.Game2048.render) window.Game2048.render();
      }, 50);
    } else if (targetId === 'view-snake') {
      if (window.SnakeGame && typeof window.SnakeGame.resume === 'function') {
        window.SnakeGame.resume();
      }
    } else if (targetId === 'view-tetris') {
      if (window.TetrisGame && typeof window.TetrisGame.resume === 'function') {
        window.TetrisGame.resume();
      }
    }

    closeDrawer();
  }

  navItems.forEach(item => {
    item.addEventListener('click', () => {
      const target = item.getAttribute('data-target');
      if (target) switchView(target);
    });
  });

  if (drawerSoundToggle) {
    drawerSoundToggle.addEventListener('click', () => {
      window.ArcadeAudio.toggleSound();
    });
  }

  if (btnToggleSound) {
    btnToggleSound.addEventListener('click', () => {
      window.ArcadeAudio.toggleSound();
    });
  }

  // --- MOTOR DO JOGO DA VELHA (Minimax Força Máxima) ---
  const state = {
    board: Array(9).fill(''),
    currentPlayer: 'X',
    humanSymbol: 'X',
    aiSymbol: 'O',
    gameActive: true,
    isAiThinking: false,
    difficulty: 'max',
    scores: { x: 0, o: 0, ties: 0 }
  };

  const WINNING_COMBINATIONS = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8],
    [0, 3, 6], [1, 4, 7], [2, 5, 8],
    [0, 4, 8], [2, 4, 6]
  ];

  const STRIKE_COORDINATES = {
    '0,1,2': { x1: 20, y1: 60, x2: 340, y2: 60 },
    '3,4,5': { x1: 20, y1: 180, x2: 340, y2: 180 },
    '6,7,8': { x1: 20, y1: 300, x2: 340, y2: 300 },
    '0,3,6': { x1: 60, y1: 20, x2: 60, y2: 340 },
    '1,4,7': { x1: 180, y1: 20, x2: 180, y2: 340 },
    '2,5,8': { x1: 300, y1: 20, x2: 300, y2: 340 },
    '0,4,8': { x1: 30, y1: 30, x2: 330, y2: 330 },
    '2,4,6': { x1: 330, y1: 30, x2: 30, y2: 330 }
  };

  const cells = Array.from(document.querySelectorAll('.cell'));
  const statusText = document.getElementById('status-text');
  const pulseDot = document.getElementById('pulse-dot');
  const difficultySelect = document.getElementById('difficulty-select');
  const btnChooseX = document.getElementById('btn-choose-x');
  const btnChooseO = document.getElementById('btn-choose-o');
  const btnRestart = document.getElementById('btn-restart');
  const btnResetScores = document.getElementById('btn-reset-scores');
  const scoreXEl = document.getElementById('score-x');
  const scoreOEl = document.getElementById('score-o');
  const scoreTiesEl = document.getElementById('score-ties');
  const labelXEl = document.getElementById('label-x');
  const labelOEl = document.getElementById('label-o');
  const cardX = document.getElementById('card-x');
  const cardO = document.getElementById('card-o');
  const strikeSvg = document.getElementById('strike-svg');
  const strikeLine = document.getElementById('strike-line');

  function checkWinner(board) {
    for (const combo of WINNING_COMBINATIONS) {
      const [a, b, c] = combo;
      if (board[a] && board[a] === board[b] && board[a] === board[c]) {
        return { winner: board[a], combination: combo };
      }
    }
    if (board.every(cell => cell !== '')) {
      return { winner: 'tie', combination: null };
    }
    return null;
  }

  function minimax(board, depth, isMaximizing, aiSymbol, humanSymbol, alpha = -Infinity, beta = Infinity) {
    const result = checkWinner(board);
    if (result) {
      if (result.winner === aiSymbol) return 10 - depth;
      if (result.winner === humanSymbol) return depth - 10;
      if (result.winner === 'tie') return 0;
    }

    if (isMaximizing) {
      let maxScore = -Infinity;
      for (let i = 0; i < 9; i++) {
        if (board[i] === '') {
          board[i] = aiSymbol;
          const score = minimax(board, depth + 1, false, aiSymbol, humanSymbol, alpha, beta);
          board[i] = '';
          maxScore = Math.max(score, maxScore);
          alpha = Math.max(alpha, score);
          if (beta <= alpha) break;
        }
      }
      return maxScore;
    } else {
      let minScore = Infinity;
      for (let i = 0; i < 9; i++) {
        if (board[i] === '') {
          board[i] = humanSymbol;
          const score = minimax(board, depth + 1, true, aiSymbol, humanSymbol, alpha, beta);
          board[i] = '';
          minScore = Math.min(score, minScore);
          beta = Math.min(beta, score);
          if (beta <= alpha) break;
        }
      }
      return minScore;
    }
  }

  function getBestMove(board, aiSymbol, humanSymbol) {
    const emptyCount = board.filter(c => c === '').length;
    if (emptyCount === 9) {
      const optimalFirstMoves = [0, 2, 4, 6, 8];
      return optimalFirstMoves[Math.floor(Math.random() * optimalFirstMoves.length)];
    }

    let bestScore = -Infinity;
    let bestMoves = [];

    for (let i = 0; i < 9; i++) {
      if (board[i] === '') {
        board[i] = aiSymbol;
        const score = minimax(board, 0, false, aiSymbol, humanSymbol, -Infinity, Infinity);
        board[i] = '';

        if (score > bestScore) {
          bestScore = score;
          bestMoves = [i];
        } else if (score === bestScore) {
          bestMoves.push(i);
        }
      }
    }

    return bestMoves[Math.floor(Math.random() * bestMoves.length)];
  }

  function computeAiMove() {
    const availableMoves = [];
    state.board.forEach((cell, idx) => {
      if (cell === '') availableMoves.push(idx);
    });

    if (availableMoves.length === 0) return null;

    if (state.difficulty === 'max') {
      return getBestMove(state.board, state.aiSymbol, state.humanSymbol);
    } else if (state.difficulty === 'hard') {
      if (Math.random() < 0.85) {
        return getBestMove(state.board, state.aiSymbol, state.humanSymbol);
      } else {
        return availableMoves[Math.floor(Math.random() * availableMoves.length)];
      }
    } else if (state.difficulty === 'medium') {
      if (Math.random() < 0.55) {
        return getBestMove(state.board, state.aiSymbol, state.humanSymbol);
      } else {
        return availableMoves[Math.floor(Math.random() * availableMoves.length)];
      }
    }

    return availableMoves[0];
  }

  function updateTurnUI() {
    const isPlayerTurn = state.difficulty === 'pvp' 
      ? true 
      : state.currentPlayer === state.humanSymbol;

    if (state.currentPlayer === 'X') {
      pulseDot.className = 'pulse-indicator';
      cardX.classList.add('active-turn');
      cardO.classList.remove('active-turn');
    } else {
      pulseDot.className = 'pulse-indicator turn-o';
      cardO.classList.add('active-turn');
      cardX.classList.remove('active-turn');
    }

    if (!state.gameActive) return;

    if (state.difficulty === 'pvp') {
      statusText.textContent = `Vez de: Jogador (${state.currentPlayer})`;
    } else if (isPlayerTurn) {
      statusText.textContent = `Sua vez de jogar (${state.humanSymbol})`;
    } else {
      statusText.textContent = `IA calculando a melhor jogada...`;
    }
  }

  function updateLabels() {
    if (state.difficulty === 'pvp') {
      labelXEl.textContent = 'Jogador 1 (X)';
      labelOEl.textContent = 'Jogador 2 (O)';
    } else if (state.humanSymbol === 'X') {
      labelXEl.textContent = 'Você (X)';
      labelOEl.textContent = state.difficulty === 'max' ? 'IA Máxima (O)' : 'IA (O)';
    } else {
      labelXEl.textContent = state.difficulty === 'max' ? 'IA Máxima (X)' : 'IA (X)';
      labelOEl.textContent = 'Você (O)';
    }
  }

  function drawStrikeLine(combination) {
    const key = combination.join(',');
    const coords = STRIKE_COORDINATES[key];
    if (coords && strikeLine && strikeSvg) {
      strikeLine.setAttribute('x1', coords.x1);
      strikeLine.setAttribute('y1', coords.y1);
      strikeLine.setAttribute('x2', coords.x2);
      strikeLine.setAttribute('y2', coords.y2);
      strikeSvg.classList.add('visible');
    }
  }

  function hideStrikeLine() {
    if (strikeSvg) strikeSvg.classList.remove('visible');
  }

  function renderBoard() {
    cells.forEach((cell, index) => {
      const val = state.board[index];
      cell.textContent = val;
      cell.className = 'cell';

      if (val === 'X') {
        cell.classList.add('marked', 'cell-x');
        cell.disabled = true;
      } else if (val === 'O') {
        cell.classList.add('marked', 'cell-o');
        cell.disabled = true;
      } else {
        cell.disabled = !state.gameActive || state.isAiThinking;
      }
    });
  }

  function makeMove(index, symbol) {
    if (state.board[index] !== '' || !state.gameActive) return false;

    state.board[index] = symbol;
    playSound(symbol === 'X' ? 'move-x' : 'move-o');
    renderBoard();

    const result = checkWinner(state.board);

    if (result) {
      handleGameOver(result);
      return true;
    }

    state.currentPlayer = state.currentPlayer === 'X' ? 'O' : 'X';
    updateTurnUI();

    if (state.difficulty !== 'pvp' && state.currentPlayer === state.aiSymbol) {
      triggerAiTurn();
    }

    return true;
  }

  function triggerAiTurn() {
    state.isAiThinking = true;
    renderBoard();
    updateTurnUI();

    const thinkingDelay = Math.floor(Math.random() * 140) + 180;

    setTimeout(() => {
      if (!state.gameActive) {
        state.isAiThinking = false;
        return;
      }

      const move = computeAiMove();
      state.isAiThinking = false;

      if (move !== null && move !== undefined) {
        makeMove(move, state.aiSymbol);
      }
    }, thinkingDelay);
  }

  function handleGameOver(result) {
    state.gameActive = false;
    cardX.classList.remove('active-turn');
    cardO.classList.remove('active-turn');

    if (result.winner === 'tie') {
      state.scores.ties++;
      scoreTiesEl.textContent = state.scores.ties;
      statusText.innerHTML = `⚖️ <strong>Empate!</strong>`;
      playSound('tie');
    } else {
      const winner = result.winner;
      if (winner === 'X') {
        state.scores.x++;
        scoreXEl.textContent = state.scores.x;
      } else {
        state.scores.o++;
        scoreOEl.textContent = state.scores.o;
      }

      result.combination.forEach(idx => {
        const cell = cells[idx];
        cell.classList.add('winning-cell', winner === 'X' ? 'cell-x' : 'cell-o');
      });
      drawStrikeLine(result.combination);

      if (state.difficulty === 'pvp') {
        statusText.innerHTML = `🎉 <strong>Jogador (${winner}) venceu!</strong>`;
        playSound('win');
        triggerConfetti();
      } else if (winner === state.humanSymbol) {
        statusText.innerHTML = `🏆 <strong>Incrível! Você venceu a IA!</strong>`;
        playSound('win');
        triggerConfetti();
      } else {
        statusText.innerHTML = `🤖 <strong>IA (${winner}) venceu!</strong> Tente novamente.`;
        playSound('defeat');
      }
    }

    saveScores();
    renderBoard();
  }

  function restartGame() {
    state.board = Array(9).fill('');
    state.gameActive = true;
    state.isAiThinking = false;
    state.currentPlayer = 'X';

    hideStrikeLine();
    updateLabels();
    renderBoard();
    updateTurnUI();

    if (state.difficulty !== 'pvp' && state.humanSymbol === 'O') {
      triggerAiTurn();
    }
  }

  function resetScores() {
    state.scores.x = 0;
    state.scores.o = 0;
    state.scores.ties = 0;
    scoreXEl.textContent = '0';
    scoreOEl.textContent = '0';
    scoreTiesEl.textContent = '0';
    saveScores();
    playSound('click');
    restartGame();
  }

  function saveScores() {
    try {
      localStorage.setItem('jogodavelha_scores', JSON.stringify(state.scores));
    } catch (e) {}
  }

  function loadScores() {
    try {
      const saved = localStorage.getItem('jogodavelha_scores');
      if (saved) {
        const parsed = JSON.parse(saved);
        state.scores.x = Number(parsed.x) || 0;
        state.scores.o = Number(parsed.o) || 0;
        state.scores.ties = Number(parsed.ties) || 0;
        scoreXEl.textContent = state.scores.x;
        scoreOEl.textContent = state.scores.o;
        scoreTiesEl.textContent = state.scores.ties;
      }
    } catch (e) {}
  }

  // Event Listeners das células
  cells.forEach(cell => {
    cell.addEventListener('click', () => {
      const index = parseInt(cell.getAttribute('data-index'), 10);
      if (!state.gameActive || state.isAiThinking || state.board[index] !== '') return;

      if (state.difficulty === 'pvp') {
        makeMove(index, state.currentPlayer);
      } else {
        if (state.currentPlayer === state.humanSymbol) {
          makeMove(index, state.humanSymbol);
        }
      }
    });
  });

  if (btnChooseX) {
    btnChooseX.addEventListener('click', () => {
      if (state.humanSymbol === 'X') return;
      playSound('click');
      state.humanSymbol = 'X';
      state.aiSymbol = 'O';
      btnChooseX.classList.add('active');
      btnChooseO.classList.remove('active');
      restartGame();
    });
  }

  if (btnChooseO) {
    btnChooseO.addEventListener('click', () => {
      if (state.humanSymbol === 'O') return;
      playSound('click');
      state.humanSymbol = 'O';
      state.aiSymbol = 'X';
      btnChooseO.classList.add('active');
      btnChooseX.classList.remove('active');
      restartGame();
    });
  }

  if (difficultySelect) {
    difficultySelect.addEventListener('change', (e) => {
      playSound('click');
      state.difficulty = e.target.value;
      const symbolToggle = document.getElementById('symbol-toggle');
      if (symbolToggle) {
        symbolToggle.style.display = state.difficulty === 'pvp' ? 'none' : 'flex';
      }
      restartGame();
    });
  }

  if (btnRestart) btnRestart.addEventListener('click', restartGame);
  if (btnResetScores) btnResetScores.addEventListener('click', resetScores);

  loadScores();
  updateLabels();
  restartGame();
})();
