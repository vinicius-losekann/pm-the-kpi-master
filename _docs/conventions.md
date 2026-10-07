# Convenções — PM: The KPI Master

> **Contém:** como o código e os testes são escritos — stack, camadas,
> padrão de rede e tabela de mensagens, testes, nomenclatura e glossário,
> código limpo, commits. **Não contém:** como cada mecanismo funciona por
> dentro e a árvore de arquivos (→ `architecture.md`) nem o histórico das
> decisões (→ `../CHANGELOG.md`).

## Stack técnica

- **Vanilla JavaScript**, sem framework (React, Vue, etc.) e sem bundler/build step. Todo arquivo `.js` é carregado via `<script>` simples em `game.html`/`index.html`, na ordem em que aparece — a ordem importa (um arquivo que usa `Game.domain.kpi` precisa ser carregado depois de `domain/kpiRules.js`).
- **Namespace global único**: `window.Game`, subdividido em `Game.domain`, `Game.state` (com `Game.selectors` e `Game.mutations`), `Game.engine`, `Game.core` (a API entre camadas, ver `architecture.md`), `Game.network`, `Game.ui` e os utilitários (`Game.i18n`, `Game.persistence`, `Game.identity`, `Game.sanitize`, `Game.logger`). Todo arquivo exporta pra dentro desse namespace no final (bloco `// EXPORTAÇÃO`).
- **PeerJS** para conexão P2P (WebRTC) — sem servidor próprio, usa o broker público gratuito do PeerJS só para sinalização inicial; depois disso a comunicação é direta entre os navegadores. Todo `new Peer(...)` recebe uma cópia de `CONFIG.PEER` (`config/game-config.js`) — é o único lugar para apontar outro servidor de sinalização.
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
network/  → tudo que fala PeerJS: enviar, receber, rotear mensagens,
            reconexão, migração de host.
ui/       → tudo que mexe no DOM: components/ (telas/elementos
            persistentes) e modals/ (overlays).
