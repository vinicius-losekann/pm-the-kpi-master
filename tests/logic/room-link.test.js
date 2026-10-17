// ============================================
// PM: The KPI Master - Testes de lógica: O jogo pelo canal da sala
// ============================================
// Confere js/network/roomLink.js, a ligação do jogo ao canal da sala
// (js/network/roomChannel.js), e js/network/firebaseLogin.js, o login
// anônimo: criar a sala na tela inicial e abrir o jogo (o papel vem do
// banco), pedidos ao host, avisos para todos e para um jogador, o cursor
// dos avisos de quem entra, recusa, queda e volta pela presença, F5 de
// guest e do host, host que cai (sem troca de host), aba duplicada e
// sair da sala.
// Cada aparelho é um ambiente do environment.js com o canal e a ligação
// reais, ligado ao Firebase simulado de fakeFirebase.js (o mesmo banco
// para todos). Os arquivos são carregados dentro de cada teste.
// Rodar a partir da raiz:
//     node tests/logic/room-link.test.js
// ============================================

const { fs, path, vm, ROOT, createEnvironment, test, check, start, finish, recordScreens } = require('./environment');
const { createFakeFirebase, flush } = require('./fakeFirebase');

start('O jogo pelo canal da sala');

// O framework de environment.js é síncrono; aqui cada caso é
// assíncrono: roda tudo antes e depois registra o resultado com test().
const cases = [];
function asyncTest(name, fn) {
    cases.push({ name, fn });
}

const ROOM = 'sala01';

/** Deixa rodar as promessas e os avisos encadeados do banco simulado. */
async function settle() {
    for (let i = 0; i < 4; i++) await flush();
}

/** Cópia simples (tira o objeto do contexto vm). */
const copy = (x) => (x === undefined ? undefined : JSON.parse(JSON.stringify(x)));

/**
 * Um navegador: o localStorage de todas as abas dele e o
 * BroadcastChannel que liga as abas (só as do mesmo navegador). Cada aba
 * tem o próprio construtor; fechar a aba fecha os canais dela.
 */
function fakeBrowser() {
    const storage = {};
    const channels = [];
    let tabs = 0;
    function openTab() {
        const tab = ++tabs;
        function BroadcastChannel(name) {
            const listeners = [];
            const me = {
                name, tab, closed: false, onmessage: null,
                postMessage(data) {
                    if (me.closed) return;
                    const text = JSON.stringify(data);
                    channels.filter(c => c !== me && !c.closed && c.name === name).forEach(c => {
                        setTimeout(() => {
                            if (c.closed) return;
                            const event = { data: JSON.parse(text) };
                            if (typeof c.onmessage === 'function') c.onmessage(event);
                            c.listeners.forEach(fn => fn(event));
                        }, 0);
                    });
                },
                addEventListener(type, fn) { if (type === 'message') listeners.push(fn); },
                removeEventListener(type, fn) { const i = listeners.indexOf(fn); if (i >= 0) listeners.splice(i, 1); },
                close() { me.closed = true; },
                listeners
            };
            channels.push(me);
            return me;
        }
        return {
            BroadcastChannel,
            close() { channels.filter(c => c.tab === tab).forEach(c => { c.closed = true; }); }
        };
    }
    return { storage, openTab };
}

/**
 * Uma aba com o jogo aberto, no navegador `browser`: ambiente com o
 * canal e a ligação reais (o envio vai pelo banco), o aparelho `uid` no
 * banco simulado e o relógio `clock`. Cada mensagem que o jogo trata
 * (Game.network.handleMessage) fica em `handled`, com quem mandou.
 */
