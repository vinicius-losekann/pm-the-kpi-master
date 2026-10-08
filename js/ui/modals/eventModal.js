// ============================================
// PM: The KPI Master - UI Modal: Evento
// ============================================
// Modal exibido no início de cada rodada com o evento sorteado e, nos
// eventos que atingem jogadores específicos, quem foi atingido.
// ============================================

/** "Ana", "Ana e Beto", "Ana, Beto e Carla". */
function joinNames(names) {
    if (names.length <= 1) return names.join('');
    return names.slice(0, -1).join(', ') + ' e ' + names[names.length - 1];
}

/**
 * Texto de quem o evento atingiu (`effect` de applyEventEffects(), em
 * domain/eventRules.js); vazio quando não há efeito a mostrar.
 * Os nomes vão por textContent, sem escapar.
 */
function renderEventEffect(effect) {
    if (!effect) return '';
    if (effect.reason === 'all-tied') return Game.i18n.t('event.noneTied');
    if (effect.reason === 'giver-without-resources') return Game.i18n.t('event.noneGiverWithoutResources', { giver: effect.giver });
    if (effect.giver) {
        return Game.i18n.t('event.gave', { giver: effect.giver, receiver: effect.receivers[0], amount: effect.amount });
    }
    const names = joinNames(effect.receivers);
    if (effect.receivers.length > 1) return Game.i18n.t('event.receivedMany', { names, amount: effect.amount });
    return Game.i18n.t('event.received', { names, amount: effect.amount });
}

function showEventModal(event, effect = null) {
    if (!event) return;
    document.getElementById('eventModalTitle').textContent = event.title;
    document.getElementById('eventModalDesc').textContent = event.description;
    const effectText = renderEventEffect(effect);
    const effectLine = document.getElementById('eventModalEffect');
    effectLine.textContent = effectText;
    effectLine.style.display = effectText ? 'block' : 'none';
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
