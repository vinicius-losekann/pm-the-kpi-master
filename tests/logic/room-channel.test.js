// ============================================
// PM: The KPI Master - Testes de lógica: Canal da sala pelo Firebase
// ============================================
// Confere js/network/roomChannel.js, o canal por onde o jogo vai
// conversar pelo Firebase Realtime Database (roadmap 2.9): criar sala,
// reaproveitar sala parada, entrar, versão do jogo, F5, aceitar e tirar
// da sala (roster), pedidos ao host (requests), avisos do host para todos
// (feed) e para um jogador (inbox), publicar e ler o estado (público,
// secreto e o de cada jogador), limpar e sair; e as regras do banco
// para rooms/ (database.rules.json).
// O banco é o Firebase simulado de fakeFirebase.js, com vários
// aparelhos; as regras de verdade são conferidas no emulador (E26).
// Rodar a partir da raiz:
//     node tests/logic/room-channel.test.js
// ============================================

const { fs, path, vm, ROOT, test, check, start, finish } = require('./environment');
const { createFakeFirebase, flush } = require('./fakeFirebase');

start('Canal da sala pelo Firebase');

// O framework de environment.js é síncrono; aqui cada caso é
// assíncrono: roda tudo antes e depois registra o resultado com test().
const cases = [];
function asyncTest(name, fn) {
    cases.push({ name, fn });
}

const VERSION = 10;
const HOUR_MS = 60 * 60 * 1000;

/**
 * Um aparelho com o jogo aberto: carrega o js/network/roomChannel.js
 * real num contexto isolado e cria o canal ligado ao banco simulado,
 * com o uid e o relógio informados. Tudo o que o canal entrega ao jogo
 * fica em `got`.
 */
function openDevice(fake, uid, clock) {
    const device = fake.client(uid);
    const logs = [];
    const silent = {};
    ['log', 'warn', 'error', 'info'].forEach(level => {
        silent[level] = (...args) => logs.push(level + ': ' + args.join(' '));
    });
    const ctx = vm.createContext({ console: silent, setTimeout, clearTimeout });
    vm.runInContext('var window = this;', ctx);
    const file = 'js/network/roomChannel.js';
    vm.runInContext(fs.readFileSync(path.join(ROOT, file), 'utf8'), ctx, { filename: file });
    const got = { requests: [], messages: [], states: [], hands: [], admitted: 0, dismissed: 0 };
    const channel = ctx.Game.network.roomChannel.create({
        db: device.db,
        uid,
        now: () => clock.now,
        timestamp: () => clock.now,
        onRequest: (msg, from) => got.requests.push({ msg: JSON.parse(JSON.stringify(msg)), from }),
        onMessage: (msg) => got.messages.push(JSON.parse(JSON.stringify(msg))),
        onState: (state) => got.states.push(state === null ? null : JSON.parse(JSON.stringify(state))),
        onHand: (hand) => got.hands.push(hand === null ? null : JSON.parse(JSON.stringify(hand))),
        onAdmitted: () => got.admitted++,
        onDismissed: () => got.dismissed++
    });
    return { device, channel, got, logs, ctx };
}

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/** O host cria a sala "sala01" e Ana entra (ainda sem ser aceita). */
async function roomWithGuest() {
    const fake = createFakeFirebase();
    const clock = { now: 1000 };
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
    const leftovers = ['roster', 'public', 'secret', 'hands', 'feed', 'inbox', 'requests', 'presence']
        .filter(k => fake.read('rooms/sala01/' + k) !== undefined);
    check(leftovers.length === 0, 'o que era da sala antiga deveria ser apagado, sobrou: ' + leftovers.join(', '));
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

    const writesBefore = ana.device.writes.length;
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
