# Handoff — Block Strike (sessão de 2026-10-23)

Resumo para retomar o trabalho numa sessão nova do Claude Code. Escrito ao atingir ~95% do uso de tokens, por instrução do usuário.

## Onde parou

| Etapa | Branch | PR | Estado |
|---|---|---|---|
| Pacote combate (dink no capacete, relatório de dano, assistências, MVP) | `feat/block-strike-pacote-combate` | #19 | **mergeado** na `main` |
| Pacote menu (Crosshair Lab, estatísticas de carreira) | `feat/block-strike-pacote-menu` | #20 → #22 | **mergeado** na `main` (via #22) |
| Granada molotov | `feat/block-strike-molotov` | #21 → #22 | **mergeado** na `main` (via #22) |
| Drop e coleta de armas (G / E / ao morrer) | `feat/block-strike-drop-armas` | aberto, ver abaixo | **aberto, sem merge**: a revisão do `code-reviewer` foi interrompida |

Observação sobre o merge empilhado: `gh pr merge --delete-branch` no #19 **fechou** o #20, em vez de reapontá-lo para a `main`, e o #21 entrou na branch do menu. Isso foi corrigido com o #22 (menu + molotov → `main`). Da próxima vez:
- mergear o PR de baixo **sem** `--delete-branch`;
- trocar a base do seguinte com `gh pr edit N --base main`;
- só então apagar as branches.

## O que estava em andamento: drop de armas

Implementado e commitado (`c175e71`). Os testes passaram, mas falta a revisão.

**O que a branch faz:**
- `js/games/blockstrike/armasChao.js` (novo, puro): soltar, física da arma no chão, pegar com E na mira (até 2,6 m do olho), pegar passando por cima com o slot vazio e `primariaPerto` para os bots.
- `mundo.js`:
  - `armasDoChao` roda a cada passo, inclusive no freeze, mas não enquanto planta ou desarma;
  - ao morrer, cai a melhor arma;
  - `posicionarParaRound` limpa o chão;
  - pegar uma primária atualiza `equip.primaria`, então ela continua no próximo round.
- `entrada.js`: G (`soltar`) e a borda do keydown de E (`pegar`), além do `usar` (E segurado).
- `bots.js`:
  - `buscarArma`: sem primária, vai pegar uma no chão até 10 m;
  - volta para a primária quando ela tem munição.
- `render.js`: `montarArma` foi extraído de `armarAvatar`, e as armas aparecem deitadas no chão.
- `hud.js`: dica "E · pegar X" e G/E na lista de controles.
- `sons.js`: sons de soltar, bater no chão e pegar.

**Próximos passos:**
1. Rodar o `code-reviewer` no diff da branch contra a `main`. Pontos que pedi para ele olhar:
   - caminhos que deixem `e.armas[e.slot]` nulo;
   - exploits de economia (soltar a arma comprada no freeze e comprar outra);
   - conflito do E com plantar, desarmar e pegar a C4;
   - bot alternando entre pistola e primária;
   - vazamento de grupos no render.
2. Corrigir os achados, rodar `docs/blockstrike-testes/drop.mjs` e `sim.mjs` e então mergear (só com autorização do usuário).

## O que falta da lista original do usuário (por custo)

1. Rostos procedurais (textura de canvas 32x32 na face da cabeça).
2. Rádio tático e pings (Z/X/C) e o chat dos bots.
3. Agentes e facções (skins de boneco no menu).
4. Modo Aim Botz.
5. Skins procedurais de armas (Asiimov, Case Hardened, Fade, Redline) no viewmodel, no boneco e no loadout.
6. Deathmatch (mexe em `rounds.js`).
7. Mapa Mirage Block (mapa, waypoints de `navegacao.js` e rotas e postos dos bots em `mapa.js`). É caro.
8. Multiplayer P2P (WebRTC). É muito caro: a simulação é local e precisaria de netcode.

Fora de escopo, por decisão do usuário: **mobile**. Não ajustar nem testar layout de celular.

## Como testar (sem suíte de testes no repo)

