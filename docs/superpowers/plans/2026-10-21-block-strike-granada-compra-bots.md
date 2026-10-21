# Block Strike — granada na tecla 4, compra com mouse e bots Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Granada como "arma" na tecla 4 (esquerdo longe, direito curto, os dois médio), menu de compra clicável com o cursor solto pelo `B`, CT segurando ângulo no posto e bots que não ficam parados nem presos.

**Architecture:** A lógica da granada na mão fica pura em `granadas.js` (`proximaGranada`, `atualizarMao`) e entra no `mundo.js` como um slot `'granada'`, com uma pseudo-arma `e.armas.granada`. O jogador não manda mais `cmd.granada`: segura e solta `atirar`/`zoom`, e o mundo decide a força. Os bots continuam com `cmd.granada` + `granadaAlvo`. O cursor da compra é um estado `p.cursorCompra` no `index.js` que não abre a pausa. Nos bots entra o estado `'posto'` (CT parado mirando `bombsites[s].mira`) e o estado `'procura'` (vai ao último ponto visto, espera e volta ao objetivo).

**Tech Stack:** JS puro (ES modules), Three.js no `render.js`, `node:test` e puppeteer-core em `~/arcade-tools`.

**Spec:** `docs/superpowers/specs/2026-10-21-block-strike-granada-compra-bots-design.md`

## Global Constraints

- Módulos puros continuam sem DOM e sem Three.js: `bots.js`, `navegacao.js`, `granadas.js`, `mundo.js`, `config.js`, `mapa.js`.
- Textos da UI, comentários e commits em pt-BR, no estilo do código atual (comentário curto acima da função, sem JSDoc).
- Testes ficam em `~/arcade-tools/blockstrike/*.test.mjs` (fora do repo), importando via `mod()` de `_repo.mjs`. Rodar com `REPO="/home/lmaciel0/Área de trabalho/repositorios/flow-games" node --test ~/arcade-tools/blockstrike/<arquivo>`. A suíte inteira tem hoje 191 testes passando e precisa continuar verde.
- Commits: `git add` por caminho, nunca pasta inteira. Mensagem termina com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Branch `feat/block-strike-cs2-controles`. PR com merge commit. Deploy de produção só com autorização explícita do usuário.
- Forças de arremesso (ponto de partida): longe `{ velocidade: 18, subida: 4 }`, médio `{ velocidade: 12, subida: 3 }`, curto `{ velocidade: 7, subida: 2 }`.
- Ordem do ciclo das granadas: `['he', 'flash', 'smoke']`.
- Espera no último ponto visto: `ESPERA_COBERTURA` (1,5 a 3 s).

## Review Focus

1. Apertar `4` sem nenhuma granada, ou com o estoque zerando depois do arremesso: não pode entrar num slot vazio nem deixar a mão sem arma. Teste no Task 2.
2. Trocar de arma (1/2/3/Q/roda) com o pino puxado cancela o arremesso: nada é lançado e o estoque não cai. Teste no Task 2.
3. `B` com o cursor solto e o freeze acabando: a rodada começa sem pausa, a dica aparece e o clique de retravar não atira. Verificação no Task 4.
4. CT no posto que leva tiro de quem não vê: vai para a cobertura e depois volta ao posto (não ao último ponto visto). Teste no Task 5.
5. A C4 plantada enquanto o CT está no posto: ele sai do posto e vai ao bombsite. Teste no Task 5.

## Mapa de arquivos

| Arquivo | Muda o quê |
|---|---|
| `js/games/blockstrike/config.js` | `GRANADA.forcas`, `ORDEM_GRANADAS`, `ARMAS.granada` (pseudo-arma) |
| `js/games/blockstrike/armas.js` | `SAQUE.granada` |
| `js/games/blockstrike/granadas.js` | `lancar(..., forca)`, `proximaGranada`, `criarMao`, `atualizarMao` |
| `js/games/blockstrike/mundo.js` | slot `'granada'` em `slotPedido`/`combate`/`posicionarParaRound` |
| `js/games/blockstrike/entrada.js` | `Digit4` → slot `'granada'`; tira `Z`/`X`/`V`; `B` avisa o index |
| `js/games/blockstrike/index.js` | cursor da compra, dica de retravar, estado do HUD da granada |
| `js/games/blockstrike/hud.js` | indicador da granada, dica "clique para jogar", textos de ajuda |
| `js/games/blockstrike/render.js` | cubo da granada na mão |
| `js/games/blockstrike/mapa.js` | `bombsites.A.mira` e `bombsites.B.mira` |
| `js/games/blockstrike/bots.js` | estados `'posto'` e `'procura'`, correção do desencalhe |

