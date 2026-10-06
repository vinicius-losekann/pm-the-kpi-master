// ============================================
// PM: The KPI Master - Testes no navegador: F5 do host em cada momento
// ============================================
// Checklist: _docs/testes-conexao.md (M2 e os bugs B3, B4 e B5) e
// _docs/ISSUES.md (BUG-019, assessoria pendente). O F5 no meio da
// pergunta está em connection.spec.js (E1). Também a reabertura da sala
// depois que todos saíram (M13, M16): até 5 minutos o estado salvo
// restaura a partida; depois disso, lobby novo.
// ============================================

const { test, expect, roomCode, roomId, startMatch, answerUntilRoundEnds, waitForOpenQuestion } = require('./players');

/** Espera o host voltar do F5: de novo host, na mesma sala, com a partida em andamento. */
async function waitForHostBack(host, room) {
    await host.waitFor((id) => Game.state.isHost === true && Game.state.peerId === id && Game.state.gameStarted === true,
        { arg: room, timeout: 25000 });
}

test('E9 F5 do host com a rodada encerrada: continua encerrada para todos, "Nova Rodada" liberado, nada começa sozinho', async ({ players }) => {
    const code = roomCode();
    const room = roomId(code);
    const ana = await players.add('Ana');
    const beto = await players.add('Beto');
    await startMatch(ana, [beto], code);
    await answerUntilRoundEnds(ana, [ana, beto]);
    await beto.waitFor(() => Game.state.roundEnded === true);

    await ana.page.reload();
    await waitForHostBack(ana, room);
    await expect.poll(() => beto.isConnectedTo(room), { timeout: 25000, message: 'Beto deveria reconectar ao mesmo host' }).toBe(true);
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
    const room = roomId(code);
    const ana = await players.add('Ana');
    const beto = await players.add('Beto');
    await startMatch(ana, [beto], code);

    // A host responde e dá F5 antes dos ~3s que separam a resposta da próxima dupla.
    await waitForOpenQuestion(ana, [ana, beto], [ana]);
    expect(await ana.answerIfMyTurn(), 'pré-condição: a pergunta aberta é da Ana').toBe(true);
    await ana.waitFor(() => Game.state.currentRound && Game.state.currentRound.answerer === 'Ana' && Game.state.currentRound.answered === true,
        { timeout: 2000 });
    await ana.page.reload();
    await waitForHostBack(ana, room);

    // Segue para a próxima dupla (Beto responde) ou encerra a rodada (Beto já tinha respondido).
    await ana.waitFor(() => Game.state.roundEnded === true ||
        (Game.state.currentRound !== null && Game.state.currentRound.answered === false && Game.state.currentRound.answerer === 'Beto'),
        { timeout: 10000 });
    await expect.poll(() => beto.isConnectedTo(room), { timeout: 25000, message: 'Beto deveria reconectar ao mesmo host' }).toBe(true);

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
    const room = roomId(code);
    const ana = await players.add('Ana');
    const beto = await players.add('Beto');
    await startMatch(ana, [beto], code);

    // Beto fecha a aba: só a Ana fica conectada e a partida pausa.
    const betoLink = await beto.closeTab();
    await ana.waitFor(() => !!Game.state.matchPaused && !!Game.state.matchPaused.event);
    const eventId = await ana.state(() => Game.state.matchPaused.event.id);

    await ana.page.reload();
    await waitForHostBack(ana, room);
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

test('E12 F5 do host com um pedido de assessoria sem resposta: o pedido é cancelado e quem responde pode seguir (BUG-019)', async ({ players }) => {
    const code = roomCode();
    const room = roomId(code);
    const ana = await players.add('Ana');
    const beto = await players.add('Beto');
    const caio = await players.add('Caio');
    await startMatch(ana, [beto, caio], code);

    // Um guest com a pergunta aberta pede assessoria; o assessor não responde.
    const answerer = await waitForOpenQuestion(ana, [ana, beto, caio], [beto, caio]);
    await answerer.click('#btnRequestAdvisory');
    await answerer.page.click('#advisoryPlayersList .advisor-select-btn', { timeout: 10000 });
    await ana.waitFor(() => !!Game.state.currentRound && !!Game.state.currentRound.advisory &&
        Game.state.currentRound.advisory.status === 'pending');
    expect(await answerer.hasOpenQuestion(), 'pré-condição: botões travados esperando o assessor').toBe(false);

    await ana.page.reload();
    await waitForHostBack(ana, room);
    await expect.poll(() => answerer.isConnectedTo(room), { timeout: 25000, message: answerer.name + ' deveria reconectar ao mesmo host' }).toBe(true);

    // Volta com a pergunta aberta, botões e "Pedir Assessoria" liberados.
    await expect.poll(() => answerer.hasOpenQuestion(),
        { timeout: 15000, message: answerer.name + ' deveria voltar com os botões liberados (pedido cancelado)' }).toBe(true);
    await expect(answerer.page.locator('#btnRequestAdvisory'), 'deveria poder pedir assessoria de novo').toBeEnabled();
    expect(await ana.state(() => Game.state.currentRound.advisory || null), 'o host não deveria mais esperar o assessor').toBeNull();

    // Responde e a partida segue.
    expect(await answerer.answerIfMyTurn()).toBe(true);
    await ana.waitFor((name) => Game.state.answeredThisRound.includes(name), { arg: answerer.name, timeout: 10000 });
});

test('E17 Todos saem (o host por último, com a partida pausada) e voltam em até 5 min: continua pausada com o mesmo evento e retoma', async ({ players }) => {
    const code = roomCode();
    const room = roomId(code);
    const ana = await players.add('Ana');
    const beto = await players.add('Beto');
    await startMatch(ana, [beto], code);

    // Beto sai: a partida pausa. Depois a Ana (host) também fecha a aba.
    const betoLink = await beto.closeTab();
    await ana.waitFor(() => !!Game.state.matchPaused && !!Game.state.matchPaused.event);
    const eventId = await ana.state(() => Game.state.matchPaused.event.id);
    const anaLink = await ana.closeTab();

    // Ana reabre o link: de novo host da mesma sala, ainda pausada com o mesmo evento.
    await ana.reopen(anaLink);
    await waitForHostBack(ana, room);
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

test('E18 Todos saem e voltam depois de 5 min: a sala abre um lobby novo e uma partida nova começa', async ({ players }) => {
    const code = roomCode();
    const room = roomId(code);
    const ana = await players.add('Ana');
    const beto = await players.add('Beto');
    await startMatch(ana, [beto], code);

    const betoLink = await beto.closeTab();
    await ana.waitFor(() => !!Game.state.matchPaused);
    const anaLink = await ana.closeTab();

    // Passam 6 minutos para os dois (o estado salvo só vale 5).
    expect(await ana.ageSavedState(6), 'pré-condição: a Ana tinha estado salvo').toBe(true);
    expect(await beto.ageSavedState(6), 'pré-condição: o Beto tinha estado salvo').toBe(true);

    // Ana reabre o link: lobby novo, só ela na sala.
    await ana.reopen(anaLink);
    await ana.waitFor((id) => Game.state.isHost === true && Game.state.peerId === id &&
        Game.network.connectionState.getPeer() && Game.network.connectionState.getPeer().open === true,
    { arg: room, timeout: 25000 });
    expect(await ana.state(() => Game.state.gameStarted), 'a partida antiga não deveria ser restaurada').toBe(false);
    expect(await ana.state(() => Game.state.players.map(p => p.name))).toEqual(['Ana']);
    await expect(ana.page.locator('#screenLobby')).toBeVisible();
    await expect(ana.page.locator('#btnStartGame'), 'sozinha, o "Iniciar" fica bloqueado').toBeDisabled();

    // Beto reabre o link: entra como jogador novo.
    await beto.reopen(betoLink);
    await ana.waitFor(() => {
        const b = Game.state.players.find(p => p.name === 'Beto');
        return b && b.disconnected !== true;
    }, { timeout: 25000 });
    const betoInList = await ana.state(() => Game.state.players.find(p => p.name === 'Beto'));
    expect(betoInList.kpi).toBe(0);
    expect(betoInList.resources).toBe(await ana.state(() => CONFIG.STARTING_RESOURCES));
    expect(await beto.state(() => Game.state.gameStarted)).toBe(false);

    // Uma partida nova começa.
    await expect(ana.page.locator('#btnStartGame')).toBeEnabled();
    await ana.click('#btnStartGame');
    await ana.waitFor(() => Game.state.gameStarted === true && Game.state.currentRound !== null);
    await beto.waitFor(() => Game.state.gameStarted === true);
});
