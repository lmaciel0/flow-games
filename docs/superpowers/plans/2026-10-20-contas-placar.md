# Contas e placar compartilhado — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Contas por nome de usuário e senha (Supabase), progresso entre aparelhos e placar público do Termo (vitórias) e do 2048 (maior pontuação), com o jogo continuando livre sem login.

**Architecture:** Um serviço `conta` (`js/core/conta/`) fala com o Supabase e é entregue aos jogos por `ctx.conta` (mesmo molde de `audio`/`storage`). O servidor é a fonte da verdade do progresso logado e faz o merge no login (RPC); o `localStorage` segue como cache e como único armazenamento de quem está anônimo. A UI de conta vive num slot do menu lateral; o placar é uma rota registrada (`#/placar`) mais um painel lateral reutilizável no Termo e no 2048.

**Tech Stack:** HTML + ES modules sem build, `supabase-js` copiado para `js/vendor/`, Supabase (Auth, Postgres com RLS e RPC, Storage), testes `node --test` e Puppeteer em `~/arcade-tools`.

**Spec:** `docs/superpowers/specs/2026-10-20-contas-placar-design.md`

## Global Constraints

- Projeto Supabase `flow-games`, ref `jylkqxmfbjrtnuwqcmry`, URL `https://jylkqxmfbjrtnuwqcmry.supabase.co`, região `sa-east-1`. Nunca tocar no projeto `readmecraft`.
- Só a chave *publishable* vai para o código; chave de serviço jamais entra no repositório.
- Sem build, sem bundler; ES modules; texto da interface em português (pt-BR).
- Login opcional: sem conta, tudo se comporta como hoje; Supabase fora do ar nunca quebra jogo, menu ou rota.
- Nome de usuário: 3–16 caracteres, `[A-Za-z0-9_]`, único sem diferenciar maiúsculas. Senha: mínimo 6 caracteres.
- Foto de avatar: redimensionada no navegador para 128×128, ~200 KB no máximo, só imagem; bucket público `avatars`, caminho `<user_id>/avatar`.
- Nenhuma escrita direta nas tabelas: só RPC `security definer` com `auth.uid()`. Leitura pública de `profiles` e `placar`. Pontuação do 2048 acima de 4.000.000 é rejeitada.
- Os ids de jogo nas tabelas são os do registro: `termo` e `game2048`.
- Convenções do repo: branch `feat/contas-placar` (já criada), PR com merge commit, sem auto-merge, deploy manual `vercel deploy --prod --yes`, `git add` sempre por caminho, testes fora do repo em `~/arcade-tools`, mensagens de commit em português com `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- Subagentes escrevem arquivos em partes de menos de 150 linhas por chamada.

## Review Focus

- Nome de usuário com maiúsculas, espaço, acento ou fora de 3–16 caracteres: erro claro em pt-BR, nada é enviado ao servidor (Task 4).
- Senha errada ou usuário inexistente: mesma mensagem genérica para os dois, sem revelar qual falhou (Task 4).
- Duplo clique em "Criar conta"/"Entrar": só uma requisição sai (Task 6).
- Foto que não é imagem ou é enorme: recusada com mensagem; a conta e o avatar anterior ficam intactos (Task 6).
- Sair da conta e logar em outra no mesmo aparelho: o progresso de A nunca aparece na conta de B (Task 4).
- Servidor indisponível no login ou no meio da partida: o jogo segue, nenhuma exceção sobe, o progresso local não se perde (Task 4).
- Nome de usuário exibido no placar nunca é interpretado como HTML (Task 7).

## Estrutura de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `supabase/schema.sql` (novo) | Registro versionado do SQL aplicado via MCP: tabelas, RLS, RPC, bucket |
| `js/vendor/supabase.js` (novo) | `supabase-js` ESM copiado (versão fixa) |
| `js/core/conta/config.js` (novo) | URL do projeto e chave publishable |
| `js/core/conta/validar.js` (novo) | Validação pura de usuário/senha, e-mail sintético |
| `js/core/conta/avatar.js` (novo) | `ICONES`, codificação do avatar, redimensionar foto |
| `js/core/conta/cliente.js` (novo) | Único arquivo que importa `supabase-js`; wrappers finos |
| `js/core/conta/index.js` (novo) | Serviço `conta`: estado, eventos, sync, registrar |
| `js/core/conta-ui.js` (novo) | Slot do menu, modal Entrar/Criar conta, seletor de avatar |
| `js/core/placar-painel.js` (novo) | Painel de placar reutilizável (top 5 / top 50) |
| `js/games/placar.js` (novo) | Página `#/placar`, registrada como os jogos |
| `css/conta.css`, `css/placar.css` (novos) | Estilos |
| `index.html`, `js/main.js`, `js/core/nav.js`, `js/games/termo.js`, `js/games/game2048.js` | Integração |

