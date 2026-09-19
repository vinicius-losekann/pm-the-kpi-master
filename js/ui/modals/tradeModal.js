// ============================================
// PM: The KPI Master - UI Modal: Pedido de Ajuda (ex-Negociação)
// ============================================
// Cobre a modal de status de quem pediu ajuda (acompanha a fila
// avançando automaticamente) e a modal de quem está sendo perguntado
// (aceitar/recusar doar 1 recurso).
// Reescrito para o novo fluxo de "rede de segurança" — ver
// engine/tradeEngine.js e ARCHITECTURE.md.
// ============================================

let ofertaAjudaAtual = null;

/**
 * Abre a modal de status e dispara o pedido de ajuda. Não pede pra
 * escolher ninguém — a fila é automática (ver tradeEngine.js).
 */
function iniciarPedidoAjuda() {
    document.getElementById('ajudaTentandoCom').textContent = '...';
    document.getElementById('modalPedirAjuda').style.display = 'flex';
    Game.core.pedirAjuda();
}

/**
 * Fecha a modal de status localmente. Não cancela o pedido no host —
 * a fila continua rodando em segundo plano (mesmo comportamento que o
 * antigo "Cancelar" da modal de venda já tinha).
 */
function fecharPedirAjudaModal() {
    document.getElementById('modalPedirAjuda').style.display = 'none';
}

/**
 * Atualiza a modal de status de quem pediu ajuda, mostrando pra quem
 * o pedido está sendo feito agora (a fila avança automaticamente).
 */
function showAjudaTentando(msg) {
    const el = document.getElementById('ajudaTentandoCom');
    if (el) el.textContent = Game.sanitize.escapeHtml(msg.candidatoName);
}

/**
 * Exibe ao candidato o pedido de ajuda recebido.
 */
function showAjudaOfertaModal(msg) {
    ofertaAjudaAtual = msg;
    document.getElementById('ajudaOfertaTexto').innerHTML =
        Game.i18n.t('trade.pedidoRecebido', { requester: Game.sanitize.escapeHtml(msg.requesterName) });
    document.getElementById('modalAjudaOferta').style.display = 'flex';
}

/**
 * Envia a resposta do candidato (aceite/recusa) ao host.
 */
function responderOfertaAjuda(aceito) {
    document.getElementById('modalAjudaOferta').style.display = 'none';
    if (!ofertaAjudaAtual) return;

    const msg = {
        type: 'ajuda-oferta-response',
        candidatoName: Game.state.playerName,
        aceito: !!aceito
    };

    if (Game.state.isHost) {
        Game.core.handleAjudaOfertaResponse(msg);
    } else {
        Game.network.sendToHost(msg);
    }
    ofertaAjudaAtual = null;
}

/**
 * Jogador que pediu ajuda: mensagem de que ninguém pôde ajudar agora
 * (não é fim de jogo — ver motivo pra explicar o caminho de volta).
 */
function showAjudaSemCandidatos(msg) {
    document.getElementById('modalPedirAjuda').style.display = 'none';
    const chave = msg.motivo === 'kpi-insuficiente'
        ? 'trade.semKpiParaPedirAjuda'
        : 'trade.ninguemPodeAjudar';
    alert(Game.i18n.t(chave));
}

// ============================================
// EXPORTAÇÃO
// ============================================
window.Game = window.Game || {};
window.Game.ui = window.Game.ui || {};
Object.assign(window.Game.ui, {
    iniciarPedidoAjuda,
    fecharPedirAjudaModal,
    showAjudaTentando,
    showAjudaOfertaModal,
    responderOfertaAjuda,
    showAjudaSemCandidatos
});