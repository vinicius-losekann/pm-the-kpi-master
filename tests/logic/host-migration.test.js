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
    fs, path, vm, RAIZ, createEnvironment, tokenOf, test, check, start, finish,
    syncTo, roundScreens, unavailable, roomToReload, reloadHost, tryReloadHost
} = require('./environment');

start('Troca de host');

test('T10 Migração: backup desconectado é pulado, próximo assume', (usar) => {
    // Visão do guest B: lista [Host, A (desconectado), B].
    const amb = usar(createEnvironment());
    amb.state.isHost = false;
    amb.state.playerName = 'B';
    amb.state.players = [
        { name: 'Host', peerId: 'peer-host', isHost: true },
        { name: 'A', peerId: 'peer-a', isHost: false, disconnected: true },
        { name: 'B', peerId: 'peer-b', isHost: false }
    ];
    amb.ctx.decideHostTakeoverOrReconnectNewVersion();
    check(amb.registro.spies.becomeHost === 1, 'B deveria assumir como host');

    // Controle: com A conectado, B NÃO assume (A é o backup).
    const amb2 = usar(createEnvironment());
    amb2.state.isHost = false;
    amb2.state.playerName = 'B';
    amb2.state.players = [
        { name: 'Host', peerId: 'peer-host', isHost: true },
        { name: 'A', peerId: 'peer-a', isHost: false },
        { name: 'B', peerId: 'peer-b', isHost: false }
    ];
    amb2.ctx.decideHostTakeoverOrReconnectNewVersion();
    check(amb2.registro.spies.becomeHost === 0 && amb2.registro.spies.attemptReconnectToNewHost === 1,
        'com A conectado, B deveria procurar o novo host em vez de assumir');
});

test('T17 Migração no meio da partida: novo host marca os outros como desconectados (host antigo vira jogador comum), pausa e retoma', (usar) => {
    const amb = usar(createEnvironment());
    amb.state.isHost = false;
    amb.state.playerName = 'B';
    amb.state.peerId = 'peer-b';
    amb.state.baseRoomPeerId = 'sala';
    amb.state.hostVersion = 0;
    amb.state.gameStarted = true;
    amb.state.gameOver = false;
    amb.state.currentRound = null;
    amb.state.players = [
        { name: 'Host', peerId: 'sala', isHost: true, kpi: 0, recursos: 10, phase: 'iniciacao', activities: 0 },
        { name: 'A', peerId: 'peer-a', isHost: false, kpi: 5, recursos: 3, phase: 'planejamento', activities: 1 },
        { name: 'B', peerId: 'peer-b', isHost: false, kpi: 0, recursos: 10, phase: 'iniciacao', activities: 0 }
    ];

    amb.takeOverAsHost();
    check(amb.state.isHost && amb.player('B').isHost, 'B deveria ser o novo host');
    check(amb.player('B').peerId === 'sala-h1', 'peerId de B deveria ser o da sala nova, veio: ' + amb.player('B').peerId);
    // D3b: o host antigo continua na partida, como jogador comum desconectado.
    const antigo = amb.player('Host');
    check(antigo, 'o host antigo deveria continuar na lista');
    check(antigo.isHost === false && antigo.disconnected === true, 'o host antigo deveria virar jogador comum, desconectado');
    check(amb.state.players.filter(p => p.isHost).length === 1, 'só pode haver um host na lista');
    check(amb.player('A').disconnected === true, 'A deveria ficar desconectado até reconectar ao novo host');
    check(!amb.player('B').disconnected, 'o novo host não pode se marcar como desconectado');
    check(amb.state.partidaPausada, 'só o novo host está conectado — a partida deveria pausar');
    check(amb.state.currentRound === null, 'não deveria haver dupla com A ainda desconectado');

    amb.join('A', 'peer-a2');
    check(!amb.player('A').disconnected && amb.player('A').peerId === 'peer-a2', 'A deveria voltar como conectado');
    check(amb.player('A').kpi === 5 && amb.player('A').recursos === 3, 'KPI/recursos de A deveriam estar preservados');
    check(!amb.state.partidaPausada && amb.state.currentRound, 'a partida deveria retomar com a volta de A');
});

test('T18 Migração no lobby: os outros saem da lista e voltam como jogadores novos', (usar) => {
    const amb = usar(createEnvironment());
    amb.state.isHost = false;
    amb.state.playerName = 'B';
    amb.state.peerId = 'peer-b';
    amb.state.baseRoomPeerId = 'sala';
    amb.state.hostVersion = 0;
    amb.state.gameStarted = false;
    amb.state.players = [
        { name: 'Host', peerId: 'sala', isHost: true },
        { name: 'A', peerId: 'peer-a', isHost: false },
        { name: 'B', peerId: 'peer-b', isHost: false }
    ];

    amb.takeOverAsHost();
    check(amb.state.players.length === 1 && amb.player('B'), 'só o novo host deveria ficar na lista do lobby');

    amb.join('A', 'peer-a2');
    check(amb.rejectionFor('peer-a2') === null, 'A deveria entrar de novo, veio: ' + amb.rejectionFor('peer-a2'));
    check(amb.player('A') && !amb.player('A').disconnected, 'A deveria estar na lista, conectado');
});

test('T19 Peer já aberto: "peer-unavailable" (e outros erros) não destroem o peer', (usar) => {
    // Guest: o peer abre e já tenta conectar ao host.
    const amb = usar(createEnvironment());
    amb.state.isHost = false;
    amb.state.hostPeerId = 'sala';
    amb.state.baseRoomPeerId = 'sala';
    const peers = amb.installFakePeer();
    amb.Game.network.initPeer().catch(() => {});
    const peer = peers[0];
    peer.fire('open', 'peer-guest');
    check(peer.conexoesPedidas.includes('sala'), 'pré-condição: guest deveria tentar conectar ao host');

    // O que acontece na 1ª tentativa de reconexão quando o host sumiu.
    peer.fire('error', { type: 'peer-unavailable', message: 'Could not connect to peer sala' });
    check(!peer.destroyed, 'peer-unavailable NÃO pode destruir o peer (mataria a migração de host)');
    check(amb.Game.network.connectionState.getPeer() === peer, 'o peer em uso deveria continuar o mesmo');

    peer.fire('error', { type: 'socket-error', message: 'falha de socket' });
    check(!peer.destroyed, 'depois do open, nenhum erro deveria destruir o peer');

    // Controle: ANTES do open (ex: ID do host ocupado após F5), continua
    // destruindo — o initPeerWithRetry() do main.js depende disso.
    const amb2 = usar(createEnvironment());
    amb2.state.isHost = true;
    amb2.state.hostPeerId = 'sala';
    const peers2 = amb2.installFakePeer();
    amb2.Game.network.initPeer().catch(() => {});
    peers2[0].fire('error', { type: 'unavailable-id', message: 'ID is taken' });
    check(peers2[0].destroyed, 'erro antes do open deveria destruir o peer (para o retry recomeçar)');
});

test('T20 Reconexão sem peer utilizável: a tentativa falha, mas a cadeia continua', (usar) => {
    const amb = usar(createEnvironment());
    const tempo = amb.fakeTime();
    amb.state.isHost = false;
    amb.state.playerName = 'B';
    amb.state.baseRoomPeerId = 'sala';
    amb.state.hostVersion = 0;
    amb.state.players = [
        { name: 'Host', peerId: 'sala', isHost: true },
        { name: 'A', peerId: 'peer-a', isHost: false },
        { name: 'B', peerId: 'peer-b', isHost: false }
    ];
    // Peer que perdeu o servidor de sinalização: connect() devolve undefined.
    amb.Game.network.connectionState.setPeer({ destroyed: false, connect: () => undefined });

    // D3b: as tentativas ao mesmo host seguem até o prazo (HOST_TIMEOUT).
    let erro = null;
    try {
        amb.ctx.handleHostDisconnect();
        tempo.advance(amb.CONFIG.JOGO.HOST_TIMEOUT);
    } catch (e) { erro = e; }
    check(!erro, 'tentativas ao mesmo host não deveriam lançar erro, lançou: ' + (erro && erro.message));
    check(amb.registro.spies.attemptReconnectToNewHost === 1, 'deveria seguir para a migração (procurar o novo host)');

    erro = null;
    try { amb.Game.network.attemptReconnectToNewHost(5); } catch (e) { erro = e; }
    check(!erro, 'procurar o novo host não deveria lançar erro, lançou: ' + (erro && erro.message));
    check(amb.registro.logs.some(l => l.includes('Não foi possível localizar um novo host')),
        'depois da última tentativa, deveria desistir de forma controlada');

    // Peer já destruído: mesmo comportamento.
    amb.Game.network.connectionState.setPeer({ destroyed: true, connect: () => { throw new Error('não deveria ser chamado'); } });
    erro = null;
    try { amb.Game.network.attemptReconnectToSameHost(1); } catch (e) { erro = e; }
    check(!erro, 'com peer destruído, não deveria lançar erro, lançou: ' + (erro && erro.message));
});

