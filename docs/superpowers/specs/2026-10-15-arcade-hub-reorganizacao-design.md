# Arcade Hub — Reorganização e evolução (design)

Data: 2026-10-15
Status: aguardando revisão

## 1. Objetivo e contexto

O Arcade Hub é uma página estática com 6 jogos (Jogo da Velha com minimax, 2048, Snake, Campo Minado, Tetris e Termo), escrita em HTML, CSS e JavaScript puros. O projeto será publicado no GitHub como peça de portfólio e servido por GitHub Pages.

O objetivo é reorganizar o código em uma estrutura modular e extensível, melhorar a experiência de navegação e persistência, e preparar o repositório para ser apresentado. Os critérios de sucesso são:

- Adicionar um jogo novo exige criar um módulo e registrá-lo em uma linha, sem editar a navegação.
- Todos os 6 jogos continuam funcionando como hoje.
- O repositório tem README de vitrine, licença e `.gitignore`, e está pronto para o GitHub Pages.
- O projeto continua sem dependências e sem etapa de build.

### Decisões já tomadas

- Abordagem A: JavaScript puro com ES modules, sem Vite, TypeScript ou Node. Vite e TypeScript ficam para uma fase posterior, se houver interesse.
- Escopo desta fase: registro de jogos, persistência unificada, home com cards, fonte local, recordes do Tetris e do Campo Minado, README, licença e `.gitignore`.
- Fora do escopo: PWA, TypeScript e testes automatizados, tema claro, jogos novos, imagem `og:image`.

## 2. Estado atual (resumo da análise)

- Arquivos soltos na raiz: `index.html` (594 linhas), `style.css` (1588), `app.js` (684), `game2048.js`, `snake.js`, `minesweeper.js`, `tetris.js`, `termo.js` e `palavras.js` (104 KB em 13 linhas).
- O `app.js` mistura áudio, confete, navegação e todo o Jogo da Velha.
- O acoplamento é por globais em `window` (`ArcadeAudio`, `triggerConfetti`, `SnakeGame`, `TetrisGame`, `Game2048`). A função `switchView` conhece cada jogo pelo nome.
- As chaves de `localStorage` não têm padrão: `jogodavelha_scores`, `2048_best_score`, `snake_best_score`, `termo_stats`. Tetris e Campo Minado não salvam recorde.
- O Google Fonts é carregado por CDN.
- O README cita um caminho de Windows e promete "100% offline".
- O repositório não tem commits, `.gitignore` nem licença.

## 3. Estrutura de pastas

```
index.html            casca mínima: header, drawer, <main id="app">, importa js/main.js
css/
  base.css            tokens, reset, tipografia, glass, @font-face
  layout.css          header, drawer, home, cards
  games/<id>.css      um arquivo por jogo
fonts/                Outfit e JetBrains Mono em woff2 (só os pesos usados)
js/
  main.js             boot: migração, registro dos jogos, home, navegação
  core/
    registry.js       lista de jogos e busca por id
    nav.js            roteamento por hash, drawer, pause/resume
    audio.js          ArcadeAudio (export, sem window)
    confetti.js
    storage.js        leitura/escrita com prefixo e migração
  games/              tictactoe.js, game2048.js, snake.js, minesweeper.js, tetris.js, termo.js
  data/palavras.js    export default { secretas, validas }
docs/                 specs e screenshots
README.md, LICENSE, .gitignore, favicon.svg
```

Todos os caminhos de assets e de imports são relativos, porque o GitHub Pages serve o site em `/<repositório>/`.

## 4. Contrato de jogo

Cada arquivo em `js/games/` exporta por padrão um objeto:

```js
{
  id: 'snake',
  nome: 'Snake Neon',
  icone: '🐍',
  descricao: 'Cobrinha clássica arcade',
  badge: { texto: 'ARCADE', cor: 'green' },
  mount(container, ctx),  // injeta o HTML do jogo e liga os eventos
  pause(),                // chamado ao sair do jogo
  resume(),               // chamado ao entrar no jogo
  recorde()               // texto para o card da home, ou null
}
```

