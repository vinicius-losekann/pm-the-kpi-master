// ============================================
// PM: The KPI Master - Engine: Sessão e Partida
// ============================================
// Orquestra o início/fim de partida e o controle de sessão
// (sair, encerrar, jogador saindo no meio do jogo).
// Usa as regras puras de js/domain/*.js — não contém regra de
// negócio, só coordenação entre domain, state, network e ui.
// Fase 3.1 do roadmap.
// ============================================

// ============================================
// CONTROLE DE PARTIDA
// ============================================

/**
 * Inicia uma nova partida: reseta todos os jogadores, inicia o timer e
 * dá início à primeira rodada (se for o host).
 */
function startGame() {
    const state = Game.state;
    state.gameStarted = true;
    state.gameOver = false;
    state.usedRespondedorThisRound = [];

    Game.resetAllPlayers();

    clearInterval(state.timerInterval);
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
    Game.ui.syncPlayerViews(Game.getPlayerByName(state.playerName));
    Game.ui.updateTimerDisplay();

    if (state.isHost) Game.engine.turn.startNewRound();
    Game.saveState();
}

/**
 * Encerra a partida, exibe o ranking final e notifica todos os jogadores.
 */
function endGame(ranking) {
    const state = Game.state;
    state.gameOver = true;
    clearInterval(state.timerInterval);

    if (state.assessoriaTimeout) {
        clearTimeout(state.assessoriaTimeout);
        state.assessoriaTimeout = null;
    }
    if (state.respostaTimeout) {
        clearTimeout(state.respostaTimeout);
        state.respostaTimeout = null;
    }
    if (state.ajudaTimeout) {
        clearTimeout(state.ajudaTimeout);
        state.ajudaTimeout = null;
    }
    state.ajudaFila = null;
    state.currentRound = null;

    if (state.isHost) {
        Game.network.broadcastAll({ type: 'game-over', ranking });
    }

    Game.ui.showScreen('gameover');
    Game.ui.displayFinalRanking(ranking);
    Game.saveState();
}

/**
 * Encerra a partida e retorna todos ao lobby (apenas host).
 */
function endMatch() {
    if (!Game.state.isHost) return;
    if (!confirm('🏁 Encerrar a partida? Todos voltarão ao lobby com KPI zerado.')) return;

    if (Game.state.assessoriaTimeout) {
        clearTimeout(Game.state.assessoriaTimeout);
        Game.state.assessoriaTimeout = null;
    }
    if (Game.state.respostaTimeout) {
        clearTimeout(Game.state.respostaTimeout);
        Game.state.respostaTimeout = null;
    }
    if (Game.state.ajudaTimeout) {
        clearTimeout(Game.state.ajudaTimeout);
        Game.state.ajudaTimeout = null;
    }
    Game.state.ajudaFila = null;

    Game.resetAllPlayers();
    Game.resetGameState();
    resetAllBaralhos();

    Game.network.broadcastAll({ type: 'match-ended', players: Game.state.players });
    Game.ui.showScreen('lobby');
    Game.ui.showLobbyNormal();
    Game.ui.updatePlayersList();
    Game.ui.updateTimerDisplay();
    Game.ui.checkStartCondition();
    Game.saveState();
}

/**
 * Guest: processa a mensagem de 'match-ended' vinda do host.
 */
function handleMatchEnded(msg) {
    Game.state.players = msg.players;
    Game.resetAllPlayers();
    Game.resetGameState();
    resetAllBaralhos();
    Game.ui.showScreen('lobby');
    Game.ui.showLobbyNormal();
    Game.ui.updatePlayersList();
    Game.ui.updateTimerDisplay();
    Game.saveState();
}

// ============================================
// RANKING (conveniência — usa domain/rankingRules)
// ============================================

function buildRanking() {
    return Game.domain.ranking.buildRanking(Game.state.players, CONFIG);
}

// ============================================
// BARALHOS (conveniência — usa domain/deckRules)
// ============================================

