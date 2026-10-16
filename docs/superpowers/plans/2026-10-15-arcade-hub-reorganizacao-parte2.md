# Arcade Hub — Reorganização, Parte 2 (Tasks 6 a 12)

> Continuação de `2026-10-15-arcade-hub-reorganizacao.md` (Tasks 1 a 5, já executadas). Spec: `docs/superpowers/specs/2026-10-15-arcade-hub-reorganizacao-design.md`. Convenções (`REPO`, `TOOLS`, baseline `d5c5480`), Global Constraints e Review Focus do plano 1 valem aqui.

**Goal:** Trocar a casca monolítica (`index.html` + `app.js` + `style.css` + scripts soltos) por `index.html` mínimo, `js/main.js`, `js/core/{registry,nav}.js` e seis módulos de jogo em `js/games/`, terminando com README de vitrine.

## Fluxo git (pedido do autor)

- Uma branch por etapa, empilhadas, cada uma com PR próprio apontando para a anterior. Commits pequenos em português, Conventional Commits, com `Co-Authored-By`.
- Etapas: **PR 1** `refactor/arcade-hub-modular` → `main` (Tasks 1–5); **PR 2** `refactor/arcade-hub-shell` (Task 6); **PR 3** `refactor/arcade-hub-games` (Tasks 7–11, um commit por jogo); **PR 4** `docs/arcade-hub-readme` (Task 12).
- O executor faz push e abre PRs. **Nunca faz merge.** O autor autoriza cada merge.

## Contrato (refinado no plano 1)

```js
export default {
  id, nome, icone, iconeClasse, descricao,
  badge: { texto, cor },          // cor: '' | 'hot' | 'green' | 'red' | 'cyan' | 'yellow'
  mount(raiz, { audio, confetti, storage }),
  pause(), resume(),
  recorde(storage)                // string curta ou null
};
```

`raiz` é a `<section id="view-<id>" class="game-view">` criada pelo `nav` na primeira visita. Depois de `mount`, o `nav` sempre chama `resume()`; ao sair da rota chama `pause()`. Listeners de `window` (teclado, resize) só agem se `raiz.classList.contains('active')`.

## Mapa de rotas e dados

| id | icone / iconeClasse | descricao | badge | recorde(storage) |
|---|---|---|---|---|
| tictactoe | `<span class="mini-x">✕</span><span class="mini-o">○</span>` / `x-o-icon` | IA Força Máxima (Minimax) | IA, `''` | `Placar X×O` de `placar`, ou null se 0×0×0 |
| game2048 | `2048` / `num-icon` | Junte os blocos numéricos | POPULAR, `hot` | `Recorde N` de `recorde` |
| snake | 🐍 / `snake-icon` | Cobrinha clássica arcade | ARCADE, `green` | `Recorde N` |
| minesweeper | 💣 / `mine-icon` | Desarme o campo sem explodir | LÓGICA, `red` | `Melhor mm:ss (nível)` |
| tetris | 🧱 / `tetris-icon` | Encaixe blocos e limpe linhas | CLÁSSICO, `cyan` | `Recorde N` |
| termo | 🔤 / `termo-icon` | Descubra a palavra em 6 tentativas | PALAVRAS, `yellow` | `N vitórias` de `stats.wins` |

---

### Task 6: Casca, `core/registry`, `core/nav`, `main.js`, favicon e Jogo da Velha

**Files:** Create `index.html` (substitui), `favicon.svg`, `js/main.js`, `js/core/registry.js`, `js/core/nav.js`, `js/games/tictactoe.js`; Modify `css/layout.css`; Delete `app.js`, `style.css`.

**Interfaces:**
- `registry.js`: `registrar(jogo)`, `listar()`, `buscar(id)`.
- `nav.js`: `iniciarNav({ app, audio, confetti, escopo })` monta drawer, home e rotas; reage a `hashchange`; hash vazio ou desconhecido mostra a home.
- Consome: Tasks 3, 4 e 5; ferramentas da Task 2.

