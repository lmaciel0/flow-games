# Arcade Hub — Reorganização Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reorganizar o Arcade Hub em módulos ES com registro de jogos, persistência unificada, home com cards, fonte local, recordes novos (Tetris e Campo Minado) e README de vitrine, pronto para GitHub Pages.

**Architecture:** `index.html` vira uma casca mínima; `js/main.js` registra os jogos em `js/core/registry.js`; `js/core/nav.js` roteia por hash e chama `mount/pause/resume` de cada jogo. Cada jogo é um módulo em `js/games/` que exporta o contrato de jogo e carrega o próprio HTML em um template literal. A persistência passa por `js/core/storage.js` com prefixo `arcade:` e migração das chaves antigas.

**Tech Stack:** HTML, CSS e JavaScript puros (ES modules). Sem build e sem dependências no repositório. Ferramentas de verificação (puppeteer-core, prettier via npx) ficam **fora** do repositório, em `~/arcade-tools`.

**Spec:** `docs/superpowers/specs/2026-10-15-arcade-hub-reorganizacao-design.md`

## Global Constraints

- Abordagem A: JavaScript puro com ES modules, sem Vite, TypeScript ou Node no repositório.
- O projeto continua sem dependências e sem etapa de build.
- Todos os 6 jogos continuam funcionando como hoje.
- Todos os caminhos de assets e de imports são relativos (o GitHub Pages serve em `/<repositório>/`).
- Chaves de storage no padrão `arcade:<id>:<chave>`. Chaves antigas nunca são apagadas. Flag `arcade:migrado = 1`.
- Chaves novas: `arcade:tictactoe:placar`, `arcade:game2048:recorde`, `arcade:snake:recorde`, `arcade:termo:stats`, `arcade:tetris:recorde`, `arcade:minesweeper:recordes` (`{facil, medio, dificil}` com o menor tempo em segundos).
- Um jogo não acessa `window` para áudio, confete ou storage, e não conhece outros jogos.
- Sem tema claro, PWA, TypeScript, testes automatizados no repositório, jogos novos ou `og:image` nesta fase.
- Licença MIT em nome de Roberto Lucas Maciel De Mendonça. `.gitignore`: `.claude/`, `.DS_Store`, `node_modules/`, `*.log`.
- `lang="pt-BR"`, foco visível, `aria-current="page"` no item ativo, `prefers-reduced-motion` desliga animações dos cards e o confete.
- Push, criação do repositório remoto e ativação do GitHub Pages são feitos pelo autor, nunca pelo executor.
- Textos do rodapé do drawer: "6 jogos • feito em JS puro". Saem "Jogos Offline" e "100% Offline".

### Refinamentos do contrato (aprovados implicitamente na spec, registrados aqui)

- O parâmetro de `mount` chama-se `raiz` e o segundo argumento é desestruturado: `mount(raiz, { audio, confetti, storage })`. Motivo: vários jogos já usam `ctx` (contexto do canvas) e `container` como nomes locais.
- `recorde(storage)` recebe o storage já com escopo, porque a home chama `recorde` antes do `mount`.
- Campos extras de apresentação: `iconeClasse` (classe CSS do ícone, para manter o visual atual) e `icone` pode conter HTML simples (constante do código, nunca dado do usuário).

## Review Focus

1. `localStorage` bloqueado ou lançando exceção: jogos montam e funcionam, só não persistem (Task 3 e Task 12).
2. Valor corrompido em chave antiga ou nova (JSON inválido, `"abc"` em vez de número): boot não quebra e o card da home não mostra `NaN` (Task 3 e Task 12).
3. Hash desconhecido (`#/xyz`) e deep link direto para um jogo (`#/snake` sem passar pela home): carregam sem erro (Task 6 e Task 12).
4. Sair de Snake e Tetris para outra rota: o jogo para (sem timer ou loop rodando em segundo plano) e retoma ao voltar (Tasks 8 e 9).
5. Viewport de 360 px: nenhuma rota tem rolagem horizontal (Task 12).

---

## File Structure

```
index.html                 casca mínima (Task 6)
css/base.css               tokens, reset, glass, botões, animações, @font-face (Task 5)
css/layout.css             hamburger, drawer, header, home, cards, responsivo geral (Tasks 5 e 6)
css/games/<id>.css         um por jogo: tictactoe, game2048, snake, minesweeper, tetris, termo (Task 5)
fonts/                     outfit-latin.woff2, jetbrains-mono-latin.woff2 (Task 5)
js/main.js                 boot (Task 6)
js/core/storage.js         get/set/escopo/migrar (Task 3)
js/core/audio.js           sintetizador Web Audio (Task 4)
js/core/confetti.js        partículas em canvas (Task 4)
js/core/registry.js        lista de jogos (Task 6)
js/core/nav.js             rotas por hash, drawer, home (Task 6)
js/games/*.js              seis módulos de jogo (Tasks 6 a 11)
js/data/palavras.js        export { secretas, validas } (Task 11)
favicon.svg, README.md, LICENSE, .gitignore, docs/screenshots/.gitkeep
```

