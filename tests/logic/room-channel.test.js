// ============================================
// PM: The KPI Master - Testes de lógica: Canal da sala pelo Firebase
// ============================================
// Confere js/network/roomChannel.js, o canal por onde o jogo vai
// conversar pelo Firebase Realtime Database (roadmap 2.9): criar sala,
// reaproveitar sala parada, entrar, versão do jogo, F5, aceitar e tirar
// da sala (roster), pedidos ao host (requests), avisos do host para todos
// (feed) e para um jogador (inbox), publicar e ler o estado (público,
// secreto e o de cada jogador), limpar e sair; a presença, o cursor dos
// avisos para todos e a volta da conexão; o sinal de vida (lastSeen) e a
// tolerância de quem cai; a troca de host (transação no meta); e as
// regras do banco para rooms/ (database.rules.json).
// O banco é o Firebase simulado de fakeFirebase.js, com vários
// aparelhos; as regras de verdade são conferidas no emulador (E26).
// Rodar a partir da raiz:
//     node tests/logic/room-channel.test.js
// ============================================

const { fs, path, vm, ROOT, test, check, start, finish } = require('./environment');
const { createFakeFirebase, flush, SERVER_TIMESTAMP } = require('./fakeFirebase');

start('Canal da sala pelo Firebase');

// O framework de environment.js é síncrono; aqui cada caso é
// assíncrono: roda tudo antes e depois registra o resultado com test().
const cases = [];
function asyncTest(name, fn) {
    cases.push({ name, fn });
}

const VERSION = 10;
const HOUR_MS = 60 * 60 * 1000;

// Tempos do sinal de vida passados ao canal. Diferentes dos reais do
// config (2 s, 20 s e 10 s): o canal tem de usar as opções, não um número fixo.
const TIMING = { heartbeatInterval: 3000, presenceTimeout: 15000, hostTimeout: 8000 };

/**
 * Timers de um aparelho (setInterval/clearInterval do contexto dele),
 * guardados no relógio do teste: elapse() os roda conforme a hora anda.
 * Os de aparelho fechado (F5) ou congelado (tela bloqueada) não rodam.
 */
function deviceTimers(clock, owner) {
    clock.timers = clock.timers || [];
    return {
        setInterval(fn, ms) {
            const every = Math.max(ms || 0, 100);
            clock.timers.push({ fn, every, next: clock.now + every, active: true, owner });
            return clock.timers.length;
        },
        clearInterval(id) {
            if (clock.timers && clock.timers[id - 1]) clock.timers[id - 1].active = false;
        }
    };
}

/** A hora anda `ms`, de 500 em 500 ms, rodando os timers que vencem e as promessas. */
async function elapse(clock, ms) {
    const end = clock.now + ms;
    while (clock.now < end) {
        clock.now = Math.min(clock.now + 500, end);
        for (const t of (clock.timers || []).slice()) {
            if (!t.active || t.owner.device.closed || t.owner.frozen) {
                // Timer parado não acumula: volta a contar de agora.
                t.next = Math.max(t.next, clock.now + t.every);
                continue;
            }
            while (t.active && t.next <= clock.now) {
                t.next += t.every;
                t.fn();
            }
        }
        await flush();
    }
}

/** Aba do navegador: visibilityState e o aviso visibilitychange. */
function fakeDocument() {
    const listeners = [];
    const doc = {
        visibilityState: 'visible',
        hidden: false,
        addEventListener(type, fn) { if (type === 'visibilitychange') listeners.push(fn); },
        removeEventListener(type, fn) { const i = listeners.indexOf(fn); if (i >= 0) listeners.splice(i, 1); },
        /** A aba fica escondida ('hidden') ou volta a ficar visível ('visible'). */
        setVisibility(state) {
            doc.visibilityState = state;
            doc.hidden = state !== 'visible';
            listeners.slice().forEach(fn => fn({ type: 'visibilitychange' }));
        },
        listenerCount: () => listeners.length
    };
    return doc;
}

/**
 * Um aparelho com o jogo aberto: carrega o js/network/roomChannel.js
 * real num contexto isolado e cria o canal ligado ao banco simulado,
 * com o uid e o relógio informados. Tudo o que o canal entrega ao jogo
 * fica em `got`. `extra` troca opções do canal (ex.: timestamp). Com o
 * banco simulado criado com serverNow, as horas vão como
 * ServerValue.TIMESTAMP (o banco grava a hora do servidor); sem ele, como
 * a hora do relógio. `frozen = true` congela os timers do aparelho (tela
 * bloqueada: a conexão fica, o sinal para); `document` é a aba.
 */
function openDevice(fake, uid, clock, extra = {}) {
    const device = fake.client(uid);
    const logs = [];
    const silent = {};
    ['log', 'warn', 'error', 'info'].forEach(level => {
        silent[level] = (...args) => logs.push(level + ': ' + args.join(' '));
    });
    const owner = { device, frozen: false };
    const timers = deviceTimers(clock, owner);
    const document = fakeDocument();
    const ctx = vm.createContext({
        console: silent, setTimeout, clearTimeout,
        setInterval: timers.setInterval, clearInterval: timers.clearInterval, document
    });
    vm.runInContext('var window = this;', ctx);
    const file = 'js/network/roomChannel.js';
    vm.runInContext(fs.readFileSync(path.join(ROOT, file), 'utf8'), ctx, { filename: file });
    const got = { requests: [], messages: [], states: [], hands: [], admitted: 0, dismissed: 0, presence: [], hostPresence: [], reconnected: 0, hostChanged: [] };
    const channel = ctx.Game.network.roomChannel.create({
        db: device.db,
        uid,
        now: () => clock.now,
        timestamp: fake.hasServerTime ? () => SERVER_TIMESTAMP : () => clock.now,
        ...TIMING,
        onRequest: (msg, from) => got.requests.push({ msg: JSON.parse(JSON.stringify(msg)), from }),
        onMessage: (msg) => got.messages.push(JSON.parse(JSON.stringify(msg))),
        onState: (state) => got.states.push(state === null ? null : JSON.parse(JSON.stringify(state))),
        onHand: (hand) => got.hands.push(hand === null ? null : JSON.parse(JSON.stringify(hand))),
        onAdmitted: () => got.admitted++,
        onDismissed: () => got.dismissed++,
        onPresence: (who, online) => got.presence.push({ uid: who, online }),
        onHostPresence: (online) => got.hostPresence.push(online),
        onReconnected: () => got.reconnected++,
        onHostChanged: (who, hostEpoch) => got.hostChanged.push({ uid: who, hostEpoch }),
        ...extra
    });
    return {
        device, channel, got, logs, ctx, document,
        get frozen() { return owner.frozen; },
        set frozen(value) { owner.frozen = value; }
    };
}

/** Banco simulado que grava a hora do servidor (o relógio do teste) no lugar de ServerValue.TIMESTAMP. */
function fakeWithServerTime(clock) {
    const fake = createFakeFirebase({ serverNow: () => clock.now });
    fake.hasServerTime = true;
    return fake;
}

/** É o sinal de vida esperado: { online, lastSeen } com a hora `at` (número). */
function isSignal(value, online, at) {
    return !!value && value.online === online && typeof value.lastSeen === 'number' && (at === undefined || value.lastSeen === at) &&
        Object.keys(value).sort().join(',') === 'lastSeen,online';
}

/** Quantas vezes o aparelho gravou a própria presença. */
function presenceWrites(d, uid) {
    const own = 'rooms/sala01/presence/' + uid;
    return d.device.writes.filter(w => w.path === own || w.path === own + '/lastSeen').length;
}

/** Valor com as chaves dos objetos em ordem alfabética (o banco não garante a ordem dos campos). */
function sorted(value) {
    if (Array.isArray(value)) return value.map(sorted);
    if (value && typeof value === 'object') {
        const out = {};
        Object.keys(value).sort().forEach(k => { out[k] = sorted(value[k]); });
        return out;
    }
    return value;
}
const same = (a, b) => JSON.stringify(sorted(a)) === JSON.stringify(sorted(b));

/** O host cria a sala "sala01" e Ana entra (ainda sem ser aceita). O banco grava a hora do servidor. */
async function roomWithGuest() {
    const clock = { now: 1000 };
    const fake = fakeWithServerTime(clock);
    const host = openDevice(fake, 'uid-host', clock);
    const created = await host.channel.createRoom('sala01', { protocolVersion: VERSION });
    await flush();
    check(created && created.ok === true, 'o host deveria criar a sala, veio: ' + JSON.stringify(created));
    clock.now = 2000;
    const ana = openDevice(fake, 'uid-ana', clock);
    const joined = await ana.channel.joinRoom('sala01', { protocolVersion: VERSION });
    await flush();
    check(joined && joined.ok === true, 'Ana deveria entrar na sala, veio: ' + JSON.stringify(joined));
    return { fake, clock, host, ana };
}

/** Sala com Ana e Beto já aceitos (roster). */
async function roomWithTwoAdmitted() {
    const room = await roomWithGuest();
    const beto = openDevice(room.fake, 'uid-beto', room.clock);
    await beto.channel.joinRoom('sala01', { protocolVersion: VERSION });
    await flush();
    await room.host.channel.admit('uid-ana');
    await room.host.channel.admit('uid-beto');
    await flush();
    return { ...room, beto };
}

asyncTest('T154 Criar sala: grava meta com o dono, hostEpoch 1, a versão do jogo e as horas; código inválido é recusado sem tocar no banco e código em uso é recusado (room-exists) sem mudar a sala', async () => {
    const fake = createFakeFirebase();
    const clock = { now: 1000 };
    const host = openDevice(fake, 'uid-host', clock);
    const result = await host.channel.createRoom('sala01', { protocolVersion: VERSION });
    await flush();

    check(result && result.ok === true && result.isHost === true, 'criar sala deveria dar certo, como host, veio: ' + JSON.stringify(result));
    const meta = fake.read('rooms/sala01/meta');
    check(same(meta, { createdAt: 1000, hostEpoch: 1, hostUid: 'uid-host', lastActivity: 1000, protocolVersion: VERSION }),
        'meta deveria ter hostUid, hostEpoch 1, protocolVersion, createdAt e lastActivity, veio: ' + JSON.stringify(meta));
    const s = host.channel.snapshot();
    check(s.code === 'sala01' && s.isHost === true, 'o canal deveria ficar na sala, como host, veio: ' + JSON.stringify(s));

    const invalid = ['', ' ', 'a'.repeat(21), 'sala.1', 'sala/1', 'sala#1', 'sala$1', 'sala[1]', 'sala 1', null, undefined, 42];
    for (const action of ['createRoom', 'joinRoom']) {
        for (const code of invalid) {
            const f = createFakeFirebase();
            const d = openDevice(f, 'uid-x', { now: 1000 });
            const r = await d.channel[action](code, { protocolVersion: VERSION });
            await flush();
            check(r && r.ok === false && r.reason === 'invalid-code',
                action + '(' + JSON.stringify(code) + ') deveria recusar com invalid-code, veio: ' + JSON.stringify(r));
            check(d.device.writes.length === 0 && d.device.listenerCount() === 0 && f.read('') === undefined,
                action + '(' + JSON.stringify(code) + ') não deveria gravar nem ouvir nada no banco');
        }
    }

    clock.now = 5000;
    const other = openDevice(fake, 'uid-caio', clock);
    const again = await other.channel.createRoom('sala01', { protocolVersion: VERSION });
    await flush();
    check(again && again.ok === false && again.reason === 'room-exists',
        'o mesmo código em uso deveria ser recusado com room-exists, veio: ' + JSON.stringify(again));
    check(same(fake.read('rooms/sala01/meta'), meta), 'a sala do host não deveria mudar, veio: ' + JSON.stringify(fake.read('rooms/sala01/meta')));
    check(other.device.listenerCount() === 0 && other.channel.snapshot().code === null,
        'quem não conseguiu criar não deveria ficar ouvindo a sala nem ficar com ela');

    // As horas gravadas são as do servidor (a opção timestamp), não as do relógio do aparelho.
    const serverTime = { '.sv': 'timestamp' };
    const f2 = createFakeFirebase();
    const withServerTime = openDevice(f2, 'uid-host', { now: 7000 }, { timestamp: () => serverTime });
    await withServerTime.channel.createRoom('sala02', { protocolVersion: VERSION });
    await withServerTime.channel.publish({ publicState: {} });
    await flush();
    const meta2 = f2.read('rooms/sala02/meta');
    check(same(meta2.createdAt, serverTime) && same(meta2.lastActivity, serverTime),
        'createdAt e lastActivity (também ao publicar) deveriam ser gravados com a hora do servidor (timestamp), veio: ' + JSON.stringify(meta2));
});

