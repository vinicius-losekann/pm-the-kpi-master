// ============================================
// PM: The KPI Master - ORQUESTRADOR PRINCIPAL
// ============================================
// Inicializa o jogo, carrega perguntas, gerencia persistência
// no localStorage e é o ponto de entrada único (DOMContentLoaded).
// Depende de todos os módulos Game.* — deve ser carregado por último no HTML.
// ============================================

// ============================================
// CARREGAR PERGUNTAS
// ============================================

/**
 * Carrega perguntas do JSON (fetch no GitHub, fallback local)
 */
async function loadQuestions() {
    const state = Game.state;

    try {
        const response = await fetch('data/questions.json');
        if (!response.ok) throw new Error('HTTP ' + response.status);
        state.questionsData = await response.json();
    } catch (err) {
        console.warn('⚠️ Fetch falhou:', err.message);

        if (typeof FALLBACK_QUESTIONS !== 'undefined') {
            state.questionsData = FALLBACK_QUESTIONS;
        } else {
            console.error('❌ Nenhuma fonte de perguntas!');
            state.questionsData = { areas: {}, eventos: [] };
        }
    }

    // Se um estado restaurado (localStorage) já trouxe baralhos salvos,
    // preserva o progresso de perguntas já usadas em vez de sobrescrever
    // tudo do zero — do contrário, um F5 no meio da partida "destrava"
    // perguntas repetidas indevidamente.
    const baralhosRestaurados = state.baralhos && Object.keys(state.baralhos).length > 0;

    if (!baralhosRestaurados) {
        for (const [key, area] of Object.entries(state.questionsData.areas || {})) {
            state.baralhos[key] = {
                perguntas: area.perguntas.map(p => ({ ...p, usada: false })),
                disponiveis: area.perguntas.length,
                total: area.perguntas.length
            };
        }
    }
}

// ============================================
// PERSISTÊNCIA (localStorage)
// ============================================

/**
 * Salva estado completo no localStorage
 */
function saveState() {
    const state = Game.state;
    localStorage.setItem('pmKPI_roomState', JSON.stringify({
        hostPeerId: state.hostPeerId,
        backupPeerId: state.backupPeerId,
        baseRoomPeerId: state.baseRoomPeerId,
        hostVersion: state.hostVersion,
        roomName: state.roomName,
        players: state.players,
        currentRound: state.currentRound,
        baralhos: state.baralhos,
        timer: state.timer,
        gameStarted: state.gameStarted,
        respostasCount: state.respostasCount,
        pendingVendaOfertas: state.pendingVendaOfertas,
        timestamp: new Date().toISOString()
    }));

    const me = Game.getPlayerByName(state.playerName);
    localStorage.setItem('pmKPI_myData', JSON.stringify({
        playerName: state.playerName,
        kpi: me?.kpi || 0,
        phase: me?.phase || CONFIG.FASES[0].id,
        activities: me?.activities || 0
    }));
}

/**
 * Tenta restaurar estado de uma sessão anterior
 * @returns {boolean} true se restaurou
 */
