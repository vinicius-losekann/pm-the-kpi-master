// ============================================
// PM: The KPI Master - UI Component: Pergunta
// ============================================
// Exibição da rodada, da pergunta (perguntador/respondedor/espectador),
// o contador de tempo visível do Respondedor e a captura do clique na
// alternativa escolhida.
//
// 🆕 Contador do Respondedor: puramente visual/local — o timeout real
// que decide quando pular a vez continua em
// js/engine/turnEngine.js → armAnswerTimeout() (autoridade do
// host). Este contador só espelha a mesma duração
// (CONFIG.GAME.ANSWER_TIMEOUT) na tela de quem está respondendo,
// igual já existia para o contador da assessoria em advisoryModal.js.
// ============================================

let answerCountdownInterval = null;

/**
 * Inicia (ou reinicia) o contador visível de tempo do Respondedor.
 */
function startAnswerCountdown() {
    const timerEl = document.getElementById('answerTimerText');
    if (!timerEl) return;

    let seconds = Math.floor(CONFIG.GAME.ANSWER_TIMEOUT / 1000);
    timerEl.style.display = 'block';
    timerEl.textContent = Game.i18n.t('question.timeLeft', { seconds });

    clearInterval(answerCountdownInterval);
    answerCountdownInterval = setInterval(() => {
        seconds--;
        timerEl.textContent = Game.i18n.t('question.timeLeft', { seconds: Math.max(seconds, 0) });
        if (seconds <= 0) {
            clearInterval(answerCountdownInterval);
        }
    }, 1000);
}

/**
 * Para e esconde o contador visível de tempo do Respondedor — usado ao
 * responder, ou enquanto uma assessoria está pendente (o timeout real
 * também é pausado nesse período, ver turnEngine.js/advisoryEngine.js).
 */
function stopAnswerCountdown() {
    clearInterval(answerCountdownInterval);
    answerCountdownInterval = null;
    const timerEl = document.getElementById('answerTimerText');
    if (timerEl) timerEl.style.display = 'none';
}

function displayRoundStart() {
    const round = Game.state.currentRound;
    if (!round) return;
    document.getElementById('questionArea').style.display = 'block';
    document.getElementById('spectatorArea').style.display = 'none';
    document.getElementById('askerName').textContent = round.asker;
    document.getElementById('answererName').textContent = round.answerer;
    if (round.event) {
        document.getElementById('eventCard').style.display = 'flex';
        document.getElementById('eventTitle').textContent = round.event.title;
        document.getElementById('eventDesc').textContent = round.event.description;
    } else {
        document.getElementById('eventCard').style.display = 'none';
    }

    // Reseta UI de assessoria
    document.getElementById('modalAdvisorySelect').style.display = 'none';
    document.getElementById('modalAdvisoryQuestion').style.display = 'none';
    const advisoryArea = document.getElementById('advisoryArea');
    if (advisoryArea) advisoryArea.style.display = 'none';

    // Reset defensivo da modal de resposta — displayQuestion() (chamada
    // logo em seguida, se este cliente for o Respondedor) é quem decide
    // se ela deve abrir de novo.
    document.getElementById('modalAnswerQuestion').style.display = 'none';

    // Reset defensivo do contador — displayQuestion() (chamada logo em
    // seguida, se este cliente for o Respondedor) é quem decide se ele
    // deve ligar de novo.
    stopAnswerCountdown();
}

