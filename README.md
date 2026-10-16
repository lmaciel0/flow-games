# Arcade Hub

Seis jogos clássicos em **HTML, CSS e JavaScript puros**: sem dependências, sem build, sem framework.

**Demo:** _em breve_ (GitHub Pages)

<!-- Capturas: salvar em docs/screenshots/ e referenciar aqui.
![Home do Arcade Hub](docs/screenshots/home.png)
-->

## Jogos

| Jogo | Destaques |
|---|---|
| **Jogo da Velha** | IA minimax com poda alfa-beta: no modo Força Máxima é impossível vencer (o melhor resultado é empate). Também tem Difícil, Médio e 2 jogadores, e você escolhe jogar de X ou de O. |
| **2048** | Teclado (setas ou WASD) e gestos de arrastar, botão desfazer e recorde salvo. |
| **Snake Neon** | Canvas com visual neon, maçãs douradas bônus que somem depois de alguns passos e D-pad virtual para celular. |
| **Campo Minado** | Primeiro clique sempre seguro, três dificuldades, modo bandeira para toque e melhor tempo salvo por dificuldade. |
| **Tetris Neon** | Os 7 tetraminós, peça fantasma, próxima peça, hard drop, níveis e recorde salvo. |
| **Termo** | Palavras de 5 letras em 6 tentativas, dicionário pt-BR com cerca de 10 mil palavras, teclado com cores e estatísticas salvas. |

## Destaques técnicos

- **JavaScript puro com ES modules**, zero dependências e nenhuma etapa de build
- **Registro de jogos:** cada jogo é um módulo que exporta um contrato (`mount`, `pause`, `resume`, `recorde`); a navegação não conhece nenhum jogo
- **Roteamento por hash** (`#/` e `#/<jogo>`) com deep link e botão voltar funcionando
- **Áudio sintetizado** com Web Audio API (osciladores, sem arquivos de som)
- **Canvas 2D** para Snake, Tetris e confete
- **Persistência tolerante a falhas:** chaves `arcade:<jogo>:<chave>`, migração das chaves antigas sem apagá-las, e os jogos seguem funcionando se o `localStorage` estiver bloqueado ou corrompido
- Responsivo até 360 px, foco visível, `aria-current` na navegação e animações dos cards e confete desligadas com `prefers-reduced-motion`

## Como rodar

Os ES modules não carregam via `file://`, então sirva a pasta com qualquer servidor estático:

```bash
python3 -m http.server 8000
```

Depois abra <http://localhost:8000>.

## Estrutura

```
index.html            casca mínima: botão de menu, drawer e <main id="app">
css/
  base.css            tokens, reset, glass, @font-face
  layout.css          drawer, home e cards
  games/<id>.css      um arquivo por jogo
fonts/                Outfit e JetBrains Mono (woff2, subset latin)
js/
  main.js             boot: migração, registro dos jogos, navegação
  core/               registry, nav, storage, audio, confetti
  games/              tictactoe, game2048, snake, minesweeper, tetris, termo
  data/palavras.js    dicionário do Termo
docs/                 specs, planos e capturas de tela
```

## Como adicionar um jogo

1. Criar `js/games/meujogo.js` exportando por padrão:

   ```js
   export default {
     id: 'meujogo',
     nome: 'Meu Jogo',
     icone: '🎲',
     iconeClasse: '',
     descricao: 'Uma linha sobre o jogo',
     badge: { texto: 'NOVO', cor: 'green' },
     mount(raiz, { audio, confetti, storage }) { /* injeta o HTML em raiz e liga os eventos */ },
     pause() {},   // chamado ao sair da rota
     resume() {},  // chamado ao entrar na rota
     recorde(storage) { return null; }  // texto para o card da home, ou null
   };
   ```

2. Criar `css/games/meujogo.css` e linká-lo no `index.html`.
3. Em `js/main.js`, importar o módulo e adicionar `registrar(meujogo);`.

## Créditos e licença

Código sob licença [MIT](LICENSE). As fontes **Outfit** e **JetBrains Mono** são distribuídas sob a [SIL Open Font License 1.1](https://openfontlicense.org). O dicionário do Termo vem da lista de palavras do LibreOffice VERO pt-BR.
