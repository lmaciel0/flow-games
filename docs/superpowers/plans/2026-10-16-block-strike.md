# Block Strike Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Novo jogo do Arcade Hub: FPS 5x5 mata-mata contra bots, em 3D de blocos, primeiro a 13 rounds.

**Architecture:** A lógica do jogo (física AABB, raycast, armas, rounds, A*, bots e simulação do mundo) fica em módulos puros, sem Three.js e sem DOM, testados em Node. O Three.js só entra em `render.js`, e a orquestração fica em `index.js` (loop rAF, entrada, HUD e contrato do hub).

**Tech Stack:** JS puro com ES modules, Three.js 0.169.0 vendorizado (arquivo único), `node:test` (Node 22) e o smoke com puppeteer-core já existente em `~/arcade-tools`.

**Spec:** `docs/superpowers/specs/2026-10-16-block-strike-design.md`

## Global Constraints

- Id do jogo: `blockstrike`. Pasta `js/games/blockstrike/`, CSS em `css/games/blockstrike.css`, ids de DOM com prefixo `bs-`.
- Sem npm e sem build no repositório. Única dependência: `js/vendor/three.module.min.js` (three@0.169.0), com `js/vendor/three-LICENSE`.
- Nenhum módulo além de `render.js` importa o Three.js. Nenhum módulo puro (config, rng, fisica, mapa, armas, rounds, navegacao, bots, mundo) toca em `document`/`window`.
- Persistência só via `ctx.storage.get/set` (escopo `arcade:blockstrike:*`).
- Textos da interface em pt-BR.
- Teclas lidas por `e.code` (independe do layout ABNT): `KeyW/A/S/D`, `ShiftLeft` (andar devagar), `KeyC` (agachar), `Space`, `KeyR`, `Digit1/2/3`, `Tab`, mouse 0 (tiro) e 2 (zoom).
  **Desvio da spec:** agachar é **C**, não Ctrl, porque Ctrl+W/Ctrl+D com WASD fecha a aba ou cria favorito no navegador.
- Só PC. Se `matchMedia('(pointer: coarse)').matches && !matchMedia('(pointer: fine)').matches`, mostrar `#bs-aviso` com "Disponível apenas no computador" e não criar o WebGL.
- Render: `MeshLambertMaterial`, sem sombras, `scene.fog`, `renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5))`.
- Unidades em metros e segundos. `dt` do loop limitado a 0,05 s.
- Testes ficam **fora** do repo, em `~/arcade-tools/blockstrike/*.test.mjs`. Rodar com:
  `REPO="$PWD" node --test ~/arcade-tools/blockstrike/*.test.mjs`
- Smoke: `node ~/arcade-tools/smoke.mjs "$PWD" tictactoe game2048 snake minesweeper tetris termo blockstrike` (e de novo com `--bloqueado`).
- Commits em português, terminando com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Perda do pointer lock** (Esc, Alt+Tab, clique fora): abre `#bs-pausa`, solta todas as teclas seguradas e não deixa o jogador andando sozinho ao voltar. Teste na Task 4 (`entrada` limpa as teclas no `pointerlockchange`) e smoke na Task 10.
2. **Aba em segundo plano / travada**: o rAF para e o primeiro `dt` na volta é enorme. Esperado: `dt` limitado a 0,05 s, ninguém atravessa parede e o timer do round não pula. Teste na Task 4 (`passo` com dt 0,05 não atravessa caixa de 0,2 m) e na Task 8 (tick limitado).
3. **WebGL indisponível**: `#bs-aviso` com "Seu navegador não suporta WebGL", sem erro no console e sem quebrar os outros jogos. Task 1.
4. **Eliminação simultânea** (os últimos dois se matam no mesmo passo): ninguém pontua e a partida segue. Teste na Task 8.
5. **Sair da rota no meio da partida**: o loop, os sons de passos e o pointer lock param, e ao voltar aparece a pausa, não o jogo rodando. Smoke na Task 10.

---

## Estrutura de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `js/vendor/three.module.min.js`, `js/vendor/three-LICENSE` | Three.js 0.169.0 vendorizado |
| `js/games/blockstrike/index.js` | Contrato do hub, loop rAF, liga entrada + mundo + bots + rounds + render + HUD |
| `js/games/blockstrike/config.js` | Constantes: jogador, rounds, tabela de armas, tabela de dificuldade, nomes de bots |
| `js/games/blockstrike/rng.js` | `criarRng(seed)` determinístico (mulberry32) |
| `js/games/blockstrike/fisica.js` | Movimento com colisão AABB, raycast em caixas, hitboxes de personagem |
| `js/games/blockstrike/mapa.js` | Dados do mapa: caixas, spawns A/B, waypoints e arestas |
| `js/games/blockstrike/armas.js` | Estado de arma: cadência, pente, recarga, spread, recuo e dano por parte |
| `js/games/blockstrike/navegacao.js` | A* sobre os waypoints |
| `js/games/blockstrike/bots.js` | Cérebro do bot: produz o mesmo `Comando` que o jogador |
| `js/games/blockstrike/rounds.js` | Máquina de estados da partida |
| `js/games/blockstrike/mundo.js` | Simulação: entidades, aplicar comandos, resolver tiros, eventos |
| `js/games/blockstrike/render.js` | Three.js: mapa em 1 geometria, avatares de blocos, viewmodel, impactos |
| `js/games/blockstrike/entrada.js` | Teclado, mouse e pointer lock → `Comando` do jogador |
| `js/games/blockstrike/hud.js` | DOM: menu, loadout, HUD, kill feed, placar, pausa e fim |
| `js/games/blockstrike/sons.js` | Sons via `audio.playTone` (não altera `js/core/audio.js` — escolha do plano) |
| `css/games/blockstrike.css` | Estilo da view, HUD e menus |
| Modificar: `js/main.js`, `index.html`, `js/core/nav.js`, `README.md` | Registro, CSS, "Sete jogos", docs |
| Modificar (fora do repo): `~/arcade-tools/smoke.mjs` | Probe do `blockstrike` + flag do SwiftShader |

### Tipos compartilhados (definidos uma vez, usados por várias tasks)

```js
// Vec3: {x, y, z}. y é para cima. yaw 0 olha para -z; yaw positivo gira para a esquerda (padrão Three.js).
// Caixa: {min: Vec3, max: Vec3, cor: number /* 0xRRGGBB */}
// Comando (jogador e bots, gerado a cada passo):
//   {frente: -1|0|1, lado: -1|0|1, pular: bool, agachar: bool, devagar: bool,
//    atirar: bool, zoom: bool, recarregar: bool, slot: null|'primaria'|'pistola'|'faca',
//    yaw: number, pitch: number}
// Entidade: {id, nome, time: 'azul'|'laranja', bot: bool, pos: Vec3, velY: number,
//   yaw, pitch, agachado, noChao, hp, vivo, slot, armas: {primaria, pistola, faca},
//   primariaEscolhida: 'rifle'|'smg'|'sniper'|'escopeta',
//   kills, mortes, killsCabeca, cerebro /* só bots */}
// Evento do mundo:
//   {tipo:'tiro', atirador, arma} | {tipo:'acerto', atirador, alvo, parte, dano}
//   | {tipo:'morte', vitima, assassino, arma, cabeca} | {tipo:'impacto', ponto, normal}
//   | {tipo:'recarga', atirador} | {tipo:'passo', id}
```

