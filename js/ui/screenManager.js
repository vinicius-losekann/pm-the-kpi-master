// ============================================
// PM: The KPI Master - UI: Screen Manager
// ============================================
// Navegação entre telas (lobby, jogo, fim de jogo), fechamento de
// modais, aviso curto no topo e status de conexão.
// ============================================

const SCREENS = {
    lobby: document.getElementById('screenLobby'),
    game: document.getElementById('screenGame'),
    gameover: document.getElementById('screenGameOver'),
};

function showScreen(screen) {
    closeAllModals();

    SCREENS.lobby.classList.remove('active');
    SCREENS.game.classList.remove('active');
    SCREENS.gameover.classList.remove('active');

    switch (screen) {
        case 'lobby': SCREENS.lobby.classList.add('active'); break;
        case 'game': SCREENS.game.classList.add('active'); break;
        case 'gameover': SCREENS.gameover.classList.add('active'); break;
    }
}

function closeAllModals() {
    // Todos os modais do game.html: ao criar um modal novo, incluir aqui
    // (senão ele continua aberto ao trocar de tela).
    ['modalAnswerQuestion', 'modalResult', 'modalEvent',
     'modalAdvisorySelect', 'modalAdvisoryQuestion'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
    });
}

let noticeTimeout = null;

/**
 * Aviso curto no topo da tela da partida (ex.: "Fulano caiu"), sem botão:
 * some sozinho depois de CONFIG.GAME.NOTICE_MS. Um aviso novo troca o
 * anterior e conta o tempo de novo.
 */
function showNotice(text) {
    const el = document.getElementById('gameNotice');
    if (!el) return;
    el.textContent = text;
    el.style.display = 'block';
    clearTimeout(noticeTimeout);
    noticeTimeout = setTimeout(() => {
        el.style.display = 'none';
    }, CONFIG.GAME.NOTICE_MS);
}

function updateConnectionStatus(status, text) {
    const dot = document.querySelector('.status-dot');
    const textEl = document.getElementById('statusText');
    dot.className = 'status-dot';
    if (status === 'connected') dot.classList.add('status-connected');
    else if (status === 'error') dot.classList.add('status-error');
    else dot.classList.add('status-connecting');
    textEl.textContent = text;
}

// ============================================
// EXPORTAÇÃO
// ============================================
window.Game = window.Game || {};
window.Game.ui = window.Game.ui || {};
Object.assign(window.Game.ui, {
    showScreen,
    closeAllModals,
    showNotice,
    updateConnectionStatus
});