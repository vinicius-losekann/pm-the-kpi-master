// ============================================
// PM: The KPI Master - Testes no navegador: troca de host
// ============================================
// Checklist: _docs/testes-conexao.md (M3, M4, M11, M12, M19).
// ============================================

const { test, expect, roomCode, roomId, startMatch, answerUntilRoundEnds, waitForNewHost } = require('./players');

test('E2 Host fecha a aba: outro assume em cerca de 10s; F5 do novo host continua host', async ({ players }) => {
    const codigo = roomCode();
    const sala = roomId(codigo);
    const ana = await players.add('Ana');
    const beto = await players.add('Beto');
    await startMatch(ana, [beto], codigo);

    const inicio = Date.now();
    await ana.closeTab();
    await beto.waitFor(() => Game.state.isHost === true && Game.state.peerId === Game.state.hostPeerId, { timeout: 25000 });
    const segundos = (Date.now() - inicio) / 1000;
    expect(segundos, 'deveria esperar o prazo de 10s antes de assumir').toBeGreaterThan(7);
    expect(segundos, 'deveria assumir logo depois do prazo').toBeLessThan(20);

    expect(await beto.state(() => Game.state.hostPeerId)).toBe(sala + '-h1');
    const url = new URL(beto.page.url());
    expect(url.searchParams.get('host'), 'a URL de quem assumiu deveria dizer host=true').toBe('true');
    expect(url.searchParams.get('peerId'), 'o peerId da URL continua o ID base').toBe(sala);
    const anaNaLista = await beto.state(() => Game.state.players.find(p => p.name === 'Ana'));
    expect(anaNaLista.isHost).toBe(false);
    expect(anaNaLista.disconnected).toBe(true);

    // F5 do novo host: continua host na sala nova.
    await beto.page.reload();
    await beto.waitFor((id) => Game.state.isHost === true && Game.state.peerId === id && Game.state.gameStarted === true,
        { arg: sala + '-h1', timeout: 25000 });
});

test('E5 Troca de host com a rodada encerrada: continua encerrada; o host antigo volta pelo link antigo como jogador comum', async ({ players }) => {
    const codigo = roomCode();
    const sala = roomId(codigo);
    const ana = await players.add('Ana');
    const beto = await players.add('Beto');
    await startMatch(ana, [beto], codigo);

    await answerUntilRoundEnds(ana, [ana, beto]);
    await beto.waitFor(() => Game.state.rodadaEncerrada === true);

    const linkAntigo = await ana.closeTab();
    await beto.waitFor(() => Game.state.isHost === true && Game.state.peerId === Game.state.hostPeerId, { timeout: 25000 });
    expect(await beto.state(() => Game.state.rodadaEncerrada), 'a rodada deveria continuar encerrada').toBe(true);
    expect(await beto.state(() => Game.state.currentRound)).toBeNull();
    expect(await beto.state(() => Game.state.partidaPausada)).toBeFalsy();
    await expect(beto.page.locator('#spectatorMessage')).toBeVisible();
    await expect(beto.page.locator('#btnNovaRodada'), 'o "Nova Rodada" deveria estar liberado').toBeEnabled();

    // O host antigo reabre o link antigo da partida (mesmo navegador).
    await ana.reopen(linkAntigo);
    await ana.waitFor((id) => Game.state.isHost === false && Game.state.hostPeerId === id &&
        Game.network.connectionState.getConnection(id) && Game.network.connectionState.getConnection(id).open,
        { arg: sala + '-h1', timeout: 25000 });
    expect(new URL(ana.page.url()).searchParams.get('host'), 'a URL do host antigo deveria passar a host=false').toBe('false');
    await beto.waitFor(() => {
        const a = Game.state.players.find(p => p.name === 'Ana');
        return a && a.disconnected === false && a.isHost === false;
    });
    expect(await ana.state(() => Game.state.rodadaEncerrada), 'quem volta deveria ver "rodada encerrada"').toBe(true);

    // Nada começa sozinho.
    await beto.page.waitForTimeout(5000);
    expect(await beto.state(() => Game.state.currentRound), 'nenhuma dupla deveria começar sem o "Nova Rodada"').toBeNull();

    // O novo host clica em "Nova Rodada": a rodada começa para os dois.
    await beto.click('#btnNovaRodada');
    await beto.waitFor(() => Game.state.currentRound !== null && Game.state.rodadaEncerrada === false);
    await ana.waitFor(() => Game.state.currentRound !== null && Game.state.rodadaEncerrada === false);
});

