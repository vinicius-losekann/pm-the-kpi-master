// ============================================
// PM: The KPI Master - Testes no navegador: troca de host
// ============================================
// O host cai (fecha a aba) e, com o sinal de vida dele parado há mais de
// HOST_TIMEOUT (10 s no config real), outro jogador assume a sala: a
// página de quem assume recarrega e abre como host com o estado da
// partida; os outros continuam na página e passam ao host novo.
// Checklist: _docs/connection-tests.md (M3, M4, M5, M11, M12, M19, M20).
// ============================================

const { test, expect, roomCode, startMatch, answerUntilRoundEnds, waitForHostBack, waitForNewHost, roundStoppedInPage } = require('./players');

/** A pergunta da vez, como a página a vê (função executada na página). */
function roundInPage() {
    const r = Game.state.currentRound;
    return r ? { question: r.question && r.question.question, asker: r.asker, answerer: r.answerer, answered: !!r.answered } : null;
}

/** Nomes de quem está como host na lista de jogadores da página. */
function hostsInPage() {
    return Game.state.players.filter(p => p.isHost).map(p => p.name);
}

/**
 * Faz a partida andar até a pergunta da vez ser de uma dupla sem `name`
 * (o host que vai cair), já feita e aberta para quem responde. Devolve
 * quem responde.
 */
async function waitForPairWithout(host, everyone, name) {
    const deadline = Date.now() + 90000;
    while (Date.now() < deadline) {
        for (const p of everyone) await p.askIfMyTurn();
        const r = await host.state(roundInPage);
        if (r && !r.answered && r.asker !== name && r.answerer !== name) {
            const answerer = everyone.find(p => p.name === r.answerer);
            if (await answerer.hasOpenQuestion()) return answerer;
        } else {
            for (const p of everyone) await p.answerIfMyTurn();
            if (await host.state(roundStoppedInPage)) await host.click('#btnNewRound');
        }
        await host.page.waitForTimeout(300);
    }
    throw new Error('Nenhuma pergunta sem ' + name + ' na dupla abriu em 90s');
}

/** Escreve a medida no log e na coluna "Detalhe" do resumo do Actions. */
function logMeasure(text) {
    console.log('📏 ' + text);
    test.info().annotations.push({ type: 'measure', description: text });
}

test('E31 O host fecha a aba no meio da pergunta: outro jogador assume entre 10 e 20 s depois (não antes de 10), a mesma pergunta continua, quem ficou vê "Fulano agora é o host" e a resposta vale; o F5 do host novo continua host', async ({ players }) => {
    const code = roomCode();
    const ana = await players.add('Ana');
    const beto = await players.add('Beto');
    const caio = await players.add('Caio');
    await startMatch(ana, [beto, caio], code);
    const answerer = await waitForPairWithout(ana, [ana, beto, caio], 'Ana');
    const before = await ana.state(roundInPage);

    const closedAt = Date.now();
    await ana.closeTab();
    const newHost = await waitForNewHost([beto, caio], 30000);
    const seconds = (Date.now() - closedAt) / 1000;
    logMeasure('Troca de host: ' + seconds.toFixed(1) + ' s do fechamento da aba do host até ' + newHost.name + ' abrir como host');
    expect(seconds, 'ninguém deveria assumir antes do HOST_TIMEOUT (10 s)').toBeGreaterThanOrEqual(10);
    expect(seconds, 'a troca deveria vir em até 20 s').toBeLessThanOrEqual(20);
    const other = newHost === beto ? caio : beto;

    await newHost.waitFor(() => Game.state.gameStarted === true);
    expect(await newHost.state(roundInPage), 'a mesma pergunta deveria continuar no host novo').toEqual(before);
    expect(await newHost.state(hostsInPage), 'só o host novo fica como host').toEqual([newHost.name]);
    expect(await newHost.state(() => Game.state.players.find(p => p.name === 'Ana').disconnected), 'Ana fica desconectada na partida').toBe(true);
    await expect.poll(() => other.isConnectedToHost(), { timeout: 25000, message: other.name + ' deveria ficar ligado ao host novo' }).toBe(true);
    await expect(other.page.locator('#statusText'), other.name + ' deveria ver quem é o host novo').toContainText(newHost.name + ' agora é o host', { timeout: 15000 });
    expect(await other.state(hostsInPage)).toEqual([newHost.name]);

    // Quem responde responde: a resposta vale no host novo.
    await expect.poll(() => answerer.hasOpenQuestion(), { timeout: 15000, message: answerer.name + ' deveria continuar com a pergunta aberta' }).toBe(true);
    await answerer.answerIfMyTurn();
    await newHost.waitFor((n) => Game.state.answeredThisRound.includes(n), { arg: answerer.name, timeout: 10000 });

    // F5 do host novo: continua host (M3).
    await newHost.page.reload();
    await waitForHostBack(newHost);
    await expect.poll(() => other.isConnectedToHost(), { timeout: 25000, message: other.name + ' deveria voltar ao mesmo host novo' }).toBe(true);
    expect(await other.state(() => Game.state.isHost), 'sem outra troca depois do F5 do host novo').toBe(false);
    expect(await other.state(hostsInPage)).toEqual([newHost.name]);
});

