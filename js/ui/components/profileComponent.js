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
 * @param {object} player - objeto com { kpi, recursos, phase, activities }
 *   (pode ser um jogador de Game.state.players ou um payload de mensagem
 *   de rede com os mesmos campos)
 */
function renderProfileCard(player) {
    if (!player) return;

    document.getElementById('myKPI').textContent = player.kpi;

    // recursos é opcional em alguns payloads (ex: bônus de assessoria isolado)
    if (player.recursos !== undefined) {
        document.getElementById('myRecursos').textContent = player.recursos;

        // Botão "Pedir Ajuda" só aparece quando o jogador está
        // com 0 recursos — rede de segurança, não mercado livre (ver
        // engine/tradeEngine.js e _docs/architecture.md). Atualizado sempre
        // que os recursos mudam, via syncPlayerViews().
        const btnPedirAjuda = document.getElementById('btnPedirAjuda');
        if (btnPedirAjuda) {
            btnPedirAjuda.style.display = player.recursos <= 0 ? 'block' : 'none';
        }
    }

    // fase/atividades também são opcionais nalguns payloads, mesmo
    // padrão do bloco de recursos acima.
    if (player.phase !== undefined && player.activities !== undefined) {
        renderPhasesList(player);
    }
}

/**
 * Desenha a lista de fases com o status de cada uma: completa (fase já
 * ultrapassada), em andamento (fase atual, mostra X de N atividades) ou
 * não iniciada. Como a progressão é sempre linear, dá pra derivar o
 * status de TODAS as fases só com a fase atual + atividades.
 */
function renderPhasesList(player) {
    const currentIdx = Game.getFaseIndex(player.phase);
    const total = CONFIG.JOGO.ACTIVITIES_PER_PHASE;

    const html = CONFIG.FASES.map((fase, idx) => {
        let statusClass = '';
        let statusText;

        if (idx < currentIdx) {
            statusClass = 'phase-completed';
            statusText = '✅';
        } else if (idx === currentIdx) {
            statusClass = 'phase-current';
            statusText = player.activities + ' de ' + total;
        } else {
            statusText = '0 de ' + total;
        }

        return '<div class="phase-item ' + statusClass + '" data-phase="' + fase.id + '">' +
            '<span>' + fase.emoji + ' ' + fase.nome + '</span>' +
            '<span class="phase-status">' + statusText + '</span>' +
            '</div>';
    }).join('');

    document.getElementById('phasesList').innerHTML = html;
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