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
    env.time = env.fakeTime();
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

/** Mensagens de um tipo enviadas a um peer. */
function sentTo(env, peerId, type) {
    return env.record.sent.filter(e => e.to === peerId && e.msg.type === type).map(e => e.msg);
}

/** Candidato responde à oferta de ajuda feita para requesterName. */
function respond(env, candidateName, requesterName, accepted) {
    const peerId = 'peer-' + candidateName.toLowerCase();
    env.Game.network.handleMessage({ type: 'help-offer-response', candidateName, requesterName, accepted }, peerId);
}

/**
 * Modal do pedido de ajuda (tradeModal.js real) com tela, rede e
 * alerta falsos; o i18n falso devolve a chave pedida.
 */
function helpModalWithFakes() {
    const elements = {};
    const record = { alerts: [], toHost: [], toCore: [] };
    const ctx = vm.createContext({
        console: { log: () => {}, warn: () => {}, error: () => {}, info: () => {} },
        alert: (text) => record.alerts.push(text),
        document: { getElementById: (id) => elements[id] || (elements[id] = { id, textContent: '', innerHTML: '', style: {} }) }
    });
    vm.runInContext("var window = this; window.Game = { i18n: { t: (key, v) => key + ':' + (v && v.requester) } };", ctx);
    vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/utils/sanitize.js'), 'utf8'), ctx, { filename: 'sanitize.js' });
    vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/ui/modals/tradeModal.js'), 'utf8'), ctx, { filename: 'tradeModal.js' });
    const Game = vm.runInContext('Game', ctx);
    Game.state = { isHost: false, playerName: 'B' };
    Game.network = { sendToHost: (msg) => record.toHost.push(msg) };
    Game.core = { handleHelpOfferResponse: (msg) => record.toCore.push(msg), requestHelp: () => {} };
    return { Game, ui: Game.ui, elements, record };
}