asyncTest('T155 Sala parada: o código só pode ser criado de novo depois de ROOM_IDLE_MS (2 h) sem atividade do host, contando da última publicação (não da criação); quem cria apaga o que sobrou da sala antiga', async () => {
    const { fake, clock, host, ana } = await roomWithGuest();
    const idle = host.ctx.Game.network.roomChannel.ROOM_IDLE_MS;
    check(idle === 2 * HOUR_MS, 'ROOM_IDLE_MS deveria ser 2 h (7 200 000 ms), veio: ' + idle);

    await host.channel.admit('uid-ana');
    await flush();
    clock.now = 50000;
    await host.channel.publish({ publicState: { round: 1 }, secretState: { correct: 'b' }, hands: { 'uid-ana': { question: 'Q' } } });
    await host.channel.broadcast({ type: 'round-start' });
    await host.channel.sendTo('uid-ana', { type: 'question' });
    await flush();
    check(fake.read('rooms/sala01/meta/lastActivity') === 50000, 'publicar deveria atualizar meta/lastActivity, veio: ' + fake.read('rooms/sala01/meta/lastActivity'));
    // O host fecha a aba e sobra um pedido que ninguém tratou.
    host.device.close();
    await flush();
    fake.write('rooms/sala01/requests/kOld', { from: 'uid-ana', payload: '{"type":"answer"}' });

    // Parada há menos de 2 h desde a última publicação (mas mais de 2 h desde a criação): continua em uso.
    clock.now = 50000 + idle - 1;
    const caio = openDevice(fake, 'uid-caio', clock);
    const early = await caio.channel.createRoom('sala01', { protocolVersion: VERSION });
    await flush();
    check(early && early.ok === false && early.reason === 'room-exists',
        'com menos de 2 h sem atividade, o código deveria continuar em uso, veio: ' + JSON.stringify(early));
    check(fake.read('rooms/sala01/meta/hostUid') === 'uid-host', 'a sala não deveria mudar de dono');

    clock.now = 50000 + idle + 1;
    const late = await caio.channel.createRoom('sala01', { protocolVersion: VERSION });
    await flush();
    check(late && late.ok === true && late.isHost === true, 'depois de 2 h parada, o código deveria poder ser criado de novo, veio: ' + JSON.stringify(late));
    check(same(fake.read('rooms/sala01/meta'), { createdAt: clock.now, hostEpoch: 1, hostUid: 'uid-caio', lastActivity: clock.now, protocolVersion: VERSION }),
        'a sala nova deveria ter Caio como dono e as horas novas, veio: ' + JSON.stringify(fake.read('rooms/sala01/meta')));
    const leftovers = ['roster', 'public', 'secret', 'hands', 'feed', 'inbox', 'requests']
        .filter(k => fake.read('rooms/sala01/' + k) !== undefined);
    check(leftovers.length === 0, 'o que era da sala antiga deveria ser apagado, sobrou: ' + leftovers.join(', '));
    // A presença do host novo (gravada ao entrar) fica; a dos outros sai.
    const oldPresence = Object.keys(fake.read('rooms/sala01/presence') || {}).filter(who => who !== 'uid-caio');
    check(oldPresence.length === 0, 'a presença da sala antiga deveria ser apagada, sobrou: ' + oldPresence.join(', '));
    check(caio.got.requests.length === 0, 'o pedido da sala antiga não deveria chegar ao host novo, chegou: ' + JSON.stringify(caio.got.requests));
});

asyncTest('T156 Entrar: sala que não existe (room-not-found) e outra versão do jogo (version-mismatch) são recusadas sem gravar nem ouvir nada; entrar não grava nada no banco e não é host; o host que dá F5 (mesmo uid) entra de novo como host', async () => {
    const fake = createFakeFirebase();
    const clock = { now: 1000 };
    const ana = openDevice(fake, 'uid-ana', clock);
    const missing = await ana.channel.joinRoom('nada', { protocolVersion: VERSION });
    await flush();
    check(missing && missing.ok === false && missing.reason === 'room-not-found',
        'sala inexistente deveria ser recusada com room-not-found, veio: ' + JSON.stringify(missing));
    check(ana.device.writes.length === 0 && ana.device.listenerCount() === 0 && ana.channel.snapshot().code === null,
        'sala inexistente: nada gravado, nada ouvido, canal sem sala');

    const host = openDevice(fake, 'uid-host', clock);
    await host.channel.createRoom('sala01', { protocolVersion: VERSION });
    await flush();

    const old = openDevice(fake, 'uid-beto', clock);
    const mismatch = await old.channel.joinRoom('sala01', { protocolVersion: VERSION - 1 });
    await flush();
    check(mismatch && mismatch.ok === false && mismatch.reason === 'version-mismatch',
        'outra versão do jogo deveria ser recusada com version-mismatch, veio: ' + JSON.stringify(mismatch));
    check(old.device.writes.length === 0 && old.device.listenerCount() === 0 && old.channel.snapshot().code === null,
        'outra versão: nada gravado, nada ouvido, canal sem sala');

    const joined = await ana.channel.joinRoom('sala01', { protocolVersion: VERSION });
    await flush();
    check(joined && joined.ok === true && joined.isHost === false, 'Ana deveria entrar sem ser host, veio: ' + JSON.stringify(joined));
    const s = ana.channel.snapshot();
    check(s.code === 'sala01' && s.isHost === false && s.isAdmitted === false,
        'o canal da Ana deveria estar na sala, sem ser host e ainda não aceito, veio: ' + JSON.stringify(s));
    check(ana.device.writes.length === 0, 'entrar não deveria gravar nada (o pedido de entrada é do jogo), gravou: ' + JSON.stringify(ana.device.writes));
    check(ana.device.listenerCount() > 0, 'quem entra deveria passar a ouvir a sala');

    host.device.close();
    await flush();
    const hostAgain = openDevice(fake, 'uid-host', clock);
    const back = await hostAgain.channel.joinRoom('sala01', { protocolVersion: VERSION });
    await flush();
    check(back && back.ok === true && back.isHost === true && hostAgain.channel.snapshot().isHost === true,
        'o host que dá F5 deveria voltar como host (o papel vem do meta), veio: ' + JSON.stringify(back));
});

asyncTest('T157 Pedido ao host: chega ao host com o conteúdo exato (null e lista vazia) e o uid de quem mandou; é apagado depois de tratado e tratado uma vez só; o que esperava durante o F5 do host é tratado na volta; conteúdo ilegível é descartado', async () => {
    const { fake, clock, host, ana } = await roomWithGuest();
    const msg = { type: 'player-join', playerName: 'Ana', question: null, answeredThisRound: [] };
    await ana.channel.sendToHost(msg);
    await flush();

    const sent = ana.device.writes.find(w => /^rooms\/sala01\/requests\/[^/]+$/.test(w.path));
    check(sent && sent.value.from === 'uid-ana' && typeof sent.value.payload === 'string',
        'o pedido deveria ser gravado em requests com from = uid e o conteúdo em texto, veio: ' + JSON.stringify(ana.device.writes));
    check(host.got.requests.length === 1 && same(host.got.requests[0], { msg, from: 'uid-ana' }),
        'o host deveria receber o pedido igual ao que saiu, com o uid de quem mandou, veio: ' + JSON.stringify(host.got.requests));
    check(fake.read('rooms/sala01/requests') === undefined, 'o pedido tratado deveria ser apagado, sobrou: ' + JSON.stringify(fake.read('rooms/sala01/requests')));
    check(ana.got.requests.length === 0, 'quem não é host não deveria receber pedidos');

    await host.channel.broadcast({ type: 'x' });
    await flush();
    check(host.got.requests.length === 1, 'o mesmo pedido não deveria ser tratado duas vezes');

    // F5 do host: o pedido feito enquanto ele recarregava espera no banco.
    host.device.close();
    await flush();
    clock.now = 3000;
    await ana.channel.sendToHost({ type: 'answer', alternative: 'b', playerName: 'Ana' });
    await flush();
    check(!!fake.read('rooms/sala01/requests'), 'sem host, o pedido deveria esperar no banco');
    const hostAgain = openDevice(fake, 'uid-host', clock);
    await hostAgain.channel.joinRoom('sala01', { protocolVersion: VERSION });
    await flush();
    check(hostAgain.got.requests.length === 1 && hostAgain.got.requests[0].msg.alternative === 'b' && hostAgain.got.requests[0].from === 'uid-ana',
        'o host de volta deveria tratar o pedido que esperava, uma vez, veio: ' + JSON.stringify(hostAgain.got.requests));
    check(fake.read('rooms/sala01/requests') === undefined, 'o pedido que esperava deveria ser apagado depois de tratado');

    fake.write('rooms/sala01/requests/kBad', { from: 'uid-ana', payload: '{ilegível' });
    fake.write('rooms/sala01/requests/kNoFrom', { payload: '{"type":"answer"}' });
    await flush();
    check(hostAgain.got.requests.length === 1, 'pedido ilegível ou sem remetente não deveria chegar ao jogo, chegou: ' + JSON.stringify(hostAgain.got.requests));
    check(fake.read('rooms/sala01/requests') === undefined, 'pedido ilegível ou sem remetente deveria ser apagado, sobrou: ' + JSON.stringify(fake.read('rooms/sala01/requests')));
});

