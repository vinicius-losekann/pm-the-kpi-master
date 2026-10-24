// ============================================
// PM: The KPI Master - Network: Message Handler
// ============================================
// Roteia as mensagens recebidas para as funções apropriadas e mantém
// a lista de jogadores sincronizada (lado host). Não lida com o canal da
// sala em si (isso é roomLink.js e roomChannel.js). Quem mandou a
// mensagem chega como o uid do aparelho (o campo `peerId` dos jogadores).
// ============================================

/**
 * Segurança: verifica se o aparelho que enviou a mensagem (fromPeerId) é
 * de fato o jogador que a mensagem alega representar (claimedName). Sem
 * isso, qualquer guest conectado poderia enviar mensagens alegando ser
 * outro jogador — respondendo no lugar dele, tirando-o da partida etc.
 * Usada apenas no HOST, no momento do despacho das mensagens que
 * executam uma ação EM NOME de um jogador específico.
 */
function isSenderVerified(claimedName, fromPeerId) {
    const player = Game.getPlayerByName(claimedName);
    if (!player) {
        console.warn(`⚠️ Mensagem rejeitada: jogador "${claimedName}" não encontrado.`);
        return false;
    }
    if (player.peerId !== fromPeerId) {
        console.warn(`⚠️ Mensagem rejeitada: "${claimedName}" foi reivindicado por um aparelho diferente do registrado (possível falsificação de identidade).`);
        return false;
    }
    return true;
}

/**
 * Roteia as mensagens recebidas para as funções apropriadas.
 */
