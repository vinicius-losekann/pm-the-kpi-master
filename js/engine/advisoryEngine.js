// ============================================
// PM: The KPI Master - Engine: Assessoria
// ============================================
// Orquestra o fluxo de pedido de assessoria: solicitação, validação
// (delegada a js/domain/advisoryRules.js), envio da pergunta ao
// assessor e processamento da resposta/recusa/timeout.
// ============================================

/**
 * Solicita assessoria a outro jogador (chamado pelo Respondedor).
 * Verifica se a rodada ainda está ativa, se o jogador não está na Área
 * Foco Encerramento e se tem 1 recurso ou mais.
 */
function requestAdvisory(advisorName) {
    const state = Game.state;

    if (!state.currentRound || state.currentRound.advisory) {
        console.warn('⚠️ Já existe um pedido de assessoria nesta rodada.');
        return false;
    }
    if (state.currentRound.answered) {
        console.warn('⚠️ Rodada já foi respondida — não é mais possível pedir assessoria.');
        return false;
    }
    const me = Game.getPlayerByName(state.playerName);
    if (me && Game.getFocusAreaIndex(me.focusArea) === CONFIG.FOCUS_AREAS.length - 1) {
        alert(Game.i18n.t('advisory.closingFocusArea'));
        return false;
    }
    // A assessoria tem honorário: com 0 recursos ou menos não se pede
    // (o host também recusa, com 'needs-resources').
    if (me && me.resources < 1) {
        alert(Game.i18n.t('advisory.needsResources'));
        return false;
    }

    if (state.isHost) {
        handleAdvisoryRequest({ advisorName: advisorName, requesterName: state.playerName });
    } else {
        Game.network.sendToHost({ type: 'advisory-request', advisorName: advisorName, requesterName: state.playerName });
    }
    return true;
}

/**
 * Host: processa o pedido de assessoria, valida e encaminha para o assessor.
 */
function handleAdvisoryRequest(msg) {
    const state = Game.state;
    if (!state.isHost || !state.currentRound || state.currentRound.advisory) return;
    if (msg.requesterName !== state.currentRound.answerer) return;
    if (state.currentRound.answered) {
        const req = Game.getPlayerByName(msg.requesterName);
        if (req) {
            Game.network.sendToPlayer(req.peerId, {
                type: 'advisory-result',
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
        focusAreas: CONFIG.FOCUS_AREAS
    });

    if (validation.invalid) {
        const reasonNote = {
            'closing-focus-area': '(Respondedor na Área Foco Encerramento)',
            'needs-resources': '(Respondedor sem recursos para o honorário)'
        }[validation.reason] || '';
        console.warn('⚠️ Pedido de assessoria rejeitado pelo host:', msg.advisorName, reasonNote);
        if (requester) {
            Game.network.sendToPlayer(requester.peerId, {
                type: 'advisory-result',
                advisorName: msg.advisorName,
                suggestion: null,
                declined: true,
                invalid: true,
                reason: validation.reason
            });
        }
        return;
    }

    state.currentRound.advisory = {
        advisorName: msg.advisorName,
        status: 'pending',
        suggestion: null
    };

    // Pausa o timeout de resposta enquanto aguarda a assessoria
    if (state.answerTimeout) {
        clearTimeout(state.answerTimeout);
        state.answerTimeout = null;
    }

    Game.network.broadcastAll({
        type: 'advisory-started',
        advisorName: msg.advisorName,
        requesterName: msg.requesterName
    });

    const question = state.currentRound.question;
    const domainName = state.questionsData.domains[question.domain_key]?.name || question.domain_key;

    Game.network.sendToPlayer(advisor.peerId, {
        type: 'advisory-question',
        question: question.question,
        domain: domainName,
        alternatives: question.alternatives,
        id: question.id
    });

    if (state.advisoryTimeout) clearTimeout(state.advisoryTimeout);
    state.advisoryTimeout = setTimeout(() => {
        handleAdvisoryAnswer({ alternative: null, declined: true, timeout: true });
    }, CONFIG.GAME.ADVISORY_TIMEOUT);

    Game.saveState();
}

/**
 * Host: processa a resposta (ou recusa/timeout) do assessor.
 */
function handleAdvisoryAnswer(msg) {
    const state = Game.state;
    if (!state.isHost || !state.currentRound || !state.currentRound.advisory) return;
    if (state.currentRound.advisory.status !== 'pending') return;

    if (state.advisoryTimeout) {
        clearTimeout(state.advisoryTimeout);
        state.advisoryTimeout = null;
    }

    state.currentRound.advisory.status = msg.declined ? 'declined' : 'accepted';
    state.currentRound.advisory.suggestion = msg.declined ? null : msg.alternative;

    const resultMsg = {
        type: 'advisory-result',
        advisorName: state.currentRound.advisory.advisorName,
        suggestion: state.currentRound.advisory.suggestion,
        declined: !!msg.declined,
        timeout: !!msg.timeout
    };

    Game.network.broadcastAll(resultMsg);
    Game.ui.showAdvisoryResult(resultMsg);

    // Rearma o timeout de resposta se a rodada ainda não foi respondida
    if (!state.currentRound.answered && !state.currentRound.pendingAnswer) {
        Game.engine.turn.armAnswerTimeout(state.currentRound.answerer);
    }

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
    handleAdvisoryAnswer
};

// Game.core.* é o namespace usado por ui/ e network/ para chamar as
// funções deste engine — convenção de chamada entre camadas, não é
// compatibilidade temporária nem trabalho pendente (ver _docs/architecture.md).
window.Game.core = window.Game.core || {};
Object.assign(window.Game.core, window.Game.engine.advisory);
