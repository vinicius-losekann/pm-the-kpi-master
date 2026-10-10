// ============================================
// PM: The KPI Master - Domain: Assessoria e pedido de ajuda
// ============================================
// Regras PURAS do apoio que o Respondedor pede a outro jogador (um por
// pergunta): a validação do pedido e o resultado do apoio depois da
// resposta. Com 1 recurso ou mais, o apoio é assessoria (kind
// 'advisory': honorário ao assessor); com 0 ou menos, é pedido de ajuda
// (kind 'help': fiança — recompensa do patrocinador ou cobertura do
// erro). Não acessa Game.state, network ou DOM diretamente.
// ============================================

/**
 * Valida se um pedido de assessoria ou de ajuda pode ser aceito.
 *
 * @param {object} params
 * @param {object} params.advisor - jogador chamado (assessor ou quem ajuda), ou undefined/null
 * @param {object} params.requester - jogador que pediu (o Respondedor)
 * @param {string} params.advisorName - nome do jogador chamado
 * @param {string} params.askerName - nome do Perguntador da rodada atual
 * @param {string} params.answererName - nome do Respondedor da rodada atual
 * @param {Array} params.focusAreas - CONFIG.FOCUS_AREAS
 * @param {string} [params.kind] - 'advisory' (padrão) ou 'help'
 * @param {object} [params.config] - CONFIG (usa config.RESOURCES.HELP_COVER na ajuda)
 * @returns {{invalid: boolean, reason: (string|undefined)}}
 *   reason: 'closing-focus-area' (Respondedor na última área foco),
 *   'needs-resources' (assessoria com 0 recursos ou menos),
 *   'has-resources' (ajuda com 1 recurso ou mais),
 *   'helper-without-resources' (quem ajuda sem recursos para cobrir um
 *   erro) ou nenhum
 */
function validateAdvisoryRequest({ advisor, requester, advisorName, askerName, answererName, focusAreas, kind = 'advisory', config }) {
    const isHelp = kind === 'help';
    const requesterInClosing = !!requester &&
        focusAreas.findIndex(f => f.id === requester.focusArea) === focusAreas.length - 1;
    // Assessoria tem honorário: só pede quem tem com o que pagar. A
    // ajuda é o contrário: só para quem está com 0 recursos ou menos.
    const requesterWithoutResources = !isHelp && !!requester && requester.resources < 1;
    const requesterWithResources = isHelp && !!requester && requester.resources >= 1;
    // Quem ajuda precisa poder cobrir um erro sem ficar negativo.
    const helperWithoutResources = isHelp && !!advisor && advisor.resources < config.RESOURCES.HELP_COVER;

    // Chamado que caiu (continua na lista, desconectado) também
    // é inválido — sem isso, a pergunta ia para quem não podia responder
    // e o Respondedor ficava com os botões travados até o prazo acabar.
    const invalid =
        !advisor ||
        advisor.waitingInLobby ||
        advisor.disconnected ||
        requesterInClosing ||
        requesterWithoutResources ||
        requesterWithResources ||
        helperWithoutResources ||
        advisorName === askerName ||
        advisorName === answererName;

    let reason;
    if (requesterInClosing) reason = 'closing-focus-area';
    else if (requesterWithoutResources) reason = 'needs-resources';
    else if (requesterWithResources) reason = 'has-resources';
    else if (helperWithoutResources) reason = 'helper-without-resources';

    return { invalid, reason };
}

/**
 * Resultado do apoio depois da resposta, só quando a sugestão aceita foi
 * seguida:
 *   - assessoria e acertou → 'fee': quem respondeu paga o honorário
 *     (RESOURCES.ADVISORY_FEE) ao assessor;
 *   - ajuda e acertou → 'reward': quem ajudou ganha RESOURCES.HELP_REWARD
 *     do patrocinador (ninguém paga);
 *   - ajuda e errou, sem a Reserva de Contingência → 'cover': quem ajudou
 *     perde RESOURCES.HELP_COVER e quem respondeu não perde o recurso do
 *     erro (com a Reserva, o erro já não custa nada).
 * A Reserva não mexe no honorário nem na recompensa.
 *
 * @param {object} advisory - state.currentRound.advisory (com `kind`; sem ele, assessoria)
 * @param {string} chosenAlternative - alternativa marcada pelo Respondedor
 * @param {boolean} isCorrect - se o Respondedor acertou a pergunta
 * @param {boolean} hasReserve - se a rodada tem a Reserva de Contingência
 * @param {object} config - CONFIG (usa config.RESOURCES)
 * @returns {{outcome: string, amount: number}|null} null se nada muda
 */
function calculateSupportOutcome(advisory, chosenAlternative, isCorrect, hasReserve, config) {
    const followed = !!advisory &&
        advisory.status === 'accepted' &&
        advisory.suggestion === chosenAlternative;
    if (!followed) return null;

    if (advisory.kind !== 'help') {
        return isCorrect ? { outcome: 'fee', amount: config.RESOURCES.ADVISORY_FEE } : null;
    }
    if (isCorrect) return { outcome: 'reward', amount: config.RESOURCES.HELP_REWARD };
    return hasReserve ? null : { outcome: 'cover', amount: config.RESOURCES.HELP_COVER };
}

// ============================================
// EXPORTAÇÃO
// ============================================
window.Game = window.Game || {};
window.Game.domain = window.Game.domain || {};
window.Game.domain.advisory = {
    validateAdvisoryRequest,
    calculateSupportOutcome
};
