// ============================================
// PM: The KPI Master - Ponta a ponta: troca de host
// ============================================
// Checklist: _docs/testes-conexao.md (M3, M4, M19).
// ============================================

const { test, expect, codigoDeSala, idDaSala, iniciarPartida, responderAteEncerrarRodada } = require('./apoio');

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