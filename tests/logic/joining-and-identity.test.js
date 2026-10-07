// ============================================
// PM: The KPI Master - Testes de lógica: Entrada na sala e identidade
// ============================================
// Entrar na sala (lobby, sala travada, sala cheia, nome em uso, versão
// do jogo), token de identidade por sala e a tela inicial (entrar e
// criar sala).
// Ambiente simulado e ajudantes: environment.js. Rodar a partir da raiz:
//     node tests/logic/joining-and-identity.test.js
// ============================================

const {
    fs, path, vm, ROOT, createEnvironment, tokenOf, test, check, start, finish,
    syncTo, roundScreens, unavailable, roomToReload, reloadHost, tryReloadHost, recordScreens,
    savedStateV1, oldNamesIn, oldPlayerNamesIn,
    oldAdvisoryNamesIn, OLD_ADVISORY_TYPES, OLD_ADVISORY_REASONS,
    savedStateV4, oldEventNamesIn, OLD_EVENT_NAMES,
    finalRankingV2, oldFocusAreaIdsIn, OLD_FOCUS_AREA_IDS
} = require('./environment');

start('Entrada na sala e identidade');

test('T1  Lobby: guest que cai é removido da lista (como antes)', (use) => {
    const env = use(createEnvironment());
    env.createRoomAsHost();
    env.join('A', 'peer-a');
    check(env.player('A'), 'A deveria ter entrado no lobby');
    env.drop('peer-a');
    check(!env.player('A'), 'A deveria ter sido removido da lista');
});

test('T2  Partida em andamento: nome novo é recusado (room-locked)', (use) => {
    const env = use(createEnvironment());
    env.createRoomAsHost();
    env.join('A', 'peer-a');
    env.join('B', 'peer-b');
    env.startMatch();
    env.join('C', 'peer-c');
    check(env.rejectionFor('peer-c') === 'room-locked', 'esperava recusa room-locked, veio: ' + env.rejectionFor('peer-c'));
    check(!env.player('C'), 'C não deveria ter entrado na lista');
    check(env.state.players.length === 3, 'lista deveria continuar com 3 jogadores');
});

test('T3  Nome em uso por jogador conectado continua bloqueado (name-taken)', (use) => {
    const env = use(createEnvironment());
    env.createRoomAsHost();
    env.join('A', 'peer-a');
    env.join('B', 'peer-b');
    env.startMatch();
    env.join('A', 'peer-impostor');
    check(env.rejectionFor('peer-impostor') === 'name-taken', 'esperava name-taken, veio: ' + env.rejectionFor('peer-impostor'));
    check(env.player('A').peerId === 'peer-a', 'A original não deveria ter perdido o peerId');
});

test('T3b Nome do próprio host é recusado (name-taken), host não perde o lugar', (use) => {
    for (const inMatch of [false, true]) {
        const env = use(createEnvironment());
        env.createRoomAsHost();
        env.join('A', 'peer-a');
        if (inMatch) env.startMatch();
        env.join('Host', 'peer-intruso');
        const where = inMatch ? ' (partida em andamento)' : ' (lobby)';
        check(env.rejectionFor('peer-intruso') === 'name-taken', 'esperava name-taken' + where + ', veio: ' + env.rejectionFor('peer-intruso'));
        check(env.player('Host').peerId === 'peer-host', 'o host não pode perder o próprio peerId' + where);
    }
});

test('T9  Sala cheia: quem caiu consegue voltar; nome novo leva room-locked', (use) => {
    const env = use(createEnvironment());
    env.CONFIG.GAME.MAX_PLAYERS = 3;
    env.createRoomAsHost();
    env.join('A', 'peer-a');
    env.join('B', 'peer-b');
    env.startMatch();

    env.drop('peer-a');
    env.join('A', 'peer-a2');
    check(env.rejectionFor('peer-a2') === null, 'A não deveria ser recusado, veio: ' + env.rejectionFor('peer-a2'));
    check(!env.player('A').disconnected, 'A deveria estar conectado de novo');

    env.join('D', 'peer-d');
    check(env.rejectionFor('peer-d') === 'room-locked', 'esperava room-locked para D, veio: ' + env.rejectionFor('peer-d'));
});

/** Algum token cru apareceu em alguma mensagem que saiu do host? */
function tokenLeaked(env, token) {
    const all = JSON.stringify(env.record.broadcasts) + JSON.stringify(env.record.sent);
    return all.includes(token);
}

test('T22 SHA-256 próprio: vetores oficiais e mesmo resultado do Node', (use) => {
    const env = use(createEnvironment());
    const sha = env.Game.identity.sha256Hex;
    const vectors = {
        '': 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
        'abc': 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
        'abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq': '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1'
    };
    for (const [input, expected] of Object.entries(vectors)) {
        check(sha(input) === expected, 'SHA-256("' + input + '") errado: ' + sha(input));
    }

    const nodeSha = (t) => require('crypto').createHash('sha256').update(t, 'utf8').digest('hex');
    // Todos os tamanhos de 0 a 130 (cobre as fronteiras de bloco em 55/56/64/119/120/128).
    for (let n = 0; n <= 130; n++) {
        const t = 'x'.repeat(n);
        check(sha(t) === nodeSha(t), 'diverge do Node com ' + n + ' caracteres');
    }
    for (const t of ['Ação é João', 'ñ ç ü € 日本語', 'emoji 🎯🚀 no meio', env.Game.identity.getRoomToken('sala')]) {
        check(sha(t) === nodeSha(t), 'diverge do Node em "' + t + '"');
    }
});

test('T23 Token por sala: criado uma vez, reaproveitado, diferente entre salas', (use) => {
    const env = use(createEnvironment());
    const id = env.Game.identity;
    const t1 = id.getRoomToken('sala-x');
    check(/^[0-9a-f]{32}$/.test(t1), 'token deveria ter 32 caracteres hexadecimais, veio: ' + t1);
    check(env.storage['pmKPI_token_sala-x'] === t1, 'token deveria ficar no localStorage, na chave da sala');
    check(id.getRoomToken('sala-x') === t1, 'a mesma sala deveria devolver o mesmo token (F5, reconexão)');
    check(id.getRoomToken('sala-y') !== t1, 'outra sala deveria ter outro token');
    check(id.myTokenHash('sala-x') === id.hashToken(t1) && id.hashToken(t1) !== t1, 'myTokenHash deveria ser o hash do token');

    // Um ambiente novo (outro "navegador") gera outro token para a mesma sala.
    const other = use(createEnvironment());
    check(other.Game.identity.getRoomToken('sala-x') !== t1, 'outro navegador deveria ter outro token');

    // localStorage indisponível: continua funcionando enquanto a página estiver aberta.
    const noStorage = use(createEnvironment());
    noStorage.fakeLocalStorage.getItem = () => { throw new Error('bloqueado'); };
    noStorage.fakeLocalStorage.setItem = () => { throw new Error('bloqueado'); };
    const t3 = noStorage.Game.identity.getRoomToken('sala-z');
    check(/^[0-9a-f]{32}$/.test(t3) && noStorage.Game.identity.getRoomToken('sala-z') === t3,
        'sem localStorage, o token deveria ser estável durante a página');
});

test('T24 Entrada guarda só o hash do token; o token cru nunca sai do host', (use) => {
    const env = use(createEnvironment());
    env.createRoomAsHost();
    env.join('A', 'peer-a');
    env.join('B', 'peer-b');
    check(env.player('A').tokenHash === env.hash(tokenOf('A')), 'A deveria ficar com o hash do token dele');
    check(!JSON.stringify(env.state.players).includes(tokenOf('A')), 'o token cru não pode ficar na lista de jogadores');

    env.startMatch();
    env.drop('peer-a');
    env.join('A', 'peer-a2');
    check(env.record.sent.some(e => e.to === 'peer-a2' && e.msg.type === 'state-sync'), 'pré-condição: A recebeu state-sync');
    check(env.record.broadcasts.some(m => m.type === 'player-list'), 'pré-condição: houve player-list');
    for (const name of ['A', 'B']) {
        check(!tokenLeaked(env, tokenOf(name)), 'o token cru de ' + name + ' vazou em alguma mensagem do host');
    }
    const list = env.broadcastsOfType('player-list').pop();
    check(list.players.find(p => p.name === 'A').tokenHash === env.hash(tokenOf('A')), 'o hash circula na lista (para sobreviver à migração)');
});

test('T25 Reconexão com token errado ou sem token: recusada, vaga e dados preservados', (use) => {
    const env = use(createEnvironment());
    env.createRoomAsHost();
    env.join('A', 'peer-a');
    env.startMatch();
    Object.assign(env.player('A'), { kpi: 7, resources: 4, focusArea: 'planning', activities: 1 });
    env.drop('peer-a');
    check(env.state.matchPaused, 'pré-condição: partida pausada com A desconectado');

    env.join('A', 'peer-impostor', 'token-de-outro-navegador');
    check(env.rejectionFor('peer-impostor') === 'identity-mismatch', 'esperava identity-mismatch, veio: ' + env.rejectionFor('peer-impostor'));

    env.join('A', 'peer-sem-token', null);
    check(env.rejectionFor('peer-sem-token') === 'identity-mismatch', 'sem token deveria dar identity-mismatch, veio: ' + env.rejectionFor('peer-sem-token'));

    const a = env.player('A');
    check(a.disconnected === true && a.peerId === 'peer-a', 'A deveria continuar desconectado, com o peerId antigo');
    check(a.kpi === 7 && a.resources === 4 && a.focusArea === 'planning' && a.activities === 1, 'dados de A não podem mudar');
    check(a.tokenHash === env.hash(tokenOf('A')), 'o hash registrado não pode ser trocado');
    check(env.state.matchPaused, 'a partida não pode ser retomada por um impostor');
    check(!env.record.sent.some(e => (e.to === 'peer-impostor' || e.to === 'peer-sem-token') && e.msg.type === 'state-sync'),
        'impostor não pode receber o estado da partida');

    // O A de verdade continua conseguindo voltar.
    env.join('A', 'peer-a2');
    check(env.rejectionFor('peer-a2') === null, 'A com o token certo deveria voltar, veio: ' + env.rejectionFor('peer-a2'));
    check(!env.player('A').disconnected && env.player('A').peerId === 'peer-a2', 'A deveria estar conectado de novo');
    check(!env.state.matchPaused && env.state.currentRound, 'a volta de A deveria retomar a partida');
});

test('T27 Transição: entrada salva antes do token é aceita pelo nome e passa a exigir o token', (use) => {
    const env = use(createEnvironment());
    env.createRoomAsHost();
    env.join('A', 'peer-a');
    env.join('B', 'peer-b');
    env.startMatch();
    delete env.player('A').tokenHash; // como num estado salvo por uma versão anterior
    env.drop('peer-a');

    env.join('A', 'peer-a2');
    check(env.rejectionFor('peer-a2') === null, 'sem hash registrado, deveria aceitar pelo nome (como antes), veio: ' + env.rejectionFor('peer-a2'));
    check(env.player('A').tokenHash === env.hash(tokenOf('A')), 'deveria adotar o hash deste token');

    env.drop('peer-a2');
    env.join('A', 'peer-impostor', 'token-de-outro-navegador');
    check(env.rejectionFor('peer-impostor') === 'identity-mismatch', 'depois de adotar, deveria exigir o token, veio: ' + env.rejectionFor('peer-impostor'));
});

test('T28 Guest envia o token no player-join (1ª conexão e as duas reconexões)', (use) => {
    const env = use(createEnvironment());
    env.state.isHost = false;
    env.state.playerName = 'A';
    env.state.peerId = 'peer-a';
    env.state.baseRoomPeerId = 'sala';
    env.state.hostPeerId = 'sala';
    env.state.hostVersion = 0;
    const myToken = env.Game.identity.getRoomToken('sala');
    const checkJoin = (where) => {
        const join = env.record.toHost.filter(m => m.type === 'player-join').pop();
        check(join, where + ': deveria enviar player-join');
        check(join.playerName === 'A' && join.token === myToken, where + ': player-join deveria levar o token da sala, veio: ' + join.token);
        env.clearLog();
    };

    // 1) Primeira conexão (handleConnection, lado guest).
    env.connect('sala');
    checkJoin('primeira conexão');

    // Conexão falsa que abre quando o teste mandar (para as reconexões).
    const newConnection = (target) => {
        const h = {};
        return { peer: target, open: true, on: (ev, cb) => { h[ev] = cb; }, send: () => {}, close: () => {}, fire: (ev) => h[ev] && h[ev]() };
    };

    // 2) Reconexão ao mesmo host.
    let conn = newConnection('sala');
    env.installFakePeer({ connectReturns: conn });
    env.Game.network.connectionState.setPeer(new env.ctx.Peer('peer-a'));
    env.Game.network.attemptReconnectToSameHost(1);
    conn.fire('open');
    checkJoin('reconexão ao mesmo host');

    // 3) Reconexão ao novo host (depois de uma migração).
    conn = newConnection('sala-h1');
    env.installFakePeer({ connectReturns: conn });
    env.Game.network.connectionState.setPeer(new env.ctx.Peer('peer-a'));
    env.Game.network.attemptReconnectToNewHost(1);
    conn.fire('open');
    checkJoin('reconexão ao novo host');
    check(env.state.hostPeerId === 'sala-h1', 'pré-condição: guest deveria ter ido para a sala nova');
    check(env.Game.identity.getRoomToken(env.state.baseRoomPeerId) === myToken, 'o token não muda com a migração (chave pelo ID base)');
});

test('T29 Host se insere na lista (setupUI) com o hash do próprio token', (use) => {
    const env = use(createEnvironment());
    const element = () => ({ style: {}, textContent: '', disabled: false, addEventListener: () => {} });
    env.ctx.document = { getElementById: element, querySelectorAll: () => [] };
    env.state.isHost = true;
    env.state.playerName = 'Ana';
    env.state.peerId = 'sala';
    env.state.baseRoomPeerId = 'sala';
    env.state.players = [];

    env.ctx.setupUI();
    const host = env.player('Ana');
    const myToken = env.Game.identity.getRoomToken('sala');
    check(host && host.isHost, 'o host deveria estar na lista');
    check(host.tokenHash === env.hash(myToken), 'a entrada do host deveria ter o hash do token dele');
    check(!JSON.stringify(env.state.players).includes(myToken), 'o token cru do host não pode ficar na lista');

    // Chamada de novo (ex: becomeHost) não duplica nem troca a entrada.
    env.ctx.setupUI();
    check(env.state.players.length === 1 && env.player('Ana') === host, 'setupUI de novo não deveria duplicar o host');

    // O nome do host continua sempre em uso, com ou sem o token certo.
    env.join('Ana', 'peer-intruso', myToken);
    check(env.rejectionFor('peer-intruso') === 'name-taken', 'nome do host deveria continuar name-taken, veio: ' + env.rejectionFor('peer-intruso'));
});

