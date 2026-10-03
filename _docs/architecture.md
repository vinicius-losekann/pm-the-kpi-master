# 🗺️ Arquitetura — PM: The KPI Master

> Última revisão: 03/10/2026 (Fase D — conexão, identidade, troca de host e F5 do host; testes automatizados)

## Estrutura de arquivos

```
pm-the-kpi-master/
│
├── README.md
├── CHANGELOG.md
├── .gitignore
│
├── .github/
│   └── workflows/
│       └── testes.yml           # roda tests/logic e tests/browser a cada push/PR (GitHub Actions)
│
├── _docs/
│   ├── architecture.md          # este arquivo
│   ├── conventions.md           # padrões de código, arquitetura, stack
│   ├── roadmap.md               # ex-todo.md
│   ├── testes-conexao.md        # checklist de conexão: coberto, pendente, limitações
│   └── ISSUES.md
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
│   │   └── end-of-match.test.js
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
│
├── data/
│   ├── questions.pt-BR.json     # ✅ criado (Fase 7) — perguntas, separadas de eventos
│   ├── questions.en-US.json     # ⏳ não criado (conteúdo, não string de UI)
│   └── events.json              # ✅ criado (Fase 7) — separado de questions
│
└── js/
    │
    ├── main.js                  # entrypoint de game.html (orquestra init)
    │
    ├── entry/
    │   └── roomEntry.js         # ex js/index.js — criar/entrar em sala
    │
    ├── domain/                  # 🧠 regras puras — sem DOM, sem rede, sem i18n
    │   ├── kpiRules.js          # calcularResultadoResposta(...)
    │   ├── eventRules.js        # sortearEvento(...), aplicarEfeitosEvento(...)
    │   ├── deckRules.js         # sortearPergunta(...), resetBaralho(...)
    │   ├── tradeRules.js        # validarVenda(...)
    │   ├── advisoryRules.js     # validarPedidoAssessoria(...), calcularBonusAssessor(...)
    │   └── rankingRules.js      # buildRanking(...)
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
    │   ├── tradeEngine.js       # pedirAjuda, processAjuda (ex-venderRecurso/processVenda — Fase 9)
    │   └── advisoryEngine.js    # requestAssessoria, handleAssessoriaAnswer
    │
    ├── network/
    │   ├── connectionState.js   # 🆕 estado compartilhado (myPeer, connections) — ver nota
    │   ├── hostSearch.js        # procura a sala em qualquer versão do host (Fase D3c)
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
    │   │   ├── profileComponent.js    # card do jogador (KPI, fase, progresso)
    │   │   ├── controlsComponent.js   # ✅ dono da barra de ações (NOTA-001 resolvida)
    │   │   ├── timerComponent.js
    │   │   └── rankingComponent.js
    │   └── modals/
    │       ├── resultModal.js
    │       ├── eventModal.js
    │       ├── tradeModal.js          # status do pedido + aceitar/recusar ajuda (ex-venda, Fase 9)
    │       └── advisoryModal.js       # seleção + pergunta + resultado
    │
    ├── locales/
    │   ├── pt-BR.js              # ✅ criado (Fase 6) — ver NOTA-003
    │   ├── en-US.js               # ⏳ não criado ainda
    │   └── es-ES.js                # ⏳ não criado ainda
    │
    ├── dev/
    │   └── debugTools.js        # ✅ criado (Fase 7) — ex game-debug.js, REGRESSÃO-002 corrigida
    │
    └── utils/
        ├── logger.js              # 🟡 infra pronta, religamento pendente — ver NOTA-004
        ├── persistence.js         # ✅ criado (Fase 7) — estado salvo, com versão e migração (roadmap 3.1)
        ├── identity.js            # token de identidade por sala + SHA-256 próprio (Fase D2)
        ├── sanitize.js            # escape de texto vindo de outros jogadores (SEC-001)
        └── i18n.js                # ✅ criado (Fase 6) — ver NOTA-003
```

---

## Status da migração

A migração da arquitetura monolítica original (`game-core.js`, `game-ui.js`, `game-network.js`, `game-state.js`) para a estrutura em camadas atual (`domain/`, `state/`, `engine/`, `network/`, `ui/`) foi concluída em 7 fases, todas completas. Histórico detalhado de cada fase, bugs encontrados e corrigidos ao longo do processo: ver `../CHANGELOG.md`.

