// ============================================
// PM: The KPI Master - Testes de lógica: F5 do host
// ============================================
// F5 do host em cada momento da partida: faz o que aconteceria sem o F5
// (D3f, BUG-019, BUG-020). O host volta pelo estado que gravou no banco
// (secret/state; etapa 2b).
// Ambiente simulado e ajudantes: environment.js. Rodar a partir da raiz:
//     node tests/logic/host-reload.test.js
// ============================================

const {
    fs, path, vm, ROOT, createEnvironment, test, check, start, finish,
    syncTo, roundScreens, roomToReload, reloadHost, tryReloadHost, recordScreens,
    savedStateV1, savedStateV2, finalRankingV2, oldNamesIn, oldPlayerNamesIn,
    savedStateV3, oldAdvisoryNamesIn, savedState, storeSavedState
} = require('./environment');

start('F5 do host');

/** Responde (certo) cada pergunta e avança, até o host encerrar a rodada. */
function answerUntilRoundEnds(env) {
    for (let i = 0; i < 10 && !env.state.roundEnded; i++) {
        const r = env.state.currentRound;
        env.Game.core.handleAnswer({ alternative: r.question.correct, playerName: r.answerer });
        env.Game.core.nextTurn();
    }
}

test('T53 F5 do host com a rodada encerrada: continua encerrada, "Nova Rodada" liberado, nada começa sozinho (B3)', (use) => {
    const env = use(createEnvironment());
    roomToReload(env);
    env.join('A', 'peer-a');
    env.startMatch();
    answerUntilRoundEnds(env);
    check(env.state.roundEnded === true, 'pré-condição: rodada encerrada, aguardando o "Nova Rodada"');

    const reloaded = use(reloadHost(env));
    const time = reloaded.fakeTime();
    reloaded.clearLog();
    reloaded.Game.core.resumeMatchAfterReload();
    check(reloaded.state.roundEnded === true, 'depois do F5, a rodada deveria continuar encerrada');
    const screens = roundScreens(reloaded);
    check(screens.includes('showRoundEndedMessage'), 'o host deveria ver "Rodada encerrada", viu: ' + screens.join(', '));
    check(!screens.includes('displayQuestion') && !screens.includes('displayRoundStart'), 'não pode reabrir a última pergunta, viu: ' + screens.join(', '));
    check(reloaded.Game.selectors.isCycleComplete(reloaded.Game.getActivePlayers(), reloaded.state.answeredThisRound),
        'o "Nova Rodada" deveria ficar liberado (rodízio completo preservado)');
    time.advance(reloaded.CONFIG.GAME.ANSWER_TIMEOUT * 2);
    check(reloaded.state.roundEnded === true && reloaded.broadcastsOfType('round-start').length === 0,
        'nada pode começar sozinho depois do F5');

    // A volta: recebe "rodada encerrada" e nada começa.
    reloaded.join('A', 'peer-a');
    const sync = syncTo(reloaded, 'peer-a');
    check(sync && sync.roundEnded === true && sync.matchPaused === false, 'quem volta deveria receber "rodada encerrada"');
    check(reloaded.broadcastsOfType('round-start').length === 0, 'a volta de A não pode começar rodada sozinha');
    const guest = use(createEnvironment());
    guest.receiveSync('A', sync);
    const guestScreens = roundScreens(guest);
    check(guestScreens.includes('showRoundEndedMessage') && !guestScreens.includes('displaySpectatorView'),
        'A deveria ver "Rodada encerrada" (não a última dupla em andamento), viu: ' + guestScreens.join(', '));

    // O host clica em "Nova Rodada".
    reloaded.Game.core.startNewRound();
    const rs = reloaded.broadcastsOfType('round-start').pop();
    check(reloaded.state.currentRound && !reloaded.state.currentRound.answered && reloaded.state.roundEnded === false,
        'Nova Rodada deveria começar uma dupla nova');
    check(rs && rs.answeredThisRound.length === 0, 'rodada nova começa com o rodízio zerado');
});

test('T54 F5 do host logo depois de uma resposta (antes da próxima dupla): a partida segue (B4)', (use) => {
    // Faltam outros: segue para a próxima dupla, com o mesmo evento.
    const env = use(createEnvironment());
    roomToReload(env);
    env.join('A', 'peer-a');
    env.join('B', 'peer-b');
    env.startMatch();
    const r = env.state.currentRound;
    env.Game.core.handleAnswer({ alternative: r.question.correct, playerName: r.answerer });
    const answererKpi = env.player(r.answerer).kpi;
    // F5 antes do nextTurn(): o setTimeout de 3s se perde com a página.

    const reloaded = use(reloadHost(env));
    reloaded.clearLog();
    reloaded.Game.core.resumeMatchAfterReload();
    const r2 = reloaded.state.currentRound;
    check(r2 && r2.answered === false && r2.answerer !== r.answerer,
        'deveria seguir para a próxima dupla, com outro Respondedor, veio: ' + JSON.stringify(r2 && { r: r2.answerer, answered: r2.answered }));
    check(r2.event && r2.event.id === r.event.id, 'a rodada continua com o mesmo evento');
    check(reloaded.broadcastsOfType('round-start').length === 1, 'deveria avisar a nova dupla');
    check(reloaded.broadcastsOfType('show-event').length === 0 && !reloaded.record.ui.includes('showEventModal'), 'não deveria reexibir o evento');
    check(JSON.stringify(reloaded.state.answeredThisRound) === JSON.stringify([r.answerer]), 'quem respondeu continua no rodízio');
    check(!reloaded.state.roundEnded, 'a rodada ainda não acabou');
    check(reloaded.player(r.answerer).kpi === answererKpi, 'a resposta não pode ser contada de novo');

    // Era a última resposta da rodada: a rodada encerra.
    const env2 = use(createEnvironment());
    roomToReload(env2);
    env2.join('A', 'peer-a');
    env2.startMatch();
    let rr = env2.state.currentRound;
    env2.Game.core.handleAnswer({ alternative: rr.question.correct, playerName: rr.answerer });
    env2.Game.core.nextTurn();
    rr = env2.state.currentRound;
    env2.Game.core.handleAnswer({ alternative: rr.question.correct, playerName: rr.answerer });
    check(!env2.state.roundEnded, 'pré-condição: F5 antes de a rodada ser encerrada');

    const reloaded2 = use(reloadHost(env2));
    reloaded2.clearLog();
    reloaded2.Game.core.resumeMatchAfterReload();
    check(reloaded2.state.roundEnded === true, 'todos já responderam: a rodada deveria encerrar');
    check(reloaded2.broadcastsOfType('round-ended').length === 1 && reloaded2.broadcastsOfType('round-start').length === 0,
        'deveria avisar "rodada encerrada", sem começar outra dupla');
    check(reloaded2.record.ui.includes('showRoundEndedMessage'), 'o host deveria ver "Rodada encerrada"');

    // Pergunta respondida pelo outro sinal (Respondedor já no rodízio, sem `answered`).
    const env3 = use(createEnvironment());
    roomToReload(env3);
    env3.join('A', 'peer-a');
    env3.join('B', 'peer-b');
    env3.startMatch();
    const r3 = env3.state.currentRound;
    env3.Game.core.handleAnswer({ alternative: r3.question.correct, playerName: r3.answerer });
    env3.state.currentRound.answered = false;
    env3.Game.saveState();

    const reloaded3 = use(reloadHost(env3));
    reloaded3.clearLog();
    reloaded3.Game.core.resumeMatchAfterReload();
    check(reloaded3.state.currentRound && reloaded3.state.currentRound.answerer !== r3.answerer,
        'Respondedor já no rodízio: a pergunta conta como respondida e a partida segue');
    check(reloaded3.broadcastsOfType('round-start').length === 1 && !reloaded3.record.ui.includes('displayQuestion'),
        'deveria formar a próxima dupla, sem reabrir a pergunta já respondida');
});

test('T55 F5 do host com a partida pausada: continua pausada com o mesmo evento e retoma quando alguém volta (B5)', (use) => {
    const env = use(createEnvironment());
    roomToReload(env);
    env.join('A', 'peer-a');
    env.startMatch();
    env.drop('peer-a');
    check(env.state.matchPaused && env.state.matchPaused.event, 'pré-condição: partida pausada, com o evento');
    const pausedEvent = env.state.matchPaused.event;

    const reloaded = use(reloadHost(env));
    const ev = reloaded.Game.domain.event;
    const originalDraw = ev.drawEvent;
    const originalApply = ev.applyEventEffects;
    let draws = 0;
    let effects = 0;
    ev.drawEvent = (...a) => { draws++; return originalDraw(...a); };
    ev.applyEventEffects = (...a) => { effects++; return originalApply(...a); };
    reloaded.clearLog();
    reloaded.Game.core.resumeMatchAfterReload();
    check(reloaded.state.matchPaused && reloaded.state.matchPaused.event && reloaded.state.matchPaused.event.id === pausedEvent.id,
        'deveria continuar pausada com o MESMO evento, veio: ' + JSON.stringify(reloaded.state.matchPaused));
    check(reloaded.state.currentRound === null, 'não deveria haver dupla durante a pausa');
    check(draws === 0 && effects === 0, 'não pode sortear outro evento nem reaplicar efeitos (sorteios: ' + draws + ', efeitos: ' + effects + ')');
    check(reloaded.broadcastsOfType('show-event').length === 0 && !reloaded.record.ui.includes('showEventModal'), 'não deveria mostrar evento');
    check(reloaded.record.ui.includes('showMatchPausedMessage'), 'o host deveria ver o aviso de pausa');

    // A volta: retoma com o mesmo evento, sem modal.
    reloaded.join('A', 'peer-a');
    check(!reloaded.state.matchPaused, 'a volta de A deveria retomar a partida');
    const r = reloaded.state.currentRound;
    check(r && r.event && r.event.id === pausedEvent.id, 'a rodada retomada deveria usar o mesmo evento');
    check(reloaded.broadcastsOfType('round-start').length === 1 && reloaded.broadcastsOfType('show-event').length === 0,
        'deveria mandar a nova dupla, sem reexibir o evento');
    check(draws === 0 && effects === 0, 'a retomada também não sorteia nem reaplica');
});

