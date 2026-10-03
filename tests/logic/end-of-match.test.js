// ============================================
// PM: The KPI Master - Testes de lógica: Fim de partida e lobby
// ============================================
// Sair da partida, fim de jogo, encerrar a partida e voltar ao lobby.
// Ambiente simulado e ajudantes: environment.js. Rodar a partir da raiz:
//     node tests/logic/end-of-match.test.js
// ============================================

const {
    fs, path, vm, RAIZ, createEnvironment, tokenOf, test, check, start, finish,
    syncTo, roundScreens, unavailable, roomToReload, reloadHost, tryReloadHost, recordScreens
} = require('./environment');

start('Fim de partida e lobby');

test('T7  Falta de jogador de verdade (sair da partida) ainda encerra', (usar) => {
    const amb = usar(createEnvironment());
    amb.createRoomAsHost();
    amb.join('A', 'peer-a');
    amb.startMatch();
    amb.Game.network.handleMessage({ type: 'leave-match-request', playerName: 'A' }, 'peer-a');
    check(amb.state.gameOver === true, 'partida deveria ter sido encerrada');
    check(!amb.state.partidaPausada, 'não deveria pausar quando falta jogador de verdade');
});

test('T11 Fim de jogo: quem cai é removido (como antes)', (usar) => {
    const amb = usar(createEnvironment());
    amb.createRoomAsHost();
    amb.join('A', 'peer-a');
    amb.join('B', 'peer-b');
    amb.startMatch();
    amb.state.gameOver = true;
    amb.drop('peer-a');
    check(!amb.player('A'), 'A deveria ter sido removido após o fim de jogo');
});

test('T14 Encerrar partida: desconectado que não voltou sai da lista do lobby', (usar) => {
    const amb = usar(createEnvironment());
    amb.createRoomAsHost();
    amb.join('A', 'peer-a');
    amb.join('B', 'peer-b');
    amb.startMatch();
    amb.drop('peer-a');
    check(amb.player('A') && amb.player('A').disconnected, 'pré-condição: A marcado como desconectado');

    amb.clearLog();
    amb.Game.core.endMatch();
    check(!amb.player('A'), 'A deveria ter saído da lista ao voltar ao lobby');
    check(amb.player('B') && amb.player('Host'), 'Host e B (conectados) deveriam continuar');
    check(amb.state.backupPeerId === 'peer-b', 'backup era A — deveria passar para B, veio: ' + amb.state.backupPeerId);
    const fim = amb.broadcastsOfType('match-ended').pop();
    check(fim && !fim.players.some(p => p.name === 'A'), 'match-ended deveria levar a lista sem A');

    // No lobby, A pode voltar normalmente como jogador novo.
    amb.join('A', 'peer-a2');
    check(amb.rejectionFor('peer-a2') === null, 'A deveria conseguir entrar de novo, veio: ' + amb.rejectionFor('peer-a2'));
    check(amb.player('A') && !amb.player('A').disconnected, 'A deveria estar de volta na lista');
});

test('T15 Encerrar partida pausada: pausa não sobra para a próxima partida', (usar) => {
    const amb = usar(createEnvironment());
    amb.createRoomAsHost();
    amb.join('A', 'peer-a');
    amb.startMatch();
    amb.drop('peer-a');
    check(amb.state.partidaPausada, 'pré-condição: partida pausada');

    amb.Game.core.endMatch();
    check(!amb.state.partidaPausada, 'a pausa deveria ter sido desfeita ao encerrar');
    check(!amb.player('A'), 'A deveria ter saído da lista');
    check(amb.state.players.length === 1, 'só o host deveria sobrar na sala');
});

