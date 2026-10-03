// ============================================
// PM: The KPI Master - Ponta a ponta: troca de host
// ============================================
// Checklist: _docs/testes-conexao.md (M3, M4, M11, M12, M19).
// ============================================

const { test, expect, codigoDeSala, idDaSala, iniciarPartida, responderAteEncerrarRodada, esperarNovoHost } = require('./apoio');

test('E2 Host fecha a aba: outro assume em cerca de 10s; F5 do novo host continua host', async ({ jogadores }) => {
    const codigo = codigoDeSala();
    const sala = idDaSala(codigo);
    const ana = await jogadores.novo('Ana');
    const beto = await jogadores.novo('Beto');
    await iniciarPartida(ana, [beto], codigo);

    const inicio = Date.now();
    await ana.fecharAba();
    await beto.esperar(() => Game.state.isHost === true && Game.state.peerId === Game.state.hostPeerId, { timeout: 25000 });
    const segundos = (Date.now() - inicio) / 1000;
    expect(segundos, 'deveria esperar o prazo de 10s antes de assumir').toBeGreaterThan(7);
    expect(segundos, 'deveria assumir logo depois do prazo').toBeLessThan(20);

    expect(await beto.estado(() => Game.state.hostPeerId)).toBe(sala + '-h1');
    const url = new URL(beto.page.url());
    expect(url.searchParams.get('host'), 'a URL de quem assumiu deveria dizer host=true').toBe('true');
    expect(url.searchParams.get('peerId'), 'o peerId da URL continua o ID base').toBe(sala);
    const anaNaLista = await beto.estado(() => Game.state.players.find(p => p.name === 'Ana'));
    expect(anaNaLista.isHost).toBe(false);
    expect(anaNaLista.disconnected).toBe(true);

    // F5 do novo host: continua host na sala nova.
    await beto.page.reload();
    await beto.esperar((id) => Game.state.isHost === true && Game.state.peerId === id && Game.state.gameStarted === true,
        { arg: sala + '-h1', timeout: 25000 });
});

test('E5 Troca de host com a rodada encerrada: continua encerrada; o host antigo volta pelo link antigo como jogador comum', async ({ jogadores }) => {
    const codigo = codigoDeSala();
    const sala = idDaSala(codigo);
    const ana = await jogadores.novo('Ana');
    const beto = await jogadores.novo('Beto');
    await iniciarPartida(ana, [beto], codigo);

    await responderAteEncerrarRodada(ana, [ana, beto]);
    await beto.esperar(() => Game.state.rodadaEncerrada === true);

    const linkAntigo = await ana.fecharAba();
    await beto.esperar(() => Game.state.isHost === true && Game.state.peerId === Game.state.hostPeerId, { timeout: 25000 });
    expect(await beto.estado(() => Game.state.rodadaEncerrada), 'a rodada deveria continuar encerrada').toBe(true);
    expect(await beto.estado(() => Game.state.currentRound)).toBeNull();
    expect(await beto.estado(() => Game.state.partidaPausada)).toBeFalsy();
    await expect(beto.page.locator('#spectatorMessage')).toBeVisible();
    await expect(beto.page.locator('#btnNovaRodada'), 'o "Nova Rodada" deveria estar liberado').toBeEnabled();

    // O host antigo reabre o link antigo da partida (mesmo navegador).
    await ana.reabrir(linkAntigo);
    await ana.esperar((id) => Game.state.isHost === false && Game.state.hostPeerId === id &&
        Game.network.connectionState.getConnection(id) && Game.network.connectionState.getConnection(id).open,
        { arg: sala + '-h1', timeout: 25000 });
    expect(new URL(ana.page.url()).searchParams.get('host'), 'a URL do host antigo deveria passar a host=false').toBe('false');
    await beto.esperar(() => {
        const a = Game.state.players.find(p => p.name === 'Ana');
        return a && a.disconnected === false && a.isHost === false;
    });
    expect(await ana.estado(() => Game.state.rodadaEncerrada), 'quem volta deveria ver "rodada encerrada"').toBe(true);

    // Nada começa sozinho.
    await beto.page.waitForTimeout(5000);
    expect(await beto.estado(() => Game.state.currentRound), 'nenhuma dupla deveria começar sem o "Nova Rodada"').toBeNull();

    // O novo host clica em "Nova Rodada": a rodada começa para os dois.
    await beto.clicar('#btnNovaRodada');
    await beto.esperar(() => Game.state.currentRound !== null && Game.state.rodadaEncerrada === false);
    await ana.esperar(() => Game.state.currentRound !== null && Game.state.rodadaEncerrada === false);
});