function handleMessage(msg, fromPeerId) {
    console.log('📨 Mensagem recebida:', msg.type);
    const state = Game.state;

    switch (msg.type) {

        // --- LOBBY ---
        case 'player-join':
            if (state.isHost) addPlayer(msg, fromPeerId);
            break;

        case 'join-rejected':
            Game.network.cleanup();
            handleJoinRejected(msg.reason);
            break;

        case 'player-list':
            state.players = msg.players;
            Game.ui.updatePlayersList();
            // A lista também muda quando alguém cai/reconecta no
            // meio da partida — atualiza a lista de jogadores e o ranking
            // da tela de jogo, não só a do lobby.
            if (state.gameStarted) Game.ui.syncPlayerViews(null);
            break;

        case 'state-sync':
            restoreState(msg.fullState);
            break;

        // --- SESSÃO ---
        case 'session-ended':
            Game.ui.closeAllModals();
            alert('⛔ O host encerrou a sessão.');
            Game.network.cleanup();
            window.location.href = './';
            break;

        // --- PARTIDA ---
        // Hora de término da partida (hora do servidor), marcada pelo host.
        case 'game-start':
            state.endsAt = msg.endsAt;
            Game.core.startGame();
            break;

        case 'leave-match-request':
            if (state.isHost && isSenderVerified(msg.playerName, fromPeerId)) {
                Game.core.handleLeaveMatchRequest(msg);
            }
            break;

        case 'match-ended':
            Game.core.handleMatchEnded(msg);
            break;

        case 'game-over':
            Game.core.endGame(msg.ranking);
            break;

        // --- RODADA ---
        case 'round-start':
            state.roundEnded = false;
            storeAnsweredThisRound(msg.answeredThisRound);
            if (typeof msg.roundNumber === 'number') state.roundNumber = msg.roundNumber;
            console.log('🎯 Rodada ' + msg.roundNumber + ' — ' + msg.asker + ' pergunta para ' + msg.answerer);
            state.waitingFor = [];
            state.currentRound = {
                event: msg.event,
                asker: msg.asker,
                answerer: msg.answerer,
                question: null,
                answered: false,
                asked: false,
                // Número da dupla: vai de volta na resposta e no "Fazer a pergunta".
                pairId: msg.pairId
            };
            if (state.playerName === msg.asker || state.playerName === msg.answerer) {
                Game.ui.displayRoundStart();
            } else {
                Game.ui.displaySpectatorView(msg.asker, msg.answerer);
            }
            break;

        case 'round-ended':
            // Guarda também no guest, para a cópia dele do
            // estado bater com a do host (ex: se ele assumir como host).
            state.roundEnded = true;
            state.waitingFor = [];
            Game.ui.showRoundEndedMessage();
            break;

        // Quem estava na dupla caiu: a dupla fica guardada até o fim da
        // rodada (ver sessionEngine.holdRoundIfParticipant()).
        case 'pair-held':
            Game.ui.showPairHeldNotice(msg);
            break;

        // Ninguém mais pode responder e a rodada espera quem caiu
        // (ver turnEngine.endRoundOrWait()).
        case 'round-waiting':
            state.currentRound = null;
            state.waitingFor = Array.isArray(msg.waitingFor) ? msg.waitingFor.slice() : [];
            Game.ui.showRoundWaitingMessage(state.waitingFor.slice(), false);
            break;

        // Host pausou a partida por falta de jogadores conectados
        // (ver turnEngine.pickNewPair()). Retoma sozinha com um novo
        // 'round-start' quando alguém reconectar.
        case 'match-paused':
            state.currentRound = null;
            state.waitingFor = [];
            Game.ui.showMatchPausedMessage();
            break;

        case 'question':
            if (!state.isHost) {
                state.currentRound.question = msg;
            }
            state.currentRound.answered = false;
            // Quem responde só recebe a pergunta depois de ela ser feita.
            if (msg.isAnswerer) state.currentRound.asked = true;
            Game.ui.displayQuestion(msg);
            break;

        // O Perguntador clicou em "Fazer a pergunta" (ver turnEngine.askQuestion()).
        case 'ask-question':
            if (state.isHost && isSenderVerified(msg.playerName, fromPeerId)) {
                Game.core.handleAskQuestion(msg);
            }
            break;

        // A pergunta foi feita (clique ou prazo do Perguntador): todos
        // guardam, para a cópia da rodada bater com a do host.
        case 'question-asked':
            if (state.currentRound) state.currentRound.asked = true;
            Game.ui.showQuestionAsked();
            break;

        case 'answer':
            if (state.isHost &&
                state.currentRound &&
                !state.currentRound.answered &&
                msg.playerName === state.currentRound.answerer &&
                isSenderVerified(msg.playerName, fromPeerId)) {
                Game.core.handleAnswer(msg);
            }
            break;

        case 'kpi-update':
            storeAnsweredThisRound(msg.answeredThisRound);
            Game.core.updatePlayerKPI(msg);
            break;

        // --- EVENTO ---
        case 'show-event':
            if (msg.players) {
                state.players = msg.players;
            }
            Game.ui.showEventModal(msg.event, msg.eventEffect);
            Game.ui.syncPlayerViews(Game.getPlayerByName(state.playerName));
            break;

        // --- ASSESSORIA E PEDIDO DE AJUDA (o campo kind diz qual) ---
        case 'advisory-request':
            if (state.isHost && isSenderVerified(msg.requesterName, fromPeerId)) {
                Game.core.handleAdvisoryRequest(msg);
            }
            break;

        case 'advisory-started':
            Game.ui.showAdvisoryStarted(msg);
            break;

        case 'advisory-question':
            Game.ui.showAdvisoryQuestionModal(msg);
            break;

        case 'advisory-answer':
            if (state.isHost) {
                const advisorName = state.currentRound?.advisory?.advisorName;
                if (advisorName && isSenderVerified(advisorName, fromPeerId)) {
                    Game.core.handleAdvisoryAnswer(msg);
                } else {
                    console.warn('⚠️ Resposta de assessoria/ajuda rejeitada: remetente não é quem foi chamado na rodada.');
                }
            }
            break;

        case 'advisory-result':
            Game.ui.showAdvisoryResult(msg);
            break;
    }
}

// ============================================
// GERENCIAR JOGADORES (HOST)
// ============================================

// Avisos de entrada recusada (join-rejected e as recusas da abertura da
// sala no jogo, ver main.js).
const JOIN_REJECTED_TEXTS = {
    'room-full': '⚠️ Sala cheia (máximo de ' + CONFIG.GAME.MAX_PLAYERS + ' jogadores).',
    'room-locked': '⚠️ A partida desta sala já começou. Só quem já estava na partida pode reconectar — aguarde o host voltar ao lobby para entrar.',
    'name-taken': '⚠️ Esse nome já está em uso nesta sala. Escolha outro nome e entre novamente.',
    'identity-mismatch': '⚠️ Esse nome pertence a um jogador desta partida e não foi possível confirmar que é você. Para voltar, entre pelo mesmo navegador em que você começou a partida (sem aba anônima e sem ter apagado os dados do site) — ou aguarde o host voltar ao lobby.',
    'device-in-use': '⚠️ Este navegador já está nesta sala com outro nome. Para voltar, entre com o mesmo nome de antes (ou use outro aparelho).',
    'version-mismatch': '⚠️ O jogo foi atualizado e esta página está desatualizada em relação à sala. Recarregue a página (Ctrl+F5; no celular, feche a aba e abra de novo) e entre de novo com o mesmo nome e código. Se continuar, peça ao host para recarregar a página também.',
    'room-not-found': '⚠️ Sala não encontrada. Confira o código com o host e entre de novo.',
    'tab-in-use': '⚠️ Esta sala já está aberta em outra aba deste navegador. Continue pela outra aba (ou feche-a e entre de novo).'
};