Arquivos antigos removidos ao longo do plano: `app.js` (Task 6), `style.css` (Task 6), `game2048.js` (Task 7), `snake.js` (Task 8), `tetris.js` (Task 9), `minesweeper.js` (Task 10), `termo.js` e `palavras.js` (Task 11).

## Convenções deste plano

- `REPO` = `/home/lmaciel0/Área de trabalho/repositorios/flow-games`. Todos os comandos rodam a partir dele, salvo indicação.
- `TOOLS` = `~/arcade-tools` (fora do repositório). Contém `mkgame.sh`, `smoke.mjs`, `storage-test.mjs`, `fonts.py`.
- Commit baseline do estado antigo: `d5c5480`. O `index.html` antigo é lido de lá com `git show d5c5480:index.html`.
- Cada commit termina com a linha `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.

---

### Task 1: Branch, `.gitignore` e licença

**Files:**
- Create: `.gitignore`
- Create: `LICENSE`

**Interfaces:**
- Consumes: nada.
- Produces: branch `refactor/arcade-hub-modular`; todos os commits seguintes vão nela.

- [ ] **Step 1: Criar a branch**

```bash
git switch -c refactor/arcade-hub-modular
```
Expected: `Switched to a new branch 'refactor/arcade-hub-modular'`

- [ ] **Step 2: Criar `.gitignore`**

```
.claude/
.DS_Store
node_modules/
*.log
```

- [ ] **Step 3: Criar `LICENSE`**

```
MIT License

Copyright (c) 2026 Roberto Lucas Maciel De Mendonça

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

- [ ] **Step 4: Commit**

```bash
git add .gitignore LICENSE
git commit -m "chore: adiciona .gitignore e licença MIT

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

### Task 2: Ferramentas de verificação fora do repositório

Nada desta task entra no git. Os scripts vivem em `~/arcade-tools` e são usados pelas tasks seguintes.

**Files:**
- Create: `~/arcade-tools/mkgame.sh`, `~/arcade-tools/check.sh`, `~/arcade-tools/smoke.mjs`

**Interfaces:**
- Consumes: Chrome em `/usr/bin/google-chrome`, Node 22 e npm.
- Produces:
  - `mkgame.sh <id> <js-antigo> <meta.txt> <foot.txt> <saida.js> [linha-inicial]`, com as variáveis opcionais `SEC` (id da `<section>` antiga, se diferente de `<id>`) e `EXTRA` (script `sed` extra). Monta um módulo de jogo a partir do JS antigo e do HTML da seção antiga em `d5c5480:index.html`.
  - `check.sh <arquivo.js>`: valida a sintaxe como módulo e falha se sobrar `window.ArcadeAudio`, `window.triggerConfetti`, `document.getElementById`, `document.querySelector` ou `localStorage`.
  - `smoke.mjs <REPO> <id>... [--bloqueado]`: sobe um servidor estático, abre a home e cada rota no Chrome headless e falha em qualquer erro de console, rota sem montar, rolagem horizontal a 360 px ou falha nos probes de jogo.

- [ ] **Step 1: Instalar o puppeteer-core fora do repositório**

```bash
mkdir -p ~/arcade-tools && cd ~/arcade-tools && npm init -y >/dev/null && npm install puppeteer-core@23.11.1
```
Expected: `added ... packages`, sem erro.

- [ ] **Step 2: Criar `~/arcade-tools/mkgame.sh`**

```bash
#!/usr/bin/env bash
# uso: [SEC=<id-da-secao-antiga>] [EXTRA='<script sed>'] mkgame.sh <id> <js-antigo> <meta.txt> <foot.txt> <saida.js> [linha-inicial]
set -euo pipefail
ID="$1"; OLD="$2"; META="$3"; FOOT="$4"; OUT="$5"; FROM="${6:-}"
SEC="${SEC:-$ID}"
BASE=d5c5480
if [ -z "$FROM" ]; then
  FROM=$(( $(grep -n "'use strict'" "$OLD" | head -1 | cut -d: -f1) + 1 ))
fi
TO=$(( $(wc -l < "$OLD") - 1 ))
[ "$(tail -n 1 "$OLD")" = '})();' ] || { echo "o arquivo antigo não termina em '})();'" >&2; exit 1; }

inner() {
  git show "$BASE:index.html" | awk -v id="view-$SEC" '
    index($0, "<section id=\"" id "\"") { f = 1; next }
    f && /^    <\/section>/ { exit }
    f { print }'
}

