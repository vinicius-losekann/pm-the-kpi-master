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
    roomToReload, reloadHost, recordScreens, guestWithScreens, savedState, storeSavedState
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
 * responde, o host assiste. `reload` prepara a sala para um F5 do host;
 * `offset` é quanto a hora do servidor está à frente do relógio do host.
 */
function askingMatch(use, { reload = false, offset = 0 } = {}) {
    const env = use(createEnvironment());
    env.time = env.fakeTime();
    env.setServerOffset(offset);
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
 * real, qualquer que seja o caminho entre as duas. O relógio do guest
 * (g.time) começa na hora do host: os prazos que vêm nas mensagens são
 * horas de término.
 */
function guestOnScreen(use, host, name) {
    const g = guestWithScreens(use, host, name, QUESTION_SCREENS);
    g.time = g.guest.fakeTime(host.time.now());
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

test('T134 BUG-028 no host: durante o apoio o prazo de quem responde para e, no fim, continua de onde parou; o tempo que resta vai no advisory-started e a nova hora de término no advisory-result', (use) => {
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
    check(result && result.answerEndsAt === env.time.now() + 5000 && result.answerTimeLeft === undefined,
        'o advisory-result deveria levar a nova hora de término do prazo de B (agora + 5000), sem answerTimeLeft, veio: ' + JSON.stringify(result));
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
    check(timedOut && timedOut.timeout === true && timedOut.answerEndsAt === late.time.now() + 5000,
        'com o prazo do assessor esgotado, o advisory-result deveria levar a nova hora de término do prazo de B (agora + 5000), veio: ' + JSON.stringify(timedOut));
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

test('T135 BUG-028 na tela: o contador de quem responde conta pela hora de término (hora do servidor), para quando o apoio começa e volta pela nova hora de término', (use) => {
    const env = askingMatch(use);
    askFromA(env);
    const { guest, elements } = guestOnScreen(use, env, 'B');
    const clock = guest.fakeClock();
    // O relógio do aparelho de B está 30 s adiantado; a hora do servidor corrige.
    const time = guest.fakeTime(env.time.now() + 30000);
    guest.setServerOffset(-30000);
    for (const type of ['round-start', 'question-asked']) {
        const msg = env.broadcastsOfType(type).pop();
        if (msg) guest.Game.network.handleMessage(copy(msg), 'sala');
    }
    const question = sentTo(env, 'peer-b', 'question').pop();
    check(question && question.answerEndsAt === env.time.now() + env.CONFIG.GAME.ANSWER_TIMEOUT,
        'a pergunta para B deveria levar a hora de término do prazo de resposta (answerEndsAt), veio: ' + JSON.stringify(question && question.answerEndsAt));
    guest.Game.network.handleMessage(copy(question), 'sala');
    const full = env.CONFIG.GAME.ANSWER_TIMEOUT / 1000;
    check(clock.activeCount() === 1 && elements.answerTimerText.textContent === 'question.timeLeft {"seconds":' + full + '}',
        'com a pergunta aberta, o contador de B deveria correr do prazo inteiro, veio: ' + (elements.answerTimerText || {}).textContent);
    time.advance(3000);
    clock.tick();
    check(elements.answerTimerText.textContent === 'question.timeLeft {"seconds":' + (full - 3) + '}',
        'depois de 3 s com um tique só, o contador deveria mostrar o que falta até a hora de término (' + (full - 3) + 's), veio: ' + elements.answerTimerText.textContent);

    guest.ctx.showAdvisoryStarted({ type: 'advisory-started', kind: 'advisory', advisorName: 'Host', requesterName: 'B', answerTimeLeft: (full - 3) * 1000 });
    check(clock.activeCount() === 0, 'o contador de B deveria parar enquanto o apoio está pendente, ligados: ' + clock.activeCount());

    time.advance(10000);
    const resumedEndsAt = guest.Game.network.serverNow() + 41000;
    guest.ctx.showAdvisoryResult({ type: 'advisory-result', kind: 'advisory', advisorName: 'Host', suggestion: 'a', declined: false, timeout: false,
        answerEndsAt: resumedEndsAt });
    check(clock.activeCount() === 1 && elements.answerTimerText.textContent === 'question.timeLeft {"seconds":41}',
        'com o fim do apoio, o contador de B deveria voltar pela nova hora de término (41s), veio: ' + elements.answerTimerText.textContent);
    time.advance(1000);
    clock.tick();
    check(elements.answerTimerText.textContent === 'question.timeLeft {"seconds":40}', 'o contador deveria continuar descendo, veio: ' +
        elements.answerTimerText.textContent);

    // Recusa na hora (o apoio nem começou): o contador não para nem recomeça.
    guest.ctx.showAdvisoryResult({ type: 'advisory-result', kind: 'advisory', advisorName: 'Host', suggestion: null, declined: true, invalid: true,
        reason: 'helper-without-resources' });
    check(clock.activeCount() === 1 && elements.answerTimerText.textContent === 'question.timeLeft {"seconds":40}',
        'uma recusa sem a hora de término não deveria mexer no contador, veio: ' + elements.answerTimerText.textContent);
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

test('T138 F5 do host antes da pergunta: a rodada continua esperando o Perguntador (o prazo dele continua de onde estava, sem prazo de resposta); rodada salva sem `asked` conta como pergunta feita', (use) => {
    // 1) Antes do clique de A, 10 s depois do início da rodada.
    const env = askingMatch(use, { reload: true });
    env.time.advance(10000);
    const reloaded = use(reloadHost(env));
    reloaded.CONFIG.GAME.ASK_TIMEOUT = ASK;
    const time = reloaded.fakeTime(env.time.now());
    reloaded.Game.core.resumeMatchAfterReload();
    check(reloaded.state.currentRound && reloaded.state.currentRound.asked === false,
        'depois do F5, a rodada deveria continuar com a pergunta por fazer, veio: ' + JSON.stringify(reloaded.state.currentRound && reloaded.state.currentRound.asked));
    check(sentTo(reloaded, 'peer-b', 'question').length === 0 && !reloaded.state.answerTimeout,
        'o F5 não deveria mandar a pergunta a B nem ligar o prazo de resposta antes de A perguntar');
    time.advance(ASK - 10000 - 1);
    check(sentTo(reloaded, 'peer-b', 'question').length === 0, 'o prazo de A continua de onde estava: 1 ms antes do fim, ainda não deveria ter ido');
    time.advance(1);
    check(sentTo(reloaded, 'peer-b', 'question').length === 1 && reloaded.state.answerTimeout,
        'no fim do prazo que faltava a A (ASK_TIMEOUT - 10 s depois do F5), a pergunta deveria ir sozinha para B, com o prazo de resposta');

    // 2) Rodada salva por uma versão sem a etapa (sem o campo asked): a pergunta já tinha sido feita.
    const old = askingMatch(use, { reload: true });
    const saved = savedState(old);
    delete saved.currentRound.asked;
    storeSavedState(old, { roomState: saved });
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

// ============================================
// PRAZOS EM HORA DO SERVIDOR (roadmap 2.9, etapa 2a)
// ============================================

test('T181 Prazo do Perguntador em hora do servidor (askEndsAt): gravado na rodada ao armar; vencido durante o F5 do host, a pergunta vai na hora; rodada salva sem askEndsAt ganha o prazo inteiro', (use) => {
    // 1) A hora de término do prazo de A, pela hora do servidor (45 s à frente do relógio do host), vai na rodada e no estado salvo.
    const env = askingMatch(use, { reload: true, offset: 45000 });
    const r = env.state.currentRound;
    check(r.askEndsAt === env.time.now() + 45000 + ASK,
        'a rodada deveria guardar askEndsAt = hora do servidor + ASK_TIMEOUT, veio: ' + JSON.stringify({ askEndsAt: r.askEndsAt, server: env.time.now() + 45000 }));
    const saved = savedState(env);
    check(saved.currentRound.askEndsAt === r.askEndsAt, 'o estado salvo deveria guardar askEndsAt, veio: ' + JSON.stringify(saved.currentRound.askEndsAt));

    // 2) O host ficou fora além do prazo de A: na retomada, a pergunta vai na hora (envio automático), com o prazo de resposta contando dali.
    const reloaded = use(reloadHost(env));
    reloaded.CONFIG.GAME.ASK_TIMEOUT = ASK;
    reloaded.setServerOffset(45000);
    const back = env.time.now() + ASK + 2000;
    const time = reloaded.fakeTime(back);
    reloaded.Game.core.resumeMatchAfterReload();
    time.advance(0);
    const asked = reloaded.broadcastsOfType('question-asked');
    check(asked.length === 1 && asked[0].auto === true && reloaded.state.currentRound.asked === true && sentTo(reloaded, 'peer-b', 'question').length === 1,
        'com o prazo de A vencido durante o F5, a pergunta deveria ir na retomada (question-asked com auto), veio: ' + JSON.stringify(asked));
    check(reloaded.state.currentRound.answerEndsAt === back + 45000 + reloaded.CONFIG.GAME.ANSWER_TIMEOUT,
        'o prazo de resposta de B deveria contar da retomada, veio: ' + JSON.stringify(reloaded.state.currentRound.answerEndsAt));

    // 3) Rodada salva sem askEndsAt (versão anterior): o prazo inteiro, contado do F5.
    const old = askingMatch(use, { reload: true });
    old.time.advance(10000);
    const oldSaved = savedState(old);
    delete oldSaved.currentRound.askEndsAt;
    storeSavedState(old, { roomState: oldSaved });
    const reloadedOld = use(reloadHost(old));
    reloadedOld.CONFIG.GAME.ASK_TIMEOUT = ASK;
    const timeOld = reloadedOld.fakeTime(old.time.now());
    reloadedOld.Game.core.resumeMatchAfterReload();
    timeOld.advance(ASK - 1);
    check(sentTo(reloadedOld, 'peer-b', 'question').length === 0, 'sem askEndsAt, o prazo de A deveria ser inteiro: 1 ms antes, a pergunta ainda não deveria ter ido');
    timeOld.advance(1);
    check(sentTo(reloadedOld, 'peer-b', 'question').length === 1, 'sem askEndsAt, a pergunta deveria ir no fim do prazo inteiro, contado do F5');
});

test('T182 Prazos de resposta e de apoio em hora do servidor: answerEndsAt na rodada e na pergunta de quem responde; com o apoio pendente, answerEndsAt vazio e advisory.endsAt no advisory-started e no advisory-question; vencido durante o F5, a vez é pulada na hora; as telas contam pela hora de término', (use) => {
    const C = (env) => env.CONFIG.GAME;

    // 1) No host, com a hora do servidor 20 s atrás do relógio dele.
    const env = askingMatch(use, { offset: -20000 });
    const server = () => env.time.now() - 20000;
    askFromA(env);
    const r = env.state.currentRound;
    check(r.answerEndsAt === server() + C(env).ANSWER_TIMEOUT,
        'a rodada deveria guardar answerEndsAt = hora do servidor + ANSWER_TIMEOUT, veio: ' + JSON.stringify({ answerEndsAt: r.answerEndsAt, server: server() }));
    const toB = sentTo(env, 'peer-b', 'question').pop();
    check(toB && toB.answerEndsAt === r.answerEndsAt, 'a pergunta para B deveria levar answerEndsAt, veio: ' + JSON.stringify(toB && toB.answerEndsAt));

    env.time.advance(10000);
    env.Game.network.handleMessage({ type: 'advisory-request', advisorName: 'Host', requesterName: 'B' }, 'peer-b');
    const pending = env.state.currentRound;
    check(pending.advisory && pending.advisory.endsAt === server() + C(env).ADVISORY_TIMEOUT,
        'o apoio deveria guardar endsAt = hora do servidor + ADVISORY_TIMEOUT, veio: ' + JSON.stringify(pending.advisory));
    check(pending.answerEndsAt == null && pending.answerTimeLeft === C(env).ANSWER_TIMEOUT - 10000,
        'com o apoio pendente, answerEndsAt deveria ficar vazio e answerTimeLeft guardar o que faltava, veio: ' +
        JSON.stringify({ answerEndsAt: pending.answerEndsAt, answerTimeLeft: pending.answerTimeLeft }));
    const started = env.broadcastsOfType('advisory-started').pop();
    check(started && started.endsAt === pending.advisory.endsAt && started.answerTimeLeft === C(env).ANSWER_TIMEOUT - 10000,
        'o advisory-started deveria levar endsAt do apoio e o tempo que resta a B, veio: ' + JSON.stringify(started));
    const toAdvisor = sentTo(env, 'peer-host', 'advisory-question').pop();
    check(toAdvisor && toAdvisor.endsAt === pending.advisory.endsAt,
        'a pergunta para quem foi chamado deveria levar endsAt do apoio, veio: ' + JSON.stringify(toAdvisor && toAdvisor.endsAt));

    env.time.advance(4000);
    env.Game.core.handleAdvisoryAnswer({ alternative: 'A', declined: false });
    const result = env.broadcastsOfType('advisory-result').pop();
    check(result && result.answerEndsAt === server() + C(env).ANSWER_TIMEOUT - 10000 && env.state.currentRound.answerEndsAt === result.answerEndsAt,
        'no fim do apoio, a rodada e o advisory-result deveriam levar a nova hora de término (hora do servidor + o que faltava), veio: ' +
        JSON.stringify({ result: result && result.answerEndsAt, round: env.state.currentRound.answerEndsAt, expected: server() + C(env).ANSWER_TIMEOUT - 10000 }));

    // 2) O host ficou fora além do prazo de resposta: na retomada, a vez de B é pulada na hora.
    const late = askingMatch(use, { reload: true });
    askFromA(late);
    const lateReloaded = use(reloadHost(late));
    lateReloaded.CONFIG.GAME.ASK_TIMEOUT = ASK;
    const lateTime = lateReloaded.fakeTime(late.time.now() + C(late).ANSWER_TIMEOUT + 3000);
    lateReloaded.Game.core.resumeMatchAfterReload();
    lateTime.advance(0);
    const skipped = lateReloaded.broadcastsOfType('kpi-update').find(m => m.playerName === 'B');
    check(skipped && skipped.timedOut === true && lateReloaded.state.answeredThisRound.includes('B'),
        'com o prazo de resposta vencido durante o F5, a vez de B deveria ser pulada na retomada, veio: ' + JSON.stringify(skipped));

    // 3) Telas, com o relógio do aparelho 30 s adiantado (a hora do servidor corrige).
    const screens = askingMatch(use);
    askFromA(screens);
    const skewed = (g) => {
        const t = g.guest.fakeTime(screens.time.now() + 30000);
        g.guest.setServerOffset(-30000);
        return { t, clock: g.guest.fakeClock() };
    };

    // Quem foi chamado: o contador do apoio conta pela hora de término que veio na pergunta.
    const advisor = guestOnScreen(use, screens, 'A');
    const a = skewed(advisor);
    advisor.guest.ctx.showAdvisoryQuestionModal({ type: 'advisory-question', kind: 'advisory', question: 'Pergunta?', domain: 'Domínio',
        alternatives: ['A) Um', 'B) Dois', 'C) Três', 'D) Quatro'], id: 'q1', endsAt: screens.time.now() + 25000 });
    check(advisor.elements.advisoryTimerText.textContent === 'advisory.timeLeft {"seconds":25}',
        'o contador de quem foi chamado deveria mostrar o que falta até endsAt (25s), veio: ' + advisor.elements.advisoryTimerText.textContent);
    a.t.advance(5000);
    a.clock.tick();
    check(advisor.elements.advisoryTimerText.textContent === 'advisory.timeLeft {"seconds":20}',
        'depois de 5 s com um tique só, o contador do apoio deveria mostrar 20s, veio: ' + advisor.elements.advisoryTimerText.textContent);

    // Quem responde volta à pergunta (state-sync) 40 s depois de ela ser feita: o contador mostra o que falta, não o prazo inteiro.
    const round = screens.state.currentRound;
    const b = guestOnScreen(use, screens, 'B');
    const bt = skewed(b);
    bt.t.advance(40000);
    b.guest.receiveSync('B', copy({
        players: screens.state.players, decks: {}, endsAt: screens.state.endsAt, gameStarted: true,
        currentRound: { ...round, question: { ...round.question, correct: undefined } },
        roundEnded: false, matchPaused: false, answeredThisRound: [], gameOver: false, finalRanking: null
    }));
    const left = C(screens).ANSWER_TIMEOUT / 1000 - 40;
    check(b.elements.answerTimerText && b.elements.answerTimerText.textContent === 'question.timeLeft {"seconds":' + left + '}',
        'quem volta à pergunta deveria ver o que falta até answerEndsAt (' + left + 's), veio: ' + (b.elements.answerTimerText || {}).textContent);
});

finish('Ritmo da pergunta');
