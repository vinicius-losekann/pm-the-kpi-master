// ============================================
// PM: The KPI Master - Engine: Sessão e Partida
// ============================================
// Orquestra o início/fim de partida e o controle de sessão
// (sair, encerrar, jogador saindo no meio do jogo).
// Usa as regras puras de js/domain/*.js — não contém regra de
// negócio, só coordenação entre domain, state, network e ui.
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
    state.answeredThisRound = [];

    Game.resetAllPlayers();

    startClock();

    Game.ui.showScreen('game');
    Game.ui.syncPlayerViews(Game.getPlayerByName(state.playerName));
    Game.ui.updateTimerDisplay();

    if (state.isHost) Game.engine.turn.startNewRound();
    Game.saveState();
}

/**
 * Liga a contagem regressiva local da partida (1 segundo por vez), a
 * partir de `state.timer`. Substitui qualquer contagem anterior.
 *
 * Host: a cada 10 segundos avisa os guests do tempo restante e, no
 * zero, encerra a partida. Guest: só conta — o 'timer-update' do host
 * corrige qualquer diferença e o 'game-over' do host encerra.
 *
 * Usada também quando um guest volta para uma partida em andamento
 * (restoreState(), em network/messageHandler.js) — sem ela, o relógio
 * de quem volta só andaria de 10 em 10 segundos, a cada
 * 'timer-update' — e por quem assume como host (becomeHost(), em
 * network/hostMigration.js).
 */
function startClock() {
    const state = Game.state;

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
}

/**
 * Host: retoma a partida depois de recarregar a página (F5), a partir do
 * estado salvo (utils/persistence.js). Chamada por init() (main.js).
 *
 * Faz o que aconteceria sem o F5, conforme o momento:
 *   - partida pausada → continua pausada com o mesmo evento (sem sortear
 *     outro nem reaplicar os efeitos); retoma quando alguém reconectar
 *     (addPlayer() em network/messageHandler.js);
 *   - rodada encerrada → continua encerrada, aguardando o "Nova Rodada";
 *   - sem rodada → começa uma;
 *   - pergunta já respondida (F5 nos ~3s antes da próxima dupla, quando
 *     o setTimeout de answerEngine.handleAnswer() se perde com a página)
 *     → encerra a partida, se essa resposta completou a última área foco,
 *     ou segue com nextTurn() (próxima dupla ou fim da rodada). "Já
 *     respondida" = `answered` ou o Respondedor já no rodízio, o mesmo
 *     critério de becomeHost() (network/hostMigration.js);
 *   - pergunta em aberto → reexibe a mesma pergunta (ou, com o host fora
 *     da dupla, a tela de espectador) e rearma o prazo de resposta — a
 *     pergunta não pode ser trocada pelo F5. Um pedido de assessoria
 *     ainda sem resposta é cancelado antes (ver cancelPendingAdvisory()).
 */
function resumeMatchAfterReload() {
    const state = Game.state;
    if (!state.isHost || !state.gameStarted || state.gameOver) return;

    console.log('🔁 Retomando motor da partida após reload do host...');

    Game.ui.showScreen('game');
    Game.ui.syncPlayerViews(Game.getPlayerByName(state.playerName));
    Game.ui.updateTimerDisplay();
    startClock();

    Game.network.broadcastAll({ type: 'player-list', players: state.players });

    const round = state.currentRound;
    const questionAlreadyAnswered = !!round &&
        (!!round.answered || state.answeredThisRound.includes(round.answerer));

    if (state.matchPaused) {
        console.log('⏸️ A partida estava pausada — continua pausada até alguém reconectar.');
        state.currentRound = null;
        Game.ui.showMatchPausedMessage();
        Game.ui.refreshNewRoundButton();
    } else if (state.roundEnded) {
        console.log('✅ A rodada já tinha terminado — aguardando o host clicar em "Nova Rodada".');
        Game.ui.showRoundEndedMessage();
        Game.ui.refreshNewRoundButton();
    } else if (!round) {
        Game.engine.turn.pickNewPair();
    } else if (questionAlreadyAnswered) {
        if (completedLastFocusArea(Game.getPlayerByName(round.answerer))) {
            console.log('🏁 A última resposta completou a última área foco — encerrando a partida.');
            endGame(buildRanking());
        } else {
            console.log('➡️ A pergunta já tinha sido respondida — seguindo para a próxima dupla.');
            Game.engine.turn.nextTurn();
        }
    } else {
        if (cancelPendingAdvisory(round)) return;
        // Fora da dupla, o host vê a tela de espectador, como veria sem
        // o F5 (pickNewPair() faz a mesma escolha).
        const inPair = state.playerName === round.asker || state.playerName === round.answerer;
        if (inPair) {
            Game.ui.displayRoundStart();
            if (round.question) {
                Game.ui.displayQuestion(round.question);
            }
        } else {
            Game.ui.displaySpectatorView(round.asker, round.answerer);
        }
        Game.engine.turn.armAnswerTimeout(round.answerer);
        Game.ui.refreshNewRoundButton();
    }
}

