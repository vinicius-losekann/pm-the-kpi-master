// ============================================
// PM: The KPI Master - Testes de lógica: Teste de conexão pelo Firebase
// ============================================
// Confere js/network/connectionCheck.js, a lógica da página de teste de
// conexão (firebase-check.html, roadmap 2.9): criar sala, entrar,
// presença (quem caiu sai da lista e volta sozinho), F5, mensagem de
// teste com eco e tempo de ida e volta, mensagem como texto JSON, sair;
// e as regras do banco (database.rules.json) sem segredo nos arquivos.
// O banco é o Firebase simulado de fakeFirebase.js, com vários
// aparelhos. Rodar a partir da raiz:
//     node tests/logic/connection-check.test.js
// ============================================

const { fs, path, vm, ROOT, test, check, start, finish } = require('./environment');
const { createFakeFirebase, flush } = require('./fakeFirebase');

start('Teste de conexão pelo Firebase');

// O framework de environment.js é síncrono; aqui cada caso é
// assíncrono: roda tudo antes e depois registra o resultado com test().
const cases = [];
function asyncTest(name, fn) {
    cases.push({ name, fn });
}

/**
 * Um aparelho com a página de teste aberta: carrega o
 * js/network/connectionCheck.js real num contexto isolado e cria o
 * teste de conexão ligado ao banco simulado, com o uid, o nome e o
 * relógio informados.
 */
function openDevice(fake, uid, name, clock) {
    const device = fake.client(uid);
    const logs = [];
    const silent = {};
    ['log', 'warn', 'error', 'info'].forEach(level => {
        silent[level] = (...args) => logs.push(level + ': ' + args.join(' '));
    });
    const ctx = vm.createContext({ console: silent, setTimeout, clearTimeout });
    vm.runInContext('var window = this;', ctx);
    const file = 'js/network/connectionCheck.js';
    vm.runInContext(fs.readFileSync(path.join(ROOT, file), 'utf8'), ctx, { filename: file });
    const changes = [];
    const conn = ctx.Game.connectionCheck.create({
        db: device.db,
        uid,
        name,
        now: () => clock.now,
        onChange: () => changes.push(clock.now)
    });
    return { device, check: conn, changes, logs, ctx };
}

/** Mensagens gravadas na sala, na ordem em que foram gravadas. */
function messagesOf(fake, code) {
    const all = fake.read('connectionChecks/' + code + '/messages') || {};
    return Object.keys(all).sort().map(key => ({ key, ...all[key] }));
}

/** Nomes dos aparelhos que a página mostra. */
function deviceNames(device) {
    return device.check.snapshot().devices.map(d => d.name).join(',');
}

/** Ana cria a sala "sala01" e Beto entra. */
async function roomWithTwo() {
    const fake = createFakeFirebase();
    const clock = { now: 1000 };
    const ana = openDevice(fake, 'uid-ana', 'Ana', clock);
    const created = await ana.check.createRoom('sala01');
    await flush();
    check(created && created.ok === true, 'Ana deveria criar a sala, veio: ' + JSON.stringify(created));
    clock.now = 2000;
    const beto = openDevice(fake, 'uid-beto', 'Beto', clock);
    const joined = await beto.check.joinRoom('sala01');
    await flush();
    check(joined && joined.ok === true, 'Beto deveria entrar na sala, veio: ' + JSON.stringify(joined));
    return { fake, clock, ana, beto };
}

asyncTest('T143 Criar sala: grava a sala com quem criou como dono e o aparelho dele na lista; a página mostra conectado e como dono', async () => {
    const fake = createFakeFirebase();
    const clock = { now: 1000 };
    const ana = openDevice(fake, 'uid-ana', 'Ana', clock);
    const result = await ana.check.createRoom('sala01');
    await flush();

    check(result && result.ok === true, 'criar sala deveria dar certo, veio: ' + JSON.stringify(result));
    const meta = fake.read('connectionChecks/sala01/meta');
    check(meta && meta.hostUid === 'uid-ana' && meta.createdAt === 1000,
        'a sala deveria ter hostUid = uid de quem criou e createdAt = relógio, veio: ' + JSON.stringify(meta));
    const device = fake.read('connectionChecks/sala01/devices/uid-ana');
    check(device && device.name === 'Ana', 'o aparelho de quem criou deveria estar na lista com o nome, veio: ' + JSON.stringify(device));

    const s = ana.check.snapshot();
    check(s.code === 'sala01' && s.isHost === true && s.connected === true,
        'a página deveria mostrar a sala, dono e conectado, veio: ' + JSON.stringify(s));
    check(s.devices.length === 1 && s.devices[0].uid === 'uid-ana' && s.devices[0].name === 'Ana',
        'a lista de aparelhos deveria ter só Ana, veio: ' + JSON.stringify(s.devices));
    check(ana.changes.length > 0, 'a página deveria ser avisada (onChange) da mudança');
});

