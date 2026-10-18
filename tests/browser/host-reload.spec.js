// ============================================
// PM: The KPI Master - Testes no navegador: F5 do host em cada momento
// ============================================
// Checklist: _docs/connection-tests.md (M2 e os bugs B3, B4 e B5) e
// _docs/issues.md (BUG-019, apoio pendente: continua depois do F5, E29).
// O F5 no meio da pergunta está em connection.spec.js (E1). Também a
// reabertura da sala depois que todos saíram (M13, M16): o estado no
// banco restaura a partida enquanto a sala existir. E o relógio da
// partida pela hora do servidor, com um navegador de relógio errado (E28).
// ============================================

const { test, expect, roomCode, startMatch, answerUntilRoundEnds, waitForOpenQuestion, waitForHostBack, DROP_WAIT } = require('./players');

test('E9 F5 do host com a rodada encerrada: continua encerrada para todos, "Nova Rodada" liberado, nada começa sozinho', async ({ players }) => {
    const code = roomCode();
    const ana = await players.add('Ana');
    const beto = await players.add('Beto');
    await startMatch(ana, [beto], code);
    await answerUntilRoundEnds(ana, [ana, beto]);
    await beto.waitFor(() => Game.state.roundEnded === true);

    await ana.page.reload();
    await waitForHostBack(ana);
    await expect.poll(() => beto.isConnectedToHost(), { timeout: 25000, message: 'Beto deveria reconectar ao mesmo host' }).toBe(true);
    await ana.waitFor(() => {
        const b = Game.state.players.find(p => p.name === 'Beto');
        return b && b.disconnected === false;
    });

    expect(await ana.state(() => Game.state.roundEnded), 'depois do F5, a rodada deveria continuar encerrada').toBe(true);
    await expect(ana.page.locator('#spectatorMessage')).toContainText('Rodada encerrada');
    await expect(ana.page.locator('#btnNewRound'), 'o "Nova Rodada" deveria estar liberado').toBeEnabled();
    await beto.waitFor(() => Game.state.roundEnded === true);
    await expect(beto.page.locator('#spectatorMessage'), 'Beto deveria ver "Rodada encerrada", não a última dupla').toContainText('Rodada encerrada');
    expect(await beto.hasOpenQuestion()).toBe(false);

    // Nada começa sozinho.
    await ana.page.waitForTimeout(5000);
    expect(await ana.state(() => Game.state.roundEnded), 'nenhuma dupla deveria começar sem o "Nova Rodada"').toBe(true);
    expect(await beto.state(() => Game.state.roundEnded)).toBe(true);

    // O host clica em "Nova Rodada": a rodada começa para os dois.
    await ana.click('#btnNewRound');
    await ana.waitFor(() => Game.state.roundEnded === false && Game.state.currentRound !== null && Game.state.currentRound.answered === false);
    await beto.waitFor(() => Game.state.roundEnded === false && Game.state.currentRound !== null);
});

test('E10 F5 do host logo depois de responder (antes da próxima dupla): a partida não trava', async ({ players }) => {
    const code = roomCode();
    const ana = await players.add('Ana');
    const beto = await players.add('Beto');
    await startMatch(ana, [beto], code);

    // A host responde e dá F5 antes dos ~3s que separam a resposta da próxima dupla.
    await waitForOpenQuestion(ana, [ana, beto], [ana]);
    expect(await ana.answerIfMyTurn(), 'pré-condição: a pergunta aberta é da Ana').toBe(true);
    await ana.waitFor(() => Game.state.currentRound && Game.state.currentRound.answerer === 'Ana' && Game.state.currentRound.answered === true,
        { timeout: 2000 });
    await ana.page.reload();
    await waitForHostBack(ana);

    // Segue para a próxima dupla (Beto responde) ou encerra a rodada (Beto já tinha respondido).
    await ana.waitFor(() => Game.state.roundEnded === true ||
        (Game.state.currentRound !== null && Game.state.currentRound.answered === false && Game.state.currentRound.answerer === 'Beto'),
        { timeout: 10000 });
    await expect.poll(() => beto.isConnectedToHost(), { timeout: 25000, message: 'Beto deveria reconectar ao mesmo host' }).toBe(true);

    // A partida continua: a rodada vai até o fim e a seguinte começa.
    await answerUntilRoundEnds(ana, [ana, beto]);
    const answered = await ana.state(() => Game.state.answeredThisRound.slice());
    expect(answered.slice().sort(), 'cada um responde uma vez na rodada').toEqual(['Ana', 'Beto']);
    await ana.click('#btnNewRound');
    await ana.waitFor(() => Game.state.roundEnded === false && Game.state.currentRound !== null && Game.state.currentRound.answered === false);
    await beto.waitFor(() => Game.state.roundEnded === false && Game.state.currentRound !== null);
});

