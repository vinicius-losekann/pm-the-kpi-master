// ============================================
// PM: The KPI Master - Testes no navegador: teste de conexão pelo Firebase
// ============================================
// A página firebase-check.html (roadmap 2.9) com o emulador do Firebase
// (login anônimo e banco, com as regras de database.rules.json): criar
// sala, entrar, mensagem de teste com eco, F5, saída de quem fecha a aba
// e o que as regras do banco recusam. Checklist: _docs/connection-tests.md.
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
