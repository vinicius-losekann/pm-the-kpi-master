// ============================================
// PM: The KPI Master - Testes de lógica: Queda e volta de jogador
// ============================================
// Jogador que cai e volta: lugar reservado, dupla guardada até o fim da
// rodada, espera do host no fim da rodada, pausa por falta de conexão,
// saída da página, o que quem volta recebe (relógio, situação da rodada),
// a volta pelo sinal de vida e o número da dupla (pairId).
// Ambiente simulado e ajudantes: environment.js. Rodar a partir da raiz:
//     node tests/logic/drop-and-return.test.js
// ============================================

const {
    fs, path, vm, ROOT, createEnvironment, test, check, start, finish,
    syncTo, roundScreens, roomToReload, reloadHost, tryReloadHost, recordScreens, guestWithScreens, savedState
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

    env.join('A', 'peer-a');
    const returned = env.player('A');
    check(!returned.disconnected, 'A deveria voltar como conectado');
    check(returned.peerId === 'peer-a', 'A deveria voltar com o mesmo ID');
    check(returned.kpi === 7 && returned.resources === 4 && returned.focusArea === 'planning' && returned.activities === 1,
        'KPI/recursos/fase/atividades de A deveriam estar preservados');
    check(env.record.sent.some(e => e.to === 'peer-a' && e.msg.type === 'state-sync'), 'A deveria receber state-sync');
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
    env.join('A', 'peer-a');
    check(!env.state.matchPaused, 'pausa deveria ter sido desfeita');
    check(env.state.currentRound, 'deveria haver uma nova dupla');
    check(env.state.currentRound.event === pausedEvent, 'a rodada deveria continuar com o mesmo evento');
    check(env.broadcastsOfType('round-start').length === 1, 'deveria ter enviado round-start');
    check(env.broadcastsOfType('show-event').length === 0, 'NÃO deveria reexibir o modal de evento');
    const iSync = env.record.sent.findIndex(e => e.to === 'peer-a' && e.msg.type === 'state-sync');
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

test('T30 Guest que reconecta volta com o relógio contando pela hora de término (endsAt do state-sync), segundo a segundo', (use) => {
    const env = use(createEnvironment());
    const clock = env.fakeClock();
    const time = env.fakeTime();
    const round = { event: { id: 'e1' }, asker: 'Host', answerer: 'B', question: null, answered: false };
    env.receiveSync('A', { players: [], decks: {}, endsAt: time.now() + 500000, currentRound: round, gameStarted: true });
    check(clock.activeCount() === 1, 'o relógio local deveria estar ligado depois da reconexão, ligados: ' + clock.activeCount());
    check(env.state.timer === 500, 'ao voltar, o relógio já deveria mostrar o que falta até a hora de término (500 s), veio: ' + env.state.timer);

    time.advance(1000);
    clock.tick();
    check(env.state.timer === 499, 'deveria contar 1 segundo, veio: ' + env.state.timer);
    // Tique atrasado (aba em segundo plano): o que falta vem da hora de término, não do número de tiques.
    time.advance(9000);
    clock.tick();
    check(env.state.timer === 490 && env.broadcastsOfType('timer-update').length === 0,
        'depois de 9 s com um tique só, deveria mostrar 490 s, sem avisar ninguém, veio: ' + env.state.timer);

    // Um segundo state-sync (nova reconexão) não pode ligar uma segunda contagem.
    env.receiveSync('A', { players: [], decks: {}, endsAt: time.now() + 300000, currentRound: round, gameStarted: true });
    time.advance(1000);
    clock.tick();
    check(clock.activeCount() === 1 && env.state.timer === 299, 'só pode haver uma contagem ligada, timer: ' + env.state.timer);

    // No zero, o guest só para — quem encerra a partida é o host.
    time.advance(299000);
    clock.tick();
    check(clock.activeCount() === 0 && !env.state.gameOver && env.state.timer === 0,
        'guest para no zero sem encerrar a partida sozinho, veio: ' + JSON.stringify({ timer: env.state.timer, ligados: clock.activeCount() }));

    // No lobby, não liga relógio.
    const lobby = use(createEnvironment());
    const clock2 = lobby.fakeClock();
    lobby.receiveSync('A', { players: [], decks: {}, endsAt: null, currentRound: null, gameStarted: false });
    check(clock2.activeCount() === 0, 'no lobby não deveria ligar o relógio');
});

test('T31 Relógio do host: startGame grava a hora de término (SESSION_DURATION) e a contagem segue por ela até o zero, que encerra a partida, sem avisos de tempo', (use) => {
    const env = use(createEnvironment());
    const clock = env.fakeClock();
    const time = env.fakeTime();
    env.createRoomAsHost();
    env.join('A', 'peer-a');
    env.CONFIG.GAME.SESSION_DURATION = 11;
    env.Game.core.startGame();
    check(clock.activeCount() === 1, 'startGame deveria ligar uma contagem');
    check(env.state.timer === 11, 'no início, o relógio deveria mostrar SESSION_DURATION (11 s), veio: ' + env.state.timer);

    time.advance(1000);
    clock.tick();
    check(env.state.timer === 10 && env.broadcastsOfType('timer-update').length === 0,
        'host deveria contar 1 segundo sem avisar os guests (cada aparelho calcula pela hora de término), veio: ' + env.state.timer);
    time.advance(5000);
    clock.tick();
    check(env.state.timer === 5, 'tique atrasado: deveria mostrar o que falta até a hora de término (5 s), veio: ' + env.state.timer);

    time.advance(5000);
    clock.tick();
    check(env.state.gameOver && env.broadcastsOfType('game-over').length === 1 && clock.activeCount() === 0,
        'no zero, o host encerra a partida');
});

/** Todos os arquivos .js de uma pasta do jogo (e subpastas), com o conteúdo. */
function sourcesIn(dir) {
    return fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true }).flatMap(entry => {
        const relative = dir + '/' + entry.name;
        if (entry.isDirectory()) return sourcesIn(relative);
        return entry.name.endsWith('.js') ? [{ file: relative, text: fs.readFileSync(path.join(ROOT, relative), 'utf8') }] : [];
    });
}

/** Cópia simples (tira o objeto do contexto vm). */
const copy = (x) => (x === undefined ? undefined : JSON.parse(JSON.stringify(x)));

test('T180 Relógio da partida pela hora de término (endsAt, em hora do servidor): o host grava e manda no game-start, sem timer; cada aparelho conta pela própria hora do servidor, mesmo com o relógio do aparelho errado; quem volta recebe endsAt; sai o timer-update', (use) => {
    const host = use(createEnvironment());
    const hostTime = host.fakeTime();
    const hostClock = host.fakeClock();
    host.setServerOffset(7000); // o relógio do aparelho do host está 7 s atrás do servidor
    host.createRoomAsHost();
    host.join('A', 'peer-a');
    check(host.Game.network.PROTOCOL_VERSION >= 11, 'a versão do protocolo deveria ser 11 ou mais (game-start com endsAt, sem timer-update), veio: ' +
        host.Game.network.PROTOCOL_VERSION);
    const D = host.CONFIG.GAME.SESSION_DURATION;
    const serverAtStart = hostTime.now() + 7000;
    host.Game.core.startGame();
    const starts = host.broadcastsOfType('game-start');
    check(starts.length === 1 && starts[0].endsAt === serverAtStart + D * 1000 && !('timer' in starts[0]),
        'o host deveria mandar um game-start com endsAt = hora do servidor + SESSION_DURATION, sem timer, veio: ' + JSON.stringify(starts));
    check(host.state.endsAt === starts[0].endsAt && host.state.timer === D,
        'o host deveria guardar a mesma hora de término e mostrar ' + D + ' s, veio: ' + JSON.stringify({ endsAt: host.state.endsAt, timer: host.state.timer }));

    // A, com o relógio do aparelho 30 s adiantado, recebe o game-start 3 s depois.
    const guest = use(createEnvironment());
    const guestTime = guest.fakeTime(serverAtStart + 30000);
    guest.setServerOffset(-30000);
    const guestClock = guest.fakeClock();
    guest.state.playerName = 'A';
    guest.state.peerId = 'peer-a';
    guest.state.players = copy(host.state.players);
    guestTime.advance(3000);
    guest.Game.network.handleMessage(copy(starts[0]), 'sala');
    check(guest.state.endsAt === starts[0].endsAt && guestClock.activeCount() === 1,
        'A deveria guardar a hora de término do game-start e ligar o relógio, veio: ' + JSON.stringify({ endsAt: guest.state.endsAt, ligados: guestClock.activeCount() }));
    check(guest.state.timer === D - 3, 'A recebeu o game-start 3 s depois: deveria mostrar ' + (D - 3) + ' s (o que falta pela hora do servidor), veio: ' + guest.state.timer);

    // 25 s depois do início, os dois mostram o mesmo tempo.
    hostTime.advance(25000);
    guestTime.advance(22000);
    hostClock.tick();
    guestClock.tick();
    check(host.state.timer === D - 25 && guest.state.timer === D - 25,
        'host e A deveriam mostrar ' + (D - 25) + ' s, veio: ' + JSON.stringify({ host: host.state.timer, A: guest.state.timer }));
    check(host.broadcastsOfType('timer-update').length === 0, 'o host não deveria mandar timer-update');

    // Quem volta recebe a hora de término, não o tempo que falta.
    host.drop('peer-a');
    host.clearLog();
    host.join('A', 'peer-a');
    const sync = syncTo(host, 'peer-a');
    check(sync && sync.endsAt === starts[0].endsAt && !('timer' in sync),
        'o state-sync deveria levar endsAt, sem timer, veio: ' + JSON.stringify(sync && { endsAt: sync.endsAt, timer: sync.timer }));

    // No código: ninguém manda nem trata timer-update; o botão "Iniciar" só chama startGame (que manda o game-start).
    const withTimerUpdate = sourcesIn('js').filter(s => s.text.includes('timer-update')).map(s => s.file);
    check(withTimerUpdate.length === 0, 'o timer-update deveria sair do jogo, aparece em: ' + withTimerUpdate.join(', '));
    const controls = fs.readFileSync(path.join(ROOT, 'js/ui/components/controlsComponent.js'), 'utf8');
    check(!controls.includes('game-start') && !/state\.timer\s*=/.test(controls),
        'o botão "Iniciar" não deveria montar o game-start nem mexer no relógio (fica no startGame do host)');
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
    host.join('A', 'peer-a');
    const sync = syncTo(host, 'peer-a');
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
    host.join('B', 'peer-b'); // ainda faltam jogadores conectados
    check(host.state.matchPaused, 'pré-condição: continua pausada');
    const sync = syncTo(host, 'peer-b');
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
    env.join('A', 'peer-a');
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
    env2.join('A', 'peer-a');
    check(env2.state.currentRound && env2.state.currentRound.answerer === 'A' && !env2.state.roundEnded,
        'faltando A, a retomada deveria sortear A');
});

