// ============================================
// PM: The KPI Master - UI Modal: Evento
// ============================================
// Modal exibido no início de cada rodada com o evento sorteado.
// ============================================

function showEventModal(event) {
    if (!event) return;
    document.getElementById('eventoModalTitulo').textContent = event.titulo;
    document.getElementById('eventoModalDesc').textContent = event.descricao;
    document.getElementById('modalEvento').style.display = 'flex';
}

// ============================================
// EXPORTAÇÃO
// ============================================
window.Game = window.Game || {};
window.Game.ui = window.Game.ui || {};
Object.assign(window.Game.ui, {
    showEventModal
});