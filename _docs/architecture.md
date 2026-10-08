# 🗺️ Arquitetura — PM: The KPI Master

> **Contém:** como o sistema funciona hoje — tipo de arquitetura, árvore
> arquivo por arquivo, notas de arquitetura (NOTA-003 a NOTA-005) e
> decisões técnicas, schema dos dados, estado salvo e migrações, conexão
> e troca de host, testes automatizados, simulador. **Não contém:** regras
> de escrita de código (→ `conventions.md`), bugs (→ `issues.md`) nem
> planos (→ `roadmap.md`).
>
> Última revisão: 07/10/2026

## Tipo de arquitetura

- **Aplicação estática no navegador, sem servidor próprio.** O site
  (HTML, CSS, JS e os JSON de dados) é publicado no GitHub Pages; não
  há back-end nem banco de dados. O único serviço externo é o servidor
  público de sinalização do PeerJS, usado só para os navegadores se
  acharem.
- **Rede P2P em estrela, com host autoritativo.** Cada guest se conecta
  só ao host (WebRTC, via PeerJS). O navegador do host faz o papel de
  servidor: guarda o estado oficial, valida os pedidos (`*-request`) e
  distribui os resultados. Se o host cai, outro jogador assume a sala
  (troca de host, seção "Conexão, identidade e troca de host").
- **Camadas** (`domain → state → engine → network/ui`), com a direção
  de dependência descrita em `conventions.md`.
- **Núcleo de regras puras + orquestração.** `domain/` calcula (KPI,
  eventos, sorteio, ranking) sem tela, rede nem estado global; `engine/`
  executa: lê e grava o estado, chama a rede e a tela. É uma aproximação
  do padrão *functional core, imperative shell*, com as exceções da
  NOTA-005.
- **Estado centralizado.** Um único `Game.state` (`state/store.js`),
  salvo no `localStorage` com versão e migração.
