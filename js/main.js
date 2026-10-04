// ============================================
// PM: The KPI Master - Orquestrador Principal
// ============================================
// Responsabilidades:
//   - Inicializar o jogo na ordem correta (DOM, perguntas, PeerJS)
//   - Retomar partida após recarregar a página (F5) — a lógica fica em
//     engine/sessionEngine.js (resumeMatchAfterReload)
//   - Ponto de entrada único (DOMContentLoaded)
//
// Estado salvo: js/utils/persistence.js. loadQuestions() busca
// data/questions.pt-BR.json + data/events.json e monta a forma
// {domains, eventos} usada por domain/deckRules.js e
// domain/eventRules.js. As chaves do JSON de perguntas são em inglês
// (domains/name/areas/questions/question/alternatives/correct): o
// formato fica independente do idioma do conteúdo.
// ============================================

// ============================================
// EXPORTAÇÃO / SETUP INICIAL DO NAMESPACE
// ============================================
window.Game = window.Game || {};

// ============================================
// CARREGAR PERGUNTAS
// ============================================

/**
 * Carrega data/questions.pt-BR.json (perguntas) e data/events.json
 * (eventos) via fetch, remontando o mesmo formato {domains, eventos}
 * que o resto do código espera. Em caso de falha, segue sem perguntas
 * (o erro fica no console).
 */
async function loadQuestions() {
    const state = Game.state;

    try {
        console.log('📚 Carregando questions.pt-BR.json e events.json via fetch...');
        const [questionsRes, eventsRes] = await Promise.all([
            fetch('data/questions.pt-BR.json'),
            fetch('data/events.json')
        ]);
        if (!questionsRes.ok) throw new Error('HTTP ' + questionsRes.status + ' (questions.pt-BR.json)');
        if (!eventsRes.ok) throw new Error('HTTP ' + eventsRes.status + ' (events.json)');

        const questionsJson = await questionsRes.json();
        const eventsJson = await eventsRes.json();

        state.questionsData = {
            domains: questionsJson.domains || {},
            eventos: eventsJson.eventos || []
        };
        console.log('✅ questions.pt-BR.json e events.json carregados!');
    } catch (err) {
        console.warn('⚠️ Fetch falhou:', err.message);
        console.error('❌ Nenhuma fonte de perguntas!');
        state.questionsData = { domains: {}, eventos: [] };
    }

    // Inicializa os baralhos, preservando progresso se já existir
    const decksRestored = state.baralhos && Object.keys(state.baralhos).length > 0;
    if (!decksRestored) {
        for (const [key, domain] of Object.entries(state.questionsData.domains || {})) {
            state.baralhos[key] = {
                perguntas: domain.questions.map(question => ({ ...question, usada: false })),
                disponiveis: domain.questions.length,
                total: domain.questions.length
            };
        }
    }

    const domains = Object.keys(state.questionsData.domains || {});
    console.log('📚 Domínios carregados:', domains.length);
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
                Game.ui.updateConnectionStatus('error', Game.i18n.t('connection.naoFoiPossivelConectar'));
                throw err;
            }

            Game.ui.updateConnectionStatus('disconnected', Game.i18n.t('connection.reconectando', { attempt, max: maxAttempts }));
            await new Promise(res => setTimeout(res, delayMs));
        }
    }
}

// ============================================
// INICIALIZAÇÃO PRINCIPAL
// ============================================

/**
 * Ponto de entrada do jogo.
 * Ordem: ler URL → restaurar estado → carregar perguntas → (host com
 * sessão restaurada: conferir se outro assumiu) → iniciar PeerJS →
 * configurar UI.
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
    // A lista de fases é desenhada por Game.ui.renderProfileCard(), com
    // o status de cada fase, toda vez que o estado do jogador muda (via
    // syncPlayerViews()).

    const restored = Game.persistence.tryRestoreState();

    await loadQuestions();

    // Host recarregando uma sessão salva — antes de reabrir o
    // ID de host, confere se outro jogador já assumiu a sala enquanto ele
    // estava fora (o backup assume depois de CONFIG.JOGO.HOST_TIMEOUT).
    // Se sim, volta como jogador comum (isHost passa a false e a URL a
    // host=false) e o initPeerWithRetry() abaixo já conecta como guest.
    if (restored && state.isHost) {
        await Game.network.rejoinAsPlayerIfTakenOver();
    }

    try {
        await initPeerWithRetry();
    } catch (err) {
        console.error('❌ Não foi possível estabelecer conexão P2P:', err);
        return;
    }

    Game.ui.setupUI();

    // A retomada do host (o que fazer conforme o momento da
    // partida em que o F5 aconteceu) fica em engine/sessionEngine.js.
    // F5 na tela final volta à tela final (host e guest).
    if (restored && state.gameStarted && state.gameOver) {
        Game.core.showGameOver();
    } else if (restored && state.gameStarted) {
        if (state.isHost) {
            Game.core.resumeMatchAfterReload();
        } else {
            Game.ui.showScreen('game');
            Game.ui.updateTimerDisplay();
            Game.ui.updatePlayersOnlineList();
            Game.ui.updateRankingList();
        }
    }

    Game.saveState();

    console.log('✅ Jogo inicializado!');
    console.log('💡 Debug: Game.debug está disponível no console (F12)');
}

// ============================================
// EXPORTAÇÃO
// ============================================
window.Game.init = init;
window.Game.loadQuestions = loadQuestions;

// ============================================
// INICIALIZAÇÃO AUTOMÁTICA
// ============================================
document.addEventListener('DOMContentLoaded', () => {
    console.log('🚀 DOM carregado, iniciando jogo...');
    Game.init();
});