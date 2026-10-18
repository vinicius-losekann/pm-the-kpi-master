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
//   presence/<uid>  { online, lastSeen } — sinal de vida: o aparelho grava
//                   online com a hora do servidor ao entrar, a cada
//                   heartbeatInterval e quando a aba volta a ficar
//                   visível, e deixa com o servidor (onDisconnect) o
//                   offline com a hora de quando cair ou fechar a aba
// Todo conteúdo viaja como texto JSON: o banco apaga null e listas
// vazias de um objeto gravado. Quem pode ler e gravar cada parte está
// em database.rules.json.
//
// Tolerância: "vivo" é ter o último sinal (lastSeen) recente pela hora do
// servidor — o offline sozinho não derruba ninguém (um F5 ou uma queda
// curta passam sem aviso), e a aba congelada (tela bloqueada), ainda
// online, cai do mesmo jeito. O host dá o jogador como caído com o sinal
// parado há mais de presenceTimeout; o guest dá o host como caído no
// offline dele ou com o sinal parado há mais de hostTimeout. Os dois
// conferem a cada PRESENCE_CHECK_MS e a cada mudança no banco.
//
// Cursor dos avisos para todos: o estado de quem entra (ou volta) chega
// pela inbox e os avisos para todos pelo feed — caminhos separados. Um
// aviso gravado entre os dois se perderia. Por isso o guest pode pedir
// para segurar o feed (holdFeed) antes de pedir para entrar; o host diz,
// junto com o estado, até que aviso ele já vale (feedCursor), e o guest
// libera o feed a partir dali (releaseFeed).
// ============================================

// Mesmo formato do código de sala da tela inicial (js/entry/roomEntry.js);
// também evita os caracteres que o Firebase não aceita em chave (. # $ [ ] /).
const ROOM_CODE_PATTERN = /^[a-zA-Z0-9_-]{1,20}$/;

// Sala sem nenhuma publicação do host por esse tempo está parada: o
// código pode ser criado de novo. O mesmo número está nas regras do banco
// (database.rules.json, meta), que conferem pela hora do servidor.
const ROOM_IDLE_MS = 2 * 60 * 60 * 1000;

// De quanto em quanto tempo a tolerância é conferida sem mudança no banco
// (o sinal de quem caiu para de mudar: só o relógio diz que ficou velho).
const PRESENCE_CHECK_MS = 1000;

// O que sobra de uma sala parada e é apagado por quem cria a sala de novo.
const ROOM_PARTS = ['roster', 'public', 'secret', 'hands', 'feed', 'inbox', 'requests', 'presence'];

function isValidRoomCode(code) {
    return typeof code === 'string' && ROOM_CODE_PATTERN.test(code);
}

