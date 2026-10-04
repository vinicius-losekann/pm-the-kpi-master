// ============================================
// PM: The KPI Master - Engine: Pedido de Ajuda
// ============================================
// Só quem está com 0 recursos pode pedir ajuda (rede de segurança, não
// mercado livre — um mercado distrai do objetivo do jogo, o quiz de
// PMBOK). Ao pedir, o host monta uma fila automática
// com os jogadores ativos que têm recurso — do que tem mais pro que
// tem menos — e pergunta um de cada vez, avançando sozinho a cada
// recusa/timeout, até alguém aceitar ou a fila acabar.
//
// A troca em si: doador +10 KPI/-1 recurso, quem pediu -10 KPI/+1
// recurso (validação em domain/tradeRules.js).
// ============================================

/**
 * Chamado pelo jogador com 0 recursos para iniciar um pedido de ajuda.
 * Não escolhe a quem pedir — o host monta a fila automaticamente.
 */
function requestHelp() {
    const state = Game.state;

    if (state.isHost) {
        handleHelpRequest({ requesterName: state.playerName });
    } else {
        Game.network.sendToHost({ type: 'ajuda-request', requesterName: state.playerName });
    }
}

/**
 * Host: valida o pedido, monta a fila (jogadores ativos com recurso,
 * do que tem mais pro que tem menos) e envia a primeira oferta.
 */
function handleHelpRequest(msg) {
    const state = Game.state;
    if (!state.isHost) return;

    const requester = Game.getPlayerByName(msg.requesterName);
    if (!requester) return;

    if (requester.recursos > 0) {
        console.warn('⚠️ Pedido de ajuda rejeitado: ' + requester.name + ' ainda tem recursos.');
        return;
    }

    if (requester.kpi < CONFIG.KPI.VALOR_VENDA_RECURSO) {
        Game.network.sendToPlayer(requester.peerId, {
            type: 'ajuda-sem-candidatos',
            motivo: 'kpi-insuficiente'
        });
        return;
    }

    const queue = Game.getActivePlayers()
        .filter(p => p.name !== requester.name && p.recursos >= 1)
        .sort((a, b) => b.recursos - a.recursos)
        .map(p => p.name);

    if (queue.length === 0) {
        Game.network.sendToPlayer(requester.peerId, {
            type: 'ajuda-sem-candidatos',
            motivo: 'sem-doadores'
        });
        return;
    }

    state.ajudaFila = { requesterName: requester.name, candidatos: queue, indice: 0 };
    sendNextHelpOffer();
}

/**
 * Host: envia (ou reenvia, após recusa/timeout) a oferta de ajuda para
 * o candidato atual da fila. Se a fila acabou, avisa quem pediu que
 * ninguém pôde ajudar por ora — não é fim de jogo, só fica sem poder
 * responder até conseguir KPI/recurso por outro caminho (ser
 * Perguntador, ser chamado como Assessor, ou pegar um evento de
 * Reserva de Contingência).
 */
function sendNextHelpOffer() {
    const state = Game.state;
    const queue = state.ajudaFila;
    if (!queue) return;

    // Quem pediu saiu da partida ou caiu: o pedido é cancelado.
    const requester = Game.getPlayerByName(queue.requesterName);
    if (!requester || requester.waitingInLobby || requester.disconnected) {
        state.ajudaFila = null;
        return;
    }

    if (queue.indice >= queue.candidatos.length) {
        Game.network.sendToPlayer(requester.peerId, {
            type: 'ajuda-sem-candidatos',
            motivo: 'todos-recusaram'
        });
        state.ajudaFila = null;
        return;
    }

    const candidateName = queue.candidatos[queue.indice];
    const candidate = Game.getPlayerByName(candidateName);

    // Candidato saiu da partida, caiu ou tem 0 recursos agora (gastou
    // nesse meio tempo) — pula pro próximo sem perguntar. Sem olhar a
    // queda, quem pediu esperava o prazo inteiro por quem tinha caído.
    if (!candidate || candidate.waitingInLobby || candidate.disconnected || candidate.recursos < 1) {
        queue.indice++;
        return sendNextHelpOffer();
    }

    Game.network.sendToPlayer(requester.peerId, {
        type: 'ajuda-tentando',
        candidatoName: candidateName
    });

    Game.network.sendToPlayer(candidate.peerId, {
        type: 'ajuda-oferta',
        requesterName: requester.name
    });

    if (state.ajudaTimeout) clearTimeout(state.ajudaTimeout);
    state.ajudaTimeout = setTimeout(() => {
        handleHelpOfferResponse({ candidatoName: candidateName, aceito: false, timeout: true });
    }, CONFIG.JOGO.ASSESSORIA_TIMEOUT);
}

