# Convenções — PM: The KPI Master

> **Contém:** como o código e os testes são escritos — stack, camadas,
> padrão de rede e tabela de mensagens, testes, nomenclatura e glossário,
> código limpo, commits. **Não contém:** como cada mecanismo funciona por
> dentro e a árvore de arquivos (→ `architecture.md`) nem o histórico das
> decisões (→ `../CHANGELOG.md`).

## Stack técnica

- **Vanilla JavaScript**, sem framework (React, Vue, etc.) e sem bundler/build step. Todo arquivo `.js` é carregado via `<script>` simples em `game.html`/`index.html`, na ordem em que aparece — a ordem importa (um arquivo que usa `Game.domain.kpi` precisa ser carregado depois de `domain/kpiRules.js`).
- **Namespace global único**: `window.Game`, subdividido em `Game.domain`, `Game.state` (com `Game.selectors` e `Game.mutations`), `Game.engine`, `Game.core` (a API entre camadas, ver `architecture.md`), `Game.network`, `Game.ui` e os utilitários (`Game.i18n`, `Game.persistence`, `Game.sanitize`, `Game.logger`). Todo arquivo exporta pra dentro desse namespace no final (bloco `// EXPORTAÇÃO`).
- **Firebase** (plano gratuito) para a conexão — login anônimo e Realtime Database, pela API "compat" carregada de `www.gstatic.com`, sem servidor próprio: o navegador do host continua rodando as regras e todos conversam pelo banco (`network/roomChannel.js`, ligado ao jogo por `network/roomLink.js`). A configuração web fica em `CONFIG.FIREBASE` (`config/game-config.js`) e o que cada um pode ler e gravar, nas regras do banco (`database.rules.json`).
- **CSS puro**, sem pré-processador, tema único "dark + glassmorphism" definido via custom properties em `:root` (`css/style.css`).
- **Testes automatizados no GitHub Actions** (desde a Fase D) — ver "Testes" abaixo. O que depende de rede real, celular ou outros navegadores continua manual (`connection-tests.md`).

## Padrão de arquitetura: camadas

O tipo de arquitetura (aplicação estática, rede P2P com host autoritativo, regras puras + orquestração, estado centralizado) está resumido no início de `architecture.md`. As camadas e o que cada uma pode fazer:

```
domain/   → regras puras (sem DOM, sem rede, sem Game.state). Recebem
            parâmetros, retornam resultado. Testáveis isoladamente.
state/    → Game.state é a fonte única da verdade. selectors.js lê,
            mutations.js escreve (ver exceção abaixo).
engine/   → orquestração: chama domain/, mexe em state, aciona
            network/ e ui/. Não tem regra de negócio própria.
network/  → tudo que fala com o Firebase: login, canal da sala, enviar,
            receber, rotear mensagens, presença e volta da conexão.
ui/       → tudo que mexe no DOM: components/ (telas/elementos
            persistentes) e modals/ (overlays).
```

**Exceção conhecida, aceita:** o contrato original previa que só `mutations.js` escrevesse em `Game.state`, e que `domain/` retornasse deltas em vez de mutar. Isso não foi seguido à risca — `engine/*.js` escreve direto em `Game.state.players`, e algumas funções de `domain/` mutam o objeto recebido. Registrado como dívida arquitetural aceita (NOTA-005) — decisão de não corrigir, mantida mesmo depois de o projeto ganhar testes automatizados.

## Padrão de rede: host autoritativo

O **host é sempre a fonte da verdade**. Um guest nunca aplica uma mudança de estado por conta própria — ele manda uma mensagem `-request` pro host, o host valida e decide, e distribui o resultado via `broadcastAll()`.

**Pegadinha recorrente (já causou BUG-002, BUG-006 e BUG-007 — vale ler antes de mexer em qualquer fluxo de rede novo):** `Game.network.sendToPlayer()`/`broadcastAll()`, quando o destinatário é o próprio host, processam a mensagem **na hora, de forma síncrona** — não passam pela rede de verdade. Isso significa que a ordem de execução no host pode ficar diferente da ordem que um guest recebe (que é sempre sequencial, via rede). Ao adicionar um fluxo novo que envolve o host mandar algo pra si mesmo, sempre perguntar: "essa sequência de eventos faz sentido também quando roda tudo de uma vez, sem esperar a rede?"

