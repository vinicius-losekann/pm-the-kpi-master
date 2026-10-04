// ============================================
// PM: The KPI Master - UI Modal: Pedido de Ajuda
// ============================================
// Cobre a modal de status de quem pediu ajuda (acompanha a fila
// avançando automaticamente) e a modal de quem está sendo perguntado
// (aceitar/recusar doar 1 recurso). A fila fica em
// engine/tradeEngine.js.
// ============================================

let currentHelpOffer = null;

/**
 * Abre a modal de status e dispara o pedido de ajuda. Não pede pra
 * escolher ninguém — a fila é automática (ver tradeEngine.js).
 */
function startHelpRequest() {
    document.getElementById('ajudaTentandoCom').textContent = '...';
    document.getElementById('modalPedirAjuda').style.display = 'flex';
    Game.core.requestHelp();
}

/**
 * Fecha a modal de status localmente. Não cancela o pedido no host —
 * a fila continua rodando em segundo plano (mesmo comportamento que o
 * antigo "Cancelar" da modal de venda já tinha).
 */
function closeHelpRequestModal() {
    document.getElementById('modalPedirAjuda').style.display = 'none';
}

/**
 * Atualiza a modal de status de quem pediu ajuda, mostrando pra quem
 * o pedido está sendo feito agora (a fila avança automaticamente).
 */
function showHelpCandidate(msg) {
    // textContent já mostra o texto como texto (sem interpretar HTML) —
    // escapar aqui fazia "Ana & Bia" aparecer como "Ana &amp; Bia".
    const el = document.getElementById('ajudaTentandoCom');
    if (el) el.textContent = msg.candidatoName;
}

/**
 * Exibe ao candidato o pedido de ajuda recebido.
 */
function showHelpOfferModal(msg) {
    currentHelpOffer = msg;
    document.getElementById('ajudaOfertaTexto').innerHTML =
        Game.i18n.t('trade.pedidoRecebido', { requester: Game.sanitize.escapeHtml(msg.requesterName) });
    document.getElementById('modalAjudaOferta').style.display = 'flex';
}

/**
 * Envia a resposta do candidato (aceite/recusa) ao host.
 */
function respondToHelpOffer(accepted) {
    document.getElementById('modalAjudaOferta').style.display = 'none';
    if (!currentHelpOffer) return;

    const msg = {
        type: 'ajuda-oferta-response',
        candidatoName: Game.state.playerName,
        aceito: !!accepted
    };

    if (Game.state.isHost) {
        Game.core.handleHelpOfferResponse(msg);
    } else {
        Game.network.sendToHost(msg);
    }
    currentHelpOffer = null;
}

/**
 * Jogador que pediu ajuda: mensagem de que ninguém pôde ajudar agora
 * (não é fim de jogo — ver motivo pra explicar o caminho de volta).
 */
function showHelpNoCandidates(msg) {
    document.getElementById('modalPedirAjuda').style.display = 'none';
    const key = msg.motivo === 'kpi-insuficiente'
        ? 'trade.semKpiParaPedirAjuda'
        : 'trade.ninguemPodeAjudar';
    alert(Game.i18n.t(key));
}

// ============================================
// EXPORTAÇÃO
// ============================================
window.Game = window.Game || {};
window.Game.ui = window.Game.ui || {};
Object.assign(window.Game.ui, {
    startHelpRequest,
    closeHelpRequestModal,
    showHelpCandidate,
    showHelpOfferModal,
    respondToHelpOffer,
    showHelpNoCandidates
});