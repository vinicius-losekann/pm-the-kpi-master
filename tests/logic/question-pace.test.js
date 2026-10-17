// ============================================
// PM: The KPI Master - Testes de lógica: Ritmo da pergunta
// ============================================
// A etapa "Fazer a pergunta": no início da rodada, só o Perguntador
// recebe a pergunta (com o gabarito) e um botão para fazê-la; quem
// responde espera e só recebe as alternativas — e o prazo de resposta —
// quando ele clica, ou sozinho, no prazo do Perguntador (ASK_TIMEOUT).
// Também o prazo de resposta pausado durante o apoio, que continua de
// onde parou (BUG-028), e o aviso de tempo esgotado.
// Ambiente simulado e ajudantes: environment.js. Rodar a partir da raiz:
//     node tests/logic/question-pace.test.js
// ============================================

const {
    fs, path, vm, ROOT, createEnvironment, test, check, start, finish,
    roomToReload, reloadHost, recordScreens, guestWithScreens
} = require('./environment');

start('Ritmo da pergunta');

// Prazo do Perguntador nos testes (o real é outro): o jogo tem de ler o CONFIG.
const ASK = 25000;

/** Mensagens de um tipo enviadas a um peer. */
function sentTo(env, peerId, type) {
    return env.record.sent.filter(e => e.to === peerId && e.msg.type === type).map(e => e.msg);
}

/** Cópia simples (tira o objeto do contexto vm); undefined continua undefined. */
const copy = (x) => (x === undefined ? undefined : JSON.parse(JSON.stringify(x)));

/**
 * Partida de 3 (Host, A, B) com tempo falso (env.time) e a etapa de
 * perguntar ligada (ASK_TIMEOUT = ASK). Sorteio fixo: A pergunta, B
 * responde, o host assiste. `reload` prepara a sala para um F5 do host.
 */
function askingMatch(use, { reload = false } = {}) {
    const env = use(createEnvironment());
    env.time = env.fakeTime();
    vm.runInContext('Math.random = () => 0.99', env.ctx);
    if (reload) roomToReload(env); else env.createRoomAsHost();
    env.CONFIG.GAME.ASK_TIMEOUT = ASK;
    env.join('A', 'peer-a');
    env.join('B', 'peer-b');
    env.startMatch();
    const r = env.state.currentRound;
    check(r && r.asker === 'A' && r.answerer === 'B',
        'pré-condição: A pergunta e B responde, veio: ' + JSON.stringify(r && { asker: r.asker, answerer: r.answerer }));
    return env;
}

/** A clica em "Fazer a pergunta" (a mensagem chega pela conexão dele). */
function askFromA(env) {
    env.Game.network.handleMessage({ type: 'ask-question', playerName: 'A' }, 'peer-a');
}

/** B (quem responde) já respondeu, pelo kpi-update mandado aos guests? */
const answeredByB = (env) => env.broadcastsOfType('kpi-update').some(m => m.playerName === 'B');

// Telas reais da pergunta, do apoio e do resultado (a escolha do assessor usa o sanitize.js).
const QUESTION_SCREENS = ['js/utils/sanitize.js', 'js/ui/modals/advisoryModal.js',
    'js/ui/components/questionComponent.js', 'js/ui/modals/resultModal.js'];

/**
 * Guest com as telas reais de QUESTION_SCREENS, em que Game.ui.* chama a
 * função real quando ela é de um desses arquivos (as outras telas não
 * fazem nada): a mensagem passa pelo handleMessage() real e chega à tela
 * real, qualquer que seja o caminho entre as duas.
 */
function guestOnScreen(use, host, name) {
    const g = guestWithScreens(use, host, name, QUESTION_SCREENS);
    const names = new Set(QUESTION_SCREENS.flatMap(f =>
        [...fs.readFileSync(path.join(ROOT, f), 'utf8').matchAll(/^function (\w+)/gm)].map(m => m[1])));
    g.guest.Game.ui = new Proxy({}, { get: (_, n) => (names.has(String(n)) ? g.guest.ctx[n] : () => {}) });
    return g;
}

/** Algum elemento da tela mostra um texto que começa com `key`? Devolve o texto. */
function textOnScreen(elements, key) {
    const found = Object.values(elements).find(e => String(e.textContent).startsWith(key));
    return found ? String(found.textContent) : null;
}