Padrão de nomenclatura de mensagens: `<coisa>-request` (pedido) → `<coisa>` ou `<coisa>-offer` (o host processa e encaminha) → `<coisa>-response` (resposta de quem foi perguntado) → `<coisa>-confirmed` (resultado final, broadcast pra todos). O fluxo da assessoria e do pedido de ajuda é uma variação: `advisory-request` → `advisory-started`/`advisory-question` → `advisory-answer` → `advisory-result`.

### Mensagens de rede

| Mensagem | Quem envia | Campos / observação |
|---|---|---|
| `player-join` | guest → host | `playerName`, `peerId` (o uid do aparelho, que também chega ao host como remetente do pedido), `protocolVersion` (versão do formato das mensagens; sem o campo conta como 1). Montada só em `sendPlayerJoin()` (`network/roomLink.js`), ao entrar e a cada volta da conexão |
| `join-rejected` | host → quem tentou entrar (pela caixa de avisos dele) | `reason`: `version-mismatch` (outra versão do jogo — conferida antes de tudo), `device-in-use` (o aparelho já está na sala com outro nome), `room-full`, `room-locked` (partida em andamento, nome novo), `name-taken` (nome de quem está conectado), `identity-mismatch` (nome de quem caiu, vindo de outro aparelho). O aviso de cada motivo fica em `handleJoinRejected()` (`network/messageHandler.js`), que também mostra as recusas da abertura da sala no jogo (`room-not-found`, `tab-in-use`) |
| `state-sync` | host → quem entra ou volta | `fullState` com os jogadores (`players`), a rodada como quem entra pode vê-la (`currentRound`: `event`, `asker`, `answerer`, `question` — o gabarito só para o Perguntador —, `answered`, `asked` — a pergunta já foi feita; sem o campo, já foi —, as horas de término e o apoio; sem `pendingAnswer`), `endsAt` (hora de término da partida), `roundEnded`, `matchPaused`, `answeredThisRound` (quem já respondeu na rodada), `gameOver` e `finalRanking` (fim de jogo), `feedCursor` (o último aviso para todos que o estado já inclui); sem os baralhos (ficam só com o host) |
| `game-start` | host → todos | `endsAt` — a partida começou; hora de término dela |
| `round-start` | host → todos | `event`, `asker`, `answerer`, `answeredThisRound` |
| `question` | host → Perguntador (no início da rodada) e Respondedor (quando a pergunta é feita) | a pergunta; `isAsker` (com o gabarito `correct`) ou `isAnswerer` (sem o gabarito, com `answerEndsAt`, a hora de término do prazo de resposta) |
| `ask-question` | Perguntador → host | `playerName` — clicou em "Fazer a pergunta" |
| `question-asked` | host → todos | a pergunta foi feita; `auto` (true quando foi o prazo do Perguntador, `ASK_TIMEOUT`, e não o clique) |
| `answer` | Respondedor → host | `alternative`, `playerName` |
| `kpi-update` | host → todos | o jogador: `kpi`, `focusArea`, `activities`, `resources`; da resposta: `isCorrect`, `kpiGained`, `answeredThisRound` e, se o prazo de resposta acabou, `timedOut` (conta como erro); do apoio: `supportOutcome` (`fee`: honorário de assessoria; `reward`: recompensa do patrocinador a quem ajudou; `cover`: quem ajudou cobriu o erro), `supportAmount` (recursos) e `supportPartner` (no de quem respondeu, quem apoiou; no de quem apoiou, quem respondeu). O apoio vai nos dois `kpi-update`: no de quem respondeu (com `isCorrect`) e num segundo, de quem apoiou (sem `isCorrect`) |
| `player-list`, `match-ended` | host → todos | `players` (cada jogador com `kpi`, `resources`, `focusArea`, `activities`...) |
| `game-over` | host → todos | `ranking`: cada jogador com `position` (empatados em tudo têm a mesma: 1, 1, 3), `finalKpi` (KPI + recursos × `FINAL_RESOURCE_VALUE`), `kpi`, `resources`, `focusArea` |
| `show-event` | host → todos | `event` (início de rodada nova), `players` (os efeitos do evento mudam os recursos) e `eventEffect` (quem foi atingido, no Patrocinador Generoso e na Reestruturação: `receivers`, `giver`, `amount` e, se o evento não acontece, `reason` — `all-tied` ou `giver-without-resources`; nos outros eventos, `null`) |
| `round-ended` | host → todos | rodada encerrada, aguardando o "Nova Rodada" |
| `match-paused` | host → todos | faltam jogadores conectados; retoma sozinha quando alguém volta |
| `advisory-request` | Respondedor → host | `kind` (`advisory`: assessoria; `help`: pedido de ajuda; sem o campo, assessoria), `advisorName` (quem é chamado), `requesterName`. O apoio fica na rodada: `currentRound.advisory` (`advisorName`, `status` `pending`/`accepted`/`declined`, `suggestion`, `kind`) |
| `advisory-started` / `advisory-question` | host → todos / host → quem é chamado | `kind`, `advisorName`, `requesterName`, `endsAt` (hora de término do prazo de quem foi chamado), `answerTimeLeft` (ms do prazo de resposta que faltavam, pausado durante o apoio) / `kind`, a pergunta (sem o gabarito) e `endsAt`; com o apoio pendente, vai de novo a quem foi chamado quando ele volta à sala, depois do `state-sync` |
| `advisory-answer` | quem é chamado → host | `alternative`, `declined` |
| `advisory-result` | host → todos (ou só a quem pediu, se o pedido é inválido) | `kind`, `advisorName`, `suggestion`, `declined`, `timeout`, `answerEndsAt` (a nova hora de término do prazo de resposta; só quando ele volta a correr); pedido inválido: `invalid` e `reason` (`closing-focus-area`; `needs-resources` — assessoria com 0 recursos ou menos; `has-resources` — ajuda com 1 ou mais; `helper-without-resources` — quem ajuda sem `HELP_COVER` recursos; `already-answered`; ou nenhum) |