test('T16 Voltar ao lobby após o fim de jogo (host): limpa desconectados e avisa os guests', (usar) => {
    const amb = usar(createEnvironment());
    amb.createRoomAsHost();
    amb.join('A', 'peer-a');
    amb.join('B', 'peer-b');
    amb.startMatch();
    amb.drop('peer-a');
    amb.Game.core.endGame(amb.Game.core.buildRanking());
    check(amb.state.gameOver && amb.player('A'), 'pré-condição: fim de jogo com A ainda na lista');

    amb.clearLog();
    amb.Game.core.voltarAoLobby();
    check(!amb.player('A'), 'A deveria ter saído da lista');
    check(amb.player('B'), 'B deveria continuar');
    check(!amb.state.gameStarted && !amb.state.gameOver && amb.state.currentRound === null, 'estado da partida deveria estar zerado');
    const lista = amb.broadcastsOfType('player-list').pop();
    check(lista && !lista.players.some(p => p.name === 'A'), 'host deveria mandar player-list sem A para os guests');

    amb.join('C', 'peer-c');
    check(amb.rejectionFor('peer-c') === null, 'no lobby, nome novo deveria entrar, veio: ' + amb.rejectionFor('peer-c'));
});

test('T16b Voltar ao lobby (guest): limpa só a cópia local, sem mandar nada', (usar) => {
    const amb = usar(createEnvironment());
    amb.state.isHost = false;
    amb.state.playerName = 'B';
    amb.state.gameStarted = true;
    amb.state.gameOver = true;
    amb.state.players = [
        { name: 'Host', peerId: 'peer-host', isHost: true },
        { name: 'A', peerId: 'peer-a', isHost: false, disconnected: true },
        // O próprio jogador nunca é removido da própria lista, mesmo
        // que uma lista antiga o mostre como desconectado.
        { name: 'B', peerId: 'peer-b', isHost: false, disconnected: true }
    ];
    amb.Game.core.voltarAoLobby();
    check(!amb.player('A'), 'A deveria ter saído da lista local');
    check(amb.player('B'), 'B nunca deveria remover a si mesmo');
    check(amb.registro.broadcasts.length === 0, 'guest não deveria mandar nada');
});

test('T48 Guest sai da partida e ela acaba: no lobby, o host consegue iniciar outra', (usar) => {
    const amb = usar(createEnvironment());
    amb.createRoomAsHost();
    amb.join('A', 'peer-a');
    amb.startMatch();
    amb.player('A').kpi = 12;

    // A sai da partida: com 2 jogadores, a partida acaba (T7).
    amb.Game.core.handleLeaveMatchRequest({ playerName: 'A' });
    check(amb.player('A').waitingInLobby, 'pré-condição: A aguardando no lobby');
    if (!amb.state.gameOver) amb.Game.core.endGame(amb.Game.core.buildRanking());

    amb.clearLog();
    amb.Game.core.voltarAoLobby();
    const a = amb.player('A');
    check(a && a.waitingInLobby === false, 'A deveria deixar de estar "aguardando no lobby"');
    check(a.kpi === 0 && a.recursos === amb.CONFIG.RECURSOS_INICIAIS, 'jogadores voltam zerados, como ao encerrar a partida');
    check(amb.Game.getActivePlayers().length === 2, 'os 2 jogadores deveriam contar para iniciar, contam ' + amb.Game.getActivePlayers().length);
    const lista = amb.broadcastsOfType('player-list').pop();
    check(lista && lista.players.find(p => p.name === 'A').waitingInLobby === false,
        'o host deveria mandar a lista atualizada aos guests, mesmo sem ninguém removido');

    amb.startMatch();
    check(amb.state.gameStarted && !amb.state.gameOver && amb.state.currentRound, 'deveria conseguir iniciar outra partida');
});

// ============================================
// BUG-021 — F5 E VOLTA NA TELA DE FIM DE JOGO
// ============================================

/** Chamadas de tela com o nome informado (registro de recordScreens). */
function screenCalls(telas, nome) {
    return telas.filter(t => t.nome === nome);
}

/** A tela final apareceu, com o ranking informado? */
function showedFinalRanking(telas, ranking) {
    const final = screenCalls(telas, 'displayFinalRanking').pop();
    return screenCalls(telas, 'showScreen').some(t => t.args[0] === 'gameover') &&
        !!final && JSON.stringify(final.args[0]) === JSON.stringify(ranking);
}

