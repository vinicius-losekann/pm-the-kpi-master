// ============================================
// PM: The KPI Master - ESTADO DO JOGO
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

    // ID "base" da sala (peerId original informado na URL / criado pelo
    // host). NÃO muda durante a partida — ao contrário de hostPeerId, que
    // passa a apontar para o host de backup após uma migração. É a partir
    // dele que qualquer jogador consegue CALCULAR o peerId do próximo
    // host, sem depender de receber uma mensagem de host-changed.
    baseRoomPeerId: '',

    // Quantas migrações de host já ocorreram nesta sessão. O peerId do
    // host atual é sempre computeHostPeerId(baseRoomPeerId, hostVersion).
    hostVersion: 0,

    // Jogadores: { name, peerId, kpi, phase, activities, isHost, waitingInLobby, recursos }
    players: [],

    currentRound: null,
    baralhos: {},
    timer: CONFIG.JOGO.SESSION_DURATION,
    timerInterval: null,

    gameStarted: false,
    gameOver: false,
    questionsData: null,
    // usedRespondedorThisRound: [],
    // Quantas vezes cada jogador (por nome) já foi Respondedor na
    // partida atual. Substitui a antiga usedRespondedorThisRound: em vez
    // de marcar "já jogou neste ciclo" e depender de resets pontuais
    // (fim de ciclo, recursão em pickNewPair, migração de host),
    // pickNewPair() sempre escolhe entre quem tem o MENOR valor aqui.
    // Sincronizado via broadcast a cada rodada (ver 'round-start' em
    // game-network.js) para sobreviver a uma migração de host.
    respostasCount: {},    
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

/**
 * Calcula deterministicamente o peerId de um host para uma dada versão de
 * migração, a partir do peerId base da sala. version 0 = host original.
 * version 1, 2, 3... = 1ª, 2ª, 3ª migração.
 *
 * Isso permite que QUALQUER jogador (não só quem recebeu um broadcast)
 * calcule para onde tentar se conectar quando o host cai, em vez de
 * depender de uma mensagem 'host-changed' que pode nunca chegar (o backup
 * pode estar exatamente resetando suas conexões no momento do broadcast).
 */
function computeHostPeerId(baseId, version) {
    return version > 0 ? `${baseId}-h${version}` : baseId;
}

function resetGameState() {
    gameState.gameStarted = false;
    gameState.gameOver = false;
    gameState.currentRound = null;
    // gameState.usedRespondedorThisRound = [];
    gameState.respostasCount = {};
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
window.Game.computeHostPeerId = computeHostPeerId;