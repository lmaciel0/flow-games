# Placar e progresso para todos os jogos — plano

Estende `feat/contas-placar`: Snake, Tetris, Campo Minado, Jogo da Velha e Block Strike entram no placar compartilhado e no progresso entre aparelhos, como já valem Termo e 2048. Substitui o não-objetivo "Não integrar os outros jogos" do spec `2026-10-20-contas-placar-design.md`.

## Decisões

Pedido do dono: incluir todos os jogos nesta branch. Os critérios de ranking foram deixados para mim ("decide você"); são **escolhas minhas**:

| Jogo | `jogo` no placar | Ranking | Local (storage) |
|---|---|---|---|
| Snake | `snake` | maior pontuação | `snake:recorde` |
| Tetris | `tetris` | maior pontuação | `tetris:recorde` |
| Campo Minado | `minas_facil`, `minas_medio`, `minas_dificil` | **menor** tempo em segundos, uma aba por nível | `minesweeper:recordes` (`{facil, medio, dificil}`) |
| Jogo da Velha | `velha` | vitórias do jogador contra a IA (não conta o lado O/X nem empate) | `tictactoe:vitorias` (novo; o `placar` X×O existente não muda) |
| Block Strike | `blockstrike` | vitórias de partida; `extra` guarda partidas e melhor K/D | `blockstrike:vitorias`, `:partidas`, `:melhorKD` |

- Painel lateral nos jogos com espaço (Snake, Tetris, Campo Minado, Jogo da Velha). Block Strike é tela cheia: só na página `#/placar`.
- A página `#/placar` ganha uma aba por ranking (9 no total).
- Sync de login: nova RPC `sincronizar_progresso_v2(p_progresso jsonb)`. A antiga (`sincronizar_progresso(int,int,int)`) fica, para o site em produção continuar funcionando até o deploy do cliente novo.
- Mescla no sync: pontuação = maior; tempo do Minas = menor positivo; Termo e Block Strike = lado com mais vitórias (empate: mais streak / mais partidas), `melhorKD` = maior.
- Logout limpa também as chaves novas (mesma regra do spec: aparelho compartilhado não vaza progresso).
- Anti-fraude: só limites de faixa nas RPC (o dono já aceitou o risco).

## Tarefas

1. **Backend**: migração aditiva (`placar_todos_os_jogos`) + `supabase/schema.sql`. Amplia o check de `placar.jogo`; ordem crescente para `minas_*` em `ler_placar` e `minha_posicao`; RPC `registrar_pontos(p_jogo, p_pontos)`, `registrar_tempo_minas(p_nivel, p_segundos)`, `registrar_vitoria_velha()`, `registrar_partida_blockstrike(p_venceu, p_kd)`, `sincronizar_progresso_v2`. Verificar por SQL em transação com rollback.
2. **Cliente e conta** (`cliente.js`, `conta/index.js`): `rpcDoEvento` com os novos eventos; `sincronizar` via v2; `lerLocal`/`gravarLocal` e limpeza de todas as chaves.
3. **Painel e página**: formato `tempo` (m:ss) no painel; `placar.js` com as 9 abas (barra de abas rolável no celular); CSS.
4. **Jogos**: ganchos `conta.registrar` e recarga no evento `progresso` em Snake, Tetris, Campo Minado, Jogo da Velha, Block Strike; painel lateral onde couber.
5. **Testes e docs**: atualizar harness em `~/arcade-tools/conta` (`cliente.test`, `conta.test`, `ganchos`, `placar`, `backend`), README e spec.
