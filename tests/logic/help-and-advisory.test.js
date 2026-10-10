// ============================================
// PM: The KPI Master - Testes de lógica: Pedido de ajuda e assessoria
// ============================================
// O Respondedor chama outro jogador para sugerir uma alternativa (um
// apoio por pergunta). Com 1 recurso ou mais, é assessoria: quem pediu
// paga o honorário ao assessor quando segue a sugestão e acerta. Com 0
// ou menos, é pedido de ajuda (fiança): seguiu e acertou, quem ajudou
// ganha a recompensa do patrocinador; seguiu e errou, quem ajudou cobre
// o erro.
// Ambiente simulado e ajudantes: environment.js. Rodar a partir da raiz:
//     node tests/logic/help-and-advisory.test.js
// ============================================

const {
    fs, path, vm, ROOT, createEnvironment, tokenOf, test, check, start, finish,
    syncTo, roundScreens, unavailable, roomToReload, reloadHost, tryReloadHost, recordScreens, guestWithScreens
} = require('./environment');

start('Pedido de ajuda e assessoria');

/** Mensagens de um tipo enviadas a um peer. */
function sentTo(env, peerId, type) {
    return env.record.sent.filter(e => e.to === peerId && e.msg.type === type).map(e => e.msg);
}

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

test('T114 Assessoria só com 1 recurso ou mais: com 0 ou menos o pedido de assessoria é recusado no cliente e no host (needs-resources)', (use) => {
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

// ============================================
// PEDIDO DE AJUDA COMO FIANÇA (economia de recursos)
// ============================================

/**
 * Partida de 4 (Host, A, B, C) com a pergunta aberta: A pergunta, B
 * responde sem recursos (0, se não for dito) e C pode ajudar (5).
 * Tempo falso em env.time; KPI e atividades de todos em 0.
 */
function helpMatch(use, { answererResources = 0, helperResources = 5, event } = {}) {
    return advisoryMatch(use, { answererResources, advisorResources: helperResources, event });
}

/** B pede ajuda a `helper` pela rede. */
function askHelp(env, helper = 'C') {
    env.Game.network.handleMessage({ type: 'advisory-request', kind: 'help', advisorName: helper, requesterName: 'B' }, 'peer-b');
}

/** B pede ajuda a C pela rede; o pedido precisa ficar pendente, como ajuda. */
function requestHelpFromBToC(env) {
    askHelp(env);
    const a = env.state.currentRound.advisory;
    check(a && a.status === 'pending' && a.advisorName === 'C' && a.kind === 'help',
        'pré-condição: ajuda de C pendente (kind help), veio: ' + JSON.stringify(a));
}

/** Última recusa (advisory-result inválido) mandada a B. */
const refusalToB = (env) => sentTo(env, 'peer-b', 'advisory-result').pop();

/**
 * Modal do resultado real (ui/modals/resultModal.js) num ambiente novo,
 * com DOM falso; o i18n devolve a chave seguida dos valores.
 */
function realResultModal(use) {
    const env = use(createEnvironment());
    const elements = {};
    env.ctx.document = {
        getElementById: (id) => elements[id] || (elements[id] = { id, textContent: '', innerHTML: '', className: '', style: {} }),
        querySelectorAll: () => []
    };
    env.Game.i18n.t = (key, values) => key + (values ? ' ' + JSON.stringify(values) : '');
    vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/ui/modals/resultModal.js'), 'utf8'), env.ctx, { filename: 'resultModal.js' });
    elements.resultBoardReminder = { id: 'resultBoardReminder', style: { display: 'block' } };
    return { ctx: env.ctx, elements };
}

test('T118 Pedido de ajuda só com 0 recursos ou menos e fora do Encerramento: com recurso o host recusa (has-resources) e o cliente nem manda; no Encerramento, closing-focus-area', (use) => {
    // 1) Host: B com 1 e com 4 recursos pede ajuda → recusado na hora, sem pergunta para C.
    for (const resources of [1, 4]) {
        const env = helpMatch(use, { answererResources: resources });
        env.clearLog();
        askHelp(env);
        const refusal = refusalToB(env);
        check(refusal && refusal.invalid === true && refusal.declined === true && refusal.reason === 'has-resources' && refusal.kind === 'help',
            'com ' + resources + ' recursos, B deveria receber a recusa has-resources (kind help), veio: ' + JSON.stringify(refusal));
        check(!env.state.currentRound.advisory, 'com ' + resources + ' recursos, nenhum apoio deveria ficar na rodada, veio: ' +
            JSON.stringify(env.state.currentRound.advisory));
        check(sentTo(env, 'peer-c', 'advisory-question').length === 0 && env.broadcastsOfType('advisory-started').length === 0,
            'com ' + resources + ' recursos, C não deveria receber a pergunta nem os outros o advisory-started');
    }

    // Com 0 e com −1, o pedido corre: a pergunta (sem o gabarito) e o aviso levam kind 'help'.
    for (const resources of [0, -1]) {
        const env = helpMatch(use, { answererResources: resources });
        env.clearLog();
        requestHelpFromBToC(env);
        const question = sentTo(env, 'peer-c', 'advisory-question').pop();
        const started = env.broadcastsOfType('advisory-started').pop();
        check(question && question.kind === 'help' && question.correct === undefined,
            'com ' + resources + ' recursos, C deveria receber a pergunta com kind help e sem o gabarito, veio: ' + JSON.stringify(question));
        check(started && started.kind === 'help' && started.advisorName === 'C' && started.requesterName === 'B',
            'com ' + resources + ' recursos, todos deveriam receber o advisory-started com kind help, veio: ' + JSON.stringify(started));
        check(env.state.advisoryTimeout && !env.state.answerTimeout, 'o prazo de quem ajuda deveria correr, com o de resposta pausado');
    }

    // 2) No Encerramento, a ajuda também não se pede.
    const closing = helpMatch(use);
    const last = closing.CONFIG.FOCUS_AREAS[closing.CONFIG.FOCUS_AREAS.length - 1].id;
    closing.player('B').focusArea = last;
    closing.clearLog();
    askHelp(closing);
    const closingRefusal = refusalToB(closing);
    check(closingRefusal && closingRefusal.invalid === true && closingRefusal.reason === 'closing-focus-area' && !closing.state.currentRound.advisory,
        'no Encerramento, o pedido de ajuda deveria ser recusado com closing-focus-area, veio: ' + JSON.stringify(closingRefusal));

    // 3) Cliente: com recurso não manda a ajuda (help.hasResources); no Encerramento também não; com 0, manda com kind 'help'.
    const env = helpMatch(use);
    const b = answererGuest(use, env);
    const sentHelp = () => b.guest.record.toHost.filter(m => m.type === 'advisory-request');
    b.guest.player('B').resources = 1;
    check(b.guest.Game.core.requestAdvisory('C', 'help') === false && sentHelp().length === 0,
        'B com 1 recurso não deveria mandar o pedido de ajuda, mandou: ' + JSON.stringify(b.guest.record.toHost));
    check(b.alerts.includes('help.hasResources'), 'B deveria ver o aviso help.hasResources, viu: ' + JSON.stringify(b.alerts));
    b.guest.player('B').resources = 0;
    b.guest.player('B').focusArea = last;
    check(b.guest.Game.core.requestAdvisory('C', 'help') === false && sentHelp().length === 0 && b.alerts.includes('advisory.closingFocusArea'),
        'no Encerramento, B não deveria mandar o pedido de ajuda e deveria ver advisory.closingFocusArea, viu: ' + JSON.stringify(b.alerts));
    b.guest.player('B').focusArea = env.CONFIG.FOCUS_AREAS[0].id;
    check(b.guest.Game.core.requestAdvisory('C', 'help') === true &&
        sentHelp().some(m => m.kind === 'help' && m.advisorName === 'C' && m.requesterName === 'B'),
        'B com 0 recursos deveria mandar advisory-request com kind help, mandou: ' + JSON.stringify(b.guest.record.toHost));

    // Pela tela: o jogador escolhe quem chamar e o tipo vem dos recursos dele.
    for (const [resources, kind] of [[0, 'help'], [-2, 'help'], [2, 'advisory']]) {
        const screen = answererGuest(use, env);
        screen.guest.player('B').resources = resources;
        screen.guest.ctx.chooseAdvisor('C');
        const request = screen.guest.record.toHost.find(m => m.type === 'advisory-request');
        check(request && request.kind === kind && request.advisorName === 'C',
            'com ' + resources + ' recursos, a escolha na tela deveria mandar o pedido com kind ' + kind + ', mandou: ' + JSON.stringify(request));
        const local = screen.guest.state.currentRound.advisory;
        check(local && local.kind === kind && local.status === 'pending' && local.advisorName === 'C',
            'com ' + resources + ' recursos, B deveria guardar o pedido pendente com kind ' + kind + ', veio: ' + JSON.stringify(local));
    }

    // 4) O host que responde, com 0 recursos, pede ajuda direto (sem rede).
    const hostAnswers = helpMatch(use);
    hostAnswers.state.currentRound.answerer = 'Host';
    hostAnswers.player('Host').resources = 0;
    hostAnswers.clearLog();
    check(hostAnswers.Game.core.requestAdvisory('C', 'help') === true, 'o host com 0 recursos deveria conseguir pedir ajuda');
    const hostRequest = hostAnswers.state.currentRound.advisory;
    check(hostRequest && hostRequest.kind === 'help' && hostRequest.status === 'pending' &&
        sentTo(hostAnswers, 'peer-c', 'advisory-question').some(m => m.kind === 'help'),
        'o pedido de ajuda do host deveria ficar pendente e a pergunta ir para C, veio: ' + JSON.stringify(hostRequest));
});

test('T119 Quem ajuda: precisa de RESOURCES.HELP_COVER recursos ou mais (helper-without-resources), não pode ser o Perguntador nem estar fora da partida; recusado, quem pede chama outro; a lista mostra só quem pode ajudar', (use) => {
    // 1) C sem recursos para cobrir: recusado na hora, sem pergunta para C.
    const cover = helpMatch(use).CONFIG.RESOURCES.HELP_COVER;
    for (const resources of [cover - 1, 0, -1]) {
        const env = helpMatch(use, { helperResources: resources });
        env.clearLog();
        askHelp(env);
        const refusal = refusalToB(env);
        check(refusal && refusal.invalid === true && refusal.declined === true && refusal.reason === 'helper-without-resources' &&
            refusal.kind === 'help' && refusal.advisorName === 'C',
            'C com ' + resources + ' recursos: B deveria receber a recusa helper-without-resources, veio: ' + JSON.stringify(refusal));
        check(!env.state.currentRound.advisory && sentTo(env, 'peer-c', 'advisory-question').length === 0,
            'C com ' + resources + ' recursos não deveria receber a pergunta, veio: ' + JSON.stringify(env.state.currentRound.advisory));

        // Recusado, B chama outro (o Host, com recursos) e o pedido corre.
        askHelp(env, 'Host');
        const again = env.state.currentRound.advisory;
        check(again && again.advisorName === 'Host' && again.status === 'pending' && again.kind === 'help',
            'depois da recusa, B deveria conseguir chamar o Host, veio: ' + JSON.stringify(again));
    }
    // Com exatamente RESOURCES.HELP_COVER, C pode ajudar.
    requestHelpFromBToC(helpMatch(use, { helperResources: cover }));

    // 2) O Perguntador (A), quem caiu e quem saiu da partida não podem ajudar; recusa na hora.
    const cases = [
        { label: 'o Perguntador', helper: 'A', prepare: () => {} },
        { label: 'quem caiu', helper: 'C', prepare: (env) => env.drop('peer-c') },
        { label: 'quem saiu da partida', helper: 'C', prepare: (env) => { env.player('C').waitingInLobby = true; } }
    ];
    for (const c of cases) {
        const env = helpMatch(use);
        env.player('A').resources = 5;
        c.prepare(env);
        env.clearLog();
        askHelp(env, c.helper);
        const refusal = refusalToB(env);
        check(refusal && refusal.invalid === true && refusal.declined === true && !env.state.currentRound.advisory &&
            !['closing-focus-area', 'has-resources'].includes(refusal.reason),
            c.label + ': o pedido de ajuda deveria ser recusado na hora (podendo chamar outro), veio: ' + JSON.stringify(refusal));
        check(!env.record.sent.some(e => e.msg.type === 'advisory-question'), c.label + ': ninguém deveria receber a pergunta');
    }

    // 3) Tela: a recusa por falta de recurso de quem ajuda avisa e libera o botão para chamar outro.
    const env = helpMatch(use);
    const b = answererGuest(use, env);
    b.elements.btnRequestAdvisory = { id: 'btnRequestAdvisory', disabled: true, style: {}, textContent: '' };
    b.guest.state.currentRound.advisory = { advisorName: 'C', status: 'pending', suggestion: null, kind: 'help' };
    b.guest.ctx.showAdvisoryResult({ type: 'advisory-result', kind: 'help', advisorName: 'C', suggestion: null, declined: true, invalid: true,
        reason: 'helper-without-resources' });
    check(b.elements.advisoryStatus.textContent === 'help.helperWithoutResources {"advisor":"C"}',
        'B deveria ver help.helperWithoutResources com o nome de C, veio: ' + b.elements.advisoryStatus.textContent);
    check(b.elements.btnRequestAdvisory.disabled === false && b.guest.state.currentRound.advisory === null,
        'depois da recusa, B deveria poder chamar outro (botão liberado, sem pedido guardado)');

    // 4) Lista de quem chamar: na ajuda, só quem tem RESOURCES.HELP_COVER ou mais (fora o Perguntador e quem pede).
    const list = answererGuest(use, env);
    const players = (name) => list.guest.player(name);
    players('B').resources = 0;
    players('A').resources = 5;
    players('C').resources = cover;
    players('Host').resources = cover - 1;
    list.guest.ctx.showAdvisorySelectModal();
    const html = list.elements.advisoryPlayersList.innerHTML;
    check(html.includes('data-advisor-name="C"') && !html.includes('data-advisor-name="Host"') && !html.includes('data-advisor-name="A"') &&
        !html.includes('data-advisor-name="B"'),
        'na ajuda, a lista deveria ter só C (com recurso para cobrir), veio: ' + html);
    check(list.elements.advisorySelectTitle.textContent === 'help.selectTitle' && list.elements.modalAdvisorySelect.style.display === 'flex',
        'a lista deveria abrir com o título help.selectTitle, veio: ' + list.elements.advisorySelectTitle.textContent);
    // Ninguém com recurso: aviso, e a lista não abre.
    const nobody = answererGuest(use, env);
    nobody.guest.player('B').resources = 0;
    ['A', 'C', 'Host'].forEach(n => { nobody.guest.player(n).resources = cover - 1; });
    nobody.guest.ctx.showAdvisorySelectModal();
    check(nobody.alerts.includes('help.noHelperAvailable') && nobody.elements.modalAdvisorySelect.style.display !== 'flex',
        'sem ninguém com recurso, B deveria ver help.noHelperAvailable e a lista não abrir, viu: ' + JSON.stringify(nobody.alerts));
    // Na assessoria, a lista continua com todos (menos o Perguntador e quem pede), com o título dela.
    const advisory = answererGuest(use, env);
    advisory.guest.player('B').resources = 3;
    advisory.guest.player('Host').resources = 0;
    advisory.guest.ctx.showAdvisorySelectModal();
    const advisoryHtml = advisory.elements.advisoryPlayersList.innerHTML;
    check(advisoryHtml.includes('data-advisor-name="C"') && advisoryHtml.includes('data-advisor-name="Host"') &&
        advisory.elements.advisorySelectTitle.textContent === 'advisory.selectTitle',
        'na assessoria, a lista deveria ter C e o Host (mesmo sem recurso), com o título advisory.selectTitle, veio: ' + advisoryHtml);
});

test('T120 Ajuda seguida e certa: quem pediu ganha o acerto sem mexer nos recursos e quem ajudou ganha RESOURCES.HELP_REWARD do patrocinador; os kpi-update e as telas dizem quem ajudou quem', (use) => {
    // 1) Guest pede a guest: B (0) segue a sugestão certa de C (5).
    const env = helpMatch(use, { answererResources: 0, helperResources: 5 });
    const C = env.CONFIG;
    const reward = C.RESOURCES.HELP_REWARD;
    const correct = env.state.currentRound.question.correct;
    const othersBefore = { A: env.player('A').resources, Host: env.player('Host').resources };
    requestHelpFromBToC(env);
    env.Game.network.handleMessage({ type: 'advisory-answer', alternative: correct, declined: false }, 'peer-c');
    const result = env.broadcastsOfType('advisory-result').pop();
    check(result && result.kind === 'help' && result.suggestion === correct && result.declined === false,
        'o advisory-result da ajuda deveria levar kind help e a sugestão, veio: ' + JSON.stringify(result));
    env.Game.network.handleMessage({ type: 'answer', alternative: correct, playerName: 'B' }, 'peer-b');
    const b = env.player('B');
    const c = env.player('C');
    check(b.resources === 0 && b.kpi === C.KPI.CORRECT_ANSWER && b.activities === 1,
        'B deveria ganhar o acerto e continuar com 0 recursos, veio: ' + JSON.stringify(b));
    check(c.resources === 5 + reward && c.kpi === 0, 'C deveria ganhar a recompensa (' + (5 + reward) + ' recursos) e nenhum KPI, veio: ' + JSON.stringify(c));
    check(env.player('A').resources === othersBefore.A && env.player('Host').resources === othersBefore.Host,
        'a recompensa vem do patrocinador: ninguém mais deveria perder recurso');

    const toB = lastUpdateOf(env, 'B');
    check(toB && toB.isCorrect === true && toB.resources === 0 && toB.supportOutcome === 'reward' && toB.supportAmount === reward &&
        toB.supportPartner === 'C',
        'o kpi-update de B deveria dizer que C ajudou e ganhou a recompensa, veio: ' + JSON.stringify(toB));
    const toC = lastUpdateOf(env, 'C');
    check(toC && toC.isCorrect === undefined && toC.resources === 5 + reward && toC.kpi === 0 && toC.supportOutcome === 'reward' &&
        toC.supportAmount === reward && toC.supportPartner === 'B',
        'o kpi-update de C deveria levar a recompensa pela ajuda a B, veio: ' + JSON.stringify(toC));
    env.Game.saveState();
    const saved = JSON.parse(env.storage['pmKPI_roomState']);
    check(saved.players.find(p => p.name === 'B').resources === 0 && saved.players.find(p => p.name === 'C').resources === 5 + reward,
        'o estado salvo deveria guardar os recursos depois da recompensa');

    // Em estouro (−1) e com a Reserva de Contingência: a recompensa é a mesma e quem pediu continua onde estava.
    for (const [resources, event] of [[-1, undefined], [0, RESERVE]]) {
        const other = helpMatch(use, { answererResources: resources, helperResources: 5, event });
        requestHelpFromBToC(other);
        other.Game.network.handleMessage({ type: 'advisory-answer', alternative: correct, declined: false }, 'peer-c');
        other.Game.network.handleMessage({ type: 'answer', alternative: correct, playerName: 'B' }, 'peer-b');
        check(other.player('B').resources === resources && other.player('C').resources === 5 + reward,
            'com ' + resources + ' recursos' + (event ? ' e a Reserva' : '') + ', B deveria continuar em ' + resources + ' e C ganhar ' + reward +
            ', veio: ' + JSON.stringify({ B: other.player('B').resources, C: other.player('C').resources }));
    }

    // 2) Guests: B vê o resultado com a ajuda de C; C vê a recompensa pela ajuda a B.
    const seenByB = guestReceives(use, env, 'B', toB).calls.find(s => s.name === 'showResultModal');
    const helped = seenByB && copy(seenByB.args[3]);
    check(seenByB && seenByB.args[0] === true && seenByB.args[2] === 0 && helped && helped.outcome === 'reward' && helped.amount === reward &&
        helped.partner === 'C',
        'B deveria ver o resultado com a ajuda de C, viu: ' + JSON.stringify(seenByB && seenByB.args));
    const fromC = guestReceives(use, env, 'C', toC);
    const rewarded = fromC.calls.find(s => s.name === 'showSupportResultModal');
    check(rewarded && rewarded.args[0] === 'reward' && rewarded.args[1] === reward && rewarded.args[2] === 'B',
        'C deveria ver a recompensa pela ajuda a B, viu: ' + JSON.stringify(fromC.calls.map(s => s.name)));
    check(fromC.guest.player('C').resources === 5 + reward, 'o guest C deveria aplicar os recursos do kpi-update');

    // 3) O host como quem pede: a própria tela mostra a ajuda de C.
    const hostAsks = helpMatch(use);
    hostAsks.state.currentRound.answerer = 'Host';
    hostAsks.player('Host').resources = 0;
    const hostAskCalls = recordScreens(hostAsks);
    check(hostAsks.Game.core.requestAdvisory('C', 'help') === true, 'pré-condição: o host com 0 recursos pede ajuda a C');
    hostAsks.Game.network.handleMessage({ type: 'advisory-answer', alternative: correct, declined: false }, 'peer-c');
    hostAsks.Game.core.handleAnswer({ type: 'answer', alternative: correct, playerName: 'Host' });
    const hostResult = hostAskCalls.find(s => s.name === 'showResultModal');
    const hostHelped = hostResult && copy(hostResult.args[3]);
    check(hostAsks.player('Host').resources === 0 && hostAsks.player('C').resources === 5 + reward &&
        hostHelped && hostHelped.outcome === 'reward' && hostHelped.amount === reward && hostHelped.partner === 'C',
        'o host deveria ser ajudado por C e ver isso no resultado, viu: ' + JSON.stringify(hostResult && hostResult.args));

    // 4) O host como quem ajuda: a própria tela mostra a recompensa.
    const hostHelps = helpMatch(use);
    hostHelps.player('Host').resources = 3;
    const hostHelpCalls = recordScreens(hostHelps);
    askHelp(hostHelps, 'Host');
    hostHelps.Game.core.handleAdvisoryAnswer({ alternative: correct, declined: false });
    hostHelps.Game.network.handleMessage({ type: 'answer', alternative: correct, playerName: 'B' }, 'peer-b');
    const hostRewarded = hostHelpCalls.find(s => s.name === 'showSupportResultModal');
    check(hostHelps.player('Host').resources === 3 + reward && hostHelps.player('Host').kpi === 0 &&
        hostRewarded && hostRewarded.args[0] === 'reward' && hostRewarded.args[1] === reward && hostRewarded.args[2] === 'B',
        'o host deveria ganhar a recompensa e ver o aviso, viu: ' + JSON.stringify(hostRewarded && hostRewarded.args));

    // 5) Modal do resultado real: a ajuda recebida (quem pediu) e a recompensa (quem ajudou).
    const modal = realResultModal(use);
    modal.ctx.showResultModal(true, 10, 0, { outcome: 'reward', amount: 2, partner: 'Carla' });
    const requesterText = String(modal.elements.resultMessage.textContent);
    check(requesterText.includes('result.kpiGained') && requesterText.includes('result.helperRewarded') &&
        requesterText.includes('"helper":"Carla"') && requesterText.includes('"amount":2'),
        'o resultado de quem pediu deveria trazer o acerto e result.helperRewarded com helper e amount, veio: ' + requesterText);
    modal.ctx.showSupportResultModal('reward', 2, 'Davi');
    const helperText = String(modal.elements.resultMessage.textContent);
    check(modal.elements.resultTitle.textContent === 'result.helpTitle' && helperText.startsWith('result.rewardReceived') &&
        helperText.includes('"requester":"Davi"') && helperText.includes('"amount":2'),
        'quem ajudou deveria ver result.helpTitle e result.rewardReceived com requester e amount, veio: ' +
        modal.elements.resultTitle.textContent + ' / ' + helperText);
    check(modal.elements.resultBoardReminder.style.display === 'none' && modal.elements.modalResult.style.display === 'flex',
        'o aviso da recompensa abre o modal sem o lembrete do tabuleiro');
});

test('T121 Ajuda seguida e errada: quem ajudou cobre o erro com RESOURCES.HELP_COVER e quem pediu não perde; com a Reserva ninguém perde; ignorou, recusa e prazos: resultado normal', (use) => {
    const cover = helpMatch(use).CONFIG.RESOURCES.HELP_COVER;
    // Quem pediu começa com `start` recursos; quem ajuda, com 5.
    const scenarios = [
        { label: 'seguiu a sugestão e errou', suggestion: 'wrong', answer: 'wrong', start: 0, expectedB: 0, expectedC: 5 - cover, outcome: 'cover' },
        { label: 'seguiu a sugestão e errou, em estouro', suggestion: 'wrong', answer: 'wrong', start: -1, expectedB: -1, expectedC: 5 - cover, outcome: 'cover' },
        { label: 'seguiu a sugestão e errou, com a Reserva de Contingência', suggestion: 'wrong', answer: 'wrong', start: 0, event: RESERVE,
            expectedB: 0, expectedC: 5 },
        { label: 'ignorou a sugestão e acertou', suggestion: 'wrong', answer: 'correct', start: 0, expectedB: 0, expectedC: 5 },
        { label: 'ignorou a sugestão e errou', suggestion: 'correct', answer: 'wrong', start: 0, expectedB: -1, expectedC: 5 },
        { label: 'quem ajuda recusou', suggestion: 'declined', answer: 'wrong', start: 0, expectedB: -1, expectedC: 5 },
        { label: 'o prazo de quem ajuda acabou', suggestion: 'timeout', answer: 'wrong', start: 0, expectedB: -1, expectedC: 5 },
        { label: 'aceitou, mas o prazo de resposta acabou', suggestion: 'wrong', answer: 'timeout', start: 0, expectedB: -1, expectedC: 5 },
        { label: 'quem ajudou caiu depois de sugerir (continua cobrindo)', suggestion: 'wrong', answer: 'wrong', start: 0, dropHelper: true,
            expectedB: 0, expectedC: 5 - cover, outcome: 'cover' },
        { label: 'quem ajudou saiu da sala depois de sugerir', suggestion: 'wrong', answer: 'wrong', start: 0, removeHelper: true,
            expectedB: -1, expectedC: null }
    ];
    for (const s of scenarios) {
        const env = helpMatch(use, { answererResources: s.start, helperResources: 5, event: s.event });
        const round = env.state.currentRound;
        const letter = (which) => (which === 'correct' ? round.question.correct : wrongFor(round));
        requestHelpFromBToC(env);
        if (s.suggestion === 'timeout') {
            env.time.advance(env.CONFIG.GAME.ADVISORY_TIMEOUT);
        } else if (s.suggestion === 'declined') {
            env.Game.network.handleMessage({ type: 'advisory-answer', alternative: null, declined: true }, 'peer-c');
        } else {
            env.Game.network.handleMessage({ type: 'advisory-answer', alternative: letter(s.suggestion), declined: false }, 'peer-c');
        }
        check(round.advisory.status === (['timeout', 'declined'].includes(s.suggestion) ? 'declined' : 'accepted') && round.advisory.kind === 'help',
            s.label + ': pré-condição: ajuda resolvida, veio: ' + JSON.stringify(round.advisory));
        if (s.dropHelper) env.drop('peer-c');
        if (s.removeHelper) env.state.players = env.state.players.filter(p => p.name !== 'C');
        if (s.answer === 'timeout') {
            env.time.advance(env.CONFIG.GAME.ANSWER_TIMEOUT);
        } else {
            env.Game.network.handleMessage({ type: 'answer', alternative: letter(s.answer), playerName: 'B' }, 'peer-b');
        }

        const toB = lastUpdateOf(env, 'B');
        check(env.player('B').resources === s.expectedB && toB && toB.resources === s.expectedB,
            s.label + ': B deveria ficar com ' + s.expectedB + ' recursos, veio: ' + JSON.stringify(toB));
        const toC = lastUpdateOf(env, 'C');
        if (s.outcome === 'cover') {
            check(toB.supportOutcome === 'cover' && toB.supportAmount === cover && toB.supportPartner === 'C',
                s.label + ': o kpi-update de B deveria dizer que C cobriu o erro, veio: ' + JSON.stringify(toB));
            check(env.player('C').resources === s.expectedC && env.player('C').kpi === 0 && toC && toC.isCorrect === undefined &&
                toC.resources === s.expectedC && toC.supportOutcome === 'cover' && toC.supportAmount === cover && toC.supportPartner === 'B',
                s.label + ': C deveria cobrir o erro de B (' + s.expectedC + ' recursos), veio: ' + JSON.stringify({ player: env.player('C'), update: toC }));
        } else {
            check(toB.supportOutcome === undefined, s.label + ': o kpi-update de B não deveria falar de apoio, veio: ' + JSON.stringify(toB));
            check(!toC && (s.expectedC === null || (env.player('C').resources === s.expectedC && env.player('C').kpi === 0)),
                s.label + ': C não deveria ganhar nem perder nada (nem kpi-update), veio: ' + JSON.stringify({ player: env.player('C'), update: toC }));
        }
    }

    // Telas: B vê que C cobriu o erro; C vê que cobriu.
    const env = helpMatch(use);
    requestHelpFromBToC(env);
    const wrong = wrongFor(env.state.currentRound);
    env.Game.network.handleMessage({ type: 'advisory-answer', alternative: wrong, declined: false }, 'peer-c');
    env.Game.network.handleMessage({ type: 'answer', alternative: wrong, playerName: 'B' }, 'peer-b');
    const seenByB = guestReceives(use, env, 'B', lastUpdateOf(env, 'B')).calls.find(s => s.name === 'showResultModal');
    const covered = seenByB && copy(seenByB.args[3]);
    check(seenByB && seenByB.args[0] === false && seenByB.args[2] === 0 && covered && covered.outcome === 'cover' && covered.amount === cover &&
        covered.partner === 'C',
        'B deveria ver o erro coberto por C, viu: ' + JSON.stringify(seenByB && seenByB.args));
    const seenByC = guestReceives(use, env, 'C', lastUpdateOf(env, 'C')).calls.find(s => s.name === 'showSupportResultModal');
    check(seenByC && seenByC.args[0] === 'cover' && seenByC.args[1] === cover && seenByC.args[2] === 'B',
        'C deveria ver que cobriu o erro de B, viu: ' + JSON.stringify(seenByC && seenByC.args));

    // Modal do resultado real: erro coberto (quem pediu) e cobertura (quem ajudou).
    const modal = realResultModal(use);
    modal.ctx.showResultModal(false, 0, 0, { outcome: 'cover', amount: 1, partner: 'Carla' });
    const requesterText = String(modal.elements.resultMessage.textContent);
    check(requesterText.includes('result.kpiZero') && requesterText.includes('result.errorCovered') && requesterText.includes('"helper":"Carla"'),
        'o resultado de quem pediu deveria trazer o erro e result.errorCovered com helper, veio: ' + requesterText);
    modal.ctx.showSupportResultModal('cover', 1, 'Davi');
    const helperText = String(modal.elements.resultMessage.textContent);
    check(modal.elements.resultTitle.textContent === 'result.helpTitle' && helperText.startsWith('result.coverPaid') &&
        helperText.includes('"requester":"Davi"') && helperText.includes('"amount":1'),
        'quem ajudou deveria ver result.helpTitle e result.coverPaid com requester e amount, veio: ' +
        modal.elements.resultTitle.textContent + ' / ' + helperText);
    check(modal.elements.resultBoardReminder.style.display === 'none', 'o aviso da cobertura não mostra o lembrete do tabuleiro');
});

test('T123 Um botão para os dois apoios: com recurso, "Pedir Assessoria" e a dica do honorário; com 0 ou menos, "Pedir Ajuda" e a dica da recompensa; textos da ajuda na pergunta, no convite e no resultado; o pedido de ajuda antigo sai da tela', (use) => {
    const env = helpMatch(use);
    const C = env.CONFIG;
    const last = C.FOCUS_AREAS[C.FOCUS_AREAS.length - 1].id;

    // 1) A pergunta na tela de quem responde: o botão e a dica dependem dos recursos.
    const expected = [
        [1, 'advisory.requestButton', 'advisory.feeHint {"amount":' + C.RESOURCES.ADVISORY_FEE + '}'],
        [0, 'help.requestButton', 'help.hint {"amount":' + C.RESOURCES.HELP_REWARD + '}'],
        [-2, 'help.requestButton', 'help.hint {"amount":' + C.RESOURCES.HELP_REWARD + '}']
    ];
    for (const [resources, button, hint] of expected) {
        const b = answererGuest(use, env);
        b.guest.player('B').resources = resources;
        b.guest.ctx.displayQuestion(b.guest.state.currentRound.question);
        check(b.elements.advisoryArea.style.display === 'block' && b.elements.btnRequestAdvisory.textContent === button &&
            b.elements.btnRequestAdvisory.disabled === false,
            'com ' + resources + ' recursos, a área deveria aparecer com o botão ' + button + ', veio: ' +
            JSON.stringify({ area: b.elements.advisoryArea.style.display, button: b.elements.btnRequestAdvisory.textContent }));
        check(b.elements.advisoryFeeHint.textContent === hint,
            'com ' + resources + ' recursos, a dica deveria ser ' + hint + ', veio: ' + b.elements.advisoryFeeHint.textContent);
    }
    // No Encerramento, nenhum dos dois.
    const closing = answererGuest(use, env);
    closing.guest.player('B').resources = 0;
    closing.guest.player('B').focusArea = last;
    closing.guest.ctx.displayQuestion(closing.guest.state.currentRound.question);
    check(closing.elements.advisoryArea.style.display === 'none', 'no Encerramento, a área do apoio deveria ficar escondida, veio: ' +
        closing.elements.advisoryArea.style.display);

    // 2) A situação da ajuda na pergunta reexibida: aguardando, sugestão e recusa.
    const states = [
        [{ advisorName: 'C', status: 'pending', suggestion: null, kind: 'help' }, 'advisory.waitingForAnswer {"advisor":"C"}'],
        [{ advisorName: 'C', status: 'accepted', suggestion: 'b', kind: 'help' }, 'advisory.suggestion {"advisor":"C","suggestion":"B"}'],
        [{ advisorName: 'C', status: 'declined', suggestion: null, kind: 'help' }, 'help.declined {"advisor":"C"}'],
        [{ advisorName: 'C', status: 'declined', suggestion: null, kind: 'advisory' }, 'advisory.declined {"advisor":"C"}']
    ];
    for (const [advisory, text] of states) {
        const b = answererGuest(use, env);
        b.guest.player('B').resources = advisory.kind === 'help' ? 0 : 3;
        b.guest.state.currentRound.advisory = advisory;
        b.guest.ctx.displayQuestion(b.guest.state.currentRound.question);
        check(b.elements.advisoryStatus.textContent === text && b.elements.btnRequestAdvisory.disabled === true,
            JSON.stringify(advisory) + ': deveria mostrar ' + text + ' com o botão travado, veio: ' + b.elements.advisoryStatus.textContent);
    }

    // 3) Avisos da rede na tela de quem pediu: o advisory-started guarda o tipo; a recusa e o has-resources da ajuda.
    const started = answererGuest(use, env);
    started.guest.state.currentRound.advisory = null;
    started.guest.ctx.showAdvisoryStarted({ type: 'advisory-started', kind: 'help', advisorName: 'C', requesterName: 'B' });
    check(started.guest.state.currentRound.advisory && started.guest.state.currentRound.advisory.kind === 'help',
        'o advisory-started da ajuda deveria guardar kind help, veio: ' + JSON.stringify(started.guest.state.currentRound.advisory));
    const declined = answererGuest(use, env);
    declined.guest.state.currentRound.advisory = { advisorName: 'C', status: 'pending', suggestion: null, kind: 'help' };
    declined.guest.ctx.showAdvisoryResult({ type: 'advisory-result', kind: 'help', advisorName: 'C', suggestion: null, declined: true, timeout: false });
    check(declined.elements.advisoryStatus.textContent === 'help.declined {"advisor":"C"}',
        'a recusa da ajuda deveria mostrar help.declined, veio: ' + declined.elements.advisoryStatus.textContent);
    const hasResources = answererGuest(use, env);
    hasResources.elements.btnRequestAdvisory = { id: 'btnRequestAdvisory', disabled: true, style: {}, textContent: '' };
    hasResources.guest.state.currentRound.advisory = { advisorName: 'C', status: 'pending', suggestion: null, kind: 'help' };
    hasResources.guest.ctx.showAdvisoryResult({ type: 'advisory-result', kind: 'help', advisorName: 'C', suggestion: null, declined: true,
        invalid: true, reason: 'has-resources' });
    check(hasResources.elements.advisoryStatus.textContent === 'help.hasResources' && hasResources.elements.btnRequestAdvisory.disabled === true,
        'a recusa has-resources deveria mostrar help.hasResources e manter o botão travado, veio: ' + hasResources.elements.advisoryStatus.textContent);

    // 4) O convite de quem é chamado: título e aviso da ajuda, com a recompensa e a cobertura do CONFIG.
    const question = { question: 'Pergunta?', domain: 'Domínio', alternatives: ['A) Um', 'B) Dois'], id: 'q1' };
    const helper = guestWithScreens(use, env, 'C', ADVISORY_SCREENS);
    helper.guest.state.currentRound = JSON.parse(JSON.stringify({ ...env.state.currentRound, question: null }));
    helper.guest.ctx.showAdvisoryQuestionModal({ type: 'advisory-question', kind: 'help', ...question });
    const notice = helper.elements.advisoryFeeNotice.textContent;
    check(helper.elements.advisoryModalTitle.textContent === 'help.modalTitle' && notice.startsWith('help.notice') &&
        notice.includes('"reward":' + C.RESOURCES.HELP_REWARD) && notice.includes('"cover":' + C.RESOURCES.HELP_COVER),
        'o convite para ajudar deveria ter help.modalTitle e help.notice com reward e cover, veio: ' +
        helper.elements.advisoryModalTitle.textContent + ' / ' + notice);
    helper.guest.ctx.showAdvisoryQuestionModal({ type: 'advisory-question', kind: 'advisory', ...question });
    check(helper.elements.advisoryModalTitle.textContent === 'advisory.modalTitle' &&
        helper.elements.advisoryFeeNotice.textContent === 'advisory.feeNotice {"amount":' + C.RESOURCES.ADVISORY_FEE + '}',
        'o convite para assessorar continua com advisory.modalTitle e advisory.feeNotice, veio: ' + helper.elements.advisoryModalTitle.textContent);

    // 5) O card do perfil não tem mais o botão de ajuda; o game.html, nem o botão nem as modais da fila.
    const card = guestWithScreens(use, env, 'B', ['js/ui/components/profileComponent.js']);
    card.guest.ctx.renderProfileCard({ name: 'B', kpi: 0, resources: 0, focusArea: C.FOCUS_AREAS[0].id, activities: 0 });
    check(card.elements.myResources && card.elements.myResources.textContent === 0 && !('btnRequestHelp' in card.elements),
        'o card do perfil não deveria mexer em btnRequestHelp (o pedido de ajuda fica na pergunta)');
    const html = fs.readFileSync(path.join(ROOT, 'game.html'), 'utf8');
    const gone = ['btnRequestHelp', 'modalHelpRequest', 'modalHelpOffer', 'helpTryingWith', 'helpKpiCost', 'helpOfferText',
        'btnCloseHelpRequest', 'btnAcceptHelpOffer', 'btnDeclineHelpOffer'].filter(id => html.includes('id="' + id + '"'));
    check(gone.length === 0, 'o game.html não deveria ter mais os elementos do pedido de ajuda antigo: ' + gone.join(', '));
    check(/id="advisoryModalTitle"/.test(html) && /id="advisorySelectTitle"/.test(html),
        'o game.html deveria ter os títulos que trocam entre assessoria e ajuda (advisoryModalTitle, advisorySelectTitle)');
});

test('T124 Fim da fila de ajuda: as mensagens help-* são ignoradas; sem tradeEngine, tradeRules, tradeModal, KPI.RESOURCE_PRICE e GAME.HELP_OFFER_TIMEOUT; RESOURCES.HELP_REWARD e HELP_COVER no config real; protocolo 8; textos da ajuda no pt-BR.js', (use) => {
    // 1) Host: help-request e help-offer-response antigos não fazem nada.
    const env = helpMatch(use);
    const before = JSON.stringify(env.state.players);
    env.clearLog();
    env.Game.network.handleMessage({ type: 'help-request', requesterName: 'B' }, 'peer-b');
    env.Game.network.handleMessage({ type: 'help-offer-response', candidateName: 'C', requesterName: 'B', accepted: true }, 'peer-c');
    check(env.record.sent.length === 0 && env.record.broadcasts.length === 0 && JSON.stringify(env.state.players) === before,
        'o host deveria ignorar as mensagens help-*, mandou: ' + JSON.stringify([...env.record.sent.map(e => e.msg), ...env.record.broadcasts]));
    check(env.state.helpQueue === undefined && env.state.helpTimeout === undefined, 'não deveria existir mais fila de ajuda (helpQueue, helpTimeout)');
    check(!('requestHelp' in env.Game.core) && !('handleHelpRequest' in env.Game.core) && !('trade' in env.Game.domain),
        'não deveria existir mais o engine nem a regra do pedido de ajuda antigo');

    // Guest: help-trying, help-offer, help-no-candidates e help-confirmed antigos não mexem na tela nem nos jogadores.
    const guest = use(createEnvironment());
    guest.state.playerName = 'B';
    guest.state.players = JSON.parse(before);
    const calls = recordScreens(guest);
    for (const msg of [
        { type: 'help-trying', candidateName: 'C' },
        { type: 'help-offer', requesterName: 'A' },
        { type: 'help-no-candidates', reason: 'no-donors' },
        { type: 'help-confirmed', donor: 'C', requester: 'B', amount: 10, donorKpi: 10, donorResources: 4, requesterKpi: 0, requesterResources: 1 }
    ]) {
        guest.Game.network.handleMessage(msg, 'sala');
    }
    check(calls.length === 0 && JSON.stringify(guest.state.players) === before,
        'o guest deveria ignorar as mensagens help-*, chamou: ' + calls.map(c => c.name).join(', '));

    // 2) Arquivos e nomes antigos fora do jogo.
    const files = ['js/engine/tradeEngine.js', 'js/domain/tradeRules.js', 'js/ui/modals/tradeModal.js'];
    const still = files.filter(f => fs.existsSync(path.join(ROOT, f)));
    check(still.length === 0, 'os arquivos do pedido de ajuda antigo deveriam sair: ' + still.join(', '));
    const html = fs.readFileSync(path.join(ROOT, 'game.html'), 'utf8');
    check(!/trade(Engine|Rules|Modal)\.js/.test(html), 'o game.html não deveria carregar os arquivos do pedido de ajuda antigo');
    const jsDir = (dir) => fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })
        .flatMap(e => (e.isDirectory() ? jsDir(dir + '/' + e.name) : e.name.endsWith('.js') ? [dir + '/' + e.name] : []));
    const oldTypes = /['"]help-(request|trying|offer|offer-response|no-candidates|confirmed)['"]/;
    const withOld = jsDir('js').filter(f => oldTypes.test(fs.readFileSync(path.join(ROOT, f), 'utf8')));
    check(withOld.length === 0, 'o jogo não deveria mandar nem tratar mais as mensagens help-*: ' + withOld.join(', '));

    // 3) Config real: recompensa e cobertura em RESOURCES; o preço do recurso e o prazo da oferta saíram.
    const configCtx = vm.createContext({});
    vm.runInContext('var window = this;' + fs.readFileSync(path.join(ROOT, 'config/game-config.js'), 'utf8'), configCtx);
    const real = JSON.parse(JSON.stringify(vm.runInContext('CONFIG', configCtx)));
    check(real.RESOURCES.HELP_REWARD === 2 && real.RESOURCES.HELP_COVER === 1,
        'o config real deveria ter RESOURCES.HELP_REWARD = 2 e RESOURCES.HELP_COVER = 1, veio: ' + JSON.stringify(real.RESOURCES));
    check(!('RESOURCE_PRICE' in real.KPI) && !('HELP_OFFER_TIMEOUT' in real.GAME),
        'KPI.RESOURCE_PRICE e GAME.HELP_OFFER_TIMEOUT deveriam sair do config, veio: ' + JSON.stringify({ KPI: real.KPI, GAME: real.GAME }));

    // 4) A ajuda não sobe o protocolo: continua o 8 da economia de recursos.
    check(env.Game.network.PROTOCOL_VERSION === 8, 'a versão do protocolo deveria continuar 8, veio: ' + env.Game.network.PROTOCOL_VERSION);

    // 5) Textos no pt-BR.js real, com os marcadores; os do pedido de ajuda antigo saíram.
    const localeCtx = vm.createContext({});
    vm.runInContext('var window = this;' + fs.readFileSync(path.join(ROOT, 'js/locales/pt-BR.js'), 'utf8'), localeCtx);
    const dict = JSON.parse(JSON.stringify(vm.runInContext("Game.locales['pt-BR']", localeCtx)));
    const markers = (text) => [...new Set([...String(text).matchAll(/\{\{(\w+)\}\}/g)].map(m => m[1]))].sort().join();
    const expectedTexts = {
        'advisory.requestButton': '', 'advisory.selectTitle': '', 'advisory.modalTitle': '',
        'help.requestButton': '', 'help.hint': 'amount', 'help.selectTitle': '', 'help.modalTitle': '', 'help.notice': 'cover,reward',
        'help.declined': 'advisor', 'help.hasResources': '', 'help.helperWithoutResources': 'advisor', 'help.noHelperAvailable': '',
        'result.helpTitle': '', 'result.helperRewarded': 'amount,helper', 'result.errorCovered': 'helper',
        'result.rewardReceived': 'amount,requester', 'result.coverPaid': 'amount,requester'
    };
    for (const [key, keyMarkers] of Object.entries(expectedTexts)) {
        const [section, name] = key.split('.');
        const text = dict[section] && dict[section][name];
        check(typeof text === 'string' && text.length > 0 && markers(text) === keyMarkers,
            'o pt-BR.js deveria ter ' + key + ' com os marcadores [' + keyMarkers + '], veio: ' + JSON.stringify(text));
    }
    check(!('trade' in dict), 'os textos do pedido de ajuda antigo (trade.*) deveriam sair do pt-BR.js');
});

finish('Pedido de ajuda e assessoria');
