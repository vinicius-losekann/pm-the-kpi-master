// js/ui/lobby.js
// ============================================
// PM: The KPI Master - UI do Lobby
// ============================================

window.Game = window.Game || {};
window.Game.ui = window.Game.ui || {};

// ============================================
// STATUS DE CONEXÃO
// ============================================

Game.ui.updateConnectionStatus = function(status, text) {
    const dot = document.querySelector('.status-dot');
    const textEl = document.getElementById('statusText');
    
    if (!dot || !textEl) {
        console.warn('⚠️ Elementos de status não encontrados');
        return;
    }
    
    dot.className = 'status-dot';
    
    const statusMap = {
        'connected': { class: 'status-connected', msg: 'lobby.connected' },
        'error': { class: 'status-error', msg: 'lobby.error' },
        'disconnected': { class: 'status-connecting', msg: 'lobby.disconnected' },
        'connecting': { class: 'status-connecting', msg: 'lobby.connecting' },
    };
    
    const config = statusMap[status] || statusMap['connecting'];
    dot.classList.add(config.class);
    textEl.textContent = text || __(config.msg);
};

// ============================================
// LISTA DE JOGADORES
// ============================================

// js/ui/lobby.js - Versão corrigida

Game.ui.updatePlayersList = function() {
    const state = Game.state;
    const container = document.getElementById('playersList');
    const countEl = document.getElementById('playerCount');
    
    if (!container || !countEl) {
        console.warn('⚠️ Elementos da lista de jogadores não encontrados');
        return;
    }
    
    // ============================================
    // CORREÇÃO: Atualiza APENAS o número, sem o "/6"
    // ============================================
    const count = state.players.length;
    countEl.textContent = count;  // ← APENAS O NÚMERO
    
    // O "/6" e "jogadores" já estão no HTML estático
    // Então NÃO precisamos adicionar nada aqui
    
    // Atualiza lista de jogadores
    if (state.players.length === 0) {
        container.innerHTML = `
            <div class="player-empty">
                <span class="empty-icon">${CONFIG.UI?.ICONS?.KPI || '🎯'}</span>
                <p>${__('lobby.waiting_players')}</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = state.players.map(p => {
        const hostBadge = p.isHost 
            ? `<span class="host-badge">${__('lobby.host_badge')}</span>` 
            : '';
        const waitingBadge = p.waitingInLobby 
            ? `<span style="font-size:0.7rem; color:#ffa502;">(${__('game.waiting') || 'aguardando'})</span>` 
            : '';
        
        return `
            <div class="player-item">
                <div class="player-avatar-sm">${p.name.charAt(0).toUpperCase()}</div>
                <span class="player-item-name">${p.name}</span>
                ${hostBadge}
                ${waitingBadge}
                <span class="player-status-dot status-connected"></span>
            </div>
        `;
    }).join('');
    
    // Verifica condição de início
    Game.ui.checkStartCondition();
};

// ============================================
// CONDIÇÃO DE INÍCIO
// ============================================

Game.ui.checkStartCondition = function() {
    const state = Game.state;
    if (!state.isHost) return;
    
    const btnStart = document.getElementById('btnStartGame');
    const hint = document.getElementById('startHint');
    
    if (!btnStart || !hint) {
        console.warn('⚠️ Elementos de start não encontrados');
        return;
    }
    
    const activeCount = Game.getActivePlayers().length;
    const minPlayers = CONFIG.JOGO.MIN_PLAYERS;
    
    if (activeCount >= minPlayers) {
        btnStart.disabled = false;
        hint.textContent = __('lobby.ready_to_start', { count: activeCount });
        hint.style.color = CONFIG.UI?.COLORS?.SUCCESS || '#00ff88';
    } else {
        btnStart.disabled = true;
        hint.textContent = __('lobby.min_players', { min: minPlayers });
        hint.style.color = '#a0a0b0';
    }
};

// ============================================
// EXIBIÇÃO DO LOBBY
// ============================================

Game.ui.showLobbyNormal = function() {
    const state = Game.state;
    
    // Controles do host
    const hostControls = document.getElementById('hostControls');
    const playerWaiting = document.getElementById('playerWaiting');
    const btnEndSession = document.getElementById('btnEndSession');
    const btnLeaveSession = document.getElementById('btnLeaveSession');
    const hostRoomIdSection = document.getElementById('hostRoomIdSection');
    
    if (hostControls) {
        hostControls.style.display = state.isHost ? 'block' : 'none';
    }
    
    if (playerWaiting) {
        playerWaiting.style.display = state.isHost ? 'none' : 'block';
        if (!state.isHost) {
            playerWaiting.innerHTML = `
                <div class="waiting-animation">
                    <span class="waiting-dot"></span>
                    <span class="waiting-dot"></span>
                    <span class="waiting-dot"></span>
                </div>
                <p>${__('lobby.waiting_host')}</p>
            `;
        }
    }
    
    if (hostRoomIdSection) {
        hostRoomIdSection.style.display = state.isHost ? 'block' : 'none';
    }
    
    if (btnEndSession) {
        btnEndSession.style.display = state.isHost ? 'inline-block' : 'none';
        if (state.isHost) {
            btnEndSession.textContent = `⛔ ${__('lobby.end_session')}`;
        }
    }
    
    if (btnLeaveSession) {
        btnLeaveSession.style.display = state.isHost ? 'none' : 'inline-block';
        if (!state.isHost) {
            btnLeaveSession.textContent = `🚪 ${__('lobby.leave_session')}`;
        }
    }
    
    // Esconde botões que não devem aparecer
    const btnLeaveMatch = document.getElementById('btnLeaveMatch');
    const btnEndMatch = document.getElementById('btnEndMatch');
    if (btnLeaveMatch) btnLeaveMatch.style.display = 'none';
    if (btnEndMatch) btnEndMatch.style.display = 'none';
    
    // Atualiza lista
    Game.ui.updatePlayersList();
};

Game.ui.showLobbyWaitingView = function() {
    const hostControls = document.getElementById('hostControls');
    const playerWaiting = document.getElementById('playerWaiting');
    const btnEndSession = document.getElementById('btnEndSession');
    const btnLeaveSession = document.getElementById('btnLeaveSession');
    const playersList = document.getElementById('playersList');
    
    if (hostControls) hostControls.style.display = 'none';
    if (btnEndSession) btnEndSession.style.display = 'none';
    if (btnLeaveSession) btnLeaveSession.style.display = 'inline-block';
    
    if (playerWaiting) {
        playerWaiting.style.display = 'block';
        playerWaiting.innerHTML = `
            <span style="font-size:2rem;">${CONFIG.UI?.ICONS?.WARNING || '⚠️'}</span>
            <p><strong>${__('status.match_in_progress') || 'Partida em andamento'}</strong></p>
            <p style="color:#a0a0b8; font-size:0.85rem;">${__('status.waiting_in_lobby') || 'Você saiu da partida. Aguarde o host encerrar.'}</p>
        `;
    }
    
    if (playersList) {
        const playing = Game.getActivePlayers();
        const waiting = Game.state.players.filter(p => p.waitingInLobby);
        
        playersList.innerHTML = `
            <div style="margin-bottom:8px;">
                <strong>${__('lobby.players_in_game') || 'Em jogo'}: ${playing.length}</strong>
                ${playing.map(p => `<div>• ${p.name}</div>`).join('')}
            </div>
            <div>
                <strong>${__('lobby.players_waiting') || 'Aguardando'}: ${waiting.length}</strong>
                ${waiting.map(p => `<div>• ${p.name}</div>`).join('')}
            </div>
        `;
    }
};

console.log('🖥️ UI do Lobby carregada!');