asyncTest('T144 Código já em uso: a segunda sala com o mesmo código é recusada (room-exists) e a primeira fica como estava', async () => {
    const fake = createFakeFirebase();
    const clock = { now: 1000 };
    const ana = openDevice(fake, 'uid-ana', 'Ana', clock);
    await ana.check.createRoom('sala01');
    await flush();

    clock.now = 2000;
    const beto = openDevice(fake, 'uid-beto', 'Beto', clock);
    const result = await beto.check.createRoom('sala01');
    await flush();

    check(result && result.ok === false && result.reason === 'room-exists',
        'deveria recusar com room-exists, veio: ' + JSON.stringify(result));
    const meta = fake.read('connectionChecks/sala01/meta');
    check(meta && meta.hostUid === 'uid-ana' && meta.createdAt === 1000, 'a sala da Ana não deveria mudar, veio: ' + JSON.stringify(meta));
    check(!fake.read('connectionChecks/sala01/devices/uid-beto'), 'Beto não deveria entrar na lista da sala de outro');
    check(beto.check.snapshot().code === null, 'a página do Beto não deveria ficar com sala');
});

asyncTest('T145 Código inválido (vazio, mais de 20 caracteres, ".", "/", "#", "$", "[", espaço, não texto): recusado (invalid-code) sem tocar no banco; 20 caracteres com letras, números, "_" e "-" valem', async () => {
    const invalid = ['', ' ', 'a'.repeat(21), 'sala.1', 'sala/1', 'sala#1', 'sala$1', 'sala[1]', 'sala 1', 'sala\n', null, undefined, 42];
    for (const action of ['createRoom', 'joinRoom']) {
        for (const code of invalid) {
            const fake = createFakeFirebase();
            const ana = openDevice(fake, 'uid-ana', 'Ana', { now: 1000 });
            const result = await ana.check[action](code);
            await flush();
            check(result && result.ok === false && result.reason === 'invalid-code',
                action + '(' + JSON.stringify(code) + ') deveria recusar com invalid-code, veio: ' + JSON.stringify(result));
            check(ana.device.writes.length === 0 && ana.device.listenerCount() === 0 && fake.read('') === undefined,
                action + '(' + JSON.stringify(code) + ') não deveria gravar nem ouvir nada no banco');
        }
    }
    for (const code of ['a'.repeat(20), 'A_b-9']) {
        const fake = createFakeFirebase();
        const ana = openDevice(fake, 'uid-ana', 'Ana', { now: 1000 });
        const result = await ana.check.createRoom(code);
        await flush();
        check(result && result.ok === true, 'o código ' + JSON.stringify(code) + ' deveria valer, veio: ' + JSON.stringify(result));
    }
});

asyncTest('T146 Entrar em sala que não existe: recusado (room-not-found), nada gravado e a página fica sem sala', async () => {
    const fake = createFakeFirebase();
    const beto = openDevice(fake, 'uid-beto', 'Beto', { now: 1000 });
    const result = await beto.check.joinRoom('nada');
    await flush();

    check(result && result.ok === false && result.reason === 'room-not-found',
        'deveria recusar com room-not-found, veio: ' + JSON.stringify(result));
    check(beto.device.writes.length === 0, 'não deveria gravar nada, gravou: ' + JSON.stringify(beto.device.writes));
    check(fake.read('') === undefined, 'o banco deveria continuar vazio, veio: ' + JSON.stringify(fake.read('')));
    check(beto.check.snapshot().code === null, 'a página não deveria ficar com sala');
});