## Contrato do serviço `conta` (usado pelas Tasks 4–8)

```js
conta.estado()                       // { pronto: boolean, logado: boolean, usuario: { id, username, avatar } | null }
conta.assinar(fn)                    // fn({ tipo: 'sessao' | 'progresso' }); devolve função de cancelar
conta.criarConta(usuario, senha, avatar)  // avatar = { icone: string } | { arquivo: File }; Promise<{ ok: true } | { ok: false, erro: string }>; o serviço redimensiona a foto (a UI só usa redimensionarFoto para pré-visualizar)
conta.entrar(usuario, senha)         // idem
conta.sair()                         // Promise<void>; apaga progresso local de termo e game2048
conta.trocarAvatar(avatar)           // avatar = { icone: string } | { arquivo: File }; Promise<{ ok, erro? }>
conta.registrar(jogo, evento)        // evento = { tipo:'vitoria' } | { tipo:'derrota' } | { tipo:'pontos', valor:number }; nunca lança
conta.lerPlacar(jogo, limite = 50)   // Promise<null | { linhas: Linha[], eu: Linha | null }>
// Linha = { posicao:number, userId:string, username:string, avatar:string, valor:number, eu:boolean }; `eu` fica fora do `limite` quando a pessoa logada está abaixo do corte (posição real preservada)
conta.avatarVisual(avatar, userId)   // { emoji: string } | { url: string }
conta.emitir(evento)                 // dispara os assinantes; usado pelo serviço e por testes
```

Evento `'progresso'` dispara depois que o login/logout reescreveu `arcade:termo:stats` e `arcade:game2048:recorde`; os jogos recarregam a memória a partir do storage.

Dependências entre tarefas: 1 e 2 são independentes; 3 e 4 dependem de 2 (4 também do contrato de RPC da Task 1); 5, 6 e 7 dependem só do contrato acima e podem rodar em paralelo com mock; 8 fecha tudo.

---

### Task 1: Backend Supabase (schema, RLS, RPC, bucket)

**Files:**
- Create: `supabase/schema.sql` (registro do que foi aplicado)
- Aplicar via MCP `mcp__plugin_supabase_supabase__apply_migration` no projeto `jylkqxmfbjrtnuwqcmry`
- Test: `~/arcade-tools/conta/backend.mjs` (script de verificação por SQL, não é `node --test`)

**Interfaces:**
- Produces (contrato que as Tasks 3 e 4 consomem):
  - Tabela `profiles(user_id uuid pk → auth.users on delete cascade, username text not null, avatar text not null default 'icone:🦊', created_at timestamptz default now())` com índice único em `lower(username)` e check `username ~ '^[A-Za-z0-9_]{3,16}$'`.
  - Tabela `placar(user_id uuid → auth.users on delete cascade, jogo text check (jogo in ('termo','game2048')), valor int not null default 0, extra jsonb not null default '{}', updated_at timestamptz default now(), primary key (user_id, jogo))`.
  - RPC `criar_perfil(p_username text, p_avatar text) returns void`: cria a linha em `profiles` da conta recém-criada (`auth.uid()`); falha se o usuário já existir.
  - RPC `trocar_avatar(p_avatar text) returns void`.
  - RPC `sincronizar_progresso(p_termo_wins int, p_termo_streak int, p_2048 int) returns jsonb`: faz o merge e devolve `{ "termo": { "wins": n, "streak": n }, "game2048": n }`. Regra: `game2048 = greatest(servidor, p_2048)`; Termo fica com o lado de mais vitórias (empate: maior streak), wins e streak sempre do mesmo lado.
  - RPC `registrar_vitoria_termo() returns void` (+1 vitória, +1 streak), `registrar_derrota_termo() returns void` (streak = 0), `registrar_pontos_2048(p_pontos int) returns void` (guarda o maior; ignora ≤ 0; erro se > 4000000).
  - Bucket público `avatars`: leitura pública; cada pessoa só grava/atualiza em `<auth.uid()>/avatar`; limite 204800 bytes; mime `image/jpeg`, `image/png`, `image/webp`.
  - RPC `ler_placar(p_jogo text, p_limite int) returns table(posicao int, user_id uuid, username text, avatar text, valor int)` com `valor > 0`, ordenado por `valor desc, updated_at asc`; RLS ligado em ambas as tabelas, `anon` e `authenticated` só leem.
  - RPC `minha_posicao(p_jogo text) returns table(posicao int, user_id uuid, username text, avatar text, valor int)`: a linha da pessoa logada com a posição real no mesmo critério de ordenação (vazio se `valor` = 0).

