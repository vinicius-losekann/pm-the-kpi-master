// ============================================
// PM: The KPI Master - Domain: Eventos
// ============================================
// Regras PURAS de sorteio e aplicação de efeitos de eventos.
// Não acessa Game.state, network ou DOM diretamente.
// ============================================

/**
 * Sorteia um evento, dando 50% de chance para o evento neutro (se houver)
 * e distribuindo os outros 50% entre os demais.
 * @param {Array} events - lista de eventos possíveis (questionsData.events)
 */
function drawEvent(events) {
    if (!events || events.length === 0) return null;

    const neutral = events.find(e => e.neutral === true);
    const others = events.filter(e => e.neutral !== true);

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

    if (event.resourcesForAll > 0) {
        active.forEach(p => p.resources += event.resourcesForAll);
        logs.push('🟢 Evento: +' + event.resourcesForAll + ' recurso(s) para todos os ativos');
    }

    // Corte sem piso: quem tem 0 entra no estouro de orçamento (negativo).
    if (event.resourcesForAll < 0) {
        active.forEach(p => {
            p.resources += event.resourcesForAll;
        });
        logs.push('🔴 Evento: ' + event.resourcesForAll + ' recurso(s) de todos os ativos');
    }

    if (event.resourcesForFewest && active.length > 0) {
        const minResources = Math.min(...active.map(p => p.resources));
        const beneficiaries = active.filter(p => p.resources === minResources);
        beneficiaries.forEach(p => p.resources += event.resourcesForFewest);
        logs.push('🎁 Evento: +' + event.resourcesForFewest + ' recursos para ' + beneficiaries.map(p => p.name).join(', '));
    }

    if (event.resourceSwap && active.length > 0) {
        const maxResources = Math.max(...active.map(p => p.resources));
        const minResources = Math.min(...active.map(p => p.resources));
        if (maxResources > minResources) {
            const richest = active.find(p => p.resources === maxResources);
            const poorest = active.find(p => p.resources === minResources);
            if (richest && poorest && richest !== poorest) {
                richest.resources--;
                poorest.resources++;
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