test('E11 F5 do host com a partida pausada: continua pausada com o mesmo evento e retoma quando o outro volta', async ({ players }) => {
    const code = roomCode();
    const ana = await players.add('Ana');
    const beto = await players.add('Beto');
    await startMatch(ana, [beto], code);

    // Beto fecha a aba: só a Ana fica conectada e a partida pausa.
    const betoLink = await beto.closeTab();
    await ana.waitFor(() => !!Game.state.matchPaused && !!Game.state.matchPaused.event, { timeout: DROP_WAIT });
    const eventId = await ana.state(() => Game.state.matchPaused.event.id);

    await ana.page.reload();
    await waitForHostBack(ana);
    expect(await ana.state(() => Game.state.matchPaused && Game.state.matchPaused.event && Game.state.matchPaused.event.id),
        'depois do F5, a partida deveria continuar pausada com o mesmo evento').toBe(eventId);
    await expect(ana.page.locator('#modalEvent'), 'não deveria sortear nem mostrar outro evento').toBeHidden();
    await expect(ana.page.locator('#spectatorMessage')).toContainText('Partida pausada');
    expect(await ana.state(() => Game.state.currentRound)).toBeNull();

    // Beto volta pelo mesmo link: a partida retoma com o mesmo evento, sem mostrar o evento de novo.
    await beto.reopen(betoLink);
    await ana.waitFor(() => {
        const b = Game.state.players.find(p => p.name === 'Beto');
        return b && b.disconnected === false;
    }, { timeout: 25000 });
    await ana.waitFor(() => !Game.state.matchPaused && Game.state.currentRound !== null);
    expect(await ana.state(() => Game.state.currentRound.event.id), 'a rodada retomada deveria usar o mesmo evento').toBe(eventId);
    await expect(ana.page.locator('#modalEvent')).toBeHidden();
    await beto.waitFor(() => Game.state.currentRound !== null && Game.state.roundEnded === false);
});

test('E17 Todos saem (o host por último, com a partida pausada) e voltam: continua pausada com o mesmo evento e retoma', async ({ players }) => {
    const code = roomCode();
    const ana = await players.add('Ana');
    const beto = await players.add('Beto');
    await startMatch(ana, [beto], code);

    // Beto sai: a partida pausa. Depois a Ana (host) também fecha a aba.
    const betoLink = await beto.closeTab();
    await ana.waitFor(() => !!Game.state.matchPaused && !!Game.state.matchPaused.event, { timeout: DROP_WAIT });
    const eventId = await ana.state(() => Game.state.matchPaused.event.id);
    const anaLink = await ana.closeTab();

    // Ana reabre o link: de novo host da mesma sala, ainda pausada com o mesmo evento.
    await ana.reopen(anaLink);
    await waitForHostBack(ana);
    expect(await ana.state(() => Game.state.matchPaused && Game.state.matchPaused.event && Game.state.matchPaused.event.id),
        'a partida deveria continuar pausada com o mesmo evento').toBe(eventId);
    await expect(ana.page.locator('#modalEvent'), 'não deveria sortear nem mostrar outro evento').toBeHidden();
    await expect(ana.page.locator('#spectatorMessage')).toContainText('Partida pausada');
    expect(await ana.state(() => Game.state.currentRound)).toBeNull();

    // Beto reabre o link: a partida retoma com o mesmo evento.
    await beto.reopen(betoLink);
    await ana.waitFor(() => {
        const b = Game.state.players.find(p => p.name === 'Beto');
        return b && b.disconnected === false;
    }, { timeout: 25000 });
    await ana.waitFor(() => !Game.state.matchPaused && Game.state.currentRound !== null);
    expect(await ana.state(() => Game.state.currentRound.event.id), 'a rodada retomada deveria usar o mesmo evento').toBe(eventId);
    await beto.waitFor(() => Game.state.gameStarted === true && Game.state.currentRound !== null);
});