asyncTest('T158 Aceitar e tirar da sala: quem não foi aceito não recebe estado nem avisos para todos; aceito (roster), recebe o estado público e o próprio (hands), nunca o secreto nem o de outro; publicar grava tudo junto com lastActivity; tirado da sala, para de receber; aceito de novo, volta', async () => {
    const { fake, clock, host, ana } = await roomWithGuest();
    const beto = openDevice(fake, 'uid-beto', clock);
    await beto.channel.joinRoom('sala01', { protocolVersion: VERSION });
    await flush();

    const publicState = { players: [{ name: 'Ana', kpi: 0 }], currentRound: null, answeredThisRound: [] };
    const secretState = { currentRound: { question: { correct: 'segredo-b' } } };
    const anaHand = { question: { question: 'Q1', alternatives: ['x', 'y'] }, advisory: null };
    clock.now = 3000;
    await host.channel.publish({ publicState, secretState, hands: { 'uid-ana': anaHand } });
    await host.channel.broadcast({ type: 'round-start', asker: 'Beto' });
    await flush();
    check(ana.got.states.length === 0 && ana.got.hands.length === 0 && ana.got.messages.length === 0 && ana.got.admitted === 0,
        'antes de ser aceita, Ana não deveria receber estado nem avisos para todos, recebeu: ' + JSON.stringify(ana.got));

    check(fake.read('rooms/sala01/meta/lastActivity') === 3000, 'publicar deveria gravar meta/lastActivity');
    check(typeof fake.read('rooms/sala01/public/state') === 'string' && typeof fake.read('rooms/sala01/secret/state') === 'string' &&
        typeof fake.read('rooms/sala01/hands/uid-ana') === 'string',
        'public/state, secret/state e hands/<uid> deveriam ser gravados como texto JSON');
    const publishWrite = host.device.writes.filter(w => /public\/state$/.test(w.path));
    check(publishWrite.length === 1, 'o estado público deveria ser gravado uma vez por publicação');

    await host.channel.admit('uid-ana');
    await flush();
    check(fake.read('rooms/sala01/roster/uid-ana') === true, 'aceitar deveria gravar roster/<uid> = true');
    check(ana.got.admitted === 1 && ana.channel.snapshot().isAdmitted === true, 'Ana deveria ser avisada de que foi aceita');
    check(ana.got.states.length >= 1 && same(ana.got.states[ana.got.states.length - 1], publicState),
        'ao ser aceita, Ana deveria receber o estado público como saiu (null e lista vazia), veio: ' + JSON.stringify(ana.got.states));
    check(ana.got.hands.length >= 1 && same(ana.got.hands[ana.got.hands.length - 1], anaHand),
        'ao ser aceita, Ana deveria receber o que só ela vê, veio: ' + JSON.stringify(ana.got.hands));
    check(ana.got.messages.length === 0, 'o aviso para todos de antes de ser aceita não deveria chegar depois, chegou: ' + JSON.stringify(ana.got.messages));

    const newPublic = { players: [{ name: 'Ana', kpi: 10 }], currentRound: { asker: 'Beto' } };
    await host.channel.publish({ publicState: newPublic });
    await flush();
    check(same(ana.got.states[ana.got.states.length - 1], newPublic), 'a nova publicação deveria chegar à Ana');
    check(fake.read('rooms/sala01/secret/state') === JSON.stringify(secretState), 'publicar só o estado público não deveria mexer no secreto');
    check(typeof fake.read('rooms/sala01/hands/uid-ana') === 'string', 'publicar sem hands não deveria apagar o de cada jogador');

    await host.channel.admit('uid-beto');
    await flush();
    const everythingBeto = JSON.stringify(beto.got) + JSON.stringify(ana.got);
    check(!/segredo-b/.test(everythingBeto), 'nenhum jogador deveria receber o estado secreto');
    check(!beto.got.hands.some(h => h && /Q1/.test(JSON.stringify(h))), 'Beto não deveria receber o que só a Ana vê, recebeu: ' + JSON.stringify(beto.got.hands));

    await host.channel.publish({ hands: { 'uid-ana': null } });
    await flush();
    check(fake.read('rooms/sala01/hands/uid-ana') === undefined, 'hands com null deveria apagar o daquele jogador');
    check(ana.got.hands[ana.got.hands.length - 1] === null, 'Ana deveria ser avisada de que não tem mais nada só dela (null)');

    await host.channel.dismiss('uid-ana');
    await flush();
    check(fake.read('rooms/sala01/roster/uid-ana') === undefined, 'tirar da sala deveria apagar roster/<uid>');
    check(ana.got.dismissed === 1 && ana.channel.snapshot().isAdmitted === false, 'Ana deveria ser avisada de que saiu do roster');
    const statesBefore = ana.got.states.length;
    await host.channel.publish({ publicState: { after: true } });
    await host.channel.broadcast({ type: 'after-dismiss' });
    await flush();
    check(ana.got.states.length === statesBefore && ana.got.messages.length === 0,
        'fora do roster, Ana não deveria receber estado nem avisos para todos, recebeu: ' + JSON.stringify(ana.got.messages));
    check(beto.got.messages.some(m => m.type === 'after-dismiss'), 'Beto, aceito, deveria continuar recebendo');

    await host.channel.admit('uid-ana');
    await flush();
    check(ana.got.admitted === 2 && same(ana.got.states[ana.got.states.length - 1], { after: true }),
        'aceita de novo, Ana deveria voltar a receber o estado atual, veio: ' + JSON.stringify(ana.got.states));
    const anaOnline = host.got.presence.filter(p => p.uid === 'uid-ana' && p.online === true).length;
    check(anaOnline === 2 && same(host.got.presence[host.got.presence.length - 1], { uid: 'uid-ana', online: true }),
        'aceita de novo, Ana deveria aparecer online outra vez para o host, veio: ' + JSON.stringify(host.got.presence));
});

asyncTest('T159 Avisos do host: para todos (feed) e para um (inbox) chegam na ordem em que saíram, com o conteúdo exato; inbox só ao destinatário, também a quem ainda não foi aceito (recusa de entrada); o host não recebe os próprios; depois de um F5, os avisos antigos não chegam de novo', async () => {
    const { fake, clock, host, ana, beto } = await roomWithTwoAdmitted();
    const m1 = { type: 'round-start', asker: 'Ana', answerer: 'Beto', answeredThisRound: [] };
    const m2 = { type: 'question', isAsker: true, correct: 'c', note: null };
    const m3 = { type: 'question-asked', auto: false };
    await host.channel.broadcast(m1);
    await host.channel.sendTo('uid-ana', m2);
    await host.channel.broadcast(m3);
    await flush();

    check(same(ana.got.messages, [m1, m2, m3]), 'Ana deveria receber os três avisos na ordem, iguais ao que saiu, veio: ' + JSON.stringify(ana.got.messages));
    check(same(beto.got.messages, [m1, m3]), 'Beto deveria receber só os avisos para todos, veio: ' + JSON.stringify(beto.got.messages));
    check(host.got.messages.length === 0, 'o host não deveria receber os próprios avisos');
    check(typeof fake.read('rooms/sala01/inbox/uid-ana') === 'object' && fake.read('rooms/sala01/inbox/uid-beto') === undefined,
        'o aviso para um deveria ficar só na inbox do destinatário');

    const caio = openDevice(fake, 'uid-caio', clock);
    await caio.channel.joinRoom('sala01', { protocolVersion: VERSION });
    await flush();
    await host.channel.broadcast({ type: 'player-list' });
    await host.channel.sendTo('uid-caio', { type: 'join-rejected', reason: 'room-locked' });
    await flush();
    check(same(caio.got.messages, [{ type: 'join-rejected', reason: 'room-locked' }]),
        'quem não foi aceito deveria receber só a própria inbox (a recusa), veio: ' + JSON.stringify(caio.got.messages));

    // F5 da Ana: avisos que saíram antes (e enquanto ela recarregava) não chegam de novo.
    ana.device.close();
    await flush();
    await host.channel.broadcast({ type: 'while-away' });
    await host.channel.sendTo('uid-ana', { type: 'inbox-while-away' });
    await flush();
    const anaAgain = openDevice(fake, 'uid-ana', clock);
    await anaAgain.channel.joinRoom('sala01', { protocolVersion: VERSION });
    await flush();
    check(anaAgain.got.admitted === 1, 'depois do F5, Ana (ainda no roster) deveria estar aceita');
    check(anaAgain.got.messages.length === 0, 'depois do F5, os avisos antigos não deveriam chegar de novo, chegaram: ' + JSON.stringify(anaAgain.got.messages));
    await host.channel.broadcast({ type: 'after-reload' });
    await host.channel.sendTo('uid-ana', { type: 'inbox-after-reload' });
    await flush();
    check(same(anaAgain.got.messages, [{ type: 'after-reload' }, { type: 'inbox-after-reload' }]),
        'depois do F5, os avisos novos deveriam chegar uma vez, veio: ' + JSON.stringify(anaAgain.got.messages));
});

asyncTest('T160 Estado secreto: o host lê o que publicou (ex.: depois de um F5), igual ao que saiu; sem publicação, null; quem não é host recebe null', async () => {
    const { fake, clock, host, ana } = await roomWithGuest();
    const before = await host.channel.readSecret();
    check(before === null, 'sem publicação, o estado secreto deveria ser null, veio: ' + JSON.stringify(before));

    const secretState = { decks: { scope: { available: 3 } }, currentRound: { question: { correct: 'a' }, pendingAnswer: null }, answeredThisRound: [] };
    await host.channel.publish({ secretState });
    await flush();

    host.device.close();
    await flush();
    const hostAgain = openDevice(fake, 'uid-host', clock);
    await hostAgain.channel.joinRoom('sala01', { protocolVersion: VERSION });
    await flush();
    const read = await hostAgain.channel.readSecret();
    check(same(read, secretState), 'o host deveria ler o estado secreto igual ao que publicou, veio: ' + JSON.stringify(read));

    const guestRead = await ana.channel.readSecret();
    check(guestRead === null, 'quem não é host deveria receber null, veio: ' + JSON.stringify(guestRead));
});

asyncTest('T161 Limpar e sair: limpar apaga só os avisos (feed e inbox); quem sai para de ouvir e não mexe na sala; o host, ao sair, apaga a sala inteira', async () => {
    const { fake, host, ana, beto } = await roomWithTwoAdmitted();
    await host.channel.publish({ publicState: { a: 1 }, secretState: { b: 2 }, hands: { 'uid-ana': { c: 3 } } });
    await host.channel.broadcast({ type: 'one' });
    await host.channel.sendTo('uid-beto', { type: 'two' });
    await flush();

    await host.channel.clearMessages();
    await flush();
    check(fake.read('rooms/sala01/feed') === undefined && fake.read('rooms/sala01/inbox') === undefined, 'limpar deveria apagar feed e inbox');
    const kept = ['meta', 'roster', 'public', 'secret', 'hands'].filter(k => fake.read('rooms/sala01/' + k) === undefined);
    check(kept.length === 0, 'limpar não deveria apagar ' + kept.join(', '));

    // O que é só do host não grava nada quando chamado por um guest.
    const writesBefore = ana.device.writes.length;
    await ana.channel.broadcast({ type: 'fake' });
    await ana.channel.sendTo('uid-beto', { type: 'fake' });
    await ana.channel.admit('uid-caio');
    await ana.channel.dismiss('uid-beto');
    await ana.channel.publish({ publicState: { fake: true } });
    await ana.channel.clearMessages();
    await flush();
    check(ana.device.writes.length === writesBefore,
        'avisos, aceitar, tirar, publicar e limpar são do host: o guest não deveria gravar nada, gravou: ' + JSON.stringify(ana.device.writes.slice(writesBefore)));

    await ana.channel.leave();
    await flush();
    check(ana.device.listenerCount() === 0, 'quem sai deveria parar de ouvir, ouvintes: ' + ana.device.listenerCount());
    check(ana.channel.snapshot().code === null, 'o canal de quem sai deveria ficar sem sala');
    check(ana.device.writes.length === writesBefore, 'sair não deveria gravar nada (o jogo avisa o host pelo pedido)');
    await host.channel.broadcast({ type: 'after-leave' });
    await flush();
    check(!ana.got.messages.some(m => m.type === 'after-leave'), 'quem saiu não deveria receber avisos');
    check(beto.got.messages.some(m => m.type === 'after-leave'), 'quem ficou deveria continuar recebendo');

    await host.channel.leave();
    await flush();
    check(fake.read('rooms/sala01') === undefined, 'o host, ao sair, deveria apagar a sala inteira, sobrou: ' + JSON.stringify(fake.read('rooms/sala01')));
    check(host.device.listenerCount() === 0, 'o host deveria parar de ouvir');
});

/**
 * Espia as transações do aparelho (a troca de host é uma transação no
 * meta): `calls` guarda o caminho de cada uma. Com `rejectNext` > 0, a
 * próxima é recusada (como as regras do banco recusariam); com `hold`,
 * cada uma fica parada em `held` até o teste chamar a função guardada —
 * assim duas tentativas ficam abertas ao mesmo tempo, como no banco real.
 */
function watchTransactions(d) {
    const spy = { calls: [], rejectNext: 0, hold: false, held: [] };
    const realRef = d.device.db.ref;
    d.device.db.ref = (p) => {
        const r = realRef(p);
        const real = r.transaction;
        r.transaction = (fn, ...rest) => {
            spy.calls.push(String(p));
            if (spy.rejectNext > 0) {
                spy.rejectNext--;
                return Promise.reject(new Error('PERMISSION_DENIED'));
            }
            if (spy.hold) return new Promise((resolve, reject) => spy.held.push(() => real(fn, ...rest).then(resolve, reject)));
            return real(fn, ...rest);
        };
        return r;
    };
    return spy;
}

