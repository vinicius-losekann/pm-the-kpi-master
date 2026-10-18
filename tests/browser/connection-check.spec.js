// ============================================
// PM: The KPI Master - Testes no navegador: teste de conexão pelo Firebase
// ============================================
// A página firebase-check.html (roadmap 2.9) com o emulador do Firebase
// (login anônimo e banco, com as regras de database.rules.json): criar
// sala, entrar, mensagem de teste com eco, F5, saída de quem fecha a aba
// e o que as regras do banco recusam — as da página e as das salas do
// jogo (rooms/), usando o login e o banco que a página já carrega.
// Checklist: _docs/connection-tests.md.
// ============================================

const { test, expect, roomCode, SITE } = require('./players');

const DATABASE_URL = 'http://127.0.0.1:9400';
const DATABASE_NAMESPACE = 'demo-pm-the-kpi-master-default-rtdb';

/** Abre a página de teste de conexão e espera o login anônimo. */
async function openCheck(player) {
    if (!player.page || player.page.isClosed()) await player.newTab();
    await player.page.goto(SITE + '/firebase-check.html');
    await waitForLogin(player);
}

async function waitForLogin(player) {
    await player.waitFor(() => window.Game && Game.connectionCheckPage && !!Game.connectionCheckPage.uid, { timeout: 30000 });
}

/** Preenche nome e código e clica em criar ou entrar. */
async function enterRoom(player, code, button) {
    await player.page.fill('#checkName', player.name);
    await player.page.fill('#checkCode', code);
    await player.page.click(button);
}

test('E24 Teste de conexão pelo Firebase: sala inexistente recusada; criar, entrar, mensagem com eco e tempo, F5 volta sozinho e quem fecha a aba sai da lista', async ({ players }) => {
    const code = roomCode();
    const ana = await players.add('Ana');
    const beto = await players.add('Beto');
    await openCheck(ana);
    await openCheck(beto);

    await enterRoom(beto, code, '#btnCheckJoin');
    await expect(beto.page.locator('#checkFeedback'), 'sala que não existe').toHaveAttribute('data-reason', 'room-not-found');

    await enterRoom(ana, code, '#btnCheckCreate');
    await expect(ana.page.locator('#checkStatus')).toHaveAttribute('data-state', 'connected');
    await expect(ana.page.locator('#checkRoom')).toHaveText(code);

    await enterRoom(beto, code, '#btnCheckJoin');
    await expect(beto.page.locator('#checkStatus')).toHaveAttribute('data-state', 'connected');
    await expect(ana.page.locator('#checkDevices li')).toHaveCount(2);
    await expect(beto.page.locator('#checkDevices li')).toHaveCount(2);
    await expect(ana.page.locator('#checkDevices')).toContainText('Beto');

    await beto.page.click('#btnCheckPing');
    await expect(ana.page.locator('#checkLog li[data-kind="ping"]')).toContainText('Beto');
    const echo = beto.page.locator('#checkLog li[data-kind="echo"]');
    await expect(echo).toContainText('Ana');
    await expect(echo).toContainText(/\d+ ms/);
    await expect(beto.page.locator('#checkTraffic')).toContainText(/\d/);

    // F5: a página lembra a sala e entra de novo sozinha.
    await beto.page.reload();
    await waitForLogin(beto);
    await expect(beto.page.locator('#checkStatus')).toHaveAttribute('data-state', 'connected', { timeout: 30000 });
    await expect(beto.page.locator('#checkRoom')).toHaveText(code);
    await expect(ana.page.locator('#checkDevices li')).toHaveCount(2);

    // Fechar a aba: o servidor tira o aparelho da lista.
    await beto.closeTab();
    await expect(ana.page.locator('#checkDevices li'), 'quem fecha a aba sai da lista').toHaveCount(1, { timeout: 30000 });
});

