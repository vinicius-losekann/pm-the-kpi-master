// ============================================
// PM: The KPI Master - State: Store
// ============================================
// Define o objeto `gameState` (fonte da verdade / Game.state).
// Fase 2.1 do roadmap. Substitui js/game-state.js.
//
// ⚠️ Compatibilidade: os demais módulos (game-core.js, game-ui.js,
// game-network.js, main.js) ainda chamam Game.getPlayerByName(),
// Game.getActivePlayers(), Game.resetAllPlayers(), etc. diretamente.
// Em vez de caçar e trocar todas essas chamadas agora, mantemos aqui
// wrappers finos que delegam para Game.selectors / Game.mutations
// (state/selectors.js e state/mutations.js). Esses wrappers serão
// removidos gradualmente conforme cada consumidor for migrado nas
// próximas fases (engine/, ui/, network/).
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
    rankingFinal: null,          // ranking do fim da partida (BUG-021: F5 e volta na tela final)
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
// network/hostSearch.js desde a Fase D3c — a tela inicial também usa.

// --- Wrappers de compatibilidade (ver nota no topo do arquivo) ---
window.Game.getFaseById = (id) => Game.selectors.getFaseById(CONFIG.FASES, id);
window.Game.getFaseIndex = (id) => Game.selectors.getFaseIndex(CONFIG.FASES, id);
window.Game.getPlayerByName = (name) => Game.selectors.getPlayerByName(Game.state.players, name);
window.Game.getActivePlayers = () => Game.selectors.getActivePlayers(Game.state.players);
window.Game.resetAllPlayers = () => Game.mutations.resetAllPlayers(Game.state.players, CONFIG);
window.Game.resetGameState = () => Game.mutations.resetGameState(Game.state, CONFIG);