asyncTest('T147 Entrar: os dois aparelhos se veem na lista, com os nomes, na ordem de entrada; quem entra não é o dono', async () => {
    const { fake, clock, ana, beto } = await roomWithTwo();

    check(deviceNames(ana) === 'Ana,Beto', 'a página da Ana deveria mostrar Ana e Beto, veio: ' + deviceNames(ana));
    check(deviceNames(beto) === 'Ana,Beto', 'a página do Beto deveria mostrar Ana e Beto, veio: ' + deviceNames(beto));
    const s = beto.check.snapshot();
    check(s.code === 'sala01' && s.isHost === false && s.connected === true,
        'Beto deveria estar na sala, conectado e sem ser o dono, veio: ' + JSON.stringify(s));
    check(beto.changes.length > 0, 'a página do Beto deveria ser avisada (onChange)');

    // Ordem de entrada, não alfabética: Aaron entra por último.
    clock.now = 3000;
    const aaron = openDevice(fake, 'uid-aaron', 'Aaron', clock);
    await aaron.check.joinRoom('sala01');
    await flush();
    check(deviceNames(ana) === 'Ana,Beto,Aaron', 'a lista deveria seguir a ordem de entrada, veio: ' + deviceNames(ana));
});

asyncTest('T148 Queda sem aviso: o servidor tira o aparelho da lista e o outro vê sair; ao voltar a conexão, ele se recoloca sozinho — e uma nova queda tira de novo', async () => {
    const { fake, ana, beto } = await roomWithTwo();

    beto.device.goOffline();
    await flush();
    check(deviceNames(ana) === 'Ana', 'a Ana deveria ver o Beto sair, vê: ' + deviceNames(ana));
    check(beto.check.snapshot().connected === false, 'a página do Beto deveria mostrar desconectado');

    beto.device.goOnline();
    await flush();
    check(deviceNames(ana) === 'Ana,Beto', 'a Ana deveria ver o Beto voltar sozinho, vê: ' + deviceNames(ana));
    check(beto.check.snapshot().connected === true, 'a página do Beto deveria mostrar conectado de novo');
    check(!!fake.read('connectionChecks/sala01/devices/uid-beto'), 'o aparelho do Beto deveria estar de volta no banco');

    // O aviso de queda (onDisconnect) vale uma vez só: ao voltar, a
    // página precisa armar de novo, senão a segunda queda não aparece.
    beto.device.goOffline();
    await flush();
    check(deviceNames(ana) === 'Ana', 'na segunda queda a Ana também deveria ver o Beto sair, vê: ' + deviceNames(ana));
});

asyncTest('T149 F5: o mesmo aparelho (mesmo uid) entra de novo — continua um registro só na lista e não responde de novo a mensagens antigas', async () => {
    const { fake, clock, ana, beto } = await roomWithTwo();
    await ana.check.sendPing();
    await flush();
    const echoesBefore = messagesOf(fake, 'sala01').filter(m => m.kind === 'echo').length;
    check(echoesBefore === 1, 'antes do F5, o Beto deveria ter respondido uma vez, respondeu: ' + echoesBefore);

    beto.device.close();
    await flush();
    clock.now = 3000;
    const betoAgain = openDevice(fake, 'uid-beto', 'Beto', clock);
    const result = await betoAgain.check.joinRoom('sala01');
    await flush();

    check(result && result.ok === true, 'depois do F5, o Beto deveria entrar de novo, veio: ' + JSON.stringify(result));
    check(deviceNames(ana) === 'Ana,Beto', 'a Ana deveria ver o Beto uma vez só, vê: ' + deviceNames(ana));
    const devices = fake.read('connectionChecks/sala01/devices') || {};
    check(Object.keys(devices).length === 2, 'o banco deveria ter 2 aparelhos, tem: ' + JSON.stringify(devices));
    const echoesAfter = messagesOf(fake, 'sala01').filter(m => m.kind === 'echo').length;
    check(echoesAfter === 1, 'o Beto não deveria responder de novo à mensagem antiga, respostas: ' + echoesAfter);
    check(betoAgain.check.snapshot().pings.length === 0, 'a página do Beto não deveria mostrar a mensagem antiga como nova');

    // O aviso de queda da aba anterior chega atrasado e apaga o registro
    // novo: com a conexão no ar, a página se recoloca na lista.
    fake.write('connectionChecks/sala01/devices/uid-beto', null);
    await flush();
    check(deviceNames(ana) === 'Ana,Beto', 'o Beto deveria voltar sozinho à lista depois do aviso de queda atrasado, a Ana vê: ' + deviceNames(ana));
});