- `ctx` entrega `{ audio, confetti, storage }`. O `storage` já vem com o escopo do jogo.
- Cada jogo carrega o próprio HTML em um template literal e o injeta no `mount`. O `index.html` cai de 594 para cerca de 40 linhas.
- Os `getElementById` globais passam a ser buscas dentro do `container`.
- Um jogo não acessa `window` nem conhece outros jogos.
- O `nav` não tem lógica por jogo: ele só chama `pause()` e `resume()` do registro.
- Para adicionar um jogo: criar `js/games/x.js`, criar `css/games/x.css` e adicionar uma linha de registro em `main.js`.

O `mount` é preguiçoso: o jogo é montado na primeira visita e depois apenas reexibido.

## 5. Persistência (`js/core/storage.js`)

```js
storage.get(chave, padrao)   // JSON.parse com try/catch; devolve padrao se falhar
storage.set(chave, valor)    // JSON.stringify com try/catch; falha silenciosa
storage.escopo('snake')      // { get, set } com prefixo `arcade:snake:`
```

Se o `localStorage` estiver bloqueado, os jogos funcionam normalmente e apenas não persistem.

### Chaves

| Chave nova | Formato | Origem |
|---|---|---|
| `arcade:tictactoe:placar` | `{x, o, ties}` | de `jogodavelha_scores` |
| `arcade:game2048:recorde` | número | de `2048_best_score` |
| `arcade:snake:recorde` | número | de `snake_best_score` |
| `arcade:termo:stats` | objeto atual | de `termo_stats` |
| `arcade:tetris:recorde` | número | novo |
| `arcade:minesweeper:recordes` | `{facil, medio, dificil}` com o menor tempo em segundos | novo |

### Migração

- Roda uma vez no boot, em `main.js`, antes de montar qualquer jogo.
- Para cada chave antiga, se a nova não existir, copia o valor convertido para o formato novo. As chaves antigas **não são apagadas**.
- A flag `arcade:migrado = 1` evita repetir a cópia a cada carregamento.

### Recordes novos

- **Tetris:** ao fim da partida, se `score` superar o recorde, salva e mostra "Novo recorde" no overlay. O recorde também aparece no painel do jogo.
- **Campo Minado:** ao vencer, compara `timeElapsed` com o recorde da dificuldade atual e salva o menor. O painel mostra o melhor tempo da dificuldade selecionada.
- **Home:** o `recorde()` de cada jogo lê do mesmo storage e alimenta o card (por exemplo "Recorde 1240", "Melhor 00:42 (fácil)", "Placar 3x1").

## 6. Navegação, home e tema

### Roteamento por hash

- `#/` mostra a home. `#/<id>` mostra o jogo correspondente.
- `nav.js` escuta `hashchange`, chama `pause()` no jogo que sai e `resume()` no que entra.
- Hash desconhecido volta para a home. O botão voltar do navegador funciona.

### Home

- Grid de cards gerado do registro: ícone, nome, descrição, badge e recorde. O card inteiro é um link `<a href="#/id">`.
- Topo com título e frase curta. Rodapé com link para o repositório no GitHub.
- Layout responsivo: 3 colunas no desktop, 2 no tablet, 1 no celular.

### Drawer

- Continua existindo, agora gerado do registro, com o item ativo vindo do hash e um item "Início" no topo.
- Mantém o toggle de som e o fechamento por Escape.
- Os textos "Jogos Offline" e "100% Offline" são trocados. O rodapé passa a dizer "6 jogos • feito em JS puro".

### Fonte local

- Outfit e JetBrains Mono em `woff2` em `fonts/`, declaradas com `@font-face` e `font-display: swap`. Saem os `preconnect` e o `<link>` do Google Fonts.
- Somente os pesos efetivamente usados no CSS entram. O uso real é conferido antes de baixar os arquivos.

