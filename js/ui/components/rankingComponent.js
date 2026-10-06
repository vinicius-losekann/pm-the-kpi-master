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
        const focusArea = Game.getFocusAreaById(p.focusArea);
        const safeName = Game.sanitize.escapeHtml(p.name);
        const offlineStyle = p.disconnected ? ' style="opacity:0.5;"' : '';
        const offlineIcon = p.disconnected ? `<span title="${Game.i18n.t('ranking.disconnected')}">📴</span>` : '';
        return `<div class="online-player"${offlineStyle}><div class="player-avatar-xs">${Game.sanitize.escapeHtml(p.name.charAt(0))}</div><span>${safeName}</span>${offlineIcon}<span style="font-size:0.7rem; color:#ffd700;">📦${p.resources || 0}</span><span class="mini-focus-area">${focusArea.emoji}</span></div>`;
    }).join('') || `<div style="color:#6a6a80; font-size:0.8rem;">${Game.i18n.t('ranking.noActivePlayers')}</div>`;
}

function updateRankingList() {
    const ranking = Game.core.buildRanking().filter(p => !p.waitingInLobby);
    const medals = ['🥇', '🥈', '🥉'];
    document.getElementById('rankingList').innerHTML = ranking.map((p, i) => `
        <div class="rank-item"><span class="rank-pos">${medals[i] || '#' + (i + 1)}</span><span class="rank-name">${Game.sanitize.escapeHtml(p.name)}</span><span class="rank-kpi">${p.finalKpi} ⭐</span></div>
    `).join('');
}

function displayFinalRanking(ranking) {
    const medals = ['🥇', '🥈', '🥉'];
    const formula = document.getElementById('finalKpiFormula');
    if (formula) {
        formula.textContent = Game.i18n.t('ranking.finalKpiFormula', { value: CONFIG.KPI.FINAL_RESOURCE_VALUE });
    }
    document.getElementById('finalRanking').innerHTML = ranking.map((p, i) => {
        const resourcesKpi = p.resources * CONFIG.KPI.FINAL_RESOURCE_VALUE;
        const detail = Game.i18n.t('ranking.rankingDetail', {
            kpi: p.kpi,
            resources: p.resources,
            value: CONFIG.KPI.FINAL_RESOURCE_VALUE,
            resourcesKpi
        });
        return `<div class="final-rank-item ${i < 3 ? 'top-' + (i + 1) : ''}">
        <span class="final-rank-pos">${medals[i] || '#' + p.position}</span>
        <span class="final-rank-name">${Game.sanitize.escapeHtml(p.name)}</span>
        <span class="final-rank-kpi">${p.finalKpi} ⭐</span>
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