asyncTest('T150 Mensagem de teste: chega ao outro com o nome de quem mandou; volta um eco e o tempo de ida e volta é medido pelo relógio de quem mandou; tráfego contado', async () => {
    const { fake, clock, ana, beto } = await roomWithTwo();

    // A Ana fica sem conexão enquanto o Beto manda: a resposta dela só
    // sai 350 ms depois, quando ela volta.
    ana.device.goOffline();
    await flush();
    clock.now = 5000;
    const id = await beto.check.sendPing();
    await flush();
    check(typeof id === 'string' && id.length > 0, 'sendPing deveria devolver o id da mensagem, veio: ' + JSON.stringify(id));
    clock.now = 5350;
    ana.device.goOnline();
    await flush();

    const pings = ana.check.snapshot().pings;
    check(pings.length === 1 && pings[0].id === id && pings[0].from === 'uid-beto' && pings[0].name === 'Beto',
        'a Ana deveria receber a mensagem do Beto com o nome, veio: ' + JSON.stringify(pings));
    const trips = beto.check.snapshot().roundTrips;
    check(trips.length === 1 && trips[0].id === id && trips[0].from === 'uid-ana' && trips[0].name === 'Ana' && trips[0].ms === 350,
        'o Beto deveria medir 350 ms de ida e volta com a resposta da Ana, veio: ' + JSON.stringify(trips));

    const messages = messagesOf(fake, 'sala01');
    check(messages.length === 2 && messages[0].kind === 'ping' && messages[1].kind === 'echo' &&
        messages[1].from === 'uid-ana' && messages[1].to === 'uid-beto' && messages[1].pingId === id,
        'deveria haver só a mensagem e um eco para o Beto (ninguém responde ao eco nem à própria mensagem), veio: ' + JSON.stringify(messages));
    check(beto.check.snapshot().pings.length === 0 && ana.check.snapshot().roundTrips.length === 0,
        'ninguém deveria ver a própria mensagem como recebida');

    const sb = beto.check.snapshot();
    const sa = ana.check.snapshot();
    check(sb.bytesSent > 0 && sb.bytesReceived > 0 && sa.bytesSent > 0 && sa.bytesReceived > 0,
        'o tráfego enviado e recebido deveria ser contado nos dois, veio: Beto ' + sb.bytesSent + '/' + sb.bytesReceived +
        ', Ana ' + sa.bytesSent + '/' + sa.bytesReceived);
    check(sa.bytesReceived >= sb.bytesSent - 50, 'a Ana deveria contar como recebido o tamanho da mensagem do Beto');
});

asyncTest('T151 A mensagem viaja como texto JSON: null e lista vazia chegam iguais ao que saiu (como objeto, o banco apagaria os dois)', async () => {
    const { fake, ana, beto } = await roomWithTwo();
    const sample = beto.ctx.Game.connectionCheck.SAMPLE_PAYLOAD;
    check(sample && sample.question === null && Array.isArray(sample.answeredThisRound) && sample.answeredThisRound.length === 0,
        'a mensagem de exemplo deveria ter question: null e answeredThisRound: [] (como as do jogo), veio: ' + JSON.stringify(sample));

    await beto.check.sendPing();
    await flush();

    const raw = messagesOf(fake, 'sala01').find(m => m.kind === 'ping');
    check(raw && typeof raw.payload === 'string', 'o banco deveria guardar o conteúdo como texto, veio: ' + JSON.stringify(raw));
    const received = ana.check.snapshot().pings[0];
    check(received && JSON.stringify(received.payload) === JSON.stringify(sample),
        'a Ana deveria receber exatamente a mensagem de exemplo, veio: ' + JSON.stringify(received && received.payload));
    check('question' in received.payload && received.payload.question === null &&
        Array.isArray(received.payload.answeredThisRound) && received.payload.answeredThisRound.length === 0,
        'null e lista vazia deveriam chegar como null e [], veio: ' + JSON.stringify(received.payload));
});

