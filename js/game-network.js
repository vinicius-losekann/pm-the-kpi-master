// ============================================
// PM: The KPI Master - REDE (PeerJS)
// ============================================
// Responsabilidades:
//   - Inicializar e gerenciar conexão PeerJS
//   - Enviar/receber mensagens entre jogadores
//   - Broadcast, unicast, reconexão
//   - Host migration (queda involuntária)
//   - Atualização de UI para guests (eventos, vendas)
//
// Dependências:
//   - PeerJS (CDN carregado no HTML)
//   - Game.state (game-state.js)
//   - Game (game-core.js) para handleAnswer, etc
//   - Game (game-ui.js) para atualizar UI
//
// Namespace: Game.network
// ============================================

let myPeer = null;           // Instância PeerJS
let connections = {};        // peerId -> DataConnection

// ============================================
// INICIALIZAÇÃO PEERJS
// ============================================

async function initPeer() {
    return new Promise((resolve, reject) => {
        const state = Game.state;
        const peerId = state.isHost ? state.hostPeerId : undefined;

        // Se uma tentativa anterior falhou (ex: retry após F5 do host),
        // garante que não sobrou um Peer "zumbi" consumindo o ID antigo.
        if (myPeer && !myPeer.destroyed) {
            try { myPeer.destroy(); } catch (e) { /* ignora */ }
        }

        myPeer = new Peer(peerId, { debug: 0 });

        myPeer.on('open', (id) => {
            state.peerId = id;
            if (state.isHost) {
                state.hostPeerId = id;
                document.getElementById('roomPeerId').textContent = id;
            }
            console.log('🔗 Peer aberto:', id);
            Game.ui.updateConnectionStatus('connected', 'Conectado');

            if (!state.isHost) {
                connectToHost();
            }
            resolve();
        });

        myPeer.on('connection', (conn) => handleConnection(conn));

        myPeer.on('error', (err) => {
            console.error('❌ PeerJS Error:', err);
            Game.ui.updateConnectionStatus('error', 'Erro de conexão');
            try { myPeer.destroy(); } catch (e) { /* ignora */ }
            reject(err);
        });

        myPeer.on('disconnected', () => {
            Game.ui.updateConnectionStatus('disconnected', 'Desconectado');
            setTimeout(() => {
                if (myPeer && !myPeer.destroyed) myPeer.reconnect();
            }, 3000);
        });
    });
}

// ============================================
// CONEXÕES
// ============================================

function connectToHost() {
    const conn = myPeer.connect(Game.state.hostPeerId, { reliable: true });
    handleConnection(conn);
}

function handleConnection(conn) {
    const state = Game.state;

    conn.on('open', () => {
        connections[conn.peer] = conn;
        console.log('🔗 Conectado a:', conn.peer);

        if (!state.isHost) {
            sendToHost({
                type: 'player-join',
                playerName: state.playerName,
                peerId: state.peerId
            });
        }
    });

    conn.on('data', (data) => {
        Game.network.handleMessage(data, conn.peer);
    });

    conn.on('close', () => {
        console.warn('⚠️ Conexão fechada:', conn.peer);
        delete connections[conn.peer];

        if (!state.isHost && conn.peer === state.hostPeerId) {
            Game.network.handleHostDisconnect();
        }

        if (state.isHost) {
            Game.network.removePlayerByPeerId(conn.peer);
        }
    });

    conn.on('error', (err) => {
        console.error('❌ Erro na conexão:', err);
    });
}

// ============================================
// ENVIO DE MENSAGENS
// ============================================

function sendToHost(data) {
    const conn = connections[Game.state.hostPeerId];
    if (conn && conn.open) conn.send(data);
}

function broadcast(data, exclude = []) {
    for (const [peerId, conn] of Object.entries(connections)) {
        if (!exclude.includes(peerId) && conn.open) {
            conn.send(data);
        }
    }
}

function broadcastAll(data) {
    broadcast(data, []);
}

function sendToPlayer(peerId, data) {
    const state = Game.state;
    if (peerId === state.peerId && state.isHost) {
        Game.network.handleMessage(data, state.peerId);
        return;
    }
    const conn = connections[peerId];
    if (conn && conn.open) conn.send(data);
}

