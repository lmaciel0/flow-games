/**
 * Snake Neon — Jogo da Cobrinha Retrô em Canvas
 */

(function () {
  'use strict';

  const canvas = document.getElementById('snake-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  const scoreEl = document.getElementById('snake-current-score');
  const bestScoreEl = document.getElementById('snake-best-score');
  const pauseBtn = document.getElementById('snake-pause-btn');
  const pauseText = document.getElementById('snake-pause-text');
  const pauseIcon = document.getElementById('snake-pause-icon');
  const restartBtn = document.getElementById('snake-restart-btn');
  const overlay = document.getElementById('snake-overlay');
  const overlayScore = document.getElementById('snake-overlay-score');
  const overlayRestart = document.getElementById('snake-overlay-restart');

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
    try {
      const saved = localStorage.getItem('snake_best_score');
      if (saved) {
        bestScore = parseInt(saved, 10) || 0;
        bestScoreEl.textContent = bestScore;
      }
    } catch (e) {}
  }

  function saveBestScore() {
    if (score > bestScore) {
      bestScore = score;
      bestScoreEl.textContent = bestScore;
      try {
        localStorage.setItem('snake_best_score', bestScore.toString());
      } catch (e) {}
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
      if (window.ArcadeAudio) window.ArcadeAudio.playTone(600, 'triangle', 0.08, 0.2);

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
      if (window.ArcadeAudio) {
        window.ArcadeAudio.playTone(750, 'sine', 0.1, 0.25);
        setTimeout(() => window.ArcadeAudio.playTone(950, 'sine', 0.15, 0.25), 80);
      }
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
    if (window.ArcadeAudio) window.ArcadeAudio.playSound('defeat');
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
    const viewSnake = document.getElementById('view-snake');
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
  document.getElementById('dpad-up').addEventListener('click', () => handleDirection(0, -1));
  document.getElementById('dpad-down').addEventListener('click', () => handleDirection(0, 1));
  document.getElementById('dpad-left').addEventListener('click', () => handleDirection(-1, 0));
  document.getElementById('dpad-right').addEventListener('click', () => handleDirection(1, 0));

  if (pauseBtn) pauseBtn.addEventListener('click', togglePause);
  if (restartBtn) restartBtn.addEventListener('click', resetGame);
  if (overlayRestart) overlayRestart.addEventListener('click', resetGame);

  // Hook global para pausar ao sair da aba
  window.SnakeGame = {
    pause: () => { isPaused = true; updatePauseUI(); },
    resume: () => { isPaused = false; updatePauseUI(); },
    reset: resetGame
  };

  loadBestScore();
  resetGame();
  isPaused = true; // Começa pausado até o usuário abrir a aba
  updatePauseUI();
})();
