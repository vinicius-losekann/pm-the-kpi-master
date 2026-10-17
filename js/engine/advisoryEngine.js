// ============================================
// PM: The KPI Master - Engine: Assessoria e pedido de ajuda
// ============================================
// Orquestra o apoio que o Respondedor pede a outro jogador (um por
// pergunta): solicitação, validação (delegada a
// js/domain/advisoryRules.js), envio da pergunta a quem foi chamado e
// processamento da resposta/recusa/timeout. Com 1 recurso ou mais, é
// assessoria (kind 'advisory'); com 0 ou menos, pedido de ajuda (kind
// 'help'). Os dois seguem o mesmo caminho e ficam em
// currentRound.advisory; o que muda é quem pode pedir, quem pode ser
// chamado e o resultado depois da resposta (engine/answerEngine.js).
// ============================================

/**
 * Pede assessoria ou ajuda a outro jogador (chamado pelo Respondedor).
 * Verifica se a rodada ainda está ativa, se o jogador não está na Área
 * Foco Encerramento e se os recursos dele combinam com o tipo do pedido
 * (assessoria com 1 ou mais; ajuda com 0 ou menos).
 * @param {string} advisorName - jogador chamado
 * @param {string} [kind] - 'advisory' (padrão) ou 'help'
 */
function requestAdvisory(advisorName, kind = 'advisory') {
    const state = Game.state;

    if (!state.currentRound || state.currentRound.advisory) {
        console.warn('⚠️ Já existe um pedido de apoio nesta rodada.');
        return false;
    }
    if (state.currentRound.answered) {
        console.warn('⚠️ Rodada já foi respondida — não é mais possível pedir apoio.');
        return false;
    }
    const me = Game.getPlayerByName(state.playerName);
    if (me && Game.getFocusAreaIndex(me.focusArea) === CONFIG.FOCUS_AREAS.length - 1) {
        alert(Game.i18n.t('advisory.closingFocusArea'));
        return false;
    }
    // A assessoria tem honorário: com 0 recursos ou menos não se pede; a
    // ajuda é só para quem está com 0 ou menos (o host também recusa,
    // com 'needs-resources' ou 'has-resources').
    if (kind === 'help' && me && me.resources >= 1) {
        alert(Game.i18n.t('help.hasResources'));
        return false;
    }
    if (kind !== 'help' && me && me.resources < 1) {
        alert(Game.i18n.t('advisory.needsResources'));
        return false;
    }

    const msg = { type: 'advisory-request', kind, advisorName: advisorName, requesterName: state.playerName };
    if (state.isHost) {
        handleAdvisoryRequest(msg);
    } else {
        Game.network.sendToHost(msg);
    }
    return true;
}

/**
 * Host: processa o pedido de assessoria ou de ajuda, valida e encaminha
 * para quem foi chamado. Pedido sem `kind` é assessoria.
 */
function handleAdvisoryRequest(msg) {
    const state = Game.state;
    if (!state.isHost || !state.currentRound || state.currentRound.advisory) return;
    if (msg.requesterName !== state.currentRound.answerer) return;
    const kind = msg.kind === 'help' ? 'help' : 'advisory';
    if (state.currentRound.answered) {
        const req = Game.getPlayerByName(msg.requesterName);
        if (req) {
            Game.network.sendToPlayer(req.peerId, {
                type: 'advisory-result',
                kind,
                advisorName: msg.advisorName,
                suggestion: null,
                declined: true,
                invalid: true,
                reason: 'already-answered'
            });
        }
        return;
    }

    const requester = Game.getPlayerByName(msg.requesterName);
    const advisor = Game.getPlayerByName(msg.advisorName);

    // Validação pura delegada a domain/advisoryRules.js
    const validation = Game.domain.advisory.validateAdvisoryRequest({
        advisor,
        requester,
        advisorName: msg.advisorName,
        askerName: state.currentRound.asker,
        answererName: state.currentRound.answerer,
        focusAreas: CONFIG.FOCUS_AREAS,
        kind,
        config: CONFIG
    });

    if (validation.invalid) {
        const reasonNote = {
            'closing-focus-area': '(Respondedor na Área Foco Encerramento)',
            'needs-resources': '(Respondedor sem recursos para o honorário)',
            'has-resources': '(Respondedor com recursos não pede ajuda)',
            'helper-without-resources': '(quem ajuda está sem recursos para cobrir um erro)'
        }[validation.reason] || '';
        console.warn('⚠️ Pedido de ' + (kind === 'help' ? 'ajuda' : 'assessoria') + ' rejeitado pelo host:', msg.advisorName, reasonNote);
        if (requester) {
            Game.network.sendToPlayer(requester.peerId, {
                type: 'advisory-result',
                kind,
                advisorName: msg.advisorName,
                suggestion: null,
                declined: true,
                invalid: true,
                reason: validation.reason
            });
        }
        return;
    }

    // Hora de término do prazo de quem foi chamado (hora do servidor): o
    // contador dele conta por ela.
    const endsAt = Game.network.serverNow() + CONFIG.GAME.ADVISORY_TIMEOUT;
    state.currentRound.advisory = {
        advisorName: msg.advisorName,
        status: 'pending',
        suggestion: null,
        kind,
        endsAt
    };

    // Pausa o prazo de resposta enquanto aguarda o apoio (sem hora de
    // término); no fim, ele continua do que faltava (handleAdvisoryAnswer()).
    state.currentRound.answerTimeLeft = Game.engine.turn.pauseAnswerTimeout();

    const startedMsg = {
        type: 'advisory-started',
        kind,
        advisorName: msg.advisorName,
        requesterName: msg.requesterName,
        endsAt,
        answerTimeLeft: state.currentRound.answerTimeLeft
    };
    Game.network.broadcastAll(startedMsg);
    // broadcastAll não manda para o próprio host: se é ele quem responde,
    // a tela dele (o contador) é avisada aqui.
    if (msg.requesterName === state.playerName) Game.ui.showAdvisoryStarted(startedMsg);

    sendAdvisoryQuestion();
    armAdvisoryTimeout(CONFIG.GAME.ADVISORY_TIMEOUT);

    Game.saveState();
}

