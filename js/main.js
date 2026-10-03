// ============================================
// PM: The KPI Master - Orquestrador Principal
// ============================================
// Responsabilidades:
//   - Inicializar o jogo na ordem correta (DOM, perguntas, PeerJS)
//   - Retomar partida após recarregar a página (F5) — a lógica fica em
//     engine/sessionEngine.js (retomarPartidaAposRecarregar, Fase D3f)
//   - Ponto de entrada único (DOMContentLoaded)
//
// Fase 7: saveState()/tryRestoreState() foram extraídos para
// js/utils/persistence.js. Fase 6/7.8: loadQuestions() agora busca
// data/questions.pt-BR.json + data/events.json (antes um único
// data/questions.json), remontando a mesma forma {domains, eventos}
// para não quebrar domain/deckRules.js e domain/eventRules.js.
// Fase 8 (nomenclatura PMBOK 8ª ed.): chaves do JSON de perguntas
// migradas para inglês (domains/name/areas/questions/question/
// alternatives/correct) — schema de dados fica independente do
// idioma do conteúdo, preparando o terreno para questions.en-US.json.
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
 * que o resto do código espera. Em caso de falha, tenta usar um
 * fallback local (se definido).
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
        if (typeof FALLBACK_QUESTIONS !== 'undefined') {
            console.log('📦 Usando questions-fallback.js (teste local)');
            state.questionsData = FALLBACK_QUESTIONS;
        } else {
            console.error('❌ Nenhuma fonte de perguntas!');
            state.questionsData = { domains: {}, eventos: [] };
        }
    }

    // Inicializa os baralhos, preservando progresso se já existir
    const baralhosRestaurados = state.baralhos && Object.keys(state.baralhos).length > 0;
    if (!baralhosRestaurados) {
        for (const [key, domain] of Object.entries(state.questionsData.domains || {})) {
            state.baralhos[key] = {
                perguntas: domain.questions.map(p => ({ ...p, usada: false })),
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
    // myActivityTotal e phasesList não são mais preenchidos aqui de forma
    // estática (Fase 9, todo.md 9.4) — Game.ui.renderProfileCard() agora
    // desenha a lista de fases inteira, com status por fase, toda vez que
    // o estado do jogador muda (via syncPlayerViews()).

    const restaurou = Game.persistence.tryRestoreState();

    await loadQuestions();

    // Fase D3b: host recarregando uma sessão salva — antes de reabrir o
    // ID de host, confere se outro jogador já assumiu a sala enquanto ele
    // estava fora (o backup assume depois de CONFIG.JOGO.HOST_TIMEOUT).
    // Se sim, volta como jogador comum (isHost passa a false e a URL a
    // host=false) e o initPeerWithRetry() abaixo já conecta como guest.
    if (restaurou && state.isHost) {
        await Game.network.retomarComoJogadorSeOutroAssumiu();
    }

    try {
        await initPeerWithRetry();
    } catch (err) {
        console.error('❌ Não foi possível estabelecer conexão P2P:', err);
        return;
    }

    Game.ui.setupUI();

    // Fase D3f: a retomada do host (o que fazer conforme o momento da
    // partida em que o F5 aconteceu) fica em engine/sessionEngine.js.
    // BUG-021: F5 na tela final volta à tela final (host e guest).
    if (restaurou && state.gameStarted && state.gameOver) {
        Game.core.mostrarFimDeJogo();
    } else if (restaurou && state.gameStarted) {
        if (state.isHost) {
            Game.core.retomarPartidaAposRecarregar();
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