/** Conta, no ambiente, os sorteios de evento e as aplicações de efeito. */
function countEvents(env) {
    const ev = env.Game.domain.event;
    const originalDraw = ev.drawEvent;
    const originalApply = ev.applyEventEffects;
    const counts = { draws: 0, effects: 0 };
    ev.drawEvent = (...a) => { counts.draws++; return originalDraw(...a); };
    ev.applyEventEffects = (...a) => { counts.effects++; return originalApply(...a); };
    return counts;
}

test('T209 Troca de dupla no meio da rodada não sorteia evento: quem está na dupla cai, sai da partida ou some da lista na hora de responder — a dupla nova continua a mesma rodada (mesmo evento, mesmo número), sem aviso do evento e sem aplicar o efeito de novo; o número da rodada sobe só no "Nova Rodada", vai no round-start e aparece no console do host e do guest (BUG-032)', (use) => {
    const env = use(createEnvironment());
    const time = env.fakeTime();
    env.createRoomAsHost();
    env.join('A', 'peer-a');
    env.join('B', 'peer-b');
    env.join('C', 'peer-c');
    env.startMatch();
    check(env.state.roundNumber === 1, 'a primeira rodada da partida deveria ser a 1, veio: ' + env.state.roundNumber);
    const firstStart = env.broadcastsOfType('round-start').pop();
    check(firstStart && firstStart.roundNumber === 1, 'o round-start deveria levar o número da rodada (1), veio: ' + JSON.stringify(firstStart && firstStart.roundNumber));
    check(env.record.logs.some(l => /Rodada 1\b/.test(l)), 'o console do host deveria mostrar "Rodada 1", veio: ' + JSON.stringify(env.record.logs.slice(-5)));
    const event = env.state.currentRound.event;
    const counts = countEvents(env);

    // Quem responde cai.
    env.state.currentRound = { event, asker: 'Host', answerer: 'A', question: null, answered: false };
    env.clearLog();
    env.drop('peer-a');
    const afterDrop = env.state.currentRound;
    check(afterDrop && afterDrop.answerer !== 'A' && afterDrop.asker !== 'A', 'pré-condição: dupla nova sem A');
    check(afterDrop.event && afterDrop.event.id === event.id, 'a dupla nova deveria continuar com o MESMO evento, veio: ' + JSON.stringify(afterDrop.event));
    check(counts.draws === 0 && counts.effects === 0, 'a queda não pode sortear outro evento nem aplicar efeito (sorteios: ' + counts.draws + ', efeitos: ' + counts.effects + ')');
    check(env.broadcastsOfType('show-event').length === 0 && !env.record.ui.includes('showEventModal'), 'a queda não deveria mostrar aviso de evento');
    const dropStart = env.broadcastsOfType('round-start').pop();
    check(env.state.roundNumber === 1 && dropStart && dropStart.roundNumber === 1,
        'a dupla nova é da mesma rodada (1), veio: ' + JSON.stringify({ state: env.state.roundNumber, msg: dropStart && dropStart.roundNumber }));

    // Quem pergunta sai da partida.
    env.state.currentRound = { event, asker: 'B', answerer: 'Host', question: null, answered: false };
    env.clearLog();
    env.Game.core.handleLeaveMatchRequest({ type: 'leave-match-request', playerName: 'B' });
    const afterLeave = env.state.currentRound;
    check(afterLeave && afterLeave.asker !== 'B' && afterLeave.event && afterLeave.event.id === event.id && env.broadcastsOfType('show-event').length === 0,
        'a saída de quem pergunta também continua a rodada com o mesmo evento, sem aviso, veio: ' + JSON.stringify(afterLeave && afterLeave.event));

    // Quem responde sumiu da lista na hora da resposta.
    env.state.currentRound = { event, asker: 'Host', answerer: 'Z', question: { question: 'P?', correct: 'A' }, answered: false, asked: true };
    env.clearLog();
    env.Game.engine.answer.handleAnswer({ alternative: 'A', playerName: 'Z' });
    time.advance(1000);
    const afterMissing = env.state.currentRound;
    check(afterMissing && afterMissing.answerer !== 'Z' && afterMissing.event && afterMissing.event.id === event.id && env.broadcastsOfType('show-event').length === 0,
        'sem quem responde, a dupla nova continua com o mesmo evento, sem aviso, veio: ' + JSON.stringify(afterMissing && { answerer: afterMissing.answerer, event: afterMissing.event }));
    check(counts.draws === 0 && counts.effects === 0 && env.state.roundNumber === 1,
        'nenhuma troca de dupla deveria sortear evento nem mudar o número da rodada (sorteios: ' + counts.draws + ', rodada: ' + env.state.roundNumber + ')');

    // "Nova Rodada": outro evento, número 2.
    env.clearLog();
    env.Game.core.startNewRound();
    const second = env.broadcastsOfType('round-start').pop();
    check(env.state.roundNumber === 2 && second && second.roundNumber === 2 && counts.draws === 1 && env.broadcastsOfType('show-event').length === 1,
        'o "Nova Rodada" sorteia o evento e começa a rodada 2, veio: ' + JSON.stringify({ state: env.state.roundNumber, msg: second && second.roundNumber, draws: counts.draws }));

    // O guest guarda o número e mostra no console.
    const guest = use(createEnvironment());
    guest.state.playerName = 'C';
    guest.Game.network.handleMessage(JSON.parse(JSON.stringify(second)), 'sala');
    check(guest.state.roundNumber === 2 && guest.record.logs.some(l => /Rodada 2\b/.test(l)),
        'o guest deveria guardar a rodada 2 e mostrar "Rodada 2" no console, veio: ' + JSON.stringify({ n: guest.state.roundNumber, logs: guest.record.logs.slice(-3) }));

    // Partida nova: o número e o evento da rodada não sobram da anterior.
    env.Game.resetGameState();
    check(env.state.roundNumber === 0 && env.state.roundEvent === null,
        'voltar ao lobby deveria zerar o número e o evento da rodada, veio: ' + JSON.stringify({ n: env.state.roundNumber, event: env.state.roundEvent }));
    env.fakeClock();
    env.state.roundNumber = 5;
    env.Game.core.startGame();
    check(env.state.roundNumber === 1, 'a partida nova deveria começar na rodada 1, veio: ' + env.state.roundNumber);
});

