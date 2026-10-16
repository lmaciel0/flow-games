/**
 * Snake Neon — jogo da cobrinha retrô em canvas.
 */

const HTML = `
      <header class="app-header">
        <div class="header-badge snake-badge">
          <span class="badge-dot snake-dot"></span>
          <span class="badge-text">ARCADE RETRÔ NEON</span>
        </div>
        <h1 class="app-title">Snake <span class="gradient-text-snake">Neon</span></h1>
        <p class="app-subtitle">Colete a energia luminosa e desvie da própria cauda para bater o recorde!</p>
      </header>

      <div class="snake-top-bar glass-card">
        <div class="snake-scores">
          <div class="snake-score-box">
            <span class="snake-score-title">PONTOS</span>
            <span class="snake-score-num" id="snake-current-score">0</span>
          </div>
          <div class="snake-score-box best">
            <span class="snake-score-title">RECORDE</span>
            <span class="snake-score-num" id="snake-best-score">0</span>
          </div>
        </div>

        <div class="snake-actions">
          <button id="snake-pause-btn" class="action-btn-small">
            <span id="snake-pause-icon">⏸️</span>
            <span id="snake-pause-text">Pausar</span>
          </button>
          <button id="snake-restart-btn" class="action-btn-small primary-snake">
            <span>Novo Jogo</span>
          </button>
        </div>
      </div>

      <main class="snake-wrapper">
        <div class="snake-canvas-container">
          <canvas id="snake-canvas" width="400" height="400"></canvas>
          <div class="snake-overlay" id="snake-overlay">
            <div class="snake-message-box">
              <h2 id="snake-overlay-title">Fim de Jogo!</h2>
              <p id="snake-overlay-score">Pontuação: 0</p>
              <button id="snake-overlay-restart" class="action-btn primary-btn">Jogar Novamente</button>
            </div>
          </div>
        </div>

        <!-- D-Pad Virtual para Mobile / Telas Menores -->
        <div class="virtual-dpad" id="snake-dpad">
          <button class="dpad-btn up" id="dpad-up">▲</button>
          <div class="dpad-middle">
            <button class="dpad-btn left" id="dpad-left">◀</button>
            <div class="dpad-center"></div>
            <button class="dpad-btn right" id="dpad-right">▶</button>
          </div>
          <button class="dpad-btn down" id="dpad-down">▼</button>
        </div>
      </main>

      <div class="info-card glass-card">
        <div class="info-header">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
          </svg>
          <strong>Controles da Snake:</strong>
        </div>
        <p>Use as <strong>Setas do Teclado (↑ ↓ ← →)</strong> ou <strong>W, A, S, D</strong> (ou os botões direcionais na tela). Frutas douradas especiais concedem pontuação extra por tempo limitado!</p>
      </div>
`;