```

**Exceção conhecida, aceita:** o contrato original previa que só `mutations.js` escrevesse em `Game.state`, e que `domain/` retornasse deltas em vez de mutar. Isso não foi seguido à risca — `engine/*.js` escreve direto em `Game.state.players`, e algumas funções de `domain/` mutam o objeto recebido. Registrado como dívida arquitetural aceita (NOTA-005) — decisão de não corrigir, mantida mesmo depois de o projeto ganhar testes automatizados.

## Padrão de rede: host autoritativo

O **host é sempre a fonte da verdade**. Um guest nunca aplica uma mudança de estado por conta própria — ele manda uma mensagem `-request` pro host, o host valida e decide, e distribui o resultado via `broadcastAll()`.

**Pegadinha recorrente (já causou BUG-002, BUG-006 e BUG-007 — vale ler antes de mexer em qualquer fluxo de rede novo):** `Game.network.sendToPlayer()`/`broadcastAll()`, quando o destinatário é o próprio host, processam a mensagem **na hora, de forma síncrona** — não passam pela rede de verdade. Isso significa que a ordem de execução no host pode ficar diferente da ordem que um guest recebe (que é sempre sequencial, via rede). Ao adicionar um fluxo novo que envolve o host mandar algo pra si mesmo, sempre perguntar: "essa sequência de eventos faz sentido também quando roda tudo de uma vez, sem esperar a rede?"

Padrão de nomenclatura de mensagens: `<coisa>-request` (pedido) → `<coisa>` ou `<coisa>-offer` (o host processa e encaminha) → `<coisa>-response` (resposta de quem foi perguntado) → `<coisa>-confirmed` (resultado final, broadcast pra todos). Ver `engine/tradeEngine.js` (`help-request` → `help-offer` → `help-offer-response` → `help-confirmed`) como referência mais recente e mais limpa desse padrão.

### Mensagens de rede

| Mensagem | Quem envia | Campos / observação |
|---|---|---|
| `player-join` | guest → host | `playerName`, `peerId`, `token` (identidade por sala; o host guarda só o hash), `protocolVersion` (versão do formato das mensagens; sem o campo conta como 1). Montada só em `sendPlayerJoin()` (`network/peerService.js`) |
| `join-rejected` | host → quem tentou entrar | `reason`: `version-mismatch` (outra versão do jogo — conferida antes de tudo), `room-full`, `room-locked` (partida em andamento, nome novo), `name-taken`, `identity-mismatch` (token diferente do registrado) |
| `state-sync` | host → quem entra ou volta | `fullState` com os jogadores (`players`), a rodada (`currentRound`: `event`, `asker`, `answerer`, `question`, `answered`), os baralhos (`decks`), o relógio, `roundEnded`, `matchPaused`, `answeredThisRound` (quem já respondeu na rodada), `gameOver` e `finalRanking` (fim de jogo) |
| `round-start` | host → todos | `event`, `asker`, `answerer`, `answeredThisRound` |
| `question` | host → Perguntador e Respondedor | a pergunta; `isAsker` (com o gabarito `correct`) ou `isAnswerer` (sem o gabarito) |
| `answer` | Respondedor → host | `alternative`, `playerName` |
| `kpi-update` | host → todos | o jogador: `kpi`, `focusArea`, `activities`, `resources`; da resposta: `isCorrect`, `kpiGained`, `answeredThisRound`; do bônus de assessoria: `advisorBonus` |
| `player-list`, `match-ended` | host → todos | `players` (cada jogador com `kpi`, `resources`, `focusArea`, `activities`...) |
| `game-over` | host → todos | `ranking`: cada jogador com `position` (empatados em tudo têm a mesma: 1, 1, 3), `finalKpi` (KPI + recursos × `FINAL_RESOURCE_VALUE`), `kpi`, `resources`, `focusArea` |
| `show-event` | host → todos | `event` (início de rodada nova) e `players` (os efeitos do evento mudam os recursos) |
| `round-ended` | host → todos | rodada encerrada, aguardando o "Nova Rodada" |
| `match-paused` | host → todos | faltam jogadores conectados; retoma sozinha quando alguém volta |
| `advisory-request` | Respondedor → host | `advisorName`, `requesterName`. A assessoria fica na rodada: `currentRound.advisory` (`advisorName`, `status` `pending`/`accepted`/`declined`, `suggestion`) |
| `advisory-started` / `advisory-question` | host → todos / host → assessor | `advisorName`, `requesterName` / a pergunta (sem o gabarito) |
| `advisory-answer` | assessor → host | `alternative`, `declined` |
| `advisory-result` | host → todos (ou só a quem pediu, se o pedido é inválido) | `advisorName`, `suggestion`, `declined`, `timeout`; pedido inválido: `invalid` e `reason` (`closing-focus-area`, `already-answered` ou nenhum) |
| `help-request` | quem pediu → host | `requesterName`. A fila fica só no host: `helpQueue` (`requesterName`, `candidates`, `index`) |
| `help-trying` / `help-offer` | host → quem pediu / host → candidato | `candidateName` / `requesterName` |
| `help-offer-response` | candidato → host | `candidateName`, `requesterName` (para quem era a oferta; o host só aceita a resposta do pedido em andamento), `accepted` |
| `help-no-candidates` | host → quem pediu | `reason`: `insufficient-kpi`, `no-donors`, `all-declined`, `request-in-progress` (outro jogador já está pedindo ajuda; um pedido por vez) |
| `help-confirmed` | host → todos | `donor`, `requester`, `amount`, `donorKpi`, `donorResources`, `requesterKpi`, `requesterResources` |

Mensagem que chega sem um campo novo (de uma versão anterior do jogo) mantém o comportamento antigo, salvo quando o campo veio com uma versão nova do protocolo: aí o host exige o campo (ex.: `requesterName` do `help-offer-response`, desde a versão 7).

**Versão do protocolo:** ao mudar o nome ou o formato de um campo de mensagem, aumentar `PROTOCOL_VERSION` (`network/peerService.js`). O host recusa quem entra com outra versão (`version-mismatch`), em vez de a partida travar quando, logo depois de um deploy, uns jogadores rodam o código novo e outros o antigo. Se o mesmo campo também é salvo no `localStorage`, aumentar junto o `STATE_VERSION`, com o passo de migração (`utils/persistence.js`).

## Testes

Como os testes funcionam (ambiente simulado, Playwright, Actions) está em `architecture.md`, seção "Testes automatizados". Aqui, as regras para escrever:

- Teste de lógica entra em `tests/logic/<assunto>.test.js` (entrada e identidade, queda e volta, troca de host, F5 do host, estado salvo, fim de partida, pedido de ajuda e assessoria, banco de perguntas, configuração e textos da tela, simulador), com o próximo número da sequência (T1, T2...); cenário no navegador entra em `tests/browser/*.spec.js`, com o próximo número E. Os números não mudam nem são reaproveitados.
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
  | pedido de ajuda / doador / quem pediu / fila / oferta | help request / donor / requester / queue / offer |
  | recursos / baralho / pergunta / alternativa | resources / deck / question / alternative |
  | estouro de orçamento (recurso negativo) | overrun (`resources-overrun`, `overrunLabel`) |
  | evento / reserva de contingência | event / contingency reserve |
  | área foco (PMBOK 8; antes "fase") / atividades | focus area (`focusArea`) / activities |
  | sortear / acertou / KPI ganho | draw / isCorrect / kpiGained |
  | partida pausada / rodada encerrada / fim de jogo | paused / round ended / game over |
  | quem já respondeu na rodada (rodízio) | answeredThisRound |
  | relógio / prazo | clock / timeout |
  | troca de host / host antigo / backup | host migration / old host / backup |
  | token de identidade / estado salvo | identity token / saved state |
- **Comentários**: sempre em português. Explicam o que o código faz e por quê — sem fase, número de bug ou item do roadmap e sem a história do "antes era assim": isso fica no `roadmap.md`, no `issues.md`, no `CHANGELOG.md` e no histórico do Git. Os títulos dos testes continuam com os números (T…, E…, BUG-…), que ligam o teste ao registro.
- **Tipos de mensagem de rede** (`msg.type`) e seus campos: em inglês, kebab-case para o tipo, com os sufixos do padrão acima (`match-paused`, `show-event`, `round-start`, `advisory-request`, `help-offer-response`); os valores de motivo (`reason`) também em inglês, kebab-case (`already-answered`, `no-donors`). Mudar o nome de um tipo ou campo exige aumentar `PROTOCOL_VERSION` (acima).
- **IDs de elemento HTML e classes CSS**: em inglês, com o glossário acima; camelCase pra IDs (`btnRequestHelp`, `modalHelpOffer`), kebab-case pra classes e atributos `data-*` (`.focus-area-item`, `.stat-chip`, `data-advisor-name`). O T91 confere que todo ID, seletor e `dataset` pedido pelo jogo e pelos testes no navegador existe no HTML e no CSS; o T92, que toda classe com regra no CSS é usada pelo HTML ou pelo `js/` e todo `#id` do CSS existe no HTML (classe montada por concatenação entra na lista `BUILT_CLASSES` do teste).
- **Nomes de arquivo `.js`**: camelCase (`profileComponent.js`, `tradeEngine.js`, `deckRules.js`). Exceção antiga: `config/game-config.js`.

### Formato dos nomes

| O quê | Formato | Exemplos |
|---|---|---|
| Funções, variáveis, parâmetros, campos de objeto | camelCase | `drawQuestion`, `currentRound`, `answeredThisRound` |
| Constantes de módulo e chaves do CONFIG | MAIÚSCULAS_COM_SUBLINHADO | `STATE_VERSION`, `PROTOCOL_VERSION`, `CONFIG.GAME.ANSWER_TIMEOUT` |
| Booleanos | prefixo `is`/`has`/`can` | `isHost`, `isCorrect`, `hasReserve`, `canContinueRound` |
| Tipos de mensagem, classes CSS, atributos `data-*` | kebab-case | `help-offer-response`, `.focus-area-item`, `data-advisor-name` |
| IDs de elemento HTML | camelCase | `btnRequestHelp`, `modalHelpOffer` |

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