test('E29 F5 do host com um pedido de apoio sem resposta: o pedido continua, quem foi chamado responde depois do F5 e a rodada segue (BUG-019, pelo Firebase)', async ({ players }) => {
    const code = roomCode();
    const ana = await players.add('Ana');
    const beto = await players.add('Beto');
    const caio = await players.add('Caio');
    const everyone = [ana, beto, caio];
    await startMatch(ana, [beto, caio], code);

    // Um guest com a pergunta aberta pede apoio; quem foi chamado ainda não responde.
    const answerer = await waitForOpenQuestion(ana, everyone, [beto, caio]);
    await answerer.click('#btnRequestAdvisory');
    await answerer.page.click('#advisoryPlayersList .advisor-select-btn', { timeout: 10000 });
    await ana.waitFor(() => !!Game.state.currentRound && !!Game.state.currentRound.advisory &&
        Game.state.currentRound.advisory.status === 'pending');
    const advisorName = await ana.state(() => Game.state.currentRound.advisory.advisorName);
    const advisor = everyone.find(p => p.name === advisorName);
    expect(await answerer.hasOpenQuestion(), 'pré-condição: botões travados esperando o apoio').toBe(false);

    await ana.page.reload();
    await waitForHostBack(ana);
    for (const p of [beto, caio]) {
        await expect.poll(() => p.isConnectedToHost(), { timeout: 25000, message: p.name + ' deveria reconectar ao mesmo host' }).toBe(true);
    }
    expect(await ana.state(() => Game.state.currentRound && Game.state.currentRound.advisory && Game.state.currentRound.advisory.status),
        'o pedido de apoio deveria continuar pendente depois do F5').toBe('pending');
    expect(await answerer.hasOpenQuestion(), answerer.name + ' continua esperando o apoio (botões travados)').toBe(false);

    // Quem foi chamado vê a pergunta do apoio (de novo, depois do F5) e responde.
    await advisor.waitFor(() => document.getElementById('modalAdvisoryQuestion').style.display === 'flex', { timeout: 20000 });
    await advisor.page.click('#advisoryAlternativesList button', { timeout: 10000 });
    await ana.waitFor(() => !!Game.state.currentRound && !!Game.state.currentRound.advisory &&
        Game.state.currentRound.advisory.status === 'accepted', { timeout: 15000 });

    // Quem pediu recebe a sugestão, com os botões liberados, responde e a rodada segue.
    await expect.poll(() => answerer.hasOpenQuestion(),
        { timeout: 15000, message: answerer.name + ' deveria ter os botões liberados depois da resposta de ' + advisor.name }).toBe(true);
    expect(await answerer.answerIfMyTurn()).toBe(true);
    await ana.waitFor((name) => Game.state.answeredThisRound.includes(name), { arg: answerer.name, timeout: 10000 });
});

test('E28 Relógio pela hora do servidor: um navegador com o relógio 30 s adiantado mostra o mesmo tempo do host, e o F5 do host continua do mesmo ponto', async ({ players }) => {
    const code = roomCode();
    const ana = await players.add('Ana');
    const beto = await players.add('Beto');
    // O relógio do computador do Beto está 30 s adiantado (a hora do servidor corrige).
    await beto.context.clock.install({ time: Date.now() + 30000 });
    await beto.context.clock.resume();
    await startMatch(ana, [beto], code);
    const startedAt = Date.now();
    const duration = await ana.state(() => CONFIG.GAME.SESSION_DURATION);
    const timers = async () => ({ ana: await ana.state(() => Game.state.timer), beto: await beto.state(() => Game.state.timer) });

    await ana.page.waitForTimeout(3000);
    const early = await timers();
    expect(Math.abs(early.ana - early.beto), 'Beto (relógio adiantado) deveria ver o mesmo tempo da Ana, veio: ' + JSON.stringify(early)).toBeLessThanOrEqual(1);

    // F5 da Ana ~12 s depois do início, sem nada gravado nesse meio-tempo: o relógio continua do mesmo ponto.
    await ana.page.waitForTimeout(9000);
    await ana.page.reload();
    await waitForHostBack(ana);
    await expect.poll(() => beto.isConnectedToHost(), { timeout: 25000, message: 'Beto deveria reconectar ao mesmo host' }).toBe(true);
    await ana.page.waitForTimeout(1500);
    const expected = duration - Math.round((Date.now() - startedAt) / 1000);
    const after = await timers();
    expect(Math.abs(after.ana - expected), 'depois do F5, o relógio da Ana deveria continuar do mesmo ponto (faltando ~' + expected + ' s), veio: ' +
        JSON.stringify(after)).toBeLessThanOrEqual(3);
    expect(Math.abs(after.ana - after.beto), 'depois do F5, Beto deveria continuar vendo o mesmo tempo da Ana, veio: ' + JSON.stringify(after)).toBeLessThanOrEqual(1);
});
