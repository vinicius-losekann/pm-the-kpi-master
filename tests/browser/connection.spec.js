// ============================================
// PM: The KPI Master - Testes no navegador: quedas, voltas e nova partida
// ============================================
// Checklist: _docs/connection-tests.md (M1, M5, M6, M10, M14, M15, M20).
// ============================================

const {
    test, expect, roomCode, startMatch, answerUntilRoundEnds,
    waitForOpenQuestion, waitForHostBack, DROP_WAIT
} = require('./players');

test('E1 F5 do host no meio da question: o outro reconecta ao mesmo host, sem troca, e a partida segue; o log mostra quanto o F5 do host demora', async ({ players }) => {
    const code = roomCode();
    const ana = await players.add('Ana');
    const beto = await players.add('Beto');
    await startMatch(ana, [beto], code);
    await waitForOpenQuestion(ana, [ana, beto], [ana, beto]);

    // Medida para rever o HOST_TIMEOUT: do F5 até o host estar de novo no
    // canal da sala (é quando o sinal de vida dele volta).
    const reloadedAt = Date.now();
    await ana.page.reload();
    await expect.poll(() => ana.isRoomHost(), { timeout: 25000, intervals: [100], message: 'Ana deveria voltar como host da sala' }).toBe(true);
    const measure = 'F5 do host: ' + (Date.now() - reloadedAt) + ' ms até voltar ao canal da sala (o sinal fica parado esse tempo, mais até 2 s do ritmo)';
    console.log('📏 ' + measure);
    test.info().annotations.push({ type: 'measure', description: measure });
    await waitForHostBack(ana);
    await expect.poll(() => beto.isConnectedToHost(), { timeout: 25000, message: 'Beto deveria reconectar ao mesmo host' }).toBe(true);
    await ana.waitFor(() => {
        const b = Game.state.players.find(p => p.name === 'Beto');
        return b && b.disconnected === false;
    });
    expect(await beto.state(() => Game.state.isHost), 'não deveria ter havido troca de host').toBe(false);
    expect(await beto.state(() => Game.state.players.filter(p => p.isHost).map(p => p.name)), 'Ana continua host').toEqual(['Ana']);

    // A partida continua: a rodada vai até o fim.
    await answerUntilRoundEnds(ana, [ana, beto]);
});

test('E6 Jogador dá F5, outro fecha e volta pela tela inicial, nome novo é recusado; a partida segue', async ({ players }) => {
    const code = roomCode();
    const ana = await players.add('Ana');
    const beto = await players.add('Beto');
    const caio = await players.add('Caio');
    await startMatch(ana, [beto, caio], code);
    const isConnected = (name) => ana.state((n) => {
        const p = Game.state.players.find(x => x.name === n);
        return !!p && p.disconnected === false;
    }, name);

    // F5 do Beto: volta ligado ao host, no mesmo lugar.
    await beto.page.reload();
    await expect.poll(() => beto.isConnectedToHost(), { timeout: 25000, message: 'Beto deveria voltar ligado ao host' }).toBe(true);
    await expect.poll(() => isConnected('Beto'), { timeout: 25000, message: 'Beto deveria voltar ao lugar dele' }).toBe(true);

    // Caio fecha a aba e volta pela tela inicial (mesmo navegador = mesma identidade).
    await caio.closeTab();
    await expect.poll(() => isConnected('Caio'), { timeout: DROP_WAIT, message: 'a queda do Caio deveria ser percebida' }).toBe(false);
    await caio.joinFromHomeScreen(code);
    await expect.poll(() => isConnected('Caio'), { timeout: 25000, message: 'Caio deveria voltar ao lugar dele' }).toBe(true);

    // Nome novo com a partida em andamento: recusado.
    const davi = await players.add('Davi');
    await davi.newTab();
    await davi.page.goto(require('./players').SITE + '/index.html');
    await davi.page.click('#btnChooseJoin');
    await davi.page.fill('#joinPlayerName', 'Davi');
    await davi.page.fill('#joinRoomSuffix', code);
    await davi.page.click('#btnJoinRoom');
    await expect.poll(() => davi.logs.some(l => l.includes('A partida desta sala já começou')), { timeout: 25000, message: 'Davi deveria ver o aviso de partida em andamento' }).toBe(true);
    expect(await ana.state(() => Game.state.players.map(p => p.name))).not.toContain('Davi');

    await answerUntilRoundEnds(ana, [ana, beto, caio]);
});

