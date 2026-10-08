// ============================================
// PM: The KPI Master - Domain: Assessoria
// ============================================
// Regras PURAS de validação de pedido de assessoria e cálculo
// do honorário que quem pediu paga ao assessor. Não acessa
// Game.state, network ou DOM diretamente.
// ============================================

/**
 * Valida se um pedido de assessoria pode ser aceito.
 *
 * @param {object} params
 * @param {object} params.advisor - jogador escolhido como assessor (ou undefined/null)
 * @param {object} params.requester - jogador que pediu a assessoria (o Respondedor)
 * @param {string} params.advisorName - nome do assessor solicitado
 * @param {string} params.askerName - nome do Perguntador da rodada atual
 * @param {string} params.answererName - nome do Respondedor da rodada atual
 * @param {Array} params.focusAreas - CONFIG.FOCUS_AREAS
 * @returns {{invalid: boolean, reason: (string|undefined)}}
 *   reason: 'closing-focus-area' (Respondedor na última área foco),
 *   'needs-resources' (Respondedor com 0 recursos ou menos) ou nenhum
 */
function validateAdvisoryRequest({ advisor, requester, advisorName, askerName, answererName, focusAreas }) {
    const requesterInClosing = !!requester &&
        focusAreas.findIndex(f => f.id === requester.focusArea) === focusAreas.length - 1;
    // Assessoria tem honorário: só pede quem tem com o que pagar.
    const requesterWithoutResources = !!requester && requester.resources < 1;

    // Assessor que caiu (continua na lista, desconectado) também
    // é inválido — sem isso, a pergunta ia para quem não podia responder
    // e o Respondedor ficava com os botões travados até o prazo acabar.
    const invalid =
        !advisor ||
        advisor.waitingInLobby ||
        advisor.disconnected ||
        requesterInClosing ||
        requesterWithoutResources ||
        advisorName === askerName ||
        advisorName === answererName;

    let reason;
    if (requesterInClosing) reason = 'closing-focus-area';
    else if (requesterWithoutResources) reason = 'needs-resources';

    return { invalid, reason };
}

/**
 * Calcula o honorário que quem pediu a assessoria paga ao assessor: só
 * quando a sugestão foi seguida e a resposta está correta. A Reserva de
 * Contingência não entra aqui — ela protege o erro, não o honorário.
 *
 * @param {object} advisory - state.currentRound.advisory
 * @param {string} chosenAlternative - alternativa marcada pelo Respondedor
 * @param {boolean} isCorrect - se o Respondedor acertou a pergunta
 * @param {object} config - CONFIG (usa config.RESOURCES.ADVISORY_FEE)
 * @returns {number} recursos de honorário (0 se ninguém paga)
 */
function calculateAdvisoryFee(advisory, chosenAlternative, isCorrect, config) {
    const eligible = !!advisory &&
        advisory.status === 'accepted' &&
        advisory.suggestion === chosenAlternative &&
        isCorrect;

    return eligible ? config.RESOURCES.ADVISORY_FEE : 0;
}

// ============================================
// EXPORTAÇÃO
// ============================================
window.Game = window.Game || {};
window.Game.domain = window.Game.domain || {};
window.Game.domain.advisory = {
    validateAdvisoryRequest,
    calculateAdvisoryFee
};