function linkedDevice(fake, uid, name, clock, browser = fakeBrowser()) {
    for (const file of ['js/network/roomChannel.js', 'js/network/roomLink.js']) {
        if (!fs.existsSync(path.join(ROOT, file))) throw new Error('Arquivo não encontrado: ' + file);
    }
    const tab = browser.openTab();
    const env = createEnvironment({ storage: browser.storage, realLink: true });
    env.ctx.setTimeout = setTimeout;
    env.ctx.clearTimeout = clearTimeout;
    env.ctx.BroadcastChannel = tab.BroadcastChannel;
    const alerts = [];
    env.ctx.alert = (text) => { alerts.push(String(text)); };
    env.state.playerName = name;
    env.state.roomName = ROOM;
    const handled = [];
    const handleMessage = env.Game.network.handleMessage;
    env.Game.network.handleMessage = (msg, from) => {
        handled.push({ type: msg && msg.type, from, msg: copy(msg) });
        return handleMessage(msg, from);
    };
    const device = fake.client(uid);
    const link = (code) => ({ db: device.db, uid, code, now: () => clock.now, timestamp: () => clock.now });
    return {
        env, device, browser, alerts, handled, uid, name,
        types: () => handled.map(h => h.type),
        create: (code = ROOM) => env.Game.network.createRoom(link(code)),
        open: (code = ROOM, extra = {}) => env.Game.network.openRoom({ ...link(code), ...extra }),
        /** Fecha a aba (ou recarrega): o aparelho cai e os canais da aba fecham. */
        close() {
            device.close();
            tab.close();
        }
    };
}

/**
 * Ana cria a sala na tela inicial (uma aba) e abre o jogo (outra aba do
 * mesmo navegador), como o host faz; entra na lista como o setupUI faria.
 */
async function hostRoom(fake, clock) {
    const browser = fakeBrowser();
    const entry = linkedDevice(fake, 'uid-host', 'Ana', clock, browser);
    const created = await entry.create();
    await settle();
    check(created && created.ok === true, 'a tela inicial deveria criar a sala, veio: ' + JSON.stringify(created));
    check(entry.device.listenerCount() === 0, 'depois de criar, a tela inicial deveria parar de ouvir a sala (senão consumiria os pedidos de entrada), ouvintes: ' + entry.device.listenerCount());
    entry.close();
    await settle();
    const host = linkedDevice(fake, 'uid-host', 'Ana', clock, browser);
    const opened = await host.open();
    await settle();
    check(opened && opened.ok === true && opened.isHost === true, 'Ana deveria abrir o jogo como host, veio: ' + JSON.stringify(opened));
    const C = host.env.CONFIG;
    host.env.state.players = [{
        name: 'Ana', peerId: 'uid-host', isHost: true, kpi: 0, focusArea: C.FOCUS_AREAS[0].id,
        activities: 0, waitingInLobby: false, resources: C.STARTING_RESOURCES
    }];
    host.env.Game.saveState();
    return host;
}

/** Um guest abre o jogo (link da sala) num navegador próprio. */
async function guestJoins(fake, clock, uid, name, browser) {
    const guest = linkedDevice(fake, uid, name, clock, browser);
    const opened = await guest.open();
    await settle();
    check(opened && opened.ok === true && opened.isHost === false, name + ' deveria abrir o jogo como guest, veio: ' + JSON.stringify(opened));
    return guest;
}

