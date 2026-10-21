/**
 * Jogo da Velha — IA minimax com poda alfa-beta, 4 modos e escolha de símbolo.
 */

import { criarPlacarPainel } from '../core/placar-painel.js';

const HTML = `
    <div class="jogo-com-placar">
      <div class="jogo-com-placar-jogo">
      <header class="app-header">
        <div class="header-badge">
          <span class="badge-dot"></span>
          <span class="badge-text">IA MINIMAX INVENCÍVEL</span>
        </div>
        <h1 class="app-title">Jogo da Velha <span class="gradient-text">Força Máxima</span></h1>
        <p class="app-subtitle">Desafie o algoritmo matemático perfeito. Você consegue pelo menos empatar?</p>
      </header>

      <div class="controls-panel glass-card">
        <div class="control-group">
          <label for="difficulty-select" class="control-label">Modo / Dificuldade:</label>
          <div class="select-wrapper">
            <select id="difficulty-select" class="custom-select">
              <option value="max" selected>🔥 Força Máxima (Imbatível)</option>
              <option value="hard">⚡ Difícil (85% Perfeito)</option>
              <option value="medium">🎯 Médio (Equilibrado)</option>
              <option value="pvp">👥 2 Jogadores (Local)</option>
            </select>
          </div>
        </div>

        <div class="control-group">
          <span class="control-label">Você joga como:</span>
          <div class="symbol-toggle" id="symbol-toggle">
            <button type="button" class="symbol-btn active" id="btn-choose-x" data-symbol="X">
              <span class="symbol-glow x-glow">X</span>
              <span class="btn-subtext">Primeiro</span>
            </button>
            <button type="button" class="symbol-btn" id="btn-choose-o" data-symbol="O">
              <span class="symbol-glow o-glow">O</span>
              <span class="btn-subtext">Segundo</span>
            </button>
          </div>
        </div>

        <div class="sound-toggle-wrapper">
          <button id="btn-toggle-sound" class="icon-btn" title="Alternar Som" aria-label="Alternar Som">
            <span class="sound-icon-global">🔊</span>
          </button>
        </div>
      </div>

      <div class="scoreboard glass-card">
        <div class="score-card player-x-card" id="card-x">
          <div class="score-avatar x-avatar">X</div>
          <div class="score-info">
            <span class="score-label" id="label-x">Jogador (X)</span>
            <span class="score-value" id="score-x">0</span>
          </div>
        </div>

        <div class="score-divider">
          <span class="ties-count" id="score-ties">0</span>
          <span class="ties-label">Empates</span>
        </div>

        <div class="score-card player-o-card" id="card-o">
          <div class="score-avatar o-avatar">O</div>
          <div class="score-info">
            <span class="score-label" id="label-o">IA Máxima (O)</span>
            <span class="score-value" id="score-o">0</span>
          </div>
        </div>
      </div>

      <div class="turn-banner" id="turn-banner">
        <div class="turn-indicator">
          <span class="pulse-indicator" id="pulse-dot"></span>
          <span id="status-text">Sua vez de jogar (X)</span>
        </div>
      </div>

      <main class="board-wrapper">
        <div class="board" id="board" role="grid" aria-label="Tabuleiro do Jogo da Velha">
          <button class="cell" data-index="0" id="cell-0" role="gridcell" aria-label="Casa 1"></button>
          <button class="cell" data-index="1" id="cell-1" role="gridcell" aria-label="Casa 2"></button>
          <button class="cell" data-index="2" id="cell-2" role="gridcell" aria-label="Casa 3"></button>
          <button class="cell" data-index="3" id="cell-3" role="gridcell" aria-label="Casa 4"></button>
          <button class="cell" data-index="4" id="cell-4" role="gridcell" aria-label="Casa 5"></button>
          <button class="cell" data-index="5" id="cell-5" role="gridcell" aria-label="Casa 6"></button>
          <button class="cell" data-index="6" id="cell-6" role="gridcell" aria-label="Casa 7"></button>
          <button class="cell" data-index="7" id="cell-7" role="gridcell" aria-label="Casa 8"></button>
          <button class="cell" data-index="8" id="cell-8" role="gridcell" aria-label="Casa 9"></button>

          <svg class="strike-line-svg" id="strike-svg" viewBox="0 0 360 360">
            <line id="strike-line" x1="0" y1="0" x2="0" y2="0" stroke="url(#lineGradient)" stroke-width="8" stroke-linecap="round" />
            <defs>
              <linearGradient id="lineGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="#00f2fe" />
                <stop offset="100%" stop-color="#ff0844" />
              </linearGradient>
            </defs>
          </svg>
        </div>
      </main>

      <footer class="app-footer">
        <button id="btn-restart" class="action-btn primary-btn">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
            <path d="M3 3v5h5"/>
          </svg>
          <span>Reiniciar Partida</span>
        </button>

        <button id="btn-reset-scores" class="action-btn secondary-btn" title="Zerar Placar">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="1 4 1 10 7 10"/>
            <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/>
          </svg>
          <span>Zerar Placar</span>
        </button>
      </footer>

      <div class="info-card glass-card">
        <div class="info-header">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#00f2fe" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="16" x2="12" y2="12"/>
            <line x1="12" y1="8" x2="12.01" y2="8"/>
          </svg>
          <strong>Como funciona a Força Máxima?</strong>
        </div>
        <p>
          No modo <strong>Força Máxima</strong>, a IA calcula a árvore completa de jogadas usando o algoritmo <strong>Minimax</strong> com busca em profundidade ótima. Matematicamente, é impossível derrotá-la — o melhor resultado possível contra ela é o empate!
        </p>
      </div>
      </div>
      <aside class="placar-lateral" aria-label="Placar"></aside>
    </div>
`;