test('E8 Jogador sai da partida, ela acaba, e o host consegue iniciar outra', async ({ players }) => {
    const code = roomCode();
    const ana = await players.add('Ana');
    const beto = await players.add('Beto');
    await startMatch(ana, [beto], code);

    // Se a pergunta aberta for do Beto, ele responde antes (a janela de
    // resposta cobre a tela, como no jogo).
    if (await beto.hasOpenQuestion()) {
        await beto.answerIfMyTurn();
        await expect(beto.page.locator('#modalAnswerQuestion')).toBeHidden();
    }
    await beto.click('#btnLeaveMatch');
    await ana.waitFor(() => Game.state.gameOver === true);
    await beto.waitFor(() => Game.state.gameOver === true);

    await ana.click('#btnBackToLobby');
    await beto.click('#btnBackToLobby');
    await expect(ana.page.locator('#btnStartGame'), 'o "Iniciar" deveria estar liberado').toBeEnabled();
    await ana.click('#btnStartGame');
    await ana.waitFor(() => Game.state.gameStarted === true && Game.state.gameOver === false && Game.state.currentRound !== null);
    await beto.waitFor(() => Game.state.gameStarted === true && Game.state.gameOver === false);
});

test('E13 Criar sala com código em uso: "já está em uso" em até 3s; código livre é aceito', async ({ players }) => {
    const code = roomCode();
    const ana = await players.add('Ana');
    const beto = await players.add('Beto');
    const caio = await players.add('Caio');
    await startMatch(ana, [beto], code);

    // Sala aberta: o ID base está ocupado pelo host.
    const openRoom = await caio.createRoomFromHomeScreen(code);
    expect(openRoom.created, 'não deveria criar sala com o código de uma sala aberta').toBe(false);
    expect(openRoom.warning).toContain('já está em uso');
    expect(openRoom.seconds, 'a resposta deveria vir em até 3s (levou ' + openRoom.seconds + 's)').toBeLessThan(3);
    expect(await beto.isConnectedToHost(), 'a tentativa não deveria derrubar quem está na sala').toBe(true);
    expect(await ana.isRoomHost(), 'Ana continua host da sala').toBe(true);

    // Código livre: chega à tela "Sala criada" (a checagem não recusa tudo).
    const freeRoom = await caio.createRoomFromHomeScreen(roomCode());
    expect(freeRoom.created, 'código livre deveria ser aceito: ' + freeRoom.warning).toBe(true);
});

test('E16 Sala cheia: o 7º nome é recusado no lobby; com 6 na partida, quem cai volta ao lugar', async ({ players }) => {
    const code = roomCode();
    const names = ['Ana', 'Beto', 'Caio', 'Davi', 'Eva', 'Fabi'];
    const six = [];
    for (const name of names) six.push(await players.add(name));
    const [ana, ...guests] = six;

    await ana.openGame(code, { host: true });
    for (const g of guests) await g.openGame(code, { host: false });
    await ana.waitFor(() => Game.state.players.length === 6);

    // 7º nome no lobby: recusado com o aviso de sala cheia.
    const gil = await players.add('Gil');
    await gil.tryJoinFromHomeScreen(code);
    await expect.poll(() => gil.logs.some(l => l.includes('Sala cheia')), { timeout: 25000, message: 'Gil deveria ver o aviso de sala cheia' }).toBe(true);
    expect(await ana.state(() => Game.state.players.map(p => p.name)), 'Gil não deveria entrar na lista').not.toContain('Gil');
    expect(await ana.state(() => Game.state.players.length)).toBe(6);

    await ana.click('#btnStartGame');
    for (const p of six) await p.waitFor(() => Game.state.gameStarted === true);

    // Com a sala lotada, um jogador cai e volta pelo mesmo link.
    const caio = guests[1];
    const before = await ana.state(() => Game.state.players.find(p => p.name === 'Caio'));
    const caioLink = await caio.closeTab();
    await ana.waitFor(() => Game.state.players.find(p => p.name === 'Caio').disconnected === true, { timeout: DROP_WAIT });
    await caio.reopen(caioLink);
    await expect.poll(() => caio.isConnectedToHost(), { timeout: 25000, message: 'Caio deveria voltar ligado ao host' }).toBe(true);
    await ana.waitFor(() => {
        const c = Game.state.players.find(p => p.name === 'Caio');
        return c && c.disconnected === false;
    }, { timeout: 25000 });
    const after = await ana.state(() => Game.state.players.find(p => p.name === 'Caio'));
    expect(after.kpi, 'Caio volta com o KPI dele').toBe(before.kpi);
    expect(await ana.state(() => Game.state.players.length), 'a lista continua com 6').toBe(6);
    expect(await ana.state(() => Game.state.players.filter(p => p.disconnected).length), 'todos conectados de novo').toBe(0);
});