test('T66 F5 do host no fim de jogo: volta ao ranking final e a partida não recomeça (BUG-021)', (usar) => {
    // A partida acaba porque alguém completou a última fase (ainda sobra tempo).
    const amb = usar(createEnvironment());
    const tempo = amb.fakeTime();
    roomToReload(amb);
    amb.join('A', 'peer-a');
    amb.join('B', 'peer-b');
    amb.startMatch();
    const r = amb.state.currentRound;
    const ultimaFase = amb.CONFIG.FASES[amb.CONFIG.FASES.length - 1].id;
    Object.assign(amb.player(r.respondedor), { phase: ultimaFase, activities: amb.CONFIG.JOGO.ACTIVITIES_PER_PHASE - 1 });
    amb.Game.core.handleAnswer({ alternativa: r.pergunta.correct, playerName: r.respondedor });
    tempo.advance(3000);
    check(amb.state.gameOver === true && amb.state.timer > 0, 'pré-condição: a partida acabou antes do tempo');
    const ranking = amb.broadcastsOfType('game-over').pop().ranking;

    const novo = usar(reloadHost(amb));
    const relogio = novo.fakeClock();
    novo.fakeTime();
    const telas = recordScreens(novo);
    check(novo.state.gameOver === true, 'o fim de jogo deveria ser restaurado do estado salvo');
    // O ranking mostrado é o do fim da partida, não um recalculado agora.
    novo.player(r.respondedor).kpi = 999;
    novo.Game.core.retomarPartidaAposRecarregar();
    novo.Game.core.mostrarFimDeJogo();
    check(showedFinalRanking(telas, ranking), 'o host deveria ver a tela final com o mesmo ranking, viu: ' + telas.map(t => t.nome).join(', '));
    check(novo.state.currentRound === null && novo.broadcastsOfType('round-start').length === 0 && novo.broadcastsOfType('show-evento').length === 0,
        'nenhuma dupla nova pode ser sorteada');
    check(relogio.activeCount() === 0, 'o relógio da partida não pode voltar a contar');
    check(roundScreens(novo).length === 0, 'nenhuma tela de rodada deveria aparecer');

    // main.js: com o fim de jogo restaurado, só chama a tela final (host e guest).
    const main = fs.readFileSync(path.join(RAIZ, 'js/main.js'), 'utf8');
    check(/if \(restaurou && state\.gameStarted && state\.gameOver\) \{\s*Game\.core\.mostrarFimDeJogo\(\);/.test(main),
        'init() deveria chamar Game.core.mostrarFimDeJogo() quando o estado restaurado é de fim de jogo');
});

test('T67 Guest volta à sala no fim de jogo: não é recusado e vê o ranking final (BUG-021)', (usar) => {
    const host = usar(createEnvironment());
    host.createRoomAsHost();
    host.join('A', 'peer-a');
    host.join('B', 'peer-b');
    host.startMatch();
    host.Game.core.endGame(host.Game.core.buildRanking());
    const ranking = host.broadcastsOfType('game-over').pop().ranking;

    // A dá F5 na tela final: cai (sai da lista, T11) e volta com o mesmo nome.
    host.drop('peer-a');
    check(!host.player('A'), 'pré-condição: quem cai no fim de jogo sai da lista');
    host.clearLog();
    host.join('A', 'peer-a2');
    check(host.rejectionFor('peer-a2') === null, 'A não deveria ser recusado no fim de jogo, veio: ' + host.rejectionFor('peer-a2'));
    check(host.player('A'), 'A deveria voltar à lista');
    const sync = syncTo(host, 'peer-a2');
    check(sync && sync.gameOver === true, 'quem volta deveria saber que a partida acabou');
    check(JSON.stringify(sync.rankingFinal) === JSON.stringify(ranking), 'quem volta deveria receber o ranking final');
    check(host.broadcastsOfType('round-start').length === 0 && host.state.gameOver === true, 'a volta de A não pode recomeçar a partida');

    const guest = usar(createEnvironment());
    const relogio = guest.fakeClock();
    const telas = recordScreens(guest);
    guest.receiveSync('A', sync);
    check(guest.state.gameOver === true, 'o guest deveria ficar com o fim de jogo');
    check(showedFinalRanking(telas, ranking), 'A deveria ver a tela final com o ranking, viu: ' + telas.map(t => t.nome).join(', '));
    check(roundScreens(guest).length === 0, 'A não pode ver tela de rodada');
    check(relogio.activeCount() === 0, 'o relógio da partida não pode voltar a contar');

    // Controle: durante a partida, quem volta recebe "partida não acabou".
    const amb2 = usar(createEnvironment());
    amb2.createRoomAsHost();
    amb2.join('A', 'peer-a');
    amb2.join('B', 'peer-b');
    amb2.startMatch();
    amb2.drop('peer-a');
    amb2.join('A', 'peer-a2');
    const sync2 = syncTo(amb2, 'peer-a2');
    check(sync2 && sync2.gameOver === false, 'durante a partida, o state-sync deveria dizer que ela não acabou');
});

test('T68 Estado salvo guarda o fim de jogo e o ranking; estado antigo restaura como antes; voltar ao lobby limpa (BUG-021)', (usar) => {
    const ranking = [{ posicao: 1, name: 'A', kpi: 30, recursos: 0, kpiFinal: 30 }, { posicao: 2, name: 'Host', kpi: 10, recursos: 0, kpiFinal: 10 }];
    const guestNaSala = (armazenamento) => {
        const g = usar(createEnvironment(armazenamento ? { armazenamento } : {}));
        g.ctx.location.search = '?' + new URLSearchParams({ host: 'false', room: 'sala', playerName: 'A', peerId: 'sala' }).toString();
        Object.assign(g.state, { isHost: false, playerName: 'A', roomName: 'sala', baseRoomPeerId: 'sala', hostPeerId: 'sala', hostVersion: 0 });
        return g;
    };

    // O guest recebe o fim de jogo do host: o estado salvo guarda os dois.
    const g = guestNaSala();
    g.state.gameStarted = true;
    g.state.players = [{ name: 'Host', peerId: 'sala', isHost: true, kpi: 10 }, { name: 'A', peerId: 'peer-a', isHost: false, kpi: 30 }];
    g.Game.network.handleMessage({ type: 'game-over', ranking }, 'sala');
    const salvo = JSON.parse(g.armazenamento['pmKPI_roomState']);
    check(salvo.gameOver === true, 'o estado salvo deveria ter gameOver');
    check(JSON.stringify(salvo.rankingFinal) === JSON.stringify(ranking), 'o estado salvo deveria ter o ranking final');

    // F5 do guest: restaura o fim de jogo e o ranking.
    const f5 = guestNaSala(g.armazenamento);
    check(f5.Game.persistence.tryRestoreState() === true, 'pré-condição: o F5 restaura o estado salvo');
    check(f5.state.gameOver === true && JSON.stringify(f5.state.rankingFinal) === JSON.stringify(ranking),
        'o F5 deveria restaurar o fim de jogo e o ranking');

    // Estado salvo antes da correção (sem os campos): restaura como antes.
    const antigo = { ...salvo };
    delete antigo.gameOver;
    delete antigo.rankingFinal;
    g.armazenamento['pmKPI_roomState'] = JSON.stringify(antigo);
    const f5Antigo = guestNaSala(g.armazenamento);
    check(f5Antigo.Game.persistence.tryRestoreState() === true, 'estado salvo antigo deveria continuar restaurando');
    check(f5Antigo.state.gameOver === false && !f5Antigo.state.rankingFinal, 'estado antigo: sem fim de jogo, como antes');

    // Voltar ao lobby limpa o fim de jogo e o ranking (também no estado salvo).
    f5.Game.core.voltarAoLobby();
    check(f5.state.gameOver === false && !f5.state.rankingFinal, 'voltar ao lobby deveria limpar o fim de jogo e o ranking');
    const depois = JSON.parse(f5.armazenamento['pmKPI_roomState']);
    check(depois.gameOver === false && !depois.rankingFinal, 'o estado salvo depois de voltar ao lobby não pode ter o ranking antigo');
});

/**
 * Partida de 4 (Host, A, B, C) com a pergunta aberta para A (o host
 * pergunta) e B sem recursos, com um pedido de ajuda em andamento.
 */
function matchWithPendingDeadlines(usar) {
    const amb = usar(createEnvironment());
    const tempo = amb.fakeTime();
    amb.createRoomAsHost();
    amb.join('A', 'peer-a');
    amb.join('B', 'peer-b');
    amb.join('C', 'peer-c');
    amb.startMatch();
    // O sorteio da dupla é aleatório: fixa os papéis e rearma o prazo de resposta de A.
    amb.state.currentRound = { ...amb.state.currentRound, perguntador: 'Host', respondedor: 'A', respondeu: false };
    amb.state.usedRespondedorThisRound = [];
    amb.Game.core.armarRespostaTimeout('A');
    Object.assign(amb.player('B'), { recursos: 0, kpi: 20 });
    amb.Game.network.handleMessage({ type: 'ajuda-request', requesterName: 'B' }, 'peer-b');
    check(amb.state.ajudaFila && amb.state.ajudaTimeout, 'pré-condição: pedido de ajuda em andamento');
    return { amb, tempo };
}

test('T72 Fim de jogo, encerrar a partida e troca de dupla cancelam os prazos pendentes (resposta, assessoria, pedido de ajuda)', (usar) => {
    // Fim de jogo com a pergunta aberta e um pedido de ajuda em andamento.
    const fim = matchWithPendingDeadlines(usar);
    check(fim.amb.state.respostaTimeout, 'pré-condição: prazo de resposta armado');
    fim.amb.Game.core.endGame(fim.amb.Game.core.buildRanking());
    const s1 = fim.amb.state;
    check(!s1.respostaTimeout && !s1.assessoriaTimeout && !s1.ajudaTimeout && !s1.ajudaFila,
        'o fim de jogo deveria zerar os prazos e o pedido de ajuda');
    check(fim.tempo.pending() === 0, 'nenhum prazo antigo pode continuar agendado, sobraram: ' + fim.tempo.pending());

    // Encerrar a partida com um pedido de assessoria pendente e o pedido de ajuda.
    const enc = matchWithPendingDeadlines(usar);
    enc.amb.Game.network.handleMessage({ type: 'assessoria-request', assessorName: 'C', requesterName: 'A' }, 'peer-a');
    check(enc.amb.state.assessoriaTimeout, 'pré-condição: prazo do assessor armado');
    enc.amb.Game.core.endMatch();
    const s2 = enc.amb.state;
    check(!s2.respostaTimeout && !s2.assessoriaTimeout && !s2.ajudaTimeout && !s2.ajudaFila,
        'encerrar a partida deveria zerar os prazos e o pedido de ajuda');
    check(enc.tempo.pending() === 0, 'nenhum prazo antigo pode continuar agendado, sobraram: ' + enc.tempo.pending());
    enc.amb.clearLog();
    enc.tempo.advance(enc.amb.CONFIG.JOGO.RESPOSTA_TIMEOUT * 2);
    check(enc.amb.registro.broadcasts.length === 0 && enc.amb.registro.enviados.length === 0,
        'depois de encerrar, nada pode ser enviado por prazo antigo');

    // Troca de dupla (quem responde cai com a assessoria pendente): os prazos
    // da rodada são cancelados, mas o pedido de ajuda continua.
    const troca = matchWithPendingDeadlines(usar);
    troca.amb.Game.network.handleMessage({ type: 'assessoria-request', assessorName: 'C', requesterName: 'A' }, 'peer-a');
    troca.amb.drop('peer-a');
    const s3 = troca.amb.state;
    check(s3.currentRound && s3.currentRound.respondedor !== 'A', 'pré-condição: nova dupla sem A');
    check(!s3.assessoriaTimeout, 'o prazo do assessor da pergunta descartada deveria ser cancelado');
    check(s3.ajudaFila && s3.ajudaTimeout, 'o pedido de ajuda continua entre uma dupla e outra');
    check(troca.tempo.pending() === 2, 'deveriam sobrar só o prazo de resposta da nova dupla e o do pedido de ajuda, sobraram: ' + troca.tempo.pending());
});

finish('Fim de partida e lobby');
