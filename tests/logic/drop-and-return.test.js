// ============================================
// PM: The KPI Master - Testes de lógica: Queda e volta de jogador
// ============================================
// Jogador que cai e volta: lugar reservado, rodada abortada, pausa por
// falta de conexão, saída da página e o que quem volta recebe (relógio,
// situação da rodada).
// Ambiente simulado e ajudantes: environment.js. Rodar a partir da raiz:
//     node tests/logic/drop-and-return.test.js
// ============================================

const {
    fs, path, vm, ROOT, createEnvironment, tokenOf, test, check, start, finish,
    syncTo, roundScreens, unavailable, roomToReload, reloadHost, tryReloadHost, recordScreens
} = require('./environment');

start('Queda e volta de jogador');

test('T4  Queda de espectador: fica na lista, fora do sorteio, volta com tudo preservado', (use) => {
    const env = use(createEnvironment());
    env.createRoomAsHost();
    env.join('A', 'peer-a');
    env.join('B', 'peer-b');
    env.startMatch();
    const a = env.player('A');
    Object.assign(a, { kpi: 7, resources: 4, focusArea: 'planning', activities: 1 });
    env.state.currentRound = { event: { id: 'e1' }, asker: 'Host', answerer: 'B', question: null, answered: false };

    env.clearLog();
    env.drop('peer-a');
    check(env.player('A'), 'A não deveria ter sido removido');
    check(env.player('A').disconnected === true, 'A deveria estar marcado como disconnected');
    check(!env.Game.getActivePlayers().some(p => p.name === 'A'), 'A não deveria estar entre os ativos');
    check(env.state.currentRound && env.state.currentRound.answerer === 'B', 'rodada de espectador não deveria ser abortada');
    const list = env.broadcastsOfType('player-list').pop();
    check(list && list.players.find(p => p.name === 'A').disconnected === true, 'player-list enviado deveria mostrar A desconectado');

    env.join('A', 'peer-a2');
    const returned = env.player('A');
    check(!returned.disconnected, 'A deveria voltar como conectado');
    check(returned.peerId === 'peer-a2', 'peerId de A deveria ser o novo');
    check(returned.kpi === 7 && returned.resources === 4 && returned.focusArea === 'planning' && returned.activities === 1,
        'KPI/recursos/fase/atividades de A deveriam estar preservados');
    check(env.record.sent.some(e => e.to === 'peer-a2' && e.msg.type === 'state-sync'), 'A deveria receber state-sync');

    // 'close' atrasado da conexão antiga não pode derrubar o jogador de novo.
    env.Game.network.handlePlayerDisconnect('peer-a');
    check(!env.player('A').disconnected, 'close atrasado da conexão antiga não deveria marcar A como desconectado');
});

test('T5  Queda de participante: rodada abortada, nova dupla sem ele', (use) => {
    for (let i = 0; i < 20; i++) {
        const env = use(createEnvironment());
        env.createRoomAsHost();
        env.join('A', 'peer-a');
        env.join('B', 'peer-b');
        env.startMatch();
        env.state.currentRound = { event: { id: 'e1' }, asker: 'Host', answerer: 'A', question: null, answered: false };

        env.drop('peer-a');
        const r = env.state.currentRound;
        check(r, 'deveria haver uma nova rodada (rodada ' + i + ')');
        check(r.asker !== 'A' && r.answerer !== 'A', 'A desconectado não pode ser sorteado (rodada ' + i + ')');
    }
});

test('T6  Pausa quando falta só conexão, retomada com o mesmo evento', (use) => {
    const env = use(createEnvironment());
    env.createRoomAsHost();
    env.join('A', 'peer-a');
    env.startMatch();

    env.clearLog();
    env.drop('peer-a');
    check(!env.state.gameOver, 'partida NÃO deveria ter sido encerrada');
    check(env.state.matchPaused, 'partida deveria estar pausada');
    check(env.state.currentRound === null, 'não deveria haver rodada durante a pausa');
    check(env.broadcastsOfType('match-paused').length === 1, 'deveria ter avisado os guests da pausa');
    check(env.record.ui.includes('showMatchPausedMessage'), 'host deveria ver o aviso de pausa');
    const pausedEvent = env.state.matchPaused.event;

    env.clearLog();
    env.join('A', 'peer-a2');
    check(!env.state.matchPaused, 'pausa deveria ter sido desfeita');
    check(env.state.currentRound, 'deveria haver uma nova dupla');
    check(env.state.currentRound.event === pausedEvent, 'a rodada deveria continuar com o mesmo evento');
    check(env.broadcastsOfType('round-start').length === 1, 'deveria ter enviado round-start');
    check(env.broadcastsOfType('show-event').length === 0, 'NÃO deveria reexibir o modal de evento');
    const iSync = env.record.sent.findIndex(e => e.to === 'peer-a2' && e.msg.type === 'state-sync');
    check(iSync >= 0, 'A deveria receber state-sync ao voltar');
});