// ============================================
// A ETAPA "FAZER A PERGUNTA"
// ============================================

test('T130 Fazer a pergunta: no início da rodada só o Perguntador recebe a pergunta; quem responde a recebe quando ele clica, e o prazo de resposta conta dali', (use) => {
    const env = askingMatch(use);
    check(env.Game.network.PROTOCOL_VERSION >= 9, 'a versão do protocolo deveria ser 9 ou mais (etapa de fazer a pergunta), veio: ' +
        env.Game.network.PROTOCOL_VERSION);
    const r = env.state.currentRound;
    const toA = sentTo(env, 'peer-a', 'question');
    check(toA.length === 1 && toA[0].isAsker === true && toA[0].correct === r.question.correct,
        'A (Perguntador) deveria receber a pergunta com o gabarito no início da rodada, recebeu: ' + JSON.stringify(toA));
    check(sentTo(env, 'peer-b', 'question').length === 0,
        'B não deveria receber a pergunta antes de A fazê-la, recebeu: ' + JSON.stringify(sentTo(env, 'peer-b', 'question')));
    check(r.asked === false, 'a rodada deveria marcar que a pergunta ainda não foi feita (asked: false), veio: ' + r.asked);
    check(!env.state.answerTimeout, 'o prazo de resposta de B não deveria correr antes da pergunta');

    // A lê a pergunta em voz alta por 10s e clica.
    env.time.advance(10000);
    env.clearLog();
    askFromA(env);
    const toB = sentTo(env, 'peer-b', 'question');
    check(toB.length === 1 && toB[0].isAnswerer === true && toB[0].correct === undefined && toB[0].question === r.question.question &&
        toB[0].alternatives.length === 4,
        'depois do clique, B deveria receber a pergunta com as alternativas e sem o gabarito, recebeu: ' + JSON.stringify(toB));
    const asked = env.broadcastsOfType('question-asked');
    check(asked.length === 1 && asked[0].auto !== true, 'todos deveriam saber que A fez a pergunta (question-asked, sem auto), veio: ' + JSON.stringify(asked));
    check(env.state.currentRound.asked === true, 'a rodada deveria marcar a pergunta como feita');

    // O prazo de resposta (ANSWER_TIMEOUT) começa na pergunta, não no início da rodada.
    const answer = env.CONFIG.GAME.ANSWER_TIMEOUT;
    env.time.advance(answer - 1);
    check(!answeredByB(env), 'B ainda deveria ter tempo 1ms antes de ANSWER_TIMEOUT, contado da pergunta');
    env.time.advance(1);
    check(answeredByB(env) && env.state.answeredThisRound.includes('B'), 'em ANSWER_TIMEOUT depois da pergunta, a vez de B deveria acabar');
});

test('T131 Só o Perguntador faz a pergunta, uma vez: o pedido de quem responde, de quem assiste ou de outra conexão é ignorado, e o repetido também', (use) => {
    const env = askingMatch(use);
    env.clearLog();
    env.Game.network.handleMessage({ type: 'ask-question', playerName: 'B' }, 'peer-b');       // quem responde
    env.Game.network.handleMessage({ type: 'ask-question', playerName: 'A' }, 'peer-b');       // B dizendo ser A
    env.Game.network.handleMessage({ type: 'ask-question', playerName: 'Host' }, 'peer-host'); // quem assiste
    check(sentTo(env, 'peer-b', 'question').length === 0 && env.broadcastsOfType('question-asked').length === 0 &&
        env.state.currentRound.asked === false,
        'só o Perguntador, pela conexão dele, pode fazer a pergunta, veio: ' + JSON.stringify(env.record.broadcasts.map(m => m.type)));

    askFromA(env);
    askFromA(env);
    check(sentTo(env, 'peer-b', 'question').length === 1 && env.broadcastsOfType('question-asked').length === 1,
        'clicar duas vezes não deveria mandar a pergunta duas vezes');
    // Feita a pergunta, o envio automático não manda de novo.
    env.time.advance(ASK);
    check(sentTo(env, 'peer-b', 'question').length === 1 && env.broadcastsOfType('question-asked').length === 1,
        'o prazo do Perguntador não deveria mandar a pergunta de novo depois do clique');
});