Os campos `endsAt`, `askEndsAt` e `answerEndsAt` (nas mensagens, na rodada e no estado salvo) são horas de término em milissegundos do relógio do servidor (`Game.network.serverNow()`); cada aparelho calcula o que falta — ver `architecture.md`, seção "Relógio e prazos pela hora do servidor".

Mensagem que chega sem um campo novo (de uma versão anterior do jogo) mantém o comportamento antigo (ex.: `advisory-request` sem `kind` é assessoria), salvo quando o campo veio com uma versão nova do protocolo e o host precisa dele: aí o host exige o campo.

**Versão do protocolo:** ao mudar o nome ou o formato de um campo de mensagem, aumentar `PROTOCOL_VERSION` (`network/roomLink.js`; vai também no meta da sala, conferido pela tela inicial e ao abrir o jogo). O host recusa quem entra com outra versão (`version-mismatch`), em vez de a partida travar quando, logo depois de um deploy, uns jogadores rodam o código novo e outros o antigo. Se o mesmo campo também é salvo no `localStorage`, aumentar junto o `STATE_VERSION`, com o passo de migração (`utils/persistence.js`).

## Testes

Como os testes funcionam (ambiente simulado, Playwright, Actions) está em `architecture.md`, seção "Testes automatizados". Aqui, as regras para escrever:

- Teste de lógica entra em `tests/logic/<assunto>.test.js` (entrada e identidade, queda e volta, troca de host, F5 do host, estado salvo, fim de partida, pedido de ajuda e assessoria, ritmo da pergunta, banco de perguntas, configuração e textos da tela, simulador), com o próximo número da sequência (T1, T2...); cenário no navegador entra em `tests/browser/*.spec.js`, com o próximo número E. Os números não mudam nem são reaproveitados.
- Nomes de arquivos, funções e variáveis dos testes em inglês; comentários e títulos em português, com o número (T…, E…, BUG-…) no título.
- Toda mudança de lógica vem com teste. A frente vai em dois commits: primeiro só os testes (os novos devem falhar no Actions), depois o código (tudo passa). Isso confirma que os testes novos de fato pegam o problema. Antes do segundo commit, o código novo é revisado à procura de mudanças que os testes não pegariam (teste de mutação), e os testes são reforçados se aparecer alguma.
- Código novo de lógica fica onde o teste alcança (`engine/`, `network/`, `state/`, `utils/`); `main.js` só orquestra a inicialização.

