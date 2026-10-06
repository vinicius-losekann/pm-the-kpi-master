// ============================================
// PM: The KPI Master - Testes de lógica: Fim de partida e lobby
// ============================================
// Sair da partida, fim de jogo, encerrar a partida e voltar ao lobby.
// Ambiente simulado e ajudantes: environment.js. Rodar a partir da raiz:
//     node tests/logic/end-of-match.test.js
// ============================================

const {
    fs, path, vm, ROOT, createEnvironment, tokenOf, test, check, start, finish,
    syncTo, roundScreens, unavailable, roomToReload, reloadHost, tryReloadHost, recordScreens
} = require('./environment');

start('Fim de partida e lobby');

test('T7  Falta de jogador de verdade (sair da partida) ainda encerra', (use) => {
    const env = use(createEnvironment());
    env.createRoomAsHost();
    env.join('A', 'peer-a');
    env.startMatch();
    env.Game.network.handleMessage({ type: 'leave-match-request', playerName: 'A' }, 'peer-a');
    check(env.state.gameOver === true, 'partida deveria ter sido encerrada');
    check(!env.state.matchPaused, 'não deveria pausar quando falta jogador de verdade');
});

test('T11 Fim de jogo: quem cai é removido (como antes)', (use) => {
    const env = use(createEnvironment());
    env.createRoomAsHost();
    env.join('A', 'peer-a');
    env.join('B', 'peer-b');
    env.startMatch();
    env.state.gameOver = true;
    env.drop('peer-a');
    check(!env.player('A'), 'A deveria ter sido removido após o fim de jogo');
});

test('T14 Encerrar partida: desconectado que não voltou sai da lista do lobby', (use) => {
    const env = use(createEnvironment());
    env.createRoomAsHost();
    env.join('A', 'peer-a');
    env.join('B', 'peer-b');
    env.startMatch();
    env.drop('peer-a');
    check(env.player('A') && env.player('A').disconnected, 'pré-condição: A marcado como desconectado');

    env.clearLog();
    env.Game.core.endMatch();
    check(!env.player('A'), 'A deveria ter saído da lista ao voltar ao lobby');
    check(env.player('B') && env.player('Host'), 'Host e B (conectados) deveriam continuar');
    check(env.state.backupPeerId === 'peer-b', 'backup era A — deveria passar para B, veio: ' + env.state.backupPeerId);
    const ended = env.broadcastsOfType('match-ended').pop();
    check(ended && !ended.players.some(p => p.name === 'A'), 'match-ended deveria levar a lista sem A');

    // No lobby, A pode voltar normalmente como jogador novo.
    env.join('A', 'peer-a2');
    check(env.rejectionFor('peer-a2') === null, 'A deveria conseguir entrar de novo, veio: ' + env.rejectionFor('peer-a2'));
    check(env.player('A') && !env.player('A').disconnected, 'A deveria estar de volta na lista');
});

test('T15 Encerrar partida pausada: pausa não sobra para a próxima partida', (use) => {
    const env = use(createEnvironment());
    env.createRoomAsHost();
    env.join('A', 'peer-a');
    env.startMatch();
    env.drop('peer-a');
    check(env.state.matchPaused, 'pré-condição: partida pausada');

    env.Game.core.endMatch();
    check(!env.state.matchPaused, 'a pausa deveria ter sido desfeita ao encerrar');
    check(!env.player('A'), 'A deveria ter saído da lista');
    check(env.state.players.length === 1, 'só o host deveria sobrar na sala');
});

