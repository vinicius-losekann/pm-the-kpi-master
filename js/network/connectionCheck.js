// ============================================
// PM: The KPI Master - Network: Teste de conexão pelo Firebase
// ============================================
// Lógica da página firebase-check.html (roadmap 2.9): prova que criar
// sala, entrar e trocar mensagens funciona pelo Firebase Realtime
// Database na rede de quem joga (ex.: celular no 5G, rede da UFSM),
// antes de trocar a camada network/ do jogo.
//
// Não usa o jogo nem o PeerJS. Recebe o banco já pronto (db, da API
// "compat" do Firebase), o uid do login anônimo, o nome e o relógio — por
// isso os testes trocam o banco por um simulado
// (tests/logic/fakeFirebase.js). A tela fica em
// js/entry/connectionCheckPage.js.
//
// No banco, cada sala fica em connectionChecks/<código>:
//   meta              { hostUid, createdAt }   — quem criou é o dono
//   devices/<uid>     { name, joinedAt }       — some sozinho quando a
//                                                 conexão cai (onDisconnect)
//   messages/<id>     { from, name, kind, ... } — 'ping' (mensagem de
//                                                 teste) ou 'echo' (resposta)
// As regras de quem pode ler e gravar estão em database.rules.json.
// ============================================

// Mesmo formato do código de sala da tela inicial (js/entry/roomEntry.js);
// também evita os caracteres que o Firebase não aceita em chave (. # $ [ ] /).
const ROOM_CODE_PATTERN = /^[a-zA-Z0-9_-]{1,20}$/;

// Conteúdo da mensagem de teste: parecido com uma mensagem do jogo, com
// null e lista vazia. O banco apaga null e listas vazias de um objeto
// gravado; por isso o conteúdo viaja como texto JSON (payload) e chega
// exatamente como saiu.
const SAMPLE_PAYLOAD = {
    type: 'check-ping',
    question: null,
    answeredThisRound: [],
    players: [{ name: 'Exemplo', kpi: 0, resources: 10, disconnected: false }]
};

function isValidRoomCode(code) {
    return typeof code === 'string' && ROOM_CODE_PATTERN.test(code);
}

/** Tamanho aproximado (em caracteres do JSON) do que foi gravado ou recebido. */
function sizeOf(value) {
    return JSON.stringify(value).length;
}

/**
 * Cria o teste de conexão de um aparelho.
 *
 * @param {Object} options
 * @param {Object} options.db - banco do Firebase (firebase.database())
 * @param {string} options.uid - uid do login anônimo deste aparelho
 * @param {string} options.name - nome mostrado aos outros
 * @param {Function} [options.now] - relógio em ms (padrão: Date.now)
 * @param {Function} [options.onChange] - chamada a cada mudança, com snapshot()
 */
