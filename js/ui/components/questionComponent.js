// ============================================
// PM: The KPI Master - UI Component: Pergunta
// ============================================
// Exibição da rodada, da pergunta (perguntador/respondedor/espectador),
// o contador de tempo visível do Respondedor e a captura do clique na
// alternativa escolhida.
// Fase 5.4 do roadmap.
//
// 🆕 Contador do Respondedor: puramente visual/local — o timeout real
// que decide quando pular a vez continua em
// js/engine/turnEngine.js → armarRespostaTimeout() (autoridade do
// host). Este contador só espelha a mesma duração
// (CONFIG.JOGO.RESPOSTA_TIMEOUT) na tela de quem está respondendo,
// igual já existia para o contador da assessoria em advisoryModal.js.
// ============================================

let respostaCountdownInterval = null;

/**
 * Inicia (ou reinicia) o contador visível de tempo do Respondedor.
 */
function startRespostaCountdown() {
    const timerEl = document.getElementById('respostaTimerText');
    if (!timerEl) return;

    let seconds = Math.floor(CONFIG.JOGO.RESPOSTA_TIMEOUT / 1000);
    timerEl.style.display = 'block';
    timerEl.textContent = Game.i18n.t('question.tempoRestante', { seconds });

    clearInterval(respostaCountdownInterval);
    respostaCountdownInterval = setInterval(() => {
        seconds--;
        timerEl.textContent = Game.i18n.t('question.tempoRestante', { seconds: Math.max(seconds, 0) });
        if (seconds <= 0) {
            clearInterval(respostaCountdownInterval);
        }
    }, 1000);
}

/**
 * Para e esconde o contador visível de tempo do Respondedor — usado ao
 * responder, ou enquanto uma assessoria está pendente (o timeout real
 * também é pausado nesse período, ver turnEngine.js/advisoryEngine.js).
 */
function stopRespostaCountdown() {
    clearInterval(respostaCountdownInterval);
    respostaCountdownInterval = null;
    const timerEl = document.getElementById('respostaTimerText');
    if (timerEl) timerEl.style.display = 'none';
}

function displayRoundStart() {
    const round = Game.state.currentRound;
    if (!round) return;
    document.getElementById('questionArea').style.display = 'block';
    document.getElementById('spectatorArea').style.display = 'none';
    document.getElementById('perguntadorName').textContent = round.perguntador;
    document.getElementById('respondedorName').textContent = round.respondedor;
    if (round.evento) {
        document.getElementById('eventCard').style.display = 'flex';
        document.getElementById('eventTitle').textContent = round.evento.titulo;
        document.getElementById('eventDesc').textContent = round.evento.descricao;
    } else {
        document.getElementById('eventCard').style.display = 'none';
    }

    // Reseta UI de assessoria
    document.getElementById('modalAssessoriaSelect').style.display = 'none';
    document.getElementById('modalAssessoriaQuestion').style.display = 'none';
    const assessoriaArea = document.getElementById('assessoriaArea');
    if (assessoriaArea) assessoriaArea.style.display = 'none';

    // Reset defensivo da modal de resposta — displayQuestion() (chamada
    // logo em seguida, se este cliente for o Respondedor) é quem decide
    // se ela deve abrir de novo.
    document.getElementById('modalResponderPergunta').style.display = 'none';

    // Reset defensivo do contador — displayQuestion() (chamada logo em
    // seguida, se este cliente for o Respondedor) é quem decide se ele
    // deve ligar de novo.
    stopRespostaCountdown();
}

