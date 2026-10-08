// ============================================
// PM: The KPI Master - UI Modal: Resultado
// ============================================
// Modal de resultado (acertou/errou), com o honorário de assessoria
// pago por quem respondeu, e o aviso do honorário recebido pelo assessor.
//
// Ao acertar, mostra um
// lembrete de avançar a peça no tabuleiro físico — o jogo tem um
// componente físico junto do digital, e isso era fácil de esquecer.
// ============================================

/**
 * @param {boolean} isCorrect
 * @param {number} kpiGained
 * @param {number} [remainingResources] - recursos depois da resposta (e do honorário)
 * @param {{outcome: string, amount: number, partner: string}} [support] - apoio
 *   da pergunta; com `outcome` 'fee', o honorário pago ao assessor `partner`
 */
function showResultModal(isCorrect, kpiGained, remainingResources, support) {
    const modal = document.getElementById('modalResult');
    document.getElementById('resultTitle').textContent = Game.i18n.t(isCorrect ? 'result.correct' : 'result.wrong');
    document.getElementById('resultTitle').className = 'result-title ' + (isCorrect ? 'result-success' : 'result-error');
    let msg = isCorrect ? Game.i18n.t('result.kpiGained', { kpi: kpiGained }) : Game.i18n.t('result.kpiZero');
    if (remainingResources !== undefined) msg += Game.i18n.t('result.withResources', { resources: remainingResources });
    if (support && support.outcome === 'fee') {
        msg += Game.i18n.t('result.feePaid', { advisor: support.partner, amount: support.amount });
    }
    document.getElementById('resultMessage').textContent = msg;

    const reminder = document.getElementById('resultBoardReminder');
    if (reminder) reminder.style.display = isCorrect ? 'block' : 'none';

    modal.style.display = 'flex';
}

/**
 * Aviso para quem apoiou a pergunta de outro jogador. Com `outcome`
 * 'fee': o assessor recebeu o honorário de `partner` (quem pediu).
 */
function showSupportResultModal(outcome, amount, partner) {
    if (outcome !== 'fee') return;
    document.getElementById('resultTitle').textContent = Game.i18n.t('result.advisoryTitle');
    document.getElementById('resultTitle').className = 'result-title result-success';
    document.getElementById('resultMessage').textContent = Game.i18n.t('result.feeReceived', { requester: partner, amount });

    // O honorário não avança atividade/tabuleiro — quem move a peça é
    // sempre o Respondedor, não o Assessor. Esconde explicitamente
    // porque a modal é compartilhada com showResultModal().
    const reminder = document.getElementById('resultBoardReminder');
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
    showSupportResultModal
});