/**
 * Host: processa a resposta (aceite/recusa/timeout) do candidato atual
 * da fila.
 */
function handleHelpOfferResponse(msg) {
    const state = Game.state;
    if (!state.isHost || !state.ajudaFila) return;

    const queue = state.ajudaFila;
    const currentCandidate = queue.candidatos[queue.indice];
    if (msg.candidatoName !== currentCandidate) return; // resposta atrasada de candidato já pulado

    if (state.ajudaTimeout) {
        clearTimeout(state.ajudaTimeout);
        state.ajudaTimeout = null;
    }

    if (!msg.aceito) {
        queue.indice++;
        sendNextHelpOffer();
        return;
    }

    // Quem pediu caiu ou saiu da partida enquanto o candidato decidia:
    // o pedido é cancelado, sem transferir nada.
    const requester = Game.getPlayerByName(queue.requesterName);
    if (!requester || requester.waitingInLobby || requester.disconnected) {
        state.ajudaFila = null;
        return;
    }

    processHelp(currentCandidate, queue.requesterName);
    state.ajudaFila = null;
}

/**
 * Host: executa a doação efetivamente (única fonte da verdade), com a
 * validação de domain/tradeRules.js.
 */
function processHelp(donorName, requesterName) {
    const state = Game.state;
    if (!state.isHost) return;

    const donor = Game.getPlayerByName(donorName);
    const requester = Game.getPlayerByName(requesterName);

    const error = Game.domain.trade.validateResourceTransfer(donor, requester, CONFIG);
    if (error) {
        console.warn('⚠️ Ajuda cancelada na validação final:', error);
        if (requester) {
            Game.network.sendToPlayer(requester.peerId, { type: 'ajuda-sem-candidatos', motivo: 'sem-doadores' });
        }
        return false;
    }

    donor.recursos--;
    donor.kpi += CONFIG.KPI.VALOR_VENDA_RECURSO;
    requester.recursos++;
    requester.kpi -= CONFIG.KPI.VALOR_VENDA_RECURSO;

    console.log('🆘 Ajuda: ' + donor.name + ' deu 1📦 para ' + requester.name + ' por ' + CONFIG.KPI.VALOR_VENDA_RECURSO + ' KPI');

    const confirmMsg = {
        type: 'ajuda-confirmada',
        doador: donor.name,
        requester: requester.name,
        valor: CONFIG.KPI.VALOR_VENDA_RECURSO,
        doadorKPI: donor.kpi,
        doadorRecursos: donor.recursos,
        requesterKPI: requester.kpi,
        requesterRecursos: requester.recursos
    };

    Game.network.broadcastAll(confirmMsg);

    // Atualiza a UI do próprio host
    Game.network.handleMessage(confirmMsg, state.peerId);

    Game.saveState();
    return true;
}

// ============================================
// EXPORTAÇÃO
// ============================================
window.Game = window.Game || {};
window.Game.engine = window.Game.engine || {};
window.Game.engine.trade = {
    requestHelp,
    handleHelpRequest,
    handleHelpOfferResponse,
    processHelp
};

// Game.core.* é o namespace usado por ui/ e network/ para chamar as
// funções deste engine — convenção de chamada entre camadas, não é
// compatibilidade temporária nem trabalho pendente (ver _docs/architecture.md).
window.Game.core = window.Game.core || {};
Object.assign(window.Game.core, window.Game.engine.trade);
