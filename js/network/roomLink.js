// ============================================
// PM: The KPI Master - Network: Ligação do jogo ao canal da sala
// ============================================
// Liga o jogo ao canal da sala pelo Firebase (network/roomChannel.js):
// é por aqui que o resto do jogo envia (sendToHost, broadcastAll,
// sendToPlayer) e é daqui que chegam ao messageHandler.js os pedidos dos
// jogadores (host) e os avisos do host (guest), sempre por
// Game.network.handleMessage(msg, uid de quem mandou).
//
// O papel vem do banco: é host quem está no meta da sala como host. A
// identidade é o uid do login anônimo (network/firebaseLogin.js), guardado
// no campo `peerId` dos jogadores.
//
// Quem entra (ou volta) segura os avisos para todos antes de pedir para
// entrar; o state-sync do host traz até que aviso o estado já vale
// (feedCursor), e os avisos de depois chegam na ordem (ver
// roomChannel.js, "Cursor dos avisos para todos").
//
// Queda de jogador: o host vê pela presença (o servidor grava offline
// quando a aba fecha ou a conexão cai). Volta da conexão: o guest manda o
// player-join de novo; quando o host volta (F5 ou queda), também. Sem
// troca de host: se o host cai, os outros veem "Host desconectado" e a
// sala espera por ele.
// ============================================

// Versão do formato das mensagens de rede. Vai no meta da sala e no
// player-join; quem chega com outra é recusado (ver addPlayer() em
// messageHandler.js): logo depois de um deploy, quem deu F5 roda o código
// novo e os outros, o antigo — com nomes de campo diferentes, a partida
// travaria sem aviso. Aumentar ao mudar o nome ou o formato de um campo
// de mensagem.
const PROTOCOL_VERSION = 11;

// Quanto a aba espera a resposta de outra aba do mesmo navegador que já
// esteja com a sala aberta (as duas teriam o mesmo uid).
const TAB_CHECK_MS = 200;

// Ligação deste aparelho com a sala.
const roomLinkState = {
    channel: null,
    hostUid: null,
    // Hora do servidor em ms, passada ao abrir a sala (login.serverNow).
    now: null,
    // Até a sala abrir (papel conhecido, tela montada), o que chega do
    // canal espera na fila.
    isReady: false,
    waiting: [],
    // Presença do host vista por este guest (null = ainda não viu).
    hostOnline: null,
    // Guest: recebeu o state-sync depois do último player-join.
    synced: false,
    // BroadcastChannel que marca a sala como aberta nesta aba.
    tab: null
};

// ============================================
// ABA DUPLICADA
// ============================================

/**
 * Marca a sala como aberta nesta aba, se nenhuma outra aba deste
 * navegador estiver com ela. Só olha as abas do próprio navegador, sem
 * rede. Devolve false se outra aba respondeu.
 */
function claimRoomTab(code) {
    if (typeof BroadcastChannel === 'undefined') return Promise.resolve(true);
    const tab = new BroadcastChannel('pmKPI_room_' + code);
    let inUse = false;
    tab.onmessage = (event) => {
        const data = event.data || {};
        if (data.type === 'room-tab-check' && roomLinkState.tab === tab) {
            tab.postMessage({ type: 'room-tab-in-use' });
        } else if (data.type === 'room-tab-in-use') {
            inUse = true;
        }
    };
    tab.postMessage({ type: 'room-tab-check' });
    return new Promise(resolve => {
        setTimeout(() => {
            if (inUse) {
                tab.close();
                resolve(false);
                return;
            }
            roomLinkState.tab = tab;
            resolve(true);
        }, TAB_CHECK_MS);
    });
}

function releaseRoomTab() {
    if (roomLinkState.tab) roomLinkState.tab.close();
    roomLinkState.tab = null;
}

// ============================================
// TELA INICIAL
// ============================================

/**
 * Tela inicial: cria a sala com a versão do jogo (o dono é este
 * aparelho) e para de ouvi-la — o jogo abre a sala depois, em
 * game.html. Devolve { ok } ou { ok: false, reason } (`invalid-code`,
 * `room-exists`).
 */
async function createRoom({ db, uid, code, now, timestamp }) {
    const channel = Game.network.roomChannel.create({ db, uid, now, timestamp });
    const result = await channel.createRoom(code, { protocolVersion: PROTOCOL_VERSION });
    channel.detach();
    return result;
}

/**
 * Tela inicial: confere, só lendo, se a sala existe e é da mesma versão
 * do jogo. Devolve { ok } ou { ok: false, reason } (`invalid-code`,
 * `room-not-found`, `version-mismatch`).
 */
