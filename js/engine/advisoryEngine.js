// ============================================
// PM: The KPI Master - Engine: Assessoria
// ============================================
// Orquestra o fluxo de pedido de assessoria: solicitação, validação
// (delegada a js/domain/advisoryRules.js), envio da pergunta ao
// assessor e processamento da resposta/recusa/timeout.
// ============================================

/**
 * Solicita assessoria a outro jogador (chamado pelo Respondedor).
 * Verifica se a rodada ainda está ativa e se o jogador não está na Área Foco Encerramento.
 */
function requestAdvisory(advisorName) {
    const state = Game.state;

    if (!state.currentRound || state.currentRound.assessoria) {
        console.warn('⚠️ Já existe um pedido de assessoria nesta rodada.');
        return false;
    }
    if (state.currentRound.respondeu) {
        console.warn('⚠️ Rodada já foi respondida — não é mais possível pedir assessoria.');
        return false;
    }
    const me = Game.getPlayerByName(state.playerName);
    if (me && Game.getFocusAreaIndex(me.phase) === CONFIG.FASES.length - 1) {
        alert(Game.i18n.t('advisory.faseEncerramento'));
        return false;
    }

    if (state.isHost) {
        handleAdvisoryRequest({ assessorName: advisorName, requesterName: state.playerName });
    } else {
        Game.network.sendToHost({ type: 'assessoria-request', assessorName: advisorName, requesterName: state.playerName });
    }
    return true;
}

/**
 * Host: processa o pedido de assessoria, valida e encaminha para o assessor.
 */
function handleAdvisoryRequest(msg) {
    const state = Game.state;
    if (!state.isHost || !state.currentRound || state.currentRound.assessoria) return;
    if (msg.requesterName !== state.currentRound.respondedor) return;
    if (state.currentRound.respondeu) {
        const req = Game.getPlayerByName(msg.requesterName);
        if (req) {
            Game.network.sendToPlayer(req.peerId, {
                type: 'assessoria-result',
                assessorName: msg.assessorName,
                sugestao: null,
                recusado: true,
                invalido: true,
                motivo: 'ja-respondido'
            });
        }
        return;
    }

    const requester = Game.getPlayerByName(msg.requesterName);
    const advisor = Game.getPlayerByName(msg.assessorName);

    // Validação pura delegada a domain/advisoryRules.js
    const validation = Game.domain.advisory.validateAdvisoryRequest({
        advisor,
        requester,
        advisorName: msg.assessorName,
        askerName: state.currentRound.perguntador,
        answererName: state.currentRound.respondedor,
        focusAreas: CONFIG.FASES
    });

    if (validation.invalid) {
        console.warn('⚠️ Pedido de assessoria rejeitado pelo host:', msg.assessorName,
            validation.reason === 'fase-encerramento' ? '(Respondedor na Área Foco Encerramento)' : '');
        if (requester) {
            Game.network.sendToPlayer(requester.peerId, {
                type: 'assessoria-result',
                assessorName: msg.assessorName,
                sugestao: null,
                recusado: true,
                invalido: true,
                motivo: validation.reason
            });
        }
        return;
    }

    state.currentRound.assessoria = {
        assessorName: msg.assessorName,
        status: 'pending',
        sugestao: null
    };

    // Pausa o timeout de resposta enquanto aguarda a assessoria
    if (state.respostaTimeout) {
        clearTimeout(state.respostaTimeout);
        state.respostaTimeout = null;
    }

    Game.network.broadcastAll({
        type: 'assessoria-started',
        assessorName: msg.assessorName,
        requesterName: msg.requesterName
    });

    const question = state.currentRound.pergunta;
    const domainName = state.questionsData.domains[question.domain_key]?.name || question.domain_key;

    Game.network.sendToPlayer(advisor.peerId, {
        type: 'assessoria-question',
        question: question.question,
        domain: domainName,
        alternatives: question.alternatives,
        id: question.id
    });

    if (state.assessoriaTimeout) clearTimeout(state.assessoriaTimeout);
    state.assessoriaTimeout = setTimeout(() => {
        handleAdvisoryAnswer({ alternativa: null, recusado: true, timeout: true });
    }, CONFIG.JOGO.ASSESSORIA_TIMEOUT);

    Game.saveState();
}

/**
 * Host: processa a resposta (ou recusa/timeout) do assessor.
 */
function handleAdvisoryAnswer(msg) {
    const state = Game.state;
    if (!state.isHost || !state.currentRound || !state.currentRound.assessoria) return;
    if (state.currentRound.assessoria.status !== 'pending') return;

    if (state.assessoriaTimeout) {
        clearTimeout(state.assessoriaTimeout);
        state.assessoriaTimeout = null;
    }

    state.currentRound.assessoria.status = msg.recusado ? 'declined' : 'accepted';
    state.currentRound.assessoria.sugestao = msg.recusado ? null : msg.alternativa;

    const resultMsg = {
        type: 'assessoria-result',
        assessorName: state.currentRound.assessoria.assessorName,
        sugestao: state.currentRound.assessoria.sugestao,
        recusado: !!msg.recusado,
        timeout: !!msg.timeout
    };

    Game.network.broadcastAll(resultMsg);
    Game.ui.showAssessoriaResult(resultMsg);

    // Rearma o timeout de resposta se a rodada ainda não foi respondida
    if (!state.currentRound.respondeu && !state.currentRound.pendingAnswer) {
        Game.engine.turn.armAnswerTimeout(state.currentRound.respondedor);
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