function tryRestoreState() {
    const savedState = localStorage.getItem('pmKPI_roomState');
    const savedMyData = localStorage.getItem('pmKPI_myData');

    if (!savedState || !savedMyData) return false;

    try {
        const saved = JSON.parse(savedState);
        const myData = JSON.parse(savedMyData);

        const currentParams = new URLSearchParams(window.location.search);
        const currentRoom = currentParams.get('room') || 'Sala';
        const currentPlayer = currentParams.get('playerName') || 'Jogador';
        const currentBasePeerId = currentParams.get('peerId') || '';

        // Não restaura estado de outra sala/jogador.
        const savedBasePeerId = saved.baseRoomPeerId || saved.hostPeerId || '';

        if (
            saved.roomName !== currentRoom ||
            savedBasePeerId !== currentBasePeerId ||
            myData.playerName !== currentPlayer
        ) {
            console.log('💾 Estado salvo pertence a outra sala/jogador. Ignorando.');
            return false;
        }

        // Verifica validade do timestamp (expira em 5 minutos).
        const timestamp = new Date(saved.timestamp);
        const now = new Date();

        if (
            Number.isNaN(timestamp.getTime()) ||
            now - timestamp > 5 * 60 * 1000
        ) {
            console.log('💾 Estado salvo expirou.');
            return false;
        }

        console.log('💾 Estado restaurado do localStorage');

        Game.state.hostPeerId = saved.hostPeerId;
        Game.state.backupPeerId = saved.backupPeerId;
        Game.state.baseRoomPeerId = saved.baseRoomPeerId || saved.hostPeerId;
        Game.state.hostVersion = saved.hostVersion || 0;
        Game.state.roomName = saved.roomName;
        Game.state.players = saved.players || [];
        Game.state.timer = saved.timer ?? CONFIG.JOGO.SESSION_DURATION;
        Game.state.gameStarted = !!saved.gameStarted;
        Game.state.currentRound = saved.currentRound || null;
        Game.state.baralhos = saved.baralhos || {};
        Game.state.respostasCount = saved.respostasCount || {};
        Game.state.pendingVendaOfertas = saved.pendingVendaOfertas || {};

        const me = Game.getPlayerByName(myData.playerName);
        if (me) {
            me.kpi = myData.kpi ?? me.kpi;
            me.phase = myData.phase ?? me.phase;
            me.activities = myData.activities ?? me.activities;
        }

        return true;

    } catch (e) {
        console.warn('⚠️ Estado salvo corrompido. Limpando.');
        localStorage.removeItem('pmKPI_roomState');
        localStorage.removeItem('pmKPI_myData');
        return false;
    }
}

/**
 * Retoma a partida em andamento após um reload (F5) do HOST.
 * Sem isso, um refresh acidental do host mata o setInterval do timer
 * e o fluxo de rodadas para de vez para todos os jogadores conectados.
 */
function resumeGameEngineIfHost() {
    const state = Game.state;
    if (!state.isHost || !state.gameStarted || state.gameOver) return;

    Game.ui.showScreen('game');
    Game.ui.updatePlayersOnlineList();
    Game.ui.updateRankingList();
    Game.ui.updateTimerDisplay();

    clearInterval(state.timerInterval);
    state.timerInterval = setInterval(() => {
        state.timer--;
        Game.ui.updateTimerDisplay();

        if (state.timer % 10 === 0) {
            Game.network.broadcastAll({ type: 'timer-update', remaining: state.timer });
        }

        if (state.timer <= 0) {
            clearInterval(state.timerInterval);
            Game.core.endGame(Game.core.buildRanking());
        }
    }, 1000);

    // Reenvia o player-list atualizado para reconciliar quem já estava
    // conectado (guests vão reconectar sozinhos e receber state-sync).
    Game.network.broadcastAll({ type: 'player-list', players: state.players });

    if (!state.currentRound) {
        // Não havia rodada em aberto no momento do reload — inicia uma nova.
        Game.core.pickNewPair();
    } else {
        // Havia uma rodada em aberto, mas o host reiniciou e perdeu o
        // estado "ao vivo" dela (ex: timers de assessoria). Mais simples
        // e seguro: encerra a rodada atual e sorteia uma nova.
        state.currentRound = null;
        Game.core.pickNewPair();
    }
}

// ============================================
// CONEXÃO COM RETRY
// ============================================

/**
 * Tenta abrir o Peer algumas vezes com backoff. Necessário principalmente
 * para o HOST: ao dar F5, o servidor PeerJS pode levar alguns segundos
 * para liberar o peerId da conexão anterior, e a primeira tentativa falha
 * com 'unavailable-id' mesmo sendo o dono legítimo da sala.
 */
