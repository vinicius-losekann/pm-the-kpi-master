// ============================================
// PM: The KPI Master - Network: Message Handler
// ============================================
// Roteia as mensagens recebidas para as funções apropriadas e mantém
// a lista de jogadores sincronizada (lado host). Não lida com PeerJS
// em si (isso é peerService.js) nem com migração de host (isso é
// hostMigration.js).
// ============================================

/**
 * Segurança: verifica se o peer que enviou a mensagem (fromPeerId) é de
 * fato o jogador que a mensagem alega representar (claimedName). Sem
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
        console.warn(`⚠️ Mensagem rejeitada: "${claimedName}" foi reivindicado por um peer diferente do registrado (possível falsificação de identidade).`);
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
            const reasons = {
                'room-full': '⚠️ Sala cheia (máximo de ' + CONFIG.GAME.MAX_PLAYERS + ' jogadores).',
                'room-locked': '⚠️ A partida desta sala já começou. Só quem já estava na partida pode reconectar — aguarde o host voltar ao lobby para entrar.',
                'name-taken': '⚠️ Esse nome já está em uso nesta sala. Escolha outro nome e entre novamente.',
                'identity-mismatch': '⚠️ Esse nome pertence a um jogador desta partida e não foi possível confirmar que é você. Para voltar, entre pelo mesmo navegador em que você começou a partida (sem aba anônima e sem ter apagado os dados do site) — ou aguarde o host voltar ao lobby.',
                'version-mismatch': '⚠️ O jogo foi atualizado e esta página está desatualizada em relação à sala. Recarregue a página (Ctrl+F5; no celular, feche a aba e abra de novo) e entre de novo com o mesmo nome e código. Se continuar, peça ao host para recarregar a página também.'
            };
            alert(reasons[msg.reason] || reasons['name-taken']);
            window.location.href = './';
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
        case 'game-start':
            state.timer = msg.timer;
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
            state.currentRound = {
                event: msg.event,
                asker: msg.asker,
                answerer: msg.answerer,
                question: null,
                answered: false
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
            Game.ui.showRoundEndedMessage();
            break;

        // Host pausou a partida por falta de jogadores conectados
        // (ver turnEngine.pickNewPair()). Retoma sozinha com um novo
        // 'round-start' quando alguém reconectar.
        case 'match-paused':
            state.currentRound = null;
            Game.ui.showMatchPausedMessage();
            break;

        case 'question':
            if (!state.isHost) {
                state.currentRound.question = msg;
            }
            state.currentRound.answered = false;
            Game.ui.displayQuestion(msg);
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

        case 'timer-update':
            state.timer = msg.remaining;
            Game.ui.updateTimerDisplay();
            break;

        // --- EVENTO ---
        case 'show-event':
            if (msg.players) {
                state.players = msg.players;
            }
            Game.ui.showEventModal(msg.event);
            Game.ui.syncPlayerViews(Game.getPlayerByName(state.playerName));
            break;

        // --- ASSESSORIA ---
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
                    console.warn('⚠️ Resposta de assessoria rejeitada: remetente não é o assessor designado da rodada.');
                }
            }
            break;

        case 'advisory-result':
            Game.ui.showAdvisoryResult(msg);
            break;

        // --- PEDIDO DE AJUDA ---
        case 'help-request':
            if (state.isHost && isSenderVerified(msg.requesterName, fromPeerId)) {
                Game.core.handleHelpRequest(msg);
            }
            break;

        case 'help-trying':
            Game.ui.showHelpCandidate(msg);
            break;

        case 'help-offer':
            Game.ui.showHelpOfferModal(msg);
            break;

        case 'help-offer-response':
            if (state.isHost && isSenderVerified(msg.candidateName, fromPeerId)) {
                Game.core.handleHelpOfferResponse(msg);
            }
            break;

        case 'help-no-candidates':
            Game.ui.showHelpNoCandidates(msg);
            break;

        case 'help-confirmed':
            const donor = Game.getPlayerByName(msg.donor);
            const requester = Game.getPlayerByName(msg.requester);
            if (donor) {
                donor.kpi = msg.donorKpi;
                donor.resources = msg.donorResources;
            }
            if (requester) {
                requester.kpi = msg.requesterKpi;
                requester.resources = msg.requesterResources;
            }
            Game.ui.syncPlayerViews(Game.getPlayerByName(state.playerName));
            if (state.playerName === msg.requester) {
                Game.ui.closeHelpRequestModal();
            }
            console.log('🆘 Ajuda confirmada:', msg.donor, '→', msg.requester);
            break;
    }
}

// ============================================
// GERENCIAR JOGADORES (HOST)
// ============================================

/**
 * Envia a recusa de entrada para o peer e fecha a conexão logo depois
 * (o atraso dá tempo da mensagem chegar antes do close).
 */