test('T69 Pedido de ajuda: quem caiu é pulado na fila; se quem pediu cai, o pedido é cancelado', (use) => {
    // C cai enquanto B decide; B recusa: o pedido vai direto ao Host.
    const env = matchWithHelpQueue(use);
    env.Game.network.handleMessage({ type: 'help-request', requesterName: 'A' }, 'peer-a');
    check(offersTo(env, 'peer-b').length === 1, 'pré-condição: B (mais recursos) é o primeiro da fila');
    env.drop('peer-c');
    check(env.player('C').disconnected === true, 'pré-condição: C caiu');
    respond(env, 'B', 'A', false);
    check(offersTo(env, 'peer-c').length === 0, 'C caiu: não deveria receber o pedido de ajuda');
    check(offersTo(env, 'peer-host').length === 1, 'depois de B, o pedido deveria ir direto ao Host');
    const trying = env.record.sent.filter(e => e.to === 'peer-a' && e.msg.type === 'help-trying').pop();
    check(trying && trying.msg.candidateName === 'Host', 'A deveria ver que o pedido está com o Host, veio: ' + JSON.stringify(trying && trying.msg));

    // Quem pediu cai antes de B aceitar: nada é transferido e ninguém mais é consultado.
    const env2 = matchWithHelpQueue(use);
    env2.Game.network.handleMessage({ type: 'help-request', requesterName: 'A' }, 'peer-a');
    env2.drop('peer-a');
    env2.clearLog();
    respond(env2, 'B', 'A', true);
    check(env2.player('A').resources === 0 && env2.player('B').resources === 5 && env2.player('B').kpi === 0,
        'quem pediu caiu: nenhum recurso pode ser transferido');
    check(env2.broadcastsOfType('help-confirmed').length === 0, 'não deveria confirmar ajuda para quem caiu');
    check(!env2.state.helpQueue, 'o pedido deveria ser cancelado');

    // Mesmo caso, com B recusando: a fila não segue para C.
    const env3 = matchWithHelpQueue(use);
    env3.Game.network.handleMessage({ type: 'help-request', requesterName: 'A' }, 'peer-a');
    env3.drop('peer-a');
    env3.clearLog();
    respond(env3, 'B', 'A', false);
    check(offersTo(env3, 'peer-c').length === 0 && offersTo(env3, 'peer-host').length === 0, 'quem pediu caiu: ninguém mais deveria ser consultado');
    check(!env3.state.helpQueue, 'o pedido deveria ser cancelado');

    // Controle: sem ninguém cair, B aceita e a ajuda acontece.
    const env4 = matchWithHelpQueue(use);
    env4.Game.network.handleMessage({ type: 'help-request', requesterName: 'A' }, 'peer-a');
    respond(env4, 'B', 'A', true);
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

test('T103 Pedido de ajuda durante o de outro jogador: é recusado com aviso, não apaga o primeiro e a doação vai para quem pediu primeiro', (use) => {
    // A e C sem recursos; A pede primeiro e a oferta vai para B.
    const env = matchWithHelpQueue(use);
    Object.assign(env.player('C'), { resources: 0, kpi: 20 });
    env.Game.network.handleMessage({ type: 'help-request', requesterName: 'A' }, 'peer-a');
    check(offersTo(env, 'peer-b').length === 1, 'pré-condição: a oferta do pedido de A vai para B');
    env.clearLog();

    // C pede antes de B responder.
    env.Game.network.handleMessage({ type: 'help-request', requesterName: 'C' }, 'peer-c');
    const refusal = sentTo(env, 'peer-c', 'help-no-candidates').pop();
    check(refusal && refusal.reason === 'request-in-progress',
        'C deveria receber na hora a recusa com o motivo request-in-progress, veio: ' + JSON.stringify(refusal));
    check(sentTo(env, 'peer-c', 'help-trying').length === 0, 'C não deveria ver "pedindo ajuda para…"');
    check(env.record.sent.filter(e => e.msg.type === 'help-offer').length === 0, 'o pedido de C não deveria gerar oferta para ninguém');
    const queue = env.state.helpQueue;
    check(queue && queue.requesterName === 'A' && queue.index === 0 && queue.candidates[0] === 'B',
        'o pedido de A deveria continuar como estava, veio: ' + JSON.stringify(queue));

    // B aceita a oferta que recebeu (para A): o recurso vai para A, e só A paga.
    respond(env, 'B', 'A', true);
    const confirmed = env.broadcastsOfType('help-confirmed').pop();
    check(confirmed && confirmed.donor === 'B' && confirmed.requester === 'A',
        'a ajuda confirmada deveria ser de B para A, veio: ' + JSON.stringify(confirmed));
    check(env.player('A').resources === 1 && env.player('A').kpi === 10 && env.player('B').resources === 4 && env.player('B').kpi === 10,
        'A deveria receber 1 recurso e pagar 10 KPI a B');
    check(env.player('C').resources === 0 && env.player('C').kpi === 20, 'C não deveria receber recurso nem pagar KPI');

    // Terminado o pedido de A, C pede de novo e o pedido corre normalmente.
    env.clearLog();
    env.Game.network.handleMessage({ type: 'help-request', requesterName: 'C' }, 'peer-c');
    check(sentTo(env, 'peer-c', 'help-no-candidates').length === 0, 'sem pedido em andamento, C não deveria ser recusado');
    const offer = offersTo(env, 'peer-b').pop();
    check(offer && offer.msg.requesterName === 'C', 'a oferta do pedido de C deveria ir para B, veio: ' + JSON.stringify(offer && offer.msg));
});

test('T104 Resposta à oferta de ajuda só vale para o pedido em andamento; o prazo vencido segue a fila do mesmo pedido', (use) => {
    const env = matchWithHelpQueue(use);
    check(env.Game.network.PROTOCOL_VERSION >= 7,
        'a versão do protocolo deveria ser 7 ou mais (help-offer-response leva requesterName), veio: ' + env.Game.network.PROTOCOL_VERSION);
    env.Game.network.handleMessage({ type: 'help-request', requesterName: 'A' }, 'peer-a');
    env.clearLog();

    // Resposta de B a uma oferta feita para outro jogador (C): ignorada.
    respond(env, 'B', 'C', true);
    check(env.broadcastsOfType('help-confirmed').length === 0 && env.player('A').resources === 0 &&
        env.player('B').resources === 5 && env.player('B').kpi === 0,
        'aceite de oferta feita para outro jogador não deveria transferir nada');
    respond(env, 'B', 'C', false);
    check(offersTo(env, 'peer-c').length === 0 && env.state.helpQueue && env.state.helpQueue.index === 0,
        'recusa de oferta feita para outro jogador não deveria avançar a fila');

    // Resposta sem quem pediu (versão antiga do jogo): ignorada.
    env.Game.network.handleMessage({ type: 'help-offer-response', candidateName: 'B', accepted: true }, 'peer-b');
    check(env.broadcastsOfType('help-confirmed').length === 0 && env.player('A').resources === 0,
        'resposta sem requesterName não deveria transferir nada');

    // O prazo de B vence: a oferta segue para C, ainda para A.
    env.time.advance(env.CONFIG.GAME.HELP_OFFER_TIMEOUT);
    const toC = offersTo(env, 'peer-c');
    check(toC.length === 1 && toC[0].msg.requesterName === 'A',
        'vencido o prazo de B, a oferta do pedido de A deveria ir para C, veio: ' + JSON.stringify(toC.map(e => e.msg)));

    // Aceite atrasado de B (o prazo dele já venceu): ignorado.
    respond(env, 'B', 'A', true);
    check(env.player('B').resources === 5 && env.player('A').resources === 0, 'aceite de B depois do prazo não deveria transferir nada');

    // C aceita: a ajuda acontece de C para A.
    respond(env, 'C', 'A', true);
    check(env.player('A').resources === 1 && env.player('C').resources === 2, 'C aceitou: a ajuda deveria ir de C para A');
});

test('T105 Quem pede ajuda de novo durante o próprio pedido: a fila continua de onde estava e o aviso mostra com quem está', (use) => {
    const env = matchWithHelpQueue(use);
    env.Game.network.handleMessage({ type: 'help-request', requesterName: 'A' }, 'peer-a');
    respond(env, 'B', 'A', false);
    check(offersTo(env, 'peer-c').length === 1, 'pré-condição: B recusou e a oferta foi para C');
    env.clearLog();

    env.Game.network.handleMessage({ type: 'help-request', requesterName: 'A' }, 'peer-a');
    check(sentTo(env, 'peer-a', 'help-no-candidates').length === 0, 'A não deveria ser recusado no próprio pedido');
    const trying = sentTo(env, 'peer-a', 'help-trying').pop();
    check(trying && trying.candidateName === 'C', 'A deveria ver de novo que o pedido está com C, veio: ' + JSON.stringify(trying));
    check(env.record.sent.filter(e => e.msg.type === 'help-offer').length === 0, 'ninguém deveria receber oferta de novo (a fila não recomeça)');
    const queue = env.state.helpQueue;
    check(queue && queue.requesterName === 'A' && queue.index === 1, 'a fila deveria continuar em C, veio: ' + JSON.stringify(queue));

    respond(env, 'C', 'A', true);
    check(env.player('A').resources === 1 && env.player('C').resources === 2 && env.player('B').resources === 5,
        'C aceitou: a ajuda deveria ir de C para A');
});

test('T106 Tela do pedido de ajuda: a resposta à oferta leva quem pediu e o pedido recusado por outro em andamento tem aviso próprio', () => {
    // Guest: a resposta vai ao host com o nome de quem pediu.
    const guest = helpModalWithFakes();
    guest.ui.showHelpOfferModal({ requesterName: 'A' });
    guest.ui.respondToHelpOffer(true);
    const sent = guest.record.toHost.pop();
    check(sent && sent.type === 'help-offer-response' && sent.candidateName === 'B' && sent.requesterName === 'A' && sent.accepted === true,
        'a resposta à oferta deveria levar requesterName, veio: ' + JSON.stringify(sent));

    // Host como candidato: a mesma resposta vai direto ao engine.
    const host = helpModalWithFakes();
    host.Game.state = { isHost: true, playerName: 'Host' };
    host.ui.showHelpOfferModal({ requesterName: 'C' });
    host.ui.respondToHelpOffer(false);
    const direct = host.record.toCore.pop();
    check(direct && direct.candidateName === 'Host' && direct.requesterName === 'C' && direct.accepted === false,
        'no host, a resposta deveria levar requesterName, veio: ' + JSON.stringify(direct));

    // Recusa por pedido em andamento: aviso próprio, e a modal de status fecha.
    const screen = helpModalWithFakes();
    screen.elements['modalHelpRequest'] = { id: 'modalHelpRequest', style: { display: 'flex' } };
    screen.ui.showHelpNoCandidates({ type: 'help-no-candidates', reason: 'request-in-progress' });
    check(String(screen.record.alerts.pop()).startsWith('trade.helpBusy'),
        'o pedido recusado por outro em andamento deveria usar o texto trade.helpBusy');
    check(screen.elements['modalHelpRequest'].style.display === 'none', 'a modal "pedindo ajuda…" deveria fechar');

    // Controle: os outros motivos continuam com os textos de antes.
    screen.ui.showHelpNoCandidates({ type: 'help-no-candidates', reason: 'all-declined' });
    check(String(screen.record.alerts.pop()).startsWith('trade.noHelp'), 'ninguém aceitou: deveria continuar o texto trade.noHelp');
    screen.ui.showHelpNoCandidates({ type: 'help-no-candidates', reason: 'insufficient-kpi' });
    check(String(screen.record.alerts.pop()).startsWith('trade.insufficientKpi'), 'sem KPI: deveria continuar o texto trade.insufficientKpi');
});

finish('Pedido de ajuda e assessoria');
