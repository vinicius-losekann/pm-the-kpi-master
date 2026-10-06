// ============================================
// PM: The KPI Master - Testes no navegador: quedas, voltas e nova partida
// ============================================
// Checklist: _docs/connection-tests.md (M1, M5, M6, M10, M14, M15, M20 e
// a volta do host antigo pela tela inicial).
// ============================================

const {
    test, expect, roomCode, roomId, startMatch, answerUntilRoundEnds,
    waitForOpenQuestion, waitForNewHost
} = require('./players');

test('E1 F5 do host no meio da question: o outro reconecta ao mesmo host, sem troca, e a partida segue', async ({ players }) => {
    const code = roomCode();
    const room = roomId(code);
    const ana = await players.add('Ana');
    const beto = await players.add('Beto');
    await startMatch(ana, [beto], code);
    await waitForOpenQuestion(ana, [ana, beto], [ana, beto]);

    await ana.page.reload();
    await ana.waitFor((id) => Game.state.isHost === true && Game.state.peerId === id && Game.state.gameStarted === true,
        { arg: room, timeout: 25000 });
    await beto.waitFor((id) => {
        const c = Game.network.connectionState.getConnection(id);
        return Game.state.isHost === false && Game.state.hostPeerId === id && !!c && c.open === true;
    }, { arg: room, timeout: 25000 });
    await ana.waitFor(() => {
        const b = Game.state.players.find(p => p.name === 'Beto');
        return b && b.disconnected === false;
    });
    expect(await beto.state(() => Game.state.hostVersion), 'não deveria ter havido troca de host').toBe(0);

    // A partida continua: a rodada vai até o fim.
    await answerUntilRoundEnds(ana, [ana, beto]);
});

test('E3 Host antigo volta pela tela inicial digitando o código: entra como jogador comum', async ({ players }) => {
    const code = roomCode();
    const room = roomId(code);
    const ana = await players.add('Ana');
    const beto = await players.add('Beto');
    await startMatch(ana, [beto], code);
    const anaKpi = await ana.state(() => Game.state.players.find(p => p.name === 'Ana').kpi);

    await ana.closeTab();
    await waitForNewHost([beto]);

    await ana.joinFromHomeScreen(code);
    await expect.poll(() => ana.isConnectedTo(room + '-h1'), { timeout: 25000, message: 'Ana deveria achar a sala em -h1' }).toBe(true);
    await beto.waitFor(() => {
        const a = Game.state.players.find(p => p.name === 'Ana');
        return a && a.disconnected === false && a.isHost === false;
    });
    expect(await beto.state(() => Game.state.players.find(p => p.name === 'Ana').kpi), 'Ana volta com o KPI dela').toBe(anaKpi);
    expect(await beto.state(() => Game.state.players.filter(p => p.isHost).map(p => p.name))).toEqual(['Beto']);
});

