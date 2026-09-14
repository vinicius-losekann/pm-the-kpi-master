// ============================================
// PM: The KPI Master - UI Modal: Resultado
// ============================================
// Modal de resultado (acertou/errou) e do bônus de assessoria.
// Fase 5.9 do roadmap.
// ============================================

function showResultModal(acertou, kpiGanho, recursosRestantes) {
    const modal = document.getElementById('modalResult');
    document.getElementById('resultTitle').textContent = Game.i18n.t(acertou ? 'result.acertou' : 'result.errou');
    document.getElementById('resultTitle').className = 'result-title ' + (acertou ? 'result-success' : 'result-error');
    let msg = acertou ? Game.i18n.t('result.kpiGanho', { kpi: kpiGanho }) : Game.i18n.t('result.kpiZero');
    if (recursosRestantes !== undefined) msg += Game.i18n.t('result.comRecursos', { recursos: recursosRestantes });
    document.getElementById('resultMessage').textContent = msg;
    modal.style.display = 'flex';
}

function showAssessoriaBonusModal(bonus) {
    document.getElementById('resultTitle').textContent = Game.i18n.t('result.assessoriaTitulo');
    document.getElementById('resultTitle').className = 'result-title result-success';
    document.getElementById('resultMessage').textContent = Game.i18n.t('result.assessoriaBonus', { bonus });
    document.getElementById('modalResult').style.display = 'flex';
}

// ============================================
// EXPORTAÇÃO
// ============================================
window.Game = window.Game || {};
window.Game.ui = window.Game.ui || {};
Object.assign(window.Game.ui, {
    showResultModal,
    showAssessoriaBonusModal
});