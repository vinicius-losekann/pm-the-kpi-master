// ============================================
// PM: The KPI Master - Testes de lógica: Troca de host
// ============================================
// O rodízio da rodada (quem já respondeu) chega a todos, para quem
// assumir como host continuar de onde parou. A troca de host pelo canal
// da sala ainda não existe: os testes dela voltam com o mecanismo novo.
// Ambiente simulado e ajudantes: environment.js. Rodar a partir da raiz:
//     node tests/logic/host-migration.test.js
// ============================================

const {
    createEnvironment, test, check, start, finish, syncTo
} = require('./environment');

start('Troca de host');

test('T49 Quem já respondeu na rodada chega aos guests (resposta, nova dupla, reconexão) e fica guardado', (use) => {
    const host = use(createEnvironment());
    host.createRoomAsHost();
    host.join('A', 'peer-a');
    host.join('B', 'peer-b');
    host.startMatch();
    const rs0 = host.broadcastsOfType('round-start').pop();
    check(rs0 && Array.isArray(rs0.answeredThisRound) && rs0.answeredThisRound.length === 0, 'rodada nova: round-start com a lista vazia');

    const r = host.state.currentRound;
    host.Game.core.handleAnswer({ alternative: r.question.correct, playerName: r.answerer });
    const kpi = host.broadcastsOfType('kpi-update').find(m => m.playerName === r.answerer);
    check(kpi && Array.isArray(kpi.answeredThisRound) && kpi.answeredThisRound.includes(r.answerer),
        'a atualização da resposta deveria levar a lista já com quem respondeu, veio: ' + JSON.stringify(kpi && kpi.answeredThisRound));

    host.Game.core.nextTurn();
    const rs1 = host.broadcastsOfType('round-start').pop();
    check(rs1 !== rs0 && rs1.answeredThisRound.includes(r.answerer), 'a próxima dupla deveria levar a lista');

    const other = ['A', 'B'].find(n => n !== r.answerer && n !== 'Host') || 'A';
    host.drop('peer-' + other.toLowerCase());
    host.join(other, 'peer-' + other.toLowerCase());
    const sync = syncTo(host, 'peer-' + other.toLowerCase());
    check(sync && JSON.stringify(sync.answeredThisRound) === JSON.stringify(host.state.answeredThisRound),
        'quem reconecta deveria receber a lista, veio: ' + JSON.stringify(sync && sync.answeredThisRound));

    // Lado do guest.
    const g = use(createEnvironment());
    g.state.isHost = false;
    g.state.playerName = 'B';
    g.state.players = [{ name: 'A', kpi: 0 }, { name: 'B', kpi: 0 }];
    g.Game.network.handleMessage({ type: 'kpi-update', playerName: 'A', kpi: 10, focusArea: 'initiating', activities: 1, resources: 10, answeredThisRound: ['A'] }, 'sala');
    check(JSON.stringify(g.state.answeredThisRound) === '["A"]', 'guest deveria guardar a lista da resposta');
    g.Game.network.handleMessage({ type: 'round-start', event: { id: 'e1' }, asker: 'A', answerer: 'B', answeredThisRound: ['A', 'C'] }, 'sala');
    check(JSON.stringify(g.state.answeredThisRound) === '["A","C"]', 'guest deveria guardar a lista da nova dupla');
    g.Game.network.handleMessage({ type: 'kpi-update', playerName: 'A', kpi: 15, focusArea: 'initiating', activities: 1, resources: 11, supportOutcome: 'fee', supportAmount: 1, supportPartner: 'B' }, 'sala');
    check(JSON.stringify(g.state.answeredThisRound) === '["A","C"]', 'mensagem sem a lista não deveria apagar a lista');
    g.receiveSync('B', { players: [], decks: {}, timer: 500, gameStarted: true, currentRound: null, answeredThisRound: ['Host'] });
    check(JSON.stringify(g.state.answeredThisRound) === '["Host"]', 'guest deveria guardar a lista da reconexão');

    // O host nunca troca a própria lista pela de uma mensagem.
    host.state.answeredThisRound = ['Host'];
    host.Game.network.handleMessage({ type: 'round-start', event: { id: 'e1' }, asker: 'A', answerer: 'B', answeredThisRound: [] }, 'peer-a');
    check(JSON.stringify(host.state.answeredThisRound) === '["Host"]', 'host não deveria sobrescrever a própria lista');
});

finish('Troca de host');