- [ ] **Step 1: Escrever `~/arcade-tools/conta/backend.mjs`** que, usando `fetch` na REST do projeto com a chave publishable, afirma: (a) `insert` direto em `placar` é recusado para `anon`; (b) `rpc/ler_placar` com `p_jogo='termo'` responde 200 e lista ordenada.
- [ ] **Step 2: Rodar e ver falhar** — `node ~/arcade-tools/conta/backend.mjs` → falha (tabelas/RPC inexistentes).
- [ ] **Step 3: Escrever `supabase/schema.sql` e aplicar com `apply_migration`** (nome `contas_placar_inicial`). Todas as funções com `security definer`, `set search_path = public`, usando `auth.uid()` (erro se nulo). Revogar `execute` de `public`/`anon` nas RPC de escrita; conceder a `authenticated`. `ler_placar` concedida a `anon`.
- [ ] **Step 4: Verificar a regra de merge** com `execute_sql` dentro de um bloco `do $$ … raise exception … $$` que simula `request.jwt.claims` de um usuário de teste e afirma: `sincronizar_progresso(5,2,100)` sobre servidor `(3,1,200)` devolve `{termo:{wins:5,streak:2}, game2048:200}`; empate em wins com streaks 1 e 3 devolve streak 3; `registrar_pontos_2048(4000001)` levanta erro. Apagar qualquer usuário de teste criado.
- [ ] **Step 5: Rodar os advisors** — `get_advisors` (security e performance); corrigir tudo que for crítico (RLS ausente, função sem `search_path`).
- [ ] **Step 6: Rodar `backend.mjs` de novo**; esperado: todas as afirmações passam.
- [ ] **Step 7: Verificar a confirmação de e-mail** — criar, via REST `auth/v1/signup`, um usuário `zz_teste_confirmacao` com e-mail sintético; se a resposta não trouxer `access_token`, parar e pedir ao dono que desligue "Confirm email" (Authentication → Providers → Email); depois remover o usuário por SQL. Registrar o domínio de e-mail escolhido (que o Supabase aceitou) em `js/core/conta/config.js` na Task 2.
- [ ] **Step 8: Commit**

```bash
git add supabase/schema.sql
git commit -m "feat(conta): schema Supabase com RLS, RPCs de placar e bucket de avatares"
```

### Task 2: Config, vendor e módulos puros (`validar`, `avatar`)

**Files:**
- Create: `js/vendor/supabase.js`, `js/core/conta/config.js`, `js/core/conta/validar.js`, `js/core/conta/avatar.js`
- Test: `~/arcade-tools/conta/validar.test.mjs`, `~/arcade-tools/conta/avatar.test.mjs`

**Interfaces:**
- Produces:
  - `config.js`: `export const SUPABASE_URL: string`, `SUPABASE_CHAVE: string` (publishable, obtida com `get_publishable_keys`), `DOMINIO_EMAIL: string` (o aceito na Task 1).
  - `validar.js`: `validarUsuario(texto: string): string | null` (devolve mensagem de erro em pt-BR ou `null`), `validarSenha(texto: string): string | null`, `emailSintetico(usuario: string): string` (minúsculas + `@` + `DOMINIO_EMAIL`).
  - `avatar.js`: `ICONES: string[]` (8 emojis, `🦊` primeiro), `codificarIcone(emoji: string): string` → `'icone:🦊'`, `codificarFoto(versao: number = Date.now()): string` → `'foto:<versao>'`, `decodificarAvatar(valor: string): { tipo: 'icone', emoji: string } | { tipo: 'foto', versao: number }` (valor desconhecido cai em `ICONES[0]`), `redimensionarFoto(arquivo: File): Promise<Blob>` (canvas 128×128, `image/webp` com fallback `image/jpeg`, rejeita se `arquivo.type` não começa com `image/` ou `arquivo.size > 5_000_000`, e rejeita se o resultado passar de 204800 bytes).

