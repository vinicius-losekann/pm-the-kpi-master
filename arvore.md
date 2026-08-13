pm-the-kpi-master/
│
├── index.html                          # Tela inicial: criar ou entrar em uma sala
├── game.html                           # Tela principal do jogo (lobby, partida, game over)
│
├── css/
│   └── style.css                       # Estilos globais (temas, glassmorphism, animações, responsivo)
│
├── data/                               # Dados estáticos do jogo (carregados via fetch)
│   ├── questions.json                  # Banco de perguntas com áreas, grupos e alternativas
│   └── events.json                     # Banco de eventos (neutros, bônus, penalidades)
│
└── js/
    ├── main.js                         # BOOTSTRAP DO JOGO
    │   # Lê os parâmetros da URL, carrega os dados, inicializa a Store, o EventBus,
    │   # o PeerService, restaura o estado do localStorage e dispara a UI inicial.
    │
    ├── config/
    │   └── constants.js                # CONFIG (valores fixos e ajustáveis)
    │       # KPI, RECURSOS_INICIAIS, JOGO (timers, limites), FASES, TIMER, ROOM_PREFIX
    │
    ├── domain/                         # 100% FUNÇÕES PURAS (NUNCA tocam DOM, Store ou Peer)
    │   │   # Recebem dados por parâmetro, retornam objetos calculados. Testáveis no console.
    │   ├── kpiRules.js                 # resolveAnswer(acertou, evento) → { kpiGanho, avancouFase }
    │   ├── eventRules.js               # sortearEvento(lista), aplicarEfeitos(jogadores, evento)
    │   ├── deckRules.js                # sortearPergunta(fase, baralhos), resetBaralho(area)
    │   ├── tradeRules.js               # validarNegociacao(vendedor, comprador, valor) → { valido, erro }
    │   ├── advisoryRules.js            # validarPedido(assessor, alvo), calcularBonus(acertou)
    │   └── rankingRules.js             # buildRanking(listaJogadores) → array ordenado com kpiFinal
    │
    ├── state/                          # ESTADO CENTRALIZADO E MUTAÇÕES
    │   ├── store.js                    # Fonte da verdade (gameState) + Getters
    │   │   # getState(), getPlayer(name), getActivePlayers(), getFaseById(), getFaseIndex()
    │   └── actions.js                  # Mutações específicas (disparam eventos via bus)
    │       # updatePlayer(name, changes), resetAllPlayers(), resetGameState(), applyEventEffect()
    │
    ├── engine/                         # CÉREBRO / ORQUESTRAÇÃO (EXECUTADO APENAS PELO HOST)
    │   │   # Chama as domain/rules, aplica as actions no store e emite eventos via bus.
    │   │   # NUNCA tocam no DOM ou no Peer diretamente (usam o EventBus para comunicação).
    │   ├── sessionEngine.js            # startGame(), endGame(ranking), endMatch(), resetMatch(), leaveMatch()
    │   ├── turnEngine.js               # startTurn(), nextTurn(), timeoutHandler(), pickNewPair()
    │   ├── answerEngine.js             # handleAnswer(jogador, alternativa) → chama kpiRules e actions
    │   ├── tradeEngine.js              # handleOfferRequest(), processVenda(), handleOfferResponse()
    │   └── advisoryEngine.js           # handleAdvisoryRequest(), handleAdvisoryAnswer(), timeout()
    │
    ├── network/                        # TRANSPORTE E SINCRONIZAÇÃO (PEERJS)
    │   ├── peerService.js              # initPeer(), connectToHost(), broadcast(), sendToPeer(), cleanup()
    │   ├── messageHandler.js           # Roteador: switch de mensagens recebidas
    │   │   # Traduz mensagens da rede em eventos do bus (para guests) ou chama engine (para host)
    │   └── hostMigration.js            # handleHostDisconnect(), becomeHost(), reconnectToNewHost()
    │
    ├── ui/                             # DOM E REATIVIDADE (100% REATIVA A EVENTOS DO BUS)
    │   │   # Só emite cliques via bus e reage a eventos. NUNCA chama engine/rede diretamente.
    │   ├── screenManager.js            # Navegação: showScreen('lobby'|'game'|'gameover'), closeAllModals()
    │   ├── setup.js                    # Registra os event listeners (cliques) uma única vez
    │   │   # Conecta botões e cliques a emissões do EventBus (ex: bus.emit('game:start-requested'))
    │   │
    │   ├── components/                 # RENDERIZADORES DE TELA COMPLETA (cards fixos)
    │   │   ├── lobbyComponent.js       # Renderiza lista de jogadores, status de conexão, botão iniciar
    │   │   ├── questionComponent.js    # Renderiza pergunta, alternativas, papel (perguntador/respondedor)
    │   │   ├── profileComponent.js     # Renderiza perfil local: avatar, KPI, recursos, fase, barra de progresso
    │   │   ├── controlsComponent.js    # Renderiza botões de ação: Vender, Assessoria, Encerrar Partida
    │   │   ├── timerComponent.js       # Renderiza o relógio com estados (normal, alerta, crítico)
    │   │   └── rankingComponent.js     # Renderiza o ranking final (com medalhas 🥇🥈🥉) na tela de Game Over
    │   │
    │   └── modals/                     # DIÁLOGOS SOBREPOSTOS (INTERAÇÕES TEMPORÁRIAS)
    │       ├── resultModal.js          # Gerencia: Acertou/Errou + Bônus de Assessoria (reutiliza o mesmo modal)
    │       ├── eventModal.js           # Gerencia: Exibição do evento sorteado (título + descrição)
    │       ├── tradeModal.js           # Gerencia TODO O FLUXO DE NEGOCIAÇÃO:
    │       │                           #   - Vendedor vê lista de compradores e envia oferta
    │       │                           #   - Comprador vê a oferta recebida (Aceitar/Recusar)
    │       │                           #   - Feedback de venda confirmada ou rejeitada
    │       └── advisoryModal.js        # Gerencia TODO O FLUXO DE ASSESSORIA:
    │                                   #   - Respondedor vê lista de assessores disponíveis
    │                                   #   - Assessor vê a pergunta com timer para sugerir
    │                                   #   - Resultado: aceito, recusado ou timeout
    │
    └── utils/                          # INFRAESTRUTURA DESACOPLADA (não sabem do jogo)
        ├── eventBus.js                 # Pub/Sub central: on(event, callback), off(), emit(event, data)
        ├── logger.js                   # Logs com níveis (debug, info, warn, error)
        └── persistence.js              # Gerenciamento do localStorage: saveState(), restoreState()