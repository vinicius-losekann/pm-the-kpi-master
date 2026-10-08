// ============================================
// PM: The KPI Master - Testes de lógica: Pedido de ajuda e assessoria
// ============================================
// Pedido de ajuda (fila automática de quem pode doar um recurso) e
// pedido de assessoria (o Respondedor chama outro jogador para sugerir
// uma alternativa; só com 1 recurso ou mais, e quem pediu paga o
// honorário ao assessor quando segue a sugestão e acerta).
// Ambiente simulado e ajudantes: environment.js. Rodar a partir da raiz:
//     node tests/logic/help-and-advisory.test.js
// ============================================

const {
    fs, path, vm, ROOT, createEnvironment, tokenOf, test, check, start, finish,
    syncTo, roundScreens, unavailable, roomToReload, reloadHost, tryReloadHost, recordScreens, guestWithScreens
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

// ============================================
// ASSESSORIA COM HONORÁRIO (economia de recursos)
// ============================================

/** Telas reais usadas por quem responde e pelo assessor. */
const ADVISORY_SCREENS = ['js/ui/modals/advisoryModal.js', 'js/ui/components/questionComponent.js'];

/** Evento de Reserva de Contingência (protege o erro). */
const RESERVE = { id: 'e4', title: 'Reserva de Contingência', contingencyReserve: true };

/** Cópia simples (tira o objeto do contexto vm); undefined continua undefined. */
const copy = (x) => (x === undefined ? undefined : JSON.parse(JSON.stringify(x)));

/** Uma alternativa errada para a pergunta da rodada. */
const wrongFor = (round) => ['A', 'B', 'C', 'D'].find(x => x !== round.question.correct);

/** Último kpi-update mandado aos guests sobre um jogador. */
const lastUpdateOf = (env, name) => env.broadcastsOfType('kpi-update').filter(m => m.playerName === name).pop();

/**
 * Partida de 4 (Host, A, B, C) com tempo falso (env.time) e a pergunta
 * aberta: A pergunta, B responde. Recursos de B e C e o evento da
 * rodada vêm das opções; KPI de todos em 0.
 */
function advisoryMatch(use, { answererResources = 3, advisorResources = 5, event } = {}) {
    const env = use(createEnvironment());
    env.time = env.fakeTime();
    env.createRoomAsHost();
    env.join('A', 'peer-a');
    env.join('B', 'peer-b');
    env.join('C', 'peer-c');
    env.startMatch();
    // O sorteio da dupla é aleatório: fixa os papéis (mesma pergunta).
    env.state.currentRound = { ...env.state.currentRound, asker: 'A', answerer: 'B', answered: false };
    if (event) env.state.currentRound.event = event;
    env.state.answeredThisRound = [];
    env.state.players.forEach(p => { p.kpi = 0; p.activities = 0; });
    env.player('B').resources = answererResources;
    env.player('C').resources = advisorResources;
    return env;
}

/** B pede assessoria a C pela rede; o pedido precisa ficar pendente. */
function requestFromBToC(env) {
    env.Game.network.handleMessage({ type: 'advisory-request', advisorName: 'C', requesterName: 'B' }, 'peer-b');
    const a = env.state.currentRound.advisory;
    check(a && a.status === 'pending' && a.advisorName === 'C', 'pré-condição: assessoria de C pendente, veio: ' + JSON.stringify(a));
}

/** B (guest) com as telas reais e a rodada do host, sem o gabarito. */
function answererGuest(use, env) {
    const b = guestWithScreens(use, env, 'B', ADVISORY_SCREENS);
    const round = JSON.parse(JSON.stringify(env.state.currentRound));
    delete round.question.correct;
    b.guest.state.currentRound = { ...round, question: { ...round.question, isAnswerer: true } };
    return b;
}

/** Guest `name` (sem telas reais) recebe a mensagem; devolve as telas chamadas, com os argumentos. */
function guestReceives(use, env, name, msg) {
    const guest = use(createEnvironment());
    guest.state.playerName = name;
    guest.state.players = JSON.parse(JSON.stringify(env.state.players));
    const calls = recordScreens(guest);
    guest.Game.network.handleMessage(copy(msg), 'sala');
    return { guest, calls };
}

test('T114 Assessoria só com 1 recurso ou mais: com 0 ou menos o pedido é recusado no cliente e no host (needs-resources) e a área da assessoria some', (use) => {
    // 1) Host: B com 0 e com −1 pede a C → recusado na hora, sem pergunta para C.
    for (const resources of [0, -1]) {
        const env = advisoryMatch(use, { answererResources: resources });
        env.clearLog();
        env.Game.network.handleMessage({ type: 'advisory-request', advisorName: 'C', requesterName: 'B' }, 'peer-b');
        const refusal = sentTo(env, 'peer-b', 'advisory-result').pop();
        check(refusal && refusal.invalid === true && refusal.declined === true && refusal.reason === 'needs-resources',
            'com ' + resources + ' recursos, B deveria receber a recusa needs-resources, veio: ' + JSON.stringify(refusal));
        check(!env.state.currentRound.advisory, 'com ' + resources + ' recursos, nenhuma assessoria deveria ficar na rodada, veio: ' +
            JSON.stringify(env.state.currentRound.advisory));
        check(sentTo(env, 'peer-c', 'advisory-question').length === 0 && env.broadcastsOfType('advisory-started').length === 0,
            'com ' + resources + ' recursos, C não deveria receber a pergunta nem os outros o advisory-started');
    }
    // Com 1 recurso, o pedido corre normalmente.
    const withOne = advisoryMatch(use, { answererResources: 1 });
    requestFromBToC(withOne);
    check(sentTo(withOne, 'peer-c', 'advisory-question').length === 1, 'com 1 recurso, C deveria receber a pergunta');

    // 2) Host que responde, com 0: nem chega a pedir.
    const hostAnswers = advisoryMatch(use);
    hostAnswers.state.currentRound.answerer = 'Host';
    hostAnswers.player('Host').resources = 0;
    hostAnswers.clearLog();
    check(hostAnswers.Game.core.requestAdvisory('C') === false && !hostAnswers.state.currentRound.advisory &&
        sentTo(hostAnswers, 'peer-c', 'advisory-question').length === 0,
        'o host com 0 recursos não deveria conseguir pedir assessoria, veio: ' + JSON.stringify(hostAnswers.state.currentRound.advisory));

    // 3) Guest B: com 0, não manda nada ao host e vê o aviso; com 1, manda o pedido.
    const env = advisoryMatch(use);
    const b = answererGuest(use, env);
    b.guest.player('B').resources = 0;
    check(b.guest.Game.core.requestAdvisory('C') === false && !b.guest.record.toHost.some(m => m.type === 'advisory-request'),
        'B com 0 recursos não deveria mandar advisory-request, mandou: ' + JSON.stringify(b.guest.record.toHost));
    check(b.alerts.includes('advisory.needsResources'), 'B deveria ver o aviso advisory.needsResources, viu: ' + JSON.stringify(b.alerts));
    b.guest.player('B').resources = 1;
    check(b.guest.Game.core.requestAdvisory('C') === true && b.guest.record.toHost.some(m => m.type === 'advisory-request' && m.advisorName === 'C'),
        'B com 1 recurso deveria mandar o pedido, mandou: ' + JSON.stringify(b.guest.record.toHost));

    // 4) Tela: a recusa por falta de recurso mostra o aviso e não libera o botão de novo.
    const b2 = answererGuest(use, env);
    b2.elements.btnRequestAdvisory = { id: 'btnRequestAdvisory', disabled: true, style: {}, textContent: '' };
    b2.guest.state.currentRound.advisory = { advisorName: 'C', status: 'pending', suggestion: null };
    b2.guest.ctx.showAdvisoryResult({ type: 'advisory-result', advisorName: 'C', suggestion: null, declined: true, invalid: true, reason: 'needs-resources' });
    check(b2.elements.advisoryStatus.textContent === 'advisory.needsResources',
        'a recusa por falta de recurso deveria mostrar advisory.needsResources, veio: ' + b2.elements.advisoryStatus.textContent);
    check(b2.elements.btnRequestAdvisory.disabled === true, 'a recusa por falta de recurso não deveria liberar o botão de pedir assessoria');

    // 5) Pergunta na tela: com 0 recursos a área da assessoria fica escondida; com 1, aparece.
    const b3 = answererGuest(use, env);
    b3.guest.player('B').resources = 0;
    b3.guest.ctx.displayQuestion(b3.guest.state.currentRound.question);
    check(b3.elements.advisoryArea.style.display === 'none', 'com 0 recursos, a área da assessoria deveria ficar escondida, veio: ' + b3.elements.advisoryArea.style.display);
    b3.guest.player('B').resources = 1;
    b3.guest.ctx.displayQuestion(b3.guest.state.currentRound.question);
    check(b3.elements.advisoryArea.style.display === 'block', 'com 1 recurso, a área da assessoria deveria aparecer, veio: ' + b3.elements.advisoryArea.style.display);
});

test('T115 Honorário: seguiu a sugestão e acertou → quem pediu paga RESOURCES.ADVISORY_FEE ao assessor, sem bônus de KPI; os kpi-update e as telas dizem quem pagou a quem', (use) => {
    // 1) Guest pede a guest: B (3) segue a sugestão certa de C (5).
    const env = advisoryMatch(use, { answererResources: 3, advisorResources: 5 });
    const C = env.CONFIG;
    const fee = C.RESOURCES.ADVISORY_FEE;
    const correct = env.state.currentRound.question.correct;
    requestFromBToC(env);
    env.Game.network.handleMessage({ type: 'advisory-answer', alternative: correct, declined: false }, 'peer-c');
    env.Game.network.handleMessage({ type: 'answer', alternative: correct, playerName: 'B' }, 'peer-b');
    const b = env.player('B');
    const c = env.player('C');
    check(b.resources === 3 - fee && b.kpi === C.KPI.CORRECT_ANSWER && b.activities === 1,
        'B deveria ganhar o acerto e pagar o honorário (' + (3 - fee) + ' recursos), veio: ' + JSON.stringify(b));
    check(c.resources === 5 + fee && c.kpi === 0, 'C deveria receber o honorário em recurso (' + (5 + fee) + ') e nenhum KPI, veio: ' + JSON.stringify(c));

    const toB = lastUpdateOf(env, 'B');
    check(toB && toB.isCorrect === true && toB.resources === 3 - fee && toB.supportOutcome === 'fee' && toB.supportAmount === fee &&
        toB.supportPartner === 'C',
        'o kpi-update de B deveria levar os recursos já sem o honorário e quem recebeu (supportPartner C), veio: ' + JSON.stringify(toB));
    const toC = lastUpdateOf(env, 'C');
    check(toC && toC.isCorrect === undefined && toC.resources === 5 + fee && toC.kpi === 0 && toC.supportOutcome === 'fee' &&
        toC.supportAmount === fee && toC.supportPartner === 'B',
        'o kpi-update de C deveria levar o honorário recebido de B, veio: ' + JSON.stringify(toC));
    check(!env.broadcastsOfType('kpi-update').some(m => 'advisorBonus' in m), 'nenhum kpi-update deveria levar advisorBonus');
    env.Game.saveState();
    const saved = JSON.parse(env.storage['pmKPI_roomState']);
    check(saved.players.find(p => p.name === 'B').resources === 3 - fee && saved.players.find(p => p.name === 'C').resources === 5 + fee,
        'o estado salvo deveria guardar os recursos depois do honorário');

    // 2) Guests: B vê o resultado com o honorário pago a C; C vê o honorário recebido de B.
    const seenByB = guestReceives(use, env, 'B', toB).calls.find(s => s.name === 'showResultModal');
    const paid = seenByB && copy(seenByB.args[3]);
    check(seenByB && seenByB.args[0] === true && seenByB.args[2] === 3 - fee && paid && paid.outcome === 'fee' && paid.amount === fee && paid.partner === 'C',
        'B deveria ver o resultado com o honorário pago a C, viu: ' + JSON.stringify(seenByB && seenByB.args));
    const fromC = guestReceives(use, env, 'C', toC);
    const received = fromC.calls.find(s => s.name === 'showSupportResultModal');
    check(received && received.args[0] === 'fee' && received.args[1] === fee && received.args[2] === 'B',
        'C deveria ver o honorário recebido de B, viu: ' + JSON.stringify(fromC.calls.map(s => s.name)));
    check(fromC.guest.player('C').resources === 5 + fee, 'o guest C deveria aplicar os recursos do kpi-update');

    // 3) Com o mínimo para pedir (1 recurso) e a Reserva de Contingência, o honorário é pago igual.
    const withOne = advisoryMatch(use, { answererResources: 1, advisorResources: 0, event: RESERVE });
    requestFromBToC(withOne);
    withOne.Game.network.handleMessage({ type: 'advisory-answer', alternative: correct, declined: false }, 'peer-c');
    withOne.Game.network.handleMessage({ type: 'answer', alternative: correct, playerName: 'B' }, 'peer-b');
    check(withOne.player('B').resources === 1 - fee && withOne.player('C').resources === fee,
        'com 1 recurso e a Reserva de Contingência, B deveria pagar o honorário a C igual, veio: ' +
        JSON.stringify({ B: withOne.player('B').resources, C: withOne.player('C').resources }));

    // 4) O host como quem pede: a própria tela mostra o honorário pago.
    const hostAsks = advisoryMatch(use, { advisorResources: 5 });
    hostAsks.state.currentRound.answerer = 'Host';
    hostAsks.player('Host').resources = 3;
    const hostAskCalls = recordScreens(hostAsks);
    check(hostAsks.Game.core.requestAdvisory('C') === true, 'pré-condição: o host com 3 recursos pede assessoria a C');
    hostAsks.Game.network.handleMessage({ type: 'advisory-answer', alternative: correct, declined: false }, 'peer-c');
    hostAsks.Game.core.handleAnswer({ type: 'answer', alternative: correct, playerName: 'Host' });
    const hostResult = hostAskCalls.find(s => s.name === 'showResultModal');
    const hostPaid = hostResult && copy(hostResult.args[3]);
    check(hostAsks.player('Host').resources === 3 - fee && hostAsks.player('C').resources === 5 + fee &&
        hostPaid && hostPaid.outcome === 'fee' && hostPaid.amount === fee && hostPaid.partner === 'C',
        'o host deveria pagar o honorário a C e ver isso no resultado, viu: ' + JSON.stringify(hostResult && hostResult.args));

    // 5) O host como assessor: a própria tela mostra o honorário recebido.
    const hostAdvises = advisoryMatch(use, { answererResources: 3 });
    hostAdvises.player('Host').resources = 2;
    const hostAdviseCalls = recordScreens(hostAdvises);
    hostAdvises.Game.network.handleMessage({ type: 'advisory-request', advisorName: 'Host', requesterName: 'B' }, 'peer-b');
    hostAdvises.Game.core.handleAdvisoryAnswer({ alternative: correct, declined: false });
    hostAdvises.Game.network.handleMessage({ type: 'answer', alternative: correct, playerName: 'B' }, 'peer-b');
    const hostReceived = hostAdviseCalls.find(s => s.name === 'showSupportResultModal');
    check(hostAdvises.player('Host').resources === 2 + fee && hostAdvises.player('Host').kpi === 0 &&
        hostReceived && hostReceived.args[0] === 'fee' && hostReceived.args[1] === fee && hostReceived.args[2] === 'B',
        'o host assessor deveria receber o honorário e ver o aviso, viu: ' + JSON.stringify(hostReceived && hostReceived.args));

    // 6) Assessor que saiu da sala (não está mais na lista): ninguém paga.
    const advisorLeft = advisoryMatch(use, { answererResources: 3 });
    requestFromBToC(advisorLeft);
    advisorLeft.Game.network.handleMessage({ type: 'advisory-answer', alternative: correct, declined: false }, 'peer-c');
    advisorLeft.state.players = advisorLeft.state.players.filter(p => p.name !== 'C');
    advisorLeft.Game.network.handleMessage({ type: 'answer', alternative: correct, playerName: 'B' }, 'peer-b');
    const leftUpdate = lastUpdateOf(advisorLeft, 'B');
    check(advisorLeft.player('B').resources === 3 && leftUpdate && leftUpdate.supportOutcome === undefined,
        'com o assessor fora da sala, B não deveria pagar o honorário, veio: ' + JSON.stringify(leftUpdate));
});

test('T116 Sem honorário: seguiu e errou, ignorou a sugestão, recusa e prazo do assessor → ninguém paga; a Reserva de Contingência não muda isso', (use) => {
    const scenarios = [
        { label: 'seguiu a sugestão e errou', suggestion: 'wrong', answer: 'wrong', expectedB: 2 },
        { label: 'ignorou a sugestão e acertou', suggestion: 'wrong', answer: 'correct', expectedB: 3 },
        { label: 'ignorou a sugestão e errou', suggestion: 'correct', answer: 'wrong', expectedB: 2 },
        { label: 'o assessor recusou', suggestion: 'declined', answer: 'correct', expectedB: 3 },
        { label: 'o prazo do assessor acabou', suggestion: 'timeout', answer: 'correct', expectedB: 3 },
        { label: 'seguiu a sugestão e errou, com a Reserva de Contingência', suggestion: 'wrong', answer: 'wrong', event: RESERVE, expectedB: 3 }
    ];
    for (const s of scenarios) {
        const env = advisoryMatch(use, { answererResources: 3, advisorResources: 5, event: s.event });
        const round = env.state.currentRound;
        const letter = (which) => (which === 'correct' ? round.question.correct : wrongFor(round));
        requestFromBToC(env);
        if (s.suggestion === 'timeout') {
            env.time.advance(env.CONFIG.GAME.ADVISORY_TIMEOUT);
        } else if (s.suggestion === 'declined') {
            env.Game.network.handleMessage({ type: 'advisory-answer', alternative: null, declined: true }, 'peer-c');
        } else {
            env.Game.network.handleMessage({ type: 'advisory-answer', alternative: letter(s.suggestion), declined: false }, 'peer-c');
        }
        check(round.advisory.status === (['timeout', 'declined'].includes(s.suggestion) ? 'declined' : 'accepted'),
            s.label + ': pré-condição: assessoria resolvida, veio: ' + JSON.stringify(round.advisory));
        env.Game.network.handleMessage({ type: 'answer', alternative: letter(s.answer), playerName: 'B' }, 'peer-b');

        const toB = lastUpdateOf(env, 'B');
        check(env.player('B').resources === s.expectedB && toB && toB.resources === s.expectedB && toB.supportOutcome === undefined,
            s.label + ': B deveria ficar com ' + s.expectedB + ' recursos, sem honorário, veio: ' + JSON.stringify(toB));
        check(env.player('C').resources === 5 && env.player('C').kpi === 0 && !lastUpdateOf(env, 'C'),
            s.label + ': C não deveria receber nada (nem kpi-update), veio: ' + JSON.stringify({ player: env.player('C'), update: lastUpdateOf(env, 'C') }));
    }
});

test('T117 Honorário no config, na tela e no protocolo: RESOURCES.ADVISORY_FEE no lugar de KPI.ADVISOR_BONUS, textos do pt-BR.js, modais e dica; protocolo 8', (use) => {
    // 1) Config real: o honorário em RESOURCES; o bônus de KPI do assessor saiu.
    const configCtx = vm.createContext({});
    vm.runInContext('var window = this;' + fs.readFileSync(path.join(ROOT, 'config/game-config.js'), 'utf8'), configCtx);
    const real = JSON.parse(JSON.stringify(vm.runInContext('CONFIG', configCtx)));
    check(real.RESOURCES && real.RESOURCES.ADVISORY_FEE === 1, 'o config real deveria ter RESOURCES.ADVISORY_FEE = 1, veio: ' + JSON.stringify(real.RESOURCES));
    check(!('ADVISOR_BONUS' in real.KPI), 'o bônus de KPI do assessor deveria sair do config, veio: ' + JSON.stringify(real.KPI));

    // 2) Protocolo 8: kpi-update sem advisorBonus e com o honorário; recusa needs-resources.
    const env = use(createEnvironment());
    check(env.Game.network.PROTOCOL_VERSION === 8, 'a versão do protocolo deveria ser 8 (honorário de assessoria), veio: ' + env.Game.network.PROTOCOL_VERSION);

    // 3) Textos no pt-BR.js real, com os marcadores.
    const localeCtx = vm.createContext({});
    vm.runInContext('var window = this;' + fs.readFileSync(path.join(ROOT, 'js/locales/pt-BR.js'), 'utf8'), localeCtx);
    const dict = JSON.parse(JSON.stringify(vm.runInContext("Game.locales['pt-BR']", localeCtx)));
    const markers = (text) => [...new Set([...String(text).matchAll(/\{\{(\w+)\}\}/g)].map(m => m[1]))].sort().join();
    const expected = {
        'advisory.needsResources': '', 'advisory.feeHint': 'amount', 'advisory.feeNotice': 'amount',
        'result.feePaid': 'advisor,amount', 'result.feeReceived': 'amount,requester'
    };
    for (const [key, keyMarkers] of Object.entries(expected)) {
        const [section, name] = key.split('.');
        const text = dict[section] && dict[section][name];
        check(typeof text === 'string' && text.length > 0 && markers(text) === keyMarkers,
            'o pt-BR.js deveria ter ' + key + ' com os marcadores [' + keyMarkers + '], veio: ' + JSON.stringify(text));
    }
    check(!('advisorBonus' in dict.result), 'o texto do bônus de KPI do assessor (result.advisorBonus) deveria sair');

    // 4) Modal do resultado real: honorário pago (quem pediu) e recebido (assessor).
    const elements = {};
    env.ctx.document = {
        getElementById: (id) => elements[id] || (elements[id] = { id, textContent: '', innerHTML: '', className: '', style: {} }),
        querySelectorAll: () => []
    };
    env.Game.i18n.t = (key, values) => key + (values ? ' ' + JSON.stringify(values) : '');
    vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/ui/modals/resultModal.js'), 'utf8'), env.ctx, { filename: 'resultModal.js' });
    env.ctx.showResultModal(true, 10, 2, { outcome: 'fee', amount: 1, partner: 'Carla' });
    const paidText = String(elements.resultMessage.textContent);
    check(paidText.includes('result.kpiGained') && paidText.includes('result.feePaid') && paidText.includes('"advisor":"Carla"') && paidText.includes('"amount":1'),
        'o resultado de quem pagou deveria trazer o acerto e result.feePaid com advisor e amount, veio: ' + paidText);
    env.ctx.showResultModal(true, 10, 3);
    check(!String(elements.resultMessage.textContent).includes('result.feePaid'), 'sem honorário, o resultado não deveria falar de honorário');
    elements.resultBoardReminder = { id: 'resultBoardReminder', style: { display: 'block' } };
    env.ctx.showSupportResultModal('fee', 1, 'Davi');
    const receivedText = String(elements.resultMessage.textContent);
    check(elements.resultTitle.textContent === 'result.advisoryTitle' && receivedText.startsWith('result.feeReceived') &&
        receivedText.includes('"requester":"Davi"') && receivedText.includes('"amount":1'),
        'o assessor deveria ver result.feeReceived com requester e amount, veio: ' + elements.resultTitle.textContent + ' / ' + receivedText);
    check(elements.resultBoardReminder.style.display === 'none' && elements.modalResult.style.display === 'flex',
        'o aviso do honorário abre o modal sem o lembrete do tabuleiro');

    // 5) Convite ao assessor e dica do botão, com o valor do honorário do CONFIG.
    const match = advisoryMatch(use);
    const fee = match.CONFIG.RESOURCES.ADVISORY_FEE;
    const advisor = guestWithScreens(use, match, 'C', ADVISORY_SCREENS);
    advisor.guest.state.currentRound = JSON.parse(JSON.stringify({ ...match.state.currentRound, question: null }));
    advisor.guest.ctx.showAdvisoryQuestionModal({ type: 'advisory-question', question: 'Pergunta?', domain: 'Domínio', alternatives: ['A) Um', 'B) Dois'], id: 'q1' });
    check(advisor.elements.advisoryFeeNotice && advisor.elements.advisoryFeeNotice.textContent === 'advisory.feeNotice {"amount":' + fee + '}',
        'o convite ao assessor deveria dizer o honorário (advisory.feeNotice), veio: ' + JSON.stringify(advisor.elements.advisoryFeeNotice));
    const b = answererGuest(use, match);
    b.guest.ctx.displayQuestion(b.guest.state.currentRound.question);
    check(b.elements.advisoryFeeHint && b.elements.advisoryFeeHint.textContent === 'advisory.feeHint {"amount":' + fee + '}',
        'quem responde deveria ver a dica do honorário (advisory.feeHint), veio: ' + JSON.stringify(b.elements.advisoryFeeHint));
    const html = fs.readFileSync(path.join(ROOT, 'game.html'), 'utf8');
    check(/id="advisoryFeeHint"/.test(html) && /id="advisoryFeeNotice"/.test(html), 'o game.html deveria ter os elementos advisoryFeeHint e advisoryFeeNotice');
});

finish('Pedido de ajuda e assessoria');
