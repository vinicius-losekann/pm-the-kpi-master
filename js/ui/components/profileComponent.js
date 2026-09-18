// ============================================
// PM: The KPI Master - UI Component: Perfil
// ============================================
// Renderiza o card de perfil do jogador local (KPI, recursos, fase,
// atividades e barra de progresso).
// Fase 5.5 do roadmap.
//
// 🐛 BUG-003 / BUG-007 (ver ISSUES.md): a sequência "atualizar card de
// perfil + lista de jogadores + ranking" estava duplicada manualmente
// em 7 lugares diferentes do código, cada um com uma variação sutil
// (alguns só atualizavam myKPI/myRecursos direto no DOM, sem passar
// por renderProfileCard). Isso já causou dois bugs de tela
// desatualizada por esquecimento de replicar a chamada em algum ponto
// novo. Game.ui.syncPlayerViews() consolida essa sequência num único
// ponto — os 7 lugares agora chamam ela em vez de duplicar a lógica.
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

        // Fase 9: botão "Pedir Ajuda" só aparece quando o jogador está
        // com 0 recursos — rede de segurança, não mercado livre (ver
        // engine/tradeEngine.js e ARCHITECTURE.md). Atualizado sempre
        // que os recursos mudam, via syncPlayerViews().
        const btnPedirAjuda = document.getElementById('btnPedirAjuda');
        if (btnPedirAjuda) {
            btnPedirAjuda.style.display = player.recursos <= 0 ? 'block' : 'none';
        }
    }

    const fase = Game.getFaseById(player.phase);
    document.getElementById('myPhaseName').textContent = fase.nome;
    document.getElementById('myPhaseIcon').textContent = fase.emoji;
    document.getElementById('myActivity').textContent = player.activities;
    document.getElementById('myProgressFill').style.width =
        (player.activities / CONFIG.JOGO.ACTIVITIES_PER_PHASE * 100) + '%';
}

/**
 * Sincroniza TODAS as views afetadas por uma mudança no estado de um
 * jogador: card de perfil (se for o jogador local), lista de jogadores
 * online e ranking. Consolida a sequência que estava duplicada em 7
 * lugares diferentes do código (ver BUG-003 e BUG-007 em ISSUES.md) —
 * cada duplicação era um risco de ficar esquecida num ponto novo.
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