test('T210 F5 do host sem dupla no meio da rodada (ex.: a troca de host com o host antigo na dupla zera a dupla): a retomada forma outra dupla com o MESMO evento e o mesmo número de rodada (guardados no estado salvo), sem sortear evento, sem aviso e sem aplicar efeito de novo (BUG-032)', (use) => {
    const env = use(createEnvironment());
    roomToReload(env);
    env.join('A', 'peer-a');
    env.join('B', 'peer-b');
    env.startMatch();
    env.Game.core.startNewRound();
    const event = env.state.currentRound.event;
    check(env.state.roundNumber === 2, 'pré-condição: rodada 2, veio: ' + env.state.roundNumber);
    env.state.currentRound = null;
    env.Game.saveState();
    const saved = savedState(env);
    check(saved && saved.roundNumber === 2 && saved.roundEvent && saved.roundEvent.id === event.id,
        'o estado salvo deveria guardar o número e o evento da rodada, veio: ' + JSON.stringify(saved && { roundNumber: saved.roundNumber, roundEvent: saved.roundEvent }));

    const reloaded = use(reloadHost(env));
    const ev = reloaded.Game.domain.event;
    const originalDraw = ev.drawEvent;
    const originalApply = ev.applyEventEffects;
    let draws = 0;
    let effects = 0;
    ev.drawEvent = (...a) => { draws++; return originalDraw(...a); };
    ev.applyEventEffects = (...a) => { effects++; return originalApply(...a); };
    reloaded.clearLog();
    reloaded.Game.core.resumeMatchAfterReload();
    const r = reloaded.state.currentRound;
    check(r && r.asker && r.answerer && r.event && r.event.id === event.id,
        'a retomada deveria formar outra dupla com o mesmo evento, veio: ' + JSON.stringify(r && { asker: r.asker, event: r.event }));
    check(draws === 0 && effects === 0 && reloaded.broadcastsOfType('show-event').length === 0 && !reloaded.record.ui.includes('showEventModal'),
        'a retomada não pode sortear evento, aplicar efeito nem mostrar o aviso (sorteios: ' + draws + ', efeitos: ' + effects + ')');
    const start = reloaded.broadcastsOfType('round-start').pop();
    check(reloaded.state.roundNumber === 2 && start && start.roundNumber === 2,
        'continua a rodada 2, veio: ' + JSON.stringify({ state: reloaded.state.roundNumber, msg: start && start.roundNumber }));
});

