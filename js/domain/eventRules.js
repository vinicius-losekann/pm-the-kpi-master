// ============================================
// PM: The KPI Master - Domain: Eventos
// ============================================
// Regras PURAS de sorteio e aplicação de efeitos de eventos.
// Não acessa Game.state, network ou DOM diretamente.
// ============================================

/**
 * Sorteia um evento, dando 50% de chance para o evento neutro (se houver)
 * e distribuindo os outros 50% entre os demais.
 * @param {Array} events - lista de eventos possíveis (questionsData.eventos)
 */
function drawEvent(events) {
    if (!events || events.length === 0) return null;

    const neutral = events.find(e => e.neutro === true);
    const others = events.filter(e => e.neutro !== true);

    if (neutral && (others.length === 0 || Math.random() < 0.5)) {
        return neutral;
    }
    return others[Math.floor(Math.random() * others.length)];
}

/**
 * Aplica os efeitos do evento sobre os recursos dos jogadores ativos (mutação in-place).
 * @param {object} event
 * @param {Array} activePlayers - lista de jogadores ativos (Game.getActivePlayers())
 * @returns {Array<string>} mensagens de log descrevendo os efeitos aplicados
 */
function applyEventEffects(event, activePlayers) {
    const logs = [];
    if (!event) return logs;

    const active = activePlayers || [];

    if (event.recursos_todos > 0) {
        active.forEach(p => p.recursos += event.recursos_todos);
        logs.push('🟢 Evento: +' + event.recursos_todos + ' recurso(s) para todos os ativos');
    }

    if (event.recursos_todos < 0) {
        active.forEach(p => {
            p.recursos = Math.max(0, p.recursos + event.recursos_todos);
        });
        logs.push('🔴 Evento: ' + event.recursos_todos + ' recurso(s) de todos os ativos');
    }

    if (event.recursos_menos && active.length > 0) {
        const minResources = Math.min(...active.map(p => p.recursos));
        const beneficiaries = active.filter(p => p.recursos === minResources);
        beneficiaries.forEach(p => p.recursos += event.recursos_menos);
        logs.push('🎁 Evento: +' + event.recursos_menos + ' recursos para ' + beneficiaries.map(p => p.name).join(', '));
    }

    if (event.troca_recursos && active.length > 0) {
        const maxResources = Math.max(...active.map(p => p.recursos));
        const minResources = Math.min(...active.map(p => p.recursos));
        if (maxResources > minResources) {
            const richest = active.find(p => p.recursos === maxResources);
            const poorest = active.find(p => p.recursos === minResources);
            if (richest && poorest && richest !== poorest) {
                richest.recursos--;
                poorest.recursos++;
                logs.push('🔄 Evento: ' + richest.name + ' deu 1 recurso para ' + poorest.name);
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
    drawEvent,
    applyEventEffects
};
