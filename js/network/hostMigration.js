// ============================================
// PM: The KPI Master - Network: Host Migration
// ============================================
// Lida com a perda de conexão com o host: primeiro tenta reconectar
// ao MESMO host (pode ter sido só um F5 dele), e só se isso falhar
// assume que houve migração de host de verdade (versão incrementada).
// Fase 4.3 do roadmap.
//
// 🐛 BUG-002 (ver ISSUES.md): a versão original ia direto para a
// lógica de "migração" (assumir nova versão do host / virar host)
// sempre que a conexão caía — mesmo quando era só um F5 do host com
// o MESMO ID. Isso fazia o guest (backup) virar host indevidamente.
// A correção adiciona attemptReconnectToSameHost() como primeira
// tentativa, antes de cair no fluxo de migração original.
// ============================================

/**
 * Lida com a desconexão do host. Primeiro tenta reconectar ao mesmo
 * host (versão atual); só depois de esgotar as tentativas é que
 * presume migração de host.
 */
function handleHostDisconnect() {
    console.warn('⚠️ Host desconectado! Aguardando...');
    Game.ui.updateConnectionStatus('error', Game.i18n.t('connection.hostDesconectado'));

    setTimeout(() => {
        if (Game.state.isHost) return;
        attemptReconnectToSameHost();
    }, CONFIG.JOGO.HOST_TIMEOUT);
}

// ============================================
// RECONEXÃO AO MESMO HOST (correção do BUG-002)
// ============================================

/**
 * Tenta reconectar ao host na versão ATUAL (mesmo ID de sempre).
 * Cobre o caso mais comum: o host só deu F5, sem migração nenhuma.
 */
function attemptReconnectToSameHost(attempt = 1) {
    const state = Game.state;
    if (state.isHost) return;

    const MAX_ATTEMPTS = 3;
    const currentHostId = Game.computeHostPeerId(state.baseRoomPeerId, state.hostVersion);

    console.log(`🔁 Tentativa ${attempt}/${MAX_ATTEMPTS}: reconectando ao host atual (${currentHostId})...`);
    Game.ui.updateConnectionStatus('disconnected', Game.i18n.t('connection.reconectandoHost', { attempt, max: MAX_ATTEMPTS }));

    let settled = false;
    const cs = Game.network.connectionState;
    const conn = cs.getPeer().connect(currentHostId, { reliable: true });

    conn.on('open', () => {
        if (settled) return;
        settled = true;

        cs.setConnection(currentHostId, conn);
        console.log('✅ Reconectado ao mesmo host (sem migração):', currentHostId);
        Game.ui.updateConnectionStatus('connected', Game.i18n.t('connection.reconectado'));

        Game.network.handleConnection(conn);
        Game.network.sendToHost({ type: 'player-join', playerName: state.playerName, peerId: state.peerId });
        Game.saveState();
    });

    conn.on('error', () => {
        if (settled) return;
        settled = true;
        retryReconnectSameHostOrMigrate(attempt, MAX_ATTEMPTS);
    });

    setTimeout(() => {
        if (settled) return;
        settled = true;
        try { conn.close(); } catch (e) { /* ignora */ }
        retryReconnectSameHostOrMigrate(attempt, MAX_ATTEMPTS);
    }, 4000);
}

function retryReconnectSameHostOrMigrate(attempt, maxAttempts) {
    if (Game.state.isHost) return;

    if (attempt < maxAttempts) {
        setTimeout(() => attemptReconnectToSameHost(attempt + 1), 2000);
        return;
    }

    console.warn('⚠️ Não foi possível reconectar ao host original. Presumindo migração de host...');
    decideHostTakeoverOrReconnectNewVersion();
}

/**
 * Só chamada depois que attemptReconnectToSameHost() esgotou as tentativas.
 * Decide se este jogador é o backup (assume como host) ou tenta localizar
 * um novo host em uma versão de ID incrementada.
 */
function decideHostTakeoverOrReconnectNewVersion() {
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
        attemptReconnectToNewHost();
    }
}

// ============================================
// MIGRAÇÃO DE HOST DE VERDADE (versão incrementada)
// ============================================

/**
 * Tenta se conectar a uma nova versão do host (calculada deterministicamente).
 * Só é chamada depois que a reconexão ao host atual falhou de verdade.
 */
