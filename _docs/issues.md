# 🐛 Issues Conhecidas

> **Contém:** `BUG-`, `SEC-` e `REGRESSÃO-` (em investigação e
> corrigidos), com sintoma, causa e correção, e `NOTA-` (limpezas que não
> são bug, pendentes e concluídas). **Não contém:** melhorias que não são
> defeito (→ `roadmap.md`). Os da migração inicial (Fases 0–7: BUG-001 a
> BUG-007, REGRESSÃO-001/002, SEC-001/002, ESCLARECIMENTO-001) estão
> resumidos em `../CHANGELOG.md`.

Os nomes de função e de campo citados nos registros anteriores a
05/10/2026 (ex.: `validarPedidoAssessoria()`, `rankingFinal`) são os de
antes da tradução dos identificadores para o inglês (Fase E); o
glossário de `conventions.md` dá o nome atual.

---

## Em investigação

**BUG-031 — Página de teste de conexão: quem entrou continua "na sala"
depois de o dono sair.** No M21 na UFSM (20/10/2026), o computador
(dono) clicou em "Sair da sala" e a sala foi apagada, mas o celular
continuou mostrando "🟢 Conectado" e a sala; só ao sair e tentar entrar de
novo apareceu "sala não encontrada". Local: `js/network/connectionCheck.js`
(a página não escuta a sala ser apagada). Só na página
`firebase-check.html`: o jogo avisa todos com `session-ended`. Reproduzir:
M21, passo 8, olhando a tela do celular.

**BUG-035 — Quem volta e cai como Perguntador numa dupla reaberta fica
sem a pergunta.** No M18.1 em casa (26/10/2026), o Chrome voltou à sala
como jogador comum depois de uma troca de host e era o Perguntador da
dupla guardada que reabriu: o console dele mostrou "❌ Erro ao tratar
onMessage do canal da sala: TypeError: Cannot set properties of null
(setting 'question')" às 16:05:37 e às 16:23:59, e a pergunta "foi
sozinha" pelo prazo do Perguntador. Local: o `case 'question'` de
`handleMessage()` (`network/messageHandler.js`) grava a pergunta em
`state.currentRound` sem conferir se a rodada existe. Causa: o host manda
o `round-start` pela fila de todos e a pergunta (com o gabarito) pela
caixa do Perguntador (`startPair()`, `engine/turnEngine.js`); quem acabou
de entrar começa a ler a fila a partir do cursor do `state-sync`, e a
caixa chega antes — às 16:05:37 a pergunta chegou antes do `round-start`
(o `state-sync` era o da espera, sem rodada); às 16:23:59 o host reabriu
a dupla pelo sinal de vida, antes do `player-join`, e a pergunta chegou
antes do `state-sync`. Para quem joga: o Perguntador fica sem a pergunta
na tela e não consegue fazê-la. Reproduzir: M18.1 com o host na dupla
(troca de host com a dupla guardada que reabre para o host antigo).

---

## Limpeza pendente (não é bug)

**NOTA-009 — nomes em português que sobraram no código.** A regra é nome
em inglês e texto em português (`conventions.md`, "Nomenclatura"), mas
sobraram nomes em português fora do `js/`, e uma troca automática da
Fase E alcançou um texto. Achado em 06/10/2026, na reorganização dos
documentos. Para quem joga, nada muda; é frente própria, porque mexe no
Actions:
- **Workflows:** os arquivos `testes.yml` e `simulacao.yml`; os IDs dos
  jobs (`testes`, `ponta-a-ponta`, `simulacao`); os artefatos
  (`resultado-testes`, `relatorio-ponta-a-ponta`, `simulacao`); os IDs dos
  campos do formulário da simulação (`partidas`, `jogadores`,
  `semente`...) e as variáveis de ambiente (`PARTIDAS`...`CENARIO_B`).
- **Simulador:** a pasta gerada `simulacao/` (também no `.gitignore`) e
  os arquivos `relatorio.md`, `partidas.csv` e `partidas-cenario-b.csv`
  (`tests/simulation/run.js`), a lista de campos lida do ambiente e as
  colunas do CSV (`partida`, `jogador`, `ajudas_pedidas`...; as novas,
  como `rewards_received`, já entram em inglês) em `toCsv()`.
