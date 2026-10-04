// ============================================
// PM: The KPI Master - Domain: Troca de recurso (pedido de ajuda)
// ============================================
// Regra PURA de validação da troca de 1 recurso por KPI entre dois
// jogadores (usada pelo pedido de ajuda, engine/tradeEngine.js).
// Não acessa Game.state, network ou DOM diretamente.
// ============================================

/**
 * Valida se uma venda de recurso entre vendedor e comprador pode ocorrer.
 * @param {object} vendedor - jogador vendedor (ou undefined/null)
 * @param {object} comprador - jogador comprador (ou undefined/null)
 * @param {object} config - CONFIG (usa config.KPI.VALOR_VENDA_RECURSO)
 * @returns {string|null} mensagem de erro, ou null se a venda for válida
 */
function validarVenda(vendedor, comprador, config) {
    if (!vendedor || !comprador) return 'Vendedor ou comprador não encontrado.';
    if (vendedor.name === comprador.name) return 'Você não pode vender para si mesmo.';
    if (vendedor.waitingInLobby || comprador.waitingInLobby) return 'Jogador não está mais ativo na partida.';
    if (vendedor.recursos < 1) return 'Vendedor não tem recursos para vender.';
    if (comprador.kpi < config.KPI.VALOR_VENDA_RECURSO) return 'Comprador não tem KPI suficiente.';
    return null;
}

// ============================================
// EXPORTAÇÃO
// ============================================
window.Game = window.Game || {};
window.Game.domain = window.Game.domain || {};
window.Game.domain.trade = {
    validarVenda
};