function attemptReconnectToNewHost(attempt = 1) {
    const state = Game.state;
    if (state.isHost) return;

    const MAX_ATTEMPTS = 5;
    const nextVersion = state.hostVersion + 1;
    const candidateId = Game.computeHostPeerId(state.baseRoomPeerId, nextVersion);

    console.log(`🔁 Tentativa ${attempt}/${MAX_ATTEMPTS}: procurando novo host em ${candidateId}...`);
    Game.ui.updateConnectionStatus('disconnected', Game.i18n.t('connection.procurandoNovoHost', { attempt, max: MAX_ATTEMPTS }));

    let settled = false;
    const cs = Game.network.connectionState;
    const conn = cs.getPeer().connect(candidateId, { reliable: true });

    conn.on('open', () => {
        if (settled) return;
        settled = true;

        state.hostVersion = nextVersion;
        state.hostPeerId = candidateId;
        cs.setConnection(candidateId, conn);

        console.log('✅ Reconectado ao novo host:', candidateId);
        Game.ui.updateConnectionStatus('connected', Game.i18n.t('connection.reconectado'));

        Game.network.handleConnection(conn);
        Game.network.sendToHost({ type: 'player-join', playerName: state.playerName, peerId: state.peerId });
        Game.saveState();
    });

    conn.on('error', () => {
        if (settled) return;
        settled = true;
        retryOrGiveUp(attempt, MAX_ATTEMPTS);
    });

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
        Game.ui.updateConnectionStatus('error', Game.i18n.t('connection.naoFoiPossivelReconectar'));
        return;
    }

    setTimeout(() => attemptReconnectToNewHost(attempt + 1), 2000);
}

/**
 * Torna-se o novo host (executado pelo backup).
 */
function becomeHost() {
    const state = Game.state;
    const cs = Game.network.connectionState;

    const newVersion = state.hostVersion + 1;
    const newHostId = Game.computeHostPeerId(state.baseRoomPeerId, newVersion);

    state.isHost = true;
    state.hostPeerId = newHostId;
    state.hostVersion = newVersion;

    const oldPeer = cs.getPeer();
    if (oldPeer && !oldPeer.destroyed) oldPeer.destroy();
    cs.resetConnections();

    const newPeer = new Peer(newHostId, { debug: 0 });
    cs.setPeer(newPeer);

    newPeer.on('open', (id) => {
        state.peerId = id;

        state.players = state.players.filter(p =>
            p.name === state.playerName || !p.isHost
        );

        const me = Game.getPlayerByName(state.playerName);
        if (me) { me.isHost = true; me.peerId = id; }

        const proximoBackup = state.players.find(p => p.name !== state.playerName);
        state.backupPeerId = proximoBackup ? proximoBackup.peerId : '';

        Game.network.broadcastAll({ type: 'host-changed', newHostPeerId: id, hostVersion: newVersion, players: state.players });

        Game.ui.setupUI();

        if (state.gameStarted && !state.gameOver) {
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
                Game.core.armarRespostaTimeout(state.currentRound.respondedor);
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

    newPeer.on('connection', (conn) => Game.network.handleConnection(conn));

    newPeer.on('error', (err) => {
        console.error('❌ Erro ao assumir como host:', err);
        Game.ui.updateConnectionStatus('error', Game.i18n.t('connection.falhaAssumirHost'));
    });
}

/**
 * Reconecta a um novo host (usado após receber host-changed).
 */
function reconnectToNewHost(newHostPeerId) {
    const cs = Game.network.connectionState;
    Game.state.hostPeerId = newHostPeerId;
    Object.values(cs.getConnections()).forEach(c => c.close());
    cs.resetConnections();
    const conn = cs.getPeer().connect(newHostPeerId, { reliable: true });
    Game.network.handleConnection(conn);
}

// ============================================
// EXPORTAÇÃO
// ============================================
window.Game = window.Game || {};
window.Game.network = window.Game.network || {};
Object.assign(window.Game.network, {
    handleHostDisconnect,
    attemptReconnectToSameHost,
    attemptReconnectToNewHost,
    retryOrGiveUp,
    becomeHost,
    reconnectToNewHost
});