- [ ] **Step 1: Escrever os testes** — `validar.test.mjs`: `validarUsuario('ab')` e `validarUsuario('a'.repeat(17))` devolvem string; `validarUsuario('João')`, `validarUsuario('a b')` devolvem string; `validarUsuario('Lucas_1')` devolve `null`; `validarSenha('12345')` devolve string, `validarSenha('123456')` devolve `null`; `emailSintetico('Lucas_1')` começa com `lucas_1@`. `avatar.test.mjs`: `decodificarAvatar('icone:🐼')` → `{tipo:'icone', emoji:'🐼'}`; `decodificarAvatar('lixo')` → ícone `ICONES[0]`; `ICONES.length === 8`.
- [ ] **Step 2: Rodar e ver falhar** — `cd ~/arcade-tools && node --test conta/validar.test.mjs conta/avatar.test.mjs` → FAIL (módulos inexistentes).
- [ ] **Step 3: Implementar `validar.js` e `avatar.js`** conforme as assinaturas (regex de usuário `^[A-Za-z0-9_]{3,16}$`).
- [ ] **Step 4: Copiar `supabase-js`** — baixar o bundle ESM `@supabase/supabase-js` numa versão estável com mais de duas semanas (ex.: via `https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm`) para `js/vendor/supabase.js`, anotando versão e licença no cabeçalho do arquivo (como o `three-LICENSE`). Escrever `config.js`.
- [ ] **Step 5: Rodar os testes** → PASS.
- [ ] **Step 6: Commit**

```bash
git add js/vendor/supabase.js js/core/conta/config.js js/core/conta/validar.js js/core/conta/avatar.js
git commit -m "feat(conta): config, supabase-js vendorizado e validações puras"
```

---

### Task 3: Cliente Supabase (`cliente.js`)

**Files:**
- Create: `js/core/conta/cliente.js`
- Test: `~/arcade-tools/conta/cliente.test.mjs`

**Interfaces:**
- Consumes: `config.js`, `validar.emailSintetico`, `avatar.js`, as RPCs da Task 1.
- Produces (único arquivo que importa `js/vendor/supabase.js`; todas as funções devolvem `{ ok: true, dados? } | { ok: false, erro: string }` e **nunca lançam**; mensagens de erro em pt-BR, sem vazar texto cru do servidor):
  - `criarCliente(fabrica = createClient): Cliente` — a fábrica é injetável para teste.
  - `Cliente.cadastrar(usuario, senha, avatar)`: `signUp` com e-mail sintético, depois `criar_perfil`. Usuário já existente → erro "Esse nome de usuário já existe".
  - `Cliente.entrar(usuario, senha)`: `signInWithPassword`; qualquer falha de credencial → o mesmo erro "Usuário ou senha incorretos".
  - `Cliente.sair()`, `Cliente.sessaoAtual()` (→ `{ id } | null`), `Cliente.aoMudarSessao(fn)`.
  - `Cliente.perfil(id)` → `{ username, avatar }`; `Cliente.enviarFoto(id, blob)` → grava `<id>/avatar` com `upsert`; `Cliente.urlFoto(id, versao)` → URL pública com `?v=<versao>` para furar cache; `Cliente.minhaPosicao(jogo)` → `dados` com a linha de `minha_posicao` ou `null`; `Cliente.trocarAvatar(codigo)`.
  - `Cliente.sincronizar({ termo: {wins, streak}, game2048 })` → `dados` com o JSON da RPC; `Cliente.registrar(jogo, evento)`; `Cliente.lerPlacar(jogo, limite)` → `dados.linhas`.