/**
 * Host: manda a pergunta da rodada, sem o gabarito, a quem foi chamado
 * para o apoio pendente, com a hora de término do prazo dele. Usada no
 * pedido e de novo quando quem foi chamado volta (addPlayer(), em
 * network/messageHandler.js) ou quando o host chamado dá F5
 * (resumeMatchAfterReload(), em engine/sessionEngine.js).
 */
function sendAdvisoryQuestion() {
    const state = Game.state;
    const round = state.currentRound;
    const advisor = round && round.advisory && Game.getPlayerByName(round.advisory.advisorName);
    if (!advisor || !round.question) return;
    const question = round.question;
    const domainName = state.questionsData.domains[question.domain_key]?.name || question.domain_key;

    Game.network.sendToPlayer(advisor.peerId, {
        type: 'advisory-question',
        kind: round.advisory.kind,
        question: question.question,
        domain: domainName,
        alternatives: question.alternatives,
        id: question.id,
        endsAt: round.advisory.endsAt
    });
}

/**
 * Host: arma o prazo de quem foi chamado; no fim, o apoio é recusado por
 * tempo. `ms` vencido ou negativo (ex.: venceu durante o F5 do host): a
 * recusa vem logo em seguida.
 */
function armAdvisoryTimeout(ms) {
    const state = Game.state;
    if (state.advisoryTimeout) clearTimeout(state.advisoryTimeout);
    state.advisoryTimeout = setTimeout(() => {
        handleAdvisoryAnswer({ alternative: null, declined: true, timeout: true });
    }, Math.max(0, ms));
}

/**
 * Host: processa a resposta (ou recusa/timeout) de quem foi chamado.
 */
function handleAdvisoryAnswer(msg) {
    const state = Game.state;
    if (!state.isHost || !state.currentRound || !state.currentRound.advisory) return;
    if (state.currentRound.advisory.status !== 'pending') return;

    if (state.advisoryTimeout) {
        clearTimeout(state.advisoryTimeout);
        state.advisoryTimeout = null;
    }

    const round = state.currentRound;
    round.advisory.status = msg.declined ? 'declined' : 'accepted';
    round.advisory.suggestion = msg.declined ? null : msg.alternative;

    // O prazo de resposta volta do que faltava quando o apoio começou
    // (se ele não estava correndo naquela hora, volta o prazo inteiro). É
    // armado antes do aviso: o advisory-result leva a nova hora de término.
    const resumes = !round.answered && !round.pendingAnswer;
    const answerTimeLeft = round.answerTimeLeft ?? CONFIG.GAME.ANSWER_TIMEOUT;
    round.answerTimeLeft = null;
    if (resumes) {
        Game.engine.turn.armAnswerTimeout(round.answerer, answerTimeLeft);
    }

    const resultMsg = {
        type: 'advisory-result',
        kind: round.advisory.kind,
        advisorName: round.advisory.advisorName,
        suggestion: round.advisory.suggestion,
        declined: !!msg.declined,
        timeout: !!msg.timeout,
        answerEndsAt: resumes ? round.answerEndsAt : undefined
    };

    Game.network.broadcastAll(resultMsg);
    Game.ui.showAdvisoryResult(resultMsg);

    // Se o Respondedor já tinha enviado uma resposta, processa agora
    if (state.currentRound.pendingAnswer) {
        const pending = state.currentRound.pendingAnswer;
        state.currentRound.pendingAnswer = null;
        Game.engine.answer.handleAnswer(pending);
    }

    Game.saveState();
}

// ============================================
// EXPORTAÇÃO
// ============================================
window.Game = window.Game || {};
window.Game.engine = window.Game.engine || {};
window.Game.engine.advisory = {
    requestAdvisory,
    handleAdvisoryRequest,
    sendAdvisoryQuestion,
    armAdvisoryTimeout,
    handleAdvisoryAnswer
};

// Game.core.* é o namespace usado por ui/ e network/ para chamar as
// funções deste engine — convenção de chamada entre camadas, não é
// compatibilidade temporária nem trabalho pendente (ver _docs/architecture.md).
window.Game.core = window.Game.core || {};
Object.assign(window.Game.core, window.Game.engine.advisory);
