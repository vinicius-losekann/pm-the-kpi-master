// ============================================
// PM: The KPI Master - Engine: Negociação (Venda de Recursos)
// ============================================
// Orquestra o fluxo de venda de recursos entre jogadores: oferta,
// resposta do comprador e execução. A validação em si (podem ou não
// negociar) é regra pura, delegada a js/domain/tradeRules.js.
// Fase 3.4 do roadmap.
// ============================================

/**
 * Inicia uma oferta de venda: o vendedor escolhe um comprador,
 * e o host encaminha a oferta para o comprador decidir.
 */
function venderRecurso(compradorName) {
    const state = Game.state;

    if (state.isHost) {
        handleVendaOfertaRequest({ vendedorName: state.playerName, compradorName });
    } else {
        Game.network.sendToHost({
            type: 'venda-offer-request',
            vendedorName: state.playerName,
            compradorName
        });
    }
    return true;
}

/**
 * Host: valida a oferta e a encaminha ao comprador.
 */
function handleVendaOfertaRequest(msg) {
    const state = Game.state;
    if (!state.isHost) return;

    const vendedor = Game.getPlayerByName(msg.vendedorName);
    const comprador = Game.getPlayerByName(msg.compradorName);

    const erro = Game.domain.trade.validarVenda(vendedor, comprador, CONFIG);

    if (erro) {
        console.warn('⚠️ Oferta de venda rejeitada:', erro);
        Game.network.sendToPlayer(vendedor?.peerId, { type: 'venda-rejected', motivo: erro });
        return;
    }

    Game.network.sendToPlayer(comprador.peerId, {
        type: 'venda-offer',
        vendedorName: vendedor.name,
        compradorName: comprador.name,
        valor: CONFIG.KPI.VALOR_VENDA_RECURSO
    });
}

/**
 * Host: processa a resposta do comprador à oferta.
 */
function handleVendaOfertaResponse(msg) {
    const state = Game.state;
    if (!state.isHost) return;

    if (!msg.aceito) {
        const vendedor = Game.getPlayerByName(msg.vendedorName);
        if (vendedor) {
            Game.network.sendToPlayer(vendedor.peerId, {
                type: 'venda-rejected',
                motivo: msg.compradorName + ' recusou a oferta de compra.'
            });
        }
        return;
    }

    processVenda(msg.vendedorName, msg.compradorName);
}

/**
 * Host: executa a venda efetivamente (única fonte da verdade).
 */
function processVenda(vendedorName, compradorName) {
    const state = Game.state;
    if (!state.isHost) return;

    const vendedor = Game.getPlayerByName(vendedorName);
    const comprador = Game.getPlayerByName(compradorName);

    const erro = Game.domain.trade.validarVenda(vendedor, comprador, CONFIG);

    if (erro) {
        console.warn('⚠️ Venda rejeitada:', erro);
        Game.network.sendToPlayer(vendedor?.peerId, { type: 'venda-rejected', motivo: erro });
        return false;
    }

    vendedor.recursos--;
    vendedor.kpi += CONFIG.KPI.VALOR_VENDA_RECURSO;
    comprador.recursos++;
    comprador.kpi -= CONFIG.KPI.VALOR_VENDA_RECURSO;

    console.log('💰 Venda:', vendedor.name, 'vendeu 1📦 para', comprador.name, 'por', CONFIG.KPI.VALOR_VENDA_RECURSO, 'KPI');

    Game.network.broadcastAll({
        type: 'venda-confirmed',
        vendedor: vendedor.name,
        comprador: comprador.name,
        valor: CONFIG.KPI.VALOR_VENDA_RECURSO,
        vendedorKPI: vendedor.kpi,
        vendedorRecursos: vendedor.recursos,
        compradorKPI: comprador.kpi,
        compradorRecursos: comprador.recursos
    });

    // Atualiza a UI do próprio host
    Game.network.handleMessage({
        type: 'venda-confirmed',
        vendedor: vendedor.name,
        comprador: comprador.name,
        valor: CONFIG.KPI.VALOR_VENDA_RECURSO,
        vendedorKPI: vendedor.kpi,
        vendedorRecursos: vendedor.recursos,
        compradorKPI: comprador.kpi,
        compradorRecursos: comprador.recursos
    }, state.peerId);

    Game.saveState();
    return true;
}

/**
 * Retorna a lista de jogadores que podem comprar (têm KPI suficiente e estão ativos).
 */
function getCompradores() {
    const state = Game.state;
    return state.players.filter(p =>
        p.name !== state.playerName &&
        !p.waitingInLobby &&
        p.kpi >= CONFIG.KPI.VALOR_VENDA_RECURSO
    );
}

// ============================================
// EXPORTAÇÃO
// ============================================
window.Game = window.Game || {};
window.Game.engine = window.Game.engine || {};
window.Game.engine.trade = {
    venderRecurso,
    handleVendaOfertaRequest,
    handleVendaOfertaResponse,
    processVenda,
    getCompradores
};

// Game.core.* é o namespace usado por ui/ e network/ para chamar as
// funções deste engine — convenção de chamada entre camadas, não é
// compatibilidade temporária nem trabalho pendente (ver ARCHITECTURE.md).
window.Game.core = window.Game.core || {};
Object.assign(window.Game.core, window.Game.engine.trade);