test('T132 Sem o clique, a pergunta vai sozinha no prazo do Perguntador (CONFIG.GAME.ASK_TIMEOUT), e o prazo de resposta conta dali', (use) => {
    const env = askingMatch(use);
    env.clearLog();
    env.time.advance(ASK - 1);
    check(sentTo(env, 'peer-b', 'question').length === 0 && env.state.currentRound.asked === false,
        'antes de ASK_TIMEOUT a pergunta não deveria ir sozinha');
    env.time.advance(1);
    const toB = sentTo(env, 'peer-b', 'question');
    const asked = env.broadcastsOfType('question-asked');
    check(toB.length === 1 && toB[0].isAnswerer === true && toB[0].correct === undefined,
        'em ASK_TIMEOUT a pergunta deveria ir sozinha para B, sem o gabarito, veio: ' + JSON.stringify(toB));
    check(asked.length === 1 && asked[0].auto === true && env.state.currentRound.asked === true,
        'o envio automático deveria avisar todos com question-asked (auto: true), veio: ' + JSON.stringify(asked));

    const answer = env.CONFIG.GAME.ANSWER_TIMEOUT;
    env.time.advance(answer - 1);
    check(!answeredByB(env), 'B ainda deveria ter tempo 1ms antes de ANSWER_TIMEOUT, contado do envio automático');
    env.time.advance(1);
    check(answeredByB(env), 'em ANSWER_TIMEOUT depois do envio automático, a vez de B deveria acabar');
});

test('T133 ASK_TIMEOUT 0 desliga a etapa: a pergunta vai direto para quem responde, com o prazo de resposta já correndo', (use) => {
    const env = use(createEnvironment());
    env.fakeTime();
    vm.runInContext('Math.random = () => 0.99', env.ctx);
    env.createRoomAsHost();
    env.join('A', 'peer-a');
    env.join('B', 'peer-b');
    check(env.CONFIG.GAME.ASK_TIMEOUT === 0, 'pré-condição: o CONFIG de teste começa com ASK_TIMEOUT 0');
    env.startMatch();
    const toB = sentTo(env, 'peer-b', 'question');
    check(toB.length === 1 && toB[0].isAnswerer === true && toB[0].correct === undefined, 'com 0, B deveria receber a pergunta no início da rodada');
    check(env.state.currentRound.asked === true && env.state.answerTimeout,
        'com 0, a pergunta deveria contar como feita e o prazo de resposta já correr, veio: ' + JSON.stringify({ asked: env.state.currentRound.asked }));
});

// ============================================
// PRAZO DE RESPOSTA PAUSADO NO APOIO (BUG-028)
// ============================================

