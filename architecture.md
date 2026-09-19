# 🗺️ Arquitetura — PM: The KPI Master

> Última revisão: 17/09/2026 (auditoria de arquitetura + limpeza de arquivos legados)

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
    │   ├── tradeEngine.js       # pedirAjuda, processAjuda (ex-venderRecurso/processVenda — Fase 9)
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
        ├── persistence.js         # ✅ criado (Fase 7) — extraído de main.js, já em uso
        └── i18n.js                # ✅ criado (Fase 6) — ver NOTA-003
```

---

## Status da migração

A migração da arquitetura monolítica original (`game-core.js`, `game-ui.js`, `game-network.js`, `game-state.js`) para a estrutura em camadas atual (`domain/`, `state/`, `engine/`, `network/`, `ui/`) foi concluída em 7 fases, todas completas. Histórico detalhado de cada fase, bugs encontrados e corrigidos ao longo do processo: ver `CHANGELOG.md`.

Pendência remanescente dessa frente: internacionalização (pt-BR religado, faltam outros idiomas) — ver **NOTA-003** abaixo.

---

## Notas de arquitetura pendentes (não são bugs — decisões registradas para decidir depois)

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

### Sistema de recursos: "Pedido de Ajuda" em vez de mercado livre (Fase 9)

Motivado por feedback do piloto com alunos: o botão "Vender Recurso" ficava sempre visível pra qualquer jogador, virando distração paralela ao objetivo do jogo (quiz de PMBOK) — gente ficando de olho no mercado sem necessidade real.

Reescrito em `engine/tradeEngine.js` (comentário de cabeçalho do arquivo tem o racional completo): o botão só aparece pra quem está com **0 recursos** (`profileComponent.js` controla a visibilidade via `syncPlayerViews()`). Ao pedir ajuda, o host monta uma fila automática — jogadores ativos com recurso, do que tem mais pro que tem menos — e pergunta um de cada vez, avançando sozinho a cada recusa/timeout, até alguém aceitar ou a fila acabar. Não há mais escolha manual de "vender pra quem".

A matemática da troca em si não mudou (`domain/tradeRules.js` reaproveitado sem alteração) — só quem inicia e quando a ação fica disponível. Detalhes de implementação (mensagens de rede, arquivos tocados) em `CHANGELOG.md`.

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

### Observação: `config/game-config.js` → `js/config/constants.js` nunca foi feito

O roadmap original lista essa migração na tabela-resumo, mas nenhuma das Fases 0–7 detalhadas a atribui explicitamente. Ficou de fora da migração até aqui. Se quiser fazer essa extração, é um bom próximo passo depois de fechar o checklist abaixo — mas não bloqueia nada, o jogo funciona normalmente com `config/game-config.js` no lugar onde sempre esteve. Hoje `js/config/constants.js` existe apenas como um comentário de cabeçalho (nenhum código real) e não é carregado por nenhum HTML.

### Por que o projeto não usa ES Modules

Nunca foi decidido usar — o projeto inteiro usa `<script>` simples + namespace global `window.Game`, o mesmo padrão do código original antes da migração. Avaliação ao ser questionado sobre isso: ES Modules exigem servidor HTTP (não funcionam abrindo o HTML direto via `file://`, o que este jogo provavelmente faz em uso casual), tocariam os ~40 arquivos `.js` do projeto, e removeriam toda a camada de compatibilidade `Game.core`/`Game.engine`/`Game.domain` construída ao longo da migração — sem corrigir nenhum bug existente. Recomendação: não migrar, a menos que haja um plano de investir bem mais tempo no projeto com tooling de build.

### `connectionState.js` — por que existe (Fase 4)

Não estava no roadmap original. `game-network.js` tinha `myPeer` e `connections` como variáveis privadas do módulo. Ao dividir em `peerService.js` / `messageHandler.js` / `hostMigration.js`, os três precisam enxergar a mesma conexão — por isso esse estado passou a ser compartilhado via getters/setters em `connectionState.js`.

---

## Limpeza de arquivos legados

Concluída em 17/09/2026 — todos os arquivos da arquitetura monolítica original (`game-*.js`, `data/questions.json` antigo) e dois órfãos encontrados depois (`js/index.js`, `js/config/constants.js`) foram removidos. Detalhes de cada arquivo e como foi confirmado: ver `CHANGELOG.md`.

**Não apagar:** `config/game-config.js` (ainda é o arquivo de configuração ativo).