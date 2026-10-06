// ============================================
// PM: The KPI Master - Domain: Troca de recurso (pedido de ajuda)
// ============================================
// Regra PURA de validação da troca de 1 recurso por KPI entre dois
// jogadores (usada pelo pedido de ajuda, engine/tradeEngine.js).
// Não acessa Game.state, network ou DOM diretamente.
// ============================================

/**
 * Valida se a troca de recurso entre quem doa e quem pediu pode ocorrer.
 * @param {object} donor - jogador que doa o recurso (ou undefined/null)
 * @param {object} requester - jogador que pediu ajuda (ou undefined/null)
 * @param {object} config - CONFIG (usa config.KPI.RESOURCE_PRICE)
 * @returns {string|null} mensagem de erro, ou null se a troca for válida
 */
function validateResourceTransfer(donor, requester, config) {
    if (!donor || !requester) return 'Doador ou quem pediu não encontrado.';
    if (donor.name === requester.name) return 'Você não pode doar para si mesmo.';
    if (donor.waitingInLobby || requester.waitingInLobby) return 'Jogador não está mais ativo na partida.';
    if (donor.resources < 1) return 'Doador não tem recursos para doar.';
    if (requester.kpi < config.KPI.RESOURCE_PRICE) return 'Quem pediu não tem KPI suficiente.';
    return null;
}

// ============================================
// EXPORTAÇÃO
// ============================================
window.Game = window.Game || {};
window.Game.domain = window.Game.domain || {};
window.Game.domain.trade = {
    validateResourceTransfer
};