Pendência remanescente dessa frente: internacionalização (pt-BR religado, faltam outros idiomas) — ver **NOTA-003** abaixo.

---

## Notas de arquitetura pendentes (não são bugs — decisões registradas para decidir depois)

### NOTA-003 — i18n: UI religada em pt-BR, faltam os outros idiomas

**Atualizado:** a UI foi religada. Todas as strings de usuário em `ui/*.js`, `engine/answerEngine.js`, `engine/advisoryEngine.js`, `network/peerService.js`, `network/hostMigration.js` e `main.js` agora chamam `Game.i18n.t('namespace.chave')` em vez de texto fixo. O dicionário `pt-BR.js` tem 54 chaves (contagem de 03/10/2026). Os motivos de recusa de entrada na sala (`join-rejected`, Fase D) ainda são texto fixo em `network/messageHandler.js`.

O que ainda falta:
1. ~~Trocar cada string fixa em `ui/*.js` por `Game.i18n.t('...')`~~ ✅ feito
2. Criar `en-US.js` e `es-ES.js` com as mesmas chaves de `pt-BR.js` (antes, conferir se todas as chaves estão em uso e se sobrou texto fixo, como os motivos de recusa acima)
3. Adicionar um seletor de idioma na UI que chama `Game.i18n.setLocale()`
4. Testar troca de idioma em tempo real (critério do checklist final do roadmap)

**Fora do escopo por ora:** `index.html`/`entry/roomEntry.js` (tela inicial de criar/entrar em sala) não carrega `i18n.js`/`locales/pt-BR.js` e continua com strings fixas — só `game.html` foi religado.

### Funcionalidade nova: botão "Nova Rodada" para o host

Não fazia parte do roadmap original. O botão `btnNovaRodada` já existia no HTML (oculto, sem listener — provavelmente esquecido do design original). Ligado em `ui/setup.js`: visível apenas para o host durante a partida, chama `Game.core.nextTurn()` ao ser clicado — o mesmo fluxo que já roda automaticamente 3s depois de cada resposta (`engine/answerEngine.js`). Não pula rodada em andamento nem força nada fora do fluxo normal — só permite ao host avançar manualmente sem esperar o timer automático.

### NOTA-004 — logger: mantido, religamento planejado (decisão revisada)

`utils/logger.js` existe e funciona isoladamente (`Game.logger.info(...)`, `Game.logger.warn(...)` etc.), mas nenhum arquivo do projeto foi religado para usar `Game.logger.*` no lugar de `console.log`/`console.warn`/`console.error` diretos.

**Decisão revisada:** o jogo vai rodar em produção com múltiplas salas simultâneas (sempre 2-6 jogadores por sala, mas várias ao mesmo tempo). Nesse cenário, depuração via `console.log` manual não funciona — não dá para "ficar olhando o console" de uma sala que o desenvolvedor não está jogando. Por isso `logger.js` **não será apagado**: fica como está por ora, e o religamento (trocar `console.X(...)` por `Game.logger.X(...)` em `domain/`, `engine/`, `network/` e `ui/` — centenas de ocorrências espalhadas por praticamente todo arquivo `.js`) é uma tarefa mecânica, mas grande o suficiente para ser um trabalho dedicado à parte, não um ajuste pontual. Fica registrada aqui como próximo passo, não como pendência esquecida.

### NOTA-005 — `domain/` muta em vez de retornar deltas; `state/mutations.js` subdesenvolvido

O roadmap mais detalhado (fornecido pelo usuário após a Fase 5) descreve o contrato de `domain/` como: "recebem estado (ou fatia dele) e retornam um RESULTADO/DELTA, nunca mutam diretamente" e "SÓ o mutations.js pode escrever no store, domain/ nunca muta diretamente". **Esse contrato não foi seguido.**