---

### Task 1: Granada na mão — lógica pura (`config.js`, `armas.js`, `granadas.js`)

**Files:**
- Modify: `js/games/blockstrike/config.js` (bloco `GRANADA`, `ARMAS`)
- Modify: `js/games/blockstrike/armas.js:30` (`SAQUE`)
- Modify: `js/games/blockstrike/granadas.js:21-46` (`lancar`) + funções novas
- Test: `~/arcade-tools/blockstrike/granada-mao.test.mjs` (novo, copiar o `cenario`/`cmd`/`dar` de `granadas.test.mjs`)

**Interfaces:**
- Produces:
  - `GRANADA.forcas = { longe: { velocidade: 18, subida: 4 }, medio: { velocidade: 12, subida: 3 }, curto: { velocidade: 7, subida: 2 } }` (os campos antigos `velocidade`/`subida` saem; quem os usava passa a usar `forcas.longe`).
  - `export const ORDEM_GRANADAS = ['he', 'flash', 'smoke']` em `config.js`.
  - `ARMAS.granada = { nome: 'Granada', slot: 'granada', vel: 6.2, dano: 0, rpm: 0, pente: 0, reserva: 0, recarga: 0, auto: false, spreadBase: 0, spreadMov: 0, recuo: 0 }`.
  - `SAQUE.granada = 0.3`.
  - `lancar(mundo, e, tipo, eventos, alvo = null, forca = 'longe') -> boolean`. Com `alvo` (bots), ignora `forca`. `'curto'` sai 0,3 m mais baixo que os outros.
  - `proximaGranada(estoque: {he,flash,smoke}, atual: string|null) -> string|null`: o próximo tipo de `ORDEM_GRANADAS` depois de `atual` (circular) com estoque > 0. Pode devolver o próprio `atual` se for o único. `null` se não houver nenhum.
  - `criarMao() -> { ...criarArma('granada'), sel: null, pino: null }`. `pino` é `null` ou `{ esq: boolean, dir: boolean }`.
  - `atualizarMao(mundo, e, cmd, eventos) -> boolean`: chamada a cada passo com `e.slot === 'granada'`. Com `cmd.atirar || cmd.zoom` e sem pino, puxa o pino. Enquanto o pino está puxado, acumula `esq ||= cmd.atirar` e `dir ||= cmd.zoom`. Quando os dois botões ficam soltos com o pino puxado, chama `lancar` com força `esq && dir ? 'medio' : esq ? 'longe' : 'curto'`, zera o pino e devolve o resultado de `lancar`. Nos outros casos devolve `false`. Não mexe em `e.slot`.

- [ ] **Step 1: Escrever os testes que falham**

