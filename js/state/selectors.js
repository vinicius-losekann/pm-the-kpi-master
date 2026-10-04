// ============================================
// PM: The KPI Master - State: Selectors
// ============================================
// Funções PURAS de leitura do estado. Recebem os dados por parâmetro
// (nada de acessar Game.state internamente) para serem testáveis
// isoladamente e reutilizáveis fora do namespace Game.
// ============================================

/**
 * Retorna a fase (objeto CONFIG.FASES[i]) correspondente ao id informado.
 * Se não encontrar, retorna a primeira fase como fallback.
 */
function getFaseById(fases, id) {
    return fases.find(f => f.id === id) || fases[0];
}

/**
 * Retorna o índice da fase correspondente ao id informado (-1 se não existir).
 */
function getFaseIndex(fases, id) {
    return fases.findIndex(f => f.id === id);
}

/**
 * Busca um jogador pelo nome.
 */
function getPlayerByName(players, name) {
    return players.find(p => p.name === name);
}

/**
 * Retorna os jogadores ativos na partida: não estão aguardando no lobby
 * e estão conectados. Desconectados no meio da partida
 * continuam na lista com `disconnected: true`, mas ficam fora do
 * sorteio de dupla, dos efeitos de evento, do rodízio da rodada e das
 * listas de assessoria/ajuda.
 */
function getActivePlayers(players) {
    return players.filter(p => !p.waitingInLobby && !p.disconnected);
}

/**
 * Retorna quem faz parte da partida, conectado ou não (só exclui quem
 * saiu para o lobby). Usado para decidir entre pausar e encerrar a
 * partida e para a lista de jogadores da tela de jogo.
 */
function getMatchPlayers(players) {
    return players.filter(p => !p.waitingInLobby);
}

/**
 * Verifica se o ciclo da rodada vigente terminou — ou seja, se TODOS os
 * jogadores ativos já passaram por `usedRespondedorThisRound`, não
 * importa se são 2, 6 ou qualquer outra quantidade (não há número
 * fixo, é sempre relativo à lista de ativos no momento).
 * @param {Array} activePlayers - Game.getActivePlayers()
 * @param {Array<string>} usedRespondedorThisRound - Game.state.usedRespondedorThisRound
 */
function isCycleComplete(activePlayers, usedRespondedorThisRound) {
    return activePlayers.length > 0 &&
        activePlayers.every(p => usedRespondedorThisRound.includes(p.name));
}

// ============================================
// EXPORTAÇÃO
// ============================================
window.Game = window.Game || {};
window.Game.selectors = {
    getFaseById,
    getFaseIndex,
    getPlayerByName,
    getActivePlayers,
    getMatchPlayers,
    isCycleComplete
};