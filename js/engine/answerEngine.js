// ============================================
// PM: The KPI Master - Engine: Resposta
// ============================================
// Orquestra o processamento da resposta do Respondedor: valida a
// rodada, delega o CÁLCULO ao js/domain/kpiRules.js e
// js/domain/advisoryRules.js, e coordena rede/UI/estado.
// ============================================

/**
 * Processa a resposta do Respondedor, atualiza KPI, recursos e área foco.
 * Pode ser chamada pelo host (para sua própria resposta) ou por um guest
 * (que envia via rede, e o host executa esta função).
 */
function handleAnswer(msg) {
    const state = Game.state;

    if (!state.currentRound) {
        console.warn('⚠️ handleAnswer chamado sem rodada ativa — ignorando (provavelmente resposta atrasada).');
        return;
    }

    const { respondedor: answererName } = state.currentRound;

    if (msg.playerName !== answererName) {
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
    const advisoryPending = state.currentRound.assessoria &&
        state.currentRound.assessoria.status === 'pending';
    if (advisoryPending) {
        console.log('⏳ Resposta recebida com assessoria pendente — aguardando resolução...');
        state.currentRound.pendingAnswer = msg;
        return;
    }

    state.currentRound.respondeu = true;

    const { pergunta: question, evento: event } = state.currentRound;
    const isCorrect = msg.alternativa === question.correct;
    const answerer = Game.getPlayerByName(answererName);

    if (!answerer) {
        console.warn('⚠️ Respondedor não encontrado (provavelmente desconectou) — abortando rodada.');
        state.currentRound = null;
        if (state.isHost) setTimeout(() => Game.engine.turn.pickNewPair(), 500);
        Game.saveState();
        return;
    }

    const hasReserve = event?.reserva_contingencia === true;

    // Ninguém pula a vez por falta de recurso — qualquer jogador ativo
    // sempre tenta responder, mesmo com 0 recursos. O gasto de recurso
    // depende do resultado (só erro gasta, protegido pela reserva de
    // contingência), por isso é decidido dentro de
    // calculateAnswerResult() e aplicado depois.

    // Cálculo puro delegado a domain/kpiRules.js
    const result = Game.domain.kpi.calculateAnswerResult({
        chosenAlternative: msg.alternativa,
        correct: question.correct,
        currentKpi: answerer.kpi,
        focusAreaId: answerer.phase,
        activities: answerer.activities,
        hasReserve,
        config: CONFIG,
        focusAreas: CONFIG.FASES
    });

    const kpiGained = result.kpiGained;
    answerer.kpi = result.newKpi;
    answerer.phase = result.newFocusArea;
    answerer.activities = result.newActivities;

    // Nunca fica negativo — se já estava em 0 e errou de novo, só não perde
    // recurso nenhum, sem penalidade extra.
    if (result.spendsResource) {
        answerer.recursos = Math.max(0, answerer.recursos - 1);
    }

    const reserveNote = hasReserve ? ' (reserva de contingência)' : '';
    console.log('📊 ' + (isCorrect ? '✅ Acertou' : '❌ Errou') + ' | Recursos: ' + answerer.recursos + reserveNote + ' | KPI: ' + answerer.kpi);

    // Quem respondeu entra no rodízio ANTES do aviso aos
    // guests — o 'kpi-update' leva a lista (`respondidos`). Se o host
    // cair logo depois, quem assumir já sabe quem respondeu nesta rodada.
    state.usedRespondedorThisRound.push(answererName);

    Game.network.broadcastAll({
        type: 'kpi-update',
        playerName: answererName,
        kpi: answerer.kpi,
        phase: answerer.phase,
        activities: answerer.activities,
        recursos: answerer.recursos,
        acertou: isCorrect,
        kpiGanho: kpiGained,
        respondidos: state.usedRespondedorThisRound.slice()
    });

    if (state.isHost && answererName === state.playerName) {
        updatePlayerKPI({
            playerName: answererName,
            kpi: answerer.kpi,
            phase: answerer.phase,
            activities: answerer.activities,
            recursos: answerer.recursos,
            acertou: isCorrect,
            kpiGanho: kpiGained
        });
    }

    // Bônus de assessoria (se a sugestão foi seguida e correta) — cálculo
    // puro delegado a domain/advisoryRules.js
    const advisory = state.currentRound.assessoria;
    const advisorBonus = Game.domain.advisory.calculateAdvisorBonus(advisory, msg.alternativa, isCorrect, CONFIG);
    if (advisorBonus > 0) {
        const advisor = Game.getPlayerByName(advisory.assessorName);
        if (advisor) {
            advisor.kpi += advisorBonus;
            console.log('🧭 Assessoria: ' + advisor.name + ' +' + advisorBonus + ' KPI');

            Game.network.broadcastAll({
                type: 'kpi-update',
                playerName: advisor.name,
                kpi: advisor.kpi,
                phase: advisor.phase,
                activities: advisor.activities,
                recursos: advisor.recursos,
                assessoriaBonus: advisorBonus
            });

            if (state.isHost && advisor.name === state.playerName) {
                updatePlayerKPI({
                    playerName: advisor.name,
                    kpi: advisor.kpi,
                    phase: advisor.phase,
                    activities: advisor.activities,
                    recursos: advisor.recursos,
                    assessoriaBonus: advisorBonus
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

    const areaIndex = Game.getFocusAreaIndex(answerer.phase);
    if (areaIndex === CONFIG.FASES.length - 1 && answerer.activities >= CONFIG.JOGO.ACTIVITIES_PER_PHASE) {
        setTimeout(() => Game.engine.session.endGame(Game.engine.session.buildRanking()), 3000);
    } else {
        setTimeout(() => Game.engine.turn.nextTurn(), 3000);
    }

    Game.saveState();
}

/**
 * Atualiza a interface do jogador com seus novos valores de KPI, área foco etc.
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