```js
test('proximaGranada segue HE → flash → smoke e pula estoque zero', () => {
  assert.equal(G.proximaGranada({ he: 1, flash: 2, smoke: 1 }, null), 'he');
  assert.equal(G.proximaGranada({ he: 1, flash: 2, smoke: 1 }, 'he'), 'flash');
  assert.equal(G.proximaGranada({ he: 1, flash: 2, smoke: 1 }, 'smoke'), 'he');
  assert.equal(G.proximaGranada({ he: 0, flash: 1, smoke: 0 }, 'flash'), 'flash');
  assert.equal(G.proximaGranada({ he: 0, flash: 0, smoke: 0 }, 'he'), null);
});
test('lancar usa a força pedida (mira reta)', () => {
  for (const [forca, v, s] of [['longe', 18, 4], ['medio', 12, 3], ['curto', 7, 2]]) {
    const m = cenario(); const eu = m.entidades[0]; dar(eu, 'he'); eu.yaw = 0; eu.pitch = 0;
    assert.ok(G.lancar(m, eu, 'he', [], null, forca));
    const g = m.granadas[0];
    assert.ok(Math.abs(Math.hypot(g.vel.x, g.vel.z) - v) < 1e-6, forca);
    assert.ok(Math.abs(g.vel.y - s) < 1e-6, forca);
  }
});
test('atualizarMao: segurar e soltar o esquerdo joga longe; o direito, curto; os dois, médio', () => {
  for (const [seq, v] of [[[{ atirar: true }], 18], [[{ zoom: true }], 7], [[{ atirar: true }, { atirar: true, zoom: true }, { zoom: true }], 12]]) {
    const m = cenario(); const eu = m.entidades[0]; dar(eu, 'he');
    eu.armas.granada = G.criarMao(); eu.armas.granada.sel = 'he';
    for (const c of seq) assert.equal(G.atualizarMao(m, eu, cmd(c), []), false);
    assert.equal(m.granadas.length, 0); // ainda segurando: nada saiu
    assert.equal(G.atualizarMao(m, eu, cmd(), []), true);
    assert.ok(Math.abs(Math.hypot(m.granadas[0].vel.x, m.granadas[0].vel.z) - v) < 1e-6);
    assert.equal(eu.equip.granadas.he, 0);
  }
});
test('atualizarMao sem botão não faz nada', () => {
  const m = cenario(); const eu = m.entidades[0]; dar(eu, 'he');
  eu.armas.granada = G.criarMao(); eu.armas.granada.sel = 'he';
  assert.equal(G.atualizarMao(m, eu, cmd(), []), false);
  assert.equal(eu.armas.granada.pino, null);
});
```

- [ ] **Step 2: Rodar e ver falhar** — `REPO=... node --test ~/arcade-tools/blockstrike/granada-mao.test.mjs`. Esperado: FAIL (`proximaGranada is not a function`).

- [ ] **Step 3: Implementar** as interfaces acima. Trocar `GRANADA.velocidade`/`GRANADA.subida` em `lancar` por `GRANADA.forcas[forca]`. Procurar outros usos com `grep -n "GRANADA.velocidade\|GRANADA.subida" js/games/blockstrike/*.js`.

- [ ] **Step 4: Rodar o arquivo novo e `granadas.test.mjs`** — os dois PASS.

- [ ] **Step 5: Commit**

```bash
git add js/games/blockstrike/config.js js/games/blockstrike/armas.js js/games/blockstrike/granadas.js
git commit -m "feat(blockstrike): granada na mão com força longe/médio/curto (lógica pura)"
```

### Task 2: Slot `'granada'` no mundo (`mundo.js`)

**Files:**
- Modify: `js/games/blockstrike/mundo.js:60-90` (`posicionarParaRound`), `:240-270` (`ORDEM_SLOTS`, `slotPedido`, `combate`)
- Test: `~/arcade-tools/blockstrike/mundo-granada.test.mjs` (novo)

**Interfaces:**
- Consumes: `criarMao`, `proximaGranada`, `atualizarMao`, `granadasDe` (Task 1); `SAQUE.granada`.
- Produces:
  - Toda entidade tem `e.armas.granada = criarMao()` depois de `posicionarParaRound`, nos dois ramos (com e sem economia).
  - `cmd.slot === 'granada'` com outro slot na mão: entra no slot se `proximaGranada(estoque, null) !== null`. `sel` fica no último tipo usado se ainda houver estoque; senão, `proximaGranada(estoque, null)`. Já na granada e sem pino: `sel = proximaGranada(estoque, sel)`, sem trocar de slot e sem evento `saque`.
  - `ORDEM_SLOTS = ['primaria', 'pistola', 'faca', 'granada']`. A roda e o `'anterior'` só param na granada com estoque.
  - Sair do slot com o pino puxado zera `pino`, e nada é lançado.
  - Quando `atualizarMao` devolve `true`: volta para `e.slotAnterior` pelo mesmo caminho da troca normal (evento `saque`), e `slotAnterior` passa a ser `'granada'`. Se a granada na mão ficar sem estoque e sem pino, sai do slot do mesmo jeito.
  - Os bots continuam lançando por `cmd.granada` sem passar pelo slot. O ramo atual de `passo` fica.

