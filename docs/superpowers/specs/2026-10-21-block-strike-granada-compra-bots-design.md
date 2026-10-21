# Block Strike — granada na tecla 4, compra com mouse e bots que não travam

Data: 2026-10-21. Jogo: `js/games/blockstrike/`.

## Por quê

O jogador quer que o Block Strike se jogue como o CS2 em três pontos que hoje incomodam:

1. **Granadas.** Hoje cada granada tem uma tecla de arremesso instantâneo (`Z` flash, `X` smoke, `V` HE, em `entrada.js`). No CS2 a granada é uma "arma": vai para a mão na tecla 4 e sai pelo botão do mouse.
2. **Menu de compra.** Os botões do menu já têm `click` (`hud.js`), mas o mouse está preso no canvas (pointer lock) durante o freeze, então não há cursor para clicar.
3. **Bots.** Espectando depois de morrer, o jogador vê bots parados ou andando reto, principalmente na lateral direita do mapa do ponto de vista do CT (o CT nasce sempre em z>0, então é a área do túnel e do bombsite B, x>20).

Sucesso: dá para comprar clicando, jogar granadas como no CS2 e espectar os bots aliados (o espectador de hoje, `proximaVista` em `index.js`, só mostra o próprio time; isso não muda) sem ver um travado. Os bots inimigos são verificados pela simulação.

## Objetivos

### 1. Granada na tecla 4 (decidido pelo jogador)

- A tecla `4` põe uma granada na mão. Apertar `4` de novo troca para o próximo tipo que o jogador tem.
- Granada na mão: **clique esquerdo** joga longe, **clique direito** joga curto (por baixo), **os dois juntos** jogam a uma distância média. Igual ao CS2.
- As teclas `Z`, `X` e `V` deixam de existir.

Decisões minhas (o builder pode mudar se a implementação pedir, desde que o resultado se comporte igual):

- O arremesso acontece **ao soltar** o botão (apertar = puxar o pino). Se os dois botões estiverem apertados quando o primeiro for solto, vale "médio".
- Ordem do ciclo: HE → flash → smoke, pulando os tipos com estoque 0. Sem nenhuma granada, `4` não faz nada (som `vazio` opcional).
- Ao entrar no slot pela primeira vez no round, a mão pega o primeiro tipo disponível da ordem. Ao voltar para o slot depois, volta no último tipo usado se ainda houver.
- Depois do arremesso, a mão volta para a arma anterior (`slotAnterior`), respeitando o `GRANADA.intervalo` que já existe.
- Forças (ponto de partida, ajustar no navegador): longe = `velocidade 18, subida 4` (o arremesso atual); médio ≈ 12/3; curto ≈ 7/2, saindo um pouco mais baixo.
- O slot da granada entra na roda do mouse e no `Q` (última arma). Com granada na mão, o botão direito não é zoom.
- Na mão aparece um cubo pequeno da cor do tipo (o mesmo visual das granadas no ar em `render.js`), no lugar do viewmodel da arma. O HUD mostra o tipo selecionado e a contagem de cada um.
- Durante o freeze com o menu de compra aberto, as teclas 1-9/0 continuam comprando (inclusive o `4`). Fora disso, `4` é o slot da granada.
- Morrer com a granada na mão não solta nada (sem granada caindo).

### 2. Menu de compra clicável (decidido pelo jogador: só no `B`, igual CS2)

- No freeze da partida com economia, o menu continua aparecendo como hoje, e as teclas continuam comprando com a mira travada.
- **`B` solta o mouse** (aparece o cursor) para clicar nos itens. **`B` de novo** trava o mouse de volta (`keydown` conta como gesto do usuário para o `requestPointerLock`).
- Soltar o mouse pelo `B` **não pode abrir o menu de pausa**. Hoje `entrada.aoPerderTrava` → `pausarPartida`. É preciso distinguir a soltura intencional (B) da perda de trava (Esc, troca de aba).
- Se o freeze acabar com o cursor solto: o menu fecha e aparece uma dica "clique para jogar". O primeiro clique no canvas trava de novo (o `onMouseDown` já faz isso) e não dispara a arma.
- Esc com o cursor solto pelo B abre a pausa, como hoje.

Decisões minhas: o menu continua abrindo sozinho no freeze (só o cursor depende do `B`). No modo treino o `B` mantém o comportamento atual (abre o loadout). Clicar fora dos itens com o cursor solto não trava o mouse; só o `B` trava, para não perder a compra com um clique errado.

### 3. Bots

**3a. CT segurando ângulo (decidido pelo jogador).** Antes da plantada, o CT vai até o ponto `espera` do seu bombsite e fica parado como um jogador segurando ângulo. O que muda: ao chegar, ele vira e **mira a entrada por onde os Ts chegam**, em vez de ficar olhando para onde andava.
Decisão minha: cada `espera` ganha um ponto "para onde mirar" no `mapa.js`. Para o A, a saída do corredor no lado inimigo. Para o B, a saída do túnel no lado inimigo (`(28, -2.5)` e arredores, perto do waypoint `2N+2`). Pode ter pequena variação de mira entre bots para não ficarem idênticos. Ouvir passos e ver inimigos continua tendo prioridade sobre a mira parada.