- `domain/eventRules.js` → `aplicarEfeitosEvento()` muta os objetos de jogador recebidos diretamente (`p.recursos += ...`) em vez de retornar um delta
- `domain/deckRules.js` → `sortearPergunta()` muta o baralho recebido diretamente (`pergunta.usada = true`, `baralho.disponiveis--`)
- `state/mutations.js` só tem `resetAllPlayers()`/`resetGameState()` — nunca ganhou os setters por campo (`applyKpiDelta`, `setPlayerPhase` etc.) que o roadmap detalhado previa
- Os `engine/*.js` escrevem direto em `Game.state.players` (ex: `respondedor.kpi = resultado.novoKpi` em `answerEngine.js`) em vez de passar por `mutations.js`

**Por que isso aconteceu:** a estratégia de todas as 7 fases foi extrair a lógica do `game-core.js` original **preservando o comportamento exato**, sem reescrever para o padrão funcional mais rigoroso descrito no roadmap detalhado (que só chegou depois da Fase 5, e nunca foi reconciliado com o que já tinha sido migrado). Essa divergência não tinha sido sinalizada antes de uma revisão de arquitetura pedida explicitamente pelo usuário.

**Status: ✅ Fechado, não será corrigido.** Decisão do usuário: não vale o risco de mexer na lógica mais sensível do jogo (cálculo de KPI/recursos) só por rigor estético. Fica registrado aqui como decisão tomada, não como pendência em aberto.

**Atualização (Fase D):** a decisão original dizia que o projeto não teria testes automatizados. Isso mudou: desde a Fase D existem testes em `tests/`, rodando no GitHub Actions a cada push — ver "Testes automatizados" abaixo. A refatoração desta nota continua fora de escopo.

### `Game.core.*` é a API pública oficial, não "compatibilidade temporária"

Os comentários de exportação em `engine/*.js` (`sessionEngine.js`, `turnEngine.js`, `answerEngine.js`, `tradeEngine.js`, `advisoryEngine.js`) diziam "Game.core.* continua funcionando enquanto game-ui.js e game-network.js não migram para chamar Game.engine.X diretamente" — só que `game-ui.js` e `game-network.js` já foram apagados desde as Fases 4-5, substituídos por `ui/*.js` e `network/*.js`, e esses arquivos novos **nunca migraram** para `Game.engine.X.Y()`; continuam chamando tudo via `Game.core.*`. Avaliado explicitamente: terminar essa migração seria trabalho mecânico em ~15-20 arquivos, sem ganho funcional, e risco desnecessário num projeto entrando em modo de estabilização. Decisão do usuário: `Game.core.*` passa a ser a API pública oficial entre camadas; os comentários enganosos foram corrigidos para refletir isso, em vez de sugerir uma migração que não vai acontecer.

### Sistema de recursos: "Pedido de Ajuda" em vez de mercado livre (Fase 9)

Motivado por feedback do piloto com alunos: o botão "Vender Recurso" ficava sempre visível pra qualquer jogador, virando distração paralela ao objetivo do jogo (quiz de PMBOK) — gente ficando de olho no mercado sem necessidade real.

Reescrito em `engine/tradeEngine.js` (comentário de cabeçalho do arquivo tem o racional completo): o botão só aparece pra quem está com **0 recursos** (`profileComponent.js` controla a visibilidade via `syncPlayerViews()`). Ao pedir ajuda, o host monta uma fila automática — jogadores ativos com recurso, do que tem mais pro que tem menos — e pergunta um de cada vez, avançando sozinho a cada recusa/timeout, até alguém aceitar ou a fila acabar. Não há mais escolha manual de "vender pra quem".

A matemática da troca em si não mudou (`domain/tradeRules.js` reaproveitado sem alteração) — só quem inicia e quando a ação fica disponível. Detalhes de implementação (mensagens de rede, arquivos tocados) em `../CHANGELOG.md`.

### Economia de recursos: erro é que custa, não participar (feedback do piloto, Fase C)

Antes: toda resposta gastava 1 recurso, acertando ou errando (exceto evento Reserva de Contingência). Reformulado — decisão do usuário, registrada em `roadmap.md`:

