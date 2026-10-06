// ============================================
// PM: The KPI Master - Testes no navegador: troca de host
// ============================================
// Checklist: _docs/connection-tests.md (M3, M4, M11, M12, M19).
// ============================================

const { test, expect, roomCode, roomId, startMatch, answerUntilRoundEnds, waitForNewHost } = require('./players');

test('E2 Host fecha a aba: outro assume em cerca de 10s; F5 do novo host continua host', async ({ players }) => {
    const code = roomCode();
    const room = roomId(code);
    const ana = await players.add('Ana');
    const beto = await players.add('Beto');
    await startMatch(ana, [beto], code);

    const start = Date.now();
    await ana.closeTab();
    await beto.waitFor(() => Game.state.isHost === true && Game.state.peerId === Game.state.hostPeerId, { timeout: 25000 });
    const seconds = (Date.now() - start) / 1000;
    expect(seconds, 'deveria esperar o prazo de 10s antes de assumir').toBeGreaterThan(7);
    expect(seconds, 'deveria assumir logo depois do prazo').toBeLessThan(20);

    expect(await beto.state(() => Game.state.hostPeerId)).toBe(room + '-h1');
    const url = new URL(beto.page.url());
    expect(url.searchParams.get('host'), 'a URL de quem assumiu deveria dizer host=true').toBe('true');
    expect(url.searchParams.get('peerId'), 'o peerId da URL continua o ID base').toBe(room);
    const anaInList = await beto.state(() => Game.state.players.find(p => p.name === 'Ana'));
    expect(anaInList.isHost).toBe(false);
    expect(anaInList.disconnected).toBe(true);

    // F5 do novo host: continua host na sala nova.
    await beto.page.reload();
    await beto.waitFor((id) => Game.state.isHost === true && Game.state.peerId === id && Game.state.gameStarted === true,
        { arg: room + '-h1', timeout: 25000 });
});

test('E5 Troca de host com a rodada encerrada: continua encerrada; o host antigo volta pelo link antigo como jogador comum', async ({ players }) => {
    const code = roomCode();
    const room = roomId(code);
    const ana = await players.add('Ana');
    const beto = await players.add('Beto');
    await startMatch(ana, [beto], code);

    await answerUntilRoundEnds(ana, [ana, beto]);
    await beto.waitFor(() => Game.state.roundEnded === true);

    const oldLink = await ana.closeTab();
    await beto.waitFor(() => Game.state.isHost === true && Game.state.peerId === Game.state.hostPeerId, { timeout: 25000 });
    expect(await beto.state(() => Game.state.roundEnded), 'a rodada deveria continuar encerrada').toBe(true);
    expect(await beto.state(() => Game.state.currentRound)).toBeNull();
    expect(await beto.state(() => Game.state.matchPaused)).toBeFalsy();
    await expect(beto.page.locator('#spectatorMessage')).toBeVisible();
    await expect(beto.page.locator('#btnNewRound'), 'o "Nova Rodada" deveria estar liberado').toBeEnabled();

    // O host antigo reabre o link antigo da partida (mesmo navegador).
    await ana.reopen(oldLink);
    await ana.waitFor((id) => Game.state.isHost === false && Game.state.hostPeerId === id &&
        Game.network.connectionState.getConnection(id) && Game.network.connectionState.getConnection(id).open,
        { arg: room + '-h1', timeout: 25000 });
    expect(new URL(ana.page.url()).searchParams.get('host'), 'a URL do host antigo deveria passar a host=false').toBe('false');
    await beto.waitFor(() => {
        const a = Game.state.players.find(p => p.name === 'Ana');
        return a && a.disconnected === false && a.isHost === false;
    });
    expect(await ana.state(() => Game.state.roundEnded), 'quem volta deveria ver "rodada encerrada"').toBe(true);

    // Nada começa sozinho.
    await beto.page.waitForTimeout(5000);
    expect(await beto.state(() => Game.state.currentRound), 'nenhuma dupla deveria começar sem o "Nova Rodada"').toBeNull();

    // O novo host clica em "Nova Rodada": a rodada começa para os dois.
    await beto.click('#btnNewRound');
    await beto.waitFor(() => Game.state.currentRound !== null && Game.state.roundEnded === false);
    await ana.waitFor(() => Game.state.currentRound !== null && Game.state.roundEnded === false);
});