- [ ] **Step 1: Escrever `cliente.test.mjs`** com uma fábrica falsa de `supabase-js` (objeto com `auth`, `rpc`, `storage`, `from` gravando chamadas). Testes: `entrar` com erro `Invalid login credentials` devolve `{ok:false, erro:'Usuário ou senha incorretos'}`; `entrar` com a fábrica lançando exceção de rede devolve `{ok:false}` sem lançar; `cadastrar('Lucas_1','segredo',…)` chama `signUp` com e-mail em minúsculas e depois `rpc('criar_perfil', {p_username:'Lucas_1', p_avatar:'icone:🦊'})`; `sincronizar` chama `rpc('sincronizar_progresso', {p_termo_wins, p_termo_streak, p_2048})`.
- [ ] **Step 2: Rodar e ver falhar** — `node --test conta/cliente.test.mjs` → FAIL.
- [ ] **Step 3: Implementar `criarCliente`** com as assinaturas acima; envolver cada chamada em `try/catch` e traduzir erros conhecidos do Supabase; exportar também `export const cliente = criarCliente()` criado de forma preguiçosa (não importa `supabase-js` até ser usado, para o site carregar mesmo se o CDN/arquivo falhar).
- [ ] **Step 4: Rodar os testes** → PASS.
- [ ] **Step 5: Commit**

```bash
git add js/core/conta/cliente.js
git commit -m "feat(conta): cliente Supabase com erros traduzidos e sem exceções"
```

---

### Task 4: Serviço `conta` (estado, sync, registrar, sair)

**Files:**
- Create: `js/core/conta/index.js`
- Test: `~/arcade-tools/conta/conta.test.mjs`

**Interfaces:**
- Consumes: `cliente.js` (Task 3), `validar.js`, `avatar.js` (Task 2), `get`/`set` de `js/core/storage.js` (chaves globais `termo:stats` = `{wins, streak}` e `game2048:recorde` = número).
- Produces: o contrato do serviço descrito na seção "Contrato do serviço `conta`" deste plano, via `export function criarConta({ cliente, storage }): Conta` (injeção para teste) e `export const conta = criarConta({ cliente, storage })` (instância real, usada em `main.js`).
- Regras:
  - `lerPlacar(jogo, limite)` chama `cliente.lerPlacar`; se há login e a pessoa não está nas linhas, chama `cliente.minhaPosicao` e devolve esse registro em `eu`; marca `eu: true` na linha própria; cada Linha leva `userId`. `avatarVisual(avatar, userId)` usa `decodificarAvatar` e, para foto, `cliente.urlFoto(userId, versao)`. `criarConta`/`trocarAvatar` com `{ arquivo }` chamam `redimensionarFoto`, depois `cliente.enviarFoto` e gravam o avatar com `codificarFoto()`.
  - `criarConta`/`entrar` validam com `validarUsuario`/`validarSenha` **antes** de qualquer chamada ao cliente.
  - Após sessão válida: ler o local, chamar `cliente.sincronizar`, gravar o resultado em `termo:stats` e `game2048:recorde`, atualizar `estado()`, emitir `'sessao'` e depois `'progresso'`. Se `sincronizar` falhar, manter o local intacto, ficar logado e emitir só `'sessao'`.
  - `sair()`: `cliente.sair()`, gravar `{wins:0, streak:0}` e `0` nas duas chaves, limpar o estado, emitir `'sessao'` e `'progresso'`. Se `cliente.sair()` falhar, o local ainda é apagado.
  - `registrar` é no-op sem login; com login chama `cliente.registrar` sem esperar e engole falhas.
  - Ao iniciar, restaurar a sessão existente (`cliente.sessaoAtual()`) e sincronizar; `estado().pronto` vira `true` ao terminar (com ou sem sessão).

- [ ] **Step 1: Escrever `conta.test.mjs`** com `cliente` falso e `storage` em memória. Testes (nomes exatos): `usuário inválido não chega ao cliente`; `senha errada e usuário inexistente dão a mesma mensagem`; `login grava no storage o merge devolvido pelo servidor`; `login com servidor fora do ar mantém o progresso local`; `sair apaga o progresso local de termo e game2048`; `conta B não herda o progresso da conta A no mesmo aparelho` (A loga com 5 vitórias, sai, B loga com servidor `(0,0,0)` → storage de B tem 0); `registrar sem login não chama o cliente`; `registrar com falha de rede não lança`.
- [ ] **Step 2: Rodar e ver falhar** — `node --test conta/conta.test.mjs` → FAIL.
- [ ] **Step 3: Implementar `criarConta`/`conta`** conforme as regras.
- [ ] **Step 4: Rodar os testes** → PASS.
- [ ] **Step 5: Commit**

```bash
git add js/core/conta/index.js
git commit -m "feat(conta): serviço de conta com sync no login e limpeza no logout"
```

---

### Task 5: Ganchos nos jogos e fiação (`nav.js`, `main.js`, Termo, 2048)