test('E27 Outro navegador com o nome de quem caiu é recusado e a vaga continua reservada; o dono volta ao lugar pelo mesmo navegador', async ({ players }) => {
    const code = roomCode();
    const ana = await players.add('Ana');
    const beto = await players.add('Beto');
    const caio = await players.add('Caio');
    await startMatch(ana, [beto, caio], code);
    const betoInList = () => ana.state(() => Game.state.players.find(p => p.name === 'Beto'));
    const before = await betoInList();

    // Beto fecha a aba: fica na lista, desconectado.
    const betoLink = await beto.closeTab();
    await ana.waitFor(() => Game.state.players.find(p => p.name === 'Beto').disconnected === true, { timeout: DROP_WAIT });

    // Outro navegador entra pela tela inicial com o nome do Beto: recusado.
    const other = await players.add('Beto');
    await other.tryJoinFromHomeScreen(code);
    await expect.poll(() => other.logs.some(l => l.includes('pertence a um jogador desta partida')),
        { timeout: 25000, message: 'o outro navegador deveria ver o aviso de que o nome é de um jogador da partida' }).toBe(true);
    const reserved = await betoInList();
    expect(reserved.disconnected, 'a vaga do Beto continua reservada').toBe(true);
    expect(reserved.peerId, 'o lugar continua do aparelho do Beto').toBe(before.peerId);
    expect(await ana.state(() => Game.state.players.length), 'ninguém entra no lugar dele').toBe(3);

    // O Beto de verdade volta pelo mesmo link, no mesmo navegador.
    await beto.reopen(betoLink);
    await expect.poll(() => beto.isConnectedToHost(), { timeout: 25000, message: 'Beto deveria voltar ligado ao host' }).toBe(true);
    await ana.waitFor(() => Game.state.players.find(p => p.name === 'Beto').disconnected === false, { timeout: 25000 });
    const back = await betoInList();
    expect(back.kpi, 'Beto volta com o KPI dele').toBe(before.kpi);
    expect(back.resources, 'Beto volta com os recursos dele').toBe(before.resources);
});

test('E30 Quem responde dá F5 no meio da pergunta: ninguém cai, a mesma pergunta continua (mesma dupla e prazo) e a resposta dele vale', async ({ players }) => {
    const code = roomCode();
    const ana = await players.add('Ana');
    const beto = await players.add('Beto');
    await startMatch(ana, [beto], code);
    await waitForOpenQuestion(ana, [ana, beto], [beto]);
    const roundNow = () => ana.state(() => {
        const r = Game.state.currentRound;
        return r && { question: r.question && r.question.question, asker: r.asker, answerer: r.answerer, answerEndsAt: r.answerEndsAt, answered: r.answered };
    });
    const before = await roundNow();
    expect(before.answerer, 'pré-condição: Beto responde').toBe('Beto');

    await beto.page.reload();
    await expect.poll(() => beto.isConnectedToHost(), { timeout: 25000, message: 'Beto deveria voltar ligado ao host' }).toBe(true);
    await expect.poll(() => beto.hasOpenQuestion(), { timeout: 15000, message: 'Beto deveria ver a pergunta aberta de novo' }).toBe(true);

    expect(await roundNow(), 'no host, a mesma pergunta deveria continuar, com a mesma dupla e o mesmo prazo').toEqual(before);
    expect(await beto.state(() => Game.state.currentRound.question.question), 'Beto deveria ver a mesma pergunta').toBe(before.question);
    expect(await ana.state(() => Game.state.players.find(p => p.name === 'Beto').disconnected), 'Beto não deveria ter caído').toBe(false);
    expect(await ana.state(() => !!Game.state.matchPaused), 'a partida não deveria ter pausado').toBe(false);

    await beto.answerIfMyTurn();
    await ana.waitFor(() => Game.state.answeredThisRound.includes('Beto'), { timeout: 10000 });
});

