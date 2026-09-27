// ============================================
// PM: The KPI Master - Network: Message Handler
// ============================================
// Roteia as mensagens recebidas para as funções apropriadas e mantém
// a lista de jogadores sincronizada (lado host). Não lida com PeerJS
// em si (isso é peerService.js) nem com migração de host (isso é
// hostMigration.js).
// Fase 4.2 do roadmap.
// ============================================

/**
 * 🔴 CORREÇÃO DE SEGURANÇA (ver ISSUES.md): verifica se o peer que
 * enviou a mensagem (fromPeerId) é de fato o jogador que a mensagem
 * alega representar (claimedName). Sem isso, qualquer guest conectado
 * podia enviar mensagens alegando ser outro jogador — respondendo no
 * lugar dele, expulsando-o da partida, etc.
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
            const motivos = {
                'room-full': '⚠️ Sala cheia (máximo de ' + CONFIG.JOGO.MAX_PLAYERS + ' jogadores).',
                'room-locked': '⚠️ A partida desta sala já começou. Só quem já estava na partida pode reconectar — aguarde o host voltar ao lobby para entrar.',
                'name-taken': '⚠️ Esse nome já está em uso nesta sala. Escolha outro nome e entre novamente.'
            };
            alert(motivos[msg.reason] || motivos['name-taken']);
            window.location.href = './';
            break;

        case 'player-list':
            state.players = msg.players;
            Game.ui.updatePlayersList();
            // Fase D: a lista também muda quando alguém cai/reconecta no
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

        case 'host-changed':
            state.hostPeerId = msg.newHostPeerId;
            if (msg.hostVersion !== undefined) state.hostVersion = msg.hostVersion;
            if (msg.players) state.players = msg.players;
            if (!state.isHost) Game.network.reconnectToNewHost(msg.newHostPeerId);
            if (state.gameStarted && !state.gameOver) {
                Game.ui.showScreen('game');
                Game.ui.updatePlayersOnlineList();
                Game.ui.updateRankingList();
                Game.ui.updateTimerDisplay();
                if (state.currentRound) {
                    const isParticipant =
                        state.playerName === state.currentRound.perguntador ||
                        state.playerName === state.currentRound.respondedor;
                    if (isParticipant) {
                        Game.ui.displayRoundStart();
                        if (state.currentRound.pergunta) {
                            Game.ui.displayQuestion(state.currentRound.pergunta);
                        }
                    } else {
                        Game.ui.displaySpectatorView(state.currentRound.perguntador, state.currentRound.respondedor);
                    }
                }
            }
            Game.saveState();
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
            state.currentRound = {
                evento: msg.evento,
                perguntador: msg.perguntador,
                respondedor: msg.respondedor,
                pergunta: null,
                respondeu: false
            };
            if (state.playerName === msg.perguntador || state.playerName === msg.respondedor) {
                Game.ui.displayRoundStart();
            } else {
                Game.ui.displaySpectatorView(msg.perguntador, msg.respondedor);
            }
            break;

        case 'round-ended':
            Game.ui.showRoundEndedMessage();
            break;

        // Fase D: host pausou a partida por falta de jogadores conectados
        // (ver turnEngine.pickNewPair()). Retoma sozinha com um novo
        // 'round-start' quando alguém reconectar.
        case 'partida-pausada':
            state.currentRound = null;
            Game.ui.showPartidaPausadaMessage();
            break;

        case 'question':
            if (!state.isHost) {
                state.currentRound.pergunta = msg;
            }
            state.currentRound.respondeu = false;
            Game.ui.displayQuestion(msg);
            break;

        case 'answer':
            if (state.isHost &&
                state.currentRound &&
                !state.currentRound.respondeu &&
                msg.playerName === state.currentRound.respondedor &&
                isSenderVerified(msg.playerName, fromPeerId)) {
                Game.core.handleAnswer(msg);
            }
            break;

        case 'kpi-update':
            Game.core.updatePlayerKPI(msg);
            break;

        case 'timer-update':
            state.timer = msg.remaining;
            Game.ui.updateTimerDisplay();
            break;

        // --- EVENTO ---
        case 'show-evento':
            if (msg.players) {
                state.players = msg.players;
            }
            Game.ui.showEventoModal(msg.evento);
            Game.ui.syncPlayerViews(Game.getPlayerByName(state.playerName));
            break;

        // --- ASSESSORIA ---
        case 'assessoria-request':
            if (state.isHost && isSenderVerified(msg.requesterName, fromPeerId)) {
                Game.core.handleAssessoriaRequest(msg);
            }
            break;

        case 'assessoria-started':
            Game.ui.showAssessoriaStarted(msg);
            break;

        case 'assessoria-question':
            Game.ui.showAssessoriaQuestionModal(msg);
            break;

        case 'assessoria-answer':
            if (state.isHost) {
                const assessorName = state.currentRound?.assessoria?.assessorName;
                if (assessorName && isSenderVerified(assessorName, fromPeerId)) {
                    Game.core.handleAssessoriaAnswer(msg);
                } else {
                    console.warn('⚠️ Resposta de assessoria rejeitada: remetente não é o assessor designado da rodada.');
                }
            }
            break;

        case 'assessoria-result':
            Game.ui.showAssessoriaResult(msg);
            break;

        // --- PEDIDO DE AJUDA (ex-VENDA — Fase 9, ver ARCHITECTURE.md) ---
        case 'ajuda-request':
            if (state.isHost && isSenderVerified(msg.requesterName, fromPeerId)) {
                Game.core.handleAjudaRequest(msg);
            }
            break;

        case 'ajuda-tentando':
            Game.ui.showAjudaTentando(msg);
            break;

        case 'ajuda-oferta':
            Game.ui.showAjudaOfertaModal(msg);
            break;

        case 'ajuda-oferta-response':
            if (state.isHost && isSenderVerified(msg.candidatoName, fromPeerId)) {
                Game.core.handleAjudaOfertaResponse(msg);
            }
            break;

        case 'ajuda-sem-candidatos':
            Game.ui.showAjudaSemCandidatos(msg);
            break;

        case 'ajuda-confirmada':
            const doador = Game.getPlayerByName(msg.doador);
            const requester = Game.getPlayerByName(msg.requester);
            if (doador) {
                doador.kpi = msg.doadorKPI;
                doador.recursos = msg.doadorRecursos;
            }
            if (requester) {
                requester.kpi = msg.requesterKPI;
                requester.recursos = msg.requesterRecursos;
            }
            Game.ui.syncPlayerViews(Game.getPlayerByName(state.playerName));
            if (state.playerName === msg.requester) {
                Game.ui.fecharPedirAjudaModal();
            }
            console.log('🆘 Ajuda confirmada:', msg.doador, '→', msg.requester);
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
function rejeitarEntrada(fromPeerId, reason) {
    const c = Game.network.connectionState.getConnection(fromPeerId);
    if (c && c.open) {
        c.send({ type: 'join-rejected', reason });
    }
    setTimeout(() => { if (c) c.close(); }, 300);
}

/**
 * Adiciona um jogador à sala (host). Verifica duplicidade de nome e limite.
 *
 * Fase D: com a partida em andamento, a sala fica travada — só entra
 * quem já está na lista (reconexão). A checagem de "sala cheia" só vale
 * para nome novo: um jogador desconectado continua ocupando a vaga dele
 * e precisa conseguir voltar mesmo com a sala lotada.
 */