function montar(raiz, { audio, storage }) {
  const byId = (id) => raiz.querySelector('#' + id);
  let controle;


  const canvas = byId('snake-canvas');
  const ctx = canvas.getContext('2d');

  const scoreEl = byId('snake-current-score');
  const bestScoreEl = byId('snake-best-score');
  const pauseBtn = byId('snake-pause-btn');
  const pauseText = byId('snake-pause-text');
  const pauseIcon = byId('snake-pause-icon');
  const restartBtn = byId('snake-restart-btn');
  const overlay = byId('snake-overlay');
  const overlayScore = byId('snake-overlay-score');
  const overlayRestart = byId('snake-overlay-restart');

  const GRID_SIZE = 20; // 20x20
  const CELL_SIZE = canvas.width / GRID_SIZE; // 20px

  let snake = [];
  let dir = { x: 1, y: 0 };
  let nextDir = { x: 1, y: 0 };
  let food = { x: 15, y: 10 };
  let bonusFood = null;
  let bonusTimer = 0;
  let score = 0;
  let bestScore = 0;
  let gameInterval = null;
  let isPaused = false;
  let isGameOver = false;
  let speed = 130;

  function loadBestScore() {
    bestScore = storage.get('recorde', 0);
    bestScoreEl.textContent = bestScore;
  }

  function saveBestScore() {
    if (score > bestScore) {
      bestScore = score;
      bestScoreEl.textContent = bestScore;
      storage.set('recorde', bestScore);
    }
  }

  function spawnFood() {
    let emptySpots = [];
    for (let x = 0; x < GRID_SIZE; x++) {
      for (let y = 0; y < GRID_SIZE; y++) {
        const inSnake = snake.some(s => s.x === x && s.y === y);
        if (!inSnake) emptySpots.push({ x, y });
      }
    }
    if (emptySpots.length > 0) {
      food = emptySpots[Math.floor(Math.random() * emptySpots.length)];
    }

    // Chance de 20% de gerar fruta bônus dourada
    if (!bonusFood && Math.random() < 0.25 && emptySpots.length > 1) {
      const bonusSpot = emptySpots[Math.floor(Math.random() * emptySpots.length)];
      bonusFood = { x: bonusSpot.x, y: bonusSpot.y, duration: 60 }; // ~7 segundos
    }
  }

  function resetGame() {
    snake = [
      { x: 5, y: 10 },
      { x: 4, y: 10 },
      { x: 3, y: 10 }
    ];
    dir = { x: 1, y: 0 };
    nextDir = { x: 1, y: 0 };
    score = 0;
    speed = 130;
    bonusFood = null;
    isPaused = false;
    isGameOver = false;
    scoreEl.textContent = '0';
    overlay.classList.remove('active');
    updatePauseUI();
    spawnFood();
    startLoop();
  }

  function startLoop() {
    clearInterval(gameInterval);
    gameInterval = setInterval(gameStep, speed);
  }

  function gameStep() {
    if (isPaused || isGameOver) return;

    dir = { ...nextDir };
    const head = { x: snake[0].x + dir.x, y: snake[0].y + dir.y };

    // Colisão com as paredes
    if (head.x < 0 || head.x >= GRID_SIZE || head.y < 0 || head.y >= GRID_SIZE) {
      handleGameOver();
      return;
    }

    // Colisão com o próprio corpo
    if (snake.some(segment => segment.x === head.x && segment.y === head.y)) {
      handleGameOver();
      return;
    }

    snake.unshift(head);

    // Comeu a comida normal
    if (head.x === food.x && head.y === food.y) {
      score += 10;
      scoreEl.textContent = score;
      saveBestScore();
      audio.playTone(600, 'triangle', 0.08, 0.2);

      // Acelera levemente a cada 50 pontos
      if (score % 50 === 0 && speed > 70) {
        speed -= 8;
        startLoop();
      }

      spawnFood();
    } else if (bonusFood && head.x === bonusFood.x && head.y === bonusFood.y) {
      score += 35;
      scoreEl.textContent = score;
      saveBestScore();
      bonusFood = null;
      audio.playTone(750, 'sine', 0.1, 0.25);
      setTimeout(() => audio.playTone(950, 'sine', 0.15, 0.25), 80);
    } else {
      snake.pop();
    }

    // Gerencia tempo da fruta bônus
    if (bonusFood) {
      bonusFood.duration--;
      if (bonusFood.duration <= 0) bonusFood = null;
    }

    draw();
  }

  function draw() {
    ctx.fillStyle = '#080c16';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Grade sutil
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
    ctx.lineWidth = 1;
    for (let i = 0; i < canvas.width; i += CELL_SIZE) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i, canvas.height);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, i);
      ctx.lineTo(canvas.width, i);
      ctx.stroke();
    }

    // Desenha comida normal (Neon Rosa/Ciano)
    ctx.save();
    ctx.shadowBlur = 15;
    ctx.shadowColor = '#00f2fe';
    ctx.fillStyle = '#00f2fe';
    ctx.beginPath();
    ctx.arc(
      food.x * CELL_SIZE + CELL_SIZE / 2,
      food.y * CELL_SIZE + CELL_SIZE / 2,
      CELL_SIZE / 2.5,
      0,
      Math.PI * 2
    );
    ctx.fill();
    ctx.restore();

    // Desenha comida bônus (Dourada pulsante)
    if (bonusFood) {
      ctx.save();
      ctx.shadowBlur = 20;
      ctx.shadowColor = '#f6d365';
      ctx.fillStyle = '#f6d365';
      ctx.beginPath();
      ctx.arc(
        bonusFood.x * CELL_SIZE + CELL_SIZE / 2,
        bonusFood.y * CELL_SIZE + CELL_SIZE / 2,
        CELL_SIZE / 2.2,
        0,
        Math.PI * 2
      );
      ctx.fill();
      ctx.restore();
    }

    // Desenha a cobra com gradiente neon
    snake.forEach((segment, index) => {
      ctx.save();
      const isHead = index === 0;

      if (isHead) {
        ctx.fillStyle = '#10b981';
        ctx.shadowBlur = 18;
        ctx.shadowColor = '#10b981';
      } else {
        const ratio = index / snake.length;
        ctx.fillStyle = `rgb(${16 + ratio * 40}, ${185 - ratio * 60}, ${129 + ratio * 80})`;
        ctx.shadowBlur = 8;
        ctx.shadowColor = 'rgba(16, 185, 129, 0.3)';
      }

      ctx.beginPath();
      ctx.roundRect(
        segment.x * CELL_SIZE + 1.5,
        segment.y * CELL_SIZE + 1.5,
        CELL_SIZE - 3,
        CELL_SIZE - 3,
        isHead ? 6 : 4
      );
      ctx.fill();

      // Olhos na cabeça
      if (isHead) {
        ctx.fillStyle = '#ffffff';
        const eyeOffset = 4;
        const eyeSize = 3;
        let eye1X = segment.x * CELL_SIZE + eyeOffset;
        let eye1Y = segment.y * CELL_SIZE + eyeOffset;
        let eye2X = segment.x * CELL_SIZE + CELL_SIZE - eyeOffset - eyeSize;
        let eye2Y = segment.y * CELL_SIZE + eyeOffset;

        if (dir.y !== 0) {
          eye1Y = segment.y * CELL_SIZE + (dir.y > 0 ? CELL_SIZE - 6 : 4);
          eye2Y = eye1Y;
        }

        ctx.fillRect(eye1X, eye1Y, eyeSize, eyeSize);
        ctx.fillRect(eye2X, eye2Y, eyeSize, eyeSize);
      }

      ctx.restore();
    });
  }

  function handleGameOver() {
    isGameOver = true;
    clearInterval(gameInterval);
    overlayScore.textContent = `Pontuação: ${score}`;
    overlay.classList.add('active');
    audio.playSound('defeat');
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

  function handleDirection(dx, dy) {
    if (isGameOver || isPaused) return;
    // Impede inversão de 180°
    if ((dx !== 0 && dir.x === -dx) || (dy !== 0 && dir.y === -dy)) return;
    nextDir = { x: dx, y: dy };
  }

  // Teclado
  window.addEventListener('keydown', (e) => {
    const viewSnake = raiz;
    if (!viewSnake || !viewSnake.classList.contains('active')) return;

    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) {
      e.preventDefault();
    }

    if (e.code === 'ArrowUp' || e.code === 'KeyW') handleDirection(0, -1);
    else if (e.code === 'ArrowDown' || e.code === 'KeyS') handleDirection(0, 1);
    else if (e.code === 'ArrowLeft' || e.code === 'KeyA') handleDirection(-1, 0);
    else if (e.code === 'ArrowRight' || e.code === 'KeyD') handleDirection(1, 0);
    else if (e.code === 'Space') togglePause();
  });

  // D-Pad Virtual
  byId('dpad-up').addEventListener('click', () => handleDirection(0, -1));
  byId('dpad-down').addEventListener('click', () => handleDirection(0, 1));
  byId('dpad-left').addEventListener('click', () => handleDirection(-1, 0));
  byId('dpad-right').addEventListener('click', () => handleDirection(1, 0));

  // Deslizar o dedo no tabuleiro também muda a direção (celular).
  let toqueX = 0;
  let toqueY = 0;
  canvas.addEventListener('touchstart', (e) => {
    toqueX = e.touches[0].clientX;
    toqueY = e.touches[0].clientY;
  }, { passive: true });
  canvas.addEventListener('touchend', (e) => {
    const dx = e.changedTouches[0].clientX - toqueX;
    const dy = e.changedTouches[0].clientY - toqueY;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 20) return;
    if (Math.abs(dx) > Math.abs(dy)) handleDirection(dx > 0 ? 1 : -1, 0);
    else handleDirection(0, dy > 0 ? 1 : -1);
  }, { passive: true });

  if (pauseBtn) pauseBtn.addEventListener('click', togglePause);
  if (restartBtn) restartBtn.addEventListener('click', resetGame);
  if (overlayRestart) overlayRestart.addEventListener('click', resetGame);

  // Chamado pelo nav: para o loop ao sair da rota e retoma ao voltar.
  controle = {
    pause: () => {
      isPaused = true;
      clearInterval(gameInterval);
      updatePauseUI();
    },
    resume: () => {
      isPaused = false;
      if (!isGameOver) startLoop();
      updatePauseUI();
    }
  };

  loadBestScore();
  resetGame();
  isPaused = true; // Começa pausado até o usuário abrir a aba
  updatePauseUI();

  return controle;
}

let instancia = null;

export default {
  id: 'snake',
  nome: 'Snake Neon',
  icone: '🐍',
  iconeClasse: 'snake-icon',
  descricao: 'Cobrinha clássica arcade',
  badge: { texto: 'ARCADE', cor: 'green' },
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
    const n = storage.get('recorde', 0);
    return n > 0 ? `Recorde ${n}` : null;
  }
};