test('E19 Pedido de ajuda com 3 jogadores: quem está sem recursos pede ajuda na vez de responder, segue a sugestão certa e quem ajudou ganha a recompensa do patrocinador', async ({ players }) => {
    const code = roomCode();
    const ana = await players.add('Ana');
    const beto = await players.add('Beto');
    const caio = await players.add('Caio');
    await startMatch(ana, [beto, caio], code);

    // Quando a pergunta abre para o Beto, o host zera os recursos dele (avisa a todos) e a tela é montada de novo.
    await waitForOpenQuestion(ana, [ana, beto, caio], [beto]);
    await ana.state(() => {
        Game.state.players.find(p => p.name === 'Beto').resources = 0;
        Game.network.broadcastAll({ type: 'player-list', players: Game.state.players });
    });
    await beto.waitFor(() => Game.getPlayerByName('Beto').resources === 0);
    await beto.state(() => Game.ui.displayQuestion(Game.state.currentRound.question));
    await expect(beto.page.locator('#btnRequestAdvisory'), 'com 0 recursos, o botão deveria ser o de pedir ajuda').toHaveText(/Pedir Ajuda/);

    // Quem pode ajudar é quem não está na dupla.
    const asker = await ana.state(() => Game.state.currentRound.asker);
    const helper = asker === 'Ana' ? caio : ana;
    const helperBefore = await ana.state((name) => Game.getPlayerByName(name).resources, helper.name);
    const correct = await ana.state(() => Game.state.currentRound.question.correct);

    await beto.click('#btnRequestAdvisory');
    await beto.page.click('#advisoryPlayersList .advisor-select-btn[data-advisor-name="' + helper.name + '"]', { timeout: 10000 });
    await ana.waitFor(() => !!Game.state.currentRound.advisory && Game.state.currentRound.advisory.kind === 'help' &&
        Game.state.currentRound.advisory.status === 'pending');

    // Quem ajuda recebe o convite de ajuda e sugere a alternativa certa.
    await expect(helper.page.locator('#modalAdvisoryQuestion'), helper.name + ' deveria receber o pedido de ajuda').toBeVisible({ timeout: 10000 });
    await expect(helper.page.locator('#modalAdvisoryQuestion')).toContainText('Pedido de Ajuda');
    await helper.click('#advisoryAlternativesList button:nth-child(' + (['a', 'b', 'c', 'd'].indexOf(correct) + 1) + ')');

    // Beto vê a sugestão e a segue.
    await beto.waitFor(() => Game.state.currentRound.advisory && Game.state.currentRound.advisory.status === 'accepted');
    await beto.click('#alternativesGrid .alternative-btn[data-alt="' + correct + '"]');

    // Beto acerta sem mexer nos recursos; quem ajudou ganha a recompensa e vê o aviso.
    await ana.waitFor(() => Game.state.answeredThisRound.includes('Beto'), { timeout: 10000 });
    const reward = await ana.state(() => CONFIG.RESOURCES.HELP_REWARD);
    expect(await ana.state(() => Game.getPlayerByName('Beto').resources), 'Beto deveria continuar com 0 recursos').toBe(0);
    expect(await ana.state((name) => Game.getPlayerByName(name).resources, helper.name),
        helper.name + ' deveria ganhar a recompensa do patrocinador').toBe(helperBefore + reward);
    await expect(helper.page.locator('#modalResult'), helper.name + ' deveria ver o aviso da recompensa').toBeVisible({ timeout: 10000 });
    await expect(helper.page.locator('#resultMessage')).toContainText('patrocinador');
    await expect(beto.page.locator('#resultMessage'), 'Beto deveria ver quem ajudou').toContainText(helper.name);
});
