# Arcade Hub

Sete jogos em **HTML, CSS e JavaScript puros**: sem build e sem framework. As únicas dependências são vendorizadas: o Three.js, usado só no Block Strike, e o `supabase-js`, usado só nas contas e no placar.

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
| **Block Strike** | FPS 5x5 contra bots em 3D (Three.js), com 3 dificuldades e rounds MR12 com troca de lados. Modo desarme: bombsites A e B, C4 que se planta e se desarma, terroristas e CTs que trocam no intervalo. Economia com menu de compra (armas, colete, kit, granadas), granadas flash, HE e smoke de blocos, faca, bots com rotas, mira humana, ouvido para passos e reação a flash e fumaça, radar, placar, espectador e treino livre. Tamanho Normal/Grande e tela cheia. Só para computador. |

Além dos sete jogos, o menu tem a página **Placar** (`#/placar`), que não conta como jogo.

## Contas e placar

O login é **opcional**: dá para jogar tudo sem conta. Quem cria uma conta (só **nome de usuário e senha**, sem e-mail) ganha:

- **Avatar** escolhido entre 8 ícones ou uma **foto** própria (reduzida para 128×128 no navegador antes do envio)
- **Progresso entre aparelhos** no Termo (vitórias e sequência) e no 2048 (recorde): ao entrar, o progresso do aparelho e o da conta se juntam e vale o maior
- **Placar compartilhado** do Termo (palavras acertadas) e do 2048 (maior pontuação), na página `#/placar` e num painel ao lado de cada um dos dois jogos, com a sua posição sempre visível

**Como criar uma conta:** abra o menu lateral, clique em **Entrar**, vá na aba **Criar conta**, escolha um nome (3 a 16 letras sem acento, números ou `_`), uma senha (pelo menos 6 caracteres) e o avatar.

**Limitações:**

- **Não há recuperação de senha.** A conta não tem e-mail; quem esquecer a senha precisa criar outra conta.
- O placar é feito para jogar **entre amigos**: o servidor confia nos números que o navegador envia, então não há proteção forte contra trapaça.
- **Sem conta, o progresso fica só neste aparelho.** Ao sair da conta, o progresso dela é apagado do aparelho (continua salvo na conta).

**Como funciona:** [Supabase](https://supabase.com) Auth (o nome de usuário vira um e-mail sintético `<usuario>@example.com`), Postgres com RLS (a leitura pública se limita aos perfis — nome e avatar — e ao placar; toda escrita no banco passa por funções RPC que usam a sessão de quem chama) e Storage para as fotos (cada pessoa só grava a própria). O `supabase-js` é vendorizado em `js/vendor/` e carregado com `import()` em segundo plano (se falhar, os jogos seguem funcionando), e o SQL completo do backend está em `supabase/schema.sql`. A Project URL e a chave publishable em `js/core/conta/config.js` são **públicas por design**: vão para o navegador de qualquer jeito, e o acesso é limitado pelas policies RLS.

## Destaques técnicos

- **JavaScript puro com ES modules**, zero dependências (exceto o Three.js, usado só no Block Strike, e o `supabase-js`, usado só nas contas, ambos vendorizados) e nenhuma etapa de build
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
| Armas | `1` primária, `2` pistola, `3` faca, `Q` última arma, roda do mouse |
| Comprar (só no início do round) | `1`–`9` e `0` compram os itens do menu (rifle, SMG, sniper, escopeta, colete, colete + capacete, kit, smoke, flash, HE) |
| Plantar / desarmar a C4 | segure `E` parado no bombsite (3,2 s) ou ao lado da C4 (10 s, 5 s com kit) |
| Granadas | `Z` flash, `X` smoke, `V` HE |
| Inspecionar a arma | `F` |
| Trocar a primária no treino | `B` e depois `1`–`4` |
| Placar | segure `Tab` |
| Espectador | clique do mouse para trocar de aliado depois de morrer |

**Partida:** começa com $800 e só a pistola. Cada abate paga conforme a arma (rifle e pistola $300, SMG $600, sniper $100, escopeta e faca $900); vencer o round dá $3250 e perder dá $1400, subindo $500 a cada derrota seguida até $3400. Quem sobrevive mantém o equipamento; morrer perde tudo. No round 13 os lados trocam e o dinheiro volta a $800. Os terroristas (laranja até o round 12, depois azul) plantam a C4 em A ou B; os CTs desarmam. Sem plantar, o tempo esgotado dá o round aos CTs; plantada, a C4 explode em 40 s. Quem anda correndo faz barulho que os bots ouvem a até 15 m; `Shift` e agachado são silenciosos.

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
    conta/            serviço de conta: cliente Supabase, config pública, validação, avatar
    conta-ui.js       menu de conta no drawer e modal Entrar / Criar conta / Trocar avatar
    placar-painel.js  painel de placar (ao lado do Termo e do 2048 e na página Placar)
  games/              tictactoe, game2048, snake, minesweeper, tetris, termo, blockstrike
    placar.js         página #/placar (não é um jogo)
  vendor/             Three.js e supabase-js (módulos e licenças)
  data/palavras.js    dicionário do Termo
supabase/schema.sql   tabelas, RLS, funções RPC e bucket de avatares do backend
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

Código sob licença [MIT](LICENSE). As fontes **Outfit** e **JetBrains Mono** são distribuídas sob a [SIL Open Font License 1.1](https://openfontlicense.org). O dicionário do Termo vem da lista de palavras do LibreOffice VERO pt-BR. O [Three.js](https://threejs.org) em `js/vendor/` é distribuído sob a licença MIT; o aviso está em `js/vendor/three-LICENSE`. O [supabase-js](https://github.com/supabase/supabase-js) em `js/vendor/` é MIT, assim como quase tudo o que vem empacotado com ele (o tslib usa a licença 0BSD); os avisos estão em `js/vendor/supabase-LICENSE`.
