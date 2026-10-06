// ============================================
// PM: The KPI Master - UI Modal: Evento
// ============================================
// Modal exibido no início de cada rodada com o evento sorteado.
// ============================================

function showEventModal(event) {
    if (!event) return;
    document.getElementById('eventModalTitle').textContent = event.title;
    document.getElementById('eventModalDesc').textContent = event.description;
    document.getElementById('modalEvent').style.display = 'flex';
}

// ============================================
// EXPORTAÇÃO
// ============================================
window.Game = window.Game || {};
window.Game.ui = window.Game.ui || {};
Object.assign(window.Game.ui, {
    showEventModal
});