test('T56 F5 do host com a pergunta aberta e sem rodada: a mesma pergunta; relógio e prazo de resposta continuam de onde estavam', (use) => {
    // Pergunta aberta há 20 s: reexibida; relógio e prazo de resposta seguem pela hora de término.
    const env = use(createEnvironment());
    env.time = env.fakeTime();
    roomToReload(env);
    env.join('A', 'peer-a');
    env.startMatch();
    const r = env.state.currentRound;
    env.time.advance(20000);

    const reloaded = use(reloadHost(env));
    const time = reloaded.fakeTime(env.time.now());
    const clock = reloaded.fakeClock();
    reloaded.clearLog();
    reloaded.Game.core.resumeMatchAfterReload();
    const r2 = reloaded.state.currentRound;
    check(r2 && r2.asker === r.asker && r2.answerer === r.answerer && r2.question.id === r.question.id && !r2.answered,
        'a mesma pergunta deveria continuar em andamento');
    const screens = roundScreens(reloaded);
    check(screens.includes('displayRoundStart') && screens.includes('displayQuestion'), 'deveria reexibir a pergunta, viu: ' + screens.join(', '));
    check(reloaded.broadcastsOfType('round-start').length === 0 && reloaded.broadcastsOfType('show-event').length === 0,
        'não pode trocar a pergunta (BUG-001)');

    const D = reloaded.CONFIG.GAME.SESSION_DURATION;
    check(clock.activeCount() === 1, 'o relógio da partida deveria voltar a contar, ligados: ' + clock.activeCount());
    check(reloaded.state.timer === D - 20, 'o relógio deveria continuar de onde estava (faltam ' + (D - 20) + ' s), veio: ' + reloaded.state.timer);
    time.advance(1000);
    clock.tick();
    check(reloaded.state.timer === D - 21, 'deveria contar 1 segundo, veio: ' + reloaded.state.timer);

    // Faltavam ANSWER_TIMEOUT - 20 s quando o host deu F5 (1 s já passou depois dele).
    const left = reloaded.CONFIG.GAME.ANSWER_TIMEOUT - 20000 - 1000;
    time.advance(left - 1);
    check(!reloaded.broadcastsOfType('kpi-update').some(m => m.playerName === r.answerer),
        'o prazo de resposta continua de onde estava: 1 ms antes do fim, a vez ainda não deveria ter sido pulada');
    time.advance(1);
    check(reloaded.state.currentRound.answered === true && reloaded.broadcastsOfType('kpi-update').some(m => m.playerName === r.answerer),
        'no fim do prazo que faltava, a vez deveria ser pulada (sem prazo inteiro de novo)');

    // O tempo da partida acabou durante o F5: a partida termina na retomada, sem dupla nova nem prazo armado.
    const over = use(createEnvironment());
    over.time = over.fakeTime();
    roomToReload(over);
    over.join('A', 'peer-a');
    over.startMatch();
    const overReloaded = use(reloadHost(over));
    const overTime = overReloaded.fakeTime(over.time.now() + D * 1000 + 1000);
    overReloaded.clearLog();
    overReloaded.Game.core.resumeMatchAfterReload();
    check(overReloaded.state.gameOver === true && overReloaded.broadcastsOfType('game-over').length === 1,
        'com o tempo da partida vencido durante o F5, a retomada deveria encerrar a partida');
    check(overReloaded.broadcastsOfType('round-start').length === 0 && overTime.pending() === 0,
        'depois do fim, a retomada não deveria começar dupla nova nem armar prazo, sobraram: ' + overTime.pending());

    // Partida em andamento sem rodada (nem pausada, nem encerrada): começa uma.
    const env2 = use(createEnvironment());
    roomToReload(env2);
    env2.join('A', 'peer-a');
    env2.state.gameStarted = true;
    env2.Game.saveState();
    const reloaded2 = use(reloadHost(env2));
    reloaded2.clearLog();
    reloaded2.Game.core.resumeMatchAfterReload();
    check(reloaded2.state.currentRound && !reloaded2.state.currentRound.answered, 'sem rodada, deveria começar uma dupla');
    check(reloaded2.broadcastsOfType('show-event').length === 1, 'rodada nova, com o evento');

    // Lobby: nada a retomar.
    const env3 = use(createEnvironment());
    roomToReload(env3);
    env3.join('A', 'peer-a');
    const reloaded3 = use(reloadHost(env3));
    reloaded3.clearLog();
    reloaded3.Game.core.resumeMatchAfterReload();
    check(reloaded3.record.ui.length === 0 && reloaded3.record.broadcasts.length === 0 && reloaded3.state.currentRound === null,
        'no lobby, a retomada não faz nada');

    // Guest e fim de jogo: nada a retomar (o motor da partida é do host).
    for (const scenario of ['guest', 'fim de jogo']) {
        const reloaded4 = use(reloadHost(env2));
        if (scenario === 'guest') reloaded4.state.isHost = false;
        else reloaded4.state.gameOver = true;
        const roundBefore = JSON.stringify(reloaded4.state.currentRound);
        reloaded4.clearLog();
        reloaded4.Game.core.resumeMatchAfterReload();
        check(reloaded4.record.ui.length === 0 && reloaded4.record.broadcasts.length === 0 && JSON.stringify(reloaded4.state.currentRound) === roundBefore,
            scenario + ': a retomada não deveria fazer nada');
    }

    // main.js só chama a retomada (a lógica fica no sessionEngine.js, testável aqui).
    const main = fs.readFileSync(path.join(ROOT, 'js/main.js'), 'utf8');
    check(/if \(state\.isHost\) \{\s*Game\.core\.resumeMatchAfterReload\(\);/.test(main),
        'init() deveria chamar Game.core.resumeMatchAfterReload() para o host');
    check(!/armAnswerTimeout|pickNewPair|setInterval/.test(main), 'main.js não deveria ter lógica própria de retomada');
});

test('T58 F5 do host logo depois da resposta que completa a última fase: a partida termina, como sem o F5', (use) => {
    // 3 jogadores: a rodada ainda não acabou, então só o fim de jogo explica parar.
    const prepareLastAnswer = (env) => {
        roomToReload(env);
        env.join('A', 'peer-a');
        env.join('B', 'peer-b');
        env.startMatch();
        const r = env.state.currentRound;
        const lastFocusArea = env.CONFIG.FOCUS_AREAS[env.CONFIG.FOCUS_AREAS.length - 1].id;
        Object.assign(env.player(r.answerer), { focusArea: lastFocusArea, activities: env.CONFIG.GAME.ACTIVITIES_PER_FOCUS_AREA - 1 });
        return r;
    };

    // Controle, sem F5: 3s depois da resposta, a partida termina.
    const withoutF5 = use(createEnvironment());
    const time = withoutF5.fakeTime();
    const r0 = prepareLastAnswer(withoutF5);
    withoutF5.Game.core.handleAnswer({ alternative: r0.question.correct, playerName: r0.answerer });
    time.advance(3000);
    check(withoutF5.state.gameOver === true, 'pré-condição: sem F5, a resposta que completa a última fase encerra a partida');

    // Com F5 antes dos 3s: a retomada também encerra.
    const env = use(createEnvironment());
    const r = prepareLastAnswer(env);
    env.Game.core.handleAnswer({ alternative: r.question.correct, playerName: r.answerer });
    check(!env.state.gameOver, 'pré-condição: F5 antes de a partida terminar');

    const reloaded = use(reloadHost(env));
    reloaded.clearLog();
    reloaded.Game.core.resumeMatchAfterReload();
    check(reloaded.state.gameOver === true, 'depois do F5, a partida deveria terminar');
    check(reloaded.broadcastsOfType('game-over').length === 1, 'deveria avisar os guests do fim de jogo');
    check(reloaded.broadcastsOfType('round-start').length === 0 && reloaded.broadcastsOfType('round-ended').length === 0,
        'não pode seguir para outra dupla nem encerrar só a rodada');
});

/**
 * Partida de 3 (Host, A, B) com a dupla fixada e um pedido de
 * assessoria aceito pelo host, ainda sem resposta do assessor.
 */
function preparePendingAdvisory(env, { asker, answerer, advisor }) {
    roomToReload(env);
    env.join('A', 'peer-a');
    env.join('B', 'peer-b');
    env.startMatch();
    // O sorteio da dupla é aleatório: fixa os papéis (mesma pergunta e evento).
    env.state.currentRound = { ...env.state.currentRound, asker: asker, answerer: answerer, answered: false };
    env.state.answeredThisRound = [];
    if (answerer === 'Host') {
        env.Game.core.requestAdvisory(advisor);
    } else {
        env.Game.network.handleMessage({ type: 'advisory-request', advisorName: advisor, requesterName: answerer }, env.player(answerer).peerId);
    }
    const a = env.state.currentRound.advisory;
    check(a && a.status === 'pending' && a.advisorName === advisor, 'pré-condição: assessoria pendente');
    check(env.record.sent.some(e => e.to === env.player(advisor).peerId && e.msg.type === 'advisory-question'),
        'pré-condição: o assessor recebeu a pergunta');
    return env.state.currentRound;
}

test('T59 F5 do host com assessoria pendente: o pedido continua — quem responde segue esperando, a resposta de quem foi chamado vale depois do F5 e o prazo de resposta volta do que faltava; resposta já guardada é processada quando o apoio chega (BUG-019, pelo Firebase)', (use) => {
    // 1) Respondedor guest (A), assessor guest (B), o host pergunta; F5 5 s depois do pedido.
    const env = use(createEnvironment());
    const before = env.fakeTime();
    const r = preparePendingAdvisory(env, { asker: 'Host', answerer: 'A', advisor: 'B' });
    const answerTimeLeft = env.state.currentRound.answerTimeLeft;
    check(typeof answerTimeLeft === 'number' && answerTimeLeft > 0, 'pré-condição: prazo de resposta parado, com o que faltava, veio: ' + answerTimeLeft);
    before.advance(5000);

    const reloaded = use(reloadHost(env));
    const time = reloaded.fakeTime(before.now());
    reloaded.clearLog();
    reloaded.Game.core.resumeMatchAfterReload();
    const r2 = reloaded.state.currentRound;
    check(r2 && r2.answerer === 'A' && r2.question.id === r.question.id && !r2.answered,
        'a mesma pergunta deveria continuar em andamento');
    check(r2.advisory && r2.advisory.status === 'pending' && r2.advisory.advisorName === 'B' && r2.advisory.kind === 'advisory',
        'o pedido de assessoria pendente deveria continuar depois do F5, veio: ' + JSON.stringify(r2.advisory));
    check(typeof r2.answerEndsAt !== 'number' && reloaded.broadcastsOfType('advisory-result').length === 0,
        'com o apoio pendente, o prazo de resposta continua parado e nada se resolve no F5, veio: ' + JSON.stringify({ answerEndsAt: r2.answerEndsAt }));

    // B responde depois do F5: a sugestão vale e o prazo de resposta volta do que faltava.
    reloaded.Game.network.handleMessage({ type: 'advisory-answer', alternative: r.question.correct, declined: false }, 'peer-b');
    const result = reloaded.broadcastsOfType('advisory-result').pop();
    check(result && result.declined === false && result.suggestion === r.question.correct && reloaded.state.currentRound.advisory.status === 'accepted',
        'a resposta de B depois do F5 deveria valer (advisory-result com a sugestão), veio: ' + JSON.stringify(result));
    check(reloaded.state.currentRound.answerEndsAt === time.now() + answerTimeLeft && result.answerEndsAt === reloaded.state.currentRound.answerEndsAt,
        'o prazo de resposta deveria voltar do que faltava quando o apoio começou (' + answerTimeLeft + ' ms), veio: ' +
        JSON.stringify({ answerEndsAt: reloaded.state.currentRound.answerEndsAt, now: time.now() }));
    const fee = reloaded.CONFIG.RESOURCES.ADVISORY_FEE;
    const paid = { A: reloaded.player('A').resources, B: reloaded.player('B').resources };
    reloaded.Game.network.handleMessage({ type: 'answer', alternative: r.question.correct, playerName: 'A' }, 'peer-a');
    check(reloaded.player('A').resources === paid.A - fee && reloaded.player('B').resources === paid.B + fee,
        'seguindo a sugestão certa recebida depois do F5, A deveria pagar o honorário a B, veio: ' +
        JSON.stringify({ A: reloaded.player('A').resources, B: reloaded.player('B').resources }));
    time.advance(3000);
    check(reloaded.broadcastsOfType('round-start').length === 1, 'e a partida segue para a próxima dupla');

    // 2) O host é quem responde: a tela dele volta com o pedido pendente (botões travados) e a sugestão chega depois do F5.
    const env3 = use(createEnvironment());
    const before3 = env3.fakeTime();
    preparePendingAdvisory(env3, { asker: 'A', answerer: 'Host', advisor: 'B' });
    const reloaded3 = use(reloadHost(env3));
    reloaded3.fakeTime(before3.now());
    const advisoryOnScreen = [];
    const realUi = reloaded3.Game.ui;
    reloaded3.Game.ui = new Proxy({}, {
        get: (_, name) => (...args) => {
            if (name === 'displayQuestion') advisoryOnScreen.push(JSON.parse(JSON.stringify(reloaded3.state.currentRound && reloaded3.state.currentRound.advisory || null)));
            return realUi[name](...args);
        }
    });
    reloaded3.Game.core.resumeMatchAfterReload();
    check(advisoryOnScreen.length === 1 && advisoryOnScreen[0] && advisoryOnScreen[0].status === 'pending',
        'o host deveria ver a pergunta com o pedido pendente (botões travados), viu: ' + JSON.stringify(advisoryOnScreen));
    reloaded3.Game.network.handleMessage({ type: 'advisory-answer', alternative: 'B', declined: false }, 'peer-b');
    check(reloaded3.state.currentRound.advisory.status === 'accepted' && reloaded3.record.ui.includes('showAdvisoryResult'),
        'o host deveria receber a sugestão de B depois do F5');

    // 3) A já tinha respondido e a resposta esperava B: continua guardada no F5 e é processada quando B responde.
    const env4 = use(createEnvironment());
    const before4 = env4.fakeTime();
    const r4 = preparePendingAdvisory(env4, { asker: 'Host', answerer: 'A', advisor: 'B' });
    env4.Game.network.handleMessage({ type: 'answer', alternative: r4.question.correct, playerName: 'A' }, 'peer-a');
    check(env4.state.currentRound.pendingAnswer, 'pré-condição: resposta guardada esperando a assessoria');
    env4.Game.saveState(); // salvo por outro motivo antes do F5 (ex.: alguém caiu)
    const reloaded4 = use(reloadHost(env4));
    const time4 = reloaded4.fakeTime(before4.now());
    reloaded4.clearLog();
    reloaded4.Game.core.resumeMatchAfterReload();
    const r5 = reloaded4.state.currentRound;
    check(!reloaded4.broadcastsOfType('kpi-update').some(m => m.playerName === 'A') && r5 && r5.pendingAnswer &&
        r5.advisory && r5.advisory.status === 'pending',
        'a resposta guardada deveria continuar esperando B depois do F5, veio: ' + JSON.stringify(r5 && { p: r5.pendingAnswer, a: r5.advisory }));
    reloaded4.Game.network.handleMessage({ type: 'advisory-answer', alternative: r4.question.correct, declined: false }, 'peer-b');
    const kpiOfA = reloaded4.broadcastsOfType('kpi-update').find(m => m.playerName === 'A');
    check(kpiOfA && kpiOfA.isCorrect === true, 'com a resposta de B, a resposta guardada de A deveria ser processada');
    const r6 = reloaded4.state.currentRound;
    check(reloaded4.state.answeredThisRound.includes('A') && r6 && !r6.pendingAnswer,
        'A entra no rodízio e nada fica guardado, veio: ' + JSON.stringify(r6 && { p: r6.pendingAnswer }));
    time4.advance(3000);
    check(reloaded4.broadcastsOfType('round-start').length === 1, 'e a partida segue para a próxima dupla');
});

test('T60 F5 do host com a assessoria já resolvida: a sugestão (ou a recusa) continua valendo', (use) => {
    // Sugestão recebida antes do F5: continua na rodada e o honorário do assessor vale.
    const env = use(createEnvironment());
    const r = preparePendingAdvisory(env, { asker: 'Host', answerer: 'A', advisor: 'B' });
    env.Game.network.handleMessage({ type: 'advisory-answer', alternative: r.question.correct, declined: false }, 'peer-b');
    check(env.state.currentRound.advisory.status === 'accepted', 'pré-condição: sugestão recebida');

    const reloaded = use(reloadHost(env));
    reloaded.fakeTime();
    reloaded.clearLog();
    reloaded.Game.core.resumeMatchAfterReload();
    const a = reloaded.state.currentRound.advisory;
    check(a && a.status === 'accepted' && a.advisorName === 'B' && a.suggestion === r.question.correct,
        'a sugestão deveria continuar na rodada, veio: ' + JSON.stringify(a));
    reloaded.join('A', 'peer-a');
    const sync = syncTo(reloaded, 'peer-a');
    check(sync && sync.currentRound.advisory && sync.currentRound.advisory.status === 'accepted', 'A deveria voltar vendo a sugestão');
    const fee = reloaded.CONFIG.RESOURCES.ADVISORY_FEE;
    const before = { A: reloaded.player('A').resources, B: reloaded.player('B').resources };
    reloaded.Game.network.handleMessage({ type: 'answer', alternative: r.question.correct, playerName: 'A' }, 'peer-a');
    check(reloaded.broadcastsOfType('kpi-update').some(m => m.playerName === 'B' && m.supportOutcome === 'fee' && m.supportPartner === 'A') &&
        reloaded.player('A').resources === before.A - fee && reloaded.player('B').resources === before.B + fee,
        'seguindo a sugestão certa, A deveria pagar o honorário a B, veio: ' + JSON.stringify({ A: reloaded.player('A').resources, B: reloaded.player('B').resources }));

    // Prazo do assessor esgotado antes do F5: continua recusada e não dá para pedir de novo.
    const env2 = use(createEnvironment());
    const time2 = env2.fakeTime();
    preparePendingAdvisory(env2, { asker: 'Host', answerer: 'A', advisor: 'B' });
    time2.advance(env2.CONFIG.GAME.ADVISORY_TIMEOUT);
    check(env2.state.currentRound.advisory.status === 'declined', 'pré-condição: prazo do assessor esgotado');
    const reloaded2 = use(reloadHost(env2));
    reloaded2.fakeTime();
    reloaded2.Game.core.resumeMatchAfterReload();
    check(reloaded2.state.currentRound.advisory && reloaded2.state.currentRound.advisory.status === 'declined', 'a recusa deveria continuar valendo');
    reloaded2.join('A', 'peer-a');
    reloaded2.clearLog();
    reloaded2.Game.network.handleMessage({ type: 'advisory-request', advisorName: 'B', requesterName: 'A' }, 'peer-a');
    check(reloaded2.broadcastsOfType('advisory-started').length === 0, 'só um pedido de assessoria por pergunta, como sem o F5');
});

/**
 * Partida de 3 (Host, A, B) com a dupla fixada (o host pergunta, A
 * responde sem recursos) e um pedido de ajuda de A a B (com 5 recursos)
 * ainda sem resposta. Devolve a rodada.
 */
function preparePendingHelp(env) {
    roomToReload(env);
    env.join('A', 'peer-a');
    env.join('B', 'peer-b');
    env.startMatch();
    // O sorteio da dupla é aleatório: fixa os papéis (mesma pergunta e evento).
    env.state.currentRound = { ...env.state.currentRound, asker: 'Host', answerer: 'A', answered: false };
    env.state.answeredThisRound = [];
    env.player('A').resources = 0;
    env.player('B').resources = 5;
    env.Game.network.handleMessage({ type: 'advisory-request', kind: 'help', advisorName: 'B', requesterName: 'A' }, 'peer-a');
    const h = env.state.currentRound.advisory;
    check(h && h.status === 'pending' && h.advisorName === 'B' && h.kind === 'help', 'pré-condição: ajuda de B pendente, veio: ' + JSON.stringify(h));
    return env.state.currentRound;
}

test('T122 F5 do host com pedido de ajuda: o pendente continua e a resposta de quem ajuda vale depois do F5 (com a recompensa); o já aceito continua valendo com a recompensa ou a cobertura; quem ajuda cai sem responder e o prazo libera quem responde', (use) => {
    // 1) Ajuda pendente no F5: continua; B responde depois do F5 e, seguida e certa, ganha a recompensa.
    const env = use(createEnvironment());
    const pendingTime = env.fakeTime();
    const r = preparePendingHelp(env);
    const reloaded = use(reloadHost(env));
    reloaded.fakeTime(pendingTime.now());
    reloaded.Game.core.resumeMatchAfterReload();
    const kept = reloaded.state.currentRound && reloaded.state.currentRound.advisory;
    check(reloaded.state.currentRound.question.id === r.question.id && kept && kept.kind === 'help' && kept.status === 'pending' && kept.advisorName === 'B',
        'a mesma pergunta deveria continuar, com o pedido de ajuda pendente, veio: ' + JSON.stringify(kept));
    reloaded.clearLog();
    reloaded.Game.network.handleMessage({ type: 'advisory-answer', alternative: r.question.correct, declined: false }, 'peer-b');
    const helped = reloaded.broadcastsOfType('advisory-result').pop();
    check(helped && helped.kind === 'help' && helped.declined === false && helped.suggestion === r.question.correct,
        'a resposta de B depois do F5 deveria valer como ajuda, veio: ' + JSON.stringify(helped));
    reloaded.Game.network.handleMessage({ type: 'answer', alternative: r.question.correct, playerName: 'A' }, 'peer-a');
    const R = reloaded.CONFIG.RESOURCES;
    check(reloaded.player('A').resources === 0 && reloaded.player('B').resources === 5 + R.HELP_REWARD,
        'seguindo a ajuda certa recebida depois do F5, A deveria continuar com 0 e B ganhar a recompensa, veio: ' +
        JSON.stringify({ A: reloaded.player('A').resources, B: reloaded.player('B').resources }));

    // 2) Ajuda já aceita antes do F5: o tipo vai no estado salvo e a recompensa ou a cobertura valem depois.
    for (const follows of ['correct', 'wrong']) {
        const before = use(createEnvironment());
        const round = preparePendingHelp(before);
        const suggestion = follows === 'correct' ? round.question.correct : ['A', 'B', 'C', 'D'].find(x => x !== round.question.correct);
        before.Game.network.handleMessage({ type: 'advisory-answer', alternative: suggestion, declined: false }, 'peer-b');
        const saved = savedState(before);
        check(saved.currentRound.advisory && saved.currentRound.advisory.kind === 'help' && saved.currentRound.advisory.status === 'accepted',
            'o estado salvo deveria guardar a ajuda aceita com kind help, veio: ' + JSON.stringify(saved.currentRound.advisory));

        const after = use(reloadHost(before));
        after.fakeTime();
        after.Game.core.resumeMatchAfterReload();
        const kept = after.state.currentRound.advisory;
        check(kept && kept.kind === 'help' && kept.status === 'accepted' && kept.suggestion === suggestion,
            'depois do F5, a ajuda aceita deveria continuar, veio: ' + JSON.stringify(kept));
        after.join('A', 'peer-a');
        after.Game.network.handleMessage({ type: 'answer', alternative: suggestion, playerName: 'A' }, 'peer-a');
        const C = after.CONFIG.RESOURCES;
        const expectedB = follows === 'correct' ? 5 + C.HELP_REWARD : 5 - C.HELP_COVER;
        const toB = after.broadcastsOfType('kpi-update').find(m => m.playerName === 'B');
        check(after.player('A').resources === 0 && after.player('B').resources === expectedB &&
            toB && toB.supportOutcome === (follows === 'correct' ? 'reward' : 'cover') && toB.supportPartner === 'A',
            'seguindo a sugestão ' + (follows === 'correct' ? 'certa' : 'errada') + ' depois do F5, A deveria continuar com 0 e B ficar com ' +
            expectedB + ', veio: ' + JSON.stringify({ A: after.player('A').resources, B: after.player('B').resources, toB }));
    }

    // 3) Quem ajuda cai sem responder: o prazo (ADVISORY_TIMEOUT) libera A, que responde sozinho com o resultado normal.
    const drop = use(createEnvironment());
    const time = drop.fakeTime();
    const dropRound = preparePendingHelp(drop);
    drop.drop('peer-b');
    check(drop.state.currentRound.advisory && drop.state.currentRound.advisory.status === 'pending',
        'pré-condição: a ajuda continua pendente depois da queda de B (até o prazo)');
    time.advance(drop.CONFIG.GAME.ADVISORY_TIMEOUT);
    const late = drop.broadcastsOfType('advisory-result').pop();
    check(late && late.declined === true && late.timeout === true && late.kind === 'help' && drop.state.currentRound.advisory.status === 'declined',
        'no fim do prazo, a ajuda deveria ser recusada por tempo (kind help), veio: ' + JSON.stringify(late));
    check(drop.state.answerTimeout, 'o prazo de resposta de A deveria voltar a correr');
    const wrong = ['A', 'B', 'C', 'D'].find(x => x !== dropRound.question.correct);
    drop.Game.network.handleMessage({ type: 'answer', alternative: wrong, playerName: 'A' }, 'peer-a');
    check(drop.player('A').resources === -1 && drop.player('B').resources === 5,
        'sem a ajuda, o erro de A deveria custar 1 recurso e B ficar como estava, veio: ' +
        JSON.stringify({ A: drop.player('A').resources, B: drop.player('B').resources }));
});

// Quanto tempo a pergunta ficou aberta antes do F5 em reloadWithOpenQuestion().
const OPEN_BEFORE_RELOAD = 15000;

/**
 * Partida de 3 (Host, A, B) com a dupla fixada e a pergunta aberta há
 * OPEN_BEFORE_RELOAD ms; o host dá F5 e a partida é retomada. Devolve o
 * host recarregado, o tempo controlado (continua a hora da página antiga),
 * as telas que ele montou na retomada e quanto faltava do prazo de resposta.
 */
function reloadWithOpenQuestion(use, roles) {
    const env = use(createEnvironment());
    const before = env.fakeTime();
    roomToReload(env);
    env.join('A', 'peer-a');
    env.join('B', 'peer-b');
    env.startMatch();
    // O sorteio da dupla é aleatório: fixa os papéis (mesma pergunta e evento).
    env.state.currentRound = { ...env.state.currentRound, ...roles, answered: false };
    env.state.answeredThisRound = [];
    env.Game.saveState();
    before.advance(OPEN_BEFORE_RELOAD);

    const reloaded = use(reloadHost(env));
    const time = reloaded.fakeTime(before.now());
    const screens = recordScreens(reloaded);
    reloaded.Game.core.resumeMatchAfterReload();
    return { reloaded, time, screens, left: reloaded.CONFIG.GAME.ANSWER_TIMEOUT - OPEN_BEFORE_RELOAD };
}

test('T64 F5 do host fora da dupla com a pergunta aberta: volta vendo a tela de espectador e o prazo de resposta continua de onde estava (BUG-020)', (use) => {
    const { reloaded, time, screens, left } = reloadWithOpenQuestion(use, { asker: 'A', answerer: 'B' });
    const names = screens.map(t => t.name);
    const spectator = screens.find(t => t.name === 'displaySpectatorView');
    check(spectator && spectator.args[0] === 'A' && spectator.args[1] === 'B',
        'o host fora da dupla deveria ver "A pergunta para B", viu: ' + names.join(', '));
    check(!names.includes('displayRoundStart') && !names.includes('displayQuestion'),
        'o host fora da dupla não pode ver a área da pergunta, viu: ' + names.join(', '));
    const r = reloaded.state.currentRound;
    check(r && r.asker === 'A' && r.answerer === 'B' && !r.answered, 'a mesma pergunta deveria continuar em andamento');
    check(reloaded.broadcastsOfType('round-start').length === 0, 'não pode trocar a pergunta');
    time.advance(left - 1);
    check(!reloaded.broadcastsOfType('kpi-update').some(m => m.playerName === 'B'),
        'o prazo de resposta continua de onde estava: 1 ms antes do fim, a vez de B ainda não deveria ter sido pulada');
    time.advance(1);
    check(reloaded.broadcastsOfType('kpi-update').some(m => m.playerName === 'B'),
        'no fim do prazo que faltava antes do F5, a vez de B deveria ser pulada (sem prazo inteiro de novo)');

    // Controle: o host na dupla (perguntando ou respondendo) continua vendo a pergunta.
    for (const roles of [{ asker: 'Host', answerer: 'A' }, { asker: 'A', answerer: 'Host' }]) {
        const c = reloadWithOpenQuestion(use, roles);
        const n = c.screens.map(t => t.name);
        check(n.includes('displayRoundStart') && n.includes('displayQuestion') && !n.includes('displaySpectatorView'),
            'host como ' + (roles.asker === 'Host' ? 'Perguntador' : 'Respondedor') + ' deveria ver a pergunta, viu: ' + n.join(', '));
        c.time.advance(c.left);
        check(c.reloaded.broadcastsOfType('kpi-update').some(m => m.playerName === roles.answerer),
            'o prazo de resposta também deveria continuar de onde estava com o host na dupla');
    }
});

test('T65 A pergunta da rodada leva domínio e área: o F5 do host e quem volta à partida veem as etiquetas (BUG-020)', (use) => {
    const env = use(createEnvironment());
    roomToReload(env);
    env.join('A', 'peer-a');
    env.join('B', 'peer-b');
    env.startMatch();
    const r = env.state.currentRound;
    const area = env.Game.getFocusAreaById(env.player(r.answerer).focusArea).name;
    check(r.question.domain === 'Domínio de teste' && r.question.area === area,
        'a pergunta guardada na rodada deveria ter domínio e área, veio: ' + JSON.stringify({ domain: r.question.domain, area: r.question.area }));

    // A mensagem do início da rodada continua igual: mesmos nomes, gabarito só para o Perguntador.
    const questions = env.record.sent.filter(e => e.msg.type === 'question').map(e => e.msg);
    check(questions.length === 2 && questions.every(m => m.domain === 'Domínio de teste' && m.area === area),
        'as perguntas enviadas deveriam ter domínio e área');
    check(questions.find(m => m.isAsker).correct === r.question.correct && questions.find(m => m.isAnswerer).correct === undefined,
        'só o Perguntador recebe o gabarito');

    // F5 do host Perguntador: a pergunta reexibida tem as etiquetas.
    const { reloaded, screens } = reloadWithOpenQuestion(use, { asker: 'Host', answerer: 'A' });
    const onScreen = screens.find(t => t.name === 'displayQuestion');
    check(onScreen && onScreen.args[0].domain === 'Domínio de teste' && onScreen.args[0].area === 'Iniciação',
        'depois do F5, o host deveria ver as etiquetas, veio: ' + JSON.stringify(onScreen && { domain: onScreen.args[0].domain, area: onScreen.args[0].area }));

    // A (o Respondedor) volta à partida: recebe a pergunta com as etiquetas e sem o gabarito.
    reloaded.join('A', 'peer-a');
    const sync = syncTo(reloaded, 'peer-a');
    const p = sync && sync.currentRound && sync.currentRound.question;
    check(p && p.domain === 'Domínio de teste' && p.area === 'Iniciação', 'quem volta deveria receber domínio e área, veio: ' + JSON.stringify(p && { domain: p.domain, area: p.area }));
    check(p.correct === undefined, 'o Respondedor não pode receber o gabarito');
    const guest = use(createEnvironment());
    const guestScreens = recordScreens(guest);
    guest.receiveSync('A', sync);
    const guestOnScreen = guestScreens.find(t => t.name === 'displayQuestion');
    check(guestOnScreen && guestOnScreen.args[0].domain === 'Domínio de teste' && guestOnScreen.args[0].area === 'Iniciação',
        'A deveria ver as etiquetas ao voltar');
});

test('T79 F5 do host com o estado salvo na versão 1 (gravado antes de o jogo ser atualizado): a partida continua de onde estava', (use) => {
    // 1) Pergunta aberta: Host pergunta, A responde.
    const env = use(createEnvironment());
    roomToReload(env);
    storeSavedState(env, savedStateV1());
    const reloaded = use(reloadHost(env));
    const s = reloaded.state;
    const r = s.currentRound;
    check(r && r.asker === 'Host' && r.answerer === 'A' && r.answered === false &&
        r.question && r.question.id === 'q7' && r.event && r.event.id === 'e-salvo',
        'a rodada salva na versão 1 deveria ser restaurada com os nomes novos, veio: ' + JSON.stringify(r));
    check(s.decks && s.decks.d1 && s.decks.d1.available === 1 && Array.isArray(s.decks.d1.questions) && s.decks.d1.questions.length === 2,
        'os baralhos deveriam ser restaurados com os nomes novos, veio: ' + JSON.stringify(s.decks));
    check(Array.isArray(s.answeredThisRound) && s.answeredThisRound.length === 0 && s.roundEnded === false &&
        s.matchPaused === null && s.finalRanking === null,
        'rodízio, rodada encerrada, pausa e ranking final deveriam ser restaurados com os nomes novos');
    check(oldNamesIn(s).length === 0, 'nenhum nome antigo deveria sobrar no estado restaurado, sobraram: ' + oldNamesIn(s).join(', '));

    reloaded.fakeTime();
    const screens = recordScreens(reloaded);
    reloaded.Game.core.resumeMatchAfterReload();
    const shown = screens.find(c => c.name === 'displayQuestion');
    check(shown && shown.args[0].id === 'q7' && shown.args[0].correct === 'b',
        'o host (Perguntador) deveria ver a mesma pergunta, com o gabarito, viu: ' + screens.map(c => c.name).join(', '));
    check(reloaded.broadcastsOfType('round-start').length === 0, 'a pergunta não pode ser trocada');

    // A volta: recebe a mesma pergunta, sem o gabarito, e responde certo.
    reloaded.join('A', 'peer-a');
    const sync = syncTo(reloaded, 'peer-a');
    const q = sync && sync.currentRound && sync.currentRound.question;
    check(q && q.id === 'q7' && q.correct === undefined && !('decks' in sync),
        'A deveria receber a mesma pergunta, sem o gabarito e sem os baralhos (SEC-005)');
    reloaded.Game.network.handleMessage({ type: 'answer', alternative: 'b', playerName: 'A' }, 'peer-a');
    const kpi = reloaded.broadcastsOfType('kpi-update').find(m => m.playerName === 'A');
    check(kpi && kpi.isCorrect === true && kpi.kpiGained > 0 && kpi.kpi === 10 + kpi.kpiGained,
        'a resposta certa de A deveria contar sobre o KPI salvo, veio: ' + JSON.stringify(kpi));
    check(JSON.stringify(reloaded.state.answeredThisRound) === '["A"]', 'A deveria entrar no rodízio');
    reloaded.Game.saveState();
    const saved = savedState(env);
    const current = reloaded.Game.persistence.STATE_VERSION;
    check(saved.stateVersion === current && oldNamesIn(saved).length === 0,
        'ao salvar de novo, o estado deveria ficar na versão atual (' + current + '), sem nomes antigos, sobraram: ' + oldNamesIn(saved).join(', '));

    // 2) Partida pausada (A caiu): continua pausada com o mesmo evento e retoma quando A volta.
    const env2 = use(createEnvironment());
    roomToReload(env2);
    const paused = savedStateV1({ currentRound: null, partidaPausada: { evento: { id: 'e-pausa', titulo: 'Evento da pausa' } } });
    paused.roomState.players[1].disconnected = true;
    storeSavedState(env2, paused);
    const reloaded2 = use(reloadHost(env2));
    reloaded2.clearLog();
    reloaded2.Game.core.resumeMatchAfterReload();
    check(reloaded2.state.matchPaused && reloaded2.state.matchPaused.event && reloaded2.state.matchPaused.event.id === 'e-pausa',
        'deveria continuar pausada com o mesmo evento, veio: ' + JSON.stringify(reloaded2.state.matchPaused));
    check(reloaded2.record.ui.includes('showMatchPausedMessage'), 'o host deveria ver o aviso de pausa');
    reloaded2.join('A', 'peer-a');
    const rs = reloaded2.broadcastsOfType('round-start').pop();
    check(!reloaded2.state.matchPaused && rs && rs.event && rs.event.id === 'e-pausa',
        'a volta de A deveria retomar a partida com o mesmo evento, veio: ' + JSON.stringify(rs));

    // 3) Rodada encerrada: continua encerrada, com o "Nova Rodada" liberado.
    const env3 = use(createEnvironment());
    roomToReload(env3);
    const ended = savedStateV1({ usedRespondedorThisRound: ['A', 'Host'], rodadaEncerrada: true });
    ended.roomState.currentRound.respondeu = true;
    storeSavedState(env3, ended);
    const reloaded3 = use(reloadHost(env3));
    reloaded3.clearLog();
    reloaded3.Game.core.resumeMatchAfterReload();
    check(reloaded3.state.roundEnded === true && reloaded3.record.ui.includes('showRoundEndedMessage'),
        'a rodada deveria continuar encerrada, viu: ' + roundScreens(reloaded3).join(', '));
    check(reloaded3.broadcastsOfType('round-start').length === 0, 'nada pode começar sozinho');
    check(reloaded3.Game.selectors.isCycleComplete(reloaded3.Game.getActivePlayers(), reloaded3.state.answeredThisRound),
        'o "Nova Rodada" deveria ficar liberado (rodízio completo preservado)');
});

test('T82 F5 do host com o estado salvo na versão 2 (gravado antes de o jogo ser atualizado): recursos, área foco e ranking final continuam', (use) => {
    // 1) Pergunta aberta: Host pergunta, A responde.
    const env = use(createEnvironment());
    roomToReload(env);
    storeSavedState(env, savedStateV2());
    const reloaded = use(reloadHost(env));
    const s = reloaded.state;
    const host = reloaded.player('Host');
    const a = reloaded.player('A');
    check(host.resources === 9 && a.resources === 7 && a.focusArea === 'initiating' && a.activities === 1,
        'os jogadores salvos na versão 2 deveriam ser restaurados com resources e focusArea, veio: ' + JSON.stringify(s.players));
    check(oldPlayerNamesIn(s).length === 0, 'nenhum nome antigo deveria sobrar no estado restaurado, sobraram: ' + oldPlayerNamesIn(s).join(', '));

    reloaded.fakeTime();
    reloaded.Game.core.resumeMatchAfterReload();
    reloaded.join('A', 'peer-a');
    const sync = syncTo(reloaded, 'peer-a');
    const aInSync = sync && sync.players.find(p => p.name === 'A');
    check(aInSync && aInSync.resources === 7 && aInSync.focusArea === 'initiating' && oldPlayerNamesIn(sync).length === 0,
        'A deveria voltar com os recursos e a área foco salvos, com os nomes novos, veio: ' + JSON.stringify(aInSync));

    // A erra: gasta 1 dos recursos salvos.
    reloaded.Game.network.handleMessage({ type: 'answer', alternative: 'a', playerName: 'A' }, 'peer-a');
    const kpi = reloaded.broadcastsOfType('kpi-update').find(m => m.playerName === 'A');
    check(kpi && kpi.isCorrect === false && kpi.resources === 6 && kpi.focusArea === 'initiating' && reloaded.player('A').resources === 6,
        'a resposta errada de A deveria gastar 1 dos recursos salvos (7 → 6), veio: ' + JSON.stringify(kpi));
    reloaded.Game.saveState();
    const saved = savedState(env);
    check(saved.stateVersion === reloaded.Game.persistence.STATE_VERSION && oldPlayerNamesIn(saved).length === 0 && saved.players.find(p => p.name === 'A').resources === 6,
        'ao salvar de novo, o estado deveria ficar na versão atual, com os nomes novos, veio: ' + JSON.stringify(saved.players));

    // 2) Fim de jogo: o F5 na tela final mostra o mesmo ranking, com os nomes novos.
    const env2 = use(createEnvironment());
    roomToReload(env2);
    storeSavedState(env2, savedStateV2({ currentRound: null, gameOver: true, finalRanking: finalRankingV2() }));
    const reloaded2 = use(reloadHost(env2));
    const screens = recordScreens(reloaded2);
    reloaded2.Game.core.showGameOver();
    const shown = screens.find(c => c.name === 'displayFinalRanking');
    const ranking = shown && shown.args[0];
    check(ranking && ranking.length === 2 &&
        ranking[0].name === 'Host' && ranking[0].position === 1 && ranking[0].finalKpi === 38 && ranking[0].resources === 9 && ranking[0].focusArea === 'initiating' &&
        ranking[1].name === 'A' && ranking[1].position === 2 && ranking[1].finalKpi === 24 && ranking[1].resources === 7,
        'a tela final deveria mostrar o ranking salvo com position, finalKpi, resources e focusArea, veio: ' + JSON.stringify(ranking));
    check(oldPlayerNamesIn(ranking).length === 0, 'nenhum nome antigo deveria sobrar no ranking, sobraram: ' + oldPlayerNamesIn(ranking).join(', '));
    reloaded2.join('A', 'peer-a');
    const endSync = syncTo(reloaded2, 'peer-a');
    check(endSync && endSync.gameOver === true && JSON.stringify(endSync.finalRanking) === JSON.stringify(ranking),
        'quem volta no fim de jogo deveria receber o mesmo ranking, veio: ' + JSON.stringify(endSync && endSync.finalRanking));
});

test('T85 F5 do host com o estado salvo na versão 3 (gravado antes de o jogo ser atualizado): a assessoria da rodada continua (pendente, aceita ou recusada)', (use) => {
    // 1) Assessoria pendente: restaurada com os nomes novos; continua na
    // retomada e a resposta de B, depois do F5, vale.
    const env = use(createEnvironment());
    roomToReload(env);
    storeSavedState(env, savedStateV3());
    const reloaded = use(reloadHost(env));
    const a = reloaded.state.currentRound && reloaded.state.currentRound.advisory;
    check(a && a.advisorName === 'B' && a.status === 'pending' && a.suggestion === null,
        'a assessoria pendente salva na versão 3 deveria ser restaurada com os nomes novos, veio: ' + JSON.stringify(reloaded.state.currentRound));
    check(oldAdvisoryNamesIn(reloaded.state).length === 0,
        'nenhum nome antigo deveria sobrar no estado restaurado, sobraram: ' + oldAdvisoryNamesIn(reloaded.state).join(', '));

    reloaded.fakeTime();
    reloaded.Game.core.resumeMatchAfterReload();
    const r = reloaded.state.currentRound;
    check(r && r.advisory && r.advisory.status === 'pending' && r.advisory.advisorName === 'B' && r.answerer === 'A' && r.question.id === 'q7' && !r.answered,
        'o pedido pendente deveria continuar na retomada, com a mesma pergunta aberta, veio: ' + JSON.stringify(r));
    reloaded.clearLog();
    reloaded.Game.network.handleMessage({ type: 'advisory-answer', alternative: 'b', declined: false }, 'peer-b');
    const answered = reloaded.broadcastsOfType('advisory-result')[0];
    check(answered && answered.advisorName === 'B' && answered.suggestion === 'b' && answered.declined === false,
        'a resposta de B depois do F5 deveria valer, veio: ' + JSON.stringify(answered));
    reloaded.Game.saveState();
    const saved = savedState(env);
    check(saved.stateVersion === reloaded.Game.persistence.STATE_VERSION && saved.currentRound.advisory &&
        saved.currentRound.advisory.advisorName === 'B' && saved.currentRound.advisory.suggestion === 'b' && oldAdvisoryNamesIn(saved).length === 0,
        'ao salvar de novo, o estado deveria ficar na versão atual, com a assessoria nos nomes novos, veio: ' + JSON.stringify(saved.currentRound));

    // 2) Sugestão recebida antes da atualização: continua valendo, vai para
    // quem volta e o honorário do assessor vale.
    const env2 = use(createEnvironment());
    roomToReload(env2);
    const accepted = savedStateV3();
    accepted.roomState.currentRound.assessoria = { assessorName: 'B', status: 'accepted', sugestao: 'b' };
    storeSavedState(env2, accepted);
    const reloaded2 = use(reloadHost(env2));
    reloaded2.fakeTime();
    reloaded2.Game.core.resumeMatchAfterReload();
    const a2 = reloaded2.state.currentRound && reloaded2.state.currentRound.advisory;
    check(a2 && a2.advisorName === 'B' && a2.status === 'accepted' && a2.suggestion === 'b',
        'a sugestão salva na versão 3 deveria continuar na rodada, veio: ' + JSON.stringify(reloaded2.state.currentRound));
    reloaded2.join('A', 'peer-a');
    reloaded2.join('B', 'peer-b');
    const sync = syncTo(reloaded2, 'peer-a');
    const syncAdvisory = sync && sync.currentRound && sync.currentRound.advisory;
    check(syncAdvisory && syncAdvisory.status === 'accepted' && syncAdvisory.suggestion === 'b' && sync.currentRound.question.correct === undefined,
        'A deveria voltar vendo a sugestão (e sem o gabarito), veio: ' + JSON.stringify(sync && sync.currentRound));
    reloaded2.Game.network.handleMessage({ type: 'answer', alternative: 'b', playerName: 'A' }, 'peer-a');
    // Salvos: A com 7 recursos, B com 4 e 30 de KPI (savedStateV3).
    const feeUpdate = reloaded2.broadcastsOfType('kpi-update').find(m => m.playerName === 'B');
    const fee = reloaded2.CONFIG.RESOURCES.ADVISORY_FEE;
    check(feeUpdate && feeUpdate.supportOutcome === 'fee' && feeUpdate.resources === 4 + fee && feeUpdate.kpi === 30 &&
        reloaded2.player('B').resources === 4 + fee && reloaded2.player('A').resources === 7 - fee,
        'seguindo a sugestão certa, A deveria pagar o honorário a B sobre os recursos salvos (sem mudar o KPI de B), veio: ' + JSON.stringify(feeUpdate));

    // 3) Prazo do assessor esgotado antes da atualização: continua recusada
    // e não dá para pedir de novo (um pedido por pergunta).
    const env3 = use(createEnvironment());
    roomToReload(env3);
    const declined = savedStateV3();
    declined.roomState.currentRound.assessoria = { assessorName: 'B', status: 'declined', sugestao: null };
    storeSavedState(env3, declined);
    const reloaded3 = use(reloadHost(env3));
    reloaded3.fakeTime();
    reloaded3.Game.core.resumeMatchAfterReload();
    const a3 = reloaded3.state.currentRound && reloaded3.state.currentRound.advisory;
    check(a3 && a3.advisorName === 'B' && a3.status === 'declined' && a3.suggestion === null,
        'a recusa salva na versão 3 deveria continuar valendo, veio: ' + JSON.stringify(reloaded3.state.currentRound));
    reloaded3.join('A', 'peer-a');
    reloaded3.join('B', 'peer-b');
    reloaded3.clearLog();
    reloaded3.Game.network.handleMessage({ type: 'advisory-request', advisorName: 'B', requesterName: 'A' }, 'peer-a');
    check(reloaded3.broadcastsOfType('advisory-started').length === 0 && reloaded3.state.currentRound.advisory.status === 'declined',
        'só um pedido de assessoria por pergunta, como sem a atualização');
});

test('T187 Apoio pendente atravessa o F5 do host: o prazo de quem foi chamado continua de onde estava (vencido durante o F5, a recusa por tempo vem na retomada; sem a hora salva, prazo inteiro) e depois o de resposta volta do que faltava; quem foi chamado, ao voltar, recebe de novo a pergunta do apoio com a mesma hora de término; quem pediu volta com o apoio pendente; o host chamado vê a pergunta de novo', (use) => {
    // 1) F5 5 s depois do pedido: o prazo de B continua do que faltava.
    const env = use(createEnvironment());
    const before = env.fakeTime();
    preparePendingAdvisory(env, { asker: 'Host', answerer: 'A', advisor: 'B' });
    const ADVISORY = env.CONFIG.GAME.ADVISORY_TIMEOUT;
    const endsAt = env.state.currentRound.advisory.endsAt;
    const answerTimeLeft = env.state.currentRound.answerTimeLeft;
    check(endsAt === before.now() + ADVISORY && typeof answerTimeLeft === 'number', 'pré-condição: hora de término do prazo de B e o que faltava do prazo de A');
    before.advance(5000);
    const reloaded = use(reloadHost(env));
    const time = reloaded.fakeTime(before.now());
    reloaded.clearLog();
    reloaded.Game.core.resumeMatchAfterReload();
    check(reloaded.state.currentRound.advisory && reloaded.state.currentRound.advisory.endsAt === endsAt,
        'a hora de término do prazo de B não deveria mudar no F5, veio: ' + JSON.stringify(reloaded.state.currentRound.advisory));
    time.advance(ADVISORY - 5000 - 1);
    check(reloaded.broadcastsOfType('advisory-result').length === 0 && reloaded.state.currentRound.advisory.status === 'pending',
        'o prazo de B continua de onde estava: 1 ms antes do fim, o apoio ainda deveria estar pendente');
    time.advance(1);
    const late = reloaded.broadcastsOfType('advisory-result').pop();
    check(late && late.declined === true && late.timeout === true && reloaded.state.currentRound.advisory.status === 'declined',
        'no fim do prazo que faltava a B, o apoio deveria ser recusado por tempo, veio: ' + JSON.stringify(late));
    check(reloaded.state.currentRound.answerEndsAt === time.now() + answerTimeLeft,
        'depois da recusa, o prazo de resposta de A deveria voltar do que faltava quando o apoio começou, veio: ' +
        JSON.stringify({ answerEndsAt: reloaded.state.currentRound.answerEndsAt, now: time.now(), answerTimeLeft }));

    // 2) O prazo de B venceu durante o F5: a recusa por tempo vem na retomada, sem esperar mais.
    const env2 = use(createEnvironment());
    const before2 = env2.fakeTime();
    preparePendingAdvisory(env2, { asker: 'Host', answerer: 'A', advisor: 'B' });
    const left2 = env2.state.currentRound.answerTimeLeft;
    const reloaded2 = use(reloadHost(env2));
    const back = before2.now() + ADVISORY + 1000;
    const time2 = reloaded2.fakeTime(back);
    reloaded2.Game.core.resumeMatchAfterReload();
    time2.advance(0);
    const expired = reloaded2.broadcastsOfType('advisory-result').pop();
    check(expired && expired.timeout === true && reloaded2.state.currentRound.advisory.status === 'declined',
        'com o prazo de B vencido durante o F5, a recusa por tempo deveria vir na retomada, veio: ' + JSON.stringify(expired));
    check(reloaded2.state.currentRound.answerEndsAt === back + left2,
        'o prazo de resposta de A deveria voltar do que faltava, contado da retomada, veio: ' + JSON.stringify(reloaded2.state.currentRound.answerEndsAt));

    // 3) Rodada salva sem a hora de término do apoio (versão anterior): prazo inteiro, contado da retomada.
    const env3 = use(createEnvironment());
    const before3 = env3.fakeTime();
    preparePendingAdvisory(env3, { asker: 'Host', answerer: 'A', advisor: 'B' });
    const old = savedState(env3);
    delete old.currentRound.advisory.endsAt;
    storeSavedState(env3, { roomState: old });
    const reloaded3 = use(reloadHost(env3));
    const time3 = reloaded3.fakeTime(before3.now() + 10000);
    reloaded3.Game.core.resumeMatchAfterReload();
    time3.advance(ADVISORY - 1);
    check(reloaded3.state.currentRound.advisory && reloaded3.state.currentRound.advisory.status === 'pending',
        'sem a hora de término salva, o prazo de B deveria ser inteiro: 1 ms antes, ainda pendente');
    time3.advance(1);
    check(reloaded3.state.currentRound.advisory.status === 'declined' && reloaded3.broadcastsOfType('advisory-result').some(m => m.timeout === true),
        'sem a hora de término salva, a recusa por tempo deveria vir no fim do prazo inteiro, contado da retomada');

    // 4) Quem volta depois do F5 do host (o guest pede o estado de novo quando o host volta).
    const env4 = use(createEnvironment());
    const before4 = env4.fakeTime();
    const r4 = preparePendingAdvisory(env4, { asker: 'Host', answerer: 'A', advisor: 'B' });
    const endsAt4 = env4.state.currentRound.advisory.endsAt;
    before4.advance(5000);
    const reloaded4 = use(reloadHost(env4));
    reloaded4.fakeTime(before4.now());
    reloaded4.Game.core.resumeMatchAfterReload();
    reloaded4.clearLog();
    // B, chamado: o estado e, depois dele (a tela do estado fecha as janelas), a pergunta do apoio de novo.
    reloaded4.join('B', 'peer-b');
    const toB = reloaded4.record.sent.filter(e => e.to === 'peer-b').map(e => e.msg);
    const syncAt = toB.findIndex(m => m.type === 'state-sync');
    const askAt = toB.findIndex(m => m.type === 'advisory-question');
    check(syncAt >= 0 && askAt > syncAt,
        'B deveria receber o estado e, depois dele, a pergunta do apoio de novo, recebeu: ' + toB.map(m => m.type).join(', '));
    const ask = toB[askAt];
    check(ask.endsAt === endsAt4 && ask.kind === 'advisory' && ask.id === r4.question.id && ask.question === r4.question.question &&
        Array.isArray(ask.alternatives) && ask.alternatives.length === r4.question.alternatives.length && !('correct' in ask),
        'a pergunta do apoio deveria vir com a mesma hora de término, sem o gabarito, veio: ' + JSON.stringify(ask));
    // A, quem pediu: a rodada com o apoio pendente (botões travados), sem a pergunta do apoio.
    reloaded4.join('A', 'peer-a');
    const syncA = syncTo(reloaded4, 'peer-a');
    const pendingForA = syncA && syncA.currentRound && syncA.currentRound.advisory;
    check(pendingForA && pendingForA.status === 'pending' && pendingForA.advisorName === 'B',
        'A deveria voltar com o apoio pendente, veio: ' + JSON.stringify(pendingForA));
    check(!reloaded4.record.sent.some(e => e.to === 'peer-a' && e.msg.type === 'advisory-question'), 'A não deveria receber a pergunta do apoio');
    // Com o apoio já respondido, a volta de B não traz a pergunta de novo.
    reloaded4.Game.network.handleMessage({ type: 'advisory-answer', alternative: r4.question.correct, declined: false }, 'peer-b');
    reloaded4.clearLog();
    reloaded4.join('B', 'peer-b');
    check(syncTo(reloaded4, 'peer-b') && !reloaded4.record.sent.some(e => e.msg.type === 'advisory-question'),
        'com o apoio já respondido, a volta de B não deveria trazer a pergunta do apoio de novo');

    // 5) O host é quem foi chamado: depois do F5, a pergunta do apoio aparece de novo para ele.
    const env5 = use(createEnvironment());
    const before5 = env5.fakeTime();
    preparePendingAdvisory(env5, { asker: 'A', answerer: 'B', advisor: 'Host' });
    const endsAt5 = env5.state.currentRound.advisory.endsAt;
    const reloaded5 = use(reloadHost(env5));
    reloaded5.fakeTime(before5.now());
    reloaded5.clearLog();
    reloaded5.Game.core.resumeMatchAfterReload();
    const toHost = reloaded5.record.sent.filter(e => e.to === 'peer-host' && e.msg.type === 'advisory-question').map(e => e.msg);
    check((toHost.length === 1 && toHost[0].endsAt === endsAt5) || reloaded5.record.ui.includes('showAdvisoryQuestionModal'),
        'o host chamado deveria ver de novo a pergunta do apoio depois do F5, veio: ' + JSON.stringify(toHost));
});

/**
 * Host, A e B na sala de roomToReload(), com tempo controlado, sorteio fixo
 * (0.99: A pergunta para B) e uma pergunta diferente a cada sorteio.
 */
function heldPairMatch(use) {
    const env = use(createEnvironment());
    const time = env.fakeTime();
    roomToReload(env);
    env.join('A', 'peer-a');
    env.join('B', 'peer-b');
    vm.runInContext('Math.random = () => 0.99', env.ctx);
    let seq = 0;
    env.Game.domain.deck.drawQuestion = () => {
        seq++;
        return { id: 'q' + seq, question: 'Pergunta ' + seq + '?', alternatives: ['A', 'B', 'C', 'D'], correct: 'A', domain_key: 'd1' };
    };
    env.startMatch();
    return { env, time };
}

/** Quem responde a dupla da vez responde (certo), com o número da dupla. */
function answerCurrent(env) {
    const r = env.state.currentRound;
    const msg = { type: 'answer', alternative: 'A', playerName: r.answerer, pairId: r.pairId };
    if (r.answerer === env.state.playerName) {
        env.Game.core.handleAnswer(msg);
    } else {
        env.Game.network.handleMessage(msg, 'peer-' + r.answerer.toLowerCase());
    }
}

test('T215 Estado salvo 10 com a dupla guardada (BUG-033/034): as duplas guardadas (com o gabarito) e o último número de dupla vão para o estado salvo; no F5 do host, continuam — quem caiu volta e a dupla dele reabre com número maior que os de antes do F5 e o prazo do que faltava; F5 do host na espera do fim da rodada: continua esperando (sem dupla nova nem "rodada encerrada"); migração 9 → 10: a rodada aberta ganha o número 1, sem duplas guardadas', (use) => {
    const { env, time } = heldPairMatch(use);
    const P = env.Game.persistence;
    check(P.STATE_VERSION >= 10, 'o estado salvo deveria estar na versão 10 ou mais (duplas guardadas, número da dupla), veio: ' + P.STATE_VERSION);
    const first = env.state.currentRound;
    check(first.asker === 'A' && first.answerer === 'B', 'pré-condição: A pergunta para B');
    time.advance(10000);
    env.drop('peer-b');
    const saved = savedState(env);
    check(saved && saved.stateVersion === P.STATE_VERSION && Array.isArray(saved.heldPairs) && saved.heldPairs.length === 1 &&
        saved.heldPairs[0].answerer === 'B' && saved.heldPairs[0].asker === 'A' && saved.heldPairs[0].question.correct === 'A' &&
        saved.heldPairs[0].answerTimeLeft === 50000,
        'o estado salvo deveria levar a dupla guardada de B, com o gabarito e o tempo que faltava, veio: ' + JSON.stringify(saved && saved.heldPairs));
    check(typeof saved.lastPairId === 'number' && saved.currentRound && saved.currentRound.pairId === saved.lastPairId && saved.lastPairId > first.pairId,
        'o estado salvo deveria levar o último número de dupla (o da dupla da vez), veio: ' + JSON.stringify({ last: saved.lastPairId, round: saved.currentRound && saved.currentRound.pairId }));

    // F5 do host: a dupla guardada continua.
    const reloaded = use(reloadHost(env));
    const t2 = reloaded.fakeTime(time.now());
    vm.runInContext('Math.random = () => 0.99', reloaded.ctx);
    reloaded.Game.core.resumeMatchAfterReload();
    const s = reloaded.state;
    check(Array.isArray(s.heldPairs) && s.heldPairs.length === 1 && s.heldPairs[0].answerer === 'B' && s.lastPairId === saved.lastPairId,
        'depois do F5, a dupla guardada e o último número deveriam continuar, veio: ' + JSON.stringify({ held: s.heldPairs, last: s.lastPairId }));
    reloaded.join('B', 'peer-b');
    answerCurrent(reloaded);
    reloaded.clearLog();
    t2.advance(3000);
    const r = s.currentRound;
    check(r && r.asker === 'A' && r.answerer === 'B' && r.question.id === 'q1' && r.pairId > saved.lastPairId && r.answerEndsAt === t2.now() + 50000,
        'com B de volta, a dupla guardada reabre (q1), com número maior que os de antes do F5 e o prazo do que faltava, veio: ' +
        JSON.stringify(r && { asker: r.asker, answerer: r.answerer, q: r.question && r.question.id, pairId: r.pairId, left: r.answerEndsAt - t2.now() }));

    // F5 do host na espera do fim da rodada.
    const wait = heldPairMatch(use);
    wait.env.drop('peer-b');
    answerCurrent(wait.env);
    wait.time.advance(3000);
    answerCurrent(wait.env);
    wait.time.advance(3000);
    check(JSON.stringify(wait.env.state.waitingFor) === '["B"]', 'pré-condição: esperando B, veio: ' + JSON.stringify(wait.env.state.waitingFor));
    const waitReloaded = use(reloadHost(wait.env));
    waitReloaded.fakeTime(wait.time.now());
    waitReloaded.clearLog();
    waitReloaded.Game.core.resumeMatchAfterReload();
    const again = waitReloaded.broadcastsOfType('round-waiting').pop();
    check(again && JSON.stringify(again.waitingFor) === '["B"]' && waitReloaded.broadcastsOfType('round-start').length === 0 &&
        waitReloaded.broadcastsOfType('round-ended').length === 0 && waitReloaded.state.roundEnded === false &&
        waitReloaded.record.ui.includes('showRoundWaitingMessage'),
        'depois do F5, o host deveria continuar esperando B, sem dupla nova nem "rodada encerrada", veio: ' + JSON.stringify(waitReloaded.record.broadcasts.map(m => m.type)));

    // Migração 9 → 10.
    const v9 = JSON.parse(JSON.stringify(saved));
    v9.stateVersion = 9;
    delete v9.heldPairs;
    delete v9.lastPairId;
    delete v9.currentRound.pairId;
    const migrated = P.migrateSavedState(v9, null).roomState;
    check(migrated.stateVersion === P.STATE_VERSION && migrated.currentRound.pairId === 1 && migrated.lastPairId === 1 &&
        Array.isArray(migrated.heldPairs) && migrated.heldPairs.length === 0,
        'da versão 9, a rodada aberta deveria ganhar o número 1 (lastPairId 1), sem duplas guardadas, veio: ' +
        JSON.stringify({ v: migrated.stateVersion, pairId: migrated.currentRound.pairId, last: migrated.lastPairId, held: migrated.heldPairs }));
    const noRound = P.migrateSavedState({ ...v9, currentRound: null }, null).roomState;
    check(noRound.lastPairId === 0 && noRound.currentRound === null && noRound.heldPairs.length === 0,
        'sem rodada aberta, o último número fica 0, veio: ' + JSON.stringify({ last: noRound.lastPairId, round: noRound.currentRound }));
});

finish('F5 do host');