function create(options) {
    const db = options.db;
    const uid = options.uid;
    const name = options.name;
    const now = options.now || (() => Date.now());
    const onChange = options.onChange || (() => {});

    let code = null;
    let isHost = false;
    let connected = false;
    let joinedAt = 0;
    let devices = [];
    let pings = [];
    let roundTrips = [];
    let bytesSent = 0;
    let bytesReceived = 0;
    // Mensagens que já existiam ao entrar (não são respondidas de novo,
    // ex.: depois de um F5) e as já tratadas.
    let seen = new Set();
    // Mensagens de teste enviadas por este aparelho: id → hora do envio.
    const sentPings = new Map();
    let refs = null; // { room, device, devices, messages, connected }

    function snapshot() {
        return {
            code,
            isHost,
            connected,
            devices: devices.map(d => ({ uid: d.uid, name: d.name })),
            pings: pings.map(p => ({ ...p })),
            roundTrips: roundTrips.map(r => ({ ...r })),
            bytesSent,
            bytesReceived
        };
    }

    function changed() {
        try { onChange(snapshot()); } catch (e) { console.error('❌ Erro ao atualizar a tela do teste de conexão:', e); }
    }

    function markPresent() {
        refs.device.onDisconnect().remove();
        return refs.device.set({ name, joinedAt });
    }

    // '.info/connected': a conexão com o servidor caiu ou voltou. Ao
    // voltar, o aviso de queda (onDisconnect) precisa ser armado de novo
    // — ele vale uma vez só — e o aparelho volta à lista.
    function onConnected(snap) {
        if (!code) return;
        connected = snap.val() === true;
        if (connected) markPresent();
        changed();
    }

    function onDevices(snap) {
        if (!code) return;
        const value = snap.val() || {};
        devices = Object.keys(value)
            .map(key => ({ uid: key, name: value[key].name, joinedAt: value[key].joinedAt || 0 }))
            .sort((a, b) => (a.joinedAt - b.joinedAt) || (a.uid < b.uid ? -1 : 1));
        // O registro deste aparelho sumiu com a conexão no ar (ex.: o aviso
        // de queda da aba anterior, num F5, chegou depois da entrada nova):
        // volta à lista.
        if (connected && !value[uid]) markPresent();
        changed();
    }

    function onMessage(snap) {
        if (!code || seen.has(snap.key)) return;
        seen.add(snap.key);
        const msg = snap.val();
        if (!msg || msg.from === uid) return;
        bytesReceived += sizeOf(msg);

        if (msg.kind === 'ping') {
            let payload = null;
            try { payload = JSON.parse(msg.payload); } catch (e) { console.warn('⚠️ Mensagem de teste com conteúdo ilegível:', snap.key); }
            pings.push({ id: snap.key, from: msg.from, name: msg.name, payload });
            send({ from: uid, name, kind: 'echo', pingId: snap.key, to: msg.from, sentAt: now() });
        } else if (msg.kind === 'echo' && msg.to === uid && sentPings.has(msg.pingId)) {
            // Tempo de ida e volta pelo relógio deste aparelho (o dos dois
            // aparelhos pode estar alguns segundos diferente).
            roundTrips.push({ id: msg.pingId, from: msg.from, name: msg.name, ms: now() - sentPings.get(msg.pingId) });
        }
        changed();
    }

    function send(value, ref) {
        const target = ref || refs.messages.push();
        bytesSent += sizeOf(value);
        return target.set(value).then(() => target.key);
    }

    async function enter(roomCode, asHost) {
        const room = 'connectionChecks/' + roomCode;
        refs = {
            room: db.ref(room),
            device: db.ref(room + '/devices/' + uid),
            devices: db.ref(room + '/devices'),
            messages: db.ref(room + '/messages'),
            connected: db.ref('.info/connected')
        };
        const existing = await refs.messages.once('value');
        seen = new Set(Object.keys(existing.val() || {}));
        code = roomCode;
        isHost = asHost;
        joinedAt = now();
        devices = [];
        pings = [];
        roundTrips = [];
        refs.devices.on('value', onDevices);
        refs.messages.on('child_added', onMessage);
        refs.connected.on('value', onConnected);
        console.log('🔗 Teste de conexão: na sala ' + roomCode + (asHost ? ' (dono)' : ''));
        changed();
    }

    /** Cria a sala e entra como dono. */
    async function createRoom(roomCode) {
        if (!isValidRoomCode(roomCode)) return { ok: false, reason: 'invalid-code' };
        if (code) await leave();
        const result = await db.ref('connectionChecks/' + roomCode + '/meta').transaction(current =>
            current === null ? { hostUid: uid, createdAt: now() } : undefined);
        if (!result.committed) return { ok: false, reason: 'room-exists' };
        await enter(roomCode, true);
        return { ok: true };
    }

    /** Entra numa sala que já existe (também a volta depois de um F5). */
    async function joinRoom(roomCode) {
        if (!isValidRoomCode(roomCode)) return { ok: false, reason: 'invalid-code' };
        if (code) await leave();
        const meta = await db.ref('connectionChecks/' + roomCode + '/meta').once('value');
        if (!meta.exists()) return { ok: false, reason: 'room-not-found' };
        await enter(roomCode, (meta.val() || {}).hostUid === uid);
        return { ok: true };
    }

    /** Manda uma mensagem de teste; devolve o id dela. */
    function sendPing() {
        if (!code) return Promise.resolve(null);
        const ref = refs.messages.push();
        const sentAt = now();
        sentPings.set(ref.key, sentAt);
        return send({ from: uid, name, kind: 'ping', sentAt, payload: JSON.stringify(SAMPLE_PAYLOAD) }, ref);
    }

    /**
     * Sai da sala: para de ouvir o banco, cancela o aviso de queda e
     * apaga o próprio aparelho — ou a sala inteira, se for o dono.
     */
    async function leave() {
        if (!code) return;
        const r = refs;
        const wasHost = isHost;
        code = null;
        isHost = false;
        connected = false;
        devices = [];
        pings = [];
        roundTrips = [];
        r.devices.off('value', onDevices);
        r.messages.off('child_added', onMessage);
        r.connected.off('value', onConnected);
        await r.device.onDisconnect().cancel();
        if (wasHost) await r.room.remove();
        else await r.device.remove();
        changed();
    }

    return { createRoom, joinRoom, sendPing, leave, snapshot };
}

// ============================================
// EXPORTAÇÃO
// ============================================
window.Game = window.Game || {};
window.Game.connectionCheck = {
    create,
    isValidRoomCode,
    SAMPLE_PAYLOAD
};