## Nomenclatura

A regra geral: **nome é em inglês; texto é em português.** Nome é tudo que o código, o Git ou o Actions usam para achar alguma coisa (arquivo, pasta, função, campo, chave, ID, job, artefato, variável de ambiente); texto é o que uma pessoa lê (comentário, tela, log, documento, título de teste, `name:`/`description:` dos workflows, descrição do commit). Os identificadores do código estão em inglês desde a Fase E do roadmap (concluída em 05/10/2026); os nomes em português que sobraram fora do `js/` estão na NOTA-009 (`issues.md`).

- **Nomes de arquivos e pastas** (documentos, workflows, pastas e arquivos gerados): em inglês, kebab-case minúsculo (`connection-tests.md`, `manual-test-scripts.md`). Exceções: os nomes padrão que as ferramentas reconhecem em maiúsculas (`README.md`, `CHANGELOG.md`, `LICENSE`) e os códigos de idioma (`pt-BR`). Arquivos `.js`: ver abaixo.
- **Workflows do GitHub Actions:** nome do arquivo, IDs dos jobs, IDs dos campos do formulário, variáveis de ambiente e nomes de artefato em inglês; o `name:` e as `description:` (o que aparece na tela do Actions) em português.

- **Chaves de schema de dados** (`data/questions.*.json` e os campos que viajam com uma pergunta pela rede): já estão em inglês desde a Fase 8 (`domains`, `name`, `focusAreas`, `questions`, `question`, `alternatives`, `correct`, `domain_key`); os IDs das áreas foco (valores de `focusAreas`, de `CONFIG.FOCUS_AREAS` e do `focusArea` do jogador), desde a E3d (`initiating`, `planning`, `executing`, `monitoringControlling`, `closing`). Motivo: precisam ser estáveis entre arquivos de idiomas diferentes (`questions.en-US.json` reusa as mesmas chaves, só traduz os valores).
- **Identificadores do código** (funções, variáveis, parâmetros, campos do estado e das mensagens, chaves do CONFIG e dos textos da tela, campos dos eventos, IDs e classes do HTML/CSS): em inglês, inclusive nos testes. **Código novo usa inglês e o glossário abaixo.**
- **Glossário** (português → inglês), para todo o código usar os mesmos nomes:

  | Português | Inglês |
  |---|---|
  | partida / rodada / sala / jogador | match / round / room / player |
  | Perguntador / Respondedor | asker / answerer |
  | assessoria / assessor / sugestão | advisory / advisor / suggestion |
  | apoio (o que um jogador fez pela pergunta de outro) / honorário / o outro jogador do apoio | support (`supportOutcome`, `supportAmount`) / fee (`ADVISORY_FEE`) / partner (`supportPartner`) |
  | pedido de ajuda / quem ajuda / quem pediu / tipo do apoio | help / helper / requester / kind (`advisory` ou `help`) |
  | recompensa do patrocinador / cobrir o erro | reward (`HELP_REWARD`) / cover (`HELP_COVER`) |
  | recursos / baralho / pergunta / alternativa | resources / deck / question / alternative |
  | estouro de orçamento (recurso negativo) | overrun (`resources-overrun`, `overrunLabel`) |
  | evento / reserva de contingência | event / contingency reserve |
  | efeito do evento / quem recebe / quem cede / quantidade / todos empatados | event effect (`eventEffect`) / receivers / giver / amount / all tied |
  | atividades concluídas na partida | completed activities (`countCompletedActivities`) |
  | área foco (PMBOK 8; antes "fase") / atividades | focus area (`focusArea`) / activities |
  | sortear / acertou / KPI ganho | draw / isCorrect / kpiGained |
  | partida pausada / rodada encerrada / fim de jogo | paused / round ended / game over |
  | quem já respondeu na rodada (rodízio) | answeredThisRound |
  | relógio / prazo | clock / timeout |
  | fazer a pergunta (etapa do Perguntador) / pergunta feita / prazo do Perguntador | ask (`ask-question`, `askQuestion`) / asked (`question-asked`) / `askTimeout` (`ASK_TIMEOUT`) |
  | tempo que resta para responder / tempo esgotado | answer time left (`answerTimeLeft`) / timed out (`timedOut`) |
  | hora do servidor / hora de término (da partida, do prazo do Perguntador, do prazo de resposta, do prazo do apoio) | server now (`serverNow`, `serverTimeOffset`) / ends at (`endsAt`, `askEndsAt`, `answerEndsAt`, `advisory.endsAt`) |
  | troca de host / host antigo / backup | host migration / old host / backup |
  | identidade do aparelho (uid do login anônimo, no campo `peerId`) / estado salvo | uid / saved state |
  | ligação do jogo ao canal da sala / login anônimo / cursor dos avisos para todos / aba com a sala aberta | room link (`roomLink`) / Firebase login (`firebaseLogin`) / feed cursor (`feedCursor`) / room tab (`tab-in-use`) |
  | teste de conexão (página `firebase-check.html`) / aparelho / mensagem de teste / resposta a ela / tempo de ida e volta / dono da sala | connection check (`connectionCheck`) / device / ping / echo / round trip (`roundTrips`) / host (`hostUid`) |
  | canal da sala pelo Firebase / jogadores aceitos na sala / pedido ao host / avisos do host para todos / avisos do host para um jogador | room channel (`roomChannel`) / roster / request (`requests`) / feed / inbox |
  | estado que os jogadores veem / parte que só o host vê / o que só um jogador vê | public state (`public/state`) / secret state (`secret/state`) / hand (`hands`) |
  | aceitar / tirar da sala (no roster) / publicar o estado / última atividade / sala parada / número da troca de host | admit / dismiss / publish / last activity (`lastActivity`) / idle room (`ROOM_IDLE_MS`) / host epoch (`hostEpoch`) |