/** O host manda um sinal agora e congela (o sinal para; a conexão fica). */
async function stopHostSignal(host) {
    host.document.setVisibility('visible');
    await flush();
    host.frozen = true;
}

// ============================================
// PRESENÇA, CURSOR DOS AVISOS E VOLTA DA CONEXÃO (etapa 1b-α)
// ============================================

asyncTest('T163 Presença: o host grava a própria ao entrar; quem é aceito grava a sua (quem só entrou, não), sempre { online, lastSeen } com a hora do servidor; o servidor grava offline com a hora da queda quando o aparelho cai; o host é avisado de cada mudança dos outros (não da própria; ao voltar de um F5, da situação atual; a queda, só depois da tolerância) e quem foi aceito, da do host; tirar da sala apaga a presença e o aparelho tirado não grava mais nada ao cair; o host que encerra a sala não a recria ao cair', async () => {
    const { fake, clock, host, ana } = await roomWithGuest();
    const presenceOf = (who) => fake.read('rooms/sala01/presence/' + who);
    check(isSignal(presenceOf('uid-host'), true, 1000), 'o host deveria gravar a própria presença ao criar a sala ({ online: true, lastSeen: hora do servidor }), veio: ' + JSON.stringify(fake.read('rooms/sala01/presence')));
    check(presenceOf('uid-ana') === undefined && !ana.device.writes.some(w => /presence/.test(w.path)),
        'quem só entrou (sem ser aceito) não deveria gravar presença, gravou: ' + JSON.stringify(ana.device.writes));
    check(host.got.presence.length === 0, 'o host não deveria ser avisado da própria presença, veio: ' + JSON.stringify(host.got.presence));

    await host.channel.admit('uid-ana');
    await flush();
    check(isSignal(presenceOf('uid-ana'), true, clock.now), 'aceita, Ana deveria gravar a própria presença com a hora do servidor, veio: ' + JSON.stringify(presenceOf('uid-ana')));
    check(same(host.got.presence, [{ uid: 'uid-ana', online: true }]), 'o host deveria ser avisado de que Ana está online, veio: ' + JSON.stringify(host.got.presence));
    check(same(ana.got.hostPresence, [true]), 'Ana, aceita, deveria saber que o host está online, veio: ' + JSON.stringify(ana.got.hostPresence));

    // F5 do host: o servidor grava offline (com a hora da queda); na volta, online de novo.
    host.device.close();
    await flush();
    check(isSignal(presenceOf('uid-host'), false, clock.now), 'com o host fora, o servidor deveria gravar online: false com a hora da queda, veio: ' + JSON.stringify(presenceOf('uid-host')));
    check(ana.got.hostPresence[ana.got.hostPresence.length - 1] === false, 'Ana deveria ver o host offline, veio: ' + JSON.stringify(ana.got.hostPresence));
    const hostAgain = openDevice(fake, 'uid-host', clock);
    await hostAgain.channel.joinRoom('sala01', { protocolVersion: VERSION });
    await flush();
    check(isSignal(presenceOf('uid-host'), true) && ana.got.hostPresence[ana.got.hostPresence.length - 1] === true,
        'o host de volta deveria gravar online de novo e Ana deveria ver, veio: ' + JSON.stringify(ana.got.hostPresence));
    check(same(hostAgain.got.presence, [{ uid: 'uid-ana', online: true }]),
        'o host de volta do F5 deveria receber a presença atual dos outros, veio: ' + JSON.stringify(hostAgain.got.presence));

    ana.device.goOffline();
    await flush();
    check(isSignal(presenceOf('uid-ana'), false, clock.now), 'Ana caiu: o servidor deveria gravar online: false com a hora da queda (onDisconnect), veio: ' + JSON.stringify(presenceOf('uid-ana')));
    check(hostAgain.got.presence.length === 1, 'dentro da tolerância, o host não deveria ser avisado da queda de Ana, veio: ' + JSON.stringify(hostAgain.got.presence));
    await elapse(clock, TIMING.presenceTimeout + 1500);
    check(same(hostAgain.got.presence[hostAgain.got.presence.length - 1], { uid: 'uid-ana', online: false }),
        'passada a tolerância, o host deveria ser avisado de que Ana caiu, veio: ' + JSON.stringify(hostAgain.got.presence));
    ana.device.goOnline();
    await flush();

    const eventsBefore = hostAgain.got.presence.length;
    await hostAgain.channel.dismiss('uid-ana');
    await flush();
    check(presenceOf('uid-ana') === undefined, 'tirar da sala deveria apagar a presença, sobrou: ' + JSON.stringify(presenceOf('uid-ana')));
    check(hostAgain.got.presence.length === eventsBefore, 'a presença apagada pelo próprio host não deveria virar aviso de queda, veio: ' + JSON.stringify(hostAgain.got.presence.slice(eventsBefore)));
    ana.device.goOffline();
    await flush();
    check(presenceOf('uid-ana') === undefined, 'tirada da sala, Ana não deveria deixar offline para o servidor gravar, veio: ' + JSON.stringify(presenceOf('uid-ana')));

    // O host encerra a sala e depois a página fecha: nada da sala volta a existir.
    await hostAgain.channel.leave();
    await flush();
    hostAgain.device.goOffline();
    await flush();
    check(fake.read('rooms/sala01') === undefined, 'depois de o host encerrar, o offline dele não deveria recriar a sala, sobrou: ' + JSON.stringify(fake.read('rooms/sala01')));
});

asyncTest('T164 Cursor dos avisos para todos: quem pede para segurar (holdFeed) recebe a inbox na hora, mas os avisos para todos só depois de releaseFeed(cursor) — os que saíram até o cursor nunca chegam, os depois dele chegam uma vez, na ordem; null libera todos os guardados; o host diz o cursor (feedCursor: null sem avisos, avança a cada aviso, o mesmo depois de um F5); segurar de novo, já aceito, vale para a volta', async () => {
    const { fake, clock, host, ana } = await roomWithGuest();
    check(host.channel.feedCursor() === null, 'sem nenhum aviso, o cursor do host deveria ser null, veio: ' + JSON.stringify(host.channel.feedCursor()));

    ana.channel.holdFeed();
    await host.channel.broadcast({ type: 'before-admit' });
    await host.channel.admit('uid-ana');
    await host.channel.broadcast({ type: 'in-sync' });
    const cursor = host.channel.feedCursor();
    check(typeof cursor === 'string' && cursor.length > 0, 'depois de um aviso, o cursor deveria ser a chave dele, veio: ' + JSON.stringify(cursor));
    const sync = { type: 'state-sync', feedCursor: cursor };
    await host.channel.sendTo('uid-ana', sync);
    await host.channel.broadcast({ type: 'after-sync-1' });
    await flush();
    check(same(ana.got.messages, [sync]), 'segurando, Ana deveria receber só a inbox (o state-sync), veio: ' + JSON.stringify(ana.got.messages));

    ana.channel.releaseFeed(cursor);
    await host.channel.broadcast({ type: 'after-sync-2' });
    await flush();
    check(same(ana.got.messages, [sync, { type: 'after-sync-1' }, { type: 'after-sync-2' }]),
        'liberada, Ana deveria receber só os avisos depois do cursor, uma vez, na ordem, veio: ' + JSON.stringify(ana.got.messages));

    // F5 do host: o cursor continua o do último aviso (lido do banco).
    const last = host.channel.feedCursor();
    host.device.close();
    await flush();
    const hostAgain = openDevice(fake, 'uid-host', clock);
    await hostAgain.channel.joinRoom('sala01', { protocolVersion: VERSION });
    await flush();
    check(hostAgain.channel.feedCursor() === last, 'depois do F5, o cursor do host deveria continuar ' + last + ', veio: ' + JSON.stringify(hostAgain.channel.feedCursor()));

    // Segurar de novo, já aceita (a volta depois de uma queda).
    ana.channel.holdFeed();
    await hostAgain.channel.broadcast({ type: 'while-held' });
    const cursor2 = hostAgain.channel.feedCursor();
    check(typeof cursor2 === 'string' && cursor2 > last, 'o cursor deveria avançar a cada aviso, veio: ' + JSON.stringify(cursor2) + ' depois de ' + last);
    await hostAgain.channel.broadcast({ type: 'after-cursor2' });
    await flush();
    check(ana.got.messages.length === 3, 'segurando de novo, nenhum aviso para todos deveria chegar, chegou: ' + JSON.stringify(ana.got.messages.slice(3)));
    ana.channel.releaseFeed(cursor2);
    await flush();
    check(same(ana.got.messages.slice(3), [{ type: 'after-cursor2' }]),
        'liberada de novo, Ana deveria receber só o aviso depois do novo cursor, veio: ' + JSON.stringify(ana.got.messages.slice(3)));

    // Cursor null (o host ainda não tinha avisos): tudo o que ficou guardado chega, na ordem.
    const f2 = createFakeFirebase();
    const c2 = { now: 1000 };
    const host2 = openDevice(f2, 'uid-host', c2);
    await host2.channel.createRoom('sala02', { protocolVersion: VERSION });
    const beto = openDevice(f2, 'uid-beto', c2);
    await beto.channel.joinRoom('sala02', { protocolVersion: VERSION });
    await flush();
    beto.channel.holdFeed();
    await host2.channel.admit('uid-beto');
    await host2.channel.broadcast({ type: 'n1' });
    await host2.channel.broadcast({ type: 'n2' });
    await flush();
    check(beto.got.messages.length === 0, 'segurando, Beto não deveria receber avisos para todos, recebeu: ' + JSON.stringify(beto.got.messages));
    beto.channel.releaseFeed(null);
    await host2.channel.broadcast({ type: 'n3' });
    await flush();
    check(same(beto.got.messages, [{ type: 'n1' }, { type: 'n2' }, { type: 'n3' }]),
        'com cursor null, Beto deveria receber todos os guardados e os novos, na ordem, veio: ' + JSON.stringify(beto.got.messages));
});

asyncTest('T165 Volta da conexão: quem perde a conexão e volta é avisado (onReconnected, uma vez por volta, nunca na primeira conexão, nem depois de um "desconectado" inicial), grava a presença de novo e deixa outra vez o offline com o servidor; a queda curta, dentro da tolerância, não chega ao host; vale para o host e para quem foi aceito; quem não foi aceito é avisado mas não grava presença; quem saiu da sala não é mais avisado', async () => {
    const { fake, clock, host, ana } = await roomWithGuest();
    const presenceOf = (who) => fake.read('rooms/sala01/presence/' + who);
    const caio = openDevice(fake, 'uid-caio', clock);
    await caio.channel.joinRoom('sala01', { protocolVersion: VERSION });
    await host.channel.admit('uid-ana');
    await flush();
    check(host.got.reconnected === 0 && ana.got.reconnected === 0 && caio.got.reconnected === 0,
        'a primeira conexão não deveria contar como volta, veio: ' + [host.got.reconnected, ana.got.reconnected, caio.got.reconnected].join(', '));

    ana.device.goOffline();
    await flush();
    ana.device.goOnline();
    await flush();
    check(ana.got.reconnected === 1, 'Ana deveria ser avisada da volta uma vez, veio: ' + ana.got.reconnected);
    check(isSignal(presenceOf('uid-ana'), true), 'na volta, Ana deveria gravar online de novo, veio: ' + JSON.stringify(presenceOf('uid-ana')));
    check(same(host.got.presence, [{ uid: 'uid-ana', online: true }]),
        'a queda curta de Ana (dentro da tolerância) não deveria chegar ao host, veio: ' + JSON.stringify(host.got.presence));
    ana.device.goOffline();
    await flush();
    check(isSignal(presenceOf('uid-ana'), false), 'depois da volta, o offline deveria estar com o servidor de novo, veio: ' + JSON.stringify(presenceOf('uid-ana')));
    ana.device.goOnline();
    await flush();
    check(ana.got.reconnected === 2, 'cada volta deveria avisar uma vez, veio: ' + ana.got.reconnected);

    host.device.goOffline();
    await flush();
    check(isSignal(presenceOf('uid-host'), false) && ana.got.hostPresence[ana.got.hostPresence.length - 1] === false,
        'com o host sem conexão, Ana deveria ver o host offline, veio: ' + JSON.stringify(ana.got.hostPresence));
    host.device.goOnline();
    await flush();
    check(host.got.reconnected === 1, 'o host deveria ser avisado da volta, veio: ' + host.got.reconnected);
    check(isSignal(presenceOf('uid-host'), true) && ana.got.hostPresence[ana.got.hostPresence.length - 1] === true,
        'na volta, o host deveria gravar online de novo e Ana deveria ver, veio: ' + JSON.stringify(ana.got.hostPresence));

    caio.device.goOffline();
    await flush();
    caio.device.goOnline();
    await flush();
    check(caio.got.reconnected === 1, 'quem não foi aceito também deveria ser avisado da volta (para pedir de novo), veio: ' + caio.got.reconnected);
    check(!caio.device.writes.some(w => /presence/.test(w.path)), 'quem não foi aceito não deveria gravar presença, gravou: ' + JSON.stringify(caio.device.writes));

    await ana.channel.leave();
    await flush();
    ana.device.goOffline();
    await flush();
    ana.device.goOnline();
    await flush();
    check(ana.got.reconnected === 2, 'quem saiu da sala não deveria ser avisado da volta, veio: ' + ana.got.reconnected);

    // O Firebase pode dizer "desconectado" antes da primeira conexão: isso não é volta.
    const dani = openDevice(fake, 'uid-dani', clock);
    dani.device.goOffline();
    await dani.channel.joinRoom('sala01', { protocolVersion: VERSION });
    await flush();
    dani.device.goOnline();
    await flush();
    check(dani.got.reconnected === 0, 'a primeira conexão, mesmo depois de um "desconectado" inicial, não deveria contar como volta, veio: ' + dani.got.reconnected);
});