function rejectJoin(fromPeerId, reason) {
    const c = Game.network.connectionState.getConnection(fromPeerId);
    if (c && c.open) {
        c.send({ type: 'join-rejected', reason });
    }
    setTimeout(() => { if (c) c.close(); }, 300);
}

/**
 * Hash do token de identidade que veio no 'player-join', ou
 * null se não veio (ou veio em formato inválido). O token em si nunca
 * é guardado — só o hash (ver utils/identity.js).
 */
function receivedTokenHash(msg) {
    const token = msg.token;
    if (typeof token !== 'string' || token.length === 0 || token.length > 128) return null;
    return Game.identity.hashToken(token);
}

/**
 * Adiciona um jogador à sala (host). Verifica duplicidade de nome e limite.
 *
 * Com a partida em andamento, a sala fica travada — só entra
 * quem já está na lista (reconexão). A checagem de "sala cheia" só vale
 * para nome novo: um jogador desconectado continua ocupando a vaga dele
 * e precisa conseguir voltar mesmo com a sala lotada.
 *
 * A reconexão exige o mesmo token de identidade da primeira
 * entrada (o hash dele fica em `tokenHash`). Sem isso, quem soubesse o
 * nome de um jogador desconectado podia entrar no lugar dele e herdar
 * KPI, recursos e fase. Token diferente ou ausente → 'identity-mismatch',
 * e o jogador original continua reservado, esperando a volta dele.
 *
 * Antes de tudo, a versão do formato das mensagens: quem chega com outra
 * (código antigo ou mais novo em cache) é recusado com 'version-mismatch'
 * e o aviso pede para recarregar a página. Sem o campo conta como 1 (o
 * player-join de antes da versão).
 */
function addPlayer(msg, fromPeerId) {
    const state = Game.state;
    const cs = Game.network.connectionState;

    const version = msg.protocolVersion === undefined ? 1 : msg.protocolVersion;
    if (version !== Game.network.PROTOCOL_VERSION) {
        console.warn('🧩 Entrada recusada: "' + msg.playerName + '" está com outra versão do jogo (' + JSON.stringify(msg.protocolVersion) + ').');
        rejectJoin(fromPeerId, 'version-mismatch');
        return;
    }

    const tokenHash = receivedTokenHash(msg);

    const existingIdx = state.players.findIndex(p => p.name === msg.playerName);
    if (existingIdx >= 0) {
        const existingPlayer = state.players[existingIdx];
        const oldConn = cs.getConnection(existingPlayer.peerId);
        // O próprio host nunca tem conexão consigo mesmo — sem a primeira
        // condição, alguém entrando com o nome do host seria tratado como
        // "reconexão" e tomaria o lugar dele na lista.
        const oldPeerStillConnected = existingPlayer.peerId === state.peerId ||
            (oldConn && oldConn.open && existingPlayer.peerId !== fromPeerId);

        if (oldPeerStillConnected) {
            rejectJoin(fromPeerId, 'name-taken');
            return;
        }

        if (existingPlayer.tokenHash) {
            if (tokenHash !== existingPlayer.tokenHash) {
                console.warn('🔐 Reconexão recusada: "' + msg.playerName + '" veio com um token de identidade diferente do registrado.');
                rejectJoin(fromPeerId, 'identity-mismatch');
                return;
            }
        } else if (tokenHash) {
            // Transição: entrada registrada antes do token existir (estado
            // salvo de uma versão anterior). Aceita pelo nome e passa a
            // exigir este token daqui em diante.
            existingPlayer.tokenHash = tokenHash;
        }

        state.players[existingIdx].peerId = fromPeerId;
        state.players[existingIdx].disconnected = false;
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
            resources: CONFIG.STARTING_RESOURCES,
            tokenHash
        });

        if (state.players.length === 2 && !state.backupPeerId) {
            state.backupPeerId = fromPeerId;
        }
    }

    Game.network.broadcastAll({ type: 'player-list', players: state.players });
    Game.ui.updatePlayersList();
    Game.ui.checkStartCondition();

    const conn = cs.getConnection(fromPeerId);
    if (conn && conn.open) {
        let currentRoundForSync = state.currentRound;
        if (currentRoundForSync && currentRoundForSync.question) {
            const isRoundAsker = msg.playerName === currentRoundForSync.asker;
            if (!isRoundAsker) {
                currentRoundForSync = {
                    ...currentRoundForSync,
                    question: { ...currentRoundForSync.question, correct: undefined }
                };
            }
        }

        // Além da rodada, o guest precisa saber em que ponto
        // ela está — ciclo encerrado aguardando o host, ou partida
        // pausada — para não reabrir uma pergunta que já acabou.
        conn.send({
            type: 'state-sync',
            fullState: {
                players: state.players,
                decks: state.decks,
                timer: state.timer,
                currentRound: currentRoundForSync,
                gameStarted: state.gameStarted,
                hostVersion: state.hostVersion,
                roundEnded: !!state.roundEnded,
                matchPaused: !!state.matchPaused,
                // Quem já respondeu nesta rodada — quem volta
                // também pode assumir como host depois.
                answeredThisRound: state.answeredThisRound.slice(),
                // Fim de jogo — quem volta vê o ranking final.
                gameOver: !!state.gameOver,
                finalRanking: state.finalRanking || null
            }
        });
    }

    // Se a partida estava pausada por falta de jogadores
    // conectados, a volta deste jogador pode ser o que faltava. Fica
    // depois do state-sync para o guest já estar com o estado em dia
    // quando o 'round-start' chegar.
    if (state.gameStarted && !state.gameOver && state.matchPaused &&
        Game.getActivePlayers().length >= CONFIG.GAME.MIN_PLAYERS) {
        Game.core.resumePausedMatch();
    }

    Game.saveState();
}

