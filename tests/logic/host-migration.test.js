// ============================================
// PM: The KPI Master - Testes de lógica: Troca de host
// ============================================
// Queda do host e troca: prazo de 10s, backup que assume, host antigo
// que volta como jogador comum, procura da sala nas versões -h1, -h2...,
// opções do PeerJS e o rodízio da rodada depois da troca.
// Ambiente simulado e ajudantes: environment.js. Rodar a partir da raiz:
//     node tests/logic/host-migration.test.js
// ============================================

const {
    fs, path, vm, ROOT, createEnvironment, tokenOf, test, check, start, finish,
    syncTo, roundScreens, unavailable, roomToReload, reloadHost, tryReloadHost, recordScreens
} = require('./environment');

start('Troca de host');

test('T10 Migração: backup desconectado é pulado, próximo assume', (use) => {
    // Visão do guest B: lista [Host, A (desconectado), B].
    const env = use(createEnvironment());
    env.state.isHost = false;
    env.state.playerName = 'B';
    env.state.players = [
        { name: 'Host', peerId: 'peer-host', isHost: true },
        { name: 'A', peerId: 'peer-a', isHost: false, disconnected: true },
        { name: 'B', peerId: 'peer-b', isHost: false }
    ];
    env.ctx.decideHostTakeoverOrReconnectNewVersion();
    check(env.record.spies.becomeHost === 1, 'B deveria assumir como host');

    // Controle: com A conectado, B NÃO assume (A é o backup).
    const env2 = use(createEnvironment());
    env2.state.isHost = false;
    env2.state.playerName = 'B';
    env2.state.players = [
        { name: 'Host', peerId: 'peer-host', isHost: true },
        { name: 'A', peerId: 'peer-a', isHost: false },
        { name: 'B', peerId: 'peer-b', isHost: false }
    ];
    env2.ctx.decideHostTakeoverOrReconnectNewVersion();
    check(env2.record.spies.becomeHost === 0 && env2.record.spies.attemptReconnectToNewHost === 1,
        'com A conectado, B deveria procurar o novo host em vez de assumir');
});

test('T17 Migração no meio da partida: novo host marca os outros como desconectados (host antigo vira jogador comum), pausa e retoma', (use) => {
    const env = use(createEnvironment());
    env.state.isHost = false;
    env.state.playerName = 'B';
    env.state.peerId = 'peer-b';
    env.state.baseRoomPeerId = 'sala';
    env.state.hostVersion = 0;
    env.state.gameStarted = true;
    env.state.gameOver = false;
    env.state.currentRound = null;
    env.state.players = [
        { name: 'Host', peerId: 'sala', isHost: true, kpi: 0, resources: 10, focusArea: 'initiating', activities: 0 },
        { name: 'A', peerId: 'peer-a', isHost: false, kpi: 5, resources: 3, focusArea: 'planning', activities: 1 },
        { name: 'B', peerId: 'peer-b', isHost: false, kpi: 0, resources: 10, focusArea: 'initiating', activities: 0 }
    ];

    env.takeOverAsHost();
    check(env.state.isHost && env.player('B').isHost, 'B deveria ser o novo host');
    check(env.player('B').peerId === 'sala-h1', 'peerId de B deveria ser o da sala nova, veio: ' + env.player('B').peerId);
    // D3b: o host antigo continua na partida, como jogador comum desconectado.
    const oldHost = env.player('Host');
    check(oldHost, 'o host antigo deveria continuar na lista');
    check(oldHost.isHost === false && oldHost.disconnected === true, 'o host antigo deveria virar jogador comum, desconectado');
    check(env.state.players.filter(p => p.isHost).length === 1, 'só pode haver um host na lista');
    check(env.player('A').disconnected === true, 'A deveria ficar desconectado até reconectar ao novo host');
    check(!env.player('B').disconnected, 'o novo host não pode se marcar como desconectado');
    check(env.state.matchPaused, 'só o novo host está conectado — a partida deveria pausar');
    check(env.state.currentRound === null, 'não deveria haver dupla com A ainda desconectado');

    env.join('A', 'peer-a2');
    check(!env.player('A').disconnected && env.player('A').peerId === 'peer-a2', 'A deveria voltar como conectado');
    check(env.player('A').kpi === 5 && env.player('A').resources === 3, 'KPI/recursos de A deveriam estar preservados');
    check(!env.state.matchPaused && env.state.currentRound, 'a partida deveria retomar com a volta de A');
});

test('T18 Migração no lobby: os outros saem da lista e voltam como jogadores novos', (use) => {
    const env = use(createEnvironment());
    env.state.isHost = false;
    env.state.playerName = 'B';
    env.state.peerId = 'peer-b';
    env.state.baseRoomPeerId = 'sala';
    env.state.hostVersion = 0;
    env.state.gameStarted = false;
    env.state.players = [
        { name: 'Host', peerId: 'sala', isHost: true },
        { name: 'A', peerId: 'peer-a', isHost: false },
        { name: 'B', peerId: 'peer-b', isHost: false }
    ];

    env.takeOverAsHost();
    check(env.state.players.length === 1 && env.player('B'), 'só o novo host deveria ficar na lista do lobby');

    env.join('A', 'peer-a2');
    check(env.rejectionFor('peer-a2') === null, 'A deveria entrar de novo, veio: ' + env.rejectionFor('peer-a2'));
    check(env.player('A') && !env.player('A').disconnected, 'A deveria estar na lista, conectado');
});

test('T19 Peer já aberto: "peer-unavailable" (e outros erros) não destroem o peer', (use) => {
    // Guest: o peer abre e já tenta conectar ao host.
    const env = use(createEnvironment());
    env.state.isHost = false;
    env.state.hostPeerId = 'sala';
    env.state.baseRoomPeerId = 'sala';
    const peers = env.installFakePeer();
    env.Game.network.initPeer().catch(() => {});
    const peer = peers[0];
    peer.fire('open', 'peer-guest');
    check(peer.requestedConnections.includes('sala'), 'pré-condição: guest deveria tentar conectar ao host');

    // O que acontece na 1ª tentativa de reconexão quando o host sumiu.
    peer.fire('error', { type: 'peer-unavailable', message: 'Could not connect to peer sala' });
    check(!peer.destroyed, 'peer-unavailable NÃO pode destruir o peer (mataria a migração de host)');
    check(env.Game.network.connectionState.getPeer() === peer, 'o peer em uso deveria continuar o mesmo');

    peer.fire('error', { type: 'socket-error', message: 'falha de socket' });
    check(!peer.destroyed, 'depois do open, nenhum erro deveria destruir o peer');

    // Controle: ANTES do open (ex: ID do host ocupado após F5), continua
    // destruindo — o initPeerWithRetry() do main.js depende disso.
    const env2 = use(createEnvironment());
    env2.state.isHost = true;
    env2.state.hostPeerId = 'sala';
    const peers2 = env2.installFakePeer();
    env2.Game.network.initPeer().catch(() => {});
    peers2[0].fire('error', { type: 'unavailable-id', message: 'ID is taken' });
    check(peers2[0].destroyed, 'erro antes do open deveria destruir o peer (para o retry recomeçar)');
});

