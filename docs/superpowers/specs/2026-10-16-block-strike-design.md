# Block Strike — design

FPS 5x5 estilo CS2 com visual de blocos estilo Roblox, novo jogo do Arcade Hub.
Itens marcados com **[escolha do Claude]** não foram pedidos explicitamente; ajuste à vontade.

## Contexto do projeto

- Repo flow-games (Arcade Hub): HTML/CSS/JS puros, ES modules, sem build, deploy na Vercel.
- Cada jogo é um módulo em `js/games/` registrado via `js/core/registry.js`, com o contrato
  `mount(raiz, {audio, confetti, storage})`, `pause()`, `resume()`, `recorde(storage)`,
  além de `iconeClasse`/`badge`. A navegação é por hash (`#/<jogo>`) em `js/core/nav.js`.
- Seguir o padrão dos jogos existentes (ex.: `js/games/snake.js`): storage
  `arcade:<jogo>:<chave>`, áudio sintetizado via `js/core/audio.js` e timers cancelados no
  `pause()`.

## O que construir

FPS em primeira pessoa no navegador, mata-mata 5x5 contra bots. Gráficos leves no estilo
Roblox: tudo feito de blocos e cores chapadas, sem texturas pesadas.

### Tecnologia

- Three.js vendorizado como arquivo único: `js/vendor/three.module.min.js`, com versão fixa
  e licença MIT junto. Sem npm, sem build, import relativo.
- README: "zero dependências" passa a ser "uma dependência vendorizada (Three.js) só no
  Block Strike".
- Só PC: mouse + teclado com Pointer Lock. Em tela de toque, mostrar o aviso "Disponível
  apenas no computador" no lugar do jogo.

### Fluxo

1. **Menu principal** (dentro da view do jogo): Jogar, Armamento inicial, dificuldade dos
   bots (Fácil/Médio/Difícil) e sensibilidade do mouse. Sensibilidade e dificuldade ficam
   salvas no storage.
2. **Partida**: o primeiro time a 13 rounds vence (MR12, máximo de 24 rounds). Em 12-12 a
   partida termina empatada **[escolha do Claude]**. Os times trocam de spawn depois do
   round 12 **[escolha do Claude]**.
3. **Cada round**:
   - Freeze time de 5 s, com o menu de armamento aberto e escolha livre, sem economia.
   - Depois, 1:55 de round.
   - O round termina quando um time é eliminado.
   - Se o tempo acabar, vence o time com mais vivos. Empatou em vivos, vence quem tem mais
     HP somado. Se ainda empatar, ninguém pontua **[escolha do Claude]**.
   - Tela de resultado do round por 3 s.
4. **Fim de partida**: placar final e tabela (kills, mortes, K/D, HS%), com os botões
   "Jogar de novo" e "Menu". Confete na vitória.

### Jogador e combate

- WASD, Shift para andar devagar (mais preciso), Ctrl para agachar, Espaço para pular.
  Clique para atirar, R para recarregar, 1/2/3 para trocar entre primária, pistola e faca.
  Tab mostra o placar, Esc pausa.
- 100 de HP, sem colete **[escolha do Claude]**. Fogo amigo desligado.
- Tiro hitscan por raycast. Hitbox de cabeça separada (dano x4) e pernas com dano x0,75.
- Precisão: o spread aumenta ao correr ou pular e diminui agachado. Recuo vertical simples
  que volta sozinho quando o jogador para de atirar.
- Armas **[escolha do Claude: lista e números; balancear testando]**:
  - Primárias:
    - Rifle tipo AK: 36 de dano, 600 RPM, pente de 30.
    - SMG: 26 de dano, 850 RPM, pente de 30, precisa correndo.
    - Sniper tipo AWP: 115 de dano, ferrolho, pente de 5, zoom no botão direito.
    - Escopeta: 8 chumbos de 20, pente de 8.
  - Pistola, sempre presente: 30 de dano, semiautomática, pente de 12.
  - Faca: 50 de dano.
- Quem morre vira espectador de um aliado vivo (clique troca de aliado).

### Bots (4 aliados + 5 inimigos)

- Navegação por grafo de waypoints pré-definido no mapa, com A*. Estados: rota/patrulha,
  combate, procurar cobertura e recuar com HP baixo.
- Visão: cone de visão + raycast de linha de visada.
- Por dificuldade variam o tempo de reação, o erro de mira e a taxa de headshot.
  - Fácil: reação de ~600 ms, erra bastante.
  - Difícil: ~200 ms, mira firme mas humana. Nada de aimbot perfeito.
- Cada bot escolhe a arma aleatoriamente, com pesos por "personalidade" (ex.: um bot
  sniper por time).
- Nomes gerados (ex.: "Bot Tijolo"). Kill feed mostra quem matou quem e com qual arma.

### Mapa **[escolha do Claude]**

- Um mapa só, de blocos, com três rotas (estilo Dust2 simplificado): duas bases de spawn,
  um meio aberto, caixas para cobertura e um corredor longo para a sniper.
- Definido como dados (array de caixas: posição, tamanho, cor), não modelado à mão no código.
- Colisão AABB contra essas caixas.

### Visual e desempenho

- Personagens estilo Roblox: cabeça, tronco, braços e pernas em cubos, com cor do time
  (azul × laranja). Animação simples de andar balançando os membros.
- Arma em primeira pessoa feita de blocos, com coice visual, flash de tiro e marca de
  impacto nas paredes (pool limitado).
- `MeshLambertMaterial`, sem sombras dinâmicas, neblina leve e `pixelRatio` limitado a 1,5.
  Meta: 60 fps em GPU integrada. Reutilizar geometrias e materiais.
- HUD em HTML por cima do canvas: mira, HP, munição, timer, placar e kill feed. Indicador
  de dano direcional e hitmarker.
- Sons sintetizados no `audio.js`: tiro por arma, passos, hit, headshot e fim de round.

### Integração com o hub

- Registrar no `registry.js`, criar card na home e item na sidebar, como os outros jogos.
- `pause()` libera o pointer lock e para o loop. `resume()` volta para o menu de pausa.
  Sair da rota não pode deixar o rAF rodando.
- Recorde salvo: vitórias, partidas e melhor K/D.

## Fora do escopo (agora)

Plantar/desarmar bomba, economia, granadas, multiplayer online, celular, mais mapas, skins.

## Como trabalhar

1. Plano de implementação em tarefas pequenas antes de codar.
2. Branch `feat/block-strike`, com commits por etapa:
   - render + movimento + colisão;
   - armas;
   - bots;
   - regras de round;
   - menus e HUD;
   - integração e README.
3. Verificar no navegador a cada etapa e rodar os checks/smoke existentes do projeto.

## Critérios de aceite

- Do menu, dá para escolher a arma, começar e jogar até um time fazer 13.
- Bots andam pelo mapa, se encontram, trocam tiro e morrem.
- Aliados ajudam de verdade.
- Trocar de jogo no meio da partida não deixa áudio, loop ou pointer lock vazando.
- Os outros 6 jogos continuam funcionando.
- Roda liso num notebook comum.
