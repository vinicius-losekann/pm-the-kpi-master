// ============================================
// PM: The KPI Master - UI Component: Timer
// ============================================
// Exibição do cronômetro da partida (formatação MM:SS e estados
// visuais de aviso/perigo/crítico).
// ============================================

function updateTimerDisplay() {
    const state = Game.state;
    const display = document.getElementById('timerDisplay');
    const card = document.getElementById('timerCard');
    const m = Math.floor(state.timer / 60);
    const s = state.timer % 60;
    display.textContent = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    card.className = 'timer-card glass-card';
    if (state.timer <= CONFIG.TIMER.CRITICAL) card.classList.add('timer-critical');
    else if (state.timer <= CONFIG.TIMER.DANGER) card.classList.add('timer-danger');
    else if (state.timer <= CONFIG.TIMER.WARNING) card.classList.add('timer-warning');
}

// ============================================
// EXPORTAÇÃO
// ============================================
window.Game = window.Game || {};
window.Game.ui = window.Game.ui || {};
Object.assign(window.Game.ui, {
    updateTimerDisplay
});