function displayQuestion(q) {
    const isAsker = Game.state.playerName === Game.state.currentRound?.asker;
    const isAnswerer = Game.state.playerName === Game.state.currentRound?.answerer;
    document.getElementById('questionText').textContent = q.question;
    document.getElementById('badgeDomain').textContent = q.domain;
    document.getElementById('badgeArea').textContent = q.area;

    if (isAnswerer && q.isAnswerer !== false) {
        document.getElementById('allAlternativesArea').style.display = 'none';
        document.getElementById('roleNotice').style.display = 'none';
        document.getElementById('answerModalQuestionText').textContent = q.question;
        document.getElementById('altA').textContent = q.alternatives[0];
        document.getElementById('altB').textContent = q.alternatives[1];
        document.getElementById('altC').textContent = q.alternatives[2];
        document.getElementById('altD').textContent = q.alternatives[3];

        const round = Game.state.currentRound;
        document.getElementById('answerModalAsker').textContent = round?.asker || '---';
        document.getElementById('answerModalAnswerer').textContent = round?.answerer || '---';
        const alreadyAnswered = !!round?.answered;
        const advisoryPending = round?.advisory?.status === 'pending';
        document.querySelectorAll('.alternative-btn').forEach(b => {
            b.disabled = alreadyAnswered || advisoryPending;
            b.className = 'alternative-btn';
        });

        // Abre a modal de resposta — mesmo padrão visual da modal de
        // assessoria. Fica aberta mesmo com assessoria pendente (só os
        // botões ficam desabilitados); só fecha ao responder (ver
        // handleAlternativeClick) ou ao trocar de papel/rodada.
        if (!alreadyAnswered) {
            document.getElementById('modalAnswerQuestion').style.display = 'flex';
        }

        // Contador visível de tempo: só corre enquanto o Respondedor
        // ainda pode responder (não respondeu e não há assessoria
        // pendente — mesmas condições em que o timeout real também
        // está ativo no host).
        if (alreadyAnswered || advisoryPending) {
            stopAnswerCountdown();
        } else {
            startAnswerCountdown();
        }

        const me = Game.getPlayerByName(Game.state.playerName);
        const inClosingFocusArea = me && Game.getFocusAreaIndex(me.focusArea) === CONFIG.FOCUS_AREAS.length - 1;
        const noAdvisorAvailable = Game.getActivePlayers().length < 3;
        // A assessoria tem honorário: com 0 recursos ou menos não se pede.
        const withoutResources = !!me && me.resources < 1;
        const advisoryArea = document.getElementById('advisoryArea');
        if (advisoryArea) {
            if (inClosingFocusArea || noAdvisorAvailable || alreadyAnswered || withoutResources) {
                advisoryArea.style.display = round?.advisory ? 'block' : 'none';
            } else {
                advisoryArea.style.display = 'block';
            }
            document.getElementById('advisoryFeeHint').textContent =
                Game.i18n.t('advisory.feeHint', { amount: CONFIG.RESOURCES.ADVISORY_FEE });

            if (round?.advisory) {
                document.getElementById('btnRequestAdvisory').disabled = true;
                const st = round.advisory;
                const statusEl = document.getElementById('advisoryStatus');
                if (st.status === 'pending') {
                    statusEl.textContent = Game.i18n.t('advisory.waitingForAnswer', { advisor: st.advisorName });
                } else if (st.status === 'accepted') {
                    statusEl.textContent = Game.i18n.t('advisory.suggestion', { advisor: st.advisorName, suggestion: st.suggestion.toUpperCase() });
                } else if (st.status === 'declined') {
                    statusEl.textContent = Game.i18n.t('advisory.declined', { advisor: st.advisorName });
                }
            } else if (!alreadyAnswered) {
                document.getElementById('btnRequestAdvisory').disabled = false;
                document.getElementById('advisoryStatus').textContent = '';
            }
        }
    } else if (isAsker || q.isAsker) {
        document.getElementById('modalAnswerQuestion').style.display = 'none';
        document.getElementById('allAlternativesArea').style.display = 'block';
        document.getElementById('roleNotice').style.display = 'block';
        document.getElementById('roleNotice').innerHTML = Game.i18n.t('question.youAreAsking');
        document.getElementById('roleNotice').className = 'role-notice role-asker';
        document.getElementById('allAlternativesList').innerHTML = q.alternatives.map(alt => {
            const letter = alt.charAt(0).toLowerCase();
            const isCorrect = letter === q.correct;
            return `<div style="padding:12px 16px; background:${isCorrect ? 'rgba(0,255,136,0.12)' : 'rgba(255,255,255,0.03)'}; border:2px solid ${isCorrect ? 'rgba(0,255,136,0.4)' : 'rgba(255,255,255,0.08)'}; border-radius:10px; color:${isCorrect ? '#00ff88' : '#e0e0e0'}; font-size:0.9rem; ${isCorrect ? 'font-weight:600;' : ''}">${isCorrect ? '✅ ' : ''}${alt}</div>`;
        }).join('');

        const askerAdvisoryArea = document.getElementById('advisoryArea');
        if (askerAdvisoryArea) askerAdvisoryArea.style.display = 'none';
        stopAnswerCountdown();
    }
}

