// ============================================
// PM: The KPI Master - Network: Canal da sala pelo Firebase
// ============================================
// Por onde o jogo conversa pelo Firebase Realtime Database (roadmap
// 2.9): criar e entrar na sala, pedidos dos jogadores ao host, avisos do
// host para todos e para um jogador, e o estado da partida guardado no
// banco. Não conhece as regras do jogo: só leva e traz.
//
// Recebe o banco já pronto (db, da API "compat" do Firebase), o uid do
// login anônimo e o relógio — por isso os testes trocam o banco por um
// simulado (tests/logic/fakeFirebase.js).
//
// No banco, cada sala fica em rooms/<código>:
//   meta            { hostUid, hostEpoch, protocolVersion, createdAt, lastActivity }
//   roster/<uid>    true — jogador aceito pelo host
//   public/state    estado que os jogadores aceitos veem
//   secret/state    estado completo, só do host (com o gabarito)
//   hands/<uid>     o que só aquele jogador vê
//   feed/<id>       { payload } — aviso do host para todos
//   inbox/<uid>/<id> { payload } — aviso do host para um jogador
//   requests/<id>   { from, payload } — pedido de um jogador ao host
// Todo conteúdo viaja como texto JSON: o banco apaga null e listas
// vazias de um objeto gravado. Quem pode ler e gravar cada parte está
// em database.rules.json.
// ============================================

// Mesmo formato do código de sala da tela inicial (js/entry/roomEntry.js);
// também evita os caracteres que o Firebase não aceita em chave (. # $ [ ] /).
const ROOM_CODE_PATTERN = /^[a-zA-Z0-9_-]{1,20}$/;

// Sala sem nenhuma publicação do host por esse tempo está parada: o
// código pode ser criado de novo. O mesmo número está nas regras do banco
// (database.rules.json, meta), que conferem pela hora do servidor.
const ROOM_IDLE_MS = 2 * 60 * 60 * 1000;

// O que sobra de uma sala parada e é apagado por quem cria a sala de novo.
const ROOM_PARTS = ['roster', 'public', 'secret', 'hands', 'feed', 'inbox', 'requests', 'presence'];

function isValidRoomCode(code) {
    return typeof code === 'string' && ROOM_CODE_PATTERN.test(code);
}

/** Texto JSON → valor; undefined se o texto não é JSON válido. */
function parseJson(text) {
    if (typeof text !== 'string') return undefined;
    try {
        return JSON.parse(text);
    } catch (e) {
        return undefined;
    }
}

/**
 * Cria o canal da sala de um aparelho.
 *
 * @param {Object} options
 * @param {Object} options.db - banco do Firebase (firebase.database())
 * @param {string} options.uid - uid do login anônimo deste aparelho
 * @param {Function} [options.now] - relógio em ms (padrão: Date.now)
 * @param {Function} [options.timestamp] - valor gravado como hora (no
 *   jogo, firebase.database.ServerValue.TIMESTAMP; padrão: now())
 * @param {Function} [options.onRequest] - host: (msg, uid de quem pediu)
 * @param {Function} [options.onMessage] - guest: aviso do host (para todos ou só para ele)
 * @param {Function} [options.onState] - guest aceito: estado público (ou null)
 * @param {Function} [options.onHand] - guest aceito: o que só ele vê (ou null)
 * @param {Function} [options.onAdmitted] - guest: foi aceito na sala
 * @param {Function} [options.onDismissed] - guest: saiu do roster
 */
