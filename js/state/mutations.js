// ============================================
// PM: The KPI Master - State: Mutations
// ============================================
// Funções de ESCRITA no estado. Recebem os dados a mutar por parâmetro,
// mantendo a assinatura explícita sobre o que cada função modifica.
// ============================================

/**
 * Reseta todos os jogadores para o início de uma partida
 * (KPI zero, fase inicial, recursos iniciais, sai do estado "aguardando no lobby").
 * @param {Array} players - Game.state.players (mutado in-place)
 * @param {object} config - CONFIG (usa config.FOCUS_AREAS, config.STARTING_RESOURCES)
 */
function resetAllPlayers(players, config) {
    players.forEach(p => {
        p.kpi = 0;
        p.focusArea = config.FOCUS_AREAS[0].id;
        p.activities = 0;
        p.waitingInLobby = false;
        p.resources = config.STARTING_RESOURCES;
    });
}

/**
 * Reseta o estado da partida (mantém a sala e os jogadores).
 * @param {object} state - Game.state (mutado in-place)
 * @param {object} config - CONFIG (usa config.GAME.SESSION_DURATION)
 */
function resetGameState(state, config) {
    state.gameStarted = false;
    state.gameOver = false;
    state.currentRound = null;
    state.answeredThisRound = [];
    state.timer = config.GAME.SESSION_DURATION;
    clearInterval(state.timerInterval);
    state.timerInterval = null;
    // Uma pausa por falta de conexão não sobrevive ao fim da
    // partida — senão a primeira reconexão da partida seguinte poderia
    // "retomar" uma rodada antiga (ver turnEngine.resumePausedMatch()).
    state.matchPaused = null;
    // Idem para o aviso de "rodada encerrada, aguardando o
    // host" (ver turnEngine.nextTurn()).
    state.roundEnded = false;
    // O ranking da partida anterior não sobra para a próxima.
    state.finalRanking = null;
}

/**
 * Remove da lista os jogadores marcados como desconectados.
 * Usada ao voltar ao lobby — fora de partida, quem não está conectado
 * não ocupa vaga nem conta para o mínimo de jogadores (quem voltar
 * depois entra de novo como qualquer jogador novo). Nunca remove o
 * próprio jogador desta tela (`state.playerName`). Se o backup da
 * migração de host saiu, escolhe o próximo guest da lista.
 * @param {object} state - Game.state (mutado in-place)
 * @returns {Array<string>} nomes dos jogadores removidos
 */
function removeDisconnectedPlayers(state) {
    const removed = state.players.filter(p => p.disconnected && p.name !== state.playerName);
    if (removed.length === 0) return [];

    state.players = state.players.filter(p => !removed.includes(p));

    if (removed.some(p => p.peerId === state.backupPeerId)) {
        const nextBackup = state.players.find(p => !p.isHost);
        state.backupPeerId = nextBackup ? nextBackup.peerId : '';
    }

    return removed.map(p => p.name);
}

// ============================================
// EXPORTAÇÃO
// ============================================
window.Game = window.Game || {};
window.Game.mutations = {
    resetAllPlayers,
    resetGameState,
    removeDisconnectedPlayers
};