test('T208 Volta pelo sinal de vida (receivePresence com o sinal de volta, sem player-join): na partida, quem estava desconectado volta à lista e ao sorteio, todos recebem a lista, sem state-sync, a rodada não muda e o estado é salvo; com a partida pausada, retoma com o mesmo evento, sem reexibir o evento; quem não estava desconectado, quem não é jogador, o lobby e o fim de jogo: nada muda (BUG-030)', (use) => {
    const env = use(createEnvironment());
    env.createRoomAsHost();
    env.join('A', 'peer-a');
    env.join('B', 'peer-b');
    env.startMatch();
    env.state.currentRound = { event: { id: 'e1' }, asker: 'Host', answerer: 'B', question: null, answered: false };
    env.drop('peer-a');
    check(env.player('A').disconnected === true, 'pré-condição: A desconectado');

    env.clearLog();
    env.bank.secret = null;
    env.Game.network.receivePresence('peer-a', true);
    check(env.player('A').disconnected === false, 'com o sinal de volta, A deveria voltar como conectado, veio: ' + JSON.stringify(env.player('A')));
    check(env.Game.getActivePlayers().some(p => p.name === 'A'), 'A deveria voltar ao sorteio (entre os ativos)');
    const lists = env.broadcastsOfType('player-list');
    check(lists.length === 1 && lists[0].players.find(p => p.name === 'A').disconnected === false,
        'todos deveriam receber a lista uma vez, com A conectado, veio: ' + JSON.stringify(lists));
    check(!env.record.sent.some(e => e.msg.type === 'state-sync'), 'a volta pelo sinal não manda state-sync (a página de A continuou recebendo tudo)');
    check(env.state.currentRound && env.state.currentRound.answerer === 'B' && env.broadcastsOfType('round-start').length === 0,
        'a rodada em andamento não deveria mudar');
    check(env.bank.secret !== null, 'a volta deveria ser salva (saveState)');
    check(env.record.ui.includes('updatePlayersList') && env.record.ui.includes('syncPlayerViews'),
        'a tela do host deveria mostrar A conectado de novo (lista de jogadores e ranking), veio: ' + JSON.stringify(env.record.ui));

    // De novo, com A já conectado: nada.
    env.clearLog();
    env.Game.network.receivePresence('peer-a', true);
    env.Game.network.receivePresence('peer-x', true);
    check(env.record.broadcasts.length === 0 && env.state.players.length === 3,
        'sinal de quem já está conectado ou de quem não é jogador não deveria mudar nada, veio: ' + JSON.stringify(env.record.broadcasts));

    // Partida pausada: retoma com o mesmo evento.
    const paused = use(createEnvironment());
    paused.createRoomAsHost();
    paused.join('A', 'peer-a');
    paused.startMatch();
    paused.drop('peer-a');
    check(paused.state.matchPaused, 'pré-condição: partida pausada');
    const pausedEvent = paused.state.matchPaused.event;
    paused.clearLog();
    paused.Game.network.receivePresence('peer-a', true);
    check(!paused.state.matchPaused && paused.state.currentRound && paused.state.currentRound.event === pausedEvent,
        'com a volta de A pelo sinal, a partida deveria retomar com o mesmo evento');
    check(paused.broadcastsOfType('round-start').length === 1 && paused.broadcastsOfType('show-event').length === 0,
        'deveria mandar o round-start uma vez, sem reexibir o evento');
    check(!paused.record.sent.some(e => e.msg.type === 'state-sync'), 'sem state-sync na retomada pelo sinal');

    // Lobby: nada muda.
    const lobby = use(createEnvironment());
    lobby.createRoomAsHost();
    lobby.join('A', 'peer-a');
    lobby.clearLog();
    lobby.Game.network.receivePresence('peer-a', true);
    check(lobby.record.broadcasts.length === 0 && lobby.player('A') && !lobby.player('A').disconnected,
        'no lobby, o sinal não deveria mudar nada, veio: ' + JSON.stringify(lobby.record.broadcasts));

    // Fim de jogo: quem ficou desconectado continua assim.
    const over = use(createEnvironment());
    over.createRoomAsHost();
    over.join('A', 'peer-a');
    over.startMatch();
    over.player('A').disconnected = true;
    over.state.gameOver = true;
    over.clearLog();
    over.Game.network.receivePresence('peer-a', true);
    check(over.player('A').disconnected === true && over.record.broadcasts.length === 0,
        'no fim de jogo, o sinal não deveria mudar nada, veio: ' + JSON.stringify(over.record.broadcasts));
});

// ============================================
// DUPLA GUARDADA ATÉ O FIM DA RODADA (BUG-033) E NÚMERO DA DUPLA (BUG-034)
// ============================================

/** uid de teste de um jogador ('Host' → 'peer-host', 'B' → 'peer-b'). */
const peerOf = (name) => 'peer-' + name.toLowerCase();

/**
 * Partida com o host e `names`, com tempo controlado, sorteio fixo
 * (`random`: 0.99 = o último da lista responde e o penúltimo pergunta) e
 * uma pergunta diferente a cada sorteio (q1, q2...), para o teste saber
 * qual pergunta volta. Devolve { env, time }.
 */
function droppingMatch(use, names = ['A', 'B', 'C'], random = 0.99) {
    const env = use(createEnvironment());
    const time = env.fakeTime();
    env.createRoomAsHost();
    names.forEach(n => env.join(n, peerOf(n)));
    vm.runInContext('Math.random = () => ' + random, env.ctx);
    let seq = 0;
    env.Game.domain.deck.drawQuestion = () => {
        seq++;
        return { id: 'q' + seq, question: 'Pergunta ' + seq + '?', alternatives: ['A', 'B', 'C', 'D'], correct: 'A', domain_key: 'd1' };
    };
    env.startMatch();
    return { env, time };
}

/** Quem responde a dupla da vez responde (certo), com o número da dupla. */
function answerNow(env, alternative = 'A') {
    const r = env.state.currentRound;
    const msg = { type: 'answer', alternative, playerName: r.answerer, pairId: r.pairId };
    if (r.answerer === 'Host') {
        env.Game.core.handleAnswer(msg);
    } else {
        env.Game.network.handleMessage(msg, peerOf(r.answerer));
    }
}

/** A dupla da vez, resumida (cópia). */
function pairNow(env) {
    const r = env.state.currentRound;
    return r ? copy({ asker: r.asker, answerer: r.answerer, questionId: r.question && r.question.id, pairId: r.pairId, answered: r.answered, eventId: r.event && r.event.id }) : null;
}