test('T8  Ciclo da rodada termina sem esperar o desconectado', (use) => {
    const env = use(createEnvironment());
    env.createRoomAsHost();
    env.join('A', 'peer-a');
    env.join('B', 'peer-b');
    env.startMatch();
    const used = ['Host', 'A'];
    const sel = env.Game.selectors;
    check(!sel.isCycleComplete(env.Game.getActivePlayers(), used), 'com B conectado, o ciclo NÃO está completo');
    env.player('B').disconnected = true;
    check(sel.isCycleComplete(env.Game.getActivePlayers(), used), 'com B desconectado, o ciclo deveria estar completo');
});

test('T12 Saída da página: handlers de pagehide/beforeunload registrados', (use) => {
    const env = use(createEnvironment());
    check(env.record.listeners.includes('pagehide'), 'faltou registrar pagehide (celular)');
    check(env.record.listeners.includes('beforeunload'), 'faltou registrar beforeunload (desktop)');
});

test('T13 F5/fechar no host: encerra conexões sem mexer no estado do jogo', (use) => {
    const env = use(createEnvironment());
    env.createRoomAsHost();
    env.join('A', 'peer-a');
    env.join('B', 'peer-b');
    env.startMatch();
    const fakePeer = { destroyed: false, destroy() { this.destroyed = true; } };
    env.Game.network.connectionState.setPeer(fakePeer);

    const roundBefore = env.state.currentRound;
    env.clearLog();
    env.Game.network.closeConnectionsOnExit();
    check(fakePeer.destroyed, 'o peer deveria ter sido destruído');
    check(env.state.players.every(p => !p.disconnected), 'nenhum jogador deveria ser marcado como desconectado pelo próprio reload do host');
    check(env.state.currentRound === roundBefore, 'a rodada em andamento não deveria mudar (seria o BUG-001 de volta)');
    check(env.record.broadcasts.length === 0, 'não deveria enviar nada durante a saída');

    // Idempotente: rodar de novo (pagehide + beforeunload) não faz nada.
    env.Game.network.closeConnectionsOnExit();
    check(env.state.currentRound === roundBefore, 'segunda chamada não deveria ter efeito');
});

test('T30 Guest que reconecta volta com o relógio contando segundo a segundo', (use) => {
    const env = use(createEnvironment());
    const clock = env.fakeClock();
    const round = { event: { id: 'e1' }, asker: 'Host', answerer: 'B', question: null, answered: false };
    env.receiveSync('A', { players: [], decks: {}, timer: 500, currentRound: round, gameStarted: true, hostVersion: 0 });
    check(clock.activeCount() === 1, 'o relógio local deveria estar ligado depois da reconexão, ligados: ' + clock.activeCount());

    clock.tick();
    check(env.state.timer === 499, 'deveria contar 1 segundo, veio: ' + env.state.timer);
    clock.tick(9);
    check(env.state.timer === 490 && env.broadcastsOfType('timer-update').length === 0, 'guest conta, mas não avisa ninguém');

    // O host corrige; a contagem continua a partir do valor corrigido.
    env.Game.network.handleMessage({ type: 'timer-update', remaining: 480 }, 'sala');
    clock.tick();
    check(env.state.timer === 479, 'depois do timer-update deveria seguir de 480, veio: ' + env.state.timer);

    // Um segundo state-sync (nova reconexão) não pode ligar uma segunda contagem.
    env.receiveSync('A', { players: [], decks: {}, timer: 300, currentRound: round, gameStarted: true, hostVersion: 0 });
    clock.tick();
    check(clock.activeCount() === 1 && env.state.timer === 299, 'só pode haver uma contagem ligada, timer: ' + env.state.timer);

    // No zero, o guest só para — quem encerra a partida é o host.
    env.state.timer = 1;
    clock.tick();
    check(clock.activeCount() === 0 && !env.state.gameOver, 'guest para no zero sem encerrar a partida sozinho');

    // No lobby, não liga relógio.
    const lobby = use(createEnvironment());
    const clock2 = lobby.fakeClock();
    lobby.receiveSync('A', { players: [], decks: {}, timer: 3600, currentRound: null, gameStarted: false, hostVersion: 0 });
    check(clock2.activeCount() === 0, 'no lobby não deveria ligar o relógio');
});