// ============================================
// RECEBIMENTO DE MENSAGENS
// ============================================

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
            const motivo = msg.reason === 'room-full'
                ? '⚠️ Sala cheia (máximo de ' + CONFIG.JOGO.MAX_PLAYERS + ' jogadores).'
                : '⚠️ Esse nome já está em uso nesta sala. Escolha outro nome e entre novamente.';
            alert(motivo);
            window.location.href = 'index.html';
            break;

        case 'player-list':
            state.players = msg.players;
            Game.ui.updatePlayersList();
            break;

        case 'state-sync':
            restoreState(msg.fullState);
            break;

        // --- SESSÃO ---
        case 'session-ended':
            alert('⛔ O host encerrou a sessão.');
            Game.network.cleanup();
            window.location.href = 'index.html';
            break;

        case 'host-changed':
            state.hostPeerId = msg.newHostPeerId;
            if (msg.hostVersion !== undefined) state.hostVersion = msg.hostVersion;
            if (msg.players) state.players = msg.players;
            if (!state.isHost) reconnectToNewHost(msg.newHostPeerId);
            // Retoma a visualização correta caso a partida já esteja em andamento
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
            // Só quem participa da rodada vê a tela de pergunta;
            // os demais (espectadores) veem a tela de espera.
            if (state.playerName === msg.perguntador || state.playerName === msg.respondedor) {
                Game.ui.displayRoundStart();
            } else {
                Game.ui.displaySpectatorView(msg.perguntador, msg.respondedor);
            }
            break;

        case 'question':
            state.currentRound.pergunta = msg;
            state.currentRound.respondeu = false;
            Game.ui.displayQuestion(msg);
            break;

        case 'answer':
            if (
                state.isHost &&
                !state.currentRound.respondeu &&
                msg.playerName === state.currentRound.respondedor
            ) {
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
            Game.ui.updatePlayersOnlineList();
            Game.ui.updateRankingList();

            const me = Game.getPlayerByName(state.playerName);
            if (me) {
                document.getElementById('myRecursos').textContent = me.recursos;
                document.getElementById('myKPI').textContent = me.kpi;
            }
            break;

        case 'assessoria-request':
            if (state.isHost) Game.core.handleAssessoriaRequest(msg);
            break;

        case 'assessoria-started':
            Game.ui.showAssessoriaStarted(msg);
            break;

        case 'assessoria-question':
            Game.ui.showAssessoriaQuestionModal(msg);
            break;

        case 'assessoria-answer':
            if (state.isHost) Game.core.handleAssessoriaAnswer(msg);
            break;

        case 'assessoria-result':
            Game.ui.showAssessoriaResult(msg);
            break;

        // --- VENDA ---
        /*case 'venda-confirmed':
            const vendedor = Game.getPlayerByName(msg.vendedor);
            const comprador = Game.getPlayerByName(msg.comprador);
            if (vendedor) {
                vendedor.kpi = msg.vendedorKPI;
                vendedor.recursos = msg.vendedorRecursos;
            }
            if (comprador) {
                comprador.kpi = msg.compradorKPI;
                comprador.recursos = msg.compradorRecursos;
            }
            Game.ui.updatePlayersOnlineList();
            Game.ui.updateRankingList();
            // 🔧 Atualiza UI do próprio jogador se envolvido na venda
            const me2 = Game.getPlayerByName(state.playerName);
            if (me2) {
                document.getElementById('myRecursos').textContent = me2.recursos;
                document.getElementById('myKPI').textContent = me2.kpi;
            }
            console.log('💰 Venda confirmada:', msg.vendedor, '→', msg.comprador);
            break;*/
        // --- VENDA ---
        case 'venda-request':
            if (state.isHost) {
                Game.core.processVenda(msg.vendedorName, msg.compradorName);
            }
            break;

        case 'venda-rejected':
            alert('⚠️ ' + msg.motivo);
            Game.ui.fecharVendaModal();
            break;

        case 'venda-confirmed':
            const vendedor = Game.getPlayerByName(msg.vendedor);
            const comprador = Game.getPlayerByName(msg.comprador);
            if (vendedor) {
                vendedor.kpi = msg.vendedorKPI;
                vendedor.recursos = msg.vendedorRecursos;
            }
            if (comprador) {
                comprador.kpi = msg.compradorKPI;
                comprador.recursos = msg.compradorRecursos;
            }
            Game.ui.updatePlayersOnlineList();
            Game.ui.updateRankingList();
            // 🔧 Atualiza UI do próprio jogador se envolvido na venda
            const me2 = Game.getPlayerByName(state.playerName);
            if (me2) {
                document.getElementById('myRecursos').textContent = me2.recursos;
                document.getElementById('myKPI').textContent = me2.kpi;
            }
            console.log('💰 Venda confirmada:', msg.vendedor, '→', msg.comprador);
            break;
    }
}

