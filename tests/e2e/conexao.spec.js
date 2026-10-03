// ============================================
// PM: The KPI Master - Ponta a ponta: quedas, voltas e nova partida
// ============================================
// Checklist: _docs/testes-conexao.md (M1, M5, M6, M10, M14, M15, M20 e
// a volta do host antigo pela tela inicial).
// ============================================

const {
    test, expect, codigoDeSala, idDaSala, iniciarPartida, responderAteEncerrarRodada,
    esperarPerguntaAbertaPara, esperarNovoHost
} = require('./apoio');

test('E1 F5 do host no meio da pergunta: o outro reconecta ao mesmo host, sem troca, e a partida segue', async ({ jogadores }) => {
    const codigo = codigoDeSala();
    const sala = idDaSala(codigo);
    const ana = await jogadores.novo('Ana');
    const beto = await jogadores.novo('Beto');
    await iniciarPartida(ana, [beto], codigo);
    await esperarPerguntaAbertaPara(ana, [ana, beto], [ana, beto]);

    await ana.page.reload();
    await ana.esperar((id) => Game.state.isHost === true && Game.state.peerId === id && Game.state.gameStarted === true,
        { arg: sala, timeout: 25000 });
    await beto.esperar((id) => {
        const c = Game.network.connectionState.getConnection(id);
        return Game.state.isHost === false && Game.state.hostPeerId === id && !!c && c.open === true;
    }, { arg: sala, timeout: 25000 });
    await ana.esperar(() => {
        const b = Game.state.players.find(p => p.name === 'Beto');
        return b && b.disconnected === false;
    });
    expect(await beto.estado(() => Game.state.hostVersion), 'não deveria ter havido troca de host').toBe(0);

    // A partida continua: a rodada vai até o fim.
    await responderAteEncerrarRodada(ana, [ana, beto]);
});

test('E3 Host antigo volta pela tela inicial digitando o código: entra como jogador comum', async ({ jogadores }) => {
    const codigo = codigoDeSala();
    const sala = idDaSala(codigo);
    const ana = await jogadores.novo('Ana');
    const beto = await jogadores.novo('Beto');
    await iniciarPartida(ana, [beto], codigo);
    const kpiDaAna = await ana.estado(() => Game.state.players.find(p => p.name === 'Ana').kpi);

    await ana.fecharAba();
    await esperarNovoHost([beto]);

    await ana.entrarPelaTelaInicial(codigo);
    await expect.poll(() => ana.conectadoA(sala + '-h1'), { timeout: 25000, message: 'Ana deveria achar a sala em -h1' }).toBe(true);
    await beto.esperar(() => {
        const a = Game.state.players.find(p => p.name === 'Ana');
        return a && a.disconnected === false && a.isHost === false;
    });
    expect(await beto.estado(() => Game.state.players.find(p => p.name === 'Ana').kpi), 'Ana volta com o KPI dela').toBe(kpiDaAna);
    expect(await beto.estado(() => Game.state.players.filter(p => p.isHost).map(p => p.name))).toEqual(['Beto']);
});

test('E4 Três jogadores, host sai no meio da pergunta: o terceiro acha o novo host; ninguém responde duas vezes nem perde a vez', async ({ jogadores }) => {
    const codigo = codigoDeSala();
    const sala = idDaSala(codigo);
    const ana = await jogadores.novo('Ana');
    const beto = await jogadores.novo('Beto');
    const caio = await jogadores.novo('Caio');
    await iniciarPartida(ana, [beto, caio], codigo);

    // Pergunta aberta para um dos guests, com alguém já tendo respondido
    // nesta rodada (é o que o novo host precisa saber para não repetir).
    let respondedor = null;
    let jaResponderam = [];
    for (let i = 0; i < 6 && !respondedor; i++) {
        const r = await esperarPerguntaAbertaPara(ana, [ana, beto, caio], [beto, caio]);
        const lista = await r.estado(() => Game.state.usedRespondedorThisRound.slice());
        if (lista.length > 0) {
            respondedor = r;
            jaResponderam = lista;
        } else {
            await r.responderSeForMinhaVez();
            await expect(r.page.locator('#modalResponderPergunta')).toBeHidden();
        }
    }
    expect(respondedor, 'os guests deveriam saber quem já respondeu nesta rodada (lista vazia depois de outras respostas)').not.toBeNull();
    expect(jaResponderam, 'pré-condição: quem está com a pergunta aberta ainda não respondeu').not.toContain(respondedor.nome);

    await ana.fecharAba();
    const novoHost = await esperarNovoHost([beto, caio]);
    const outro = novoHost === beto ? caio : beto;

    await expect.poll(() => outro.conectadoA(sala + '-h1'), { timeout: 40000, message: outro.nome + ' deveria achar o novo host' }).toBe(true);
    await novoHost.esperar((nome) => {
        const o = Game.state.players.find(p => p.name === nome);
        return o && o.disconnected === false;
    }, { arg: outro.nome });

    await responderAteEncerrarRodada(novoHost, [beto, caio]);
    const respondidos = await novoHost.estado(() => Game.state.usedRespondedorThisRound.slice());
    expect(new Set(respondidos).size, 'ninguém pode responder duas vezes na mesma rodada: ' + respondidos.join(', ')).toBe(respondidos.length);
    expect(respondidos, respondedor.nome + ' não pode perder a vez').toContain(respondedor.nome);
    for (const nome of jaResponderam) expect(respondidos).toContain(nome);
    expect(respondidos).toEqual(expect.arrayContaining(['Beto', 'Caio']));
});