- Recursos iniciais: 20 → **10** (`config/game-config.js`)
- **Acertar nunca gasta recurso** (antes gastava igual a errar)
- **Errar continua gastando 1 recurso**, protegido pela Reserva de Contingência
- A decisão de quando gastar recurso foi movida pra dentro de `domain/kpiRules.js` → `calcularResultadoResposta()` (campo `gastaRecurso` do retorno, antes calculado — e nunca lido — separadamente em `answerEngine.js`; agora é a fonte real da verdade)
- **Removido o "pular vez por falta de recurso"** (decisão do usuário — opção 1 entre duas propostas): qualquer jogador ativo sempre tenta responder, mesmo com 0 recursos. Se errar já estando em 0, o recurso trava em 0 (nunca fica negativo), sem penalidade extra. Isso também tirou o filtro por `recursos > 0` que existia em `engine/turnEngine.js` → `pickNewPair()` na escolha de quem pode ser Respondedor — antes um jogador zerado nem entrava no sorteio.
- Efeito colateral: o "Pedido de Ajuda" (Fase 9 acima) fica naturalmente mais raro — só é acionado depois de errar o suficiente pra zerar, não mais um evento comum de partida.

### Schema de `data/questions.*.json` — chaves em inglês, estáveis entre idiomas (Fase 8)

Migração de nomenclatura pedida pelo usuário, alinhando com a terminologia da 8ª edição do PMBOK e preparando o terreno para `questions.en-US.json`/`questions.es-ES.json` futuros.

**Chaves de schema** (estrutura do documento, iguais em qualquer idioma):
```
{
  "domains": {
    "<domain_key>": {
      "name": "...",
      "areas": ["iniciacao", "planejamento", ...],
      "questions": [
        { "id": "...", "question": "...", "alternatives": [...], "correct": "a" }
      ]
    }
  }
}
```
- `domains` (era `areas`) — os 7 Domínios de Desempenho
- `name` (era `nome`), `areas` (era `grupos` — PMBOK8 renomeou "Grupos de Processos" para "Áreas de Foco"), `questions` (era `perguntas`)
- `question` (era `pergunta`), `alternatives` (era `alternativas`), `correct` (era `correta`)

**Chaves de domínio** (`governance`, `scope`, `schedule`, `finance`, `stakeholders`, `resources`, `risks` — antes `governanca`, `escopo`, `cronograma`, `financas`, `partes_interessadas`, `recursos`, `riscos`): funcionam como identificador estável, no mesmo papel do `id` de cada pergunta — **devem ser as mesmas em qualquer arquivo de idioma**, já que também viram chave de `state.baralhos` (persistido em `localStorage`). Um `questions.en-US.json` futuro deve reusar exatamente essas mesmas chaves, só traduzindo os valores (`name`, `question`, `alternatives`).

**Não migrado, de propósito:** os valores dentro do array `areas` de cada domínio (`iniciacao`, `planejamento`, `execucao`...) continuam como estão — são os IDs de `CONFIG.FASES`, usados em todo o resto do jogo (fase do jogador, progresso, etc.), fora do escopo desta mudança.

**Arquivos afetados pela propagação:** `main.js`, `domain/deckRules.js` (`area_key` → `domain_key`), `domain/kpiRules.js` (parâmetro `correta` → `correct`), `engine/turnEngine.js` e `engine/advisoryEngine.js` (mensagens de rede — o campo que mostra o nome do domínio na tela era `area`, virou `domain`; o que mostra o nome da fase era `grupo`, virou `area`), `ui/questionComponent.js` e `ui/modals/advisoryModal.js` (exibição), `dev/debugTools.js`, `game.html` (badges `#badgeArea`/`#badgeGrupo` → `#badgeDomain`/`#badgeArea`), `network/messageHandler.js` (ver **REGRESSÃO-003** em `ISSUES.md` — um ponto blindava o gabarito pelo nome de campo antigo).

A migração do JSON em si foi feita por um script (`rename-schema.js`, fora da árvore do jogo — ferramenta de uso único, pode ser descartada após o merge) que confere a contagem de perguntas antes/depois e só grava se bater, com backup automático.

### Configuração fica em `config/game-config.js`

O roadmap original previa mover a configuração para `js/config/constants.js`; isso nunca foi feito e não há plano de fazer (não bloqueia nada). O arquivo ativo é `config/game-config.js` (carregado por `index.html` e `game.html`). As cópias órfãs em `js/config/` foram removidas. Desde a Fase D3a, as opções do PeerJS ficam em `CONFIG.PEER` e todo `new Peer(...)` usa uma cópia delas — é o lugar para apontar um servidor de sinalização próprio.

