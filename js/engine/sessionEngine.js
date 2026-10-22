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
 * Inicia uma nova partida: reseta todos os jogadores, liga o relógio e dá
 * início à primeira rodada (se for o host).
 *
 * Host (botão "Iniciar"): marca a hora de término da partida, em hora do
 * servidor, e avisa os guests ('game-start' com `endsAt`) antes da
 * primeira rodada. Guest: chamada pelo 'game-start', com `state.endsAt`
 * já guardado (network/messageHandler.js).
 */
function startGame() {
    const state = Game.state;
    state.gameStarted = true;
    state.gameOver = false;
    state.answeredThisRound = [];
    state.roundNumber = 0;
    state.roundEvent = null;

    Game.resetAllPlayers();

    if (state.isHost) {
        state.endsAt = Game.network.serverNow() + CONFIG.GAME.SESSION_DURATION * 1000;
        Game.network.broadcastAll({ type: 'game-start', endsAt: state.endsAt });
    }

    startClock();

    Game.ui.showScreen('game');
    Game.ui.syncPlayerViews(Game.getPlayerByName(state.playerName));
    Game.ui.updateTimerDisplay();

    if (state.isHost) Game.engine.turn.startNewRound();
    Game.saveState();
}

/**
 * Milissegundos que faltam até `endsAt` (hora do servidor). Hora ausente:
 * `fallback` (o prazo inteiro, para rodada salva antes da hora de término).
 */
function msUntil(endsAt, fallback) {
    return typeof endsAt === 'number' ? endsAt - Game.network.serverNow() : fallback;
}

/**
 * Liga o relógio da partida: a cada segundo, `state.timer` (só para a
 * tela) recebe os segundos que faltam até `state.endsAt`, a hora de
 * término em hora do servidor — cada aparelho calcula o próprio, então
 * todos mostram o mesmo tempo e um tique atrasado não perde segundos.
 * Calcula também na hora, ao ligar. Substitui qualquer contagem anterior;
 * sem hora de término, não liga.
 *
 * No zero, o host encerra a partida (também se a hora já passou, ex.: F5
 * depois do fim); o guest só para — o 'game-over' do host encerra.
 *
 * Usada também quando um guest volta para uma partida em andamento
 * (restoreState(), em network/messageHandler.js) e no F5 do host.
 */
function startClock() {
    const state = Game.state;

    clearInterval(state.timerInterval);
    state.timerInterval = null;
    if (typeof state.endsAt !== 'number') return;

    const tick = () => {
        state.timer = Math.max(0, Math.ceil(msUntil(state.endsAt) / 1000));
        Game.ui.updateTimerDisplay();
        if (state.timer > 0) return false;
        clearInterval(state.timerInterval);
        state.timerInterval = null;
        if (state.isHost) endGame(buildRanking());
        return true;
    };
    if (tick()) return;
    state.timerInterval = setInterval(tick, 1000);
}

/**
 * Host: retoma a partida depois de recarregar a página (F5), a partir do
 * estado salvo no banco da sala (utils/persistence.js, restaurado ao abrir
 * a sala). Chamada por showRoom() (main.js).
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
 *     respondida" = `answered` ou o Respondedor já no rodízio;
 *   - pergunta em aberto → reexibe a mesma pergunta (ou, com o host fora
 *     da dupla, a tela de espectador) e o prazo de resposta continua de
 *     onde estava — ou, com a pergunta ainda por fazer, o prazo do
 *     Perguntador; a pergunta não pode ser trocada pelo F5. Um pedido de
 *     assessoria ou de ajuda ainda sem resposta continua, com o prazo de
 *     quem foi chamado (ver resumePendingAdvisory()).
 *
 * O relógio e os prazos contam pelas horas de término guardadas (hora do
 * servidor): continuam do mesmo ponto, e o que venceu durante o F5 tem o
 * efeito na hora (fim da partida, pergunta enviada sozinha, vez pulada).
 * Rodada salva sem a hora de um prazo ganha o prazo inteiro.
 */
function resumeMatchAfterReload() {
    const state = Game.state;
    if (!state.isHost || !state.gameStarted || state.gameOver) return;

    console.log('🔁 Retomando motor da partida após reload do host...');

    Game.ui.showScreen('game');
    Game.ui.syncPlayerViews(Game.getPlayerByName(state.playerName));
    Game.ui.updateTimerDisplay();
    startClock();
    if (state.gameOver) return; // o tempo da partida acabou durante o F5

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
        // Os prazos são armados antes das telas: a tela do host conta pela
        // hora de término do prazo. Apoio pendente: o prazo de quem foi
        // chamado (o de resposta continua parado). Pergunta ainda por
        // fazer: o prazo do Perguntador; feita, o de resposta.
        const advisoryPending = !!round.advisory && round.advisory.status === 'pending';
        if (advisoryPending) {
            resumePendingAdvisory(round.advisory);
        } else if (round.asked === false) {
            Game.engine.turn.armAskTimeout(msUntil(round.askEndsAt, CONFIG.GAME.ASK_TIMEOUT));
        } else {
            const paused = round.answerTimeLeft ?? CONFIG.GAME.ANSWER_TIMEOUT;
            round.answerTimeLeft = null;
            Game.engine.turn.armAnswerTimeout(round.answerer, msUntil(round.answerEndsAt, paused));
        }
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
        // O host chamado para o apoio vê a pergunta do apoio de novo (o
        // F5 levou a janela), se o prazo dele ainda não venceu; um guest
        // chamado a recebe quando volta (addPlayer(), em
        // network/messageHandler.js).
        if (advisoryPending && round.advisory.advisorName === state.playerName && msUntil(round.advisory.endsAt) > 0) {
            Game.engine.advisory.sendAdvisoryQuestion();
        }
        Game.ui.refreshNewRoundButton();
    }
}

