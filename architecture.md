# 🗺️ Arquitetura — PM: The KPI Master

> Última revisão: 17/09/2026 (auditoria de arquitetura solicitada pelo usuário)

## Estrutura de arquivos

```
pm-the-kpi-master/
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
    ├── config/
    │   └── constants.js         # ex config/game-config.js
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
    │   ├── sessionEngine.js     # startGame, endGame, endMatch, endSession, leaveMatch...
    │   ├── turnEngine.js        # startNewRound, pickNewPair, nextTurn
    │   ├── answerEngine.js      # handleAnswer, updatePlayerKPI
    │   ├── tradeEngine.js       # venderRecurso, processVenda
    │   └── advisoryEngine.js    # requestAssessoria, handleAssessoriaAnswer
    │
    ├── network/
    │   ├── connectionState.js   # 🆕 estado compartilhado (myPeer, connections) — ver nota
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
    │       ├── tradeModal.js          # oferta + resposta de venda
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
        ├── persistence.js         # ✅ criado (Fase 7) — extraído de main.js, já em uso
        └── i18n.js                # ✅ criado (Fase 6) — ver NOTA-003
```

---

## Status da migração

| Fase | Status | Resultado |
|---|---|---|
| 0 — Preparação | ✅ Completa | `utils/eventBus.js`, `entry/roomEntry.js`, `main.js` |
| 1 — Regras Puras | ✅ Completa | `domain/*.js` (6 arquivos) |
| 2 — Estado Centralizado | ✅ Completa | `state/store.js`, `selectors.js`, `mutations.js` |
| 3 — Orquestração | ✅ Completa | `engine/*.js` (5 arquivos), `game-core.js` removido. **BUG-001** corrigido |
| 4 — Rede | ✅ Completa | `network/*.js` (4 arquivos), `game-network.js` removido. **BUG-002** corrigido |
| 5 — Interface | ✅ Completa | `ui/*.js` (12 arquivos), `game-ui.js` removido. **BUG-003** corrigido, **REGRESSÃO-001** encontrada e corrigida |
| 6 — Internacionalização | ✅ pt-BR religado | `utils/i18n.js` + `locales/pt-BR.js` religados em `ui/*.js`, `engine/*.js` e `network/*.js` (51 chaves, todas em uso). Falta `en-US.js`/`es-ES.js` e seletor de idioma — ver **NOTA-003** |
| 7 — Infraestrutura e Limpeza | 🟡 Parcial | `utils/logger.js` (infra, não religado — **NOTA-004**), `utils/persistence.js` (religado e em uso), `dev/debugTools.js` migrado (**REGRESSÃO-002** corrigida), `data/` separado em `questions.pt-BR.json` + `events.json`. Falta apenas apagar os arquivos antigos do projeto — ver checklist abaixo |

Bugs, regressões, esclarecimentos e correções de segurança encontrados ao
longo da migração e das revisões posteriores estão detalhados em
`ISSUES.md` — que é sempre a fonte da verdade sobre isso; a lista de IDs
não é replicada aqui de propósito, para não ficar desatualizada.

---

## Notas de arquitetura pendentes (não são bugs — decisões registradas para decidir depois)

### NOTA-001 — `controlsComponent.js`/`setup.js`: sobreposição resolvida

**Status: ✅ Resolvido.** `controlsComponent.js` agora é dono de fato da "barra de ações" (iniciar partida, copiar ID, nova rodada, vender, pedir assessoria, sair/encerrar sessão e partida) via `Game.ui.bindControls()`. `setup.js` ficou só com alternância de visibilidade host/guest e navegação de tela/fechamento de modal. Chamada direta (`Game.ui.showXModal()`/`Game.core.X()`) foi mantida — não passou a usar o `EventBus` (isso seria a opção "b" abaixo, não implementada).

### NOTA-002 — `eventBus.js`: removido

**Status: ✅ Resolvido (removido).** Nenhum arquivo jamais chamou `Game.bus.emit()`/`on()` — toda comunicação entre módulos sempre foi via chamada direta (`Game.ui.X()`, `Game.core.X()`, `Game.network.X()`). Com o jogo em ~90% pronto e sem expectativa de crescimento que justifique desacoplamento via pub/sub, `js/utils/eventBus.js` foi apagado, junto com a linha `window.Game.bus = window.bus` em `main.js` e a tag `<script>` em `game.html`. Decisão do usuário.

### NOTA-003 — i18n: UI religada em pt-BR, faltam os outros idiomas

**Atualizado:** a UI foi religada. Todas as strings de usuário em `ui/*.js`, `engine/answerEngine.js`, `engine/advisoryEngine.js`, `network/peerService.js`, `network/hostMigration.js` e `main.js` agora chamam `Game.i18n.t('namespace.chave')` em vez de texto fixo. O dicionário `pt-BR.js` tem 51 chaves, todas em uso (conferido via script que carrega o dicionário de verdade em Node e cruza com todas as chamadas `Game.i18n.t(...)` do código — zero chaves quebradas).

