// ============================================
// PM: The KPI Master - Testes de lógica: Fim de partida e lobby
// ============================================
// Sair da partida, fim de jogo, encerrar a partida e voltar ao lobby.
// Ambiente simulado e ajudantes: environment.js. Rodar a partir da raiz:
//     node tests/logic/end-of-match.test.js
// ============================================

const {
    fs, path, vm, RAIZ, createEnvironment, tokenOf, test, check, start, finish,
    syncTo, roundScreens, unavailable, roomToReload, reloadHost, tryReloadHost
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

finish('Fim de partida e lobby');
