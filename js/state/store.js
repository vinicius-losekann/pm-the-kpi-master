// ============================================
// PM: The KPI Master - State: Store
// ============================================
// Define o objeto `gameState` (fonte da verdade / Game.state).
//
// Atalhos: Game.getPlayerByName(), Game.getActivePlayers(),
// Game.resetAllPlayers() etc. (no fim do arquivo) chamam
// Game.selectors / Game.mutations (state/selectors.js e
// state/mutations.js) já com Game.state e CONFIG. São usados em todo o
// código e ficam — não são compatibilidade temporária.
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
    rankingFinal: null,          // ranking do fim da partida (F5 e volta na tela final)
    questionsData: null,
    usedRespondedorThisRound: [],
    // Campos para timeouts (não persistidos)
    respostaTimeout: null,
    assessoriaTimeout: null,
};

// ============================================
// EXPORTAÇÃO
// ============================================
window.Game = window.Game || {};
window.Game.state = gameState;
// Game.computeHostPeerId (ID do host em cada versão de migração) fica em
// network/hostSearch.js — a tela inicial também usa.

// --- Atalhos (ver nota no topo do arquivo) ---
window.Game.getFocusAreaById = (id) => Game.selectors.getFocusAreaById(CONFIG.FASES, id);
window.Game.getFocusAreaIndex = (id) => Game.selectors.getFocusAreaIndex(CONFIG.FASES, id);
window.Game.getPlayerByName = (name) => Game.selectors.getPlayerByName(Game.state.players, name);
window.Game.getActivePlayers = () => Game.selectors.getActivePlayers(Game.state.players);
window.Game.resetAllPlayers = () => Game.mutations.resetAllPlayers(Game.state.players, CONFIG);
window.Game.resetGameState = () => Game.mutations.resetGameState(Game.state, CONFIG);