test('T31 Relógio do host continua igual (startGame usa a mesma contagem)', (use) => {
    const env = use(createEnvironment());
    const clock = env.fakeClock();
    env.createRoomAsHost();
    env.join('A', 'peer-a');
    env.state.timer = 11;
    env.Game.core.startGame();
    check(clock.activeCount() === 1, 'startGame deveria ligar uma contagem');

    clock.tick();
    const notice = env.broadcastsOfType('timer-update').pop();
    check(env.state.timer === 10 && notice && notice.remaining === 10, 'host deveria avisar os guests a cada 10 segundos');

    env.state.timer = 1;
    clock.tick();
    check(env.state.gameOver && env.broadcastsOfType('game-over').length === 1 && clock.activeCount() === 0,
        'no zero, o host encerra a partida');
});

test('T32 Reconexão depois do fim do ciclo: "rodada encerrada", sem reabrir a pergunta', (use) => {
    // Cenário do teste manual: os dois responderam, o host ainda não
    // clicou em Nova Rodada, e o guest (último Perguntador) caiu e voltou.
    const host = use(createEnvironment());
    host.createRoomAsHost();
    host.join('A', 'peer-a');
    host.startMatch();
    host.state.answeredThisRound = ['Host', 'A'];
    host.state.currentRound = {
        event: { id: 'e1' }, asker: 'A', answerer: 'Host',
        question: { type: 'question', question: 'Pergunta?', alternatives: ['A', 'B', 'C', 'D'], correct: 'A' }, answered: true
    };
    host.Game.core.nextTurn();
    check(host.state.roundEnded === true && host.broadcastsOfType('round-ended').length === 1, 'pré-condição: ciclo encerrado');

    host.drop('peer-a');
    host.clearLog();
    host.join('A', 'peer-a2');
    const sync = syncTo(host, 'peer-a2');
    check(sync && sync.roundEnded === true && sync.matchPaused === false, 'state-sync deveria dizer que o ciclo encerrou');
    check(host.broadcastsOfType('round-start').length === 0, 'a volta de A não deveria começar rodada nova sozinha');

    const guest = use(createEnvironment());
    guest.receiveSync('A', sync);
    const screens = roundScreens(guest);
    check(screens.includes('showRoundEndedMessage'), 'A deveria ver "rodada encerrada", viu: ' + screens.join(', '));
    check(!screens.includes('displayQuestion') && !screens.includes('displayRoundStart'), 'A não pode ver a pergunta antiga de novo, viu: ' + screens.join(', '));

    // Host clica em Nova Rodada: o aviso some dos dois lados.
    host.Game.core.startNewRound();
    check(host.state.roundEnded === false, 'Nova Rodada deveria zerar o aviso no host');
    guest.Game.network.handleMessage(host.broadcastsOfType('round-start').pop(), 'sala');
    check(guest.state.roundEnded === false, 'round-start deveria zerar o aviso no guest');
    guest.Game.network.handleMessage({ type: 'round-ended' }, 'sala');
    check(guest.state.roundEnded === true, 'round-ended deveria marcar o aviso no guest');

    // Encerrar a partida também zera.
    host.state.roundEnded = true;
    host.Game.core.endMatch();
    check(host.state.roundEnded === false, 'encerrar a partida deveria zerar o aviso');
});

