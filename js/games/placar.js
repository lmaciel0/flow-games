/**
 * Página #/placar — placar completo (top 50) com uma aba por ranking.
 * Fica no registro como os jogos, mas com `pagina: true`: não conta como jogo.
 */
import { criarPlacarPainel } from '../core/placar-painel.js';

const LIMITE = 50;
const ABAS = [
  { jogo: 'termo', titulo: 'Termo', rotulo: 'Palavras acertadas' },
  { jogo: 'game2048', titulo: '2048', rotulo: 'Maior pontuação' },
  { jogo: 'snake', titulo: 'Snake', rotulo: 'Maior pontuação' },
  { jogo: 'tetris', titulo: 'Tetris', rotulo: 'Maior pontuação' },
  { jogo: 'minas_facil', titulo: 'Minas fácil', rotulo: 'Menor tempo', formato: 'tempo' },
  { jogo: 'minas_medio', titulo: 'Minas médio', rotulo: 'Menor tempo', formato: 'tempo' },
  { jogo: 'minas_dificil', titulo: 'Minas difícil', rotulo: 'Menor tempo', formato: 'tempo' },
  { jogo: 'velha', titulo: 'Velha', rotulo: 'Vitórias contra a IA' },
  { jogo: 'blockstrike', titulo: 'Block Strike', rotulo: 'Vitórias em partida' },
];

const HTML = `
      <header class="app-header">
        <div class="header-badge placar-badge">
          <span class="badge-dot placar-dot"></span>
          <span class="badge-text">PLACAR COMPARTILHADO</span>
        </div>
        <h1 class="app-title"><span class="gradient-text-placar">Placar</span></h1>
        <p class="app-subtitle">Quem joga melhor em cada jogo do arcade.</p>
      </header>
      <div class="placar-pagina">
        <div class="placar-abas" role="tablist" aria-label="Escolha o jogo"></div>
      </div>
`;

let estado = null;

function montar(raiz, conta) {
  const caixa = raiz.querySelector('.placar-pagina');
  const lista = caixa.querySelector('.placar-abas');
  const abas = [];
  const paineis = new Map();
  let atual = 0;

  for (const [i, aba] of ABAS.entries()) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'placar-aba';
    b.id = `placar-aba-${aba.jogo}`;
    b.textContent = aba.titulo;
    b.setAttribute('role', 'tab');
    b.setAttribute('aria-controls', `placar-painel-${aba.jogo}`);
    b.addEventListener('click', () => selecionar(i));
    lista.append(b);
    abas.push(b);
  }

  // Setas trocam de aba e levam o foco junto (padrão WAI-ARIA de abas).
  lista.addEventListener('keydown', (e) => {
    const passo = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
    let alvo = null;
    if (passo) alvo = (atual + passo + ABAS.length) % ABAS.length;
    else if (e.key === 'Home') alvo = 0;
    else if (e.key === 'End') alvo = ABAS.length - 1;
    if (alvo === null) return;
    e.preventDefault();
    selecionar(alvo);
    abas[alvo].focus();
  });

  // Painel de cada aba criado na primeira vez em que ela abre; depois só recarrega.
  function painel(i) {
    let p = paineis.get(i);
    if (!p) {
      const { jogo, rotulo, formato } = ABAS[i];
      p = criarPlacarPainel({ conta, jogo, limite: LIMITE, rotulo, formato });
      p.el.id = `placar-painel-${jogo}`;
      p.el.setAttribute('role', 'tabpanel');
      p.el.setAttribute('aria-labelledby', `placar-aba-${jogo}`);
      caixa.append(p.el);
      paineis.set(i, p);
    }
    return p;
  }

  function selecionar(i, recarregar = true) {
    atual = i;
    abas.forEach((b, j) => {
      b.setAttribute('aria-selected', String(j === i));
      b.tabIndex = j === i ? 0 : -1;
    });
    const p = painel(i);
    for (const [j, outro] of paineis) outro.el.hidden = j !== i;
    if (recarregar) p.atualizar();
  }

  selecionar(0, false);
  return { atualizar: () => painel(atual).atualizar() };
}

export default {
  id: 'placar',
  nome: 'Placar',
  icone: '🏆',
  iconeClasse: 'placar-icon',
  descricao: 'Quem joga melhor',
  pagina: true,
  mount(raiz, ctx) {
    raiz.innerHTML = HTML;
    estado = ctx.conta ? montar(raiz, ctx.conta) : null;
  },
  pause() {},
  resume() {
    estado?.atualizar();
  },
  recorde() {
    return null;
  }
};
