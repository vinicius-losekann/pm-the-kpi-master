// ============================================
// PM: The KPI Master - UI Component: Controles
// ============================================
// Dona da "barra de ações": inicia partida, copia ID da sala, avança
// rodada manualmente, pede ajuda (recurso), pede assessoria,
// sai/encerra sessão e partida. Também libera/bloqueia o botão de
// iniciar partida conforme o número de jogadores ativos.
//
// Reorganizado para resolver a sobreposição de responsabilidade com
// ui/setup.js (ver NOTA-001 em ARCHITECTURE.md): antes, os listeners
// desses mesmos botões estavam em setup.js, e este arquivo só tinha
// checkStartCondition(). Agora setup.js cuida só de alternar
// visibilidade host/guest e navegação de tela; os botões de AÇÃO do
// jogo moram aqui.
// ============================================

let controlsBound = false;

function checkStartCondition() {
    const state = Game.state;
    if (!state.isHost) return;
    const btnStart = document.getElementById('btnStartGame');
    const hint = document.getElementById('startHint');
    const activeCount = Game.getActivePlayers().length;
    if (activeCount >= CONFIG.JOGO.MIN_PLAYERS) {
        btnStart.disabled = false;
        hint.textContent = Game.i18n.t('controls.prontoParaIniciar', { count: activeCount });
        hint.style.color = '#00ff88';
    } else {
        btnStart.disabled = true;
        hint.textContent = Game.i18n.t('controls.minimoJogadores', { min: CONFIG.JOGO.MIN_PLAYERS });
        hint.style.color = '#a0a0b0';
    }
}

/**
 * Habilita o botão "Nova Rodada" só quando o ciclo da rodada vigente
 * terminou (todos os jogadores ativos já responderam). Recalcula a
 * partir do estado atual — pode ser chamada a qualquer momento (após
 * uma resposta, ao recuperar sessão via F5, ao assumir como host) sem
 * precisar rastrear manualmente "ligado/desligado".
 * Não depende de quantidade fixa de jogadores — funciona com 2, 6 ou
 * qualquer número dentro do limite configurado.
 */
function refreshNovaRodadaButton() {
    const state = Game.state;
    if (!state.isHost) return;
    const btn = document.getElementById('btnNovaRodada');
    if (!btn) return;

    const completo = Game.selectors.isCycleComplete(
        Game.getActivePlayers(),
        state.usedRespondedorThisRound
    );
    btn.disabled = !completo;
}

/**
 * Liga os listeners de todos os botões de ação. Chamado uma única vez
 * por Game.ui.setupUI() — idempotente graças a `controlsBound` (também
 * é chamado de novo quando um guest vira host, via becomeHost()).
 */
function bindControls() {
    if (controlsBound) return;

    // --- Ações exclusivas do host (botões ficam ocultos para guests,
    // então é seguro ligar o listener sempre — sem clique visível não
    // há como acionar) ---
    document.getElementById('btnStartGame').addEventListener('click', () => {
        Game.state.timer = CONFIG.JOGO.SESSION_DURATION;
        Game.network.broadcastAll({ type: 'game-start', timer: Game.state.timer });
        Game.core.startGame();
    });

    document.getElementById('btnCopyId').addEventListener('click', () => {
        navigator.clipboard.writeText(Game.state.peerId).then(() => {
            const btn = document.getElementById('btnCopyId');
            btn.textContent = Game.i18n.t('controls.copiado');
            setTimeout(() => { btn.textContent = Game.i18n.t('controls.copiar'); }, 2000);
        }).catch(() => {});
    });

    document.getElementById('btnNovaRodada').addEventListener('click', () => {
        // 🐛 Correção (ver ISSUES.md BUG-005): antes chamava
        // Game.core.nextTurn() — que só avança dentro do ciclo vigente
        // e nunca sorteia/mostra um evento novo. O botão precisa
        // iniciar uma rodada de verdade, então chama startNewRound()
        // diretamente.
        Game.core.startNewRound();
    });

    // --- Sessão e partida (comuns, visibilidade alternada por setup.js) ---
    document.getElementById('btnEndSession').addEventListener('click', Game.core.endSession);
    document.getElementById('btnEndMatch').addEventListener('click', Game.core.endMatch);
    document.getElementById('btnLeaveSession').addEventListener('click', Game.core.leaveSession);
    document.getElementById('btnLeaveMatch').addEventListener('click', Game.core.leaveMatch);

    // --- Abrir modais de ajuda/assessoria (a lógica de cada fluxo
    // continua em ui/modals/tradeModal.js e advisoryModal.js) ---
    // Fase 9: botão só fica visível quando o jogador está com 0
    // recursos — ver Game.ui.renderProfileCard() em profileComponent.js.
    // Não abre mais uma modal de escolha (era "Vender Recurso", com
    // lista de compradores) — o pedido é automático, a fila é montada
    // pelo host.
    document.getElementById('btnPedirAjuda').addEventListener('click', () => {
        Game.ui.iniciarPedidoAjuda();
    });

    document.getElementById('btnPedirAssessoria').addEventListener('click', () => {
        Game.ui.showAssessoriaSelectModal();
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
    refreshNovaRodadaButton
});