function displayQuestion(q) {
    const isPerg = Game.state.playerName === Game.state.currentRound?.perguntador;
    const isResp = Game.state.playerName === Game.state.currentRound?.respondedor;
    document.getElementById('questionText').textContent = q.pergunta;
    document.getElementById('badgeArea').textContent = q.area;
    document.getElementById('badgeGrupo').textContent = q.grupo;

    if (isResp && q.isRespondedor !== false) {
        document.getElementById('allAlternativesArea').style.display = 'none';
        document.getElementById('roleNotice').style.display = 'none';
        document.getElementById('respModalQuestionText').textContent = q.pergunta;
        document.getElementById('altA').textContent = q.alternativas[0];
        document.getElementById('altB').textContent = q.alternativas[1];
        document.getElementById('altC').textContent = q.alternativas[2];
        document.getElementById('altD').textContent = q.alternativas[3];

        const round = Game.state.currentRound;
        const jaRespondeu = !!round?.respondeu;
        const assessoriaPendente = round?.assessoria?.status === 'pending';
        document.querySelectorAll('.alternative-btn').forEach(b => {
            b.disabled = jaRespondeu || assessoriaPendente;
            b.className = 'alternative-btn';
        });

        // Abre a modal de resposta — mesmo padrão visual da modal de
        // assessoria. Fica aberta mesmo com assessoria pendente (só os
        // botões ficam desabilitados); só fecha ao responder (ver
        // handleAlternativeClick) ou ao trocar de papel/rodada.
        if (!jaRespondeu) {
            document.getElementById('modalResponderPergunta').style.display = 'flex';
        }

        // Contador visível de tempo: só corre enquanto o Respondedor
        // ainda pode responder (não respondeu e não há assessoria
        // pendente — mesmas condições em que o timeout real também
        // está ativo no host).
        if (jaRespondeu || assessoriaPendente) {
            stopRespostaCountdown();
        } else {
            startRespostaCountdown();
        }

        const me = Game.getPlayerByName(Game.state.playerName);
        const emEncerramento = me && Game.getFaseIndex(me.phase) === CONFIG.FASES.length - 1;
        const semAssessorDisponivel = Game.getActivePlayers().length < 3;
        const assessoriaArea = document.getElementById('assessoriaArea');
        if (assessoriaArea) {
            if (emEncerramento || semAssessorDisponivel || jaRespondeu) {
                assessoriaArea.style.display = round?.assessoria ? 'block' : 'none';
            } else {
                assessoriaArea.style.display = 'block';
            }

            if (round?.assessoria) {
                document.getElementById('btnPedirAssessoria').disabled = true;
                const st = round.assessoria;
                const statusEl = document.getElementById('assessoriaStatus');
                if (st.status === 'pending') {
                    statusEl.textContent = Game.i18n.t('advisory.aguardandoResposta', { assessor: st.assessorName });
                } else if (st.status === 'accepted') {
                    statusEl.textContent = Game.i18n.t('advisory.sugestao', { assessor: st.assessorName, sugestao: st.sugestao.toUpperCase() });
                } else if (st.status === 'declined') {
                    statusEl.textContent = Game.i18n.t('advisory.recusado', { assessor: st.assessorName });
                }
            } else if (!jaRespondeu) {
                document.getElementById('btnPedirAssessoria').disabled = false;
                document.getElementById('assessoriaStatus').textContent = '';
            }
        }
    } else if (isPerg || q.isPerguntador) {
        document.getElementById('modalResponderPergunta').style.display = 'none';
        document.getElementById('allAlternativesArea').style.display = 'block';
        document.getElementById('roleNotice').style.display = 'block';
        document.getElementById('roleNotice').innerHTML = Game.i18n.t('question.voceEstaPerguntando');
        document.getElementById('roleNotice').className = 'role-notice role-perguntador';
        document.getElementById('allAlternativesList').innerHTML = q.alternativas.map(alt => {
            const letter = alt.charAt(0).toLowerCase();
            const isCorrect = letter === q.correta;
            return `<div style="padding:12px 16px; background:${isCorrect ? 'rgba(0,255,136,0.12)' : 'rgba(255,255,255,0.03)'}; border:2px solid ${isCorrect ? 'rgba(0,255,136,0.4)' : 'rgba(255,255,255,0.08)'}; border-radius:10px; color:${isCorrect ? '#00ff88' : '#e0e0e0'}; font-size:0.9rem; ${isCorrect ? 'font-weight:600;' : ''}">${isCorrect ? '✅ ' : ''}${alt}</div>`;
        }).join('');

        const assessoriaAreaPerg = document.getElementById('assessoriaArea');
        if (assessoriaAreaPerg) assessoriaAreaPerg.style.display = 'none';
        stopRespostaCountdown();
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
    stopRespostaCountdown();
    document.getElementById('modalResponderPergunta').style.display = 'none';
    document.getElementById('questionArea').style.display = 'none';
    document.getElementById('spectatorArea').style.display = 'block';
    document.getElementById('spectatorMessage').textContent = Game.state.isHost
        ? Game.i18n.t('question.rodadaEncerradaHost')
        : Game.i18n.t('question.rodadaEncerradaGuest');
}

function displaySpectatorView(perguntador, respondedor) {
    document.getElementById('questionArea').style.display = 'none';
    document.getElementById('spectatorArea').style.display = 'block';
    document.getElementById('spectatorMessage').textContent = Game.i18n.t('spectator.aguardandoPergunta', { perguntador, respondedor });
    document.getElementById('modalResponderPergunta').style.display = 'none';
    const assessoriaArea = document.getElementById('assessoriaArea');
    if (assessoriaArea) assessoriaArea.style.display = 'none';
    stopRespostaCountdown();
}

function handleAlternativeClick(alt, btn) {
    const state = Game.state;
    if (!state.currentRound || state.currentRound.respondeu) return;
    if (state.playerName !== state.currentRound.respondedor) return;
    document.querySelectorAll('.alternative-btn').forEach(b => b.disabled = true);
    btn.classList.add('selected');
    stopRespostaCountdown();
    document.getElementById('modalResponderPergunta').style.display = 'none';
    if (state.isHost) {
        Game.core.handleAnswer({ alternativa: alt, playerName: state.playerName });
    } else {
        Game.network.sendToHost({ type: 'answer', alternativa: alt, playerName: state.playerName });
    }
    state.currentRound.respondeu = true;
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
    startRespostaCountdown,
    stopRespostaCountdown,
    showRoundEndedMessage
});