/**
 * Guest conecta e manda um player-join montado pelo teste, com a versão
 * do jogo escolhida (undefined = sem o campo, como o jogo antigo manda).
 */
function joinWithVersion(env, name, peerId, version) {
    const c = env.connect(peerId);
    const msg = { type: 'player-join', playerName: name, peerId, token: tokenOf(name) };
    if (version !== undefined) msg.protocolVersion = version;
    c.fire('data', msg);
}

test('T76 Versão do jogo: o host recusa quem entra com outra versão (version-mismatch); sem o campo conta como 1', (use) => {
    const env = use(createEnvironment());
    const version = env.Game.network.PROTOCOL_VERSION;
    check(Number.isInteger(version) && version >= 1, 'Game.network.PROTOCOL_VERSION deveria ser um inteiro >= 1, veio: ' + version);
    env.createRoomAsHost();

    // Mesma versão: entra.
    joinWithVersion(env, 'A', 'peer-a', version);
    check(env.rejectionFor('peer-a') === null && env.player('A'), 'com a mesma versão, A deveria entrar, veio: ' + env.rejectionFor('peer-a'));

    // Sem o campo (jogo de antes da versão): conta como 1.
    joinWithVersion(env, 'B', 'peer-b', undefined);
    if (version === 1) {
        check(env.rejectionFor('peer-b') === null && env.player('B'), 'sem o campo deveria contar como versão 1 e entrar, veio: ' + env.rejectionFor('peer-b'));
    } else {
        check(env.rejectionFor('peer-b') === 'version-mismatch' && !env.player('B'),
            'sem o campo conta como versão 1, diferente da atual: deveria ser recusado, veio: ' + env.rejectionFor('peer-b'));
    }

    // Outra versão (mais nova, mais velha ou em formato errado): recusa.
    [version + 1, version - 1, String(version), null, 'x'].forEach((v, i) => {
        const name = 'V' + i;
        const peerId = 'peer-v' + i;
        joinWithVersion(env, name, peerId, v);
        check(env.rejectionFor(peerId) === 'version-mismatch', 'versão ' + JSON.stringify(v) + ' deveria dar version-mismatch, veio: ' + env.rejectionFor(peerId));
        check(!env.player(name), 'com a versão ' + JSON.stringify(v) + ', ' + name + ' não deveria entrar na lista');
        check(!env.record.sent.some(e => e.to === peerId && e.msg.type === 'state-sync'), 'quem é recusado não pode receber o estado da sala');
    });

    // A versão é conferida antes do nome: com outra versão, nem o nome do host chega a ser avaliado.
    joinWithVersion(env, 'Host', 'peer-intruso', version + 1);
    check(env.rejectionFor('peer-intruso') === 'version-mismatch', 'a versão deveria ser conferida antes do nome, veio: ' + env.rejectionFor('peer-intruso'));
    check(env.player('Host').peerId === 'peer-host', 'o host não pode perder o lugar');

    // Na partida: quem caiu e volta com outra versão é recusado e continua reservado.
    const match = use(createEnvironment());
    match.createRoomAsHost();
    joinWithVersion(match, 'A', 'peer-a', version);
    match.startMatch();
    match.drop('peer-a');
    check(match.state.matchPaused, 'pré-condição: partida pausada com A desconectado');
    joinWithVersion(match, 'A', 'peer-a2', version + 1);
    check(match.rejectionFor('peer-a2') === 'version-mismatch', 'A com outra versão deveria ser recusado, veio: ' + match.rejectionFor('peer-a2'));
    check(match.player('A').disconnected === true && match.player('A').peerId === 'peer-a', 'A deveria continuar desconectado, com a vaga reservada');
    check(match.state.matchPaused, 'a partida não pode ser retomada por quem foi recusado');

    // Depois de recarregar (mesma versão), A volta e a partida retoma.
    joinWithVersion(match, 'A', 'peer-a3', version);
    check(match.rejectionFor('peer-a3') === null && !match.player('A').disconnected, 'A com a versão certa deveria voltar, veio: ' + match.rejectionFor('peer-a3'));
    check(!match.state.matchPaused && match.state.currentRound, 'a volta de A deveria retomar a partida');
});

test('T77 Versão do jogo: o player-join leva a versão; a recusa version-mismatch pede para recarregar a página', (use) => {
    const env = use(createEnvironment());
    const version = env.Game.network.PROTOCOL_VERSION;
    check(Number.isInteger(version) && version >= 1, 'Game.network.PROTOCOL_VERSION deveria ser um inteiro >= 1, veio: ' + version);
    env.state.isHost = false;
    env.state.playerName = 'A';
    env.state.peerId = 'peer-a';
    env.state.baseRoomPeerId = 'sala';
    env.state.hostPeerId = 'sala';
    env.state.hostVersion = 0;

    // O player-join é montado num lugar só (sendPlayerJoin), usado também nas reconexões.
    env.connect('sala');
    const join = env.record.toHost.filter(m => m.type === 'player-join').pop();
    check(join, 'deveria enviar player-join');
    check(join.protocolVersion === version, 'o player-join deveria levar protocolVersion = ' + version + ', veio: ' + JSON.stringify(join.protocolVersion));

    // Recusa por versão: aviso próprio (não o de nome em uso) e volta para a tela inicial.
    const alerts = [];
    env.ctx.alert = (text) => { alerts.push(String(text)); };
    env.Game.network.handleMessage({ type: 'join-rejected', reason: 'name-taken' }, 'sala');
    env.ctx.location.href = 'game.html';
    env.Game.network.handleMessage({ type: 'join-rejected', reason: 'version-mismatch' }, 'sala');
    check(alerts.length === 2, 'deveria mostrar um aviso por recusa, mostrou: ' + alerts.length);
    const [nameTakenText, versionText] = alerts;
    check(versionText !== nameTakenText, 'version-mismatch deveria ter aviso próprio, não o de nome em uso');
    check(/desatualizad/i.test(versionText) && /recarreg/i.test(versionText),
        'o aviso deveria dizer que o jogo está desatualizado e pedir para recarregar a página, veio: ' + versionText);
    check(env.ctx.location.href === './', 'depois do aviso, deveria voltar para a tela inicial, foi para: ' + env.ctx.location.href);
});

test('T80 Versão do jogo 2: as mensagens da rodada e da partida, o estado e o estado salvo só usam os nomes novos', (use) => {
    const env = use(createEnvironment());
    check(env.Game.network.PROTOCOL_VERSION >= 2, 'a versão do protocolo deveria ser 2 ou mais (nomes novos nas mensagens), veio: ' + env.Game.network.PROTOCOL_VERSION);
    const time = env.fakeTime();
    // Sorteio fixo: A pergunta, B responde, o host assiste.
    vm.runInContext('Math.random = () => 0.99', env.ctx);
    env.createRoomAsHost();
    env.join('A', 'peer-a');
    env.join('B', 'peer-b');
    env.startMatch();

    // Início da rodada.
    const shown = env.broadcastsOfType('show-event');
    check(shown.length === 1 && shown[0].event && shown[0].event.title,
        'o início da rodada deveria mandar show-event com o evento em `event`, mandou: ' + env.record.broadcasts.map(m => m.type).join(', '));
    const rs = env.broadcastsOfType('round-start').pop();
    check(rs && rs.asker === 'A' && rs.answerer === 'B' && rs.event && rs.event.id === shown[0].event.id &&
        Array.isArray(rs.answeredThisRound) && rs.answeredThisRound.length === 0,
        'round-start deveria levar event, asker, answerer e answeredThisRound, veio: ' + JSON.stringify(rs));
    const toA = env.record.sent.find(e => e.to === 'peer-a' && e.msg.type === 'question');
    const toB = env.record.sent.find(e => e.to === 'peer-b' && e.msg.type === 'question');
    check(toA && toA.msg.isAsker === true && toA.msg.correct !== undefined, 'o Perguntador deveria receber a pergunta com isAsker e o gabarito');
    check(toB && toB.msg.isAnswerer === true && toB.msg.correct === undefined, 'o Respondedor deveria receber a pergunta com isAnswerer e sem o gabarito');
    const round = env.state.currentRound;
    check(round && round.asker === 'A' && round.answerer === 'B' && round.answered === false && round.event && round.event.id === rs.event.id &&
        round.question && round.question.correct === toA.msg.correct,
        'a rodada do host deveria usar event, asker, answerer, question e answered, veio: ' + JSON.stringify(round));
    check(env.state.answerTimeout, 'o prazo de resposta deveria ficar em state.answerTimeout');

    // B (guest) guarda a rodada e responde pela tela.
    const guest = use(createEnvironment());
    guest.state.playerName = 'B';
    guest.state.players = JSON.parse(JSON.stringify(env.state.players));
    guest.Game.network.handleMessage(rs, 'sala');
    guest.Game.network.handleMessage(toB.msg, 'sala');
    const gr = guest.state.currentRound;
    check(gr && gr.asker === 'A' && gr.answerer === 'B' && gr.answered === false && gr.event && gr.question && gr.question.isAnswerer === true,
        'B deveria guardar a rodada e a pergunta com os nomes novos, veio: ' + JSON.stringify(gr));
    guest.ctx.document = { getElementById: () => ({ style: {}, classList: { add() {} } }), querySelectorAll: () => [] };
    vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/ui/components/questionComponent.js'), 'utf8'), guest.ctx);
    guest.ctx.handleAlternativeClick(round.question.correct, { classList: { add() {} } });
    const answer = guest.record.toHost.find(m => m.type === 'answer');
    check(answer && answer.alternative === round.question.correct && answer.playerName === 'B' && guest.state.currentRound.answered === true,
        'B deveria mandar answer com a alternativa em `alternative` e marcar a rodada como respondida, veio: ' + JSON.stringify(answer));

    // O host processa a resposta.
    env.Game.network.handleMessage(answer, 'peer-b');
    const kpi = env.broadcastsOfType('kpi-update').find(m => m.playerName === 'B');
    check(kpi && kpi.isCorrect === true && kpi.kpiGained === env.CONFIG.KPI.CORRECT_ANSWER && JSON.stringify(kpi.answeredThisRound) === '["B"]',
        'kpi-update deveria levar isCorrect, kpiGained e answeredThisRound, veio: ' + JSON.stringify(kpi));
    check(env.state.currentRound.answered === true && !env.state.answerTimeout && JSON.stringify(env.state.answeredThisRound) === '["B"]',
        'o host deveria marcar a rodada como respondida, cancelar o prazo e guardar o rodízio em answeredThisRound');
    const guestScreens = recordScreens(guest);
    guest.Game.network.handleMessage(kpi, 'sala');
    const result = guestScreens.find(c => c.name === 'showResultModal');
    check(result && result.args[0] === true && result.args[1] === kpi.kpiGained, 'B deveria ver o resultado (acertou, KPI ganho)');
    check(JSON.stringify(guest.state.answeredThisRound) === '["B"]', 'B deveria guardar quem já respondeu');

    // A (o Perguntador) cai e volta depois da resposta: o state-sync usa os nomes novos.
    env.drop('peer-a');
    env.join('A', 'peer-a2');
    const sync = syncTo(env, 'peer-a2');
    check(sync && sync.decks && sync.roundEnded === false && sync.matchPaused === false && 'finalRanking' in sync &&
        JSON.stringify(sync.answeredThisRound) === '["B"]' &&
        sync.currentRound && sync.currentRound.asker === 'A' && sync.currentRound.answered === true && sync.currentRound.question,
        'o state-sync deveria levar decks, roundEnded, matchPaused, answeredThisRound, finalRanking e a rodada com os nomes novos, veio: ' + JSON.stringify(sync && Object.keys(sync)));
    const guestA = use(createEnvironment());
    guestA.receiveSync('A', sync);
    check(guestA.state.currentRound && guestA.state.currentRound.asker === 'A' && guestA.state.decks &&
        guestA.state.roundEnded === false && JSON.stringify(guestA.state.answeredThisRound) === '["B"]',
        'A deveria restaurar a rodada, os baralhos e o rodízio do state-sync');
    check(roundScreens(guestA).includes('displaySpectatorView'), 'pergunta já respondida: A volta vendo a tela de espectador, viu: ' + roundScreens(guestA).join(', '));

    // Próxima dupla da mesma rodada: mesmo evento, sem mostrar o evento de novo.
    time.advance(3000);
    const rs2 = env.broadcastsOfType('round-start').pop();
    check(rs2 !== rs && rs2.event && rs2.event.id === rs.event.id && JSON.stringify(rs2.answeredThisRound) === '["B"]' &&
        env.broadcastsOfType('show-event').length === 1,
        'a próxima dupla deveria continuar a rodada (mesmo evento, B no rodízio), veio: ' + JSON.stringify(rs2));

    // Fim de jogo: o ranking final fica guardado e vai para quem volta.
    env.Game.core.endGame(env.Game.engine.session.buildRanking());
    check(Array.isArray(env.state.finalRanking) && env.state.finalRanking.length === 3, 'o ranking do fim de jogo deveria ficar em state.finalRanking');
    env.drop('peer-b');
    env.join('B', 'peer-b2');
    const endSync = syncTo(env, 'peer-b2');
    check(endSync && endSync.gameOver === true && JSON.stringify(endSync.finalRanking) === JSON.stringify(env.state.finalRanking),
        'quem volta no fim de jogo deveria receber o ranking em finalRanking');
    env.Game.saveState();
    const saved = JSON.parse(env.storage['pmKPI_roomState']);
    check(saved.stateVersion >= 2 && ['decks', 'answeredThisRound', 'roundEnded', 'matchPaused', 'finalRanking'].every(k => k in saved),
        'o estado salvo deveria usar os nomes novos, veio: ' + Object.keys(saved).join(', '));
    env.Game.core.backToLobby();
    check(Array.isArray(env.state.answeredThisRound) && env.state.answeredThisRound.length === 0 &&
        env.state.finalRanking === null && env.state.roundEnded === false && env.state.matchPaused === null,
        'voltar ao lobby deveria zerar answeredThisRound, finalRanking, roundEnded e matchPaused');

    // Partida de 2: A cai e a partida pausa; quem volta recebe a pausa no state-sync.
    const paused = use(createEnvironment());
    paused.createRoomAsHost();
    paused.join('A', 'peer-a');
    paused.startMatch();
    paused.drop('peer-a');
    const pauseMsg = paused.broadcastsOfType('match-paused')[0];
    check(pauseMsg && paused.state.matchPaused && paused.state.matchPaused.event,
        'a pausa deveria ser avisada com match-paused e guardada em state.matchPaused.event, mandou: ' + paused.record.broadcasts.map(m => m.type).join(', '));
    const pausedEventId = paused.state.matchPaused.event.id;
    const guestP = use(createEnvironment());
    guestP.state.playerName = 'A';
    guestP.Game.network.handleMessage(shown[0], 'sala');
    check(guestP.record.ui.includes('showEventModal'), 'o guest deveria mostrar o evento do show-event');
    guestP.state.currentRound = { asker: 'Host', answerer: 'A', answered: false };
    guestP.Game.network.handleMessage(pauseMsg, 'sala');
    check(guestP.state.currentRound === null && guestP.record.ui.includes('showMatchPausedMessage'), 'o guest deveria tratar o match-paused');
    paused.join('A', 'peer-a2');
    const pausedSync = syncTo(paused, 'peer-a2');
    check(pausedSync && pausedSync.matchPaused === true, 'quem volta com a partida pausada deveria receber matchPaused');
    const guestP2 = use(createEnvironment());
    guestP2.receiveSync('A', pausedSync);
    check(roundScreens(guestP2).includes('showMatchPausedMessage'), 'quem volta deveria ver o aviso de pausa');
    const resumed = paused.broadcastsOfType('round-start').pop();
    check(!paused.state.matchPaused && resumed && resumed.event && resumed.event.id === pausedEventId, 'a volta de A deveria retomar com o mesmo evento');

    // Nada com os nomes antigos nas mensagens, nos estados e no estado salvo.
    const messages = [...env.record.broadcasts, ...env.record.sent.map(e => e.msg), ...guest.record.toHost,
        ...paused.record.broadcasts, ...paused.record.sent.map(e => e.msg)];
    const found = oldNamesIn([messages, env.state, guest.state, guestA.state, paused.state, saved, JSON.parse(paused.storage['pmKPI_roomState'])]);
    check(found.length === 0, 'nenhum nome antigo deveria sobrar nas mensagens e no estado, sobraram: ' + found.join(', '));
    const oldTypes = messages.filter(m => ['partida-pausada', 'show-evento'].includes(m.type)).map(m => m.type);
    check(oldTypes.length === 0, 'nenhum tipo de mensagem antigo deveria ser enviado, veio: ' + oldTypes.join(', '));

    // Regras do baralho (domain/deckRules.js): baralho com questions, available e used.
    const deckCtx = vm.createContext({});
    vm.runInContext('var window = this;', deckCtx);
    vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/domain/deckRules.js'), 'utf8'), deckCtx);
    const deckRules = deckCtx.Game.domain.deck;
    const decks = { d1: { questions: [{ id: 'q1', used: false }, { id: 'q2', used: false }], available: 2, total: 2 } };
    const questionsData = { domains: { d1: { focusAreas: ['initiating'] } } };
    const draws = [1, 2].map(() => deckRules.drawQuestion(decks, questionsData, 'initiating'));
    check(draws.every(d => d && d.domain_key === 'd1') && draws[0].id !== draws[1].id &&
        decks.d1.available === 0 && decks.d1.questions.every(q => q.used === true),
        'drawQuestion deveria sortear do baralho novo, marcando used e baixando available, veio: ' + JSON.stringify(decks));
    const third = deckRules.drawQuestion(decks, questionsData, 'initiating');
    check(third && decks.d1.available === 1, 'com o baralho esgotado, drawQuestion deveria reiniciá-lo e sortear de novo');
    deckRules.resetAllDecks(decks);
    check(decks.d1.available === 2 && decks.d1.questions.every(q => q.used === false) && oldNamesIn(decks).length === 0,
        'resetAllDecks deveria zerar used e repor available, sem nomes antigos, veio: ' + JSON.stringify(decks));
});

