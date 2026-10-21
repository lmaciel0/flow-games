/**
 * Termo — adivinhe a palavra de 5 letras em 6 tentativas.
 * Dicionário em js/data/palavras.js; teclado físico com normalização ABNT2/acentos.
 */
import { secretas, validas } from '../data/palavras.js';
import { criarPlacarPainel } from '../core/placar-painel.js';

const HTML = `
    <div class="jogo-com-placar">
      <div class="jogo-com-placar-jogo">
      <header class="app-header">
        <div class="header-badge termo-badge">
          <span class="badge-dot termo-dot"></span>
          <span class="badge-text">JOGO DE PALAVRAS BRASIL</span>
        </div>
        <h1 class="app-title">Jogo <span class="gradient-text-termo">Termo</span></h1>
        <p class="app-subtitle">Adivinhe a palavra secreta de <strong>5 letras</strong> em até 6 tentativas!</p>
      </header>

      <div class="termo-status-bar glass-card">
        <div class="termo-stat-box">
          <span class="termo-stat-label">VITÓRIAS</span>
          <span class="termo-stat-val" id="termo-wins">0</span>
        </div>
        <div class="termo-stat-box">
          <span class="termo-stat-label">SEQUÊNCIA</span>
          <span class="termo-stat-val" id="termo-streak">0</span>
        </div>
        <button id="termo-new-word-btn" class="action-btn-small primary-termo">
          <span>Nova Palavra</span>
        </button>
      </div>

      <!-- Toast de Alerta do Termo -->
      <div id="termo-toast" class="termo-toast">Palavra não encontrada</div>

      <!-- Grade 6x5 do Termo -->
      <main class="termo-board-wrapper">
        <div class="termo-grid" id="termo-grid">
          <!-- 6 linhas com 5 letras -->
        </div>
      </main>

      <!-- Teclado Virtual do Termo -->
      <div class="termo-keyboard" id="termo-keyboard">
        <!-- Linhas geradas dinamicamente com feedback de cores -->
      </div>

      <div class="info-card glass-card">
        <div class="info-header">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#f6d365" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"/>
            <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/>
            <line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
          <strong>Como Jogar o Termo:</strong>
        </div>
        <p>
          <span class="termo-legend green">🟩 Verde</span>: letra certa no lugar certo.<br>
          <span class="termo-legend yellow">🟨 Amarelo</span>: letra existe na palavra, mas em outra posição.<br>
          <span class="termo-legend gray">⬛ Cinza</span>: letra não faz parte da palavra.
        </p>
      </div>
      </div>
      <aside class="placar-lateral" aria-label="Placar"></aside>
    </div>
`;