{
  while IFS= read -r linha; do
    if [ "$linha" = '/*@@HTML@@*/' ]; then
      echo 'const HTML = `'
      inner
      echo '`;'
    else
      printf '%s\n' "$linha"
    fi
  done < "$META"
  sed -n "${FROM},${TO}p" "$OLD" | sed \
    -e "s/document\.getElementById('view-[a-z0-9]*')/raiz/g" \
    -e "s/document\.getElementById(/byId(/g" \
    -e "s/document\.querySelectorAll(/raiz.querySelectorAll(/g" \
    -e "s/document\.querySelector(/raiz.querySelector(/g" \
    -e "s/if (window\.ArcadeAudio && window\.ArcadeAudio\.isSoundEnabled())/if (audio.isSoundEnabled())/" \
    -e "s/if (window\.ArcadeAudio) window\.ArcadeAudio\./audio./" \
    -e "s/window\.ArcadeAudio\./audio./g" \
    -e "s/if (typeof window\.triggerConfetti === 'function') window\.triggerConfetti();/confetti();/" \
    -e "s/window\.\(SnakeGame\|TetrisGame\) = {/controle = {/" \
    -e "${EXTRA:-}"
  cat "$FOOT"
} > "$OUT"
echo "gerado: $OUT"
```

- [ ] **Step 3: Criar `~/arcade-tools/check.sh`**

```bash
#!/usr/bin/env bash
f="$1"
t=$(mktemp --suffix=.mjs)
cp "$f" "$t"
node --check "$t" && echo "sintaxe ok: $f"
rm -f "$t"
if grep -nE "window\.(ArcadeAudio|triggerConfetti|TERMO|SnakeGame|TetrisGame|Game2048)|document\.(getElementById|querySelector)|localStorage" "$f"; then
  echo "RESTOS ACIMA em $f" >&2
  exit 1
fi
```

- [ ] **Step 4: Tornar executáveis**

```bash
chmod +x ~/arcade-tools/mkgame.sh ~/arcade-tools/check.sh
```

- [ ] **Step 5: Criar `~/arcade-tools/smoke.mjs`**

```js
// uso: node smoke.mjs <REPO> <id>... [--bloqueado]
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';

const args = process.argv.slice(2);
const bloqueado = args.includes('--bloqueado');
const [repo, ...ids] = args.filter((a) => !a.startsWith('--'));

const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript',
  '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png', '.json': 'application/json'
};
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  let file = path.join(repo, decodeURIComponent(url.pathname));
  if (!file.startsWith(repo)) { res.writeHead(403).end(); return; }
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  if (!fs.existsSync(file)) { res.writeHead(404).end(); return; }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, r));
const base = `http://localhost:${server.address().port}`;
const browser = await puppeteer.launch({
  executablePath: '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox']
});
const falhas = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const esperar = (cond, msg) => { if (!cond) falhas.push(msg); };

async function novaPagina(largura = 1000) {
  const page = await browser.newPage();
  await page.setViewport({ width: largura, height: 800 });
  const erros = [];
  page.on('console', (m) => { if (m.type() === 'error') erros.push(m.text()); });
  page.on('pageerror', (e) => erros.push(String(e)));
  page.on('requestfailed', (r) => erros.push('requestfailed ' + r.url()));
  page.on('dialog', (d) => d.accept());
  if (bloqueado) {
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(window, 'localStorage', { get() { throw new Error('bloqueado'); } });
    });
  }
  return { page, erros };
}

const probes = {
  async tictactoe(page) {
    await page.click('#view-tictactoe .cell[data-index="0"]');
    await sleep(900);
    const n = await page.$$eval('#view-tictactoe .cell', (c) => c.filter((x) => x.textContent.trim()).length);
    if (n !== 2) throw new Error(`velha: esperado 2 casas marcadas, veio ${n}`);
  },
  async game2048(page) {
    await sleep(300);
    const n = await page.$$eval('#g2048-tile-container > *', (t) => t.length);
    if (n < 2) throw new Error(`2048: esperado >= 2 peças, veio ${n}`);
    const antes = await page.$eval('#g2048-tile-container', (c) => c.innerHTML);
    for (const k of ['ArrowLeft', 'ArrowUp', 'ArrowRight', 'ArrowDown']) {
      await page.keyboard.press(k);
      await sleep(150);
    }
    const depois = await page.$eval('#g2048-tile-container', (c) => c.innerHTML);
    if (antes === depois) throw new Error('2048: teclado não moveu as peças');
  },
  async snake(page) {
    await sleep(400);
    const txt = await page.$eval('#snake-pause-text', (e) => e.textContent);
    if (txt !== 'Pausar') throw new Error(`snake: esperado 'Pausar' após resume, veio '${txt}'`);
  },
  async tetris(page) {
    await sleep(300);
    await page.keyboard.press('Space');
    await sleep(200);
    const pts = Number(await page.$eval('#tetris-score', (e) => e.textContent));
    if (!(pts > 0)) throw new Error(`tetris: hard drop não pontuou (${pts})`);
  },
  async minesweeper(page) {
    await page.click('#mine-grid .mine-cell');
    await sleep(1300);
    const t = await page.$eval('#mine-timer', (e) => e.textContent);
    if (t === '000') throw new Error('campo minado: timer não iniciou após o primeiro clique');
  },
  async termo(page) {
    await sleep(200);
    await page.keyboard.type('termo');
    const letra = await page.$eval('#termo-tile-0-0', (e) => e.textContent.trim());
    if (letra !== 'T') throw new Error(`termo: esperado 'T' na primeira casa, veio '${letra}'`);
  }
};

