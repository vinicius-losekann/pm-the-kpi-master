// ============================================
// PM: The KPI Master - Testes de lógica: Queda e volta de jogador
// ============================================
// Jogador que cai e volta: lugar reservado, rodada abortada, pausa por
// falta de conexão, saída da página e o que quem volta recebe (relógio,
// situação da rodada).
// Ambiente simulado e ajudantes: environment.js. Rodar a partir da raiz:
//     node tests/logic/drop-and-return.test.js
// ============================================

const {
    fs, path, vm, RAIZ, createEnvironment, tokenOf, test, check, start, finish,
    syncTo, roundScreens, unavailable, roomToReload, reloadHost, tryReloadHost, recordScreens
} = require('./environment');

start('Queda e volta de jogador');

test('T4  Queda de espectador: fica na lista, fora do sorteio, volta com tudo preservado', (usar) => {
    const amb = usar(createEnvironment());
    amb.createRoomAsHost();
    amb.join('A', 'peer-a');
    amb.join('B', 'peer-b');
    amb.startMatch();
    const a = amb.player('A');
    Object.assign(a, { kpi: 7, recursos: 4, phase: 'planejamento', activities: 1 });
    amb.state.currentRound = { evento: { id: 'e1' }, perguntador: 'Host', respondedor: 'B', pergunta: null, respondeu: false };

    amb.clearLog();
    amb.drop('peer-a');
    check(amb.player('A'), 'A não deveria ter sido removido');
    check(amb.player('A').disconnected === true, 'A deveria estar marcado como disconnected');
    check(!amb.Game.getActivePlayers().some(p => p.name === 'A'), 'A não deveria estar entre os ativos');
    check(amb.state.currentRound && amb.state.currentRound.respondedor === 'B', 'rodada de espectador não deveria ser abortada');
    const lista = amb.broadcastsOfType('player-list').pop();
    check(lista && lista.players.find(p => p.name === 'A').disconnected === true, 'player-list enviado deveria mostrar A desconectado');

    amb.join('A', 'peer-a2');
    const volta = amb.player('A');
    check(!volta.disconnected, 'A deveria voltar como conectado');
    check(volta.peerId === 'peer-a2', 'peerId de A deveria ser o novo');
    check(volta.kpi === 7 && volta.recursos === 4 && volta.phase === 'planejamento' && volta.activities === 1,
        'KPI/recursos/fase/atividades de A deveriam estar preservados');
    check(amb.registro.enviados.some(e => e.para === 'peer-a2' && e.msg.type === 'state-sync'), 'A deveria receber state-sync');

    // 'close' atrasado da conexão antiga não pode derrubar o jogador de novo.
    amb.Game.network.handlePlayerDisconnect('peer-a');
    check(!amb.player('A').disconnected, 'close atrasado da conexão antiga não deveria marcar A como desconectado');
});

test('T5  Queda de participante: rodada abortada, nova dupla sem ele', (usar) => {
    for (let i = 0; i < 20; i++) {
        const amb = usar(createEnvironment());
        amb.createRoomAsHost();
        amb.join('A', 'peer-a');
        amb.join('B', 'peer-b');
        amb.startMatch();
        amb.state.currentRound = { evento: { id: 'e1' }, perguntador: 'Host', respondedor: 'A', pergunta: null, respondeu: false };

        amb.drop('peer-a');
        const r = amb.state.currentRound;
        check(r, 'deveria haver uma nova rodada (rodada ' + i + ')');
        check(r.perguntador !== 'A' && r.respondedor !== 'A', 'A desconectado não pode ser sorteado (rodada ' + i + ')');
    }
});

test('T6  Pausa quando falta só conexão, retomada com o mesmo evento', (usar) => {
    const amb = usar(createEnvironment());
    amb.createRoomAsHost();
    amb.join('A', 'peer-a');
    amb.startMatch();

    amb.clearLog();
    amb.drop('peer-a');
    check(!amb.state.gameOver, 'partida NÃO deveria ter sido encerrada');
    check(amb.state.partidaPausada, 'partida deveria estar pausada');
    check(amb.state.currentRound === null, 'não deveria haver rodada durante a pausa');
    check(amb.broadcastsOfType('partida-pausada').length === 1, 'deveria ter avisado os guests da pausa');
    check(amb.registro.ui.includes('showPartidaPausadaMessage'), 'host deveria ver o aviso de pausa');
    const eventoPausado = amb.state.partidaPausada.evento;

    amb.clearLog();
    amb.join('A', 'peer-a2');
    check(!amb.state.partidaPausada, 'pausa deveria ter sido desfeita');
    check(amb.state.currentRound, 'deveria haver uma nova dupla');
    check(amb.state.currentRound.evento === eventoPausado, 'a rodada deveria continuar com o mesmo evento');
    check(amb.broadcastsOfType('round-start').length === 1, 'deveria ter enviado round-start');
    check(amb.broadcastsOfType('show-evento').length === 0, 'NÃO deveria reexibir o modal de evento');
    const iSync = amb.registro.enviados.findIndex(e => e.para === 'peer-a2' && e.msg.type === 'state-sync');
    check(iSync >= 0, 'A deveria receber state-sync ao voltar');
});