/**
 * No F5 do host, um pedido de assessoria ainda sem resposta é
 * cancelado. O prazo de 20s do assessor (setTimeout de
 * advisoryEngine.handleAdvisoryRequest()) se perde com a página, e o
 * assessor perde a pergunta (a reconexão fecha os modais) — sem cancelar,
 * a rodada ficaria presa esperando uma resposta que não vem. Quem
 * responde pode pedir de novo; é o mesmo resultado de uma troca de host.
 *
 * Se a resposta já tinha chegado e esperava o assessor, ela é processada
 * agora (answerEngine.handleAnswer() segue para a próxima dupla).
 * @returns {boolean} true se processou a resposta guardada (a pergunta
 *   não deve ser reexibida)
 */
function cancelPendingAdvisory(round) {
    if (!round.advisory || round.advisory.status !== 'pending') return false;

    console.log('🧭 Pedido de assessoria sem resposta cancelado pelo F5 do host — quem responde pode pedir de novo.');
    round.advisory = null;

    if (!round.pendingAnswer) return false;
    const pending = round.pendingAnswer;
    round.pendingAnswer = null;
    Game.engine.answer.handleAnswer(pending);
    return true;
}

/**
 * O jogador terminou a última área foco? Mesma condição usada por
 * answerEngine.handleAnswer() para encerrar a partida depois da resposta.
 */
function completedLastFocusArea(player) {
    if (!player) return false;
    return Game.getFocusAreaIndex(player.focusArea) === CONFIG.FOCUS_AREAS.length - 1 &&
        player.activities >= CONFIG.GAME.ACTIVITIES_PER_FOCUS_AREA;
}

/**
 * Encerra a partida, exibe o ranking final e notifica todos os jogadores.
 */
function endGame(ranking) {
    const state = Game.state;
    state.gameOver = true;
    clearInterval(state.timerInterval);

    cancelRoundTimeouts();
    cancelHelpRequest();
    state.currentRound = null;
    // O ranking do fim da partida fica guardado (estado salvo e
    // state-sync) — um F5 ou quem volta à sala vê o mesmo ranking.
    state.finalRanking = ranking;

    if (state.isHost) {
        Game.network.broadcastAll({ type: 'game-over', ranking });
    }

    showGameOver();
    Game.saveState();
}

/**
 * Cancela os prazos da pergunta em andamento: o de resposta do
 * Respondedor e o do assessor. Usada no fim de jogo, ao encerrar a
 * partida e quando a dupla é trocada (abortRoundIfParticipant()).
 */
function cancelRoundTimeouts() {
    const state = Game.state;
    if (state.advisoryTimeout) {
        clearTimeout(state.advisoryTimeout);
        state.advisoryTimeout = null;
    }
    if (state.answerTimeout) {
        clearTimeout(state.answerTimeout);
        state.answerTimeout = null;
    }
}

/**
 * Cancela o pedido de ajuda em andamento (prazo da oferta atual e a
 * fila). Usada no fim de jogo e ao encerrar a partida.
 */
function cancelHelpRequest() {
    const state = Game.state;
    if (state.helpTimeout) {
        clearTimeout(state.helpTimeout);
        state.helpTimeout = null;
    }
    state.helpQueue = null;
}