- **Títulos de teste:** E1 e E4 (`tests/browser/connection.spec.js`)
  dizem "no meio da question" em vez de "no meio da pergunta".
- Os textos que aparecem na tela do Actions (`name:` e `description:`)
  continuam em português.

**NOTA-010 — pedido de entrada repetido na volta da conexão.** No M7.1 em
casa (24/10/2026), a volta do celular depois do modo avião mandou o
`player-join` duas ou três vezes em poucos segundos (console do host:
"🔄 Reconectado: Celular" às 16:18:15, 16:18:15 e 16:18:21). O guest pede
para entrar de novo por dois caminhos na mesma volta: a própria conexão
voltou (`onReconnected`) e ele vê o host "voltar" (`showHostPresence()`,
`network/roomLink.js`), porque sem conexão o sinal do host pareceu
parado. Cada pedido só manda o estado de novo (`state-sync`); para quem
joga, nada muda. Frente própria: mandar um pedido só por volta.
O mesmo aparece sem queda nenhuma: "🔄 Reconectado: edge" no console do
host com o Edge conectado (24/10/2026, 16:04, 16:06 e 16:26); o celular
e o Edge juntos, 5 s depois de um pedido de assessoria (26/10/2026,
15:51:01–02); o Edge recebendo o estado de novo às 16:22:44 (26/10); e,
na troca de host, o Chrome pedindo para entrar três vezes seguidas no host
novo (26/10, 16:52:51). Investigar junto: o que faz o guest pedir para
entrar com a conexão de pé.

---

## Corrigidos

Da Fase 8 em diante. Cada correção a partir da Fase D veio com teste
automatizado — os números (T…, E…) são os de `tests/logic` e
`tests/browser`; o mapa dos casos de conexão está em `connection-tests.md`.