test('T8  Ciclo da rodada termina sem esperar o desconectado', (usar) => {
    const amb = usar(createEnvironment());
    amb.createRoomAsHost();
    amb.join('A', 'peer-a');
    amb.join('B', 'peer-b');
    amb.startMatch();
    const usados = ['Host', 'A'];
    const sel = amb.Game.selectors;
    check(!sel.isCycleComplete(amb.Game.getActivePlayers(), usados), 'com B conectado, o ciclo NÃO está completo');
    amb.player('B').disconnected = true;
    check(sel.isCycleComplete(amb.Game.getActivePlayers(), usados), 'com B desconectado, o ciclo deveria estar completo');
});

test('T12 Saída da página: handlers de pagehide/beforeunload registrados', (usar) => {
    const amb = usar(createEnvironment());
    check(amb.registro.listeners.includes('pagehide'), 'faltou registrar pagehide (celular)');
    check(amb.registro.listeners.includes('beforeunload'), 'faltou registrar beforeunload (desktop)');
});

test('T13 F5/fechar no host: encerra conexões sem mexer no estado do jogo', (usar) => {
    const amb = usar(createEnvironment());
    amb.createRoomAsHost();
    amb.join('A', 'peer-a');
    amb.join('B', 'peer-b');
    amb.startMatch();
    const peerFalso = { destroyed: false, destroy() { this.destroyed = true; } };
    amb.Game.network.connectionState.setPeer(peerFalso);

    const rodadaAntes = amb.state.currentRound;
    amb.clearLog();
    amb.Game.network.encerrarConexoesAoSair();
    check(peerFalso.destroyed, 'o peer deveria ter sido destruído');
    check(amb.state.players.every(p => !p.disconnected), 'nenhum jogador deveria ser marcado como desconectado pelo próprio reload do host');
    check(amb.state.currentRound === rodadaAntes, 'a rodada em andamento não deveria mudar (seria o BUG-001 de volta)');
    check(amb.registro.broadcasts.length === 0, 'não deveria enviar nada durante a saída');

    // Idempotente: rodar de novo (pagehide + beforeunload) não faz nada.
    amb.Game.network.encerrarConexoesAoSair();
    check(amb.state.currentRound === rodadaAntes, 'segunda chamada não deveria ter efeito');
});

test('T30 Guest que reconecta volta com o relógio contando segundo a segundo', (usar) => {
    const amb = usar(createEnvironment());
    const relogio = amb.fakeClock();
    const rodada = { evento: { id: 'e1' }, perguntador: 'Host', respondedor: 'B', pergunta: null, respondeu: false };
    amb.receiveSync('A', { players: [], baralhos: {}, timer: 500, currentRound: rodada, gameStarted: true, hostVersion: 0 });
    check(relogio.activeCount() === 1, 'o relógio local deveria estar ligado depois da reconexão, ligados: ' + relogio.activeCount());

    relogio.tick();
    check(amb.state.timer === 499, 'deveria contar 1 segundo, veio: ' + amb.state.timer);
    relogio.tick(9);
    check(amb.state.timer === 490 && amb.broadcastsOfType('timer-update').length === 0, 'guest conta, mas não avisa ninguém');

    // O host corrige; a contagem continua a partir do valor corrigido.
    amb.Game.network.handleMessage({ type: 'timer-update', remaining: 480 }, 'sala');
    relogio.tick();
    check(amb.state.timer === 479, 'depois do timer-update deveria seguir de 480, veio: ' + amb.state.timer);

    // Um segundo state-sync (nova reconexão) não pode ligar uma segunda contagem.
    amb.receiveSync('A', { players: [], baralhos: {}, timer: 300, currentRound: rodada, gameStarted: true, hostVersion: 0 });
    relogio.tick();
    check(relogio.activeCount() === 1 && amb.state.timer === 299, 'só pode haver uma contagem ligada, timer: ' + amb.state.timer);

    // No zero, o guest só para — quem encerra a partida é o host.
    amb.state.timer = 1;
    relogio.tick();
    check(relogio.activeCount() === 0 && !amb.state.gameOver, 'guest para no zero sem encerrar a partida sozinho');

    // No lobby, não liga relógio.
    const lobby = usar(createEnvironment());
    const relogio2 = lobby.fakeClock();
    lobby.receiveSync('A', { players: [], baralhos: {}, timer: 3600, currentRound: null, gameStarted: false, hostVersion: 0 });
    check(relogio2.activeCount() === 0, 'no lobby não deveria ligar o relógio');
});