/**
 * Exibe uma mensagem informando que a rodada vigente terminou (todos os
 * jogadores ativos já responderam) e que o host precisa iniciar uma
 * nova rodada. Mostrada para TODOS (perguntador, respondedor e
 * espectadores) — reaproveita a área de espectador como um mural
 * comum, já que não há mais papéis distintos até a próxima rodada.
 */
function showRoundEndedMessage() {
    stopAnswerCountdown();
    document.getElementById('modalAnswerQuestion').style.display = 'none';
    document.getElementById('questionArea').style.display = 'none';
    document.getElementById('spectatorArea').style.display = 'block';
    document.getElementById('spectatorMessage').textContent = Game.state.isHost
        ? Game.i18n.t('question.roundEndedHost')
        : Game.i18n.t('question.roundEndedGuest');
}

/**
 * Aviso de partida pausada — não há jogadores conectados
 * suficientes para formar uma dupla. A partida retoma sozinha quando
 * alguém reconectar (host: turnEngine.resumePausedMatch()).
 */
function showMatchPausedMessage() {
    stopAnswerCountdown();
    document.getElementById('modalAnswerQuestion').style.display = 'none';
    document.getElementById('questionArea').style.display = 'none';
    document.getElementById('spectatorArea').style.display = 'block';
    document.getElementById('spectatorMessage').textContent = Game.i18n.t('question.matchPaused');
}

function displaySpectatorView(asker, answerer) {
    document.getElementById('questionArea').style.display = 'none';
    document.getElementById('spectatorArea').style.display = 'block';
    document.getElementById('spectatorMessage').textContent = Game.i18n.t('spectator.waitingForQuestion', { asker, answerer });
    document.getElementById('modalAnswerQuestion').style.display = 'none';
    const advisoryArea = document.getElementById('advisoryArea');
    if (advisoryArea) advisoryArea.style.display = 'none';
    stopAnswerCountdown();
}

function handleAlternativeClick(alt, btn) {
    const state = Game.state;
    if (!state.currentRound || state.currentRound.answered) return;
    if (state.playerName !== state.currentRound.answerer) return;
    document.querySelectorAll('.alternative-btn').forEach(b => b.disabled = true);
    btn.classList.add('selected');
    stopAnswerCountdown();
    document.getElementById('modalAnswerQuestion').style.display = 'none';
    if (state.isHost) {
        Game.core.handleAnswer({ alternative: alt, playerName: state.playerName });
    } else {
        Game.network.sendToHost({ type: 'answer', alternative: alt, playerName: state.playerName });
    }
    state.currentRound.answered = true;
}

// ============================================
// EXPORTAÇÃO
// ============================================
window.Game = window.Game || {};
window.Game.ui = window.Game.ui || {};
Object.assign(window.Game.ui, {
    displayRoundStart,
    displayQuestion,
    displaySpectatorView,
    handleAlternativeClick,
    startAnswerCountdown,
    stopAnswerCountdown,
    showRoundEndedMessage,
    showMatchPausedMessage
});