---
### Task 1: Esqueleto registrado no hub + Three.js vendorizado

**Files:**
- Create: `js/vendor/three.module.min.js`, `js/vendor/three-LICENSE`, `js/games/blockstrike/index.js`, `css/games/blockstrike.css`
- Modify: `js/main.js` (registrar), `index.html` (link do CSS; `6 jogos` → `7 jogos` no `.drawer-credits`; meta description cita Block Strike), `js/core/nav.js` (subtítulo "Seis jogos clássicos" → "Sete jogos")
- Modify (fora do repo): `~/arcade-tools/smoke.mjs`

**Interfaces:**
- Produces: `export default { id: 'blockstrike', nome: 'Block Strike', icone: '🔫', iconeClasse: 'bs-icon', descricao: 'FPS 5x5 contra bots', badge: { texto: 'FPS', cor: 'orange' }, mount, pause, resume, recorde }`.
  Ao montar, a view tem `#bs-menu` (com `#bs-jogar`), `#bs-aviso` (escondido) e `<canvas id="bs-canvas">`. A raiz recebe `data-fase="menu"`.
  `recorde(storage)` devolve `null` se `storage.get('partidas', 0) === 0`, senão `` `${vitorias} vitórias · K/D ${melhorKD.toFixed(2)}` ``.
- Verificar se a cor `orange` existe em `.nav-badge` (`css/layout.css`). Se não existir, adicionar no `blockstrike.css`.

- [ ] **Step 1: Baixar o Three.js** (pedir permissão ao usuário: arquivo `three.module.min.js` ~680 KB de cdn.jsdelivr.net)

```bash
mkdir -p js/vendor
curl -fsSL https://cdn.jsdelivr.net/npm/three@0.169.0/build/three.module.min.js -o js/vendor/three.module.min.js
curl -fsSL https://cdn.jsdelivr.net/npm/three@0.169.0/LICENSE -o js/vendor/three-LICENSE
grep -c "from\s*['\"]\./three\.core" js/vendor/three.module.min.js; head -c 120 js/vendor/three.module.min.js
```
Expected: contagem `0` (arquivo único, sem `three.core.js`) e o cabeçalho de licença `@license ... three.js authors`.

- [ ] **Step 2: Atualizar o smoke para esperar o novo jogo e falhar**

Em `~/arcade-tools/smoke.mjs`:
- Adicionar `'--enable-unsafe-swiftshader', '--use-angle=swiftshader'` aos `args` do `puppeteer.launch`.
- Adicionar o probe:
```js
async blockstrike(page) {
  await page.waitForSelector('#bs-menu:not([hidden])');
  const fase = await page.$eval('#view-blockstrike', (e) => e.dataset.fase);
  if (fase !== 'menu') throw new Error(`blockstrike: fase inicial '${fase}' != 'menu'`);
}
```
Run: `node ~/arcade-tools/smoke.mjs "$PWD" tictactoe game2048 snake minesweeper tetris termo blockstrike`
Expected: FAIL (`home: cards ... != ...` e `blockstrike: ...`).

- [ ] **Step 3: Implementar o esqueleto**

`index.js` monta o HTML (menu com título "Block Strike" e botão "Jogar", desabilitado até a Task 9), checa o toque (Global Constraints) e o WebGL (`canvas.getContext('webgl2') || getContext('webgl')`). Se faltar algum, mostra `#bs-aviso` com o texto da Review Focus #3 ou do toque e esconde o menu.
`pause`/`resume` ainda não fazem nada.
CSS: a view ocupa `width: 100%`, o canvas tem `aspect-ratio: 16/9` e `max-height: calc(100vh - 120px)`, e os overlays ficam `position:absolute` sobre o canvas. Nada pode passar de 360 px de largura.

- [ ] **Step 4: Rodar o smoke (normal e `--bloqueado`)**

Expected: `smoke ok (7 jogos)` e `smoke ok (7 jogos, storage bloqueado)`.

- [ ] **Step 5: Commit**

```bash
git add js/vendor js/games/blockstrike/index.js css/games/blockstrike.css js/main.js index.html js/core/nav.js
git commit -m "feat(block-strike): esqueleto registrado no hub e Three.js 0.169.0 vendorizado"
```

---

### Task 2: Constantes, RNG e física (colisão AABB, raycast, hitboxes)

**Files:**
- Create: `js/games/blockstrike/config.js`, `js/games/blockstrike/rng.js`, `js/games/blockstrike/fisica.js`
- Test: `~/arcade-tools/blockstrike/_repo.mjs`, `~/arcade-tools/blockstrike/fisica.test.mjs`

**Interfaces:**
- Produces `config.js` (exports nomeados; valores exatos):
  - `JOGADOR = { raio: 0.35, altura: 1.8, alturaAgachado: 1.2, olho: 1.6, olhoAgachado: 1.1, velCorrer: 5.5, velDevagar: 2.6, velAgachado: 2.0, gravidade: 20, pulo: 6.5, hp: 100 }`
  - `ROUND = { freeze: 5, duracao: 115, fimRound: 3, vencer: 13, maxRounds: 24, trocaLados: 12 }`
  - `MULT_PARTE = { cabeca: 4, tronco: 1, pernas: 0.75 }`
  - `ARMAS` — chave → `{ nome, slot, dano, rpm, pente, reserva, recarga, auto, spreadBase, spreadMov, recuo, chumbos?, alcance?, zoomFov?, spreadSemZoom? }`:
    - `rifle`: 'Rifle', primaria, 36, 600, 30, 90, 2.5 s, auto, 0.004, 0.06, 0.012
    - `smg`: 'SMG', primaria, 26, 850, 30, 120, 2.0, auto, 0.008, 0.02, 0.008
    - `sniper`: 'Sniper', primaria, 115, 41, 5, 20, 3.6, semi, 0.0005, 0.15, 0.05, `zoomFov: 25`, `spreadSemZoom: 0.08`
    - `escopeta`: 'Escopeta', primaria, 20, 70, 8, 32, 3.0, semi, 0.06, 0.03, 0.04, `chumbos: 8`
    - `pistola`: 'Pistola', pistola, 30, 400, 12, 36, 2.2, semi, 0.006, 0.03, 0.02
    - `faca`: 'Faca', faca, 50, 75, `Infinity`, 0, 0, semi, 0, 0, 0, `alcance: 2`
  - `DIFICULDADE = { facil: { reacao: 0.6, erroMira: 0.07, chanceCabeca: 0.1 }, medio: { reacao: 0.38, erroMira: 0.04, chanceCabeca: 0.2 }, dificil: { reacao: 0.2, erroMira: 0.02, chanceCabeca: 0.35 } }`
  - `NOMES_BOTS = ['Tijolo','Bloco','Cubo','Pixel','Voxel','Quina','Laje','Prisma','Viga']` (exibidos como `Bot <nome>`)