test('T211 Quem responde cai no meio da pergunta (BUG-033): a dupla fica guardada (mesmo Perguntador, mesma pergunta com o gabarito só no host, o tempo de resposta que faltava, apoio cancelado sem cobrar); todos recebem o aviso da queda (pair-held) e o host o mostra; a partida segue com outra dupla, o Perguntador jogando nela; quem cai fica com a hora do último sinal e o console diz há quanto tempo o sinal estava parado; ele volta com a rodada andando e a dupla guardada dele é a próxima, com número novo, o Perguntador refazendo a pergunta e o prazo de resposta do que faltava', (use) => {
    const { env, time } = droppingMatch(use);
    const r1 = pairNow(env);
    check(r1 && r1.asker === 'B' && r1.answerer === 'C' && r1.questionId === 'q1' && typeof r1.pairId === 'number',
        'pré-condição: B pergunta para C (q1), com o número da dupla, veio: ' + JSON.stringify(r1));
    const counts = countEvents(env);
    time.advance(20000);

    // C cai (o sinal dele parou 23 s antes de o host perceber).
    env.clearLog();
    const lastSeen = time.now() - 23000;
    env.Game.network.receivePresence('peer-c', false, lastSeen);
    const c = env.player('C');
    check(c.disconnected === true && c.disconnectedAt === lastSeen,
        'C deveria ficar desconectado, com a hora do último sinal (disconnectedAt), veio: ' + JSON.stringify(c));
    check(env.record.logs.some(l => /📴 C desconectou \(sinal parado há 23 s\)/.test(l)),
        'o console do host deveria dizer há quanto tempo o sinal de C estava parado, veio: ' + JSON.stringify(env.record.logs.slice(-4)));
    const held = copy(env.state.heldPairs);
    check(Array.isArray(held) && held.length === 1 && held[0].asker === 'B' && held[0].answerer === 'C' &&
        held[0].question && held[0].question.id === 'q1' && held[0].question.correct === 'A' && held[0].answerTimeLeft === 40000,
        'a dupla de C deveria ficar guardada (B, C, q1 com o gabarito, 40 s de resposta que faltavam), veio: ' + JSON.stringify(held));
    const notices = env.broadcastsOfType('pair-held');
    check(notices.length === 1 && notices[0].droppedName === 'C' && notices[0].asker === 'B' && notices[0].answerer === 'C',
        'todos deveriam receber o aviso da queda uma vez (pair-held com quem caiu e a dupla), veio: ' + JSON.stringify(notices));
    check(env.record.ui.includes('showPairHeldNotice'), 'o host deveria mostrar o aviso da queda, telas: ' + JSON.stringify(env.record.ui));
    const r2 = pairNow(env);
    check(r2 && r2.answerer === 'B' && r2.asker === 'A' && r2.questionId === 'q2' && r2.pairId > r1.pairId && r2.eventId === r1.eventId,
        'a partida deveria seguir com outra dupla (A pergunta para B, q2, número maior, mesmo evento), veio: ' + JSON.stringify(r2));
    check(counts.draws === 0 && env.broadcastsOfType('show-event').length === 0, 'a dupla nova continua a mesma rodada, sem sortear evento');
    const saved = savedState(env);
    check(saved && Array.isArray(saved.heldPairs) && saved.heldPairs.length === 1 && saved.heldPairs[0].answerer === 'C',
        'a dupla guardada deveria ir para o estado salvo, veio: ' + JSON.stringify(saved && saved.heldPairs));

    // O prazo de resposta de C (40 s) não corre enquanto a dupla está guardada.
    time.advance(41000);
    check(!env.broadcastsOfType('kpi-update').some(m => m.playerName === 'C'), 'o prazo de C não pode vencer com a dupla guardada');

    // C volta com a rodada andando: a dupla em andamento não muda.
    env.clearLog();
    env.join('C', peerOf('C'));
    check(env.player('C').disconnected === false && !env.player('C').disconnectedAt,
        'C deveria voltar conectado, sem a hora da queda, veio: ' + JSON.stringify(env.player('C')));
    check(env.broadcastsOfType('round-start').length === 0 && pairNow(env).pairId === r2.pairId, 'a volta de C não interrompe a dupla em andamento');

    // B responde (o Perguntador guardado joga na outra dupla); a próxima é a dupla guardada de C.
    answerNow(env);
    env.clearLog();
    time.advance(3000);
    const r3 = pairNow(env);
    check(r3 && r3.asker === 'B' && r3.answerer === 'C' && r3.questionId === 'q1' && r3.pairId > r2.pairId && r3.eventId === r1.eventId,
        'a próxima dupla deveria ser a guardada (B pergunta q1 para C), com número novo e o mesmo evento, veio: ' + JSON.stringify(r3));
    const start3 = env.broadcastsOfType('round-start').pop();
    check(start3 && start3.pairId === r3.pairId && start3.asker === 'B' && start3.answerer === 'C',
        'o round-start da dupla reaberta deveria levar o número novo, veio: ' + JSON.stringify(start3));
    check(env.state.heldPairs.length === 0, 'a dupla reaberta sai das guardadas');
    const toC = env.record.sent.filter(e => e.to === 'peer-c' && e.msg.type === 'question' && e.msg.isAnswerer).pop();
    check(toC && toC.msg.id === 'q1' && toC.msg.correct === undefined && toC.msg.answerEndsAt === time.now() + 40000,
        'C deveria receber a mesma pergunta, sem o gabarito, com o prazo do que faltava (40 s), veio: ' + JSON.stringify(toC && toC.msg));
    answerNow(env);
    check(env.broadcastsOfType('kpi-update').some(m => m.playerName === 'C' && m.isCorrect === true), 'a resposta de C na dupla reaberta deveria valer');

    // Apoio pendente na queda: cancelado sem cobrar; na volta, pode pedir de novo.
    const adv = droppingMatch(use);
    adv.time.advance(10000);
    adv.env.Game.network.handleMessage({ type: 'advisory-request', kind: 'advisory', advisorName: 'A', requesterName: 'C' }, 'peer-c');
    check(adv.env.state.currentRound.advisory && adv.env.state.currentRound.advisory.status === 'pending', 'pré-condição: C pediu assessoria a A');
    const resourcesBefore = JSON.stringify(adv.env.state.players.map(p => [p.name, p.resources]));
    adv.time.advance(5000);
    adv.env.drop('peer-c');
    const heldAdv = copy(adv.env.state.heldPairs);
    check(heldAdv.length === 1 && heldAdv[0].answerTimeLeft === 50000 && !heldAdv[0].advisory,
        'com o apoio pendente, a dupla guardada fica com o tempo de resposta parado (50 s) e sem o apoio, veio: ' + JSON.stringify(heldAdv));
    adv.env.clearLog();
    adv.time.advance(adv.env.CONFIG.GAME.ADVISORY_TIMEOUT);
    check(adv.env.broadcastsOfType('advisory-result').length === 0 && JSON.stringify(adv.env.state.players.map(p => [p.name, p.resources])) === resourcesBefore,
        'o prazo do apoio cancelado não pode correr nem cobrar ninguém, veio: ' + JSON.stringify(adv.env.broadcastsOfType('advisory-result')));
    adv.env.join('C', peerOf('C'));
    answerNow(adv.env);
    adv.time.advance(3000);
    const back = adv.env.state.currentRound;
    check(back && back.answerer === 'C' && !back.advisory && back.answerEndsAt === adv.time.now() + 50000,
        'na volta, a dupla reabre sem o apoio (C pode pedir de novo) e com o prazo parado (50 s), veio: ' + JSON.stringify(back && { answerer: back.answerer, advisory: back.advisory, left: back.answerEndsAt - adv.time.now() }));
});