async function checkRoom({ db, code }) {
    if (!Game.network.roomChannel.isValidRoomCode(code)) return { ok: false, reason: 'invalid-code' };
    const snap = await db.ref('rooms/' + code + '/meta').once('value');
    if (!snap.exists()) return { ok: false, reason: 'room-not-found' };
    if ((snap.val() || {}).protocolVersion !== PROTOCOL_VERSION) return { ok: false, reason: 'version-mismatch' };
    return { ok: true };
}

// ============================================
// ABRIR A SALA NO JOGO
// ============================================

/** Roda agora, se a sala já abriu; senão, quando abrir. */
function whenReady(fn) {
    if (roomLinkState.isReady) {
        fn();
        return;
    }
    roomLinkState.waiting.push(fn);
}

/**
 * Abre a sala no jogo (também depois de um F5). O papel vem do meta:
 * host ou guest. `onOpen(result)` roda com o papel já no estado e antes
 * de qualquer pedido ou aviso ser tratado (o main.js monta a tela ali).
 * O guest pede para entrar em seguida. `now` é a hora do servidor
 * (login.serverNow), que passa a valer em serverNow(). Devolve { ok,
 * isHost } ou { ok: false, reason } (`tab-in-use`, `invalid-code`,
 * `room-not-found`, `version-mismatch`).
 */
async function openRoom({ db, uid, code, now, timestamp, onOpen }) {
    if (!(await claimRoomTab(code))) return { ok: false, reason: 'tab-in-use' };
    roomLinkState.now = now || null;

    const ready = (fn) => (...args) => whenReady(() => fn(...args));
    const channel = Game.network.roomChannel.create({
        db, uid, now, timestamp,
        onRequest: ready(receiveRequest),
        onPresence: ready(receivePresence),
        onMessage: ready(deliverFromHost),
        onHostPresence: ready(showHostPresence),
        onDismissed: ready(handleDismissed),
        onReconnected: ready(() => { if (!Game.state.isHost) sendPlayerJoin(); })
    });
    roomLinkState.channel = channel;
    roomLinkState.isReady = false;
    roomLinkState.waiting = [];

    let result;
    try {
        result = await channel.joinRoom(code, { protocolVersion: PROTOCOL_VERSION });
    } finally {
        if (!result || !result.ok) {
            roomLinkState.channel = null;
            releaseRoomTab();
        }
    }
    if (!result.ok) return result;

    const state = Game.state;
    state.isHost = result.isHost;
    state.peerId = uid;
    roomLinkState.hostUid = channel.snapshot().hostUid;
    console.log('🔗 Sala aberta: ' + code + (result.isHost ? ' (host)' : ''));
    if (result.isHost) Game.ui.updateConnectionStatus('connected', Game.i18n.t('connection.connected'));
    if (onOpen) onOpen(result);

    roomLinkState.isReady = true;
    roomLinkState.waiting.splice(0).forEach(fn => {
        try {
            fn();
        } catch (e) {
            console.error('❌ Erro ao tratar o que chegou da sala:', e);
        }
    });
    if (!result.isHost) sendPlayerJoin();
    return result;
}

// ============================================
// CHEGADA (DO CANAL PARA O JOGO)
// ============================================

/** Host: pedido de um jogador, com o uid de quem pediu. */
function receiveRequest(msg, uid) {
    Game.network.handleMessage(msg, uid);
}

/** Host: presença de outro aparelho; offline = quedas e abas fechadas. */
function receivePresence(uid, online) {
    if (!online) Game.network.handlePlayerDisconnect(uid);
}

/**
 * Guest: aviso do host (para todos ou só para este jogador). Depois do
 * state-sync, libera os avisos para todos guardados desde o player-join,
 * a partir do cursor que veio com ele.
 */
function deliverFromHost(msg) {
    if (msg.type !== 'state-sync') {
        Game.network.handleMessage(msg, roomLinkState.hostUid);
        return;
    }
    try {
        Game.network.handleMessage(msg, roomLinkState.hostUid);
    } finally {
        roomLinkState.synced = true;
        const channel = roomLinkState.channel;
        if (channel) channel.releaseFeed(msg.fullState ? msg.fullState.feedCursor : null);
    }
}

/**
 * Guest: presença do host. Quando o host volta (F5 ou queda), o guest
 * pede para entrar de novo e recebe o estado do host — o que mudou
 * enquanto ele estava fora (ex.: o pedido de apoio cancelado no F5).
 * A primeira presença, ao entrar na sala, não é volta.
 */
