// ============================================
// PM: The KPI Master - Engine: Resposta
// ============================================
// Orquestra o processamento da resposta do Respondedor: valida a
// rodada, delega o CÁLCULO ao js/domain/kpiRules.js e
// js/domain/advisoryRules.js, e coordena rede/UI/estado.
// Fase 3.3 do roadmap.
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
    const acertou = msg.alternativa === pergunta.correta;
    const respondedor = Game.getPlayerByName(respondedorName);

    if (!respondedor) {
        console.warn('⚠️ Respondedor não encontrado (provavelmente desconectou) — abortando rodada.');
        state.currentRound = null;
        if (state.isHost) setTimeout(() => Game.engine.turn.pickNewPair(), 500);
        Game.saveState();
        return;
    }

    const temReserva = evento?.reserva_contingencia === true;
    const gastaRecurso = !temReserva;

    if (respondedor.recursos <= 0 && !temReserva) {
        console.warn('⚠️ ' + respondedorName + ' sem recursos! Pulando vez.');
        Game.network.broadcastAll({
            type: 'kpi-update',
            playerName: respondedorName,
            kpi: respondedor.kpi,
            phase: respondedor.phase,
            activities: respondedor.activities,
            recursos: respondedor.recursos,
            acertou: false,
            kpiGanho: 0,
            semRecursos: true
        });
        state.usedRespondedorThisRound.push(respondedorName);
        setTimeout(() => Game.engine.turn.nextTurn(), 2000);
        Game.saveState();
        return;
    }

    if (gastaRecurso) {
        respondedor.recursos--;
    }

    // Cálculo puro delegado a domain/kpiRules.js
    const resultado = Game.domain.kpi.calcularResultadoResposta({
        alternativaEscolhida: msg.alternativa,
        correta: pergunta.correta,
        kpiAtual: respondedor.kpi,
        phaseId: respondedor.phase,
        activities: respondedor.activities,
        temReserva,
        config: CONFIG,
        fases: CONFIG.FASES
    });

    const kpiGanho = resultado.kpiGanho;
    respondedor.kpi = resultado.novoKpi;
    respondedor.phase = resultado.novaFase;
    respondedor.activities = resultado.novasActivities;

    const seguroMsg = temReserva ? ' (reserva de contingência)' : '';
    console.log('📊 ' + (acertou ? '✅ Acertou' : '❌ Errou') + ' | Recursos: ' + respondedor.recursos + seguroMsg + ' | KPI: ' + respondedor.kpi);

    Game.network.broadcastAll({
        type: 'kpi-update',
        playerName: respondedorName,
        kpi: respondedor.kpi,
        phase: respondedor.phase,
        activities: respondedor.activities,
        recursos: respondedor.recursos,
        acertou,
        kpiGanho
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

    // 🐛 Correção (ver ISSUES.md BUG-007): broadcastAll() não manda a
    // mensagem de volta pro próprio host — updatePlayerKPI() só rodava
    // localmente quando o HOST era quem tinha respondido. Quando um
    // guest respondia, os dados internos do host ficavam corretos, mas
    // o ranking exibido na tela do host nunca era redesenhado. A
    // atualização de tela abaixo (perto do fim da função) cobre tanto
    // o respondedor quanto o bônus de assessoria.

    // Bônus de assessoria (se a sugestão foi seguida e correta) — cálculo
    // puro delegado a domain/advisoryRules.js
    const assessoria = state.currentRound.assessoria;
    const bonusAssessor = Game.domain.advisory.calcularBonusAssessor(assessoria, msg.alternativa, acertou, CONFIG);
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

    state.usedRespondedorThisRound.push(respondedorName);

    // Atualização de tela do host (ver ISSUES.md BUG-007): cobre tanto o
    // respondedor quanto o bônus de assessoria acima, para os casos em
    // que nenhum dos dois é o próprio host (broadcastAll não se
    // auto-envia, então sem isso o ranking do host fica desatualizado).
    if (state.isHost) {
        Game.ui.syncPlayerViews(null);
    }

    const faseIdx = Game.getFaseIndex(respondedor.phase);
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
        if (msg.semRecursos) {
            Game.ui.showResultModal(false, 0, msg.recursos);
            const resultMsg = document.getElementById('resultMessage');
            if (resultMsg) resultMsg.textContent = Game.i18n.t('result.semRecursosVezPulada');
        } else if (msg.acertou !== undefined) {
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
// compatibilidade temporária nem trabalho pendente (ver ARCHITECTURE.md).
window.Game.core = window.Game.core || {};
Object.assign(window.Game.core, window.Game.engine.answer);