/** Mostra o aviso da recusa e volta para a tela inicial. */
function handleJoinRejected(reason) {
    alert(JOIN_REJECTED_TEXTS[reason] || JOIN_REJECTED_TEXTS['name-taken']);
    window.location.href = './';
}

/**
 * Envia a recusa de entrada para o aparelho que pediu. O próprio host
 * nunca é recusado (a recusa para ele seria tratada na hora e o tiraria
 * da sala).
 */
function rejectJoin(fromPeerId, reason) {
    if (fromPeerId === Game.state.peerId) {
        console.warn('⚠️ Pedido de entrada do próprio aparelho do host ignorado (' + reason + ').');
        return;
    }
    Game.network.sendToPlayer(fromPeerId, { type: 'join-rejected', reason });
}

/**
 * Adiciona um jogador à sala (host). Verifica duplicidade de nome e limite.
 *
 * Com a partida em andamento, a sala fica travada — só entra
 * quem já está na lista (reconexão). A checagem de "sala cheia" só vale
 * para nome novo: um jogador desconectado continua ocupando a vaga dele
 * e precisa conseguir voltar mesmo com a sala lotada.
 *
 * A identidade é o uid do aparelho (login anônimo, que sobrevive a F5 e a
 * fechar a aba): mesmo nome e mesmo uid volta ao lugar. Mesmo nome em
 * outro aparelho: 'name-taken' com o dono conectado, 'identity-mismatch'
 * com ele fora — quem soubesse o nome de um jogador desconectado não
 * herda KPI, recursos e área foco dele; a vaga continua reservada. O
 * aparelho que já está na sala com outro nome: 'device-in-use'.
 *
 * Antes de tudo, a versão do formato das mensagens: quem chega com outra
 * (código antigo ou mais novo em cache) é recusado com 'version-mismatch'
 * e o aviso pede para recarregar a página. Sem o campo conta como 1 (o
 * player-join de antes da versão).
 *
 * Quem é aceito entra no roster da sala (admitPlayer) e recebe o estado
 * com o cursor dos avisos para todos (feedCursor); quem é recusado não.
 * O estado vai sem os baralhos e com a rodada como ele pode vê-la
 * (roundAsSeenBy()).
 */