test('T16 Voltar ao lobby após o fim de jogo (host): limpa desconectados e avisa os guests', (use) => {
    const env = use(createEnvironment());
    env.createRoomAsHost();
    env.join('A', 'peer-a');
    env.join('B', 'peer-b');
    env.startMatch();
    env.drop('peer-a');
    env.Game.core.endGame(env.Game.core.buildRanking());
    check(env.state.gameOver && env.player('A'), 'pré-condição: fim de jogo com A ainda na lista');

    env.clearLog();
    env.Game.core.backToLobby();
    check(!env.player('A'), 'A deveria ter saído da lista');
    check(env.player('B'), 'B deveria continuar');
    check(!env.state.gameStarted && !env.state.gameOver && env.state.currentRound === null, 'estado da partida deveria estar zerado');
    const list = env.broadcastsOfType('player-list').pop();
    check(list && !list.players.some(p => p.name === 'A'), 'host deveria mandar player-list sem A para os guests');

    env.join('C', 'peer-c');
    check(env.rejectionFor('peer-c') === null, 'no lobby, nome novo deveria entrar, veio: ' + env.rejectionFor('peer-c'));
});

test('T16b Voltar ao lobby (guest): limpa só a cópia local, sem mandar nada', (use) => {
    const env = use(createEnvironment());
    env.state.isHost = false;
    env.state.playerName = 'B';
    env.state.gameStarted = true;
    env.state.gameOver = true;
    env.state.players = [
        { name: 'Host', peerId: 'peer-host', isHost: true },
        { name: 'A', peerId: 'peer-a', isHost: false, disconnected: true },
        // O próprio jogador nunca é removido da própria lista, mesmo
        // que uma lista antiga o mostre como desconectado.
        { name: 'B', peerId: 'peer-b', isHost: false, disconnected: true }
    ];
    env.Game.core.backToLobby();
    check(!env.player('A'), 'A deveria ter saído da lista local');
    check(env.player('B'), 'B nunca deveria remover a si mesmo');
    check(env.record.broadcasts.length === 0, 'guest não deveria mandar nada');
});

test('T48 Guest sai da partida e ela acaba: no lobby, o host consegue iniciar outra', (use) => {
    const env = use(createEnvironment());
    env.createRoomAsHost();
    env.join('A', 'peer-a');
    env.startMatch();
    env.player('A').kpi = 12;

    // A sai da partida: com 2 jogadores, a partida acaba (T7).
    env.Game.core.handleLeaveMatchRequest({ playerName: 'A' });
    check(env.player('A').waitingInLobby, 'pré-condição: A aguardando no lobby');
    if (!env.state.gameOver) env.Game.core.endGame(env.Game.core.buildRanking());

    env.clearLog();
    env.Game.core.backToLobby();
    const a = env.player('A');
    check(a && a.waitingInLobby === false, 'A deveria deixar de estar "aguardando no lobby"');
    check(a.kpi === 0 && a.resources === env.CONFIG.STARTING_RESOURCES, 'jogadores voltam zerados, como ao encerrar a partida');
    check(env.Game.getActivePlayers().length === 2, 'os 2 jogadores deveriam contar para iniciar, contam ' + env.Game.getActivePlayers().length);
    const list = env.broadcastsOfType('player-list').pop();
    check(list && list.players.find(p => p.name === 'A').waitingInLobby === false,
        'o host deveria mandar a lista atualizada aos guests, mesmo sem ninguém removido');

    env.startMatch();
    check(env.state.gameStarted && !env.state.gameOver && env.state.currentRound, 'deveria conseguir iniciar outra partida');
});

// ============================================
// BUG-021 — F5 E VOLTA NA TELA DE FIM DE JOGO
// ============================================

/** Chamadas de tela com o nome informado (registro de recordScreens). */
function screenCalls(screens, name) {
    return screens.filter(t => t.name === name);
}

/** A tela final apareceu, com o ranking informado? */
function showedFinalRanking(screens, ranking) {
    const final = screenCalls(screens, 'displayFinalRanking').pop();
    return screenCalls(screens, 'showScreen').some(t => t.args[0] === 'gameover') &&
        !!final && JSON.stringify(final.args[0]) === JSON.stringify(ranking);
}

