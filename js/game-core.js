// ============================================
// PM: The KPI Master - NÚCLEO DO JOGO
// ============================================
// Responsabilidades:
//   - Lógica de rodadas (sorteio de pares, perguntas)
//   - Controle de baralho (evitar repetição)
//   - Cálculo de KPI e progressão de fases
//   - Controle de partida (iniciar, encerrar)
//   - Controle de sessão (encerrar, sair)
//
// Regra de fim de jogo:
//   - Quando o PRIMEIRO jogador completa a 2ª atividade do Encerramento
//   - OU quando o timer zera (120 min)
//   - OU quando o host encerra manualmente
//
// Dependências:
//   - Game.state (game-state.js)
//   - Game.network (game-network.js) para broadcast
//   - Game.ui (game-ui.js) para atualizar tela
//
// Namespace: Game.core
// ============================================

// ============================================
// RODADA - SORTEIO E PERGUNTAS
// ============================================

/**
 * Inicia uma nova rodada sorteando um evento
 */
function startNewRound() {
    const state = Game.state;
    const eventos = state.questionsData?.eventos || [];
    if (eventos.length === 0) {
        console.error('❌ Nenhum evento disponível!');
        return;
    }
    const evento = eventos[Math.floor(Math.random() * eventos.length)];
    pickNewPair(evento);
}

/**
 * Sorteia um par perguntador-respondedor e envia a pergunta
 * @param {object} evento - Evento da rodada (modificador de KPI)
 */
function pickNewPair(evento = null) {
    const state = Game.state;

    if (!evento) {
        const eventos = state.questionsData?.eventos || [];
        if (eventos.length === 0) return;
        evento = eventos[Math.floor(Math.random() * eventos.length)];
    }

    const activePlayers = Game.getActivePlayers();
    const available = activePlayers.filter(p =>
        !state.usedRespondedorThisRound.includes(p.name)
    );

    // Se todos já responderam, reseta a lista
    if (available.length === 0) {
        state.usedRespondedorThisRound = [];
        return pickNewPair(evento);
    }

    const respondedor = available[Math.floor(Math.random() * available.length)];
    const askers = activePlayers.filter(p => p.peerId !== respondedor.peerId);
    if (askers.length === 0) return;

    const perguntador = askers[Math.floor(Math.random() * askers.length)];
    const pergunta = sortearPergunta(respondedor.phase);

    if (!pergunta) {
        console.error('❌ Sem pergunta disponível!');
        return;
    }

    // Atualiza estado da rodada
    state.currentRound = {
        evento,
        perguntador: perguntador.name,
        respondedor: respondedor.name,
        pergunta,
        respondeu: false
    };

    console.log('🎯 [CORE] Nova dupla:', perguntador.name, 'pergunta para', respondedor.name);

    // Avisa todos
    Game.network.broadcastAll({
        type: 'round-start',
        evento,
        perguntador: perguntador.name,
        respondedor: respondedor.name
    });

    // Prepara dados da pergunta
    const areaNome = state.questionsData.areas[pergunta.area_key]?.nome || pergunta.area_key;
    const grupoNome = Game.getFaseById(respondedor.phase).nome;

    const perguntaData = {
        type: 'question',
        pergunta: pergunta.pergunta,
        area: areaNome,
        grupo: grupoNome,
        alternativas: pergunta.alternativas,
        correta: pergunta.correta,
        id: pergunta.id
    };

    // Perguntador recebe com resposta correta
    Game.network.sendToPlayer(perguntador.peerId, { ...perguntaData, isPerguntador: true });

    // Respondedor: host mantém correta, jogador remoto recebe sem correta
    if (respondedor.peerId === state.peerId && state.isHost) {
        // Host é o respondedor - mantém a resposta correta no estado
        Game.network.sendToPlayer(respondedor.peerId, { ...perguntaData, isRespondedor: true });
    } else {
        // Jogador remoto - esconde a resposta correta
        Game.network.sendToPlayer(respondedor.peerId, { ...perguntaData, isRespondedor: true, correta: undefined });
    }

    // Espectadores veem mensagem de espera
    if (state.playerName !== perguntador.name && state.playerName !== respondedor.name) {
        Game.ui.displaySpectatorView(perguntador.name, respondedor.name);
    }

    Game.ui.displayRoundStart();
    Game.saveState();
}

/**
 * Sorteia uma pergunta não usada da fase do jogador
 * @param {string} grupoProcesso - Fase atual do respondedor
 * @returns {object|null} Pergunta sorteada ou null
 */
