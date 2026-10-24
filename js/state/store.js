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
    peerId: '',                  // uid deste aparelho (login anônimo)
    players: [],
    currentRound: null,
    decks: {},
    timer: CONFIG.GAME.SESSION_DURATION, // segundos que faltam (só para a tela)
    endsAt: null,                // hora de término da partida, em hora do servidor (ms)
    timerInterval: null,
    gameStarted: false,
    gameOver: false,
    finalRanking: null,          // ranking do fim da partida (F5 e volta na tela final)
    questionsData: null,
    answeredThisRound: [],
    roundNumber: 0,              // número da rodada na partida (sobe no "Nova Rodada"; o guest guarda o do round-start)
    roundEvent: null,            // host: evento da rodada, para as trocas de dupla dentro dela
    heldPairs: [],               // host: duplas guardadas até o fim da rodada (quem estava nela caiu), com a pergunta e o gabarito
    lastPairId: 0,               // host: último número de dupla dado (pairId, contra resposta atrasada)
    waitingFor: [],              // quem a rodada espera voltar para fechar (host e guest; vazio = sem espera)
    // Campos para timeouts (não persistidos)
    answerTimeout: null,
    advisoryTimeout: null,
};

// ============================================
// EXPORTAÇÃO
// ============================================
window.Game = window.Game || {};
window.Game.state = gameState;

// --- Atalhos (ver nota no topo do arquivo) ---
window.Game.getFocusAreaById = (id) => Game.selectors.getFocusAreaById(CONFIG.FOCUS_AREAS, id);
window.Game.getFocusAreaIndex = (id) => Game.selectors.getFocusAreaIndex(CONFIG.FOCUS_AREAS, id);
window.Game.getPlayerByName = (name) => Game.selectors.getPlayerByName(Game.state.players, name);
window.Game.getActivePlayers = () => Game.selectors.getActivePlayers(Game.state.players);
window.Game.resetAllPlayers = () => Game.mutations.resetAllPlayers(Game.state.players, CONFIG);
window.Game.resetGameState = () => Game.mutations.resetGameState(Game.state, CONFIG);