test('T212 Espera do fim da rodada (BUG-033): com todos os outros já respondidos e quem caiu fora, a rodada não fecha — o host e os guests veem a espera (round-waiting com os nomes, também no state-sync), sem "rodada encerrada"; quem volta durante a espera reabre a dupla dele sozinho e depois a rodada encerra; "Nova Rodada" segue sem ele (perde a vez, a pergunta guardada volta ao baralho); quem caiu fora da dupla sem ter respondido também é esperado, com pergunta nova; returnQuestion() devolve a pergunta ao baralho', (use) => {
    // Host, A e B; B (quem responde) cai: Host pergunta para A, depois A para o host.
    const { env, time } = droppingMatch(use, ['A', 'B']);
    check(pairNow(env).answerer === 'B' && pairNow(env).asker === 'A', 'pré-condição: A pergunta para B, veio: ' + JSON.stringify(pairNow(env)));
    env.drop('peer-b');
    answerNow(env);
    time.advance(3000);
    answerNow(env);
    env.clearLog();
    time.advance(3000);
    const waits = env.broadcastsOfType('round-waiting');
    check(waits.length === 1 && JSON.stringify(waits[0].waitingFor) === '["B"]',
        'a rodada deveria esperar B (round-waiting com waitingFor), veio: ' + JSON.stringify(env.record.broadcasts.map(m => m.type)));
    check(JSON.stringify(env.state.waitingFor) === '["B"]' && env.state.roundEnded === false && env.state.currentRound === null &&
        env.broadcastsOfType('round-ended').length === 0,
        'na espera, a rodada não fecha (sem roundEnded nem round-ended) e não há dupla, veio: ' + JSON.stringify({ waitingFor: env.state.waitingFor, roundEnded: env.state.roundEnded }));
    check(env.record.ui.includes('showRoundWaitingMessage') && !env.record.ui.includes('showRoundEndedMessage'),
        'o host deveria ver a espera, não "rodada encerrada", telas: ' + JSON.stringify(env.record.ui));

    // A dá F5 durante a espera: o state-sync leva a espera, sem as duplas guardadas.
    env.clearLog();
    env.join('A', peerOf('A'));
    const sync = syncTo(env, 'peer-a');
    check(sync && JSON.stringify(sync.waitingFor) === '["B"]' && sync.roundEnded === false && !('heldPairs' in sync) && !JSON.stringify(sync).includes('"q1"'),
        'o state-sync deveria levar a espera (waitingFor), sem as duplas guardadas nem a pergunta delas, veio: ' + JSON.stringify(sync));

    // No guest: o aviso da queda, a espera e a espera vinda do state-sync.
    const guest = use(createEnvironment());
    guest.state.playerName = 'A';
    guest.Game.network.handleMessage({ type: 'pair-held', droppedName: 'B', asker: 'A', answerer: 'B' }, 'sala');
    check(guest.record.ui.includes('showPairHeldNotice'), 'o guest deveria mostrar o aviso da queda, telas: ' + JSON.stringify(guest.record.ui));
    guest.state.currentRound = { asker: 'A', answerer: 'Host', answered: true };
    guest.Game.network.handleMessage(copy(waits[0]), 'sala');
    check(JSON.stringify(guest.state.waitingFor) === '["B"]' && guest.state.currentRound === null && guest.record.ui.includes('showRoundWaitingMessage'),
        'o guest deveria guardar a espera e mostrá-la, veio: ' + JSON.stringify({ waitingFor: guest.state.waitingFor, ui: guest.record.ui }));
    guest.Game.network.handleMessage({ type: 'round-start', event: { id: 'e1' }, asker: 'A', answerer: 'B', answeredThisRound: [], roundNumber: 1, pairId: 9 }, 'sala');
    check(guest.state.waitingFor.length === 0, 'com a dupla reaberta (round-start), a espera acaba também no guest');
    const again = use(createEnvironment());
    again.receiveSync('A', copy(sync));
    check(again.record.ui.includes('showRoundWaitingMessage') && !again.record.ui.includes('showRoundEndedMessage') &&
        JSON.stringify(again.state.waitingFor) === '["B"]',
        'quem volta durante a espera deveria vê-la, telas: ' + JSON.stringify(again.record.ui));

    // B volta durante a espera: a dupla dele reabre sozinha; depois, a rodada encerra.
    env.clearLog();
    env.join('B', peerOf('B'));
    const reopened = pairNow(env);
    check(reopened && reopened.asker === 'A' && reopened.answerer === 'B' && reopened.questionId === 'q1' && env.broadcastsOfType('round-start').length === 1,
        'a volta de B na espera deveria reabrir a dupla dele (A pergunta q1), veio: ' + JSON.stringify(reopened));
    check(env.state.waitingFor.length === 0, 'a espera acaba com a dupla reaberta');
    answerNow(env);
    time.advance(3000);
    check(env.state.roundEnded === true && env.broadcastsOfType('round-ended').length === 1,
        'com B respondido, a rodada deveria encerrar normalmente');

    // "Nova Rodada" durante a espera: segue sem B, que perde a vez; a pergunta guardada volta ao baralho.
    const skip = droppingMatch(use, ['A', 'B']);
    const returned = [];
    skip.env.Game.domain.deck.returnQuestion = (decks, q) => { returned.push(q && q.id); };
    skip.env.drop('peer-b');
    answerNow(skip.env);
    skip.time.advance(3000);
    answerNow(skip.env);
    skip.time.advance(3000);
    check(JSON.stringify(skip.env.state.waitingFor) === '["B"]', 'pré-condição: esperando B');
    skip.env.clearLog();
    skip.env.Game.core.startNewRound();
    const next = pairNow(skip.env);
    check(JSON.stringify(returned) === '["q1"]' && skip.env.state.heldPairs.length === 0 && skip.env.state.waitingFor.length === 0,
        'a pergunta guardada de B deveria voltar ao baralho e a espera acabar, veio: ' + JSON.stringify({ returned, held: skip.env.state.heldPairs, waitingFor: skip.env.state.waitingFor }));
    check(skip.env.state.roundNumber === 2 && next && next.asker !== 'B' && next.answerer !== 'B' && skip.env.broadcastsOfType('show-event').length === 1,
        'o "Nova Rodada" começa a rodada 2 sem B, veio: ' + JSON.stringify({ n: skip.env.state.roundNumber, next }));
    skip.env.clearLog();
    skip.env.join('B', peerOf('B'));
    check(skip.env.broadcastsOfType('round-start').length === 0, 'B, de volta depois do "Nova Rodada", não reabre a pergunta antiga');

    // Quem cai fora da dupla sem ter respondido também é esperado, com pergunta nova.
    const out = droppingMatch(use, ['A', 'B', 'C']);
    check(pairNow(out.env).answerer === 'C' && pairNow(out.env).asker === 'B', 'pré-condição: B pergunta para C');
    out.env.clearLog();
    out.env.drop('peer-a');
    check(out.env.broadcastsOfType('pair-held').length === 0 && pairNow(out.env).answerer === 'C' && out.env.state.heldPairs.length === 0,
        'a queda de quem está fora da dupla não guarda dupla nem troca a dupla em andamento');
    for (let i = 0; i < 3; i++) {
        answerNow(out.env);
        out.time.advance(3000);
    }
    check(JSON.stringify(out.env.state.waitingFor) === '["A"]' && out.env.state.roundEnded === false,
        'com C, B e o host respondidos, a rodada deveria esperar A (que não respondeu), veio: ' + JSON.stringify({ waitingFor: out.env.state.waitingFor, roundEnded: out.env.state.roundEnded }));
    // A volta pelo sinal de vida (sem player-join, ex.: a janela estava escondida).
    out.env.Game.network.receivePresence('peer-a', true);
    const forA = pairNow(out.env);
    check(forA && forA.answerer === 'A' && !['q1', 'q2', 'q3'].includes(forA.questionId),
        'a volta de A na espera (pelo sinal de vida) deveria abrir uma dupla para ele, com pergunta nova, veio: ' + JSON.stringify(forA));

    // Quem tem dupla guardada e sai da partida: a dupla é descartada e a pergunta volta ao baralho.
    const leave = droppingMatch(use, ['A', 'B', 'C']);
    const back = [];
    leave.env.Game.domain.deck.returnQuestion = (decks, q) => { back.push(q && q.id); };
    leave.env.drop('peer-b');
    check(leave.env.state.heldPairs.length === 1 && leave.env.state.heldPairs[0].answerer === 'C', 'pré-condição: dupla de B e C guardada');
    leave.env.Game.network.handleMessage({ type: 'leave-match-request', playerName: 'C' }, 'peer-c');
    check(leave.env.state.heldPairs.length === 0 && back.includes('q1'),
        'com C fora da partida, a dupla guardada dele deveria sair e a pergunta voltar ao baralho, veio: ' + JSON.stringify({ held: leave.env.state.heldPairs, back }));

    // returnQuestion() real: a pergunta volta a ficar disponível no baralho, uma vez.
    const ctx = vm.createContext({});
    vm.runInContext('var window = this;' + fs.readFileSync(path.join(ROOT, 'js/domain/deckRules.js'), 'utf8'), ctx);
    const deck = ctx.Game.domain.deck;
    check(typeof deck.returnQuestion === 'function', 'domain/deckRules.js deveria ter returnQuestion()');
    const decks = { d1: { questions: [{ id: 'q1', used: true }, { id: 'q2', used: false }], available: 1, total: 2 } };
    deck.returnQuestion(decks, { id: 'q1', domain_key: 'd1', question: 'Pergunta 1?' });
    check(decks.d1.questions[0].used === false && decks.d1.available === 2, 'q1 deveria voltar ao baralho, veio: ' + JSON.stringify(decks));
    deck.returnQuestion(decks, { id: 'q1', domain_key: 'd1' });
    deck.returnQuestion(decks, { id: 'q9', domain_key: 'd1' });
    deck.returnQuestion(decks, { id: 'q2', domain_key: 'x' });
    deck.returnQuestion(decks, null);
    check(decks.d1.available === 2 && decks.d1.questions[1].used === false, 'devolver de novo, pergunta que não existe ou outro domínio não muda nada, veio: ' + JSON.stringify(decks));
});

test('T213 Quem pergunta cai (BUG-033): a dupla fica guardada e quem responde a espera, jogando como Perguntador nas outras; voltando com a rodada andando, a dupla original é a próxima; no fim, sem ele, o host pode "passar a pergunta pendente" — outro Perguntador sorteado entre os conectados, menos quem responde, com a mesma pergunta; os dois caem: a espera mostra os dois e o botão só aparece quando quem responde volta', (use) => {
    // Host, A, B, C; B (quem pergunta) cai: C fica guardado e pergunta para A.
    const { env, time } = droppingMatch(use, ['A', 'B', 'C']);
    const screens = recordScreens(env);
    env.drop('peer-b');
    const notice = env.broadcastsOfType('pair-held').pop();
    check(notice && notice.droppedName === 'B' && notice.asker === 'B' && notice.answerer === 'C',
        'o aviso deveria dizer que B (quem pergunta) caiu, veio: ' + JSON.stringify(notice));
    const held = copy(env.state.heldPairs);
    check(held.length === 1 && held[0].asker === 'B' && held[0].answerer === 'C' && held[0].question.id === 'q1',
        'a dupla de B e C deveria ficar guardada, veio: ' + JSON.stringify(held));
    check(pairNow(env).asker === 'C' && pairNow(env).answerer === 'A',
        'C (quem responde a guardada) deveria jogar como Perguntador na outra dupla, veio: ' + JSON.stringify(pairNow(env)));
    answerNow(env);
    time.advance(3000);
    check(pairNow(env).answerer === 'Host', 'pré-condição: o host responde em seguida, veio: ' + JSON.stringify(pairNow(env)));
    answerNow(env);
    env.clearLog();
    screens.length = 0;
    time.advance(3000);
    check(JSON.stringify(env.state.waitingFor) === '["B"]', 'no fim, a rodada deveria esperar B (quem pergunta), veio: ' + JSON.stringify(env.state.waitingFor));
    const shown = screens.filter(s => s.name === 'showRoundWaitingMessage').pop();
    check(shown && JSON.stringify(shown.args[0]) === '["B"]' && shown.args[1] === true,
        'o host deveria ver a espera com o botão de passar a pergunta (canHandOver), veio: ' + JSON.stringify(shown && shown.args));

    // "Passar a pergunta pendente para outra pessoa": outro Perguntador, a mesma pergunta.
    env.clearLog();
    env.Game.core.handOverHeldQuestion();
    const passed = pairNow(env);
    check(passed && passed.answerer === 'C' && passed.asker === 'A' && passed.questionId === 'q1' && env.state.heldPairs.length === 0 && env.state.waitingFor.length === 0,
        'a pergunta guardada deveria ir para outro Perguntador (A, sorteado entre os conectados menos C), veio: ' + JSON.stringify(passed));
    const toA = env.record.sent.filter(e => e.to === 'peer-a' && e.msg.type === 'question' && e.msg.isAsker).pop();
    check(toA && toA.msg.id === 'q1' && toA.msg.correct === 'A', 'o novo Perguntador deveria receber a pergunta com o gabarito, veio: ' + JSON.stringify(toA && toA.msg));
    env.clearLog();
    env.Game.core.handOverHeldQuestion();
    check(env.broadcastsOfType('round-start').length === 0, 'sem espera nem pergunta a passar, o botão não faz nada');

    // B volta com a rodada andando: a dupla original é a próxima.
    const mid = droppingMatch(use, ['A', 'B', 'C']);
    mid.env.drop('peer-b');
    mid.env.join('B', peerOf('B'));
    answerNow(mid.env);
    mid.time.advance(3000);
    const original = pairNow(mid.env);
    check(original && original.asker === 'B' && original.answerer === 'C' && original.questionId === 'q1',
        'com B de volta, a dupla original deveria ser a próxima, veio: ' + JSON.stringify(original));

    // Os dois caem: a espera mostra os dois; com C de volta, o host pode passar a pergunta.
    const both = droppingMatch(use, ['A', 'B', 'C']);
    const bothScreens = recordScreens(both.env);
    // Sorteio 0 dali em diante: o primeiro que pode responder e o primeiro que pode perguntar.
    vm.runInContext('Math.random = () => 0', both.env.ctx);
    both.env.drop('peer-c');
    check(pairNow(both.env).answerer === 'Host' && pairNow(both.env).asker === 'A', 'pré-condição: A pergunta para o host, veio: ' + JSON.stringify(pairNow(both.env)));
    both.env.drop('peer-b');
    answerNow(both.env);
    both.time.advance(3000);
    answerNow(both.env);
    both.time.advance(3000);
    check(JSON.stringify(both.env.state.waitingFor.slice().sort()) === '["B","C"]',
        'a espera deveria mostrar os dois que caíram, veio: ' + JSON.stringify(both.env.state.waitingFor));
    const noButton = bothScreens.filter(s => s.name === 'showRoundWaitingMessage').pop();
    check(noButton && noButton.args[1] === false, 'com quem responde fora, não há pergunta para passar, veio: ' + JSON.stringify(noButton && noButton.args));
    both.env.clearLog();
    bothScreens.length = 0;
    both.env.join('C', peerOf('C'));
    const update = both.env.broadcastsOfType('round-waiting').pop();
    const withButton = bothScreens.filter(s => s.name === 'showRoundWaitingMessage').pop();
    check(update && JSON.stringify(update.waitingFor) === '["B"]' && withButton && withButton.args[1] === true && both.env.broadcastsOfType('round-start').length === 0,
        'com C de volta e B fora, a espera continua só por B, agora com o botão, veio: ' + JSON.stringify({ update, args: withButton && withButton.args }));
    // C cai de novo durante a espera: a espera volta a ter os dois, sem o botão.
    both.env.clearLog();
    bothScreens.length = 0;
    both.env.drop('peer-c');
    const again = both.env.broadcastsOfType('round-waiting').pop();
    const noButtonAgain = bothScreens.filter(s => s.name === 'showRoundWaitingMessage').pop();
    check(again && JSON.stringify(again.waitingFor.slice().sort()) === '["B","C"]' && noButtonAgain && noButtonAgain.args[1] === false,
        'a queda durante a espera deveria recalcular a espera (B e C, sem o botão), veio: ' + JSON.stringify({ again, args: noButtonAgain && noButtonAgain.args }));
    both.env.join('C', peerOf('C'));
    both.env.Game.core.handOverHeldQuestion();
    const byHost = pairNow(both.env);
    check(byHost && byHost.answerer === 'C' && byHost.asker === 'Host' && byHost.questionId === 'q1',
        'passada a pergunta, C responde a mesma pergunta com outro Perguntador, veio: ' + JSON.stringify(byHost));
});

