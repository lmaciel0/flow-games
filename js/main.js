/**
 * Boot: migra o storage, liga o confete, registra os jogos e inicia a navegação.
 * Para adicionar um jogo: criar js/games/x.js, css/games/x.css e uma linha de registro aqui.
 */
import { migrar, escopo } from './core/storage.js';
import * as audio from './core/audio.js';
import { initConfetti, triggerConfetti } from './core/confetti.js';
import { registrar } from './core/registry.js';
import { iniciarNav } from './core/nav.js';
import { conta } from './core/conta/index.js';
import { iniciarContaUI } from './core/conta-ui.js';

import tictactoe from './games/tictactoe.js';
import game2048 from './games/game2048.js';
import snake from './games/snake.js';
import minesweeper from './games/minesweeper.js';
import tetris from './games/tetris.js';
import termo from './games/termo.js';
import blockstrike from './games/blockstrike/index.js';
import placar from './games/placar.js';

migrar();
initConfetti();

registrar(tictactoe);
registrar(game2048);
registrar(snake);
registrar(minesweeper);
registrar(tetris);
registrar(termo);
registrar(blockstrike);
registrar(placar);

iniciarNav({
  app: document.getElementById('app'),
  audio,
  confetti: triggerConfetti,
  escopo,
  conta
});

iniciarContaUI({ conta, audio });

// Restaura a sessão em segundo plano: falha de rede ou backend nunca trava o arcade.
conta.iniciar().catch(() => {});