- **Comentários**: sempre em português. Explicam o que o código faz e por quê — sem fase, número de bug ou item do roadmap e sem a história do "antes era assim": isso fica no `roadmap.md`, no `issues.md`, no `CHANGELOG.md` e no histórico do Git. Os títulos dos testes continuam com os números (T…, E…, BUG-…), que ligam o teste ao registro.
- **Tipos de mensagem de rede** (`msg.type`) e seus campos: em inglês, kebab-case para o tipo, com os sufixos do padrão acima (`match-paused`, `show-event`, `round-start`, `advisory-request`, `advisory-result`); os valores de motivo (`reason`) também em inglês, kebab-case (`already-answered`, `helper-without-resources`). Mudar o nome de um tipo ou campo exige aumentar `PROTOCOL_VERSION` (acima).
- **IDs de elemento HTML e classes CSS**: em inglês, com o glossário acima; camelCase pra IDs (`btnRequestAdvisory`, `modalAdvisoryQuestion`), kebab-case pra classes e atributos `data-*` (`.focus-area-item`, `.stat-chip`, `data-advisor-name`). O T91 confere que todo ID, seletor e `dataset` pedido pelo jogo e pelos testes no navegador existe no HTML e no CSS; o T92, que toda classe com regra no CSS é usada pelo HTML ou pelo `js/` e todo `#id` do CSS existe no HTML (classe montada por concatenação entra na lista `BUILT_CLASSES` do teste).
- **Nomes de arquivo `.js`**: camelCase (`profileComponent.js`, `advisoryEngine.js`, `deckRules.js`). Exceção antiga: `config/game-config.js`.

### Formato dos nomes