test('E25 Regras do banco no emulador: sem login não lê; fora da sala, sala de outro, aparelho de outro, mensagem em nome de outro e conteúdo grande demais são recusados; ler a sala e gravar o próprio aparelho e a própria mensagem passam', async ({ players }) => {
    const code = roomCode();
    const ana = await players.add('Ana');
    const beto = await players.add('Beto');
    await openCheck(ana);
    await enterRoom(ana, code, '#btnCheckCreate');
    await expect(ana.page.locator('#checkStatus')).toHaveAttribute('data-state', 'connected');
    await openCheck(beto);

    // Sem login (pelo endereço do banco, como qualquer um na internet faria).
    const anonymous = await fetch(DATABASE_URL + '/connectionChecks/' + code + '.json?ns=' + DATABASE_NAMESPACE);
    expect(anonymous.ok, 'ler a sala sem login deveria ser recusado').toBe(false);

    const results = await beto.page.evaluate(async (room) => {
        const db = firebase.database();
        const uid = firebase.auth().currentUser.uid;
        const out = {};
        const attempt = async (name, action) => {
            try { await action(); out[name] = 'allowed'; } catch (e) { out[name] = 'denied'; }
        };
        await attempt('readOutside', () => db.ref('outside').once('value'));
        await attempt('writeOutside', () => db.ref('outside').set(1));
        await attempt('takeOverRoom', () => db.ref(room + '/meta').set({ hostUid: uid, createdAt: 1 }));
        await attempt('removeRoom', () => db.ref(room).remove());
        await attempt('otherDevice', () => db.ref(room + '/devices/uid-de-outro').set({ name: 'X', joinedAt: 1 }));
        await attempt('fakeSender', () => db.ref(room + '/messages').push({ from: 'uid-de-outro', name: 'X', kind: 'ping', sentAt: 1, payload: '{}' }));
        await attempt('hugePayload', () => db.ref(room + '/messages').push({ from: uid, name: 'Beto', kind: 'ping', sentAt: 1, payload: 'x'.repeat(30000) }));
        await attempt('readRoom', () => db.ref(room).once('value'));
        await attempt('ownDevice', () => db.ref(room + '/devices/' + uid).set({ name: 'Beto', joinedAt: 1 }));
        await attempt('ownMessage', () => db.ref(room + '/messages').push({ from: uid, name: 'Beto', kind: 'ping', sentAt: 1, payload: '{}' }));
        return out;
    }, 'connectionChecks/' + code);

    expect(results).toEqual({
        readOutside: 'denied',
        writeOutside: 'denied',
        takeOverRoom: 'denied',
        removeRoom: 'denied',
        otherDevice: 'denied',
        fakeSender: 'denied',
        hugePayload: 'denied',
        readRoom: 'allowed',
        ownDevice: 'allowed',
        ownMessage: 'allowed'
    });

    // A sala continua da Ana.
    const stillAnas = await ana.page.evaluate(async (room) => {
        const snap = await firebase.database().ref(room + '/meta').once('value');
        return !!snap.val() && snap.val().hostUid === firebase.auth().currentUser.uid;
    }, 'connectionChecks/' + code);
    expect(stillAnas, 'a sala deveria continuar com a Ana como dona').toBe(true);
});

/** uid do login anônimo da página aberta. */
async function uidOf(player) {
    return player.page.evaluate(() => firebase.auth().currentUser.uid);
}

/** Valor de um caminho do banco, lido pela página do jogador (com o login dele). */
async function valueAt(player, path) {
    return player.page.evaluate(async (p) => (await firebase.database().ref(p).once('value')).val(), path);
}

/**
 * Tenta cada operação no banco, pela página do jogador (com o login
 * dele), e diz se as regras deixaram ('allowed') ou recusaram
 * ('denied'). Cada passo: [nome, operação, caminho, valor]; operação
 * 'read', 'set', 'push', 'update', 'remove' ou 'onDisconnectSet' (deixa o
 * valor com o servidor para quando a página cair); o valor 'TIMESTAMP'
 * (ou um campo com ele) vira a hora do servidor.
 */
