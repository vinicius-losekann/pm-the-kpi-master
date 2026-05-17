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
            if (!state.isHost) reconnectToNewHost(msg.newHostPeerId);
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
            Game.ui.displayRoundStart();
            break;

        case 'question':
            state.currentRound.pergunta = msg;
            state.currentRound.respondeu = false;
            Game.ui.displayQuestion(msg);
            break;

        case 'answer':
            if (state.isHost && !state.currentRound.respondeu) {
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

        // --- EVENTO (V2) ---
        case 'show-evento':
            Game.ui.showEventoModal(msg.evento);
            // 🔧 Atualiza UI do guest após evento
            Game.ui.updatePlayersOnlineList();
            Game.ui.updateRankingList();
            const me = Game.getPlayerByName(state.playerName);
            if (me) {
                document.getElementById('myRecursos').textContent = me.recursos;
                document.getElementById('myKPI').textContent = me.kpi;
            }
            break;

        // --- VENDA (V3) ---
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
        if (c) c.close();
        return;
    }

    const existing = state.players.findIndex(p => p.name === msg.playerName);
    if (existing >= 0) {
        state.players[existing].peerId = fromPeerId;
        console.log('🔄 Reconectado:', msg.playerName);
    } else {
        state.players.push({
            name: msg.playerName,
            peerId: fromPeerId,
            kpi: 0,
            phase: CONFIG.FASES[0].id,
            activities: 0,
            isHost: false,
            waitingInLobby: false
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
                gameStarted: state.gameStarted
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

    if (state.gameStarted && state.currentRound) {
        Game.ui.displayRoundStart();
        if (state.currentRound.pergunta) {
            Game.ui.displayQuestion(state.currentRound.pergunta);
        }
    }

    Game.ui.updatePlayersList();
    Game.ui.updateTimerDisplay();
    Game.saveState();
}

function handleHostDisconnect() {
    console.warn('⚠️ Host desconectado! Aguardando...');

    setTimeout(() => {
        if (Game.state.isHost) return;

        const sorted = [...Game.state.players].sort((a, b) => {
            if (a.isHost) return -1;
            if (b.isHost) return 1;
            return 0;
        });

        const me = sorted.find(p => p.name === Game.state.playerName);
        const myIndex = sorted.indexOf(me);

        if (myIndex === 1 || (myIndex === 0 && !sorted[0]?.isHost)) {
            console.log('👑 Assumindo como novo host!');
            becomeHost();
        }
    }, 5000);
}

function becomeHost() {
    const state = Game.state;
    const newHostId = state.hostPeerId + '-v2';
    state.isHost = true;
    state.hostPeerId = newHostId;

    if (myPeer && !myPeer.destroyed) myPeer.destroy();
    connections = {};

    myPeer = new Peer(newHostId, { debug: 0 });

    myPeer.on('open', (id) => {
        state.peerId = id;
        state.players = state.players.filter(p => p.name !== state.playerName || !p.isHost);

        const me = Game.getPlayerByName(state.playerName);
        if (me) me.isHost = true;
        state.backupPeerId = state.players.length > 1 ? state.players[1]?.peerId : '';

        broadcastAll({ type: 'host-changed', newHostPeerId: id, players: state.players });

        Game.ui.setupUI();
        Game.ui.showLobbyNormal();
        Game.ui.updatePlayersList();
        Game.ui.checkStartCondition();

        document.getElementById('roomPeerId').textContent = id;
        document.getElementById('hostRoomIdSection').style.display = 'block';
        alert('👑 Você agora é o host!');
        Game.saveState();
    });

    myPeer.on('connection', (conn) => handleConnection(conn));
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
    removePlayerByPeerId,
    becomeHost,
    reconnectToNewHost,
    broadcastAll,
    sendToPlayer,
    sendToHost,
    cleanup
};