- [ ] **Step 1: Escrever os testes que falham** (`cenario` com economia, como em `granadas.test.mjs`. Para passos, usar `passo(m, 0.05, new Map([[eu.id, cmd({...})]]))`.)
  - `'4 sem granada não troca de slot'`: estoque zero, `slot: 'granada'` → `eu.slot === 'primaria'`.
  - `'4 entra na HE e cada 4 cicla'`: `he: 1, flash: 1`. Mandar três vezes `slot: 'granada'` (com um passo vazio entre elas) → `sel` vale `'he'`, depois `'flash'`, depois `'he'`, e `eu.slot === 'granada'` o tempo todo.
  - `'jogar volta para a arma anterior'`: entrar com HE, segurar `atirar` por 3 passos, soltar → `m.granadas.length === 1` e `eu.slot === 'primaria'`.
  - `'trocar de arma com o pino puxado cancela'`: segurar `atirar`, mandar `slot: 'pistola'` ainda com `atirar`, soltar → `m.granadas.length === 0`, `eu.equip.granadas.he === 1`, `eu.armas.granada.pino === null`.
  - `'jogar a última granada sai do slot e o 4 não entra mais'`: só uma HE, jogar → `eu.slot === 'primaria'`; `slot: 'granada'` → continua `'primaria'`.
  - `'a roda só passa pela granada com estoque'`: sem granada, `roda+` a partir da faca → `'primaria'`; com uma flash, `roda+` a partir da faca → `'granada'`.
  - `'velocidade com granada na mão é a da faca'`: na granada, `frente: 1` por 1 s → `eu.velHoriz` ≈ 6,2.

- [ ] **Step 2: Rodar e ver falhar.**
- [ ] **Step 3: Implementar.** Trocar o filtro da roda `e.armas[s]` por `slotDisponivel(mundo, e, s)` (função local nova). Em `combate`, o ramo `e.slot === 'granada'` vem antes do ramo da faca, chama `atualizarMao` e retorna. A pseudo-arma nunca chega em `podeAtirar` nem em `iniciarRecarga`.
- [ ] **Step 4: Rodar `mundo-granada.test.mjs`, depois a suíte inteira** (`node --test ~/arcade-tools/blockstrike/*.test.mjs`). Tudo PASS.
- [ ] **Step 5: Commit** — `git add js/games/blockstrike/mundo.js` + mensagem `feat(blockstrike): slot da granada no mundo (ciclo, arremesso, cancelar)`.

### Task 3: Tecla 4, HUD e cubo na mão (`entrada.js`, `index.js`, `hud.js`, `render.js`)

**Files:**
- Modify: `js/games/blockstrike/entrada.js:9-10,42` (`SLOTS`, remover `GRANADAS` e `granadaPendente`)
- Modify: `js/games/blockstrike/index.js:~450-470` (`estadoVisivel`), `:~491` (som `vazio`)
- Modify: `js/games/blockstrike/hud.js:263` (dica do treino), `:~611-623` (munição), `:~647-649` (linha do dinheiro)
- Modify: `js/games/blockstrike/render.js:~561` (`viewmodelDe`), `:~736` (`tipoAtivo`)
- Test: `~/arcade-tools/bs-granada-mao.mjs` (novo, copiar o preâmbulo de servidor e puppeteer de `bs-tatico.mjs`, incluindo o patch que expõe `window.__bs` e `window.__cmd`)

**Interfaces:**
- Consumes: slot `'granada'` e `e.armas.granada.sel` (Task 2).
- Produces:
  - `SLOTS = { Digit1: 'primaria', Digit2: 'pistola', Digit3: 'faca', Digit4: 'granada', KeyQ: 'anterior' }`. `Z`, `X` e `V` não fazem mais nada. O jogador nunca manda `cmd.granada` (o campo continua no comando, sempre `null`, para os bots).
  - `estadoVisivel(...).arma` com a granada na mão traz `{ tipo: 'granada', sel, n }`, onde `n` é o estoque do `sel`.
  - O HUD mostra `HE 1`, `Flash 2` ou `Smoke 1` no lugar da munição, sem o aviso de pouca munição. A linha do dinheiro troca `Z flash`/`X smoke`/`V HE` por `flash`/`smoke`/`HE` com a contagem. A dica do treino passa a dizer `Treino · B troca a arma · 4 granada · Esc pausa`.
  - Com a granada na mão, o clique não toca o som `vazio` (guarda `tipo !== 'granada'` em `index.js:~491`).
  - `render.js`: com `tipoAtivo === 'granada'`, o viewmodel é um cubo de 0,09 m com o material de `matsGranada[sel]` (chave de cache `granada-${sel}`). Trocar de tipo troca o cubo, e o saque usa `SAQUE.granada`.