**Files:**
- Modify: `js/main.js`, `js/core/nav.js` (função `montar`, ~linha 120), `js/games/termo.js` (`saveStats` ~linha 122, fim de `montar`), `js/games/game2048.js` (`updateScoreUI` ~linha 386, `loadBestScore`)
- Test: `~/arcade-tools/conta/ganchos.mjs` (Puppeteer, página real com `conta` simulada)

**Interfaces:**
- Consumes: `conta` da Task 4.
- Produces: `iniciarNav({ app, audio, confetti, escopo, conta })`; o contexto de `mount` passa a ser `{ audio, confetti, storage, conta }`.
- Comportamento:
  - Termo: vitória chama `conta.registrar('termo', { tipo: 'vitoria' })`, derrota chama `{ tipo: 'derrota' }`, ambos logo depois de `saveStats()`.
  - 2048: quando `state.score > state.bestScore`, chamar `conta.registrar('game2048', { tipo: 'pontos', valor: state.score })` com *debounce* de 1500 ms e uma chamada final no fim de partida (game over/nova partida), para não disparar uma RPC por movimento.
  - Ambos assinam `conta.assinar` e, em `'progresso'`, rerrelêem o storage e atualizam a tela (`loadStats()` no Termo; `loadBestScore()` no 2048).

- [ ] **Step 1: Escrever `ganchos.mjs`** — carrega `index.html` via servidor estático local; na página, importa o singleton (`await import('/js/core/conta/index.js')`) e troca `conta.registrar` por um espião (os jogos chamam `ctx.conta.registrar` na hora, então o espião vale). Ganha uma partida de Termo forçando a palavra e afirma `registrar('termo', {tipo:'vitoria'})`; no 2048, força pontuação e afirma uma única chamada `{tipo:'pontos', valor}` após o debounce; grava um recorde novo no storage, chama `conta.emitir({ tipo: 'progresso' })` (método exposto só para teste e para o próprio serviço) e afirma que a tela mostra o novo recorde. Acrescentar `emitir(evento)` ao objeto devolvido por `criarConta` na Task 4.
- [ ] **Step 2: Rodar e ver falhar** — `node ~/arcade-tools/conta/ganchos.mjs` → falha.
- [ ] **Step 3: Implementar** a passagem de `conta` por `main.js` → `iniciarNav` → `montar`, e os ganchos nos dois jogos. Jogos devem funcionar quando `ctx.conta` for `undefined` (testes antigos, `~/arcade-tools/smoke.mjs`).
- [ ] **Step 4: Rodar `ganchos.mjs` e `smoke.mjs`** → ambos passam.
- [ ] **Step 5: Commit**

```bash
git add js/main.js js/core/nav.js js/games/termo.js js/games/game2048.js
git commit -m "feat(conta): jogos registram resultados e recarregam progresso após login/logout"
```

---

### Task 6: Interface de conta (menu, modal, avatar)

**Files:**
- Create: `js/core/conta-ui.js`, `css/conta.css`
- Modify: `index.html` (link do CSS; `<div id="conta-slot"></div>` logo abaixo de `.drawer-header`), `js/main.js` (chamar `iniciarContaUI`)
- Test: `~/arcade-tools/conta/conta-ui.mjs` (Puppeteer, com `conta` simulada por espiões no singleton)

**Interfaces:**
- Consumes: `conta` (contrato do plano), `ICONES` e `decodificarAvatar` de `avatar.js`.
- Produces: `export function iniciarContaUI({ conta, audio }): void`.
- Comportamento (visual dos mockups aprovados, tokens de `css/base.css`):
  - Slot sem login: botão "Entrar". Com login: avatar + nome; clicar abre um pequeno menu com "Trocar avatar" e "Sair".
  - Modal com abas Entrar / Criar conta, campos usuário e senha, mensagem de erro em linha, botão desabilitado e com texto "Aguarde…" enquanto a requisição corre (impede duplo envio). Em Criar conta, grade com os 8 `ICONES` (o primeiro vem selecionado) e um 9º botão 📷 que abre o seletor de arquivo; a foto passa por `redimensionarFoto` e mostra pré-visualização.
  - Fecha com Esc, clique fora e depois de sucesso. Foco preso no modal, `role="dialog"`, `aria-modal`, labels nos campos.
  - Todo texto vindo do servidor/usuário entra por `textContent`, nunca `innerHTML`.
  - Re-renderiza o slot em cada evento `'sessao'`.