test('E6 Jogador dá F5, outro fecha e volta pela tela inicial, nome novo é recusado; a partida segue', async ({ jogadores }) => {
    const codigo = codigoDeSala();
    const ana = await jogadores.novo('Ana');
    const beto = await jogadores.novo('Beto');
    const caio = await jogadores.novo('Caio');
    await iniciarPartida(ana, [beto, caio], codigo);
    const conectado = (nome) => ana.estado((n) => {
        const p = Game.state.players.find(x => x.name === n);
        return !!p && p.disconnected === false;
    }, nome);

    // F5 do Beto.
    const peerAntigo = await ana.estado(() => Game.state.players.find(p => p.name === 'Beto').peerId);
    await beto.page.reload();
    await ana.esperar((antigo) => {
        const b = Game.state.players.find(p => p.name === 'Beto');
        return b && b.disconnected === false && b.peerId !== antigo;
    }, { arg: peerAntigo, timeout: 25000 });

    // Caio fecha a aba e volta pela tela inicial (mesmo navegador = mesmo token).
    await caio.fecharAba();
    await expect.poll(() => conectado('Caio'), { message: 'a queda do Caio deveria ser percebida' }).toBe(false);
    await caio.entrarPelaTelaInicial(codigo);
    await expect.poll(() => conectado('Caio'), { timeout: 25000, message: 'Caio deveria voltar ao lugar dele' }).toBe(true);

    // Nome novo com a partida em andamento: recusado.
    const davi = await jogadores.novo('Davi');
    await davi.novaAba();
    await davi.page.goto(require('./apoio').SITE + '/index.html');
    await davi.page.click('#btnChooseJoin');
    await davi.page.fill('#joinPlayerName', 'Davi');
    await davi.page.fill('#joinRoomSuffix', codigo);
    await davi.page.click('#btnJoinRoom');
    await expect.poll(() => davi.logs.some(l => l.includes('A partida desta sala já começou')), { timeout: 25000, message: 'Davi deveria ver o aviso de partida em andamento' }).toBe(true);
    expect(await ana.estado(() => Game.state.players.map(p => p.name))).not.toContain('Davi');

    await responderAteEncerrarRodada(ana, [ana, beto, caio]);
});

test('E8 Jogador sai da partida, ela acaba, e o host consegue iniciar outra', async ({ jogadores }) => {
    const codigo = codigoDeSala();
    const ana = await jogadores.novo('Ana');
    const beto = await jogadores.novo('Beto');
    await iniciarPartida(ana, [beto], codigo);

    // Se a pergunta aberta for do Beto, ele responde antes (a janela de
    // resposta cobre a tela, como no jogo).
    if (await beto.temPerguntaAberta()) {
        await beto.responderSeForMinhaVez();
        await expect(beto.page.locator('#modalResponderPergunta')).toBeHidden();
    }
    await beto.clicar('#btnLeaveMatch');
    await ana.esperar(() => Game.state.gameOver === true);
    await beto.esperar(() => Game.state.gameOver === true);

    await ana.clicar('#btnBackToLobby');
    await beto.clicar('#btnBackToLobby');
    await expect(ana.page.locator('#btnStartGame'), 'o "Iniciar" deveria estar liberado').toBeEnabled();
    await ana.clicar('#btnStartGame');
    await ana.esperar(() => Game.state.gameStarted === true && Game.state.gameOver === false && Game.state.currentRound !== null);
    await beto.esperar(() => Game.state.gameStarted === true && Game.state.gameOver === false);
});