### Por que o projeto não usa ES Modules

Nunca foi decidido usar — o projeto inteiro usa `<script>` simples + namespace global `window.Game`, o mesmo padrão do código original antes da migração. Avaliação ao ser questionado sobre isso: ES Modules exigem servidor HTTP (não funcionam abrindo o HTML direto via `file://`, o que este jogo provavelmente faz em uso casual), tocariam os ~40 arquivos `.js` do projeto, e removeriam toda a camada de compatibilidade `Game.core`/`Game.engine`/`Game.domain` construída ao longo da migração — sem corrigir nenhum bug existente. Recomendação: não migrar, a menos que haja um plano de investir bem mais tempo no projeto com tooling de build.

### Versão do estado salvo (roadmap 3.1)

O estado salvo no `localStorage` (`pmKPI_roomState` e `pmKPI_myData`, gravados juntos por `utils/persistence.js`) tem um número de versão, no campo `stateVersion` de `pmKPI_roomState` (`STATE_VERSION`, hoje 1) — não confundir com `hostVersion`, que conta as trocas de host. Antes de restaurar, `migrateSavedState()` aplica em ordem os passos da tabela `STATE_MIGRATIONS` (passo N converte da versão N para N+1) até a versão atual. Regras:

- **Sem versão** (salvo antes do 3.1): conta como versão 1 — o formato é o mesmo. No próximo salvamento passa a ter `stateVersion: 1`.
- **Versão mais nova que o código** (ex.: arquivos antigos em cache logo depois de um deploy): não restaura e não apaga — a versão nova do código ainda consegue usar.
- **Versão inválida** ou passo de migração faltando: tratado como estado corrompido (apagado, jogo começa do zero).
- A versão é conferida antes de sala e jogador, porque num formato mais novo esses campos podem ter mudado de nome.

Para mudar o formato (ex.: renomear campos na Fase E): aumentar `STATE_VERSION` e acrescentar o passo em `STATE_MIGRATIONS`, com teste. Como o estado salvo só vale 5 minutos, o risco real é um F5 logo depois de um deploy.

### `connectionState.js` — por que existe (Fase 4)

Não estava no roadmap original. `game-network.js` tinha `myPeer` e `connections` como variáveis privadas do módulo. Ao dividir em `peerService.js` / `messageHandler.js` / `hostMigration.js`, os três precisam enxergar a mesma conexão — por isso esse estado passou a ser compartilhado via getters/setters em `connectionState.js`.

---

## Conexão, identidade e troca de host (Fase D)

Resumo dos mecanismos; detalhes nos comentários de cada arquivo e no checklist `testes-conexao.md`.