function addPlayer(msg, fromPeerId) {
    const state = Game.state;

    // O próprio aparelho do host já está na lista. Depois de uma troca de
    // host, o pedido que ele mandou ao host antigo, quando ainda era guest,
    // espera no banco: tratado, voltaria a ele mesmo como state-sync (sem o
    // gabarito da rodada).
    if (fromPeerId === state.peerId) {
        console.warn('⚠️ Pedido de entrada do próprio aparelho do host ignorado.');
        return;
    }

    const version = msg.protocolVersion === undefined ? 1 : msg.protocolVersion;
    if (version !== Game.network.PROTOCOL_VERSION) {
        console.warn('🧩 Entrada recusada: "' + msg.playerName + '" está com outra versão do jogo (' + JSON.stringify(msg.protocolVersion) + ').');
        rejectJoin(fromPeerId, 'version-mismatch');
        return;
    }

    const sameDevice = state.players.find(p => p.peerId === fromPeerId);
    if (sameDevice && sameDevice.name !== msg.playerName) {
        console.warn('📱 Entrada recusada: este aparelho já está na sala como "' + sameDevice.name + '".');
        rejectJoin(fromPeerId, 'device-in-use');
        return;
    }

    const existingPlayer = state.players.find(p => p.name === msg.playerName);
    if (existingPlayer) {
        if (existingPlayer.peerId !== fromPeerId) {
            if (existingPlayer.disconnected) {
                console.warn('🔐 Reconexão recusada: "' + msg.playerName + '" veio de outro aparelho.');
                rejectJoin(fromPeerId, 'identity-mismatch');
            } else {
                rejectJoin(fromPeerId, 'name-taken');
            }
            return;
        }
        existingPlayer.disconnected = false;
        delete existingPlayer.disconnectedAt;
        console.log('🔄 Reconectado:', msg.playerName);
    } else {
        // Depois do fim de jogo a sala não fica travada — quem caiu na
        // tela final (e saiu da lista) consegue voltar e ver o ranking; o
        // próximo passo de todos é voltar ao lobby.
        if (state.gameStarted && !state.gameOver) {
            console.warn('🔒 Entrada recusada: partida em andamento, "' + msg.playerName + '" não fazia parte dela.');
            rejectJoin(fromPeerId, 'room-locked');
            return;
        }

        if (state.players.length >= CONFIG.GAME.MAX_PLAYERS) {
            rejectJoin(fromPeerId, 'room-full');
            return;
        }

        state.players.push({
            name: msg.playerName,
            peerId: fromPeerId,
            kpi: 0,
            focusArea: CONFIG.FOCUS_AREAS[0].id,
            activities: 0,
            isHost: false,
            waitingInLobby: false,
            resources: CONFIG.STARTING_RESOURCES
        });
    }

    Game.network.admitPlayer(fromPeerId);
    Game.network.broadcastAll({ type: 'player-list', players: state.players });
    Game.ui.updatePlayersList();
    Game.ui.checkStartCondition();

    // Além da rodada, o guest precisa saber em que ponto
    // ela está — ciclo encerrado aguardando o host, ou partida
    // pausada — para não reabrir uma pergunta que já acabou. O cursor
    // vai depois da lista de jogadores acima: os avisos para todos até
    // ele já estão neste estado. Os baralhos (com o gabarito de todas as
    // perguntas) não vão: ficam só com o host (SEC-005).
    Game.network.sendToPlayer(fromPeerId, {
        type: 'state-sync',
        fullState: {
            players: state.players,
            // Hora de término da partida: quem volta calcula o que falta.
            endsAt: state.endsAt ?? null,
            currentRound: roundAsSeenBy(state.currentRound, msg.playerName),
            gameStarted: state.gameStarted,
            roundEnded: !!state.roundEnded,
            matchPaused: !!state.matchPaused,
            // Quem já respondeu nesta rodada.
            answeredThisRound: state.answeredThisRound.slice(),
            // Quem a rodada espera voltar (as duplas guardadas, com o
            // gabarito, ficam só com o host).
            waitingFor: (state.waitingFor || []).slice(),
            // Fim de jogo — quem volta vê o ranking final.
            gameOver: !!state.gameOver,
            finalRanking: state.finalRanking || null,
            feedCursor: Game.network.feedCursor()
        }
    });

    // Se a partida estava pausada por falta de jogadores
    // conectados, a volta deste jogador pode ser o que faltava. Fica
    // depois do state-sync para o guest já estar com o estado em dia
    // quando o 'round-start' chegar.
    if (state.gameStarted && !state.gameOver && state.matchPaused &&
        Game.getActivePlayers().length >= CONFIG.GAME.MIN_PLAYERS) {
        Game.core.resumePausedMatch();
    } else if (state.gameStarted && !state.gameOver) {
        // Se a rodada esperava quem caiu, a volta dele reabre a dupla
        // guardada (ou recalcula a espera). Também depois do state-sync.
        Game.core.refreshRoundWaiting();
    }

    // Quem foi chamado para um apoio ainda pendente recebe a pergunta do
    // apoio de novo (o mesmo prazo), depois do state-sync: a tela do
    // estado fecha as janelas abertas (ex.: quem voltou depois do F5 do host).
    const advisory = state.currentRound && state.currentRound.advisory;
    if (state.gameStarted && !state.gameOver && advisory && advisory.status === 'pending' &&
        advisory.advisorName === msg.playerName) {
        Game.core.sendAdvisoryQuestion();
    }

    Game.saveState();
}

/**
 * A rodada como `playerName` pode vê-la no state-sync: o gabarito da
 * pergunta só para o Perguntador, e sem a resposta que espera o apoio
 * (`pendingAnswer`, nem a chave). O estado do host não muda.
 */