test('E32 Três jogadores, troca de host no meio da pergunta de um guest: quem responde clica antes de o host novo abrir; a resposta espera, vale uma vez, e a partida segue com a próxima dupla', async ({ players }) => {
    const code = roomCode();
    const ana = await players.add('Ana');
    const beto = await players.add('Beto');
    const caio = await players.add('Caio');
    await startMatch(ana, [beto, caio], code);
    const answerer = await waitForPairWithout(ana, [ana, beto, caio], 'Ana');

    await ana.closeTab();
    expect(await answerer.answerIfMyTurn(), answerer.name + ' deveria conseguir responder logo depois da queda do host').toBe(true);
    const newHost = await waitForNewHost([beto, caio], 30000);
    await newHost.waitFor((n) => Game.state.answeredThisRound.includes(n), { arg: answerer.name, timeout: 15000 });
    expect(await newHost.state((n) => Game.state.answeredThisRound.filter(x => x === n).length, answerer.name), 'a resposta conta uma vez').toBe(1);

    // A partida segue entre os dois que ficaram (ou a rodada espera Ana, que caiu sem responder).
    await newHost.waitFor(() => {
        const r = Game.state.currentRound;
        return Game.state.roundEnded === true || (Game.state.waitingFor || []).length > 0 ||
            (!!r && !r.answered && r.asker !== 'Ana' && r.answerer !== 'Ana');
    }, { timeout: 15000 });
    await answerUntilRoundEnds(newHost, [beto, caio]);
});

test('E33 Troca de host com a rodada encerrada: continua encerrada para todos, nada começa sozinho; o host antigo volta pelo link como jogador comum, com o KPI dele, e o "Nova Rodada" do host novo começa a próxima', async ({ players }) => {
    const code = roomCode();
    const ana = await players.add('Ana');
    const beto = await players.add('Beto');
    const caio = await players.add('Caio');
    await startMatch(ana, [beto, caio], code);
    await answerUntilRoundEnds(ana, [ana, beto, caio]);
    const anaBefore = await ana.state(() => {
        const a = Game.state.players.find(p => p.name === 'Ana');
        return { kpi: a.kpi, resources: a.resources };
    });

    const anaLink = await ana.closeTab();
    const newHost = await waitForNewHost([beto, caio], 30000);
    const other = newHost === beto ? caio : beto;
    await newHost.waitFor(() => Game.state.roundEnded === true);
    await expect.poll(() => other.isConnectedToHost(), { timeout: 25000, message: other.name + ' deveria ficar ligado ao host novo' }).toBe(true);
    await other.waitFor(() => Game.state.roundEnded === true);
    await expect(newHost.page.locator('#btnNewRound'), 'o "Nova Rodada" do host novo deveria estar liberado').toBeEnabled();

    // Nada começa sozinho.
    await newHost.page.waitForTimeout(3000);
    expect(await newHost.state(() => Game.state.roundEnded), 'nenhuma dupla deveria começar sem o "Nova Rodada"').toBe(true);

    // Ana volta pelo mesmo link (mesmo navegador): jogadora comum (M4, M19).
    await ana.reopen(anaLink);
    await expect.poll(() => ana.isConnectedToHost(), { timeout: 25000, message: 'Ana deveria voltar ligada ao host novo' }).toBe(true);
    expect(await ana.state(() => Game.state.isHost), 'Ana volta como guest').toBe(false);
    expect(await ana.state(hostsInPage)).toEqual([newHost.name]);
    await newHost.waitFor(() => Game.state.players.find(p => p.name === 'Ana').disconnected === false, { timeout: 15000 });
    const back = await newHost.state(() => Game.state.players.find(p => p.name === 'Ana'));
    expect(back.isHost).toBe(false);
    expect(back.kpi, 'Ana volta com o KPI dela').toBe(anaBefore.kpi);
    expect(back.resources, 'Ana volta com os recursos dela').toBe(anaBefore.resources);

    await newHost.click('#btnNewRound');
    await newHost.waitFor(() => Game.state.roundEnded === false && Game.state.currentRound !== null && Game.state.currentRound.answered === false);
    await answerUntilRoundEnds(newHost, [ana, beto, caio]);
});

