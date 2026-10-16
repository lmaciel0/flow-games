# Arcade Hub — Coletânea de 6 Jogos Offline 🎮🔥

Uma plataforma completa de jogos arcade, quebra-cabeças e desafios de lógica projetada para funcionar **100% localmente no seu navegador**, sem necessidade de internet, bibliotecas externas pesadas ou instalações complexas.

---

## 🕹️ Coleção de Jogos Inclusos

### 1. ❌⭕ Jogo da Velha (Força Máxima)
- **IA Minimax Invencível**:
  - Árvore de decisão matemática completa com **poda alfa-beta**.
  - No modo **Força Máxima**, é matematicamente impossível vencer a máquina (o melhor desfecho possível é o empate).
- **Outros Modos**: Difícil (85%), Médio (55%) e **2 Jogadores (Local)**.
- **Símbolo Selecionável**: Escolha jogar como **X** (primeiro) ou **O** (a IA faz a abertura estratégica como X).

### 2. 🔢 Jogo 2048
- **Clássico Numérico**: Deslize os blocos e funda potências iguais de 2 até atingir o bloco **2048**.
- **Controles**: Setas do teclado, teclas **W, A, S, D** ou gestos de toque/arraste no celular e mouse.
- **Botão Desfazer (Undo)**: Reverta o último movimento em caso de engano.
- **Recorde Persistente**: Salva o seu maior recorde no navegador via `localStorage`.

### 3. 🐍 Snake Neon (Cobrinha Retrô)
- **Visual Cyber Neon**: Cobrinha em degradê verde/ciano e rastro luminoso em HTML5 Canvas.
- **Frutas Bônus**: Maçãs douradas surgem esporadicamente concedendo pontos extras com contagem regressiva.
- **D-Pad Virtual**: Botões direcionais na tela para jogar confortavelmente em smartphones ou no mouse.

### 4. 💣 Campo Minado (Minesweeper)
- **Primeiro Clique 100% Seguro**: O algoritmo só distribui as minas após o seu primeiro clique, garantindo que você nunca comece perdendo.
- **Dificuldades**:
  - *Fácil*: 9x9 com 10 minas.
  - *Médio*: 12x12 com 22 minas.
  - *Difícil*: 14x14 com 36 minas.
- **Modos de Toque**: Alternador rápido entre **Abrir Casa ⛏️** e **Marcar Bandeira 🚩** (ou botão direito do mouse no desktop).

### 5. 🧱 Tetris Neon
- **Mecânica Autêntica de Tetris**: 7 tetrominós clássicos (I, J, L, O, S, T, Z) com iluminação vibrante.
- **Ghost Piece**: Projeção translúcida mostrando exatamente onde a peça vai aterrisar.
- **Previsão**: Mini-canvas mostrando a próxima peça.
- **Hard Drop e Aceleração**: Pressione espaço para queda instantânea, elimine linhas simultâneas para pontuações massivas.

### 6. 🔤 Jogo Termo (Palavra Secreta de 5 Letras)
- **Estilo Wordle Brasileiro**: Adivinhe uma palavra de 5 letras em português em até 6 palpites.
- **Feedback por Cores**:
  - 🟩 **Verde**: Letra certa na posição exata.
  - 🟨 **Amarelo**: Letra certa na posição incorreta.
  - ⬛ **Cinza**: Letra não existe na palavra.
- **Teclado Físico e Virtual**: Digite diretamente pelo teclado do computador ou toque nas teclas virtuais com memorização de cores.

---

## 🌟 Recursos Globais

- 🍔 **Menu Hambúrguer Lateral**: Alternância instantânea entre qualquer um dos 6 jogos sem recarregar a página.
- 🔊 **Web Audio API Natico**: Efeitos sonoros gerados dinamicamente por osciladores matemáticos locais (zero arquivos de áudio externos).
- 🎊 **Efeito de Confetes Nativos**: Partículas em Canvas em comemorações de vitória.
- 🌙 **Tema Cyberpunk & Glassmorphism**: Interface escura com painéis translúcidos e tipografia moderna.

---

## 🚀 Como Executar Localmente

### Pelo Navegador Direto (Sem Instalar Nada)
1. Abra a pasta `jogo da velha` na Área de Trabalho:
   `c:\Users\lucas.mendonca\Desktop\jogo da velha`
2. Dê um **duplo clique no arquivo `index.html`**.
3. Jogue direto no seu navegador preferido (Chrome, Edge, Firefox, Brave, Safari, etc.).

### Servidor Local Opcional
```bash
python -m http.server 8000
```
Acesse em: `http://localhost:8000/`