test('T31 Relógio do host continua igual (startGame usa a mesma contagem)', (usar) => {
    const amb = usar(createEnvironment());
    const relogio = amb.fakeClock();
    amb.createRoomAsHost();
    amb.join('A', 'peer-a');
    amb.state.timer = 11;
    amb.Game.core.startGame();
    check(relogio.activeCount() === 1, 'startGame deveria ligar uma contagem');

    relogio.tick();
    const aviso = amb.broadcastsOfType('timer-update').pop();
    check(amb.state.timer === 10 && aviso && aviso.remaining === 10, 'host deveria avisar os guests a cada 10 segundos');

    amb.state.timer = 1;
    relogio.tick();
    check(amb.state.gameOver && amb.broadcastsOfType('game-over').length === 1 && relogio.activeCount() === 0,
        'no zero, o host encerra a partida');
});

test('T32 Reconexão depois do fim do ciclo: "rodada encerrada", sem reabrir a pergunta', (usar) => {
    // Cenário do teste manual: os dois responderam, o host ainda não
    // clicou em Nova Rodada, e o guest (último Perguntador) caiu e voltou.
    const host = usar(createEnvironment());
    host.createRoomAsHost();
    host.join('A', 'peer-a');
    host.startMatch();
    host.state.usedRespondedorThisRound = ['Host', 'A'];
    host.state.currentRound = {
        evento: { id: 'e1' }, perguntador: 'A', respondedor: 'Host',
        pergunta: { type: 'question', question: 'Pergunta?', alternatives: ['A', 'B', 'C', 'D'], correct: 'A' }, respondeu: true
    };
    host.Game.core.nextTurn();
    check(host.state.rodadaEncerrada === true && host.broadcastsOfType('round-ended').length === 1, 'pré-condição: ciclo encerrado');

    host.drop('peer-a');
    host.clearLog();
    host.join('A', 'peer-a2');
    const sync = syncTo(host, 'peer-a2');
    check(sync && sync.rodadaEncerrada === true && sync.partidaPausada === false, 'state-sync deveria dizer que o ciclo encerrou');
    check(host.broadcastsOfType('round-start').length === 0, 'a volta de A não deveria começar rodada nova sozinha');

    const guest = usar(createEnvironment());
    guest.receiveSync('A', sync);
    const telas = roundScreens(guest);
    check(telas.includes('showRoundEndedMessage'), 'A deveria ver "rodada encerrada", viu: ' + telas.join(', '));
    check(!telas.includes('displayQuestion') && !telas.includes('displayRoundStart'), 'A não pode ver a pergunta antiga de novo, viu: ' + telas.join(', '));

    // Host clica em Nova Rodada: o aviso some dos dois lados.
    host.Game.core.startNewRound();
    check(host.state.rodadaEncerrada === false, 'Nova Rodada deveria zerar o aviso no host');
    guest.Game.network.handleMessage(host.broadcastsOfType('round-start').pop(), 'sala');
    check(guest.state.rodadaEncerrada === false, 'round-start deveria zerar o aviso no guest');
    guest.Game.network.handleMessage({ type: 'round-ended' }, 'sala');
    check(guest.state.rodadaEncerrada === true, 'round-ended deveria marcar o aviso no guest');

    // Encerrar a partida também zera.
    host.state.rodadaEncerrada = true;
    host.Game.core.endMatch();
    check(host.state.rodadaEncerrada === false, 'encerrar a partida deveria zerar o aviso');
});