| O quê | Formato | Exemplos |
|---|---|---|
| Funções, variáveis, parâmetros, campos de objeto | camelCase | `drawQuestion`, `currentRound`, `answeredThisRound` |
| Constantes de módulo e chaves do CONFIG | MAIÚSCULAS_COM_SUBLINHADO | `STATE_VERSION`, `PROTOCOL_VERSION`, `CONFIG.GAME.ANSWER_TIMEOUT` |
| Booleanos | prefixo `is`/`has`/`can` | `isHost`, `isCorrect`, `hasReserve`, `canContinueRound` |
| Tipos de mensagem, classes CSS, atributos `data-*` | kebab-case | `advisory-request`, `.focus-area-item`, `data-advisor-name` |
| IDs de elemento HTML | camelCase | `btnRequestAdvisory`, `modalAdvisoryQuestion` |

- **Função começa com verbo**, e o verbo indica o que ela faz:
  - `calculate`/`validate`/`draw`/`build`: regra pura, que devolve um resultado (`domain/`);
  - `start`/`end`/`handle`/`resume`: ação da partida ou resposta a uma mensagem (`engine/`, `network/`);
  - `send`/`broadcast`/`connect`: rede;
  - `show` (abre uma tela ou janela), `render` (monta o HTML de uma parte), `update` (atualiza uma parte já na tela): `ui/`. Código novo usa `show`, não `display`, que aparece em funções antigas.
  - `get`: leitura sem efeito (`getActivePlayers`).
- **Unidade no nome** de constante nova de tempo ou tamanho (`SEARCH_TIMEOUT_MS`, `RESTORE_WINDOW_MS`). As chaves antigas do CONFIG não têm a unidade no nome (o comentário de cada uma diz qual é; `SESSION_DURATION` está em segundos, os prazos em ms); renomear seria uma frente própria, com migração.
- **Nome descreve o significado**, não o tipo nem a implementação (`answeredThisRound`, não `list2`); sem abreviações além das consagradas (`id`, `kpi`, `msg`, `conn`).

## Código limpo

Regras práticas deste projeto, além do formato dos nomes:

- **Regra do jogo fica em `domain/`**, como função pura (recebe dados, devolve resultado). A tela e a rede não decidem regra: só mostram e transportam.
- **Função pequena, com uma tarefa.** Se precisa de um comentário para separar "partes", provavelmente são funções diferentes.
- **Retorno antecipado** (`if (!x) return;`) em vez de `if` aninhado.
- **Sem número solto no código:** valor de jogo (pontos, prazos, limites) vai no `CONFIG`; o código lê de lá.
- **Texto da tela só pelo i18n** (`Game.i18n.t('secao.chave')`); o T88 confere que a chave existe e é usada.
- **Texto vindo de outro jogador** (nome, por exemplo): escapar com `Game.sanitize.escapeHtml()` ao montar HTML; ao usar `textContent`, não escapar (escape duplo mostra `&amp;` — BUG-023).
- **Sem código morto:** função, chave de texto ou regra de CSS sem uso é apagada, não comentada "para depois" (o T88 e o T92 barram texto e CSS sem uso). O histórico fica no Git.
- **Duplicação:** extrair quando é a mesma regra; manter separado quando só parece igual (ex.: roadmap 7.6 — extrair só a montagem da lista de alternativas, não fundir os dois modais).
- **Comentário explica o porquê**, não repete o que o código diz (ver "Comentários" acima).
- **Mudança de comportamento vem com teste**, no fluxo de dois commits (seção "Testes").

## Convenção de commit

Conventional Commits: `tipo(escopo opcional): descrição curta`, com o tipo em inglês (o padrão) e o escopo e a descrição em português. Escopos em uso: `jogo` (regras e telas), `rede` (conexão, troca de host, F5), `testes`, `simulador`, `perguntas` (banco de perguntas), `docs`, `repo` (Git, GitHub, Actions). Por exemplo `fix(rede): ...`, `feat(jogo): ...`, `refactor: ...` (muda a estrutura sem mudar o comportamento), `style: ...` (CSS e aparência), `test: ...`, `docs: ...`, `chore: ...` — com corpo explicando o quê e o porquê quando a mudança não é óbvia.