test('T134 BUG-028 no host: durante o apoio o prazo de quem responde para e, no fim, continua de onde parou; o tempo que resta vai no advisory-started e no advisory-result', (use) => {
    const answer = (env) => env.CONFIG.GAME.ANSWER_TIMEOUT;

    // 1) O assessor responde: faltavam 5s, o assessor pensou 10s, B continua com 5s.
    const env = askingMatch(use);
    askFromA(env);
    env.time.advance(answer(env) - 5000);
    env.clearLog();
    env.Game.network.handleMessage({ type: 'advisory-request', advisorName: 'Host', requesterName: 'B' }, 'peer-b');
    const started = env.broadcastsOfType('advisory-started').pop();
    check(started && started.answerTimeLeft === 5000, 'o advisory-started deveria levar o tempo que resta a B em ms (5000), veio: ' + JSON.stringify(started));
    check(!env.state.answerTimeout, 'o prazo de resposta deveria parar durante o apoio');
    env.time.advance(10000);
    check(!answeredByB(env), 'o prazo de B não pode vencer enquanto o assessor pensa');
    env.Game.core.handleAdvisoryAnswer({ alternative: env.state.currentRound.question.correct, declined: false });
    const result = env.broadcastsOfType('advisory-result').pop();
    check(result && result.answerTimeLeft === 5000, 'o advisory-result deveria levar o tempo que resta a B (5000), veio: ' + JSON.stringify(result));
    env.time.advance(4999);
    check(!answeredByB(env), 'B deveria ter os 5s que faltavam (ainda não acabou em 4999ms)');
    env.time.advance(1);
    check(answeredByB(env), 'os 5s que faltavam deveriam acabar: B não ganha um prazo inteiro de novo');

    // 2) O prazo do assessor acaba: B continua com o que faltava.
    const late = askingMatch(use);
    askFromA(late);
    late.time.advance(answer(late) - 5000);
    late.Game.network.handleMessage({ type: 'advisory-request', advisorName: 'Host', requesterName: 'B' }, 'peer-b');
    late.time.advance(late.CONFIG.GAME.ADVISORY_TIMEOUT);
    const timedOut = late.broadcastsOfType('advisory-result').pop();
    check(timedOut && timedOut.timeout === true && timedOut.answerTimeLeft === 5000,
        'com o prazo do assessor esgotado, o advisory-result deveria levar o tempo que resta a B, veio: ' + JSON.stringify(timedOut));
    late.time.advance(4999);
    check(!answeredByB(late), 'depois do prazo do assessor, B ainda deveria ter os 5s que faltavam');
    late.time.advance(1);
    check(answeredByB(late), 'os 5s que faltavam deveriam acabar depois do prazo do assessor');

    // 3) O host é quem responde: o broadcast não chega a ele, então a tela dele é avisada direto.
    const hostAnswers = askingMatch(use);
    askFromA(hostAnswers);
    hostAnswers.state.currentRound.answerer = 'Host';
    const screens = recordScreens(hostAnswers);
    check(hostAnswers.Game.core.requestAdvisory('B') === true, 'pré-condição: o host pede assessoria a B');
    const shown = screens.find(s => s.name === 'showAdvisoryStarted');
    check(shown && typeof shown.args[0].answerTimeLeft === 'number',
        'a tela do host que responde deveria receber o aviso do apoio com o tempo que resta, veio: ' + JSON.stringify(shown && shown.args));
});

test('T135 BUG-028 na tela: o contador de quem responde para quando o apoio começa e volta a contar do tempo que restava', (use) => {
    const env = askingMatch(use);
    askFromA(env);
    const { guest, elements } = guestOnScreen(use, env, 'B');
    const clock = guest.fakeClock();
    for (const type of ['round-start', 'question-asked']) {
        const msg = env.broadcastsOfType(type).pop();
        if (msg) guest.Game.network.handleMessage(copy(msg), 'sala');
    }
    guest.Game.network.handleMessage(copy(sentTo(env, 'peer-b', 'question').pop()), 'sala');
    const full = env.CONFIG.GAME.ANSWER_TIMEOUT / 1000;
    check(clock.activeCount() === 1 && elements.answerTimerText.textContent === 'question.timeLeft {"seconds":' + full + '}',
        'com a pergunta aberta, o contador de B deveria correr do prazo inteiro, veio: ' + (elements.answerTimerText || {}).textContent);
    clock.tick(3);

    guest.ctx.showAdvisoryStarted({ type: 'advisory-started', kind: 'advisory', advisorName: 'Host', requesterName: 'B', answerTimeLeft: (full - 3) * 1000 });
    check(clock.activeCount() === 0, 'o contador de B deveria parar enquanto o apoio está pendente, ligados: ' + clock.activeCount());

    guest.ctx.showAdvisoryResult({ type: 'advisory-result', kind: 'advisory', advisorName: 'Host', suggestion: 'a', declined: false, timeout: false,
        answerTimeLeft: 41000 });
    check(clock.activeCount() === 1 && elements.answerTimerText.textContent === 'question.timeLeft {"seconds":41}',
        'com o fim do apoio, o contador de B deveria voltar do tempo que restava (41s), veio: ' + elements.answerTimerText.textContent);
    clock.tick();
    check(elements.answerTimerText.textContent === 'question.timeLeft {"seconds":40}', 'o contador deveria continuar descendo, veio: ' +
        elements.answerTimerText.textContent);

    // Recusa na hora (o apoio nem começou): o contador não para nem recomeça.
    guest.ctx.showAdvisoryResult({ type: 'advisory-result', kind: 'advisory', advisorName: 'Host', suggestion: null, declined: true, invalid: true,
        reason: 'helper-without-resources' });
    check(clock.activeCount() === 1 && elements.answerTimerText.textContent === 'question.timeLeft {"seconds":40}',
        'uma recusa sem o tempo que resta não deveria mexer no contador, veio: ' + elements.answerTimerText.textContent);
});