// ============================================
// REGRAS DO BANCO PARA rooms/
// ============================================

asyncTest('T162 Regras do banco para rooms/: meta lida por quem fez login, criada só por quem fica dono e só se não existe ou está parada há ROOM_IDLE_MS; público e feed só para host e roster; secreto só para o host; hands e inbox só para o próprio uid e o host; pedido só novo, com o próprio uid em "from" e texto limitado', async () => {
    const rules = JSON.parse(fs.readFileSync(path.join(ROOT, 'database.rules.json'), 'utf8')).rules;
    check(rules['.read'] === false && rules['.write'] === false, 'a raiz do banco deveria continuar fechada');
    check(!!(rules.connectionChecks && rules.connectionChecks.$code), 'as regras da página de teste de conexão deveriam continuar');
    const room = rules.rooms && rules.rooms.$code;
    check(!!room, 'deveria haver regras para rooms/$code');
    if (!room) return;

    const fake = createFakeFirebase();
    const d = openDevice(fake, 'uid-x', { now: 1 });
    const idle = d.ctx.Game.network.roomChannel.ROOM_IDLE_MS;
    const hostCheck = /meta\/hostUid'\)\.val\(\)\s*===\s*auth\.uid/;
    const rosterCheck = /roster\/'\s*\+\s*auth\.uid|roster'\)\.child\(auth\.uid\)/;

    check(/hostUid/.test(room['.write'] || '') && /!newData\.exists\(\)/.test(room['.write'] || ''),
        'apagar a sala inteira deveria ser só do host e só para apagar, veio: ' + room['.write']);
    const meta = room.meta || {};
    check(/auth\s*!==\s*null/.test(meta['.read'] || ''), 'meta deveria ser lida por quem fez login, veio: ' + meta['.read']);
    const metaWrite = meta['.write'] || '';
    check(/newData\.child\('hostUid'\)\.val\(\)\s*===\s*auth\.uid/.test(metaWrite) && /!data\.exists\(\)/.test(metaWrite) &&
        /lastActivity/.test(metaWrite) && new RegExp('now\\s*-\\s*' + idle + '\\b').test(metaWrite),
        'criar meta: quem grava fica dono, só se não existe ou está parada há ' + idle + ' ms (o mesmo ROOM_IDLE_MS do canal), veio: ' + metaWrite);
    check(meta.lastActivity && /hostUid/.test(meta.lastActivity['.write'] || ''), 'meta/lastActivity deveria ser gravada pelo host, veio: ' + JSON.stringify(meta.lastActivity));
    check(/hostUid/.test(meta['.validate'] || '') && /protocolVersion/.test(meta['.validate'] || '') && /lastActivity/.test(meta['.validate'] || ''),
        'meta deveria exigir hostUid, protocolVersion e lastActivity, veio: ' + meta['.validate']);

    for (const key of ['public', 'feed']) {
        const node = room[key] || {};
        check(hostCheck.test(node['.read'] || '') && rosterCheck.test(node['.read'] || ''), key + ' deveria ser lido pelo host e por quem está no roster, veio: ' + node['.read']);
        check(hostCheck.test(node['.write'] || '') && !rosterCheck.test(node['.write'] || ''), key + ' deveria ser gravado só pelo host, veio: ' + node['.write']);
    }
    const secret = room.secret || {};
    check(hostCheck.test(secret['.read'] || '') && !rosterCheck.test(secret['.read'] || '') && hostCheck.test(secret['.write'] || ''),
        'secret deveria ser lido e gravado só pelo host, veio: ' + JSON.stringify(secret));
    for (const key of ['hands', 'inbox', 'roster']) {
        const node = (room[key] || {}).$uid || {};
        check(/\$uid\s*===\s*auth\.uid|auth\.uid\s*===\s*\$uid/.test(node['.read'] || ''), key + '/$uid deveria ser lido pelo próprio uid, veio: ' + node['.read']);
        const writeRules = (node['.write'] || '') + ' ' + ((room[key] || {})['.write'] || '');
        check(!/\$uid\s*===\s*auth\.uid|auth\.uid\s*===\s*\$uid/.test(writeRules) && hostCheck.test(writeRules),
            key + '/$uid deveria ser gravado só pelo host, veio: ' + node['.write']);
    }
    const requests = room.requests || {};
    check(hostCheck.test(requests['.read'] || ''), 'requests deveria ser lido só pelo host, veio: ' + requests['.read']);
    const request = requests.$requestId || {};
    check(/!data\.exists\(\)/.test(request['.write'] || '') && /newData\.child\('from'\)\.val\(\)\s*===\s*auth\.uid/.test(request['.write'] || ''),
        'pedido só novo e com o próprio uid em "from", veio: ' + request['.write']);
    const payload = request.payload || {};
    check(/isString\(\)/.test(payload['.validate'] || '') && /length\s*<=?\s*20000/.test(payload['.validate'] || ''),
        'o conteúdo do pedido deveria ser texto de até 20000 caracteres, veio: ' + payload['.validate']);
});

asyncTest('T166 Regras do banco para a presença (rooms/$code/presence): cada um grava só a própria, e só quem está no roster ou é o host; o valor tem online verdadeiro ou falso e lastSeen igual à hora do servidor (now); o host lê todas e pode apagar; quem está no roster lê só a do host', async () => {
    const rules = JSON.parse(fs.readFileSync(path.join(ROOT, 'database.rules.json'), 'utf8')).rules;
    const room = (rules.rooms && rules.rooms.$code) || {};
    const hostCheck = /meta\/hostUid'\)\.val\(\)\s*===\s*auth\.uid/;
    const rosterCheck = /roster\/'\s*\+\s*auth\.uid|roster'\)\.child\(auth\.uid\)/;
    const ownUid = /\$uid\s*===\s*auth\.uid|auth\.uid\s*===\s*\$uid/;
    const isHostsUid = /\$uid\s*===\s*root\.child\('rooms\/'\s*\+\s*\$code\s*\+\s*'\/meta\/hostUid'\)\.val\(\)|meta\/hostUid'\)\.val\(\)\s*===\s*\$uid/;

    const presence = room.presence || {};
    check(hostCheck.test(presence['.read'] || '') && !rosterCheck.test(presence['.read'] || ''),
        'a presença inteira deveria ser lida só pelo host, veio: ' + presence['.read']);
    check(hostCheck.test(presence['.write'] || ''), 'o host deveria poder gravar (e apagar) a presença, veio: ' + presence['.write']);

    const own = presence.$uid || {};
    const write = own['.write'] || '';
    check(ownUid.test(write) && rosterCheck.test(write) && hostCheck.test(write),
        'presence/$uid deveria ser gravada só pelo próprio uid, estando no roster ou sendo o host, veio: ' + write);
    const validate = own['.validate'] || '';
    check(/online/.test(validate) && /isBoolean\(\)/.test(validate),
        'presence/$uid deveria exigir online verdadeiro ou falso, veio: ' + validate);
    check(/hasChildren\(\[[^\]]*'online'[^\]]*\]\)/.test(validate) && /hasChildren\(\[[^\]]*'lastSeen'[^\]]*\]\)/.test(validate) &&
        /newData\.child\('lastSeen'\)\.val\(\)\s*===\s*now\b/.test(validate),
        'presence/$uid deveria exigir online e lastSeen, com lastSeen igual à hora do servidor (=== now: ninguém grava sinal com hora inventada), veio: ' + validate);
    const read = own['.read'] || '';
    check(rosterCheck.test(read) && isHostsUid.test(read) && !ownUid.test(read),
        'quem está no roster deveria ler só a presença do host, veio: ' + read);
});

// ============================================
// SINAL DE VIDA E TOLERÂNCIA (etapa 3a)
// ============================================

const lastOf = (list) => list[list.length - 1];

