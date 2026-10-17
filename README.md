# Arcade Hub

Sete jogos em **HTML, CSS e JavaScript puros**: sem build e sem framework, e a única dependência é o Three.js vendorizado, usado só no Block Strike.

**Demo:** <https://flow-games-tau.vercel.app>

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
| **Block Strike** | FPS 5x5 contra bots em 3D (Three.js), com 3 dificuldades, rounds MR12 com troca de lados, loadout a cada round, 4 armas primárias, faca corpo a corpo, velocidade que depende da arma, bots com rotas e mira humana, radar, placar, modo espectador e treino livre sozinho no mapa. Tamanho Normal/Grande e tela cheia. Só para computador. |

## Destaques técnicos

- **JavaScript puro com ES modules**, zero dependências (exceto o Three.js vendorizado, usado só no Block Strike) e nenhuma etapa de build
- **Registro de jogos:** cada jogo é um módulo que exporta um contrato (`mount`, `pause`, `resume`, `recorde`); a navegação não conhece nenhum jogo
- **Roteamento por hash** (`#/` e `#/<jogo>`) com deep link e botão voltar funcionando
- **Áudio sintetizado** com Web Audio API, sem arquivos de som (no Block Strike: ruído filtrado, pan estéreo e abafamento pela distância)
- **Canvas 2D** para Snake, Tetris e confete
- **WebGL com Three.js** no Block Strike, carregado sob demanda (`import()`) só quando você clica em Jogar; as regras, a física, a navegação e os bots são módulos puros testáveis em Node
- **Persistência tolerante a falhas:** chaves `arcade:<jogo>:<chave>`, migração das chaves antigas sem apagá-las, e os jogos seguem funcionando se o `localStorage` estiver bloqueado ou corrompido
- Responsivo até 360 px, foco visível, `aria-current` na navegação e animações dos cards e confete desligadas com `prefers-reduced-motion`

## Controles do Block Strike

| Ação | Tecla |
|---|---|
| Mover | `W` `A` `S` `D` |
| Mirar | mouse (o clique em Jogar prende o cursor; `Esc` solta e pausa) |
| Atirar / luneta | botão esquerdo / botão direito (sniper) |
| Faca | botão esquerdo = golpe leve (40, 90 pelas costas) / botão direito = estocada (65, 180 pelas costas) |
| Pular / agachar / andar em silêncio | `Espaço` / `C` / `Shift` |
| Recarregar | `R` (o pente vazio recarrega sozinho) |
| Armas | `1` primária, `2` pistola, `3` faca, `Q` última arma, roda do mouse (no início do round, `1`–`4` escolhem a primária) |
| Trocar a primária no treino | `B` e depois `1`–`4` |
| Placar | segure `Tab` |
| Espectador | clique do mouse para trocar de aliado depois de morrer |

Com a faca o boneco corre mais (6,2 m/s); pistola 5,8, SMG 5,6, escopeta 5,3, rifle 5,1 e sniper 4,8 (mais lenta ainda com a luneta). Trocar de arma leva um instante para sacar.

O menu escolhe o modo (Partida 5x5 ou Treino livre), a mira, o volume e o tamanho do palco (Normal, Grande ou Tela cheia). Sair da rota pausa a partida e o botão Continuar retoma.

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
  games/              tictactoe, game2048, snake, minesweeper, tetris, termo, blockstrike
  vendor/             Three.js (módulo minificado e licença)
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

Código sob licença [MIT](LICENSE). As fontes **Outfit** e **JetBrains Mono** são distribuídas sob a [SIL Open Font License 1.1](https://openfontlicense.org). O dicionário do Termo vem da lista de palavras do LibreOffice VERO pt-BR. O [Three.js](https://threejs.org) em `js/vendor/` é distribuído sob a licença MIT; o aviso está em `js/vendor/three-LICENSE`.
