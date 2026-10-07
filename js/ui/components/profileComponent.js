// ============================================
// PM: The KPI Master - UI Component: Perfil
// ============================================
// Renderiza o card de perfil do jogador local: avatar/nome, KPI,
// recursos, e a lista de fases com status individual por fase
// (completa / em andamento / não iniciada).
//
// Game.ui.syncPlayerViews() é o ponto único de "atualizar card de
// perfil + lista de jogadores + ranking" — quem muda o estado de um
// jogador chama ela, em vez de repetir a sequência (cópias espalhadas
// acabam esquecidas e deixam a tela desatualizada).
// ============================================

/**
 * Renderiza o card de perfil com os dados do jogador informado.
 * @param {object} player - objeto com { kpi, resources, focusArea, activities }
 *   (pode ser um jogador de Game.state.players ou um payload de mensagem
 *   de rede com os mesmos campos)
 */
function renderProfileCard(player) {
    if (!player) return;

    document.getElementById('myKPI').textContent = player.kpi;

    // recursos é opcional em alguns payloads (ex: bônus de assessoria isolado)
    if (player.resources !== undefined) {
        // Recurso negativo (estouro de orçamento): número em vermelho e
        // rótulo "Estouro", para o jogador ver que o KPI Final está
        // sendo descontado.
        const overrun = player.resources < 0;
        const resourcesEl = document.getElementById('myResources');
        resourcesEl.textContent = player.resources;
        resourcesEl.className = 'stat-value' + (overrun ? ' resources-overrun' : '');
        document.getElementById('myResourcesLabel').textContent = overrun
            ? Game.i18n.t('profile.overrunLabel')
            : Game.i18n.t('profile.resourcesLabel');

        // Botão "Pedir Ajuda" só aparece quando o jogador está
        // com 0 recursos ou menos — rede de segurança, não mercado livre (ver
        // engine/tradeEngine.js e _docs/architecture.md). Atualizado sempre
        // que os recursos mudam, via syncPlayerViews().
        const helpButton = document.getElementById('btnRequestHelp');
        if (helpButton) {
            helpButton.style.display = player.resources <= 0 ? 'block' : 'none';
        }
    }

    // fase/atividades também são opcionais nalguns payloads, mesmo
    // padrão do bloco de recursos acima.
    if (player.focusArea !== undefined && player.activities !== undefined) {
        renderFocusAreasList(player);
    }
}

/**
 * Desenha a lista de fases com o status de cada uma: completa (fase já
 * ultrapassada), em andamento (fase atual, mostra X de N atividades) ou
 * não iniciada. Como a progressão é sempre linear, dá pra derivar o
 * status de TODAS as fases só com a fase atual + atividades.
 */
function renderFocusAreasList(player) {
    const currentIdx = Game.getFocusAreaIndex(player.focusArea);
    const total = CONFIG.GAME.ACTIVITIES_PER_FOCUS_AREA;

    const html = CONFIG.FOCUS_AREAS.map((focusArea, idx) => {
        let statusClass = '';
        let statusText;

        if (idx < currentIdx) {
            statusClass = 'focus-area-completed';
            statusText = '✅';
        } else if (idx === currentIdx) {
            statusClass = 'focus-area-current';
            statusText = player.activities + ' de ' + total;
        } else {
            statusText = '0 de ' + total;
        }

        return '<div class="focus-area-item ' + statusClass + '" data-focus-area="' + focusArea.id + '">' +
            '<span>' + focusArea.emoji + ' ' + focusArea.name + '</span>' +
            '<span class="focus-area-status">' + statusText + '</span>' +
            '</div>';
    }).join('');

    document.getElementById('focusAreasList').innerHTML = html;
}

/**
 * Sincroniza TODAS as views afetadas por uma mudança no estado de um
 * jogador: card de perfil (se for o jogador local), lista de jogadores
 * online e ranking — o único lugar com essa sequência.
 * @param {object|null} player - jogador cujo card deve ser atualizado,
 *   se for o jogador local (Game.state.playerName). Passe null para
 *   apenas atualizar as listas compartilhadas (online/ranking), sem
 *   mexer no card de perfil.
 */
function syncPlayerViews(player) {
    if (player && player.name === Game.state.playerName) {
        renderProfileCard(player);
    }
    Game.ui.updatePlayersOnlineList();
    Game.ui.updateRankingList();
}

// ============================================
// EXPORTAÇÃO
// ============================================
window.Game = window.Game || {};
window.Game.ui = window.Game.ui || {};
Object.assign(window.Game.ui, {
    renderProfileCard,
    syncPlayerViews
});