test('E34 Troca de host no lobby: quem fica não precisa entrar de novo, o host antigo sai da lista e o host novo começa a partida', async ({ players }) => {
    const code = roomCode();
    const ana = await players.add('Ana');
    const beto = await players.add('Beto');
    const caio = await players.add('Caio');
    await ana.openGame(code, { host: true });
    await beto.openGame(code, { host: false });
    await caio.openGame(code, { host: false });
    await ana.waitFor(() => Game.state.players.length === 3);

    await ana.closeTab();
    const newHost = await waitForNewHost([beto, caio], 30000);
    const other = newHost === beto ? caio : beto;
    await newHost.waitFor(() => Game.state.players.length === 2 && !Game.state.players.some(p => p.name === 'Ana'), { timeout: 15000 });
    await expect.poll(() => other.isConnectedToHost(), { timeout: 25000, message: other.name + ' deveria ficar ligado ao host novo, sem entrar de novo' }).toBe(true);
    await other.waitFor(() => Game.state.players.length === 2 && !Game.state.players.some(p => p.name === 'Ana'), { timeout: 15000 });
    expect(other.logs.some(l => l.includes('AVISO:')), other.name + ' não deveria ver nenhum aviso de recusa').toBe(false);

    await expect(newHost.page.locator('#btnStartGame'), 'o "Iniciar" do host novo deveria estar liberado').toBeEnabled({ timeout: 15000 });
    await newHost.click('#btnStartGame');
    await newHost.waitFor(() => Game.state.gameStarted === true && Game.state.currentRound !== null);
    await other.waitFor(() => Game.state.gameStarted === true);
});

test('E35 Duas trocas de host seguidas (4 jogadores): o host cai, outro assume; o host novo também cai e um terceiro assume; a partida continua com quem ficou', async ({ players }) => {
    test.setTimeout(240000);
    const code = roomCode();
    const ana = await players.add('Ana');
    const beto = await players.add('Beto');
    const caio = await players.add('Caio');
    const davi = await players.add('Davi');
    await startMatch(ana, [beto, caio, davi], code);

    await ana.closeTab();
    const second = await waitForNewHost([beto, caio, davi], 30000);
    const rest = [beto, caio, davi].filter(p => p !== second);
    await second.waitFor(() => Game.state.gameStarted === true);
    for (const p of rest) {
        await expect.poll(() => p.isConnectedToHost(), { timeout: 25000, message: p.name + ' deveria ficar ligado a ' + second.name }).toBe(true);
    }

    await second.closeTab();
    const third = await waitForNewHost(rest, 30000);
    const last = rest.find(p => p !== third);
    await third.waitFor(() => Game.state.gameStarted === true);
    await expect.poll(() => last.isConnectedToHost(), { timeout: 25000, message: last.name + ' deveria ficar ligado a ' + third.name }).toBe(true);
    await expect(last.page.locator('#statusText')).toContainText(third.name + ' agora é o host', { timeout: 15000 });
    expect(await third.state(hostsInPage), 'só o terceiro fica como host').toEqual([third.name]);
    const dropped = await third.state((names) => names.map(n => Game.state.players.find(p => p.name === n).disconnected), ['Ana', second.name]);
    expect(dropped, 'os dois hosts que caíram ficam desconectados').toEqual([true, true]);

    // A partida continua com os dois que ficaram.
    await third.waitFor(() => !Game.state.matchPaused &&
        (Game.state.roundEnded === true || (Game.state.waitingFor || []).length > 0 || Game.state.currentRound !== null), { timeout: 15000 });
    await answerUntilRoundEnds(third, [third, last]);
});

test('E36 O host cai e um guest dá F5 antes da troca: mede quanto ele espera até receber o estado do host novo (ou virar o host) e escreve no log; falha acima de 20 s', async ({ players }) => {
    const code = roomCode();
    const ana = await players.add('Ana');
    const beto = await players.add('Beto');
    const caio = await players.add('Caio');
    await startMatch(ana, [beto, caio], code);

    await ana.closeTab();
    await caio.page.waitForTimeout(2000);
    const reloadedAt = Date.now();
    await caio.page.reload();
    const ready = async () => (await caio.isConnectedToHost().catch(() => false)) || (await caio.isRoomHost().catch(() => false));
    await expect.poll(ready, { timeout: 30000, intervals: [200], message: 'Caio deveria voltar à partida pelo host novo' }).toBe(true);
    const seconds = (Date.now() - reloadedAt) / 1000;
    logMeasure('F5 de guest com o host caído: ' + seconds.toFixed(1) + ' s do F5 até receber o estado do host novo (ou virar o host)');
    expect(seconds, 'a espera do F5 com o host caído deveria ficar em até 20 s').toBeLessThanOrEqual(20);

    const newHost = await waitForNewHost([beto, caio], 15000);
    const other = newHost === beto ? caio : beto;
    expect(await newHost.state(() => Game.state.gameStarted), 'a partida continua no host novo').toBe(true);
    await expect.poll(() => other.isConnectedToHost(), { timeout: 25000, message: other.name + ' deveria ficar ligado ao host novo' }).toBe(true);
    expect(await other.state(() => Game.state.gameStarted)).toBe(true);
});
