// ============================================
// PM: The KPI Master - Domain: KPI
// ============================================
// Regra PURA de cálculo do resultado de uma resposta:
// acerto/erro, KPI ganho, progressão de fase e recursos.
// Não acessa Game.state, network ou DOM diretamente.
// Fase 1.1 do roadmap.
//
// Nota: no js/game-core.js original essa lógica estava
// espalhada dentro de handleAnswer(). Aqui ela vira uma
// função pura, testável isoladamente.
// ============================================

/**
 * Calcula o resultado de uma resposta do Respondedor.
 *
 * @param {object} params
 * @param {string} params.alternativaEscolhida - alternativa marcada ('a'|'b'|'c'|'d'|null)
 * @param {string} params.correct - alternativa correta da pergunta (ex-"correta", ver ARCHITECTURE.md Fase 8)
 * @param {number} params.kpiAtual - KPI atual do respondedor
 * @param {string} params.phaseId - fase atual do respondedor (CONFIG.FASES[i].id)
 * @param {number} params.activities - atividades concluídas na fase atual
 * @param {boolean} params.temReserva - true se o evento da rodada é "reserva de contingência"
 * @param {object} params.config - CONFIG (usa config.KPI.ACERTO_BASE, config.JOGO.ACTIVITIES_PER_PHASE)
 * @param {Array} params.fases - CONFIG.FASES
 * @returns {{acertou: boolean, kpiGanho: number, novoKpi: number, novaFase: string, novasActivities: number, gastaRecurso: boolean}}
 */
function calcularResultadoResposta({ alternativaEscolhida, correct, kpiAtual, phaseId, activities, temReserva, config, fases }) {
    const acertou = alternativaEscolhida === correct;

    let kpiGanho = 0;
    let novoKpi = kpiAtual;
    let novaFase = phaseId;
    let novasActivities = activities;

    if (acertou) {
        kpiGanho = config.KPI.ACERTO_BASE;
        novoKpi = kpiAtual + kpiGanho;
        novasActivities = activities + 1;

        const faseIdx = fases.findIndex(f => f.id === phaseId);
        if (novasActivities >= config.JOGO.ACTIVITIES_PER_PHASE && faseIdx < fases.length - 1) {
            novaFase = fases[faseIdx + 1].id;
            novasActivities = 0;
        }
    }

    return {
        acertou,
        kpiGanho,
        novoKpi,
        novaFase,
        novasActivities,
        gastaRecurso: !temReserva
    };
}

// ============================================
// EXPORTAÇÃO
// ============================================
window.Game = window.Game || {};
window.Game.domain = window.Game.domain || {};
window.Game.domain.kpi = {
    calcularResultadoResposta
};