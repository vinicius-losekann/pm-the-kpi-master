// ============================================
// PM: The KPI Master - Network: Peer Service
// ============================================
// Camada PeerJS pura: inicialização, conexões, envio de mensagens.
// Não interpreta o CONTEÚDO das mensagens (isso é messageHandler.js)
// nem decide sobre migração de host (isso é hostMigration.js).
// ============================================

// Versão do formato das mensagens de rede. Vai no player-join e o host
// recusa quem chega com outra (ver addPlayer() em messageHandler.js):
// logo depois de um deploy, quem deu F5 roda o código novo e os outros,
// o antigo — com nomes de campo diferentes, a partida travaria sem
// aviso. Aumentar ao mudar o nome ou o formato de um campo de mensagem.
const PROTOCOL_VERSION = 6;

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

        const peer = new Peer(peerId, { ...CONFIG.PEER });
        cs.setPeer(peer);

        // Fica true depois do 'open' — a partir daí o peer já está
        // em uso (conexões, migração de host) e erros não o destroem mais.
        let peerOpened = false;

        peer.on('open', (id) => {
            peerOpened = true;
            state.peerId = id;
            if (state.isHost) {
                state.hostPeerId = id;
                document.getElementById('roomPeerId').textContent = id;
            }
            console.log('🔗 Peer aberto:', id);
            Game.ui.updateConnectionStatus('connected', Game.i18n.t('connection.connected'));

            if (!state.isHost) {
                connectToHost();
            }
            resolve();
        });

        peer.on('connection', (conn) => handleConnection(conn));

        peer.on('error', (err) => {
            // Destruir o peer e rejeitar só faz sentido ANTES do
            // 'open' — é o que permite ao initPeerWithRetry() (main.js)
            // tentar de novo (ex: ID do host ainda ocupado após um F5).
            // Depois do 'open' a promessa já foi resolvida (o reject não
            // tem efeito) e destruir o peer mataria a reconexão: o erro
            // mais comum aqui é 'peer-unavailable', que só quer dizer "o
            // ID procurado não está online" — esperado durante as
            // tentativas de reconexão e de migração de host
            // (hostMigration.js), que tratam a falha sozinhas.
            if (peerOpened) {
                if (err && err.type === 'peer-unavailable') {
                    console.warn('⚠️ Peer procurado não está online:', err.message);
                    // A busca da sala (hostSearch.js) descarta
                    // na hora a versão do host que não existe.
                    Game.network.reportPeerUnavailable(err);
                } else {
                    console.error('❌ PeerJS Error:', err);
                    Game.ui.updateConnectionStatus('error', Game.i18n.t('connection.error'));
                }
                return;
            }

            console.error('❌ PeerJS Error:', err);
            Game.ui.updateConnectionStatus('error', Game.i18n.t('connection.error'));
            try { peer.destroy(); } catch (e) { /* ignora */ }
            reject(err);
        });

        peer.on('disconnected', () => {
            // destroy() também dispara 'disconnected' (ex: quando este
            // jogador assume como host e troca de peer, ou quando a
            // página fecha). Só faz sentido reconectar ESTE peer, se ele
            // ainda for o peer em uso e continuar desconectado do servidor
            // — senão o PeerJS lança "cannot reconnect because it is not
            // disconnected" ao tentar reconectar o peer novo.
            if (peer.destroyed || cs.getPeer() !== peer) return;
            Game.ui.updateConnectionStatus('disconnected', Game.i18n.t('connection.disconnected'));
            setTimeout(() => {
                if (cs.getPeer() === peer && !peer.destroyed && peer.disconnected) {
                    peer.reconnect();
                }
            }, 3000);
        });
    });
}

// ============================================
// CONEXÕES
// ============================================

/**
 * Conecta-se ao host (usado por guests).
 *
 * Procura a sala a partir da versão de host conhecida (0 para
 * quem entra agora; a salva, para quem volta com a sessão restaurada)
 * e nas seguintes — depois de uma migração de host, a sala não está
 * mais no ID base (ver network/hostSearch.js). Achou: passa a usar
 * aquela versão e envia o player-join.
 */
function connectToHost() {
    const state = Game.state;
    const cs = Game.network.connectionState;

    Game.network.findHost(cs.getPeer(), state.baseRoomPeerId, {
        startVersion: state.hostVersion || 0,
        onFound: (conn, version, id) => {
            if (version !== state.hostVersion) {
                console.log('🔄 A sala mudou de host enquanto você estava fora — conectando a ' + id);
            }
            state.hostVersion = version;
            state.hostPeerId = id;
            cs.setConnection(id, conn);
            console.log('🔗 Conectado a:', id);

            // A conexão já abriu: o 'open' registrado em handleConnection()
            // não roda mais, então o player-join vai daqui.
            handleConnection(conn);
            sendPlayerJoin();
            Game.saveState();
        },
        onGiveUp: () => {
            console.error('❌ Sala não encontrada:', state.baseRoomPeerId);
            Game.ui.updateConnectionStatus('error', Game.i18n.t('connection.couldNotConnect'));
        }
    });
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
            sendPlayerJoin();
        }
    });

    conn.on('data', (data) => {
        Game.network.handleMessage(data, conn.peer);
    });

    conn.on('close', () => {
        // Se esta própria página está fechando/recarregando, o
        // 'close' é consequência da saída (ver closeConnectionsOnExit()),
        // não de alguém ter caído — não mexe no estado do jogo. Sem isso,
        // um F5 do host marcaria todos os guests como desconectados e
        // abortaria a rodada durante o próprio reload.
        if (pageClosing) return;

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

/**
 * Guest: apresenta-se ao host. Usado na primeira conexão (acima) e nas
 * reconexões de hostMigration.js — um lugar só para montar a mensagem.
 *
 * Leva o token de identidade deste navegador para a sala
 * (ver utils/identity.js). O host guarda só o hash e o confere quando
 * alguém tenta voltar com o nome de um jogador desconectado. Leva
 * também a versão do formato das mensagens (PROTOCOL_VERSION).
 */
function sendPlayerJoin() {
    const state = Game.state;
    Game.network.sendToHost({
        type: 'player-join',
        playerName: state.playerName,
        peerId: state.peerId,
        token: Game.identity.getRoomToken(state.baseRoomPeerId),
        protocolVersion: PROTOCOL_VERSION
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
// SAÍDA DA PÁGINA
// ============================================

// Fica true a partir do momento em que a página começa a fechar ou
// recarregar. Daí em diante, os 'close' das conexões são consequência
// da própria saída e são ignorados em handleConnection().
let pageClosing = false;

/**
 * Ao fechar a aba, recarregar (F5) ou navegar para fora, encerra
 * as conexões explicitamente para que o OUTRO lado receba o 'close' na
 * hora — sem isso, o PeerJS só percebe a queda quando a conexão WebRTC
 * dá timeout (de 30s a mais de 1 min, às vezes nunca).
 *
 * Diferente de cleanup(), NÃO apaga o estado salvo: um F5 continua
 * restaurando a partida normalmente.
 */
function closeConnectionsOnExit() {
    if (pageClosing) return;
    pageClosing = true;

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
window.addEventListener('pagehide', closeConnectionsOnExit);
window.addEventListener('beforeunload', closeConnectionsOnExit);

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
    sendPlayerJoin,
    sendToHost,
    broadcast,
    broadcastAll,
    sendToPlayer,
    cleanup,
    closeConnectionsOnExit,
    PROTOCOL_VERSION
});