// 1) Home e hash desconhecido
{
  const { page, erros } = await novaPagina();
  await page.goto(`${base}/`, { waitUntil: 'networkidle0' });
  await page.waitForSelector('#view-home.active');
  const hrefs = await page.$$eval('.game-card', (a) => a.map((x) => x.getAttribute('href')).sort());
  const esperado = ids.map((i) => `#/${i}`).sort();
  esperar(JSON.stringify(hrefs) === JSON.stringify(esperado), `home: cards ${hrefs} != ${esperado}`);
  await page.evaluate(() => { location.hash = '#/xyz'; });
  await sleep(200);
  esperar(await page.$('#view-home.active'), 'hash desconhecido deveria mostrar a home');
  erros.forEach((e) => falhas.push(`home: ${e}`));
  await page.close();
}

// 2) Deep link em cada rota, probes e pausa ao sair
for (const id of ids) {
  const { page, erros } = await novaPagina();
  try {
    await page.goto(`${base}/#/${id}`, { waitUntil: 'networkidle0' });
    await page.waitForSelector(`#view-${id}.active`, { timeout: 3000 });
    const tam = await page.$eval(`#view-${id}`, (e) => e.innerHTML.length);
    esperar(tam > 100, `${id}: seção vazia (${tam})`);
    if (!bloqueado && probes[id]) await probes[id](page);
    if (['snake', 'tetris'].includes(id)) {
      await page.evaluate(() => { location.hash = '#/'; });
      await sleep(200);
      const fora = await page.$eval(`#${id}-pause-text`, (e) => e.textContent);
      esperar(fora === 'Continuar', `${id}: deveria estar pausado fora da rota (veio '${fora}')`);
      await page.evaluate((i) => { location.hash = `#/${i}`; }, id);
      await sleep(200);
      const dentro = await page.$eval(`#${id}-pause-text`, (e) => e.textContent);
      esperar(dentro === 'Pausar', `${id}: deveria retomar ao voltar (veio '${dentro}')`);
    }
  } catch (e) {
    falhas.push(`${id}: ${e.message}`);
  }
  erros.forEach((e) => falhas.push(`${id}: ${e}`));
  await page.close();
}

// 3) Sem rolagem horizontal a 360 px
for (const rota of ['', ...ids]) {
  const { page } = await novaPagina(360);
  await page.goto(`${base}/#/${rota}`, { waitUntil: 'networkidle0' });
  await sleep(400);
  const [sw, iw] = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
  esperar(sw <= iw, `360px #/${rota}: scrollWidth ${sw} > ${iw}`);
  await page.close();
}

await browser.close();
server.close();
if (falhas.length) {
  console.error('FALHAS:\n- ' + falhas.join('\n- '));
  process.exit(1);
}
console.log(`smoke ok (${ids.length} jogos${bloqueado ? ', storage bloqueado' : ''})`);
```

- [ ] **Step 6: Verificar a sintaxe do smoke**

```bash
cd ~/arcade-tools && node --check smoke.mjs && echo ok
```
Expected: `ok`. (O smoke só roda de verdade a partir da Task 6.)

---

### Task 3: `js/core/storage.js` com migração (TDD)

**Files:**
- Create: `js/core/storage.js`
- Test (fora do repositório): `~/arcade-tools/storage-test.mjs`

**Interfaces:**
- Consumes: `globalThis.localStorage` (pode não existir ou lançar exceção ao acessar).
- Produces (usados por todas as tasks seguintes):
  - `get(chave: string, padrao = null): any`: lê `arcade:<chave>`, devolve `padrao` se ausente, corrompido ou storage bloqueado.
  - `set(chave: string, valor: any): boolean`: grava JSON em `arcade:<chave>`, devolve `false` se falhar.
  - `escopo(id: string): { get(chave, padrao = null), set(chave, valor) }`: prefixa a chave com `<id>:`. É o objeto entregue aos jogos como `storage`.
  - `migrar(): void`: copia as chaves antigas para as novas (uma vez, flag `arcade:migrado`), sem apagar as antigas.

- [ ] **Step 1: Escrever o teste que falha, `~/arcade-tools/storage-test.mjs`**

```js
// uso: node storage-test.mjs <REPO>
import assert from 'node:assert/strict';

const REPO = process.argv[2];

function instalar({ bloquear = false } = {}) {
  const mapa = new Map();
  const ls = {
    getItem: (k) => (mapa.has(k) ? mapa.get(k) : null),
    setItem: (k, v) => { mapa.set(k, String(v)); },
    removeItem: (k) => { mapa.delete(k); }
  };
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    get() {
      if (bloquear) throw new Error('bloqueado');
      return ls;
    }
  });
  return mapa;
}

const { get, set, escopo, migrar } = await import(`${REPO}/js/core/storage.js`);
let falhou = 0;
function teste(nome, fn) {
  try { fn(); console.log('ok   ', nome); } catch (e) { falhou++; console.error('FALHA', nome, '\n', e.message); }
}

