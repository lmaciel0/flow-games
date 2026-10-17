# Block Strike — Recomendações e Melhorias (v1)

Documento de brainstorming e roadmap para o desenvolvimento do **Block Strike** (FPS 5x5 estilo CS2 em formato Roblox) dentro do **Arcade Hub** (`flow-games`).

Este plano respeita 100% a filosofia técnica do projeto:
- **HTML, CSS e JavaScript puros (ES Modules)**, sem bundler e sem frameworks.
- **Three.js vendorizado** como única dependência gráfica externa.
- **Áudio procedural sintetizado** com a Web Audio API (sem arquivos `.mp3`/`.wav`).
- **Alto desempenho** (meta de 60 FPS estáveis mesmo em GPUs integradas).

---

## 1. 🎯 Mecânicas Táticas de CS2 (A Alma do Jogo)

Atualmente o jogo opera como mata-mata por eliminação/tempo. Adicionar as mecânicas assinatura do CS2 transforma a dinâmica de partida:

### 1.1. Modo Desarme (C4 e Bombsites A e B)
- **Objetivo:**
  - O time Terrorista (laranja) tem a C4 em mãos de um jogador/bot sorteado no spawn.
  - O jogador com a C4 pode plantá-la segurando `E` ou o botão de tiro dentro dos limites demarcados dos Bombsites A e B.
  - Uma vez armada, inicia-se o cronômetro da C4 (40 segundos) com bipes sintetizados que aceleram progressivamente.
  - Os Contraterroristas (azul) precisam desarmar a C4 (10s sem kit, 5s com kit de defuse).
- **Impacto no jogo:**
  - Elimina empates passivos por fim de tempo.
  - Gera tensão dramática de fim de round e força rotações dinâmicas pelo mapa.

### 1.2. Granadas & Smoke Volumétrica em Blocos (A Marca Registrada do CS2)
- **Smoke Cúbica/Voxel:**
  - A granada de fumaça gera uma nuvem volumétrica formada por pequenos blocos semitransparentes.
  - **Mecânica interativa:** Disparos de balas através da fumaça ou explosões de granada HE dissipam temporariamente os cubos atingidos, abrindo "buracos" de visão por 2 segundos antes de a fumaça se recompor.
- **Flashbang:**
  - Cegueira temporária (overlay branco no canvas) proporcional ao ângulo de visão do jogador no momento da detonação.
  - Zumbido agudo sintetizado via Web Audio API (`OscillatorNode` senoidal de ~3.5 kHz com decay).
- **Granada HE:**
  - Granada de fragmentação com trajetória parabólica simples e quique nas paredes/chão.
  - Causa até 75 de dano em área com queda proporcional à distância da explosão.
- **Incendiária / Molotov:**
  - Cria poça de chamas em blocos no chão impedindo passagens por 7 segundos.

### 1.3. Sistema de Economia & Menu de Compra (Buy Wheel / Grade)
- **Dinâmica financeira:**
  - Saldo inicial de $800 no round de pistola.
  - Recompensas por kill ($300 rifle/pistola, $100 sniper, $900 escopeta/faca).
  - Bônus por vitória de round ($3250) e bônus progressivo por derrotas consecutivas ($1400 até $3400).
- **Equipamentos compráveis:**
  - Colete Kevlar ($650) e Colete + Capacete ($1000): reduz dano no peito e previne one-hit kill de pistolas na cabeça.
  - Kit de Desarme ($400) para CTs.
  - Granadas (Smoke $300, Flash $200, HE $300).
- **Interface:**
  - Menu de compra acionável com tecla `B` durante o freeze time (com interface em grid ou roda radial).

### 1.4. Drop e Coleta de Armas (`Tecla G / E`)
- Ao morrer ou ao pressionar `G`, a arma atual é ejetada para o chão com física AABB leve.
- Jogadores vivos podem pegar armas do chão passando por cima ou pressionando `E`.

---

## 2. 🧱 "Roblox Feel" & Juice Visual (Carisma e Feedback)

O estilo Roblox permite brincar com efeitos visuais marcantes sem sacrificar o desempenho:

### 2.1. Desmanche em Blocos ao Morrer (Morte Clássica de Roblox)
- Em vez de simplesmente ocultar o modelo ao morrer, os blocos do avatar (cabeça, tronco, 2 braços e 2 pernas) se soltam.
- Cada membro recebe um vetor de velocidade com gravidade simples e rotação aleatória, espalhando-se pelo chão.
- *(Opcional)* Efeito sonoro retrô clássico sintetizado via Web Audio API (o famoso som "Oof").

### 2.2. Rostos Expressivos Cúbicos
- Adição de textura procedural 2D mínima (16x16 ou 32x32 via canvas dinâmico) projetada na face frontal da cabeça cúbica.
- Expressões divertidas: sorriso nostálgico `:]`, cara de foco de combate ou óculos escuros.