test('T21 Migração com rodada que o novo host não conduz: descarta, pausa e retoma com o mesmo evento', (usar) => {
    // Cenário do teste manual: o host antigo perguntava para B; A era espectador.
    const amb = usar(createEnvironment());
    amb.state.isHost = false;
    amb.state.playerName = 'A';
    amb.state.peerId = 'peer-a';
    amb.state.baseRoomPeerId = 'sala';
    amb.state.hostVersion = 0;
    amb.state.gameStarted = true;
    amb.state.gameOver = false;
    const eventoDaRodada = { id: 'e-velho', titulo: 'Evento da rodada' };
    amb.state.currentRound = { evento: eventoDaRodada, perguntador: 'Host', respondedor: 'B', pergunta: null, respondeu: false };
    amb.state.players = [
        { name: 'Host', peerId: 'sala', isHost: true, kpi: 0, recursos: 10, phase: 'iniciacao', activities: 0 },
        { name: 'A', peerId: 'peer-a', isHost: false, kpi: 0, recursos: 10, phase: 'iniciacao', activities: 0 },
        { name: 'B', peerId: 'peer-b', isHost: false, kpi: 0, recursos: 10, phase: 'iniciacao', activities: 0 }
    ];

    amb.takeOverAsHost();
    check(amb.state.currentRound === null, 'a rodada do host antigo deveria ter sido descartada');
    check(amb.state.partidaPausada && amb.state.partidaPausada.evento === eventoDaRodada,
        'a partida deveria pausar guardando o MESMO evento');
    check(!amb.registro.ui.includes('showEventoModal'), 'não deveria reexibir o modal de evento');

    amb.clearLog();
    amb.join('B', 'peer-b2');
    const r = amb.state.currentRound;
    check(!amb.state.partidaPausada && r, 'a volta de B deveria retomar a partida');
    check(r.evento === eventoDaRodada, 'a rodada retomada deveria usar o mesmo evento');
    check(r.perguntador !== 'Host' && r.respondedor !== 'Host', 'o host antigo não pode estar na dupla');
    check(r.pergunta && r.pergunta.correct !== undefined, 'o novo host deveria ter o gabarito da nova pergunta');
    check(amb.broadcastsOfType('round-start').length === 1, 'deveria mandar round-start (fecha a pergunta velha na tela de B)');
    check(amb.broadcastsOfType('show-evento').length === 0, 'não deveria reexibir o modal de evento');
});

test('T21b Migração quando o novo host era o Perguntador: a rodada continua', (usar) => {
    const amb = usar(createEnvironment());
    amb.state.isHost = false;
    amb.state.playerName = 'A';
    amb.state.peerId = 'peer-a';
    amb.state.baseRoomPeerId = 'sala';
    amb.state.hostVersion = 0;
    amb.state.gameStarted = true;
    amb.state.gameOver = false;
    const pergunta = { type: 'question', question: 'Pergunta?', alternatives: ['a', 'b', 'c', 'd'], correct: 'a', id: 'q9', isPerguntador: true };
    const rodada = { evento: { id: 'e1' }, perguntador: 'A', respondedor: 'B', pergunta, respondeu: false };
    amb.state.currentRound = rodada;
    amb.state.players = [
        { name: 'Host', peerId: 'sala', isHost: true },
        { name: 'A', peerId: 'peer-a', isHost: false },
        { name: 'B', peerId: 'peer-b', isHost: false }
    ];

    amb.takeOverAsHost();
    check(amb.state.currentRound === rodada, 'a rodada deveria continuar a mesma');
    check(!amb.state.partidaPausada, 'não deveria pausar');

    amb.join('B', 'peer-b2');
    const sync = amb.registro.enviados.find(e => e.para === 'peer-b2' && e.msg.type === 'state-sync');
    check(sync && sync.msg.fullState.currentRound && sync.msg.fullState.currentRound.respondedor === 'B',
        'B deveria receber a rodada em andamento no state-sync');
    check(sync.msg.fullState.currentRound.pergunta.correct === undefined, 'B (respondedor) não pode receber o gabarito');
    check(amb.state.currentRound === rodada, 'a volta de B não deveria trocar a rodada');
});

test('T26 Migração: o novo host confere o token com os hashes que vieram na lista', (usar) => {
    const amb = usar(createEnvironment());
    amb.state.isHost = false;
    amb.state.playerName = 'B';
    amb.state.peerId = 'peer-b';
    amb.state.baseRoomPeerId = 'sala';
    amb.state.hostVersion = 0;
    amb.state.gameStarted = true;
    amb.state.gameOver = false;
    amb.state.currentRound = null;
    // Lista como chega ao guest B pelo player-list do host antigo.
    amb.state.players = [
        { name: 'Host', peerId: 'sala', isHost: true, kpi: 0, recursos: 10, phase: 'iniciacao', activities: 0, tokenHash: amb.hash(tokenOf('Host')) },
        { name: 'A', peerId: 'peer-a', isHost: false, kpi: 5, recursos: 3, phase: 'planejamento', activities: 1, tokenHash: amb.hash(tokenOf('A')) },
        { name: 'B', peerId: 'peer-b', isHost: false, kpi: 0, recursos: 10, phase: 'iniciacao', activities: 0, tokenHash: amb.hash(tokenOf('B')) }
    ];

    amb.takeOverAsHost();
    check(amb.player('B').isHost && amb.player('B').tokenHash === amb.hash(tokenOf('B')), 'o novo host deveria manter o próprio hash');
    check(amb.player('A').disconnected && amb.player('A').tokenHash === amb.hash(tokenOf('A')), 'A desconectado, com o hash preservado');

    amb.join('A', 'peer-impostor', 'token-de-outro-navegador');
    check(amb.rejectionFor('peer-impostor') === 'identity-mismatch', 'impostor deveria ser recusado pelo novo host, veio: ' + amb.rejectionFor('peer-impostor'));
    check(amb.player('A').disconnected && amb.state.partidaPausada, 'A continua reservado e a partida pausada');

    amb.join('A', 'peer-a2');
    check(amb.rejectionFor('peer-a2') === null, 'A de verdade deveria reconectar ao novo host, veio: ' + amb.rejectionFor('peer-a2'));
    check(amb.player('A').kpi === 5 && !amb.state.partidaPausada, 'A volta com o KPI dele e a partida retoma');
});