asyncTest('T167 Ligação do host: a tela inicial cria a sala com a versão do jogo; no jogo, o papel vem do meta; pedidos chegam ao handleMessage com o uid de quem pediu e são apagados; broadcastAll vai pelo feed e sendToPlayer pela inbox (para o próprio host, na hora)', async () => {
    const fake = createFakeFirebase();
    const clock = { now: 1000 };
    const host = await hostRoom(fake, clock);
    const version = host.env.Game.network.PROTOCOL_VERSION;
    const meta = fake.read('rooms/' + ROOM + '/meta');
    check(version >= 10 && meta && meta.hostUid === 'uid-host' && meta.protocolVersion === version,
        'a sala deveria ser criada com o dono e a versão do jogo (' + version + '), veio: ' + JSON.stringify(meta));
    check(host.env.state.isHost === true && host.env.state.peerId === 'uid-host',
        'o host deveria ficar com isHost e com o uid em peerId, veio: ' + JSON.stringify({ isHost: host.env.state.isHost, peerId: host.env.state.peerId }));

    // Código em uso: a tela inicial recusa.
    const other = linkedDevice(fake, 'uid-caio', 'Caio', clock);
    const again = await other.create();
    await settle();
    check(again && again.ok === false && again.reason === 'room-exists', 'código em uso deveria dar room-exists, veio: ' + JSON.stringify(again));
    other.close();

    // Beto entra: o pedido chega ao host com o uid dele.
    const beto = await guestJoins(fake, clock, 'uid-beto', 'Beto');
    check(beto.env.state.isHost === false && beto.env.state.peerId === 'uid-beto',
        'Beto deveria ficar como guest, com o uid em peerId, veio: ' + JSON.stringify({ isHost: beto.env.state.isHost, peerId: beto.env.state.peerId }));
    const join = host.handled.find(h => h.type === 'player-join');
    check(join && join.from === 'uid-beto' && join.msg.playerName === 'Beto' && join.msg.peerId === 'uid-beto' &&
        join.msg.protocolVersion === version && !('token' in join.msg),
        'o host deveria tratar o player-join de Beto (nome, uid, versão, sem token), veio: ' + JSON.stringify(join));
    check(host.env.player('Beto') && host.env.player('Beto').peerId === 'uid-beto', 'Beto deveria entrar na lista do host com o uid');
    check(fake.read('rooms/' + ROOM + '/roster/uid-beto') === true, 'Beto deveria ser aceito no roster da sala');
    check(fake.read('rooms/' + ROOM + '/requests') === undefined, 'os pedidos deveriam ser apagados depois de tratados');
    const sync = beto.handled.find(h => h.type === 'state-sync');
    check(sync && sync.from === 'uid-host' && beto.env.state.players.length === 2,
        'Beto deveria receber o estado da sala do host, veio: ' + JSON.stringify(beto.types()));

    // Pedido de Beto: chega com o uid dele.
    beto.env.Game.network.sendToHost({ type: 'answer', alternative: 'a', playerName: 'Beto' });
    await settle();
    check(host.handled.some(h => h.type === 'answer' && h.from === 'uid-beto'), 'o pedido de Beto deveria chegar ao host com o uid dele');

    // Aviso para todos: Beto trata uma vez; o host não trata o próprio aviso.
    host.env.Game.network.broadcastAll({ type: 'round-ended' });
    await settle();
    const ended = beto.handled.filter(h => h.type === 'round-ended');
    check(ended.length === 1 && ended[0].from === 'uid-host' && beto.env.state.roundEnded === true,
        'Beto deveria tratar o aviso para todos uma vez, veio: ' + JSON.stringify(beto.types()));
    check(!host.handled.some(h => h.type === 'round-ended'), 'o host não deveria tratar o próprio aviso para todos');

    // Aviso para um jogador: pela inbox dele.
    host.env.Game.network.sendToPlayer('uid-beto', { type: 'match-paused' });
    await settle();
    check(beto.handled.filter(h => h.type === 'match-paused').length === 1, 'Beto deveria receber o aviso só para ele');

    // Para o próprio host: tratado na hora, sem passar pelo banco.
    host.env.Game.network.sendToPlayer('uid-host', { type: 'round-ended' });
    check(host.handled.some(h => h.type === 'round-ended'), 'o aviso do host para si mesmo deveria ser tratado na hora');
    await settle();
    check(fake.read('rooms/' + ROOM + '/inbox/uid-host') === undefined, 'o aviso do host para si mesmo não deveria passar pelo banco');
});