test('T83 Versão do jogo 3: jogadores e ranking só com os nomes novos (resources, focusArea, position, finalKpi) no estado, no estado salvo e nas mensagens', (use) => {
    const env = use(createEnvironment());
    check(env.Game.network.PROTOCOL_VERSION >= 3, 'a versão do protocolo deveria ser 3 ou mais (nomes novos de jogador e ranking), veio: ' + env.Game.network.PROTOCOL_VERSION);
    const C = env.CONFIG;
    const first = C.FOCUS_AREAS[0].id;
    const last = C.FOCUS_AREAS[C.FOCUS_AREAS.length - 1].id;
    // Regras reais do ranking (o ambiente usa uma versão simplificada).
    vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/domain/rankingRules.js'), 'utf8'), env.ctx);
    const time = env.fakeTime();
    // Sorteio fixo: A pergunta, B responde, o host assiste.
    vm.runInContext('Math.random = () => 0.99', env.ctx);

    // O host entra na lista pelo setupUI; os guests, pelo player-join.
    const element = () => ({ style: {}, textContent: '', disabled: false, addEventListener: () => {} });
    env.ctx.document = { getElementById: element, querySelectorAll: () => [] };
    Object.assign(env.state, { isHost: true, playerName: 'Host', peerId: 'peer-host', baseRoomPeerId: 'sala', players: [] });
    env.ctx.setupUI();
    env.join('A', 'peer-a');
    env.join('B', 'peer-b');
    check(env.state.players.length === 3 && env.state.players.every(p => p.resources === C.STARTING_RESOURCES && p.focusArea === first),
        'host e guests deveriam entrar com resources e focusArea iniciais, veio: ' + JSON.stringify(env.state.players));
    const list = env.broadcastsOfType('player-list').pop();
    check(list && list.players.every(p => p.resources === C.STARTING_RESOURCES && p.focusArea === first),
        'o player-list deveria levar resources e focusArea, veio: ' + JSON.stringify(list));

    // B começa na última área foco: a etiqueta da pergunta é dessa área.
    env.player('B').focusArea = last;
    // O sorteio do ambiente ignora a área foco: o espião guarda qual foi pedida.
    const drawnFor = [];
    const fakeDraw = env.Game.domain.deck.drawQuestion;
    env.Game.domain.deck.drawQuestion = (decks, data, focusAreaId) => { drawnFor.push(focusAreaId); return fakeDraw(decks, data, focusAreaId); };
    env.startMatch();
    check(drawnFor[0] === last, 'a pergunta deveria ser sorteada da área foco de B, foi da: ' + drawnFor[0]);
    const shown = env.broadcastsOfType('show-event')[0];
    check(shown && shown.players.find(p => p.name === 'B').focusArea === last, 'o show-event deveria levar os jogadores com focusArea');
    const round = env.state.currentRound;
    check(round && round.asker === 'A' && round.answerer === 'B' && round.question.area === C.FOCUS_AREAS[C.FOCUS_AREAS.length - 1].name,
        'a pergunta deveria ter a etiqueta da área foco de B, veio: ' + JSON.stringify(round && round.question.area));

    // Na última área foco não se pede assessoria: nem no guest, nem no host.
    const rs = env.broadcastsOfType('round-start').pop();
    const toB = env.record.sent.find(e => e.to === 'peer-b' && e.msg.type === 'question');
    const guest = use(createEnvironment());
    guest.state.playerName = 'B';
    guest.state.peerId = 'peer-b';
    guest.state.players = JSON.parse(JSON.stringify(env.state.players));
    guest.Game.network.handleMessage(rs, 'sala');
    guest.Game.network.handleMessage(toB.msg, 'sala');
    check(guest.Game.core.requestAdvisory('Host') === false && !guest.record.toHost.some(m => m.type === 'advisory-request'),
        'B, na última área foco, não deveria conseguir pedir assessoria');
    env.Game.network.handleMessage({ type: 'advisory-request', advisorName: 'Host', requesterName: 'B' }, 'peer-b');
    const refused = env.record.sent.find(e => e.to === 'peer-b' && e.msg.type === 'advisory-result');
    check(refused && refused.msg.invalid === true && refused.msg.reason === 'closing-focus-area' && !env.state.currentRound.advisory,
        'o host deveria recusar a assessoria de quem está na última área foco, veio: ' + JSON.stringify(refused && refused.msg));

    // Na primeira área foco: B pede assessoria ao host, que sugere a certa, e B acerta.
    env.player('B').focusArea = first;
    env.Game.network.handleMessage({ type: 'advisory-request', advisorName: 'Host', requesterName: 'B' }, 'peer-b');
    check(env.state.currentRound.advisory && env.state.currentRound.advisory.status === 'pending', 'pré-condição: assessoria pendente');
    env.Game.core.handleAdvisoryAnswer({ alternative: round.question.correct, declined: false });
    env.Game.network.handleMessage({ type: 'answer', alternative: round.question.correct, playerName: 'B' }, 'peer-b');
    const kpiB = env.broadcastsOfType('kpi-update').find(m => m.playerName === 'B');
    check(kpiB && kpiB.isCorrect === true && kpiB.resources === C.STARTING_RESOURCES && kpiB.focusArea === first && kpiB.activities === 1,
        'o kpi-update da resposta deveria levar resources e focusArea, veio: ' + JSON.stringify(kpiB));
    const kpiHost = env.broadcastsOfType('kpi-update').find(m => m.playerName === 'Host');
    check(kpiHost && kpiHost.advisorBonus === C.KPI.ADVISOR_BONUS && kpiHost.resources === C.STARTING_RESOURCES && kpiHost.focusArea === first,
        'o kpi-update do bônus de assessoria deveria levar resources e focusArea, veio: ' + JSON.stringify(kpiHost));

    // O guest aplica os dois kpi-update (a cópia dele estava com outros valores).
    guest.player('B').resources = 0;
    guest.player('Host').focusArea = last;
    const guestScreens = recordScreens(guest);
    guest.Game.network.handleMessage(kpiB, 'sala');
    guest.Game.network.handleMessage(kpiHost, 'sala');
    const gb = guest.player('B');
    const gh = guest.player('Host');
    check(gb.resources === C.STARTING_RESOURCES && gb.focusArea === first && gb.activities === 1 && gh.focusArea === first && gh.kpi === kpiHost.kpi,
        'o guest deveria aplicar resources e focusArea dos kpi-update, veio: ' + JSON.stringify([gb, gh]));
    const result = guestScreens.find(c => c.name === 'showResultModal');
    check(result && result.args[0] === true && result.args[2] === C.STARTING_RESOURCES,
        'B deveria ver o resultado com os recursos que sobraram, veio: ' + JSON.stringify(result && result.args));

    // Próxima dupla: A erra e gasta 1 recurso.
    time.advance(3000);
    check(env.state.currentRound && env.state.currentRound.answerer === 'A' && !env.state.currentRound.answered, 'pré-condição: A responde na próxima dupla');
    const wrong = ['A', 'B', 'C', 'D'].find(x => x !== env.state.currentRound.question.correct);
    env.Game.network.handleMessage({ type: 'answer', alternative: wrong, playerName: 'A' }, 'peer-a');
    const kpiA = env.broadcastsOfType('kpi-update').find(m => m.playerName === 'A');
    check(kpiA && kpiA.isCorrect === false && kpiA.resources === C.STARTING_RESOURCES - 1 && env.player('A').resources === C.STARTING_RESOURCES - 1,
        'errar deveria gastar 1 recurso, em resources, veio: ' + JSON.stringify(kpiA));

    // Pedido de ajuda: só quem está sem recursos pede; a fila começa por quem tem mais.
    Object.assign(env.player('A'), { resources: 0, kpi: 20 });
    Object.assign(env.player('B'), { resources: 5 });
    Object.assign(env.player('Host'), { resources: 1 });
    env.Game.network.handleMessage({ type: 'help-request', requesterName: 'B' }, 'peer-b');
    check(!env.record.sent.some(e => e.msg.type === 'help-offer'), 'quem ainda tem recursos não pode pedir ajuda');
    env.Game.network.handleMessage({ type: 'help-request', requesterName: 'A' }, 'peer-a');
    const offer = env.record.sent.find(e => e.msg.type === 'help-offer');
    check(offer && offer.to === 'peer-b', 'a primeira oferta deveria ir para B (mais recursos), foi para: ' + (offer && offer.to));
    env.Game.network.handleMessage({ type: 'help-offer-response', candidateName: 'B', requesterName: 'A', accepted: true }, 'peer-b');
    const confirmed = env.broadcastsOfType('help-confirmed')[0];
    check(env.player('A').resources === 1 && env.player('B').resources === 4 &&
        confirmed && confirmed.donorResources === 4 && confirmed.requesterResources === 1,
        'a ajuda deveria passar 1 recurso de B para A, veio: ' + JSON.stringify(confirmed));
    guest.Game.network.handleMessage(confirmed, 'sala');
    check(guest.player('A').resources === 1 && guest.player('B').resources === 4, 'o guest deveria aplicar os recursos da ajuda confirmada');
    const trade = env.Game.domain.trade;
    check(trade.validateResourceTransfer({ name: 'X', resources: 0 }, { name: 'Y', kpi: 50 }, C) !== null &&
        trade.validateResourceTransfer({ name: 'X', resources: 1 }, { name: 'Y', kpi: 50 }, C) === null,
        'a validação da ajuda deveria olhar os resources de quem doa');

    // Efeitos de evento (domain/eventRules.js real) sobre resources.
    const eventCtx = vm.createContext({});
    vm.runInContext('var window = this;', eventCtx);
    vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/domain/eventRules.js'), 'utf8'), eventCtx);
    const events = eventCtx.Game.domain.event;
    // O corte não tem piso: Y vai de 3 a −1 (estouro de orçamento).
    const ps = [{ name: 'X', resources: 3 }, { name: 'Y', resources: 1 }];
    const steps = [
        [{ resourcesForAll: 2 }, [5, 3]],
        [{ resourcesForAll: -4 }, [1, -1]],
        [{ resourcesForFewest: 1 }, [1, 0]],
        [{ resourceSwap: true }, [0, 1]]
    ];
    for (const [event, expected] of steps) {
        events.applyEventEffects(event, ps);
        check(ps[0].resources === expected[0] && ps[1].resources === expected[1] && oldPlayerNamesIn(ps).length === 0,
            'evento ' + JSON.stringify(event) + ' deveria deixar resources em ' + expected.join(' e ') + ', veio: ' + JSON.stringify(ps));
    }

    // Fim de jogo: ranking com position, finalKpi, resources e focusArea, do maior para o menor.
    env.Game.core.endGame(env.Game.engine.session.buildRanking());
    const over = env.broadcastsOfType('game-over')[0];
    const ranking = over && over.ranking;
    check(ranking && ranking.length === 3 && ranking.every((p, i) => {
        const pl = env.player(p.name);
        return p.position === i + 1 && p.resources === pl.resources && p.focusArea === pl.focusArea &&
            p.finalKpi === pl.kpi + pl.resources * C.KPI.FINAL_RESOURCE_VALUE && (i === 0 || ranking[i - 1].finalKpi > p.finalKpi);
    }), 'o game-over deveria levar o ranking com position, finalKpi, resources e focusArea, em ordem, veio: ' + JSON.stringify(ranking));
    guest.Game.network.handleMessage(over, 'sala');
    check(JSON.stringify(guest.state.finalRanking) === JSON.stringify(ranking), 'o guest deveria guardar o ranking final');

    // Quem volta no fim de jogo recebe jogadores e ranking com os nomes novos.
    env.drop('peer-a');
    env.join('A', 'peer-a2');
    const sync = syncTo(env, 'peer-a2');
    check(sync && JSON.stringify(sync.finalRanking) === JSON.stringify(ranking) && sync.players.every(p => 'resources' in p && 'focusArea' in p),
        'o state-sync deveria levar o ranking e os jogadores com os nomes novos, veio: ' + JSON.stringify(sync && sync.players));
    const guestA = use(createEnvironment());
    guestA.receiveSync('A', sync);
    check(JSON.stringify(guestA.state.finalRanking) === JSON.stringify(ranking), 'quem volta deveria guardar o ranking final');

    // Estado salvo: versão atual, pmKPI_myData com focusArea.
    env.player('Host').focusArea = last;
    env.Game.saveState();
    const saved = JSON.parse(env.storage['pmKPI_roomState']);
    const mine = JSON.parse(env.storage['pmKPI_myData']);
    check(saved.stateVersion === env.Game.persistence.STATE_VERSION && mine.focusArea === last && !('phase' in mine),
        'o estado salvo deveria ficar na versão atual, com focusArea no pmKPI_myData, veio: ' + JSON.stringify({ v: saved.stateVersion, mine }));

    // Encerrar a partida: todos voltam ao lobby com resources e focusArea iniciais.
    Object.assign(env.player('B'), { resources: 0, focusArea: last, activities: 1 });
    env.Game.core.endMatch();
    const ended = env.broadcastsOfType('match-ended')[0];
    check(ended && ended.players.length === 3 && ended.players.every(p => p.resources === C.STARTING_RESOURCES && p.focusArea === first && p.activities === 0),
        'o match-ended deveria levar os jogadores zerados, com resources e focusArea, veio: ' + JSON.stringify(ended && ended.players));

    // Nada com os nomes antigos nas mensagens, nos estados e no estado salvo.
    const messages = [...env.record.broadcasts, ...env.record.sent.map(e => e.msg), ...guest.record.toHost];
    const found = oldPlayerNamesIn([messages, env.state, guest.state, guestA.state, saved, mine]);
    check(found.length === 0, 'nenhum nome antigo deveria sobrar nas mensagens e no estado, sobraram: ' + found.join(', '));

    // Telas: card do jogador, lista de jogadores, ranking parcial e final.
    const ui = use(createEnvironment());
    const elements = {};
    ui.ctx.document = { getElementById: (id) => elements[id] || (elements[id] = { id, textContent: '', innerHTML: '', style: {} }) };
    for (const file of ['js/utils/sanitize.js', 'js/domain/rankingRules.js', 'js/ui/components/profileComponent.js', 'js/ui/components/rankingComponent.js']) {
        vm.runInContext(fs.readFileSync(path.join(ROOT, file), 'utf8'), ui.ctx);
    }
    ui.ctx.renderProfileCard({ name: 'Ana', kpi: 5, resources: 0, focusArea: last, activities: 1 });
    check(elements.myResources && elements.myResources.textContent === 0 && elements.btnRequestHelp && elements.btnRequestHelp.style.display === 'block',
        'o card deveria mostrar 0 recursos e o botão de pedir ajuda');
    check(elements.focusAreasList && elements.focusAreasList.innerHTML.includes('focus-area-current" data-focus-area="' + last + '"'),
        'o card deveria marcar a área foco atual, veio: ' + (elements.focusAreasList && elements.focusAreasList.innerHTML));
    ui.ctx.renderProfileCard({ name: 'Ana', kpi: 5, resources: 3, focusArea: first, activities: 0 });
    check(elements.myResources.textContent === 3 && elements.btnRequestHelp.style.display === 'none', 'com recursos, o botão de pedir ajuda some');

    ui.state.players = [
        { name: 'Ana', kpi: 30, resources: 7, focusArea: last, activities: 0 },
        { name: 'Beto', kpi: 10, resources: 2, focusArea: first, activities: 1 },
        { name: 'Caio', kpi: 4, resources: 0, focusArea: first, activities: 0 },
        { name: 'Duda', kpi: 0, resources: 1, focusArea: first, activities: 0 }
    ];
    ui.ctx.updatePlayersOnlineList();
    const online = elements.playersOnlineList.innerHTML;
    check(online.includes('📦7') && online.includes(C.FOCUS_AREAS[C.FOCUS_AREAS.length - 1].emoji),
        'a lista de jogadores deveria mostrar os recursos e a área foco, veio: ' + online);
    ui.ctx.updateRankingList();
    check(elements.rankingList.innerHTML.includes('>44 ⭐<'), 'o ranking parcial deveria mostrar o KPI final (30 + 7 × 2), veio: ' + elements.rankingList.innerHTML);
    ui.ctx.displayFinalRanking(ui.Game.domain.ranking.buildRanking(ui.state.players, C));
    const finalHtml = elements.finalRanking.innerHTML;
    check(finalHtml.includes('#4') && [44, 14, 4, 2].every(v => finalHtml.includes('>' + v + ' ⭐<')),
        'o ranking final deveria mostrar a posição (#4) e o KPI final de cada um, veio: ' + finalHtml);
});