test('T214 Número da dupla contra resposta atrasada (BUG-034): cada dupla tem um pairId (sequência do host) no round-start, na rodada e no state-sync; o guest guarda e manda no answer e no ask-question; o host ignora resposta e pedido de pergunta de outra dupla (com uma linha no console), mesmo de quem responde a dupla reaberta com a mesma pergunta; sem o campo, vale como antes; protocolo 13', (use) => {
    const { env, time } = droppingMatch(use, ['A', 'B']);
    check(env.Game.network.PROTOCOL_VERSION >= 13, 'o protocolo deveria ser 13 ou mais (aviso da queda, pairId, espera do fim da rodada), veio: ' + env.Game.network.PROTOCOL_VERSION);
    const r1 = pairNow(env);
    const start1 = env.broadcastsOfType('round-start').pop();
    check(typeof r1.pairId === 'number' && start1 && start1.pairId === r1.pairId,
        'a dupla e o round-start deveriam ter o mesmo número de dupla, veio: ' + JSON.stringify({ round: r1.pairId, msg: start1 && start1.pairId }));
    check(env.state.lastPairId === r1.pairId, 'o host guarda o último número dado (lastPairId), veio: ' + env.state.lastPairId);

    // B (quem responde) responde sem conexão; o pedido fica para depois. B cai e volta; a dupla dele reabre.
    const late = { type: 'answer', alternative: 'D', playerName: 'B', pairId: r1.pairId };
    env.drop('peer-b');
    env.join('B', peerOf('B'));
    answerNow(env);
    time.advance(3000);
    const r3 = pairNow(env);
    check(r3 && r3.answerer === 'B' && r3.questionId === 'q1' && r3.pairId > r1.pairId, 'pré-condição: a dupla de B reaberta com a mesma pergunta e outro número, veio: ' + JSON.stringify(r3));
    env.join('B', peerOf('B'));
    const sync = syncTo(env, 'peer-b');
    check(sync && sync.currentRound && sync.currentRound.pairId === r3.pairId, 'o state-sync deveria levar o número da dupla, veio: ' + JSON.stringify(sync && sync.currentRound));

    // A resposta atrasada chega agora: é da dupla antiga, não vale.
    env.clearLog();
    env.Game.network.handleMessage(late, 'peer-b');
    check(!env.broadcastsOfType('kpi-update').some(m => m.playerName === 'B') && env.state.currentRound.answered === false,
        'a resposta da dupla antiga não pode valer para a reaberta, veio: ' + JSON.stringify(env.broadcastsOfType('kpi-update')));
    check(env.record.logs.some(l => /outra dupla/.test(l)), 'o console do host deveria dizer que a resposta era de outra dupla, veio: ' + JSON.stringify(env.record.logs.slice(-3)));
    env.Game.network.handleMessage({ type: 'answer', alternative: 'A', playerName: 'B', pairId: r3.pairId }, 'peer-b');
    check(env.broadcastsOfType('kpi-update').some(m => m.playerName === 'B' && m.isCorrect === true), 'a resposta com o número da dupla atual vale');

    // Pedido de pergunta (ask-question) de outra dupla: ignorado; sem o campo, vale como antes.
    const asking = use(createEnvironment());
    asking.fakeTime();
    asking.createRoomAsHost();
    asking.join('A', 'peer-a');
    asking.join('B', 'peer-b');
    vm.runInContext('Math.random = () => 0.99', asking.ctx);
    asking.CONFIG.GAME.ASK_TIMEOUT = 25000;
    asking.startMatch();
    const ra = asking.state.currentRound;
    check(ra.asker === 'A' && ra.asked === false, 'pré-condição: A ainda vai fazer a pergunta, veio: ' + JSON.stringify({ asker: ra.asker, asked: ra.asked }));
    asking.Game.network.handleMessage({ type: 'ask-question', playerName: 'A', pairId: ra.pairId + 7 }, 'peer-a');
    check(ra.asked === false && asking.broadcastsOfType('question-asked').length === 0, 'o pedido de pergunta de outra dupla não pode valer');
    asking.Game.network.handleMessage({ type: 'ask-question', playerName: 'A' }, 'peer-a');
    check(ra.asked === true, 'sem o campo pairId, o pedido de pergunta vale como antes');

    // O guest guarda o número do round-start e manda no answer e no ask-question.
    const b = guestWithScreens(use, env, 'B', ['js/ui/components/questionComponent.js']);
    b.guest.Game.network.handleMessage({ type: 'round-start', event: { id: 'e1' }, asker: 'A', answerer: 'B', answeredThisRound: [], roundNumber: 1, pairId: 41 }, 'sala');
    check(b.guest.state.currentRound && b.guest.state.currentRound.pairId === 41, 'o guest deveria guardar o número da dupla do round-start, veio: ' + JSON.stringify(b.guest.state.currentRound));
    b.guest.state.currentRound.asked = true;
    b.guest.ctx.handleAlternativeClick('c', { classList: { add() {} } });
    const sent = b.guest.record.toHost.filter(m => m.type === 'answer').pop();
    check(sent && sent.pairId === 41 && sent.alternative === 'c', 'a resposta do guest deveria levar o número da dupla, veio: ' + JSON.stringify(sent));
    const a = guestWithScreens(use, env, 'A', ['js/ui/components/questionComponent.js']);
    a.guest.Game.network.handleMessage({ type: 'round-start', event: { id: 'e1' }, asker: 'A', answerer: 'B', answeredThisRound: [], roundNumber: 1, pairId: 42 }, 'sala');
    a.guest.ctx.handleAskClick();
    const ask = a.guest.record.toHost.filter(m => m.type === 'ask-question').pop();
    check(ask && ask.pairId === 42 && ask.playerName === 'A', 'o "Fazer a pergunta" do guest deveria levar o número da dupla, veio: ' + JSON.stringify(ask));
});

