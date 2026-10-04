// ============================================
// PM: The KPI Master - Domain: KPI
// ============================================
// Regra PURA de cálculo do resultado de uma resposta:
// acerto/erro, KPI ganho, progressão de área foco e recursos.
// Não acessa Game.state, network ou DOM diretamente — função pura,
// testável isoladamente.
// ============================================

/**
 * Calcula o resultado de uma resposta do Respondedor.
 *
 * @param {object} params
 * @param {string} params.chosenAlternative - alternativa marcada ('a'|'b'|'c'|'d'|null)
 * @param {string} params.correct - alternativa correta da pergunta
 * @param {number} params.currentKpi - KPI atual do Respondedor
 * @param {string} params.focusAreaId - área foco atual do Respondedor (CONFIG.FASES[i].id)
 * @param {number} params.activities - atividades concluídas na área foco atual
 * @param {boolean} params.hasReserve - true se o evento da rodada é "reserva de contingência"
 * @param {object} params.config - CONFIG (usa config.KPI.ACERTO_BASE, config.JOGO.ACTIVITIES_PER_PHASE)
 * @param {Array} params.focusAreas - CONFIG.FASES
 * @returns {{isCorrect: boolean, kpiGained: number, newKpi: number, newFocusArea: string, newActivities: number, spendsResource: boolean}}
 *   spendsResource: só true quando ERROU e não há reserva de contingência
 *   — acertar nunca gasta recurso; recurso é punição por erro, não custo
 *   de participar.
 */
function calculateAnswerResult({ chosenAlternative, correct, currentKpi, focusAreaId, activities, hasReserve, config, focusAreas }) {
    const isCorrect = chosenAlternative === correct;

    let kpiGained = 0;
    let newKpi = currentKpi;
    let newFocusArea = focusAreaId;
    let newActivities = activities;

    if (isCorrect) {
        kpiGained = config.KPI.ACERTO_BASE;
        newKpi = currentKpi + kpiGained;
        newActivities = activities + 1;

        const areaIndex = focusAreas.findIndex(f => f.id === focusAreaId);
        if (newActivities >= config.JOGO.ACTIVITIES_PER_PHASE && areaIndex < focusAreas.length - 1) {
            newFocusArea = focusAreas[areaIndex + 1].id;
            newActivities = 0;
        }
    }

    return {
        isCorrect,
        kpiGained,
        newKpi,
        newFocusArea,
        newActivities,
        spendsResource: !isCorrect && !hasReserve
    };
}

// ============================================
// EXPORTAÇÃO
// ============================================
window.Game = window.Game || {};
window.Game.domain = window.Game.domain || {};
window.Game.domain.kpi = {
    calculateAnswerResult
};