asyncTest('T152 Sair: quem entrou some só da lista; o dono, ao sair, apaga a sala; quem sai para de ouvir o banco e a queda depois não mexe em nada', async () => {
    const { fake, clock, ana, beto } = await roomWithTwo();

    await beto.check.leave();
    await flush();
    check(!fake.read('connectionChecks/sala01/devices/uid-beto'), 'o aparelho do Beto deveria sair do banco');
    check(!!fake.read('connectionChecks/sala01/meta'), 'a sala deveria continuar (só o dono apaga)');
    check(deviceNames(ana) === 'Ana', 'a Ana deveria ver o Beto sair, vê: ' + deviceNames(ana));
    check(beto.device.listenerCount() === 0, 'o Beto deveria parar de ouvir o banco, ouvintes: ' + beto.device.listenerCount());
    check(beto.check.snapshot().code === null, 'a página do Beto deveria ficar sem sala');

    // Beto entra de novo e sai; depois cai: o aviso de queda tinha sido
    // cancelado ao sair e não apaga o registro de quem usa o mesmo uid.
    clock.now = 4000;
    await beto.check.joinRoom('sala01');
    await flush();
    await beto.check.leave();
    await flush();
    fake.write('connectionChecks/sala01/devices/uid-beto', { name: 'Beto (outra aba)', joinedAt: 4500 });
    beto.device.goOffline();
    await flush();
    check(!!fake.read('connectionChecks/sala01/devices/uid-beto'),
        'a queda depois de sair não deveria apagar nada (aviso de queda cancelado ao sair)');

    await ana.check.leave();
    await flush();
    check(fake.read('connectionChecks/sala01') === undefined, 'o dono, ao sair, deveria apagar a sala inteira');
    check(ana.device.listenerCount() === 0, 'a Ana deveria parar de ouvir o banco');
});

// ============================================
// REGRAS DO BANCO E SEGREDOS
// ============================================

asyncTest('T153 Regras do banco: tudo fechado fora de connectionChecks; só quem fez login lê; sala só pelo dono, aparelho só pelo próprio uid, mensagem só com o próprio uid em "from" e conteúdo em texto limitado; nenhum arquivo do site tem chave secreta', async () => {
    const firebaseJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'firebase.json'), 'utf8'));
    check(firebaseJson.database && firebaseJson.database.rules === 'database.rules.json',
        'firebase.json deveria apontar as regras para database.rules.json (o emulador usa as mesmas regras), veio: ' + JSON.stringify(firebaseJson.database));

    const rules = JSON.parse(fs.readFileSync(path.join(ROOT, 'database.rules.json'), 'utf8')).rules;
    check(rules && rules['.read'] === false && rules['.write'] === false, 'a raiz do banco deveria ser fechada (.read e .write false)');
    const room = rules.connectionChecks && rules.connectionChecks.$code;
    check(!!room, 'deveria haver regras para connectionChecks/$code');
    check(/auth\s*!==\s*null/.test(room['.read'] || ''), 'ler a sala deveria exigir login (auth !== null), veio: ' + room['.read']);
    check(room.meta && /auth\.uid/.test(room.meta['.write'] || ''), 'gravar a sala deveria depender de auth.uid (dono), veio: ' + (room.meta && room.meta['.write']));
    check(/hostUid/.test(room['.write'] || '') && /!newData\.exists\(\)/.test(room['.write'] || ''),
        'apagar a sala inteira deveria ser só do dono (hostUid) e só para apagar, veio: ' + room['.write']);
    const device = room.devices && room.devices.$uid;
    check(device && /(\$uid\s*===\s*auth\.uid|auth\.uid\s*===\s*\$uid)/.test(device['.write'] || ''),
        'cada aparelho só pelo próprio uid, veio: ' + (device && device['.write']));
    const message = room.messages && room.messages.$messageId;
    check(message && /newData\.child\('from'\)\.val\(\)\s*===\s*auth\.uid/.test(message['.write'] || ''),
        'mensagem só com o próprio uid em "from", veio: ' + (message && message['.write']));
    check(message && /!data\.exists\(\)/.test(message['.write'] || ''), 'mensagem gravada não pode ser trocada por outra');
    const payload = message && message.payload;
    check(payload && /isString\(\)/.test(payload['.validate'] || '') && /length\s*<=?\s*\d+/.test(payload['.validate'] || ''),
        'o conteúdo da mensagem deveria ser texto com tamanho máximo, veio: ' + (payload && payload['.validate']));

    // Segredos: a configuração web do Firebase é pública, mas chave de
    // conta de serviço nunca entra no site nem no repositório.
    const secretPattern = /private_key|client_email|BEGIN PRIVATE KEY|client_secret/;
    const files = ['config/game-config.js', 'firebase.json', 'database.rules.json', 'index.html', 'game.html', 'firebase-check.html'];
    const walk = (dir) => fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true }).flatMap(e =>
        e.isDirectory() ? walk(dir + '/' + e.name) : (e.name.endsWith('.js') ? [dir + '/' + e.name] : []));
    const found = [...files, ...walk('js')].filter(f => secretPattern.test(fs.readFileSync(path.join(ROOT, f), 'utf8')));
    check(found.length === 0, 'arquivos do site com cara de chave secreta: ' + found.join(', '));
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
    finish('Teste de conexão pelo Firebase');
})();