| ID | Sintoma | Causa | Correção |
|---|---|---|---|
| REGRESSÃO-003 | Quem entrasse no meio de uma rodada receberia o gabarito no `state-sync` (detectado antes de chegar a quem joga) | Na troca do schema das perguntas para o inglês (Fase 8: `correta` → `correct`), a blindagem do gabarito em `addPlayer()` (`network/messageHandler.js`) continuou apagando o campo antigo: `{...spread, correta: undefined}` cria um campo novo e deixa o `correct` com a resposta | `correta: undefined` → `correct: undefined` no mesmo ponto (Fase 8) |
| SEC-003 | Alguém entrando com o nome do host tomava o lugar dele na lista | `addPlayer()` tratava o nome do host como reconexão (o host não tem conexão consigo mesmo) | D1a: nome do host sempre "em uso" (`name-taken`) — T3b |
| SEC-004 | Quem soubesse o nome de um jogador desconectado entrava no lugar dele e herdava KPI, recursos e fase | Reconexão conferia só o nome | D2: token de identidade por sala; o host guarda só o hash e exige o mesmo token (`identity-mismatch`) — T22–T29 |
| SEC-005 | Quem entrava ou voltava à sala podia abrir o console (F12), digitar `Game.state.decks` e ler a resposta certa de qualquer pergunta da partida; o estado trazia também a resposta guardada de quem responde, esperando o apoio (achado em 17/10/2026, ao desenhar a etapa 2 do roadmap 2.9) | O `state-sync` de `addPlayer()` (`network/messageHandler.js`) levava `decks: state.decks` (cada baralho com as perguntas inteiras, com `correct`) e a rodada com `pendingAnswer`; o guest nunca usa os baralhos — o campo ficou desde que o `state-sync` levava o estado inteiro | Etapa 2b do roadmap 2.9: o `state-sync` vai sem os baralhos e com a rodada como quem entra pode vê-la (`roundAsSeenBy()`: sem `pendingAnswer`; gabarito só para o Perguntador); o guest continua com os baralhos que montou — T186 (ajustes no T79 e no T80) |
| BUG-008 | Troca de host falhava: o guest que tentava achar a sala nova perdia a própria conexão | Qualquer erro do PeerJS (inclusive o esperado `peer-unavailable`) destruía o peer local | D1b: depois de aberto, erro não destrói mais o peer; tentativa sem peer conta como falha — T19, T20 |
| BUG-009 | Rodada travada depois da troca de host | O novo host continuava uma pergunta sem ter o gabarito | D1b: sem gabarito, a pergunta é descartada e a partida segue com o mesmo evento — T21, T21b |
| BUG-010 | Relógio de quem reconectava andava de 10 em 10 segundos | A contagem local só era ligada no início da partida | D2b: `startClock()` também na reconexão — T30, T31 |
| BUG-011 | Quem reconectava via de novo uma pergunta já respondida | O `state-sync` não dizia se a rodada estava encerrada, pausada ou entre duas duplas | D2b: `state-sync` leva a situação da rodada — T32–T34 |
| BUG-012 | Erro "cannot reconnect" 3s depois de assumir como host | O aviso de desconexão do peer antigo mandava reconectar o peer novo | D3c: só reconecta o peer em uso e de fato desconectado — T46 |
| BUG-013 | Depois de uma troca de host, entrar pela tela inicial dava "Sala não encontrada" | A procura olhava só o ID base da sala (a sala muda para `-h1`, `-h2`...) | D3c: procura o ID base e as versões seguintes ao mesmo tempo — T44, T45, T47 · E3 |
| BUG-014 (B1) | Depois de um "Sair da partida", o host não conseguia iniciar outra com 2 jogadores | "Voltar ao lobby" não zerava a marca de "aguardando no lobby" | D3d: voltar ao lobby zera os jogadores — T48 · E8 |
| BUG-015 (B2) | Depois de uma troca de host, uma rodada nova começava sozinha ou alguém respondia duas vezes | Só o host sabia quem já tinha respondido na rodada | D3e: todos recebem a lista (`respondidos`) — T35, T49–T52 · E4, E5 |
| BUG-016 (B3) | F5 do host com a rodada encerrada: telas erradas ("Aguardando início da rodada...", última dupla como em andamento) | "Rodada encerrada" não era salvo; a retomada reabria a última rodada | D3f: estado salvo leva a situação; `resumeMatchAfterReload()` — T53, T57 · E9 |
| BUG-017 (B4) | F5 do host logo depois de uma resposta: partida travada | O aviso para seguir à próxima dupla (3s depois) se perdia com a página | D3f: a retomada segue para a próxima dupla, encerra a rodada ou encerra a partida — T54, T58 · E10 |
| BUG-018 (B5) | F5 do host com a partida pausada: outro evento sorteado, efeitos reaplicados | A pausa não era salva | D3f: continua pausada com o mesmo evento — T55, T57 · E11 |
| BUG-019 | F5 do host com um pedido de assessoria sem resposta: rodada presa (quem responde com os botões travados, "Nova Rodada" bloqueado) até acabar o tempo da partida | O prazo de 20s do assessor (`setTimeout`) se perdia com a página, e o assessor perdia a pergunta ao reconectar (a reconexão fecha os modais); a resposta ficava guardada esperando para sempre | Na Fase D, o F5 cancelava o pedido pendente (pela conexão direta, quem foi chamado perdia a pergunta). Desde a etapa 2b do roadmap 2.9 (estado no banco), o pedido continua: o prazo de quem foi chamado conta pela hora de término guardada (vencido no F5, recusa por tempo na retomada), quem foi chamado recebe a pergunta do apoio de novo ao voltar (o host chamado, na retomada), e a resposta guardada é processada quando o apoio chega — T59, T60, T122, T187 · E29 |
| BUG-020 | F5 do host fora da dupla com a pergunta aberta: o host via a área da pergunta em vez de "Fulano pergunta para Beltrano"; as etiquetas de domínio e área ficavam vazias depois do F5 do host e para quem voltava à partida | A retomada não olhava o papel do host; a pergunta guardada na rodada (estado salvo, `state-sync`) não tinha os nomes de domínio e área — só a mensagem `question` tinha | A retomada mostra a tela de espectador fora da dupla; a pergunta da rodada guarda domínio e área — T64, T65 |
| BUG-021 | F5 na tela de fim de jogo: o host voltava à tela de jogo e, se a partida tinha acabado por alguém completar a última fase, uma dupla nova era sorteada e ela recomeçava; o guest era recusado ("a partida desta sala já começou") e voltava à tela inicial | O fim de jogo não era gravado no estado salvo nem ia no `state-sync`; a sala continuava travada para nomes novos depois do fim (e quem cai no fim de jogo sai da lista) | Estado salvo e `state-sync` levam `gameOver` e o ranking final (`rankingFinal`); `showGameOver()` no F5 e na volta; depois do fim de jogo a sala não fica travada — T66, T67, T68 |
| BUG-022 | Pedido de ajuda e assessoria com quem caiu: quem pediu esperava 20s por cada jogador caído na fila, e a fila seguia (podendo transferir recurso) mesmo depois de quem pediu cair; o assessor caído recebia a pergunta e quem respondia ficava 20s com os botões travados | `tradeEngine` e `validarPedidoAssessoria()` olhavam só `waitingInLobby`, não `disconnected` | Quem caiu é pulado na fila; se quem pediu cai, o pedido é cancelado sem transferir nada; assessor caído é recusado na hora — T69, T70 |
| BUG-023 | O aviso "pedindo ajuda para…" mostrava nomes com `&` ou `<` como "Ana &amp; Bia" | `showHelpCandidate()` escapava o nome para HTML e o mostrava com `textContent` (escape duplo) | Nome mostrado direto com `textContent` — T71 |
| BUG-024 | Dois pedidos de ajuda ao mesmo tempo: o segundo apagava o primeiro sem aviso, e a doação aceita para o primeiro ia para o segundo (que pagava os 10 KPI) | `handleHelpRequest()` (`engine/tradeEngine.js`) montava uma fila nova sem olhar a que estava em andamento; `handleHelpOfferResponse()` conferia só quem respondia, não para quem era a oferta | Um pedido por vez: quem pede durante o de outro é recusado na hora com aviso (`request-in-progress`, texto `trade.helpBusy`); quem pede de novo durante o próprio vê com quem o pedido está, sem a fila recomeçar; a resposta à oferta leva `requesterName` e só vale para o pedido em andamento (protocolo 7) — T103–T106 |
| BUG-025 | Entre 769 e 1200 px de largura, os chips de KPI e de recursos (com o rótulo "Estouro" e o valor negativo) saíam do card do jogador; acima de 1200 px já encostavam na borda (achado em 14/10/2026, ao redimensionar a janela) | `.stats-row` (`css/style.css`) era flex sem quebra de linha, e os chips não encolhem abaixo do conteúdo; a coluna do card encolhe para 220 px nessa faixa | `.stats-row` com `flex-wrap: wrap`: o chip que não cabe desce para a linha de baixo — E20 |
| BUG-026 | No celular (e em notebook com pouca altura), a janela "Sua vez de responder!" ficava mais alta que a tela, sem rolagem: topo e fim cortados, e o botão de assessoria ou de ajuda podia ficar fora do alcance | `.modal-card` é `position: fixed` centralizada, sem altura máxima nem rolagem | Toda janela (`.modal-card`) fica no máximo da altura da tela (`100dvh`, com `100vh` para navegador antigo) menos 32 px e rola por dentro — E21 |
| BUG-027 | No celular, o detalhe de cada jogador no ranking final dividia a linha com posição, nome e KPI Final: virava uma coluna estreita, e o nome quebrava em três linhas | `.final-rank-item` era flex sem quebra de linha, e o `.final-rank-detail` entrava como quarto item da linha | `.final-rank-item` com `flex-wrap: wrap` e o detalhe com `flex-basis: 100%`: fica numa linha própria, abaixo do nome — E22 |
| BUG-028 | Com a assessoria ou a ajuda pendente, o contador de quem responde continuava descendo e podia chegar a 0 (relatado na partida de teste da UFSM, 15/10/2026); no fim do apoio, o prazo voltava inteiro | O host parava o prazo (`handleAdvisoryRequest()`, `engine/advisoryEngine.js`) e rearmava o prazo inteiro no fim; `showAdvisoryStarted()` (`ui/modals/advisoryModal.js`) não parava o contador da tela, e `showAdvisoryResult()` não o religava | O host guarda o que faltava (`pauseAnswerTimeout()`, `answerTimeLeft`) e continua dele; o `advisory-started` para o contador e o `advisory-result` o religa do tempo que faltava (protocolo 9) — T134, T135 |
| BUG-029 | Com a janela da partida abaixo de 1200 px de largura (notebook com a janela pela metade, tablet, celular), o card "🏆 Ranking" e o "👥 Jogadores" desapareciam: quem jogava não via a classificação nem quem estava desconectado (📴) (achado em 19/10/2026, ao estreitar a janela no teste M22) | `.sidebar-right { display: none; }` no `@media (max-width: 1200px)` de `css/style.css`: a coluna esquerda e a área da pergunta se ajustavam, a direita era escondida | Entre 769 e 1200 px, ranking e jogadores ficam abaixo da área da pergunta, lado a lado enquanto couberem, com o perfil na coluna da esquerda; no celular, uma coluna: pergunta, perfil, "Nova Rodada", ranking e jogadores e, no fim, "Sair da Partida" e "Encerrar Partida" (`grid-template-areas` e, no celular, a coluna do perfil em `display: contents` com `order`) — E37 |
| BUG-030 | Jogador com a página aberta aparecia como desconectado (📴) para o host e ficava fora do sorteio até dar F5, mesmo jogando com a janela visível (achado no M22 em casa, 19/10/2026: depois de uma troca de host, o host antigo, agora jogador comum, ficou 📴 com as duas janelas lado a lado; o `lastSeen` dele em `rooms/<sala>/presence` andava a cada 2 s) | O host só tratava a presença que cai (`receivePresence()`, `network/roomLink.js`, ignorava `online = true`); quem foi dado como caído só voltava mandando `player-join`, e o guest só manda quando a conexão dele cai e volta, quando o host volta ou na troca de host. Com o sinal parado sem a conexão cair (janela escondida por mais de 5 min, com o timer do sinal de minuto em minuto) e depois de volta, nada trazia o jogador de volta | O host traz de volta quem tinha dado como caído quando o sinal volta (`handlePlayerReturn()`, `network/messageHandler.js`: sai do 📴, `player-list` para todos, retoma a partida pausada, salva; sem `state-sync`). No canal (`checkPresence()`, `network/roomChannel.js`), a volta exige o sinal online e novo de verdade (a carência da volta da conexão do host não conta) e dois sinais seguidos no ritmo — a aba escondida não fica indo e voltando; na primeira leitura, quem está offline com o sinal recente fica em espera. Protocolo 12 e estado salvo 9 iguais — T205–T208 (ajustes no T189 e no T190) · E38 |
| BUG-032 | Quando quem estava na dupla caía, a pergunta era descartada (como deve) e aparecia o aviso de outro evento, como se fosse uma rodada nova: a rodada ganhava um segundo evento (outro +1 de recurso, outro Corte...), e quem caiu ficava fora dele (achado no M7 e no M8 na UFSM, 20/10/2026) | As trocas de dupla que não vêm da resposta chamavam `pickNewPair()` sem o evento da rodada (`engine/turnEngine.js`), e sem evento ele sorteava outro, aplicava os efeitos e mostrava o aviso a todos: em `abortRoundIfParticipant()` (queda ou saída de quem está na dupla), em `handleAnswer()` (quem responde sumiu da lista) e na retomada do host sem dupla (`resumeMatchAfterReload()`, inclusive depois da troca de host com o host antigo na dupla) | O evento só sai no início da rodada (`startNewRound()`), que guarda o evento e o número da rodada no estado do host e no estado salvo (`roundEvent`, `roundNumber`); `pickNewPair()` sem evento continua com o `roundEvent`, sem aviso nem efeito. O número vai no `round-start` e aparece no console de cada aparelho ("🎯 Rodada N"), para conferir que a troca de dupla não começou outra rodada. Protocolo 12 e estado salvo 9 iguais (campos novos opcionais) — T209, T210 (ajuste no T89) |
| BUG-033 | Uma queda curta de rede de quem estava na dupla descartava a pergunta e saía outra dupla (M7.1 na UFSM, 20/10/2026, celular 10 s em modo avião; repetido em casa em 24/10/2026) | A conexão do celular com o Firebase leva de 18 s a 60 s para voltar depois que a rede volta, e o sinal de vida fica parado além dos 20 s de tolerância (`PRESENCE_TIMEOUT`); o host, ao dar o jogador como caído, descartava a pergunta (`handlePlayerDisconnect()` → `abortRoundIfParticipant()`) | A dupla fica guardada até o fim da rodada (`holdRoundIfParticipant()`, `state.heldPairs`, com a pergunta e o prazo de resposta que faltava; aviso `pair-held` para todos); quando os dois estão conectados de novo, ela é a próxima dupla, com o Perguntador refazendo a pergunta. No fim da rodada, quem caiu sem responder segura o fim (`round-waiting`, `state.waitingFor`): a volta dele reabre a dupla, o "Nova Rodada" segue sem ele (a pergunta volta ao baralho) e, com quem pergunta caído, o host pode passar a pergunta a outro Perguntador. Também na troca de host com o host antigo na dupla (`takeOverMatch()`). Host visível (faixa "👑 Você é o host", 👑 na lista) e linhas de conexão no console. Protocolo 13, estado salvo 10 — T211–T213, T215–T218, E39, E40 (ajustes nos ajudantes do navegador e no E32 e E35) |
| BUG-034 | Uma resposta mandada sem conexão chegava ao host na volta da conexão; se o mesmo jogador estivesse respondendo outra pergunta, valeria para ela (M7.1 em casa, 24/10/2026) | O `answer` (e o `ask-question`) não dizia de qual vez era: o host conferia só quem responde e se a rodada já tinha resposta | Cada dupla tem um número (`pairId`, sequência do host, também no estado salvo), que vai no `round-start`, na resposta e no "Fazer a pergunta"; o host ignora o que traz o número de outra dupla (`isFromOtherPair()`), inclusive na dupla reaberta com a mesma pergunta — T214 |