// ============================================
// TELAS DA ETAPA, TEMPO ESGOTADO
// ============================================

test('T136 Telas da etapa: quem responde espera o Perguntador (sem alternativas); o Perguntador tem o botão "Fazer a pergunta", que manda ask-question e some quando a pergunta é feita', (use) => {
    const env = askingMatch(use);
    const roundStart = copy(env.broadcastsOfType('round-start').pop());

    // Quem responde (B), antes da pergunta: aviso de que A vai perguntar, sem a janela de resposta.
    const b = guestOnScreen(use, env, 'B');
    b.guest.Game.network.handleMessage(roundStart, 'sala');
    check(b.guest.state.currentRound.asked === false, 'B deveria guardar que a pergunta ainda não foi feita, veio: ' + b.guest.state.currentRound.asked);
    const waiting = textOnScreen(b.elements, 'question.waitingToBeAsked');
    check(waiting && waiting.includes('"asker":"A"'), 'B deveria ver question.waitingToBeAsked com o nome de A, veio: ' + waiting);
    check((b.elements.modalAnswerQuestion || { style: {} }).style.display !== 'flex', 'B não deveria ver a janela de resposta antes da pergunta');

    // O Perguntador (A): a pergunta com o gabarito e o botão.
    const a = guestOnScreen(use, env, 'A');
    a.guest.Game.network.handleMessage(copy(roundStart), 'sala');
    a.guest.Game.network.handleMessage(copy(sentTo(env, 'peer-a', 'question').pop()), 'sala');
    const button = a.elements.btnAskQuestion;
    check(button && button.style.display === 'block' && button.disabled === false, 'A deveria ver o botão "Fazer a pergunta" liberado, veio: ' +
        JSON.stringify(button && { display: button.style.display, disabled: button.disabled }));
    check(button.textContent === 'question.askButton' && textOnScreen(a.elements, 'question.askHint'),
        'o botão deveria ter o texto question.askButton e a dica question.askHint, veio: ' + button.textContent);
    a.guest.ctx.handleAskClick();
    const sent = a.guest.record.toHost.filter(m => m.type === 'ask-question');
    check(sent.length === 1 && sent[0].playerName === 'A' && button.disabled === true,
        'o clique deveria mandar ask-question com o nome de A e travar o botão, mandou: ' + JSON.stringify(a.guest.record.toHost));

    // A pergunta foi feita: o botão some para A; B recebe a pergunta e a janela abre com o contador.
    askFromA(env);
    const asked = copy(env.broadcastsOfType('question-asked').pop());
    a.guest.Game.network.handleMessage(copy(asked), 'sala');
    check(button.style.display === 'none' && a.guest.state.currentRound.asked === true,
        'com a pergunta feita, o botão deveria sumir para A, veio: ' + button.style.display);
    b.guest.Game.network.handleMessage(asked, 'sala');
    b.guest.Game.network.handleMessage(copy(sentTo(env, 'peer-b', 'question').pop()), 'sala');
    check(b.guest.state.currentRound.asked === true && b.elements.modalAnswerQuestion.style.display === 'flex' &&
        b.elements.answerTimerText.textContent === 'question.timeLeft {"seconds":' + env.CONFIG.GAME.ANSWER_TIMEOUT / 1000 + '}',
        'com a pergunta, B deveria ver a janela de resposta com o contador inteiro, veio: ' +
        JSON.stringify({ modal: b.elements.modalAnswerQuestion.style.display, timer: (b.elements.answerTimerText || {}).textContent }));
});

