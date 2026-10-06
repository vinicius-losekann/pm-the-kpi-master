// ============================================
// PM: The KPI Master - Testes de lógica: Pedido de ajuda e assessoria
// ============================================
// Pedido de ajuda (fila automática de quem pode doar um recurso) e
// pedido de assessoria (o Respondedor chama outro jogador para sugerir
// uma alternativa).
// Ambiente simulado e ajudantes: environment.js. Rodar a partir da raiz:
//     node tests/logic/help-and-advisory.test.js
// ============================================

const {
    fs, path, vm, ROOT, createEnvironment, tokenOf, test, check, start, finish,
    syncTo, roundScreens, unavailable, roomToReload, reloadHost, tryReloadHost, recordScreens
} = require('./environment');

start('Pedido de ajuda e assessoria');

/**
 * Partida de 4 (Host, A, B, C). A está sem recursos e com KPI para pedir
 * ajuda; a fila de quem pode doar fica B (5), C (3), Host (1).
 */
function matchWithHelpQueue(use) {
    const env = use(createEnvironment());
    env.fakeTime();
    env.createRoomAsHost();
    env.join('A', 'peer-a');
    env.join('B', 'peer-b');
    env.join('C', 'peer-c');
    env.startMatch();
    Object.assign(env.player('A'), { resources: 0, kpi: 20 });
    Object.assign(env.player('B'), { resources: 5, kpi: 0 });
    Object.assign(env.player('C'), { resources: 3, kpi: 0 });
    Object.assign(env.player('Host'), { resources: 1, kpi: 0 });
    return env;
}

/** Ofertas de ajuda enviadas a um peer. */
function offersTo(env, peerId) {
    return env.record.sent.filter(e => e.to === peerId && e.msg.type === 'help-offer');
}

test('T69 Pedido de ajuda: quem caiu é pulado na fila; se quem pediu cai, o pedido é cancelado', (use) => {
    // C cai enquanto B decide; B recusa: o pedido vai direto ao Host.
    const env = matchWithHelpQueue(use);
    env.Game.network.handleMessage({ type: 'help-request', requesterName: 'A' }, 'peer-a');
    check(offersTo(env, 'peer-b').length === 1, 'pré-condição: B (mais recursos) é o primeiro da fila');
    env.drop('peer-c');
    check(env.player('C').disconnected === true, 'pré-condição: C caiu');
    env.Game.network.handleMessage({ type: 'help-offer-response', candidateName: 'B', accepted: false }, 'peer-b');
    check(offersTo(env, 'peer-c').length === 0, 'C caiu: não deveria receber o pedido de ajuda');
    check(offersTo(env, 'peer-host').length === 1, 'depois de B, o pedido deveria ir direto ao Host');
    const trying = env.record.sent.filter(e => e.to === 'peer-a' && e.msg.type === 'help-trying').pop();
    check(trying && trying.msg.candidateName === 'Host', 'A deveria ver que o pedido está com o Host, veio: ' + JSON.stringify(trying && trying.msg));

    // Quem pediu cai antes de B aceitar: nada é transferido e ninguém mais é consultado.
    const env2 = matchWithHelpQueue(use);
    env2.Game.network.handleMessage({ type: 'help-request', requesterName: 'A' }, 'peer-a');
    env2.drop('peer-a');
    env2.clearLog();
    env2.Game.network.handleMessage({ type: 'help-offer-response', candidateName: 'B', accepted: true }, 'peer-b');
    check(env2.player('A').resources === 0 && env2.player('B').resources === 5 && env2.player('B').kpi === 0,
        'quem pediu caiu: nenhum recurso pode ser transferido');
    check(env2.broadcastsOfType('help-confirmed').length === 0, 'não deveria confirmar ajuda para quem caiu');
    check(!env2.state.helpQueue, 'o pedido deveria ser cancelado');

    // Mesmo caso, com B recusando: a fila não segue para C.
    const env3 = matchWithHelpQueue(use);
    env3.Game.network.handleMessage({ type: 'help-request', requesterName: 'A' }, 'peer-a');
    env3.drop('peer-a');
    env3.clearLog();
    env3.Game.network.handleMessage({ type: 'help-offer-response', candidateName: 'B', accepted: false }, 'peer-b');
    check(offersTo(env3, 'peer-c').length === 0 && offersTo(env3, 'peer-host').length === 0, 'quem pediu caiu: ninguém mais deveria ser consultado');
    check(!env3.state.helpQueue, 'o pedido deveria ser cancelado');

    // Controle: sem ninguém cair, B aceita e a ajuda acontece.
    const env4 = matchWithHelpQueue(use);
    env4.Game.network.handleMessage({ type: 'help-request', requesterName: 'A' }, 'peer-a');
    env4.Game.network.handleMessage({ type: 'help-offer-response', candidateName: 'B', accepted: true }, 'peer-b');
    check(env4.player('A').resources === 1 && env4.player('B').resources === 4, 'sem quedas, a ajuda deveria acontecer');
});