function roundAsSeenBy(round, playerName) {
    if (!round) return round;
    const { pendingAnswer, ...visible } = round;
    if (visible.question && playerName !== visible.asker) {
        visible.question = { ...visible.question, correct: undefined };
    }
    return visible;
}

/**
 * Host: trata a queda de conexão de um guest (a presença dele ficou
 * offline, ver receivePresence() em roomLink.js).
 *
 * Fora de partida (lobby ou fim de jogo), remove o jogador como
 * sempre. Com a partida em andamento, mantém o jogador na lista marcado
 * como `disconnected: true` — KPI, recursos e fase ficam preservados e
 * a vaga fica reservada para a reconexão (a sala está travada para
 * nomes novos, ver addPlayer()). Desconectados ficam fora do sorteio de
 * dupla, dos efeitos de evento e do rodízio (ver getActivePlayers()).
 * Se ele estava na dupla, a dupla fica guardada até o fim da rodada
 * (holdRoundIfParticipant()); se a rodada esperava quem caiu, a espera é
 * recalculada. `lastSeen` (hora do servidor do último sinal de vida dele,
 * se o canal a tem) vira a hora da queda (`disconnectedAt`, para o "caiu
 * há m:ss" do host) e o console diz há quanto tempo o sinal estava parado.
 */
function handlePlayerDisconnect(peerId, lastSeen) {
    const state = Game.state;
    const player = state.players.find(p => p.peerId === peerId);
    if (!player) return; // aparelho que não é jogador da sala

    if (!state.gameStarted || state.gameOver) {
        removePlayerByPeerId(peerId);
        return;
    }

    const wasWaiting = (state.waitingFor || []).length > 0;
    const now = Game.network.serverNow();
    const stopped = typeof lastSeen === 'number' ? ' (sinal parado há ' + Math.round((now - lastSeen) / 1000) + ' s)' : '';
    player.disconnected = true;
    player.disconnectedAt = typeof lastSeen === 'number' ? lastSeen : now;
    console.warn('📴 ' + player.name + ' desconectou' + stopped + ' — mantido na partida aguardando reconexão.');

    Game.network.broadcastAll({ type: 'player-list', players: state.players });
    Game.ui.updatePlayersList();
    Game.ui.syncPlayerViews(null);

    if (wasWaiting) {
        Game.core.refreshRoundWaiting();
    } else {
        Game.core.holdRoundIfParticipant(player.name);
    }

    Game.saveState();
}

/**
 * Host: o sinal de vida de um jogador dado como desconectado voltou sem
 * a conexão ter caído (ex.: janela escondida por muito tempo, com o timer
 * do sinal espaçado pelo navegador — ver roomChannel.js, "Volta pelo sinal
 * de vida"). A página dele continuou recebendo os avisos: volta à lista e
 * ao sorteio sem player-join nem state-sync. Se a partida estava pausada
 * por falta de jogadores conectados, a volta dele pode ser o que faltava.
 * Só na partida: no lobby e no fim de jogo, quem cai sai da lista (ver
 * handlePlayerDisconnect()).
 */
function handlePlayerReturn(peerId) {
    const state = Game.state;
    const player = state.players.find(p => p.peerId === peerId);
    if (!player || !player.disconnected || !state.gameStarted || state.gameOver) return;

    player.disconnected = false;
    delete player.disconnectedAt;
    console.log('🔙 ' + player.name + ' voltou (sinal de vida de volta).');

    Game.network.broadcastAll({ type: 'player-list', players: state.players });
    Game.ui.updatePlayersList();
    Game.ui.syncPlayerViews(null);

    if (state.matchPaused && Game.getActivePlayers().length >= CONFIG.GAME.MIN_PLAYERS) {
        Game.core.resumePausedMatch();
    } else {
        // Se a rodada esperava quem caiu, a volta dele reabre a dupla guardada.
        Game.core.refreshRoundWaiting();
    }

    Game.saveState();
}

/**
 * Remove um jogador da sala (host): sai da lista e do roster, e a rodada
 * é abortada se ele for participante.
 */