/**
 * Guest com a cópia dos jogadores do host e as telas reais de `files`,
 * com DOM falso (cada elemento pedido é criado na hora e fica em
 * `elements`). O i18n devolve a chave seguida dos valores, para o teste
 * ver quais campos a tela leu; os avisos (alert) ficam em `alerts`.
 */
function guestWithScreens(use, host, name, files) {
    const guest = use(createEnvironment());
    guest.state.playerName = name;
    guest.state.peerId = host.player(name).peerId;
    guest.state.players = JSON.parse(JSON.stringify(host.state.players));
    const elements = {};
    guest.ctx.document = {
        getElementById: (id) => elements[id] || (elements[id] = {
            id, textContent: '', innerHTML: '', disabled: false, style: {}, classList: { add() {} }, addEventListener() {}
        }),
        querySelectorAll: () => []
    };
    guest.Game.i18n.t = (key, values) => key + (values ? ' ' + JSON.stringify(values) : '');
    const alerts = [];
    guest.ctx.alert = (text) => { alerts.push(String(text)); };
    for (const file of files) vm.runInContext(fs.readFileSync(path.join(ROOT, file), 'utf8'), guest.ctx, { filename: file });
    return { guest, elements, alerts };
}

test('T86 Versão do jogo 4: assessoria e pedido de ajuda só com os nomes novos (advisory-*, help-*) no estado, no estado salvo, nas mensagens e nas telas', (use) => {
    const first = use(createEnvironment());
    check(first.Game.network.PROTOCOL_VERSION >= 4, 'a versão do protocolo deveria ser 4 ou mais (nomes novos da assessoria e do pedido de ajuda), veio: ' + first.Game.network.PROTOCOL_VERSION);
    const C = first.CONFIG;
    const last = C.FOCUS_AREAS[C.FOCUS_AREAS.length - 1].id;
    const hosts = [];
    const guests = [];
    const advisoryScreens = ['js/ui/modals/advisoryModal.js', 'js/ui/components/questionComponent.js'];
    const helpScreens = ['js/utils/sanitize.js', 'js/ui/modals/tradeModal.js'];
    const text = (key, values) => key + (values ? ' ' + JSON.stringify(values) : '');

    /** Partida de 4 (Host, A, B, C) com a pergunta aberta: A pergunta, B responde. */
    function matchOfFour() {
        const m = use(createEnvironment());
        const time = m.fakeTime();
        m.createRoomAsHost();
        m.join('A', 'peer-a');
        m.join('B', 'peer-b');
        m.join('C', 'peer-c');
        m.startMatch();
        // O sorteio da dupla é aleatório: fixa os papéis (mesma pergunta e evento).
        m.state.currentRound = { ...m.state.currentRound, asker: 'A', answerer: 'B', answered: false };
        hosts.push(m);
        return { m, time };
    }

    /** B (guest) com a rodada do host, a pergunta sem o gabarito e a assessoria indicada. */
    function answererGuest(m, advisory) {
        const b = guestWithScreens(use, m, 'B', advisoryScreens);
        const round = JSON.parse(JSON.stringify(m.state.currentRound));
        delete round.question.correct;
        b.guest.state.currentRound = { ...round, question: { ...round.question, isAnswerer: true }, advisory };
        guests.push(b.guest);
        return b;
    }

    // 1) Assessoria aceita, de ponta a ponta: B pede a C pela tela, C sugere a certa, B acerta.
    const { m: env } = matchOfFour();
    const correct = env.state.currentRound.question.correct;
    const b = answererGuest(env, undefined);
    delete b.guest.state.currentRound.advisory;
    b.guest.ctx.chooseAdvisor('C');
    const request = b.guest.record.toHost.find(m => m.type === 'advisory-request');
    check(request && request.advisorName === 'C' && request.requesterName === 'B',
        'B deveria mandar advisory-request com advisorName, veio: ' + JSON.stringify(b.guest.record.toHost));
    const local = b.guest.state.currentRound.advisory;
    check(local && local.advisorName === 'C' && local.status === 'pending' && local.suggestion === null,
        'B deveria guardar a assessoria pendente em advisory, veio: ' + JSON.stringify(b.guest.state.currentRound));

    env.Game.network.handleMessage(request, 'peer-b');
    const pending = env.state.currentRound.advisory;
    check(pending && pending.advisorName === 'C' && pending.status === 'pending' && pending.suggestion === null,
        'o host deveria guardar a assessoria pendente em currentRound.advisory, veio: ' + JSON.stringify(env.state.currentRound));
    check(env.state.advisoryTimeout && !env.state.answerTimeout, 'o prazo do assessor deveria ficar em state.advisoryTimeout (e o de resposta, pausado)');
    const started = env.broadcastsOfType('advisory-started')[0];
    check(started && started.advisorName === 'C' && started.requesterName === 'B', 'deveria avisar advisory-started com advisorName, veio: ' + JSON.stringify(started));
    const question = env.record.sent.find(e => e.to === 'peer-c' && e.msg.type === 'advisory-question');
    check(question && question.msg.question === env.state.currentRound.question.question && question.msg.correct === undefined,
        'C deveria receber advisory-question, sem o gabarito, veio: ' + JSON.stringify(question && question.msg));

    // B recebe o advisory-started (tela real) e vê "aguardando" na pergunta.
    b.guest.Game.network.handleMessage(started, 'sala');
    check(b.guest.record.ui.includes('showAdvisoryStarted'), 'B deveria tratar o advisory-started');
    b.guest.state.currentRound.advisory = null;
    b.guest.ctx.showAdvisoryStarted(started);
    const fromStarted = b.guest.state.currentRound.advisory;
    check(fromStarted && fromStarted.advisorName === 'C' && fromStarted.status === 'pending', 'B deveria guardar o assessor do advisory-started, veio: ' + JSON.stringify(fromStarted));
    b.guest.ctx.displayQuestion(b.guest.state.currentRound.question);
    check(b.elements.advisoryStatus.textContent === text('advisory.waitingForAnswer', { advisor: 'C' }),
        'com a assessoria pendente, a pergunta deveria mostrar "aguardando C", veio: ' + b.elements.advisoryStatus.textContent);

    // C responde pela tela.
    const c = guestWithScreens(use, env, 'C', advisoryScreens);
    guests.push(c.guest);
    c.guest.state.currentRound = JSON.parse(JSON.stringify({ ...env.state.currentRound, question: null }));
    c.guest.Game.network.handleMessage(question.msg, 'sala');
    check(c.guest.record.ui.includes('showAdvisoryQuestionModal'), 'C deveria abrir a pergunta da assessoria');
    c.guest.ctx.answerAdvisory(correct, false);
    const answer = c.guest.record.toHost.find(m => m.type === 'advisory-answer');
    check(answer && answer.alternative === correct && answer.declined === false,
        'C deveria mandar advisory-answer com alternative e declined, veio: ' + JSON.stringify(c.guest.record.toHost));
    env.Game.network.handleMessage(answer, 'peer-c');
    const result = env.broadcastsOfType('advisory-result').pop();
    check(result && result.advisorName === 'C' && result.suggestion === correct && result.declined === false && result.timeout === false,
        'advisory-result deveria levar advisorName, suggestion e declined, veio: ' + JSON.stringify(result));
    const done = env.state.currentRound.advisory;
    check(done && done.status === 'accepted' && done.suggestion === correct && !env.state.advisoryTimeout && env.state.answerTimeout,
        'o host deveria guardar a sugestão em advisory.suggestion, cancelar o prazo do assessor e rearmar o de resposta, veio: ' + JSON.stringify(done));

    // Estado salvo com a sugestão.
    env.Game.saveState();
    const saved = JSON.parse(env.storage['pmKPI_roomState']);
    check(saved.stateVersion === env.Game.persistence.STATE_VERSION && saved.currentRound.advisory &&
        saved.currentRound.advisory.advisorName === 'C' && saved.currentRound.advisory.suggestion === correct,
        'o estado salvo deveria levar a assessoria com os nomes novos, veio: ' + JSON.stringify(saved.currentRound));

    // B vê a sugestão (resultado e pergunta reexibida).
    b.guest.Game.network.handleMessage(result, 'sala');
    check(b.guest.record.ui.includes('showAdvisoryResult'), 'B deveria tratar o advisory-result');
    b.guest.ctx.showAdvisoryResult(result);
    const suggestionText = text('advisory.suggestion', { advisor: 'C', suggestion: correct.toUpperCase() });
    const seen = b.guest.state.currentRound.advisory;
    check(b.elements.advisoryStatus.textContent === suggestionText && seen.status === 'accepted' && seen.suggestion === correct,
        'B deveria ver a sugestão de C, veio: ' + b.elements.advisoryStatus.textContent + ' / ' + JSON.stringify(seen));
    b.elements.advisoryStatus.textContent = '';
    b.guest.ctx.displayQuestion(b.guest.state.currentRound.question);
    check(b.elements.advisoryStatus.textContent === suggestionText, 'a pergunta reexibida deveria mostrar a sugestão, veio: ' + b.elements.advisoryStatus.textContent);

    // B acerta: C ganha o bônus (advisorBonus) e vê o aviso.
    env.Game.network.handleMessage({ type: 'answer', alternative: correct, playerName: 'B' }, 'peer-b');
    const bonus = env.broadcastsOfType('kpi-update').find(m => m.playerName === 'C');
    check(bonus && bonus.advisorBonus === C.KPI.ADVISOR_BONUS && env.player('C').kpi === C.KPI.ADVISOR_BONUS,
        'o kpi-update do assessor deveria levar advisorBonus, veio: ' + JSON.stringify(bonus));
    const cScreens = recordScreens(c.guest);
    c.guest.Game.network.handleMessage(bonus, 'sala');
    const bonusModal = cScreens.find(s => s.name === 'showAdvisoryBonusModal');
    check(bonusModal && bonusModal.args[0] === C.KPI.ADVISOR_BONUS, 'C deveria ver o aviso do bônus, viu: ' + cScreens.map(s => s.name).join(', '));

    // 2) C recusa: declined, sem sugestão.
    const r2 = matchOfFour().m;
    r2.Game.network.handleMessage({ type: 'advisory-request', advisorName: 'C', requesterName: 'B' }, 'peer-b');
    r2.Game.network.handleMessage({ type: 'advisory-answer', alternative: null, declined: true }, 'peer-c');
    const declined = r2.broadcastsOfType('advisory-result').pop();
    check(declined && declined.declined === true && declined.suggestion === null && declined.timeout === false &&
        r2.state.currentRound.advisory.status === 'declined' && r2.state.currentRound.advisory.suggestion === null,
        'a recusa deveria chegar com declined, veio: ' + JSON.stringify(declined));
    const b2 = answererGuest(r2, { advisorName: 'C', status: 'pending', suggestion: null });
    b2.guest.ctx.showAdvisoryResult(declined);
    check(b2.elements.advisoryStatus.textContent === text('advisory.declined', { advisor: 'C' }) && b2.guest.state.currentRound.advisory.status === 'declined',
        'B deveria ver a recusa de C, veio: ' + b2.elements.advisoryStatus.textContent);
    b2.elements.advisoryStatus.textContent = '';
    b2.guest.ctx.displayQuestion(b2.guest.state.currentRound.question);
    check(b2.elements.advisoryStatus.textContent === text('advisory.declined', { advisor: 'C' }),
        'a pergunta reexibida deveria mostrar a recusa de C, veio: ' + b2.elements.advisoryStatus.textContent);

    // 3) C não responde: no fim do prazo, recusa por tempo.
    const { m: r3, time: t3 } = matchOfFour();
    r3.Game.network.handleMessage({ type: 'advisory-request', advisorName: 'C', requesterName: 'B' }, 'peer-b');
    t3.advance(C.GAME.ADVISORY_TIMEOUT);
    const late = r3.broadcastsOfType('advisory-result').pop();
    check(late && late.declined === true && late.timeout === true && !r3.state.advisoryTimeout && r3.state.currentRound.advisory.status === 'declined',
        'sem resposta no prazo, deveria chegar declined com timeout, veio: ' + JSON.stringify(late));
    const b3 = answererGuest(r3, { advisorName: 'C', status: 'pending', suggestion: null });
    b3.guest.ctx.showAdvisoryResult(late);
    check(b3.elements.advisoryStatus.textContent === text('advisory.timeout', { advisor: 'C' }), 'B deveria ver "não respondeu a tempo", veio: ' + b3.elements.advisoryStatus.textContent);

    // 4) Pedido inválido (o assessor é o Perguntador): invalid, e B pode chamar outro.
    const r4 = matchOfFour().m;
    r4.Game.network.handleMessage({ type: 'advisory-request', advisorName: 'A', requesterName: 'B' }, 'peer-b');
    const invalid = r4.record.sent.filter(e => e.to === 'peer-b' && e.msg.type === 'advisory-result').pop();
    check(invalid && invalid.msg.invalid === true && invalid.msg.declined === true && invalid.msg.advisorName === 'A' && invalid.msg.reason === undefined &&
        !r4.state.currentRound.advisory, 'o pedido inválido deveria voltar com invalid, sem motivo, veio: ' + JSON.stringify(invalid && invalid.msg));
    const b4 = answererGuest(r4, { advisorName: 'A', status: 'pending', suggestion: null });
    b4.guest.ctx.showAdvisoryResult(invalid.msg);
    check(b4.elements.advisoryStatus.textContent === text('advisory.invalid', { advisor: 'A' }) && b4.guest.state.currentRound.advisory === null &&
        b4.elements.btnRequestAdvisory.disabled === false, 'B deveria ver o aviso e poder chamar outro, veio: ' + b4.elements.advisoryStatus.textContent);

    // 5) Quem responde está na última área foco: motivo closing-focus-area.
    const r5 = matchOfFour().m;
    r5.player('B').focusArea = last;
    r5.Game.network.handleMessage({ type: 'advisory-request', advisorName: 'C', requesterName: 'B' }, 'peer-b');
    const closing = r5.record.sent.filter(e => e.to === 'peer-b' && e.msg.type === 'advisory-result').pop();
    check(closing && closing.msg.invalid === true && closing.msg.reason === 'closing-focus-area' && !r5.state.currentRound.advisory,
        'na última área foco, o motivo deveria ser closing-focus-area, veio: ' + JSON.stringify(closing && closing.msg));
    const b5 = answererGuest(r5, { advisorName: 'C', status: 'pending', suggestion: null });
    b5.guest.ctx.showAdvisoryResult(closing.msg);
    check(b5.elements.advisoryStatus.textContent === 'advisory.closingFocusArea', 'B deveria ver o aviso da última área foco, veio: ' + b5.elements.advisoryStatus.textContent);

    // 6) Pedido depois da resposta: motivo already-answered.
    const r6 = matchOfFour().m;
    r6.Game.network.handleMessage({ type: 'answer', alternative: r6.state.currentRound.question.correct, playerName: 'B' }, 'peer-b');
    r6.Game.network.handleMessage({ type: 'advisory-request', advisorName: 'C', requesterName: 'B' }, 'peer-b');
    const answered = r6.record.sent.filter(e => e.to === 'peer-b' && e.msg.type === 'advisory-result').pop();
    check(answered && answered.msg.invalid === true && answered.msg.declined === true && answered.msg.reason === 'already-answered' && answered.msg.advisorName === 'C',
        'pedido depois da resposta: o motivo deveria ser already-answered, veio: ' + JSON.stringify(answered && answered.msg));

    // 7) Pedido de ajuda de ponta a ponta: A (sem recursos) pede pela tela;
    // B recusa, C não responde no prazo, o Host aceita.
    const { m: h, time: ht } = matchOfFour();
    Object.assign(h.player('A'), { resources: 0, kpi: 20 });
    Object.assign(h.player('B'), { resources: 5, kpi: 0 });
    Object.assign(h.player('C'), { resources: 3, kpi: 0 });
    Object.assign(h.player('Host'), { resources: 1, kpi: 0 });
    const amount = C.KPI.RESOURCE_PRICE;
    const a = guestWithScreens(use, h, 'A', helpScreens);
    guests.push(a.guest);
    a.guest.ctx.startHelpRequest();
    const helpRequest = a.guest.record.toHost.find(m => m.type === 'help-request');
    check(helpRequest && helpRequest.requesterName === 'A', 'A deveria mandar help-request, veio: ' + JSON.stringify(a.guest.record.toHost));
    h.Game.network.handleMessage(helpRequest, 'peer-a');
    const queue = h.state.helpQueue;
    check(queue && queue.requesterName === 'A' && JSON.stringify(queue.candidates) === '["B","C","Host"]' && queue.index === 0 && h.state.helpTimeout,
        'a fila deveria ficar em state.helpQueue (candidates, index) e o prazo em state.helpTimeout, veio: ' + JSON.stringify(queue));
    const trying = h.record.sent.filter(e => e.to === 'peer-a' && e.msg.type === 'help-trying').pop();
    check(trying && trying.msg.candidateName === 'B', 'A deveria receber help-trying com candidateName, veio: ' + JSON.stringify(trying && trying.msg));
    a.guest.Game.network.handleMessage(trying.msg, 'sala');
    check(a.guest.record.ui.includes('showHelpCandidate'), 'A deveria tratar o help-trying');
    a.guest.ctx.showHelpCandidate(trying.msg);
    check(a.elements.helpTryingWith.textContent === 'B', 'A deveria ver que o pedido está com B, veio: ' + a.elements.helpTryingWith.textContent);

    const offer = h.record.sent.find(e => e.to === 'peer-b' && e.msg.type === 'help-offer');
    check(offer && offer.msg.requesterName === 'A', 'B deveria receber help-offer, veio: ' + JSON.stringify(offer && offer.msg));
    const bh = guestWithScreens(use, h, 'B', helpScreens);
    guests.push(bh.guest);
    bh.guest.Game.network.handleMessage(offer.msg, 'sala');
    check(bh.guest.record.ui.includes('showHelpOfferModal'), 'B deveria tratar o help-offer');
    bh.guest.ctx.showHelpOfferModal(offer.msg);
    bh.guest.ctx.respondToHelpOffer(false);
    const refusal = bh.guest.record.toHost.find(m => m.type === 'help-offer-response');
    check(refusal && refusal.candidateName === 'B' && refusal.accepted === false,
        'B deveria mandar help-offer-response com candidateName e accepted, veio: ' + JSON.stringify(bh.guest.record.toHost));
    h.Game.network.handleMessage(refusal, 'peer-b');
    check(h.state.helpQueue.index === 1 && h.record.sent.some(e => e.to === 'peer-c' && e.msg.type === 'help-offer'),
        'com a recusa de B, a oferta deveria ir para C, veio: ' + JSON.stringify(h.state.helpQueue));
    ht.advance(C.GAME.HELP_OFFER_TIMEOUT);
    check(h.state.helpQueue && h.state.helpQueue.index === 2 && h.record.sent.some(e => e.to === 'peer-host' && e.msg.type === 'help-offer'),
        'sem resposta de C no prazo, a oferta deveria ir para o Host, veio: ' + JSON.stringify(h.state.helpQueue));
    h.Game.core.handleHelpOfferResponse({ type: 'help-offer-response', candidateName: 'Host', requesterName: 'A', accepted: true });
    const confirmed = h.broadcastsOfType('help-confirmed')[0];
    check(confirmed && confirmed.donor === 'Host' && confirmed.requester === 'A' && confirmed.amount === amount &&
        confirmed.donorKpi === amount && confirmed.donorResources === 0 && confirmed.requesterKpi === 20 - amount && confirmed.requesterResources === 1,
        'help-confirmed deveria levar donor, amount, donorKpi, donorResources, requesterKpi e requesterResources, veio: ' + JSON.stringify(confirmed));
    check(h.player('A').resources === 1 && h.player('A').kpi === 20 - amount && h.player('Host').resources === 0 && h.player('Host').kpi === amount,
        'a ajuda deveria passar 1 recurso do Host para A');
    check(h.state.helpQueue === null && h.state.helpTimeout === null, 'o pedido deveria terminar (helpQueue e helpTimeout zerados)');
    a.guest.Game.network.handleMessage(confirmed, 'sala');
    const ga = a.guest.player('A');
    const gh = a.guest.player('Host');
    check(ga.resources === 1 && ga.kpi === 20 - amount && gh.resources === 0 && gh.kpi === amount && a.guest.record.ui.includes('closeHelpRequestModal'),
        'A deveria aplicar a ajuda confirmada e fechar o aviso, veio: ' + JSON.stringify([ga, gh]));

    // Motivos de "ninguém pôde ajudar": KPI insuficiente, ninguém com recurso, todos recusaram.
    const noCandidates = () => h.record.sent.filter(e => e.to === 'peer-a' && e.msg.type === 'help-no-candidates').pop();
    Object.assign(h.player('A'), { resources: 0, kpi: amount - 1 });
    h.Game.network.handleMessage({ type: 'help-request', requesterName: 'A' }, 'peer-a');
    const lowKpi = noCandidates();
    check(lowKpi && lowKpi.msg.reason === 'insufficient-kpi', 'sem KPI para pedir, o motivo deveria ser insufficient-kpi, veio: ' + JSON.stringify(lowKpi && lowKpi.msg));
    a.guest.ctx.showHelpNoCandidates(lowKpi.msg);
    check(a.alerts.pop() === 'trade.insufficientKpi', 'A deveria ver o aviso de KPI insuficiente');
    Object.assign(h.player('A'), { kpi: 20 });
    ['B', 'C', 'Host'].forEach(n => { h.player(n).resources = 0; });
    h.Game.network.handleMessage({ type: 'help-request', requesterName: 'A' }, 'peer-a');
    const noDonors = noCandidates();
    check(noDonors && noDonors.msg.reason === 'no-donors', 'sem ninguém com recurso, o motivo deveria ser no-donors, veio: ' + JSON.stringify(noDonors && noDonors.msg));
    a.guest.ctx.showHelpNoCandidates(noDonors.msg);
    check(a.alerts.pop() === 'trade.noHelp', 'A deveria ver o aviso de que ninguém pôde ajudar');
    h.player('B').resources = 2;
    h.Game.network.handleMessage({ type: 'help-request', requesterName: 'A' }, 'peer-a');
    h.Game.network.handleMessage({ type: 'help-offer-response', candidateName: 'B', requesterName: 'A', accepted: false }, 'peer-b');
    const allDeclined = noCandidates();
    check(allDeclined && allDeclined.msg.reason === 'all-declined', 'com todos recusando, o motivo deveria ser all-declined, veio: ' + JSON.stringify(allDeclined && allDeclined.msg));
    // Quem pediu fica sem KPI enquanto B decide: a troca é recusada na validação final.
    h.Game.network.handleMessage({ type: 'help-request', requesterName: 'A' }, 'peer-a');
    h.player('A').kpi = amount - 1;
    h.Game.network.handleMessage({ type: 'help-offer-response', candidateName: 'B', requesterName: 'A', accepted: true }, 'peer-b');
    const failed = noCandidates();
    check(failed && failed.msg.reason === 'no-donors' && failed !== noDonors && h.broadcastsOfType('help-confirmed').length === 1 && h.player('B').resources === 2,
        'recusada na validação final, A deveria receber no-donors, sem troca, veio: ' + JSON.stringify(failed && failed.msg));

    // Nada com os nomes, tipos e motivos antigos nas mensagens, nos estados e no estado salvo.
    const messages = [
        ...hosts.flatMap(x => [...x.record.broadcasts, ...x.record.sent.map(e => e.msg)]),
        ...guests.flatMap(g => g.record.toHost)
    ];
    const found = oldAdvisoryNamesIn([messages, hosts.map(x => x.state), guests.map(g => g.state), saved]);
    check(found.length === 0, 'nenhum nome antigo deveria sobrar nas mensagens e no estado, sobraram: ' + found.join(', '));
    const types = messages.map(m => m.type);
    const oldTypes = [...new Set(types.filter(t => OLD_ADVISORY_TYPES.includes(t)))];
    check(oldTypes.length === 0, 'nenhum tipo de mensagem antigo deveria ser enviado, veio: ' + oldTypes.join(', '));
    const newTypes = ['advisory-request', 'advisory-started', 'advisory-question', 'advisory-answer', 'advisory-result',
        'help-request', 'help-trying', 'help-offer', 'help-offer-response', 'help-no-candidates', 'help-confirmed'];
    const missing = newTypes.filter(t => !types.includes(t));
    check(missing.length === 0, 'todos os tipos novos deveriam ter sido usados, faltaram: ' + missing.join(', '));
    const oldReasons = messages.filter(m => OLD_ADVISORY_REASONS.includes(m.reason)).map(m => m.reason);
    check(oldReasons.length === 0, 'nenhum motivo antigo deveria ser enviado, veio: ' + oldReasons.join(', '));
});

