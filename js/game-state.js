// ============================================
// PM: The KPI Master - ESTADO DO JOGO
// ============================================
// Responsabilidades:
//   - Define o objeto gameState (fonte da verdade)
//   - Exporta helpers para acessar/manipular o estado
//   - NÃO contém lógica de UI, rede ou regras
//
// Dependências: CONFIG (game-config.js)
//
// Namespace: Game.state (estado), Game.helpers (funções)
// ============================================

// --- Estado Central (única fonte da verdade) ---
const gameState = {
    // Conexão
    isHost: false,              // true = criou a sala
    roomName: '',               // nome da sala
    playerName: '',             // nome deste jogador
    peerId: '',                 // ID PeerJS deste jogador
    hostPeerId: '',             // ID PeerJS do host
    backupPeerId: '',           // ID do 2º jogador (assume se host cair)

    // Jogadores
    players: [],                // Array de { name, peerId, kpi, phase, activities, isHost, waitingInLobby }

    // Partida atual
    currentRound: null,         // { evento, perguntador, respondedor, pergunta, respondeu }
    baralhos: {},               // Controle de perguntas já usadas por área
    timer: 7200,                // Segundos restantes (120 min)
    timerInterval: null,        // Referência do setInterval

    // Status
    gameStarted: false,         // Partida em andamento?
    gameOver: false,            // Partida encerrada?
    questionsData: null,        // Dados carregados do JSON
    usedRespondedorThisRound: [], // Jogadores que já responderam nesta rodada
};

// --- Helpers de Acesso ao Estado ---

/**
 * Busca uma fase pelo ID
 * @param {string} id - Ex: 'iniciacao', 'planejamento'
 * @returns {object} Objeto da fase { id, nome, emoji }
 */
function getFaseById(id) {
    return CONFIG.FASES.find(f => f.id === id) || CONFIG.FASES[0];
}

/**
 * Retorna o índice da fase no array (para progressão)
 * @param {string} id - ID da fase
 * @returns {number} Índice (0-4)
 */
function getFaseIndex(id) {
    return CONFIG.FASES.findIndex(f => f.id === id);
}

/**
 * Busca um jogador pelo nome
 * @param {string} name - Nome do jogador
 * @returns {object|undefined} Objeto do jogador
 */
function getPlayerByName(name) {
    return gameState.players.find(p => p.name === name);
}

/**
 * Retorna apenas jogadores ativos (não estão no lobby esperando)
 * @returns {array} Jogadores filtrados
 */
function getActivePlayers() {
    return gameState.players.filter(p => !p.waitingInLobby);
}

/**
 * Zera KPI, fase e atividades de todos os jogadores
 * Usado ao encerrar uma partida
 */
function resetAllPlayers() {
    gameState.players.forEach(p => {
        p.kpi = 0;
        p.phase = CONFIG.FASES[0].id;
        p.activities = 0;
        p.waitingInLobby = false;
    });
}

/**
 * Reseta o estado da partida (timer, rodada, flags)
 * Mantém os jogadores na sala
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

// --- Exportação para o namespace global ---
window.Game = window.Game || {};
window.Game.state = gameState;
window.Game.getFaseById = getFaseById;
window.Game.getFaseIndex = getFaseIndex;
window.Game.getPlayerByName = getPlayerByName;
window.Game.getActivePlayers = getActivePlayers;
window.Game.resetAllPlayers = resetAllPlayers;
window.Game.resetGameState = resetGameState;