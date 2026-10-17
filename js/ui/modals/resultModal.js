// ============================================
// PM: The KPI Master - UI Modal: Resultado
// ============================================
// Modal de resultado (acertou/errou/tempo esgotado), com o apoio da pergunta (honorário
// pago ao assessor, ajuda recompensada ou erro coberto), e o aviso de
// quem apoiou (honorário recebido, recompensa ou cobertura).
//
// Ao acertar, mostra um
// lembrete de avançar a peça no tabuleiro físico — o jogo tem um
// componente físico junto do digital, e isso era fácil de esquecer.
// ============================================

/**
 * @param {boolean} isCorrect
 * @param {number} kpiGained
 * @param {number} [remainingResources] - recursos depois da resposta (e do apoio)
 * @param {{outcome: string, amount: number, partner: string}} [support] - apoio
 *   da pergunta: 'fee' (honorário pago ao assessor `partner`), 'reward'
 *   (`partner` ajudou e ganhou a recompensa) ou 'cover' (`partner` cobriu o erro)
 * @param {boolean} [timedOut] - o prazo de resposta acabou (conta como erro;
 *   o título diz "Tempo esgotado")
 */
function showResultModal(isCorrect, kpiGained, remainingResources, support, timedOut) {
    const modal = document.getElementById('modalResult');
    let title = Game.i18n.t('result.wrong');
    if (isCorrect) {
        title = Game.i18n.t('result.correct');
    } else if (timedOut) {
        title = Game.i18n.t('result.timeout');
    }
    document.getElementById('resultTitle').textContent = title;
    document.getElementById('resultTitle').className = 'result-title ' + (isCorrect ? 'result-success' : 'result-error');
    let msg = isCorrect ? Game.i18n.t('result.kpiGained', { kpi: kpiGained }) : Game.i18n.t('result.kpiZero');
    if (remainingResources !== undefined) msg += Game.i18n.t('result.withResources', { resources: remainingResources });
    if (support && support.outcome === 'fee') {
        msg += Game.i18n.t('result.feePaid', { advisor: support.partner, amount: support.amount });
    } else if (support && support.outcome === 'reward') {
        msg += Game.i18n.t('result.helperRewarded', { helper: support.partner, amount: support.amount });
    } else if (support && support.outcome === 'cover') {
        msg += Game.i18n.t('result.errorCovered', { helper: support.partner });
    }
    document.getElementById('resultMessage').textContent = msg;

    const reminder = document.getElementById('resultBoardReminder');
    if (reminder) reminder.style.display = isCorrect ? 'block' : 'none';

    modal.style.display = 'flex';
}

/**
 * Aviso para quem apoiou a pergunta de outro jogador (`partner`, quem
 * pediu): 'fee' (o assessor recebeu o honorário), 'reward' (quem ajudou
 * ganhou a recompensa do patrocinador) ou 'cover' (quem ajudou cobriu o erro).
 */
function showSupportResultModal(outcome, amount, partner) {
    const title = document.getElementById('resultTitle');
    const message = document.getElementById('resultMessage');
    if (outcome === 'fee') {
        title.textContent = Game.i18n.t('result.advisoryTitle');
        title.className = 'result-title result-success';
        message.textContent = Game.i18n.t('result.feeReceived', { requester: partner, amount });
    } else if (outcome === 'reward') {
        title.textContent = Game.i18n.t('result.helpTitle');
        title.className = 'result-title result-success';
        message.textContent = Game.i18n.t('result.rewardReceived', { requester: partner, amount });
    } else if (outcome === 'cover') {
        title.textContent = Game.i18n.t('result.helpTitle');
        title.className = 'result-title result-error';
        message.textContent = Game.i18n.t('result.coverPaid', { requester: partner, amount });
    } else {
        return;
    }

    // O apoio não avança atividade/tabuleiro — quem move a peça é
    // sempre o Respondedor, não quem apoiou. Esconde explicitamente
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