### 2.3. Weapon Viewmodel Dinâmico
- **Weapon Sway (Inércia da Mira):** A arma em primeira pessoa inclina e atrasa suavemente com os movimentos rápidos do mouse.
- **Weapon Bobbing:** Balanço natural da arma sincronizado com os passos ao caminhar.
- **Animação de Recarga Visível:** O pente de blocos se desencaixa, desce e um novo pente é inserido no modelo 3D.
- **Inspecionar Arma (`Tecla F`):** Animação divertida girando ou inclinando a arma em primeira pessoa para admirá-la.

### 2.4. Sombra nos Pés (Blob Shadows)
- Projeção de um decalque circular sutil e translúcido no chão abaixo de cada jogador e bot.
- Traz enorme ganho de profundidade e ancoragem ao chão com custo zero de processamento de sombras dinâmicas.

---

## 3. 🤖 Inteligência dos Bots (Tática e Reação Humana)

A base com navegação em grafo A* pode ser expandida com comportamentos muito mais táticos:

### 3.1. Detecção Sonora de Passos
- Jogadores correndo (WASD normal) ou pulando emitem "ruído" com raio de alcance de ~15 metros.
- Bots próximos viram a mira em direção à origem do som.
- **Importância:** Valoriza diretamente o uso do `Shift` (andar silencioso), trazendo gameplay tático real.

### 3.2. Reação Tática a Granadas
- **Flashes:** Bots atingidos por flashbang ficam "cegos" por 2-3s (param de atirar com precisão ou recuam para cobertura).
- **Smokes:** Bots não atiram através de cortinas de fumaça a menos que tenham sofrido dano vindo de dentro dela.

### 3.3. Comportamento de Objetivo (C4)
- Bots Terroristas protegem o portador da C4 e preparam o plant no bombsite com menor presença inimiga.
- Bots Contraterroristas realizam rotação rápida para o bombsite onde a C4 foi plantada e cobrem o aliado que estiver defusando.

### 3.4. Rádio e Pings no Chat
- Chat de equipe com avisos automáticos dos bots:
  - *"Bot Tijolo: Inimigo avistado no Meio!"*
  - *"Bot Bloco: Plantando a C4 no Bombsite A!"*
  - *"Bot Cubo: Cobrindo a B!"*

---

## 4. 🗺️ Mapas e Variedade

### 4.1. Novo Mapa: "Mirage Block"
- Segundo mapa em blocos inspirado na icônica Mirage do CS:
  - Rota A (Palace, Caverna e Varanda).
  - Meio aberto com Conector e Janelão.
  - Rota B (Tapetes e Mercado).
- Seleção de mapa adicionada ao menu principal.

### 4.2. Modo "Aim Botz" (Treino de Mira Aprimorado)
- Expansão do modo treino livre para uma arena de tiro com:
  - Bots estáticos e móveis em distâncias variadas.
  - Marcador de KPM (Kills Por Minuto) e precisão de headshots.
  - Seletor rápido de qualquer arma do jogo.

### 4.3. Customizador Avançado de Mira
- Menu de configuração com ajustes finos:
  - Tamanho da mira, espessura dos traços, abertura (gap), opacidade e ponto central.
  - Pré-visualização em tempo real no menu.

---

## 5. 🌐 Multiplayer WebRTC P2P (Visão de Futuro)

- Implementação de multiplayer online cliente-a-cliente (P2P) usando **WebRTC / PeerJS**.
- Um jogador gera uma sala e compartilha um link/código de 4 letras com amigos.
- Partidas 1v1 ou 5v5 rodando diretamente no navegador sem necessidade de servidor backend dedicado.

---

## 6. 📊 Matriz de Priorização

| Nível | Melhoria | Impacto na Experiência | Complexidade Técnica |
|---|---|---|---|
| 🟢 **Quick Win** | Desmanche em blocos ao morrer + Som "Oof" | Alto (muito carismático e divertido) | Baixa |
| 🟢 **Quick Win** | Detecção sonora de passos (valoriza o `Shift`) | Alto (combate muito mais tático) | Baixa |
| 🟡 **Médio Prazo** | Granadas (Smoke cúbica expansível + Flashbang) | Enorme (mecânica assinatura CS2) | Média |
| 🟡 **Médio Prazo** | Modo Desarme (C4, Bombsites A e B) | Enorme (objetivo real de rodadas) | Média |
| 🟡 **Médio Prazo** | Sistema de Economia & Buy Menu | Alto (progressão tática de rounds) | Média |
| 🟡 **Médio Prazo** | Weapon Viewmodel Sway & Inspeção ('F') | Alto (sensação e peso das armas) | Média |
| 🔴 **Longo Prazo** | Segundo Mapa ("Mirage Block") | Alto (variedade de cenários) | Média-Alta |
| 🔴 **Longo Prazo** | Multiplayer WebRTC P2P | Revolucionário (jogar com amigos) | Alta |