function montar(raiz, { audio, confetti, storage, conta }) {
  const byId = (id) => raiz.querySelector('#' + id);
  const playSound = audio.playSound;
  const triggerConfetti = confetti;

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

  const cells = Array.from(raiz.querySelectorAll('.cell'));
  const statusText = byId('status-text');
  const pulseDot = byId('pulse-dot');
  const difficultySelect = byId('difficulty-select');
  const btnChooseX = byId('btn-choose-x');
  const btnChooseO = byId('btn-choose-o');
  const btnRestart = byId('btn-restart');
  const btnResetScores = byId('btn-reset-scores');
  const scoreXEl = byId('score-x');
  const scoreOEl = byId('score-o');
  const scoreTiesEl = byId('score-ties');
  const labelXEl = byId('label-x');
  const labelOEl = byId('label-o');
  const cardX = byId('card-x');
  const cardO = byId('card-o');
  const strikeSvg = byId('strike-svg');
  const strikeLine = byId('strike-line');

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
        // Só vitória contra a IA entra no placar da conta (o X×O acima conta os dois lados).
        storage.set('vitorias', (Number(storage.get('vitorias', 0)) || 0) + 1);
        conta?.registrar('tictactoe', { tipo: 'vitoria' });
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
    storage.set('placar', state.scores);
  }

  function loadScores() {
    const saved = storage.get('placar', {});
    state.scores.x = Number(saved.x) || 0;
    state.scores.o = Number(saved.o) || 0;
    state.scores.ties = Number(saved.ties) || 0;
    scoreXEl.textContent = state.scores.x;
    scoreOEl.textContent = state.scores.o;
    scoreTiesEl.textContent = state.scores.ties;
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
      const symbolToggle = byId('symbol-toggle');
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

  const btnSom = byId('btn-toggle-sound');
  if (btnSom) btnSom.addEventListener('click', () => audio.toggleSound());
  audio.atualizarIcones();
}

let painel = null;

export default {
  id: 'tictactoe',
  nome: 'Jogo da Velha',
  icone: '<span class="mini-x">✕</span><span class="mini-o">○</span>',
  iconeClasse: 'x-o-icon',
  descricao: 'IA Força Máxima (Minimax)',
  badge: { texto: 'IA', cor: '' },
  mount(raiz, ctx) {
    raiz.innerHTML = HTML;
    montar(raiz, ctx);
    if (ctx.conta) {
      painel = criarPlacarPainel({ conta: ctx.conta, jogo: 'velha', limite: 5, rotulo: 'Vitórias contra a IA' });
      raiz.querySelector('.placar-lateral').append(painel.el);
    }
  },
  pause() {},
  resume() {
    painel?.atualizar();
  },
  recorde(storage) {
    const p = storage.get('placar');
    if (!p || !(p.x || p.o || p.ties)) return null;
    return `Placar ${Number(p.x) || 0}×${Number(p.o) || 0}`;
  }
};