teste('get devolve o padrão quando a chave não existe', () => {
  instalar();
  assert.equal(get('x:y', 7), 7);
  assert.equal(get('x:y'), null);
});

teste('set e get fazem ida e volta, com prefixo arcade:', () => {
  const m = instalar();
  assert.equal(set('snake:recorde', 12), true);
  assert.equal(m.get('arcade:snake:recorde'), '12');
  assert.equal(get('snake:recorde', 0), 12);
});

teste('escopo prefixa com o id do jogo', () => {
  const m = instalar();
  const s = escopo('tetris');
  s.set('recorde', 300);
  assert.equal(m.get('arcade:tetris:recorde'), '300');
  assert.equal(s.get('recorde', 0), 300);
  assert.equal(s.get('inexistente', 'p'), 'p');
});

teste('valor corrompido devolve o padrão', () => {
  const m = instalar();
  m.set('arcade:snake:recorde', '{oops');
  assert.equal(get('snake:recorde', 5), 5);
});

teste('storage bloqueado: get devolve padrão, set devolve false, migrar não lança', () => {
  instalar({ bloquear: true });
  assert.equal(get('a:b', 3), 3);
  assert.equal(set('a:b', 1), false);
  assert.doesNotThrow(() => migrar());
});

teste('migrar copia as 4 chaves antigas, mantém as antigas e grava a flag', () => {
  const m = instalar();
  m.set('jogodavelha_scores', '{"x":3,"o":1,"ties":2}');
  m.set('2048_best_score', '1240');
  m.set('snake_best_score', '55');
  m.set('termo_stats', '{"wins":7,"streak":2}');
  migrar();
  assert.deepEqual(get('tictactoe:placar'), { x: 3, o: 1, ties: 2 });
  assert.equal(get('game2048:recorde'), 1240);
  assert.equal(get('snake:recorde'), 55);
  assert.deepEqual(get('termo:stats'), { wins: 7, streak: 2 });
  assert.equal(m.get('2048_best_score'), '1240');
  assert.equal(m.get('jogodavelha_scores'), '{"x":3,"o":1,"ties":2}');
  assert.equal(get('migrado'), 1);
});

teste('migrar não sobrescreve chave nova já existente', () => {
  const m = instalar();
  m.set('snake_best_score', '55');
  set('snake:recorde', 99);
  migrar();
  assert.equal(get('snake:recorde'), 99);
});

teste('migrar ignora chave antiga corrompida e migra as demais', () => {
  const m = instalar();
  m.set('termo_stats', '{oops');
  m.set('snake_best_score', 'abc');
  m.set('2048_best_score', '64');
  assert.doesNotThrow(() => migrar());
  assert.equal(get('termo:stats'), null);
  assert.equal(get('snake:recorde'), null);
  assert.equal(get('game2048:recorde'), 64);
});

teste('migrar roda uma vez só (flag)', () => {
  const m = instalar();
  m.set('snake_best_score', '10');
  migrar();
  m.set('snake_best_score', '999');
  m.removeItem('arcade:snake:recorde');
  migrar();
  assert.equal(get('snake:recorde'), null);
});

if (falhou) { console.error(`${falhou} teste(s) falharam`); process.exit(1); }
console.log('storage: todos os testes passaram');
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
node ~/arcade-tools/storage-test.mjs "$PWD"
```
Expected: FAIL com `ERR_MODULE_NOT_FOUND` (o arquivo `js/core/storage.js` ainda não existe).

- [ ] **Step 3: Implementar `js/core/storage.js`**

```js
/**
 * Persistência unificada — chaves `arcade:<jogo>:<chave>` em localStorage.
 * Nunca lança: se o storage estiver bloqueado, os jogos só não persistem.
 */

const PREFIXO = 'arcade:';

function armazenamento() {
  try {
    return globalThis.localStorage || null;
  } catch {
    return null;
  }
}

export function get(chave, padrao = null) {
  const ls = armazenamento();
  if (!ls) return padrao;
  try {
    const bruto = ls.getItem(PREFIXO + chave);
    return bruto === null ? padrao : JSON.parse(bruto);
  } catch {
    return padrao;
  }
}

export function set(chave, valor) {
  const ls = armazenamento();
  if (!ls) return false;
  try {
    ls.setItem(PREFIXO + chave, JSON.stringify(valor));
    return true;
  } catch {
    return false;
  }
}

export function escopo(id) {
  return {
    get: (chave, padrao = null) => get(`${id}:${chave}`, padrao),
    set: (chave, valor) => set(`${id}:${chave}`, valor)
  };
}

function inteiro(bruto) {
  const n = parseInt(bruto, 10);
  return Number.isFinite(n) ? n : undefined;
}

