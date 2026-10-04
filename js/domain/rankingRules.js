// ============================================
// PM: The KPI Master - Domain: Ranking
// ============================================
// Regra PURA de construção do ranking final.
// Não acessa Game.state, network ou DOM diretamente.
// ============================================

/**
 * Constrói o ranking de todos os jogadores.
 * O KPI final = KPI acumulado + (recursos restantes × VALOR_RECURSO_FINAL).
 * @param {Array} players - Game.state.players
 * @param {object} config - CONFIG (usa config.KPI.VALOR_RECURSO_FINAL)
 */
function buildRanking(players, config) {
    return [...players]
        .map(p => ({
            name: p.name,
            kpi: p.kpi,
            recursos: p.recursos,
            kpiFinal: p.kpi + (p.recursos * config.KPI.VALOR_RECURSO_FINAL),
            phase: p.phase,
            activities: p.activities,
            isHost: p.isHost,
            waitingInLobby: !!p.waitingInLobby
        }))
        .sort((a, b) => b.kpiFinal - a.kpiFinal)
        .map((p, i) => ({
            posicao: i + 1,
            ...p
        }));
}

// ============================================
// EXPORTAÇÃO
// ============================================
window.Game = window.Game || {};
window.Game.domain = window.Game.domain || {};
window.Game.domain.ranking = {
    buildRanking
};