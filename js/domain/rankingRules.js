// ============================================
// PM: The KPI Master - Domain: Ranking
// ============================================
// Regra PURA de construção do ranking final.
// Não acessa Game.state, network ou DOM diretamente.
// ============================================

/**
 * Constrói o ranking de todos os jogadores.
 * O KPI final = KPI acumulado + (recursos restantes × FINAL_RESOURCE_VALUE).
 * @param {Array} players - Game.state.players
 * @param {object} config - CONFIG (usa config.KPI.FINAL_RESOURCE_VALUE)
 */
function buildRanking(players, config) {
    return [...players]
        .map(p => ({
            name: p.name,
            kpi: p.kpi,
            resources: p.resources,
            finalKpi: p.kpi + (p.resources * config.KPI.FINAL_RESOURCE_VALUE),
            focusArea: p.focusArea,
            activities: p.activities,
            isHost: p.isHost,
            waitingInLobby: !!p.waitingInLobby
        }))
        .sort((a, b) => b.finalKpi - a.finalKpi)
        .map((p, i) => ({
            position: i + 1,
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