function sortearPergunta(grupoProcesso) {
    const state = Game.state;
    let areasDisponiveis = [];

    // Filtra áreas do grupo com perguntas disponíveis
    for (const [key, area] of Object.entries(state.questionsData?.areas || {})) {
        if (area.grupos.includes(grupoProcesso) && state.baralhos[key]?.disponiveis > 0) {
            areasDisponiveis.push(key);
        }
    }

    // Se zerou, reseta baralhos desta fase
    if (areasDisponiveis.length === 0) {
        for (const [key, area] of Object.entries(state.questionsData?.areas || {})) {
            if (area.grupos.includes(grupoProcesso)) {
                resetBaralho(key);
                areasDisponiveis.push(key);
            }
        }
    }

    if (areasDisponiveis.length === 0) return null;

    const areaSorteada = areasDisponiveis[Math.floor(Math.random() * areasDisponiveis.length)];
    const baralho = state.baralhos[areaSorteada];
    if (!baralho || baralho.disponiveis <= 0) return null;

    const disponiveis = baralho.perguntas.filter(p => !p.usada);
    if (disponiveis.length === 0) return null;

    const pergunta = disponiveis[Math.floor(Math.random() * disponiveis.length)];
    pergunta.usada = true;
    baralho.disponiveis--;

    return { ...pergunta, area_key: areaSorteada };
}

/**
 * Reseta o baralho de uma área (todas voltam a ficar disponíveis)
 */
function resetBaralho(areaKey) {
    const baralho = Game.state.baralhos[areaKey];
    if (baralho) {
        baralho.perguntas.forEach(p => p.usada = false);
        baralho.disponiveis = baralho.total;
    }
}

// ============================================
// RESPOSTA E KPI
// ============================================

/**
 * Processa a resposta do jogador (chamado pelo host)
 * @param {object} msg - { alternativa: 'a', playerName: '...' }
 */
function handleAnswer(msg) {
    const state = Game.state;

    if (state.currentRound.respondeu) {
        console.warn('⚠️ [CORE] Rodada já foi respondida! Ignorando...');
        return;
    }

    state.currentRound.respondeu = true;

    const { pergunta, evento, respondedor: respondedorName } = state.currentRound;
    const acertou = msg.alternativa === pergunta.correta;

    console.log('📊 [CORE] Resposta:', msg.alternativa, '| Correta:', pergunta.correta, '| Acertou?', acertou);

    // Calcula KPI (usa constantes do CONFIG)
    const KPI_ACERTO = CONFIG.KPI.ACERTO_BASE;
    let kpiGanho = acertou ? (KPI_ACERTO * evento.modificador) + (evento.bonus || 0) : 0;

    // Bônus para todos (evento "Lições Aprendidas")
    if (evento.todos_ganham) {
        state.players.forEach(p => p.kpi += evento.todos_ganham);
    }

    // Atualiza o respondedor
    const respondedor = Game.getPlayerByName(respondedorName);
    let jogoFinalizado = false;

    if (respondedor) {
        respondedor.kpi += kpiGanho;
        respondedor.activities++;

        // Verifica progressão de fase
        const faseIdx = Game.getFaseIndex(respondedor.phase);
        
        if (respondedor.activities >= CONFIG.JOGO.ACTIVITIES_PER_PHASE) {
            if (faseIdx < CONFIG.FASES.length - 1) {
                // Avança para próxima fase
                respondedor.phase = CONFIG.FASES[faseIdx + 1].id;
                respondedor.activities = 0;
                console.log('📊 [CORE] Jogador avançou para:', respondedor.phase);
            } else {
                // 🏁 ÚLTIMA FASE CONCLUÍDA → FIM DE JOGO!
                console.log('🏁 [CORE] Jogador completou o Encerramento! Fim de jogo!');
                jogoFinalizado = true;
            }
        }
    }

    // Broadcast do resultado
    const kpiUpdateMsg = {
        type: 'kpi-update',
        playerName: respondedorName,
        kpi: respondedor?.kpi || 0,
        phase: respondedor?.phase || CONFIG.FASES[0].id,
        activities: respondedor?.activities || 0,
        acertou,
        kpiGanho,
        todosGanham: evento.todos_ganham || 0
    };

    Game.network.broadcastAll(kpiUpdateMsg);

    // Se o host for o respondedor, atualiza UI localmente também
    if (state.isHost && respondedorName === state.playerName) {
        updatePlayerKPI(kpiUpdateMsg);
    }

    state.usedRespondedorThisRound.push(respondedorName);
    console.log('📊 [CORE] Respondedores na rodada:', state.usedRespondedorThisRound);

    // Se alguém completou o Encerramento, termina o jogo
    if (jogoFinalizado) {
        setTimeout(() => endGame(buildRanking()), 3000);
    } else {
        setTimeout(() => nextTurn(), 3000);
    }
    
    Game.saveState();
}

/**
 * Avança para o próximo par ou nova rodada
 */
function nextTurn() {
    const state = Game.state;
    const activePlayers = Game.getActivePlayers();
    const allDone = activePlayers.every(p => state.usedRespondedorThisRound.includes(p.name));

    if (allDone) {
        state.usedRespondedorThisRound = [];
        startNewRound();
    } else {
        pickNewPair();
    }
}

/**
 * Atualiza KPI de um jogador na UI
 */