test('T70 Assessor que caiu é recusado na hora; quem responde pode chamar outro', (use) => {
    const env = use(createEnvironment());
    env.fakeTime();
    env.createRoomAsHost();
    env.join('A', 'peer-a');
    env.join('B', 'peer-b');
    env.join('C', 'peer-c');
    env.startMatch();
    // O sorteio da dupla é aleatório: fixa os papéis (mesma pergunta e evento).
    env.state.currentRound = { ...env.state.currentRound, asker: 'Host', answerer: 'A', answered: false };
    env.state.answeredThisRound = [];

    // B cai entre a lista de assessores abrir e o clique de A.
    env.drop('peer-b');
    env.clearLog();
    env.Game.network.handleMessage({ type: 'advisory-request', advisorName: 'B', requesterName: 'A' }, 'peer-a');
    check(!env.state.currentRound.advisory, 'não deveria ficar esperando o assessor que caiu, veio: ' + JSON.stringify(env.state.currentRound.advisory));
    check(!env.record.sent.some(e => e.to === 'peer-b' && e.msg.type === 'advisory-question'), 'quem caiu não deveria receber a pergunta');
    const refusal = env.record.sent.filter(e => e.to === 'peer-a' && e.msg.type === 'advisory-result').pop();
    check(refusal && refusal.msg.invalid === true && refusal.msg.declined === true && refusal.msg.reason !== 'closing-focus-area',
        'A deveria receber na hora a recusa que libera o pedido a outro, veio: ' + JSON.stringify(refusal && refusal.msg));

    // A chama C (conectado): o pedido corre normalmente.
    env.Game.network.handleMessage({ type: 'advisory-request', advisorName: 'C', requesterName: 'A' }, 'peer-a');
    const a = env.state.currentRound.advisory;
    check(a && a.status === 'pending' && a.advisorName === 'C', 'A deveria conseguir chamar C');
    check(env.record.sent.some(e => e.to === 'peer-c' && e.msg.type === 'advisory-question'), 'C deveria receber a pergunta');
});

test('T71 Aviso "pedindo ajuda para…" mostra o nome como foi digitado (sem "&amp;")', (use) => {
    const elements = {};
    const ctx = vm.createContext({
        console: { log: () => {}, warn: () => {}, error: () => {}, info: () => {} },
        document: { getElementById: (id) => elements[id] || (elements[id] = { id, textContent: '', innerHTML: '', style: {} }) }
    });
    vm.runInContext("var window = this; window.Game = { i18n: { t: (key, v) => key + ':' + (v && v.requester) } };", ctx);
    vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/utils/sanitize.js'), 'utf8'), ctx, { filename: 'sanitize.js' });
    vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/ui/modals/tradeModal.js'), 'utf8'), ctx, { filename: 'tradeModal.js' });
    const ui = vm.runInContext('Game.ui', ctx);

    ui.showHelpCandidate({ candidateName: 'Ana & Bia <3' });
    check(elements['helpTryingWith'].textContent === 'Ana & Bia <3',
        'o nome deveria aparecer como foi digitado, apareceu: ' + elements['helpTryingWith'].textContent);

    // Controle: onde o nome entra como HTML, ele continua protegido.
    ui.showHelpOfferModal({ requesterName: 'Ana & Bia <3' });
    check(elements['helpOfferText'].innerHTML === 'trade.helpOffer:Ana &amp; Bia &lt;3',
        'no pedido recebido (HTML), o nome deveria continuar protegido, veio: ' + elements['helpOfferText'].innerHTML);
});

finish('Pedido de ajuda e assessoria');
