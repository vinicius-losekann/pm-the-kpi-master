# 🗺️ Arquitetura — PM: The KPI Master

> **Contém:** como o sistema funciona hoje — tipo de arquitetura, árvore
> arquivo por arquivo, notas de arquitetura (NOTA-003 a NOTA-005) e
> decisões técnicas, schema dos dados, estado salvo e migrações, conexão
> e troca de host, testes automatizados, simulador. **Não contém:** regras
> de escrita de código (→ `conventions.md`), bugs (→ `issues.md`) nem
> planos (→ `roadmap.md`).
>
> Última revisão: 18/10/2026

## Tipo de arquitetura

- **Aplicação estática no navegador, sem servidor próprio.** O site
  (HTML, CSS, JS e os JSON de dados) é publicado no GitHub Pages; não
  há back-end próprio. O jogo usa um serviço externo: o Firebase (plano
  gratuito), com login anônimo e Realtime Database, por onde todos
  conversam (canal da sala, `network/roomChannel.js`, com as regras de
  `rooms/` em `database.rules.json`). A página de teste de conexão
  (`firebase-check.html`, fora do jogo) mede se a sincronia pelo Firebase
  funciona nas redes de quem joga.
- **Host autoritativo, conversa pelo banco.** O navegador do host faz o
  papel de servidor: guarda o estado oficial, valida os pedidos
  (`*-request`) e distribui os resultados. Os pedidos e os avisos passam
  pelo banco (seção "Conexão, identidade e F5"). Se o host cai, outro
  jogador assume a sala no banco (`meta`) e continua a partida a partir
  do estado gravado nele.
- **Camadas** (`domain → state → engine → network/ui`), com a direção
  de dependência descrita em `conventions.md`.
- **Núcleo de regras puras + orquestração.** `domain/` calcula (KPI,
  eventos, sorteio, ranking) sem tela, rede nem estado global; `engine/`
  executa: lê e grava o estado, chama a rede e a tela. É uma aproximação
  do padrão *functional core, imperative shell*, com as exceções da
  NOTA-005.
- **Estado centralizado.** Um único `Game.state` (`state/store.js`); o
  host grava o estado da partida no banco da sala (`secret/state`), com
  versão e migração.
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
│   ├── manual-test-scripts.md   # passo a passo dos testes manuais P1 (M21, M22, M7, M8, M18)
│   └── issues.md                # bugs em aberto e corrigidos, limpezas (NOTA)
│
├── config/
│   └── game-config.js           # CONFIG (constantes ajustáveis, inclusive a configuração web do Firebase)
│
├── firebase.json                # regras do banco e portas do emulador do Firebase (testes no navegador)
├── database.rules.json          # regras de segurança do Realtime Database (coladas no console do Firebase)
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
│   │   ├── help-and-advisory.test.js # pedido de ajuda e assessoria (só com recurso; honorário ao assessor)
│   │   ├── economy.test.js          # economia de recursos: estouro de orçamento (erro e corte sem piso), KPI Final com negativo, eventos pelo tabuleiro e aviso com os nomes
│   │   ├── question-pace.test.js    # ritmo da pergunta: "Fazer a pergunta", prazo de resposta pausado no apoio, tempo esgotado, prazos pela hora do servidor
│   │   ├── questions.test.js        # banco de perguntas: formato, gabarito equilibrado
│   │   ├── config-and-texts.test.js # chaves do CONFIG, textos da tela e nomes do HTML/CSS (só o que existe é pedido; CSS sem regra sem uso)
│   │   ├── simulation.test.js   # simulador de partidas: regras reais, contas, semente, relatório
│   │   ├── connection-check.test.js # teste de conexão pelo Firebase: sala, presença, F5, mensagens, regras do banco
│   │   ├── room-channel.test.js # canal da sala pelo Firebase: sala parada, roster, pedidos, avisos, estado, presença, sinal de vida e tolerância, cursor dos avisos, volta da conexão, regras de rooms/
│   │   ├── room-link.test.js    # o jogo pelo canal da sala: papel pelo banco, pedidos e avisos, cursor, recusa, queda e volta, F5, host que cai, troca de host no jogo, aba duplicada, login anônimo e hora do servidor
│   │   └── fakeFirebase.js      # Realtime Database simulado em memória, com vários aparelhos, queda e volta e a diferença do relógio do servidor
│   ├── simulation/              # simulador de partidas para balanceamento (Node, sem dependências)
│   │   ├── simulator.js         # partidas com robôs, regras reais, relatório e CSV
│   │   └── run.js               # lê o formulário do workflow e grava o relatório
│   └── browser/                 # o jogo real no Chromium (Playwright)
│       ├── playwright.config.js
│       ├── servers.js           # site local (o emulador do Firebase sobe à parte, pelo Playwright)
│       ├── players.js           # jogadores (contextos separados) e ajudantes
│       ├── summary.js           # tabela de resultados no Actions
│       └── *.spec.js            # cenários (connection, host-reload, host-migration, layout, question-pace, connection-check)
│
├── index.html
├── game.html
├── firebase-check.html          # página de teste de conexão pelo Firebase (fora do jogo, sem link nele)
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
    │   ├── roomEntry.js         # tela inicial: criar sala e conferir a sala de quem entra (Firebase)
    │   └── connectionCheckPage.js # tela do teste de conexão: Firebase, login anônimo, volta depois do F5
    │
    ├── domain/                  # 🧠 regras puras — sem DOM, sem rede, sem i18n
    │   ├── kpiRules.js          # calculateAnswerResult(...)
    │   ├── eventRules.js        # drawEvent(...), applyEventEffects(...)
    │   ├── deckRules.js         # drawQuestion(...), resetDeck(...)
    │   ├── advisoryRules.js     # validateAdvisoryRequest(...), calculateSupportOutcome(...) — assessoria e pedido de ajuda
    │   └── rankingRules.js      # buildRanking(...): KPI Final; desempate por área foco, atividades e KPI; empate total divide a posição
    │
    ├── state/
    │   ├── store.js             # fonte única da verdade (Game.state)
    │   ├── selectors.js         # leitura: getPlayerByName, getActivePlayers...
    │   └── mutations.js         # escrita: resetAllPlayers, resetGameState...
    │
    ├── engine/                  # 🎬 orquestração — chama domain, mexe em state, network, ui
    │   ├── sessionEngine.js     # startGame, endGame, endMatch, endSession, leaveMatch, retomada após F5 do host...
    │   ├── turnEngine.js        # startNewRound, pickNewPair, askQuestion (etapa "Fazer a pergunta"), prazos de resposta, nextTurn
    │   ├── answerEngine.js      # handleAnswer (com o resultado do apoio), updatePlayerKPI
    │   └── advisoryEngine.js    # assessoria e pedido de ajuda: requestAdvisory, handleAdvisoryAnswer
    │
    ├── network/
    │   ├── firebaseLogin.js     # Firebase, login anônimo e hora do servidor (emulador nos testes)
    │   ├── roomChannel.js       # canal da sala pelo Firebase: sala, roster, pedidos ao host, avisos (com cursor para quem entra), estado público/secreto, presença com sinal de vida e tolerância, volta da conexão, troca de host (transação no meta)
    │   ├── roomLink.js          # liga o jogo ao canal: abrir a sala (papel pelo banco, estado de outro host), enviar, receber, troca de host, aba duplicada, sair; PROTOCOL_VERSION
    │   ├── messageHandler.js    # roteamento de mensagens (switch/case), entrada e queda de jogador
    │   └── connectionCheck.js   # teste de conexão pelo Firebase: sala, presença, mensagem de teste com eco (não usado pelo jogo)
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
    │       ├── resultModal.js         # acertou/errou (com o apoio: honorário, ajuda, cobertura) + aviso de quem apoiou
    │       ├── eventModal.js
    │       └── advisoryModal.js       # assessoria e pedido de ajuda: seleção + pergunta + resultado
    │
    ├── locales/
    │   └── pt-BR.js              # textos da tela — ver NOTA-003
    │
    └── utils/
        ├── logger.js              # 🟡 infra pronta, religamento pendente — ver NOTA-004
        ├── persistence.js         # estado salvo, com versão e migração
        ├── sanitize.js            # escape de texto vindo de outros jogadores
        └── i18n.js                # tradução dos textos — ver NOTA-003