function updatePlayerKPI(msg) {
    const state = Game.state;
    const player = Game.getPlayerByName(msg.playerName);

    if (player) {
        player.kpi = msg.kpi;
        player.phase = msg.phase;
        player.activities = msg.activities;
    }

    // Atualiza UI do próprio jogador
    if (msg.playerName === state.playerName) {
        document.getElementById('myKPI').textContent = msg.kpi;
        const fase = Game.getFaseById(msg.phase);
        document.getElementById('myPhaseName').textContent = fase.nome;
        document.getElementById('myPhaseIcon').textContent = fase.emoji;
        document.getElementById('myActivity').textContent = msg.activities;
        document.getElementById('myProgressFill').style.width =
            (msg.activities / CONFIG.JOGO.ACTIVITIES_PER_PHASE * 100) + '%';

        if (msg.acertou !== undefined) {
            Game.ui.showResultModal(msg.acertou, msg.kpiGanho, msg.todosGanham);
        }
    }

    Game.ui.updatePlayersOnlineList();
    Game.ui.updateRankingList();
}

// ============================================
// CONTROLE DE PARTIDA
// ============================================

/**
 * Inicia uma nova partida
 */
function startGame() {
    const state = Game.state;
    state.gameStarted = true;
    state.usedRespondedorThisRound = [];

    // Inicia timer
    state.timerInterval = setInterval(() => {
        state.timer--;
        Game.ui.updateTimerDisplay();

        if (state.timer % 10 === 0 && state.isHost) {
            Game.network.broadcastAll({ type: 'timer-update', remaining: state.timer });
        }

        if (state.timer <= 0) {
            clearInterval(state.timerInterval);
            if (state.isHost) endGame(buildRanking());
        }
    }, 1000);

    Game.ui.showScreen('game');
    Game.ui.updatePlayersOnlineList();
    Game.ui.updateTimerDisplay();

    if (state.isHost) startNewRound();
    Game.saveState();
}

/**
 * Encerra a partida (fim de jogo)
 */
function endGame(ranking) {
    const state = Game.state;
    state.gameOver = true;
    clearInterval(state.timerInterval);

    if (state.isHost) {
        Game.network.broadcastAll({ type: 'game-over', ranking });
    }

    Game.ui.showScreen('gameover');
    Game.ui.displayFinalRanking(ranking);
    Game.saveState();
}

/**
 * Host encerra a partida (todos voltam ao lobby)
 */
function endMatch() {
    if (!Game.state.isHost) return;
    if (!confirm('🏁 Encerrar a partida? Todos voltarão ao lobby com KPI zerado.')) return;

    Game.resetAllPlayers();
    Game.resetGameState();

    Game.network.broadcastAll({ type: 'match-ended', players: Game.state.players });
    Game.ui.showScreen('lobby');
    Game.ui.showLobbyNormal();
    Game.ui.updatePlayersList();
    Game.ui.updateTimerDisplay();
    Game.ui.checkStartCondition();
    Game.saveState();
}

/**
 * Jogador recebe que a partida foi encerrada pelo host
 */
function handleMatchEnded(msg) {
    Game.state.players = msg.players;
    Game.resetAllPlayers();
    Game.resetGameState();
    Game.ui.showScreen('lobby');
    Game.ui.showLobbyNormal();
    Game.ui.updatePlayersList();
    Game.ui.updateTimerDisplay();
    Game.saveState();
}

// ============================================
// CONTROLE DE SESSÃO
// ============================================

/**
 * Host encerra a sessão (destrói sala, todos saem)
 */
function endSession() {
    if (!Game.state.isHost) return;
    if (!confirm('⛔ Encerrar a sessão? Todos os jogadores serão desconectados e a sala destruída.')) return;

    Game.network.broadcastAll({ type: 'session-ended' });
    Game.network.cleanup();
    window.location.href = 'index.html';
}

/**
 * Jogador sai da partida (vai pro lobby aguardar)
 */
function leaveMatch() {
    if (Game.state.isHost) return;
    if (!confirm('🚶 Sair da partida? Você aguardará no lobby até a próxima partida.')) return;

    const me = Game.getPlayerByName(Game.state.playerName);
    if (me) me.waitingInLobby = true;

    Game.ui.showScreen('lobby');
    Game.ui.showLobbyWaitingView();
    Game.saveState();
}

/**
 * Jogador sai da sessão (volta ao index)
 */
function leaveSession() {
    if (Game.state.isHost) {
        endSession();
        return;
    }
    if (!confirm('🚪 Sair da sessão? Você voltará à tela inicial.')) return;

    Game.network.cleanup();
    window.location.href = 'index.html';
}

// ============================================
// RANKING
// ============================================

function buildRanking() {
    return [...Game.state.players]
        .sort((a, b) => b.kpi - a.kpi)
        .map((p, i) => ({
            posicao: i + 1,
            name: p.name,
            kpi: p.kpi,
            phase: p.phase
        }));
}

// ============================================
// EXPORTAÇÃO
// ============================================
window.Game = window.Game || {};
window.Game.core = {
    startNewRound,
    pickNewPair,
    sortearPergunta,
    handleAnswer,
    updatePlayerKPI,
    nextTurn,
    startGame,
    endGame,
    endMatch,
    handleMatchEnded,
    endSession,
    leaveMatch,
    leaveSession,
    buildRanking
};