// ============================================
// PM: The KPI Master - Engine: Pedido de Ajuda (ex-Negociação)
// ============================================
// Antes (Fase 3.4): mercado livre — qualquer jogador podia vender
// recurso pra qualquer comprador, a qualquer momento. No piloto com
// alunos isso virou uma distração paralela ao objetivo do jogo
// (quiz de PMBOK), com gente ficando de olho no mercado sem
// necessidade real.
//
// Agora: só quem está com 0 recursos pode pedir ajuda (rede de
// segurança, não mercado). Ao pedir, o host monta uma fila automática
// com os jogadores ativos que têm recurso — do que tem mais pro que
// tem menos — e pergunta um de cada vez, avançando sozinho a cada
// recusa/timeout, até alguém aceitar ou a fila acabar.
//
// A matemática da troca em si (doador +10 KPI/-1 recurso, quem pediu
// -10 KPI/+1 recurso) não mudou — só quem inicia e quando a ação fica
// disponível. Reaproveita domain/tradeRules.js sem alteração.
// ============================================

/**
 * Chamado pelo jogador com 0 recursos para iniciar um pedido de ajuda.
 * Não escolhe a quem pedir — o host monta a fila automaticamente.
 */
function pedirAjuda() {
    const state = Game.state;

    if (state.isHost) {
        handleAjudaRequest({ requesterName: state.playerName });
    } else {
        Game.network.sendToHost({ type: 'ajuda-request', requesterName: state.playerName });
    }
}

/**
 * Host: valida o pedido, monta a fila (jogadores ativos com recurso,
 * do que tem mais pro que tem menos) e envia a primeira oferta.
 */
function handleAjudaRequest(msg) {
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

    const fila = Game.getActivePlayers()
        .filter(p => p.name !== requester.name && p.recursos >= 1)
        .sort((a, b) => b.recursos - a.recursos)
        .map(p => p.name);

    if (fila.length === 0) {
        Game.network.sendToPlayer(requester.peerId, {
            type: 'ajuda-sem-candidatos',
            motivo: 'sem-doadores'
        });
        return;
    }

    state.ajudaFila = { requesterName: requester.name, candidatos: fila, indice: 0 };
    enviarProximaOfertaAjuda();
}

/**
 * Host: envia (ou reenvia, após recusa/timeout) a oferta de ajuda para
 * o candidato atual da fila. Se a fila acabou, avisa quem pediu que
 * ninguém pôde ajudar por ora — não é fim de jogo, só fica sem poder
 * responder até conseguir KPI/recurso por outro caminho (ser
 * Perguntador, ser chamado como Assessor, ou pegar um evento de
 * Reserva de Contingência).
 */
function enviarProximaOfertaAjuda() {
    const state = Game.state;
    const fila = state.ajudaFila;
    if (!fila) return;

    const requester = Game.getPlayerByName(fila.requesterName);
    if (!requester || requester.waitingInLobby) {
        state.ajudaFila = null;
        return;
    }

    if (fila.indice >= fila.candidatos.length) {
        Game.network.sendToPlayer(requester.peerId, {
            type: 'ajuda-sem-candidatos',
            motivo: 'todos-recusaram'
        });
        state.ajudaFila = null;
        return;
    }

    const candidatoName = fila.candidatos[fila.indice];
    const candidato = Game.getPlayerByName(candidatoName);

    // Candidato desconectou ou tem 0 recursos agora (gastou nesse meio
    // tempo) — pula pro próximo sem perguntar.
    if (!candidato || candidato.waitingInLobby || candidato.recursos < 1) {
        fila.indice++;
        return enviarProximaOfertaAjuda();
    }

    Game.network.sendToPlayer(requester.peerId, {
        type: 'ajuda-tentando',
        candidatoName
    });

    Game.network.sendToPlayer(candidato.peerId, {
        type: 'ajuda-oferta',
        requesterName: requester.name
    });

    if (state.ajudaTimeout) clearTimeout(state.ajudaTimeout);
    state.ajudaTimeout = setTimeout(() => {
        handleAjudaOfertaResponse({ candidatoName, aceito: false, timeout: true });
    }, CONFIG.JOGO.ASSESSORIA_TIMEOUT);
}

/**
 * Host: processa a resposta (aceite/recusa/timeout) do candidato atual
 * da fila.
 */
function handleAjudaOfertaResponse(msg) {
    const state = Game.state;
    if (!state.isHost || !state.ajudaFila) return;

    const fila = state.ajudaFila;
    const candidatoAtual = fila.candidatos[fila.indice];
    if (msg.candidatoName !== candidatoAtual) return; // resposta atrasada de candidato já pulado

    if (state.ajudaTimeout) {
        clearTimeout(state.ajudaTimeout);
        state.ajudaTimeout = null;
    }

    if (!msg.aceito) {
        fila.indice++;
        enviarProximaOfertaAjuda();
        return;
    }

    processAjuda(candidatoAtual, fila.requesterName);
    state.ajudaFila = null;
}

/**
 * Host: executa a doação efetivamente (única fonte da verdade) —
 * mesma matemática da troca original, validação reaproveitada de
 * domain/tradeRules.js sem alteração.
 */
function processAjuda(doadorName, requesterName) {
    const state = Game.state;
    if (!state.isHost) return;

    const doador = Game.getPlayerByName(doadorName);
    const requester = Game.getPlayerByName(requesterName);

    const erro = Game.domain.trade.validarVenda(doador, requester, CONFIG);
    if (erro) {
        console.warn('⚠️ Ajuda cancelada na validação final:', erro);
        if (requester) {
            Game.network.sendToPlayer(requester.peerId, { type: 'ajuda-sem-candidatos', motivo: 'sem-doadores' });
        }
        return false;
    }

    doador.recursos--;
    doador.kpi += CONFIG.KPI.VALOR_VENDA_RECURSO;
    requester.recursos++;
    requester.kpi -= CONFIG.KPI.VALOR_VENDA_RECURSO;

    console.log('🆘 Ajuda: ' + doador.name + ' deu 1📦 para ' + requester.name + ' por ' + CONFIG.KPI.VALOR_VENDA_RECURSO + ' KPI');

    const confirmMsg = {
        type: 'ajuda-confirmada',
        doador: doador.name,
        requester: requester.name,
        valor: CONFIG.KPI.VALOR_VENDA_RECURSO,
        doadorKPI: doador.kpi,
        doadorRecursos: doador.recursos,
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
    pedirAjuda,
    handleAjudaRequest,
    handleAjudaOfertaResponse,
    processAjuda
};

// Game.core.* é o namespace usado por ui/ e network/ para chamar as
// funções deste engine — convenção de chamada entre camadas, não é
// compatibilidade temporária nem trabalho pendente (ver ARCHITECTURE.md).
window.Game.core = window.Game.core || {};
Object.assign(window.Game.core, window.Game.engine.trade);