- [ ] **Step 1: Escrever `conta-ui.mjs`** — espiões em `conta.criarConta`/`conta.entrar` que demoram 300 ms; afirma que dois cliques rápidos em "Criar conta" geram **uma** chamada; que erro devolvido aparece na linha de erro; que enviar um `.txt` pelo seletor mostra erro de foto e **não** chama `criarConta`; que, após `emitir({tipo:'sessao'})` com usuário `lucas`, o slot mostra "lucas" e "Sair"; que um username contendo `<img src=x onerror=alert(1)>` (injetado no estado simulado) não cria elemento `img` no slot.
- [ ] **Step 2: Rodar e ver falhar** — `node ~/arcade-tools/conta/conta-ui.mjs` → falha.
- [ ] **Step 3: Implementar `iniciarContaUI`** e `css/conta.css` (modal centralizado, responsivo, 16 px de margem lateral no celular).
- [ ] **Step 4: Rodar `conta-ui.mjs`, depois `smoke.mjs`** → passam; tirar captura 360 px e 1280 px do menu aberto e do modal e conferir contra os mockups.
- [ ] **Step 5: Commit**

```bash
git add js/core/conta-ui.js css/conta.css index.html js/main.js
git commit -m "feat(conta): menu de conta, modal de entrar/criar conta e seletor de avatar"
```

---

### Task 7: Placar (painel lateral e página `#/placar`)

**Files:**
- Create: `js/core/placar-painel.js`, `js/games/placar.js`, `css/placar.css`
- Modify: `js/main.js` (`registrar(placar)`), `index.html` (link do CSS), `js/games/termo.js` e `js/games/game2048.js` (envolver o HTML do jogo e anexar o painel), `js/core/nav.js` (subtítulo "Sete jogos…" e rodapé "7 jogos" em `index.html` passam a contar só jogos de verdade, ver abaixo)
- Test: `~/arcade-tools/conta/placar.mjs` (Puppeteer com `conta.lerPlacar` simulado)

**Interfaces:**
- Consumes: `conta.lerPlacar`, `conta.avatarVisual`, `conta.assinar`.
- Produces:
  - `criarPlacarPainel({ conta, jogo, limite = 5, rotulo }): { el: HTMLElement, atualizar(): Promise<void>, destruir(): void }` — lista com posição (🥇🥈🥉 e depois número), avatar, nome, valor formatado com separador de milhar pt-BR; a linha da própria pessoa destacada e sempre presente (anexada no fim se estiver fora do limite); estados "Carregando…", "Ninguém jogou ainda — seja o primeiro!" e "Não foi possível carregar o placar" com botão de tentar de novo; rodapé com link `#/placar` quando `limite` é pequeno e convite "Entre para aparecer aqui" sem login. Reatualiza em `'sessao'` e `'progresso'`.
  - `js/games/placar.js` exporta um objeto no formato dos jogos (`id: 'placar'`, `nome: 'Placar'`, `icone: '🏆'`, `descricao: 'Quem joga melhor'`, `mount/pause/resume/recorde`, `recorde() → null`) com abas Termo / 2048 e `limite = 50`. Atualiza em `resume()`.
  - Registro: adicionar a chave opcional `pagina: true` aos objetos de jogo; `nav.js` não conta itens com `pagina` no texto "N jogos" (trocar a frase fixa por contagem calculada e o rodapé idem) e o card da home continua aparecendo.
  - Layout: em Termo e 2048, `.jogo-com-placar` (grid 2 colunas `minmax(0,1fr) 300px` acima de 1100 px; coluna única abaixo disso, painel depois do jogo) contendo o conteúdo original e `<aside class="placar-lateral">`. O painel só é criado no `mount` do jogo.

