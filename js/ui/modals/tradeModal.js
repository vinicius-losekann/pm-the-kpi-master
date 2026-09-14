// ============================================
// PM: The KPI Master - UI Modal: Negociação (Venda de Recursos)
// ============================================
// Cobre tanto a oferta (vendedor escolhe comprador) quanto a resposta
// (comprador aceita/recusa).
// Fase 5.11 do roadmap.
// ============================================

let ofertaVendaAtual = null;

function showVendaModal() {
    const state = Game.state;
    const me = Game.getPlayerByName(state.playerName);

    if (!me || me.recursos < 1) {
        alert(Game.i18n.t('trade.semRecursos'));
        return;
    }

    const compradores = Game.core.getCompradores();
    if (compradores.length === 0) {
        alert(Game.i18n.t('trade.nenhumComprador', { valor: CONFIG.KPI.VALOR_VENDA_RECURSO }));
        return;
    }

    document.getElementById('vendaValorKPI').textContent = CONFIG.KPI.VALOR_VENDA_RECURSO + ' KPI';
    document.getElementById('vendaSeusRecursos').textContent =
        Game.i18n.t('trade.seusRecursos', { recursos: me.recursos });

    document.getElementById('vendaCompradores').innerHTML = compradores.map(c => `
        <button class="btn btn-glass comprador-select-btn" data-comprador-name="${Game.sanitize.escapeHtml(c.name)}"
                style="display:flex; justify-content:space-between; align-items:center; padding:10px 14px;">
            <span>${Game.sanitize.escapeHtml(c.name)}</span>
            <span style="color:#ffd700; font-size:0.8rem;">⭐${c.kpi} KPI</span>
        </button>
    `).join('');

    // 🔴 Correção de segurança: mesmo caso do advisoryModal.js — nome de
    // jogador não pode ir interpolado em onclick="...", pois o navegador
    // decodifica entidades HTML antes de rodar o JS do handler.
    document.querySelectorAll('#vendaCompradores .comprador-select-btn').forEach(btn => {
        btn.addEventListener('click', () => confirmarVenda(btn.dataset.compradorName));
    });

    document.getElementById('modalVenda').style.display = 'flex';
}

function confirmarVenda(compradorName) {
    if (confirm(Game.i18n.t('trade.confirmarOferta', { comprador: compradorName, valor: CONFIG.KPI.VALOR_VENDA_RECURSO }))) {
        Game.core.venderRecurso(compradorName);
        document.querySelectorAll('#vendaCompradores button').forEach(b => b.disabled = true);
        const seusRecursosEl = document.getElementById('vendaSeusRecursos');
        if (seusRecursosEl) {
            seusRecursosEl.textContent = Game.i18n.t('trade.aguardandoAceite', { comprador: compradorName });
        }
    }
}

function fecharVendaModal() {
    document.getElementById('modalVenda').style.display = 'none';
}

/**
 * Exibe ao comprador a oferta recebida de outro jogador.
 */
function showVendaOfertaModal(msg) {
    ofertaVendaAtual = msg;
    document.getElementById('vendaOfertaTexto').innerHTML =
        Game.i18n.t('trade.ofertaRecebida', { vendedor: Game.sanitize.escapeHtml(msg.vendedorName), valor: msg.valor });
    document.getElementById('modalVendaOferta').style.display = 'flex';
}

/**
 * Envia a resposta do comprador (aceite/recusa) ao host.
 */
function responderOfertaVenda(aceito) {
    document.getElementById('modalVendaOferta').style.display = 'none';
    if (!ofertaVendaAtual) return;

    const msg = {
        type: 'venda-offer-response',
        vendedorName: ofertaVendaAtual.vendedorName,
        compradorName: ofertaVendaAtual.compradorName,
        aceito: !!aceito
    };

    if (Game.state.isHost) {
        Game.core.handleVendaOfertaResponse(msg);
    } else {
        Game.network.sendToHost(msg);
    }
    ofertaVendaAtual = null;
}

// ============================================
// EXPORTAÇÃO
// ============================================
window.Game = window.Game || {};
window.Game.ui = window.Game.ui || {};
Object.assign(window.Game.ui, {
    showVendaModal,
    confirmarVenda,
    fecharVendaModal,
    showVendaOfertaModal,
    responderOfertaVenda
});