- **Jogador desconectado:** durante a partida, quem cai continua na lista com `disconnected: true` (KPI, recursos e vaga preservados), fora do sorteio, do rodízio e dos efeitos de evento. No lobby e no fim de jogo, quem cai sai da lista. `getActivePlayers()` exclui desconectados; `getMatchPlayers()` inclui.
- **Sala travada:** com a partida em andamento, nome novo é recusado (`join-rejected` com `room-locked`); só volta quem já estava na partida.
- **Pausa:** se faltam jogadores *conectados* mas não jogadores da partida, a partida pausa (`partida-pausada`) e retoma sozinha quando alguém volta, com o mesmo evento. Se todos os conectados já tinham respondido, a rodada é encerrada em vez de recomeçar (D3e).
- **Saída da página:** `pagehide`/`beforeunload` encerram as conexões na hora, para os outros perceberem a saída sem esperar o tempo limite da rede.
- **Identidade (D2):** cada navegador gera um token por sala (`utils/identity.js`, guardado em `localStorage`). O `player-join` leva o token; o host guarda só o hash (SHA-256 próprio e síncrono — `crypto.subtle` só existe em HTTPS/localhost e é assíncrono) e exige o mesmo token para reconectar alguém que caiu.
- **F5 do host (D3f):** o estado salvo (`utils/persistence.js`) inclui se a rodada está encerrada e se a partida está pausada (com o evento). Ao recarregar, `main.js` só chama `Game.core.retomarPartidaAposRecarregar()` (`engine/sessionEngine.js`), que faz o que aconteceria sem o F5: pausa e rodada encerrada continuam; pergunta já respondida segue para a próxima dupla (ou encerra a partida, se a resposta completou a última fase); pergunta aberta é reexibida (com o host fora da dupla, a tela de espectador — BUG-020) com o prazo de resposta rearmado. A pergunta guardada na rodada leva os nomes de domínio e área (as etiquetas da tela), para o F5 e o `state-sync` mostrarem as etiquetas.
- **O que quem reconecta recebe:** `state-sync` com a rodada, o relógio (a contagem local é religada), se a rodada está encerrada ou pausada e quem já respondeu nesta rodada.
- **Troca de host:** quando o host cai, os guests tentam o mesmo host por até `CONFIG.JOGO.HOST_TIMEOUT` (10s). Esgotado, o backup assume num ID novo: a sala passa de `<ID base>` para `<ID base>-h1`, `-h2`... (`computeHostPeerId`). O ID muda porque o antigo pode ficar preso no servidor de sinalização por até ~1 min, e o host antigo voltando brigaria por ele. Quem assume marca `host=true` na URL (um F5 continua host); o host antigo fica na lista como jogador comum desconectado e, se voltar (ou recarregar a página), entra como jogador comum. O novo host não manda aviso de troca (ninguém está conectado ao ID novo nesse momento): cada guest acha a sala sozinho. O relógio de quem assume é a mesma contagem do início da partida (`Game.core.iniciarRelogio()`).
- **Procura da sala (D3c, `network/hostSearch.js`):** quem só conhece o ID base (tela inicial, link antigo, conexão inicial) procura o ID base e as versões seguintes ao mesmo tempo e fica com a que responder. A tela inicial também recusa criar sala com o código de uma partida que continua numa versão migrada.
- **Rodada na troca de host:** só o host tem o gabarito, e só o Perguntador recebe a pergunta com ele. Por isso a rodada só continua se o novo host era o Perguntador de uma pergunta ainda aberta; senão a pergunta é descartada e quem ia responder não perde a vez. Todos recebem a lista de quem já respondeu na rodada (`respondidos`, D3e), então o novo host continua o rodízio de onde parou; rodada já encerrada continua encerrada, esperando o "Nova Rodada".
- **Voltar ao lobby:** zera os jogadores (inclusive quem tinha saído da partida) e tira da lista quem estava desconectado.

## Testes automatizados

- `tests/logic/` carrega os arquivos reais do jogo em contextos isolados do Node (`vm`), com rede, tela e PeerJS simulados, e verifica os mecanismos acima caso a caso. Um arquivo por assunto (`*.test.js`); o ambiente simulado e os ajudantes ficam em `environment.js`. Não tem dependências: `node tests/logic/<arquivo>`. Nomes de arquivos e funções dos testes em inglês; comentários e títulos em português; os números T1, T2... não mudam.
- `.github/workflows/testes.yml` roda todos os `tests/logic/*.test.js` a cada push e pull request; o resultado fica na aba Actions do repositório (uma tabela por arquivo).
- Toda mudança de lógica vem com teste; os testes novos são conferidos contra o código antigo (devem falhar) e com teste de mutação.
- `tests/browser` roda o jogo de verdade em janelas separadas do Chromium (Playwright), com o site e um servidor PeerJS locais — sem depender da internet. Os arquivos do jogo não mudam: o teste redireciona o PeerJS (unpkg) para o pacote local, de mesma versão, e acrescenta ao `config/game-config.js` servido uma linha que aponta `CONFIG.PEER` para o servidor local. As dependências (`package.json`) são só dos testes. No Actions, é o job "ponta-a-ponta", separado do de lógica.
- O que depende de rede real, dispositivo ou outros navegadores continua no checklist manual (`testes-conexao.md`).

---

## Limpeza de arquivos legados

Concluída em 17/09/2026 — todos os arquivos da arquitetura monolítica original (`game-*.js`, `data/questions.json` antigo) e dois órfãos encontrados depois (`js/index.js`, `js/config/constants.js`) foram removidos. Detalhes de cada arquivo e como foi confirmado: ver `../CHANGELOG.md`.

**Não apagar:** `config/game-config.js` (ainda é o arquivo de configuração ativo).