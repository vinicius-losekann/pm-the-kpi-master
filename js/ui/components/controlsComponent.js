// ============================================
// PM: The KPI Master - UI Component: Controles
// ============================================
// Dona da "barra de ações": inicia partida, copia ID da sala, avança
// rodada manualmente, pede assessoria ou ajuda,
// sai/encerra sessão e partida. Também libera/bloqueia o botão de
// iniciar partida conforme o número de jogadores ativos.
//
// ui/setup.js cuida só de alternar visibilidade host/guest e da
// navegação de tela; os botões de AÇÃO do jogo moram aqui.
// ============================================

let controlsBound = false;

function checkStartCondition() {
    const state = Game.state;
    if (!state.isHost) return;
    const btnStart = document.getElementById('btnStartGame');
    const hint = document.getElementById('startHint');
    const activeCount = Game.getActivePlayers().length;
    if (activeCount >= CONFIG.GAME.MIN_PLAYERS) {
        btnStart.disabled = false;
        hint.textContent = Game.i18n.t('controls.readyToStart', { count: activeCount });
        hint.style.color = '#00ff88';
    } else {
        btnStart.disabled = true;
        hint.textContent = Game.i18n.t('controls.minPlayers', { min: CONFIG.GAME.MIN_PLAYERS });
        hint.style.color = '#a0a0b0';
    }
}

/**
 * Habilita o botão "Nova Rodada" só quando o ciclo da rodada vigente
 * terminou (todos os jogadores ativos já responderam) ou quando a rodada
 * espera quem caiu (o clique segue sem ele). Recalcula a
 * partir do estado atual — pode ser chamada a qualquer momento (após
 * uma resposta, ao recuperar sessão via F5, ao assumir como host) sem
 * precisar rastrear manualmente "ligado/desligado".
 * Não depende de quantidade fixa de jogadores — funciona com 2, 6 ou
 * qualquer número dentro do limite configurado.
 */
function refreshNewRoundButton() {
    const state = Game.state;
    if (!state.isHost) return;
    const btn = document.getElementById('btnNewRound');
    if (!btn) return;

    const isComplete = Game.selectors.isCycleComplete(
        Game.getActivePlayers(),
        state.answeredThisRound
    );
    const isWaiting = (state.waitingFor || []).length > 0;
    btn.disabled = !(isComplete || isWaiting);
}

/**
 * Liga os listeners de todos os botões de ação. Chamado por
 * Game.ui.setupUI() — idempotente graças a `controlsBound`.
 */
function bindControls() {
    if (controlsBound) return;

    // --- Ações exclusivas do host (botões ficam ocultos para guests,
    // então é seguro ligar o listener sempre — sem clique visível não
    // há como acionar) ---
    // startGame() do host marca a hora de término e avisa os guests.
    document.getElementById('btnStartGame').addEventListener('click', () => {
        Game.core.startGame();
    });

    document.getElementById('btnCopyId').addEventListener('click', () => {
        navigator.clipboard.writeText(Game.state.roomName).then(() => {
            const btn = document.getElementById('btnCopyId');
            btn.textContent = Game.i18n.t('controls.copied');
            setTimeout(() => { btn.textContent = Game.i18n.t('controls.copy'); }, 2000);
        }).catch(() => {});
    });

    document.getElementById('btnNewRound').addEventListener('click', () => {
        // Inicia uma rodada de verdade (sorteia e mostra um evento novo)
        // — não é nextTurn(), que só avança dentro do ciclo vigente.
        Game.core.startNewRound();
    });

    // --- Sessão e partida (comuns, visibilidade alternada por setup.js) ---
    document.getElementById('btnEndSession').addEventListener('click', Game.core.endSession);
    document.getElementById('btnEndMatch').addEventListener('click', Game.core.endMatch);
    document.getElementById('btnLeaveSession').addEventListener('click', Game.core.leaveSession);
    document.getElementById('btnLeaveMatch').addEventListener('click', Game.core.leaveMatch);

    // --- Pedir assessoria ou ajuda: o mesmo botão, na pergunta de quem
    // responde (o tipo vem dos recursos; ver ui/modals/advisoryModal.js) ---
    document.getElementById('btnRequestAdvisory').addEventListener('click', () => {
        Game.ui.showAdvisorySelectModal();
    });

    // --- Fazer a pergunta: o Perguntador, depois de ler em voz alta
    // (ver ui/components/questionComponent.js) ---
    document.getElementById('btnAskQuestion').addEventListener('click', () => {
        Game.ui.handleAskClick();
    });

    // --- Passar a pergunta pendente (host, na espera do fim da rodada,
    // com quem pergunta caído; ver engine/turnEngine.js) ---
    document.getElementById('btnHandOverQuestion').addEventListener('click', () => {
        Game.core.handOverHeldQuestion();
    });

    controlsBound = true;
}

// ============================================
// EXPORTAÇÃO
// ============================================
window.Game = window.Game || {};
window.Game.ui = window.Game.ui || {};
Object.assign(window.Game.ui, {
    checkStartCondition,
    bindControls,
    refreshNewRoundButton
});