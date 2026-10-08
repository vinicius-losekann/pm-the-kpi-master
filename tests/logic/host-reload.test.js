// ============================================
// PM: The KPI Master - Testes de lógica: F5 do host
// ============================================
// F5 do host em cada momento da partida: faz o que aconteceria sem o F5
// (D3f, BUG-019, BUG-020).
// Ambiente simulado e ajudantes: environment.js. Rodar a partir da raiz:
//     node tests/logic/host-reload.test.js
// ============================================

const {
    fs, path, vm, ROOT, createEnvironment, tokenOf, test, check, start, finish,
    syncTo, roundScreens, unavailable, roomToReload, reloadHost, tryReloadHost, recordScreens,
    savedStateV1, savedStateV2, finalRankingV2, oldNamesIn, oldPlayerNamesIn,
    savedStateV3, oldAdvisoryNamesIn
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
    reloaded.join('A', 'peer-a2');
    const sync = syncTo(reloaded, 'peer-a2');
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
    reloaded.join('A', 'peer-a2');
    check(!reloaded.state.matchPaused, 'a volta de A deveria retomar a partida');
    const r = reloaded.state.currentRound;
    check(r && r.event && r.event.id === pausedEvent.id, 'a rodada retomada deveria usar o mesmo evento');
    check(reloaded.broadcastsOfType('round-start').length === 1 && reloaded.broadcastsOfType('show-event').length === 0,
        'deveria mandar a nova dupla, sem reexibir o evento');
    check(draws === 0 && effects === 0, 'a retomada também não sorteia nem reaplica');
});