/**
 * Mostra a tela de fim de jogo com o ranking guardado no fim da partida.
 *
 * Usada também depois de um F5 na tela final (init(), main.js) e por
 * quem volta à sala depois do fim de jogo (restoreState(), em
 * network/messageHandler.js) — nos dois casos, a partida não recomeça.
 */
function showGameOver() {
    const state = Game.state;
    Game.ui.showScreen('gameover');
    Game.ui.displayFinalRanking(state.finalRanking || buildRanking());
}

/**
 * Encerra a partida e retorna todos ao lobby (apenas host).
 */
function endMatch() {
    if (!Game.state.isHost) return;
    if (!confirm('🏁 Encerrar a partida? Todos voltarão ao lobby com KPI zerado.')) return;

    cancelRoundTimeouts();
    cancelHelpRequest();

    // Quem caiu durante a partida e não voltou sai da lista
    // antes de ir para o lobby — o 'match-ended' já leva a lista limpa
    // para os guests (ver handleMatchEnded()).
    const removed = Game.mutations.removeDisconnectedPlayers(Game.state);
    if (removed.length) console.log('🧹 Removidos ao voltar ao lobby (desconectados): ' + removed.join(', '));

    Game.resetAllPlayers();
    Game.resetGameState();
    resetAllDecks();

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
    resetAllDecks();
    Game.ui.showScreen('lobby');
    Game.ui.showLobbyNormal();
    Game.ui.updatePlayersList();
    Game.ui.updateTimerDisplay();
    Game.saveState();
}

/**
 * Volta ao lobby a partir da tela de fim de jogo (botão "Voltar ao
 * Lobby"). Cada jogador clica na própria tela — não há mensagem de rede
 * própria para isso.
 *
 * Quem caiu durante a partida e não voltou sai da lista aqui.
 * Se quem clicou é o host (dono da lista oficial), avisa os guests com
 * um 'player-list'; um guest só limpa a própria cópia (a lista do host
 * sobrescreve a dele a cada 'player-list').
 *
 * Os jogadores voltam zerados, como em endMatch() — em especial, quem
 * tinha saído da partida deixa de estar "aguardando no lobby" (senão o
 * botão "Iniciar" não contaria esse jogador). Por isso o host sempre
 * manda a lista atualizada.
 */
function backToLobby() {
    const state = Game.state;

    const removed = Game.mutations.removeDisconnectedPlayers(state);
    if (removed.length) console.log('🧹 Removidos ao voltar ao lobby (desconectados): ' + removed.join(', '));

    Game.resetAllPlayers();
    Game.resetGameState();
    resetAllDecks();

    if (state.isHost) {
        Game.network.broadcastAll({ type: 'player-list', players: state.players });
    }

    Game.ui.showScreen('lobby');
    Game.ui.showLobbyNormal();
    Game.ui.updatePlayersList();
    Game.ui.updateTimerDisplay();
    Game.ui.checkStartCondition();
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
 */
function resetAllDecks() {
    Game.domain.deck.resetAllDecks(Game.state.decks);
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
    if (round && !round.answered &&
        (round.asker === playerName || round.answerer === playerName)) {
        console.warn('⚠️ Participante da rodada atual ficou indisponível — abortando rodada e sorteando nova.');
        // O pedido de ajuda não é da rodada: continua com a dupla nova.
        cancelRoundTimeouts();
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
    startClock,
    resumeMatchAfterReload,
    endGame,
    showGameOver,
    endMatch,
    handleMatchEnded,
    backToLobby,
    buildRanking,
    resetAllDecks,
    endSession,
    leaveMatch,
    handleLeaveMatchRequest,
    abortRoundIfParticipant,
    leaveSession
};

// Game.core.* é o namespace usado por ui/ e network/ para chamar as
// funções deste engine — convenção de chamada entre camadas, não é
// compatibilidade temporária nem trabalho pendente (ver _docs/architecture.md).
window.Game.core = window.Game.core || {};
Object.assign(window.Game.core, window.Game.engine.session);
