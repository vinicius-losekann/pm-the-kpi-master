// ============================================
// PM: The KPI Master - Network: Peer Service
// ============================================
// Camada PeerJS pura: inicialização, conexões, envio de mensagens.
// Não interpreta o CONTEÚDO das mensagens (isso é messageHandler.js)
// nem decide sobre migração de host (isso é hostMigration.js).
// Fase 4.1 do roadmap.
// ============================================

// ============================================
// INICIALIZAÇÃO PEERJS
// ============================================

/**
 * Cria uma instância PeerJS. Se for host, usa um ID fixo; se for guest, gera um ID aleatório.
 */
async function initPeer() {
    return new Promise((resolve, reject) => {
        const state = Game.state;
        const cs = Game.network.connectionState;
        const peerId = state.isHost ? state.hostPeerId : undefined;

        const oldPeer = cs.getPeer();
        if (oldPeer && !oldPeer.destroyed) {
            try { oldPeer.destroy(); } catch (e) { /* ignora */ }
        }

        const peer = new Peer(peerId, { debug: 0 });
        cs.setPeer(peer);

        peer.on('open', (id) => {
            state.peerId = id;
            if (state.isHost) {
                state.hostPeerId = id;
                document.getElementById('roomPeerId').textContent = id;
            }
            console.log('🔗 Peer aberto:', id);
            Game.ui.updateConnectionStatus('connected', Game.i18n.t('connection.conectado'));

            if (!state.isHost) {
                connectToHost();
            }
            resolve();
        });

        peer.on('connection', (conn) => handleConnection(conn));

        peer.on('error', (err) => {
            console.error('❌ PeerJS Error:', err);
            Game.ui.updateConnectionStatus('error', Game.i18n.t('connection.erro'));
            try { peer.destroy(); } catch (e) { /* ignora */ }
            reject(err);
        });

        peer.on('disconnected', () => {
            Game.ui.updateConnectionStatus('disconnected', Game.i18n.t('connection.desconectado'));
            setTimeout(() => {
                const current = cs.getPeer();
                if (current && !current.destroyed) current.reconnect();
            }, 3000);
        });
    });
}

// ============================================
// CONEXÕES
// ============================================

/**
 * Conecta-se ao host (usado por guests).
 */
function connectToHost() {
    const cs = Game.network.connectionState;
    const conn = cs.getPeer().connect(Game.state.hostPeerId, { reliable: true });
    handleConnection(conn);
}

/**
 * Configura os eventos de uma conexão (data, close, error).
 */
function handleConnection(conn) {
    const state = Game.state;
    const cs = Game.network.connectionState;

    conn.on('open', () => {
        cs.setConnection(conn.peer, conn);
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
        // Fase D: se esta própria página está fechando/recarregando, o
        // 'close' é consequência da saída (ver encerrarConexoesAoSair()),
        // não de alguém ter caído — não mexe no estado do jogo. Sem isso,
        // um F5 do host marcaria todos os guests como desconectados e
        // abortaria a rodada durante o próprio reload.
        if (paginaEncerrando) return;

        console.warn('⚠️ Conexão fechada:', conn.peer);
        cs.removeConnection(conn.peer);

        if (!state.isHost && conn.peer === state.hostPeerId) {
            Game.network.handleHostDisconnect();
        }

        if (state.isHost) {
            Game.network.handlePlayerDisconnect(conn.peer);
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
    const cs = Game.network.connectionState;
    const conn = cs.getConnection(Game.state.hostPeerId);
    if (conn && conn.open) conn.send(data);
}

function broadcast(data, exclude = []) {
    const cs = Game.network.connectionState;
    for (const [peerId, conn] of Object.entries(cs.getConnections())) {
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
    const cs = Game.network.connectionState;
    const conn = cs.getConnection(peerId);
    if (conn && conn.open) conn.send(data);
}

/**
 * Limpa conexões e estado local (ao sair da sessão).
 */
function cleanup() {
    const cs = Game.network.connectionState;
    clearInterval(Game.state.timerInterval);
    const peer = cs.getPeer();
    if (peer && !peer.destroyed) peer.destroy();
    Game.persistence.clearSavedState();
}

// ============================================
// SAÍDA DA PÁGINA (Fase D)
// ============================================

// Fica true a partir do momento em que a página começa a fechar ou
// recarregar. Daí em diante, os 'close' das conexões são consequência
// da própria saída e são ignorados em handleConnection().
let paginaEncerrando = false;

/**
 * Fase D: ao fechar a aba, recarregar (F5) ou navegar para fora, encerra
 * as conexões explicitamente para que o OUTRO lado receba o 'close' na
 * hora — sem isso, o PeerJS só percebe a queda quando a conexão WebRTC
 * dá timeout (de 30s a mais de 1 min, às vezes nunca).
 *
 * Diferente de cleanup(), NÃO apaga o estado salvo: um F5 continua
 * restaurando a partida normalmente.
 */
function encerrarConexoesAoSair() {
    if (paginaEncerrando) return;
    paginaEncerrando = true;

    const cs = Game.network.connectionState;
    Object.values(cs.getConnections()).forEach(c => {
        try { c.close(); } catch (e) { /* ignora */ }
    });

    const peer = cs.getPeer();
    if (peer && !peer.destroyed) {
        try { peer.destroy(); } catch (e) { /* ignora */ }
    }
}

// 'pagehide' cobre o celular (Safari/iOS nem sempre dispara
// 'beforeunload'); 'beforeunload' cobre os navegadores de desktop. A
// função só age na primeira chamada, então rodar pelos dois não tem
// efeito duplicado.
window.addEventListener('pagehide', encerrarConexoesAoSair);
window.addEventListener('beforeunload', encerrarConexoesAoSair);

// Se o navegador guardou a página no cache de voltar/avançar (bfcache) e
// o usuário voltar para ela, as conexões já foram encerradas acima — a
// página é recarregada para reconectar do zero (o estado salvo é
// restaurado normalmente).
window.addEventListener('pageshow', (e) => {
    if (e.persisted) window.location.reload();
});

// ============================================
// EXPORTAÇÃO
// ============================================
window.Game = window.Game || {};
window.Game.network = window.Game.network || {};
Object.assign(window.Game.network, {
    initPeer,
    connectToHost,
    handleConnection,
    sendToHost,
    broadcast,
    broadcastAll,
    sendToPlayer,
    cleanup,
    encerrarConexoesAoSair
});