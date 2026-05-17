// ============================================
// PM: The KPI Master - ESTADO DO JOGO (V2)
// ============================================
// Responsabilidades:
//   - Define o objeto gameState (fonte da verdade)
//   - Exporta helpers para acessar/manipular o estado
//
// Namespace: Game.state, Game.helpers
// ============================================

const gameState = {
    isHost: false,
    roomName: '',
    playerName: '',
    peerId: '',
    hostPeerId: '',
    backupPeerId: '',

    // Jogadores: { name, peerId, kpi, phase, activities, isHost, waitingInLobby, recursos }
    players: [],

    currentRound: null,
    baralhos: {},
    timer: CONFIG.JOGO.SESSION_DURATION,
    timerInterval: null,

    gameStarted: false,
    gameOver: false,
    questionsData: null,
    usedRespondedorThisRound: [],
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

function resetAllPlayers() {
    gameState.players.forEach(p => {
        p.kpi = 0;
        p.phase = CONFIG.FASES[0].id;
        p.activities = 0;
        p.waitingInLobby = false;
        p.recursos = CONFIG.RECURSOS_INICIAIS;
    });
}

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