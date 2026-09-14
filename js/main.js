// ============================================
// PM: The KPI Master - Orquestrador Principal
// ============================================
// Responsabilidades:
//   - Inicializar o jogo na ordem correta (DOM, perguntas, PeerJS)
//   - Retomar partida após recarregar a página (F5)
//   - Ponto de entrada único (DOMContentLoaded)
//
// Fase 7: saveState()/tryRestoreState() foram extraídos para
// js/utils/persistence.js. Fase 6/7.8: loadQuestions() agora busca
// data/questions.pt-BR.json + data/events.json (antes um único
// data/questions.json), remontando a mesma forma {areas, eventos}
// para não quebrar domain/deckRules.js e domain/eventRules.js.
// ============================================

// ============================================
// EXPORTAÇÃO / SETUP INICIAL DO NAMESPACE
// ============================================
window.Game = window.Game || {};

// Fase 0.3: injeta o EventBus global no namespace do jogo.
// A partir daqui, qualquer módulo pode usar Game.bus.on(...) / Game.bus.emit(...)
// em vez de chamar outros módulos diretamente.
window.Game.bus = window.bus;

// ============================================
// CARREGAR PERGUNTAS
// ============================================

/**
 * Carrega data/questions.pt-BR.json (perguntas) e data/events.json
 * (eventos) via fetch, remontando o mesmo formato {areas, eventos}
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
            areas: questionsJson.areas || {},
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
// RETOMAR PARTIDA (HOST)
// ============================================
function resumeGameEngineIfHost() {
    const state = Game.state;
    if (!state.isHost || !state.gameStarted || state.gameOver) return;

    console.log('🔁 Retomando motor da partida após reload do host...');

    Game.ui.showScreen('game');
    Game.ui.updatePlayersOnlineList();
    Game.ui.updateRankingList();
    Game.ui.updateTimerDisplay();

    // BUG-003 (ver ISSUES.md): faltava atualizar o card de perfil do
    // próprio host (KPI, fase, atividades) após o F5 — os dados já
    // estavam corretos em memória, só a tela não refletia isso.
    Game.ui.renderProfileCard(Game.getPlayerByName(state.playerName));

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
        // BUG-001 (ver ISSUES.md): antes, os dois ramos deste if/else
        // chamavam pickNewPair() incondicionalmente, trocando a pergunta
        // a cada F5 do host. Agora, se já existe uma rodada em andamento,
        // ela é reexibida em vez de substituída — mesmo padrão já usado
        // em becomeHost() (js/game-network.js).
        Game.ui.displayRoundStart();
        if (state.currentRound.pergunta) {
            Game.ui.displayQuestion(state.currentRound.pergunta);
        }
        Game.core.armarRespostaTimeout(state.currentRound.respondedor);
        Game.ui.refreshNovaRodadaButton();
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

    const restaurou = Game.persistence.tryRestoreState();

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