async function initPeerWithRetry(maxAttempts = 4, delayMs = 2000) {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            await Game.network.initPeer();
            return;
        } catch (err) {
            const isLastAttempt = attempt === maxAttempts;
            console.warn(`⚠️ Falha ao iniciar Peer (tentativa ${attempt}/${maxAttempts}):`, err?.message || err);

            if (isLastAttempt) {
                Game.ui.updateConnectionStatus('error', 'Não foi possível conectar. Recarregue a página.');
                throw err;
            }

            Game.ui.updateConnectionStatus('disconnected', `Reconectando (${attempt}/${maxAttempts})...`);
            await new Promise(res => setTimeout(res, delayMs));
        }
    }
}

// ============================================
// INICIALIZAÇÃO PRINCIPAL
// ============================================

/**
 * Ponto de entrada do jogo
 * Ordem: ler URL → carregar perguntas → iniciar PeerJS → setup UI
 */
async function init() {
    // 1. Lê parâmetros da URL
    const params = new URLSearchParams(window.location.search);
    const state = Game.state;
    state.isHost = params.get('host') === 'true';
    state.roomName = params.get('room') || 'Sala';
    state.playerName = params.get('playerName') || 'Jogador';
    state.hostPeerId = params.get('peerId') || '';
    // Base fixa para calcular deterministicamente IDs de host de backup.
    // tryRestoreState() pode sobrescrever com o valor persistido (correto
    // caso já tenha havido uma migração antes deste reload).
    state.baseRoomPeerId = state.hostPeerId;
    state.hostVersion = 0;

    // 2. UI inicial
    document.getElementById('lobbyRoomName').textContent = state.roomName;
    document.getElementById('myName').textContent = state.playerName;
    document.getElementById('myAvatar').textContent = state.playerName.charAt(0).toUpperCase();
    document.getElementById('myActivityTotal').textContent = CONFIG.JOGO.ACTIVITIES_PER_PHASE;
    document.getElementById('phasesList').innerHTML = CONFIG.FASES.map(f =>
        `<div class="phase-item" data-phase="${f.id}">${f.emoji} ${f.nome}</div>`
    ).join('');

    // 3. Tenta restaurar estado de uma sessão anterior
    const restaurou = tryRestoreState();

    // 4. Carrega perguntas
    await loadQuestions();

    // 5. Inicializa PeerJS (com retry — o servidor PeerJS pode manter o
    // peerId anterior "reservado" por alguns segundos após um F5 do host,
    // rejeitando a primeira tentativa com 'unavailable-id')
    try {
        await initPeerWithRetry();
    } catch (err) {
        console.error('❌ Não foi possível estabelecer conexão P2P:', err);
        // Status de erro já está visível na tela (setado por initPeer);
        // interrompe a inicialização em vez de continuar com peer inválido.
        return;
    }

    // 6. Configura UI
    Game.ui.setupUI();

    // 6.1 Se o estado restaurado indica partida em andamento, garante que
    // a tela correta seja exibida (não fica preso no lobby) e, sendo host,
    // retoma o motor da partida (timer + rodadas). Para guests, a tela
    // correta já é resolvida via state-sync/host-changed em game-network.js
    // assim que a conexão com o host for reestabelecida — mas ajustamos
    // aqui também para o caso de reconexão lenta.
    if (restaurou && state.gameStarted && !state.gameOver) {
        if (state.isHost) {
            resumeGameEngineIfHost();
        } else {
            Game.ui.showScreen('game');
            Game.ui.updateTimerDisplay();
            Game.ui.updatePlayersOnlineList();
            Game.ui.updateRankingList();
        }
    }

    // 7. Salva estado inicial
    saveState();
}

// ============================================
// EXPORTAÇÃO
// ============================================
window.Game = window.Game || {};
window.Game.init = init;
window.Game.loadQuestions = loadQuestions;
window.Game.saveState = saveState;

// ============================================
// INICIALIZA AO CARREGAR A PÁGINA
// ============================================
document.addEventListener('DOMContentLoaded', () => {
    Game.init();
});