test('T137 Tempo esgotado: conta como erro (gasta 1 recurso e entra no rodízio), o kpi-update leva timedOut e quem respondia vê "Tempo esgotado"', (use) => {
    const env = askingMatch(use);
    const before = env.player('B').resources;
    askFromA(env);
    env.time.advance(env.CONFIG.GAME.ANSWER_TIMEOUT);
    const update = env.broadcastsOfType('kpi-update').find(m => m.playerName === 'B');
    check(update && update.timedOut === true && update.isCorrect === false && update.resources === before - 1 &&
        env.state.answeredThisRound.includes('B'),
        'o tempo esgotado deveria contar como erro e o kpi-update levar timedOut: true, veio: ' + JSON.stringify(update));

    // Tela de B: o título diz que o tempo acabou.
    const b = guestOnScreen(use, env, 'B');
    b.guest.Game.network.handleMessage(copy(update), 'sala');
    check(b.elements.resultTitle && b.elements.resultTitle.textContent === 'result.timeout' && b.elements.modalResult.style.display === 'flex',
        'B deveria ver o resultado com o título result.timeout, veio: ' + (b.elements.resultTitle || {}).textContent);

    // Errar respondendo continua sendo "Errou", sem timedOut.
    const wrong = askingMatch(use);
    askFromA(wrong);
    const letter = ['A', 'B', 'C', 'D'].find(x => x !== wrong.state.currentRound.question.correct);
    wrong.Game.network.handleMessage({ type: 'answer', alternative: letter, playerName: 'B' }, 'peer-b');
    const wrongUpdate = wrong.broadcastsOfType('kpi-update').find(m => m.playerName === 'B');
    check(wrongUpdate && wrongUpdate.isCorrect === false && wrongUpdate.timedOut !== true,
        'uma resposta errada não deveria levar timedOut, veio: ' + JSON.stringify(wrongUpdate));
    const w = guestOnScreen(use, wrong, 'B');
    w.guest.Game.network.handleMessage(copy(wrongUpdate), 'sala');
    check(w.elements.resultTitle.textContent === 'result.wrong', 'a resposta errada deveria mostrar result.wrong, veio: ' + w.elements.resultTitle.textContent);
});

// ============================================
// F5, VOLTA À PARTIDA E TROCA DE HOST ANTES DA PERGUNTA
// ============================================

test('T138 F5 do host antes da pergunta: a rodada continua esperando o Perguntador (prazo dele de novo, sem prazo de resposta); rodada salva sem `asked` conta como pergunta feita', (use) => {
    // 1) Antes do clique de A.
    const env = askingMatch(use, { reload: true });
    const reloaded = use(reloadHost(env));
    reloaded.CONFIG.GAME.ASK_TIMEOUT = ASK;
    const time = reloaded.fakeTime();
    reloaded.Game.core.resumeMatchAfterReload();
    check(reloaded.state.currentRound && reloaded.state.currentRound.asked === false,
        'depois do F5, a rodada deveria continuar com a pergunta por fazer, veio: ' + JSON.stringify(reloaded.state.currentRound && reloaded.state.currentRound.asked));
    check(sentTo(reloaded, 'peer-b', 'question').length === 0 && !reloaded.state.answerTimeout,
        'o F5 não deveria mandar a pergunta a B nem ligar o prazo de resposta antes de A perguntar');
    time.advance(ASK - 1);
    check(sentTo(reloaded, 'peer-b', 'question').length === 0, 'o prazo de A recomeça no F5: ainda não deveria ter ido');
    time.advance(1);
    check(sentTo(reloaded, 'peer-b', 'question').length === 1 && reloaded.state.answerTimeout,
        'no prazo de A depois do F5, a pergunta deveria ir sozinha para B, com o prazo de resposta');

    // 2) Rodada salva por uma versão sem a etapa (sem o campo asked): a pergunta já tinha sido feita.
    const old = askingMatch(use, { reload: true });
    const saved = JSON.parse(old.storage['pmKPI_roomState']);
    delete saved.currentRound.asked;
    old.storage['pmKPI_roomState'] = JSON.stringify(saved);
    const reloadedOld = use(reloadHost(old));
    reloadedOld.CONFIG.GAME.ASK_TIMEOUT = ASK;
    const timeOld = reloadedOld.fakeTime();
    reloadedOld.Game.core.resumeMatchAfterReload();
    check(reloadedOld.state.answerTimeout && !reloadedOld.state.askTimeout,
        'rodada salva sem asked: o F5 deveria ligar o prazo de resposta, não o do Perguntador');
    timeOld.advance(reloadedOld.CONFIG.GAME.ANSWER_TIMEOUT);
    check(answeredByB(reloadedOld), 'rodada salva sem asked: o prazo de resposta de B deveria vencer normalmente');
});