test('T20 Reconexão sem peer utilizável: a tentativa falha, mas a cadeia continua', (use) => {
    const env = use(createEnvironment());
    const time = env.fakeTime();
    env.state.isHost = false;
    env.state.playerName = 'B';
    env.state.baseRoomPeerId = 'sala';
    env.state.hostVersion = 0;
    env.state.players = [
        { name: 'Host', peerId: 'sala', isHost: true },
        { name: 'A', peerId: 'peer-a', isHost: false },
        { name: 'B', peerId: 'peer-b', isHost: false }
    ];
    // Peer que perdeu o servidor de sinalização: connect() devolve undefined.
    env.Game.network.connectionState.setPeer({ destroyed: false, connect: () => undefined });

    // D3b: as tentativas ao mesmo host seguem até o prazo (HOST_TIMEOUT).
    let error = null;
    try {
        env.ctx.handleHostDisconnect();
        time.advance(env.CONFIG.GAME.HOST_TIMEOUT);
    } catch (e) { error = e; }
    check(!error, 'tentativas ao mesmo host não deveriam lançar erro, lançou: ' + (error && error.message));
    check(env.record.spies.attemptReconnectToNewHost === 1, 'deveria seguir para a migração (procurar o novo host)');

    error = null;
    try { env.Game.network.attemptReconnectToNewHost(5); } catch (e) { error = e; }
    check(!error, 'procurar o novo host não deveria lançar erro, lançou: ' + (error && error.message));
    check(env.record.logs.some(l => l.includes('Não foi possível localizar um novo host')),
        'depois da última tentativa, deveria desistir de forma controlada');

    // Peer já destruído: mesmo comportamento.
    env.Game.network.connectionState.setPeer({ destroyed: true, connect: () => { throw new Error('não deveria ser chamado'); } });
    error = null;
    try { env.Game.network.attemptReconnectToSameHost(1); } catch (e) { error = e; }
    check(!error, 'com peer destruído, não deveria lançar erro, lançou: ' + (error && error.message));
});

test('T21 Migração com rodada que o novo host não conduz: descarta, pausa e retoma com o mesmo evento', (use) => {
    // Cenário do teste manual: o host antigo perguntava para B; A era espectador.
    const env = use(createEnvironment());
    env.state.isHost = false;
    env.state.playerName = 'A';
    env.state.peerId = 'peer-a';
    env.state.baseRoomPeerId = 'sala';
    env.state.hostVersion = 0;
    env.state.gameStarted = true;
    env.state.gameOver = false;
    const roundEvent = { id: 'e-velho', title: 'Evento da rodada' };
    env.state.currentRound = { event: roundEvent, asker: 'Host', answerer: 'B', question: null, answered: false };
    env.state.players = [
        { name: 'Host', peerId: 'sala', isHost: true, kpi: 0, resources: 10, focusArea: 'initiating', activities: 0 },
        { name: 'A', peerId: 'peer-a', isHost: false, kpi: 0, resources: 10, focusArea: 'initiating', activities: 0 },
        { name: 'B', peerId: 'peer-b', isHost: false, kpi: 0, resources: 10, focusArea: 'initiating', activities: 0 }
    ];

    env.takeOverAsHost();
    check(env.state.currentRound === null, 'a rodada do host antigo deveria ter sido descartada');
    check(env.state.matchPaused && env.state.matchPaused.event === roundEvent,
        'a partida deveria pausar guardando o MESMO evento');
    check(!env.record.ui.includes('showEventModal'), 'não deveria reexibir o modal de evento');

    env.clearLog();
    env.join('B', 'peer-b2');
    const r = env.state.currentRound;
    check(!env.state.matchPaused && r, 'a volta de B deveria retomar a partida');
    check(r.event === roundEvent, 'a rodada retomada deveria usar o mesmo evento');
    check(r.asker !== 'Host' && r.answerer !== 'Host', 'o host antigo não pode estar na dupla');
    check(r.question && r.question.correct !== undefined, 'o novo host deveria ter o gabarito da nova pergunta');
    check(env.broadcastsOfType('round-start').length === 1, 'deveria mandar round-start (fecha a pergunta velha na tela de B)');
    check(env.broadcastsOfType('show-event').length === 0, 'não deveria reexibir o modal de evento');
});

test('T21b Migração quando o novo host era o Perguntador: a rodada continua', (use) => {
    const env = use(createEnvironment());
    env.state.isHost = false;
    env.state.playerName = 'A';
    env.state.peerId = 'peer-a';
    env.state.baseRoomPeerId = 'sala';
    env.state.hostVersion = 0;
    env.state.gameStarted = true;
    env.state.gameOver = false;
    const question = { type: 'question', question: 'Pergunta?', alternatives: ['a', 'b', 'c', 'd'], correct: 'a', id: 'q9', isAsker: true };
    const round = { event: { id: 'e1' }, asker: 'A', answerer: 'B', question: question, answered: false };
    env.state.currentRound = round;
    env.state.players = [
        { name: 'Host', peerId: 'sala', isHost: true },
        { name: 'A', peerId: 'peer-a', isHost: false },
        { name: 'B', peerId: 'peer-b', isHost: false }
    ];

    env.takeOverAsHost();
    check(env.state.currentRound === round, 'a rodada deveria continuar a mesma');
    check(!env.state.matchPaused, 'não deveria pausar');

    env.join('B', 'peer-b2');
    const sync = env.record.sent.find(e => e.to === 'peer-b2' && e.msg.type === 'state-sync');
    check(sync && sync.msg.fullState.currentRound && sync.msg.fullState.currentRound.answerer === 'B',
        'B deveria receber a rodada em andamento no state-sync');
    check(sync.msg.fullState.currentRound.question.correct === undefined, 'B (respondedor) não pode receber o gabarito');
    check(env.state.currentRound === round, 'a volta de B não deveria trocar a rodada');
});

test('T26 Migração: o novo host confere o token com os hashes que vieram na lista', (use) => {
    const env = use(createEnvironment());
    env.state.isHost = false;
    env.state.playerName = 'B';
    env.state.peerId = 'peer-b';
    env.state.baseRoomPeerId = 'sala';
    env.state.hostVersion = 0;
    env.state.gameStarted = true;
    env.state.gameOver = false;
    env.state.currentRound = null;
    // Lista como chega ao guest B pelo player-list do host antigo.
    env.state.players = [
        { name: 'Host', peerId: 'sala', isHost: true, kpi: 0, resources: 10, focusArea: 'initiating', activities: 0, tokenHash: env.hash(tokenOf('Host')) },
        { name: 'A', peerId: 'peer-a', isHost: false, kpi: 5, resources: 3, focusArea: 'planning', activities: 1, tokenHash: env.hash(tokenOf('A')) },
        { name: 'B', peerId: 'peer-b', isHost: false, kpi: 0, resources: 10, focusArea: 'initiating', activities: 0, tokenHash: env.hash(tokenOf('B')) }
    ];

    env.takeOverAsHost();
    check(env.player('B').isHost && env.player('B').tokenHash === env.hash(tokenOf('B')), 'o novo host deveria manter o próprio hash');
    check(env.player('A').disconnected && env.player('A').tokenHash === env.hash(tokenOf('A')), 'A desconectado, com o hash preservado');

    env.join('A', 'peer-impostor', 'token-de-outro-navegador');
    check(env.rejectionFor('peer-impostor') === 'identity-mismatch', 'impostor deveria ser recusado pelo novo host, veio: ' + env.rejectionFor('peer-impostor'));
    check(env.player('A').disconnected && env.state.matchPaused, 'A continua reservado e a partida pausada');

    env.join('A', 'peer-a2');
    check(env.rejectionFor('peer-a2') === null, 'A de verdade deveria reconectar ao novo host, veio: ' + env.rejectionFor('peer-a2'));
    check(env.player('A').kpi === 5 && !env.state.matchPaused, 'A volta com o KPI dele e a partida retoma');
});