/**
 * Host: trata a queda de conexão de um guest (chamada pelo 'close' da
 * conexão em peerService.js).
 *
 * Fora de partida (lobby ou fim de jogo), remove o jogador como
 * sempre. Com a partida em andamento, mantém o jogador na lista marcado
 * como `disconnected: true` — KPI, recursos e fase ficam preservados e
 * a vaga fica reservada para a reconexão (a sala está travada para
 * nomes novos, ver addPlayer()). Desconectados ficam fora do sorteio de
 * dupla, dos efeitos de evento e do rodízio (ver getActivePlayers()).
 */
function handlePlayerDisconnect(peerId) {
    const state = Game.state;
    const player = state.players.find(p => p.peerId === peerId);
    if (!player) return; // conexão que nunca virou jogador (ex: teste da tela de entrada) ou peerId antigo de quem já reconectou

    if (!state.gameStarted || state.gameOver) {
        removePlayerByPeerId(peerId);
        return;
    }

    player.disconnected = true;
    console.warn('📴 ' + player.name + ' desconectou — mantido na partida aguardando reconexão.');

    Game.network.broadcastAll({ type: 'player-list', players: state.players });
    Game.ui.updatePlayersList();
    Game.ui.syncPlayerViews(null);

    Game.core.abortRoundIfParticipant(player.name);

    Game.saveState();
}

/**
 * Remove um jogador da sala (host) e aborta a rodada se ele for participante.
 */
function removePlayerByPeerId(peerId) {
    const state = Game.state;
    const removedPlayer = state.players.find(p => p.peerId === peerId);
    state.players = state.players.filter(p => p.peerId !== peerId);

    if (state.backupPeerId === peerId && state.players.length > 1) {
        state.backupPeerId = state.players[1]?.peerId;
    }

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
 * (1) Religa a contagem local do relógio (sem ela, o relógio de quem
 * volta só andaria a cada 'timer-update'); (2) escolhe a tela pela
 * situação: fim de jogo → tela final com o ranking que veio do host, sem
 * relógio; partida pausada → aviso de pausa; ciclo encerrado → "rodada
 * encerrada, aguardando o host"; pergunta já respondida (intervalo até a
 * próxima dupla) → visão de espectador, sem reabrir a pergunta; senão, a
 * rodada em andamento.
 */
function restoreState(fullState) {
    const state = Game.state;
    state.players = fullState.players;
    state.decks = fullState.decks;
    state.timer = fullState.timer;
    state.currentRound = fullState.currentRound;
    state.gameStarted = fullState.gameStarted;
    if (fullState.hostVersion !== undefined) state.hostVersion = fullState.hostVersion;
    state.roundEnded = !!fullState.roundEnded;
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
    addPlayer,
    handlePlayerDisconnect,
    removePlayerByPeerId,
    restoreState
});