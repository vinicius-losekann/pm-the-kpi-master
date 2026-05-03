// ============================================
// PM: The KPI Master - ORQUESTRADOR PRINCIPAL
// ============================================
// Responsabilidades:
//   - Inicializar o jogo na ordem correta
//   - Carregar perguntas (fetch ou fallback)
//   - Salvar/carregar estado no localStorage
//   - Ponto de entrada único (DOMContentLoaded)
//
// Dependências: Todos os módulos Game.*
// Carregado por ÚLTIMO no HTML
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
        console.log('📚 Carregando questions.json via fetch...');
        const response = await fetch('data/questions.json');  // Caminho ajustado
        if (!response.ok) throw new Error('HTTP ' + response.status);
        state.questionsData = await response.json();
        console.log('✅ questions.json carregado!');
    } catch (err) {
        console.warn('⚠️ Fetch falhou:', err.message);

        // Fallback para desenvolvimento local
        if (typeof FALLBACK_QUESTIONS !== 'undefined') {
            console.log('📦 Usando questions-fallback.js (teste local)');
            state.questionsData = FALLBACK_QUESTIONS;
        } else {
            console.error('❌ Nenhuma fonte de perguntas!');
            state.questionsData = { areas: {}, eventos: [] };
        }
    }

    // Inicializa baralhos
    const areas = Object.keys(state.questionsData.areas || {});
    console.log('📚 Áreas carregadas:', areas.length);

    for (const [key, area] of Object.entries(state.questionsData.areas || {})) {
        state.baralhos[key] = {
            perguntas: area.perguntas.map(p => ({ ...p, usada: false })),
            disponiveis: area.perguntas.length,
            total: area.perguntas.length
        };
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
        roomName: state.roomName,
        players: state.players,
        currentRound: state.currentRound,
        baralhos: state.baralhos,
        timer: state.timer,
        gameStarted: state.gameStarted,
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
        const state = JSON.parse(savedState);
        const myData = JSON.parse(savedMyData);

        // Verifica se o estado é recente (< 5 minutos)
        const timestamp = new Date(state.timestamp);
        const now = new Date();
        if (now - timestamp > 5 * 60 * 1000) {
            console.log('💾 Estado salvo expirou.');
            return false;
        }

        console.log('💾 Estado restaurado do localStorage');
        Game.state.hostPeerId = state.hostPeerId;
        Game.state.backupPeerId = state.backupPeerId;
        Game.state.roomName = state.roomName;
        Game.state.players = state.players;
        Game.state.timer = state.timer;
        Game.state.gameStarted = state.gameStarted;

        // Dados do próprio jogador
        const me = Game.getPlayerByName(myData.playerName);
        if (me) {
            me.kpi = myData.kpi;
            me.phase = myData.phase;
            me.activities = myData.activities;
        }

        return true;
    } catch (e) {
        console.warn('⚠️ Estado salvo corrompido.');
        return false;
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
    console.log('🎯 PM: The KPI Master - Inicializando...');
    console.log('📋 Módulos:', Object.keys(Game));

    // 1. Lê parâmetros da URL
    const params = new URLSearchParams(window.location.search);
    const state = Game.state;
    state.isHost = params.get('host') === 'true';
    state.roomName = params.get('room') || 'Sala';
    state.playerName = params.get('playerName') || 'Jogador';
    state.hostPeerId = params.get('peerId') || '';

    console.log('🎮 Jogador:', state.playerName);
    console.log('👑 Host:', state.isHost);
    console.log('🏠 Sala:', state.roomName);

    // 2. UI inicial
    document.getElementById('lobbyRoomName').textContent = state.roomName;
    document.getElementById('myName').textContent = state.playerName;
    document.getElementById('myAvatar').textContent = state.playerName.charAt(0).toUpperCase();
    document.getElementById('myActivityTotal').textContent = CONFIG.JOGO.ACTIVITIES_PER_PHASE;
    document.getElementById('phasesList').innerHTML = CONFIG.FASES.map(f =>
        `<div class="phase-item" data-phase="${f.id}">${f.emoji} ${f.nome}</div>`
    ).join('');

    // 3. Tenta restaurar estado (não usado nesta versão, preparado para V2)
    tryRestoreState();

    // 4. Carrega perguntas
    await loadQuestions();

    // 5. Inicializa PeerJS
    await Game.network.initPeer();

    // 6. Configura UI
    Game.ui.setupUI();

    // 7. Salva estado inicial
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
// INICIALIZA AO CARREGAR A PÁGINA
// ============================================
document.addEventListener('DOMContentLoaded', () => {
    console.log('🚀 DOM carregado, iniciando jogo...');
    Game.init();
});