**Segurar o posto em combate** (decisão minha, tirada de "parado segurando ângulo, igual jogador"): enquanto a C4 não foi plantada, o CT no posto é um estado próprio ("segurando"). Ele atira do lugar, sem o `avancar` (hoje o bot anda até o inimigo além do `ALCANCE_IDEAL`, 20 m no rifle, e sai do posto ao ver um T no túnel) e sem perseguir o último ponto visto. Quando perde o alvo, volta a mirar a entrada. Cobertura e recuo continuam valendo (levou tiro sem ver o atirador, ou HP baixo). Ao fim da espera, ele volta para o posto, não para o último ponto visto. Depois da plantada, o CT sai do posto e segue a lógica normal até o bombsite.

**3b. Bug: bot fica parado onde perdeu o inimigo (confirmado lendo o código).** Em `bots.js > pensar`: quando o alvo some por mais de `PERDER_ALVO`, o bot faz `voltarParaRota(..., waypointPerto(c.ultimaPos))`. Ao chegar, `seguirRota` devolve `null`, e como `tarefaBomba` devolve `{ segurar: true }` (CT antes da plantada; T sem a C4 enquanto alguém a carrega), o bot nunca recalcula. Ele fica ali até o fim do round.
Correção desejada (vale para os Ts e para os CTs depois da plantada; o CT segurando o posto não persegue, ver 3a): depois de chegar ao último ponto visto e esperar alguns segundos (decisão minha: o mesmo `ESPERA_COBERTURA`, 1,5 a 3 s), o bot volta ao objetivo normal pelo `proximoObjetivo`: o CT vai para o posto `espera`, o T vai para o bombsite alvo ou segue a lógica da C4. "Segurar" só vale quando o bot está no destino da tarefa, não num ponto qualquer.

**3c. Bot andando reto (hipótese, confirmar antes de corrigir).** Em `seguirRota`, o desencalhe pula para o próximo waypoint depois de 1 s preso, mesmo sem visada para ele. O palpite é que o bot anda reto contra uma parede, pula waypoints até a rota acabar e fica encostado. Outros candidatos: o modo `direto` de `tarefaBomba` (anda reto até a C4 sem desencalhe quando a rota já acabou) e quinas apertadas do túnel (a aresta `17 → 2N+2` passa a ~0,5 m da ponta da parede `x=31`).
O builder deve **reproduzir primeiro** (o smoke de bots em `~/arcade-tools`, `bs-bots.mjs`, é o ponto de partida) registrando posição/estado dos bots por alguns rounds e marcando quem fica com `velHoriz < 0.5` querendo andar por mais de 2 s, ou parado sem motivo fora do posto. Corrigir a causa encontrada.
Decisão minha para a correção, se for o desencalhe: em vez de pular waypoint, recalcular a rota a partir do waypoint visível mais próximo; e o modo `direto` também ganha desencalhe.

Critério de pronto dos bots: em vários rounds simulados, nenhum bot **seguindo rota ou indo direto a um objetivo** (estados `rota`, `cobertura`, `recuo` e o modo `direto` da C4) fica mais de ~3 s querendo andar sem sair do lugar. E nenhum fica parado fora de um destino (posto, bombsite, cobertura, C4) por mais que a espera prevista. O strafe de combate (SMG e escopeta) fica fora do critério (decisão minha): é curto e acaba quando o combate acaba.

Outras decisões minhas: puxar o pino e trocar de arma, morrer ou acabar o round cancela o arremesso, como no CS2. Andar com granada na mão usa a velocidade da faca. No treino, com o loadout aberto, o `4` escolhe a arma 4 do loadout. Fora disso, é a granada.

## Não-objetivos

- Não mudar a mira, os tiros, a dificuldade nem a lógica de granadas dos bots (eles continuam usando `cmd.granada` + `granadaAlvo` direto).
- Não adicionar molotov, decoy, zona de compra nem tempo de compra depois do freeze.
- Não mexer no mapa além dos pontos de mira das esperas (e de algum ajuste de waypoint se o 3c apontar uma quina).

## Anti-objetivos

- Soltar o mouse no `B` abrir a pausa, ou a rodada começar sem conseguir mirar.
- O `4` comprar item fora do menu, ou trocar de granada no meio do arremesso.
- "Consertar" os bots deixando-os inquietos: o CT precisa ficar parado no posto.

## Restrições

- Módulos puros continuam puros (`bots.js`, `navegacao.js`, `granadas.js`, `mundo.js` sem DOM e sem Three.js).
- Textos da UI, comentários e commits em pt-BR, no estilo do código atual.
- Testes e smoke ficam fora do repo, em `~/arcade-tools`.
- PR com merge commit, deploy manual (`vercel deploy --prod --yes`) só com autorização explícita.

## Fica com o builder

- Como representar o slot da granada (`e.slot = 'granada'` + tipo selecionado, ou outra forma) e onde guardar o tipo selecionado.
- Como o comando passa "puxou o pino / soltou com força X" do `entrada.js` para o `mundo.js`.
- O formato exato do cubo na mão e do indicador no HUD.
- Os valores finais das forças de arremesso e da variação de mira dos CTs.