test('T35 Guest que viu "rodada encerrada" assume como host: continua encerrada até o "Nova Rodada"', (usar) => {
    const amb = usar(createEnvironment());
    amb.state.isHost = false;
    amb.state.playerName = 'B';
    amb.state.peerId = 'peer-b';
    amb.state.baseRoomPeerId = 'sala';
    amb.state.hostVersion = 0;
    amb.state.gameStarted = true;
    amb.state.gameOver = false;
    // Como no jogo: a cópia da rodada no guest não marca `respondeu`.
    amb.state.currentRound = { evento: { id: 'e1' }, perguntador: 'Host', respondedor: 'B', pergunta: null, respondeu: false };
    amb.state.players = [
        { name: 'Host', peerId: 'sala', isHost: true, kpi: 0, recursos: 10, phase: 'iniciacao', activities: 0 },
        { name: 'A', peerId: 'peer-a', isHost: false, kpi: 0, recursos: 10, phase: 'iniciacao', activities: 0, tokenHash: amb.hash(tokenOf('A')) },
        { name: 'B', peerId: 'peer-b', isHost: false, kpi: 0, recursos: 10, phase: 'iniciacao', activities: 0 },
        { name: 'C', peerId: 'peer-c', isHost: false, kpi: 0, recursos: 10, phase: 'iniciacao', activities: 0, tokenHash: amb.hash(tokenOf('C')) }
    ];
    amb.Game.network.handleMessage({ type: 'kpi-update', playerName: 'B', kpi: 10, phase: 'iniciacao', activities: 1, recursos: 10, respondidos: ['A', 'C', 'Host', 'B'] }, 'sala');
    amb.Game.network.handleMessage({ type: 'round-ended' }, 'sala');
    check(amb.state.rodadaEncerrada === true, 'pré-condição: B viu o fim do ciclo');

    amb.takeOverAsHost();
    check(amb.state.rodadaEncerrada === true && !amb.state.partidaPausada && amb.state.currentRound === null,
        'o novo host deveria continuar com a rodada encerrada, sem pausar nem sortear');
    check(amb.registro.ui.includes('showRoundEndedMessage'), 'o novo host deveria ver "rodada encerrada"');
    check(amb.Game.selectors.isCycleComplete(amb.Game.getActivePlayers(), amb.state.usedRespondedorThisRound),
        'o "Nova Rodada" deveria ficar liberado (ciclo completo)');

    amb.clearLog();
    amb.join('A', 'peer-a2');
    amb.join('C', 'peer-c2');
    check(amb.broadcastsOfType('round-start').length === 0 && amb.state.currentRound === null,
        'a volta dos outros não pode começar rodada sozinha');
    const sync = syncTo(amb, 'peer-c2');
    check(sync && sync.rodadaEncerrada === true, 'quem volta deveria ver "rodada encerrada"');

    // O host clica em "Nova Rodada": aí sim a dupla nova começa.
    amb.Game.core.startNewRound();
    check(amb.state.currentRound && amb.state.rodadaEncerrada === false, 'Nova Rodada deveria começar a dupla e tirar o aviso');
    const rs = amb.broadcastsOfType('round-start').pop();
    check(rs && Array.isArray(rs.respondidos) && rs.respondidos.length === 0, 'rodada nova começa com o rodízio zerado');

    // Encerrada pelo host antigo continua encerrada mesmo que alguém que
    // estava fora (e não respondeu) tenha voltado antes da troca.
    const amb2 = usar(createEnvironment());
    guestBeforeTakeover(amb2, {
        round: { evento: { id: 'e1' }, perguntador: 'A', respondedor: 'B', pergunta: null, respondeu: false },
        respondidos: ['Host', 'A', 'B'], players: [['Host'], ['A'], ['B'], ['D']]
    });
    amb2.Game.network.handleMessage({ type: 'round-ended' }, 'sala');
    amb2.takeOverAsHost();
    check(amb2.state.rodadaEncerrada === true && !amb2.state.partidaPausada && amb2.state.currentRound === null,
        'rodada encerrada pelo host antigo deveria continuar encerrada');
});

test('T36 Todo Peer do jogo usa CONFIG.PEER (cópia), inclusive quem assume como host', (usar) => {
    const amb = usar(createEnvironment());
    amb.CONFIG.PEER = { debug: 3, host: 'sinalizacao.exemplo', secure: true };
    const checkOptions = (peer, onde) => {
        check(peer.opcoesPeer && peer.opcoesPeer.host === 'sinalizacao.exemplo' && peer.opcoesPeer.debug === 3,
            onde + ': deveria receber as opções de CONFIG.PEER, veio: ' + JSON.stringify(peer.opcoesPeer));
        check(peer.opcoesPeer !== amb.CONFIG.PEER, onde + ': deveria receber uma cópia, não o próprio CONFIG.PEER');
    };

    // Peer do guest e do host (initPeer).
    let peers = amb.installFakePeer();
    amb.state.isHost = false;
    amb.Game.network.initPeer().catch(() => {});
    checkOptions(peers[0], 'guest');
    amb.state.isHost = true;
    amb.state.hostPeerId = 'sala';
    amb.Game.network.initPeer().catch(() => {});
    check(peers[1].id === 'sala', 'pré-condição: host abre com o ID da sala');
    checkOptions(peers[1], 'host');

    // Peer de quem assume como host (becomeHost).
    const mig = usar(createEnvironment());
    mig.CONFIG.PEER = { debug: 3, host: 'sinalizacao.exemplo' };
    mig.state.isHost = false;
    mig.state.playerName = 'B';
    mig.state.baseRoomPeerId = 'sala';
    mig.state.hostVersion = 0;
    mig.state.players = [{ name: 'B', peerId: 'peer-b', isHost: false }];
    peers = mig.installFakePeer();
    mig.Game.network.becomeHost();
    check(peers[0].id === 'sala-h1', 'pré-condição: novo host abre na versão seguinte da sala');
    check(peers[0].opcoesPeer && peers[0].opcoesPeer.host === 'sinalizacao.exemplo', 'becomeHost deveria usar CONFIG.PEER');
});