test('T217 Telas da queda e do host: faixa "👑 Você é o host" só no host; 👑 ao lado do host na lista de jogadores; aviso curto no topo (some depois de NOTICE_MS, o segundo aviso reinicia a contagem); aviso da queda de quem responde e de quem pergunta; espera do fim da rodada — o guest vê os nomes, o host vê há quanto tempo cada um caiu (m:ss, contando a cada segundo) e o botão de passar a pergunta quando pode; "Nova Rodada" liberado na espera; o botão de passar chama handOverHeldQuestion()', (use) => {
    const { env } = droppingMatch(use, ['A', 'B']);
    const files = ['js/utils/sanitize.js', 'js/ui/screenManager.js', 'js/ui/components/rankingComponent.js',
        'js/ui/components/questionComponent.js', 'js/ui/components/controlsComponent.js'];

    // Faixa do host e 👑 na lista.
    const host = guestWithScreens(use, env, 'A', files);
    host.guest.state.isHost = true;
    host.guest.ctx.setupUI();
    check(host.elements.hostBanner && host.elements.hostBanner.style.display === 'block' && host.elements.hostBanner.textContent === 'host.banner',
        'o host deveria ver a faixa "👑 Você é o host", veio: ' + JSON.stringify(host.elements.hostBanner));
    const guest = guestWithScreens(use, env, 'B', files);
    guest.guest.ctx.setupUI();
    check(guest.elements.hostBanner && guest.elements.hostBanner.style.display === 'none', 'o guest não vê a faixa do host, veio: ' + JSON.stringify(guest.elements.hostBanner));
    guest.guest.ctx.updatePlayersOnlineList();
    const html = guest.elements.playersOnlineList.innerHTML;
    const rows = html.split('class="online-player"').slice(1);
    const hostRow = rows.find(r => r.includes('>Host<'));
    check((html.match(/👑/g) || []).length === 1 && hostRow && hostRow.includes('👑') && hostRow.includes('ranking.hostBadge'),
        'a lista deveria ter o 👑 só ao lado do host, com o título, veio: ' + html);

    // Aviso curto no topo.
    const time = guest.guest.fakeTime();
    const NOTICE = guest.guest.CONFIG.GAME.NOTICE_MS;
    guest.guest.ctx.showNotice('primeiro');
    check(guest.elements.gameNotice.textContent === 'primeiro' && guest.elements.gameNotice.style.display === 'block', 'o aviso deveria aparecer no topo');
    time.advance(NOTICE - 1000);
    guest.guest.ctx.showNotice('segundo');
    time.advance(NOTICE - 1000);
    check(guest.elements.gameNotice.textContent === 'segundo' && guest.elements.gameNotice.style.display === 'block', 'o segundo aviso reinicia a contagem');
    time.advance(1000);
    check(guest.elements.gameNotice.style.display === 'none', 'o aviso some depois de NOTICE_MS (o config, não um número fixo)');

    // Aviso da queda: de quem responde e de quem pergunta.
    const shown = recordScreens(guest.guest);
    guest.guest.ctx.showPairHeldNotice({ type: 'pair-held', droppedName: 'B', asker: 'A', answerer: 'B' });
    guest.guest.ctx.showPairHeldNotice({ type: 'pair-held', droppedName: 'A', asker: 'A', answerer: 'B' });
    const texts = shown.filter(s => s.name === 'showNotice').map(s => s.args[0]);
    check(texts[0] === 'notice.answererDropped {"name":"B"}' && texts[1] === 'notice.askerDropped {"name":"A","answerer":"B"}',
        'o aviso deveria dizer quem caiu (e, se foi quem pergunta, de quem é a pergunta), veio: ' + JSON.stringify(texts));

    // Espera do fim da rodada no guest: os nomes, sem botão, sem contagem.
    const clock = guest.guest.fakeClock();
    guest.guest.ctx.showRoundWaitingMessage(['B', 'C'], true);
    check(guest.elements.spectatorMessage.textContent === 'question.waitingForDropped {"names":"B, C"}' && guest.elements.spectatorArea.style.display === 'block' &&
        guest.elements.questionArea.style.display === 'none',
        'o guest deveria ver "Esperando B, C voltar", veio: ' + guest.elements.spectatorMessage.textContent);
    check(guest.elements.btnHandOverQuestion.style.display === 'none' && clock.activeCount() === 0, 'o guest não tem o botão de passar a pergunta nem contagem');

    // No host: há quanto tempo caiu, a cada segundo, e o botão quando pode passar.
    const hostTime = host.guest.fakeTime(2000000);
    const hostClock = host.guest.fakeClock();
    host.guest.state.players.find(p => p.name === 'B').disconnectedAt = 2000000 - 65000;
    host.guest.ctx.showRoundWaitingMessage(['B'], true);
    const msg = () => host.elements.spectatorMessage.textContent;
    check(msg().startsWith('question.waitingForDroppedHost') && msg().includes('question.droppedFor') && msg().includes('1:05'),
        'o host deveria ver "Esperando B (caiu há 1:05) voltar", veio: ' + msg());
    check(host.elements.btnHandOverQuestion.style.display === 'block' && host.elements.btnHandOverQuestion.textContent === 'question.handOverButton',
        'o host deveria ver o botão de passar a pergunta, veio: ' + JSON.stringify(host.elements.btnHandOverQuestion));
    hostTime.advance(1000);
    hostClock.tick();
    check(msg().includes('1:06'), 'a contagem de quando caiu anda a cada segundo, veio: ' + msg());
    host.guest.ctx.showRoundWaitingMessage(['B'], false);
    check(host.elements.btnHandOverQuestion.style.display === 'none' && hostClock.activeCount() === 1,
        'sem pergunta para passar, sem o botão; e uma contagem só, veio: ' + JSON.stringify({ button: host.elements.btnHandOverQuestion.style, counts: hostClock.activeCount() }));
    host.guest.ctx.showRoundEndedMessage();
    check(hostClock.activeCount() === 0 && host.elements.btnHandOverQuestion.style.display === 'none', 'outra tela para a contagem e esconde o botão');

    // "Nova Rodada" liberado na espera, mesmo sem o ciclo completo.
    host.guest.state.answeredThisRound = [];
    host.guest.state.waitingFor = [];
    host.guest.ctx.refreshNewRoundButton();
    check(host.elements.btnNewRound.disabled === true, 'pré-condição: sem espera e sem o ciclo completo, "Nova Rodada" fica bloqueado');
    host.guest.state.waitingFor = ['B'];
    host.guest.ctx.refreshNewRoundButton();
    check(host.elements.btnNewRound.disabled === false, 'na espera, "Nova Rodada" fica liberado (seguir sem quem caiu)');

    // O botão de passar a pergunta chama handOverHeldQuestion().
    const handlers = [];
    host.elements.btnHandOverQuestion = { id: 'btnHandOverQuestion', style: {}, textContent: '', addEventListener: (type, fn) => { if (type === 'click') handlers.push(fn); } };
    let called = 0;
    host.guest.Game.core.handOverHeldQuestion = () => { called++; };
    host.guest.ctx.bindControls();
    handlers.forEach(fn => fn());
    check(handlers.length === 1 && called === 1, 'o clique no botão deveria chamar Game.core.handOverHeldQuestion(), chamadas: ' + called);
});

// ============================================
// PERGUNTA QUE CHEGA ANTES DA DUPLA (BUG-035)
// ============================================

/** Entrega a mensagem ao guest; devolve o erro, se ela der erro. */
function deliverTo(guest, msg) {
    try {
        guest.Game.network.handleMessage(copy(msg), 'sala');
        return null;
    } catch (e) {
        return e;
    }
}