test('E14 Troca de host no lobby: outro assume, os demais voltam como jogadores novos e o host antigo não abre outra sala', async ({ players }) => {
    const code = roomCode();
    const room = roomId(code);
    const ana = await players.add('Ana');
    const beto = await players.add('Beto');
    const caio = await players.add('Caio');
    await ana.openGame(code, { host: true });
    await beto.openGame(code, { host: false });
    await caio.openGame(code, { host: false });
    await ana.waitFor(() => Game.state.players.length === 3);

    // Ana fecha a aba antes de iniciar.
    const anaLink = await ana.closeTab();
    const newHost = await waitForNewHost([beto, caio]);
    const other = newHost === beto ? caio : beto;
    expect(await newHost.state(() => Game.state.hostPeerId)).toBe(room + '-h1');
    expect(await newHost.state(() => Game.state.gameStarted), 'continua no lobby').toBe(false);

    // O outro acha a sala nova e entra como jogador novo.
    await expect.poll(() => other.isConnectedTo(room + '-h1'), { timeout: 40000, message: other.name + ' deveria achar o novo host' }).toBe(true);
    await newHost.waitFor((name) => Game.state.players.some(p => p.name === name), { arg: other.name });
    expect((await newHost.state(() => Game.state.players.map(p => p.name))).sort(),
        'no lobby, a troca de host tira da lista quem não voltou').toEqual([beto.name, caio.name].sort());

    // Ana reabre o link antigo (host=true): volta como jogadora comum, sem abrir outra sala.
    await ana.reopen(anaLink);
    await ana.waitFor((id) => Game.state.isHost === false && Game.state.hostPeerId === id &&
        Game.network.connectionState.getConnection(id) && Game.network.connectionState.getConnection(id).open,
    { arg: room + '-h1', timeout: 25000 });
    expect(new URL(ana.page.url()).searchParams.get('host'), 'a URL da Ana deveria passar a host=false').toBe('false');
    await newHost.waitFor(() => Game.state.players.length === 3);
    expect(await newHost.state(() => Game.state.players.filter(p => p.isHost).map(p => p.name))).toEqual([newHost.name]);

    // O novo host inicia a partida com os três.
    await expect(newHost.page.locator('#btnStartGame'), 'o "Iniciar" deveria estar liberado').toBeEnabled();
    await newHost.click('#btnStartGame');
    for (const p of [ana, beto, caio]) await p.waitFor(() => Game.state.gameStarted === true);
});

test('E15 Duas trocas de host seguidas: a sala vai para -h2; quem volta pela tela inicial ou pelo link antigo acha a sala', async ({ players }) => {
    const code = roomCode();
    const room = roomId(code);
    const ana = await players.add('Ana');
    const beto = await players.add('Beto');
    const caio = await players.add('Caio');
    await startMatch(ana, [beto, caio], code);
    const anaKpi = await ana.state(() => Game.state.players.find(p => p.name === 'Ana').kpi);

    // 1ª troca: Ana sai, um assume em -h1 e o outro o acha.
    await ana.closeTab();
    const first = await waitForNewHost([beto, caio]);
    const second = first === beto ? caio : beto;
    expect(await first.state(() => Game.state.hostPeerId)).toBe(room + '-h1');
    await expect.poll(() => second.isConnectedTo(room + '-h1'), { timeout: 40000, message: second.name + ' deveria achar o host em -h1' }).toBe(true);
    await first.waitFor((name) => {
        const s = Game.state.players.find(p => p.name === name);
        return s && s.disconnected === false;
    }, { arg: second.name });

    // 2ª troca: quem assumiu também sai; o que sobrou assume em -h2 (Ana, desconectada, é pulada).
    const firstLink = await first.closeTab();
    await second.waitFor((id) => Game.state.isHost === true && Game.state.peerId === id,
        { arg: room + '-h2', timeout: 25000 });
    expect(await second.state(() => Game.state.hostVersion)).toBe(2);

    // Ana entra pela tela inicial digitando o código: acha a sala em -h2.
    await ana.joinFromHomeScreen(code);
    await expect.poll(() => ana.isConnectedTo(room + '-h2'), { timeout: 25000, message: 'Ana deveria achar a sala em -h2' }).toBe(true);
    await second.waitFor(() => {
        const a = Game.state.players.find(p => p.name === 'Ana');
        return a && a.disconnected === false && a.isHost === false;
    });
    expect(await second.state(() => Game.state.players.find(p => p.name === 'Ana').kpi), 'Ana volta com o KPI dela').toBe(anaKpi);

    // Quem foi host em -h1 reabre o link dele (host=true): volta como jogador comum em -h2.
    await first.reopen(firstLink);
    await first.waitFor((id) => Game.state.isHost === false && Game.state.hostPeerId === id &&
        Game.network.connectionState.getConnection(id) && Game.network.connectionState.getConnection(id).open,
    { arg: room + '-h2', timeout: 25000 });
    expect(new URL(first.page.url()).searchParams.get('host')).toBe('false');
    await second.waitFor(() => Game.state.players.every(p => p.disconnected === false));
    expect(await second.state(() => Game.state.players.filter(p => p.isHost).map(p => p.name))).toEqual([second.name]);

    // A partida segue (tinha pausado quando o novo host ficou sozinho).
    await second.waitFor(() => !Game.state.matchPaused && (Game.state.currentRound !== null || Game.state.roundEnded === true));
});