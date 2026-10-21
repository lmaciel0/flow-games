/**
 * Tetris Neon — clássico quebra-cabeça arcade em canvas, com recorde salvo.
 */

import { criarPlacarPainel } from '../core/placar-painel.js';

const HTML = `
    <div class="jogo-com-placar">
      <div class="jogo-com-placar-jogo">
      <header class="app-header">
        <div class="header-badge tetris-badge">
          <span class="badge-dot tetris-dot"></span>
          <span class="badge-text">QUEBRA-CABEÇA ARCADE</span>
        </div>
        <h1 class="app-title">Tetris <span class="gradient-text-tetris">Neon</span></h1>
        <p class="app-subtitle">Encaixe os blocos, elimine linhas completas e acelere o ritmo!</p>
      </header>

      <div class="tetris-main-layout">
        <!-- Canvas do Tabuleiro -->
        <div class="tetris-board-box">
          <canvas id="tetris-canvas" width="240" height="480"></canvas>
          <div class="tetris-overlay" id="tetris-overlay">
            <div class="tetris-message-box">
              <h2 id="tetris-overlay-title">Fim de Jogo!</h2>
              <p id="tetris-overlay-lines">Linhas: 0</p>
              <p id="tetris-overlay-record" class="tetris-record-msg"></p>
              <button id="tetris-restart-btn" class="action-btn primary-btn">Jogar Novamente</button>
            </div>
          </div>
        </div>

        <!-- Painel Lateral: Próxima Peça & Stats -->
        <div class="tetris-sidebar">
          <div class="tetris-stat-card glass-card">
            <span class="tetris-stat-label">PRÓXIMA</span>
            <canvas id="tetris-next-canvas" width="90" height="90"></canvas>
          </div>

          <div class="tetris-stat-card glass-card">
            <span class="tetris-stat-label">PONTOS</span>
            <span class="tetris-stat-val" id="tetris-score">0</span>
          </div>

          <div class="tetris-stat-card glass-card">
            <span class="tetris-stat-label">LINHAS</span>
            <span class="tetris-stat-val" id="tetris-lines">0</span>
          </div>

          <div class="tetris-stat-card glass-card">
            <span class="tetris-stat-label">NÍVEL</span>
            <span class="tetris-stat-val" id="tetris-level">1</span>
          </div>

          <div class="tetris-stat-card glass-card">
            <span class="tetris-stat-label">RECORDE</span>
            <span class="tetris-stat-val" id="tetris-best">0</span>
          </div>

          <button id="tetris-pause-btn" class="action-btn-small" style="width: 100%;">
            <span id="tetris-pause-icon">⏸️</span>
            <span id="tetris-pause-text">Pausar</span>
          </button>
        </div>
      </div>

      <!-- Controles Virtuais do Tetris -->
      <div class="tetris-controls-bar">
        <button class="tetris-ctrl-btn" id="tetris-btn-left">◀</button>
        <button class="tetris-ctrl-btn" id="tetris-btn-rotate">↻ Girar</button>
        <button class="tetris-ctrl-btn" id="tetris-btn-right">▶</button>
        <button class="tetris-ctrl-btn" id="tetris-btn-down">▼ Descer</button>
        <button class="tetris-ctrl-btn drop" id="tetris-btn-drop">⏬ Queda</button>
      </div>

      <div class="info-card glass-card">
        <div class="info-header">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#00f2fe" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
          </svg>
          <strong>Controles do Tetris:</strong>
        </div>
        <p><strong>← →</strong>: Move lateralmente | <strong>↑ ou W</strong>: Gira a peça | <strong>↓ ou S</strong>: Acelera queda | <strong>Espaço</strong>: Queda instantânea (Hard Drop).</p>
      </div>
      </div>
      <aside class="placar-lateral" aria-label="Placar"></aside>
    </div>
`;

