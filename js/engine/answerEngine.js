// ============================================
// PM: The KPI Master - Engine: Resposta
// ============================================
// Orquestra o processamento da resposta do Respondedor: valida a
// rodada, delega o CÁLCULO ao js/domain/kpiRules.js e
// js/domain/advisoryRules.js, e coordena rede/UI/estado.
// ============================================

/**
 * Processa a resposta do Respondedor, atualiza KPI, recursos e fase.
 * Pode ser chamada pelo host (para sua própria resposta) ou por um guest
 * (que envia via rede, e o host executa esta função).
 */
function handleAnswer(msg) {
    const state = Game.state;

    if (!state.currentRound) {
        console.warn('⚠️ handleAnswer chamado sem rodada ativa — ignorando (provavelmente resposta atrasada).');
        return;
    }

    const { respondedor: respondedorName } = state.currentRound;

    if (msg.playerName !== respondedorName) {
        console.warn('⚠️ Resposta ignorada: jogador não é o respondedor da rodada.');
        return;
    }

    if (state.currentRound.respondeu) {
        console.warn('⚠️ Rodada já foi respondida!');
        return;
    }

    // Cancela o timeout de segurança, pois a resposta chegou
    if (state.respostaTimeout) {
        clearTimeout(state.respostaTimeout);
        state.respostaTimeout = null;
    }

    // Se há assessoria pendente, aguarda a resolução
    const assessoriaPendente = state.currentRound.assessoria &&
        state.currentRound.assessoria.status === 'pending';
    if (assessoriaPendente) {
        console.log('⏳ Resposta recebida com assessoria pendente — aguardando resolução...');
        state.currentRound.pendingAnswer = msg;
        return;
    }

    state.currentRound.respondeu = true;

    const { pergunta, evento } = state.currentRound;
    const acertou = msg.alternativa === pergunta.correct;
    const respondedor = Game.getPlayerByName(respondedorName);

    if (!respondedor) {
        console.warn('⚠️ Respondedor não encontrado (provavelmente desconectou) — abortando rodada.');
        state.currentRound = null;
        if (state.isHost) setTimeout(() => Game.engine.turn.pickNewPair(), 500);
        Game.saveState();
        return;
    }

    const temReserva = evento?.reserva_contingencia === true;

    // Ninguém pula a vez por falta de recurso — qualquer jogador ativo
    // sempre tenta responder, mesmo com 0 recursos. O gasto de recurso
    // depende do resultado (só erro gasta, protegido pela reserva de
    // contingência), por isso é decidido dentro de
    // calculateAnswerResult() e aplicado depois.

    // Cálculo puro delegado a domain/kpiRules.js
    const resultado = Game.domain.kpi.calculateAnswerResult({
        chosenAlternative: msg.alternativa,
        correct: pergunta.correct,
        currentKpi: respondedor.kpi,
        focusAreaId: respondedor.phase,
        activities: respondedor.activities,
        hasReserve: temReserva,
        config: CONFIG,
        focusAreas: CONFIG.FASES
    });

    const kpiGanho = resultado.kpiGained;
    respondedor.kpi = resultado.newKpi;
    respondedor.phase = resultado.newFocusArea;
    respondedor.activities = resultado.newActivities;

    // Nunca fica negativo — se já estava em 0 e errou de novo, só não perde
    // recurso nenhum, sem penalidade extra.
    if (resultado.spendsResource) {
        respondedor.recursos = Math.max(0, respondedor.recursos - 1);
    }

    const seguroMsg = temReserva ? ' (reserva de contingência)' : '';
    console.log('📊 ' + (acertou ? '✅ Acertou' : '❌ Errou') + ' | Recursos: ' + respondedor.recursos + seguroMsg + ' | KPI: ' + respondedor.kpi);

    // Quem respondeu entra no rodízio ANTES do aviso aos
    // guests — o 'kpi-update' leva a lista (`respondidos`). Se o host
    // cair logo depois, quem assumir já sabe quem respondeu nesta rodada.
    state.usedRespondedorThisRound.push(respondedorName);

    Game.network.broadcastAll({
        type: 'kpi-update',
        playerName: respondedorName,
        kpi: respondedor.kpi,
        phase: respondedor.phase,
        activities: respondedor.activities,
        recursos: respondedor.recursos,
        acertou,
        kpiGanho,
        respondidos: state.usedRespondedorThisRound.slice()
    });

    if (state.isHost && respondedorName === state.playerName) {
        updatePlayerKPI({
            playerName: respondedorName,
            kpi: respondedor.kpi,
            phase: respondedor.phase,
            activities: respondedor.activities,
            recursos: respondedor.recursos,
            acertou,
            kpiGanho
        });
    }

    // Bônus de assessoria (se a sugestão foi seguida e correta) — cálculo
    // puro delegado a domain/advisoryRules.js
    const assessoria = state.currentRound.assessoria;
    const bonusAssessor = Game.domain.advisory.calculateAdvisorBonus(assessoria, msg.alternativa, acertou, CONFIG);
    if (bonusAssessor > 0) {
        const assessor = Game.getPlayerByName(assessoria.assessorName);
        if (assessor) {
            assessor.kpi += bonusAssessor;
            console.log('🧭 Assessoria: ' + assessor.name + ' +' + bonusAssessor + ' KPI');

            Game.network.broadcastAll({
                type: 'kpi-update',
                playerName: assessor.name,
                kpi: assessor.kpi,
                phase: assessor.phase,
                activities: assessor.activities,
                recursos: assessor.recursos,
                assessoriaBonus: bonusAssessor
            });

            if (state.isHost && assessor.name === state.playerName) {
                updatePlayerKPI({
                    playerName: assessor.name,
                    kpi: assessor.kpi,
                    phase: assessor.phase,
                    activities: assessor.activities,
                    recursos: assessor.recursos,
                    assessoriaBonus: bonusAssessor
                });
            }
        }
    }

    // Atualização de tela do host: cobre tanto o
    // respondedor quanto o bônus de assessoria acima, para os casos em
    // que nenhum dos dois é o próprio host (broadcastAll não se
    // auto-envia, então sem isso o ranking do host fica desatualizado).
    if (state.isHost) {
        Game.ui.syncPlayerViews(null);
    }

    const faseIdx = Game.getFocusAreaIndex(respondedor.phase);
    if (faseIdx === CONFIG.FASES.length - 1 && respondedor.activities >= CONFIG.JOGO.ACTIVITIES_PER_PHASE) {
        setTimeout(() => Game.engine.session.endGame(Game.engine.session.buildRanking()), 3000);
    } else {
        setTimeout(() => Game.engine.turn.nextTurn(), 3000);
    }

    Game.saveState();
}