/** Maior chave de um objeto do banco (a do aviso mais novo); null se vazio. */
function lastKeyOf(value) {
    const keys = Object.keys(value || {}).sort();
    return keys.length ? keys[keys.length - 1] : null;
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
 * @param {number} options.heartbeatInterval - ms entre um sinal de vida e outro
 * @param {number} options.presenceTimeout - host: ms de sinal parado até o jogador cair
 * @param {number} options.hostTimeout - guest: ms de sinal parado até o host cair
 * @param {Function} [options.onRequest] - host: (msg, uid de quem pediu)
 * @param {Function} [options.onMessage] - guest: aviso do host (para todos ou só para ele)
 * @param {Function} [options.onState] - guest aceito: estado público (ou null)
 * @param {Function} [options.onHand] - guest aceito: o que só ele vê (ou null)
 * @param {Function} [options.onAdmitted] - guest: foi aceito na sala
 * @param {Function} [options.onDismissed] - guest: saiu do roster
 * @param {Function} [options.onPresence] - host: (uid, vivo) a cada
 *   mudança da presença de outro aparelho, já com a tolerância (e a
 *   atual, ao entrar)
 * @param {Function} [options.onHostPresence] - guest aceito: (online) do
 *   host, a cada mudança
 * @param {Function} [options.onReconnected] - a conexão com o banco voltou
 *   (nunca na primeira conexão)
 */
function create(options) {
    const db = options.db;
    const uid = options.uid;
    const now = options.now || (() => Date.now());
    const timestamp = options.timestamp || now;
    const heartbeatInterval = options.heartbeatInterval;
    const presenceTimeout = options.presenceTimeout;
    const hostTimeout = options.hostTimeout;
    const noop = () => {};
    const handlers = {
        onRequest: options.onRequest || noop,
        onMessage: options.onMessage || noop,
        onState: options.onState || noop,
        onHand: options.onHand || noop,
        onAdmitted: options.onAdmitted || noop,
        onDismissed: options.onDismissed || noop,
        onPresence: options.onPresence || noop,
        onHostPresence: options.onHostPresence || noop,
        onReconnected: options.onReconnected || noop
    };

    let code = null;
    let base = null;          // 'rooms/<código>'
    let isHost = false;
    let isAdmitted = false;
    let hostUid = null;
    // Host: chave do último aviso para todos (feedCursor).
    let lastFeedKey = null;
    // Host: a presença de todos como está no banco, e o que já foi
    // avisado de cada outro aparelho (uid → vivo).
    let presenceList = {};
    let knownPresence = {};
    // Guest aceito: a presença do host como está no banco (undefined =
    // ainda não leu; null = não há), e o que já foi avisado (undefined =
    // ainda nada).
    let hostSignal;
    let knownHostOnline;
    // Timers do sinal de vida e da conferência da tolerância.
    let heartbeatTimer = null;
    let checkTimer = null;
    // Última situação da conexão com o banco (undefined = ainda não sabe)
    // e se já esteve conectado nesta sala.
    let lastConnected;
    let everConnected = false;
    // Hora (do servidor) da última volta da conexão; null = nenhuma.
    let reconnectedAt = null;
    // Guest: avisos para todos guardados enquanto segura o feed, e o
    // cursor depois do qual os avisos chegam (null = todos).
    let holding = false;
    let held = [];
    let skipUpTo = null;
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

    // Guest: aviso para todos. Segurando, fica guardado; depois do
    // releaseFeed, os que saíram até o cursor são descartados.
    function onFeedAdded(snap) {
        if (!code || seen.has('feed:' + snap.key)) return;
        if (holding) {
            held.push(snap);
            return;
        }
        if (skipUpTo !== null && snap.key <= skipUpTo) {
            seen.add('feed:' + snap.key);
            return;
        }
        onMessageAdded('feed:', snap);
    }

    function presenceRef() {
        return db.ref(base + '/presence/' + uid);
    }

    /** Sinal de vida: online e a hora do servidor (o banco a grava). */
    function signal(online) {
        return { online, lastSeen: timestamp() };
    }

    // Grava online e deixa com o servidor o offline de quando cair (com a
    // hora da queda). O onDisconnect é registrado de novo a cada volta da
    // conexão: o anterior já foi executado pelo servidor na queda.
    function announcePresence() {
        const ref = presenceRef();
        ref.onDisconnect().set(signal(false));
        return ref.set(signal(true));
    }

    /** Sinal de vida de agora — só de quem pode gravar a presença (host ou aceito). */
    function beat() {
        if (!code || !(isHost || isAdmitted)) return;
        presenceRef().set(signal(true)).catch(e => {
            console.warn('⚠️ Sinal de vida recusado pelo banco:', e && e.message);
        });
    }

    /** O último sinal tem até `limit` ms, pela hora do servidor? */
    function isRecent(value, limit) {
        return !!value && typeof value.lastSeen === 'number' && now() - value.lastSeen <= limit;
    }

    // Host: avisa cada mudança dos outros, já com a tolerância. Guest
    // aceito: avisa cada mudança do host. Sem conexão com o banco, os
    // sinais dos outros param de chegar e pareceriam velhos: nada se
    // conclui até a conexão voltar e, depois dela, por dois ritmos do
    // sinal (o "conectado" pode chegar antes dos sinais novos).
    function checkPresence() {
        if (!code || lastConnected === false) return;
        if (reconnectedAt !== null && now() - reconnectedAt < 2 * heartbeatInterval) return;
        if (isHost) {
            Object.keys(presenceList).forEach(who => {
                if (who === uid) return;
                const alive = isRecent(presenceList[who], presenceTimeout);
                if (knownPresence[who] === alive) return;
                knownPresence[who] = alive;
                call('onPresence', who, alive);
            });
        } else if (isAdmitted && hostSignal !== undefined) {
            const online = !!hostSignal && hostSignal.online === true && isRecent(hostSignal, hostTimeout);
            if (knownHostOnline === online) return;
            knownHostOnline = online;
            call('onHostPresence', online);
        }
    }

    // A aba voltou a ficar visível (ex.: tela desbloqueada): sinal na hora,
    // sem esperar o ritmo, e confere a tolerância.
    function onVisibilityChange() {
        if (document.visibilityState !== 'visible') return;
        beat();
        checkPresence();
    }

    function hasDocument() {
        return typeof document !== 'undefined' && !!document && typeof document.addEventListener === 'function';
    }

    function startHeartbeat() {
        stopHeartbeat();
        heartbeatTimer = setInterval(beat, heartbeatInterval);
        checkTimer = setInterval(checkPresence, PRESENCE_CHECK_MS);
    }

    function stopHeartbeat() {
        clearInterval(heartbeatTimer);
        clearInterval(checkTimer);
        heartbeatTimer = null;
        checkTimer = null;
    }

    // Host: guarda a presença de todos e confere. Presença apagada (o
    // próprio host tirou da sala) não é queda: só sai da lista.
    function onPresenceList(snap) {
        if (!code) return;
        presenceList = snap.val() || {};
        Object.keys(knownPresence).forEach(who => {
            if (!(who in presenceList)) delete knownPresence[who];
        });
        checkPresence();
    }

    // Volta = conectado depois de ter estado conectado e caído. O
    // Firebase pode avisar "desconectado" antes da primeira conexão: isso
    // não é volta.
    function onConnected(snap) {
        if (!code) return;
        const connected = snap.val() === true;
        const cameBack = connected && lastConnected === false && everConnected;
        lastConnected = connected;
        if (connected) everConnected = true;
        if (!cameBack) return;
        reconnectedAt = now();
        if (isHost || isAdmitted) announcePresence();
        call('onReconnected');
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
    // Firebase cancelaria o ouvinte. Aceito, grava a própria presença,
    // passa a mandar o sinal de vida e a ouvir a presença do host.
    async function startAdmitted() {
        isAdmitted = true;
        const id = ++admission;
        call('onAdmitted');
        announcePresence();
        startHeartbeat();
        hostSignal = undefined;
        knownHostOnline = undefined;
        listen(admittedListeners, db.ref(base + '/presence/' + hostUid), 'value', snap => {
            hostSignal = snap.val();
            checkPresence();
        });
        const feed = db.ref(base + '/feed');
        // Segurando o feed, os avisos que já existiam também ficam
        // guardados: o cursor do host diz quais descartar.
        if (!holding) {
            const existing = await feed.once('value');
            if (id !== admission || !isAdmitted) return;
            markExisting('feed:', existing);
        }
        listen(admittedListeners, feed, 'child_added', onFeedAdded);
        listen(admittedListeners, db.ref(base + '/public/state'), 'value', snap => deliverJson('onState', snap));
        listen(admittedListeners, db.ref(base + '/hands/' + uid), 'value', snap => deliverJson('onHand', snap));
    }

    function stopAdmitted() {
        isAdmitted = false;
        admission++;
        held = [];
        skipUpTo = null;
        stopHeartbeat();
        hostSignal = undefined;
        knownHostOnline = undefined;
        stopListening(admittedListeners);
    }

    function onRoster(snap) {
        if (!code) return;
        const admitted = snap.val() === true;
        if (admitted && !isAdmitted) {
            startAdmitted();
        } else if (!admitted && isAdmitted) {
            stopAdmitted();
            // Tirado da sala: o offline deixado com o servidor não vale mais.
            presenceRef().onDisconnect().cancel();
            call('onDismissed');
        }
    }

    async function enter(roomCode, asHost, roomHostUid) {
        code = roomCode;
        base = 'rooms/' + roomCode;
        isHost = asHost;
        isAdmitted = false;
        hostUid = roomHostUid;
        presenceList = {};
        knownPresence = {};
        lastConnected = undefined;
        everConnected = false;
        reconnectedAt = null;
        seen = new Set();
        if (hasDocument()) document.addEventListener('visibilitychange', onVisibilityChange);
        if (asHost) {
            listen(roomListeners, db.ref(base + '/requests'), 'child_added', onRequestAdded);
            // Depois de um F5, o cursor continua o do último aviso no banco.
            lastFeedKey = lastKeyOf((await db.ref(base + '/feed').once('value')).val());
            listen(roomListeners, db.ref(base + '/presence'), 'value', onPresenceList);
            announcePresence();
            startHeartbeat();
        } else {
            const inbox = db.ref(base + '/inbox/' + uid);
            markExisting('inbox:', await inbox.once('value'));
            listen(roomListeners, inbox, 'child_added', snap => onMessageAdded('inbox:', snap));
            listen(roomListeners, db.ref(base + '/roster/' + uid), 'value', onRoster);
        }
        listen(roomListeners, db.ref('.info/connected'), 'value', onConnected);
        console.log('🔗 Canal da sala: ' + roomCode + (asHost ? ' (host)' : ''));
    }

    /** Para de ouvir a sala e de mandar o sinal de vida, sem gravar nada. */
    function detach() {
        stopAdmitted();
        stopHeartbeat();
        if (hasDocument()) document.removeEventListener('visibilitychange', onVisibilityChange);
        stopListening(roomListeners);
        code = null;
        base = null;
        isHost = false;
        hostUid = null;
        lastFeedKey = null;
        holding = false;
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
        await enter(roomCode, true, uid);
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
        await enter(roomCode, asHost, meta.hostUid);
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
        const ref = db.ref(base + '/feed').push();
        lastFeedKey = ref.key;
        return ref.set({ payload: JSON.stringify(msg) });
    }

    /**
     * Host: chave do último aviso para todos — vai junto com o estado de
     * quem entra, para ele saber a partir de qual aviso receber. null sem
     * avisos.
     */
    function feedCursor() {
        return code && isHost ? lastFeedKey : null;
    }

    /** Guest: passa a guardar os avisos para todos até o releaseFeed(). */
    function holdFeed() {
        holding = true;
        held = [];
    }

    /**
     * Guest: entrega os avisos guardados que saíram depois do cursor (null
     * = todos), na ordem, e volta a receber normalmente; os de até o
     * cursor nunca chegam.
     */
    function releaseFeed(cursor) {
        holding = false;
        skipUpTo = typeof cursor === 'string' ? cursor : null;
        const pending = held;
        held = [];
        pending.forEach(onFeedAdded);
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

    /** Host: tira da sala — do roster e da presença. */
    function dismiss(targetUid) {
        if (!code || !isHost) return Promise.resolve();
        return db.ref(base).update({ ['roster/' + targetUid]: null, ['presence/' + targetUid]: null });
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

    /**
     * Sai da sala: para de ouvir; o host apaga a sala inteira (antes,
     * cancela o offline deixado com o servidor, que recriaria a presença
     * na sala apagada). O guest deixa o offline: é por ele que o host fica
     * sabendo da saída quando a página fecha.
     */
    async function leave() {
        if (!code) return;
        const wasHost = isHost;
        const roomBase = base;
        if (wasHost) presenceRef().onDisconnect().cancel();
        detach();
        if (wasHost) await db.ref(roomBase).remove();
    }

    function snapshot() {
        return { code, isHost, isAdmitted, hostUid };
    }

    return {
        createRoom,
        joinRoom,
        sendToHost,
        broadcast,
        feedCursor,
        holdFeed,
        releaseFeed,
        sendTo,
        admit,
        dismiss,
        publish,
        readSecret,
        clearMessages,
        leave,
        detach,
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
