# Contas e placar compartilhado — design

Data: 2026-10-20. Origem: conversa de brainstorming com o dono do projeto (decisões dele marcadas **[decidido]**; escolhas minhas marcadas **[minha escolha]**).

## Intenção

O flow-games é um arcade estático (HTML + ES modules, sem build, hospedado na Vercel) e hoje guarda tudo no `localStorage`. O dono quer identificar quem joga e mostrar, para todo mundo, o desempenho de cada pessoa:

- **Termo:** quantas palavras cada pessoa acertou.
- **2048:** a maior pontuação que cada pessoa já fez.

Também quer que o progresso siga a pessoa entre aparelhos. O público são amigos e conhecidos, não um serviço aberto à internet.

## Objetivos

- Conta com **nome de usuário e senha**, sem e-mail. **[decidido]**
- Avatar por conta: **ícone pronto ou foto enviada**. **[decidido]**
- **Placar compartilhado** público (Termo e 2048) e **progresso entre aparelhos**. **[decidido]**
- **Login opcional**: quem não tem conta joga normalmente, com o progresso só no aparelho. **[decidido]**
- Visual igual ao do site (escuro, neon). Os mockups aprovados mostraram: botão "Entrar" que vira avatar + nome, modal Entrar/Criar conta com seletor de avatar (8 ícones + câmera para foto), placar com abas Termo/2048, medalhas nos 3 primeiros e a linha da própria pessoa destacada. **[decidido]**

## Não-objetivos e anti-objetivos

- Não integrar os outros jogos (Snake, Tetris, Campo Minado, Jogo da Velha, Block Strike) ao placar.
- Sem "esqueci minha senha", troca de nome de usuário nem exclusão de conta nesta versão. **[minha escolha]**
- Sem anti-fraude forte. O jogo roda no navegador, então um usuário determinado consegue forjar números. Para um grupo de amigos isso é aceito. **[decidido: o dono aceitou o risco]**
- Anti-objetivo: o site quebrar ou ficar lento se o Supabase estiver fora do ar. Sem conexão, tudo continua funcionando como hoje.
- Anti-objetivo: a pessoa perder o progresso local ao criar conta ou entrar.

## Como será feito

- **Backend:** projeto Supabase novo, já criado: `flow-games`, ref `jylkqxmfbjrtnuwqcmry`, região `sa-east-1`, URL `https://jylkqxmfbjrtnuwqcmry.supabase.co`. O projeto `readmecraft` da mesma conta não deve ser tocado. O acesso via MCP (`mcp__plugin_supabase_supabase__*`) já está autorizado.
- **Cliente:** `supabase-js` copiado para `js/vendor/` (o repositório já faz isso com o three.js), sem bundler. A chave usada no navegador é a *publishable*; a chave de serviço nunca entra no repositório. **[minha escolha]**
- **Login por usuário:** o Supabase Auth exige e-mail, então a conta usa um e-mail sintético derivado do nome de usuário (algo como `<usuario>@<domínio-fixo>`), invisível para a pessoa. A confirmação de e-mail precisa estar **desligada** no painel do Supabase (Authentication → Providers → Email → "Confirm email"), senão o cadastro não devolve sessão. **[minha escolha]**
- **Regras do nome de usuário:** 3 a 16 caracteres, letras/números/`_`, único sem diferenciar maiúsculas. Senha com no mínimo 6 caracteres (padrão do Supabase). **[minha escolha]**

## Dados

- `profiles`: `user_id` (chave, referencia `auth.users`), `username` (único, case-insensitive), `avatar` (id de ícone pronto, ou caminho no Storage), `created_at`.
- `placar`: chave `(user_id, jogo)`, com `jogo` em `termo` | `game2048` (ids do registro); `valor` (Termo: total de vitórias; 2048: maior pontuação); `extra` jsonb (Termo: `{ "streak": n }`); `updated_at`.
- Storage: bucket público `avatars`, caminho `<user_id>/avatar`. A foto é redimensionada no navegador para 128×128 e comprimida antes do envio, limite de ~200 KB, só imagem.
- **RLS:** leitura pública de `profiles` e `placar`; nenhuma escrita direta nas tabelas. Toda escrita de pontos passa por funções RPC `security definer` que usam `auth.uid()`: registrar vitória do Termo (+1 e streak), registrar derrota (zera streak), registrar pontuação do 2048 (guarda o maior; rejeita valores absurdos, por exemplo acima de 4.000.000). **[minha escolha]** Rodar os advisors de segurança do Supabase depois do DDL.

## Comportamento

