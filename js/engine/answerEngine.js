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

    const { answerer: answererName } = state.currentRound;

    if (msg.playerName !== answererName) {
        console.warn('⚠️ Resposta ignorada: jogador não é o respondedor da rodada.');
        return;
    }

    if (state.currentRound.answered) {
        console.warn('⚠️ Rodada já foi respondida!');
        return;
    }

    // Cancela o timeout de segurança, pois a resposta chegou
    if (state.answerTimeout) {
        clearTimeout(state.answerTimeout);
        state.answerTimeout = null;
    }

    // Se há assessoria pendente, aguarda a resolução
    const advisoryPending = state.currentRound.advisory &&
        state.currentRound.advisory.status === 'pending';
    if (advisoryPending) {
        console.log('⏳ Resposta recebida com assessoria pendente — aguardando resolução...');
        state.currentRound.pendingAnswer = msg;
        return;
    }

    state.currentRound.answered = true;

    const { question, event } = state.currentRound;
    const isCorrect = msg.alternative === question.correct;
    const answerer = Game.getPlayerByName(answererName);

    if (!answerer) {
        console.warn('⚠️ Respondedor não encontrado (provavelmente desconectou) — abortando rodada.');
        state.currentRound = null;
        if (state.isHost) setTimeout(() => Game.engine.turn.pickNewPair(), 500);
        Game.saveState();
        return;
    }

    const hasReserve = event?.contingencyReserve === true;

    // Ninguém pula a vez por falta de recurso — qualquer jogador ativo
    // sempre tenta responder, mesmo com 0 recursos. O gasto de recurso
    // depende do resultado (só erro gasta, protegido pela reserva de
    // contingência), por isso é decidido dentro de
    // calculateAnswerResult() e aplicado depois.

    // Cálculo puro delegado a domain/kpiRules.js
    const result = Game.domain.kpi.calculateAnswerResult({
        chosenAlternative: msg.alternative,
        correct: question.correct,
        currentKpi: answerer.kpi,
        focusAreaId: answerer.focusArea,
        activities: answerer.activities,
        hasReserve,
        config: CONFIG,
        focusAreas: CONFIG.FOCUS_AREAS
    });

    const kpiGained = result.kpiGained;
    answerer.kpi = result.newKpi;
    answerer.focusArea = result.newFocusArea;
    answerer.activities = result.newActivities;

    // Sem piso: errar com 0 recursos vai a −1, com −1 a −2 (estouro de
    // orçamento). O negativo desconta no KPI Final (domain/rankingRules.js).
    if (result.spendsResource) {
        answerer.resources -= 1;
    }

    const reserveNote = hasReserve ? ' (reserva de contingência)' : '';
    console.log('📊 ' + (isCorrect ? '✅ Acertou' : '❌ Errou') + ' | Recursos: ' + answerer.resources + reserveNote + ' | KPI: ' + answerer.kpi);

    // Quem respondeu entra no rodízio ANTES do aviso aos
    // guests — o 'kpi-update' leva a lista (`answeredThisRound`). Se o host
    // cair logo depois, quem assumir já sabe quem respondeu nesta rodada.
    state.answeredThisRound.push(answererName);

    Game.network.broadcastAll({
        type: 'kpi-update',
        playerName: answererName,
        kpi: answerer.kpi,
        focusArea: answerer.focusArea,
        activities: answerer.activities,
        resources: answerer.resources,
        isCorrect,
        kpiGained,
        answeredThisRound: state.answeredThisRound.slice()
    });

    if (state.isHost && answererName === state.playerName) {
        updatePlayerKPI({
            playerName: answererName,
            kpi: answerer.kpi,
            focusArea: answerer.focusArea,
            activities: answerer.activities,
            resources: answerer.resources,
            isCorrect,
            kpiGained
        });
    }

    // Bônus de assessoria (se a sugestão foi seguida e correta) — cálculo
    // puro delegado a domain/advisoryRules.js
    const advisory = state.currentRound.advisory;
    const advisorBonus = Game.domain.advisory.calculateAdvisorBonus(advisory, msg.alternative, isCorrect, CONFIG);
    if (advisorBonus > 0) {
        const advisor = Game.getPlayerByName(advisory.advisorName);
        if (advisor) {
            advisor.kpi += advisorBonus;
            console.log('🧭 Assessoria: ' + advisor.name + ' +' + advisorBonus + ' KPI');

            Game.network.broadcastAll({
                type: 'kpi-update',
                playerName: advisor.name,
                kpi: advisor.kpi,
                focusArea: advisor.focusArea,
                activities: advisor.activities,
                resources: advisor.resources,
                advisorBonus: advisorBonus
            });

            if (state.isHost && advisor.name === state.playerName) {
                updatePlayerKPI({
                    playerName: advisor.name,
                    kpi: advisor.kpi,
                    focusArea: advisor.focusArea,
                    activities: advisor.activities,
                    resources: advisor.resources,
                    advisorBonus: advisorBonus
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

    const areaIndex = Game.getFocusAreaIndex(answerer.focusArea);
    if (areaIndex === CONFIG.FOCUS_AREAS.length - 1 && answerer.activities >= CONFIG.GAME.ACTIVITIES_PER_FOCUS_AREA) {
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
        player.focusArea = msg.focusArea;
        player.activities = msg.activities;
        if (msg.resources !== undefined) player.resources = msg.resources;
    }

    Game.ui.syncPlayerViews({ ...msg, name: msg.playerName });

    if (msg.playerName === state.playerName) {
        if (msg.isCorrect !== undefined) {
            Game.ui.showResultModal(msg.isCorrect, msg.kpiGained, msg.resources);
        } else if (msg.advisorBonus) {
            Game.ui.showAdvisoryBonusModal(msg.advisorBonus);
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