test('E13 Criar sala com código em uso (sala aberta e sala migrada): "já está em uso" em até 3s; código livre é aceito', async ({ jogadores }) => {
    const codigo = codigoDeSala();
    const sala = idDaSala(codigo);
    const ana = await jogadores.novo('Ana');
    const beto = await jogadores.novo('Beto');
    const caio = await jogadores.novo('Caio');
    await iniciarPartida(ana, [beto], codigo);

    // Sala aberta: o ID base está ocupado pelo host.
    const aberta = await caio.criarSalaPelaTelaInicial(codigo);
    expect(aberta.criada, 'não deveria criar sala com o código de uma sala aberta').toBe(false);
    expect(aberta.aviso).toContain('já está em uso');
    expect(aberta.segundos, 'a resposta deveria vir em até 3s (levou ' + aberta.segundos + 's)').toBeLessThan(3);
    expect(await beto.conectadoA(sala), 'a tentativa não deveria derrubar quem está na sala').toBe(true);
    expect(await ana.estado(() => Game.state.isHost === true && Game.state.peerId === Game.state.hostPeerId)).toBe(true);

    // Código livre: chega à tela "Sala criada" (a checagem não recusa tudo).
    const livre = await caio.criarSalaPelaTelaInicial(codigoDeSala());
    expect(livre.criada, 'código livre deveria ser aceito: ' + livre.aviso).toBe(true);

    // Sala migrada: o ID base ficou livre, mas a partida continua em -h1.
    await ana.fecharAba();
    await esperarNovoHost([beto]);
    expect(await beto.estado(() => Game.state.hostPeerId)).toBe(sala + '-h1');
    const migrada = await caio.criarSalaPelaTelaInicial(codigo);
    expect(migrada.criada, 'não deveria criar sala com o código de uma partida que continua em -h1').toBe(false);
    expect(migrada.aviso).toContain('já está em uso');
    expect(migrada.segundos, 'a resposta deveria vir em até 3s (levou ' + migrada.segundos + 's)').toBeLessThan(3);
    expect(await beto.estado(() => Game.state.isHost === true && Game.state.peerId === Game.state.hostPeerId),
        'o novo host continua host').toBe(true);
});

test('E16 Sala cheia: o 7º nome é recusado no lobby; com 6 na partida, quem cai volta ao lugar', async ({ jogadores }) => {
    const codigo = codigoDeSala();
    const nomes = ['Ana', 'Beto', 'Caio', 'Davi', 'Eva', 'Fabi'];
    const seis = [];
    for (const nome of nomes) seis.push(await jogadores.novo(nome));
    const [ana, ...guests] = seis;

    await ana.abrirJogo(codigo, { host: true });
    for (const g of guests) await g.abrirJogo(codigo, { host: false });
    await ana.esperar(() => Game.state.players.length === 6);

    // 7º nome no lobby: recusado com o aviso de sala cheia.
    const gil = await jogadores.novo('Gil');
    await gil.tentarEntrarPelaTelaInicial(codigo);
    await expect.poll(() => gil.logs.some(l => l.includes('Sala cheia')), { timeout: 25000, message: 'Gil deveria ver o aviso de sala cheia' }).toBe(true);
    expect(await ana.estado(() => Game.state.players.map(p => p.name)), 'Gil não deveria entrar na lista').not.toContain('Gil');
    expect(await ana.estado(() => Game.state.players.length)).toBe(6);

    await ana.clicar('#btnStartGame');
    for (const j of seis) await j.esperar(() => Game.state.gameStarted === true);

    // Com a sala lotada, um jogador cai e volta pelo mesmo link.
    const caio = guests[1];
    const antes = await ana.estado(() => Game.state.players.find(p => p.name === 'Caio'));
    const linkDoCaio = await caio.fecharAba();
    await ana.esperar(() => Game.state.players.find(p => p.name === 'Caio').disconnected === true);
    await caio.reabrir(linkDoCaio);
    await ana.esperar((antigo) => {
        const c = Game.state.players.find(p => p.name === 'Caio');
        return c && c.disconnected === false && c.peerId !== antigo;
    }, { arg: antes.peerId, timeout: 25000 });
    const depois = await ana.estado(() => Game.state.players.find(p => p.name === 'Caio'));
    expect(depois.kpi, 'Caio volta com o KPI dele').toBe(antes.kpi);
    expect(await ana.estado(() => Game.state.players.length), 'a lista continua com 6').toBe(6);
    expect(await ana.estado(() => Game.state.players.filter(p => p.disconnected).length), 'todos conectados de novo').toBe(0);
});