test('T89 Versão do jogo 5: eventos só com os nomes novos (events, title, description e os efeitos) no events.json, nas regras, no estado salvo, nas mensagens e nas telas', (use) => {
    const env = use(createEnvironment());
    check(env.Game.network.PROTOCOL_VERSION >= 5, 'a versão do protocolo deveria ser 5 ou mais (nomes novos dos eventos), veio: ' + env.Game.network.PROTOCOL_VERSION);
    check(env.Game.persistence.STATE_VERSION >= 5, 'a versão do estado salvo deveria ser 5 ou mais (nomes novos dos eventos), veio: ' + env.Game.persistence.STATE_VERSION);
    const C = env.CONFIG;
    const copy = (x) => JSON.parse(JSON.stringify(x));
    /** Mesmos campos e valores, em qualquer ordem. */
    const fields = (o) => JSON.stringify(Object.entries(o || {}).sort());

    // 1) data/events.json: a lista em `events`; cada evento com id, title,
    // description e o efeito, com os mesmos valores de antes.
    const json = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/events.json'), 'utf8'));
    check(JSON.stringify(Object.keys(json)) === '["events"]' && Array.isArray(json.events),
        'o events.json deveria ter só a lista `events`, veio: ' + Object.keys(json).join(', '));
    const expected = [
        { id: 'e1', title: 'Apoio da Alta Gestão', resourcesForAll: 1 },
        { id: 'e2', title: 'Corte de Orçamento', resourcesForAll: -1 },
        { id: 'e3', title: 'Patrocinador Generoso', resourcesForFewest: 1 },
        { id: 'e4', title: 'Reserva de Contingência', contingencyReserve: true },
        { id: 'e5', title: 'Reestruturação', resourceSwap: true },
        { id: 'e6', title: 'Operação Normal', neutral: true }
    ];
    check(json.events.length === expected.length, 'o events.json deveria ter ' + expected.length + ' eventos, veio: ' + json.events.length);
    expected.forEach((exp, i) => {
        const ev = json.events[i];
        check(ev && typeof ev.description === 'string' && ev.description.length > 0 && fields(ev) === fields({ ...exp, description: ev.description }),
            'evento ' + exp.id + ': deveria ter só id, title, description e o efeito ' + JSON.stringify(exp) + ', veio: ' + JSON.stringify(ev));
    });
    check(oldEventNamesIn(json).length === 0, 'o events.json não deveria ter nomes antigos, tem: ' + oldEventNamesIn(json).join(', '));
    const byId = (id) => copy(json.events.find(e => e.id === id));

    // 2) Regras reais (domain/eventRules.js) com os eventos do events.json.
    const eventCtx = vm.createContext({});
    vm.runInContext('var window = this;', eventCtx);
    const eventRulesSource = fs.readFileSync(path.join(ROOT, 'js/domain/eventRules.js'), 'utf8');
    vm.runInContext(eventRulesSource, eventCtx);
    const rules = eventCtx.Game.domain.event;
    vm.runInContext('Math.random = () => 0.1', eventCtx);
    const neutralDraw = rules.drawEvent(copy(json.events));
    check(neutralDraw && neutralDraw.id === 'e6', 'metade das vezes, o sorteio deveria dar o evento `neutral` (e6), deu: ' + JSON.stringify(neutralDraw));
    vm.runInContext('Math.random = () => 0.99', eventCtx);
    const otherDraw = rules.drawEvent(copy(json.events));
    check(otherDraw && otherDraw.id === 'e5', 'na outra metade, um dos outros cinco (com 0.99, o último: e5), deu: ' + JSON.stringify(otherDraw));
    const ps = [{ name: 'X', resources: 3 }, { name: 'Y', resources: 1 }];
    const steps = [['e1', [4, 2]], ['e2', [3, 1]], ['e3', [3, 2]], ['e5', [2, 3]], ['e4', [2, 3]], ['e6', [2, 3]]];
    for (const [id, [x, y]] of steps) {
        rules.applyEventEffects(byId(id), ps);
        check(ps[0].resources === x && ps[1].resources === y,
            'o evento ' + id + ' deveria deixar os recursos em ' + x + ' e ' + y + ', veio: ' + JSON.stringify(ps));
    }

    // 3) Partida com as regras reais: o sorteio usa questionsData.events e o
    // evento vai inteiro nas mensagens e na rodada.
    vm.runInContext(eventRulesSource, env.ctx);
    const realDraw = env.Game.domain.event.drawEvent;
    const drawnFrom = [];
    env.Game.domain.event.drawEvent = (list) => { drawnFrom.push(list); return realDraw(list); };
    env.state.questionsData = { domains: { d1: { name: 'Domínio de teste' } }, events: copy(json.events) };
    const time = env.fakeTime();
    // Sorteio fixo: evento e5; A pergunta, B responde, o host assiste.
    vm.runInContext('Math.random = () => 0.99', env.ctx);
    env.createRoomAsHost();
    env.join('A', 'peer-a');
    env.join('B', 'peer-b');
    env.startMatch();
    check(drawnFrom.length === 1 && drawnFrom[0] === env.state.questionsData.events,
        'a rodada nova deveria sortear o evento de questionsData.events, sorteou de: ' + JSON.stringify(drawnFrom));
    const e5 = byId('e5');
    const shown = env.broadcastsOfType('show-event')[0];
    const rs = env.broadcastsOfType('round-start').pop();
    check(shown && fields(shown.event) === fields(e5) && rs && fields(rs.event) === fields(e5) &&
        env.state.currentRound && fields(env.state.currentRound.event) === fields(e5),
        'show-event, round-start e a rodada deveriam levar o evento e5 inteiro, veio: ' + JSON.stringify({ shown: shown && shown.event, rs: rs && rs.event }));

    // 4) Reserva de contingência (answerEngine real): quem erra não perde recurso; sem ela, perde.
    const wrongFor = (round) => ['A', 'B', 'C', 'D'].find(x => x !== round.question.correct);
    env.state.currentRound.event = byId('e4');
    const first = env.state.currentRound.answerer;
    env.Game.core.handleAnswer({ type: 'answer', alternative: wrongFor(env.state.currentRound), playerName: first });
    check(env.state.currentRound.answered === true && env.player(first).resources === C.STARTING_RESOURCES,
        'com a reserva de contingência (contingencyReserve), errar não deveria gastar recurso, veio: ' + env.player(first).resources);
    time.advance(3000);
    const round2 = env.state.currentRound;
    check(round2 && !round2.answered && round2.answerer !== first, 'pré-condição: próxima dupla, com outro Respondedor');
    round2.event = byId('e1');
    env.Game.core.handleAnswer({ type: 'answer', alternative: wrongFor(round2), playerName: round2.answerer });
    check(env.player(round2.answerer).resources === C.STARTING_RESOURCES - 1,
        'sem a reserva, errar deveria gastar 1 recurso, veio: ' + env.player(round2.answerer).resources);

    // Estado salvo com o evento da rodada nos nomes novos.
    env.Game.saveState();
    const saved = JSON.parse(env.storage['pmKPI_roomState']);
    check(saved.stateVersion >= 5 && saved.currentRound && fields(saved.currentRound.event) === fields(byId('e1')),
        'o estado salvo deveria ficar na versão 5 ou mais, com o evento da rodada nos nomes novos, veio: ' + JSON.stringify(saved.currentRound && saved.currentRound.event));

    // Dupla sem evento (pickNewPair sem argumento) também sorteia de questionsData.events.
    env.Game.engine.turn.pickNewPair();
    check(drawnFrom.length === 2 && drawnFrom[1] === env.state.questionsData.events,
        'a dupla sem evento deveria sortear de questionsData.events, sorteou de: ' + JSON.stringify(drawnFrom.slice(1)));

    // 5) Telas reais: modal do evento e cartão do evento na rodada.
    const screens = guestWithScreens(use, env, 'B', ['js/ui/modals/eventModal.js', 'js/ui/components/questionComponent.js']);
    const e4 = byId('e4');
    screens.guest.ctx.showEventModal(e4);
    check(screens.elements.eventModalTitle.textContent === e4.title && screens.elements.eventModalDesc.textContent === e4.description,
        'o modal do evento deveria mostrar title e description, veio: ' + JSON.stringify([screens.elements.eventModalTitle.textContent, screens.elements.eventModalDesc.textContent]));
    screens.guest.state.currentRound = { event: e4, asker: 'A', answerer: 'B', question: null, answered: false };
    screens.guest.ctx.displayRoundStart();
    check(screens.elements.eventCard.style.display === 'flex' &&
        screens.elements.eventTitle.textContent === e4.title && screens.elements.eventDesc.textContent === e4.description,
        'o cartão do evento na rodada deveria mostrar title e description, veio: ' + JSON.stringify([screens.elements.eventTitle.textContent, screens.elements.eventDesc.textContent]));

    // 6) Nada com os nomes antigos nas mensagens, no estado e no estado salvo.
    const messages = [...env.record.broadcasts, ...env.record.sent.map(e => e.msg)];
    const found = oldEventNamesIn([messages, env.state, saved]);
    check(found.length === 0, 'nenhum nome antigo deveria sobrar nas mensagens e no estado, sobraram: ' + found.join(', '));

    // 7) Código do jogo: nenhum nome antigo de evento como campo (`.titulo`,
    // `titulo:` ou entre aspas); o main.js monta questionsData.events do events.json.
    // Fica de fora só a migração do estado salvo, que precisa dos nomes
    // antigos (conferida na parte 8).
    const jsFiles = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap(d =>
        d.isDirectory() ? jsFiles(path.join(dir, d.name)) : (d.name.endsWith('.js') ? [path.join(dir, d.name)] : []));
    const inCode = [];
    const migrationFile = path.join(ROOT, 'js/utils/persistence.js');
    for (const file of jsFiles(path.join(ROOT, 'js')).filter(f => f !== migrationFile)) {
        const source = fs.readFileSync(file, 'utf8');
        for (const name of OLD_EVENT_NAMES) {
            if (new RegExp('\\.' + name + '\\b|\\b' + name + '\\s*:|[\'"]' + name + '[\'"]').test(source)) {
                inCode.push(path.relative(ROOT, file).replace(/\\/g, '/') + ': ' + name);
            }
        }
    }
    check(inCode.length === 0, 'o código do jogo não deveria usar os nomes antigos dos eventos, usa: ' + inCode.join('; '));
    check(fs.readFileSync(path.join(ROOT, 'js/main.js'), 'utf8').includes('eventsJson.events'),
        'o main.js deveria montar questionsData.events a partir de eventsJson.events');

    // 8) Estado salvo 4 → 5: o evento da rodada e o da pausa passam para os
    // nomes novos, com os mesmos valores (cada um dos seis eventos).
    const P = env.Game.persistence;
    const oldName = {
        title: 'titulo', description: 'descricao', resourcesForAll: 'recursos_todos', resourcesForFewest: 'recursos_menos',
        resourceSwap: 'troca_recursos', contingencyReserve: 'reserva_contingencia', neutral: 'neutro'
    };
    const oldFormat = (ev) => Object.fromEntries(Object.entries(ev).map(([k, v]) => [oldName[k] || k, v]));
    for (const ev of json.events) {
        const v4 = savedStateV4({ matchPaused: { event: oldFormat(ev) } });
        v4.roomState.currentRound.event = oldFormat(ev);
        const input = copy(v4);
        const where = ' (' + ev.id + ')';
        const r = P.migrateSavedState(v4.roomState, v4.myData, 5);
        const s = r.roomState;
        check(s.stateVersion === 5, 'o estado migrado deveria estar na versão 5' + where + ', veio: ' + s.stateVersion);
        check(oldEventNamesIn(r).length === 0, 'nenhum nome antigo deveria sobrar' + where + ', sobraram: ' + oldEventNamesIn(r).join(', '));
        check(fields(s.currentRound.event) === fields(ev), 'evento da rodada nos nomes novos, com os mesmos valores' + where + ', veio: ' + JSON.stringify(s.currentRound.event));
        check(s.matchPaused && Object.keys(s.matchPaused).length === 1 && fields(s.matchPaused.event) === fields(ev),
            'evento da pausa nos nomes novos, com os mesmos valores' + where + ', veio: ' + JSON.stringify(s.matchPaused));
        const { event: migratedEvent, ...roundRest } = s.currentRound;
        const { event: inputEvent, ...inputRoundRest } = input.roomState.currentRound;
        check(fields(roundRest) === fields(inputRoundRest), 'o resto da rodada não deveria mudar' + where + ', veio: ' + JSON.stringify(roundRest));
        for (const key of Object.keys(input.roomState).filter(k => !['currentRound', 'matchPaused', 'stateVersion'].includes(k))) {
            check(JSON.stringify(s[key]) === JSON.stringify(input.roomState[key]), key + ' não deveria mudar' + where + ', veio: ' + JSON.stringify(s[key]));
        }
        check(Object.keys(s).length === Object.keys(input.roomState).length,
            'nenhum campo do estado deveria ser criado nem perdido' + where + ', veio: ' + Object.keys(s).join(', '));
        check(JSON.stringify(r.myData) === JSON.stringify(input.myData), 'pmKPI_myData não muda nesta versão' + where);
    }

    // Sem rodada e sem pausa; rodada sem evento; estado sem os campos.
    const empty = P.migrateSavedState(savedStateV4({ currentRound: null }).roomState, {}, 5).roomState;
    check(empty.currentRound === null && empty.matchPaused === null && empty.stateVersion === 5,
        'sem rodada e sem pausa, continuam vazios, veio: ' + JSON.stringify({ currentRound: empty.currentRound, matchPaused: empty.matchPaused }));
    const noEvent = savedStateV4();
    delete noEvent.roomState.currentRound.event;
    const rn = P.migrateSavedState(noEvent.roomState, noEvent.myData, 5).roomState.currentRound;
    check(!('event' in rn) && rn.answerer === 'A', 'rodada sem evento não deveria ganhar o campo, veio: ' + JSON.stringify(rn));
    const bare = P.migrateSavedState({ stateVersion: 4, roomName: 'sala' }, {}, 5).roomState;
    check(bare.roomName === 'sala' && bare.stateVersion === 5 && !('currentRound' in bare) && !('matchPaused' in bare),
        'estado da versão 4 sem rodada nem pausa deveria migrar sem erro, veio: ' + JSON.stringify(bare));

    // Da versão 1 até a atual: todos os passos, sem nenhum nome antigo.
    const v1 = savedStateV1({ partidaPausada: { evento: { id: 'e6', titulo: 'Operação Normal', neutro: true } } });
    const all = P.migrateSavedState(v1.roomState, v1.myData);
    const leftovers = [...oldNamesIn(all), ...oldPlayerNamesIn(all), ...oldAdvisoryNamesIn(all), ...oldEventNamesIn(all)];
    check(all.roomState.stateVersion === P.STATE_VERSION && leftovers.length === 0,
        'da versão 1, deveria chegar à atual (' + P.STATE_VERSION + ') sem nomes antigos, sobraram: ' + leftovers.join(', '));
    check(all.roomState.currentRound.event.title === 'Evento salvo' &&
        all.roomState.matchPaused.event.title === 'Operação Normal' && all.roomState.matchPaused.event.neutral === true,
        'da versão 1, os eventos deveriam chegar com os mesmos valores, veio: ' + JSON.stringify([all.roomState.currentRound.event, all.roomState.matchPaused]));

    // 9) F5 do host com o estado salvo na versão 4: a reserva da rodada continua valendo.
    const old = use(createEnvironment());
    roomToReload(old);
    const v4 = savedStateV4();
    old.storage['pmKPI_roomState'] = JSON.stringify(v4.roomState);
    old.storage['pmKPI_myData'] = JSON.stringify(v4.myData);
    const reloaded = use(reloadHost(old));
    const restoredEvent = reloaded.state.currentRound && reloaded.state.currentRound.event;
    check(restoredEvent && restoredEvent.title === 'Reserva de Contingência' && restoredEvent.contingencyReserve === true,
        'o F5 deveria restaurar o evento da rodada nos nomes novos, veio: ' + JSON.stringify(restoredEvent));
    reloaded.Game.core.handleAnswer({ type: 'answer', alternative: 'a', playerName: 'A' });
    check(reloaded.state.currentRound.answered === true && reloaded.player('A').resources === 7,
        'A errou com a reserva de contingência salva antes da atualização: não deveria gastar recurso, veio: ' + reloaded.player('A').resources);
    reloaded.Game.saveState();
    const resaved = JSON.parse(old.storage['pmKPI_roomState']);
    check(resaved.stateVersion >= 5 && resaved.currentRound.event.contingencyReserve === true && oldEventNamesIn(resaved).length === 0,
        'ao salvar de novo, o evento deveria ficar na versão 5 ou mais, com os nomes novos, veio: ' + JSON.stringify(resaved.currentRound.event));
});