```

---

## Notas de arquitetura (decisões registradas e pendências que não são bugs)

### NOTA-003 — i18n: UI em pt-BR, faltam os outros idiomas

As strings de usuário em `ui/*.js`, `engine/answerEngine.js`, `engine/advisoryEngine.js`, `network/roomLink.js` e `main.js` chamam `Game.i18n.t('namespace.chave')`. As chaves do dicionário `pt-BR.js` têm nomes e marcadores em inglês (`lobby.waitingForHost`, `{{advisor}}`); o T88 confere que toda chave pedida existe, que toda chave é usada e que cada chamada passa os marcadores do texto. Os motivos de recusa de entrada na sala (`join-rejected`, `handleJoinRejected()`) ainda são texto fixo em `network/messageHandler.js`.

O que falta:
1. Criar `en-US.js` e `es-ES.js` com as mesmas chaves de `pt-BR.js` (antes, conferir se sobrou texto fixo, como os motivos de recusa acima)
2. Adicionar um seletor de idioma na UI que chama `Game.i18n.setLocale()`
3. Testar a troca de idioma em tempo real

**Fora do escopo por ora:** `index.html`/`entry/roomEntry.js` (tela inicial de criar/entrar em sala) não carrega `i18n.js`/`locales/pt-BR.js` e continua com strings fixas — só `game.html` usa o i18n.

### Botão "Nova Rodada" para o host

O botão `btnNewRound`, ligado em `ui/setup.js`, aparece só para o host durante a partida e chama `Game.core.nextTurn()` — o mesmo fluxo que roda sozinho 3s depois de cada resposta (`engine/answerEngine.js`). Não pula rodada em andamento nem força nada fora do fluxo normal: só permite ao host avançar sem esperar.

### A pergunta: o Perguntador faz, o Respondedor responde

No início de cada dupla (`pickNewPair()`, `engine/turnEngine.js`), só o Perguntador recebe a pergunta (com o gabarito), com o botão "Fazer a pergunta" (`btnAskQuestion`); quem responde vê só o aviso de que ele vai perguntar (`question.waitingToBeAsked`), sem as alternativas. A rodada guarda `asked: false`. O Perguntador lê a pergunta em voz alta e clica (`ask-question`, `handleAskQuestion()`), ou ela vai sozinha no prazo dele (`CONFIG.GAME.ASK_TIMEOUT`, `armAskTimeout()`); nos dois casos, `askQuestion()` marca `asked: true`, avisa todos (`question-asked`), manda a pergunta sem o gabarito ao Respondedor e liga o prazo de resposta (`ANSWER_TIMEOUT`), que conta dali. `ASK_TIMEOUT` 0 desliga a etapa: a pergunta vai direto para quem responde.

- **Sem o campo `asked`** (estado salvo ou cópia de uma versão anterior), a pergunta conta como já feita — por isso o estado salvo não mudou de versão.
- **F5 do host e volta à partida** com a pergunta ainda por fazer: a rodada continua esperando o clique; o prazo do Perguntador continua de onde estava (`resumeMatchAfterReload()`, pela `askEndsAt`); quem volta como Respondedor vê o aviso, não as alternativas (`displayQuestion()` olha `asked`).
- **Prazo de resposta pausado no apoio:** quando um apoio começa, `pauseAnswerTimeout()` para o prazo, apaga a hora de término dele (`answerEndsAt`) e guarda o que faltava em `currentRound.answerTimeLeft` (ms); no fim do apoio (resposta, recusa ou prazo de quem foi chamado), o prazo continua desse valor, não do inteiro. O tempo que resta vai no `advisory-started` (o contador da tela de quem responde para) e a nova hora de término, no `advisory-result` (o contador volta por ela).
- **Tempo esgotado** conta como erro (gasta recurso e entra no rodízio, como antes); o `kpi-update` leva `timedOut` e a tela de resultado mostra "Tempo esgotado" no lugar de "Errou".

### Relógio e prazos pela hora do servidor

O relógio da partida e os prazos (do Perguntador, de resposta e de quem foi chamado para o apoio) são guardados como **hora de término**, em milissegundos do relógio do servidor; cada aparelho calcula o que falta. Assim todos mostram o mesmo tempo, mesmo com o relógio do computador errado, e um F5 do host continua do mesmo ponto.

- **Hora do servidor:** `firebaseLogin.start()` devolve `serverNow()` = relógio do aparelho + a diferença que o Firebase mede ao conectar (`.info/serverTimeOffset`, medida de novo a cada reconexão). O `main.js` passa esse relógio ao abrir a sala, e o resto do jogo lê `Game.network.serverNow()` (`network/roomLink.js`; sem sala aberta, o relógio do aparelho).
- **Partida:** o `startGame()` do host grava `state.endsAt` (hora do servidor + `SESSION_DURATION`) e manda o `game-start` com ela. `startClock()` (`engine/sessionEngine.js`) calcula, na hora e a cada segundo, `state.timer` = segundos até `endsAt` (só para a tela; um tique atrasado não perde segundos). No zero, o host encerra a partida; o guest só para. Não há aviso periódico de tempo. A pausa por falta de conexão não para o relógio. Quem entra ou volta recebe `endsAt` no `state-sync`.
- **Prazos da rodada:** `armAskTimeout()` grava `currentRound.askEndsAt`, `armAnswerTimeout()` grava `currentRound.answerEndsAt` (vazio com o apoio pendente) e o pedido de apoio grava `currentRound.advisory.endsAt`. A pergunta de quem responde leva `answerEndsAt`; o `advisory-started` e o `advisory-question` levam `endsAt` do apoio; o `advisory-result`, a nova `answerEndsAt`. Os contadores da tela (`ui/components/questionComponent.js`, `ui/modals/advisoryModal.js`) contam por essas horas.
- **F5 do host:** `resumeMatchAfterReload()` arma cada prazo com o que falta até a hora gravada; o que venceu durante o F5 tem o efeito na retomada (a partida termina, a pergunta vai sozinha, a vez é pulada). Rodada salva sem a hora de um prazo ganha o prazo inteiro. Um apoio pendente continua: o prazo de quem foi chamado conta pela `advisory.endsAt` (vencido, a recusa por tempo vem na retomada) e o de resposta continua parado até o apoio terminar.

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

### Apoio na vez de responder: assessoria ou pedido de ajuda

O Respondedor pode chamar outro jogador para sugerir uma alternativa — um apoio por pergunta, fora da Área Foco Encerramento. Com **1 recurso ou mais**, o apoio é **assessoria**; com **0 ou menos**, é **pedido de ajuda** (fiança). Os dois seguem o mesmo caminho (`engine/advisoryEngine.js`, `ui/modals/advisoryModal.js`, mensagens `advisory-*`) e ficam em `currentRound.advisory`, com o tipo em `kind` (`advisory` | `help`; sem o campo = `advisory`). Na tela é um botão só (`btnRequestAdvisory`, na pergunta de quem responde), que vira "Pedir Assessoria" ou "Pedir Ajuda" pelos recursos (`questionComponent.js`). O que muda entre os dois:

- **Quem pode pedir:** `validateAdvisoryRequest()` (`domain/advisoryRules.js`) recusa a assessoria com 0 ou menos (`needs-resources`) e a ajuda com 1 ou mais (`has-resources`); o `requestAdvisory()` do cliente nem envia.
- **Quem pode ser chamado:** jogador ativo, conectado, que não seja o Perguntador. Na ajuda, também precisa ter pelo menos `RESOURCES.HELP_COVER` recursos (`helper-without-resources`), para nunca ficar negativo por cobrir um erro; a lista de escolha só mostra quem pode.
- **Resultado depois da resposta** (só com a sugestão aceita e seguida): `calculateSupportOutcome()` decide e `handleAnswer()` (`engine/answerEngine.js`) aplica — assessoria certa: `fee` (honorário, abaixo); ajuda certa: `reward` (quem ajudou ganha `RESOURCES.HELP_REWARD` do patrocinador; quem pediu não paga); ajuda errada sem a Reserva de Contingência: `cover` (quem ajudou perde `RESOURCES.HELP_COVER` e quem pediu não perde o recurso do erro). Ignorou a sugestão, recusa ou prazo: resultado normal. O resultado vai nos `kpi-update` dos dois (`supportOutcome`, `supportAmount`, `supportPartner`, ver `conventions.md`); quem respondeu vê no resultado (`showResultModal`) e quem apoiou num aviso próprio (`showSupportResultModal`, `ui/modals/resultModal.js`). Quem apoiou e caiu continua valendo; quem saiu da sala (fora da lista), não.
- **Prazo, recusa e F5:** iguais para os dois (`ADVISORY_TIMEOUT`; durante o apoio, o prazo de resposta de quem pediu fica parado e depois continua de onde parou — seção "A pergunta: o Perguntador faz, o Respondedor responde"; recusa ou prazo gastam o apoio da pergunta; no F5 do host, o pendente continua com o prazo que faltava a quem foi chamado e o já respondido continua valendo — `resumePendingAdvisory()` em `engine/sessionEngine.js`; quem foi chamado recebe a pergunta do apoio de novo ao voltar à sala, depois do `state-sync`, e o host chamado a vê de novo na retomada — `sendAdvisoryQuestion()` em `engine/advisoryEngine.js`; quem foi chamado e caiu sem responder libera quem responde no fim do prazo).

Motivo (feedback do piloto e economia de recursos): o pedido de ajuda era uma venda fora da vez (fila automática, recurso por KPI) e quase não acontecia. Como fiança na vez de responder, quem está no estouro tem apoio na pergunta, e quem ajuda arrisca o próprio orçamento.

### Economia de recursos: erro é que custa, não participar

- Recursos iniciais: **10** (`config/game-config.js`)
- **Acertar nunca gasta recurso**
- **Errar gasta 1 recurso**, protegido pelo evento Reserva de Contingência
- A decisão de gastar fica em `domain/kpiRules.js` → `calculateAnswerResult()` (campo `spendsResource` do retorno)
- Não há "pular vez por falta de recurso": qualquer jogador ativo pode ser sorteado para responder (`engine/turnEngine.js` → `pickNewPair()`), mesmo com 0 recursos ou menos.
- **Estouro de orçamento:** o recurso não tem piso. Errar com 0 vai a −1, com −1 a −2 (`engine/answerEngine.js`), e o Corte de Orçamento também tira de quem tem 0 ou menos (`domain/eventRules.js`). O KPI Final é o mesmo cálculo (`KPI + recursos × FINAL_RESOURCE_VALUE`, em `domain/rankingRules.js`), então o negativo desconta. Na tela, o card de perfil mostra o número em vermelho com o rótulo "Estouro" (`resources-overrun`, `profile.overrunLabel`) e a lista de jogadores, em vermelho com a explicação no `title`.
- **Eventos pelo tabuleiro:** o Patrocinador Generoso e a Reestruturação olham as atividades concluídas na partida (índice da área foco × `ACTIVITIES_PER_FOCUS_AREA` + as da área atual; `countCompletedActivities()` em `domain/eventRules.js`). O Patrocinador dá o recurso a quem concluiu menos (empate: menos recursos; empate em tudo: todos os empatados). Na Reestruturação, quem concluiu mais cede 1 a quem concluiu menos (empate: cede quem tem mais recursos, recebe quem tem menos; empate em tudo de um lado: sorteio); não acontece quando todos estão empatados em atividades e recursos (`all-tied`) nem quando quem cederia tem 0 ou menos (`giver-without-resources`). `applyEventEffects()` devolve `{ logs, effect }`: o `effect` (`receivers`, `giver`, `amount`, `reason`) vai no `show-event` como `eventEffect` e o modal do evento (`ui/modals/eventModal.js`) mostra quem foi atingido. O efeito não vai para o estado salvo: o aviso só aparece no início da rodada.
- **Assessoria com honorário:** só com 1 recurso ou mais (seção anterior). Nada é pago no pedido: quando a sugestão aceita foi seguida e a resposta está certa, `calculateSupportOutcome()` devolve `fee` com `RESOURCES.ADVISORY_FEE`, e o recurso passa de quem respondeu ao assessor (sem piso; a Reserva de Contingência não entra). Não há bônus de KPI para o assessor.
- **Pedido de ajuda como fiança:** com 0 ou menos (seção anterior). Recompensa e cobertura são em recurso; nenhuma troca entre KPI e recurso sobra — o KPI só vem do acerto.

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

**Chaves de domínio** (`governance`, `scope`, `schedule`, `finance`, `stakeholders`, `resources`, `risks`): identificador estável, no mesmo papel do `id` de cada pergunta — **devem ser as mesmas em qualquer arquivo de idioma**, porque também viram chave de `state.decks` (gravado no estado salvo da sala).

**Áreas foco:** os valores da lista `focusAreas` de cada domínio são os IDs de `CONFIG.FOCUS_AREAS` — `initiating`, `planning`, `executing`, `monitoringControlling`, `closing`. Os mesmos IDs são o `focusArea` de cada jogador, e do ranking final; o nome mostrado na tela ("Iniciação"...) vem do `name` de cada área no CONFIG. Como as chaves de domínio, um `questions.en-US.json` futuro reusa esses IDs.

### Configuração fica em `config/game-config.js`

O arquivo de configuração é `config/game-config.js` (carregado por `index.html`, `game.html` e `firebase-check.html`). A configuração web do Firebase fica em `CONFIG.FIREBASE` (pública por natureza; a proteção vem das regras do banco) e o emulador dos testes no navegador, em `CONFIG.FIREBASE_EMULATOR` (`null` no site).

### Por que o projeto não usa ES Modules

O projeto usa `<script>` simples + namespace global `window.Game`. ES Modules exigiriam servidor HTTP (não funcionam abrindo o HTML direto via `file://`), tocariam os ~40 arquivos `.js` e removeriam a camada `Game.core`/`Game.engine`/`Game.domain`, sem corrigir nenhum bug. Decisão: não migrar, a menos que o projeto passe a ter um processo de build.

### Versão do estado salvo

O host grava o estado completo da partida no banco da sala, em `rooms/<código>/secret/state` (texto JSON, que só o host lê): a cada `Game.saveState()` (`utils/persistence.js`), o `saveRoomState()` (`network/roomLink.js`) grava o estado e anda a `meta/lastActivity` numa gravação só. O guest não grava nada (o estado dele vem do `state-sync`). Ao abrir a sala, o host lê o `secret/state` e restaura a partida antes de montar a tela (`openRoom()` → `restoreSavedState()`; o resultado da abertura leva `restored`). Vale enquanto a sala existir, sem prazo de validade.

O estado salvo tem um número de versão, no campo `stateVersion` (`STATE_VERSION`, hoje 9). Antes de restaurar, `migrateSavedState()` aplica em ordem os passos da tabela `STATE_MIGRATIONS` (passo N converte da versão N para N+1) até a versão atual. Até a versão 9, o estado ficava no navegador do host, em duas partes (`pmKPI_roomState` e `pmKPI_myData`, os dados do próprio host); os passos ainda recebem as duas, e a restauração pelo banco passa só a primeira. Regras:

- **Sem versão**: conta como versão 1 — o formato é o mesmo. No próximo salvamento passa a ter a versão atual.
- **Versão mais nova que o código** (ex.: arquivos antigos em cache logo depois de um deploy), **versão inválida**, texto ilegível ou passo de migração faltando: não restaura, não copia nada e não apaga — o host abre a sala sem a partida, e o banco fica como está até a próxima gravação.
- A versão é conferida antes de tudo, porque num formato mais novo os campos podem ter mudado de nome.

Para mudar o formato: aumentar `STATE_VERSION` e acrescentar o passo em `STATE_MIGRATIONS`, com teste. Como o estado vale enquanto a sala existir, um F5 do host logo depois de um deploy, numa partida em andamento, passa pela migração.

Passos existentes:
- **1 → 2** (`migrateRoundFieldsToEnglish()`): campos da rodada e da partida em inglês — `usedRespondedorThisRound` → `answeredThisRound`, `rodadaEncerrada` → `roundEnded`, `partidaPausada { evento }` → `matchPaused { event }`, `rankingFinal` → `finalRanking`, `baralhos { perguntas, disponiveis }` → `decks { questions, available }` (cada pergunta: `usada` → `used`) e, na rodada, `evento/perguntador/respondedor/pergunta/respondeu` → `event/asker/answerer/question/answered` (na pergunta, `isPerguntador`/`isRespondedor` → `isAsker`/`isAnswerer`; na resposta guardada, `alternativa` → `alternative`). Jogadores, assessoria e `pmKPI_myData` não mudam.
- **2 → 3** (`migratePlayerFieldsToEnglish()`): campos do jogador e do ranking final em inglês — em cada jogador, `recursos` → `resources` e `phase` → `focusArea` (também em `pmKPI_myData`); em cada linha de `finalRanking`, os mesmos dois e `posicao` → `position`, `kpiFinal` → `finalKpi`. Rodada, baralhos e assessoria não mudam.
- **3 → 4** (`migrateAdvisoryFieldsToEnglish()`): a assessoria da rodada em inglês — `currentRound.assessoria { assessorName, sugestao }` → `currentRound.advisory { advisorName, suggestion }` (o `status` já era em inglês). O pedido de ajuda não é salvo; jogadores, baralhos e `pmKPI_myData` não mudam.
- **4 → 5** (`migrateEventFieldsToEnglish()`): os campos do evento em inglês, no evento da rodada (`currentRound.event`) e no da pausa (`matchPaused.event`) — `titulo` → `title`, `descricao` → `description` e os efeitos `recursos_todos` → `resourcesForAll`, `recursos_menos` → `resourcesForFewest`, `troca_recursos` → `resourceSwap`, `reserva_contingencia` → `contingencyReserve`, `neutro` → `neutral` (os mesmos nomes de `data/events.json`, cuja lista passou de `eventos` a `events`). Jogadores, baralhos e `pmKPI_myData` não mudam.
- **5 → 6** (`migrateFocusAreaIdsToEnglish()`): os IDs das áreas foco em inglês — o **valor** de `focusArea` (não o nome do campo) nos jogadores, em cada linha de `finalRanking` e em `pmKPI_myData`: `iniciacao` → `initiating`, `planejamento` → `planning`, `execucao` → `executing`, `monitoramento_controle` → `monitoringControlling`, `encerramento` → `closing`. Valor fora da tabela fica como está. A pergunta da rodada guarda o nome da área (`area`: "Iniciação"), não o ID, e não muda; rodada e baralhos não mudam.
- **6 → 7** (`addSupportKind()`): o pedido de ajuda passou a usar o campo da assessoria (`currentRound.advisory`), com o tipo em `kind`; a assessoria salva antes disso ganha `kind: 'advisory'`. Assessoria cancelada (`null`), rodada sem ela, jogadores, baralhos e `pmKPI_myData` não mudam.
- **7 → 8** (`removePeerConnectionFields()`): saem os campos da conexão pelo PeerJS — `hostPeerId`, `backupPeerId`, `baseRoomPeerId`, `hostVersion` e o `tokenHash` de cada jogador (a identidade passou a ser o uid do aparelho, no `peerId`). O ranking final, o resto dos jogadores e `pmKPI_myData` não mudam.
- **8 → 9** (`timerToEndsAt()`): o relógio da partida passou a contar pela hora de término — o tempo que faltava (`timer`, em segundos) vira `endsAt` = hora da gravação (`timestamp`) + `timer`. Sem `timer`, fica sem `endsAt`. Os prazos da rodada (`askEndsAt`, `answerEndsAt`) não existiam: no F5, ausentes valem inteiros. O resto e `pmKPI_myData` não mudam.

---

## Conexão, identidade e F5

Resumo dos mecanismos; detalhes nos comentários de cada arquivo e no checklist `connection-tests.md`.

- **Canal da sala (`network/roomChannel.js`):** cada sala fica no banco em `rooms/<código>` — `meta` (dono, número da troca de host — `hostEpoch` —, versão do protocolo, criação, última atividade; todo aparelho na sala o escuta), `roster` (jogadores aceitos, gravado pelo host), `requests` (pedidos ao host, cada um com o uid de quem pediu), `feed` (avisos do host para todos), `inbox/<uid>` (avisos para um jogador), `presence/<uid>` (`{ online, lastSeen }` — o sinal de vida, abaixo; o servidor grava `online: false` com a hora da queda quando a aba fecha ou a conexão cai) e as partes do estado: `secret` (o estado completo da partida, gravado pelo host — seção "Versão do estado salvo") e `public`, `hands`, que o jogo não usa. Tudo viaja como texto JSON. O que cada um lê e grava está em `database.rules.json`: quem não foi aceito só lê o `meta`, a própria `inbox` e o próprio `roster/<uid>`, e só grava pedido em nome próprio.
- **Ligação do jogo (`network/roomLink.js`):** o resto do jogo envia por `sendToHost`, `broadcastAll` e `sendToPlayer` (para o próprio host, tratado na hora) e recebe pelo `Game.network.handleMessage(msg, uid de quem mandou)`. O host recebe os pedidos (`receiveRequest`) e as quedas pela presença (`receivePresence` → `handlePlayerDisconnect`); o guest recebe os avisos do host com o uid dele.
- **Login e identidade (`network/firebaseLogin.js`):** login anônimo; o uid é a identidade do aparelho (sobrevive a F5 e a fechar a aba; abas do mesmo navegador têm o mesmo uid) e fica no campo `peerId` dos jogadores. Entrada (`addPlayer()`, `network/messageHandler.js`): mesmo nome e mesmo uid volta ao lugar; mesmo nome em outro aparelho é `name-taken` com o dono conectado e `identity-mismatch` com ele fora (a vaga continua reservada); o aparelho já na sala com outro nome é `device-in-use`. Quem é aceito entra no `roster` (`admitPlayer`); quem sai da lista sai do `roster` e da presença (`dismissPlayer`). A recusa vai pela `inbox` de quem pediu.
- **Tela inicial e papel:** a tela inicial cria a sala com a versão do jogo (`createRoom`; código em uso só é aceito se a sala está parada há 2 h) ou confere, só lendo, se a sala existe e é da mesma versão (`checkRoom`). O jogo abre em `game.html?room=<código>&playerName=<nome>`; `openRoom()` lê o `meta`: quem é o dono é host, os outros são guests e pedem para entrar (`player-join`). O que chega do canal antes de a sala abrir espera numa fila; o `main.js` monta a tela (e o host retoma a partida) antes de a fila ser tratada.
- **Aba duplicada:** antes de abrir a sala, a aba pergunta às outras abas do mesmo navegador (`BroadcastChannel`) se alguma já está com ela; se está, não entra (`tab-in-use`) e não mexe na sala.
- **Cursor dos avisos para todos:** o guest segura os avisos do `feed` antes de mandar o `player-join` (`holdFeed`); o `state-sync` leva o `feedCursor` (o último aviso que o estado já inclui) e a ligação libera os guardados a partir dele (`releaseFeed`). Assim, quem entra ou volta não recebe aviso de antes do estado depois dele, e recebe os de depois uma vez, na ordem.
- **Volta da conexão:** quando a conexão com o banco volta (`onReconnected`), o guest manda o `player-join` de novo e retoma o lugar pelo uid.
- **Sinal de vida e tolerância:** o host e quem foi aceito gravam `presence/<uid>` = `{ online: true, lastSeen }` (hora do servidor; as regras exigem `lastSeen === now`) ao entrar, a cada `CONFIG.GAME.HEARTBEAT_INTERVAL` (2 s) e quando a aba volta a ficar visível. "Vivo" é ter o último sinal recente: o host dá o jogador como caído com o sinal parado há mais de `PRESENCE_TIMEOUT` (20 s), conferido a cada 1 s e a cada mudança — o `online: false` sozinho não derruba ninguém, e a aba congelada (tela bloqueada), ainda online, cai do mesmo jeito. Assim, um F5 ou uma queda curta não viram queda: quem está na dupla continua com a mesma pergunta. O guest vê o host caído no `online: false` dele ou com o sinal parado há mais de `HOST_TIMEOUT` (10 s). Os tempos vão do config para o canal pela ligação (`heartbeatOptions()`).
- **Host que cai:** os outros veem "Host desconectado" (a presença dele) e a sala espera, até ele voltar ou, com o sinal dele parado há mais de `HOST_TIMEOUT`, outro jogador assumir (troca de host, abaixo); quando ele volta antes disso (F5 ou queda curta), "Conectado", e cada guest manda o `player-join` de novo e recebe o estado do host — assim chega a eles o que mudou enquanto o host estava fora, e quem foi chamado para um apoio pendente recebe a pergunta do apoio de novo.
- **Troca de host (no canal):** o guest aceito e conectado que vê o sinal do host parado há mais de `HOST_TIMEOUT` (10 s; fora da carência logo depois da volta da própria conexão) tenta, a cada 1 s e uma tentativa por vez, uma transação no `meta`: `hostUid` = ele, `hostEpoch` + 1, o resto igual. O banco aceita uma só; as regras exigem estar no `roster`, `hostEpoch` + 1, a mesma versão e criação e o `lastSeen` do host antigo há mais de 5 s (ou sem presença) pela hora do servidor — o config não fica abaixo desse piso. Todas as outras regras de `rooms/` decidem pelo `meta/hostUid`: trocado o `meta`, o host novo passa a ler o `secret` e o antigo perde a escrita. Quando o `hostEpoch` sobe, todos são avisados (`onHostChanged`): o guest que fica passa a ouvir a presença do host novo, e o host antigo deixa de ser host no canal (para o sinal de vida e de ouvir os pedidos e a presença).
- **Troca de host (no jogo, `handleHostChanged()` em `network/roomLink.js`):** quem assumiu e o host antigo recarregam a página e abrem pelo caminho do F5 — o primeiro como host, o segundo como guest, que pede para entrar e volta como jogador comum, com KPI e recursos. Os outros guests ficam na página: passam ao host novo, mostram "Fulano agora é o host" na linha de status (`connection.newHost`, no lugar do "Conectado" dali em diante) e mandam o `player-join` (o estado vem do host novo depois que ele abre). Ao abrir com o estado gravado por outro host (o jogador `isHost` do `secret/state` não é este aparelho; `restoreAsHost()`), antes da retomada, `Game.core.takeOverMatch()` (`engine/sessionEngine.js`): o host antigo deixa de ser host (no lobby, sai da lista; na partida e no fim de jogo, fica desconectado), este vira o host, conectado; com o host antigo na dupla e a pergunta sem resposta, a rodada é a de quem cai (a retomada sorteia outra dupla); senão, a mesma pergunta continua e o tempo sem host não conta — cada prazo da rodada que ainda corria no último sinal do host antigo (`askEndsAt`, `answerEndsAt`, `advisory.endsAt`) ganha a folga = hora do servidor ao abrir − `lastSeen` dele (`readLastSeen()`; sem o sinal, zero). O prazo de resposta parado pelo apoio e o relógio da partida não mudam. Os pedidos que esperaram no banco (inclusive os mandados ao host antigo) são tratados depois da retomada, já com os prazos prorrogados; o próprio `player-join` que quem assumiu tinha mandado como guest é ignorado. O resultado da abertura leva `takenOver`. Um F5 do host que demora mais de `HOST_TIMEOUT` vira troca: ele volta como jogador comum.
- **Jogador desconectado:** durante a partida, quem cai continua na lista com `disconnected: true` (KPI, recursos e vaga preservados), fora do sorteio, do rodízio, dos efeitos de evento e da escolha de assessor ou de quem ajuda (BUG-022). No lobby e no fim de jogo, quem cai sai da lista. `getActivePlayers()` exclui desconectados; `getMatchPlayers()` inclui.
- **Sala travada:** com a partida em andamento, nome novo é recusado (`join-rejected` com `room-locked`); só volta quem já estava na partida.
- **Pausa:** se faltam jogadores *conectados* mas não jogadores da partida, a partida pausa (`match-paused`) e retoma sozinha quando alguém volta, com o mesmo evento. Se todos os conectados já tinham respondido, a rodada é encerrada em vez de recomeçar (D3e).
- **Sair da sala:** o guest para de ouvir (o host fica sabendo pela presença quando a página fecha); o host apaga a sala (fim da sessão).
- **Versão do jogo:** a sala guarda a versão do protocolo no `meta` (`PROTOCOL_VERSION` em `network/roomLink.js`, hoje 12), conferida pela tela inicial e ao abrir o jogo, e o `player-join` leva `protocolVersion`. O host confere antes de tudo e recusa quem vem com outra versão (`join-rejected` com `version-mismatch`; o aviso pede para recarregar a página). Motivo: logo depois de um deploy, quem dá F5 passa a rodar o código novo e os outros continuam no antigo; com nomes de campo diferentes nas mensagens, a partida travaria sem aviso. Sem o campo (jogo de antes da versão) conta como 1.
- **F5 do guest:** mesmo uid → abre a sala, pede para entrar de novo e volta ao lugar. Dentro da tolerância, o host nem chega a vê-lo cair: quem estava na dupla recebe a mesma pergunta no `state-sync`, com o mesmo prazo.
- **F5 do host:** o `meta` continua com ele, então volta como host, com o estado da partida lido do banco (`secret/state`, seção "Versão do estado salvo"); os pedidos feitos durante o F5 esperam no banco e são tratados depois da retomada. O mesmo vale quando todos saem e o host reabre a sala: enquanto ela existir, a partida volta. O estado salvo inclui se a rodada está encerrada e se a partida está pausada (com o evento). Com o estado restaurado, `main.js` só chama `Game.core.resumeMatchAfterReload()` (`engine/sessionEngine.js`), que faz o que aconteceria sem o F5: pausa e rodada encerrada continuam; pergunta já respondida segue para a próxima dupla (ou encerra a partida, se a resposta completou a última área foco); pergunta aberta é reexibida (com o host fora da dupla, a tela de espectador — BUG-020) com o relógio e o prazo de resposta continuando de onde estavam (ou, com a pergunta ainda por fazer, o prazo do Perguntador; com um apoio pendente, o prazo de quem foi chamado) — seção "Relógio e prazos pela hora do servidor". A pergunta guardada na rodada leva os nomes de domínio e área (as etiquetas da tela), para o F5 e o `state-sync` mostrarem as etiquetas. O estado salvo também guarda o fim de jogo e o ranking final (`gameOver`, `finalRanking`): um F5 na tela final volta a ela (`Game.core.showGameOver()`) — BUG-021.
- **O que quem entra ou volta recebe:** `state-sync` com a rodada como ele pode vê-la (com as horas de término dos prazos; o gabarito só para o Perguntador; sem a resposta que espera o apoio — `roundAsSeenBy()`, `network/messageHandler.js`), sem os baralhos (ficam só com o host, SEC-005), a hora de término da partida (o relógio é religado por ela), se a rodada está encerrada ou pausada, quem já respondeu nesta rodada, no fim de jogo o ranking final, e o cursor dos avisos. Depois do fim de jogo a sala não fica travada: quem caiu na tela final pode voltar (BUG-021).
- **Voltar ao lobby:** zera os jogadores (inclusive quem tinha saído da partida) e tira da lista quem estava desconectado.

## Testes automatizados

As regras para escrever teste (onde entra, numeração, os dois commits) estão em `conventions.md`, seção "Testes".

- `tests/logic/` carrega os arquivos reais do jogo em contextos isolados do Node (`vm`), com rede e tela simuladas, e verifica os mecanismos acima caso a caso. Um arquivo por assunto (`*.test.js`); o ambiente simulado e os ajudantes ficam em `environment.js`. Não tem dependências: `node tests/logic/<arquivo>`. Atenção: a tela simulada (`Game.ui`) aceita qualquer nome de função, então uma chamada com nome errado passa nesses testes e só falha no navegador — conferir com uma busca no código. As chaves de texto são conferidas pelo T88 e os IDs e seletores do HTML, pelo T91. No ambiente simulado, as entradas e quedas passam pelo `receiveRequest()` e pelo `receivePresence()` reais de `roomLink.js`; o `room-link.test.js` liga o canal e a ligação reais a um banco simulado (`fakeFirebase.js`), com vários aparelhos e abas.
- `.github/workflows/testes.yml` roda todos os `tests/logic/*.test.js` e os de `tests/browser` a cada push e pull request; o resultado fica na aba Actions do repositório (uma tabela por arquivo, sem total geral).
- `tests/browser` roda o jogo de verdade em janelas separadas do Chromium (Playwright), com o site e o **emulador do Firebase** (login e banco, `firebase-tools`, com Java) locais, que o Playwright sobe juntos. O projeto é um "demo-", que só existe no emulador: nenhuma credencial nem o projeto de verdade. Os arquivos do jogo não mudam: o `players.js` acrescenta ao `config/game-config.js` servido a configuração do emulador (`CONFIG.FIREBASE`, `CONFIG.FIREBASE_EMULATOR`); só os arquivos do Firebase (gstatic.com) vêm da internet. As dependências (`package.json`) são só dos testes. No Actions, é o job "ponta-a-ponta", separado do de lógica. O `layout.spec.js` mede, com a tela em tamanho de celular e de janela reduzida, se o que o jogador precisa ver cabe na tela.
- O emulador usa as mesmas regras do banco (`database.rules.json`): o jogo inteiro roda sob elas, e os cenários E25 (página de teste) e E26 (salas do jogo, `rooms/`, no `connection-check.spec.js`) conferem o que elas deixam e o que recusam, pelo login e pelo banco que a página de teste carrega. Nos testes de lógica, o banco é o `fakeFirebase.js`, que, como o real, não guarda `null` nem listas vazias — por isso as mensagens viajam como texto JSON.
- O que depende de rede real, dispositivo ou outros navegadores continua no checklist manual (`connection-tests.md`), com o passo a passo em `manual-test-scripts.md`.

## Simulador de partidas (balanceamento)

- `tests/simulation/simulator.js` roda partidas inteiras sem rede e sem tela, para medir duração, recursos, economia, eventos e justiça antes de mexer no `config/game-config.js`. Carrega num contexto `vm` os arquivos reais (`config/`, `state/`, `domain/`, `engine/` e o `main.js`, cujo `loadQuestions()` monta os baralhos a partir de `data/`) — nenhuma regra é copiada.
- Robôs fazem o papel dos jogadores: o host real recebe resposta, pedido de assessoria ou de ajuda e a resposta de quem foi chamado pelas mesmas funções de `Game.core.*` que a rede chamaria. O tempo é falso (prazos e relógio da partida andam sem esperar) e o sorteio usa semente (mesma semente, mesmas partidas). Trocas do config ("cenário B") valem só dentro da simulação.
- Os robôs decidem pelo que "sabem": cada perfil é a chance de acertar sozinho; a cada pergunta o robô sabe a resposta com a chance (4 × perfil − 1) ÷ 3 (`knowChance()`) e, sem saber, chuta 1 em 4. Só quem não sabe pede apoio (assessoria com 1 recurso ou mais, ajuda com 0 ou menos, cada um com a sua chance) e segue a sugestão; chama de preferência quem acerta mais, com ruído (`chooseSupporter()`). Quem é chamado aceita quando sabe; sem saber, aceita com uma chance própria (alta na assessoria, que não arrisca nada; baixa na ajuda, que pode custar a cobertura do erro).
- Roda no Actions pelo workflow `simulacao.yml` (botão "Run workflow", formulário com as chances dos robôs e o cenário B); relatório no resumo da execução e planilhas `.csv` no artefato "simulacao". O relatório mede duração, progresso, recursos (inclusive estouro e menor recurso), economia (apoio pedido sem saber, assessorias, ajudas, honorários, recompensas e coberturas), apoio por perfil, eventos e justiça. O ranking das partidas simuladas usa o desempate real, e o relatório mede os empates que sobram. Testes: T93–T99, T102 e T126–T129.
