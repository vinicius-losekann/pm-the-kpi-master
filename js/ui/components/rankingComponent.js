// ============================================
// PM: The KPI Master - UI Component: Ranking
// ============================================
// Lista de jogadores ativos (com recursos/fase), ranking parcial
// durante o jogo e ranking final ao término da partida.
// ============================================

function updatePlayersOnlineList() {
    // A lista mostra também quem caiu no meio da partida
    // (esmaecido, com 📴). getActivePlayers() exclui os desconectados —
    // por isso aqui a fonte é getMatchPlayers().
    const players = Game.selectors.getMatchPlayers(Game.state.players);
    document.getElementById('playersOnlineList').innerHTML = players.map(p => {
        const focusArea = Game.getFocusAreaById(p.phase);
        const safeName = Game.sanitize.escapeHtml(p.name);
        const offlineStyle = p.disconnected ? ' style="opacity:0.5;"' : '';
        const offlineIcon = p.disconnected ? `<span title="${Game.i18n.t('ranking.desconectado')}">📴</span>` : '';
        return `<div class="online-player"${offlineStyle}><div class="player-avatar-xs">${Game.sanitize.escapeHtml(p.name.charAt(0))}</div><span>${safeName}</span>${offlineIcon}<span style="font-size:0.7rem; color:#ffd700;">📦${p.recursos || 0}</span><span class="mini-phase">${focusArea.emoji}</span></div>`;
    }).join('') || `<div style="color:#6a6a80; font-size:0.8rem;">${Game.i18n.t('ranking.nenhumJogadorAtivo')}</div>`;
}

function updateRankingList() {
    const ranking = Game.core.buildRanking().filter(p => !p.waitingInLobby);
    const medals = ['🥇', '🥈', '🥉'];
    document.getElementById('rankingList').innerHTML = ranking.map((p, i) => `
        <div class="rank-item"><span class="rank-pos">${medals[i] || '#' + (i + 1)}</span><span class="rank-name">${Game.sanitize.escapeHtml(p.name)}</span><span class="rank-kpi">${p.kpiFinal} ⭐</span></div>
    `).join('');
}

function displayFinalRanking(ranking) {
    const medals = ['🥇', '🥈', '🥉'];
    const formula = document.getElementById('kpiFinalFormula');
    if (formula) {
        formula.textContent = Game.i18n.t('ranking.formulaKpiFinal', { valor: CONFIG.KPI.VALOR_RECURSO_FINAL });
    }
    document.getElementById('finalRanking').innerHTML = ranking.map((p, i) => {
        const resourcesKpi = p.recursos * CONFIG.KPI.VALOR_RECURSO_FINAL;
        const detail = Game.i18n.t('ranking.detalheRanking', {
            kpi: p.kpi,
            recursos: p.recursos,
            valor: CONFIG.KPI.VALOR_RECURSO_FINAL,
            kpiRecursos: resourcesKpi
        });
        return `<div class="final-rank-item ${i < 3 ? 'top-' + (i + 1) : ''}">
        <span class="final-rank-pos">${medals[i] || '#' + p.posicao}</span>
        <span class="final-rank-name">${Game.sanitize.escapeHtml(p.name)}</span>
        <span class="final-rank-kpi">${p.kpiFinal} ⭐</span>
        <div class="final-rank-detail" style="font-size:0.75rem; color:#a0a0b8; margin-top:4px;">${detail}</div>
    </div>`;
    }).join('');
}

// ============================================
// EXPORTAÇÃO
// ============================================
window.Game = window.Game || {};
window.Game.ui = window.Game.ui || {};
Object.assign(window.Game.ui, {
    updatePlayersOnlineList,
    updateRankingList,
    displayFinalRanking
});