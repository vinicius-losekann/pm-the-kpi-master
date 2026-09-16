// ============================================
// PM: The KPI Master - UI: Screen Manager
// ============================================
// Navegação entre telas (lobby, jogo, fim de jogo), fechamento de
// modais e status de conexão.
// Fase 5.1 do roadmap.
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
    ['modalResponderPergunta', 'modalResult', 'modalEvento', 'modalVenda', 'modalVendaOferta',
     'modalAssessoriaSelect', 'modalAssessoriaQuestion', 'modalAssessoriaSugestao'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
    });
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
    updateConnectionStatus
});