function montar(raiz, { audio, confetti, storage, conta }) {
  const byId = (id) => raiz.querySelector('#' + id);
  let controle;


  const canvas = byId('tetris-canvas');
  const ctx = canvas.getContext('2d');

  const nextCanvas = byId('tetris-next-canvas');
  const nextCtx = nextCanvas ? nextCanvas.getContext('2d') : null;

  const scoreEl = byId('tetris-score');
  const linesEl = byId('tetris-lines');
  const levelEl = byId('tetris-level');
  const pauseBtn = byId('tetris-pause-btn');
  const pauseIcon = byId('tetris-pause-icon');
  const pauseText = byId('tetris-pause-text');
  const restartBtn = byId('tetris-restart-btn');
  const overlay = byId('tetris-overlay');
  const overlayLines = byId('tetris-overlay-lines');
  const overlayRecord = byId('tetris-overlay-record');
  const bestEl = byId('tetris-best');

  const COLS = 10;
  const ROWS = 20;
  const BLOCK_SIZE = canvas.width / COLS; // 24px

  // Peças Tetris e cores Neon
  const SHAPES = {
    I: { shape: [[1, 1, 1, 1]], color: '#00f2fe' },
    J: { shape: [[1, 0, 0], [1, 1, 1]], color: '#3b82f6' },
    L: { shape: [[0, 0, 1], [1, 1, 1]], color: '#f97316' },
    O: { shape: [[1, 1], [1, 1]], color: '#f6d365' },
    S: { shape: [[0, 1, 1], [1, 1, 0]], color: '#10b981' },
    T: { shape: [[0, 1, 0], [1, 1, 1]], color: '#a855f7' },
    Z: { shape: [[1, 1, 0], [0, 1, 1]], color: '#ef4444' }
  };
  const PIECE_NAMES = ['I', 'J', 'L', 'O', 'S', 'T', 'Z'];

  let board = [];
  let currentPiece = null;
  let nextPiece = null;
  let score = 0;
  let lines = 0;
  let level = 1;
  let dropInterval = 800; // ms
  let lastDropTime = 0;
  let animId = null;
  let isPaused = false;
  let isGameOver = false;

  function initBoard() {
    board = [];
    for (let r = 0; r < ROWS; r++) {
      board[r] = Array(COLS).fill(0);
    }
  }

  function getRandomPiece() {
    const name = PIECE_NAMES[Math.floor(Math.random() * PIECE_NAMES.length)];
    const def = SHAPES[name];
    return {
      name,
      shape: def.shape.map(row => [...row]),
      color: def.color,
      x: Math.floor((COLS - def.shape[0].length) / 2),
      y: 0
    };
  }

  function rotateMatrix(matrix) {
    const rows = matrix.length;
    const cols = matrix[0].length;
    const result = [];
    for (let c = 0; c < cols; c++) {
      result[c] = [];
      for (let r = rows - 1; r >= 0; r--) {
        result[c].push(matrix[r][c]);
      }
    }
    return result;
  }

  function isValidMove(shape, offsetX, offsetY) {
    for (let r = 0; r < shape.length; r++) {
      for (let c = 0; c < shape[r].length; c++) {
        if (shape[r][c]) {
          const newX = offsetX + c;
          const newY = offsetY + r;

          if (newX < 0 || newX >= COLS || newY >= ROWS) return false;
          if (newY >= 0 && board[newY][newX]) return false;
        }
      }
    }
    return true;
  }

  function lockPiece() {
    currentPiece.shape.forEach((row, r) => {
      row.forEach((val, c) => {
        if (val) {
          const boardY = currentPiece.y + r;
          const boardX = currentPiece.x + c;
          if (boardY >= 0 && boardY < ROWS && boardX >= 0 && boardX < COLS) {
            board[boardY][boardX] = currentPiece.color;
          }
        }
      });
    });

    clearLines();

    currentPiece = nextPiece;
    nextPiece = getRandomPiece();
    drawNextPiece();

    // Se a nova peça já colide, é Game Over
    if (!isValidMove(currentPiece.shape, currentPiece.x, currentPiece.y)) {
      handleGameOver();
    }
  }

  function clearLines() {
    let clearedCount = 0;

    for (let r = ROWS - 1; r >= 0; r--) {
      if (board[r].every(cell => cell !== 0)) {
        board.splice(r, 1);
        board.unshift(Array(COLS).fill(0));
        clearedCount++;
        r++; // checa a mesma linha novamente após o splice
      }
    }

    if (clearedCount > 0) {
      lines += clearedCount;
      linesEl.textContent = lines;

      // Pontuação padrão clássica
      const points = [0, 100, 300, 500, 800];
      score += (points[clearedCount] || 100) * level;
      scoreEl.textContent = score;

      // Sobe de nível a cada 10 linhas
      const newLevel = Math.floor(lines / 10) + 1;
      if (newLevel !== level) {
        level = newLevel;
        levelEl.textContent = level;
        dropInterval = Math.max(120, 800 - (level - 1) * 70);
      }

      if (clearedCount === 4) {
        audio.playSound('win');
        confetti();
      } else {
        audio.playTone(650, 'triangle', 0.12, 0.25);
      }
    }
  }

  function hardDrop() {
    if (isGameOver || isPaused || !currentPiece) return;
    while (isValidMove(currentPiece.shape, currentPiece.x, currentPiece.y + 1)) {
      currentPiece.y++;
      score += 2;
    }
    scoreEl.textContent = score;
    audio.playTone(300, 'sawtooth', 0.08, 0.2);
    lockPiece();
    draw();
  }

  function getGhostY() {
    let ghostY = currentPiece.y;
    while (isValidMove(currentPiece.shape, currentPiece.x, ghostY + 1)) {
      ghostY++;
    }
    return ghostY;
  }

  function draw() {
    ctx.fillStyle = '#080c16';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Grade sutil
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.035)';
    ctx.lineWidth = 1;
    for (let c = 0; c <= COLS; c++) {
      ctx.beginPath();
      ctx.moveTo(c * BLOCK_SIZE, 0);
      ctx.lineTo(c * BLOCK_SIZE, canvas.height);
      ctx.stroke();
    }
    for (let r = 0; r <= ROWS; r++) {
      ctx.beginPath();
      ctx.moveTo(0, r * BLOCK_SIZE);
      ctx.lineTo(canvas.width, r * BLOCK_SIZE);
      ctx.stroke();
    }

    // Blocos fixos no tabuleiro
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (board[r][c]) {
          drawBlock(ctx, c * BLOCK_SIZE, r * BLOCK_SIZE, board[r][c]);
        }
      }
    }

    if (currentPiece) {
      // Peça fantasma (Ghost piece)
      const ghostY = getGhostY();
      currentPiece.shape.forEach((row, r) => {
        row.forEach((val, c) => {
          if (val) {
            drawGhostBlock(ctx, (currentPiece.x + c) * BLOCK_SIZE, (ghostY + r) * BLOCK_SIZE, currentPiece.color);
          }
        });
      });

      // Peça atual
      currentPiece.shape.forEach((row, r) => {
        row.forEach((val, c) => {
          if (val) {
            drawBlock(ctx, (currentPiece.x + c) * BLOCK_SIZE, (currentPiece.y + r) * BLOCK_SIZE, currentPiece.color);
          }
        });
      });
    }
  }

  function drawBlock(cCtx, x, y, color) {
    cCtx.save();
    cCtx.fillStyle = color;
    cCtx.shadowBlur = 10;
    cCtx.shadowColor = color;
    cCtx.beginPath();
    cCtx.roundRect(x + 1, y + 1, BLOCK_SIZE - 2, BLOCK_SIZE - 2, 4);
    cCtx.fill();

    // Brilho interior
    cCtx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
    cCtx.lineWidth = 1;
    cCtx.stroke();
    cCtx.restore();
  }

  function drawGhostBlock(cCtx, x, y, color) {
    cCtx.save();
    cCtx.strokeStyle = color;
    cCtx.fillStyle = 'rgba(255, 255, 255, 0.05)';
    cCtx.lineWidth = 1.5;
    cCtx.beginPath();
    cCtx.roundRect(x + 2, y + 2, BLOCK_SIZE - 4, BLOCK_SIZE - 4, 3);
    cCtx.fill();
    cCtx.stroke();
    cCtx.restore();
  }

  function drawNextPiece() {
    if (!nextCtx || !nextPiece) return;
    nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);

    const shape = nextPiece.shape;
    const bSize = 16;
    const offX = (nextCanvas.width - shape[0].length * bSize) / 2;
    const offY = (nextCanvas.height - shape.length * bSize) / 2;

    shape.forEach((row, r) => {
      row.forEach((val, c) => {
        if (val) {
          nextCtx.save();
          nextCtx.fillStyle = nextPiece.color;
          nextCtx.shadowBlur = 8;
          nextCtx.shadowColor = nextPiece.color;
          nextCtx.beginPath();
          nextCtx.roundRect(offX + c * bSize, offY + r * bSize, bSize - 2, bSize - 2, 3);
          nextCtx.fill();
          nextCtx.restore();
        }
      });
    });
  }

  function update(time = 0) {
    if (!isPaused && !isGameOver) {
      if (time - lastDropTime > dropInterval) {
        if (isValidMove(currentPiece.shape, currentPiece.x, currentPiece.y + 1)) {
          currentPiece.y++;
        } else {
          lockPiece();
        }
        lastDropTime = time;
      }
      draw();
    }
    animId = requestAnimationFrame(update);
  }

  function moveLeft() {
    if (isGameOver || isPaused || !currentPiece) return;
    if (isValidMove(currentPiece.shape, currentPiece.x - 1, currentPiece.y)) {
      currentPiece.x--;
      draw();
    }
  }

  function moveRight() {
    if (isGameOver || isPaused || !currentPiece) return;
    if (isValidMove(currentPiece.shape, currentPiece.x + 1, currentPiece.y)) {
      currentPiece.x++;
      draw();
    }
  }

  function rotate() {
    if (isGameOver || isPaused || !currentPiece) return;
    const rotated = rotateMatrix(currentPiece.shape);

    // Wall kicks: testa posição normal, deslocamento para esquerda ou direita
    const kicks = [0, -1, 1, -2, 2];
    for (const kick of kicks) {
      if (isValidMove(rotated, currentPiece.x + kick, currentPiece.y)) {
        currentPiece.x += kick;
        currentPiece.shape = rotated;
        audio.playTone(500, 'sine', 0.05, 0.15);
        draw();
        return;
      }
    }
  }

  function moveDown() {
    if (isGameOver || isPaused || !currentPiece) return;
    if (isValidMove(currentPiece.shape, currentPiece.x, currentPiece.y + 1)) {
      currentPiece.y++;
      score += 1;
      scoreEl.textContent = score;
      draw();
    } else {
      lockPiece();
    }
  }

  function resetGame() {
    initBoard();
    score = 0;
    lines = 0;
    level = 1;
    dropInterval = 800;
    isPaused = false;
    isGameOver = false;

    scoreEl.textContent = '0';
    linesEl.textContent = '0';
    levelEl.textContent = '1';
    overlay.classList.remove('active');
    updatePauseUI();

    currentPiece = getRandomPiece();
    nextPiece = getRandomPiece();
    drawNextPiece();
    lastDropTime = performance.now();
  }

  function togglePause() {
    if (isGameOver) return;
    isPaused = !isPaused;
    updatePauseUI();
  }

  function updatePauseUI() {
    pauseIcon.textContent = isPaused ? '▶️' : '⏸️';
    pauseText.textContent = isPaused ? 'Continuar' : 'Pausar';
  }

  function handleGameOver() {
    isGameOver = true;
    overlayLines.textContent = `Linhas eliminadas: ${lines} | Pontos: ${score}`;
    overlay.classList.add('active');
    const anterior = storage.get('recorde', 0);
    if (score > anterior) {
      storage.set('recorde', score);
      bestEl.textContent = score;
      overlayRecord.textContent = 'Novo recorde!';
    } else {
      overlayRecord.textContent = '';
    }
    audio.playSound('defeat');
    // O servidor guarda só o maior: fim de partida basta.
    if (score > 0) conta?.registrar('tetris', { tipo: 'pontos', valor: score });
  }

  // Teclado
  window.addEventListener('keydown', (e) => {
    const viewTetris = raiz;
    if (!viewTetris || !viewTetris.classList.contains('active')) return;

    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) {
      e.preventDefault();
    }

    if (e.code === 'ArrowLeft' || e.code === 'KeyA') moveLeft();
    else if (e.code === 'ArrowRight' || e.code === 'KeyD') moveRight();
    else if (e.code === 'ArrowUp' || e.code === 'KeyW') rotate();
    else if (e.code === 'ArrowDown' || e.code === 'KeyS') moveDown();
    else if (e.code === 'Space') hardDrop();
  });

  // Botões Virtuais
  byId('tetris-btn-left').addEventListener('click', moveLeft);
  byId('tetris-btn-right').addEventListener('click', moveRight);
  byId('tetris-btn-rotate').addEventListener('click', rotate);
  byId('tetris-btn-down').addEventListener('click', moveDown);
  byId('tetris-btn-drop').addEventListener('click', hardDrop);

  if (pauseBtn) pauseBtn.addEventListener('click', togglePause);
  if (restartBtn) restartBtn.addEventListener('click', resetGame);

  // Chamado pelo nav: o loop de animação só roda enquanto a rota está aberta.
  controle = {
    pause: () => {
      isPaused = true;
      cancelAnimationFrame(animId);
      animId = null;
      updatePauseUI();
    },
    resume: () => {
      isPaused = false;
      lastDropTime = performance.now();
      if (!animId) animId = requestAnimationFrame(update);
      updatePauseUI();
    }
  };

  // Login/logout reescreve o recorde no storage: relê para a tela mostrar o da conta.
  conta?.assinar((evento) => {
    if (evento?.tipo === 'progresso') bestEl.textContent = storage.get('recorde', 0);
  });

  bestEl.textContent = storage.get('recorde', 0);
  resetGame();
  isPaused = true;
  updatePauseUI();
  animId = requestAnimationFrame(update);

  return controle;
}

let instancia = null;
let painel = null;

export default {
  id: 'tetris',
  nome: 'Tetris Neon',
  icone: '🧱',
  iconeClasse: 'tetris-icon',
  descricao: 'Encaixe blocos e limpe linhas',
  badge: { texto: 'CLÁSSICO', cor: 'cyan' },
  mount(raiz, ctx) {
    raiz.innerHTML = HTML;
    instancia = montar(raiz, ctx);
    if (ctx.conta) {
      painel = criarPlacarPainel({ conta: ctx.conta, jogo: 'tetris', limite: 5, rotulo: 'Maior pontuação' });
      raiz.querySelector('.placar-lateral').append(painel.el);
    }
  },
  pause() {
    if (instancia) instancia.pause();
  },
  resume() {
    painel?.atualizar();
    if (instancia) instancia.resume();
  },
  recorde(storage) {
    const n = storage.get('recorde', 0);
    return n > 0 ? `Recorde ${n}` : null;
  }
};