// Cada conversor devolve undefined para pular valores inválidos.
const MIGRACOES = [
  {
    antiga: 'jogodavelha_scores',
    nova: 'tictactoe:placar',
    converter: (bruto) => {
      const o = JSON.parse(bruto);
      return { x: Number(o.x) || 0, o: Number(o.o) || 0, ties: Number(o.ties) || 0 };
    }
  },
  { antiga: '2048_best_score', nova: 'game2048:recorde', converter: inteiro },
  { antiga: 'snake_best_score', nova: 'snake:recorde', converter: inteiro },
  { antiga: 'termo_stats', nova: 'termo:stats', converter: (bruto) => JSON.parse(bruto) }
];

/** Copia as chaves antigas para as novas, uma vez. Não apaga as antigas. */
export function migrar() {
  const ls = armazenamento();
  if (!ls || get('migrado') === 1) return;
  for (const { antiga, nova, converter } of MIGRACOES) {
    try {
      const bruto = ls.getItem(antiga);
      if (bruto === null || ls.getItem(PREFIXO + nova) !== null) continue;
      const valor = converter(bruto);
      if (valor !== undefined) set(nova, valor);
    } catch {
      // valor antigo corrompido: ignora e segue
    }
  }
  set('migrado', 1);
}
```

- [ ] **Step 4: Rodar e ver passar**

```bash
node ~/arcade-tools/storage-test.mjs "$PWD"
```
Expected: 9 linhas `ok` e `storage: todos os testes passaram`.

- [ ] **Step 5: Commit**

```bash
git add js/core/storage.js
git commit -m "feat(core): storage unificado com prefixo arcade: e migração das chaves antigas

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: `js/core/audio.js` e `js/core/confetti.js`

Extrai o sintetizador de áudio e o confete do `app.js` para módulos sem `window`. O comportamento é o mesmo; a diferença é que o confete respeita `prefers-reduced-motion` e os ícones de som são atualizados por `atualizarIcones()`.

**Files:**
- Create: `js/core/audio.js`
- Create: `js/core/confetti.js`

**Interfaces:**
- Consumes: Web Audio API e o elemento `#confetti-canvas` (criado na Task 6).
- Produces:
  - `audio.js`: `playTone(freq, type = 'sine', duration = 0.1, gainValue = 0.15)`, `playSound(nome)` com os nomes `move-x | move-o | win | defeat | tie | click`, `isSoundEnabled(): boolean`, `toggleSound(): boolean`, `atualizarIcones()`. Importado como namespace (`import * as audio`) e entregue aos jogos como `audio`.
  - `confetti.js`: `initConfetti()` (chamar uma vez no boot) e `triggerConfetti()`. Entregue aos jogos como `confetti` (a própria função).

- [ ] **Step 1: Criar `js/core/audio.js`**

```js
/**
 * Sintetizador Web Audio — efeitos gerados por osciladores, sem arquivos de áudio.
 */

let audioCtx = null;
let somAtivo = true;

function iniciar() {
  if (!audioCtx) {
    const Contexto = window.AudioContext || window.webkitAudioContext;
    if (Contexto) audioCtx = new Contexto();
  }
  if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
}

export function playTone(freq, type = 'sine', duration = 0.1, gainValue = 0.15) {
  if (!somAtivo) return;
  try {
    iniciar();
    if (!audioCtx) return;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, audioCtx.currentTime);

    gain.gain.setValueAtTime(gainValue, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + duration);

    osc.connect(gain);
    gain.connect(audioCtx.destination);

    osc.start();
    osc.stop(audioCtx.currentTime + duration);
  } catch {
    // áudio indisponível: o jogo segue sem som
  }
}

export function playSound(nome) {
  if (!somAtivo) return;
  iniciar();

  if (nome === 'move-x') {
    playTone(520, 'sine', 0.12, 0.2);
  } else if (nome === 'move-o') {
    playTone(330, 'triangle', 0.15, 0.25);
  } else if (nome === 'win') {
    [440, 554.37, 659.25, 880].forEach((freq, idx) => {
      setTimeout(() => playTone(freq, 'triangle', 0.25, 0.25), idx * 90);
    });
  } else if (nome === 'defeat') {
    [400, 360, 320, 260].forEach((freq, idx) => {
      setTimeout(() => playTone(freq, 'sawtooth', 0.2, 0.15), idx * 110);
    });
  } else if (nome === 'tie') {
    playTone(300, 'sine', 0.25, 0.2);
    setTimeout(() => playTone(300, 'sine', 0.25, 0.2), 160);
  } else if (nome === 'click') {
    playTone(600, 'sine', 0.04, 0.08);
  }
}

export function isSoundEnabled() {
  return somAtivo;
}

/** Atualiza todos os ícones de som presentes no DOM (jogo da velha e drawer). */
export function atualizarIcones() {
  const icone = somAtivo ? '🔊' : '🔇';
  document.querySelectorAll('.sound-icon-global, .sound-icon-drawer').forEach((el) => {
    el.textContent = icone;
  });
}

export function toggleSound() {
  somAtivo = !somAtivo;
  atualizarIcones();
  if (somAtivo) playSound('click');
  return somAtivo;
}
```

