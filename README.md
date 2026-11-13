# Arcade Hub

Seis jogos em **HTML, CSS e JavaScript puros**: sem build e sem framework. A única dependência é vendorizada: o `supabase-js`, usado só nas contas e no placar.

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

Além dos seis jogos, o menu tem a página **Placar** (`#/placar`), que não conta como jogo.

**Block Strike** (FPS 5x5 contra bots em 3D) saiu do hub e vive em repositório e site próprios: [lmaciel0/blockstrike](https://github.com/lmaciel0/blockstrike), jogável em <https://blockstrike-three.vercel.app>. A home do hub mostra um card que abre o site em outra aba. As vitórias antigas do Block Strike continuam salvas e aparecem no Placar.

## Contas e placar

O login é **opcional**: dá para jogar tudo sem conta. Quem cria uma conta (só **nome de usuário e senha**, sem e-mail) ganha:

- **Avatar** escolhido entre 8 ícones ou uma **foto** própria (reduzida para 128×128 no navegador antes do envio)
- **Progresso entre aparelhos** em todos os jogos (vitórias e sequência do Termo, recordes de pontos, melhores tempos do Campo Minado, vitórias do Jogo da Velha; as vitórias antigas do Block Strike continuam na conta): no primeiro login de um aparelho, o progresso dele e o da conta se juntam e vale o melhor; depois disso o servidor manda, e o aparelho só lê o que está na conta
- **Placar compartilhado** de todos os jogos, na página `#/placar` (uma aba por ranking) e num painel ao lado de cada jogo, com a sua posição sempre visível:

  | Jogo | Ranking |
  |---|---|
  | Termo | palavras acertadas |
  | 2048, Snake, Tetris | maior pontuação |
  | Campo Minado | menor tempo, uma aba por nível (fácil, médio, difícil) |
  | Jogo da Velha | vitórias contra a IA (2 jogadores não conta) |
  | Block Strike | vitórias em partida (dados antigos, do tempo em que o jogo vivia no hub) |

**Como criar uma conta:** abra o menu lateral, clique em **Entrar**, vá na aba **Criar conta**, escolha um nome (3 a 16 letras sem acento, números ou `_`), uma senha (pelo menos 6 caracteres) e o avatar.

**Limitações:**

- **Não há recuperação de senha.** A conta não tem e-mail; quem esquecer a senha precisa criar outra conta.
- O placar é feito para jogar **entre amigos**: o servidor confia nos números que o navegador envia, então não há proteção forte contra trapaça.
- **Sem conta, o progresso fica só neste aparelho.** Ao sair da conta, o progresso dela é apagado do aparelho (continua salvo na conta).

**Como funciona:** [Supabase](https://supabase.com) Auth (o nome de usuário vira um e-mail sintético `<usuario>@example.com`), Postgres com RLS (a leitura pública se limita aos perfis — nome e avatar — e ao placar; toda escrita no banco passa por funções RPC que usam a sessão de quem chama) e Storage para as fotos (cada pessoa só grava a própria). O `supabase-js` é vendorizado em `js/vendor/` e carregado com `import()` em segundo plano (se falhar, os jogos seguem funcionando), e o SQL completo do backend está em `supabase/schema.sql`. A Project URL e a chave publishable em `js/core/conta/config.js` são **públicas por design**: vão para o navegador de qualquer jeito, e o acesso é limitado pelas policies RLS.

## Destaques técnicos

- **JavaScript puro com ES modules**, zero dependências (exceto o `supabase-js`, usado só nas contas, vendorizado) e nenhuma etapa de build
- **Registro de jogos:** cada jogo é um módulo que exporta um contrato (`mount`, `pause`, `resume`, `recorde`); a navegação não conhece nenhum jogo
- **Roteamento por hash** (`#/` e `#/<jogo>`) com deep link e botão voltar funcionando
- **Áudio sintetizado** com Web Audio API, sem arquivos de som
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
    conta/            serviço de conta: cliente Supabase, config pública, validação, avatar
    conta-ui.js       menu de conta no drawer e modal Entrar / Criar conta / Trocar avatar
    placar-painel.js  painel de placar (ao lado dos jogos e na página Placar)
  games/              tictactoe, game2048, snake, minesweeper, tetris, termo
    placar.js         página #/placar (não é um jogo)
  vendor/             supabase-js (módulo e licença)
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

Código sob licença [MIT](LICENSE). As fontes **Outfit** e **JetBrains Mono** são distribuídas sob a [SIL Open Font License 1.1](https://openfontlicense.org). O dicionário do Termo vem da lista de palavras do LibreOffice VERO pt-BR. O [supabase-js](https://github.com/supabase/supabase-js) em `js/vendor/` é MIT, assim como quase tudo o que vem empacotado com ele (o tslib usa a licença 0BSD); os avisos estão em `js/vendor/supabase-LICENSE`.
