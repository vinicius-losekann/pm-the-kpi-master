// ============================================
// PM: The KPI Master - UI Modal: Resultado
// ============================================
// Modal de resultado (acertou/errou) e do bônus de assessoria.
// Fase 5.9 do roadmap.
//
// Fase 9 (feedback do piloto, todo.md 9.3): ao acertar, mostra um
// lembrete de avançar a peça no tabuleiro físico — o jogo tem um
// componente físico junto do digital, e isso era fácil de esquecer.
// ============================================

function showResultModal(acertou, kpiGanho, recursosRestantes) {
    const modal = document.getElementById('modalResult');
    document.getElementById('resultTitle').textContent = Game.i18n.t(acertou ? 'result.acertou' : 'result.errou');
    document.getElementById('resultTitle').className = 'result-title ' + (acertou ? 'result-success' : 'result-error');
    let msg = acertou ? Game.i18n.t('result.kpiGanho', { kpi: kpiGanho }) : Game.i18n.t('result.kpiZero');
    if (recursosRestantes !== undefined) msg += Game.i18n.t('result.comRecursos', { recursos: recursosRestantes });
    document.getElementById('resultMessage').textContent = msg;

    const reminder = document.getElementById('resultTabuleiroReminder');
    if (reminder) reminder.style.display = acertou ? 'block' : 'none';

    modal.style.display = 'flex';
}

function showAssessoriaBonusModal(bonus) {
    document.getElementById('resultTitle').textContent = Game.i18n.t('result.assessoriaTitulo');
    document.getElementById('resultTitle').className = 'result-title result-success';
    document.getElementById('resultMessage').textContent = Game.i18n.t('result.assessoriaBonus', { bonus });

    // O bônus de assessoria não avança atividade/tabuleiro — quem move
    // a peça é sempre o Respondedor, não o Assessor. Esconde
    // explicitamente porque a modal é compartilhada com showResultModal().
    const reminder = document.getElementById('resultTabuleiroReminder');
    if (reminder) reminder.style.display = 'none';

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