asyncTest('T168 Cursor dos avisos: quem entra recebe o estado com o feedCursor e nenhum aviso para todos de antes dele; os de depois chegam uma vez, na ordem', async () => {
    const fake = createFakeFirebase();
    const clock = { now: 1000 };
    const host = await hostRoom(fake, clock);
    const beto = await guestJoins(fake, clock, 'uid-beto', 'Beto');
    host.env.Game.network.broadcastAll({ type: 'round-ended' });
    await settle();
    check(Object.keys(fake.read('rooms/' + ROOM + '/feed') || {}).length >= 2, 'pré-condição: já há avisos para todos no feed');

    // Caio entra: só o estado, com o cursor; os avisos de antes (inclusive
    // a lista de jogadores da própria entrada) não chegam.
    const caio = await guestJoins(fake, clock, 'uid-caio', 'Caio');
    check(JSON.stringify(caio.types()) === '["state-sync"]',
        'Caio deveria tratar só o estado da sala, sem os avisos de antes dele, tratou: ' + JSON.stringify(caio.types()));
    const fullState = caio.handled[0].msg.fullState;
    const feedKeys = Object.keys(fake.read('rooms/' + ROOM + '/feed') || {}).sort();
    check(typeof fullState.feedCursor === 'string' && fullState.feedCursor === feedKeys[feedKeys.length - 1],
        'o state-sync deveria levar o cursor do último aviso para todos, veio: ' + JSON.stringify(fullState.feedCursor));
    check(caio.env.state.players.length === 3, 'Caio deveria ter a lista com os 3 jogadores pelo estado');

    // Avisos de depois: uma vez cada, na ordem, para Caio e para Beto.
    host.env.Game.network.broadcastAll({ type: 'match-paused' });
    host.env.Game.network.broadcastAll({ type: 'round-ended' });
    await settle();
    check(JSON.stringify(caio.types()) === '["state-sync","match-paused","round-ended"]',
        'Caio deveria receber os avisos de depois da entrada uma vez, na ordem, veio: ' + JSON.stringify(caio.types()));
    const betoAfter = beto.types().slice(beto.types().lastIndexOf('player-list') + 1);
    check(JSON.stringify(betoAfter) === '["match-paused","round-ended"]',
        'Beto deveria receber os mesmos avisos uma vez, na ordem, veio: ' + JSON.stringify(beto.types()));
});

asyncTest('T169 Recusa pela inbox: quem é recusado vê o aviso, volta à tela inicial, para de ouvir a sala e não entra no roster; sala inexistente e versão diferente nem chegam a pedir', async () => {
    const fake = createFakeFirebase();
    const clock = { now: 1000 };
    const host = await hostRoom(fake, clock);
    await guestJoins(fake, clock, 'uid-beto', 'Beto');
    host.env.startMatch();
    await settle();

    // Nome novo com a partida em andamento: room-locked.
    const caio = linkedDevice(fake, 'uid-caio', 'Caio', clock);
    const opened = await caio.open();
    await settle();
    check(opened && opened.ok === true, 'Caio deveria chegar à sala (a recusa vem do host), veio: ' + JSON.stringify(opened));
    check(JSON.stringify(caio.types()) === '["join-rejected"]' && caio.handled[0].msg.reason === 'room-locked',
        'Caio deveria receber só a recusa room-locked, recebeu: ' + JSON.stringify(caio.handled.map(h => h.msg)));
    check(caio.alerts.length === 1 && caio.env.ctx.location.href === './', 'Caio deveria ver o aviso e voltar à tela inicial');
    check(fake.read('rooms/' + ROOM + '/roster/uid-caio') === undefined, 'quem é recusado não entra no roster');
    check(caio.device.listenerCount() === 0, 'quem é recusado deveria parar de ouvir a sala, ouvintes: ' + caio.device.listenerCount());
    check(host.env.state.players.length === 2 && !host.env.player('Caio'), 'a lista do host não muda');

    // Sala que não existe: não pede nada.
    const lost = linkedDevice(fake, 'uid-duda', 'Duda', clock);
    const notFound = await lost.open('semsala');
    await settle();
    check(notFound && notFound.ok === false && notFound.reason === 'room-not-found' && lost.device.writes.length === 0,
        'sala inexistente deveria dar room-not-found sem gravar nada, veio: ' + JSON.stringify(notFound));

    // Outra versão do jogo na sala: não pede nada.
    fake.write('rooms/' + ROOM + '/meta/protocolVersion', host.env.Game.network.PROTOCOL_VERSION - 1);
    const old = linkedDevice(fake, 'uid-eva', 'Eva', clock);
    const mismatch = await old.open();
    await settle();
    check(mismatch && mismatch.ok === false && mismatch.reason === 'version-mismatch' && old.device.writes.length === 0,
        'sala de outra versão deveria dar version-mismatch sem gravar nada, veio: ' + JSON.stringify(mismatch));
});