test('T56 F5 do host com a pergunta aberta e sem rodada: como antes; relógio e prazo de resposta religados', (use) => {
    // Pergunta aberta: reexibida, com o prazo de resposta rearmado.
    const env = use(createEnvironment());
    roomToReload(env);
    env.join('A', 'peer-a');
    env.startMatch();
    const r = env.state.currentRound;

    const reloaded = use(reloadHost(env));
    const time = reloaded.fakeTime();
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

    check(clock.activeCount() === 1, 'o relógio da partida deveria voltar a contar, ligados: ' + clock.activeCount());
    const t0 = reloaded.state.timer;
    clock.tick();
    check(reloaded.state.timer === t0 - 1, 'deveria contar 1 segundo, veio: ' + reloaded.state.timer);

    time.advance(reloaded.CONFIG.GAME.ANSWER_TIMEOUT);
    check(reloaded.state.currentRound.answered === true && reloaded.broadcastsOfType('kpi-update').some(m => m.playerName === r.answerer),
        'o prazo de resposta deveria estar rearmado (a vez é pulada ao fim do prazo)');

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

test('T59 F5 do host com assessoria pendente: o pedido é cancelado, quem responde pode pedir de novo e a rodada não fica presa (BUG-019)', (use) => {
    // 1) Respondedor guest (A), assessor guest (B), o host pergunta.
    const env = use(createEnvironment());
    const r = preparePendingAdvisory(env, { asker: 'Host', answerer: 'A', advisor: 'B' });

    const reloaded = use(reloadHost(env));
    const time = reloaded.fakeTime();
    reloaded.clearLog();
    reloaded.Game.core.resumeMatchAfterReload();
    const r2 = reloaded.state.currentRound;
    check(r2 && r2.answerer === 'A' && r2.question.id === r.question.id && !r2.answered,
        'a mesma pergunta deveria continuar em andamento');
    check(!r2.advisory, 'o pedido de assessoria pendente deveria ser cancelado no F5, veio: ' + JSON.stringify(r2.advisory));

    // Resposta atrasada do assessor do pedido cancelado: ignorada.
    reloaded.Game.network.handleMessage({ type: 'advisory-answer', alternative: r.question.correct, declined: false }, 'peer-b');
    check(reloaded.broadcastsOfType('advisory-result').length === 0 && !reloaded.state.currentRound.advisory,
        'a resposta atrasada do assessor do pedido cancelado deveria ser ignorada');

    // Quem responde volta e recebe a pergunta sem o pedido pendente (botões liberados).
    reloaded.join('A', 'peer-a2');
    const sync = syncTo(reloaded, 'peer-a2');
    check(sync && sync.currentRound && sync.currentRound.answerer === 'A' && !sync.currentRound.advisory,
        'A deveria receber a pergunta sem assessoria pendente, veio: ' + JSON.stringify(sync && sync.currentRound && sync.currentRound.advisory));

    // Prazo de resposta rearmado: sem resposta, a vez é pulada e a partida segue.
    time.advance(reloaded.CONFIG.GAME.ANSWER_TIMEOUT);
    check(reloaded.state.currentRound.answered === true && reloaded.broadcastsOfType('kpi-update').some(m => m.playerName === 'A'),
        'ao fim do prazo de resposta, a vez de A deveria ser pulada (a rodada não pode ficar presa)');
    time.advance(3000);
    check(reloaded.broadcastsOfType('round-start').length === 1, 'depois disso, a próxima dupla deveria começar');

    // 2) Depois do F5, quem responde pode pedir assessoria de novo — e o pedido corre normalmente.
    const env2 = use(createEnvironment());
    preparePendingAdvisory(env2, { asker: 'Host', answerer: 'A', advisor: 'B' });
    const reloaded2 = use(reloadHost(env2));
    const time2 = reloaded2.fakeTime();
    reloaded2.Game.core.resumeMatchAfterReload();
    reloaded2.join('A', 'peer-a2');
    reloaded2.join('B', 'peer-b2');
    reloaded2.clearLog();
    reloaded2.Game.network.handleMessage({ type: 'advisory-request', advisorName: 'B', requesterName: 'A' }, 'peer-a2');
    check(reloaded2.broadcastsOfType('advisory-started').length === 1 &&
        reloaded2.record.sent.some(e => e.to === 'peer-b2' && e.msg.type === 'advisory-question'),
        'A deveria conseguir pedir assessoria de novo, e B receber a pergunta');
    time2.advance(reloaded2.CONFIG.GAME.ADVISORY_TIMEOUT);
    const result = reloaded2.broadcastsOfType('advisory-result').pop();
    check(result && result.timeout === true, 'o novo pedido deveria ter o prazo de assessoria normal');
    time2.advance(reloaded2.CONFIG.GAME.ANSWER_TIMEOUT);
    check(reloaded2.broadcastsOfType('kpi-update').some(m => m.playerName === 'A'), 'e depois o prazo de resposta normal');

    // 3) O host é quem responde: a tela dele já abre sem o pedido pendente.
    const env3 = use(createEnvironment());
    preparePendingAdvisory(env3, { asker: 'A', answerer: 'Host', advisor: 'B' });
    const reloaded3 = use(reloadHost(env3));
    const time3 = reloaded3.fakeTime();
    const advisoryOnScreen = [];
    const realUi = reloaded3.Game.ui;
    reloaded3.Game.ui = new Proxy({}, {
        get: (_, name) => (...args) => {
            if (name === 'displayQuestion') advisoryOnScreen.push(reloaded3.state.currentRound && reloaded3.state.currentRound.advisory);
            return realUi[name](...args);
        }
    });
    reloaded3.Game.core.resumeMatchAfterReload();
    check(advisoryOnScreen.length === 1 && !advisoryOnScreen[0],
        'o host deveria ver a pergunta sem o pedido pendente (botões liberados), viu: ' + JSON.stringify(advisoryOnScreen));
    time3.advance(reloaded3.CONFIG.GAME.ANSWER_TIMEOUT);
    check(reloaded3.broadcastsOfType('kpi-update').some(m => m.playerName === 'Host'),
        'ao fim do prazo de resposta, a vez do host deveria ser pulada');

    // 4) A resposta já tinha chegado e esperava o assessor: é processada no F5.
    const env4 = use(createEnvironment());
    const r4 = preparePendingAdvisory(env4, { asker: 'Host', answerer: 'A', advisor: 'B' });
    env4.Game.network.handleMessage({ type: 'answer', alternative: r4.question.correct, playerName: 'A' }, 'peer-a');
    check(env4.state.currentRound.pendingAnswer, 'pré-condição: resposta guardada esperando a assessoria');
    env4.Game.saveState(); // salvo por outro motivo antes do F5 (ex.: alguém caiu)
    const reloaded4 = use(reloadHost(env4));
    const time4 = reloaded4.fakeTime();
    reloaded4.clearLog();
    reloaded4.Game.core.resumeMatchAfterReload();
    const kpiOfA = reloaded4.broadcastsOfType('kpi-update').find(m => m.playerName === 'A');
    check(kpiOfA && kpiOfA.isCorrect === true, 'a resposta guardada deveria ser processada depois do F5');
    check(!reloaded4.record.ui.includes('displayQuestion'), 'a pergunta já respondida não pode ser reexibida');
    const r5 = reloaded4.state.currentRound;
    check(reloaded4.state.answeredThisRound.includes('A') && r5 && !r5.pendingAnswer && !r5.advisory,
        'A entra no rodízio; nada fica guardado nem pendente, veio: ' + JSON.stringify(r5 && { p: r5.pendingAnswer, a: r5.advisory }));
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
    reloaded.join('A', 'peer-a2');
    const sync = syncTo(reloaded, 'peer-a2');
    check(sync && sync.currentRound.advisory && sync.currentRound.advisory.status === 'accepted', 'A deveria voltar vendo a sugestão');
    const fee = reloaded.CONFIG.RESOURCES.ADVISORY_FEE;
    const before = { A: reloaded.player('A').resources, B: reloaded.player('B').resources };
    reloaded.Game.network.handleMessage({ type: 'answer', alternative: r.question.correct, playerName: 'A' }, 'peer-a2');
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
    reloaded2.join('A', 'peer-a2');
    reloaded2.clearLog();
    reloaded2.Game.network.handleMessage({ type: 'advisory-request', advisorName: 'B', requesterName: 'A' }, 'peer-a2');
    check(reloaded2.broadcastsOfType('advisory-started').length === 0, 'só um pedido de assessoria por pergunta, como sem o F5');
});

/**
 * Partida de 3 (Host, A, B) com a dupla fixada e a pergunta aberta;
 * o host dá F5 e a partida é retomada. Devolve o host recarregado, o
 * tempo controlado e as telas que ele montou na retomada.
 */
function reloadWithOpenQuestion(use, roles) {
    const env = use(createEnvironment());
    roomToReload(env);
    env.join('A', 'peer-a');
    env.join('B', 'peer-b');
    env.startMatch();
    // O sorteio da dupla é aleatório: fixa os papéis (mesma pergunta e evento).
    env.state.currentRound = { ...env.state.currentRound, ...roles, answered: false };
    env.state.answeredThisRound = [];
    env.Game.saveState();

    const reloaded = use(reloadHost(env));
    const time = reloaded.fakeTime();
    const screens = recordScreens(reloaded);
    reloaded.Game.core.resumeMatchAfterReload();
    return { reloaded, time, screens };
}

test('T64 F5 do host fora da dupla com a pergunta aberta: volta vendo a tela de espectador e o prazo de resposta continua (BUG-020)', (use) => {
    const { reloaded, time, screens } = reloadWithOpenQuestion(use, { asker: 'A', answerer: 'B' });
    const names = screens.map(t => t.name);
    const spectator = screens.find(t => t.name === 'displaySpectatorView');
    check(spectator && spectator.args[0] === 'A' && spectator.args[1] === 'B',
        'o host fora da dupla deveria ver "A pergunta para B", viu: ' + names.join(', '));
    check(!names.includes('displayRoundStart') && !names.includes('displayQuestion'),
        'o host fora da dupla não pode ver a área da pergunta, viu: ' + names.join(', '));
    const r = reloaded.state.currentRound;
    check(r && r.asker === 'A' && r.answerer === 'B' && !r.answered, 'a mesma pergunta deveria continuar em andamento');
    check(reloaded.broadcastsOfType('round-start').length === 0, 'não pode trocar a pergunta');
    time.advance(reloaded.CONFIG.GAME.ANSWER_TIMEOUT);
    check(reloaded.broadcastsOfType('kpi-update').some(m => m.playerName === 'B'),
        'o prazo de resposta deveria estar rearmado (sem resposta, a vez de B é pulada)');

    // Controle: o host na dupla (perguntando ou respondendo) continua vendo a pergunta.
    for (const roles of [{ asker: 'Host', answerer: 'A' }, { asker: 'A', answerer: 'Host' }]) {
        const c = reloadWithOpenQuestion(use, roles);
        const n = c.screens.map(t => t.name);
        check(n.includes('displayRoundStart') && n.includes('displayQuestion') && !n.includes('displaySpectatorView'),
            'host como ' + (roles.asker === 'Host' ? 'Perguntador' : 'Respondedor') + ' deveria ver a pergunta, viu: ' + n.join(', '));
        c.time.advance(c.reloaded.CONFIG.GAME.ANSWER_TIMEOUT);
        check(c.reloaded.broadcastsOfType('kpi-update').some(m => m.playerName === roles.answerer),
            'o prazo de resposta também deveria estar rearmado com o host na dupla');
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
    reloaded.join('A', 'peer-a2');
    const sync = syncTo(reloaded, 'peer-a2');
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

/** Grava no localStorage do ambiente um estado salvo { roomState, myData }. */
function storeSavedState(env, saved) {
    env.storage['pmKPI_roomState'] = JSON.stringify(saved.roomState);
    env.storage['pmKPI_myData'] = JSON.stringify(saved.myData);
}

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
    reloaded.join('A', 'peer-a2');
    const sync = syncTo(reloaded, 'peer-a2');
    const q = sync && sync.currentRound && sync.currentRound.question;
    check(q && q.id === 'q7' && q.correct === undefined && sync.decks && sync.decks.d1,
        'A deveria receber a mesma pergunta, sem o gabarito, e os baralhos');
    reloaded.Game.network.handleMessage({ type: 'answer', alternative: 'b', playerName: 'A' }, 'peer-a2');
    const kpi = reloaded.broadcastsOfType('kpi-update').find(m => m.playerName === 'A');
    check(kpi && kpi.isCorrect === true && kpi.kpiGained > 0 && kpi.kpi === 10 + kpi.kpiGained,
        'a resposta certa de A deveria contar sobre o KPI salvo, veio: ' + JSON.stringify(kpi));
    check(JSON.stringify(reloaded.state.answeredThisRound) === '["A"]', 'A deveria entrar no rodízio');
    reloaded.Game.saveState();
    const saved = JSON.parse(env.storage['pmKPI_roomState']);
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
    reloaded2.join('A', 'peer-a2');
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
    check(host.focusArea === 'planning' && host.activities === 0,
        'a área foco do host vem do pmKPI_myData, que também deveria ser migrado, veio: ' + JSON.stringify(host));
    check(oldPlayerNamesIn(s).length === 0, 'nenhum nome antigo deveria sobrar no estado restaurado, sobraram: ' + oldPlayerNamesIn(s).join(', '));

    reloaded.fakeTime();
    reloaded.Game.core.resumeMatchAfterReload();
    reloaded.join('A', 'peer-a2');
    const sync = syncTo(reloaded, 'peer-a2');
    const aInSync = sync && sync.players.find(p => p.name === 'A');
    check(aInSync && aInSync.resources === 7 && aInSync.focusArea === 'initiating' && oldPlayerNamesIn(sync).length === 0,
        'A deveria voltar com os recursos e a área foco salvos, com os nomes novos, veio: ' + JSON.stringify(aInSync));

    // A erra: gasta 1 dos recursos salvos.
    reloaded.Game.network.handleMessage({ type: 'answer', alternative: 'a', playerName: 'A' }, 'peer-a2');
    const kpi = reloaded.broadcastsOfType('kpi-update').find(m => m.playerName === 'A');
    check(kpi && kpi.isCorrect === false && kpi.resources === 6 && kpi.focusArea === 'initiating' && reloaded.player('A').resources === 6,
        'a resposta errada de A deveria gastar 1 dos recursos salvos (7 → 6), veio: ' + JSON.stringify(kpi));
    reloaded.Game.saveState();
    const saved = JSON.parse(env.storage['pmKPI_roomState']);
    const mine = JSON.parse(env.storage['pmKPI_myData']);
    check(saved.stateVersion === reloaded.Game.persistence.STATE_VERSION && oldPlayerNamesIn(saved).length === 0 && saved.players.find(p => p.name === 'A').resources === 6,
        'ao salvar de novo, o estado deveria ficar na versão atual, com os nomes novos, veio: ' + JSON.stringify(saved.players));
    check(mine.focusArea === 'planning' && !('phase' in mine), 'pmKPI_myData deveria ser salvo com focusArea, veio: ' + JSON.stringify(mine));

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
    reloaded2.join('A', 'peer-a2');
    const endSync = syncTo(reloaded2, 'peer-a2');
    check(endSync && endSync.gameOver === true && JSON.stringify(endSync.finalRanking) === JSON.stringify(ranking),
        'quem volta no fim de jogo deveria receber o mesmo ranking, veio: ' + JSON.stringify(endSync && endSync.finalRanking));
});

test('T85 F5 do host com o estado salvo na versão 3 (gravado antes de o jogo ser atualizado): a assessoria da rodada continua (pendente, aceita ou recusada)', (use) => {
    // 1) Assessoria pendente: restaurada com os nomes novos; a retomada a
    // cancela (como sem a atualização) e quem responde pode pedir de novo.
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
    check(r && r.advisory === null && r.answerer === 'A' && r.question.id === 'q7' && !r.answered,
        'o pedido pendente deveria ser cancelado na retomada, com a mesma pergunta aberta, veio: ' + JSON.stringify(r));
    reloaded.join('A', 'peer-a2');
    reloaded.join('B', 'peer-b2');
    reloaded.clearLog();
    reloaded.Game.network.handleMessage({ type: 'advisory-request', advisorName: 'B', requesterName: 'A' }, 'peer-a2');
    const started = reloaded.broadcastsOfType('advisory-started')[0];
    check(started && started.advisorName === 'B' && started.requesterName === 'A' &&
        reloaded.record.sent.some(e => e.to === 'peer-b2' && e.msg.type === 'advisory-question'),
        'A deveria conseguir pedir assessoria de novo, e B receber a pergunta, veio: ' + JSON.stringify(started));
    const again = reloaded.state.currentRound.advisory;
    check(again && again.advisorName === 'B' && again.status === 'pending', 'o pedido novo deveria ficar pendente, veio: ' + JSON.stringify(again));
    reloaded.Game.saveState();
    const saved = JSON.parse(env.storage['pmKPI_roomState']);
    check(saved.stateVersion === reloaded.Game.persistence.STATE_VERSION && saved.currentRound.advisory &&
        saved.currentRound.advisory.advisorName === 'B' && oldAdvisoryNamesIn(saved).length === 0,
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
    reloaded2.join('A', 'peer-a2');
    reloaded2.join('B', 'peer-b2');
    const sync = syncTo(reloaded2, 'peer-a2');
    const syncAdvisory = sync && sync.currentRound && sync.currentRound.advisory;
    check(syncAdvisory && syncAdvisory.status === 'accepted' && syncAdvisory.suggestion === 'b' && sync.currentRound.question.correct === undefined,
        'A deveria voltar vendo a sugestão (e sem o gabarito), veio: ' + JSON.stringify(sync && sync.currentRound));
    reloaded2.Game.network.handleMessage({ type: 'answer', alternative: 'b', playerName: 'A' }, 'peer-a2');
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
    reloaded3.join('A', 'peer-a2');
    reloaded3.join('B', 'peer-b2');
    reloaded3.clearLog();
    reloaded3.Game.network.handleMessage({ type: 'advisory-request', advisorName: 'B', requesterName: 'A' }, 'peer-a2');
    check(reloaded3.broadcastsOfType('advisory-started').length === 0 && reloaded3.state.currentRound.advisory.status === 'declined',
        'só um pedido de assessoria por pergunta, como sem a atualização');
});

finish('F5 do host');
