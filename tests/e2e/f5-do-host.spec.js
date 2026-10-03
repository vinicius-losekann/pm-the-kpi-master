// ============================================
// PM: The KPI Master - Ponta a ponta: F5 do host em cada momento
// ============================================
// Checklist: _docs/testes-conexao.md (M2 e os bugs B3, B4 e B5). O F5
// no meio da pergunta está em conexao.spec.js (E1).
// ============================================

const { test, expect, codigoDeSala, idDaSala, iniciarPartida, responderAteEncerrarRodada, esperarPerguntaAbertaPara } = require('./apoio');

/** Espera o host voltar do F5: de novo host, na mesma sala, com a partida em andamento. */
async function esperarHostDeVolta(host, sala) {
    await host.esperar((id) => Game.state.isHost === true && Game.state.peerId === id && Game.state.gameStarted === true,
        { arg: sala, timeout: 25000 });
}

test('E9 F5 do host com a rodada encerrada: continua encerrada para todos, "Nova Rodada" liberado, nada começa sozinho', async ({ jogadores }) => {
    const codigo = codigoDeSala();
    const sala = idDaSala(codigo);
    const ana = await jogadores.novo('Ana');
    const beto = await jogadores.novo('Beto');
    await iniciarPartida(ana, [beto], codigo);
    await responderAteEncerrarRodada(ana, [ana, beto]);
    await beto.esperar(() => Game.state.rodadaEncerrada === true);

    await ana.page.reload();
    await esperarHostDeVolta(ana, sala);
    await expect.poll(() => beto.conectadoA(sala), { timeout: 25000, message: 'Beto deveria reconectar ao mesmo host' }).toBe(true);
    await ana.esperar(() => {
        const b = Game.state.players.find(p => p.name === 'Beto');
        return b && b.disconnected === false;
    });

    expect(await ana.estado(() => Game.state.rodadaEncerrada), 'depois do F5, a rodada deveria continuar encerrada').toBe(true);
    await expect(ana.page.locator('#spectatorMessage')).toContainText('Rodada encerrada');
    await expect(ana.page.locator('#btnNovaRodada'), 'o "Nova Rodada" deveria estar liberado').toBeEnabled();
    await beto.esperar(() => Game.state.rodadaEncerrada === true);
    await expect(beto.page.locator('#spectatorMessage'), 'Beto deveria ver "Rodada encerrada", não a última dupla').toContainText('Rodada encerrada');
    expect(await beto.temPerguntaAberta()).toBe(false);

    // Nada começa sozinho.
    await ana.page.waitForTimeout(5000);
    expect(await ana.estado(() => Game.state.rodadaEncerrada), 'nenhuma dupla deveria começar sem o "Nova Rodada"').toBe(true);
    expect(await beto.estado(() => Game.state.rodadaEncerrada)).toBe(true);

    // O host clica em "Nova Rodada": a rodada começa para os dois.
    await ana.clicar('#btnNovaRodada');
    await ana.esperar(() => Game.state.rodadaEncerrada === false && Game.state.currentRound !== null && Game.state.currentRound.respondeu === false);
    await beto.esperar(() => Game.state.rodadaEncerrada === false && Game.state.currentRound !== null);
});

test('E10 F5 do host logo depois de responder (antes da próxima dupla): a partida não trava', async ({ jogadores }) => {
    const codigo = codigoDeSala();
    const sala = idDaSala(codigo);
    const ana = await jogadores.novo('Ana');
    const beto = await jogadores.novo('Beto');
    await iniciarPartida(ana, [beto], codigo);

    // A host responde e dá F5 antes dos ~3s que separam a resposta da próxima dupla.
    await esperarPerguntaAbertaPara(ana, [ana, beto], [ana]);
    expect(await ana.responderSeForMinhaVez(), 'pré-condição: a pergunta aberta é da Ana').toBe(true);
    await ana.esperar(() => Game.state.currentRound && Game.state.currentRound.respondedor === 'Ana' && Game.state.currentRound.respondeu === true,
        { timeout: 2000 });
    await ana.page.reload();
    await esperarHostDeVolta(ana, sala);

    // Segue para a próxima dupla (Beto responde) ou encerra a rodada (Beto já tinha respondido).
    await ana.esperar(() => Game.state.rodadaEncerrada === true ||
        (Game.state.currentRound !== null && Game.state.currentRound.respondeu === false && Game.state.currentRound.respondedor === 'Beto'),
        { timeout: 10000 });
    await expect.poll(() => beto.conectadoA(sala), { timeout: 25000, message: 'Beto deveria reconectar ao mesmo host' }).toBe(true);

    // A partida continua: a rodada vai até o fim e a seguinte começa.
    await responderAteEncerrarRodada(ana, [ana, beto]);
    const respondidos = await ana.estado(() => Game.state.usedRespondedorThisRound.slice());
    expect(respondidos.slice().sort(), 'cada um responde uma vez na rodada').toEqual(['Ana', 'Beto']);
    await ana.clicar('#btnNovaRodada');
    await ana.esperar(() => Game.state.rodadaEncerrada === false && Game.state.currentRound !== null && Game.state.currentRound.respondeu === false);
    await beto.esperar(() => Game.state.rodadaEncerrada === false && Game.state.currentRound !== null);
});

test('E11 F5 do host com a partida pausada: continua pausada com o mesmo evento e retoma quando o outro volta', async ({ jogadores }) => {
    const codigo = codigoDeSala();
    const sala = idDaSala(codigo);
    const ana = await jogadores.novo('Ana');
    const beto = await jogadores.novo('Beto');
    await iniciarPartida(ana, [beto], codigo);

    // Beto fecha a aba: só a Ana fica conectada e a partida pausa.
    const linkDoBeto = await beto.fecharAba();
    await ana.esperar(() => !!Game.state.partidaPausada && !!Game.state.partidaPausada.evento);
    const evento = await ana.estado(() => Game.state.partidaPausada.evento.id);

    await ana.page.reload();
    await esperarHostDeVolta(ana, sala);
    expect(await ana.estado(() => Game.state.partidaPausada && Game.state.partidaPausada.evento && Game.state.partidaPausada.evento.id),
        'depois do F5, a partida deveria continuar pausada com o mesmo evento').toBe(evento);
    await expect(ana.page.locator('#modalEvento'), 'não deveria sortear nem mostrar outro evento').toBeHidden();
    await expect(ana.page.locator('#spectatorMessage')).toContainText('Partida pausada');
    expect(await ana.estado(() => Game.state.currentRound)).toBeNull();

    // Beto volta pelo mesmo link: a partida retoma com o mesmo evento, sem mostrar o evento de novo.
    await beto.reabrir(linkDoBeto);
    await ana.esperar(() => {
        const b = Game.state.players.find(p => p.name === 'Beto');
        return b && b.disconnected === false;
    }, { timeout: 25000 });
    await ana.esperar(() => !Game.state.partidaPausada && Game.state.currentRound !== null);
    expect(await ana.estado(() => Game.state.currentRound.evento.id), 'a rodada retomada deveria usar o mesmo evento').toBe(evento);
    await expect(ana.page.locator('#modalEvento')).toBeHidden();
    await beto.esperar(() => Game.state.currentRound !== null && Game.state.rodadaEncerrada === false);
});