test('E4 Três jogadores, host sai no meio da question: o terceiro acha o novo host; ninguém responde duas vezes nem perde a vez', async ({ players }) => {
    const code = roomCode();
    const room = roomId(code);
    const ana = await players.add('Ana');
    const beto = await players.add('Beto');
    const caio = await players.add('Caio');
    await startMatch(ana, [beto, caio], code);

    // Pergunta aberta para um dos guests, com alguém já tendo respondido
    // nesta rodada (é o que o novo host precisa saber para não repetir).
    let answerer = null;
    let alreadyAnswered = [];
    for (let i = 0; i < 6 && !answerer; i++) {
        const r = await waitForOpenQuestion(ana, [ana, beto, caio], [beto, caio]);
        const list = await r.state(() => Game.state.answeredThisRound.slice());
        if (list.length > 0) {
            answerer = r;
            alreadyAnswered = list;
        } else {
            await r.answerIfMyTurn();
            await expect(r.page.locator('#modalAnswerQuestion')).toBeHidden();
        }
    }
    expect(answerer, 'os guests deveriam saber quem já respondeu nesta rodada (lista vazia depois de outras respostas)').not.toBeNull();
    expect(alreadyAnswered, 'pré-condição: quem está com a pergunta aberta ainda não respondeu').not.toContain(answerer.name);

    await ana.closeTab();
    const newHost = await waitForNewHost([beto, caio]);
    const other = newHost === beto ? caio : beto;

    await expect.poll(() => other.isConnectedTo(room + '-h1'), { timeout: 40000, message: other.name + ' deveria achar o novo host' }).toBe(true);
    await newHost.waitFor((name) => {
        const o = Game.state.players.find(p => p.name === name);
        return o && o.disconnected === false;
    }, { arg: other.name });

    await answerUntilRoundEnds(newHost, [beto, caio]);
    const answered = await newHost.state(() => Game.state.answeredThisRound.slice());
    expect(new Set(answered).size, 'ninguém pode responder duas vezes na mesma rodada: ' + answered.join(', ')).toBe(answered.length);
    expect(answered, answerer.name + ' não pode perder a vez').toContain(answerer.name);
    for (const name of alreadyAnswered) expect(answered).toContain(name);
    expect(answered).toEqual(expect.arrayContaining(['Beto', 'Caio']));
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

    // F5 do Beto.
    const oldPeerId = await ana.state(() => Game.state.players.find(p => p.name === 'Beto').peerId);
    await beto.page.reload();
    await ana.waitFor((old) => {
        const b = Game.state.players.find(p => p.name === 'Beto');
        return b && b.disconnected === false && b.peerId !== old;
    }, { arg: oldPeerId, timeout: 25000 });

    // Caio fecha a aba e volta pela tela inicial (mesmo navegador = mesmo token).
    await caio.closeTab();
    await expect.poll(() => isConnected('Caio'), { message: 'a queda do Caio deveria ser percebida' }).toBe(false);
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

test('E13 Criar sala com código em uso (sala aberta e sala migrada): "já está em uso" em até 3s; código livre é aceito', async ({ players }) => {
    const code = roomCode();
    const room = roomId(code);
    const ana = await players.add('Ana');
    const beto = await players.add('Beto');
    const caio = await players.add('Caio');
    await startMatch(ana, [beto], code);

    // Sala aberta: o ID base está ocupado pelo host.
    const openRoom = await caio.createRoomFromHomeScreen(code);
    expect(openRoom.created, 'não deveria criar sala com o código de uma sala aberta').toBe(false);
    expect(openRoom.warning).toContain('já está em uso');
    expect(openRoom.seconds, 'a resposta deveria vir em até 3s (levou ' + openRoom.seconds + 's)').toBeLessThan(3);
    expect(await beto.isConnectedTo(room), 'a tentativa não deveria derrubar quem está na sala').toBe(true);
    expect(await ana.state(() => Game.state.isHost === true && Game.state.peerId === Game.state.hostPeerId)).toBe(true);

    // Código livre: chega à tela "Sala criada" (a checagem não recusa tudo).
    const freeRoom = await caio.createRoomFromHomeScreen(roomCode());
    expect(freeRoom.created, 'código livre deveria ser aceito: ' + freeRoom.warning).toBe(true);

    // Sala migrada: o ID base ficou livre, mas a partida continua em -h1.
    await ana.closeTab();
    await waitForNewHost([beto]);
    expect(await beto.state(() => Game.state.hostPeerId)).toBe(room + '-h1');
    const migratedRoom = await caio.createRoomFromHomeScreen(code);
    expect(migratedRoom.created, 'não deveria criar sala com o código de uma partida que continua em -h1').toBe(false);
    expect(migratedRoom.warning).toContain('já está em uso');
    expect(migratedRoom.seconds, 'a resposta deveria vir em até 3s (levou ' + migratedRoom.seconds + 's)').toBeLessThan(3);
    expect(await beto.state(() => Game.state.isHost === true && Game.state.peerId === Game.state.hostPeerId),
        'o novo host continua host').toBe(true);
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
    await ana.waitFor(() => Game.state.players.find(p => p.name === 'Caio').disconnected === true);
    await caio.reopen(caioLink);
    await ana.waitFor((old) => {
        const c = Game.state.players.find(p => p.name === 'Caio');
        return c && c.disconnected === false && c.peerId !== old;
    }, { arg: before.peerId, timeout: 25000 });
    const after = await ana.state(() => Game.state.players.find(p => p.name === 'Caio'));
    expect(after.kpi, 'Caio volta com o KPI dele').toBe(before.kpi);
    expect(await ana.state(() => Game.state.players.length), 'a lista continua com 6').toBe(6);
    expect(await ana.state(() => Game.state.players.filter(p => p.disconnected).length), 'todos conectados de novo').toBe(0);
});