- [ ] **Step 1: Escrever `placar.mjs`** — `lerPlacar` simulado devolve 7 linhas e `eu` na posição 6: afirma que o painel lateral mostra 5 linhas **mais** a do usuário destacada; com lista vazia mostra a mensagem de vazio; com `null` mostra o erro e o botão; um username `<b>x</b>` aparece como texto literal; em viewport 1280 px o `aside` fica à direita do tabuleiro (`getBoundingClientRect().left` maior que o do tabuleiro) e em 390 px fica abaixo; `#/placar` mostra abas e troca de jogo ao clicar; o texto "Sete jogos" some e a contagem exibida bate com o número de jogos sem `pagina`.
- [ ] **Step 2: Rodar e ver falhar** — `node ~/arcade-tools/conta/placar.mjs` → falha.
- [ ] **Step 3: Implementar** `placar-painel.js`, `placar.js`, o envelope de layout nos dois jogos, `css/placar.css` e o registro em `main.js`.
- [ ] **Step 4: Rodar `placar.mjs`, `conta-ui.mjs`, `ganchos.mjs` e `smoke.mjs`** → todos passam; capturas 1280 px e 390 px do Termo, do 2048 e de `#/placar`.
- [ ] **Step 5: Commit**

```bash
git add js/core/placar-painel.js js/games/placar.js css/placar.css js/main.js index.html js/games/termo.js js/games/game2048.js js/core/nav.js
git commit -m "feat(placar): painel lateral no Termo e 2048 e página #/placar"
```

---

### Task 8: Ponta a ponta real, documentação e PR

**Files:**
- Create: `~/arcade-tools/conta/e2e-real.mjs`
- Modify: `README.md` (seção "Contas e placar": o que é, como criar conta, limitações — sem recuperação de senha, anti-fraude fraco)

**Interfaces:**
- Consumes: tudo acima, contra o projeto Supabase real e o site servido localmente.

- [ ] **Step 1: Escrever `e2e-real.mjs`** — com Puppeteer: abre o site, cria a conta `zz_teste_<timestamp>` com o ícone 🐼, ganha uma partida de Termo (palavra forçada via storage), confere que o painel lateral mostra a conta com 1 vitória; em **outro contexto de navegador** (outro "aparelho") entra com a mesma conta e confere vitória 1, avatar 🐼 e que o 2048 mostra o recorde enviado; sai e confere que `arcade:termo:stats` voltou a `{wins:0,streak:0}`; entra com uma segunda conta `zz_teste_<timestamp>b` e confere que não herdou nada.
- [ ] **Step 2: Rodar** — `node ~/arcade-tools/conta/e2e-real.mjs`; esperado: todas as afirmações passam.
- [ ] **Step 3: Limpar** — apagar as contas `zz_teste_%` por `execute_sql` (`delete from auth.users where email like 'zz\_teste\_%'`; as tabelas caem em cascata) e os arquivos de avatar de teste do bucket; confirmar com `select count(*) from profiles where username like 'zz\_teste\_%'` = 0.
- [ ] **Step 4: Regressão completa** — `cd ~/arcade-tools && node --test conta/*.test.mjs blockstrike/*.test.mjs` e `node smoke.mjs`, `node regressao.mjs`, `node storage-test.mjs`; esperado: tudo passa. Rodar `get_advisors` (security) de novo.
- [ ] **Step 5: README e commit**

```bash
git add README.md
git commit -m "docs: README com contas e placar"
```

- [ ] **Step 6: Abrir o PR** (`gh pr create`), título `feat: contas e placar compartilhado (Termo e 2048)`, corpo com bullets em negrito, seção "Verificação" e nota de deploy. Aguardar a CI (SonarCloud, Vercel); **não** fazer merge nem deploy sem pedido do dono; o deploy depois do merge é `vercel deploy --prod --yes`.

---

## Auto-revisão

- **Cobertura da spec:** conta usuário/senha (T2–T4, T6), avatar ícone/foto (T2, T6), placar público (T1, T7), painel lateral + página (T7), login opcional (T4, T5), progresso entre aparelhos (T1 `sincronizar_progresso`, T4), sair apaga o local (T4), ganchos e recarga (T5), confirmação de e-mail (T1 Step 7), testes mockados + 1 E2E com limpeza (T3–T8), advisors (T1, T8). Anti-fraude fraco aceito: nenhuma tarefa extra.
- **Paralelismo para os agentes (Opus, esforço high):** onda 1 = T1 e T2 em paralelo; onda 2 = T3 (depende de T1/T2); onda 3 = T4; onda 4 = T5, T6 e T7 em paralelo (só dependem do contrato `conta`); onda 5 = T8. Cada agente trabalha em arquivos distintos; `js/main.js`, `index.html` e `nav.js` são tocados por T5, T6 e T7, então o integrador faz os merges desses três arquivos na ordem T5 → T6 → T7.
- **Divergência da spec:** os ids de jogo no banco são `termo` e `game2048` (ids do registro), não `2048`.