- [ ] **Step 1: Escrever `bs-granada-mao.mjs`.** Modo treino, esperar a fase `jogo`, depois:
  - `Digit4` → `slot === 'granada'` e `sel === 'he'`. Screenshot `bs-granada-he.png`.
  - `Digit4` → `sel === 'flash'`. Screenshot `bs-granada-flash.png`.
  - `window.__cmd = { atirar: true }` por 300 ms, depois `{}` → `mundo.granadas.length === 1` e `slot === 'primaria'`.
  - `KeyZ` → nenhuma granada nova.
  - Imprimir `OK` ou a lista de falhas, e sair com código 1 se houver falha ou `pageerror`.
- [ ] **Step 2: Rodar e ver falhar** — `node ~/arcade-tools/bs-granada-mao.mjs "$REPO"`. Esperado: falha no primeiro `Digit4`.
- [ ] **Step 3: Implementar** as interfaces acima.
- [ ] **Step 4: Rodar de novo.** Esperado: `OK`. Abrir os dois PNGs: cubo verde (HE) e branco (flash) na mão, HUD com `HE`/`Flash`.
- [ ] **Step 5: Commit** — `git add` dos quatro arquivos + `feat(blockstrike): granada na tecla 4 com cubo na mão e HUD`.

### Task 4: Cursor da compra no `B` (`entrada.js`, `index.js`, `hud.js`)

**Files:**
- Modify: `js/games/blockstrike/entrada.js` (`onMouseDown`, `onLockChange`, objeto devolvido)
- Modify: `js/games/blockstrike/index.js:~633-646` (`aoTecla`), `quadro` (fim do freeze), `:531` (`mostrarDica`)
- Modify: `js/games/blockstrike/hud.js:~449` (dica do menu de compra)
- Test: `~/arcade-tools/bs-compra-mouse.mjs` (novo, mesmo preâmbulo)

**Interfaces:**
- Produces (em `criarEntrada`):
  - `soltarCursor()`: marca `cursorLivre = true`, limpa teclas e botões e chama `doc.exitPointerLock()`. Com `cursorLivre`, `onLockChange` **não** chama `aoPerder` (não abre a pausa) e `onMouseDown` **não** retrava.
  - `travar()`: zera `cursorLivre` antes de pedir a trava.
  - `liberarClique()`: zera `cursorLivre` sem travar. O próximo clique no canvas retrava pelo caminho atual, e esse clique não vira tiro, porque `botoes` só recebe o botão com a trava ativa.
  - `cursorSolto() -> boolean`.
- `index.js`:
  - Em `aoTecla`, com `fase === 'freeze'`, economia ligada e `code === 'KeyB'`: alterna entre `entrada.soltarCursor()` e `entrada.travar()` e devolve `true`. No treino o `B` segue igual.
  - Em `quadro`, quando a fase sai de `freeze` com `entrada.cursorSolto()`, chama `entrada.liberarClique()`. A dica de trava que já existe (`hud.mostrarDica`, linha 531) aparece porque a trava está solta. O texto dela continua o atual.
  - `Escape` com o cursor solto pelo `B` ou depois de `liberarClique` abre a pausa: a condição atual `!partida.lock.travou` passa a ser `!partida.entrada.travado()`.
- `hud.js`: a dica do menu de compra passa a dizer `Compre com as teclas ou aperte B e clique. O que sobreviver continua com você.`

- [ ] **Step 1: Escrever `bs-compra-mouse.mjs`.** Modo partida, no freeze:
  - `KeyB` → `__bs.entrada.cursorSolto() === true`, `__bs.pausado` falso, `#bs-compra` visível.
  - `page.click('[data-item="colete"]')` → `eu.equip.colete > 0`.
  - `KeyB` → `cursorSolto() === false`.
  - `KeyB` de novo e esperar a fase `jogo` → `pausado` falso, `cursorSolto() === false` e a dica de trava visível.
  - Screenshot `bs-compra-mouse.png` com o cursor solto. Imprimir `OK` ou as falhas.
  - Observação: no headless a trava real pode não acontecer. O script confere os estados, e a sensação da trava fica para o teste manual do Task 8.