asyncTest('T188 Sinal de vida: o host e quem foi aceito gravam { online: true, lastSeen: hora do servidor } ao entrar, a cada heartbeatInterval (a opção, não um número fixo) e na hora em que a aba volta a ficar visível; quem não foi aceito não grava; o servidor grava offline com a hora da queda; quem é tirado da sala ou sai dela para de gravar', async () => {
    const { fake, clock, host, ana } = await roomWithGuest();
    const presenceOf = (who) => fake.read('rooms/sala01/presence/' + who);
    const beat = TIMING.heartbeatInterval;

    await elapse(clock, beat * 2);
    check(presenceWrites(ana, 'uid-ana') === 0, 'quem ainda não foi aceito não deveria mandar sinal, gravou ' + presenceWrites(ana, 'uid-ana') + ' vez(es)');

    const hostBefore = presenceWrites(host, 'uid-host');
    await elapse(clock, beat * 3);
    check(presenceWrites(host, 'uid-host') - hostBefore === 3,
        'em 3 × heartbeatInterval (' + beat + ' ms), o host deveria mandar 3 sinais, mandou ' + (presenceWrites(host, 'uid-host') - hostBefore));
    const hostSignal = presenceOf('uid-host');
    check(isSignal(hostSignal, true) && clock.now - hostSignal.lastSeen < beat,
        'o sinal do host deveria ser { online: true, lastSeen } com a hora do servidor do último sinal, veio: ' + JSON.stringify(hostSignal) + ' às ' + clock.now);

    await host.channel.admit('uid-ana');
    await flush();
    const admittedAt = clock.now;
    check(isSignal(presenceOf('uid-ana'), true, admittedAt), 'aceita, Ana deveria mandar o sinal na hora, veio: ' + JSON.stringify(presenceOf('uid-ana')));
    const anaBefore = presenceWrites(ana, 'uid-ana');
    await elapse(clock, beat * 3);
    check(presenceWrites(ana, 'uid-ana') - anaBefore === 3,
        'em 3 × heartbeatInterval, Ana deveria mandar 3 sinais, mandou ' + (presenceWrites(ana, 'uid-ana') - anaBefore));
    const anaSignal = presenceOf('uid-ana');
    check(isSignal(anaSignal, true) && anaSignal.lastSeen > admittedAt && clock.now - anaSignal.lastSeen < beat,
        'o sinal de Ana deveria andar com a hora do servidor, veio: ' + JSON.stringify(anaSignal) + ' às ' + clock.now);

    // A aba volta a ficar visível: sinal na hora, sem esperar o ritmo.
    await elapse(clock, 1000);
    const hiddenBefore = presenceWrites(ana, 'uid-ana');
    ana.document.setVisibility('hidden');
    await flush();
    check(presenceWrites(ana, 'uid-ana') === hiddenBefore, 'esconder a aba não deveria mandar sinal');
    ana.document.setVisibility('visible');
    await flush();
    check(presenceWrites(ana, 'uid-ana') === hiddenBefore + 1 && isSignal(presenceOf('uid-ana'), true, clock.now),
        'a aba que volta a ficar visível deveria mandar o sinal na hora, veio: ' + JSON.stringify(presenceOf('uid-ana')) + ' às ' + clock.now);

    // Queda: o que ficou com o servidor (onDisconnect) leva a hora da queda.
    await elapse(clock, 1000);
    ana.device.goOffline();
    await flush();
    check(isSignal(presenceOf('uid-ana'), false, clock.now),
        'na queda, o servidor deveria gravar { online: false, lastSeen: hora da queda }, veio: ' + JSON.stringify(presenceOf('uid-ana')) + ' às ' + clock.now);
    ana.device.goOnline();
    await flush();
    check(isSignal(presenceOf('uid-ana'), true, clock.now), 'na volta da conexão, Ana deveria mandar o sinal de novo, veio: ' + JSON.stringify(presenceOf('uid-ana')));

    // Tirada da sala: para de mandar sinal (as regras recusariam).
    await host.channel.dismiss('uid-ana');
    await flush();
    const afterDismiss = presenceWrites(ana, 'uid-ana');
    await elapse(clock, beat * 2);
    ana.document.setVisibility('hidden');
    ana.document.setVisibility('visible');
    await flush();
    check(presenceWrites(ana, 'uid-ana') === afterDismiss && presenceOf('uid-ana') === undefined,
        'tirada da sala, Ana não deveria mandar mais sinal, mandou ' + (presenceWrites(ana, 'uid-ana') - afterDismiss) + ' vez(es)');

    // O host encerra a sala: para de mandar sinal e não a recria.
    await host.channel.leave();
    await flush();
    const afterLeave = host.device.writes.length;
    await elapse(clock, beat * 2);
    host.document.setVisibility('hidden');
    host.document.setVisibility('visible');
    await flush();
    check(host.device.writes.length === afterLeave && fake.read('rooms/sala01') === undefined,
        'depois de sair, o host não deveria gravar mais nada, gravou: ' + JSON.stringify(host.device.writes.slice(afterLeave)));
    check(host.document.listenerCount() === 0, 'depois de sair, o canal não deveria continuar ouvindo a aba');
});

asyncTest('T189 Tolerância: para o host, quem está offline com o sinal recente continua presente e só cai com o sinal parado há mais de presenceTimeout — também com online: true (aba congelada), conferido sozinho, sem esperar mudança no banco — e volta com o sinal; para quem foi aceito, o host offline aparece na hora e o host com o sinal parado há mais de hostTimeout também; cada mudança é avisada uma vez', async () => {
    const { fake, clock, host, ana } = await roomWithGuest();
    const presenceOf = (who) => fake.read('rooms/sala01/presence/' + who);
    // Aqui só a presença importa: toda tentativa de Ana de assumir a sala
    // com o host parado é recusada (a troca de host está no T192–T195).
    watchTransactions(ana).rejectNext = Infinity;
    await host.channel.admit('uid-ana');
    await flush();
    check(same(host.got.presence, [{ uid: 'uid-ana', online: true }]), 'pré-condição: o host vê Ana presente, veio: ' + JSON.stringify(host.got.presence));

    // Ana cai (offline): continua presente durante a tolerância.
    ana.device.goOffline();
    await flush();
    await elapse(clock, TIMING.presenceTimeout - 1000);
    check(host.got.presence.length === 1,
        'offline com o sinal de há menos de presenceTimeout (' + TIMING.presenceTimeout + ' ms), Ana deveria continuar presente, veio: ' + JSON.stringify(host.got.presence));
    await elapse(clock, 2500);
    check(same(host.got.presence.slice(1), [{ uid: 'uid-ana', online: false }]),
        'com o sinal parado há mais de presenceTimeout, o host deveria ver Ana cair, veio: ' + JSON.stringify(host.got.presence));
    await elapse(clock, TIMING.presenceTimeout);
    check(host.got.presence.length === 2, 'a queda deveria ser avisada uma vez só, veio: ' + JSON.stringify(host.got.presence));
    ana.device.goOnline();
    await flush();
    // Quem caiu volta com dois sinais seguidos no ritmo (T205): espera o segundo.
    await elapse(clock, TIMING.heartbeatInterval + 500);
    check(same(lastOf(host.got.presence), { uid: 'uid-ana', online: true }) && host.got.presence.length === 3,
        'com o sinal de volta, Ana deveria aparecer presente, veio: ' + JSON.stringify(host.got.presence));

    // Aba congelada (tela bloqueada): a conexão fica, o sinal para.
    ana.document.setVisibility('visible');
    await flush();
    ana.frozen = true;
    await elapse(clock, TIMING.presenceTimeout - 1000);
    check(host.got.presence.length === 3, 'congelada há menos de presenceTimeout, Ana deveria continuar presente, veio: ' + JSON.stringify(host.got.presence));
    await elapse(clock, 2500);
    check(presenceOf('uid-ana').online === true && same(lastOf(host.got.presence), { uid: 'uid-ana', online: false }),
        'congelada (online: true no banco, sinal parado), Ana deveria cair para o host, veio: ' + JSON.stringify(host.got.presence));
    ana.frozen = false;
    ana.document.setVisibility('visible');
    await flush();
    await elapse(clock, TIMING.heartbeatInterval + 500);
    check(same(lastOf(host.got.presence), { uid: 'uid-ana', online: true }), 'desbloqueada, Ana deveria voltar, veio: ' + JSON.stringify(host.got.presence));

    // Quem foi aceito: o host offline aparece na hora.
    const seen = ana.got.hostPresence;
    host.device.goOffline();
    await flush();
    check(lastOf(seen) === false, 'com o host offline, Ana deveria ver na hora, veio: ' + JSON.stringify(seen));
    host.device.goOnline();
    await flush();
    check(lastOf(seen) === true, 'com o host de volta, Ana deveria ver, veio: ' + JSON.stringify(seen));

    // O host congelado: online: true no banco, sinal parado há mais de hostTimeout.
    host.document.setVisibility('visible');
    await flush();
    host.frozen = true;
    const before = seen.length;
    await elapse(clock, TIMING.hostTimeout - 1000);
    check(seen.length === before, 'com o sinal do host parado há menos de hostTimeout (' + TIMING.hostTimeout + ' ms), Ana não deveria vê-lo caído, veio: ' + JSON.stringify(seen));
    await elapse(clock, 2500);
    check(presenceOf('uid-host').online === true && lastOf(seen) === false,
        'com o sinal do host parado há mais de hostTimeout, Ana deveria vê-lo caído (mesmo com online: true), veio: ' + JSON.stringify(seen));
    host.frozen = false;
    host.document.setVisibility('visible');
    await flush();
    check(lastOf(seen) === true, 'com o sinal do host de volta, Ana deveria vê-lo de novo, veio: ' + JSON.stringify(seen));
    check(seen.every((v, i) => i === 0 || v !== seen[i - 1]), 'Ana deveria ser avisada só das mudanças do host, sem repetir, veio: ' + JSON.stringify(seen));

    // Sem conexão, ninguém conclui nada: o host fora da rede por mais que a
    // tolerância não derruba quem continuou mandando o sinal, e Ana, sem
    // conexão, não vê o host cair e voltar (só a própria volta conta).
    const hostEvents = host.got.presence.length;
    host.device.goOffline();
    await elapse(clock, TIMING.presenceTimeout + 2000);
    host.device.goOnline();
    await flush();
    await elapse(clock, 1500);
    check(host.got.presence.length === hostEvents,
        'o host sem conexão não deveria dar Ana como caída (o sinal dela só não chegava), veio: ' + JSON.stringify(host.got.presence.slice(hostEvents)));
    const anaSeen = seen.length;
    ana.device.goOffline();
    await elapse(clock, TIMING.hostTimeout + 2000);
    ana.device.goOnline();
    await flush();
    await elapse(clock, 1500);
    check(seen.length === anaSeen, 'Ana sem conexão não deveria ver o host cair e voltar, veio: ' + JSON.stringify(seen.slice(anaSeen)));
});

asyncTest('T190 F5 dentro da tolerância não é queda: quem fecha a página e abre de novo antes de presenceTimeout nunca aparece caído para o host; o F5 que passa da tolerância aparece como queda e volta', async () => {
    const { fake, clock, host, ana } = await roomWithGuest();
    const presenceOf = (who) => fake.read('rooms/sala01/presence/' + who);
    await host.channel.admit('uid-ana');
    await flush();

    // F5 de Ana: a página fecha e abre de novo uns segundos depois.
    ana.device.close();
    await flush();
    check(isSignal(presenceOf('uid-ana'), false, clock.now), 'ao fechar, o servidor deveria gravar offline com a hora, veio: ' + JSON.stringify(presenceOf('uid-ana')));
    await elapse(clock, 4000);
    const again = openDevice(fake, 'uid-ana', clock);
    await again.channel.joinRoom('sala01', { protocolVersion: VERSION });
    await flush();
    check(again.got.admitted === 1 && isSignal(presenceOf('uid-ana'), true, clock.now),
        'de volta do F5, Ana (ainda no roster) deveria mandar o sinal, veio: ' + JSON.stringify(presenceOf('uid-ana')));
    await elapse(clock, TIMING.presenceTimeout * 2);
    check(same(host.got.presence, [{ uid: 'uid-ana', online: true }]),
        'F5 dentro da tolerância: o host nunca deveria ver Ana cair, veio: ' + JSON.stringify(host.got.presence));

    // F5 que demora mais que a tolerância: cai e volta.
    again.device.close();
    await flush();
    await elapse(clock, TIMING.presenceTimeout + 2000);
    check(same(lastOf(host.got.presence), { uid: 'uid-ana', online: false }),
        'F5 mais longo que presenceTimeout: o host deveria ver Ana cair, veio: ' + JSON.stringify(host.got.presence));
    const third = openDevice(fake, 'uid-ana', clock);
    await third.channel.joinRoom('sala01', { protocolVersion: VERSION });
    await flush();
    await elapse(clock, TIMING.heartbeatInterval + 500);
    check(host.got.presence.length === 3 && same(lastOf(host.got.presence), { uid: 'uid-ana', online: true }),
        'de volta, Ana deveria aparecer presente, veio: ' + JSON.stringify(host.got.presence));
});

// ============================================
// TROCA DE HOST (etapa 3b)
// ============================================