test('E14 Troca de host no lobby: outro assume, os demais voltam como jogadores novos e o host antigo não abre outra sala', async ({ players }) => {
    const codigo = roomCode();
    const sala = roomId(codigo);
    const ana = await players.add('Ana');
    const beto = await players.add('Beto');
    const caio = await players.add('Caio');
    await ana.openGame(codigo, { host: true });
    await beto.openGame(codigo, { host: false });
    await caio.openGame(codigo, { host: false });
    await ana.waitFor(() => Game.state.players.length === 3);

    // Ana fecha a aba antes de iniciar.
    const linkDaAna = await ana.closeTab();
    const novoHost = await waitForNewHost([beto, caio]);
    const outro = novoHost === beto ? caio : beto;
    expect(await novoHost.state(() => Game.state.hostPeerId)).toBe(sala + '-h1');
    expect(await novoHost.state(() => Game.state.gameStarted), 'continua no lobby').toBe(false);

    // O outro acha a sala nova e entra como jogador novo.
    await expect.poll(() => outro.isConnectedTo(sala + '-h1'), { timeout: 40000, message: outro.nome + ' deveria achar o novo host' }).toBe(true);
    await novoHost.waitFor((nome) => Game.state.players.some(p => p.name === nome), { arg: outro.nome });
    expect((await novoHost.state(() => Game.state.players.map(p => p.name))).sort(),
        'no lobby, a troca de host tira da lista quem não voltou').toEqual([beto.nome, caio.nome].sort());

    // Ana reabre o link antigo (host=true): volta como jogadora comum, sem abrir outra sala.
    await ana.reopen(linkDaAna);
    await ana.waitFor((id) => Game.state.isHost === false && Game.state.hostPeerId === id &&
        Game.network.connectionState.getConnection(id) && Game.network.connectionState.getConnection(id).open,
    { arg: sala + '-h1', timeout: 25000 });
    expect(new URL(ana.page.url()).searchParams.get('host'), 'a URL da Ana deveria passar a host=false').toBe('false');
    await novoHost.waitFor(() => Game.state.players.length === 3);
    expect(await novoHost.state(() => Game.state.players.filter(p => p.isHost).map(p => p.name))).toEqual([novoHost.nome]);

    // O novo host inicia a partida com os três.
    await expect(novoHost.page.locator('#btnStartGame'), 'o "Iniciar" deveria estar liberado').toBeEnabled();
    await novoHost.click('#btnStartGame');
    for (const j of [ana, beto, caio]) await j.waitFor(() => Game.state.gameStarted === true);
});

test('E15 Duas trocas de host seguidas: a sala vai para -h2; quem volta pela tela inicial ou pelo link antigo acha a sala', async ({ players }) => {
    const codigo = roomCode();
    const sala = roomId(codigo);
    const ana = await players.add('Ana');
    const beto = await players.add('Beto');
    const caio = await players.add('Caio');
    await startMatch(ana, [beto, caio], codigo);
    const kpiDaAna = await ana.state(() => Game.state.players.find(p => p.name === 'Ana').kpi);

    // 1ª troca: Ana sai, um assume em -h1 e o outro o acha.
    await ana.closeTab();
    const primeiro = await waitForNewHost([beto, caio]);
    const segundo = primeiro === beto ? caio : beto;
    expect(await primeiro.state(() => Game.state.hostPeerId)).toBe(sala + '-h1');
    await expect.poll(() => segundo.isConnectedTo(sala + '-h1'), { timeout: 40000, message: segundo.nome + ' deveria achar o host em -h1' }).toBe(true);
    await primeiro.waitFor((nome) => {
        const s = Game.state.players.find(p => p.name === nome);
        return s && s.disconnected === false;
    }, { arg: segundo.nome });

    // 2ª troca: quem assumiu também sai; o que sobrou assume em -h2 (Ana, desconectada, é pulada).
    const linkDoPrimeiro = await primeiro.closeTab();
    await segundo.waitFor((id) => Game.state.isHost === true && Game.state.peerId === id,
        { arg: sala + '-h2', timeout: 25000 });
    expect(await segundo.state(() => Game.state.hostVersion)).toBe(2);

    // Ana entra pela tela inicial digitando o código: acha a sala em -h2.
    await ana.joinFromHomeScreen(codigo);
    await expect.poll(() => ana.isConnectedTo(sala + '-h2'), { timeout: 25000, message: 'Ana deveria achar a sala em -h2' }).toBe(true);
    await segundo.waitFor(() => {
        const a = Game.state.players.find(p => p.name === 'Ana');
        return a && a.disconnected === false && a.isHost === false;
    });
    expect(await segundo.state(() => Game.state.players.find(p => p.name === 'Ana').kpi), 'Ana volta com o KPI dela').toBe(kpiDaAna);

    // Quem foi host em -h1 reabre o link dele (host=true): volta como jogador comum em -h2.
    await primeiro.reopen(linkDoPrimeiro);
    await primeiro.waitFor((id) => Game.state.isHost === false && Game.state.hostPeerId === id &&
        Game.network.connectionState.getConnection(id) && Game.network.connectionState.getConnection(id).open,
    { arg: sala + '-h2', timeout: 25000 });
    expect(new URL(primeiro.page.url()).searchParams.get('host')).toBe('false');
    await segundo.waitFor(() => Game.state.players.every(p => p.disconnected === false));
    expect(await segundo.state(() => Game.state.players.filter(p => p.isHost).map(p => p.name))).toEqual([segundo.nome]);

    // A partida segue (tinha pausado quando o novo host ficou sozinho).
    await segundo.waitFor(() => !Game.state.partidaPausada && (Game.state.currentRound !== null || Game.state.rodadaEncerrada === true));
});