### Tema e CSS

- Mantém o visual cyberpunk e glassmorphism atual. Não há redesenho.
- Os tokens (`--color-*`, `--surface-*`) vão para `base.css`. O `style.css` é dividido em `base.css`, `layout.css` e um arquivo por jogo, com os mesmos seletores.
- Tema claro não entra nesta fase.

### Acessibilidade e metadados

- `lang="pt-BR"`, foco visível nos cards e itens do drawer, `aria-current="page"` no item ativo.
- `prefers-reduced-motion` desliga as animações dos cards e o confete.
- `<title>`, `meta description`, `og:title`, `og:description` e `favicon.svg`.

## 7. README, repositório e publicação

### README (em português)

1. Título, descrição de uma linha e link da demo ao vivo (placeholder até a publicação).
2. Screenshot da home e GIF de um jogo, em `docs/screenshots/`. As imagens são capturadas pelo autor.
3. Lista dos 6 jogos com seus destaques.
4. Destaques técnicos: JS puro, ES modules, zero dependências, Web Audio sintetizado, Canvas, hash routing e registro de jogos.
5. Como rodar: `python3 -m http.server 8000`, com a nota de que `file://` não funciona por causa dos ES modules.
6. Estrutura de pastas.
7. Como adicionar um jogo.
8. Licença.

Saem do README o caminho de Windows e a promessa de "100% offline".

### Arquivos do repositório

- `.gitignore`: `.claude/`, `.DS_Store`, `node_modules/`, `*.log`.
- `LICENSE`: MIT, em nome de Roberto Lucas Maciel De Mendonça.

### Publicação

- GitHub Pages direto da branch `main`, pasta raiz, sem GitHub Action.
- O push, a criação do repositório remoto e a ativação do Pages são feitos pelo autor.

### Histórico git

- Primeiro, um commit baseline com o estado atual, para que a refatoração fique visível no histórico.
- Depois, commits pequenos por etapa: pastas e `core`, um commit por jogo, home, fonte local, README.

## 8. Riscos

- **Regressão ao mover o HTML para os módulos.** A troca de IDs globais por buscas no `container` é mecânica, mas é onde mais pode quebrar. Mitigação: migrar um jogo por vez e verificar cada um contra o checklist antes de seguir.
- **ES modules não funcionam em `file://`.** Mitigação: documentado no README. No GitHub Pages funciona normalmente.
- **Perda de recordes na migração.** Mitigação: as chaves antigas nunca são apagadas.

## 9. Verificação

Não há test runner nesta fase. A verificação é manual, rodando `python3 -m http.server`. Se houver um navegador headless disponível, um smoke test automatizado carrega cada rota e confere que não há erros no console.

### Checklist geral

- Carrega sem erros no console.
- Abre cada jogo por hash e pelo drawer.
- `pause` e `resume` funcionam ao trocar de jogo (Snake e Tetris não continuam rodando em segundo plano).
- O som liga e desliga. O confete aparece nas vitórias.
- Layout correto no desktop e a 360 px, sem rolagem horizontal.

### Dados

- Com o `localStorage` pré-populado com as chaves antigas, os recordes aparecem na home e nos jogos após a migração, e as chaves antigas continuam presentes.
- O recorde do Tetris é salvo ao fim da partida.
- O melhor tempo do Campo Minado é salvo por dificuldade.
- Com o `localStorage` bloqueado, os jogos funcionam sem erro.

### Por jogo

- **Jogo da Velha:** Força Máxima nunca perde; modo 2 jogadores; escolha de X e O.
- **2048:** movimento, merge, game over e vitória.
- **Snake:** fruta bônus, D-pad e game over.
- **Campo Minado:** primeiro clique seguro, bandeira, três dificuldades.
- **Tetris:** rotação, hard drop, ghost piece, próxima peça e game over.
- **Termo:** cores do teclado, palavra inválida, estatísticas.