test('T37 Configuração única: nenhum "new Peer" com opções soltas; CONFIG.PEER existe no config real', (usar) => {
    // Varre todo o código do jogo (inclusive a tela inicial, que não roda aqui).
    const naoUsaConfig = [];
    const scan = (pasta) => {
        for (const item of fs.readdirSync(path.join(RAIZ, pasta), { withFileTypes: true })) {
            const rel = path.join(pasta, item.name);
            if (item.isDirectory()) { scan(rel); continue; }
            if (!item.name.endsWith('.js')) continue;
            fs.readFileSync(path.join(RAIZ, rel), 'utf8').split('\n').forEach((linha, i) => {
                if (/new Peer\(/.test(linha) && !linha.trim().startsWith('//') && !linha.includes('CONFIG.PEER')) {
                    naoUsaConfig.push(rel + ':' + (i + 1));
                }
            });
        }
    };
    scan('js');
    check(naoUsaConfig.length === 0, 'new Peer sem CONFIG.PEER em: ' + naoUsaConfig.join(', '));

    // O config de verdade (o carregado pelos HTML) precisa ter PEER.
    const ctxConfig = vm.createContext({});
    vm.runInContext('var window = this;' + fs.readFileSync(path.join(RAIZ, 'config/game-config.js'), 'utf8'), ctxConfig);
    const peerReal = vm.runInContext('CONFIG.PEER', ctxConfig);
    check(peerReal && typeof peerReal === 'object', 'config/game-config.js deveria definir CONFIG.PEER');

    // Só existe um arquivo de configuração (a cópia antiga em js/config/ foi removida).
    check(!fs.existsSync(path.join(RAIZ, 'js/config/game-config.js')), 'js/config/game-config.js (cópia antiga, não carregada) não deveria existir');
});

/** Guest B com a lista [Host, B, A]: B é o backup. */
function backupGuest(amb) {
    amb.state.isHost = false;
    amb.state.playerName = 'B';
    amb.state.peerId = 'peer-b';
    amb.state.baseRoomPeerId = 'sala';
    amb.state.hostPeerId = 'sala';
    amb.state.hostVersion = 0;
    amb.state.players = [
        { name: 'Host', peerId: 'sala', isHost: true },
        { name: 'B', peerId: 'peer-b', isHost: false },
        { name: 'A', peerId: 'peer-a', isHost: false }
    ];
}

test('T38 Host volta dentro do prazo (F5): guest reconecta ao mesmo host, sem migração', (usar) => {
    const amb = usar(createEnvironment());
    const tempo = amb.fakeTime();
    backupGuest(amb);
    const conexoes = amb.guestPeer();

    amb.ctx.handleHostDisconnect();
    tempo.advance(4000);
    check(conexoes.length >= 2 && conexoes.every(c => c.peer === 'sala'),
        'deveria tentar o MESMO host mais de uma vez dentro do prazo, tentou: ' + conexoes.map(c => c.peer).join(','));
    check(amb.registro.spies.becomeHost === 0, 'não deveria assumir antes do prazo');

    // O host terminou de recarregar: a tentativa em andamento abre.
    conexoes[conexoes.length - 1].openNow();
    const join = amb.registro.paraHost.find(m => m.type === 'player-join');
    check(join && join.token === amb.Game.identity.obterTokenDaSala('sala'),
        'deveria reenviar o player-join com o token ao host que voltou');

    const tentativas = conexoes.length;
    tempo.advance(30000);
    check(amb.registro.spies.becomeHost === 0 && amb.registro.spies.attemptReconnectToNewHost === 0,
        'depois de reconectar, não pode haver migração');
    check(conexoes.length === tentativas, 'depois de reconectar, não deveria haver novas tentativas');

    // Uma queda posterior do mesmo host é tratada de novo (a espera anterior acabou).
    amb.ctx.handleHostDisconnect();
    check(conexoes.length === tentativas + 1, 'uma queda nova depois da reconexão deveria abrir uma espera nova');
});

test('T39 Host não volta: o backup assume ao fim de HOST_TIMEOUT (10s), não antes', (usar) => {
    const amb = usar(createEnvironment());
    const tempo = amb.fakeTime();
    backupGuest(amb);
    const conexoes = amb.guestPeer();
    const prazo = amb.CONFIG.JOGO.HOST_TIMEOUT;

    amb.ctx.handleHostDisconnect();
    tempo.advance(prazo - 2500);
    check(amb.registro.spies.becomeHost === 0, 'não deveria assumir antes do prazo');
    check(conexoes.length >= 3, 'deveria repetir tentativas curtas ao mesmo host, foram: ' + conexoes.length);
    tempo.advance(2500);
    check(amb.registro.spies.becomeHost === 1, 'o backup deveria assumir até o fim do prazo');
    check(conexoes.every(c => c.peer === 'sala'), 'antes de assumir, só deveria procurar o host atual');
    check(conexoes.every(c => c.fechada || c.open), 'tentativas que não abriram deveriam ser fechadas');

    // O prazo vem da configuração.
    const amb2 = usar(createEnvironment());
    const tempo2 = amb2.fakeTime();
    backupGuest(amb2);
    amb2.guestPeer();
    amb2.CONFIG.JOGO.HOST_TIMEOUT = 20000;
    amb2.ctx.handleHostDisconnect();
    tempo2.advance(12000);
    check(amb2.registro.spies.becomeHost === 0, 'com HOST_TIMEOUT de 20s, não deveria assumir aos 12s');
    tempo2.advance(8000);
    check(amb2.registro.spies.becomeHost === 1, 'com HOST_TIMEOUT de 20s, deveria assumir aos 20s');

    // Valor do jogo de verdade.
    const ctxConfig = vm.createContext({});
    vm.runInContext('var window = this;' + fs.readFileSync(path.join(RAIZ, 'config/game-config.js'), 'utf8'), ctxConfig);
    check(vm.runInContext('CONFIG.JOGO.HOST_TIMEOUT', ctxConfig) === 10000, 'config/game-config.js deveria ter HOST_TIMEOUT de 10000 ms');
});

test('T40 Segunda queda durante a espera não abre outra cadeia de tentativas', (usar) => {
    const amb = usar(createEnvironment());
    const tempo = amb.fakeTime();
    backupGuest(amb);
    const conexoes = amb.guestPeer();

    amb.ctx.handleHostDisconnect();
    amb.ctx.handleHostDisconnect();
    check(conexoes.length === 1, 'a segunda queda não deveria disparar outra tentativa, houve ' + conexoes.length);
    tempo.advance(amb.CONFIG.JOGO.HOST_TIMEOUT);
    check(amb.registro.spies.becomeHost === 1, 'deveria decidir uma única vez, decidiu ' + amb.registro.spies.becomeHost);

    // Terminada a espera, uma queda nova (ex: do novo host) abre outra.
    const antes = conexoes.length;
    amb.ctx.handleHostDisconnect();
    check(conexoes.length === antes + 1, 'depois do prazo, uma queda nova deveria abrir uma espera nova');
});

test('T41 Host antigo volta depois da migração: entra como jogador comum com o token dele', (usar) => {
    const amb = usar(createEnvironment());
    amb.state.isHost = false;
    amb.state.playerName = 'B';
    amb.state.peerId = 'peer-b';
    amb.state.baseRoomPeerId = 'sala';
    amb.state.hostVersion = 0;
    amb.state.gameStarted = true;
    amb.state.gameOver = false;
    amb.state.currentRound = null;
    amb.state.players = [
        { name: 'Host', peerId: 'sala', isHost: true, kpi: 7, recursos: 4, phase: 'planejamento', activities: 1, tokenHash: amb.hash(tokenOf('Host')) },
        { name: 'A', peerId: 'peer-a', isHost: false, kpi: 0, recursos: 10, phase: 'iniciacao', activities: 0, tokenHash: amb.hash(tokenOf('A')) },
        { name: 'B', peerId: 'peer-b', isHost: false, kpi: 0, recursos: 10, phase: 'iniciacao', activities: 0, tokenHash: amb.hash(tokenOf('B')) }
    ];

    amb.takeOverAsHost();
    const antigo = amb.player('Host');
    check(antigo && !antigo.isHost && antigo.disconnected, 'host antigo: jogador comum desconectado');
    check(antigo.kpi === 7 && antigo.recursos === 4 && antigo.tokenHash === amb.hash(tokenOf('Host')), 'KPI, recursos e hash do host antigo preservados');
    check(amb.state.partidaPausada, 'pré-condição: partida pausada, só o novo host conectado');

    amb.join('Host', 'peer-impostor', 'token-de-outro-navegador');
    check(amb.rejectionFor('peer-impostor') === 'identity-mismatch', 'impostor com o nome do host antigo deveria ser recusado, veio: ' + amb.rejectionFor('peer-impostor'));

    amb.clearLog();
    amb.join('Host', 'peer-host-voltou');
    check(amb.rejectionFor('peer-host-voltou') === null, 'o host antigo deveria conseguir voltar, veio: ' + amb.rejectionFor('peer-host-voltou'));
    check(!antigo.disconnected && antigo.peerId === 'peer-host-voltou' && antigo.isHost === false, 'volta conectado, como jogador comum');
    check(antigo.kpi === 7, 'volta com o KPI dele');
    check(amb.state.isHost && amb.player('B').isHost && amb.state.players.filter(p => p.isHost).length === 1, 'B continua sendo o único host');
    check(!amb.state.partidaPausada && amb.state.currentRound, 'com a volta dele, a partida retoma');
    const lista = amb.broadcastsOfType('player-list').pop();
    check(lista && lista.players.find(p => p.name === 'Host').isHost === false, 'a lista enviada aos outros mostra o host antigo como jogador comum');
});

test('T42 Quem assume como host marca host=true na URL (F5 volta como host na sala nova)', (usar) => {
    const amb = usar(createEnvironment());
    const url = amb.fakeUrl('https://exemplo.github.io/jogo/game.html?host=false&room=sala&playerName=B&peerId=sala');
    amb.state.isHost = false;
    amb.state.playerName = 'B';
    amb.state.peerId = 'peer-b';
    amb.state.baseRoomPeerId = 'sala';
    amb.state.hostVersion = 0;
    amb.state.gameStarted = true;
    amb.state.gameOver = false;
    amb.state.players = [
        { name: 'Host', peerId: 'sala', isHost: true },
        { name: 'B', peerId: 'peer-b', isHost: false }
    ];

    amb.takeOverAsHost();
    check(url.param('host') === 'true', 'a URL deveria passar a dizer host=true, diz: ' + url.param('host'));
    check(url.param('peerId') === 'sala' && url.param('room') === 'sala' && url.param('playerName') === 'B',
        'os outros parâmetros (peerId = ID base da sala) não mudam: ' + amb.ctx.location.href);
    check(url.trocas.length === 1, 'deveria trocar a URL sem recarregar (replaceState), uma vez');

    amb.Game.network.registrarPapelNaUrl(false);
    check(url.param('host') === 'false', 'registrarPapelNaUrl(false) deveria voltar para host=false');

    // Sem history/URL disponíveis: não quebra.
    const amb2 = usar(createEnvironment());
    let erro = null;
    try { amb2.Game.network.registrarPapelNaUrl(true); } catch (e) { erro = e; }
    check(!erro, 'sem URL/history, não deveria lançar erro');
});

test('T43 Host antigo recarregando: se outro assumiu, volta como jogador comum; senão, segue host', (usar) => {
    const prepareOldHost = (amb) => {
        const url = amb.fakeUrl('https://exemplo.github.io/jogo/game.html?host=true&room=sala&playerName=Host&peerId=sala');
        amb.state.isHost = true;
        amb.state.playerName = 'Host';
        amb.state.baseRoomPeerId = 'sala';
        amb.state.hostPeerId = 'sala';
        amb.state.hostVersion = 0;
        amb.state.gameStarted = true;
        amb.state.players = [
            { name: 'Host', peerId: 'sala', isHost: true, kpi: 7 },
            { name: 'A', peerId: 'peer-a', isHost: false },
            { name: 'B', peerId: 'peer-b', isHost: false }
        ];
        return url;
    };
    /** Uma conexão falsa por destino; openNow(destino) simula a sala respondendo. */
    const connectionsByTarget = () => {
        const mapa = {};
        return {
            mapa,
            aoConectar: (destino) => {
                const h = {};
                const c = { peer: destino, open: false, fechada: false, on: (ev, cb) => { h[ev] = cb; }, send: () => {}, close() { c.fechada = true; }, fire: (ev) => h[ev] && h[ev]() };
                mapa[destino] = c;
                return c;
            },
            openNow: (destino) => { mapa[destino].open = true; mapa[destino].fire('open'); }
        };
    };
    const unavailableForAll = (peer, exceto = []) => {
        peer.conexoesPedidas.filter(d => !exceto.includes(d)).forEach(d =>
            peer.fire('error', { type: 'peer-unavailable', message: 'Could not connect to peer ' + d }));
    };

    // 1) A sala seguinte responde: a migração aconteceu.
    const amb = usar(createEnvironment());
    const url = prepareOldHost(amb);
    const conns = connectionsByTarget();
    const peers = amb.installFakePeer({ aoConectar: conns.aoConectar });
    amb.Game.network.retomarComoJogadorSeOutroAssumiu();
    const sonda = peers[0];
    check(sonda && sonda.id === undefined, 'deveria sondar com um peer temporário (ID aleatório), não com o ID da sala');
    check(sonda.opcoesPeer && sonda.opcoesPeer !== amb.CONFIG.PEER && sonda.opcoesPeer.debug === amb.CONFIG.PEER.debug, 'a sonda usa uma cópia de CONFIG.PEER');
    check(amb.Game.network.connectionState.getPeer() !== sonda, 'a sonda não pode virar o peer do jogo');
    sonda.fire('open', 'peer-sonda');
    check(sonda.conexoesPedidas.includes('sala-h1'), 'deveria procurar a versão seguinte do host (sala-h1), procurou: ' + sonda.conexoesPedidas.join(','));
    check(!sonda.conexoesPedidas.includes('sala'), 'não deveria procurar a própria versão (sala)');
    check(amb.state.isHost, 'antes da resposta, nada muda');
    conns.openNow('sala-h1');
    check(!amb.state.isHost, 'deveria deixar de ser host');
    check(amb.state.hostVersion === 1 && amb.state.hostPeerId === 'sala-h1', 'deveria apontar para a sala nova: ' + amb.state.hostPeerId);
    check(amb.player('Host').isHost === false && amb.player('Host').kpi === 7, 'a própria entrada deixa de ser host, dados preservados');
    check(url.param('host') === 'false' && url.param('peerId') === 'sala', 'a URL deveria passar a host=false (peerId base igual): ' + amb.ctx.location.href);
    check(sonda.destroyed && conns.mapa['sala-h1'].fechada, 'a sonda deveria ser encerrada');

    // 1b) D3c: duas migrações enquanto ele estava fora — a sala está em sala-h2.
    const ambB = usar(createEnvironment());
    prepareOldHost(ambB);
    const connsB = connectionsByTarget();
    const peersB = ambB.installFakePeer({ aoConectar: connsB.aoConectar });
    ambB.Game.network.retomarComoJogadorSeOutroAssumiu();
    peersB[0].fire('open', 'peer-sonda');
    unavailableForAll(peersB[0], ['sala-h2']);
    check(ambB.state.isHost, 'enquanto sala-h2 não responde, nada muda');
    connsB.openNow('sala-h2');
    check(!ambB.state.isHost && ambB.state.hostVersion === 2 && ambB.state.hostPeerId === 'sala-h2',
        'deveria achar a sala em sala-h2, apontou para: ' + ambB.state.hostPeerId);

    // 2) Ninguém em nenhuma versão seguinte (peer-unavailable em todas): segue como host.
    const amb2 = usar(createEnvironment());
    const url2 = prepareOldHost(amb2);
    const peers2 = amb2.installFakePeer({ aoConectar: connectionsByTarget().aoConectar });
    amb2.Game.network.retomarComoJogadorSeOutroAssumiu();
    peers2[0].fire('open', 'peer-sonda');
    unavailableForAll(peers2[0]);
    check(amb2.state.isHost && amb2.state.hostVersion === 0 && amb2.state.hostPeerId === 'sala', 'sem migração, continua host da sala de sempre');
    check(url2.trocas.length === 0, 'sem migração, a URL não muda');
    check(peers2[0].destroyed, 'a sonda deveria ser encerrada');

    // 3) Sem resposta no tempo limite: segue como host; resposta tardia é ignorada.
    const amb3 = usar(createEnvironment());
    const tempo3 = amb3.fakeTime();
    prepareOldHost(amb3);
    const conns3 = connectionsByTarget();
    const peers3 = amb3.installFakePeer({ aoConectar: conns3.aoConectar });
    amb3.Game.network.retomarComoJogadorSeOutroAssumiu();
    peers3[0].fire('open', 'peer-sonda');
    tempo3.advance(10000);
    check(amb3.state.isHost && peers3[0].destroyed, 'sem resposta, segue como host e encerra a sonda');
    conns3.openNow('sala-h1');
    check(amb3.state.isHost && amb3.state.hostVersion === 0, 'resposta depois do tempo limite não pode mudar o papel');

    // 4) Guest não sonda nada.
    const amb4 = usar(createEnvironment());
    const peers4 = amb4.installFakePeer();
    amb4.state.isHost = false;
    amb4.Game.network.retomarComoJogadorSeOutroAssumiu();
    check(peers4.length === 0, 'guest não deveria criar sonda');

    // 5) main.js: a verificação roda só para host com sessão restaurada,
    // antes de abrir o ID de host.
    const main = fs.readFileSync(path.join(RAIZ, 'js/main.js'), 'utf8');
    const chamada = main.search(/if \(restaurou && state\.isHost\) \{\s*await Game\.network\.retomarComoJogadorSeOutroAssumiu\(\);/);
    check(chamada >= 0, 'init() deveria chamar retomarComoJogadorSeOutroAssumiu() para host com sessão restaurada');
    check(chamada < main.indexOf('await initPeerWithRetry()'), 'a verificação deveria vir antes de abrir o peer');
});

/** Peer falso mínimo para a procura: uma conexão controlável por destino. */
function searchPeer() {
    const conexoes = {};
    const pedidos = [];
    return {
        conexoes, pedidos, destroyed: false,
        connect(destino) {
            const h = {};
            const c = { peer: destino, open: false, fechada: false, on: (ev, cb) => { h[ev] = cb; }, send: () => {}, close() { c.fechada = true; }, fire: (ev) => h[ev] && h[ev]() };
            conexoes[destino] = c;
            pedidos.push(destino);
            return c;
        },
        openNow(destino) { conexoes[destino].open = true; conexoes[destino].fire('open'); }
    };
}

test('T44 Procura da sala: várias versões ao mesmo tempo, descarta as que não existem, fica com a que abre', (usar) => {
    const amb = usar(createEnvironment());
    const net = amb.Game.network;
    const peer = searchPeer();
    let achado = null;
    let desistiu = 0;

    net.procurarHost(peer, 'sala', {
        aoAchar: (conn, versao, id) => { achado = { conn, versao, id }; },
        aoDesistir: () => { desistiu++; }
    });
    check(peer.pedidos.join(',') === 'sala,sala-h1,sala-h2,sala-h3,sala-h4,sala-h5',
        'deveria procurar o ID base e 5 versões seguintes, procurou: ' + peer.pedidos.join(','));

    // "sala-h1 não existe" não pode descartar "sala" (o nome de um contém o do outro).
    net.avisarPeerIndisponivel(unavailable('sala-h1'));
    check(peer.conexoes['sala-h1'].fechada && !peer.conexoes['sala'].fechada, 'só a versão indisponível deveria ser descartada');
    ['sala', 'sala-h3', 'sala-h4', 'sala-h5'].forEach(id => net.avisarPeerIndisponivel(unavailable(id)));
    check(!achado && desistiu === 0, 'ainda falta sala-h2 responder');
    peer.openNow('sala-h2');
    check(achado && achado.versao === 2 && achado.id === 'sala-h2' && achado.conn === peer.conexoes['sala-h2'], 'deveria achar sala-h2');
    check(!achado.conn.fechada, 'a conexão achada fica aberta para quem chamou');
    net.avisarPeerIndisponivel(unavailable('sala-h2'));
    check(desistiu === 0, 'depois de achar, avisos atrasados não mudam nada');

    // Nenhuma versão existe: desiste uma vez só.
    const peer2 = searchPeer();
    let desistiu2 = 0;
    net.procurarHost(peer2, 'sala', { versaoInicial: 3, versoes: 2, aoAchar: () => { throw new Error('não deveria achar'); }, aoDesistir: () => { desistiu2++; } });
    check(peer2.pedidos.join(',') === 'sala-h3,sala-h4', 'deveria começar da versão inicial, procurou: ' + peer2.pedidos.join(','));
    peer2.pedidos.forEach(id => net.avisarPeerIndisponivel(unavailable(id)));
    net.avisarPeerIndisponivel(unavailable('sala-h4'));
    check(desistiu2 === 1, 'deveria desistir exatamente uma vez, desistiu ' + desistiu2);

    // Sem resposta nenhuma: desiste no tempo máximo, fechando tudo.
    const tempo = amb.fakeTime();
    const peer3 = searchPeer();
    let desistiu3 = 0;
    net.procurarHost(peer3, 'sala', { aoAchar: () => {}, aoDesistir: () => { desistiu3++; } });
    tempo.advance(4000);
    check(desistiu3 === 0, 'não deveria desistir antes do tempo máximo');
    tempo.advance(2000);
    check(desistiu3 === 1 && Object.values(peer3.conexoes).every(c => c.fechada), 'no tempo máximo, desiste e fecha as conexões');

    // cancelar(): encerra sem chamar nada.
    const peer4 = searchPeer();
    let chamou = false;
    const busca = net.procurarHost(peer4, 'sala', { aoAchar: () => { chamou = true; }, aoDesistir: () => { chamou = true; } });
    busca.cancelar();
    tempo.advance(10000);
    check(!chamou && Object.values(peer4.conexoes).every(c => c.fechada), 'cancelada, não chama ninguém e fecha tudo');

    // Sem peer utilizável: desiste na hora, sem erro.
    let desistiu5 = 0;
    net.procurarHost({ destroyed: true, connect: () => { throw new Error('não'); } }, 'sala', { aoAchar: () => {}, aoDesistir: () => { desistiu5++; } });
    check(desistiu5 === 1, 'sem peer utilizável, deveria desistir na hora');
    check(amb.Game.computeHostPeerId('sala', 0) === 'sala' && amb.Game.computeHostPeerId('sala', 3) === 'sala-h3', 'regra dos IDs de host inalterada');
});

test('T45 Guest entra/volta pelo ID base depois de migrações: acha a versão atual e manda o player-join', (usar) => {
    // Entrando agora (versão 0 conhecida), sala já em sala-h1.
    const amb = usar(createEnvironment());
    amb.state.isHost = false;
    amb.state.playerName = 'A';
    amb.state.baseRoomPeerId = 'sala';
    amb.state.hostPeerId = 'sala';
    amb.state.hostVersion = 0;
    const conns = {};
    const peers = amb.installFakePeer({
        aoConectar: (destino) => {
            const h = {};
            const c = { peer: destino, open: false, fechada: false, on: (ev, cb) => { h[ev] = cb; }, send: () => {}, close() { if (c.open && h.close) { c.open = false; h.close(); } c.fechada = true; }, fire: (ev) => h[ev] && h[ev]() };
            conns[destino] = c;
            return c;
        }
    });
    amb.Game.network.initPeer().catch(() => {});
    const peer = peers[0];
    peer.fire('open', 'peer-a');
    check(peer.conexoesPedidas.includes('sala') && peer.conexoesPedidas.includes('sala-h1'),
        'deveria procurar o ID base e as versões seguintes, procurou: ' + peer.conexoesPedidas.join(','));
    // Pelo handler de erro REAL do peer (peerService.initPeer).
    peer.fire('error', unavailable('sala'));
    check(conns['sala'].fechada, 'o erro peer-unavailable do peer deveria descartar a versão que não existe');
    check(amb.registro.paraHost.length === 0, 'antes de achar, não manda nada');
    conns['sala-h1'].open = true;
    conns['sala-h1'].fire('open');
    check(amb.state.hostVersion === 1 && amb.state.hostPeerId === 'sala-h1', 'deveria passar a usar sala-h1, usa: ' + amb.state.hostPeerId);
    check(amb.Game.network.connectionState.getConnection('sala-h1') === conns['sala-h1'], 'a conexão com o host deveria ficar registrada');
    const joins = amb.registro.paraHost.filter(m => m.type === 'player-join');
    check(joins.length === 1 && joins[0].token === amb.Game.identity.obterTokenDaSala('sala'), 'deveria mandar um player-join, com o token');
    check(['sala-h2', 'sala-h3', 'sala-h4', 'sala-h5'].every(id => conns[id].fechada), 'as outras tentativas deveriam ser fechadas');

    // A conexão achada passa pelo handleConnection() real: queda do host é percebida.
    let quedas = 0;
    amb.Game.network.handleHostDisconnect = () => { quedas++; };
    conns['sala-h1'].close();
    check(quedas === 1, 'queda da conexão achada deveria acionar o tratamento de queda do host');

    // Voltando com a sessão restaurada (versão 1), sala já em sala-h2.
    const amb2 = usar(createEnvironment());
    amb2.state.isHost = false;
    amb2.state.playerName = 'A';
    amb2.state.baseRoomPeerId = 'sala';
    amb2.state.hostPeerId = 'sala-h1';
    amb2.state.hostVersion = 1;
    const peers2 = amb2.installFakePeer({ aoConectar: connectionThatOpens('sala-h2') });
    amb2.Game.network.initPeer().catch(() => {});
    peers2[0].fire('open', 'peer-a2');
    check(!peers2[0].conexoesPedidas.includes('sala'), 'deveria começar da versão salva, procurou: ' + peers2[0].conexoesPedidas.join(','));
    check(amb2.state.hostVersion === 2 && amb2.state.hostPeerId === 'sala-h2', 'deveria achar sala-h2, usa: ' + amb2.state.hostPeerId);

    // Sala não existe em versão nenhuma: avisa o jogador.
    const amb3 = usar(createEnvironment());
    amb3.state.isHost = false;
    amb3.state.baseRoomPeerId = 'sala';
    amb3.state.hostVersion = 0;
    const peers3 = amb3.installFakePeer({ aoConectar: connectionThatOpens(null) });
    amb3.Game.network.initPeer().catch(() => {});
    peers3[0].fire('open', 'peer-x');
    amb3.clearLog();
    peers3[0].conexoesPedidas.forEach(id => peers3[0].fire('error', unavailable(id)));
    check(amb3.registro.ui.includes('updateConnectionStatus'), 'sem sala, deveria mostrar o erro de conexão');
    check(!peers3[0].destroyed, 'o peer do jogador continua (pode tentar de novo)');
});

/** aoConectar para installFakePeer: só a conexão com `destinoQueAbre` abre (na hora em que o handler 'open' é registrado). */
function connectionThatOpens(destinoQueAbre) {
    return (destino) => {
        const c = {
            peer: destino, open: false,
            on: (ev, cb) => { if (ev === 'open' && destino === destinoQueAbre) { c.open = true; cb(); } },
            send: () => {}, close: () => { c.open = false; }
        };
        return c;
    };
}

test('T46 Assumir como host não manda reconectar o peer novo (erro "cannot reconnect")', (usar) => {
    const amb = usar(createEnvironment());
    const tempo = amb.fakeTime();
    amb.state.isHost = false;
    amb.state.baseRoomPeerId = 'sala';
    const peers = amb.installFakePeer();
    amb.Game.network.initPeer().catch(() => {});
    const peerAntigo = peers[0];
    peerAntigo.fire('open', 'peer-b');

    // becomeHost(): destrói o peer antigo (o PeerJS dispara 'disconnected'
    // dentro do destroy) e passa a usar o peer novo, já conectado.
    const peerNovo = new amb.ctx.Peer('sala-h1');
    amb.Game.network.connectionState.setPeer(peerNovo);
    peerAntigo.destroyed = true;
    peerAntigo.disconnected = true;
    amb.clearLog();
    peerAntigo.fire('disconnected');
    check(!amb.registro.ui.includes('updateConnectionStatus'), 'o novo host não deveria ver "Desconectado" por causa do peer antigo');
    tempo.advance(5000);
    check(peerNovo.reconexoes === 0, 'não deveria mandar reconectar o peer novo');
    check(peerAntigo.reconexoes === 0, 'nem o peer destruído');

    // Controle: o peer em uso perdeu o servidor de verdade — reconecta.
    const amb2 = usar(createEnvironment());
    const tempo2 = amb2.fakeTime();
    amb2.state.isHost = false;
    amb2.state.baseRoomPeerId = 'sala';
    const peers2 = amb2.installFakePeer();
    amb2.Game.network.initPeer().catch(() => {});
    peers2[0].fire('open', 'peer-b');
    peers2[0].disconnected = true;
    peers2[0].fire('disconnected');
    tempo2.advance(5000);
    check(peers2[0].reconexoes === 1, 'peer em uso desconectado do servidor deveria reconectar uma vez, reconectou ' + peers2[0].reconexoes);

    // Se o PeerJS já tiver reconectado sozinho antes dos 3s, não manda de novo.
    peers2[0].fire('disconnected');
    peers2[0].disconnected = false;
    tempo2.advance(5000);
    check(peers2[0].reconexoes === 1, 'peer que já voltou ao servidor não deveria ser reconectado');
});

/** Guest B prestes a assumir, com a lista que recebeu do host antigo. */
function guestBeforeTakeover(amb, { round, respondidos, players }) {
    amb.state.isHost = false;
    amb.state.playerName = 'B';
    amb.state.peerId = 'peer-b';
    amb.state.baseRoomPeerId = 'sala';
    amb.state.hostVersion = 0;
    amb.state.gameStarted = true;
    amb.state.gameOver = false;
    amb.state.currentRound = round;
    amb.state.usedRespondedorThisRound = respondidos;
    amb.state.players = players.map(([name, extra]) => Object.assign(
        { name, peerId: name === 'Host' ? 'sala' : 'peer-' + name.toLowerCase(), isHost: name === 'Host',
          kpi: 0, recursos: 10, phase: 'iniciacao', activities: 0, tokenHash: amb.hash(tokenOf(name)) },
        extra || {}));
}

test('T49 Quem já respondeu na rodada chega aos guests (resposta, nova dupla, reconexão) e fica guardado', (usar) => {
    const host = usar(createEnvironment());
    host.createRoomAsHost();
    host.join('A', 'peer-a');
    host.join('B', 'peer-b');
    host.startMatch();
    const rs0 = host.broadcastsOfType('round-start').pop();
    check(rs0 && Array.isArray(rs0.respondidos) && rs0.respondidos.length === 0, 'rodada nova: round-start com a lista vazia');

    const r = host.state.currentRound;
    host.Game.core.handleAnswer({ alternativa: r.pergunta.correct, playerName: r.respondedor });
    const kpi = host.broadcastsOfType('kpi-update').find(m => m.playerName === r.respondedor);
    check(kpi && Array.isArray(kpi.respondidos) && kpi.respondidos.includes(r.respondedor),
        'a atualização da resposta deveria levar a lista já com quem respondeu, veio: ' + JSON.stringify(kpi && kpi.respondidos));

    host.Game.core.nextTurn();
    const rs1 = host.broadcastsOfType('round-start').pop();
    check(rs1 !== rs0 && rs1.respondidos.includes(r.respondedor), 'a próxima dupla deveria levar a lista');

    const outro = ['A', 'B'].find(n => n !== r.respondedor && n !== 'Host') || 'A';
    host.drop('peer-' + outro.toLowerCase());
    host.join(outro, 'peer-volta');
    const sync = syncTo(host, 'peer-volta');
    check(sync && JSON.stringify(sync.respondidos) === JSON.stringify(host.state.usedRespondedorThisRound),
        'quem reconecta deveria receber a lista, veio: ' + JSON.stringify(sync && sync.respondidos));

    // Lado do guest.
    const g = usar(createEnvironment());
    g.state.isHost = false;
    g.state.playerName = 'B';
    g.state.players = [{ name: 'A', kpi: 0 }, { name: 'B', kpi: 0 }];
    g.Game.network.handleMessage({ type: 'kpi-update', playerName: 'A', kpi: 10, phase: 'iniciacao', activities: 1, recursos: 10, respondidos: ['A'] }, 'sala');
    check(JSON.stringify(g.state.usedRespondedorThisRound) === '["A"]', 'guest deveria guardar a lista da resposta');
    g.Game.network.handleMessage({ type: 'round-start', evento: { id: 'e1' }, perguntador: 'A', respondedor: 'B', respondidos: ['A', 'C'] }, 'sala');
    check(JSON.stringify(g.state.usedRespondedorThisRound) === '["A","C"]', 'guest deveria guardar a lista da nova dupla');
    g.Game.network.handleMessage({ type: 'kpi-update', playerName: 'A', kpi: 15, phase: 'iniciacao', activities: 1, recursos: 10, assessoriaBonus: 5 }, 'sala');
    check(JSON.stringify(g.state.usedRespondedorThisRound) === '["A","C"]', 'mensagem sem a lista não deveria apagar a lista');
    g.receiveSync('B', { players: [], baralhos: {}, timer: 500, gameStarted: true, hostVersion: 0, currentRound: null, respondidos: ['Host'] });
    check(JSON.stringify(g.state.usedRespondedorThisRound) === '["Host"]', 'guest deveria guardar a lista da reconexão');

    // O host nunca troca a própria lista pela de uma mensagem.
    host.state.usedRespondedorThisRound = ['Host'];
    host.Game.network.handleMessage({ type: 'round-start', evento: { id: 'e1' }, perguntador: 'A', respondedor: 'B', respondidos: [] }, 'peer-a');
    check(JSON.stringify(host.state.usedRespondedorThisRound) === '["Host"]', 'host não deveria sobrescrever a própria lista');
});

test('T50 Troca de host logo depois de uma resposta: se todos já responderam, a rodada fica encerrada', (usar) => {
    // D já estava desconectado antes da queda do host (não conta, como no T8).
    // Como no jogo, a cópia da rodada no guest não marca `respondeu`: o
    // sinal de pergunta respondida é o Respondedor estar no rodízio.
    const players = [['Host'], ['A'], ['B'], ['D', { disconnected: true }]];
    const round = { evento: { id: 'e1' }, perguntador: 'A', respondedor: 'Host', pergunta: null, respondeu: false };

    const amb = usar(createEnvironment());
    guestBeforeTakeover(amb, { round, respondidos: ['A', 'B', 'Host'], players });
    amb.takeOverAsHost();
    check(amb.state.rodadaEncerrada === true && amb.state.currentRound === null && !amb.state.partidaPausada,
        'todos os que estavam ativos já responderam: a rodada deveria ficar encerrada');
    amb.clearLog();
    amb.join('A', 'peer-a2');
    check(amb.broadcastsOfType('round-start').length === 0, 'a volta de A não pode começar rodada sozinha');

    // O host antigo (que saiu) não precisa ter respondido para a rodada acabar.
    const ambH = usar(createEnvironment());
    guestBeforeTakeover(ambH, { round: { ...round, perguntador: 'Host', respondedor: 'A' }, respondidos: ['B', 'A'], players });
    ambH.takeOverAsHost();
    check(ambH.state.rodadaEncerrada === true && !ambH.state.partidaPausada,
        'sem contar o host antigo, todos já responderam: deveria ficar encerrada');

    // Controle: B ainda não tinha respondido — a rodada continua, sem repetir ninguém.
    const amb2 = usar(createEnvironment());
    guestBeforeTakeover(amb2, { round, respondidos: ['A', 'Host'], players });
    amb2.takeOverAsHost();
    check(!amb2.state.rodadaEncerrada && amb2.state.partidaPausada && amb2.state.partidaPausada.evento === round.evento,
        'ainda falta B: deveria pausar com o mesmo evento');
    amb2.join('A', 'peer-a2');
    const r = amb2.state.currentRound;
    check(r && r.respondedor === 'B' && r.evento === round.evento,
        'a rodada deveria continuar com B respondendo (A e o host antigo já responderam), veio: ' + JSON.stringify(r && { p: r.perguntador, r: r.respondedor }));

    // O novo host era o Perguntador de uma pergunta JÁ respondida: não pode reabri-la.
    const amb3 = usar(createEnvironment());
    const pergunta = { type: 'question', question: 'Pergunta?', alternatives: ['A', 'B', 'C', 'D'], correct: 'A' };
    guestBeforeTakeover(amb3, {
        round: { evento: { id: 'e1' }, perguntador: 'B', respondedor: 'A', pergunta, respondeu: false },
        respondidos: ['A'], players: [['Host'], ['A'], ['B'], ['C']]
    });
    amb3.takeOverAsHost();
    check(!amb3.registro.ui.includes('displayQuestion'), 'não deveria reabrir a pergunta que A já respondeu');
    check(amb3.state.currentRound === null && amb3.state.partidaPausada, 'deveria seguir para a próxima dupla (pausa até alguém voltar)');
    amb3.join('C', 'peer-c2');
    const r3 = amb3.state.currentRound;
    check(r3 && r3.respondedor !== 'A', 'A não pode responder de novo nesta rodada, veio: ' + JSON.stringify(r3 && r3.respondedor));
});

test('T51 Pergunta em aberto descartada na troca de host: quem ia responder não perde a vez', (usar) => {
    // O host antigo perguntava para A; B e C já tinham respondido.
    const amb = usar(createEnvironment());
    const round = { evento: { id: 'e1' }, perguntador: 'Host', respondedor: 'A', pergunta: null, respondeu: false };
    guestBeforeTakeover(amb, { round, respondidos: [], players: [['Host'], ['A'], ['B'], ['C']] });
    // A lista chega como no jogo: na atualização da última resposta.
    amb.Game.network.handleMessage({ type: 'kpi-update', playerName: 'C', kpi: 10, phase: 'iniciacao', activities: 1, recursos: 10, respondidos: ['B', 'C'] }, 'sala');
    amb.takeOverAsHost();
    check(!amb.state.usedRespondedorThisRound.includes('A'), 'A não respondeu: não pode entrar no rodízio');
    check(amb.state.partidaPausada && !amb.state.rodadaEncerrada, 'pré-condição: pausa até alguém voltar');

    amb.join('A', 'peer-a2');
    const r = amb.state.currentRound;
    check(r && r.respondedor === 'A' && r.perguntador !== 'Host', 'A deveria responder na retomada, veio: ' + JSON.stringify(r && { p: r.perguntador, r: r.respondedor }));
    check(r.evento === round.evento, 'com o mesmo evento');

    // A responde: B e C já responderam, C e o host antigo estão fora — a rodada acaba.
    amb.Game.core.handleAnswer({ alternativa: r.pergunta.correct, playerName: 'A' });
    amb.clearLog();
    amb.Game.core.nextTurn();
    check(amb.state.rodadaEncerrada === true && amb.broadcastsOfType('round-start').length === 0,
        'depois de A, a rodada deveria encerrar sem repetir ninguém');
});

test('T61 Quem assume como host liga o relógio da partida (a mesma contagem do início) e não manda host-changed', (usar) => {
    // A era o Perguntador: a rodada continua com o novo host (como no T21b).
    function guestInMatch() {
        const a = usar(createEnvironment());
        const r = a.fakeClock();
        a.state.isHost = false;
        a.state.playerName = 'A';
        a.state.peerId = 'peer-a';
        a.state.baseRoomPeerId = 'sala';
        a.state.hostVersion = 0;
        a.state.gameStarted = true;
        a.state.gameOver = false;
        a.state.timer = 11;
        const pergunta = { type: 'question', question: 'Pergunta?', alternatives: ['a', 'b', 'c', 'd'], correct: 'a', id: 'q9', isPerguntador: true };
        a.state.currentRound = { evento: { id: 'e1' }, perguntador: 'A', respondedor: 'B', pergunta, respondeu: false };
        a.state.players = [
            { name: 'Host', peerId: 'sala', isHost: true, kpi: 0, recursos: 10, phase: 'iniciacao', activities: 0 },
            { name: 'A', peerId: 'peer-a', isHost: false, kpi: 0, recursos: 10, phase: 'iniciacao', activities: 0 },
            { name: 'B', peerId: 'peer-b', isHost: false, kpi: 0, recursos: 10, phase: 'iniciacao', activities: 0 }
        ];
        return { amb: a, relogio: r };
    }

    // Sem contagem ligada antes: quem liga é a troca de host.
    const { amb, relogio } = guestInMatch();
    amb.takeOverAsHost();
    check(amb.state.isHost, 'pré-condição: A deveria ser o novo host');
    check(relogio.activeCount() === 1, 'assumir com a partida em andamento deveria ligar o relógio, ligados: ' + relogio.activeCount());
    check(amb.broadcastsOfType('host-changed').length === 0, 'não deveria mandar host-changed (ninguém está conectado à sala nova)');

    relogio.tick();
    const aviso = amb.broadcastsOfType('timer-update').pop();
    check(amb.state.timer === 10 && aviso && aviso.remaining === 10, 'o novo host deveria contar e avisar os guests a cada 10 segundos');

    amb.state.timer = 1;
    relogio.tick();
    check(amb.state.gameOver && amb.broadcastsOfType('game-over').length === 1 && relogio.activeCount() === 0,
        'no zero, o novo host encerra a partida');

    // Com a contagem que o guest já tinha (ligada na entrada ou na
    // reconexão): continua uma só.
    const comRelogio = guestInMatch();
    comRelogio.amb.Game.core.iniciarRelogio();
    check(comRelogio.relogio.activeCount() === 1, 'pré-condição: relógio do guest ligado');
    comRelogio.amb.takeOverAsHost();
    check(comRelogio.relogio.activeCount() === 1, 'só pode haver uma contagem ligada depois de assumir, ligadas: ' + comRelogio.relogio.activeCount());

    // No lobby, assumir não liga relógio.
    const lobby = usar(createEnvironment());
    const relogio2 = lobby.fakeClock();
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
    check(relogio2.activeCount() === 0, 'no lobby não deveria ligar o relógio');
    check(lobby.broadcastsOfType('host-changed').length === 0, 'no lobby também não deveria mandar host-changed');

    // Uma contagem só (sessionEngine.iniciarRelogio) e nada de host-changed no código.
    const migracao = fs.readFileSync(path.join(RAIZ, 'js/network/hostMigration.js'), 'utf8');
    const mensagens = fs.readFileSync(path.join(RAIZ, 'js/network/messageHandler.js'), 'utf8');
    check(!/setInterval/.test(migracao), 'hostMigration.js não deveria ter contagem própria (usar Game.core.iniciarRelogio())');
    check(!/host-changed/.test(migracao) && !/host-changed/.test(mensagens), 'a mensagem host-changed não deveria existir mais');
    check(typeof amb.Game.network.reconnectToNewHost === 'undefined', 'reconnectToNewHost() só servia ao host-changed e deveria ter saído');
});

finish('Troca de host');