O que ainda falta:
1. ~~Trocar cada string fixa em `ui/*.js` por `Game.i18n.t('...')`~~ ✅ feito
2. Criar `en-US.js` e `es-ES.js` com as mesmas 51 chaves de `pt-BR.js`
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

**Status: ✅ Fechado, não será corrigido.** Decisão do usuário: o projeto não terá testes automatizados (validação continua manual — multi-cliente, F5, etc., como documentado em `ISSUES.md`), e essa é a única situação em que essa correção compensaria o risco de mexer na lógica mais sensível do jogo (cálculo de KPI/recursos) só por rigor estético. Fica registrado aqui como decisão tomada, não como pendência em aberto.

### `Game.core.*` é a API pública oficial, não "compatibilidade temporária"

Os comentários de exportação em `engine/*.js` (`sessionEngine.js`, `turnEngine.js`, `answerEngine.js`, `tradeEngine.js`, `advisoryEngine.js`) diziam "Game.core.* continua funcionando enquanto game-ui.js e game-network.js não migram para chamar Game.engine.X diretamente" — só que `game-ui.js` e `game-network.js` já foram apagados desde as Fases 4-5, substituídos por `ui/*.js` e `network/*.js`, e esses arquivos novos **nunca migraram** para `Game.engine.X.Y()`; continuam chamando tudo via `Game.core.*`. Avaliado explicitamente: terminar essa migração seria trabalho mecânico em ~15-20 arquivos, sem ganho funcional, e risco desnecessário num projeto entrando em modo de estabilização. Decisão do usuário: `Game.core.*` passa a ser a API pública oficial entre camadas; os comentários enganosos foram corrigidos para refletir isso, em vez de sugerir uma migração que não vai acontecer.

### Observação: `config/game-config.js` → `js/config/constants.js` nunca foi feito

O roadmap original lista essa migração na tabela-resumo, mas nenhuma das Fases 0–7 detalhadas a atribui explicitamente. Ficou de fora da migração até aqui. Se quiser fazer essa extração, é um bom próximo passo depois de fechar o checklist abaixo — mas não bloqueia nada, o jogo funciona normalmente com `config/game-config.js` no lugar onde sempre esteve. Hoje `js/config/constants.js` existe apenas como um comentário de cabeçalho (nenhum código real) e não é carregado por nenhum HTML.

### Por que o projeto não usa ES Modules

Nunca foi decidido usar — o projeto inteiro usa `<script>` simples + namespace global `window.Game`, o mesmo padrão do código original antes da migração. Avaliação ao ser questionado sobre isso: ES Modules exigem servidor HTTP (não funcionam abrindo o HTML direto via `file://`, o que este jogo provavelmente faz em uso casual), tocariam os ~40 arquivos `.js` do projeto, e removeriam toda a camada de compatibilidade `Game.core`/`Game.engine`/`Game.domain` construída ao longo da migração — sem corrigir nenhum bug existente. Recomendação: não migrar, a menos que haja um plano de investir bem mais tempo no projeto com tooling de build.

### `connectionState.js` — por que existe (Fase 4)

Não estava no roadmap original. `game-network.js` tinha `myPeer` e `connections` como variáveis privadas do módulo. Ao dividir em `peerService.js` / `messageHandler.js` / `hostMigration.js`, os três precisam enxergar a mesma conexão — por isso esse estado passou a ser compartilhado via getters/setters em `connectionState.js`.

---

## Checklist de limpeza final (Fase 7)

Depois de confirmar que tudo funciona com os arquivos novos, estes podem ser apagados do projeto — nenhum é mais referenciado por `game.html`/`index.html`:

- [ ] `js/game-main.js` (substituído por `js/main.js` desde a Fase 0)
- [ ] `js/game-core.js` (substituído por `domain/*.js` + `engine/*.js` desde a Fase 3)
- [ ] `js/game-network.js` (substituído por `network/*.js` desde a Fase 4)
- [ ] `js/game-ui.js` (substituído por `ui/*.js` desde a Fase 5)
- [ ] `js/game-debug.js` (substituído por `js/dev/debugTools.js` nesta fase)
- [ ] `js/game-state.js` (substituído por `state/*.js` desde a Fase 2)
- [ ] `js/index.js` (substituído por `js/entry/roomEntry.js` desde a Fase 0)
- [ ] `js/game-config.js` (duplicado de `config/game-config.js`, nunca foi carregado por nenhum `.html` — pode simplesmente apagar, nada usa)
- [ ] `data/questions.json` (substituído por `data/questions.pt-BR.json` + `data/events.json` nesta fase)
- [ ] `js/config/constants.js` (nunca chegou a ser preenchido — só um comentário de cabeçalho; não é carregado em nenhum HTML)
- [ ] `js/config/messages.js` (superado pelo sistema de i18n — `utils/i18n.js` + `locales/pt-BR.js`; não é carregado em nenhum HTML)

**Não apagar:** `config/game-config.js` (ainda é o arquivo de configuração ativo — a extração para `js/config/constants.js` nunca chegou a ser feita, não estava numa fase específica do roadmap original; ver observação acima).