test('T90 Versão do jogo 6: áreas foco com os IDs novos (initiating...) no CONFIG, no JSON das perguntas (focusAreas), no sorteio, no estado salvo e nas mensagens', (use) => {
    const env = use(createEnvironment());
    check(env.Game.network.PROTOCOL_VERSION >= 6, 'a versão do protocolo deveria ser 6 ou mais (IDs novos das áreas foco), veio: ' + env.Game.network.PROTOCOL_VERSION);
    check(env.Game.persistence.STATE_VERSION === 6, 'a versão do estado salvo deveria ser 6 (IDs novos das áreas foco), veio: ' + env.Game.persistence.STATE_VERSION);
    const copy = (x) => JSON.parse(JSON.stringify(x));
    /** Mesmos campos e valores, em qualquer ordem. */
    const fields = (o) => JSON.stringify(Object.entries(o || {}).sort());
    const newId = {
        iniciacao: 'initiating', planejamento: 'planning', execucao: 'executing',
        monitoramento_controle: 'monitoringControlling', encerramento: 'closing'
    };
    const newIds = Object.values(newId);
    check(JSON.stringify(Object.keys(newId)) === JSON.stringify(OLD_FOCUS_AREA_IDS), 'pré-condição: a tabela do teste cobre OLD_FOCUS_AREA_IDS');

    // 1) CONFIG real: os cinco IDs novos, na ordem, com os mesmos nomes e
    // emojis; o CONFIG de teste usa os dois primeiros.
    const configCtx = vm.createContext({});
    vm.runInContext('var window = this;' + fs.readFileSync(path.join(ROOT, 'config/game-config.js'), 'utf8'), configCtx);
    const expectedAreas = [
        { id: 'initiating', name: 'Iniciação', emoji: '🚀' },
        { id: 'planning', name: 'Planejamento', emoji: '📋' },
        { id: 'executing', name: 'Execução', emoji: '⚙️' },
        { id: 'monitoringControlling', name: 'Monitoramento e Controle', emoji: '📊' },
        { id: 'closing', name: 'Encerramento', emoji: '🏁' }
    ];
    const realAreas = vm.runInContext('CONFIG.FOCUS_AREAS', configCtx);
    check(JSON.stringify(realAreas) === JSON.stringify(expectedAreas),
        'CONFIG.FOCUS_AREAS deveria ter os IDs novos, com os mesmos nomes e emojis, veio: ' + JSON.stringify(realAreas));
    check(JSON.stringify(env.CONFIG.FOCUS_AREAS.map(f => f.id)) === '["initiating","planning"]',
        'o CONFIG de teste deveria usar os IDs novos, veio: ' + JSON.stringify(env.CONFIG.FOCUS_AREAS));

    // 2) data/questions.pt-BR.json: cada domínio com `focusAreas` (sem
    // `areas`), com as mesmas áreas de antes nos IDs novos.
    const raw = fs.readFileSync(path.join(ROOT, 'data/questions.pt-BR.json'), 'utf8');
    const json = JSON.parse(raw);
    const expectedDomains = {
        governance: newIds,
        scope: ['planning', 'monitoringControlling'],
        schedule: ['planning', 'monitoringControlling'],
        finance: ['planning', 'monitoringControlling'],
        stakeholders: ['initiating', 'planning', 'executing', 'monitoringControlling'],
        resources: ['planning', 'executing', 'monitoringControlling'],
        risks: ['planning', 'executing', 'monitoringControlling']
    };
    check(JSON.stringify(Object.keys(json.domains)) === JSON.stringify(Object.keys(expectedDomains)),
        'os domínios do JSON deveriam continuar os mesmos, veio: ' + Object.keys(json.domains).join(', '));
    for (const [key, list] of Object.entries(expectedDomains)) {
        const d = json.domains[key];
        check(JSON.stringify(Object.keys(d)) === '["name","focusAreas","questions"]',
            key + ': deveria ter só name, focusAreas e questions, veio: ' + Object.keys(d).join(', '));
        check(JSON.stringify(d.focusAreas) === JSON.stringify(list),
            key + ': focusAreas deveria ser ' + JSON.stringify(list) + ', veio: ' + JSON.stringify(d.focusAreas));
    }
    const oldInJson = OLD_FOCUS_AREA_IDS.filter(id => raw.includes('"' + id + '"'));
    check(oldInJson.length === 0, 'o JSON das perguntas não deveria ter IDs antigos, tem: ' + oldInJson.join(', '));

    // 3) Sorteio real (domain/deckRules.js) com o JSON real: cada área foco
    // nova sorteia só dos seus domínios; um ID antigo não sorteia nada.
    const deckCtx = vm.createContext({});
    vm.runInContext('var window = this;', deckCtx);
    vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/domain/deckRules.js'), 'utf8'), deckCtx);
    const deckRules = deckCtx.Game.domain.deck;
    const newDecks = () => Object.fromEntries(Object.entries(json.domains).map(([k, d]) =>
        [k, { questions: d.questions.map(q => ({ ...q, used: false })), available: d.questions.length, total: d.questions.length }]));
    for (const id of newIds) {
        const allowed = Object.keys(expectedDomains).filter(k => expectedDomains[k].includes(id));
        const decks = newDecks();
        for (let i = 0; i < 30; i++) {
            const q = deckRules.drawQuestion(decks, json, id);
            check(q && allowed.includes(q.domain_key), 'a área foco ' + id + ' deveria sortear de ' + allowed.join(', ') + ', veio: ' + JSON.stringify(q && q.domain_key));
        }
    }
    for (const id of OLD_FOCUS_AREA_IDS) {
        check(deckRules.drawQuestion(newDecks(), json, id) === null, 'o ID antigo ' + id + ' não deveria sortear pergunta');
    }

    // 4) Código do jogo e config: nenhum ID antigo entre aspas e nenhum
    // campo `areas` (`.areas`, `areas:` ou entre aspas). Fica de fora só a
    // migração do estado salvo, que precisa dos IDs antigos (parte 6).
    const jsFiles = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap(d =>
        d.isDirectory() ? jsFiles(path.join(dir, d.name)) : (d.name.endsWith('.js') ? [path.join(dir, d.name)] : []));
    const migrationFile = path.join(ROOT, 'js/utils/persistence.js');
    const inCode = [];
    for (const file of [...jsFiles(path.join(ROOT, 'js')).filter(f => f !== migrationFile), path.join(ROOT, 'config/game-config.js')]) {
        const source = fs.readFileSync(file, 'utf8');
        const where = path.relative(ROOT, file).replace(/\\/g, '/');
        for (const id of OLD_FOCUS_AREA_IDS) {
            if (new RegExp('[\'"]' + id + '[\'"]').test(source)) inCode.push(where + ': ' + id);
        }
        if (/\.areas\b|\bareas\s*:|['"]areas['"]/.test(source)) inCode.push(where + ': areas');
    }
    check(inCode.length === 0, 'o código do jogo não deveria usar os IDs antigos nem o campo areas, usa: ' + inCode.join('; '));

    // 5) Partida com as regras reais de KPI: todos entram na primeira área
    // foco; quem completa as atividades passa para a seguinte.
    env.fakeTime();
    // Sorteio fixo: A pergunta, B responde, o host assiste.
    vm.runInContext('Math.random = () => 0.99', env.ctx);
    env.createRoomAsHost();
    env.join('A', 'peer-a');
    env.join('B', 'peer-b');
    const list = env.broadcastsOfType('player-list').pop();
    check(list && list.players.length === 3 && list.players.every(p => p.focusArea === 'initiating'),
        'todos deveriam entrar em initiating, veio: ' + JSON.stringify(list && list.players));
    env.startMatch();
    const round = env.state.currentRound;
    check(round && round.answerer === 'B' && round.question.area === 'Iniciação',
        'a pergunta de B deveria ter a etiqueta da área foco dele (Iniciação), veio: ' + JSON.stringify(round && round.question));
    env.player('B').activities = 1;
    env.Game.network.handleMessage({ type: 'answer', alternative: round.question.correct, playerName: 'B' }, 'peer-b');
    const kpi = env.broadcastsOfType('kpi-update').find(m => m.playerName === 'B');
    check(kpi && kpi.isCorrect === true && kpi.focusArea === 'planning' && kpi.activities === 0 && env.player('B').focusArea === 'planning',
        'completando as atividades, B deveria passar de initiating para planning, veio: ' + JSON.stringify(kpi));
    env.Game.saveState();
    const saved = JSON.parse(env.storage['pmKPI_roomState']);
    const mine = JSON.parse(env.storage['pmKPI_myData']);
    check(saved.stateVersion === 6 && saved.players.find(p => p.name === 'B').focusArea === 'planning' && mine.focusArea === 'initiating',
        'o estado salvo deveria ficar na versão 6, com os IDs novos, veio: ' + JSON.stringify({ v: saved.stateVersion, players: saved.players, mine }));
    const messages = [...env.record.broadcasts, ...env.record.sent.map(e => e.msg)];
    const found = oldFocusAreaIdsIn([messages, env.state, saved, mine]);
    check(found.length === 0, 'nenhum ID antigo deveria sobrar nas mensagens e no estado, sobraram: ' + found.join(', '));

    // 6) Estado salvo 5 → 6: cada ID antigo vira o novo, nos jogadores, no
    // ranking final e no pmKPI_myData; o resto não muda.
    const P = env.Game.persistence;
    /** Estado na versão 5 (savedStateV4 migrado até a 5), com a área foco `old` em todos e o ranking final. */
    function savedStateV5(old) {
        const v4 = savedStateV4();
        const v5 = P.migrateSavedState(v4.roomState, v4.myData, 5);
        v5.roomState.players.forEach(p => { p.focusArea = old; });
        v5.roomState.finalRanking = [
            { position: 1, name: 'B', kpi: 30, resources: 4, finalKpi: 38, focusArea: old, activities: 0, isHost: false, waitingInLobby: false },
            { position: 2, name: 'Host', kpi: 20, resources: 9, finalKpi: 38, focusArea: old, activities: 1, isHost: true, waitingInLobby: false }
        ];
        v5.myData.focusArea = old;
        return v5;
    }
    for (const old of OLD_FOCUS_AREA_IDS) {
        const v5 = savedStateV5(old);
        check(v5.roomState.stateVersion === 5, 'pré-condição: estado na versão 5');
        const input = copy(v5);
        const r = P.migrateSavedState(v5.roomState, v5.myData, 6);
        const s = r.roomState;
        const where = ' (' + old + ' → ' + newId[old] + ')';
        check(s.stateVersion === 6, 'o estado migrado deveria estar na versão 6' + where + ', veio: ' + s.stateVersion);
        check(oldFocusAreaIdsIn(r).length === 0, 'nenhum ID antigo deveria sobrar' + where + ', sobraram: ' + oldFocusAreaIdsIn(r).join(', '));
        input.roomState.players.forEach((p, i) => {
            check(fields(s.players[i]) === fields({ ...p, focusArea: newId[old] }), 'jogador ' + p.name + ': só a área foco muda' + where + ', veio: ' + JSON.stringify(s.players[i]));
        });
        input.roomState.finalRanking.forEach((p, i) => {
            check(fields(s.finalRanking[i]) === fields({ ...p, focusArea: newId[old] }), 'ranking (' + p.name + '): só a área foco muda' + where + ', veio: ' + JSON.stringify(s.finalRanking[i]));
        });
        check(s.players.length === input.roomState.players.length && s.finalRanking.length === input.roomState.finalRanking.length,
            'nenhum jogador deveria ser criado nem perdido' + where);
        check(fields(r.myData) === fields({ ...input.myData, focusArea: newId[old] }), 'pmKPI_myData: só a área foco muda' + where + ', veio: ' + JSON.stringify(r.myData));
        for (const key of Object.keys(input.roomState).filter(k => !['players', 'finalRanking', 'stateVersion'].includes(k))) {
            check(JSON.stringify(s[key]) === JSON.stringify(input.roomState[key]), key + ' não deveria mudar' + where + ', veio: ' + JSON.stringify(s[key]));
        }
        check(Object.keys(s).length === Object.keys(input.roomState).length,
            'nenhum campo do estado deveria ser criado nem perdido' + where + ', veio: ' + Object.keys(s).join(', '));
    }

    // Valor desconhecido ou já novo continua igual; sem o campo, continua sem.
    const mixed = savedStateV5('iniciacao');
    mixed.roomState.players[0].focusArea = 'outra-area';
    mixed.roomState.players[1].focusArea = 'planning';
    delete mixed.roomState.players[2].focusArea;
    mixed.roomState.finalRanking = null;
    delete mixed.myData.focusArea;
    const rm = P.migrateSavedState(mixed.roomState, mixed.myData, 6);
    check(rm.roomState.players[0].focusArea === 'outra-area' && rm.roomState.players[1].focusArea === 'planning' &&
        !('focusArea' in rm.roomState.players[2]) && rm.roomState.finalRanking === null && !('focusArea' in rm.myData),
        'valor desconhecido, ID novo e campo ausente deveriam continuar como estão, veio: ' + JSON.stringify(rm));
    const bare = P.migrateSavedState({ stateVersion: 5, roomName: 'sala' }, {}, 6);
    check(bare.roomState.roomName === 'sala' && bare.roomState.stateVersion === 6 && !('players' in bare.roomState) &&
        !('finalRanking' in bare.roomState) && fields(bare.myData) === '[]',
        'estado da versão 5 sem jogadores nem ranking deveria migrar sem erro, veio: ' + JSON.stringify(bare));

    // Da versão 1 até a atual: todos os passos, sem nenhum nome ou ID antigo.
    const v1 = savedStateV1({ rankingFinal: finalRankingV2() });
    const all = P.migrateSavedState(v1.roomState, v1.myData);
    const leftovers = [...oldNamesIn(all), ...oldPlayerNamesIn(all), ...oldAdvisoryNamesIn(all), ...oldEventNamesIn(all), ...oldFocusAreaIdsIn(all)];
    check(all.roomState.stateVersion === P.STATE_VERSION && leftovers.length === 0,
        'da versão 1, deveria chegar à atual (' + P.STATE_VERSION + ') sem nomes nem IDs antigos, sobraram: ' + leftovers.join(', '));
    check(all.roomState.players.every(p => p.focusArea === 'initiating') && all.roomState.finalRanking.every(p => p.focusArea === 'initiating') &&
        all.myData.focusArea === 'initiating',
        'da versão 1, as áreas foco deveriam chegar como initiating, veio: ' + JSON.stringify({ players: all.roomState.players, ranking: all.roomState.finalRanking, myData: all.myData }));

    // 7) F5 do host com o estado salvo na versão 5: A (iniciacao, 1
    // atividade) acerta e passa para a área seguinte, como sem a atualização.
    const old = use(createEnvironment());
    roomToReload(old);
    const v4 = savedStateV4();
    const stored = P.migrateSavedState(v4.roomState, v4.myData, 5);
    check(stored.roomState.players.find(p => p.name === 'A').focusArea === 'iniciacao' && stored.myData.focusArea === 'iniciacao',
        'pré-condição: estado da versão 5 com os IDs antigos');
    old.storage['pmKPI_roomState'] = JSON.stringify(stored.roomState);
    old.storage['pmKPI_myData'] = JSON.stringify(stored.myData);
    const reloaded = use(reloadHost(old));
    check(reloaded.player('A').focusArea === 'initiating' && reloaded.player('A').activities === 1 && reloaded.player('Host').focusArea === 'initiating',
        'o F5 deveria restaurar as áreas foco com os IDs novos, veio: ' + JSON.stringify(reloaded.state.players));
    reloaded.Game.core.handleAnswer({ type: 'answer', alternative: 'b', playerName: 'A' });
    const kpiA = reloaded.broadcastsOfType('kpi-update').find(m => m.playerName === 'A');
    check(kpiA && kpiA.isCorrect === true && kpiA.focusArea === 'planning' && kpiA.activities === 0 && reloaded.player('A').focusArea === 'planning',
        'A acertou com 1 atividade salva antes da atualização: deveria passar para planning, veio: ' + JSON.stringify(kpiA));
    reloaded.Game.saveState();
    const resaved = JSON.parse(old.storage['pmKPI_roomState']);
    const remine = JSON.parse(old.storage['pmKPI_myData']);
    check(resaved.stateVersion === 6 && oldFocusAreaIdsIn([resaved, remine]).length === 0 && remine.focusArea === 'initiating',
        'ao salvar de novo, o estado deveria ficar na versão 6 sem IDs antigos, veio: ' + JSON.stringify({ players: resaved.players, mine: remine }));
});

/**
 * D3c: carrega a tela inicial (hostSearch.js + roomEntry.js, como o
 * index.html) com DOM, PeerJS e timers falsos.
 */
function createHomeScreen() {
    const elements = {};
    const element = (id) => {
        if (!elements[id]) {
            const handlers = {};
            elements[id] = {
                id, value: '', textContent: '', className: '', style: {}, offsetHeight: 0,
                focus: () => {},
                addEventListener: (ev, fn) => { handlers[ev] = fn; },
                click: () => handlers.click && handlers.click()
            };
        }
        return elements[id];
    };
    const feedbacks = [];
    let now = 0;
    const queue = [];
    const peers = [];
    const ctx = vm.createContext({
        console: { log: () => {}, warn: () => {}, error: () => {}, info: () => {} },
        document: { getElementById: element, execCommand: () => {}, createRange: () => ({ selectNode: () => {} }) },
        getSelection: () => ({ removeAllRanges: () => {}, addRange: () => {} }),
        location: { href: 'index.html' },
        URLSearchParams,
        setTimeout: (fn, ms) => { queue.push({ fn, at: now + (ms || 0) }); return queue.length; },
        clearTimeout: () => {},
        Peer: function (id, options) {
            // new Peer(options) (sem ID) também é aceito pelo PeerJS.
            if (id && typeof id === 'object') { options = id; id = undefined; }
            const handlers = {};
            this.id = id;
            this.destroyed = false;
            this.requests = {};
            this.on = (ev, cb) => { handlers[ev] = cb; };
            this.destroy = () => { this.destroyed = true; };
            this.connect = (target) => {
                const h = {};
                const c = { peer: target, open: false, closed: false, on: (ev, cb) => { h[ev] = cb; }, close() { c.closed = true; }, fire: (ev) => h[ev] && h[ev]() };
                this.requests[target] = c;
                return c;
            };
            this.fire = (ev, arg) => handlers[ev] && handlers[ev](arg);
            peers.push(this);
        }
    });
    vm.runInContext('var window = this;' + fs.readFileSync(path.join(ROOT, 'config/game-config.js'), 'utf8'), ctx);
    vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/network/hostSearch.js'), 'utf8'), ctx, { filename: 'hostSearch.js' });
    vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/entry/roomEntry.js'), 'utf8'), ctx, { filename: 'roomEntry.js' });
    const prefix = vm.runInContext('CONFIG.ROOM_PREFIX', ctx);

    // Guarda cada mensagem mostrada (roomEntry sobrescreve textContent).
    ['joinFeedback', 'createFeedback'].forEach(id => {
        const el = element(id);
        let text = '';
        Object.defineProperty(el, 'textContent', { get: () => text, set: (v) => { text = v; feedbacks.push({ where: id, text: v }); } });
    });

    return {
        ctx, element, feedbacks, peers, prefix,
        advance(ms) {
            const end = now + ms;
            for (;;) {
                queue.sort((a, b) => a.at - b.at);
                if (!queue.length || queue[0].at > end) break;
                const t = queue.shift();
                now = t.at;
                t.fn();
            }
            now = end;
        },
        /** Todas as versões pedidas pelo peer, menos `existing`, respondem "não existe". */
        answerUnavailable(peer, existing = []) {
            Object.keys(peer.requests).filter(d => !existing.includes(d)).forEach(d => peer.fire('error', unavailable(d)));
        }
    };
}

test('T47 Tela inicial: entrar acha a sala migrada; criar recusa código de partida migrada; mensagens certas', (use) => {
    // Entrar com o código 001 depois de uma migração (sala em ...-001-h1).
    const screen = createHomeScreen();
    const base = screen.prefix + '001';
    screen.element('joinPlayerName').value = 'Vini';
    screen.element('joinRoomSuffix').value = '001';
    screen.element('btnJoinRoom').click();
    const testPeer1 = screen.peers[0];
    testPeer1.fire('open', 'peer-teste');
    check(testPeer1.requests[base] && testPeer1.requests[base + '-h1'], 'deveria procurar o ID base e as versões migradas');
    screen.answerUnavailable(testPeer1, [base + '-h1']);
    testPeer1.requests[base + '-h1'].fire('open');
    check(screen.feedbacks.some(f => f.text.includes('Sala encontrada')), 'deveria achar a sala migrada');
    screen.advance(2000);
    const target = new URL('https://x/' + screen.ctx.location.href).searchParams;
    check(screen.ctx.location.href.startsWith('game.html?') && target.get('host') === 'false' && target.get('peerId') === base && target.get('room') === base,
        'deveria ir para o jogo com o ID base da sala, foi para: ' + screen.ctx.location.href);
    check(testPeer1.destroyed, 'o peer de teste deveria ser encerrado');

    // Código que não existe em versão nenhuma: uma mensagem só, a certa.
    const screen2 = createHomeScreen();
    screen2.element('joinPlayerName').value = 'Vini';
    screen2.element('joinRoomSuffix').value = '999';
    screen2.element('btnJoinRoom').click();
    screen2.peers[0].fire('open', 'peer-teste');
    screen2.answerUnavailable(screen2.peers[0]);
    screen2.advance(20000);
    const errors2 = screen2.feedbacks.filter(f => f.where === 'joinFeedback' && f.text.startsWith('⚠️'));
    check(errors2.length === 1 && errors2[0].text.includes('Sala não encontrada'),
        'deveria mostrar só "Sala não encontrada", mostrou: ' + errors2.map(f => f.text).join(' | '));
    check(screen2.ctx.location.href === 'index.html', 'não deveria sair da tela inicial');

    // Erro de rede no meio da procura: "Erro de conexão", uma vez, e a procura para.
    const screen5 = createHomeScreen();
    screen5.element('joinPlayerName').value = 'Vini';
    screen5.element('joinRoomSuffix').value = '001';
    screen5.element('btnJoinRoom').click();
    const testPeer5 = screen5.peers[0];
    testPeer5.fire('open', 'peer-teste');
    testPeer5.fire('error', { type: 'network', message: 'Lost connection to server.' });
    check(Object.values(testPeer5.requests).every(c => c.closed), 'a procura deveria parar na hora (conexões fechadas)');
    screen5.advance(20000);
    const errors5 = screen5.feedbacks.filter(f => f.text.startsWith('⚠️'));
    check(errors5.length === 1 && errors5[0].text.includes('Erro de conexão'), 'deveria mostrar só "Erro de conexão", mostrou: ' + errors5.map(f => f.text).join(' | '));

    // Criar 001 enquanto a partida continua em ...-001-h1: código em uso.
    const screen3 = createHomeScreen();
    screen3.element('createPlayerName').value = 'Outra';
    screen3.element('createRoomId').value = '001';
    screen3.element('btnCreateRoom').click();
    const testPeer3 = screen3.peers[0];
    check(testPeer3.id === base, 'pré-condição: criar reserva o ID base');
    testPeer3.fire('open', base);
    check(!testPeer3.requests[base] && testPeer3.requests[base + '-h1'], 'deveria procurar as versões migradas (não a própria)');
    testPeer3.requests[base + '-h1'].fire('open');
    check(screen3.feedbacks.some(f => f.text.includes('já está em uso')), 'deveria recusar o código de uma partida migrada');
    check(screen3.element('screenCreated').style.display !== 'block', 'não deveria ir para a tela de sala criada');
    check(testPeer3.destroyed, 'deveria liberar o ID base reservado');

    // Criar código livre: nenhuma versão existe → sala criada.
    const screen4 = createHomeScreen();
    screen4.element('createPlayerName').value = 'Outra';
    screen4.element('createRoomId').value = '002';
    screen4.element('btnCreateRoom').click();
    screen4.peers[0].fire('open', screen4.prefix + '002');
    screen4.answerUnavailable(screen4.peers[0]);
    check(screen4.element('screenCreated').style.display === 'block', 'código livre deveria criar a sala');
    check(!screen4.feedbacks.some(f => f.text.startsWith('⚠️')), 'sem mensagem de erro');
    check(screen4.peers[0].destroyed, 'o peer de teste deveria ser liberado antes de entrar no jogo');
});

finish('Entrada na sala e identidade');