- [ ] **Step 2: Criar `js/core/confetti.js`**

```js
/**
 * Confete em canvas (partículas nativas). Respeita prefers-reduced-motion.
 */

const CORES = ['#00f2fe', '#4facfe', '#ff0844', '#ffb199', '#f6d365', '#ffffff', '#10b981', '#a855f7'];

let canvas = null;
let ctx = null;
let particulas = [];
let animId = null;

function ajustar() {
  if (!canvas) return;
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}

export function initConfetti() {
  canvas = document.getElementById('confetti-canvas');
  if (!canvas) return;
  ctx = canvas.getContext('2d');
  ajustar();
  window.addEventListener('resize', ajustar);
}

export function triggerConfetti() {
  if (!ctx) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  cancelAnimationFrame(animId);
  particulas = [];

  for (let i = 0; i < 90; i++) {
    particulas.push({
      x: window.innerWidth / 2,
      y: window.innerHeight / 2 - 50,
      vx: (Math.random() - 0.5) * 16,
      vy: (Math.random() - 0.8) * 15,
      size: Math.random() * 8 + 4,
      color: CORES[Math.floor(Math.random() * CORES.length)],
      rotation: Math.random() * 360,
      rotationSpeed: (Math.random() - 0.5) * 12,
      opacity: 1
    });
  }

  function desenhar() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    let vivas = 0;

    particulas.forEach((p) => {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.35;
      p.rotation += p.rotationSpeed;
      p.opacity -= 0.009;

      if (p.opacity > 0) {
        vivas++;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate((p.rotation * Math.PI) / 180);
        ctx.fillStyle = p.color;
        ctx.globalAlpha = Math.max(0, p.opacity);
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
        ctx.restore();
      }
    });

    if (vivas > 0) {
      animId = requestAnimationFrame(desenhar);
    } else {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  }

  desenhar();
}
```

- [ ] **Step 3: Verificar a sintaxe dos dois módulos**

```bash
for f in js/core/audio.js js/core/confetti.js; do t=$(mktemp --suffix=.mjs); cp "$f" "$t"; node --check "$t" && echo "ok $f"; rm -f "$t"; done
```
Expected: `ok js/core/audio.js` e `ok js/core/confetti.js`. O comportamento no navegador é verificado pelo smoke da Task 6.

- [ ] **Step 4: Commit**

```bash
git add js/core/audio.js js/core/confetti.js
git commit -m "feat(core): extrai áudio e confete do app.js para módulos

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: CSS dividido e fontes locais

Divide `style.css` (1588 linhas) por seção, sem mudar nenhum seletor, e troca o Google Fonts por arquivos locais. O `style.css` antigo continua no disco até a Task 6, então o site antigo segue funcionando.

**Files:**
- Create: `css/base.css`, `css/layout.css`
- Create: `css/games/tictactoe.css`, `css/games/game2048.css`, `css/games/snake.css`, `css/games/minesweeper.css`, `css/games/tetris.css`, `css/games/termo.css`
- Create: `fonts/outfit-latin.woff2`, `fonts/jetbrains-mono-latin.woff2`
- Create (fora do repo): `~/arcade-tools/fonts.py`

**Interfaces:**
- Consumes: `style.css` (seções iniciam nas linhas 1, 59, 120, 175, 445, 474, 487, 591, 707, 784, 837, 983, 1050, 1199, 1290, 1456, 1514, 1537).
- Produces: nomes de arquivo CSS que o `index.html` da Task 6 referencia; fontes `'Outfit'` e `'JetBrains Mono'` declaradas via `@font-face` em `css/base.css`.

- [ ] **Step 1: Criar `~/arcade-tools/fonts.py`**

```python
# uso: python3 -I fonts.py <pasta-destino>   (imprime os @font-face no stdout)
import pathlib
import re
import sys
import urllib.request

UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
URL = 'https://fonts.googleapis.com/css2?family=Outfit:wght@100..900&family=JetBrains+Mono:wght@100..800&display=swap'

destino = pathlib.Path(sys.argv[1])
css = urllib.request.urlopen(urllib.request.Request(URL, headers={'User-Agent': UA})).read().decode()
blocos = re.findall(r'/\* (\S+) \*/\s*(@font-face \{.*?\})', css, re.S)

saida = []
for subset, bloco in blocos:
    if subset != 'latin':
        continue
    familia = re.search(r"font-family: '([^']+)'", bloco).group(1)
    url = re.search(r'url\((https://fonts\.gstatic\.com/[^)]+\.woff2)\)', bloco).group(1)
    arquivo = familia.lower().replace(' ', '-') + '-latin.woff2'
    (destino / arquivo).write_bytes(urllib.request.urlopen(url).read())
    faixa = re.search(r'font-weight: ([^;]+);', bloco).group(1)
    intervalo = re.search(r'unicode-range: ([^;]+);', bloco).group(1)
    saida.append(
        f"@font-face {{\n  font-family: '{familia}';\n  font-style: normal;\n"
        f"  font-weight: {faixa};\n  font-display: swap;\n"
        f"  src: url('../fonts/{arquivo}') format('woff2');\n  unicode-range: {intervalo};\n}}\n"
    )
