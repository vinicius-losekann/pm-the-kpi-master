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

    // Quantas vezes cada jogador (por nome) já foi Respondedor na partida
    // atual. Substitui a antiga usedRespondedorThisRound: em vez de marcar
    // "já jogou neste ciclo" e depender de resets pontuais (fim de ciclo,
    // recursão em pickNewPair, migração de host), pickNewPair() sempre
    // escolhe entre quem tem o MENOR valor aqui. Sincronizado via
    // broadcast a cada rodada (ver 'round-start' em game-network.js) para
    // sobreviver a uma migração de host.
    respostasCount: {},

    // Ofertas de venda pendentes, uma por vendedor (vendedorName ->
    // compradorName). Sincronizado entre todos os clientes via
    // 'venda-oferta-sync' — não só no host — para que sobreviva a uma
    // migração de host ou a um F5 no meio de uma oferta em aberto (mesma
    // classe de problema já resolvida para respostasCount).
    pendingVendaOfertas: {},

    // Timeout de segurança da OFERTA DE VENDA pendente, indexado por nome
    // do vendedor. Diferente de respostaTimeout/assessoriaTimeout (que só
    // existem para 1 rodada por vez), pode haver mais de uma oferta de
    // venda pendente simultaneamente (uma por vendedor), então cada uma
    // tem seu próprio timeout independente.
    vendaOfertaTimeouts: {},

    // BUGFIX (perda de progresso ao reconectar): quando a conexão de um
    // guest cai (queda de rede, F5), o HOST não remove mais o jogador
    // imediatamente de `players` — em vez disso marca `disconnected: true`
    // e concede um período de graça (ver armarDisconnectTimeout em
    // game-network.js) para ele reconectar sem perder KPI/fase/recursos.
    // disconnectTimeouts guarda, por NOME de jogador (não por peerId — o
    // guest recebe um peerId novo a cada reconexão), o timeout que
    // efetivamente o remove da sala caso ele não volte a tempo.
    disconnectTimeouts: {},
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

/**
 * BUGFIX: passa a excluir também jogadores marcados como `disconnected`
 * (ver disconnectTimeouts acima). Durante o período de graça de
 * reconexão, o jogador continua em `gameState.players` (para não perder
 * KPI/fase/recursos), mas não deve ser elegível para sorteio de
 * perguntador/respondedor, assessor, comprador, nem contar para o mínimo
 * de jogadores — exatamente o mesmo tratamento já dado a waitingInLobby.
 */
function getActivePlayers() {
    return gameState.players.filter(p => !p.waitingInLobby && !p.disconnected);
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

/**
 * BUGFIX: a limpeza de respostaTimeout/assessoriaTimeout ficava espalhada
 * em cada chamador (endMatch, endGame etc.), exigindo que quem chamasse
 * resetGameState() lembrasse de limpar os timeouts ANTES. Se algum novo
 * caminho de código chamasse resetGameState() sem essa limpeza prévia, um
 * timeout órfão de uma partida anterior podia disparar depois (ex.:
 * handleAnswer/handleAssessoriaAnswer rodando sobre um currentRound já
 * nulo). Agora a limpeza é centralizada aqui, junto do reset do estado.
 */
function resetGameState() {
    gameState.gameStarted = false;
    gameState.gameOver = false;
    gameState.currentRound = null;
    gameState.respostasCount = {};
    gameState.timer = CONFIG.JOGO.SESSION_DURATION;
    clearInterval(gameState.timerInterval);
    gameState.timerInterval = null;

    if (gameState.respostaTimeout) {
        clearTimeout(gameState.respostaTimeout);
        gameState.respostaTimeout = null;
    }
    if (gameState.assessoriaTimeout) {
        clearTimeout(gameState.assessoriaTimeout);
        gameState.assessoriaTimeout = null;
    }
    // Limpa todos os timeouts de oferta de venda pendentes.
    Object.values(gameState.vendaOfertaTimeouts || {}).forEach(t => clearTimeout(t));
    gameState.vendaOfertaTimeouts = {};

    // Limpa ofertas de venda pendentes entre partidas — sem isso, uma
    // oferta nunca respondida na partida anterior continuaria válida (e
    // executável) já na partida seguinte, mesmo após "Encerrar Partida".
    gameState.pendingVendaOfertas = {};
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