Os scripts estão em `docs/blockstrike-testes/`. Rode de dentro de `js/games/blockstrike/`, passando o caminho absoluto da pasta.

```bash
cd js/games/blockstrike
node ../../../docs/blockstrike-testes/sim.mjs "$PWD" 1      # partida completa bot x bot (seed 1)
node ../../../docs/blockstrike-testes/molotov.mjs "$PWD"    # cenários da molotov
node ../../../docs/blockstrike-testes/drop.mjs "$PWD"       # cenários do drop de armas
```

`sim.mjs` confere estas invariantes:
- dano por vítima ≤ 100;
- assistência válida (> 40 de dano, mesmo time);
- MVP do time vencedor e, quando desarma, vivo;
- contagens da carreira iguais às do placar, e acertos ≤ tiros;
- a tabela de dano é zerada a cada round;
- nenhuma entidade viva com o slot da mão vazio.

O resultado esperado é `falhas: 0`.

**Páginas de UI e render** (`docs/blockstrike-testes/*.html`): copie para `.claude/teste/`, que está no gitignore, sirva a raiz do repo e tire screenshots com o Chrome headless:

```bash
python3 -m http.server 8765 &
google-chrome --headless=new --window-size=1280,800 --virtual-time-budget=4000 \
  --screenshot=/tmp/menu.png "http://localhost:8765/.claude/teste/menu.html?aba=mira"
# WebGL (fogo, armas no chão): adicionar --use-angle=swiftshader --enable-unsafe-swiftshader
```

- `hud.html`: relatório de dano, MVP e placar. Parâmetros: `?tab=1&fase=jogo`.
- `menu.html`: abas Mira e Carreira. Parâmetros: `?aba=carreira`, `?clique=1`, `?rotulo=1`.
- `fogo.html` e `chao.html`: render real em WebGL. Parâmetros: `?t=` (segundos simulados) e `&mao=1` (molotov na mão).

## Como o Claude trabalha neste projeto

Essas regras vêm das memórias do usuário em `~/.claude/projects/.../memory/`.

- **Git:**
  - branch própria por etapa, nunca direto na `main`;
  - commits pequenos em português, no padrão Conventional Commits, terminando com `Co-Authored-By`;
  - um PR por etapa, com corpo em português e linha de atribuição do Claude Code;
  - **nunca mergear sem autorização explícita**. A única exceção é o gatilho de ~95% de tokens: mergear o que der e escrever este handoff.
- **Fluxo de cada etapa:**
  1. ler o código envolvido (grep e sed, pontual);
  2. implementar seguindo o estilo do módulo: comentários curtos em português e módulos puros sem DOM nem Three.js para a lógica;
  3. `node --check` em todos os arquivos;
  4. cenários em Node e a simulação completa;
  5. screenshots no Chrome headless para a UI e o render;
  6. commit;
  7. **revisão final com o subagente `code-reviewer`** e autorrevisão;
  8. corrigir os achados (inclusive os baixos);
  9. commit de "ajustes da revisão";
  10. push e PR.
- PRs empilhados quando uma etapa depende da anterior, porque mexem nos mesmos arquivos.
- Comunicação no modo caveman (respostas curtas). Código, commits, PRs e docs vão em prosa normal.

## Skills e ferramentas usadas

- **`caveman:caveman`**: modo de resposta curta, ativo a sessão toda.
- **`agent-browser`**: carregado para validar a UI, mas não estava instalado. O substituto foi o Chrome headless (`google-chrome --headless=new --screenshot/--dump-dom`, com SwiftShader para WebGL).
- **Subagente `code-reviewer`**: revisão final de cada etapa, rodando em background.
- **`gh` CLI**: push, abertura e merge de PRs.
- **Memória do Claude Code**:
  - `project_blockstrike-sem-mobile.md`;
  - `feedback_limite-tokens-merge-e-handoff.md`;
  - `feedback_commits-e-pr-merge-so-com-autorizacao.md`;
  - `feedback_revisao-final-com-agentes.md`.
