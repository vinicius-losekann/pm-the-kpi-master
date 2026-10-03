// ============================================
// PM: The KPI Master - Domain: Assessoria
// ============================================
// Regras PURAS de validação de pedido de assessoria e cálculo
// do bônus de KPI do assessor. Não acessa Game.state, network
// ou DOM diretamente.
// Fase 1.6 do roadmap.
// ============================================

/**
 * Valida se um pedido de assessoria pode ser aceito.
 *
 * @param {object} params
 * @param {object} params.assessor - jogador escolhido como assessor (ou undefined/null)
 * @param {object} params.requester - jogador que pediu a assessoria (o Respondedor)
 * @param {string} params.assessorName - nome do assessor solicitado
 * @param {string} params.perguntadorName - nome do Perguntador da rodada atual
 * @param {string} params.respondedorName - nome do Respondedor da rodada atual
 * @param {Array} params.fases - CONFIG.FASES
 * @returns {{invalido: boolean, motivo: (string|undefined)}}
 */
function validarPedidoAssessoria({ assessor, requester, assessorName, perguntadorName, respondedorName, fases }) {
    const requesterEmEncerramento = !!requester &&
        fases.findIndex(f => f.id === requester.phase) === fases.length - 1;

    // Assessor que caiu (Fase D: continua na lista, desconectado) também
    // é inválido — sem isso, a pergunta ia para quem não podia responder
    // e o Respondedor ficava com os botões travados até o prazo acabar.
    const invalido =
        !assessor ||
        assessor.waitingInLobby ||
        assessor.disconnected ||
        requesterEmEncerramento ||
        assessorName === perguntadorName ||
        assessorName === respondedorName;

    return {
        invalido,
        motivo: requesterEmEncerramento ? 'fase-encerramento' : undefined
    };
}

/**
 * Calcula o bônus de KPI do assessor, caso a sugestão dele tenha sido
 * seguida pelo Respondedor e a resposta esteja correta.
 *
 * @param {object} assessoria - state.currentRound.assessoria
 * @param {string} alternativaEscolhida - alternativa marcada pelo Respondedor
 * @param {boolean} acertou - se o Respondedor acertou a pergunta
 * @param {object} config - CONFIG (usa config.KPI.ASSESSORIA_ACERTO)
 * @returns {number} bônus de KPI (0 se não elegível)
 */
function calcularBonusAssessor(assessoria, alternativaEscolhida, acertou, config) {
    const elegivel = !!assessoria &&
        assessoria.status === 'accepted' &&
        assessoria.sugestao === alternativaEscolhida &&
        acertou;

    return elegivel ? config.KPI.ASSESSORIA_ACERTO : 0;
}

// ============================================
// EXPORTAÇÃO
// ============================================
window.Game = window.Game || {};
window.Game.domain = window.Game.domain || {};
window.Game.domain.advisory = {
    validarPedidoAssessoria,
    calcularBonusAssessor
};