test('T33 Reconexão com a partida ainda pausada: aviso de pausa, sem pergunta', (use) => {
    const host = use(createEnvironment());
    host.CONFIG.GAME.MIN_PLAYERS = 3;
    host.createRoomAsHost();
    host.join('A', 'peer-a');
    host.join('B', 'peer-b');
    host.startMatch();
    host.drop('peer-a');
    host.drop('peer-b');
    if (!host.state.matchPaused) host.Game.core.pickNewPair(); // quedas de espectador não sorteiam dupla
    check(host.state.matchPaused, 'pré-condição: partida pausada');

    host.clearLog();
    host.join('B', 'peer-b2'); // ainda faltam jogadores conectados
    check(host.state.matchPaused, 'pré-condição: continua pausada');
    const sync = syncTo(host, 'peer-b2');
    check(sync && sync.matchPaused === true, 'state-sync deveria dizer que a partida está pausada');

    const guest = use(createEnvironment());
    guest.receiveSync('B', sync);
    const screens = roundScreens(guest);
    check(screens.includes('showMatchPausedMessage'), 'B deveria ver o aviso de pausa, viu: ' + screens.join(', '));
    check(!screens.includes('displayQuestion') && guest.state.currentRound === null, 'B não pode ver pergunta durante a pausa');
});

test('T34 Reconexão entre duas duplas: não reabre a pergunta; rodada em andamento continua igual', (use) => {
    const question = { type: 'question', question: 'Pergunta?', alternatives: ['A', 'B', 'C', 'D'] };

    // Pergunta já respondida, próxima dupla ainda não sorteada (~3s).
    const g1 = use(createEnvironment());
    g1.receiveSync('B', { players: [], decks: {}, timer: 500, gameStarted: true, hostVersion: 0,
        currentRound: { event: { id: 'e1' }, asker: 'A', answerer: 'B', question: question, answered: true },
        roundEnded: false, matchPaused: false });
    const t1 = roundScreens(g1);
    check(t1.includes('displaySpectatorView') && !t1.includes('displayQuestion'), 'pergunta respondida não pode reabrir, viu: ' + t1.join(', '));

    // Controle: rodada em andamento, B é o Respondedor → vê a pergunta.
    const g2 = use(createEnvironment());
    g2.receiveSync('B', { players: [], decks: {}, timer: 500, gameStarted: true, hostVersion: 0,
        currentRound: { event: { id: 'e1' }, asker: 'A', answerer: 'B', question: question, answered: false },
        roundEnded: false, matchPaused: false });
    const t2 = roundScreens(g2);
    check(t2.includes('displayRoundStart') && t2.includes('displayQuestion'), 'rodada em andamento deveria mostrar a pergunta, viu: ' + t2.join(', '));

    // Host antigo (sem os campos novos no state-sync): comportamento de antes.
    const g3 = use(createEnvironment());
    g3.receiveSync('B', { players: [], decks: {}, timer: 500, gameStarted: true, hostVersion: 0,
        currentRound: { event: { id: 'e1' }, asker: 'A', answerer: 'B', question: question, answered: false } });
    check(roundScreens(g3).includes('displayQuestion'), 'sem os campos novos, deveria seguir como antes');
});

test('T52 Retomar a pausa quando todos os conectados já responderam: encerra a rodada em vez de começar outra', (use) => {
    const env = use(createEnvironment());
    env.createRoomAsHost();
    env.join('A', 'peer-a');
    env.startMatch();
    const event = { id: 'e-pausa', title: 'Evento pausado' };
    env.drop('peer-a');
    env.state.currentRound = null;
    env.state.matchPaused = { event: event };
    env.state.answeredThisRound = ['Host', 'A'];

    env.clearLog();
    env.join('A', 'peer-a2');
    check(!env.state.matchPaused, 'a pausa deveria acabar');
    check(env.state.roundEnded === true, 'a rodada deveria ser encerrada, aguardando o "Nova Rodada"');
    check(env.broadcastsOfType('round-start').length === 0, 'não pode começar dupla nova sozinha');
    check(env.broadcastsOfType('round-ended').length === 1, 'deveria avisar os guests que a rodada acabou');
    check(JSON.stringify(env.state.answeredThisRound) === '["Host","A"]', 'o rodízio não pode ser zerado');

    // Controle: A ainda não respondeu → a retomada sorteia A.
    const env2 = use(createEnvironment());
    env2.createRoomAsHost();
    env2.join('A', 'peer-a');
    env2.startMatch();
    env2.drop('peer-a');
    env2.state.currentRound = null;
    env2.state.matchPaused = { event: event };
    env2.state.answeredThisRound = ['Host'];
    env2.join('A', 'peer-a2');
    check(env2.state.currentRound && env2.state.currentRound.answerer === 'A' && !env2.state.roundEnded,
        'faltando A, a retomada deveria sortear A');
});

finish('Queda e volta de jogador');