Steps:
- [ ] 1. Branch `refactor/arcade-hub-shell` a partir de `refactor/arcade-hub-modular`.
- [ ] 2. `registry.js` e `nav.js`; `index.html` com `lang="pt-BR"`, meta description/og, links para `css/base.css`, `css/layout.css` e `css/games/*.css`, `<canvas id="confetti-canvas">`, botão hambúrguer, backdrop, `<aside id="sidebar-drawer">` (nav gerado), `<div class="app-container" id="app">` e `<script type="module" src="js/main.js">`. Rodapé do drawer: "6 jogos • feito em JS puro".
- [ ] 3. Home: hero (título + frase), grid de `<a class="game-card" href="#/id">` com ícone, nome, descrição, badge e recorde; rodapé com link do repositório. Item "Início" no drawer; `aria-current="page"` no item ativo. CSS em `layout.css`: grid 3/2/1 colunas, foco visível, `prefers-reduced-motion` sem animação nos cards.
- [ ] 4. `tictactoe.js`: `SEC` e `FROM` apontam para `app.js` linha 262; `meta.txt` define `const playSound = audio.playSound; const triggerConfetti = confetti;` e `byId`; `loadScores/saveScores` passam a usar `storage` (`placar`); botão de som interno chama `audio.toggleSound()`.
- [ ] 5. `main.js`: `migrar()`, `initConfetti()`, registra tictactoe, `iniciarNav(...)`.
- [ ] 6. Remover `app.js` e `style.css`; `git rm`.
- [ ] 7. Verificar: `~/arcade-tools/check.sh js/games/tictactoe.js`; `node ~/arcade-tools/smoke.mjs "$PWD" tictactoe` e a variante `--bloqueado`. Esperado: `smoke ok`.
- [ ] 8. Commits pequenos: `feat(core): registry e nav`, `feat: casca mínima e home com cards`, `refactor(tictactoe): módulo`, `chore: remove app.js e style.css legados`. Push e PR contra `refactor/arcade-hub-modular`.

### Tasks 7 a 11: um jogo por task

Cada task: gerar o módulo com `mkgame.sh` a partir do `.js` antigo e da seção em `d5c5480:index.html`, ajustar à mão o que o `sed` não cobre (persistência via `storage`, `pause/resume`, listeners de `window` condicionados a `raiz` ativa), registrar o jogo em `main.js`, remover o `.js` antigo, rodar `check.sh` e `smoke.mjs <ids registrados>` (normal e `--bloqueado`), um commit `refactor(<id>): módulo` (+ `feat(<id>): recorde` quando aplicável).

- **Task 7 — 2048:** `window.Game2048.render` vira `resume()` com `setTimeout(render, 50)`; recorde via `storage` (`recorde`).
- **Task 8 — Snake:** `window.SnakeGame` vira `controle`; `pause/resume`; começa pausado até `resume()`; recorde via `storage`.
- **Task 9 — Tetris:** igual ao Snake, com loop em `requestAnimationFrame`; novo recorde (`recorde`) salvo no game over, "Novo recorde" no overlay, recorde no painel.
- **Task 10 — Campo Minado:** timer pausa em `pause()`; ao vencer salva o menor tempo por dificuldade (`recordes: {facil, medio, dificil}`, mapeando `easy/medium/hard`); painel mostra o melhor tempo da dificuldade atual.
- **Task 11 — Termo + palavras:** `palavras.js` vira `js/data/palavras.js` (`export const secretas`, `export const validas`); `termo.js` importa em vez de `window.TERMO_*`; stats via `storage` (`stats`).

### Task 12: verificação final, README e fechamento

- [ ] 1. `smoke.mjs` com os 6 ids, normal e `--bloqueado`.
- [ ] 2. Teste de migração em navegador: pré-popular as 4 chaves antigas (incluindo uma corrompida), carregar, conferir cards da home sem `NaN` e chaves antigas presentes.
- [ ] 3. `README.md` em português conforme spec §7 (sem caminho de Windows, sem "100% offline"), `docs/screenshots/.gitkeep`.
- [ ] 4. Conferir que nenhum arquivo legado restou na raiz e que `grep -rn "window\.\(ArcadeAudio\|triggerConfetti\)\|localStorage" js/games` não retorna nada.
- [ ] 5. Revisão final com `code-reviewer` + autorrevisão; corrigir Critical/Important; PR 4.