function montar(raiz, { audio, confetti, storage, conta }) {
  const byId = (id) => raiz.querySelector('#' + id);


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

  const gridEl = byId('termo-grid');
  const keyboardEl = byId('termo-keyboard');
  const toastEl = byId('termo-toast');
  const winsEl = byId('termo-wins');
  const streakEl = byId('termo-streak');
  const newWordBtn = byId('termo-new-word-btn');

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
    if (secretas.length > 0) {
      return secretas;
    }
    return FALLBACK_WORDS;
  }

  function getValidWordsSet() {
    if (validas.size > 0) {
      return validas;
    }
    return new Set(FALLBACK_WORDS);
  }

  function loadStats() {
    const saved = storage.get('stats', {});
    stats = { wins: Number(saved.wins) || 0, streak: Number(saved.streak) || 0 };
    winsEl.textContent = stats.wins;
    streakEl.textContent = stats.streak;
  }

  function saveStats() {
    storage.set('stats', stats);
    winsEl.textContent = stats.wins;
    streakEl.textContent = stats.streak;
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
    const rowEl = byId(`termo-row-${currentRow}`);
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
      const tile = byId(`termo-tile-${currentRow}-${currentCol}`);
      if (tile) {
        tile.textContent = letter;
        tile.classList.add('filled');
      }
      currentCol++;
      audio.playTone(480, 'sine', 0.04, 0.1);
    }
  }

  function deleteLetter() {
    if (currentCol > 0) {
      currentCol--;
      guesses[currentRow][currentCol] = '';
      const tile = byId(`termo-tile-${currentRow}-${currentCol}`);
      if (tile) {
        tile.textContent = '';
        tile.classList.remove('filled');
      }
      audio.playTone(320, 'sine', 0.04, 0.1);
    }
  }

  function submitGuess() {
    if (isSubmitting || isGameOver) return;

    if (currentCol < WORD_LENGTH) {
      showToast('Palavra incompleta! Digite 5 letras.');
      shakeCurrentRow();
      audio.playTone(200, 'sawtooth', 0.1, 0.15);
      return;
    }

    const rowToEvaluate = currentRow;
    const guess = guesses[rowToEvaluate].join('');
    const validWords = getValidWordsSet();

    // Validação estrita com o Dicionário Oficial Brasileiro
    if (validWords && !validWords.has(guess)) {
      showToast('Palavra não consta no dicionário brasileiro!');
      shakeCurrentRow();
      audio.playTone(180, 'sawtooth', 0.15, 0.2);
      return;
    }

    // Bloqueia novas entradas enquanto a linha atual está sendo animada
    isSubmitting = true;

    // Avaliação de cores precisa com algoritmo Wordle oficial (2 passagens)
    const result = evaluateGuess(guess, secretWord);

    // Animação e coloração letra a letra da linha avaliada
    result.forEach((res, c) => {
      const tile = byId(`termo-tile-${rowToEvaluate}-${c}`);
      setTimeout(() => {
        if (tile) {
          tile.classList.add('flip', `t-${res.status}`);
        }
        updateKeyStatus(res.letter, res.status);
        const toneFreq = res.status === 'green' ? 660 : res.status === 'yellow' ? 520 : 350;
        audio.playTone(toneFreq, 'sine', 0.08, 0.15);
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
        conta?.registrar('termo', { tipo: 'vitoria' });
        showToast('🎉 Parabéns, você acertou a palavra!');
        audio.playSound('win');
        confetti();
      } else if (rowToEvaluate === MAX_ATTEMPTS - 1) {
        isGameOver = true;
        stats.streak = 0;
        saveStats();
        conta?.registrar('termo', { tipo: 'derrota' });
        showToast(`A palavra correta era: ${secretWord}`);
        audio.playSound('defeat');
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
    const keyBtn = byId(`key-${letter}`);
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
    // Sorteia só entre as palavras ainda não vistas; esgotou a lista, recomeça o ciclo.
    const secretList = getSecretWordsList();
    let usadas = new Set(storage.get('usadas', []));
    let restantes = secretList.filter(w => !usadas.has(w));
    if (restantes.length === 0) {
      usadas = new Set();
      restantes = secretList;
    }
    secretWord = restantes[Math.floor(Math.random() * restantes.length)];
    usadas.add(secretWord);
    storage.set('usadas', [...usadas]);
    currentRow = 0;
    currentCol = 0;
    isGameOver = false;
    isSubmitting = false;

    initGrid();
    initKeyboard();
  }

  // Teclado físico com normalização ABNT2 (converte Ç -> C e remove acentos)
  window.addEventListener('keydown', (e) => {
    const viewTermo = raiz;
    if (!viewTermo || !viewTermo.classList.contains('active')) return;
    // Não engole Enter/teclas de quem navega por outros controles (ex.: links do drawer) nem atalhos do navegador.
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.target !== document.body && !raiz.contains(e.target)) return;

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

  // Login/logout reescreve as estatísticas no storage: relê para a tela mostrar o progresso da conta.
  conta?.assinar((evento) => {
    if (evento?.tipo === 'progresso') loadStats();
  });

  loadStats();
  newGame();
}

let painel = null;

export default {
  id: 'termo',
  nome: 'Termo',
  icone: '🔤',
  iconeClasse: 'termo-icon',
  descricao: 'Descubra a palavra em 6 tentativas',
  badge: { texto: 'PALAVRAS', cor: 'yellow' },
  mount(raiz, ctx) {
    raiz.innerHTML = HTML;
    montar(raiz, ctx);
    if (ctx.conta) {
      painel = criarPlacarPainel({ conta: ctx.conta, jogo: 'termo', limite: 5, rotulo: 'Palavras acertadas' });
      raiz.querySelector('.placar-lateral').append(painel.el);
    }
  },
  pause() {},
  resume() {
    painel?.atualizar();
  },
  recorde(storage) {
    const n = Number(storage.get('stats', {}).wins) || 0;
    return n > 0 ? `${n} ${n === 1 ? 'vitória' : 'vitórias'}` : null;
  }
};