test('T33 Reconexão com a partida ainda pausada: aviso de pausa, sem pergunta', (usar) => {
    const host = usar(createEnvironment());
    host.CONFIG.JOGO.MIN_PLAYERS = 3;
    host.createRoomAsHost();
    host.join('A', 'peer-a');
    host.join('B', 'peer-b');
    host.startMatch();
    host.drop('peer-a');
    host.drop('peer-b');
    if (!host.state.partidaPausada) host.Game.core.pickNewPair(); // quedas de espectador não sorteiam dupla
    check(host.state.partidaPausada, 'pré-condição: partida pausada');

    host.clearLog();
    host.join('B', 'peer-b2'); // ainda faltam jogadores conectados
    check(host.state.partidaPausada, 'pré-condição: continua pausada');
    const sync = syncTo(host, 'peer-b2');
    check(sync && sync.partidaPausada === true, 'state-sync deveria dizer que a partida está pausada');

    const guest = usar(createEnvironment());
    guest.receiveSync('B', sync);
    const telas = roundScreens(guest);
    check(telas.includes('showPartidaPausadaMessage'), 'B deveria ver o aviso de pausa, viu: ' + telas.join(', '));
    check(!telas.includes('displayQuestion') && guest.state.currentRound === null, 'B não pode ver pergunta durante a pausa');
});

test('T34 Reconexão entre duas duplas: não reabre a pergunta; rodada em andamento continua igual', (usar) => {
    const pergunta = { type: 'question', question: 'Pergunta?', alternatives: ['A', 'B', 'C', 'D'] };

    // Pergunta já respondida, próxima dupla ainda não sorteada (~3s).
    const g1 = usar(createEnvironment());
    g1.receiveSync('B', { players: [], baralhos: {}, timer: 500, gameStarted: true, hostVersion: 0,
        currentRound: { evento: { id: 'e1' }, perguntador: 'A', respondedor: 'B', pergunta, respondeu: true },
        rodadaEncerrada: false, partidaPausada: false });
    const t1 = roundScreens(g1);
    check(t1.includes('displaySpectatorView') && !t1.includes('displayQuestion'), 'pergunta respondida não pode reabrir, viu: ' + t1.join(', '));

    // Controle: rodada em andamento, B é o Respondedor → vê a pergunta.
    const g2 = usar(createEnvironment());
    g2.receiveSync('B', { players: [], baralhos: {}, timer: 500, gameStarted: true, hostVersion: 0,
        currentRound: { evento: { id: 'e1' }, perguntador: 'A', respondedor: 'B', pergunta, respondeu: false },
        rodadaEncerrada: false, partidaPausada: false });
    const t2 = roundScreens(g2);
    check(t2.includes('displayRoundStart') && t2.includes('displayQuestion'), 'rodada em andamento deveria mostrar a pergunta, viu: ' + t2.join(', '));

    // Host antigo (sem os campos novos no state-sync): comportamento de antes.
    const g3 = usar(createEnvironment());
    g3.receiveSync('B', { players: [], baralhos: {}, timer: 500, gameStarted: true, hostVersion: 0,
        currentRound: { evento: { id: 'e1' }, perguntador: 'A', respondedor: 'B', pergunta, respondeu: false } });
    check(roundScreens(g3).includes('displayQuestion'), 'sem os campos novos, deveria seguir como antes');
});

test('T52 Retomar a pausa quando todos os conectados já responderam: encerra a rodada em vez de começar outra', (usar) => {
    const amb = usar(createEnvironment());
    amb.createRoomAsHost();
    amb.join('A', 'peer-a');
    amb.startMatch();
    const evento = { id: 'e-pausa', titulo: 'Evento pausado' };
    amb.drop('peer-a');
    amb.state.currentRound = null;
    amb.state.partidaPausada = { evento };
    amb.state.usedRespondedorThisRound = ['Host', 'A'];

    amb.clearLog();
    amb.join('A', 'peer-a2');
    check(!amb.state.partidaPausada, 'a pausa deveria acabar');
    check(amb.state.rodadaEncerrada === true, 'a rodada deveria ser encerrada, aguardando o "Nova Rodada"');
    check(amb.broadcastsOfType('round-start').length === 0, 'não pode começar dupla nova sozinha');
    check(amb.broadcastsOfType('round-ended').length === 1, 'deveria avisar os guests que a rodada acabou');
    check(JSON.stringify(amb.state.usedRespondedorThisRound) === '["Host","A"]', 'o rodízio não pode ser zerado');

    // Controle: A ainda não respondeu → a retomada sorteia A.
    const amb2 = usar(createEnvironment());
    amb2.createRoomAsHost();
    amb2.join('A', 'peer-a');
    amb2.startMatch();
    amb2.drop('peer-a');
    amb2.state.currentRound = null;
    amb2.state.partidaPausada = { evento };
    amb2.state.usedRespondedorThisRound = ['Host'];
    amb2.join('A', 'peer-a2');
    check(amb2.state.currentRound && amb2.state.currentRound.respondedor === 'A' && !amb2.state.rodadaEncerrada,
        'faltando A, a retomada deveria sortear A');
});

finish('Queda e volta de jogador');