- [ ] **Step 2: Rodar e ver falhar** (`cursorSolto is not a function`).
- [ ] **Step 3: Implementar.** Se `__bs.entrada` não estiver exposto, guardar `entrada` em `partida.entrada` (o `index.js` já faz isso: `partida.entrada.ativar`).
- [ ] **Step 4: Rodar de novo** — `OK`. Rodar também `node ~/arcade-tools/bs-tatico.mjs "$REPO" compra` para confirmar que a compra pelas teclas segue funcionando.
- [ ] **Step 5: Commit** — `feat(blockstrike): B solta o mouse para comprar clicando`.

### Task 5: CT segurando ângulo no posto (`mapa.js`, `bots.js`)

**Files:**
- Modify: `js/games/blockstrike/mapa.js:~107-110` (`bombsites`)
- Modify: `js/games/blockstrike/bots.js` (`criarCerebro`, `pensar`, constante nova)
- Test: `~/arcade-tools/blockstrike/bots-posto.test.mjs` (novo, `cenario`/`rodar`/`matar` copiados de `bots-bomba.test.mjs`)

**Interfaces:**
- Produces:
  - `MAPA.bombsites.A.mira = [{ x: -36, z: -10 }, { x: -36, z: 10 }]` e `MAPA.bombsites.B.mira = [{ x: 28, z: -8 }, { x: 28, z: 8 }]`, indexados como `espera` (`casaZ`). O ponto aponta a saída da rota inimiga. Ajustar se o teste de visada falhar.
  - `c.desvioMira` sorteado em `criarCerebro`, em `[-0.15, 0.15]` rad.
  - Estado novo `c.estado === 'posto'`. Entra quando o bot é CT, a C4 não está plantada, `c.chaveBomba` começa com `'espera:'` e a rota acabou. No posto:
    - fica parado (`destino = null`);
    - com alvo, chama `atacar(..., { strafe: false })` e `jogarGranada`, **sem** `avancar` e sem virar `'combate'`;
    - sem alvo, gira para `yawPara(ent.pos, mira) + c.desvioMira` com pitch 0. Ruído ouvido ganha da mira, como hoje.
  - Mudança de `chaveBomba` (C4 plantada, por exemplo) tira o bot do posto via `voltarParaRota(proximoObjetivo(...))`.
  - Cobertura e recuo continuam valendo. O fim da espera já leva de volta ao `espera` pelo `proximoObjetivo`, e o bot entra no posto de novo.

- [ ] **Step 1: Escrever os testes que falham:**
  - `'os pontos de mira têm visada do posto'`: para A e B, `temVisada({ ...wpEspera, y: 1.6 }, { ...mira[0], y: 1.6 }, MAPA.caixas)`.
  - `'CT chega ao posto e mira a entrada'`: seeds 3 a 6, `matar(mundo, 'laranja')`, rodar 30 s. Todo CT vivo termina com `cerebro.estado === 'posto'`, a < 1,5 m do waypoint `espera`, e com `|angulo(yaw - yawPara(pos, mira))| < 0.3`.
  - `'CT no posto atira do lugar sem avançar'`: depois do anterior, reviver um T parado a ~22 m na frente do posto do B (por exemplo `(28, -19.5)`) e rodar 3 s **sem** chamar `pensar` para ele. O CT anda < 0,5 m e há evento `tiro` com `atirador` dele.
  - `'C4 plantada tira o CT do posto'`: com os CTs no posto, `bomba.plantada = true`, `site = 'A'`, `pos = centro do A`. Rodar 15 s: o CT do B não está mais em `'posto'` e chegou ≥ 10 m mais perto da C4.
  - `'tiro de quem não vê manda para a cobertura e depois de volta ao posto'`: CT no posto com `cerebro.ultimoDanoDe = id de um T vivo fora da visão`. Um `pensar` → `'cobertura'`. Rodar 15 s → `'posto'` de novo, a < 1,5 m do `espera`.