- Produces `rng.js`: `criarRng(seed: number) → () => number` em [0,1).
- Produces `fisica.js`:
  - `moverComColisao(pos: Vec3, desloc: Vec3, raio: number, altura: number, caixas: Caixa[]) → { pos: Vec3, noChao: bool, bateuTeto: bool }`. Resolve eixo por eixo (x, z, y), com o corpo como AABB `[pos.x±raio, pos.y..pos.y+altura, pos.z±raio]` e `pos` nos pés. Subdivide o deslocamento em passos ≤ 0,1 m.
  - `raycastCaixas(origem: Vec3, dir: Vec3 /* unitário */, caixas: Caixa[], maxDist: number) → null | { dist, ponto: Vec3, normal: Vec3 }` (método slab).
  - `hitboxes(ent: Entidade) → [{ parte: 'cabeca'|'tronco'|'pernas', min, max }]`. Em pé: pernas 0–0,8 m, tronco 0,8–1,4 m, cabeça 1,4–1,8 m (largura 0,5, cabeça 0,4). Agachado: escala vertical 1,2/1,8.
  - `raycastEntidades(origem, dir, entidades, maxDist, ignorarId) → null | { ent, parte, dist, ponto }` (só `vivo`).
  - `temVisada(a: Vec3, b: Vec3, caixas) → bool`.

- [ ] **Step 1: Criar o helper `~/arcade-tools/blockstrike/_repo.mjs`**

```js
import path from 'node:path';
import { pathToFileURL } from 'node:url';
export const mod = (p) => import(pathToFileURL(path.join(process.env.REPO, p)).href);
```

- [ ] **Step 2: Escrever `fisica.test.mjs` (falhando)**