test('T219 Pergunta que chega antes do aviso da dupla ou do estado (BUG-035): quem acabou de entrar lê o round-start pela fila de todos e a pergunta pela própria caixa, que pode chegar antes — sem erro, a pergunta fica guardada e abre com o round-start ou o state-sync da mesma dupla (Perguntador com o gabarito, quem responde com a pergunta feita), depois da tela da dupla; com a dupla anterior ainda na tela, a pergunta da nova não entra nela; pergunta de outra dupla não abre', (use) => {
    const { env } = droppingMatch(use, ['A', 'B']);
    const r = env.state.currentRound;
    check(r.asker === 'A' && r.answerer === 'B' && r.asked === true, 'pré-condição: A pergunta para B, pergunta feita, veio: ' + JSON.stringify(pairNow(env)));
    const start = env.broadcastsOfType('round-start').pop();
    const toAsker = env.record.sent.filter(e => e.to === peerOf('A') && e.msg.type === 'question').pop();
    const toAnswerer = env.record.sent.filter(e => e.to === peerOf('B') && e.msg.type === 'question').pop();
    check(start && toAsker && toAnswerer, 'pré-condição: round-start e as duas perguntas enviadas');

    // 1. Perguntador com a rodada esperando (state-sync da espera): a pergunta chega antes do round-start.
    const a = guestWithScreens(use, env, 'A', []).guest;
    a.state.currentRound = null;
    let error = deliverTo(a, toAsker.msg);
    check(!error, 'a pergunta antes do round-start não pode dar erro, veio: ' + (error && error.message));
    check(!a.record.ui.includes('displayQuestion'), 'sem a dupla, a pergunta ainda não deveria aparecer, telas: ' + JSON.stringify(a.record.ui));
    deliverTo(a, start);
    const ra = a.state.currentRound;
    check(ra && ra.question && ra.question.id === r.question.id && ra.question.correct === 'A',
        'com o round-start, o Perguntador deveria ficar com a pergunta (e o gabarito) que chegou antes, veio: ' + JSON.stringify(ra));
    check(a.record.ui.lastIndexOf('displayQuestion') > a.record.ui.lastIndexOf('displayRoundStart'),
        'a pergunta deveria aparecer depois da tela da dupla, telas: ' + JSON.stringify(a.record.ui));

    // 2. Quem responde: a pergunta (já feita) chega antes do round-start.
    const b = guestWithScreens(use, env, 'B', []).guest;
    error = deliverTo(b, toAnswerer.msg);
    check(!error, 'a pergunta de quem responde antes do round-start não pode dar erro, veio: ' + (error && error.message));
    deliverTo(b, start);
    const rb = b.state.currentRound;
    check(rb && rb.question && rb.question.id === r.question.id && rb.asked === true && rb.answered === false,
        'com o round-start, quem responde deveria ficar com a pergunta feita, veio: ' + JSON.stringify(rb));
    check(b.record.ui.lastIndexOf('displayQuestion') > b.record.ui.lastIndexOf('displayRoundStart'),
        'a pergunta de quem responde deveria aparecer depois da tela da dupla, telas: ' + JSON.stringify(b.record.ui));

    // 3. Quem volta: o host reabriu a dupla antes do player-join; a pergunta chega antes do state-sync.
    const back = guestWithScreens(use, env, 'A', []).guest;
    error = deliverTo(back, toAsker.msg);
    check(!error, 'a pergunta antes do state-sync não pode dar erro, veio: ' + (error && error.message));
    env.join('A', peerOf('A'));
    deliverTo(back, { type: 'state-sync', fullState: syncTo(env, peerOf('A')) });
    const rback = back.state.currentRound;
    check(rback && rback.pairId === r.pairId && rback.question && rback.question.id === r.question.id && rback.question.correct === 'A',
        'depois do state-sync, quem volta deveria estar na dupla com a pergunta e o gabarito, veio: ' + JSON.stringify(rback));
    check(back.record.ui.includes('displayQuestion'), 'quem volta deveria ver a pergunta, telas: ' + JSON.stringify(back.record.ui));
    back.record.ui.length = 0;
    deliverTo(back, start);
    check(!back.record.ui.includes('displayQuestion'), 'a pergunta guardada já foi usada pelo state-sync e não pode abrir de novo, telas: ' + JSON.stringify(back.record.ui));

    // 4. A dupla anterior ainda na tela: a pergunta da nova não entra nela e abre com o round-start da nova.
    const late = guestWithScreens(use, env, 'A', []).guest;
    deliverTo(late, { ...start, asker: 'B', answerer: 'A', pairId: r.pairId - 1 });
    late.record.ui.length = 0;
    deliverTo(late, toAsker.msg);
    check(late.state.currentRound.pairId === r.pairId - 1 && !late.state.currentRound.question,
        'a pergunta da dupla nova não pode entrar na dupla anterior, veio: ' + JSON.stringify(late.state.currentRound));
    check(!late.record.ui.includes('displayQuestion'), 'a pergunta da dupla nova não deveria aparecer na tela da anterior, telas: ' + JSON.stringify(late.record.ui));
    deliverTo(late, start);
    check(late.state.currentRound.pairId === r.pairId && late.state.currentRound.question && late.state.currentRound.question.id === r.question.id,
        'com o round-start da dupla nova, a pergunta guardada deveria abrir, veio: ' + JSON.stringify(late.state.currentRound));

    // 5. Pergunta guardada de outra dupla não abre na dupla que chega.
    const other = guestWithScreens(use, env, 'A', []).guest;
    deliverTo(other, toAsker.msg);
    deliverTo(other, { ...start, pairId: r.pairId + 1 });
    check(other.state.currentRound && other.state.currentRound.pairId === r.pairId + 1 && !other.state.currentRound.question,
        'a pergunta guardada de outra dupla não pode abrir, veio: ' + JSON.stringify(other.state.currentRound));
    check(!other.record.ui.includes('displayQuestion'), 'a pergunta de outra dupla não deveria aparecer, telas: ' + JSON.stringify(other.record.ui));
    deliverTo(other, start);
    check(!other.state.currentRound.question, 'a pergunta descartada não deveria voltar numa dupla seguinte, veio: ' + JSON.stringify(other.state.currentRound));

    // 6. O state-sync diz que a dupla já respondeu: a pergunta guardada não reabre.
    const done = guestWithScreens(use, env, 'A', []).guest;
    deliverTo(done, toAsker.msg);
    const answered = copy(syncTo(env, peerOf('A')));
    answered.currentRound.answered = true;
    deliverTo(done, { type: 'state-sync', fullState: answered });
    check(done.state.currentRound && done.state.currentRound.answered === true && !done.record.ui.includes('displayQuestion'),
        'a pergunta guardada não pode reabrir a dupla que já respondeu, veio: ' + JSON.stringify({ round: done.state.currentRound, ui: done.record.ui }));

    // 7. Pergunta sem o número da dupla (host de versão anterior), antes do round-start: abre com ele.
    const old = guestWithScreens(use, env, 'A', []).guest;
    const noPair = copy(toAsker.msg);
    delete noPair.pairId;
    error = deliverTo(old, noPair);
    check(!error, 'a pergunta sem o número da dupla, antes do round-start, não pode dar erro, veio: ' + (error && error.message));
    deliverTo(old, start);
    check(old.state.currentRound && old.state.currentRound.question && old.state.currentRound.question.id === r.question.id,
        'sem o número da dupla, a pergunta guardada abre com o round-start seguinte, veio: ' + JSON.stringify(old.state.currentRound));
});

test('T220 A pergunta leva o número da dupla (BUG-035): a do Perguntador (com o gabarito) e a de quem responde, na dupla nova e na dupla guardada que reabre, com o número da dupla da vez', (use) => {
    const { env, time } = droppingMatch(use, ['A', 'B', 'C']);
    const questionsTo = (name) => env.record.sent.filter(e => e.to === peerOf(name) && e.msg.type === 'question').map(e => e.msg);
    const r1 = env.state.currentRound;
    check(r1.asker === 'B' && r1.answerer === 'C', 'pré-condição: B pergunta para C, veio: ' + JSON.stringify(pairNow(env)));
    const ask1 = questionsTo('B').pop();
    const answer1 = questionsTo('C').pop();
    check(ask1 && ask1.isAsker === true && ask1.pairId === r1.pairId,
        'a pergunta do Perguntador deveria levar o número da dupla, veio: ' + JSON.stringify(ask1 && { pairId: ask1.pairId, isAsker: ask1.isAsker }) + ' (dupla ' + r1.pairId + ')');
    check(answer1 && answer1.isAnswerer === true && answer1.pairId === r1.pairId,
        'a pergunta de quem responde deveria levar o número da dupla, veio: ' + JSON.stringify(answer1 && { pairId: answer1.pairId, isAnswerer: answer1.isAnswerer }) + ' (dupla ' + r1.pairId + ')');

    // C cai: a dupla fica guardada; ele volta, a dupla reabre com outro número.
    env.drop(peerOf('C'));
    const r2 = env.state.currentRound;
    check(r2 && r2.pairId > r1.pairId && r2.answerer !== 'C', 'pré-condição: outra dupla sem C, veio: ' + JSON.stringify(pairNow(env)));
    env.join('C', peerOf('C'));
    answerNow(env);
    time.advance(3000);
    const r3 = env.state.currentRound;
    check(r3 && r3.answerer === 'C' && r3.question.id === r1.question.id && r3.pairId > r2.pairId,
        'pré-condição: a dupla guardada de C reabre com a mesma pergunta e outro número, veio: ' + JSON.stringify(pairNow(env)));
    const ask3 = questionsTo(r3.asker).pop();
    const answer3 = questionsTo('C').pop();
    check(ask3 && ask3.pairId === r3.pairId, 'na dupla reaberta, a pergunta do Perguntador deveria levar o número novo, veio: ' + JSON.stringify(ask3 && ask3.pairId) + ' (dupla ' + r3.pairId + ')');
    check(answer3 && answer3.pairId === r3.pairId, 'na dupla reaberta, a pergunta de quem responde deveria levar o número novo, veio: ' + JSON.stringify(answer3 && answer3.pairId) + ' (dupla ' + r3.pairId + ')');
});

finish('Queda e volta de jogador');
