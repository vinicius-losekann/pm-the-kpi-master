// ============================================
// PM: The KPI Master - UI Modal: Resultado
// ============================================
// Modal de resultado (acertou/errou) e do bônus de assessoria.
//
// Ao acertar, mostra um
// lembrete de avançar a peça no tabuleiro físico — o jogo tem um
// componente físico junto do digital, e isso era fácil de esquecer.
// ============================================

function showResultModal(isCorrect, kpiGained, remainingResources) {
    const modal = document.getElementById('modalResult');
    document.getElementById('resultTitle').textContent = Game.i18n.t(isCorrect ? 'result.acertou' : 'result.errou');
    document.getElementById('resultTitle').className = 'result-title ' + (isCorrect ? 'result-success' : 'result-error');
    let msg = isCorrect ? Game.i18n.t('result.kpiGanho', { kpi: kpiGained }) : Game.i18n.t('result.kpiZero');
    if (remainingResources !== undefined) msg += Game.i18n.t('result.comRecursos', { recursos: remainingResources });
    document.getElementById('resultMessage').textContent = msg;

    const reminder = document.getElementById('resultTabuleiroReminder');
    if (reminder) reminder.style.display = isCorrect ? 'block' : 'none';

    modal.style.display = 'flex';
}

function showAdvisoryBonusModal(bonus) {
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
    showAdvisoryBonusModal
});