- **Sem conta:** idêntico a hoje (`js/core/storage.js`, que nunca lança).
- **Entrando ou criando conta:** reconciliar local e servidor com a regra do maior valor. 2048: `max(local, servidor)`. Termo: vale o lado com mais vitórias (vitórias e streak vêm juntos desse lado). Depois da reconciliação os dois lados ficam iguais. **[minha escolha]** Limitação conhecida: dois aparelhos com vitórias anônimas diferentes não somam, vale o maior.
- **Sair da conta:** o progresso local do Termo e do 2048 é apagado, porque a conta já guarda tudo no servidor. Quem joga sem conta depois disso começa do zero, e ao entrar em outra conta o progresso anônimo novo é mesclado normalmente. Isso evita que o progresso de uma pessoa vaze para outra em aparelho compartilhado e não perde nada: o que veio antes do login já foi mesclado na conta. **[minha escolha]**
- **Logado jogando:** cada vitória/derrota do Termo e cada novo recorde do 2048 grava no local e chama a RPC. Falha de rede é ignorada em silêncio; a reconciliação do próximo login corrige.
- **Onde aparece:** o menu lateral ganha uma área de conta no topo (botão Entrar, ou avatar + nome com Trocar avatar e Sair) e um item "Placar". O placar é uma rota própria `#/placar`, com abas Termo/2048, top 50, e a linha da pessoa logada sempre visível mesmo fora do top 50. Qualquer pessoa vê o placar sem login. **[minha escolha: o dono não respondeu se queria página própria ou dentro de cada jogo]**
- **Painel ao lado do jogo:** além da página `#/placar`, o Termo e o 2048 mostram um placar resumido (top 5 + a linha da pessoa logada) **do lado direito do jogo** em telas largas; em telas estreitas (celular) o painel desce para baixo do tabuleiro. Ele lê os mesmos dados do placar completo e tem um link "Ver placar completo". **[decidido pelo dono; posição em tela estreita é minha escolha]**
- Sem login, o painel lateral continua visível (o placar é público), com um convite discreto para entrar.

## Pontos de integração e pré-requisitos

- **Ganchos:** hoje não existem ganchos de pontuação. Termo e 2048 recebem só `{ audio, confetti, storage }` e chamam `storage.set` direto (`js/games/termo.js` em `saveStats`, `js/games/game2048.js` em `updateScoreUI`). O plano deve criar o gancho (por exemplo, `conta.js` expondo `registrarResultado(jogo, ...)`, repassado ao jogo no contexto de `mount`) e também um jeito de os jogos **recarregarem o que já têm em memória** depois de uma reconciliação por login ou logout.
- **Confirmação de e-mail:** o primeiro passo da implementação é verificar se o Supabase devolve sessão no cadastro. As ferramentas MCP não alteram essa configuração; se ela estiver ligada, o dono precisa desligá-la no painel antes do resto do fluxo funcionar. **[a verificar]**
- **Placar:** lista só quem já jogou aquele jogo (linha existente em `placar` com `valor > 0`). **[minha escolha]**
- **Testes:** lógica de reconciliação e do cliente com o cliente Supabase simulado (mock). Um único teste de ponta a ponta usa uma conta descartável de prefixo `zz_teste_` no projeto real e a remove por SQL (via MCP) no fim, para não aparecer no placar. **[minha escolha]**

## Restrições

- Sem build; ES modules; seguir o contrato dos jogos (`mount/pause/resume/recorde`) e o registro em `js/main.js`; não acoplar os jogos ao Supabase diretamente (usar um módulo `js/core/conta.js` e os pontos de gancho existentes).
- Convenções do repositório: PR com merge commit, sem auto-merge, deploy manual (`vercel deploy --prod --yes`), `git add` por caminho, testes em `~/arcade-tools`. `.superpowers/` já está no `.git/info/exclude`.
- Texto da interface em português.

## Execução

O dono pediu trabalho **em paralelo com agentes, modelo Opus, esforço high**. Divisão sugerida (independentes entre si depois do contrato de dados acima): (1) migrations SQL + RLS + RPC + bucket, aplicadas via MCP; (2) `js/core/conta.js` (cliente, auth, reconciliação); (3) UI de conta no menu, modal e avatar + CSS; (4) página `#/placar`; (5) ganchos no Termo e no 2048; (6) testes. Cada agente escreve arquivos em partes (menos de 150 linhas por chamada).

## Critérios de sucesso

Criar conta, trocar de aparelho e ver o mesmo progresso; placar mostrando em ordem todos que já jogaram aquele jogo; jogar sem conta continua igual a hoje; Supabase indisponível não quebra o jogo; advisors de segurança sem alertas críticos; nenhum segredo no repositório.

## Deixado para quem for construir

Domínio exato do e-mail sintético, lista final dos 8 ícones, textos de erro, detalhes visuais finos, estrutura interna dos módulos e nomes das RPCs.
