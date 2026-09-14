// ============================================
// PM: The KPI Master - UI Component: Lobby
// ============================================
// Renderização do lobby: lista de jogadores, tela normal e tela de
// espera (jogador que saiu da partida em andamento).
// Fase 5.3 do roadmap. Religado ao i18n (ver NOTA-003 em ARCHITECTURE.md).
// ============================================

function showLobbyNormal() {
    const state = Game.state;
    document.getElementById('hostControls').style.display = state.isHost ? 'block' : 'none';
    document.getElementById('playerWaiting').style.display = state.isHost ? 'none' : 'block';
    document.getElementById('playerWaiting').innerHTML = `
        <div class="waiting-animation">
            <span class="waiting-dot"></span><span class="waiting-dot"></span><span class="waiting-dot"></span>
        </div>
        <p>${Game.i18n.t('lobby.aguardandoHost')}</p>
    `;
    document.getElementById('btnEndSession').style.display = state.isHost ? 'inline-block' : 'none';
    document.getElementById('btnLeaveSession').style.display = state.isHost ? 'none' : 'inline-block';
    updatePlayersList();
}

function showLobbyWaitingView() {
    document.getElementById('hostControls').style.display = 'none';
    document.getElementById('playerWaiting').style.display = 'block';
    document.getElementById('btnEndSession').style.display = 'none';
    document.getElementById('btnLeaveSession').style.display = 'inline-block';

    const playing = Game.getActivePlayers();
    const waiting = Game.state.players.filter(p => p.waitingInLobby);

    document.getElementById('playerWaiting').innerHTML = `
        <span style="font-size:2rem;">⚠️</span>
        <p><strong>${Game.i18n.t('lobby.partidaEmAndamentoTitulo')}</strong></p>
        <p style="color:#a0a0b8; font-size:0.85rem;">${Game.i18n.t('lobby.partidaEmAndamentoDesc')}</p>
    `;

    document.getElementById('playersList').innerHTML = `
        <div style="margin-bottom:8px;"><strong>${Game.i18n.t('lobby.emJogo', { count: playing.length })}</strong>${playing.map(p => `<div>• ${Game.sanitize.escapeHtml(p.name)}</div>`).join('')}</div>
        <div><strong>${Game.i18n.t('lobby.aguardando', { count: waiting.length })}</strong>${waiting.map(p => `<div>• ${Game.sanitize.escapeHtml(p.name)}</div>`).join('')}</div>
    `;
}

function updatePlayersList() {
    const state = Game.state;
    document.getElementById('playerCount').textContent = state.players.length;
    document.getElementById('playersList').innerHTML = state.players.map(p => `
        <div class="player-item">
            <div class="player-avatar-sm">${Game.sanitize.escapeHtml(p.name.charAt(0).toUpperCase())}</div>
            <span class="player-item-name">${Game.sanitize.escapeHtml(p.name)}</span>
            ${p.isHost ? `<span class="host-badge">${Game.i18n.t('lobby.badgeHost')}</span>` : ''}
            ${p.waitingInLobby ? `<span style="font-size:0.7rem; color:#ffa502;">${Game.i18n.t('lobby.badgeAguardando')}</span>` : ''}
            <span class="player-status-dot status-connected"></span>
        </div>
    `).join('') || `<div class="player-empty"><span class="empty-icon">🎯</span><p>${Game.i18n.t('lobby.aguardandoJogadores')}</p></div>`;
}

// ============================================
// EXPORTAÇÃO
// ============================================
window.Game = window.Game || {};
window.Game.ui = window.Game.ui || {};
Object.assign(window.Game.ui, {
    showLobbyNormal,
    showLobbyWaitingView,
    updatePlayersList
});