// ============================================
// PM: The KPI Master - Orquestrador Principal
// ============================================
// Responsabilidades:
//   - Inicializar o jogo na ordem correta (DOM, perguntas, login
//     anônimo, sala pelo Firebase)
//   - Retomar partida após recarregar a página (F5) — a lógica fica em
//     engine/sessionEngine.js (resumeMatchAfterReload)
//   - Ponto de entrada único (DOMContentLoaded)
//
// Estado salvo: js/utils/persistence.js. loadQuestions() busca
// data/questions.pt-BR.json + data/events.json e monta a forma
// {domains, events} usada por domain/deckRules.js e
// domain/eventRules.js. As chaves do JSON de perguntas são em inglês
// (domains/name/focusAreas/questions/question/alternatives/correct): o
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
 * (eventos) via fetch, remontando o mesmo formato {domains, events}
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
            events: eventsJson.events || []
        };
        console.log('✅ questions.pt-BR.json e events.json carregados!');
    } catch (err) {
        console.warn('⚠️ Fetch falhou:', err.message);
        console.error('❌ Nenhuma fonte de perguntas!');
        state.questionsData = { domains: {}, events: [] };
    }

    // Inicializa os baralhos, preservando progresso se já existir
    const decksRestored = state.decks && Object.keys(state.decks).length > 0;
    if (!decksRestored) {
        for (const [key, domain] of Object.entries(state.questionsData.domains || {})) {
            state.decks[key] = {
                questions: domain.questions.map(question => ({ ...question, used: false })),
                available: domain.questions.length,
                total: domain.questions.length
            };
        }
    }

    const domains = Object.keys(state.questionsData.domains || {});
    console.log('📚 Domínios carregados:', domains.length);
}

// ============================================
// SALA
// ============================================

/**
 * Login anônimo e abertura da sala (o papel, host ou guest, vem do
 * banco). Login que falha ou sala recusada (não existe, outra versão,
 * aberta em outra aba): avisa e não segue.
 */
async function connectToRoom(restored) {
    const state = Game.state;
    let login;
    try {
        if (typeof firebase === 'undefined' || !CONFIG.FIREBASE) throw new Error('Firebase indisponível');
        login = await Game.network.firebaseLogin.start({ firebase, config: CONFIG.FIREBASE, emulator: CONFIG.FIREBASE_EMULATOR });
    } catch (err) {
        console.error('❌ Não foi possível fazer o login anônimo:', err);
        Game.ui.updateConnectionStatus('error', Game.i18n.t('connection.couldNotConnect'));
        return;
    }

    let opened;
    try {
        opened = await Game.network.openRoom({
            db: login.db,
            uid: login.uid,
            code: state.roomName,
            now: login.serverNow,
            timestamp: login.timestamp,
            onOpen: () => showRoom(restored)
        });
    } catch (err) {
        console.error('❌ Não foi possível abrir a sala:', err);
        Game.ui.updateConnectionStatus('error', Game.i18n.t('connection.error'));
        return;
    }
    if (!opened.ok) {
        Game.network.handleJoinRejected(opened.reason === 'invalid-code' ? 'room-not-found' : opened.reason);
    }
}

/**
 * Sala aberta: monta a tela pelo papel e, depois de um F5, volta ao
 * ponto em que estava. Roda antes de qualquer pedido ou aviso da sala.
 */
function showRoom(restored) {
    const state = Game.state;
    console.log('👑 Host:', state.isHost);
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
}

// ============================================
// INICIALIZAÇÃO PRINCIPAL
// ============================================

/**
 * Ponto de entrada do jogo.
 * Ordem: ler URL (game.html?room=<código>&playerName=<nome>) → restaurar
 * estado → carregar perguntas → login e sala → configurar UI.
 */
async function init() {
    console.log('🎯 PM: The KPI Master - Inicializando...');
    console.log('📋 Módulos:', Object.keys(Game));

    const params = new URLSearchParams(window.location.search);
    const state = Game.state;
    state.roomName = params.get('room') || '';
    state.playerName = params.get('playerName') || 'Jogador';

    console.log('🎮 Jogador:', state.playerName);
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
    await connectToRoom(restored);

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