test('E14 Troca de host no lobby: outro assume, os demais voltam como jogadores novos e o host antigo não abre outra sala', async ({ jogadores }) => {
    const codigo = codigoDeSala();
    const sala = idDaSala(codigo);
    const ana = await jogadores.novo('Ana');
    const beto = await jogadores.novo('Beto');
    const caio = await jogadores.novo('Caio');
    await ana.abrirJogo(codigo, { host: true });
    await beto.abrirJogo(codigo, { host: false });
    await caio.abrirJogo(codigo, { host: false });
    await ana.esperar(() => Game.state.players.length === 3);

    // Ana fecha a aba antes de iniciar.
    const linkDaAna = await ana.fecharAba();
    const novoHost = await esperarNovoHost([beto, caio]);
    const outro = novoHost === beto ? caio : beto;
    expect(await novoHost.estado(() => Game.state.hostPeerId)).toBe(sala + '-h1');
    expect(await novoHost.estado(() => Game.state.gameStarted), 'continua no lobby').toBe(false);

    // O outro acha a sala nova e entra como jogador novo.
    await expect.poll(() => outro.conectadoA(sala + '-h1'), { timeout: 40000, message: outro.nome + ' deveria achar o novo host' }).toBe(true);
    await novoHost.esperar((nome) => Game.state.players.some(p => p.name === nome), { arg: outro.nome });
    expect((await novoHost.estado(() => Game.state.players.map(p => p.name))).sort(),
        'no lobby, a troca de host tira da lista quem não voltou').toEqual([beto.nome, caio.nome].sort());

    // Ana reabre o link antigo (host=true): volta como jogadora comum, sem abrir outra sala.
    await ana.reabrir(linkDaAna);
    await ana.esperar((id) => Game.state.isHost === false && Game.state.hostPeerId === id &&
        Game.network.connectionState.getConnection(id) && Game.network.connectionState.getConnection(id).open,
    { arg: sala + '-h1', timeout: 25000 });
    expect(new URL(ana.page.url()).searchParams.get('host'), 'a URL da Ana deveria passar a host=false').toBe('false');
    await novoHost.esperar(() => Game.state.players.length === 3);
    expect(await novoHost.estado(() => Game.state.players.filter(p => p.isHost).map(p => p.name))).toEqual([novoHost.nome]);

    // O novo host inicia a partida com os três.
    await expect(novoHost.page.locator('#btnStartGame'), 'o "Iniciar" deveria estar liberado').toBeEnabled();
    await novoHost.clicar('#btnStartGame');
    for (const j of [ana, beto, caio]) await j.esperar(() => Game.state.gameStarted === true);
});

test('E15 Duas trocas de host seguidas: a sala vai para -h2; quem volta pela tela inicial ou pelo link antigo acha a sala', async ({ jogadores }) => {
    const codigo = codigoDeSala();
    const sala = idDaSala(codigo);
    const ana = await jogadores.novo('Ana');
    const beto = await jogadores.novo('Beto');
    const caio = await jogadores.novo('Caio');
    await iniciarPartida(ana, [beto, caio], codigo);
    const kpiDaAna = await ana.estado(() => Game.state.players.find(p => p.name === 'Ana').kpi);

    // 1ª troca: Ana sai, um assume em -h1 e o outro o acha.
    await ana.fecharAba();
    const primeiro = await esperarNovoHost([beto, caio]);
    const segundo = primeiro === beto ? caio : beto;
    expect(await primeiro.estado(() => Game.state.hostPeerId)).toBe(sala + '-h1');
    await expect.poll(() => segundo.conectadoA(sala + '-h1'), { timeout: 40000, message: segundo.nome + ' deveria achar o host em -h1' }).toBe(true);
    await primeiro.esperar((nome) => {
        const s = Game.state.players.find(p => p.name === nome);
        return s && s.disconnected === false;
    }, { arg: segundo.nome });

    // 2ª troca: quem assumiu também sai; o que sobrou assume em -h2 (Ana, desconectada, é pulada).
    const linkDoPrimeiro = await primeiro.fecharAba();
    await segundo.esperar((id) => Game.state.isHost === true && Game.state.peerId === id,
        { arg: sala + '-h2', timeout: 25000 });
    expect(await segundo.estado(() => Game.state.hostVersion)).toBe(2);

    // Ana entra pela tela inicial digitando o código: acha a sala em -h2.
    await ana.entrarPelaTelaInicial(codigo);
    await expect.poll(() => ana.conectadoA(sala + '-h2'), { timeout: 25000, message: 'Ana deveria achar a sala em -h2' }).toBe(true);
    await segundo.esperar(() => {
        const a = Game.state.players.find(p => p.name === 'Ana');
        return a && a.disconnected === false && a.isHost === false;
    });
    expect(await segundo.estado(() => Game.state.players.find(p => p.name === 'Ana').kpi), 'Ana volta com o KPI dela').toBe(kpiDaAna);

    // Quem foi host em -h1 reabre o link dele (host=true): volta como jogador comum em -h2.
    await primeiro.reabrir(linkDoPrimeiro);
    await primeiro.esperar((id) => Game.state.isHost === false && Game.state.hostPeerId === id &&
        Game.network.connectionState.getConnection(id) && Game.network.connectionState.getConnection(id).open,
    { arg: sala + '-h2', timeout: 25000 });
    expect(new URL(primeiro.page.url()).searchParams.get('host')).toBe('false');
    await segundo.esperar(() => Game.state.players.every(p => p.disconnected === false));
    expect(await segundo.estado(() => Game.state.players.filter(p => p.isHost).map(p => p.name))).toEqual([segundo.nome]);

    // A partida segue (tinha pausado quando o novo host ficou sozinho).
    await segundo.esperar(() => !Game.state.partidaPausada && (Game.state.currentRound !== null || Game.state.rodadaEncerrada === true));
});