asyncTest('T170 Queda pela presença: no lobby, quem cai sai da lista e do roster; na partida, fica desconectado com a vaga reservada; os outros veem', async () => {
    const fake = createFakeFirebase();
    const clock = { now: 1000 };
    const host = await hostRoom(fake, clock);
    const beto = await guestJoins(fake, clock, 'uid-beto', 'Beto');
    const caio = await guestJoins(fake, clock, 'uid-caio', 'Caio');

    beto.device.goOffline();
    await settle();
    check(!host.env.player('Beto'), 'no lobby, quem cai deveria sair da lista do host');
    check(fake.read('rooms/' + ROOM + '/roster/uid-beto') === undefined && fake.read('rooms/' + ROOM + '/presence/uid-beto') === undefined,
        'no lobby, quem cai deveria sair do roster e da presença');
    check(caio.env.state.players.length === 2 && !caio.env.state.players.some(p => p.name === 'Beto'), 'Caio deveria ver a lista sem Beto');

    // Na partida: Dani fecha a aba.
    const fake2 = createFakeFirebase();
    const host2 = await hostRoom(fake2, clock);
    const eli = await guestJoins(fake2, clock, 'uid-eli', 'Eli');
    const dani = await guestJoins(fake2, clock, 'uid-dani', 'Dani');
    host2.env.startMatch();
    await settle();
    dani.close();
    await settle();
    const d = host2.env.player('Dani');
    check(d && d.disconnected === true && d.peerId === 'uid-dani', 'na partida, Dani deveria ficar na lista como desconectada, veio: ' + JSON.stringify(d));
    check(fake2.read('rooms/' + ROOM + '/roster/uid-dani') === true, 'na partida, a vaga de Dani continua no roster');
    const seen = eli.env.state.players.find(p => p.name === 'Dani');
    check(seen && seen.disconnected === true, 'Eli deveria ver Dani desconectada');
});

asyncTest('T171 Volta da conexão e F5 de guest: quem volta manda o player-join de novo e retoma o lugar pelo uid; nenhum aviso de antes do estado chega depois dele', async () => {
    const fake = createFakeFirebase();
    const clock = { now: 1000 };
    const host = await hostRoom(fake, clock);
    const beto = await guestJoins(fake, clock, 'uid-beto', 'Beto');
    host.env.startMatch();
    await settle();

    // A conexão de Beto cai (a partida pausa) e volta.
    beto.device.goOffline();
    await settle();
    check(host.env.state.matchPaused && host.env.player('Beto').disconnected === true, 'pré-condição: partida pausada com Beto desconectado');
    beto.handled.length = 0;
    beto.device.goOnline();
    await settle();
    check(host.handled.filter(h => h.type === 'player-join' && h.from === 'uid-beto').length === 2, 'Beto deveria mandar o player-join de novo ao voltar');
    check(!host.env.player('Beto').disconnected && !host.env.state.matchPaused && host.env.state.currentRound,
        'a volta de Beto deveria retomar a partida no host');
    const types = beto.types();
    const at = types.indexOf('state-sync');
    check(at >= 0 && !types.slice(at + 1).includes('match-paused'),
        'nenhum aviso de antes do estado (a pausa) pode chegar depois dele, veio: ' + JSON.stringify(types));
    check(types.slice(at + 1).filter(t => t === 'round-start').length === 1, 'a retomada (round-start) deveria chegar uma vez, depois do estado, veio: ' + JSON.stringify(types));
    check(beto.env.state.gameStarted === true && beto.env.state.currentRound, 'Beto deveria ficar com a partida e a rodada retomadas');

    // F5 de Beto: aba nova, mesmo navegador, mesmo uid.
    beto.close();
    await settle();
    check(host.env.player('Beto').disconnected === true, 'pré-condição: Beto desconectado durante o F5');
    const again = linkedDevice(fake, 'uid-beto', 'Beto', clock, beto.browser);
    const opened = await again.open();
    await settle();
    check(opened && opened.ok === true && !again.types().includes('join-rejected') && again.types().includes('state-sync'),
        'depois do F5, Beto deveria voltar sem recusa, recebeu: ' + JSON.stringify(again.types()));
    const b = host.env.player('Beto');
    check(b && !b.disconnected && b.peerId === 'uid-beto' && host.env.state.players.length === 2, 'Beto deveria voltar ao mesmo lugar, veio: ' + JSON.stringify(host.env.state.players));
    check(again.env.state.gameStarted === true, 'Beto deveria voltar à partida');
});