test('T66 F5 do host no fim de jogo: volta ao ranking final e a partida não recomeça (BUG-021)', (use) => {
    // A partida acaba porque alguém completou a última fase (ainda sobra tempo).
    const env = use(createEnvironment());
    const time = env.fakeTime();
    roomToReload(env);
    env.join('A', 'peer-a');
    env.join('B', 'peer-b');
    env.startMatch();
    const r = env.state.currentRound;
    const lastFocusArea = env.CONFIG.FOCUS_AREAS[env.CONFIG.FOCUS_AREAS.length - 1].id;
    Object.assign(env.player(r.answerer), { focusArea: lastFocusArea, activities: env.CONFIG.GAME.ACTIVITIES_PER_FOCUS_AREA - 1 });
    env.Game.core.handleAnswer({ alternative: r.question.correct, playerName: r.answerer });
    time.advance(3000);
    check(env.state.gameOver === true && env.state.timer > 0, 'pré-condição: a partida acabou antes do tempo');
    const ranking = env.broadcastsOfType('game-over').pop().ranking;

    const reloaded = use(reloadHost(env));
    const clock = reloaded.fakeClock();
    reloaded.fakeTime();
    const screens = recordScreens(reloaded);
    check(reloaded.state.gameOver === true, 'o fim de jogo deveria ser restaurado do estado salvo');
    // O ranking mostrado é o do fim da partida, não um recalculado agora.
    reloaded.player(r.answerer).kpi = 999;
    reloaded.Game.core.resumeMatchAfterReload();
    reloaded.Game.core.showGameOver();
    check(showedFinalRanking(screens, ranking), 'o host deveria ver a tela final com o mesmo ranking, viu: ' + screens.map(t => t.name).join(', '));
    check(reloaded.state.currentRound === null && reloaded.broadcastsOfType('round-start').length === 0 && reloaded.broadcastsOfType('show-event').length === 0,
        'nenhuma dupla nova pode ser sorteada');
    check(clock.activeCount() === 0, 'o relógio da partida não pode voltar a contar');
    check(roundScreens(reloaded).length === 0, 'nenhuma tela de rodada deveria aparecer');

    // main.js: com o fim de jogo restaurado, só chama a tela final (host e guest).
    const main = fs.readFileSync(path.join(ROOT, 'js/main.js'), 'utf8');
    check(/if \(restored && state\.gameStarted && state\.gameOver\) \{\s*Game\.core\.showGameOver\(\);/.test(main),
        'init() deveria chamar Game.core.showGameOver() quando o estado restaurado é de fim de jogo');
});

test('T67 Guest volta à sala no fim de jogo: não é recusado e vê o ranking final (BUG-021)', (use) => {
    const host = use(createEnvironment());
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
    check(JSON.stringify(sync.finalRanking) === JSON.stringify(ranking), 'quem volta deveria receber o ranking final');
    check(host.broadcastsOfType('round-start').length === 0 && host.state.gameOver === true, 'a volta de A não pode recomeçar a partida');

    const guest = use(createEnvironment());
    const clock = guest.fakeClock();
    const screens = recordScreens(guest);
    guest.receiveSync('A', sync);
    check(guest.state.gameOver === true, 'o guest deveria ficar com o fim de jogo');
    check(showedFinalRanking(screens, ranking), 'A deveria ver a tela final com o ranking, viu: ' + screens.map(t => t.name).join(', '));
    check(roundScreens(guest).length === 0, 'A não pode ver tela de rodada');
    check(clock.activeCount() === 0, 'o relógio da partida não pode voltar a contar');

    // Controle: durante a partida, quem volta recebe "partida não acabou".
    const env2 = use(createEnvironment());
    env2.createRoomAsHost();
    env2.join('A', 'peer-a');
    env2.join('B', 'peer-b');
    env2.startMatch();
    env2.drop('peer-a');
    env2.join('A', 'peer-a2');
    const sync2 = syncTo(env2, 'peer-a2');
    check(sync2 && sync2.gameOver === false, 'durante a partida, o state-sync deveria dizer que ela não acabou');
});

test('T68 Estado salvo guarda o fim de jogo e o ranking; estado antigo restaura como antes; voltar ao lobby limpa (BUG-021)', (use) => {
    const ranking = [{ position: 1, name: 'A', kpi: 30, resources: 0, finalKpi: 30 }, { position: 2, name: 'Host', kpi: 10, resources: 0, finalKpi: 10 }];
    const guestInRoom = (storage) => {
        const g = use(createEnvironment(storage ? { storage } : {}));
        g.ctx.location.search = '?' + new URLSearchParams({ host: 'false', room: 'sala', playerName: 'A', peerId: 'sala' }).toString();
        Object.assign(g.state, { isHost: false, playerName: 'A', roomName: 'sala', baseRoomPeerId: 'sala', hostPeerId: 'sala', hostVersion: 0 });
        return g;
    };

    // O guest recebe o fim de jogo do host: o estado salvo guarda os dois.
    const g = guestInRoom();
    g.state.gameStarted = true;
    g.state.players = [{ name: 'Host', peerId: 'sala', isHost: true, kpi: 10 }, { name: 'A', peerId: 'peer-a', isHost: false, kpi: 30 }];
    g.Game.network.handleMessage({ type: 'game-over', ranking }, 'sala');
    const saved = JSON.parse(g.storage['pmKPI_roomState']);
    check(saved.gameOver === true, 'o estado salvo deveria ter gameOver');
    check(JSON.stringify(saved.finalRanking) === JSON.stringify(ranking), 'o estado salvo deveria ter o ranking final');

    // F5 do guest: restaura o fim de jogo e o ranking.
    const f5 = guestInRoom(g.storage);
    check(f5.Game.persistence.tryRestoreState() === true, 'pré-condição: o F5 restaura o estado salvo');
    check(f5.state.gameOver === true && JSON.stringify(f5.state.finalRanking) === JSON.stringify(ranking),
        'o F5 deveria restaurar o fim de jogo e o ranking');

    // Estado salvo antes da correção (sem os campos): restaura como antes.
    const old = { ...saved };
    delete old.gameOver;
    delete old.finalRanking;
    g.storage['pmKPI_roomState'] = JSON.stringify(old);
    const f5Old = guestInRoom(g.storage);
    check(f5Old.Game.persistence.tryRestoreState() === true, 'estado salvo antigo deveria continuar restaurando');
    check(f5Old.state.gameOver === false && !f5Old.state.finalRanking, 'estado antigo: sem fim de jogo, como antes');

    // Voltar ao lobby limpa o fim de jogo e o ranking (também no estado salvo).
    f5.Game.core.backToLobby();
    check(f5.state.gameOver === false && !f5.state.finalRanking, 'voltar ao lobby deveria limpar o fim de jogo e o ranking');
    const after = JSON.parse(f5.storage['pmKPI_roomState']);
    check(after.gameOver === false && !after.finalRanking, 'o estado salvo depois de voltar ao lobby não pode ter o ranking antigo');
});

/**
 * Partida de 4 (Host, A, B, C) com a pergunta aberta para A (o host
 * pergunta) e B sem recursos, com um pedido de ajuda em andamento.
 */
function matchWithPendingDeadlines(use) {
    const env = use(createEnvironment());
    const time = env.fakeTime();
    env.createRoomAsHost();
    env.join('A', 'peer-a');
    env.join('B', 'peer-b');
    env.join('C', 'peer-c');
    env.startMatch();
    // O sorteio da dupla é aleatório: fixa os papéis e rearma o prazo de resposta de A.
    env.state.currentRound = { ...env.state.currentRound, asker: 'Host', answerer: 'A', answered: false };
    env.state.answeredThisRound = [];
    env.Game.core.armAnswerTimeout('A');
    Object.assign(env.player('B'), { resources: 0, kpi: 20 });
    env.Game.network.handleMessage({ type: 'help-request', requesterName: 'B' }, 'peer-b');
    check(env.state.helpQueue && env.state.helpTimeout, 'pré-condição: pedido de ajuda em andamento');
    return { env, time };
}

test('T72 Fim de jogo, encerrar a partida e troca de dupla cancelam os prazos pendentes (resposta, assessoria, pedido de ajuda)', (use) => {
    // Fim de jogo com a pergunta aberta e um pedido de ajuda em andamento.
    const gameOver = matchWithPendingDeadlines(use);
    check(gameOver.env.state.answerTimeout, 'pré-condição: prazo de resposta armado');
    gameOver.env.Game.core.endGame(gameOver.env.Game.core.buildRanking());
    const s1 = gameOver.env.state;
    check(!s1.answerTimeout && !s1.advisoryTimeout && !s1.helpTimeout && !s1.helpQueue,
        'o fim de jogo deveria zerar os prazos e o pedido de ajuda');
    check(gameOver.time.pending() === 0, 'nenhum prazo antigo pode continuar agendado, sobraram: ' + gameOver.time.pending());

    // Encerrar a partida com um pedido de assessoria pendente e o pedido de ajuda.
    const ended = matchWithPendingDeadlines(use);
    ended.env.Game.network.handleMessage({ type: 'advisory-request', advisorName: 'C', requesterName: 'A' }, 'peer-a');
    check(ended.env.state.advisoryTimeout, 'pré-condição: prazo do assessor armado');
    ended.env.Game.core.endMatch();
    const s2 = ended.env.state;
    check(!s2.answerTimeout && !s2.advisoryTimeout && !s2.helpTimeout && !s2.helpQueue,
        'encerrar a partida deveria zerar os prazos e o pedido de ajuda');
    check(ended.time.pending() === 0, 'nenhum prazo antigo pode continuar agendado, sobraram: ' + ended.time.pending());
    ended.env.clearLog();
    ended.time.advance(ended.env.CONFIG.GAME.ANSWER_TIMEOUT * 2);
    check(ended.env.record.broadcasts.length === 0 && ended.env.record.sent.length === 0,
        'depois de encerrar, nada pode ser enviado por prazo antigo');

    // Troca de dupla (quem responde cai com a assessoria pendente): os prazos
    // da rodada são cancelados, mas o pedido de ajuda continua.
    const swap = matchWithPendingDeadlines(use);
    swap.env.Game.network.handleMessage({ type: 'advisory-request', advisorName: 'C', requesterName: 'A' }, 'peer-a');
    swap.env.drop('peer-a');
    const s3 = swap.env.state;
    check(s3.currentRound && s3.currentRound.answerer !== 'A', 'pré-condição: nova dupla sem A');
    check(!s3.advisoryTimeout, 'o prazo do assessor da pergunta descartada deveria ser cancelado');
    check(s3.helpQueue && s3.helpTimeout, 'o pedido de ajuda continua entre uma dupla e outra');
    check(swap.time.pending() === 2, 'deveriam sobrar só o prazo de resposta da nova dupla e o do pedido de ajuda, sobraram: ' + swap.time.pending());
});

/**
 * buildRanking() real com o CONFIG real (5 áreas foco, FINAL_RESOURCE_VALUE
 * do jogo). Devolve { rank(players), C }; rank devolve uma cópia simples.
 */
function realRanking() {
    const ctx = vm.createContext({});
    vm.runInContext('var window = this;' + fs.readFileSync(path.join(ROOT, 'config/game-config.js'), 'utf8'), ctx);
    vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/domain/rankingRules.js'), 'utf8'), ctx);
    const C = vm.runInContext('CONFIG', ctx);
    return { C, rank: (players) => JSON.parse(JSON.stringify(ctx.Game.domain.ranking.buildRanking(players, C))) };
}

test('T100 Desempate do ranking: mesmo KPI Final → quem avançou mais na trilha, depois quem tem mais KPI; empate total divide a posição', () => {
    const { C, rank } = realRanking();
    const v = C.KPI.FINAL_RESOURCE_VALUE;
    const area = (id) => C.FOCUS_AREAS.findIndex(f => f.id === id);
    check(area('executing') === 2 && area('monitoringControlling') === 3 && area('closing') === 4, 'pré-condição: ordem das áreas foco do config real');
    const player = (name, kpi, resources, focusArea, activities) => ({ name, kpi, resources, focusArea, activities, isHost: name === 'Host', waitingInLobby: false });
    const names = (r) => r.map(p => p.name).join(',');
    const positions = (r) => r.map(p => p.position).join(',');

    // 1) Mesmo KPI Final: a área foco mais adiantada vence, pela ORDEM das
    // áreas no config (não pela ordem alfabética dos IDs, nem pela lista).
    let r = rank([player('Host', 50, 2, 'executing', 1), player('A', 50, 2, 'monitoringControlling', 0), player('C', 50, 2, 'closing', 0)]);
    check(names(r) === 'C,A,Host' && positions(r) === '1,2,3',
        'mesmo KPI Final: Encerramento, Monitoramento, Execução (posições 1, 2, 3), veio: ' + names(r) + ' / ' + positions(r));

    // 2) Mesma área foco: mais atividades concluídas vence.
    r = rank([player('Y', 30, 4, 'planning', 0), player('X', 30, 4, 'planning', 1)]);
    check(names(r) === 'X,Y' && positions(r) === '1,2', 'mesma área foco: mais atividades vence, veio: ' + names(r) + ' / ' + positions(r));

    // 3) Mesmo KPI Final e mesmo progresso: mais KPI de jogo (menos recursos) vence.
    r = rank([player('P', 40, 4, 'planning', 1), player('Q', 40 + v * 2, 2, 'planning', 1)]);
    check(r[0].finalKpi === r[1].finalKpi, 'pré-condição: mesmo KPI Final');
    check(names(r) === 'Q,P' && positions(r) === '1,2', 'mesmo KPI Final e progresso: mais KPI vence, veio: ' + names(r) + ' / ' + positions(r));

    // 4) O KPI Final continua decidindo primeiro: progresso não passa à frente.
    r = rank([player('S', 60, 0, 'closing', 1), player('R', 70, 0, 'initiating', 0)]);
    check(names(r) === 'R,S' && positions(r) === '1,2', 'KPI Final maior vence mesmo com menos progresso, veio: ' + names(r));

    // 5) Empate em tudo: mesma posição, e a seguinte pula (1, 1, 3).
    r = rank([player('Host', 40, 2, 'planning', 1), player('U', 40, 2, 'planning', 1), player('V', 30, 2, 'planning', 1)]);
    check(positions(r) === '1,1,3' && r[2].name === 'V', 'empate total deveria dividir a posição (1, 1, 3), veio: ' + names(r) + ' / ' + positions(r));
    r = rank([player('T', 40, 2, 'planning', 1), player('U', 40, 2, 'planning', 1), player('W', 90, 0, 'closing', 0), player('Z', 10, 0, 'initiating', 0)]);
    check(names(r).startsWith('W,') && positions(r) === '1,2,2,4', 'empate no 2º lugar: posições 1, 2, 2, 4, veio: ' + names(r) + ' / ' + positions(r));

    // 6) Sem empate: como antes (KPI Final, posições 1..n) e os campos do ranking.
    r = rank([player('B', 10, 1, 'initiating', 0), player('A', 30, 0, 'planning', 0), player('C', 20, 3, 'initiating', 1)]);
    check(names(r) === 'C,A,B' && positions(r) === '1,2,3', 'sem empate, a ordem é a do KPI Final, veio: ' + names(r));
    check(r[0].finalKpi === 20 + 3 * v && r[0].kpi === 20 && r[0].resources === 3 && r[0].focusArea === 'initiating' &&
        r[0].activities === 1 && r[0].isHost === false && r[0].waitingInLobby === false,
        'o ranking deveria manter os campos de cada jogador, veio: ' + JSON.stringify(r[0]));
});

test('T101 Telas do ranking com empate: medalha pela posição (empate divide a medalha) e aviso do critério de desempate na tela final', (use) => {
    const env = use(createEnvironment());
    const elements = {};
    env.ctx.document = {
        getElementById: (id) => elements[id] || (elements[id] = { id, textContent: '', innerHTML: '', style: {} }),
        querySelectorAll: () => []
    };
    for (const file of ['js/utils/sanitize.js', 'js/domain/rankingRules.js', 'js/ui/components/rankingComponent.js']) {
        vm.runInContext(fs.readFileSync(path.join(ROOT, file), 'utf8'), env.ctx, { filename: file });
    }
    const first = env.CONFIG.FOCUS_AREAS[0].id;
    const count = (text, piece) => text.split(piece).length - 1;
    env.state.players = [
        { name: 'Host', kpi: 20, resources: 0, focusArea: first, activities: 0, waitingInLobby: false },
        { name: 'A', kpi: 20, resources: 0, focusArea: first, activities: 0, waitingInLobby: false },
        { name: 'B', kpi: 10, resources: 0, focusArea: first, activities: 0, waitingInLobby: false }
    ];
    const tied = env.Game.core.buildRanking();
    check(tied.map(p => p.position).join() === '1,1,3', 'pré-condição: empate total no 1º lugar, veio: ' + JSON.stringify(tied));

    // Tela final: duas medalhas de ouro, B com a de bronze (3º), e o aviso.
    env.ctx.displayFinalRanking(tied);
    const final = elements.finalRanking.innerHTML;
    check(count(final, '🥇') === 2 && count(final, '🥈') === 0 && count(final, '🥉') === 1,
        'empate no 1º: 🥇 🥇 🥉, veio: ' + final);
    check(count(final, 'top-1') === 2 && count(final, 'top-3') === 1 && count(final, 'top-2') === 0,
        'as cores do pódio deveriam seguir a posição (top-1, top-1, top-3), veio: ' + final);
    const note = elements.tiebreakNote;
    check(note && note.textContent === 'ranking.tiebreakNote' && note.style.display === 'block',
        'com empate no KPI Final, a tela final deveria mostrar o critério de desempate (tiebreakNote), veio: ' + JSON.stringify(note));

    // Ranking parcial (ao lado do jogo): mesma regra de medalha.
    env.ctx.updateRankingList();
    const side = elements.rankingList.innerHTML;
    check(count(side, '🥇') === 2 && count(side, '🥉') === 1 && count(side, '🥈') === 0, 'ranking parcial com empate: 🥇 🥇 🥉, veio: ' + side);

    // Empate no KPI Final resolvido pelo progresso: medalhas na ordem, e o
    // aviso aparece (explica por que A ficou à frente do Host).
    const second = env.CONFIG.FOCUS_AREAS[1].id;
    env.state.players[1].focusArea = second;
    env.ctx.displayFinalRanking(env.Game.core.buildRanking());
    const resolved = elements.finalRanking.innerHTML;
    check(count(resolved, '🥇') === 1 && count(resolved, '🥈') === 1 && count(resolved, '🥉') === 1 &&
        resolved.indexOf('>A<') < resolved.indexOf('>Host<'),
        'empate no KPI Final resolvido pela área foco: A (🥇) à frente do Host (🥈), veio: ' + resolved);
    check(elements.tiebreakNote.style.display === 'block', 'empate no KPI Final resolvido pelo desempate também deveria mostrar o aviso');

    // Sem empate no KPI Final: medalhas na ordem e o aviso escondido.
    env.state.players[1].kpi = 15;
    env.ctx.displayFinalRanking(env.Game.core.buildRanking());
    const plain = elements.finalRanking.innerHTML;
    check(count(plain, '🥇') === 1 && count(plain, '🥈') === 1 && count(plain, '🥉') === 1, 'sem empate: 🥇 🥈 🥉, veio: ' + plain);
    check(elements.tiebreakNote.style.display === 'none', 'sem empate no KPI Final, o aviso do desempate deveria ficar escondido');
});

finish('Fim de partida e lobby');
