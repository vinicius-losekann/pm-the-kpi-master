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
 * Atividades concluídas na partida: as das áreas foco já vencidas
 * (índice da área × atividades por área) mais as da área atual.
 */
function countCompletedActivities(player, config) {
    const areaIndex = Math.max(config.FOCUS_AREAS.findIndex(a => a.id === player.focusArea), 0);
    return areaIndex * config.GAME.ACTIVITIES_PER_FOCUS_AREA + (player.activities || 0);
}

/**
 * Quem está mais atrás no tabuleiro (menos atividades concluídas e, no
 * empate, menos recursos) — ou mais à frente, com `ahead` (mais
 * atividades e, no empate, mais recursos). Devolve todos os empatados.
 */
function findTiedAtEdge(players, config, ahead) {
    const sign = ahead ? -1 : 1;
    const activitiesOf = (p) => countCompletedActivities(p, config);
    const edgeActivities = Math.min(...players.map(p => sign * activitiesOf(p)));
    const byActivities = players.filter(p => sign * activitiesOf(p) === edgeActivities);
    const edgeResources = Math.min(...byActivities.map(p => sign * p.resources));
    return byActivities.filter(p => sign * p.resources === edgeResources);
}

/** Um dos empatados, por sorteio. */
function drawOne(players) {
    return players[Math.floor(Math.random() * players.length)];
}

/** Patrocinador Generoso: quem está mais atrás ganha; empate em tudo, todos os empatados. */
function applySponsor(amount, active, config) {
    const receivers = findTiedAtEdge(active, config, false);
    receivers.forEach(p => p.resources += amount);
    return { receivers: receivers.map(p => p.name), amount };
}

/**
 * Reestruturação: quem está mais à frente cede 1 recurso a quem está
 * mais atrás (empate em tudo de um lado: sorteio). Não acontece quando
 * todos estão empatados em atividades e recursos (ninguém está atrás)
 * nem quando quem cederia está com 0 recursos ou menos.
 */
function applyRestructuring(active, config) {
    const ahead = findTiedAtEdge(active, config, true);
    if (ahead.length === active.length) return { receivers: [], reason: 'all-tied' };

    const giver = drawOne(ahead);
    if (giver.resources <= 0) return { giver: giver.name, receivers: [], reason: 'giver-without-resources' };

    const receiver = drawOne(findTiedAtEdge(active, config, false));
    giver.resources--;
    receiver.resources++;
    return { giver: giver.name, receivers: [receiver.name], amount: 1 };
}

/**
 * Aplica os efeitos do evento sobre os recursos dos jogadores ativos (mutação in-place).
 * @param {object} event
 * @param {Array} activePlayers - lista de jogadores ativos (Game.getActivePlayers())
 * @param {object} config - CONFIG (usa FOCUS_AREAS e GAME.ACTIVITIES_PER_FOCUS_AREA)
 * @returns {{ logs: Array<string>, effect: object|null }} mensagens de log e
 *   quem foi atingido, para o aviso do evento (`effect`: `receivers`,
 *   `giver`, `amount` e, quando a Reestruturação não acontece, `reason`);
 *   null nos eventos que valem para todos ou para ninguém
 */
function applyEventEffects(event, activePlayers, config) {
    const logs = [];
    let effect = null;
    if (!event) return { logs, effect };

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
        effect = applySponsor(event.resourcesForFewest, active, config);
        logs.push('🎁 Evento: +' + effect.amount + ' recurso(s) para ' + effect.receivers.join(', '));
    }

    if (event.resourceSwap && active.length > 1) {
        effect = applyRestructuring(active, config);
        logs.push(effect.reason
            ? '🔄 Evento sem efeito (' + effect.reason + ')'
            : '🔄 Evento: ' + effect.giver + ' cedeu 1 recurso a ' + effect.receivers[0]);
    }

    return { logs, effect };
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
