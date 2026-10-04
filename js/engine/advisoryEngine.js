// ============================================
// PM: The KPI Master - Engine: Assessoria
// ============================================
// Orquestra o fluxo de pedido de assessoria: solicitação, validação
// (delegada a js/domain/advisoryRules.js), envio da pergunta ao
// assessor e processamento da resposta/recusa/timeout.
// ============================================

/**
 * Solicita assessoria a outro jogador (chamado pelo Respondedor).
 * Verifica se a rodada ainda está ativa e se o jogador não está na fase de Encerramento.
 */
function requestAssessoria(assessorName) {
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
        handleAssessoriaRequest({ assessorName, requesterName: state.playerName });
    } else {
        Game.network.sendToHost({ type: 'assessoria-request', assessorName, requesterName: state.playerName });
    }
    return true;
}

/**
 * Host: processa o pedido de assessoria, valida e encaminha para o assessor.
 */
function handleAssessoriaRequest(msg) {
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
    const assessor = Game.getPlayerByName(msg.assessorName);

    // Validação pura delegada a domain/advisoryRules.js
    const validacao = Game.domain.advisory.validateAdvisoryRequest({
        advisor: assessor,
        requester,
        advisorName: msg.assessorName,
        askerName: state.currentRound.perguntador,
        answererName: state.currentRound.respondedor,
        focusAreas: CONFIG.FASES
    });

    if (validacao.invalid) {
        console.warn('⚠️ Pedido de assessoria rejeitado pelo host:', msg.assessorName,
            validacao.reason === 'fase-encerramento' ? '(Respondedor na Área Foco Encerramento)' : '');
        if (requester) {
            Game.network.sendToPlayer(requester.peerId, {
                type: 'assessoria-result',
                assessorName: msg.assessorName,
                sugestao: null,
                recusado: true,
                invalido: true,
                motivo: validacao.reason
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

    const pergunta = state.currentRound.pergunta;
    const domainNome = state.questionsData.domains[pergunta.domain_key]?.name || pergunta.domain_key;

    Game.network.sendToPlayer(assessor.peerId, {
        type: 'assessoria-question',
        question: pergunta.question,
        domain: domainNome,
        alternatives: pergunta.alternatives,
        id: pergunta.id
    });

    if (state.assessoriaTimeout) clearTimeout(state.assessoriaTimeout);
    state.assessoriaTimeout = setTimeout(() => {
        handleAssessoriaAnswer({ alternativa: null, recusado: true, timeout: true });
    }, CONFIG.JOGO.ASSESSORIA_TIMEOUT);

    Game.saveState();
}

/**
 * Host: processa a resposta (ou recusa/timeout) do assessor.
 */
function handleAssessoriaAnswer(msg) {
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
        Game.engine.turn.armarRespostaTimeout(state.currentRound.respondedor);
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
    requestAssessoria,
    handleAssessoriaRequest,
    handleAssessoriaAnswer
};

// Game.core.* é o namespace usado por ui/ e network/ para chamar as
// funções deste engine — convenção de chamada entre camadas, não é
// compatibilidade temporária nem trabalho pendente (ver _docs/architecture.md).
window.Game.core = window.Game.core || {};
Object.assign(window.Game.core, window.Game.engine.advisory);