## Limpezas concluídas

| ID | O que era | O que foi feito |
|---|---|---|
| NOTA-006 | Regras do `css/style.css` que nenhuma tela usava (`.btn-success`, `.btn-selected`, `.entry-form`, `.room-id-hint`, `.correct-answer`, `.correct-label`, `.correct-value`, `.final-rank-focus-area`, `.role-answerer`, `.sr-only`, `#btnPlayAgain`, `#btnExit`), achadas na Fase E/E4 | Conferidas uma a uma no HTML, no `js/` e nos testes (inclusive as classes montadas por concatenação, `feedback-*` e `top-1`…, que estão em uso) e apagadas em 05/10/2026; para quem joga, nada mudou. O T92 impede que voltem a se acumular |
| NOTA-007 | O comentário de `sendNextHelpOffer()` (`engine/tradeEngine.js`) dizia que quem pediu ajuda e não recebeu "fica sem poder responder"; desde a Fase C, quem está com 0 recursos continua respondendo normalmente | Texto corrigido em 06/10/2026, junto com o BUG-024 |
| NOTA-008 | O detalhe de cada jogador no ranking final (`ranking.rankingDetail`, `js/locales/pt-BR.js`) dizia "KPI acumulado (acertos, vendas, compras e assessorias)"; vendas e compras eram do mercado de recursos antigo, que deu lugar ao pedido de ajuda. Achada em 06/10/2026, na frente do desempate do ranking | Texto trocado para "acertos, ajudas e assessorias" em 06/10/2026; chave e marcadores iguais (o T88 confere). Com a economia de recursos (10/10/2026), passou a "acertos": o KPI acumulado só vem do acerto |

---

## Como usar este arquivo

- Ao encontrar um bug, registre-o em "Em investigação" **antes de decidir se
  corrige na hora ou depois** — achado no meio de outra frente, registra e
  propõe, sem corrigir junto.
- Registre: sintoma (o que quem joga vê), local no código, causa (se souber)
  e como reproduzir.
- A correção vem com teste que reproduz o bug: primeiro um commit só com o
  teste (que falha), depois a correção (tudo passa).
- Ao corrigir, mova o bug para a tabela "Corrigidos", com a causa, a
  correção e os números dos testes (T…, E…). Limpeza que não é bug vai em
  "Limpeza pendente" como NOTA-xxx e, feita, vira uma linha em "Limpezas
  concluídas".
- **Numeração:** BUG-xxx (bug), SEC-xxx (segurança), REGRESSÃO-xxx (algo
  que funcionava e quebrou numa mudança), NOTA-xxx (limpeza ou decisão que
  não é bug). Cada série continua do maior número já usado (próximos:
  BUG-036, SEC-006, REGRESSÃO-004, NOTA-011). NOTA-003 a NOTA-005 são
  decisões de arquitetura e ficam em `architecture.md`.