function removePlayerByPeerId(peerId) {
    const state = Game.state;
    const removedPlayer = state.players.find(p => p.peerId === peerId);
    state.players = state.players.filter(p => p.peerId !== peerId);
    Game.network.dismissPlayer(peerId);

    Game.network.broadcastAll({ type: 'player-list', players: state.players });
    Game.ui.updatePlayersList();
    Game.ui.checkStartCondition();

    if (removedPlayer && state.gameStarted && !state.gameOver) {
        Game.core.abortRoundIfParticipant(removedPlayer.name);
    }

    Game.saveState();
}

// ============================================
// SINCRONIZAÇÃO DE ESTADO
// ============================================

/**
 * Guest guarda a lista de quem já respondeu na rodada atual
 * (`answeredThisRound`, vinda do host em 'round-start', 'kpi-update' e
 * 'state-sync'). Só o host decidia o rodízio e só ele tinha a lista;
 * agora, se ele cair, quem assumir continua de onde parou. Mensagem sem
 * o campo (host de versão anterior) não mexe na lista. O host nunca
 * sobrescreve a própria lista com a de uma mensagem.
 */
function storeAnsweredThisRound(answered) {
    const state = Game.state;
    if (state.isHost || !Array.isArray(answered)) return;
    state.answeredThisRound = answered.slice();
}

/**
 * Restaura o estado completo vindo do host (usado após reconexão).
 *
 * (1) Religa o relógio pela hora de término da partida (`endsAt`, hora
 * do servidor); (2) escolhe a tela pela
 * situação: fim de jogo → tela final com o ranking que veio do host, sem
 * relógio; partida pausada → aviso de pausa; ciclo encerrado → "rodada
 * encerrada, aguardando o host"; pergunta já respondida (intervalo até a
 * próxima dupla) → visão de espectador, sem reabrir a pergunta; rodada
 * esperando quem caiu → a espera; senão, a rodada em andamento.
 */
function restoreState(fullState) {
    const state = Game.state;
    state.players = fullState.players;
    // Os baralhos não vêm (ficam só com o host): o guest continua com os dele.
    state.endsAt = fullState.endsAt ?? null;
    state.currentRound = fullState.currentRound;
    state.gameStarted = fullState.gameStarted;
    state.roundEnded = !!fullState.roundEnded;
    // Host de versão anterior não manda o campo: sem espera.
    state.waitingFor = Array.isArray(fullState.waitingFor) ? fullState.waitingFor.slice() : [];
    storeAnsweredThisRound(fullState.answeredThisRound);
    // Host de versão anterior não manda os campos: partida não acabada.
    state.gameOver = !!fullState.gameOver;
    state.finalRanking = fullState.finalRanking || null;

    if (state.gameStarted && state.gameOver) {
        Game.core.showGameOver();
    } else if (state.gameStarted) {
        Game.ui.showScreen('game');
        Game.ui.updateTimerDisplay();
        Game.ui.syncPlayerViews(Game.getPlayerByName(state.playerName));

        Game.core.startClock();

        if (fullState.matchPaused) {
            state.currentRound = null;
            Game.ui.showMatchPausedMessage();
        } else if (state.roundEnded) {
            Game.ui.showRoundEndedMessage();
        } else if (state.waitingFor.length > 0) {
            state.currentRound = null;
            Game.ui.showRoundWaitingMessage(state.waitingFor.slice(), false);
        } else if (state.currentRound && state.currentRound.answered) {
            Game.ui.displaySpectatorView(state.currentRound.asker, state.currentRound.answerer);
        } else if (state.currentRound) {
            const isParticipant =
                state.playerName === state.currentRound.asker ||
                state.playerName === state.currentRound.answerer;
            if (isParticipant) {
                Game.ui.displayRoundStart();
                if (state.currentRound.question) {
                    Game.ui.displayQuestion(state.currentRound.question);
                }
            } else {
                Game.ui.displaySpectatorView(state.currentRound.asker, state.currentRound.answerer);
            }
        }
    } else {
        Game.ui.showScreen('lobby');
        Game.ui.showLobbyNormal();
    }

    Game.ui.updatePlayersList();
    Game.ui.updateTimerDisplay();
    Game.saveState();
}

// ============================================
// EXPORTAÇÃO
// ============================================
window.Game = window.Game || {};
window.Game.network = window.Game.network || {};
Object.assign(window.Game.network, {
    handleMessage,
    handleJoinRejected,
    addPlayer,
    handlePlayerDisconnect,
    handlePlayerReturn,
    removePlayerByPeerId,
    restoreState
});