asyncTest('T192 Troca de host — quem tenta: com o host vivo, ninguém; com o sinal do host parado, o guest aceito tenta por transação no meta só depois de hostTimeout (a opção, não um número fixo), com hostUid = ele, hostEpoch + 1 e o resto igual; a tentativa recusada se repete no segundo seguinte; não tenta quem não foi aceito, quem está sem conexão nem quem acabou de voltar dela; as regras têm o piso de 5 s e o HOST_TIMEOUT do config não fica abaixo dele', async () => {
    const { fake, clock, host, ana, beto } = await roomWithTwoAdmitted();
    const caio = openDevice(fake, 'uid-caio', clock);
    await caio.channel.joinRoom('sala01', { protocolVersion: VERSION });
    await flush();
    const spies = { ana: watchTransactions(ana), beto: watchTransactions(beto), caio: watchTransactions(caio) };
    const tries = () => ({ ana: spies.ana.calls.length, beto: spies.beto.calls.length, caio: spies.caio.calls.length });
    const hostUidNow = () => fake.read('rooms/sala01/meta/hostUid');

    await elapse(clock, TIMING.hostTimeout * 3);
    check(same(tries(), { ana: 0, beto: 0, caio: 0 }), 'com o host vivo, ninguém deveria tentar assumir, veio: ' + JSON.stringify(tries()));

    // Beto perde a conexão; o host congela logo depois de um sinal.
    beto.device.goOffline();
    await flush();
    const metaBefore = fake.read('rooms/sala01/meta');
    await stopHostSignal(host);
    await elapse(clock, TIMING.hostTimeout - 1000);
    check(spies.ana.calls.length === 0 && hostUidNow() === 'uid-host',
        'com o sinal do host parado há menos de hostTimeout (' + TIMING.hostTimeout + ' ms), Ana não deveria tentar, tentou ' + spies.ana.calls.length + ' vez(es)');
    spies.ana.rejectNext = 1;
    await elapse(clock, 2000);
    check(spies.ana.calls.length === 1 && spies.ana.calls[0] === 'rooms/sala01/meta' && hostUidNow() === 'uid-host',
        'passado hostTimeout, Ana deveria tentar uma vez, por transação no meta (esta recusada pelas regras), veio: ' + JSON.stringify(spies.ana.calls));
    await elapse(clock, 1000);
    check(spies.ana.calls.length === 2 && same(fake.read('rooms/sala01/meta'), { ...metaBefore, hostUid: 'uid-ana', hostEpoch: metaBefore.hostEpoch + 1 }),
        'a tentativa recusada deveria se repetir no segundo seguinte e passar, com hostUid = Ana, hostEpoch + 1 e o resto igual, veio: ' +
        JSON.stringify(fake.read('rooms/sala01/meta')) + ' depois de ' + spies.ana.calls.length + ' tentativa(s)');
    check(spies.caio.calls.length === 0 && spies.beto.calls.length === 0,
        'quem não foi aceito (Caio) e quem está sem conexão (Beto) não deveriam tentar, veio: ' + JSON.stringify(tries()));

    // Sem conexão e logo depois da volta dela, o sinal do host pode só não ter chegado: não tenta.
    const room = await roomWithGuest();
    await room.host.channel.admit('uid-ana');
    await flush();
    const spy = watchTransactions(room.ana);
    room.ana.device.goOffline();
    await flush();
    await stopHostSignal(room.host);
    await elapse(room.clock, TIMING.hostTimeout * 2);
    check(spy.calls.length === 0, 'sem conexão, Ana não deveria tentar assumir, tentou ' + spy.calls.length + ' vez(es)');
    room.ana.device.goOnline();
    await flush();
    await elapse(room.clock, 1000);
    check(spy.calls.length === 0 && room.fake.read('rooms/sala01/meta/hostUid') === 'uid-host',
        'logo depois da volta da conexão, Ana não deveria tentar, tentou ' + spy.calls.length + ' vez(es)');
    await elapse(room.clock, 2 * TIMING.heartbeatInterval + 1000);
    check(room.fake.read('rooms/sala01/meta/hostUid') === 'uid-ana',
        'passada a carência da volta, com o host ainda parado, Ana deveria assumir, veio: ' + JSON.stringify(room.fake.read('rooms/sala01/meta')));

    // Regras: o piso de 5 s pelo lastSeen do host antigo; o config não fica abaixo dele.
    const rules = JSON.parse(fs.readFileSync(path.join(ROOT, 'database.rules.json'), 'utf8')).rules;
    const metaWrite = (((rules.rooms || {}).$code || {}).meta || {})['.write'] || '';
    check(/roster\/'\s*\+\s*auth\.uid/.test(metaWrite) && /hostEpoch'\)\.val\(\)\s*\+\s*1\b/.test(metaWrite) &&
        /protocolVersion'\)\.val\(\)\s*===\s*data\.child\('protocolVersion'\)/.test(metaWrite) &&
        /createdAt'\)\.val\(\)\s*===\s*data\.child\('createdAt'\)/.test(metaWrite) &&
        /lastSeen/.test(metaWrite) && /now\s*-\s*5000\b/.test(metaWrite),
        'a regra do meta deveria aceitar a troca só de quem está no roster, com hostEpoch + 1, a mesma versão e criação e o lastSeen do host antigo há mais de 5000 ms, veio: ' + metaWrite);
    const configText = fs.readFileSync(path.join(ROOT, 'config/game-config.js'), 'utf8');
    const hostTimeout = Number((configText.match(/HOST_TIMEOUT:\s*(\d+)/) || [])[1]);
    check(hostTimeout >= 5000, 'o HOST_TIMEOUT do config não pode ficar abaixo do piso de 5000 ms das regras, veio: ' + hostTimeout);
});

asyncTest('T193 Troca de host — dois tentam ao mesmo tempo: só um grava, o hostEpoch sobe uma vez (2, não 3), quem perdeu desiste ao ver o meta trocado e não tenta mais; cada um tem uma tentativa aberta por vez', async () => {
    const { fake, clock, host, ana, beto } = await roomWithTwoAdmitted();
    const spyAna = watchTransactions(ana);
    const spyBeto = watchTransactions(beto);
    spyAna.hold = true;
    spyBeto.hold = true;

    await stopHostSignal(host);
    await elapse(clock, TIMING.hostTimeout + 3000);
    check(spyAna.calls.length === 1 && spyBeto.calls.length === 1,
        'com a tentativa ainda aberta, cada um deveria ter uma só, veio: Ana ' + spyAna.calls.length + ', Beto ' + spyBeto.calls.length);
    check(fake.read('rooms/sala01/meta/hostEpoch') === 1, 'pré-condição: nada gravado enquanto as tentativas estão abertas');

    // O banco trata a da Ana primeiro; a do Beto chega com o meta já trocado.
    spyAna.held.shift()();
    await flush();
    spyBeto.held.shift()();
    await flush();
    const meta = fake.read('rooms/sala01/meta');
    check(meta.hostUid === 'uid-ana' && meta.hostEpoch === 2,
        'só a primeira deveria valer: hostUid = Ana e hostEpoch 2 (quem chega depois desiste, sem subir para 3), veio: ' + JSON.stringify(meta));
    check(!beto.device.writes.some(w => /\/meta$/.test(w.path)), 'Beto não deveria gravar o meta, gravou: ' + JSON.stringify(beto.device.writes.filter(w => /meta/.test(w.path))));

    spyAna.hold = false;
    spyBeto.hold = false;
    await elapse(clock, TIMING.hostTimeout * 2);
    check(spyAna.calls.length === 1 && spyBeto.calls.length === 1,
        'depois da troca, ninguém deveria tentar de novo, veio: Ana ' + spyAna.calls.length + ', Beto ' + spyBeto.calls.length);
    check(same(fake.read('rooms/sala01/meta'), meta), 'o meta não deveria mudar mais, veio: ' + JSON.stringify(fake.read('rooms/sala01/meta')));
    const s = beto.channel.snapshot();
    check(s.hostUid === 'uid-ana' && s.hostEpoch === 2, 'o canal do Beto deveria ter o host novo e o hostEpoch 2, veio: ' + JSON.stringify(s));
});

asyncTest('T194 Troca de host — todos ficam sabendo: onHostChanged(host novo, hostEpoch) uma vez para quem assumiu, o outro guest, quem não foi aceito, o host antigo parado e o host antigo que volta da queda de rede; publicar (só lastActivity muda) não avisa; quem fica como guest passa a ver o host novo; o host antigo deixa de ser host no canal: para o sinal, não recebe nem apaga os pedidos e não grava nada', async () => {
    const { fake, clock, host, ana, beto } = await roomWithTwoAdmitted();
    const caio = openDevice(fake, 'uid-caio', clock);
    await caio.channel.joinRoom('sala01', { protocolVersion: VERSION });
    await flush();
    const all = { host, ana, beto, caio };

    await elapse(clock, 1000);
    await host.channel.publish({ publicState: { round: 1 } });
    await flush();
    const early = Object.keys(all).filter(k => all[k].got.hostChanged.length > 0);
    check(early.length === 0, 'publicar (só o lastActivity muda) não deveria avisar troca de host, avisou: ' + early.join(', '));

    await stopHostSignal(host);
    await elapse(clock, TIMING.hostTimeout + 2000);
    const winner = fake.read('rooms/sala01/meta/hostUid');
    check(winner === 'uid-ana' || winner === 'uid-beto', 'pré-condição: um dos guests aceitos assumiu, veio: ' + winner);
    const lost = winner === 'uid-ana' ? beto : ana;
    await elapse(clock, TIMING.hostTimeout);
    for (const name of Object.keys(all)) {
        check(same(all[name].got.hostChanged, [{ uid: winner, hostEpoch: 2 }]),
            name + ' deveria receber onHostChanged uma vez, com o host novo e o hostEpoch 2, veio: ' + JSON.stringify(all[name].got.hostChanged));
    }
    const s = lost.channel.snapshot();
    check(s.hostUid === winner && s.hostEpoch === 2 && s.isHost === false, 'quem perdeu continua guest, com o host novo, veio: ' + JSON.stringify(s));
    check(caio.channel.snapshot().hostUid === winner, 'quem não foi aceito também deveria passar ao host novo, veio: ' + JSON.stringify(caio.channel.snapshot()));
    check(lastOf(lost.got.hostPresence) === true,
        'quem fica como guest deveria passar a ver a presença do host novo (vivo), não a do antigo, veio: ' + JSON.stringify(lost.got.hostPresence));

    // O host antigo descongela: não é mais host no canal.
    const hs = host.channel.snapshot();
    check(hs.isHost === false && hs.hostUid === winner && hs.hostEpoch === 2, 'o host antigo deveria deixar de ser host no canal, veio: ' + JSON.stringify(hs));
    host.frozen = false;
    const writesBefore = host.device.writes.length;
    host.document.setVisibility('visible');
    await elapse(clock, TIMING.heartbeatInterval * 2);
    await host.channel.publish({ publicState: { stale: true } });
    await host.channel.broadcast({ type: 'stale' });
    await flush();
    check(host.device.writes.length === writesBefore,
        'o host antigo não deveria gravar mais nada (sinal, publicação, aviso), gravou: ' + JSON.stringify(host.device.writes.slice(writesBefore)));
    await lost.channel.sendToHost({ type: 'answer', alternative: 'a' });
    await flush();
    check(host.got.requests.length === 0 && Object.keys(fake.read('rooms/sala01/requests') || {}).length === 1,
        'o pedido mandado depois da troca não deveria chegar ao host antigo e deveria esperar no banco pelo host novo, veio: ' +
        JSON.stringify(host.got.requests) + ' / ' + JSON.stringify(fake.read('rooms/sala01/requests')));

    // O host antigo que estava sem conexão fica sabendo quando ela volta.
    const room = await roomWithGuest();
    await room.host.channel.admit('uid-ana');
    await flush();
    room.host.device.goOffline();
    await flush();
    await elapse(room.clock, TIMING.hostTimeout + 2000);
    check(room.fake.read('rooms/sala01/meta/hostUid') === 'uid-ana', 'pré-condição: Ana assumiu com o host sem conexão, veio: ' + JSON.stringify(room.fake.read('rooms/sala01/meta')));
    room.host.device.goOnline();
    await flush();
    check(same(room.host.got.hostChanged, [{ uid: 'uid-ana', hostEpoch: 2 }]) && room.host.channel.snapshot().isHost === false,
        'o host antigo, de volta da queda de rede, deveria receber onHostChanged e deixar de ser host, veio: ' +
        JSON.stringify(room.host.got.hostChanged) + ' / ' + JSON.stringify(room.host.channel.snapshot()));
});

