// ============================================
// PM: The KPI Master - Orquestrador Principal
// ============================================
// Responsabilidades:
//   - Inicializar o jogo na ordem correta (DOM, perguntas, PeerJS)
//   - Carregar/salvar estado no localStorage
//   - Retomar partida após recarregar a página (F5)
//   - Ponto de entrada único (DOMContentLoaded)
// ============================================

// ============================================
// CARREGAR PERGUNTAS
// ============================================

/**
 * Carrega o arquivo questions.json via fetch.
 * Em caso de falha, tenta usar um fallback local (se definido).
 */
async function loadQuestions() {
    const state = Game.state;

    try {
        console.log('📚 Carregando questions.json via fetch...');
        const response = await fetch('data/questions.json');
        if (!response.ok) throw new Error('HTTP ' + response.status);
        state.questionsData = await response.json();
        console.log('✅ questions.json carregado!');
    } catch (err) {
        console.warn('⚠️ Fetch falhou:', err.message);
        if (typeof FALLBACK_QUESTIONS !== 'undefined') {
            console.log('📦 Usando questions-fallback.js (teste local)');
            state.questionsData = FALLBACK_QUESTIONS;
        } else {
            console.error('❌ Nenhuma fonte de perguntas!');
            state.questionsData = { areas: {}, eventos: [] };
        }
    }

    // Inicializa os baralhos, preservando progresso se já existir
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

    const areas = Object.keys(state.questionsData.areas || {});
    console.log('📚 Áreas carregadas:', areas.length);
}

// ============================================
// PERSISTÊNCIA (localStorage)
// ============================================

/**
 * Salva o estado completo no localStorage.
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
        usedRespondedorThisRound: state.usedRespondedorThisRound,
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
 * Tenta restaurar o estado salvo no localStorage.
 * Só restaura se pertencer à mesma sala/jogador e tiver menos de 5 minutos.
 * @returns {boolean} true se restaurou com sucesso
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

        const savedBasePeerId = saved.baseRoomPeerId || saved.hostPeerId || '';

        if (saved.roomName !== currentRoom ||
            savedBasePeerId !== currentBasePeerId ||
            myData.playerName !== currentPlayer) {
            console.log('💾 Estado salvo pertence a outra sala/jogador. Ignorando.');
            return false;
        }

        const timestamp = new Date(saved.timestamp);
        const now = new Date();
        if (Number.isNaN(timestamp.getTime()) || now - timestamp > 5 * 60 * 1000) {
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
        Game.state.usedRespondedorThisRound = saved.usedRespondedorThisRound || [];

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
 * Retoma o motor da partida caso o host tenha recarregado a página.
 */
function resumeGameEngineIfHost() {
    const state = Game.state;
    if (!state.isHost || !state.gameStarted || state.gameOver) return;

    console.log('🔁 Retomando motor da partida após reload do host...');

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

    Game.network.broadcastAll({ type: 'player-list', players: state.players });

    if (!state.currentRound) {
        Game.core.pickNewPair();
    } else {
        state.currentRound = null;
        Game.core.pickNewPair();
    }
}

// ============================================
// CONEXÃO COM RETRY
// ============================================

/**
 * Inicia o PeerJS com tentativas de retry (útil após F5 do host).
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
 * Ponto de entrada do jogo.
 * Ordem: ler URL → carregar perguntas → restaurar estado → iniciar PeerJS → configurar UI.
 */
async function init() {
    console.log('🎯 PM: The KPI Master - Inicializando...');
    console.log('📋 Módulos:', Object.keys(Game));

    const params = new URLSearchParams(window.location.search);
    const state = Game.state;
    state.isHost = params.get('host') === 'true';
    state.roomName = params.get('room') || 'Sala';
    state.playerName = params.get('playerName') || 'Jogador';
    state.hostPeerId = params.get('peerId') || '';
    state.baseRoomPeerId = state.hostPeerId;
    state.hostVersion = 0;

    console.log('🎮 Jogador:', state.playerName);
    console.log('👑 Host:', state.isHost);
    console.log('🏠 Sala:', state.roomName);

    // Configuração inicial da UI
    document.getElementById('lobbyRoomName').textContent = state.roomName;
    document.getElementById('myName').textContent = state.playerName;
    document.getElementById('myAvatar').textContent = state.playerName.charAt(0).toUpperCase();
    document.getElementById('myActivityTotal').textContent = CONFIG.JOGO.ACTIVITIES_PER_PHASE;
    document.getElementById('phasesList').innerHTML = CONFIG.FASES.map(f =>
        `<div class="phase-item" data-phase="${f.id}">${f.emoji} ${f.nome}</div>`
    ).join('');

    const restaurou = tryRestoreState();

    await loadQuestions();

    try {
        await initPeerWithRetry();
    } catch (err) {
        console.error('❌ Não foi possível estabelecer conexão P2P:', err);
        return;
    }

    Game.ui.setupUI();

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

    saveState();

    console.log('✅ Jogo inicializado!');
    console.log('💡 Debug: Game.debug está disponível no console (F12)');
}

// ============================================
// EXPORTAÇÃO
// ============================================
window.Game = window.Game || {};
window.Game.init = init;
window.Game.loadQuestions = loadQuestions;
window.Game.saveState = saveState;

// ============================================
// INICIALIZAÇÃO AUTOMÁTICA
// ============================================
document.addEventListener('DOMContentLoaded', () => {
    console.log('🚀 DOM carregado, iniciando jogo...');
    Game.init();
});