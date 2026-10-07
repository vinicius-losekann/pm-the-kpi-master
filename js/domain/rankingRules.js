// ============================================
// PM: The KPI Master - Domain: Ranking
// ============================================
// Regra PURA de construção do ranking final.
// Não acessa Game.state, network ou DOM diretamente.
// ============================================

/**
 * Constrói o ranking de todos os jogadores.
 * O KPI final = KPI acumulado + (recursos × FINAL_RESOURCE_VALUE); recurso
 * negativo (estouro de orçamento) desconta.
 *
 * Desempate (mesmo KPI Final), nesta ordem: quem avançou mais na trilha
 * (área foco mais adiantada, pela ordem de config.FOCUS_AREAS, e depois
 * mais atividades concluídas na área) e quem tem mais KPI acumulado
 * (menos do total vindo de recursos). Empate em tudo divide a posição, e
 * a seguinte pula (1, 1, 3) — a ordem da lista de jogadores (o host
 * primeiro) nunca decide.
 * @param {Array} players - Game.state.players
 * @param {object} config - CONFIG (usa config.KPI.FINAL_RESOURCE_VALUE e config.FOCUS_AREAS)
 */
function buildRanking(players, config) {
    const areaIndex = (id) => config.FOCUS_AREAS.findIndex(f => f.id === id);
    const compare = (a, b) =>
        (b.finalKpi - a.finalKpi) ||
        (areaIndex(b.focusArea) - areaIndex(a.focusArea)) ||
        (b.activities - a.activities) ||
        (b.kpi - a.kpi);

    const sorted = [...players]
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
        .sort(compare);

    const ranking = [];
    sorted.forEach((p, i) => {
        const tiedWithPrevious = i > 0 && compare(sorted[i - 1], p) === 0;
        ranking.push({
            position: tiedWithPrevious ? ranking[i - 1].position : i + 1,
            ...p
        });
    });
    return ranking;
}

// ============================================
// EXPORTAÇÃO
// ============================================
window.Game = window.Game || {};
window.Game.domain = window.Game.domain || {};
window.Game.domain.ranking = {
    buildRanking
};