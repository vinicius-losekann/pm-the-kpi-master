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

    iniciarRelogio();

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
 * Fase D2b: usada também quando um guest volta para uma partida em
 * andamento (restoreState(), em network/messageHandler.js). Antes, a
 * contagem só era ligada em startGame() — quem reconectava ficava com
 * o relógio parado, andando só de 10 em 10 segundos a cada
 * 'timer-update'.
 *
 * Também é a contagem de quem assume como host (becomeHost(), em
 * network/hostMigration.js), que antes tinha uma cópia própria.
 */
function iniciarRelogio() {
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
 * Fase D3f: antes ficava em main.js (resumeGameEngineIfHost()) e tratava
 * só "sem rodada" e "rodada em andamento" — um F5 em outros momentos
 * deixava a partida errada ou travada. Agora a retomada faz o que
 * aconteceria sem o F5, conforme o momento:
 *   - partida pausada → continua pausada com o mesmo evento (sem sortear
 *     outro nem reaplicar os efeitos); retoma quando alguém reconectar
 *     (addPlayer() em network/messageHandler.js);
 *   - rodada encerrada → continua encerrada, aguardando o "Nova Rodada";
 *   - sem rodada → começa uma (como antes);
 *   - pergunta já respondida (F5 nos ~3s antes da próxima dupla, quando
 *     o setTimeout de answerEngine.handleAnswer() se perde com a página)
 *     → encerra a partida, se essa resposta completou a última fase, ou
 *     segue com nextTurn() (próxima dupla ou fim da rodada). "Já
 *     respondida" = `respondeu` ou o Respondedor já no rodízio, o mesmo
 *     critério de becomeHost() (network/hostMigration.js);
 *   - pergunta em aberto → reexibe a mesma pergunta (ou, com o host fora
 *     da dupla, a tela de espectador — BUG-020) e rearma o prazo de
 *     resposta (correção do BUG-001, ver ISSUES.md: antes cada F5 trocava
 *     a pergunta). Um pedido de assessoria ainda sem resposta é cancelado
 *     antes (BUG-019, ver cancelarAssessoriaPendente()).
 */
function retomarPartidaAposRecarregar() {
    const state = Game.state;
    if (!state.isHost || !state.gameStarted || state.gameOver) return;

    console.log('🔁 Retomando motor da partida após reload do host...');

    Game.ui.showScreen('game');
    Game.ui.syncPlayerViews(Game.getPlayerByName(state.playerName));
    Game.ui.updateTimerDisplay();
    iniciarRelogio();

    Game.network.broadcastAll({ type: 'player-list', players: state.players });

    const round = state.currentRound;
    const perguntaJaRespondida = !!round &&
        (!!round.respondeu || state.usedRespondedorThisRound.includes(round.respondedor));

    if (state.partidaPausada) {
        console.log('⏸️ A partida estava pausada — continua pausada até alguém reconectar.');
        state.currentRound = null;
        Game.ui.showPartidaPausadaMessage();
        Game.ui.refreshNovaRodadaButton();
    } else if (state.rodadaEncerrada) {
        console.log('✅ A rodada já tinha terminado — aguardando o host clicar em "Nova Rodada".');
        Game.ui.showRoundEndedMessage();
        Game.ui.refreshNovaRodadaButton();
    } else if (!round) {
        Game.engine.turn.pickNewPair();
    } else if (perguntaJaRespondida) {
        if (completouUltimaFase(Game.getPlayerByName(round.respondedor))) {
            console.log('🏁 A última resposta completou a última fase — encerrando a partida.');
            endGame(buildRanking());
        } else {
            console.log('➡️ A pergunta já tinha sido respondida — seguindo para a próxima dupla.');
            Game.engine.turn.nextTurn();
        }
    } else {
        if (cancelarAssessoriaPendente(round)) return;
        // BUG-020: fora da dupla, o host vê a tela de espectador, como
        // veria sem o F5 (pickNewPair() faz a mesma escolha) — antes via
        // a área da pergunta.
        const naDupla = state.playerName === round.perguntador || state.playerName === round.respondedor;
        if (naDupla) {
            Game.ui.displayRoundStart();
            if (round.pergunta) {
                Game.ui.displayQuestion(round.pergunta);
            }
        } else {
            Game.ui.displaySpectatorView(round.perguntador, round.respondedor);
        }
        Game.engine.turn.armarRespostaTimeout(round.respondedor);
        Game.ui.refreshNovaRodadaButton();
    }
}

/**
 * BUG-019: no F5 do host, um pedido de assessoria ainda sem resposta é
 * cancelado. O prazo de 20s do assessor (setTimeout de
 * advisoryEngine.handleAssessoriaRequest()) se perde com a página, e o
 * assessor perde a pergunta (a reconexão fecha os modais) — sem cancelar,
 * a rodada ficava presa esperando uma resposta que não vinha. Quem
 * responde pode pedir de novo; é o mesmo resultado de uma troca de host.
 *
 * Se a resposta já tinha chegado e esperava o assessor, ela é processada
 * agora (answerEngine.handleAnswer() segue para a próxima dupla).
 * @returns {boolean} true se processou a resposta guardada (a pergunta
 *   não deve ser reexibida)
 */
function cancelarAssessoriaPendente(round) {
    if (!round.assessoria || round.assessoria.status !== 'pending') return false;

    console.log('🧭 Pedido de assessoria sem resposta cancelado pelo F5 do host — quem responde pode pedir de novo.');
    round.assessoria = null;

    if (!round.pendingAnswer) return false;
    const pendente = round.pendingAnswer;
    round.pendingAnswer = null;
    Game.engine.answer.handleAnswer(pendente);
    return true;
}

/**
 * Fase D3f: o jogador terminou a última fase? Mesma condição usada por
 * answerEngine.handleAnswer() para encerrar a partida depois da resposta.
 */
function completouUltimaFase(jogador) {
    if (!jogador) return false;
    return Game.getFaseIndex(jogador.phase) === CONFIG.FASES.length - 1 &&
        jogador.activities >= CONFIG.JOGO.ACTIVITIES_PER_PHASE;
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

    // Fase D: quem caiu durante a partida e não voltou sai da lista
    // antes de ir para o lobby — o 'match-ended' já leva a lista limpa
    // para os guests (ver handleMatchEnded()).
    const removidos = Game.mutations.removeDisconnectedPlayers(Game.state);
    if (removidos.length) console.log('🧹 Removidos ao voltar ao lobby (desconectados): ' + removidos.join(', '));

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

/**
 * Volta ao lobby a partir da tela de fim de jogo (botão "Voltar ao
 * Lobby"). Cada jogador clica na própria tela — não há mensagem de rede
 * própria para isso.
 *
 * Fase D: quem caiu durante a partida e não voltou sai da lista aqui.
 * Se quem clicou é o host (dono da lista oficial), avisa os guests com
 * um 'player-list'; um guest só limpa a própria cópia (a lista do host
 * sobrescreve a dele a cada 'player-list').
 *
 * Fase D3d: os jogadores voltam zerados, como em endMatch() — em
 * especial, quem tinha saído da partida deixa de estar "aguardando no
 * lobby". Antes, essa marca sobrava e o botão "Iniciar" não contava o
 * jogador: com 2 jogadores, depois de um "Sair da partida" não dava
 * para começar outra. Por isso o host sempre manda a lista atualizada.
 */
function voltarAoLobby() {
    const state = Game.state;

    const removidos = Game.mutations.removeDisconnectedPlayers(state);
    if (removidos.length) console.log('🧹 Removidos ao voltar ao lobby (desconectados): ' + removidos.join(', '));

    Game.resetAllPlayers();
    Game.resetGameState();
    resetAllBaralhos();

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
    iniciarRelogio,
    retomarPartidaAposRecarregar,
    endGame,
    endMatch,
    handleMatchEnded,
    voltarAoLobby,
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