function showHostPresence(online) {
    const cameBack = online && roomLinkState.hostOnline === false;
    roomLinkState.hostOnline = online;
    if (online) {
        Game.ui.updateConnectionStatus('connected', Game.i18n.t('connection.connected'));
        if (cameBack) sendPlayerJoin();
    } else {
        Game.ui.updateConnectionStatus('disconnected', Game.i18n.t('connection.hostDisconnected'));
    }
}

// Tirado da sala (ex.: o host viu a queda no lobby): ao voltar a
// conexão, o player-join é mandado de novo.
function handleDismissed() {
    roomLinkState.hostOnline = null;
    roomLinkState.synced = false;
    Game.ui.updateConnectionStatus('disconnected', Game.i18n.t('connection.disconnected'));
}

// ============================================
// ENVIO (DO JOGO PARA O CANAL)
// ============================================

/**
 * Guest: apresenta-se ao host — ao entrar e a cada volta da conexão. Um
 * lugar só para montar a mensagem; funciona também sem o canal aberto.
 */
function sendPlayerJoin() {
    const state = Game.state;
    roomLinkState.synced = false;
    if (roomLinkState.channel) roomLinkState.channel.holdFeed();
    Game.network.sendToHost({
        type: 'player-join',
        playerName: state.playerName,
        peerId: state.peerId,
        protocolVersion: PROTOCOL_VERSION
    });
}

function sendToHost(msg) {
    const channel = roomLinkState.channel;
    if (!channel || Game.state.isHost) return;
    channel.sendToHost(msg);
}

function broadcastAll(msg) {
    if (roomLinkState.channel) roomLinkState.channel.broadcast(msg);
}

/** Host: aviso para um jogador; para o próprio host, tratado na hora. */
function sendToPlayer(uid, msg) {
    const state = Game.state;
    if (uid === state.peerId && state.isHost) {
        Game.network.handleMessage(msg, uid);
        return;
    }
    if (roomLinkState.channel) roomLinkState.channel.sendTo(uid, msg);
}

/** Host: aceita o jogador na sala (roster). */
function admitPlayer(uid) {
    if (roomLinkState.channel) roomLinkState.channel.admit(uid);
}

/** Host: tira o jogador da sala (roster e presença). */
function dismissPlayer(uid) {
    if (roomLinkState.channel) roomLinkState.channel.dismiss(uid);
}

/** Host: chave do último aviso para todos (vai no state-sync); null sem avisos. */
function feedCursor() {
    return roomLinkState.channel ? roomLinkState.channel.feedCursor() : null;
}

/**
 * Hora do servidor agora, em ms: o relógio da partida e os prazos contam
 * por ela (ver engine/sessionEngine.js, startClock()). Sem sala aberta, o
 * relógio do aparelho.
 */
function serverNow() {
    return roomLinkState.now ? roomLinkState.now() : Date.now();
}

/** Situação da ligação (os testes no navegador esperam por ela). */
function linkStatus() {
    const channel = roomLinkState.channel;
    const s = channel ? channel.snapshot() : { code: null, isHost: false, isAdmitted: false };
    return {
        code: s.code,
        isHost: s.isHost,
        isAdmitted: s.isAdmitted,
        hostOnline: roomLinkState.hostOnline === true,
        synced: roomLinkState.synced
    };
}

/**
 * Sai da sala (fim da sessão, saída, recusa): para o relógio, apaga o
 * estado salvo e deixa o canal — o host apaga a sala; o guest só para de
 * ouvir (o host fica sabendo pela presença quando a página fecha).
 */
function cleanup() {
    clearInterval(Game.state.timerInterval);
    Game.persistence.clearSavedState();
    releaseRoomTab();
    const channel = roomLinkState.channel;
    Object.assign(roomLinkState, { channel: null, hostUid: null, isReady: false, waiting: [], hostOnline: null, synced: false });
    return channel ? channel.leave() : Promise.resolve();
}

// ============================================
// EXPORTAÇÃO
// ============================================
window.Game = window.Game || {};
window.Game.network = window.Game.network || {};
Object.assign(window.Game.network, {
    createRoom,
    checkRoom,
    openRoom,
    sendPlayerJoin,
    sendToHost,
    broadcastAll,
    sendToPlayer,
    admitPlayer,
    dismissPlayer,
    feedCursor,
    serverNow,
    receiveRequest,
    receivePresence,
    linkStatus,
    cleanup,
    PROTOCOL_VERSION
});