async function attemptAll(player, steps) {
    return player.page.evaluate(async (list) => {
        const db = firebase.database();
        const withTime = (v) => {
            if (v === 'TIMESTAMP') return firebase.database.ServerValue.TIMESTAMP;
            if (v && typeof v === 'object') {
                const out = {};
                Object.keys(v).forEach(k => { out[k] = withTime(v[k]); });
                return out;
            }
            return v;
        };
        const out = {};
        for (const [name, op, path, value] of list) {
            try {
                const ref = db.ref(path);
                if (op === 'read') await ref.once('value');
                else if (op === 'set') await ref.set(withTime(value));
                else if (op === 'push') await ref.push(withTime(value));
                else if (op === 'update') await ref.update(withTime(value));
                else if (op === 'remove') await ref.remove();
                else if (op === 'onDisconnectSet') await ref.onDisconnect().set(withTime(value));
                out[name] = 'allowed';
            } catch (e) {
                out[name] = 'denied';
            }
        }
        return out;
    }, steps);
}

test('E26 Regras do banco para as salas do jogo (rooms/), no emulador: o host cria e grava tudo; quem foi aceito lê o público e o próprio, nunca o secreto; quem não foi aceito só lê a sala, a própria inbox e manda pedido em nome próprio; presença: cada um grava só a própria (no roster ou host), com online e lastSeen = hora do servidor (sem lastSeen ou com hora inventada é recusada; o offline deixado com o servidor vale, com a hora da queda), o host lê todas e quem foi aceito só a do host; troca de host: só por quem está no roster, com hostEpoch + 1, a mesma versão e criação e o sinal do host parado há mais de 5 s (ou sem presença) — depois dela, o host novo lê o secreto e o antigo perde a escrita; sala parada há 2 h pode ser criada de novo por outro', async ({ players }) => {
    const room = 'rooms/' + roomCode();
    const ana = await players.add('Ana');
    const beto = await players.add('Beto');
    const caio = await players.add('Caio');
    for (const p of [ana, beto, caio]) await openCheck(p);
    const [anaUid, betoUid, caioUid] = [await uidOf(ana), await uidOf(beto), await uidOf(caio)];
    const meta = (uid) => ({ hostUid: uid, hostEpoch: 1, protocolVersion: 10, createdAt: 'TIMESTAMP', lastActivity: 'TIMESTAMP' });
    const request = (uid, payload) => ({ from: uid, payload });
    // Sinal de vida: online e a hora do servidor.
    const signal = (online) => ({ online, lastSeen: 'TIMESTAMP' });

    // Sem login (pelo endereço do banco).
    const anonymous = await fetch(DATABASE_URL + '/' + room + '/meta.json?ns=' + DATABASE_NAMESPACE);
    expect(anonymous.ok, 'ler a sala sem login deveria ser recusado').toBe(false);

    expect(await attemptAll(ana, [
        ['createRoom', 'set', room + '/meta', meta(anaUid)],
        ['admitBeto', 'set', room + '/roster/' + betoUid, true],
        ['writePublic', 'set', room + '/public/state', '{"players":[]}'],
        ['writeSecret', 'set', room + '/secret/state', '{"correct":"b"}'],
        ['writeHand', 'set', room + '/hands/' + betoUid, '{"question":"Q"}'],
        ['writeFeed', 'push', room + '/feed', { payload: '{"type":"round-start"}' }],
        ['writeInbox', 'push', room + '/inbox/' + caioUid, { payload: '{"type":"join-rejected"}' }],
        ['touchActivity', 'set', room + '/meta/lastActivity', 'TIMESTAMP'],
        ['ownPresence', 'set', room + '/presence/' + anaUid, signal(true)]
    ]), 'o host').toEqual({
        createRoom: 'allowed', admitBeto: 'allowed', writePublic: 'allowed', writeSecret: 'allowed',
        writeHand: 'allowed', writeFeed: 'allowed', writeInbox: 'allowed', touchActivity: 'allowed',
        ownPresence: 'allowed'
    });

    expect(await attemptAll(beto, [
        ['readMeta', 'read', room + '/meta'],
        ['readPublic', 'read', room + '/public'],
        ['readFeed', 'read', room + '/feed'],
        ['readOwnRoster', 'read', room + '/roster/' + betoUid],
        ['readOwnHand', 'read', room + '/hands/' + betoUid],
        ['ownRequest', 'push', room + '/requests', request(betoUid, '{"type":"answer"}')],
        ['readSecret', 'read', room + '/secret'],
        ['readOtherHand', 'read', room + '/hands/' + caioUid],
        ['readOtherInbox', 'read', room + '/inbox/' + caioUid],
        ['readRoster', 'read', room + '/roster'],
        ['readRequests', 'read', room + '/requests'],
        ['writePublic', 'set', room + '/public/state', '{}'],
        ['writeFeed', 'push', room + '/feed', { payload: '{}' }],
        ['admitCaio', 'set', room + '/roster/' + caioUid, true],
        ['fakeSender', 'push', room + '/requests', request(caioUid, '{}')],
        ['hugeRequest', 'push', room + '/requests', request(betoUid, 'x'.repeat(30000))],
        ['takeOverRoom', 'set', room + '/meta', meta(betoUid)],
        ['touchActivity', 'set', room + '/meta/lastActivity', 1],
        ['removeRoom', 'remove', room],
        ['ownPresence', 'set', room + '/presence/' + betoUid, signal(true)],
        ['readHostPresence', 'read', room + '/presence/' + anaUid],
        ['otherPresence', 'set', room + '/presence/' + caioUid, signal(true)],
        ['badPresence', 'set', room + '/presence/' + betoUid, { online: 'sim', lastSeen: 'TIMESTAMP' }],
        ['presenceWithoutLastSeen', 'set', room + '/presence/' + betoUid, { online: true }],
        ['presenceWithMadeUpTime', 'set', room + '/presence/' + betoUid, { online: true, lastSeen: 1 }],
        ['readOtherPresence', 'read', room + '/presence/' + caioUid],
        ['readAllPresence', 'read', room + '/presence'],
        ['offlineWhenGone', 'onDisconnectSet', room + '/presence/' + betoUid, signal(false)]
    ]), 'quem foi aceito (Beto)').toEqual({
        readMeta: 'allowed', readPublic: 'allowed', readFeed: 'allowed', readOwnRoster: 'allowed',
        readOwnHand: 'allowed', ownRequest: 'allowed',
        readSecret: 'denied', readOtherHand: 'denied', readOtherInbox: 'denied', readRoster: 'denied',
        readRequests: 'denied', writePublic: 'denied', writeFeed: 'denied', admitCaio: 'denied',
        fakeSender: 'denied', hugeRequest: 'denied', takeOverRoom: 'denied', touchActivity: 'denied', removeRoom: 'denied',
        ownPresence: 'allowed', readHostPresence: 'allowed',
        otherPresence: 'denied', badPresence: 'denied', presenceWithoutLastSeen: 'denied', presenceWithMadeUpTime: 'denied',
        readOtherPresence: 'denied', readAllPresence: 'denied', offlineWhenGone: 'allowed'
    });

    // Troca de host numa segunda sala: Ana é o host, Beto foi aceito, Caio não.
    const room2 = 'rooms/' + roomCode();
    expect(await attemptAll(ana, [
        ['createRoom', 'set', room2 + '/meta', meta(anaUid)],
        ['admitBeto', 'set', room2 + '/roster/' + betoUid, true],
        ['ownPresence', 'set', room2 + '/presence/' + anaUid, signal(true)]
    ]), 'o host da segunda sala').toEqual({ createRoom: 'allowed', admitBeto: 'allowed', ownPresence: 'allowed' });
    const meta2 = await valueAt(beto, room2 + '/meta');
    const takeover = (uid, changes = {}) => ({ ...meta2, hostUid: uid, hostEpoch: meta2.hostEpoch + 1, ...changes });

    expect(await attemptAll(beto, [['hostAlive', 'set', room2 + '/meta', takeover(betoUid)]]), 'troca com o host vivo')
        .toEqual({ hostAlive: 'denied' });
    expect(await attemptAll(ana, [['offlineNow', 'set', room2 + '/presence/' + anaUid, signal(false)]]), 'o host fica offline agora')
        .toEqual({ offlineNow: 'allowed' });
    expect(await attemptAll(beto, [['hostJustGone', 'set', room2 + '/meta', takeover(betoUid)]]), 'troca com o sinal do host de menos de 5 s')
        .toEqual({ hostJustGone: 'denied' });

    // Passado o piso de 5 s sem sinal do host.
    await ana.page.waitForTimeout(6000);
    expect(await attemptAll(caio, [['outsideRoster', 'set', room2 + '/meta', takeover(caioUid)]]), 'troca por quem não está no roster (Caio)')
        .toEqual({ outsideRoster: 'denied' });
    expect(await attemptAll(beto, [
        ['skipEpoch', 'set', room2 + '/meta', takeover(betoUid, { hostEpoch: meta2.hostEpoch + 2 })],
        ['sameEpoch', 'set', room2 + '/meta', takeover(betoUid, { hostEpoch: meta2.hostEpoch })],
        ['otherVersion', 'set', room2 + '/meta', takeover(betoUid, { protocolVersion: meta2.protocolVersion + 1 })],
        ['otherCreatedAt', 'set', room2 + '/meta', takeover(betoUid, { createdAt: meta2.createdAt - 1 })],
        ['someoneElse', 'set', room2 + '/meta', takeover(caioUid)],
        ['takeOver', 'set', room2 + '/meta', takeover(betoUid)],
        ['readSecret', 'read', room2 + '/secret'],
        ['readPresence', 'read', room2 + '/presence']
    ]), 'troca de host por quem foi aceito (Beto), com o host parado').toEqual({
        skipEpoch: 'denied', sameEpoch: 'denied', otherVersion: 'denied', otherCreatedAt: 'denied', someoneElse: 'denied',
        takeOver: 'allowed', readSecret: 'allowed', readPresence: 'allowed'
    });
    expect(await attemptAll(ana, [
        ['writePublic', 'set', room2 + '/public/state', '{}'],
        ['ownPresence', 'set', room2 + '/presence/' + anaUid, signal(true)],
        ['takeBack', 'set', room2 + '/meta', { ...meta2, hostUid: anaUid, hostEpoch: meta2.hostEpoch + 2 }]
    ]), 'o host antigo, depois da troca').toEqual({ writePublic: 'denied', ownPresence: 'denied', takeBack: 'denied' });

    // Terceira sala: o host nunca gravou presença — a falta do sinal conta como sinal parado.
    const room3 = 'rooms/' + roomCode();
    expect(await attemptAll(ana, [
        ['createRoom', 'set', room3 + '/meta', meta(anaUid)],
        ['admitBeto', 'set', room3 + '/roster/' + betoUid, true]
    ]), 'o host da terceira sala').toEqual({ createRoom: 'allowed', admitBeto: 'allowed' });
    const meta3 = await valueAt(beto, room3 + '/meta');
    expect(await attemptAll(beto, [['noHostPresence', 'set', room3 + '/meta', { ...meta3, hostUid: betoUid, hostEpoch: meta3.hostEpoch + 1 }]]),
        'troca com o host sem presença').toEqual({ noHostPresence: 'allowed' });

    // Beto fecha a aba: o servidor grava o offline que ele deixou, com a hora da queda.
    const closedAt = await ana.page.evaluate(async () => {
        const offset = (await firebase.database().ref('.info/serverTimeOffset').once('value')).val() || 0;
        return Date.now() + offset;
    });
    await beto.closeTab();
    await expect.poll(() => ana.page.evaluate(async (path) => (await firebase.database().ref(path).once('value')).val(), room + '/presence/' + betoUid),
        { timeout: 20000, message: 'o offline do Beto (onDisconnect) deveria passar pelas regras e ser gravado com a hora da queda' })
        .toEqual(expect.objectContaining({ online: false, lastSeen: expect.any(Number) }));
    const gone = await ana.page.evaluate(async (path) => (await firebase.database().ref(path).once('value')).val(), room + '/presence/' + betoUid);
    expect(gone.lastSeen, 'a hora do offline deveria ser a da queda, não uma antiga').toBeGreaterThanOrEqual(closedAt - 5000);

    expect(await attemptAll(caio, [
        ['readMeta', 'read', room + '/meta'],
        ['readOwnInbox', 'read', room + '/inbox/' + caioUid],
        ['readOwnRoster', 'read', room + '/roster/' + caioUid],
        ['ownRequest', 'push', room + '/requests', request(caioUid, '{"type":"player-join"}')],
        ['readPublic', 'read', room + '/public'],
        ['readFeed', 'read', room + '/feed'],
        ['readSecret', 'read', room + '/secret'],
        ['admitSelf', 'set', room + '/roster/' + caioUid, true],
        ['createOverActiveRoom', 'set', room + '/meta', meta(caioUid)],
        ['ownPresence', 'set', room + '/presence/' + caioUid, signal(true)],
        ['readHostPresence', 'read', room + '/presence/' + anaUid]
    ]), 'quem não foi aceito (Caio)').toEqual({
        readMeta: 'allowed', readOwnInbox: 'allowed', readOwnRoster: 'allowed', ownRequest: 'allowed',
        readPublic: 'denied', readFeed: 'denied', readSecret: 'denied', admitSelf: 'denied', createOverActiveRoom: 'denied',
        ownPresence: 'denied', readHostPresence: 'denied'
    });

    // O host lê a presença de todos, trata os pedidos e deixa a sala parada (última atividade antiga).
    expect(await attemptAll(ana, [
        ['readPresence', 'read', room + '/presence'],
        ['readRequests', 'read', room + '/requests'],
        ['clearRequests', 'remove', room + '/requests'],
        ['oldActivity', 'set', room + '/meta/lastActivity', 1]
    ]), 'o host tratando os pedidos').toEqual({ readPresence: 'allowed', readRequests: 'allowed', clearRequests: 'allowed', oldActivity: 'allowed' });

    // Sala parada: outro cria de novo, limpa o que sobrou e passa a ser o host.
    expect(await attemptAll(caio, [
        ['createIdleRoom', 'set', room + '/meta', meta(caioUid)],
        ['clearLeftovers', 'update', room, { roster: null, public: null, secret: null, hands: null, feed: null, inbox: null, requests: null, presence: null }],
        ['readSecret', 'read', room + '/secret']
    ]), 'reaproveitando a sala parada (Caio)').toEqual({ createIdleRoom: 'allowed', clearLeftovers: 'allowed', readSecret: 'allowed' });

    expect(await attemptAll(ana, [
        ['writePublic', 'set', room + '/public/state', '{}'],
        ['removeRoom', 'remove', room]
    ]), 'o host antigo, depois que outro criou a sala').toEqual({ writePublic: 'denied', removeRoom: 'denied' });

    expect(await attemptAll(caio, [['removeRoom', 'remove', room]]), 'o host novo apagando a sala').toEqual({ removeRoom: 'allowed' });
});