- [ ] **Step 2: Rodar e ver falhar.**
- [ ] **Step 3: Implementar.** O ramo `'posto'` em `pensar` vem antes de `else if (alvo)`.
- [ ] **Step 4: Rodar o arquivo, `bots.test.mjs`, `bots-bomba.test.mjs` e `ouvido.test.mjs`** — PASS. Se algum teste antigo esperar o CT avançando no pré-plantio, o comportamento novo vem do spec: ajustar o teste e explicar no commit.
- [ ] **Step 5: Commit** — `feat(blockstrike): CT segura ângulo no posto antes da plantada`.

### Task 6: Perdeu o inimigo → procura, espera e volta (`bots.js`)

**Files:**
- Modify: `js/games/blockstrike/bots.js` (ramo `c.estado === 'combate'` sem alvo, ramo `recuo`/`cobertura`)
- Test: `~/arcade-tools/blockstrike/bots-procura.test.mjs` (novo)

**Interfaces:**
- Consumes: estado `'posto'` (Task 5). O CT no posto nunca entra em `'procura'`.
- Produces: o estado `'procura'` troca o `voltarParaRota(..., waypointPerto(c.ultimaPos))` de hoje. Mesma rota até o waypoint do último ponto visto, mas:
  - ao chegar, espera `sortear(rng, ESPERA_COBERTURA)`;
  - depois chama `voltarParaRota(proximoObjetivo(...))`;
  - se aparecer inimigo no caminho ou na espera, vira `'combate'` normal.

  O jeito mais curto é tratar `'procura'` no mesmo ramo de `'cobertura'`, com a diferença de que um alvo visível leva a `'combate'`.

- [ ] **Step 1: Escrever os testes que falham** (cenário com C4, `rodar` de `bots-bomba.test.mjs`):
  - `'T sem a C4 que perde o alvo volta para o bombsite'`: matar os CTs. Escolher um T que não é o portador e pôr `cerebro = { ...cerebro, estado: 'combate', ultimaPos: { x: 0, y: 0, z: 8 }, perdidoHa: 2 }` com `rota: []`. Rodar 40 s: termina a < 3 m do waypoint do `siteAlvo` ou da C4 plantada (se o portador plantar, todos vão ao site). Hoje ele fica perto de `(0, 8)`, então o teste falha.
  - `'CT a caminho do posto que perde o alvo volta ao posto'`: matar os Ts e pôr um CT em `'combate'` com `ultimaPos: { x: 0, y: 0, z: -6 }`. Rodar 40 s → `estado === 'posto'` e a < 1,5 m do `espera`.
- [ ] **Step 2: Rodar e ver falhar** (os dois ficam perto da `ultimaPos`).
- [ ] **Step 3: Implementar.**
- [ ] **Step 4: Rodar este arquivo + todos os `bots*.test.mjs` + `ouvido.test.mjs`** — PASS.
- [ ] **Step 5: Commit** — `fix(blockstrike): bot que perde o inimigo volta ao objetivo em vez de ficar parado`.

### Task 7: Bot preso andando reto — reproduzir, depois corrigir (`bots.js`, talvez `mapa.js`)

**Files:**
- Create: `~/arcade-tools/bs-presos.mjs` (diagnóstico, baseado no laço de `bs-sim-partida.mjs`)
- Test: `~/arcade-tools/blockstrike/bots-presos.test.mjs` (novo)
- Modify (dependendo do achado): `js/games/blockstrike/bots.js` (`seguirRota`, ramo `tarefa?.direto`), `js/games/blockstrike/mapa.js` (waypoint numa quina)

**Interfaces:**
- Consumes: estados `'posto'` e `'procura'` (Tasks 5 e 6).
- Produces: `episodiosPresos(log) -> Array<{ round, id, estado, pos, alvoWp, dur }>`, local ao script e ao teste (copiar, sem módulo compartilhado). Um episódio é um intervalo contínuo > 3 s com estado em `['rota', 'cobertura', 'recuo', 'procura']` (ou rota acabada com destino `direto`), `cerebro.queriaAndar === true` e `velHoriz < 0.5`. O strafe de `'combate'` fica de fora (decidido no spec).