function create(options) {
    const db = options.db;
    const uid = options.uid;
    const now = options.now || (() => Date.now());
    const timestamp = options.timestamp || now;
    const noop = () => {};
    const handlers = {
        onRequest: options.onRequest || noop,
        onMessage: options.onMessage || noop,
        onState: options.onState || noop,
        onHand: options.onHand || noop,
        onAdmitted: options.onAdmitted || noop,
        onDismissed: options.onDismissed || noop
    };

    let code = null;
    let base = null;          // 'rooms/<código>'
    let isHost = false;
    let isAdmitted = false;
    // Conta as entradas no roster: um aviso que chega depois de o
    // aparelho sair (ou de ser tirado e aceito de novo) é descartado.
    let admission = 0;
    // Pedidos e avisos já vistos (os que existiam ao entrar contam como vistos).
    let seen = new Set();
    // Ouvintes registrados: os da sala e os que só valem enquanto aceito.
    const roomListeners = [];
    const admittedListeners = [];

    function call(name, ...args) {
        try {
            handlers[name](...args);
        } catch (e) {
            console.error('❌ Erro ao tratar ' + name + ' do canal da sala:', e);
        }
    }

    function listen(list, ref, event, cb) {
        ref.on(event, cb);
        list.push({ ref, event, cb });
    }

    function stopListening(list) {
        list.forEach(l => l.ref.off(l.event, l.cb));
        list.length = 0;
    }

    function markExisting(prefix, snap) {
        Object.keys(snap.val() || {}).forEach(key => seen.add(prefix + key));
    }

    // Host: cada pedido é entregue ao jogo uma vez e apagado em seguida,
    // inclusive os que esperavam no banco quando o host entrou (F5).
    function onRequestAdded(snap) {
        if (!code || seen.has('request:' + snap.key)) return;
        seen.add('request:' + snap.key);
        const value = snap.val() || {};
        const msg = parseJson(value.payload);
        if (typeof value.from === 'string' && msg && typeof msg === 'object') {
            call('onRequest', msg, value.from);
        } else {
            console.warn('⚠️ Pedido ilegível ou sem remetente descartado:', snap.key);
        }
        db.ref(base + '/requests/' + snap.key).remove();
    }

    function onMessageAdded(prefix, snap) {
        if (!code || seen.has(prefix + snap.key)) return;
        seen.add(prefix + snap.key);
        const msg = parseJson((snap.val() || {}).payload);
        if (msg && typeof msg === 'object') {
            call('onMessage', msg);
        } else {
            console.warn('⚠️ Aviso do host ilegível descartado:', snap.key);
        }
    }

    function deliverJson(name, snap) {
        const raw = snap.val();
        if (raw === null || raw === undefined) {
            call(name, null);
            return;
        }
        const value = parseJson(raw);
        if (value === undefined) {
            console.warn('⚠️ Estado ilegível no banco (' + name + ') — ignorado.');
            return;
        }
        call(name, value);
    }

    // Guest: só depois de aceito (roster) começa a ouvir o estado e os
    // avisos para todos — antes disso as regras recusariam a leitura e o
    // Firebase cancelaria o ouvinte.
    async function startAdmitted() {
        isAdmitted = true;
        const id = ++admission;
        call('onAdmitted');
        const feed = db.ref(base + '/feed');
        const existing = await feed.once('value');
        if (id !== admission || !isAdmitted) return;
        markExisting('feed:', existing);
        listen(admittedListeners, feed, 'child_added', snap => onMessageAdded('feed:', snap));
        listen(admittedListeners, db.ref(base + '/public/state'), 'value', snap => deliverJson('onState', snap));
        listen(admittedListeners, db.ref(base + '/hands/' + uid), 'value', snap => deliverJson('onHand', snap));
    }

    function stopAdmitted() {
        isAdmitted = false;
        admission++;
        stopListening(admittedListeners);
    }

    function onRoster(snap) {
        if (!code) return;
        const admitted = snap.val() === true;
        if (admitted && !isAdmitted) {
            startAdmitted();
        } else if (!admitted && isAdmitted) {
            stopAdmitted();
            call('onDismissed');
        }
    }

    async function enter(roomCode, asHost) {
        code = roomCode;
        base = 'rooms/' + roomCode;
        isHost = asHost;
        isAdmitted = false;
        seen = new Set();
        if (asHost) {
            listen(roomListeners, db.ref(base + '/requests'), 'child_added', onRequestAdded);
        } else {
            const inbox = db.ref(base + '/inbox/' + uid);
            markExisting('inbox:', await inbox.once('value'));
            listen(roomListeners, inbox, 'child_added', snap => onMessageAdded('inbox:', snap));
            listen(roomListeners, db.ref(base + '/roster/' + uid), 'value', onRoster);
        }
        console.log('🔗 Canal da sala: ' + roomCode + (asHost ? ' (host)' : ''));
    }

    /** Para de ouvir a sala, sem gravar nada. */
    function detach() {
        stopAdmitted();
        stopListening(roomListeners);
        code = null;
        base = null;
        isHost = false;
    }

    function isIdle(meta) {
        return !!meta && typeof meta.lastActivity === 'number' && meta.lastActivity < now() - ROOM_IDLE_MS;
    }

    /**
     * Cria a sala e entra como host. O código em uso só é aceito se a sala
     * está parada (ROOM_IDLE_MS); nesse caso, o que sobrou dela é apagado.
     */
    async function createRoom(roomCode, opts = {}) {
        if (!isValidRoomCode(roomCode)) return { ok: false, reason: 'invalid-code' };
        if (code) detach();
        const roomBase = 'rooms/' + roomCode;
        let replaced = false;
        let result;
        try {
            result = await db.ref(roomBase + '/meta').transaction(current => {
                if (current !== null && !isIdle(current)) return undefined;
                replaced = current !== null;
                const stamp = timestamp();
                return { hostUid: uid, hostEpoch: 1, protocolVersion: opts.protocolVersion, createdAt: stamp, lastActivity: stamp };
            });
        } catch (e) {
            console.warn('⚠️ Não foi possível criar a sala ' + roomCode + ':', e && e.message);
            return { ok: false, reason: 'room-exists' };
        }
        if (!result || !result.committed) return { ok: false, reason: 'room-exists' };
        if (replaced) {
            const leftovers = {};
            ROOM_PARTS.forEach(part => { leftovers[part] = null; });
            await db.ref(roomBase).update(leftovers);
        }
        await enter(roomCode, true);
        return { ok: true, isHost: true };
    }

    /**
     * Entra numa sala que já existe (também a volta depois de um F5). É
     * host quem está no meta como host. Entrar não grava nada: o pedido de
     * entrada é do jogo (sendToHost).
     */
    async function joinRoom(roomCode, opts = {}) {
        if (!isValidRoomCode(roomCode)) return { ok: false, reason: 'invalid-code' };
        if (code) detach();
        const snap = await db.ref('rooms/' + roomCode + '/meta').once('value');
        if (!snap.exists()) return { ok: false, reason: 'room-not-found' };
        const meta = snap.val() || {};
        if (meta.protocolVersion !== opts.protocolVersion) return { ok: false, reason: 'version-mismatch' };
        const asHost = meta.hostUid === uid;
        await enter(roomCode, asHost);
        return { ok: true, isHost: asHost };
    }

    function push(path, value) {
        return db.ref(path).push().set(value);
    }

    /** Guest (ou qualquer um): pedido ao host. */
    function sendToHost(msg) {
        if (!code) return Promise.resolve();
        return push(base + '/requests', { from: uid, payload: JSON.stringify(msg) });
    }

    /** Host: aviso para todos os aceitos. */
    function broadcast(msg) {
        if (!code || !isHost) return Promise.resolve();
        return push(base + '/feed', { payload: JSON.stringify(msg) });
    }

    /** Host: aviso para um jogador (aceito ou não, ex.: a recusa de entrada). */
    function sendTo(targetUid, msg) {
        if (!code || !isHost) return Promise.resolve();
        return push(base + '/inbox/' + targetUid, { payload: JSON.stringify(msg) });
    }

    function admit(targetUid) {
        if (!code || !isHost) return Promise.resolve();
        return db.ref(base + '/roster/' + targetUid).set(true);
    }

    function dismiss(targetUid) {
        if (!code || !isHost) return Promise.resolve();
        return db.ref(base + '/roster/' + targetUid).remove();
    }

    /**
     * Host: grava, numa gravação só, o que vier — estado público, secreto
     * e o de cada jogador (null apaga o daquele jogador) — e a última
     * atividade da sala.
     */
    function publish(parts = {}) {
        if (!code || !isHost) return Promise.resolve();
        const values = { 'meta/lastActivity': timestamp() };
        if (parts.publicState !== undefined) values['public/state'] = JSON.stringify(parts.publicState);
        if (parts.secretState !== undefined) values['secret/state'] = JSON.stringify(parts.secretState);
        Object.keys(parts.hands || {}).forEach(targetUid => {
            const hand = parts.hands[targetUid];
            values['hands/' + targetUid] = hand === null ? null : JSON.stringify(hand);
        });
        return db.ref(base).update(values);
    }

    /** Host: lê o estado secreto publicado (ex.: depois de um F5); null se não há. */
    async function readSecret() {
        if (!code || !isHost) return null;
        const snap = await db.ref(base + '/secret/state').once('value');
        const value = parseJson(snap.val());
        return value === undefined ? null : value;
    }

    /** Host: apaga os avisos já entregues (para todos e para cada um). */
    function clearMessages() {
        if (!code || !isHost) return Promise.resolve();
        return db.ref(base).update({ feed: null, inbox: null });
    }

    /** Sai da sala: para de ouvir; o host apaga a sala inteira. */
    async function leave() {
        if (!code) return;
        const wasHost = isHost;
        const roomBase = base;
        detach();
        if (wasHost) await db.ref(roomBase).remove();
    }

    function snapshot() {
        return { code, isHost, isAdmitted };
    }

    return {
        createRoom,
        joinRoom,
        sendToHost,
        broadcast,
        sendTo,
        admit,
        dismiss,
        publish,
        readSecret,
        clearMessages,
        leave,
        snapshot
    };
}

// ============================================
// EXPORTAÇÃO
// ============================================
window.Game = window.Game || {};
window.Game.network = window.Game.network || {};
window.Game.network.roomChannel = {
    create,
    isValidRoomCode,
    ROOM_IDLE_MS
};
