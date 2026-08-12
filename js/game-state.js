// ============================================
// PM: The KPI Master - Estado do Jogo
// ============================================
// Define o objeto `gameState` (fonte da verdade) e helpers para manipulá-lo.
// ============================================

const gameState = {
    isHost: false,
    roomName: '',
    playerName: '',
    peerId: '',
    hostPeerId: '',
    backupPeerId: '',
    baseRoomPeerId: '',          // ID base da sala (nunca muda)
    hostVersion: 0,              // Número de migrações de host
    players: [],
    currentRound: null,
    baralhos: {},
    timer: CONFIG.JOGO.SESSION_DURATION,
    timerInterval: null,
    gameStarted: false,
    gameOver: false,
    questionsData: null,
    usedRespondedorThisRound: [],
    // Campos para timeouts (não persistidos)
    respostaTimeout: null,
    assessoriaTimeout: null,
};

// --- Helpers ---

function getFaseById(id) {
    return CONFIG.FASES.find(f => f.id === id) || CONFIG.FASES[0];
}

function getFaseIndex(id) {
    return CONFIG.FASES.findIndex(f => f.id === id);
}

function getPlayerByName(name) {
    return gameState.players.find(p => p.name === name);
}

function getActivePlayers() {
    return gameState.players.filter(p => !p.waitingInLobby);
}

/**
 * Reseta todos os jogadores para o início de uma partida (KPI zero, fase inicial, recursos iniciais).
 */
function resetAllPlayers() {
    gameState.players.forEach(p => {
        p.kpi = 0;
        p.phase = CONFIG.FASES[0].id;
        p.activities = 0;
        p.waitingInLobby = false;
        p.recursos = CONFIG.RECURSOS_INICIAIS;
    });
}

/**
 * Calcula o ID do host para uma determinada versão de migração.
 */
function computeHostPeerId(baseId, version) {
    return version > 0 ? `${baseId}-h${version}` : baseId;
}

/**
 * Reseta o estado da partida (mantém a sala e os jogadores).
 */
function resetGameState() {
    gameState.gameStarted = false;
    gameState.gameOver = false;
    gameState.currentRound = null;
    gameState.usedRespondedorThisRound = [];
    gameState.timer = CONFIG.JOGO.SESSION_DURATION;
    clearInterval(gameState.timerInterval);
    gameState.timerInterval = null;
}

// --- Exportação ---
window.Game = window.Game || {};
window.Game.state = gameState;
window.Game.getFaseById = getFaseById;
window.Game.getFaseIndex = getFaseIndex;
window.Game.getPlayerByName = getPlayerByName;
window.Game.getActivePlayers = getActivePlayers;
window.Game.resetAllPlayers = resetAllPlayers;
window.Game.resetGameState = resetGameState;
window.Game.computeHostPeerId = computeHostPeerId;*/