/**
 * Reinicia todos os baralhos (usado ao voltar ao lobby / preparar nova partida).
 * ⚠️ Este wrapper existia no game-core.js original e foi involuntariamente
 * omitido na extração da Fase 3 — reencontrado e corrigido na Fase 5, ao
 * conferir as chamadas de game-ui.js (btnBackToLobby usa Game.core.resetAllBaralhos()).
 */
function resetAllBaralhos() {
    Game.domain.deck.resetAllBaralhos(Game.state.baralhos);
    console.log('🔄 Baralhos de perguntas resetados para a próxima partida.');
}

// ============================================
// CONTROLE DE SESSÃO
// ============================================

/**
 * Encerra a sessão completamente (host) – destrói a sala e redireciona todos.
 */
function endSession() {
    if (!Game.state.isHost) return;
    if (!confirm('⛔ Encerrar a sessão? Todos os jogadores serão desconectados e a sala destruída.')) return;

    Game.ui.closeAllModals();
    Game.network.broadcastAll({ type: 'session-ended' });
    Game.network.cleanup();
    window.location.href = './';
}

/**
 * Guest: solicita sair da partida em andamento (volta ao lobby como espectador).
 */
function leaveMatch() {
    if (Game.state.isHost) return;
    if (!confirm('🚶 Sair da partida? Você aguardará no lobby até a próxima partida.')) return;

    const me = Game.getPlayerByName(Game.state.playerName);
    if (me) me.waitingInLobby = true;

    Game.network.sendToHost({ type: 'leave-match-request', playerName: Game.state.playerName });

    Game.ui.showScreen('lobby');
    Game.ui.showLobbyWaitingView();
    Game.saveState();
}

/**
 * Host: processa o pedido de saída da partida de um guest.
 */
function handleLeaveMatchRequest(msg) {
    const state = Game.state;
    if (!state.isHost) return;

    const player = Game.getPlayerByName(msg.playerName);
    if (!player || player.waitingInLobby) return;

    player.waitingInLobby = true;
    console.log('🚶 ' + player.name + ' saiu da partida (waitingInLobby=true).');

    Game.network.broadcastAll({ type: 'player-list', players: state.players });
    Game.ui.updatePlayersOnlineList();
    Game.ui.updateRankingList();

    abortRoundIfParticipant(player.name);

    Game.saveState();
}

/**
 * Aborta a rodada atual se o jogador mencionado for o Perguntador ou Respondedor.
 */
function abortRoundIfParticipant(playerName) {
    const state = Game.state;
    if (!state.isHost) return;

    const round = state.currentRound;
    if (round && !round.respondeu &&
        (round.perguntador === playerName || round.respondedor === playerName)) {
        console.warn('⚠️ Participante da rodada atual ficou indisponível — abortando rodada e sorteando nova.');
        if (state.assessoriaTimeout) {
            clearTimeout(state.assessoriaTimeout);
            state.assessoriaTimeout = null;
        }
        if (state.respostaTimeout) {
            clearTimeout(state.respostaTimeout);
            state.respostaTimeout = null;
        }
        state.currentRound = null;
        Game.engine.turn.pickNewPair();
    }
}

/**
 * Sai da sessão (qualquer jogador) – redireciona para a página inicial.
 */
function leaveSession() {
    if (Game.state.isHost) {
        endSession();
        return;
    }
    if (!confirm('🚪 Sair da sessão? Você voltará à tela inicial.')) return;

    Game.ui.closeAllModals();
    Game.network.cleanup();
    window.location.href = './';
}

// ============================================
// EXPORTAÇÃO
// ============================================
window.Game = window.Game || {};
window.Game.engine = window.Game.engine || {};
window.Game.engine.session = {
    startGame,
    endGame,
    endMatch,
    handleMatchEnded,
    buildRanking,
    resetAllBaralhos,
    endSession,
    leaveMatch,
    handleLeaveMatchRequest,
    abortRoundIfParticipant,
    leaveSession
};

// Game.core.* é o namespace usado por ui/ e network/ para chamar as
// funções deste engine — convenção de chamada entre camadas, não é
// compatibilidade temporária nem trabalho pendente (ver ARCHITECTURE.md).
window.Game.core = window.Game.core || {};
Object.assign(window.Game.core, window.Game.engine.session);