- [ ] **Step 1: Escrever `bs-presos.mjs`.** Partida inteira só de bots (uso `REPO=... node bs-presos.mjs <seed>`). A cada passo, registra por bot vivo `{ estado, pos, velHoriz, queriaAndar, wp: rota[passoRota] }`. No fim, imprime os episódios (round, bot, estado, posição, waypoint alvo, duração) e um resumo de quantos e onde (agrupar por `x > 20` / meio / `x < -20`).
- [ ] **Step 2: Rodar seeds 1 a 5** e anotar os achados (posições, estados, waypoints). Conferir cada um contra as hipóteses do spec 3c, nesta ordem:
  1. desencalhe pulando para waypoint sem visada;
  2. modo `direto` da C4 contra quina;
  3. aresta `17 → 2N+2` raspando a ponta da parede `x = 31`.

  **Se não houver nenhum episódio em 5 seeds:** pular os Steps 4 e 5 e relatar ao usuário com o resumo. O teste do Step 3 fica como regressão.
- [ ] **Step 3: Escrever `bots-presos.test.mjs`:** `'nenhum bot fica preso andando'` roda os 4 primeiros rounds das seeds 1 a 3 com `episodiosPresos` e espera `[]`. A mensagem de falha lista os episódios. Rodar e ver falhar com os mesmos casos do Step 2.
- [ ] **Step 4: Corrigir a causa achada.** Correções previstas no spec:
  - **desencalhe:** em vez de `passoRota += 1`, recalcular a rota até o mesmo destino final a partir do waypoint visível mais perto: `c.rota = rotaAte(ent, grafo, caixas, c.rota.at(-1)); c.passoRota = 0`, mantendo `cmd.pular = true`. `seguirRota` ganha o parâmetro `caixas`.
  - **direto:** um contador próprio. Mais de 1 s querendo andar com `velHoriz < 1` larga o `direto` por 2 s (`c.diretoBloqueadoAte`) e volta à rota até `waypointPerto` do ponto.
  - **quina:** mover o waypoint ou acrescentar um intermediário em `wpA`. O espelho é automático, e `mapa.test.mjs` precisa continuar verde.
- [ ] **Step 5: Rodar `bots-presos.test.mjs` + a suíte inteira** — PASS. Rodar `bs-presos.mjs` nas seeds 1 a 5: zero episódios.
- [ ] **Step 6: Commit** — `fix(blockstrike): bot preso recalcula a rota em vez de andar contra a parede` (ajustar a mensagem à causa real e citar no corpo o que o diagnóstico mostrou).

### Task 8: Verificação final e PR

**Files:** nenhum código novo.

- [ ] **Step 1: Suíte inteira** — `REPO=... node --test ~/arcade-tools/blockstrike/*.test.mjs`. Esperado: tudo PASS (191 antigos + os novos).
- [ ] **Step 2: Simulação de partida** — `REPO=... node ~/arcade-tools/bs-sim-partida.mjs 1` e `... 2`. Esperado: partida até o fim sem exceção, com plantas, desarmes e eliminações nos motivos (os CTs no posto não podem zerar as vitórias de nenhum lado).
- [ ] **Step 3: Smokes do navegador** — `bs-granada-mao.mjs`, `bs-compra-mouse.mjs`, e `bs-tatico.mjs` nas seções `basico` e `compra`. Esperado: `OK` e nenhum `pageerror`. Olhar os PNGs novos.
- [ ] **Step 4: Teste manual** (pedir ao usuário, no `python3 -m http.server` ou na preview da Vercel):
  - `4` cicla as granadas;
  - esquerdo, direito e os dois juntos dão três distâncias;
  - `B` solta o mouse, o clique compra, e o `B` trava de volta;
  - o freeze acabando com o cursor solto não pausa;
  - morrer e espectar os aliados: CT parado mirando a entrada, ninguém travado.
- [ ] **Step 5: Push e PR** no padrão do repo:
  - título `feat(blockstrike): granada na tecla 4, compra com mouse e bots que não travam`;
  - corpo com bullets em negrito, seção "Verificação" com os números do Step 1 e o resumo do Task 7, e nota de deploy no fim;
  - última linha `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.

  Sem merge e sem deploy até o usuário autorizar.