// ============================================
// GERENCIAR JOGADORES (HOST)
// ============================================

function addPlayer(msg, fromPeerId) {
    const state = Game.state;

    if (state.players.length >= CONFIG.JOGO.MAX_PLAYERS) {
        const c = connections[fromPeerId];
        if (c && c.open) {
            c.send({ type: 'join-rejected', reason: 'room-full' });
        }
        setTimeout(() => { if (c) c.close(); }, 300);
        return;
    }

    // Impede que dois jogadores diferentes assumam o mesmo nome.
    // Só tratamos como reconexão quando o peerId antigo NÃO está mais
    // conectado (ou seja, é de fato uma queda/retomada do mesmo jogador).
    const existingIdx = state.players.findIndex(p => p.name === msg.playerName);
    if (existingIdx >= 0) {
        const existingPlayer = state.players[existingIdx];
        const oldConn = connections[existingPlayer.peerId];
        const oldPeerStillConnected = oldConn && oldConn.open && existingPlayer.peerId !== fromPeerId;

        if (oldPeerStillConnected) {
            const c = connections[fromPeerId];
            if (c && c.open) {
                c.send({ type: 'join-rejected', reason: 'name-taken' });
            }
            setTimeout(() => { if (c) c.close(); }, 300);
            return;
        }

        state.players[existingIdx].peerId = fromPeerId;
        console.log('🔄 Reconectado:', msg.playerName);
    } else {
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

    broadcastAll({ type: 'player-list', players: state.players });
    Game.ui.updatePlayersList();
    Game.ui.checkStartCondition();

    const conn = connections[fromPeerId];
    if (conn && conn.open) {
        conn.send({
            type: 'state-sync',
            fullState: {
                players: state.players,
                baralhos: state.baralhos,
                timer: state.timer,
                currentRound: state.currentRound,
                gameStarted: state.gameStarted,
                hostVersion: state.hostVersion
            }
        });
    }

    Game.saveState();
}

function removePlayerByPeerId(peerId) {
    const state = Game.state;
    state.players = state.players.filter(p => p.peerId !== peerId);

    if (state.backupPeerId === peerId && state.players.length > 1) {
        state.backupPeerId = state.players[1]?.peerId;
    }

    broadcastAll({ type: 'player-list', players: state.players });
    Game.ui.updatePlayersList();
    Game.ui.checkStartCondition();
    Game.saveState();
}

// ============================================
// RECONEXÃO E HOST MIGRATION
// ============================================

function restoreState(fullState) {
    const state = Game.state;
    state.players = fullState.players;
    state.baralhos = fullState.baralhos;
    state.timer = fullState.timer;
    state.currentRound = fullState.currentRound;
    state.gameStarted = fullState.gameStarted;
    if (fullState.hostVersion !== undefined) state.hostVersion = fullState.hostVersion;

    if (state.gameStarted) {
        // Garante que a tela correta seja exibida após reconexão/reload,
        // e não deixa o jogador preso visualmente no lobby.
        Game.ui.showScreen('game');
        Game.ui.updateTimerDisplay();
        Game.ui.updatePlayersOnlineList();
        Game.ui.updateRankingList();

        const me = Game.getPlayerByName(state.playerName);
        if (me) {
            document.getElementById('myKPI').textContent = me.kpi;
            document.getElementById('myRecursos').textContent = me.recursos;
            const fase = Game.getFaseById(me.phase);
            document.getElementById('myPhaseName').textContent = fase.nome;
            document.getElementById('myPhaseIcon').textContent = fase.emoji;
            document.getElementById('myActivity').textContent = me.activities;
            document.getElementById('myProgressFill').style.width =
                (me.activities / CONFIG.JOGO.ACTIVITIES_PER_PHASE * 100) + '%';
        }

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

function handleHostDisconnect() {
    console.warn('⚠️ Host desconectado! Aguardando...');
    Game.ui.updateConnectionStatus('error', 'Host desconectado — tentando reconectar...');

    setTimeout(() => {
        if (Game.state.isHost) return;

        const sorted = [...Game.state.players].sort((a, b) => {
            if (a.isHost) return -1;
            if (b.isHost) return 1;
            return 0;
        });

        const me = sorted.find(p => p.name === Game.state.playerName);
        const myIndex = sorted.indexOf(me);
        const souOBackup = myIndex === 1 || (myIndex === 0 && !sorted[0]?.isHost);

        if (souOBackup) {
            console.log('👑 Assumindo como novo host!');
            becomeHost();
        } else {
            // Não sou o backup. Em vez de só esperar por uma mensagem
            // 'host-changed' que pode nunca chegar (o backup zera as
            // próprias conexões no exato momento em que faz o broadcast),
            // calculo sozinho o próximo peerId de host possível e tento
            // me conectar diretamente a ele.
            attemptReconnectToNewHost();
        }
    }, CONFIG.JOGO.HOST_TIMEOUT);
}

/**
 * Tenta se conectar diretamente ao peerId do próximo host, calculado
 * deterministicamente a partir de baseRoomPeerId + hostVersion+1.
 * Repete algumas vezes com backoff, já que o backup pode levar alguns
 * instantes para terminar de subir o próprio Peer.
 */
function attemptReconnectToNewHost(attempt = 1) {
    const state = Game.state;
    if (state.isHost) return;

    const MAX_ATTEMPTS = 5;
    const nextVersion = state.hostVersion + 1;
    const candidateId = Game.computeHostPeerId(state.baseRoomPeerId, nextVersion);

    console.log(`🔁 Tentativa ${attempt}/${MAX_ATTEMPTS}: procurando novo host em ${candidateId}...`);
    Game.ui.updateConnectionStatus('disconnected', `Procurando novo host (${attempt}/${MAX_ATTEMPTS})...`);

    let settled = false;
    const conn = myPeer.connect(candidateId, { reliable: true });

    conn.on('open', () => {
        if (settled) return;
        settled = true;

        state.hostVersion = nextVersion;
        state.hostPeerId = candidateId;
        connections[candidateId] = conn;

        console.log('✅ Reconectado ao novo host:', candidateId);
        Game.ui.updateConnectionStatus('connected', 'Reconectado');

        // handleConnection registra os handlers de data/close/error, mas seu
        // handler de 'open' não dispara mais (o evento já ocorreu), então
        // reenviamos o player-join manualmente aqui.
        handleConnection(conn);
        sendToHost({ type: 'player-join', playerName: state.playerName, peerId: state.peerId });
        Game.saveState();
    });

    conn.on('error', () => {
        if (settled) return;
        settled = true;
        retryOrGiveUp(attempt, MAX_ATTEMPTS);
    });

    // PeerJS às vezes não dispara 'error' para um peerId inexistente
    // dentro de um tempo razoável — força um timeout de segurança.
    setTimeout(() => {
        if (settled) return;
        settled = true;
        try { conn.close(); } catch (e) { /* ignora */ }
        retryOrGiveUp(attempt, MAX_ATTEMPTS);
    }, 4000);
}

function retryOrGiveUp(attempt, maxAttempts) {
    if (Game.state.isHost) return;

    if (attempt >= maxAttempts) {
        console.error('❌ Não foi possível localizar um novo host.');
        Game.ui.updateConnectionStatus('error', 'Não foi possível reconectar. Recarregue a página.');
        return;
    }

    setTimeout(() => attemptReconnectToNewHost(attempt + 1), 2000);
}

function becomeHost() {
    const state = Game.state;

    // ID determinístico: calculado a partir do peerId BASE da sala, não do
    // hostPeerId atual (que já pode ter sido migrado antes). Isso permite
    // que qualquer jogador, mesmo sem receber o broadcast abaixo, calcule
    // o mesmo ID e tente se conectar diretamente (ver attemptReconnectToNewHost).
    const newVersion = state.hostVersion + 1;
    const newHostId = Game.computeHostPeerId(state.baseRoomPeerId, newVersion);

    state.isHost = true;
    state.hostPeerId = newHostId;
    state.hostVersion = newVersion;

    if (myPeer && !myPeer.destroyed) myPeer.destroy();
    connections = {};

    myPeer = new Peer(newHostId, { debug: 0 });

    myPeer.on('open', (id) => {
        state.peerId = id;

        // Remove tanto uma possível entrada duplicada de mim mesmo quanto,
        // principalmente, o registro do host ANTIGO (que caiu e nunca sai
        // sozinho da lista) — sem isso a sala fica com dois "HOST" e o
        // ranking/contagem de jogadores ativos ficam errados para sempre.
        state.players = state.players.filter(p =>
            p.name === state.playerName || !p.isHost
        );

        const me = Game.getPlayerByName(state.playerName);
        if (me) { me.isHost = true; me.peerId = id; }

        const proximoBackup = state.players.find(p => p.name !== state.playerName);
        state.backupPeerId = proximoBackup ? proximoBackup.peerId : '';

        // Os demais jogadores ainda estão conectados ao antigo peerId do host
        // (a conexão deles caiu junto com o peer antigo). Cada guest, ao
        // perceber a queda, calcula este MESMO newHostId sozinho (via
        // attemptReconnectToNewHost) e se conecta diretamente — não depende
        // mais só deste broadcast. Ainda assim tentamos, útil se alguma
        // conexão tiver sobrevivido.
        broadcastAll({ type: 'host-changed', newHostPeerId: id, hostVersion: newVersion, players: state.players });

        Game.ui.setupUI();

        if (state.gameStarted && !state.gameOver) {
            // Retoma a partida em andamento em vez de voltar ao lobby:
            // reinicia o motor do timer local e mantém a rodada atual.
            Game.ui.showScreen('game');
            Game.ui.updatePlayersOnlineList();
            Game.ui.updateRankingList();
            Game.ui.updateTimerDisplay();

            clearInterval(state.timerInterval);
            state.timerInterval = setInterval(() => {
                state.timer--;
                Game.ui.updateTimerDisplay();
                if (state.timer % 10 === 0) {
                    Game.network.broadcastAll({ type: 'timer-update', remaining: state.timer });
                }
                if (state.timer <= 0) {
                    clearInterval(state.timerInterval);
                    Game.core.endGame(Game.core.buildRanking());
                }
            }, 1000);

            if (!state.currentRound) {
                Game.core.pickNewPair();
            } else {
                Game.ui.displayRoundStart();
                if (state.currentRound.pergunta) {
                    Game.ui.displayQuestion(state.currentRound.pergunta);
                }
            }
        } else {
            Game.ui.showLobbyNormal();
            Game.ui.updatePlayersList();
            Game.ui.checkStartCondition();
        }

        document.getElementById('roomPeerId').textContent = id;
        document.getElementById('hostRoomIdSection').style.display = 'block';
        alert('👑 Você agora é o host!');
        Game.saveState();
    });

    myPeer.on('connection', (conn) => handleConnection(conn));

    myPeer.on('error', (err) => {
        console.error('❌ Erro ao assumir como host:', err);
        Game.ui.updateConnectionStatus('error', 'Falha ao assumir a sala como host.');
        // Não há um fallback automático seguro aqui (poderia gerar dois
        // hosts concorrentes); a sessão fica marcada com erro visível para
        // o jogador decidir recarregar a página.
    });
}

function reconnectToNewHost(newHostPeerId) {
    Game.state.hostPeerId = newHostPeerId;
    Object.values(connections).forEach(c => c.close());
    connections = {};
    const conn = myPeer.connect(newHostPeerId, { reliable: true });
    handleConnection(conn);
}

function cleanup() {
    clearInterval(Game.state.timerInterval);
    if (myPeer && !myPeer.destroyed) myPeer.destroy();
    localStorage.removeItem('pmKPI_roomState');
    localStorage.removeItem('pmKPI_myData');
}

// ============================================
// EXPORTAÇÃO
// ============================================
window.Game = window.Game || {};
window.Game.network = {
    initPeer,
    handleMessage,
    handleHostDisconnect,
    attemptReconnectToNewHost,
    removePlayerByPeerId,
    becomeHost,
    reconnectToNewHost,
    broadcastAll,
    sendToPlayer,
    sendToHost,
    cleanup
};