asyncTest('T172 Host que cai: os outros veem "Host desconectado" e a sala espera, sem troca de host; F5 do host pelo estado salvo trata os pedidos que esperaram no banco', async () => {
    const fake = createFakeFirebase();
    const clock = { now: 1000 };
    const host = await hostRoom(fake, clock);
    const beto = await guestJoins(fake, clock, 'uid-beto', 'Beto');
    const screens = recordScreens(beto.env);
    const lastStatus = () => screens.filter(s => s.name === 'updateConnectionStatus').pop();

    host.device.goOffline();
    await settle();
    const down = lastStatus();
    check(down && down.args[0] === 'disconnected' && down.args[1] === 'connection.hostDisconnected',
        'Beto deveria ver "Host desconectado", viu: ' + JSON.stringify(down && down.args));
    check(beto.env.state.isHost === false && fake.read('rooms/' + ROOM + '/meta/hostUid') === 'uid-host', 'ninguém assume a sala (sem troca de host)');
    host.device.goOnline();
    await settle();
    const up = lastStatus();
    check(up && up.args[0] === 'connected', 'com o host de volta, Beto deveria ver a conexão de novo, viu: ' + JSON.stringify(up && up.args));

    // F5 do host: Caio pede para entrar enquanto a página recarrega.
    host.close();
    await settle();
    const caio = linkedDevice(fake, 'uid-caio', 'Caio', clock);
    await caio.open();
    await settle();
    check(Object.keys(fake.read('rooms/' + ROOM + '/requests') || {}).length === 1 && !caio.types().includes('state-sync'),
        'o pedido de Caio deveria esperar no banco');
    const reloaded = linkedDevice(fake, 'uid-host', 'Ana', clock, host.browser);
    reloaded.env.ctx.location.search = '?' + new URLSearchParams({ room: ROOM, playerName: 'Ana' }).toString();
    check(reloaded.env.Game.persistence.tryRestoreState() === true, 'o F5 do host deveria restaurar o estado salvo (URL só com a sala e o nome)');
    // onOpen (o main.js monta a tela e retoma a partida ali) roda com o
    // papel já no estado e antes de o pedido que esperou ser tratado.
    let atOpen = null;
    const onOpen = () => { atOpen = { isHost: reloaded.env.state.isHost, players: reloaded.env.state.players.length }; };
    const opened = await reloaded.open(ROOM, { onOpen });
    await settle();
    check(opened && opened.ok === true && opened.isHost === true && reloaded.env.state.isHost === true, 'depois do F5, Ana continua host pelo meta, veio: ' + JSON.stringify(opened));
    check(atOpen && atOpen.isHost === true && atOpen.players === 2,
        'onOpen deveria rodar como host e antes do pedido de Caio, veio: ' + JSON.stringify(atOpen));
    check(reloaded.env.state.players.length === 3 && reloaded.env.player('Beto') && reloaded.env.player('Caio'),
        'o host deveria ter Beto (do estado salvo) e Caio (do pedido que esperou), veio: ' + JSON.stringify(reloaded.env.state.players));
    check(caio.types().includes('state-sync') && fake.read('rooms/' + ROOM + '/requests') === undefined, 'Caio deveria receber o estado e o pedido sair do banco');
    check(beto.env.state.players.length === 3, 'Beto deveria ver Caio na lista');

    // Com o host de volta, Beto (que ficou na sala) pede o estado de novo:
    // o que mudou no F5 (ex.: o apoio cancelado) chega a ele.
    check(reloaded.handled.some(h => h.type === 'player-join' && h.from === 'uid-beto'),
        'Beto deveria mandar o player-join de novo quando o host volta, o host tratou: ' + JSON.stringify(reloaded.handled.map(h => h.type + ':' + h.from)));
    const betoTypes = beto.types();
    check(betoTypes.filter(t => t === 'state-sync').length === 3,
        'Beto deveria receber o estado ao entrar e depois de cada volta do host (queda e F5), recebeu: ' + JSON.stringify(betoTypes));
    check(reloaded.env.player('Beto').disconnected === false, 'Beto deveria ficar como conectado (disconnected false) na lista do host');
});