test('T139 Volta à partida antes da pergunta (state-sync): quem responde vê a espera, sem as alternativas; o Perguntador vê o botão', (use) => {
    const env = askingMatch(use);
    const round = env.state.currentRound;
    // O que o host manda a quem volta (addPlayer): a rodada sem o gabarito.
    const fullState = copy({
        players: env.state.players, decks: env.state.decks || {}, timer: 100, gameStarted: true,
        currentRound: { ...round, question: { ...round.question, correct: undefined } },
        roundEnded: false, matchPaused: null, answeredThisRound: [], gameOver: false, finalRanking: null
    });

    const b = guestOnScreen(use, env, 'B');
    b.guest.receiveSync('B', copy(fullState));
    check(b.guest.state.currentRound.asked === false, 'B deveria receber a rodada com a pergunta por fazer');
    check((b.elements.modalAnswerQuestion || { style: {} }).style.display !== 'flex',
        'B não deveria ver a janela de resposta ao voltar antes da pergunta');
    check(textOnScreen(b.elements, 'question.waitingToBeAsked'), 'B deveria ver o aviso de que A vai perguntar (question.waitingToBeAsked)');

    const a = guestOnScreen(use, env, 'A');
    a.guest.receiveSync('A', copy(fullState));
    check(a.elements.btnAskQuestion && a.elements.btnAskQuestion.style.display === 'block',
        'A deveria ver o botão "Fazer a pergunta" ao voltar antes da pergunta, veio: ' + JSON.stringify(a.elements.btnAskQuestion && a.elements.btnAskQuestion.style));
});

test('T141 Fim de jogo e troca de dupla cancelam o envio automático da pergunta', (use) => {
    // Fim de jogo antes da pergunta.
    const env = askingMatch(use);
    check(env.state.askTimeout, 'pré-condição: prazo do Perguntador armado');
    env.Game.core.endGame(env.Game.core.buildRanking());
    check(!env.state.askTimeout && env.time.pending() === 0, 'o fim de jogo deveria cancelar o prazo do Perguntador, sobraram: ' + env.time.pending());

    // B cai antes da pergunta: dupla nova (A responde, o host pergunta), com o prazo do Perguntador desde a troca.
    const drop = askingMatch(use);
    drop.time.advance(10000);
    drop.drop('peer-b');
    const r = drop.state.currentRound;
    check(r && r.answerer === 'A' && r.asker === 'Host' && r.asked === false, 'pré-condição: dupla nova com a pergunta por fazer, veio: ' + JSON.stringify(r));
    drop.time.advance(ASK - 10000);
    check(drop.state.currentRound.asked === false && sentTo(drop, 'peer-a', 'question').filter(m => m.isAnswerer).length === 0,
        'o prazo da dupla descartada não pode mandar a pergunta da dupla nova antes da hora');
    drop.time.advance(10000);
    check(drop.state.currentRound.asked === true && sentTo(drop, 'peer-a', 'question').filter(m => m.isAnswerer).length === 1,
        'a pergunta da dupla nova deveria ir no prazo dela');
});

test('T142 Prazos do config real: 90s para responder, 60s para a assessoria e a ajuda, 30s para o Perguntador', () => {
    const ctx = vm.createContext({});
    vm.runInContext('var window = this;' + fs.readFileSync(path.join(ROOT, 'config/game-config.js'), 'utf8'), ctx);
    const game = JSON.parse(JSON.stringify(vm.runInContext('CONFIG.GAME', ctx)));
    check(game.ANSWER_TIMEOUT === 90000 && game.ADVISORY_TIMEOUT === 60000 && game.ASK_TIMEOUT === 30000,
        'o config real deveria ter ANSWER_TIMEOUT 90000, ADVISORY_TIMEOUT 60000 e ASK_TIMEOUT 30000, veio: ' +
        JSON.stringify({ ANSWER_TIMEOUT: game.ANSWER_TIMEOUT, ADVISORY_TIMEOUT: game.ADVISORY_TIMEOUT, ASK_TIMEOUT: game.ASK_TIMEOUT }));
});

finish('Ritmo da pergunta');