print('\n'.join(saida))
```

- [ ] **Step 2: Baixar as fontes**

```bash
mkdir -p fonts && python3 -I ~/arcade-tools/fonts.py fonts > ~/arcade-tools/fontface.css && ls -l fonts && cat ~/arcade-tools/fontface.css
```
Expected: `fonts/outfit-latin.woff2` e `fonts/jetbrains-mono-latin.woff2` (dezenas de KB cada) e dois blocos `@font-face` com `font-weight: 100 900` (Outfit) e `100 800` (JetBrains Mono).
Se o Google Fonts não responder: em uma pasta temporária, `npm pack @fontsource-variable/outfit@5.1.0 @fontsource-variable/jetbrains-mono@5.1.0`, extrair e copiar `outfit-latin-wght-normal.woff2` e `jetbrains-mono-latin-wght-normal.woff2` para `fonts/` com os nomes acima, escrevendo os `@font-face` à mão com os mesmos campos.

- [ ] **Step 3: Dividir o `style.css` por faixas de linhas**

```bash
mkdir -p css/games
sed -n '1,119p;474,486p;1456,1536p' style.css > css/base.css
sed -n '120,473p;487,590p;1537,1588p' style.css > css/layout.css
sed -n '591,836p'   style.css > css/games/tictactoe.css
sed -n '837,982p'   style.css > css/games/game2048.css
sed -n '983,1049p'  style.css > css/games/snake.css
sed -n '1050,1198p' style.css > css/games/minesweeper.css
sed -n '1199,1289p' style.css > css/games/tetris.css
sed -n '1290,1455p' style.css > css/games/termo.css
```

- [ ] **Step 4: Verificar que nenhuma linha se perdeu nem foi duplicada**

```bash
cat css/base.css css/layout.css css/games/*.css | wc -l
cat css/base.css css/layout.css css/games/*.css | sort | diff - <(sort style.css) && echo equivalente
```
Expected: `1588` e `equivalente`.

- [ ] **Step 5: Prefixar `base.css` com os `@font-face`**

```bash
{ cat ~/arcade-tools/fontface.css; cat css/base.css; } > css/base.tmp && mv css/base.tmp css/base.css
head -n 12 css/base.css
```
Expected: o começo do arquivo mostra `@font-face { font-family: 'Outfit'; ...`.

- [ ] **Step 6: Mover as regras responsivas de cada jogo para o CSS do próprio jogo**

O bloco `@media (max-width: 480px)` está nas últimas 52 linhas de `css/layout.css`. Reduz o de `layout.css` ao que é geral e distribui o resto:

```bash
head -n -52 css/layout.css > css/layout.tmp
cat >> css/layout.tmp <<'EOF'
/* ==========================================================================
   Responsive Adaptations
   ========================================================================== */
@media (max-width: 480px) {
  body {
    padding: 3.5rem 0.65rem 1rem 0.65rem;
  }

  .hamburger-btn {
    top: 0.75rem;
    left: 0.75rem;
    width: 42px;
    height: 42px;
  }

  .app-title { font-size: 1.75rem; }
}
EOF
mv css/layout.tmp css/layout.css

cat >> css/games/tictactoe.css <<'EOF'

@media (max-width: 480px) {
  .board {
    gap: 8px;
    padding: 10px;
  }

  .cell { font-size: 2.85rem; border-radius: var(--radius-sm); }
}
EOF
cat >> css/games/game2048.css <<'EOF'

@media (max-width: 480px) {
  .g2048-container {
    gap: 8px;
    padding: 10px;
  }
}
EOF
cat >> css/games/minesweeper.css <<'EOF'

@media (max-width: 480px) {
  .mine-cell {
    width: 32px;
    height: 32px;
    font-size: 0.95rem;
  }
}
EOF
cat >> css/games/tetris.css <<'EOF'

@media (max-width: 480px) {
  .tetris-main-layout {
    gap: 0.5rem;
  }

  #tetris-canvas {
    width: 180px;
    height: 360px;
  }

  .tetris-sidebar {
    width: 90px;
  }
}
EOF
cat >> css/games/termo.css <<'EOF'

@media (max-width: 480px) {
  .key-btn {
    height: 42px;
    font-size: 0.85rem;
  }

  .termo-tile {
    font-size: 1.5rem;
  }
}
EOF
```

- [ ] **Step 7: Conferir que o responsivo antigo foi todo redistribuído**

```bash
grep -c "max-width: 480px" css/layout.css css/games/*.css
tail -n 20 css/layout.css
```
Expected: `layout.css:1` e um por jogo (`snake.css:0`); o `tail` mostra apenas `body`, `.hamburger-btn` e `.app-title` dentro do `@media`.

- [ ] **Step 8: Commit**

```bash
git add css fonts
git commit -m "refactor(css): divide style.css por seção e usa fontes locais

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