test('T35 Guest que viu "rodada encerrada" assume como host: continua encerrada até o "Nova Rodada"', (use) => {
    const env = use(createEnvironment());
    env.state.isHost = false;
    env.state.playerName = 'B';
    env.state.peerId = 'peer-b';
    env.state.baseRoomPeerId = 'sala';
    env.state.hostVersion = 0;
    env.state.gameStarted = true;
    env.state.gameOver = false;
    // Como no jogo: a cópia da rodada no guest não marca `answered`.
    env.state.currentRound = { event: { id: 'e1' }, asker: 'Host', answerer: 'B', question: null, answered: false };
    env.state.players = [
        { name: 'Host', peerId: 'sala', isHost: true, kpi: 0, resources: 10, focusArea: 'initiating', activities: 0 },
        { name: 'A', peerId: 'peer-a', isHost: false, kpi: 0, resources: 10, focusArea: 'initiating', activities: 0, tokenHash: env.hash(tokenOf('A')) },
        { name: 'B', peerId: 'peer-b', isHost: false, kpi: 0, resources: 10, focusArea: 'initiating', activities: 0 },
        { name: 'C', peerId: 'peer-c', isHost: false, kpi: 0, resources: 10, focusArea: 'initiating', activities: 0, tokenHash: env.hash(tokenOf('C')) }
    ];
    env.Game.network.handleMessage({ type: 'kpi-update', playerName: 'B', kpi: 10, focusArea: 'initiating', activities: 1, resources: 10, answeredThisRound: ['A', 'C', 'Host', 'B'] }, 'sala');
    env.Game.network.handleMessage({ type: 'round-ended' }, 'sala');
    check(env.state.roundEnded === true, 'pré-condição: B viu o fim do ciclo');

    env.takeOverAsHost();
    check(env.state.roundEnded === true && !env.state.matchPaused && env.state.currentRound === null,
        'o novo host deveria continuar com a rodada encerrada, sem pausar nem sortear');
    check(env.record.ui.includes('showRoundEndedMessage'), 'o novo host deveria ver "rodada encerrada"');
    check(env.Game.selectors.isCycleComplete(env.Game.getActivePlayers(), env.state.answeredThisRound),
        'o "Nova Rodada" deveria ficar liberado (ciclo completo)');

    env.clearLog();
    env.join('A', 'peer-a2');
    env.join('C', 'peer-c2');
    check(env.broadcastsOfType('round-start').length === 0 && env.state.currentRound === null,
        'a volta dos outros não pode começar rodada sozinha');
    const sync = syncTo(env, 'peer-c2');
    check(sync && sync.roundEnded === true, 'quem volta deveria ver "rodada encerrada"');

    // O host clica em "Nova Rodada": aí sim a dupla nova começa.
    env.Game.core.startNewRound();
    check(env.state.currentRound && env.state.roundEnded === false, 'Nova Rodada deveria começar a dupla e tirar o aviso');
    const rs = env.broadcastsOfType('round-start').pop();
    check(rs && Array.isArray(rs.answeredThisRound) && rs.answeredThisRound.length === 0, 'rodada nova começa com o rodízio zerado');

    // Encerrada pelo host antigo continua encerrada mesmo que alguém que
    // estava fora (e não respondeu) tenha voltado antes da troca.
    const env2 = use(createEnvironment());
    guestBeforeTakeover(env2, {
        round: { event: { id: 'e1' }, asker: 'A', answerer: 'B', question: null, answered: false },
        answered: ['Host', 'A', 'B'], players: [['Host'], ['A'], ['B'], ['D']]
    });
    env2.Game.network.handleMessage({ type: 'round-ended' }, 'sala');
    env2.takeOverAsHost();
    check(env2.state.roundEnded === true && !env2.state.matchPaused && env2.state.currentRound === null,
        'rodada encerrada pelo host antigo deveria continuar encerrada');
});

test('T36 Todo Peer do jogo usa CONFIG.PEER (cópia), inclusive quem assume como host', (use) => {
    const env = use(createEnvironment());
    env.CONFIG.PEER = { debug: 3, host: 'sinalizacao.exemplo', secure: true };
    const checkOptions = (peer, where) => {
        check(peer.peerOptions && peer.peerOptions.host === 'sinalizacao.exemplo' && peer.peerOptions.debug === 3,
            where + ': deveria receber as opções de CONFIG.PEER, veio: ' + JSON.stringify(peer.peerOptions));
        check(peer.peerOptions !== env.CONFIG.PEER, where + ': deveria receber uma cópia, não o próprio CONFIG.PEER');
    };

    // Peer do guest e do host (initPeer).
    let peers = env.installFakePeer();
    env.state.isHost = false;
    env.Game.network.initPeer().catch(() => {});
    checkOptions(peers[0], 'guest');
    env.state.isHost = true;
    env.state.hostPeerId = 'sala';
    env.Game.network.initPeer().catch(() => {});
    check(peers[1].id === 'sala', 'pré-condição: host abre com o ID da sala');
    checkOptions(peers[1], 'host');

    // Peer de quem assume como host (becomeHost).
    const mig = use(createEnvironment());
    mig.CONFIG.PEER = { debug: 3, host: 'sinalizacao.exemplo' };
    mig.state.isHost = false;
    mig.state.playerName = 'B';
    mig.state.baseRoomPeerId = 'sala';
    mig.state.hostVersion = 0;
    mig.state.players = [{ name: 'B', peerId: 'peer-b', isHost: false }];
    peers = mig.installFakePeer();
    mig.Game.network.becomeHost();
    check(peers[0].id === 'sala-h1', 'pré-condição: novo host abre na versão seguinte da sala');
    check(peers[0].peerOptions && peers[0].peerOptions.host === 'sinalizacao.exemplo', 'becomeHost deveria usar CONFIG.PEER');
});