/**
 * Atualiza a interface do jogador com seus novos valores de KPI, fase, etc.
 * (Orquestração/UI — não é uma mutação pura de estado, por isso fica no
 * engine em vez de state/mutations.js: mexe diretamente no DOM e chama Game.ui.)
 */
function updatePlayerKPI(msg) {
    const state = Game.state;
    const player = Game.getPlayerByName(msg.playerName);

    if (player) {
        player.kpi = msg.kpi;
        player.phase = msg.phase;
        player.activities = msg.activities;
        if (msg.recursos !== undefined) player.recursos = msg.recursos;
    }

    Game.ui.syncPlayerViews({ ...msg, name: msg.playerName });

    if (msg.playerName === state.playerName) {
        if (msg.acertou !== undefined) {
            Game.ui.showResultModal(msg.acertou, msg.kpiGanho, msg.recursos);
        } else if (msg.assessoriaBonus) {
            Game.ui.showAssessoriaBonusModal(msg.assessoriaBonus);
        }
    }
}

// ============================================
// EXPORTAÇÃO
// ============================================
window.Game = window.Game || {};
window.Game.engine = window.Game.engine || {};
window.Game.engine.answer = {
    handleAnswer,
    updatePlayerKPI
};

// Game.core.* é o namespace usado por ui/ e network/ para chamar as
// funções deste engine — convenção de chamada entre camadas, não é
// compatibilidade temporária nem trabalho pendente (ver _docs/architecture.md).
window.Game.core = window.Game.core || {};
Object.assign(window.Game.core, window.Game.engine.answer);