function addPlayer(msg, fromPeerId) {
    const state = Game.state;
    const cs = Game.network.connectionState;

    const existingIdx = state.players.findIndex(p => p.name === msg.playerName);
    if (existingIdx >= 0) {
        const existingPlayer = state.players[existingIdx];
        const oldConn = cs.getConnection(existingPlayer.peerId);
        const oldPeerStillConnected = oldConn && oldConn.open && existingPlayer.peerId !== fromPeerId;

        if (oldPeerStillConnected) {
            rejeitarEntrada(fromPeerId, 'name-taken');
            return;
        }

        state.players[existingIdx].peerId = fromPeerId;
        state.players[existingIdx].disconnected = false;
        console.log('🔄 Reconectado:', msg.playerName);
    } else {
        if (state.gameStarted) {
            console.warn('🔒 Entrada recusada: partida em andamento, "' + msg.playerName + '" não fazia parte dela.');
            rejeitarEntrada(fromPeerId, 'room-locked');
            return;
        }

        if (state.players.length >= CONFIG.JOGO.MAX_PLAYERS) {
            rejeitarEntrada(fromPeerId, 'room-full');
            return;
        }

        state.players.push({
            name: msg.playerName,
            peerId: fromPeerId,
            kpi: 0,
            phase: CONFIG.FASES[0].id,
            activities: 0,
            isHost: false,
            waitingInLobby: false,
            recursos: CONFIG.RECURSOS_INICIAIS
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
        if (currentRoundForSync && currentRoundForSync.pergunta) {
            const isPerguntadorDaRodada = msg.playerName === currentRoundForSync.perguntador;
            if (!isPerguntadorDaRodada) {
                currentRoundForSync = {
                    ...currentRoundForSync,
                    pergunta: { ...currentRoundForSync.pergunta, correct: undefined }
                };
            }
        }

        conn.send({
            type: 'state-sync',
            fullState: {
                players: state.players,
                baralhos: state.baralhos,
                timer: state.timer,
                currentRound: currentRoundForSync,
                gameStarted: state.gameStarted,
                hostVersion: state.hostVersion
            }
        });
    }

    // Fase D: se a partida estava pausada por falta de jogadores
    // conectados, a volta deste jogador pode ser o que faltava. Fica
    // depois do state-sync para o guest já estar com o estado em dia
    // quando o 'round-start' chegar.
    if (state.gameStarted && !state.gameOver && state.partidaPausada &&
        Game.getActivePlayers().length >= CONFIG.JOGO.MIN_PLAYERS) {
        Game.core.retomarPartidaPausada();
    }

    Game.saveState();
}

/**
 * Host: trata a queda de conexão de um guest (chamada pelo 'close' da
 * conexão em peerService.js).
 *
 * Fase D: fora de partida (lobby ou fim de jogo), remove o jogador como
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
 * Restaura o estado completo vindo do host (usado após reconexão).
 */
function restoreState(fullState) {
    const state = Game.state;
    state.players = fullState.players;
    state.baralhos = fullState.baralhos;
    state.timer = fullState.timer;
    state.currentRound = fullState.currentRound;
    state.gameStarted = fullState.gameStarted;
    if (fullState.hostVersion !== undefined) state.hostVersion = fullState.hostVersion;

    if (state.gameStarted) {
        Game.ui.showScreen('game');
        Game.ui.updateTimerDisplay();
        Game.ui.syncPlayerViews(Game.getPlayerByName(state.playerName));

        if (state.currentRound) {
            const isParticipant =
                state.playerName === state.currentRound.perguntador ||
                state.playerName === state.currentRound.respondedor;
            if (isParticipant) {
                Game.ui.displayRoundStart();
                if (state.currentRound.pergunta) {
                    Game.ui.displayQuestion(state.currentRound.pergunta);
                }
            } else {
                Game.ui.displaySpectatorView(state.currentRound.perguntador, state.currentRound.respondedor);
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