// ============================================
// PM: The KPI Master - Testes de lógica: Queda e volta de jogador
// ============================================
// Jogador que cai e volta: lugar reservado, rodada abortada, pausa por
// falta de conexão, saída da página, o que quem volta recebe (relógio,
// situação da rodada) e a volta pelo sinal de vida.
// Ambiente simulado e ajudantes: environment.js. Rodar a partir da raiz:
//     node tests/logic/drop-and-return.test.js
// ============================================

const {
    fs, path, vm, ROOT, createEnvironment, test, check, start, finish,
    syncTo, roundScreens, roomToReload, reloadHost, tryReloadHost, recordScreens
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

finish('Queda e volta de jogador');