asyncTest('T173 Aba duplicada: outra aba do mesmo navegador com a mesma sala não entra (tab-in-use) e não mexe na sala; fechada a primeira, a aba nova entra', async () => {
    const fake = createFakeFirebase();
    const clock = { now: 1000 };
    const host = await hostRoom(fake, clock);
    const beto = await guestJoins(fake, clock, 'uid-beto', 'Beto');

    const second = linkedDevice(fake, 'uid-beto', 'Beto', clock, beto.browser);
    const refused = await second.open();
    await settle();
    check(refused && refused.ok === false && refused.reason === 'tab-in-use', 'a segunda aba deveria dar tab-in-use, veio: ' + JSON.stringify(refused));
    check(second.device.writes.length === 0, 'a segunda aba não deveria gravar nada no banco');
    check(host.handled.filter(h => h.type === 'player-join').length === 1, 'a segunda aba não pode pedir para entrar');
    check(!beto.types().includes('join-rejected') && !host.env.player('Beto').disconnected, 'a primeira aba continua na sala');

    // Outro navegador com o mesmo nome não cai nesse aviso: é o host quem decide (name-taken).
    const other = linkedDevice(fake, 'uid-outro', 'Beto', clock);
    const otherOpened = await other.open();
    await settle();
    check(otherOpened && otherOpened.ok === true && other.handled.some(h => h.type === 'join-rejected' && h.msg.reason === 'name-taken'),
        'outro navegador com o nome de Beto deveria ser recusado pelo host (name-taken), veio: ' + JSON.stringify(other.handled.map(h => h.msg)));

    // Fechada a primeira aba, uma aba nova do mesmo navegador entra.
    beto.close();
    await settle();
    const third = linkedDevice(fake, 'uid-beto', 'Beto', clock, beto.browser);
    const opened = await third.open();
    await settle();
    check(opened && opened.ok === true && third.types().includes('state-sync'), 'com a primeira aba fechada, a nova deveria entrar, veio: ' + JSON.stringify(opened));
});

/**
 * Firebase falso para o login: initializeApp, auth() e database() da API
 * "compat", com o emulador e o login anônimo. `calls` guarda o que o
 * login pediu. `failSignIn` faz o login anônimo falhar.
 */
function fakeFirebaseSdk(fake, uid, failSignIn = false) {
    const calls = [];
    const db = fake.client(uid).db;
    const observers = [];
    const auth = {
        currentUser: null,
        useEmulator: (url) => { calls.push(['authEmulator', url]); },
        signInAnonymously: () => {
            calls.push(['signIn']);
            if (failSignIn) return Promise.reject(new Error('auth/network-request-failed'));
            auth.currentUser = { uid, isAnonymous: true };
            setTimeout(() => observers.forEach(cb => cb(auth.currentUser)), 0);
            return Promise.resolve({ user: auth.currentUser });
        },
        onAuthStateChanged: (cb) => {
            observers.push(cb);
            setTimeout(() => cb(auth.currentUser), 0);
            return () => { const i = observers.indexOf(cb); if (i >= 0) observers.splice(i, 1); };
        }
    };
    const database = { ref: db.ref, useEmulator: (host, port) => { calls.push(['databaseEmulator', host, port]); } };
    const firebase = {
        apps: [],
        initializeApp: (config) => { calls.push(['initializeApp', copy(config)]); firebase.apps.push({}); return {}; },
        auth: () => auth,
        database: () => database
    };
    firebase.database.ServerValue = { TIMESTAMP: { '.sv': 'timestamp' } };
    return { firebase, calls, database };
}