asyncTest('T195 Troca de host — o host volta antes de hostTimeout (aba congelada, queda de rede curta ou F5): ninguém assume e o hostEpoch continua 1; a contagem recomeça do último sinal: numa queda seguinte, a troca só vem hostTimeout depois dela', async () => {
    const { fake, clock, host, ana } = await roomWithGuest();
    await host.channel.admit('uid-ana');
    await flush();
    const spy = watchTransactions(ana);
    const metaNow = () => fake.read('rooms/sala01/meta');

    // Aba congelada que volta.
    await stopHostSignal(host);
    await elapse(clock, TIMING.hostTimeout - 2000);
    host.frozen = false;
    host.document.setVisibility('visible');
    await elapse(clock, TIMING.hostTimeout * 2);
    check(spy.calls.length === 0, 'o host que descongela antes de hostTimeout: Ana não deveria tentar, tentou ' + spy.calls.length + ' vez(es)');

    // Queda de rede curta.
    host.device.goOffline();
    await elapse(clock, TIMING.hostTimeout - 2000);
    host.device.goOnline();
    await elapse(clock, TIMING.hostTimeout * 2);
    check(spy.calls.length === 0, 'o host que volta da queda de rede antes de hostTimeout: Ana não deveria tentar, tentou ' + spy.calls.length + ' vez(es)');

    // F5 do host.
    host.device.close();
    await elapse(clock, TIMING.hostTimeout - 3000);
    const hostAgain = openDevice(fake, 'uid-host', clock);
    const back = await hostAgain.channel.joinRoom('sala01', { protocolVersion: VERSION });
    await elapse(clock, TIMING.hostTimeout * 2);
    check(spy.calls.length === 0 && back && back.isHost === true && metaNow().hostUid === 'uid-host' && metaNow().hostEpoch === 1,
        'o F5 do host antes de hostTimeout: ninguém assume e ele continua host com o hostEpoch 1, veio: ' + JSON.stringify(metaNow()) + ', tentativas ' + spy.calls.length);
    check(ana.got.hostChanged.length === 0, 'sem troca, Ana não deveria receber onHostChanged, veio: ' + JSON.stringify(ana.got.hostChanged));

    // A contagem recomeça do último sinal: parado 6 s, volta, para de novo.
    await stopHostSignal(hostAgain);
    await elapse(clock, TIMING.hostTimeout - 2000);
    await stopHostSignal(hostAgain);
    await elapse(clock, TIMING.hostTimeout - 1000);
    check(spy.calls.length === 0 && metaNow().hostUid === 'uid-host',
        'a contagem deveria recomeçar do último sinal: com ele parado há menos de hostTimeout, Ana não deveria tentar, tentou ' + spy.calls.length + ' vez(es)');
    await elapse(clock, 2000);
    check(metaNow().hostUid === 'uid-ana' && metaNow().hostEpoch === 2,
        'com o sinal parado há mais de hostTimeout desde o último, Ana deveria assumir (hostEpoch 2), veio: ' + JSON.stringify(metaNow()));
});

// ============================================
// VOLTA PELO SINAL DE VIDA (BUG-030)
// ============================================

/**
 * Um sinal só, fora do ritmo, com o aparelho congelado: o timer da aba
 * escondida há mais de 5 min, que o navegador roda uma vez por minuto.
 */
async function loneBeat(d) {
    d.document.setVisibility('visible');
    d.document.setVisibility('hidden');
    await flush();
}

asyncTest('T205 Volta pelo sinal de vida: quem o host deu como caído com a conexão de pé (aba escondida, sinal parado) só volta com dois sinais online seguidos no ritmo (até 2 × heartbeatInterval entre eles) — o sinal solto da aba escondida há mais de 5 min (um por minuto) não o traz de volta, nem o primeiro sinal da aba visível sozinho; com o segundo, volta uma vez e fica (BUG-030)', async () => {
    const { clock, host, ana } = await roomWithGuest();
    await host.channel.admit('uid-ana');
    await flush();
    check(same(host.got.presence, [{ uid: 'uid-ana', online: true }]), 'pré-condição: o host vê Ana presente, veio: ' + JSON.stringify(host.got.presence));

    // Aba escondida: o sinal para (a conexão fica) e Ana cai.
    ana.document.setVisibility('hidden');
    ana.frozen = true;
    await elapse(clock, TIMING.presenceTimeout + 2000);
    check(host.got.presence.length === 2 && same(lastOf(host.got.presence), { uid: 'uid-ana', online: false }),
        'pré-condição: com o sinal parado, o host deveria ver Ana cair, veio: ' + JSON.stringify(host.got.presence));

    // Escondida há mais de 5 min: um sinal solto por minuto.
    for (let minute = 1; minute <= 3; minute++) {
        await elapse(clock, 56000);
        await loneBeat(ana);
        await elapse(clock, 4000);
        check(host.got.presence.length === 2,
            'um sinal solto (o da aba escondida, um por minuto) não deveria trazer Ana de volta (minuto ' + minute + '), veio: ' + JSON.stringify(host.got.presence));
    }

    // A aba volta a ficar visível: o primeiro sinal sozinho ainda não basta.
    await elapse(clock, 10000);
    ana.frozen = false;
    ana.document.setVisibility('visible');
    await flush();
    check(host.got.presence.length === 2,
        'o primeiro sinal da aba visível, sozinho, não deveria trazer Ana de volta (falta o segundo, no ritmo), veio: ' + JSON.stringify(host.got.presence));
    await elapse(clock, TIMING.heartbeatInterval + 500);
    check(host.got.presence.length === 3 && same(lastOf(host.got.presence), { uid: 'uid-ana', online: true }),
        'com o segundo sinal no ritmo, o host deveria ver Ana de volta, uma vez, veio: ' + JSON.stringify(host.got.presence));
    await elapse(clock, TIMING.presenceTimeout * 2);
    check(host.got.presence.length === 3, 'de volta e mandando o sinal, Ana não deveria cair de novo, veio: ' + JSON.stringify(host.got.presence));
});

asyncTest('T206 Volta pelo sinal de vida — o que não traz ninguém de volta: a carência da volta da conexão do host não revive quem fechou a aba (online: false) nem quem está com o sinal parado; o host que abre a sala (F5) não dá como presente quem fechou a aba há pouco (online: false dentro da tolerância): espera e, passada a tolerância, avisa a queda uma vez (BUG-030)', async () => {
    const { fake, clock, host, ana, beto } = await roomWithTwoAdmitted();
    check(host.got.presence.length === 2 && host.got.presence.every(p => p.online === true),
        'pré-condição: o host vê Ana e Beto presentes, veio: ' + JSON.stringify(host.got.presence));

    // Ana fecha a aba; Beto fica com a aba escondida (sinal parado, conexão de pé).
    ana.device.close();
    beto.document.setVisibility('hidden');
    beto.frozen = true;
    await elapse(clock, TIMING.presenceTimeout + 2000);
    const dropped = host.got.presence.slice(2);
    check(dropped.length === 2 && dropped.every(p => p.online === false),
        'pré-condição: o host deveria ver Ana e Beto caírem, veio: ' + JSON.stringify(dropped));

    // A conexão do host cai e volta: a carência não revive ninguém.
    const before = host.got.presence.length;
    host.device.goOffline();
    await elapse(clock, 1000);
    host.device.goOnline();
    await flush();
    await elapse(clock, 1500);
    check(host.got.presence.length === before,
        'na carência da volta da conexão do host, ninguém deveria voltar (Ana fechou a aba, Beto está com o sinal parado), veio: ' + JSON.stringify(host.got.presence.slice(before)));
    await elapse(clock, TIMING.heartbeatInterval * 3);
    check(host.got.presence.length === before, 'depois da carência, também não, veio: ' + JSON.stringify(host.got.presence.slice(before)));

    // Controle: Beto mostra a aba e volta; Ana continua caída.
    beto.frozen = false;
    beto.document.setVisibility('visible');
    await elapse(clock, TIMING.heartbeatInterval + 500);
    check(same(host.got.presence.slice(before), [{ uid: 'uid-beto', online: true }]),
        'Beto, com a aba visível e o sinal no ritmo, deveria voltar (e Ana não), veio: ' + JSON.stringify(host.got.presence.slice(before)));

    // Beto fecha a aba e, 2 s depois, o host dá F5: Beto (offline dentro da tolerância) não aparece presente.
    beto.device.close();
    await elapse(clock, 2000);
    host.device.close();
    const hostAgain = openDevice(fake, 'uid-host', clock);
    await hostAgain.channel.joinRoom('sala01', { protocolVersion: VERSION });
    await flush();
    const betoSeen = () => hostAgain.got.presence.filter(p => p.uid === 'uid-beto');
    check(betoSeen().length === 0,
        'o host de volta do F5 não deveria dar como presente quem fechou a aba há pouco (online: false), veio: ' + JSON.stringify(betoSeen()));
    await elapse(clock, TIMING.presenceTimeout);
    check(same(betoSeen(), [{ uid: 'uid-beto', online: false }]),
        'passada a tolerância, o host deveria avisar a queda de Beto uma vez, veio: ' + JSON.stringify(betoSeen()));
    check(same(hostAgain.got.presence.filter(p => p.uid === 'uid-ana'), [{ uid: 'uid-ana', online: false }]),
        'Ana, fora há muito tempo, deveria aparecer caída uma vez, veio: ' + JSON.stringify(hostAgain.got.presence));
});

asyncTest('T218 Diagnóstico no console (BUG-033): o aparelho escreve uma linha quando a própria conexão com o banco cai e outra quando volta, com quanto tempo ficou fora — não no "desconectado" antes da primeira conexão; a queda avisada ao host leva a hora do último sinal de quem caiu (onPresence com lastSeen)', async () => {
    const clock = { now: 1000 };
    const fake = fakeWithServerTime(clock);
    const seen = [];
    const host = openDevice(fake, 'uid-host', clock, { onPresence: (who, online, lastSeen) => seen.push({ who, online, lastSeen }) });
    await host.channel.createRoom('sala01', { protocolVersion: VERSION });
    await flush();
    clock.now = 2000;
    const ana = openDevice(fake, 'uid-ana', clock);
    await ana.channel.joinRoom('sala01', { protocolVersion: VERSION });
    await host.channel.admit('uid-ana');
    await flush();
    const lines = (d, re) => d.logs.filter(l => re.test(l));
    const fell = /Conexão com o banco caiu/;
    const back = /Conexão com o banco voltou depois de (\d+) s/;

    // Aparelho aberto já sem conexão: o "desconectado" inicial não é queda.
    const caio = openDevice(fake, 'uid-caio', clock);
    caio.device.goOffline();
    await caio.channel.joinRoom('sala01', { protocolVersion: VERSION });
    await flush();
    check(lines(caio, fell).length === 0 && lines(host, fell).length === 0 && lines(ana, fell).length === 0,
        'sem queda, nenhum aparelho deveria escrever que a conexão caiu, veio: ' + JSON.stringify(caio.logs.concat(ana.logs)));

    // Ana perde a conexão por 7 s e volta.
    ana.device.goOffline();
    await flush();
    check(lines(ana, fell).length === 1, 'Ana deveria escrever uma vez que a conexão caiu, veio: ' + JSON.stringify(ana.logs.slice(-3)));
    await elapse(clock, 7000);
    ana.device.goOnline();
    await flush();
    const backLine = lines(ana, back);
    check(backLine.length === 1 && backLine[0].match(back)[1] === '7',
        'Ana deveria escrever que a conexão voltou depois de 7 s, veio: ' + JSON.stringify(ana.logs.slice(-3)));

    // Ana cai de vez: o host recebe a queda com a hora do último sinal dela.
    await elapse(clock, 1000);
    const droppedAt = clock.now;
    ana.device.goOffline();
    await flush();
    await elapse(clock, TIMING.presenceTimeout + 2000);
    const drop = seen.filter(p => p.who === 'uid-ana' && p.online === false);
    check(drop.length === 1 && drop[0].lastSeen === droppedAt,
        'o host deveria receber a queda de Ana com a hora do último sinal dela (' + droppedAt + '), veio: ' + JSON.stringify(drop));
    check(lines(ana, fell).length === 2, 'cada queda da conexão deveria ter a linha, veio: ' + lines(ana, fell).length);
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
    finish('Canal da sala pelo Firebase');
})();
