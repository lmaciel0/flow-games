/**
 * Boot: migra o storage, liga o confete, registra os jogos e inicia a navegação.
 * Para adicionar um jogo: criar js/games/x.js, css/games/x.css e uma linha de registro aqui.
 */
import { migrar, escopo } from './core/storage.js';
import * as audio from './core/audio.js';
import { initConfetti, triggerConfetti } from './core/confetti.js';
import { registrar } from './core/registry.js';
import { iniciarNav } from './core/nav.js';

import tictactoe from './games/tictactoe.js';
import game2048 from './games/game2048.js';
import snake from './games/snake.js';

migrar();
initConfetti();

registrar(tictactoe);
registrar(game2048);
registrar(snake);

iniciarNav({
  app: document.getElementById('app'),
  audio,
  confetti: triggerConfetti,
  escopo
});