asyncTest('T174 Login anônimo (firebaseLogin.js): emulador quando configurado, uid do login, banco e hora do servidor; falha do login vira erro; sair da sala: o guest para de ouvir, o host apaga a sala', async () => {
    const file = 'js/network/firebaseLogin.js';
    if (!fs.existsSync(path.join(ROOT, file))) throw new Error('Arquivo não encontrado: ' + file);
    const loginIn = () => {
        const ctx = vm.createContext({ console: { log() {}, warn() {}, error() {}, info() {} }, setTimeout, clearTimeout });
        vm.runInContext('var window = this;', ctx);
        vm.runInContext(fs.readFileSync(path.join(ROOT, file), 'utf8'), ctx, { filename: file });
        return ctx.Game.network.firebaseLogin;
    };
    const fake = createFakeFirebase();
    const config = { apiKey: 'demo-key', projectId: 'demo-pm-the-kpi-master' };

    // Com o emulador.
    const sdk = fakeFirebaseSdk(fake, 'uid-login');
    const result = await loginIn().start({ firebase: sdk.firebase, config, emulator: { host: '127.0.0.1', authPort: 9099, databasePort: 9400 } });
    check(result && result.uid === 'uid-login' && result.db === sdk.database, 'o login deveria devolver o uid e o banco, veio: ' + JSON.stringify(result && result.uid));
    check(typeof result.timestamp === 'function' && JSON.stringify(result.timestamp()) === JSON.stringify(sdk.firebase.database.ServerValue.TIMESTAMP),
        'timestamp() deveria ser a hora do servidor (ServerValue.TIMESTAMP)');
    const names = sdk.calls.map(c => c[0]);
    check(JSON.stringify(sdk.calls.find(c => c[0] === 'initializeApp')[1]) === JSON.stringify(config), 'deveria iniciar o Firebase com o config');
    check(sdk.calls.some(c => c[0] === 'authEmulator' && c[1] === 'http://127.0.0.1:9099') &&
        sdk.calls.some(c => c[0] === 'databaseEmulator' && c[1] === '127.0.0.1' && c[2] === 9400),
        'com o emulador, login e banco deveriam apontar para ele, veio: ' + JSON.stringify(sdk.calls));
    check(names.indexOf('signIn') > names.indexOf('authEmulator') && names.indexOf('signIn') > names.indexOf('databaseEmulator'),
        'o emulador deveria ser ligado antes do login, veio: ' + names.join(', '));

    // Sem o emulador: o Firebase de verdade.
    const real = fakeFirebaseSdk(fake, 'uid-real');
    const realResult = await loginIn().start({ firebase: real.firebase, config, emulator: null });
    check(realResult && realResult.uid === 'uid-real' && !real.calls.some(c => /Emulator$/.test(c[0])), 'sem emulador, nada deveria apontar para ele, veio: ' + JSON.stringify(real.calls));

    // Login que falha: a promessa é recusada.
    const failing = fakeFirebaseSdk(fake, 'uid-x', true);
    let error = null;
    try {
        await loginIn().start({ firebase: failing.firebase, config, emulator: null });
    } catch (e) {
        error = e;
    }
    check(error, 'login que falha deveria recusar a promessa');

    // Sair da sala.
    const clock = { now: 1000 };
    const host = await hostRoom(fake, clock);
    const beto = await guestJoins(fake, clock, 'uid-beto', 'Beto');
    beto.env.Game.network.cleanup();
    await settle();
    check(beto.device.listenerCount() === 0, 'o guest que sai deveria parar de ouvir a sala, ouvintes: ' + beto.device.listenerCount());
    check(!('pmKPI_roomState' in beto.browser.storage), 'o guest que sai deveria apagar o estado salvo');
    beto.close();
    await settle();
    check(!host.env.player('Beto'), 'o host deveria ver a saída de Beto (pela presença)');
    host.env.Game.network.cleanup();
    await settle();
    check(fake.read('rooms/' + ROOM) === undefined, 'o host que sai deveria apagar a sala, sobrou: ' + JSON.stringify(fake.read('rooms/' + ROOM)));
    check(!('pmKPI_roomState' in host.browser.storage), 'o host que sai deveria apagar o estado salvo');
});

(async () => {
    for (const c of cases) {
        let error = null;
        try {
            await c.fn();
        } catch (err) {
            error = err;
        }
        test(c.name, () => { if (error) throw error; });
    }
    finish('O jogo pelo canal da sala');
})();