Testes (`node:test` + `assert/strict`), com chão `{min:{x:-50,y:-1,z:-50}, max:{x:50,y:0,z:50}}` e parede fina `{min:{x:2,y:0,z:-5}, max:{x:2.2,y:3,z:5}}`:
- `cai e para no chão`: pos y=1, desloc y=-2 → `pos.y === 0`, `noChao === true`.
- `parede bloqueia em x`: pos x=0, desloc x=+5 → `pos.x <= 2 - 0.35 + 1e-6`.
- `deslocamento grande não atravessa parede fina` (Review Focus #2): desloc x=+0.05*5.5*40 → mesmo limite.
- `desliza na parede`: desloc {x:5, z:1} → `pos.z ≈ 1`.
- `raycast acerta a parede`: origem (0,1,0), dir (1,0,0) → `dist ≈ 2`, `normal.x === -1`.
- `raycast respeita maxDist`: maxDist 1 → `null`.
- `hitbox de cabeça`: ray horizontal em y=1,6 contra entidade em (5,0,0) → `parte === 'cabeca'`; em y=0,4 → `'pernas'`.
- `agachado abaixa a cabeça`: mesma entidade agachada, ray em y=1,6 → `null`.
- `ignora morto e o próprio atirador`.
- `temVisada` falsa através da parede e verdadeira sem ela.
- `criarRng(1)` duas vezes gera a mesma sequência de 5 números.

Run: `REPO="$PWD" node --test ~/arcade-tools/blockstrike/fisica.test.mjs`
Expected: FAIL (módulo não encontrado).

- [ ] **Step 3: Implementar `config.js`, `rng.js` e `fisica.js`**

- [ ] **Step 4: Rodar os testes**

Expected: todos `ok`.

- [ ] **Step 5: Commit**

```bash
git add js/games/blockstrike/config.js js/games/blockstrike/rng.js js/games/blockstrike/fisica.js
git commit -m "feat(block-strike): constantes, rng e física AABB com raycast e hitboxes"
```

---

### Task 3: Mapa de blocos com spawns e grafo de waypoints

**Files:**
- Create: `js/games/blockstrike/mapa.js`
- Test: `~/arcade-tools/blockstrike/mapa.test.mjs`

**Interfaces:**
- Consumes: `moverComColisao`, `temVisada`, `JOGADOR` (Task 2).
- Produces: `export const MAPA = { caixas: Caixa[], spawns: { A: Vec3[5], B: Vec3[5] }, yawSpawn: { A: number, B: number }, waypoints: [{ id: number, x, z, cobertura?: true }], arestas: [[idA, idB], ...], ceu: 0x87ceeb, neblina: [30, 90] }`.
- Layout: área de ~80×60 m com chão em y=0 e muros externos de 4 m. Base A em z≈+25 e base B em z≈-25, simétricas. Três rotas: longa à esquerda (corredor de ~40 m para a sniper), meio aberto com caixas de 1,2 m (agachar cobre) e 2 m, e túnel/curva à direita. Cores chapadas de areia, tijolo e madeira. Entre 40 e 80 caixas e entre 25 e 45 waypoints, com `cobertura: true` atrás de caixas.
- O mapa é escrito como dados. Para ajustar, abrir no navegador (Task 4) e andar.

- [ ] **Step 1: Escrever `mapa.test.mjs` (falhando)**

- `spawns livres`: para cada spawn, a AABB do jogador não intersecta nenhuma caixa acima de y=0, e o spawn está a ≥ 1 m dos outros do mesmo lado.
- `spawns espelhados`: `MAPA.spawns.A.length === 5 && MAPA.spawns.B.length === 5`.
- `waypoints livres`: nenhum waypoint dentro de uma caixa (testar o ponto em y=0,5).
- `arestas com visada`: para cada aresta, `temVisada` a 0,9 m de altura e também deslocada ±0,35 m lateralmente (bots não raspam na quina).
- `grafo conexo`: BFS do waypoint 0 alcança todos.
- `cada spawn tem waypoint a ≤ 6 m com visada`.
- `não há visada direta entre spawn A e spawn B` (ninguém atira do spawn no início do round).

Run: `REPO="$PWD" node --test ~/arcade-tools/blockstrike/mapa.test.mjs`
Expected: FAIL.

- [ ] **Step 2: Escrever `MAPA` em `mapa.js` até os testes passarem**

- [ ] **Step 3: Rodar todos os testes**

Run: `REPO="$PWD" node --test ~/arcade-tools/blockstrike/*.test.mjs`
Expected: todos `ok`.

- [ ] **Step 4: Commit**

```bash
git add js/games/blockstrike/mapa.js
git commit -m "feat(block-strike): mapa de blocos com três rotas, spawns e waypoints"
```

---
### Task 4: Mundo com movimento, entrada e render (andar pelo mapa)

**Files:**
- Create: `js/games/blockstrike/mundo.js`, `js/games/blockstrike/entrada.js`, `js/games/blockstrike/render.js`
- Modify: `js/games/blockstrike/index.js`
- Test: `~/arcade-tools/blockstrike/mundo.test.mjs`

**Interfaces:**
- Consumes: Tasks 2–3.
- Produces `mundo.js`:
  - `criarMundo({ mapa, primariaJogador: string, dificuldade: string, rng }) → Mundo`. `Mundo = { mapa, entidades: Entidade[10], jogadorId: 0, tempo: 0 }`. Entidade 0 é o jogador (time `azul`, `bot:false`). Ids 1–4 são bots azuis e 5–9 bots laranja, com nomes de `NOMES_BOTS`.
  - `posicionarParaRound(mundo, ladoAzul: 'A'|'B')`: põe os vivos nos spawns, com `hp` 100, `vivo` true, `yaw` do spawn e `slot` 'primaria'. As armas serão recriadas aqui na Task 5.
  - `passo(mundo, dt, comandos: Map<id, Comando>, { congelado: bool }) → Evento[]`. Aplica `yaw/pitch` (pitch limitado a ±1,5 rad), velocidade horizontal pela regra (agachado > devagar > correr), gravidade, pulo só `noChao` e `moverComColisao` com altura em pé/agachado. Não levanta se houver teto (testar com `moverComColisao` antes de trocar `agachado` para false). `congelado` zera o movimento horizontal, mas deixa girar a câmera. Emite `{tipo:'passo'}` a cada 0,4 m andados correndo.
  - `vivosPorTime(mundo) → { azul: { n, hp }, laranja: { n, hp } }`.
  - Adicionar a `fisica.js`: `olho(ent) → Vec3` (pés + `olho`/`olhoAgachado`) e `direcao(yaw, pitch) → Vec3` unitário. Ficam em `fisica.js`, e não em `mundo.js`, para `bots.js` não importar `mundo.js` (evita ciclo, porque `mundo.js` importa `escolherPrimaria` de `bots.js`).
- Produces `entrada.js`: `criarEntrada(canvas: HTMLCanvasElement, { sensibilidade: number }) → { comando(yawAtual, pitchAtual) → Comando, travar(): void, travado(): bool, aoPerderTrava(fn), aoTab(fn: (segurando: bool) => void), aoTecla(fn: (code) => void), definirSensibilidade(n), destruir(): void }`.
  - Mouse: `movementX * sensibilidade * 0.002` rad. Sensibilidade padrão 1, faixa 0,2–3.
  - `slot` só vem não nulo no comando em que 1/2/3 foi pressionado. `recarregar` vem uma vez por toque em R.
  - `pointerlockchange` sem trava → limpa todas as teclas e botões e chama `aoPerderTrava` (Review Focus #1).
  - `travar()` engole a rejeição da Promise de `requestPointerLock` (headless não tem trava).
  - `preventDefault` em Tab, Space e no menu de contexto do canvas.
- Produces `render.js`: `criarRender(canvas, mapa) → { desenhar(mundo, idVista: number, { zoomFov?: number }), redimensionar(), impacto(ponto, normal), flash(), recuoVisual(), destruir() }`.
  - Mapa: **uma** `BufferGeometry` com todas as caixas (24 vértices e 36 índices por caixa, normais por face, cor por vértice) + `MeshLambertMaterial({ vertexColors: true })`. Uma draw call.
  - Luzes: `HemisphereLight` + `DirectionalLight`.
  - Avatar estilo Roblox criado sob demanda por id, com geometrias de caixa compartilhadas: cabeça amarela 0xf5cd30, tronco na cor do time (azul 0x2f6fde, laranja 0xf08a24) e membros mais escuros. Pernas e braços balançam com a distância andada. O avatar de `idVista` fica invisível (primeira pessoa).
  - Câmera: FOV 75, `near` 0,05. Posição = `olho(ent)` de `idVista`.
  - `destruir()` chama `dispose` em geometrias, materiais e renderer e cancela o `ResizeObserver`.
- `index.js`: por enquanto "Jogar" cria mundo + render + entrada e roda o loop rAF com `dt = Math.min((agora - antes) / 1000, 0.05)`. Só o jogador recebe comando; os bots ficam parados. `pause()` cancela o rAF; `resume()` volta a agendar.

- [ ] **Step 1: Escrever `mundo.test.mjs` (falhando)**

- `criarMundo tem 5 azuis (jogador id 0) e 5 laranja`.
- `posicionarParaRound troca os spawns`: com `'A'`, o jogador fica em `MAPA.spawns.A[0]`; com `'B'`, em `spawns.B[0]`.
- `andar para frente com yaw 0 diminui z`: 1 s em passos de 0,05 com `frente:1` → Δz ≈ -5,5 (±0,3).
- `devagar e agachado são mais lentos`: distâncias em 1 s ≈ 2,6 e 2,0.
- `congelado não anda mas gira`: `yaw` muda, `pos` igual.
- `pulo só no chão`: dois `pular` seguidos no ar não somam altura (pico < 1,2 m).
- `pitch limitado`: `pitch: 3` → 1,5.
- `não levanta embaixo de teto`: caixa de teto a 1,4 m sobre o jogador agachado; soltar `agachar` mantém `agachado === true`.
- `dt máximo não atravessa parede` (Review Focus #2): parede de 0,2 m a 1 m à frente; 40 passos de 0,05 → não passa.

Run: `REPO="$PWD" node --test ~/arcade-tools/blockstrike/mundo.test.mjs`
Expected: FAIL.

- [ ] **Step 2: Implementar a parte de movimento de `mundo.js`**

- [ ] **Step 3: Rodar os testes**

Expected: todos `ok`.

- [ ] **Step 4: Implementar `entrada.js`, `render.js` e o loop provisório em `index.js`**

- [ ] **Step 5: Verificar no navegador**

`python3 -m http.server 8000` → `http://localhost:8000/#/blockstrike` → Jogar.
Esperado:
- o mapa aparece;
- WASD/C/Shift/Espaço funcionam e o mouse gira;
- paredes bloqueiam;
- Esc solta o mouse e o jogador para de andar;
- os 9 bots aparecem como bonecos de blocos nos spawns;
- console sem erros.
Ajustar `mapa.js` se alguma rota estiver estranha e rodar os testes da Task 3 de novo.

- [ ] **Step 6: Commit**

```bash
git add js/games/blockstrike/mundo.js js/games/blockstrike/entrada.js js/games/blockstrike/render.js js/games/blockstrike/index.js
git commit -m "feat(block-strike): render de blocos, movimento com colisão e pointer lock"
```

---

### Task 5: Armas e tiro (dano por parte, recarga, spread, recuo)

**Files:**
- Create: `js/games/blockstrike/armas.js`, `js/games/blockstrike/sons.js`
- Modify: `js/games/blockstrike/mundo.js`, `js/games/blockstrike/render.js` (viewmodel), `js/games/blockstrike/index.js`
- Test: `~/arcade-tools/blockstrike/armas.test.mjs`, `~/arcade-tools/blockstrike/mundo.test.mjs` (novos casos)

**Interfaces:**
- Consumes: `ARMAS`, `MULT_PARTE` e `raycastCaixas/raycastEntidades` (Task 2); `passo` (Task 4).
- Produces `armas.js`:
  - `criarArma(tipo) → Arma = { tipo, municao, reserva, prontaEm: 0, recarregandoAte: 0, recuoAcum: 0, gatilhoSolto: true }`.
  - `podeAtirar(arma, agora, gatilho: bool) → bool`: falso se estiver recarregando, sem munição, antes de `prontaEm`, ou se a arma for semi e `!gatilhoSolto`.
  - `disparar(arma, agora, { velHoriz, velMax, noChao, agachado, zoom }, rng) → Vec2[]`. Desconta munição, define `prontaEm = agora + 60/rpm`, soma `recuo` em `recuoAcum` e devolve os desvios `{dx, dy}` (rad) de cada chumbo (1, ou `chumbos`).
    Spread: `base + (velHoriz/velMax) * spreadMov`; ×0,6 se agachado; `+ 2*spreadMov` se no ar. Na sniper sem zoom, a base é `spreadSemZoom`. `dy` soma `-recuoAcum`.
  - `atualizarArma(arma, agora, dt, gatilho)`: o recuo volta a 0 a `0.1 rad/s` enquanto não atira; atualiza `gatilhoSolto`; termina a recarga (transfere da reserva).
  - `iniciarRecarga(arma, agora) → bool` (falso se o pente está cheio ou a reserva vazia). Pente vazio + gatilho dispara a recarga sozinho.
  - `danoDe(tipo, parte) → number = Math.round(ARMAS[tipo].dano * MULT_PARTE[parte])`.
- Modify `mundo.js`:
  - `posicionarParaRound` recria `armas = { primaria: criarArma(ent.primariaEscolhida), pistola: criarArma('pistola'), faca: criarArma('faca') }`.
  - `passo` trata `slot`, `recarregar` e `atirar`. O raio sai de `olho(ent)` na `direcao(yaw + dx, pitch + dy)` e para no primeiro entre caixa e entidade. Alcance 200 m (faca: `alcance`). Entidade do **mesmo time** bloqueia o tiro mas não leva dano (fogo amigo desligado).
  - Morte → `vivo=false`, `kills++` / `mortes++`, `killsCabeca++` se cabeça.
  - Em `congelado` não se atira.
- Produces `sons.js`: `criarSons(audio) → { tiro(tipo, distancia), passo(distancia), acerto(cabeca), morte(), fimRound(venceu), recarga() }`. Usa `audio.playTone`, com volume `* Math.max(0, 1 - distancia/60)`, e tons distintos por arma (rifle 140 Hz sawtooth curto, sniper 90 Hz longo, etc.).
- `render.js`: arma em primeira pessoa feita de caixas, presa à câmera e trocada por slot. `flash()` mostra um bloco amarelo por 50 ms. `recuoVisual()` empurra a arma para trás. Pool de 64 decalques de impacto (caixa preta 0,08 m), em anel. `desenhar` recebe `zoomFov` para a sniper.
- `index.js` liga os eventos do `passo` a sons e efeitos.

- [ ] **Step 1: Escrever `armas.test.mjs` (falhando)**

- `danoDe('rifle','cabeca') === 144`, `danoDe('rifle','pernas') === 27`, `danoDe('sniper','tronco') === 115`.
- `cadência do rifle`: após disparar em t=0, `podeAtirar` é falso em t=0,09 e verdadeiro em t=0,1.
- `pistola é semi`: com o gatilho segurando sem soltar, a segunda chamada de `podeAtirar` é falsa; após `atualizarArma(..., gatilho=false)`, volta a ser verdadeira.
- `escopeta devolve 8 desvios`.
- `parado e agachado tem spread menor que correndo` (média de |dx| em 200 disparos com rng fixo).
- `sniper sem zoom espalha mais que com zoom`.
- `recarga`: pente 0, reserva 90 → `iniciarRecarga` em t=0; em t=2,4 ainda 0; em t=2,5 pente 30 e reserva 60.
- `recarga com reserva parcial`: reserva 10, pente 5 → pente 15, reserva 0.
- `recuo acumula e volta`.

- [ ] **Step 2: Novos casos em `mundo.test.mjs` (falhando)**

Montar o cenário à mão: jogador em (0,0,0) olhando para -z e um alvo laranja em (0,0,-10).
- `rifle no tronco tira 36`: pitch apontando para y=1,1 → hp do alvo 64 e evento `acerto` com `parte:'tronco'`.
- `headshot de rifle mata` → evento `morte` com `cabeca:true` e `killsCabeca` do jogador 1.
- `fogo amigo desligado`: alvo azul → hp 100.
- `aliado na frente bloqueia o tiro`: azul em z=-5, laranja em z=-10 → laranja com hp 100.
- `parede bloqueia o tiro`.
- `congelado não atira` (munição intacta).
- `faca não alcança 3 m`.

- [ ] **Step 3: Implementar `armas.js` e o tiro em `mundo.js`**

- [ ] **Step 4: Rodar todos os testes**

Run: `REPO="$PWD" node --test ~/arcade-tools/blockstrike/*.test.mjs`
Expected: todos `ok`.

- [ ] **Step 5: Implementar `sons.js`, o viewmodel e os efeitos. Verificar no navegador**

Esperado: atirar nos bots parados os mata (o boneco tomba ou some), as marcas aparecem nas paredes, 1/2/3/R funcionam, o zoom da sniper funciona e há som por arma.

- [ ] **Step 6: Commit**

```bash
git add js/games/blockstrike/armas.js js/games/blockstrike/sons.js js/games/blockstrike/mundo.js js/games/blockstrike/render.js js/games/blockstrike/index.js
git commit -m "feat(block-strike): armas com dano por parte, recarga, spread e recuo"
```

---
### Task 6: Navegação A* nos waypoints

**Files:**
- Create: `js/games/blockstrike/navegacao.js`
- Test: `~/arcade-tools/blockstrike/navegacao.test.mjs`

**Interfaces:**
- Consumes: `MAPA` (Task 3), `temVisada` (Task 2).
- Produces:
  - `criarGrafo(waypoints, arestas) → Grafo` (lista de adjacência com custo = distância euclidiana em xz).
  - `caminho(grafo, deId, paraId) → number[]` (inclui as duas pontas; `[]` se não houver caminho).
  - `maisProximo(grafo, pos: Vec3, caixas, { exigirVisada = true }) → id | null`.
  - `coberturaPerto(grafo, pos, ameacaPos, caixas) → id | null`: waypoint `cobertura` mais próximo **sem** visada para `ameacaPos`.

- [ ] **Step 1: Escrever os testes (falhando)**

Usar um grafo pequeno à mão: quadrado 0-1-2-3 com diagonal 0-2 de custo maior que o atalho. Testar também com `MAPA`.
- `caminho mais curto` no quadrado.
- `de == para` → `[id]`.
- `sem caminho` (nó isolado) → `[]`.
- `no MAPA, todo par (spawnA mais próximo, spawnB mais próximo) tem caminho`.
- `maisProximo ignora waypoint atrás de parede`.
- `coberturaPerto devolve waypoint sem visada para a ameaça`.

Run: `REPO="$PWD" node --test ~/arcade-tools/blockstrike/navegacao.test.mjs`
Expected: FAIL.

- [ ] **Step 2: Implementar `navegacao.js`**

- [ ] **Step 3: Rodar os testes**

Expected: todos `ok`.

- [ ] **Step 4: Commit**

```bash
git add js/games/blockstrike/navegacao.js
git commit -m "feat(block-strike): A* sobre o grafo de waypoints"
```

---

### Task 7: Bots (rota, combate, cobertura, recuo e dificuldade)

**Files:**
- Create: `js/games/blockstrike/bots.js`
- Modify: `js/games/blockstrike/mundo.js` (`criarMundo` usa `escolherPrimaria` para os bots; nas Tasks 4–6 eles usam `'rifle'`), `js/games/blockstrike/index.js` (comandos dos bots)
- Test: `~/arcade-tools/blockstrike/bots.test.mjs`

**Interfaces:**
- Consumes: `DIFICULDADE` (Task 2), `olho/direcao` de `fisica.js` (Task 4), `criarMundo/passo` só nos testes (Tasks 4–5), `caminho/maisProximo/coberturaPerto` (Task 6), `hitboxes/temVisada` (Task 2).
- Produces:
  - `escolherPrimaria(indiceNoTime: number, rng) → tipo`. O índice 0 de cada time é sempre `sniper`. Os outros sorteiam com pesos rifle 0,55, smg 0,25 e escopeta 0,2.
  - `criarCerebro(ent, grafo, rng) → Cerebro = { estado: 'rota'|'combate'|'cobertura'|'recuo', rota: number[], alvoId: null, vistoHa: 0, rajada: 0, pausaAte: 0, ultimoDanoDe: null }`. A rota inicial é o caminho até um waypoint sorteado na metade inimiga do mapa (alternando entre as três rotas pelo índice do bot).
  - `pensar(ent, mundo, grafo, dificuldade, dt, rng) → Comando`. Regras:
    - **Visão:** inimigo vivo a ≤ 60 m, dentro de um cone de 110° do yaw (ou a ≤ 3 m em qualquer direção) e com `temVisada` entre olho e cabeça/tronco. Escolhe o mais próximo.
    - **Reação:** ao ver um alvo novo, `vistoHa` acumula dt. Só atira quando `vistoHa >= reacao`. Perder a visada por > 1 s volta para `rota`, indo até o waypoint mais próximo da última posição vista.
    - **Mira:** mira na cabeça com probabilidade `chanceCabeca` (sorteada por rajada), senão no centro do tronco. O yaw/pitch alvo recebe um erro gaussiano de desvio `erroMira`. O yaw gira até o alvo a no máximo 8 rad/s (sem estalo instantâneo).
    - **Rajada:** auto atira 3–5 tiros e pausa 0,25–0,4 s. Semi espera `prontaEm`. Para de andar (`frente:0`) enquanto atira, exceto com SMG ou escopeta, que fazem strafe lateral alternando a cada 0,6 s.
    - **Cobertura:** levou dano (`ultimoDanoDe` preenchido pelo mundo) sem enxergar o atirador → `coberturaPerto` e anda até lá.
    - **Recuo:** hp < 30 e em combate → recua para a cobertura mais próxima e agacha.
    - **Recarga:** pente vazio fora de combate ou < 30% sem alvo → `recarregar`.
    - **Faca:** nunca escolhe.
  - `mundo.js`: no `acerto`, grava `alvo.cerebro.ultimoDanoDe = atirador.id` se o alvo for bot.
- `index.js`: a cada passo, `comandos.set(id, pensar(...))` para cada bot vivo.

- [ ] **Step 1: Escrever `bots.test.mjs` (falhando)**

Montar mundos pequenos com `criarMundo` + posições à mão e rng fixo.
- `sniper fixo no índice 0`; `nunca escolhe faca` (1000 sorteios).
- `não atira antes do tempo de reação`: inimigo visível a 10 m, dificuldade `facil` → nenhum `atirar` nos primeiros 0,55 s (passos de 0,05); atira até 0,8 s.
- `difícil reage mais rápido que fácil` (tempo até o 1º tiro).
- `não vê através da parede` → estado continua `rota`.
- `não vê pelas costas a 20 m`; `vê pelas costas a 2 m`.
- `erro de mira`: com `dificil`, 200 comandos contra alvo parado a 15 m → desvio médio de yaw entre 0,005 e 0,04 rad (humano, não perfeito: média > 0).
- `giro limitado`: alvo a 180° → |Δyaw| ≤ 8*dt por passo.
- `recua com hp baixo`: hp 20 em combate → estado `recuo` e `agachar` true ao chegar.
- `dano sem visada leva à cobertura`.
- `integração`: mundo completo, 5×5 bots (jogador também controlado por `pensar`), dificuldade `medio`, 120 s simulados → pelo menos 3 mortes e nenhuma entidade fora dos limites do mapa.

Run: `REPO="$PWD" node --test ~/arcade-tools/blockstrike/bots.test.mjs`
Expected: FAIL.

- [ ] **Step 2: Implementar `bots.js` e os ajustes em `mundo.js`**

- [ ] **Step 3: Rodar todos os testes**

Run: `REPO="$PWD" node --test ~/arcade-tools/blockstrike/*.test.mjs`
Expected: todos `ok`.

- [ ] **Step 4: Ligar em `index.js` e verificar no navegador**

Esperado:
- os bots saem do spawn por rotas diferentes;
- os aliados avançam junto;
- os bots trocam tiro entre si e com o jogador, e se escondem quando tomam dano;
- no fácil dá para vencer duelos; no difícil eles acertam mais, mas não instantaneamente.

- [ ] **Step 5: Commit**

```bash
git add js/games/blockstrike/bots.js js/games/blockstrike/mundo.js js/games/blockstrike/index.js
git commit -m "feat(block-strike): bots com rotas, reação, mira humana, cobertura e recuo"
```

---
### Task 8: Regras de round e partida

**Files:**
- Create: `js/games/blockstrike/rounds.js`
- Modify: `js/games/blockstrike/index.js`
- Test: `~/arcade-tools/blockstrike/rounds.test.mjs`

**Interfaces:**
- Consumes: `ROUND` (Task 2), `vivosPorTime/posicionarParaRound` (Task 4).
- Produces:
  - `criarPartida() → Partida = { placar: { azul: 0, laranja: 0 }, round: 1, fase: 'freeze', tempo: ROUND.freeze, vencedorRound: undefined, motivo: null, resultado: null }`.
  - `ladoAzul(round) → 'A'|'B'`: `'A'` até `ROUND.trocaLados`, depois `'B'`.
  - `vencedorPorTempo(vivos) → 'azul'|'laranja'|null`: mais vivos, depois mais HP somado, depois `null`.
  - `tickPartida(p, dt, vivos) → string[]` (eventos). O dt é limitado a 0,05 internamente.
    - `freeze`: conta até 0 → `fase:'jogo'`, `tempo: ROUND.duracao`, evento `'inicio-round'`.
    - `jogo`:
      - ambos com `n===0` → vencedor `null`, `motivo:'eliminacao'`;
      - um com 0 → o outro vence, `motivo:'eliminacao'`;
      - `tempo<=0` → `vencedorPorTempo`, `motivo:'tempo'`.
      Em todos: soma o placar, `fase:'fim-round'`, `tempo: ROUND.fimRound`, evento `'fim-round'`.
    - `fim-round`: conta até 0. Se algum time chegou a `vencer` ou `round === maxRounds` → `fase:'fim-partida'`, `resultado` = time com mais pontos ou `'empate'`, evento `'fim-partida'`. Senão `round++`, `fase:'freeze'`, evento `'novo-round'` (e `'troca-lados'` quando `round === trocaLados + 1`).
    - `fim-partida`: não faz nada.
- `index.js`:
  - `passo(..., { congelado: fase === 'freeze' })`.
  - Nas fases `fim-round` e `fim-partida` o mundo segue rodando, mas sem comandos de tiro.
  - Em `'novo-round'` → `posicionarParaRound(mundo, ladoAzul(p.round))` + recriar os cérebros dos bots.
  - O jogador morto vira espectador: `idVista` passa a ser o aliado vivo seguinte; clique (`aoTecla` ou mouse 0) troca. Se não houver aliado vivo, a vista fica no último.
  - `raiz.dataset.fase = p.fase` a cada mudança (usado pelo smoke).

- [ ] **Step 1: Escrever `rounds.test.mjs` (falhando)**

Helper `rodar(p, segundos, vivos)` que chama `tickPartida` em passos de 0,05.
- `freeze dura 5 s` → depois `fase === 'jogo'`, `tempo === 115`.
- `eliminação dá o round`: laranja n=0 → placar azul 1, motivo `'eliminacao'`.
- `eliminação simultânea não pontua` (Review Focus #4) → placar 0×0, `vencedorRound === null`, e a partida segue para o round 2.
- `tempo esgotado: mais vivos vence`; `empate em vivos: mais HP vence`; `empate total: ninguém`.
- `fim-round dura 3 s e incrementa o round`.
- `troca de lados`: `ladoAzul(12) === 'A'`, `ladoAzul(13) === 'B'`, e evento `'troca-lados'` ao entrar no round 13.
- `13 vitórias encerra`: 13 rounds vencidos pelo azul → `resultado === 'azul'` após o 13º fim-round.
- `12×12 é empate`: alternando vitórias até 24 rounds → `resultado === 'empate'`.
- `round 24 com rounds nulos`: placar 11×12 no fim do round 24 → `resultado === 'laranja'`.
- `dt gigante limitado`: `tickPartida(p, 10, ...)` no freeze → `tempo ≈ 4.95`.

Run: `REPO="$PWD" node --test ~/arcade-tools/blockstrike/rounds.test.mjs`
Expected: FAIL.

- [ ] **Step 2: Implementar `rounds.js`**

- [ ] **Step 3: Rodar todos os testes**

Expected: todos `ok`.

- [ ] **Step 4: Ligar em `index.js` e verificar no navegador**

Esperado:
- 5 s parado no início;
- rounds acabam por eliminação;
- o jogador morto assiste os aliados;
- no round 13 os times trocam de base.
Sem HUD ainda: conferir com `document.querySelector('#view-blockstrike').dataset.fase` no console.

- [ ] **Step 5: Commit**

```bash
git add js/games/blockstrike/rounds.js js/games/blockstrike/index.js
git commit -m "feat(block-strike): rounds MR12, troca de lados, espectador e fim de partida"
```

---

### Task 9: Menus, loadout, HUD, placar, pausa e fim de partida

**Files:**
- Create: `js/games/blockstrike/hud.js`
- Modify: `js/games/blockstrike/index.js`, `css/games/blockstrike.css`

**Interfaces:**
- Consumes: tudo acima. `ctx.storage`, `ctx.confetti`.
- Storage (chave → padrão): `primaria` → `'rifle'`, `dificuldade` → `'medio'`, `sensibilidade` → `1`, `vitorias` → `0`, `partidas` → `0`, `melhorKD` → `0`.
- Produces `criarHud(raiz, handlers) → Hud`. `handlers = { jogar(), escolherPrimaria(tipo), mudarDificuldade(d), mudarSensibilidade(n), continuar(), sairParaMenu(), jogarDeNovo() }`. Elementos (ids exatos, usados pelo smoke):
  - `#bs-menu`: título, `#bs-jogar`, grade de primárias `#bs-menu-armas` (4 botões `data-arma`, com o selecionado marcado), `<select id="bs-dificuldade">` (Fácil/Médio/Difícil) e `<input type="range" id="bs-sensibilidade" min="0.2" max="3" step="0.1">`.
  - `#bs-hud`:
    - `#bs-mira` (cruz que abre com o spread);
    - `#bs-hp`;
    - `#bs-municao` (`30 / 90`, ou `—` na faca);
    - `#bs-timer` (`m:ss`; no freeze mostra os segundos restantes);
    - `#bs-placar-azul`, `#bs-placar-laranja` e `#bs-round`;
    - `#bs-killfeed` (máx. 5 linhas, cada uma some após 5 s: `Bot Cubo [Rifle] Você`, com ícone de cabeça se headshot e nomes na cor do time);
    - `#bs-hitmarker` (vermelho se headshot);
    - `#bs-dano` (arco vermelho girado para a direção do atacante, some em 0,6 s);
    - `#bs-espectando` ("Assistindo: Bot X").
  - `#bs-loadout`: aparece só no `freeze`, com as 4 primárias e as teclas 1–4 (**no freeze, as teclas 1–4 (via `entrada.aoTecla`, códigos `Digit1`–`Digit4`) escolhem a primária e o `slot` do comando é ignorado**). Também aceita clique. A escolha vale para o round atual (recria a primária do jogador) e para os seguintes.
  - `#bs-placar-tabela`: aparece com Tab segurado e no fim da partida. Tabela por time com nome, K, D e HS%, ordenada por kills.
  - `#bs-fim-round`: "Azul venceu o round" / "Laranja venceu o round" / "Round empatado", mais o motivo.
  - `#bs-pausa`: "Continuar" e "Sair para o menu".
  - `#bs-fim`: "Vitória!" / "Derrota" / "Empate", placar final, `#bs-placar-tabela`, `#bs-jogar-de-novo` e `#bs-voltar-menu`.
  - `Hud.atualizar(estadoVisivel)` é chamado por frame, mas só escreve no DOM quando o valor muda.
- `index.js`:
  - "Jogar" trava o pointer, cria mundo e partida e esconde o menu.
  - `aoPerderTrava` com partida ativa (fora do fim) → `#bs-pausa` visível e simulação congelada (não chama `passo` nem `tickPartida`).
  - "Continuar" → `travar()` e esconde a pausa.
  - "Sair para o menu" → destrói mundo e render e mostra `#bs-menu`.
  - Fim de partida → solta o pointer e mostra `#bs-fim`. Grava `partidas+1`, `vitorias+1` se o azul venceu (e chama `ctx.confetti()`), e `melhorKD = max(melhorKD, kills / max(1, mortes))` do jogador.
  - Menu: mudanças de arma, dificuldade e sensibilidade gravam no storage na hora.

- [ ] **Step 1: Estender o probe do smoke (falhando)**

```js
async blockstrike(page) {
  await page.waitForSelector('#bs-menu:not([hidden])');
  await page.click('#bs-menu-armas [data-arma="smg"]');
  await page.click('#bs-jogar');
  await page.waitForFunction(() => document.querySelector('#view-blockstrike').dataset.fase === 'freeze');
  const t1 = await page.$eval('#bs-timer', (e) => e.textContent);
  await sleep(1200);
  const t2 = await page.$eval('#bs-timer', (e) => e.textContent);
  if (t1 === t2) throw new Error(`blockstrike: timer parado (${t1})`);
  if (await page.$eval('#bs-loadout', (e) => e.hidden)) throw new Error('blockstrike: loadout escondido no freeze');
  const sel = await page.$eval('#bs-loadout [data-arma="smg"]', (e) => e.classList.contains('selecionada'));
  if (!sel) throw new Error('blockstrike: arma do menu não veio para o loadout');
}
```
Observação: no headless o pointer lock falha. O jogo **precisa** começar mesmo assim (a pausa só abre em `pointerlockchange` depois de uma trava bem-sucedida).
Run: smoke com os 7 ids. Expected: FAIL no probe.

- [ ] **Step 2: Implementar `hud.js`, a ligação em `index.js` e o CSS**

O CSS dos overlays segue o visual do hub (glass-card, fontes do `base.css`). O HUD fica com `pointer-events: none`, exceto nos menus.

- [ ] **Step 3: Rodar o smoke (normal e `--bloqueado`)**

Expected: `smoke ok (7 jogos)` nas duas execuções. Com `--bloqueado` o probe não roda, mas a view tem que montar sem erro.

- [ ] **Step 4: Verificar no navegador uma partida inteira no Fácil**

Esperado:
- menu → loadout no freeze;
- HUD correto;
- kill feed, hitmarker e indicador de dano funcionando;
- Tab mostra o placar;
- Esc pausa e Continuar volta;
- partida até 13 → tela de fim com confete na vitória;
- recorde aparece no card da home.

- [ ] **Step 5: Commit**

```bash
git add js/games/blockstrike/hud.js js/games/blockstrike/index.js css/games/blockstrike.css
git commit -m "feat(block-strike): menu, loadout por round, HUD, placar, pausa e tela final"
```

---

### Task 10: Integração com o hub, desempenho e README

**Files:**
- Modify: `js/games/blockstrike/index.js`, `README.md`
- Modify (fora do repo): `~/arcade-tools/smoke.mjs`

**Interfaces:**
- `pause()` (sair da rota): congela a simulação, cancela o rAF, solta o pointer (`document.exitPointerLock()` se a trava for do canvas), para os sons e, se houver partida ativa, deixa `#bs-pausa` visível.
- `resume()`: volta a agendar o rAF (que só desenha enquanto estiver pausado). Nunca retoma a simulação sozinho.
- Redimensionar a janela → `render.redimensionar()`.

- [ ] **Step 1: Teste de saída de rota no smoke (falhando se não pausar)**

No final do probe `blockstrike`:
```js
await page.evaluate(() => { location.hash = '#/'; });
await sleep(300);
await page.evaluate(() => { location.hash = '#/blockstrike'; });
await sleep(300);
if (await page.$eval('#bs-pausa', (e) => e.hidden)) throw new Error('blockstrike: deveria voltar pausado');
const a = await page.$eval('#bs-timer', (e) => e.textContent);
await sleep(1200);
const b = await page.$eval('#bs-timer', (e) => e.textContent);
if (a !== b) throw new Error('blockstrike: timer andou com o jogo pausado');
```
Run: smoke. Expected: FAIL até o Step 2.

- [ ] **Step 2: Implementar `pause`/`resume` completos**

- [ ] **Step 3: Rodar o smoke (normal e `--bloqueado`) e todos os testes Node**

Expected:
- `smoke ok (7 jogos)` e `smoke ok (7 jogos, storage bloqueado)`;
- `node --test` todo `ok`.

- [ ] **Step 4: Checar desempenho no navegador**

No console, com a partida rodando, medir o FPS médio em 5 s com `requestAnimationFrame` e ler `renderer.info.render.calls` (expor temporariamente se preciso e remover depois).
Esperado:
- ≥ 55 fps em notebook comum;
- < 150 draw calls;
- `renderer.info.memory.geometries` estável entre rounds (sem vazamento).
Testar também sair para o menu e jogar de novo 3 vezes: geometrias de volta ao valor inicial.

- [ ] **Step 5: Atualizar o README**

- Sete jogos; linha do Block Strike na tabela de jogos (FPS 5x5 contra bots, 3 dificuldades, MR12, Three.js).
- Destaques técnicos: "zero dependências" vira "zero dependências, exceto o Three.js vendorizado usado só no Block Strike".
- Controles do Block Strike.
- Aviso de licença MIT do Three.js em `js/vendor/three-LICENSE`.

- [ ] **Step 6: Commit**

```bash
git add js/games/blockstrike/index.js README.md
git commit -m "feat(block-strike): pausa ao sair da rota, desempenho e README"
```