test('T37 Configuração única: nenhum "new Peer" com opções soltas; CONFIG.PEER existe no config real', (use) => {
    // Varre todo o código do jogo (inclusive a tela inicial, que não roda aqui).
    const withoutConfig = [];
    const scan = (dir) => {
        for (const item of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
            const rel = path.join(dir, item.name);
            if (item.isDirectory()) { scan(rel); continue; }
            if (!item.name.endsWith('.js')) continue;
            fs.readFileSync(path.join(ROOT, rel), 'utf8').split('\n').forEach((line, i) => {
                if (/new Peer\(/.test(line) && !line.trim().startsWith('//') && !line.includes('CONFIG.PEER')) {
                    withoutConfig.push(rel + ':' + (i + 1));
                }
            });
        }
    };
    scan('js');
    check(withoutConfig.length === 0, 'new Peer sem CONFIG.PEER em: ' + withoutConfig.join(', '));

    // O config de verdade (o carregado pelos HTML) precisa ter PEER.
    const configCtx = vm.createContext({});
    vm.runInContext('var window = this;' + fs.readFileSync(path.join(ROOT, 'config/game-config.js'), 'utf8'), configCtx);
    const realPeerConfig = vm.runInContext('CONFIG.PEER', configCtx);
    check(realPeerConfig && typeof realPeerConfig === 'object', 'config/game-config.js deveria definir CONFIG.PEER');

    // Só existe um arquivo de configuração (a cópia antiga em js/config/ foi removida).
    check(!fs.existsSync(path.join(ROOT, 'js/config/game-config.js')), 'js/config/game-config.js (cópia antiga, não carregada) não deveria existir');
});

/** Guest B com a lista [Host, B, A]: B é o backup. */
function backupGuest(env) {
    env.state.isHost = false;
    env.state.playerName = 'B';
    env.state.peerId = 'peer-b';
    env.state.baseRoomPeerId = 'sala';
    env.state.hostPeerId = 'sala';
    env.state.hostVersion = 0;
    env.state.players = [
        { name: 'Host', peerId: 'sala', isHost: true },
        { name: 'B', peerId: 'peer-b', isHost: false },
        { name: 'A', peerId: 'peer-a', isHost: false }
    ];
}

test('T38 Host volta dentro do prazo (F5): guest reconecta ao mesmo host, sem migração', (use) => {
    const env = use(createEnvironment());
    const time = env.fakeTime();
    backupGuest(env);
    const connections = env.guestPeer();

    env.ctx.handleHostDisconnect();
    time.advance(4000);
    check(connections.length >= 2 && connections.every(c => c.peer === 'sala'),
        'deveria tentar o MESMO host mais de uma vez dentro do prazo, tentou: ' + connections.map(c => c.peer).join(','));
    check(env.record.spies.becomeHost === 0, 'não deveria assumir antes do prazo');

    // O host terminou de recarregar: a tentativa em andamento abre.
    connections[connections.length - 1].openNow();
    const join = env.record.toHost.find(m => m.type === 'player-join');
    check(join && join.token === env.Game.identity.getRoomToken('sala'),
        'deveria reenviar o player-join com o token ao host que voltou');

    const attempts = connections.length;
    time.advance(30000);
    check(env.record.spies.becomeHost === 0 && env.record.spies.attemptReconnectToNewHost === 0,
        'depois de reconectar, não pode haver migração');
    check(connections.length === attempts, 'depois de reconectar, não deveria haver novas tentativas');

    // Uma queda posterior do mesmo host é tratada de novo (a espera anterior acabou).
    env.ctx.handleHostDisconnect();
    check(connections.length === attempts + 1, 'uma queda nova depois da reconexão deveria abrir uma espera nova');
});

test('T39 Host não volta: o backup assume ao fim de HOST_TIMEOUT (10s), não antes', (use) => {
    const env = use(createEnvironment());
    const time = env.fakeTime();
    backupGuest(env);
    const connections = env.guestPeer();
    const timeout = env.CONFIG.GAME.HOST_TIMEOUT;

    env.ctx.handleHostDisconnect();
    time.advance(timeout - 2500);
    check(env.record.spies.becomeHost === 0, 'não deveria assumir antes do prazo');
    check(connections.length >= 3, 'deveria repetir tentativas curtas ao mesmo host, foram: ' + connections.length);
    time.advance(2500);
    check(env.record.spies.becomeHost === 1, 'o backup deveria assumir até o fim do prazo');
    check(connections.every(c => c.peer === 'sala'), 'antes de assumir, só deveria procurar o host atual');
    check(connections.every(c => c.closed || c.open), 'tentativas que não abriram deveriam ser fechadas');

    // O prazo vem da configuração.
    const env2 = use(createEnvironment());
    const time2 = env2.fakeTime();
    backupGuest(env2);
    env2.guestPeer();
    env2.CONFIG.GAME.HOST_TIMEOUT = 20000;
    env2.ctx.handleHostDisconnect();
    time2.advance(12000);
    check(env2.record.spies.becomeHost === 0, 'com HOST_TIMEOUT de 20s, não deveria assumir aos 12s');
    time2.advance(8000);
    check(env2.record.spies.becomeHost === 1, 'com HOST_TIMEOUT de 20s, deveria assumir aos 20s');

    // Valor do jogo de verdade.
    const configCtx = vm.createContext({});
    vm.runInContext('var window = this;' + fs.readFileSync(path.join(ROOT, 'config/game-config.js'), 'utf8'), configCtx);
    check(vm.runInContext('CONFIG.GAME.HOST_TIMEOUT', configCtx) === 10000, 'config/game-config.js deveria ter HOST_TIMEOUT de 10000 ms');
});

test('T40 Segunda queda durante a espera não abre outra cadeia de tentativas', (use) => {
    const env = use(createEnvironment());
    const time = env.fakeTime();
    backupGuest(env);
    const connections = env.guestPeer();

    env.ctx.handleHostDisconnect();
    env.ctx.handleHostDisconnect();
    check(connections.length === 1, 'a segunda queda não deveria disparar outra tentativa, houve ' + connections.length);
    time.advance(env.CONFIG.GAME.HOST_TIMEOUT);
    check(env.record.spies.becomeHost === 1, 'deveria decidir uma única vez, decidiu ' + env.record.spies.becomeHost);

    // Terminada a espera, uma queda nova (ex: do novo host) abre outra.
    const before = connections.length;
    env.ctx.handleHostDisconnect();
    check(connections.length === before + 1, 'depois do prazo, uma queda nova deveria abrir uma espera nova');
});

test('T41 Host antigo volta depois da migração: entra como jogador comum com o token dele', (use) => {
    const env = use(createEnvironment());
    env.state.isHost = false;
    env.state.playerName = 'B';
    env.state.peerId = 'peer-b';
    env.state.baseRoomPeerId = 'sala';
    env.state.hostVersion = 0;
    env.state.gameStarted = true;
    env.state.gameOver = false;
    env.state.currentRound = null;
    env.state.players = [
        { name: 'Host', peerId: 'sala', isHost: true, kpi: 7, resources: 4, focusArea: 'planning', activities: 1, tokenHash: env.hash(tokenOf('Host')) },
        { name: 'A', peerId: 'peer-a', isHost: false, kpi: 0, resources: 10, focusArea: 'initiating', activities: 0, tokenHash: env.hash(tokenOf('A')) },
        { name: 'B', peerId: 'peer-b', isHost: false, kpi: 0, resources: 10, focusArea: 'initiating', activities: 0, tokenHash: env.hash(tokenOf('B')) }
    ];

    env.takeOverAsHost();
    const oldHost = env.player('Host');
    check(oldHost && !oldHost.isHost && oldHost.disconnected, 'host antigo: jogador comum desconectado');
    check(oldHost.kpi === 7 && oldHost.resources === 4 && oldHost.tokenHash === env.hash(tokenOf('Host')), 'KPI, recursos e hash do host antigo preservados');
    check(env.state.matchPaused, 'pré-condição: partida pausada, só o novo host conectado');

    env.join('Host', 'peer-impostor', 'token-de-outro-navegador');
    check(env.rejectionFor('peer-impostor') === 'identity-mismatch', 'impostor com o nome do host antigo deveria ser recusado, veio: ' + env.rejectionFor('peer-impostor'));

    env.clearLog();
    env.join('Host', 'peer-host-voltou');
    check(env.rejectionFor('peer-host-voltou') === null, 'o host antigo deveria conseguir voltar, veio: ' + env.rejectionFor('peer-host-voltou'));
    check(!oldHost.disconnected && oldHost.peerId === 'peer-host-voltou' && oldHost.isHost === false, 'volta conectado, como jogador comum');
    check(oldHost.kpi === 7, 'volta com o KPI dele');
    check(env.state.isHost && env.player('B').isHost && env.state.players.filter(p => p.isHost).length === 1, 'B continua sendo o único host');
    check(!env.state.matchPaused && env.state.currentRound, 'com a volta dele, a partida retoma');
    const list = env.broadcastsOfType('player-list').pop();
    check(list && list.players.find(p => p.name === 'Host').isHost === false, 'a lista enviada aos outros mostra o host antigo como jogador comum');
});

test('T42 Quem assume como host marca host=true na URL (F5 volta como host na sala nova)', (use) => {
    const env = use(createEnvironment());
    const url = env.fakeUrl('https://exemplo.github.io/jogo/game.html?host=false&room=sala&playerName=B&peerId=sala');
    env.state.isHost = false;
    env.state.playerName = 'B';
    env.state.peerId = 'peer-b';
    env.state.baseRoomPeerId = 'sala';
    env.state.hostVersion = 0;
    env.state.gameStarted = true;
    env.state.gameOver = false;
    env.state.players = [
        { name: 'Host', peerId: 'sala', isHost: true },
        { name: 'B', peerId: 'peer-b', isHost: false }
    ];

    env.takeOverAsHost();
    check(url.param('host') === 'true', 'a URL deveria passar a dizer host=true, diz: ' + url.param('host'));
    check(url.param('peerId') === 'sala' && url.param('room') === 'sala' && url.param('playerName') === 'B',
        'os outros parâmetros (peerId = ID base da sala) não mudam: ' + env.ctx.location.href);
    check(url.replacements.length === 1, 'deveria trocar a URL sem recarregar (replaceState), uma vez');

    env.Game.network.saveRoleInUrl(false);
    check(url.param('host') === 'false', 'saveRoleInUrl(false) deveria voltar para host=false');

    // Sem history/URL disponíveis: não quebra.
    const env2 = use(createEnvironment());
    let error = null;
    try { env2.Game.network.saveRoleInUrl(true); } catch (e) { error = e; }
    check(!error, 'sem URL/history, não deveria lançar erro');
});

test('T43 Host antigo recarregando: se outro assumiu, volta como jogador comum; senão, segue host', (use) => {
    const prepareOldHost = (env) => {
        const url = env.fakeUrl('https://exemplo.github.io/jogo/game.html?host=true&room=sala&playerName=Host&peerId=sala');
        env.state.isHost = true;
        env.state.playerName = 'Host';
        env.state.baseRoomPeerId = 'sala';
        env.state.hostPeerId = 'sala';
        env.state.hostVersion = 0;
        env.state.gameStarted = true;
        env.state.players = [
            { name: 'Host', peerId: 'sala', isHost: true, kpi: 7 },
            { name: 'A', peerId: 'peer-a', isHost: false },
            { name: 'B', peerId: 'peer-b', isHost: false }
        ];
        return url;
    };
    /** Uma conexão falsa por destino; openNow(target) simula a sala respondendo. */
    const connectionsByTarget = () => {
        const byTarget = {};
        return {
            byTarget,
            onConnect: (target) => {
                const h = {};
                const c = { peer: target, open: false, closed: false, on: (ev, cb) => { h[ev] = cb; }, send: () => {}, close() { c.closed = true; }, fire: (ev) => h[ev] && h[ev]() };
                byTarget[target] = c;
                return c;
            },
            openNow: (target) => { byTarget[target].open = true; byTarget[target].fire('open'); }
        };
    };
    const unavailableForAll = (peer, except = []) => {
        peer.requestedConnections.filter(d => !except.includes(d)).forEach(d =>
            peer.fire('error', { type: 'peer-unavailable', message: 'Could not connect to peer ' + d }));
    };

    // 1) A sala seguinte responde: a migração aconteceu.
    const env = use(createEnvironment());
    const url = prepareOldHost(env);
    const conns = connectionsByTarget();
    const peers = env.installFakePeer({ onConnect: conns.onConnect });
    env.Game.network.rejoinAsPlayerIfTakenOver();
    const probe = peers[0];
    check(probe && probe.id === undefined, 'deveria sondar com um peer temporário (ID aleatório), não com o ID da sala');
    check(probe.peerOptions && probe.peerOptions !== env.CONFIG.PEER && probe.peerOptions.debug === env.CONFIG.PEER.debug, 'a sonda usa uma cópia de CONFIG.PEER');
    check(env.Game.network.connectionState.getPeer() !== probe, 'a sonda não pode virar o peer do jogo');
    probe.fire('open', 'peer-sonda');
    check(probe.requestedConnections.includes('sala-h1'), 'deveria procurar a versão seguinte do host (sala-h1), procurou: ' + probe.requestedConnections.join(','));
    check(!probe.requestedConnections.includes('sala'), 'não deveria procurar a própria versão (sala)');
    check(env.state.isHost, 'antes da resposta, nada muda');
    conns.openNow('sala-h1');
    check(!env.state.isHost, 'deveria deixar de ser host');
    check(env.state.hostVersion === 1 && env.state.hostPeerId === 'sala-h1', 'deveria apontar para a sala nova: ' + env.state.hostPeerId);
    check(env.player('Host').isHost === false && env.player('Host').kpi === 7, 'a própria entrada deixa de ser host, dados preservados');
    check(url.param('host') === 'false' && url.param('peerId') === 'sala', 'a URL deveria passar a host=false (peerId base igual): ' + env.ctx.location.href);
    check(probe.destroyed && conns.byTarget['sala-h1'].closed, 'a sonda deveria ser encerrada');

    // 1b) D3c: duas migrações enquanto ele estava fora — a sala está em sala-h2.
    const envB = use(createEnvironment());
    prepareOldHost(envB);
    const connsB = connectionsByTarget();
    const peersB = envB.installFakePeer({ onConnect: connsB.onConnect });
    envB.Game.network.rejoinAsPlayerIfTakenOver();
    peersB[0].fire('open', 'peer-sonda');
    unavailableForAll(peersB[0], ['sala-h2']);
    check(envB.state.isHost, 'enquanto sala-h2 não responde, nada muda');
    connsB.openNow('sala-h2');
    check(!envB.state.isHost && envB.state.hostVersion === 2 && envB.state.hostPeerId === 'sala-h2',
        'deveria achar a sala em sala-h2, apontou para: ' + envB.state.hostPeerId);

    // 2) Ninguém em nenhuma versão seguinte (peer-unavailable em todas): segue como host.
    const env2 = use(createEnvironment());
    const url2 = prepareOldHost(env2);
    const peers2 = env2.installFakePeer({ onConnect: connectionsByTarget().onConnect });
    env2.Game.network.rejoinAsPlayerIfTakenOver();
    peers2[0].fire('open', 'peer-sonda');
    unavailableForAll(peers2[0]);
    check(env2.state.isHost && env2.state.hostVersion === 0 && env2.state.hostPeerId === 'sala', 'sem migração, continua host da sala de sempre');
    check(url2.replacements.length === 0, 'sem migração, a URL não muda');
    check(peers2[0].destroyed, 'a sonda deveria ser encerrada');

    // 3) Sem resposta no tempo limite: segue como host; resposta tardia é ignorada.
    const env3 = use(createEnvironment());
    const time3 = env3.fakeTime();
    prepareOldHost(env3);
    const conns3 = connectionsByTarget();
    const peers3 = env3.installFakePeer({ onConnect: conns3.onConnect });
    env3.Game.network.rejoinAsPlayerIfTakenOver();
    peers3[0].fire('open', 'peer-sonda');
    time3.advance(10000);
    check(env3.state.isHost && peers3[0].destroyed, 'sem resposta, segue como host e encerra a sonda');
    conns3.openNow('sala-h1');
    check(env3.state.isHost && env3.state.hostVersion === 0, 'resposta depois do tempo limite não pode mudar o papel');

    // 4) Guest não sonda nada.
    const env4 = use(createEnvironment());
    const peers4 = env4.installFakePeer();
    env4.state.isHost = false;
    env4.Game.network.rejoinAsPlayerIfTakenOver();
    check(peers4.length === 0, 'guest não deveria criar sonda');

    // 5) main.js: a verificação roda só para host com sessão restaurada,
    // antes de abrir o ID de host.
    const main = fs.readFileSync(path.join(ROOT, 'js/main.js'), 'utf8');
    const call = main.search(/if \(restored && state\.isHost\) \{\s*await Game\.network\.rejoinAsPlayerIfTakenOver\(\);/);
    check(call >= 0, 'init() deveria chamar rejoinAsPlayerIfTakenOver() para host com sessão restaurada');
    check(call < main.indexOf('await initPeerWithRetry()'), 'a verificação deveria vir antes de abrir o peer');
});

/** Peer falso mínimo para a procura: uma conexão controlável por destino. */
function searchPeer() {
    const connections = {};
    const requests = [];
    return {
        connections, requests, destroyed: false,
        connect(target) {
            const h = {};
            const c = { peer: target, open: false, closed: false, on: (ev, cb) => { h[ev] = cb; }, send: () => {}, close() { c.closed = true; }, fire: (ev) => h[ev] && h[ev]() };
            connections[target] = c;
            requests.push(target);
            return c;
        },
        openNow(target) { connections[target].open = true; connections[target].fire('open'); }
    };
}

test('T44 Procura da sala: várias versões ao mesmo tempo, descarta as que não existem, fica com a que abre', (use) => {
    const env = use(createEnvironment());
    const net = env.Game.network;
    const peer = searchPeer();
    let found = null;
    let gaveUp = 0;

    net.findHost(peer, 'sala', {
        onFound: (conn, version, id) => { found = { conn, version, id }; },
        onGiveUp: () => { gaveUp++; }
    });
    check(peer.requests.join(',') === 'sala,sala-h1,sala-h2,sala-h3,sala-h4,sala-h5',
        'deveria procurar o ID base e 5 versões seguintes, procurou: ' + peer.requests.join(','));

    // "sala-h1 não existe" não pode descartar "sala" (o nome de um contém o do outro).
    net.reportPeerUnavailable(unavailable('sala-h1'));
    check(peer.connections['sala-h1'].closed && !peer.connections['sala'].closed, 'só a versão indisponível deveria ser descartada');
    ['sala', 'sala-h3', 'sala-h4', 'sala-h5'].forEach(id => net.reportPeerUnavailable(unavailable(id)));
    check(!found && gaveUp === 0, 'ainda falta sala-h2 responder');
    peer.openNow('sala-h2');
    check(found && found.version === 2 && found.id === 'sala-h2' && found.conn === peer.connections['sala-h2'], 'deveria achar sala-h2');
    check(!found.conn.closed, 'a conexão achada fica aberta para quem chamou');
    net.reportPeerUnavailable(unavailable('sala-h2'));
    check(gaveUp === 0, 'depois de achar, avisos atrasados não mudam nada');

    // Nenhuma versão existe: desiste uma vez só.
    const peer2 = searchPeer();
    let gaveUp2 = 0;
    net.findHost(peer2, 'sala', { startVersion: 3, versionCount: 2, onFound: () => { throw new Error('não deveria achar'); }, onGiveUp: () => { gaveUp2++; } });
    check(peer2.requests.join(',') === 'sala-h3,sala-h4', 'deveria começar da versão inicial, procurou: ' + peer2.requests.join(','));
    peer2.requests.forEach(id => net.reportPeerUnavailable(unavailable(id)));
    net.reportPeerUnavailable(unavailable('sala-h4'));
    check(gaveUp2 === 1, 'deveria desistir exatamente uma vez, desistiu ' + gaveUp2);

    // Sem resposta nenhuma: desiste no tempo máximo, fechando tudo.
    const time = env.fakeTime();
    const peer3 = searchPeer();
    let gaveUp3 = 0;
    net.findHost(peer3, 'sala', { onFound: () => {}, onGiveUp: () => { gaveUp3++; } });
    time.advance(4000);
    check(gaveUp3 === 0, 'não deveria desistir antes do tempo máximo');
    time.advance(2000);
    check(gaveUp3 === 1 && Object.values(peer3.connections).every(c => c.closed), 'no tempo máximo, desiste e fecha as conexões');

    // cancel(): encerra sem chamar nada.
    const peer4 = searchPeer();
    let called = false;
    const search = net.findHost(peer4, 'sala', { onFound: () => { called = true; }, onGiveUp: () => { called = true; } });
    search.cancel();
    time.advance(10000);
    check(!called && Object.values(peer4.connections).every(c => c.closed), 'cancelada, não chama ninguém e fecha tudo');

    // Sem peer utilizável: desiste na hora, sem erro.
    let gaveUp5 = 0;
    net.findHost({ destroyed: true, connect: () => { throw new Error('não'); } }, 'sala', { onFound: () => {}, onGiveUp: () => { gaveUp5++; } });
    check(gaveUp5 === 1, 'sem peer utilizável, deveria desistir na hora');
    check(env.Game.computeHostPeerId('sala', 0) === 'sala' && env.Game.computeHostPeerId('sala', 3) === 'sala-h3', 'regra dos IDs de host inalterada');
});

test('T45 Guest entra/volta pelo ID base depois de migrações: acha a versão atual e manda o player-join', (use) => {
    // Entrando agora (versão 0 conhecida), sala já em sala-h1.
    const env = use(createEnvironment());
    env.state.isHost = false;
    env.state.playerName = 'A';
    env.state.baseRoomPeerId = 'sala';
    env.state.hostPeerId = 'sala';
    env.state.hostVersion = 0;
    const conns = {};
    const peers = env.installFakePeer({
        onConnect: (target) => {
            const h = {};
            const c = { peer: target, open: false, closed: false, on: (ev, cb) => { h[ev] = cb; }, send: () => {}, close() { if (c.open && h.close) { c.open = false; h.close(); } c.closed = true; }, fire: (ev) => h[ev] && h[ev]() };
            conns[target] = c;
            return c;
        }
    });
    env.Game.network.initPeer().catch(() => {});
    const peer = peers[0];
    peer.fire('open', 'peer-a');
    check(peer.requestedConnections.includes('sala') && peer.requestedConnections.includes('sala-h1'),
        'deveria procurar o ID base e as versões seguintes, procurou: ' + peer.requestedConnections.join(','));
    // Pelo handler de erro REAL do peer (peerService.initPeer).
    peer.fire('error', unavailable('sala'));
    check(conns['sala'].closed, 'o erro peer-unavailable do peer deveria descartar a versão que não existe');
    check(env.record.toHost.length === 0, 'antes de achar, não manda nada');
    conns['sala-h1'].open = true;
    conns['sala-h1'].fire('open');
    check(env.state.hostVersion === 1 && env.state.hostPeerId === 'sala-h1', 'deveria passar a usar sala-h1, usa: ' + env.state.hostPeerId);
    check(env.Game.network.connectionState.getConnection('sala-h1') === conns['sala-h1'], 'a conexão com o host deveria ficar registrada');
    const joins = env.record.toHost.filter(m => m.type === 'player-join');
    check(joins.length === 1 && joins[0].token === env.Game.identity.getRoomToken('sala'), 'deveria mandar um player-join, com o token');
    check(['sala-h2', 'sala-h3', 'sala-h4', 'sala-h5'].every(id => conns[id].closed), 'as outras tentativas deveriam ser fechadas');

    // A conexão achada passa pelo handleConnection() real: queda do host é percebida.
    let drops = 0;
    env.Game.network.handleHostDisconnect = () => { drops++; };
    conns['sala-h1'].close();
    check(drops === 1, 'queda da conexão achada deveria acionar o tratamento de queda do host');

    // Voltando com a sessão restaurada (versão 1), sala já em sala-h2.
    const env2 = use(createEnvironment());
    env2.state.isHost = false;
    env2.state.playerName = 'A';
    env2.state.baseRoomPeerId = 'sala';
    env2.state.hostPeerId = 'sala-h1';
    env2.state.hostVersion = 1;
    const peers2 = env2.installFakePeer({ onConnect: connectionThatOpens('sala-h2') });
    env2.Game.network.initPeer().catch(() => {});
    peers2[0].fire('open', 'peer-a2');
    check(!peers2[0].requestedConnections.includes('sala'), 'deveria começar da versão salva, procurou: ' + peers2[0].requestedConnections.join(','));
    check(env2.state.hostVersion === 2 && env2.state.hostPeerId === 'sala-h2', 'deveria achar sala-h2, usa: ' + env2.state.hostPeerId);

    // Sala não existe em versão nenhuma: avisa o jogador.
    const env3 = use(createEnvironment());
    env3.state.isHost = false;
    env3.state.baseRoomPeerId = 'sala';
    env3.state.hostVersion = 0;
    const peers3 = env3.installFakePeer({ onConnect: connectionThatOpens(null) });
    env3.Game.network.initPeer().catch(() => {});
    peers3[0].fire('open', 'peer-x');
    env3.clearLog();
    peers3[0].requestedConnections.forEach(id => peers3[0].fire('error', unavailable(id)));
    check(env3.record.ui.includes('updateConnectionStatus'), 'sem sala, deveria mostrar o erro de conexão');
    check(!peers3[0].destroyed, 'o peer do jogador continua (pode tentar de novo)');
});

/** onConnect para installFakePeer: só a conexão com `targetThatOpens` abre (na hora em que o handler 'open' é registrado). */
function connectionThatOpens(targetThatOpens) {
    return (target) => {
        const c = {
            peer: target, open: false,
            on: (ev, cb) => { if (ev === 'open' && target === targetThatOpens) { c.open = true; cb(); } },
            send: () => {}, close: () => { c.open = false; }
        };
        return c;
    };
}

test('T46 Assumir como host não manda reconectar o peer novo (erro "cannot reconnect")', (use) => {
    const env = use(createEnvironment());
    const time = env.fakeTime();
    env.state.isHost = false;
    env.state.baseRoomPeerId = 'sala';
    const peers = env.installFakePeer();
    env.Game.network.initPeer().catch(() => {});
    const oldPeer = peers[0];
    oldPeer.fire('open', 'peer-b');

    // becomeHost(): destrói o peer antigo (o PeerJS dispara 'disconnected'
    // dentro do destroy) e passa a usar o peer novo, já conectado.
    const newPeer = new env.ctx.Peer('sala-h1');
    env.Game.network.connectionState.setPeer(newPeer);
    oldPeer.destroyed = true;
    oldPeer.disconnected = true;
    env.clearLog();
    oldPeer.fire('disconnected');
    check(!env.record.ui.includes('updateConnectionStatus'), 'o novo host não deveria ver "Desconectado" por causa do peer antigo');
    time.advance(5000);
    check(newPeer.reconnects === 0, 'não deveria mandar reconectar o peer novo');
    check(oldPeer.reconnects === 0, 'nem o peer destruído');

    // Controle: o peer em uso perdeu o servidor de verdade — reconecta.
    const env2 = use(createEnvironment());
    const time2 = env2.fakeTime();
    env2.state.isHost = false;
    env2.state.baseRoomPeerId = 'sala';
    const peers2 = env2.installFakePeer();
    env2.Game.network.initPeer().catch(() => {});
    peers2[0].fire('open', 'peer-b');
    peers2[0].disconnected = true;
    peers2[0].fire('disconnected');
    time2.advance(5000);
    check(peers2[0].reconnects === 1, 'peer em uso desconectado do servidor deveria reconectar uma vez, reconectou ' + peers2[0].reconnects);

    // Se o PeerJS já tiver reconectado sozinho antes dos 3s, não manda de novo.
    peers2[0].fire('disconnected');
    peers2[0].disconnected = false;
    time2.advance(5000);
    check(peers2[0].reconnects === 1, 'peer que já voltou ao servidor não deveria ser reconectado');
});

/** Guest B prestes a assumir, com a lista que recebeu do host antigo. */
function guestBeforeTakeover(env, { round, answered, players }) {
    env.state.isHost = false;
    env.state.playerName = 'B';
    env.state.peerId = 'peer-b';
    env.state.baseRoomPeerId = 'sala';
    env.state.hostVersion = 0;
    env.state.gameStarted = true;
    env.state.gameOver = false;
    env.state.currentRound = round;
    env.state.answeredThisRound = answered;
    env.state.players = players.map(([name, extra]) => Object.assign(
        { name, peerId: name === 'Host' ? 'sala' : 'peer-' + name.toLowerCase(), isHost: name === 'Host',
          kpi: 0, resources: 10, focusArea: 'initiating', activities: 0, tokenHash: env.hash(tokenOf(name)) },
        extra || {}));
}

test('T49 Quem já respondeu na rodada chega aos guests (resposta, nova dupla, reconexão) e fica guardado', (use) => {
    const host = use(createEnvironment());
    host.createRoomAsHost();
    host.join('A', 'peer-a');
    host.join('B', 'peer-b');
    host.startMatch();
    const rs0 = host.broadcastsOfType('round-start').pop();
    check(rs0 && Array.isArray(rs0.answeredThisRound) && rs0.answeredThisRound.length === 0, 'rodada nova: round-start com a lista vazia');

    const r = host.state.currentRound;
    host.Game.core.handleAnswer({ alternative: r.question.correct, playerName: r.answerer });
    const kpi = host.broadcastsOfType('kpi-update').find(m => m.playerName === r.answerer);
    check(kpi && Array.isArray(kpi.answeredThisRound) && kpi.answeredThisRound.includes(r.answerer),
        'a atualização da resposta deveria levar a lista já com quem respondeu, veio: ' + JSON.stringify(kpi && kpi.answeredThisRound));

    host.Game.core.nextTurn();
    const rs1 = host.broadcastsOfType('round-start').pop();
    check(rs1 !== rs0 && rs1.answeredThisRound.includes(r.answerer), 'a próxima dupla deveria levar a lista');

    const other = ['A', 'B'].find(n => n !== r.answerer && n !== 'Host') || 'A';
    host.drop('peer-' + other.toLowerCase());
    host.join(other, 'peer-volta');
    const sync = syncTo(host, 'peer-volta');
    check(sync && JSON.stringify(sync.answeredThisRound) === JSON.stringify(host.state.answeredThisRound),
        'quem reconecta deveria receber a lista, veio: ' + JSON.stringify(sync && sync.answeredThisRound));

    // Lado do guest.
    const g = use(createEnvironment());
    g.state.isHost = false;
    g.state.playerName = 'B';
    g.state.players = [{ name: 'A', kpi: 0 }, { name: 'B', kpi: 0 }];
    g.Game.network.handleMessage({ type: 'kpi-update', playerName: 'A', kpi: 10, focusArea: 'initiating', activities: 1, resources: 10, answeredThisRound: ['A'] }, 'sala');
    check(JSON.stringify(g.state.answeredThisRound) === '["A"]', 'guest deveria guardar a lista da resposta');
    g.Game.network.handleMessage({ type: 'round-start', event: { id: 'e1' }, asker: 'A', answerer: 'B', answeredThisRound: ['A', 'C'] }, 'sala');
    check(JSON.stringify(g.state.answeredThisRound) === '["A","C"]', 'guest deveria guardar a lista da nova dupla');
    g.Game.network.handleMessage({ type: 'kpi-update', playerName: 'A', kpi: 15, focusArea: 'initiating', activities: 1, resources: 11, supportOutcome: 'fee', supportAmount: 1, supportPartner: 'B' }, 'sala');
    check(JSON.stringify(g.state.answeredThisRound) === '["A","C"]', 'mensagem sem a lista não deveria apagar a lista');
    g.receiveSync('B', { players: [], decks: {}, timer: 500, gameStarted: true, hostVersion: 0, currentRound: null, answeredThisRound: ['Host'] });
    check(JSON.stringify(g.state.answeredThisRound) === '["Host"]', 'guest deveria guardar a lista da reconexão');

    // O host nunca troca a própria lista pela de uma mensagem.
    host.state.answeredThisRound = ['Host'];
    host.Game.network.handleMessage({ type: 'round-start', event: { id: 'e1' }, asker: 'A', answerer: 'B', answeredThisRound: [] }, 'peer-a');
    check(JSON.stringify(host.state.answeredThisRound) === '["Host"]', 'host não deveria sobrescrever a própria lista');
});

test('T50 Troca de host logo depois de uma resposta: se todos já responderam, a rodada fica encerrada', (use) => {
    // D já estava desconectado antes da queda do host (não conta, como no T8).
    // Como no jogo, a cópia da rodada no guest não marca `answered`: o
    // sinal de pergunta respondida é o Respondedor estar no rodízio.
    const players = [['Host'], ['A'], ['B'], ['D', { disconnected: true }]];
    const round = { event: { id: 'e1' }, asker: 'A', answerer: 'Host', question: null, answered: false };

    const env = use(createEnvironment());
    guestBeforeTakeover(env, { round, answered: ['A', 'B', 'Host'], players });
    env.takeOverAsHost();
    check(env.state.roundEnded === true && env.state.currentRound === null && !env.state.matchPaused,
        'todos os que estavam ativos já responderam: a rodada deveria ficar encerrada');
    env.clearLog();
    env.join('A', 'peer-a2');
    check(env.broadcastsOfType('round-start').length === 0, 'a volta de A não pode começar rodada sozinha');

    // O host antigo (que saiu) não precisa ter respondido para a rodada acabar.
    const envH = use(createEnvironment());
    guestBeforeTakeover(envH, { round: { ...round, asker: 'Host', answerer: 'A' }, answered: ['B', 'A'], players });
    envH.takeOverAsHost();
    check(envH.state.roundEnded === true && !envH.state.matchPaused,
        'sem contar o host antigo, todos já responderam: deveria ficar encerrada');

    // Controle: B ainda não tinha respondido — a rodada continua, sem repetir ninguém.
    const env2 = use(createEnvironment());
    guestBeforeTakeover(env2, { round, answered: ['A', 'Host'], players });
    env2.takeOverAsHost();
    check(!env2.state.roundEnded && env2.state.matchPaused && env2.state.matchPaused.event === round.event,
        'ainda falta B: deveria pausar com o mesmo evento');
    env2.join('A', 'peer-a2');
    const r = env2.state.currentRound;
    check(r && r.answerer === 'B' && r.event === round.event,
        'a rodada deveria continuar com B respondendo (A e o host antigo já responderam), veio: ' + JSON.stringify(r && { p: r.asker, r: r.answerer }));

    // O novo host era o Perguntador de uma pergunta JÁ respondida: não pode reabri-la.
    const env3 = use(createEnvironment());
    const question = { type: 'question', question: 'Pergunta?', alternatives: ['A', 'B', 'C', 'D'], correct: 'A' };
    guestBeforeTakeover(env3, {
        round: { event: { id: 'e1' }, asker: 'B', answerer: 'A', question: question, answered: false },
        answered: ['A'], players: [['Host'], ['A'], ['B'], ['C']]
    });
    env3.takeOverAsHost();
    check(!env3.record.ui.includes('displayQuestion'), 'não deveria reabrir a pergunta que A já respondeu');
    check(env3.state.currentRound === null && env3.state.matchPaused, 'deveria seguir para a próxima dupla (pausa até alguém voltar)');
    env3.join('C', 'peer-c2');
    const r3 = env3.state.currentRound;
    check(r3 && r3.answerer !== 'A', 'A não pode responder de novo nesta rodada, veio: ' + JSON.stringify(r3 && r3.answerer));
});

test('T51 Pergunta em aberto descartada na troca de host: quem ia responder não perde a vez', (use) => {
    // O host antigo perguntava para A; B e C já tinham respondido.
    const env = use(createEnvironment());
    const round = { event: { id: 'e1' }, asker: 'Host', answerer: 'A', question: null, answered: false };
    guestBeforeTakeover(env, { round, answered: [], players: [['Host'], ['A'], ['B'], ['C']] });
    // A lista chega como no jogo: na atualização da última resposta.
    env.Game.network.handleMessage({ type: 'kpi-update', playerName: 'C', kpi: 10, focusArea: 'initiating', activities: 1, resources: 10, answeredThisRound: ['B', 'C'] }, 'sala');
    env.takeOverAsHost();
    check(!env.state.answeredThisRound.includes('A'), 'A não answered: não pode entrar no rodízio');
    check(env.state.matchPaused && !env.state.roundEnded, 'pré-condição: pausa até alguém voltar');

    env.join('A', 'peer-a2');
    const r = env.state.currentRound;
    check(r && r.answerer === 'A' && r.asker !== 'Host', 'A deveria responder na retomada, veio: ' + JSON.stringify(r && { p: r.asker, r: r.answerer }));
    check(r.event === round.event, 'com o mesmo evento');

    // A responde: B e C já responderam, C e o host antigo estão fora — a rodada acaba.
    env.Game.core.handleAnswer({ alternative: r.question.correct, playerName: 'A' });
    env.clearLog();
    env.Game.core.nextTurn();
    check(env.state.roundEnded === true && env.broadcastsOfType('round-start').length === 0,
        'depois de A, a rodada deveria encerrar sem repetir ninguém');
});

test('T61 Quem assume como host liga o relógio da partida (a mesma contagem do início) e não manda host-changed', (use) => {
    // A era o Perguntador: a rodada continua com o novo host (como no T21b).
    function guestInMatch() {
        const a = use(createEnvironment());
        const r = a.fakeClock();
        a.state.isHost = false;
        a.state.playerName = 'A';
        a.state.peerId = 'peer-a';
        a.state.baseRoomPeerId = 'sala';
        a.state.hostVersion = 0;
        a.state.gameStarted = true;
        a.state.gameOver = false;
        a.state.timer = 11;
        const question = { type: 'question', question: 'Pergunta?', alternatives: ['a', 'b', 'c', 'd'], correct: 'a', id: 'q9', isAsker: true };
        a.state.currentRound = { event: { id: 'e1' }, asker: 'A', answerer: 'B', question: question, answered: false };
        a.state.players = [
            { name: 'Host', peerId: 'sala', isHost: true, kpi: 0, resources: 10, focusArea: 'initiating', activities: 0 },
            { name: 'A', peerId: 'peer-a', isHost: false, kpi: 0, resources: 10, focusArea: 'initiating', activities: 0 },
            { name: 'B', peerId: 'peer-b', isHost: false, kpi: 0, resources: 10, focusArea: 'initiating', activities: 0 }
        ];
        return { env: a, clock: r };
    }

    // Sem contagem ligada antes: quem liga é a troca de host.
    const { env, clock } = guestInMatch();
    env.takeOverAsHost();
    check(env.state.isHost, 'pré-condição: A deveria ser o novo host');
    check(clock.activeCount() === 1, 'assumir com a partida em andamento deveria ligar o relógio, ligados: ' + clock.activeCount());
    check(env.broadcastsOfType('host-changed').length === 0, 'não deveria mandar host-changed (ninguém está conectado à sala nova)');

    clock.tick();
    const notice = env.broadcastsOfType('timer-update').pop();
    check(env.state.timer === 10 && notice && notice.remaining === 10, 'o novo host deveria contar e avisar os guests a cada 10 segundos');

    env.state.timer = 1;
    clock.tick();
    check(env.state.gameOver && env.broadcastsOfType('game-over').length === 1 && clock.activeCount() === 0,
        'no zero, o novo host encerra a partida');

    // Com a contagem que o guest já tinha (ligada na entrada ou na
    // reconexão): continua uma só.
    const withClock = guestInMatch();
    withClock.env.Game.core.startClock();
    check(withClock.clock.activeCount() === 1, 'pré-condição: relógio do guest ligado');
    withClock.env.takeOverAsHost();
    check(withClock.clock.activeCount() === 1, 'só pode haver uma contagem ligada depois de assumir, ligadas: ' + withClock.clock.activeCount());

    // No lobby, assumir não liga relógio.
    const lobby = use(createEnvironment());
    const clock2 = lobby.fakeClock();
    lobby.state.isHost = false;
    lobby.state.playerName = 'B';
    lobby.state.peerId = 'peer-b';
    lobby.state.baseRoomPeerId = 'sala';
    lobby.state.hostVersion = 0;
    lobby.state.gameStarted = false;
    lobby.state.players = [
        { name: 'Host', peerId: 'sala', isHost: true },
        { name: 'B', peerId: 'peer-b', isHost: false }
    ];
    lobby.takeOverAsHost();
    check(clock2.activeCount() === 0, 'no lobby não deveria ligar o relógio');
    check(lobby.broadcastsOfType('host-changed').length === 0, 'no lobby também não deveria mandar host-changed');

    // Uma contagem só (sessionEngine.startClock) e nada de host-changed no código.
    const migrationSource = fs.readFileSync(path.join(ROOT, 'js/network/hostMigration.js'), 'utf8');
    const handlerSource = fs.readFileSync(path.join(ROOT, 'js/network/messageHandler.js'), 'utf8');
    check(!/setInterval/.test(migrationSource), 'hostMigration.js não deveria ter contagem própria (usar Game.core.startClock())');
    check(!/host-changed/.test(migrationSource) && !/host-changed/.test(handlerSource), 'a mensagem host-changed não deveria existir mais');
    check(typeof env.Game.network.reconnectToNewHost === 'undefined', 'reconnectToNewHost() só servia ao host-changed e deveria ter saído');
});

finish('Troca de host');