/**
 * No F5 do host, um pedido de assessoria ou de ajuda ainda sem resposta
 * continua: o prazo de quem foi chamado volta a contar pela hora de
 * término guardada (`advisory.endsAt`; vencido durante o F5, a recusa por
 * tempo vem logo; sem a hora, rodada salva antes dela, prazo inteiro a
 * partir de agora). O prazo de resposta continua parado, com o que
 * faltava (`answerTimeLeft`), até o apoio terminar
 * (advisoryEngine.handleAdvisoryAnswer()). Uma resposta que já esperava o
 * apoio (`pendingAnswer`) continua guardada e é processada nessa hora.
 */
function resumePendingAdvisory(advisory) {
    console.log('🧭 Pedido de apoio (assessoria ou ajuda) sem resposta continua depois do F5 do host.');
    if (typeof advisory.endsAt !== 'number') {
        advisory.endsAt = Game.network.serverNow() + CONFIG.GAME.ADVISORY_TIMEOUT;
    }
    Game.engine.advisory.armAdvisoryTimeout(msUntil(advisory.endsAt));
}

/**
 * Host, ao abrir a sala com o estado gravado por outro host (troca de
 * host: o host antigo caiu e este aparelho assumiu a sala no banco).
 * Chamada por openRoom() (network/roomLink.js), antes da retomada
 * (resumeMatchAfterReload(), que segue como no F5):
 *   - o host antigo deixa de ser host: no lobby, sai da lista (como quem
 *     cai no lobby); na partida e no fim de jogo, fica desconectado, com
 *     KPI e recursos guardados — volta como jogador comum;
 *   - este jogador vira o host, conectado (o host antigo pode tê-lo dado
 *     como caído);
 *   - com o host antigo na dupla e a pergunta sem resposta, a rodada é a
 *     de quem cai: fica sem rodada e a retomada sorteia outra dupla;
 *   - senão, o tempo sem host não conta: cada prazo da rodada que ainda
 *     corria no último sinal do host antigo (`slackMs` atrás) ganha
 *     `slackMs` — o do Perguntador, o de resposta e o de quem foi chamado
 *     para o apoio. O prazo de resposta parado pelo apoio (answerTimeLeft)
 *     e o relógio da partida (endsAt) não mudam.
 */
function takeOverMatch({ fromUid, toUid, slackMs }) {
    const state = Game.state;
    const previous = state.players.find(p => p.peerId === fromUid);
    const me = state.players.find(p => p.peerId === toUid);
    console.log('👑 Troca de host: este aparelho assume a partida' + (previous ? ' de ' + previous.name : '') + ' (folga de ' + slackMs + ' ms).');
    if (me) {
        me.isHost = true;
        me.disconnected = false;
    }
    if (!previous) return;
    previous.isHost = false;
    if (!state.gameStarted) {
        state.players = state.players.filter(p => p !== previous);
        return;
    }
    previous.disconnected = true;

    const round = state.currentRound;
    if (!round || state.gameOver) return;
    if (!round.answered && (round.asker === previous.name || round.answerer === previous.name)) {
        console.warn('⚠️ O host antigo estava na dupla — a retomada sorteia outra.');
        state.currentRound = null;
        return;
    }
    const lastSeen = Game.network.serverNow() - slackMs;
    const extended = (endsAt) => typeof endsAt === 'number' && endsAt > lastSeen;
    if (extended(round.askEndsAt)) round.askEndsAt += slackMs;
    if (extended(round.answerEndsAt)) round.answerEndsAt += slackMs;
    if (round.advisory && extended(round.advisory.endsAt)) round.advisory.endsAt += slackMs;
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
 * Cancela os prazos da pergunta em andamento: o do Perguntador, o de
 * resposta do Respondedor e o de quem foi chamado (assessoria ou ajuda).
 * Usada no fim de jogo, ao encerrar a partida e quando a dupla é trocada
 * (abortRoundIfParticipant()).
 */
function cancelRoundTimeouts() {
    const state = Game.state;
    Game.engine.turn.clearAskTimeout();
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
    takeOverMatch,
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
