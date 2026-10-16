/**
 * Termo — Jogo de Adivinhação de Palavras de 5 Letras
 * Integrado ao Dicionário Oficial Brasileiro (LibreOffice VERO pt-BR)
 * Com proteção contra perda de foco, debounce de envio e suporte ABNT2/acentos
 */

(function () {
  'use strict';

  // Fallback seguro de palavras conhecidas
  const FALLBACK_WORDS = [
    'SAGAZ', 'NOBRE', 'TERMO', 'PLENO', 'AMIGO', 'TEMPO', 'PODER', 'FESTA',
    'MUNDO', 'VIDRO', 'LIVRO', 'VENTO', 'SONHO', 'FORTE', 'RAZAO', 'PONTO',
    'IDEIA', 'GENTE', 'CARRO', 'BRISA', 'COISA', 'FOGAO', 'NOITE', 'VERDE',
    'LETRA', 'FORMA', 'CORPO', 'BRAVO', 'JUSTO', 'HONRA', 'PEDRA', 'PORTA',
    'CAMPO', 'CHUVA', 'FELIZ', 'NUVEM', 'TREVO', 'PLANO', 'MORAL', 'MUITO',
    'VIVER', 'FALAR', 'LUGAR', 'PRADO', 'CANTO', 'FROTA', 'PESTE', 'NAVIO',
    'CASAL', 'BARCO', 'ARROZ', 'HOTEL', 'CINZA', 'POETA', 'AVIAO', 'CORVO',
    'TRENO', 'LINDO', 'DOCES', 'CREDO', 'SORTE', 'PRAIA', 'CORDA', 'VALOR',
    'CALOR', 'MARTA', 'TINTA', 'CARTA', 'PERTO', 'LARGO', 'FALHA', 'LINHA',
    'NORTE', 'GRUPO', 'SALTO', 'MARCA', 'DANCA', 'CORTE', 'VAPOR', 'SUTIL',
    'GOLPE', 'TURMA', 'GRAVE', 'CRAVO', 'BEIJO', 'PEIXE', 'FUNDO', 'CLARO'
  ];

  const gridEl = document.getElementById('termo-grid');
  const keyboardEl = document.getElementById('termo-keyboard');
  const toastEl = document.getElementById('termo-toast');
  const winsEl = document.getElementById('termo-wins');
  const streakEl = document.getElementById('termo-streak');
  const newWordBtn = document.getElementById('termo-new-word-btn');

  const MAX_ATTEMPTS = 6;
  const WORD_LENGTH = 5;

  let secretWord = '';
  let currentRow = 0;
  let currentCol = 0;
  let guesses = []; // Matriz 6x5 com letras
  let isGameOver = false;
  let isSubmitting = false; // Bloqueia digitação durante a animação para evitar sumiço de letras
  let stats = { wins: 0, streak: 0 };
  let letterStates = {}; // 'A': 'green' | 'yellow' | 'gray'

  function getSecretWordsList() {
    if (window.TERMO_SECRET_WORDS && window.TERMO_SECRET_WORDS.length > 0) {
      return window.TERMO_SECRET_WORDS;
    }
    return FALLBACK_WORDS;
  }

  function getValidWordsSet() {
    if (window.TERMO_VALID_WORDS && window.TERMO_VALID_WORDS.size > 0) {
      return window.TERMO_VALID_WORDS;
    }
    return new Set(FALLBACK_WORDS);
  }

  function loadStats() {
    try {
      const saved = localStorage.getItem('termo_stats');
      if (saved) {
        stats = JSON.parse(saved);
        winsEl.textContent = stats.wins || 0;
        streakEl.textContent = stats.streak || 0;
      }
    } catch (e) {}
  }

  function saveStats() {
    try {
      localStorage.setItem('termo_stats', JSON.stringify(stats));
      winsEl.textContent = stats.wins;
      streakEl.textContent = stats.streak;
    } catch (e) {}
  }

  function showToast(msg) {
    if (!toastEl) return;
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    setTimeout(() => {
      toastEl.classList.remove('show');
    }, 2400);
  }

  function shakeCurrentRow() {
    const rowEl = document.getElementById(`termo-row-${currentRow}`);
    if (rowEl) {
      rowEl.classList.add('shake');
      setTimeout(() => rowEl.classList.remove('shake'), 400);
    }
  }

  function initGrid() {
    gridEl.innerHTML = '';
    guesses = [];
    for (let r = 0; r < MAX_ATTEMPTS; r++) {
      guesses[r] = Array(WORD_LENGTH).fill('');
      const rowEl = document.createElement('div');
      rowEl.className = 'termo-row';
      rowEl.id = `termo-row-${r}`;

      for (let c = 0; c < WORD_LENGTH; c++) {
        const tileEl = document.createElement('div');
        tileEl.className = 'termo-tile';
        tileEl.id = `termo-tile-${r}-${c}`;
        rowEl.appendChild(tileEl);
      }
      gridEl.appendChild(rowEl);
    }
  }

  function initKeyboard() {
    const layout = [
      ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
      ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'],
      ['ENTER', 'Z', 'X', 'C', 'V', 'B', 'N', 'M', '⌫']
    ];

    keyboardEl.innerHTML = '';
    letterStates = {};

    layout.forEach(rowKeys => {
      const rowEl = document.createElement('div');
      rowEl.className = 'keyboard-row';

      rowKeys.forEach(key => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `key-btn ${key.length > 1 ? 'wide' : ''}`;
        btn.textContent = key;
        btn.id = `key-${key}`;

        btn.addEventListener('click', (e) => {
          e.preventDefault();
          btn.blur(); // Remove o foco para que o Enter físico não redispare o botão
          handleKeyPress(key);
        });
        rowEl.appendChild(btn);
      });

      keyboardEl.appendChild(rowEl);
    });
  }

  function handleKeyPress(key) {
    if (isGameOver || isSubmitting) return;

    if (key === 'ENTER') {
      submitGuess();
    } else if (key === '⌫' || key === 'BACKSPACE') {
      deleteLetter();
    } else if (/^[A-Z]$/.test(key)) {
      addLetter(key);
    }
  }

  function addLetter(letter) {
    if (currentCol < WORD_LENGTH) {
      guesses[currentRow][currentCol] = letter;
      const tile = document.getElementById(`termo-tile-${currentRow}-${currentCol}`);
      if (tile) {
        tile.textContent = letter;
        tile.classList.add('filled');
      }
      currentCol++;
      if (window.ArcadeAudio) window.ArcadeAudio.playTone(480, 'sine', 0.04, 0.1);
    }
  }

  function deleteLetter() {
    if (currentCol > 0) {
      currentCol--;
      guesses[currentRow][currentCol] = '';
      const tile = document.getElementById(`termo-tile-${currentRow}-${currentCol}`);
      if (tile) {
        tile.textContent = '';
        tile.classList.remove('filled');
      }
      if (window.ArcadeAudio) window.ArcadeAudio.playTone(320, 'sine', 0.04, 0.1);
    }
  }

  function submitGuess() {
    if (isSubmitting || isGameOver) return;

    if (currentCol < WORD_LENGTH) {
      showToast('Palavra incompleta! Digite 5 letras.');
      shakeCurrentRow();
      if (window.ArcadeAudio) window.ArcadeAudio.playTone(200, 'sawtooth', 0.1, 0.15);
      return;
    }

    const rowToEvaluate = currentRow;
    const guess = guesses[rowToEvaluate].join('');
    const validWords = getValidWordsSet();

    // Validação estrita com o Dicionário Oficial Brasileiro
    if (validWords && !validWords.has(guess)) {
      showToast('Palavra não consta no dicionário brasileiro!');
      shakeCurrentRow();
      if (window.ArcadeAudio) window.ArcadeAudio.playTone(180, 'sawtooth', 0.15, 0.2);
      return;
    }

    // Bloqueia novas entradas enquanto a linha atual está sendo animada
    isSubmitting = true;

    // Avaliação de cores precisa com algoritmo Wordle oficial (2 passagens)
    const result = evaluateGuess(guess, secretWord);

    // Animação e coloração letra a letra da linha avaliada
    result.forEach((res, c) => {
      const tile = document.getElementById(`termo-tile-${rowToEvaluate}-${c}`);
      setTimeout(() => {
        if (tile) {
          tile.classList.add('flip', `t-${res.status}`);
        }
        updateKeyStatus(res.letter, res.status);
        if (window.ArcadeAudio) {
          const toneFreq = res.status === 'green' ? 660 : res.status === 'yellow' ? 520 : 350;
          window.ArcadeAudio.playTone(toneFreq, 'sine', 0.08, 0.15);
        }
      }, c * 130);
    });

    // Ao término das animações de virada da linha
    setTimeout(() => {
      isSubmitting = false;

      if (guess === secretWord) {
        isGameOver = true;
        stats.wins++;
        stats.streak++;
        saveStats();
        showToast('🎉 Parabéns, você acertou a palavra!');
        if (window.ArcadeAudio) window.ArcadeAudio.playSound('win');
        if (typeof window.triggerConfetti === 'function') window.triggerConfetti();
      } else if (rowToEvaluate === MAX_ATTEMPTS - 1) {
        isGameOver = true;
        stats.streak = 0;
        saveStats();
        showToast(`A palavra correta era: ${secretWord}`);
        if (window.ArcadeAudio) window.ArcadeAudio.playSound('defeat');
      } else {
        currentRow = rowToEvaluate + 1;
        currentCol = 0;
      }
    }, WORD_LENGTH * 130 + 160);
  }

  function evaluateGuess(guess, secret) {
    const res = Array(WORD_LENGTH).fill(null);
    const secretLetters = secret.split('');

    // Passagem 1: Letras verdes (exatas no lugar certo)
    for (let i = 0; i < WORD_LENGTH; i++) {
      if (guess[i] === secretLetters[i]) {
        res[i] = { letter: guess[i], status: 'green' };
        secretLetters[i] = null; // consumida
      }
    }

    // Passagem 2: Letras amarelas e cinzas
    for (let i = 0; i < WORD_LENGTH; i++) {
      if (!res[i]) {
        const letter = guess[i];
        const secretIndex = secretLetters.indexOf(letter);
        if (secretIndex !== -1) {
          res[i] = { letter, status: 'yellow' };
          secretLetters[secretIndex] = null;
        } else {
          res[i] = { letter, status: 'gray' };
        }
      }
    }

    return res;
  }

  function updateKeyStatus(letter, status) {
    const keyBtn = document.getElementById(`key-${letter}`);
    if (!keyBtn) return;

    const priority = { green: 3, yellow: 2, gray: 1 };
    const currentPriority = priority[letterStates[letter]] || 0;

    if (priority[status] > currentPriority) {
      letterStates[letter] = status;
      keyBtn.classList.remove('t-green', 't-yellow', 't-gray');
      keyBtn.classList.add(`t-${status}`);
    }
  }

  function newGame() {
    const secretList = getSecretWordsList();
    secretWord = secretList[Math.floor(Math.random() * secretList.length)];
    currentRow = 0;
    currentCol = 0;
    isGameOver = false;
    isSubmitting = false;

    initGrid();
    initKeyboard();
  }

  // Teclado físico com normalização ABNT2 (converte Ç -> C e remove acentos)
  window.addEventListener('keydown', (e) => {
    const viewTermo = document.getElementById('view-termo');
    if (!viewTermo || !viewTermo.classList.contains('active')) return;

    if (e.key === 'Enter') {
      e.preventDefault();
      handleKeyPress('ENTER');
    } else if (e.key === 'Backspace') {
      e.preventDefault();
      handleKeyPress('BACKSPACE');
    } else {
      let rawKey = e.key.toUpperCase();
      if (rawKey === 'Ç') rawKey = 'C';

      // Normaliza acentos (ex: Á -> A, É -> E, Õ -> O)
      const normalizedLetter = rawKey.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

      if (/^[A-Z]$/.test(normalizedLetter)) {
        handleKeyPress(normalizedLetter);
      }
    }
  });

  if (newWordBtn) {
    newWordBtn.addEventListener('click', (e) => {
      e.preventDefault();
      newWordBtn.blur();
      // Confirmação rápida se o jogo estiver em andamento para não perder progresso acidentalmente
      if (!isGameOver && (currentRow > 0 || currentCol > 0)) {
        if (!confirm('Deseja reiniciar e sortear uma nova palavra?')) {
          return;
        }
      }
      newGame();
    });
  }

  loadStats();
  newGame();
})();
