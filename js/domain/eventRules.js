// ============================================
// PM: The KPI Master - Domain: Eventos
// ============================================
// Regras PURAS de sorteio e aplicação de efeitos de eventos.
// Não acessa Game.state, network ou DOM diretamente.
// ============================================

/**
 * Sorteia um evento, dando 50% de chance para o evento neutro (se houver)
 * e distribuindo os outros 50% entre os demais.
 * @param {Array} eventos - lista de eventos possíveis (questionsData.eventos)
 */
function sortearEvento(eventos) {
    if (!eventos || eventos.length === 0) return null;

    const neutro = eventos.find(e => e.neutro === true);
    const outros = eventos.filter(e => e.neutro !== true);

    if (neutro && (outros.length === 0 || Math.random() < 0.5)) {
        return neutro;
    }
    return outros[Math.floor(Math.random() * outros.length)];
}

/**
 * Aplica os efeitos do evento sobre os recursos dos jogadores ativos (mutação in-place).
 * @param {object} evento
 * @param {Array} jogadoresAtivos - lista de jogadores ativos (Game.getActivePlayers())
 * @returns {Array<string>} mensagens de log descrevendo os efeitos aplicados
 */
function aplicarEfeitosEvento(evento, jogadoresAtivos) {
    const logs = [];
    if (!evento) return logs;

    const ativos = jogadoresAtivos || [];

    if (evento.recursos_todos > 0) {
        ativos.forEach(p => p.recursos += evento.recursos_todos);
        logs.push('🟢 Evento: +' + evento.recursos_todos + ' recurso(s) para todos os ativos');
    }

    if (evento.recursos_todos < 0) {
        ativos.forEach(p => {
            p.recursos = Math.max(0, p.recursos + evento.recursos_todos);
        });
        logs.push('🔴 Evento: ' + evento.recursos_todos + ' recurso(s) de todos os ativos');
    }

    if (evento.recursos_menos && ativos.length > 0) {
        const minRecursos = Math.min(...ativos.map(p => p.recursos));
        const beneficiados = ativos.filter(p => p.recursos === minRecursos);
        beneficiados.forEach(p => p.recursos += evento.recursos_menos);
        logs.push('🎁 Evento: +' + evento.recursos_menos + ' recursos para ' + beneficiados.map(p => p.name).join(', '));
    }

    if (evento.troca_recursos && ativos.length > 0) {
        const maxRecursos = Math.max(...ativos.map(p => p.recursos));
        const minRecursos = Math.min(...ativos.map(p => p.recursos));
        if (maxRecursos > minRecursos) {
            const rico = ativos.find(p => p.recursos === maxRecursos);
            const pobre = ativos.find(p => p.recursos === minRecursos);
            if (rico && pobre && rico !== pobre) {
                rico.recursos--;
                pobre.recursos++;
                logs.push('🔄 Evento: ' + rico.name + ' deu 1 recurso para ' + pobre.name);
            }
        }
    }

    return logs;
}

// ============================================
// EXPORTAÇÃO
// ============================================
window.Game = window.Game || {};
window.Game.domain = window.Game.domain || {};
window.Game.domain.event = {
    sortearEvento,
    aplicarEfeitosEvento
};