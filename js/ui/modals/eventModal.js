// ============================================
// PM: The KPI Master - UI Modal: Evento
// ============================================
// Modal exibido no início de cada rodada com o evento sorteado.
// ============================================

function showEventoModal(evento) {
    if (!evento) return;
    document.getElementById('eventoModalTitulo').textContent = evento.titulo;
    document.getElementById('eventoModalDesc').textContent = evento.descricao;
    document.getElementById('modalEvento').style.display = 'flex';
}

// ============================================
// EXPORTAÇÃO
// ============================================
window.Game = window.Game || {};
window.Game.ui = window.Game.ui || {};
Object.assign(window.Game.ui, {
    showEventoModal
});