- **Módulos por namespace global** (`window.Game`), carregados por
  `<script>` em ordem, sem ES Modules nem build (motivo na seção "Por
  que o projeto não usa ES Modules").

## Estrutura de arquivos

```
pm-the-kpi-master/
│
├── README.md
├── CHANGELOG.md
├── LICENSE
├── .gitignore
│
├── .github/
│   └── workflows/
│       ├── testes.yml           # roda tests/logic e tests/browser a cada push/PR (GitHub Actions)
│       └── simulacao.yml        # simulador de partidas, só pelo botão "Run workflow"
│
├── _docs/
│   ├── architecture.md          # este arquivo
│   ├── conventions.md           # padrões de código, arquitetura, stack
│   ├── roadmap.md               # melhorias planejadas
│   ├── connection-tests.md      # checklist de conexão: coberto, pendente, limitações
│   ├── manual-test-scripts.md   # passo a passo dos testes manuais P1 (M9, M7, M8)
│   └── issues.md                # bugs em aberto e corrigidos, limpezas (NOTA)
│
├── config/
│   └── game-config.js           # CONFIG (constantes ajustáveis, inclusive CONFIG.PEER)
│
├── package.json                 # dependências só dos testes no navegador (o jogo não usa)
├── package-lock.json
│
├── tests/
│   ├── logic/                   # lógica do jogo, rede e tela simuladas (Node, sem dependências)
│   │   ├── environment.js       # ambiente simulado, mini-framework e ajudantes
│   │   ├── joining-and-identity.test.js
│   │   ├── drop-and-return.test.js
│   │   ├── host-migration.test.js
│   │   ├── host-reload.test.js
│   │   ├── saved-state.test.js
│   │   ├── end-of-match.test.js
│   │   ├── help-and-advisory.test.js
│   │   ├── economy.test.js          # economia de recursos: estouro de orçamento (erro e corte sem piso), KPI Final com negativo, eventos pelo tabuleiro e aviso com os nomes
│   │   ├── questions.test.js        # banco de perguntas: formato, gabarito equilibrado
│   │   ├── config-and-texts.test.js # chaves do CONFIG, textos da tela e nomes do HTML/CSS (só o que existe é pedido; CSS sem regra sem uso)
│   │   └── simulation.test.js   # simulador de partidas: regras reais, contas, semente, relatório
│   ├── simulation/              # simulador de partidas para balanceamento (Node, sem dependências)
│   │   ├── simulator.js         # partidas com robôs, regras reais, relatório e CSV
│   │   └── run.js               # lê o formulário do workflow e grava o relatório
│   └── browser/                 # o jogo real no Chromium (Playwright)
│       ├── playwright.config.js
│       ├── servers.js           # site e servidor PeerJS locais
│       ├── players.js           # jogadores (contextos separados) e ajudantes
│       ├── summary.js           # tabela de resultados no Actions
│       └── *.spec.js            # cenários (connection, host-migration, host-reload)
│
├── index.html
├── game.html
├── css/
│   └── style.css
├── assets/
│   └── board/
│       └── board-lts.png        # tabuleiro físico
│
├── data/
│   ├── questions.pt-BR.json     # perguntas e alternativas, por domínio
│   └── events.json              # eventos de rodada
│
└── js/
    │
    ├── main.js                  # entrypoint de game.html (orquestra init)
    │
    ├── entry/
    │   └── roomEntry.js         # tela inicial: criar/entrar em sala
    │
    ├── domain/                  # 🧠 regras puras — sem DOM, sem rede, sem i18n
    │   ├── kpiRules.js          # calculateAnswerResult(...)
    │   ├── eventRules.js        # drawEvent(...), applyEventEffects(...)
    │   ├── deckRules.js         # drawQuestion(...), resetDeck(...)
    │   ├── tradeRules.js        # validateResourceTransfer(...)
    │   ├── advisoryRules.js     # validateAdvisoryRequest(...), calculateAdvisorBonus(...)
    │   └── rankingRules.js      # buildRanking(...): KPI Final; desempate por área foco, atividades e KPI; empate total divide a posição
    │
    ├── state/
    │   ├── store.js             # fonte única da verdade (Game.state)
    │   ├── selectors.js         # leitura: getPlayerByName, getActivePlayers...
    │   └── mutations.js         # escrita: resetAllPlayers, resetGameState...
    │
    ├── engine/                  # 🎬 orquestração — chama domain, mexe em state, network, ui
    │   ├── sessionEngine.js     # startGame, endGame, endMatch, endSession, leaveMatch, retomada após F5 do host...
    │   ├── turnEngine.js        # startNewRound, pickNewPair, nextTurn
    │   ├── answerEngine.js      # handleAnswer, updatePlayerKPI
    │   ├── tradeEngine.js       # pedido de ajuda: requestHelp, processHelp
    │   └── advisoryEngine.js    # requestAdvisory, handleAdvisoryAnswer
    │
    ├── network/
    │   ├── connectionState.js   # estado compartilhado (myPeer, connections) — ver nota
    │   ├── hostSearch.js        # procura a sala em qualquer versão do host
    │   ├── peerService.js       # PeerJS puro: initPeer, connect, send, cleanup
    │   ├── messageHandler.js    # roteamento de mensagens (switch/case)
    │   └── hostMigration.js     # becomeHost, reconexão, handleHostDisconnect
    │
    ├── ui/
    │   ├── screenManager.js     # showScreen, closeAllModals, status de conexão
    │   ├── setup.js             # setupUI — bind de todos os listeners
    │   ├── components/
    │   │   ├── lobbyComponent.js
    │   │   ├── questionComponent.js
    │   │   ├── profileComponent.js    # card do jogador (KPI, área foco, progresso)
    │   │   ├── controlsComponent.js   # barra de ações
    │   │   ├── timerComponent.js
    │   │   └── rankingComponent.js
    │   └── modals/
    │       ├── resultModal.js
    │       ├── eventModal.js
    │       ├── tradeModal.js          # status do pedido de ajuda + aceitar/recusar
    │       └── advisoryModal.js       # seleção + pergunta + resultado
    │
    ├── locales/
    │   └── pt-BR.js              # textos da tela — ver NOTA-003
    │
    └── utils/
        ├── logger.js              # 🟡 infra pronta, religamento pendente — ver NOTA-004
        ├── persistence.js         # estado salvo, com versão e migração
        ├── identity.js            # token de identidade por sala + SHA-256 próprio
        ├── sanitize.js            # escape de texto vindo de outros jogadores
        └── i18n.js                # tradução dos textos — ver NOTA-003
```

---

## Notas de arquitetura (decisões registradas e pendências que não são bugs)

### NOTA-003 — i18n: UI em pt-BR, faltam os outros idiomas

As strings de usuário em `ui/*.js`, `engine/answerEngine.js`, `engine/advisoryEngine.js`, `network/peerService.js`, `network/hostMigration.js` e `main.js` chamam `Game.i18n.t('namespace.chave')`. As chaves do dicionário `pt-BR.js` têm nomes e marcadores em inglês (`lobby.waitingForHost`, `{{advisor}}`); o T88 confere que toda chave pedida existe, que toda chave é usada e que cada chamada passa os marcadores do texto. Os motivos de recusa de entrada na sala (`join-rejected`) ainda são texto fixo em `network/messageHandler.js`.

O que falta:
1. Criar `en-US.js` e `es-ES.js` com as mesmas chaves de `pt-BR.js` (antes, conferir se sobrou texto fixo, como os motivos de recusa acima)
2. Adicionar um seletor de idioma na UI que chama `Game.i18n.setLocale()`
3. Testar a troca de idioma em tempo real

**Fora do escopo por ora:** `index.html`/`entry/roomEntry.js` (tela inicial de criar/entrar em sala) não carrega `i18n.js`/`locales/pt-BR.js` e continua com strings fixas — só `game.html` usa o i18n.

### Botão "Nova Rodada" para o host

O botão `btnNewRound`, ligado em `ui/setup.js`, aparece só para o host durante a partida e chama `Game.core.nextTurn()` — o mesmo fluxo que roda sozinho 3s depois de cada resposta (`engine/answerEngine.js`). Não pula rodada em andamento nem força nada fora do fluxo normal: só permite ao host avançar sem esperar.

### NOTA-004 — logger: mantido, religamento planejado

`utils/logger.js` funciona isoladamente (`Game.logger.info(...)`, `Game.logger.warn(...)` etc.), mas o código ainda usa `console.log`/`console.warn`/`console.error` diretos.

O jogo roda com várias salas ao mesmo tempo (2 a 6 jogadores cada); depurar pelo console não funciona para uma sala que ninguém da equipe está jogando. Por isso `logger.js` fica, e o religamento (trocar `console.X(...)` por `Game.logger.X(...)` em `domain/`, `engine/`, `network/` e `ui/` — centenas de ocorrências) é um trabalho dedicado, registrado no roadmap (2.3).

### NOTA-005 — `domain/` muta em vez de retornar deltas; `state/mutations.js` mínimo

O contrato planejado para as camadas era: `domain/` recebe o estado (ou uma parte dele) e retorna um resultado, sem mutar; só `mutations.js` escreve no store. Esse contrato não é seguido:

- `domain/eventRules.js` → `applyEventEffects()` muta os recursos dos jogadores recebidos em vez de retornar um delta (devolve só os logs e quem foi atingido)
- `domain/deckRules.js` → `drawQuestion()` muta o baralho recebido (marca a pergunta como usada e desconta as disponíveis)
- `state/mutations.js` só tem `resetAllPlayers()`/`resetGameState()`, sem setters por campo
- os `engine/*.js` escrevem direto em `Game.state.players` (ex.: o KPI do Respondedor em `answerEngine.js`)

Motivo: a migração da arquitetura extraiu a lógica do código original preservando o comportamento exato, sem reescrevê-la no padrão funcional.

**Status: ✅ Fechado, não será corrigido.** Mexer na lógica mais sensível do jogo (cálculo de KPI e recursos) só por rigor de padrão não compensa o risco — decisão mantida mesmo com os testes automatizados (ver "Testes automatizados" abaixo).

### `Game.core.*` é a API pública oficial entre camadas

`ui/*.js` e `network/*.js` chamam a lógica por `Game.core.*`, não por `Game.engine.X.Y()`. Passar para `Game.engine` seria trabalho mecânico em ~15–20 arquivos, sem ganho funcional; por isso `Game.core.*` é a API oficial entre camadas, e os comentários de exportação dos `engine/*.js` dizem isso.

### Sistema de recursos: "Pedido de Ajuda" em vez de mercado livre

Em `engine/tradeEngine.js` (o comentário de cabeçalho do arquivo tem o racional completo): o botão só aparece pra quem está com **0 recursos ou menos** (`profileComponent.js` controla a visibilidade via `syncPlayerViews()`). Ao pedir ajuda, o host monta uma fila automática — jogadores ativos com recurso, do que tem mais pro que tem menos — e pergunta um de cada vez, avançando sozinho a cada recusa/timeout, até alguém aceitar ou a fila acabar. Não há escolha manual de "vender pra quem". Um pedido por vez: quem pede enquanto outro está em andamento é recusado na hora, com aviso (BUG-024).

Motivo (feedback do piloto com alunos): um botão de venda sempre visível virava distração paralela ao objetivo do jogo (quiz de PMBOK). A matemática da troca fica em `domain/tradeRules.js`.

### Economia de recursos: erro é que custa, não participar

- Recursos iniciais: **10** (`config/game-config.js`)
- **Acertar nunca gasta recurso**
- **Errar gasta 1 recurso**, protegido pelo evento Reserva de Contingência
- A decisão de gastar fica em `domain/kpiRules.js` → `calculateAnswerResult()` (campo `spendsResource` do retorno)
- Não há "pular vez por falta de recurso": qualquer jogador ativo pode ser sorteado para responder (`engine/turnEngine.js` → `pickNewPair()`), mesmo com 0 recursos ou menos.
- **Estouro de orçamento:** o recurso não tem piso. Errar com 0 vai a −1, com −1 a −2 (`engine/answerEngine.js`), e o Corte de Orçamento também tira de quem tem 0 ou menos (`domain/eventRules.js`). O KPI Final é o mesmo cálculo (`KPI + recursos × FINAL_RESOURCE_VALUE`, em `domain/rankingRules.js`), então o negativo desconta. Na tela, o card de perfil mostra o número em vermelho com o rótulo "Estouro" (`resources-overrun`, `profile.overrunLabel`) e a lista de jogadores, em vermelho com a explicação no `title`.
- **Eventos pelo tabuleiro:** o Patrocinador Generoso e a Reestruturação olham as atividades concluídas na partida (índice da área foco × `ACTIVITIES_PER_FOCUS_AREA` + as da área atual; `countCompletedActivities()` em `domain/eventRules.js`). O Patrocinador dá o recurso a quem concluiu menos (empate: menos recursos; empate em tudo: todos os empatados). Na Reestruturação, quem concluiu mais cede 1 a quem concluiu menos (empate: cede quem tem mais recursos, recebe quem tem menos; empate em tudo de um lado: sorteio); não acontece quando todos estão empatados em atividades e recursos (`all-tied`) nem quando quem cederia tem 0 ou menos (`giver-without-resources`). `applyEventEffects()` devolve `{ logs, effect }`: o `effect` (`receivers`, `giver`, `amount`, `reason`) vai no `show-event` como `eventEffect` e o modal do evento (`ui/modals/eventModal.js`) mostra quem foi atingido. O efeito não vai para o estado salvo: o aviso só aparece no início da rodada.
- O "Pedido de Ajuda" só aparece depois de errar o bastante para zerar.

Motivo (feedback do piloto): o recurso pune o erro, não é um custo de participar. O estouro faz o erro continuar custando depois de zerar. Os eventos de recurso favorecem quem está mais atrás no tabuleiro, não só quem tem menos recursos.

### Schema de `data/questions.*.json` — chaves em inglês, estáveis entre idiomas

As chaves seguem a terminologia da 8ª edição do PMBOK e são as mesmas em qualquer idioma, para um `questions.en-US.json`/`questions.es-ES.json` futuro só traduzir os valores.

**Chaves de schema** (estrutura do documento):
```
{
  "domains": {
    "<domain_key>": {
      "name": "...",
      "focusAreas": ["initiating", "planning", ...],
      "questions": [
        { "id": "...", "question": "...", "alternatives": [...], "correct": "a" }
      ]
    }
  }
}
```
- `domains` — os 7 Domínios de Desempenho
- `name` — nome do domínio mostrado na tela
- `focusAreas` — as Áreas Foco do PMBOK 8 em que o domínio aparece
- `questions` — as perguntas: `question`, `alternatives`, `correct` (a letra da alternativa certa)

**Chaves de domínio** (`governance`, `scope`, `schedule`, `finance`, `stakeholders`, `resources`, `risks`): identificador estável, no mesmo papel do `id` de cada pergunta — **devem ser as mesmas em qualquer arquivo de idioma**, porque também viram chave de `state.decks` (persistido em `localStorage`).

**Áreas foco:** os valores da lista `focusAreas` de cada domínio são os IDs de `CONFIG.FOCUS_AREAS` — `initiating`, `planning`, `executing`, `monitoringControlling`, `closing`. Os mesmos IDs são o `focusArea` de cada jogador, do ranking final e de `pmKPI_myData`; o nome mostrado na tela ("Iniciação"...) vem do `name` de cada área no CONFIG. Como as chaves de domínio, um `questions.en-US.json` futuro reusa esses IDs.

### Configuração fica em `config/game-config.js`

O arquivo de configuração é `config/game-config.js` (carregado por `index.html` e `game.html`). As opções do PeerJS ficam em `CONFIG.PEER`, e todo `new Peer(...)` usa uma cópia delas — é o lugar para apontar um servidor de sinalização próprio.

### Por que o projeto não usa ES Modules

O projeto usa `<script>` simples + namespace global `window.Game`. ES Modules exigiriam servidor HTTP (não funcionam abrindo o HTML direto via `file://`), tocariam os ~40 arquivos `.js` e removeriam a camada `Game.core`/`Game.engine`/`Game.domain`, sem corrigir nenhum bug. Decisão: não migrar, a menos que o projeto passe a ter um processo de build.

### Versão do estado salvo

O estado salvo no `localStorage` (`pmKPI_roomState` e `pmKPI_myData`, gravados juntos por `utils/persistence.js`) tem um número de versão, no campo `stateVersion` de `pmKPI_roomState` (`STATE_VERSION`, hoje 6) — não confundir com `hostVersion`, que conta as trocas de host. Antes de restaurar, `migrateSavedState()` aplica em ordem os passos da tabela `STATE_MIGRATIONS` (passo N converte da versão N para N+1) até a versão atual. Regras:

- **Sem versão**: conta como versão 1 — o formato é o mesmo. No próximo salvamento passa a ter `stateVersion: 1`.
- **Versão mais nova que o código** (ex.: arquivos antigos em cache logo depois de um deploy): não restaura e não apaga — a versão nova do código ainda consegue usar.
- **Versão inválida** ou passo de migração faltando: tratado como estado corrompido (apagado, jogo começa do zero).
- A versão é conferida antes de sala e jogador, porque num formato mais novo esses campos podem ter mudado de nome.

Para mudar o formato: aumentar `STATE_VERSION` e acrescentar o passo em `STATE_MIGRATIONS`, com teste. Como o estado salvo só vale 5 minutos, o risco real é um F5 logo depois de um deploy.

Passos existentes:
- **1 → 2** (`migrateRoundFieldsToEnglish()`): campos da rodada e da partida em inglês — `usedRespondedorThisRound` → `answeredThisRound`, `rodadaEncerrada` → `roundEnded`, `partidaPausada { evento }` → `matchPaused { event }`, `rankingFinal` → `finalRanking`, `baralhos { perguntas, disponiveis }` → `decks { questions, available }` (cada pergunta: `usada` → `used`) e, na rodada, `evento/perguntador/respondedor/pergunta/respondeu` → `event/asker/answerer/question/answered` (na pergunta, `isPerguntador`/`isRespondedor` → `isAsker`/`isAnswerer`; na resposta guardada, `alternativa` → `alternative`). Jogadores, assessoria e `pmKPI_myData` não mudam.
- **2 → 3** (`migratePlayerFieldsToEnglish()`): campos do jogador e do ranking final em inglês — em cada jogador, `recursos` → `resources` e `phase` → `focusArea` (também em `pmKPI_myData`); em cada linha de `finalRanking`, os mesmos dois e `posicao` → `position`, `kpiFinal` → `finalKpi`. Rodada, baralhos e assessoria não mudam.
- **3 → 4** (`migrateAdvisoryFieldsToEnglish()`): a assessoria da rodada em inglês — `currentRound.assessoria { assessorName, sugestao }` → `currentRound.advisory { advisorName, suggestion }` (o `status` já era em inglês). O pedido de ajuda não é salvo; jogadores, baralhos e `pmKPI_myData` não mudam.
- **4 → 5** (`migrateEventFieldsToEnglish()`): os campos do evento em inglês, no evento da rodada (`currentRound.event`) e no da pausa (`matchPaused.event`) — `titulo` → `title`, `descricao` → `description` e os efeitos `recursos_todos` → `resourcesForAll`, `recursos_menos` → `resourcesForFewest`, `troca_recursos` → `resourceSwap`, `reserva_contingencia` → `contingencyReserve`, `neutro` → `neutral` (os mesmos nomes de `data/events.json`, cuja lista passou de `eventos` a `events`). Jogadores, baralhos e `pmKPI_myData` não mudam.
- **5 → 6** (`migrateFocusAreaIdsToEnglish()`): os IDs das áreas foco em inglês — o **valor** de `focusArea` (não o nome do campo) nos jogadores, em cada linha de `finalRanking` e em `pmKPI_myData`: `iniciacao` → `initiating`, `planejamento` → `planning`, `execucao` → `executing`, `monitoramento_controle` → `monitoringControlling`, `encerramento` → `closing`. Valor fora da tabela fica como está. A pergunta da rodada guarda o nome da área (`area`: "Iniciação"), não o ID, e não muda; rodada e baralhos não mudam.

### `connectionState.js` — por que existe

`peerService.js`, `messageHandler.js` e `hostMigration.js` precisam enxergar a mesma conexão (`myPeer`, `connections`); por isso esse estado é compartilhado via getters/setters em `connectionState.js`.

---

## Conexão, identidade e troca de host (Fase D)

Resumo dos mecanismos; detalhes nos comentários de cada arquivo e no checklist `connection-tests.md`.

- **Jogador desconectado:** durante a partida, quem cai continua na lista com `disconnected: true` (KPI, recursos e vaga preservados), fora do sorteio, do rodízio, dos efeitos de evento, da fila do pedido de ajuda e da escolha de assessor (BUG-022). No lobby e no fim de jogo, quem cai sai da lista. `getActivePlayers()` exclui desconectados; `getMatchPlayers()` inclui.
- **Sala travada:** com a partida em andamento, nome novo é recusado (`join-rejected` com `room-locked`); só volta quem já estava na partida.
- **Pausa:** se faltam jogadores *conectados* mas não jogadores da partida, a partida pausa (`match-paused`) e retoma sozinha quando alguém volta, com o mesmo evento. Se todos os conectados já tinham respondido, a rodada é encerrada em vez de recomeçar (D3e).
- **Saída da página:** `pagehide`/`beforeunload` encerram as conexões na hora, para os outros perceberem a saída sem esperar o tempo limite da rede.
- **Versão do jogo:** o `player-join` leva `protocolVersion` (`PROTOCOL_VERSION` em `network/peerService.js`, hoje 7). O host confere antes de tudo e recusa quem vem com outra versão (`join-rejected` com `version-mismatch`; o aviso pede para recarregar a página). Motivo: logo depois de um deploy, quem dá F5 passa a rodar o código novo e os outros continuam no antigo; com nomes de campo diferentes nas mensagens, a partida travaria sem aviso. Sem o campo (jogo de antes da versão) conta como 1.
- **Identidade (D2):** cada navegador gera um token por sala (`utils/identity.js`, guardado em `localStorage`). O `player-join` leva o token; o host guarda só o hash (SHA-256 próprio e síncrono — `crypto.subtle` só existe em HTTPS/localhost e é assíncrono) e exige o mesmo token para reconectar alguém que caiu.
- **F5 do host (D3f):** o estado salvo (`utils/persistence.js`) inclui se a rodada está encerrada e se a partida está pausada (com o evento). Ao recarregar, `main.js` só chama `Game.core.resumeMatchAfterReload()` (`engine/sessionEngine.js`), que faz o que aconteceria sem o F5: pausa e rodada encerrada continuam; pergunta já respondida segue para a próxima dupla (ou encerra a partida, se a resposta completou a última área foco); pergunta aberta é reexibida (com o host fora da dupla, a tela de espectador — BUG-020) com o prazo de resposta rearmado. A pergunta guardada na rodada leva os nomes de domínio e área (as etiquetas da tela), para o F5 e o `state-sync` mostrarem as etiquetas. O estado salvo também guarda o fim de jogo e o ranking final (`gameOver`, `finalRanking`): um F5 na tela final volta a ela (`Game.core.showGameOver()`) — BUG-021.
- **O que quem reconecta recebe:** `state-sync` com a rodada, o relógio (a contagem local é religada), se a rodada está encerrada ou pausada, quem já respondeu nesta rodada e, no fim de jogo, o ranking final. Depois do fim de jogo a sala não fica travada: quem caiu na tela final pode voltar (BUG-021).
- **Troca de host:** quando o host cai, os guests tentam o mesmo host por até `CONFIG.GAME.HOST_TIMEOUT` (10s). Esgotado, o backup assume num ID novo: a sala passa de `<ID base>` para `<ID base>-h1`, `-h2`... (`computeHostPeerId`). O ID muda porque o antigo pode ficar preso no servidor de sinalização por até ~1 min, e o host antigo voltando brigaria por ele. Quem assume marca `host=true` na URL (um F5 continua host); o host antigo fica na lista como jogador comum desconectado e, se voltar (ou recarregar a página), entra como jogador comum. O novo host não manda aviso de troca (ninguém está conectado ao ID novo nesse momento): cada guest acha a sala sozinho. O relógio de quem assume é a mesma contagem do início da partida (`Game.core.startClock()`).
- **Procura da sala (D3c, `network/hostSearch.js`):** quem só conhece o ID base (tela inicial, link antigo, conexão inicial) procura o ID base e as versões seguintes ao mesmo tempo e fica com a que responder. A tela inicial também recusa criar sala com o código de uma partida que continua numa versão migrada.
- **Rodada na troca de host:** só o host tem o gabarito, e só o Perguntador recebe a pergunta com ele. Por isso a rodada só continua se o novo host era o Perguntador de uma pergunta ainda aberta; senão a pergunta é descartada e quem ia responder não perde a vez. Todos recebem a lista de quem já respondeu na rodada (`answeredThisRound`, D3e), então o novo host continua o rodízio de onde parou; rodada já encerrada continua encerrada, esperando o "Nova Rodada".
- **Voltar ao lobby:** zera os jogadores (inclusive quem tinha saído da partida) e tira da lista quem estava desconectado.

## Testes automatizados

As regras para escrever teste (onde entra, numeração, os dois commits) estão em `conventions.md`, seção "Testes".

- `tests/logic/` carrega os arquivos reais do jogo em contextos isolados do Node (`vm`), com rede, tela e PeerJS simulados, e verifica os mecanismos acima caso a caso. Um arquivo por assunto (`*.test.js`); o ambiente simulado e os ajudantes ficam em `environment.js`. Não tem dependências: `node tests/logic/<arquivo>`. Atenção: a tela simulada (`Game.ui`) aceita qualquer nome de função, então uma chamada com nome errado passa nesses testes e só falha no navegador — conferir com uma busca no código. As chaves de texto são conferidas pelo T88 e os IDs e seletores do HTML, pelo T91.
- `.github/workflows/testes.yml` roda todos os `tests/logic/*.test.js` e os de `tests/browser` a cada push e pull request; o resultado fica na aba Actions do repositório (uma tabela por arquivo, sem total geral).
- `tests/browser` roda o jogo de verdade em janelas separadas do Chromium (Playwright), com o site e um servidor PeerJS locais — sem depender da internet. Os arquivos do jogo não mudam: o teste redireciona o PeerJS (unpkg) para o pacote local, de mesma versão, e acrescenta ao `config/game-config.js` servido uma linha que aponta `CONFIG.PEER` para o servidor local. As dependências (`package.json`) são só dos testes. No Actions, é o job "ponta-a-ponta", separado do de lógica.
- O que depende de rede real, dispositivo ou outros navegadores continua no checklist manual (`connection-tests.md`), com o passo a passo em `manual-test-scripts.md`.

## Simulador de partidas (balanceamento)

- `tests/simulation/simulator.js` roda partidas inteiras sem rede e sem tela, para medir duração, recursos, economia, eventos e justiça antes de mexer no `config/game-config.js`. Carrega num contexto `vm` os arquivos reais (`config/`, `state/`, `domain/`, `engine/` e o `main.js`, cujo `loadQuestions()` monta os baralhos a partir de `data/`) — nenhuma regra é copiada.
- Robôs fazem o papel dos jogadores: o host real recebe resposta, pedido e resposta de assessoria, pedido de ajuda e resposta à oferta pelas mesmas funções de `Game.core.*` que a rede chamaria. O tempo é falso (prazos e relógio da partida andam sem esperar) e o sorteio usa semente (mesma semente, mesmas partidas). Trocas do config ("cenário B") valem só dentro da simulação.
- Roda no Actions pelo workflow `simulacao.yml` (botão "Run workflow", formulário com as chances dos robôs e o cenário B); relatório no resumo da execução e planilhas `.csv` no artefato "simulacao". O ranking das partidas simuladas usa o desempate real, e o relatório mede os empates que sobram. Testes: T93–T99 e T102.
