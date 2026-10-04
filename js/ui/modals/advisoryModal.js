// ============================================
// PM: The KPI Master - UI Modal: Assessoria
// ============================================
// Cobre a seleção do assessor, a pergunta enviada ao assessor e a
// exibição do resultado (sugestão, recusa ou timeout).
// ============================================

let advisoryCountdownInterval = null;

function showAdvisorySelectModal() {
    const state = Game.state;
    const round = state.currentRound;
    if (!round) return;

    const candidates = Game.getActivePlayers().filter(p =>
        p.name !== round.perguntador && p.name !== state.playerName
    );

    if (candidates.length === 0) {
        alert(Game.i18n.t('advisory.nenhumJogadorDisponivel'));
        return;
    }

    document.getElementById('assessoriaJogadoresList').innerHTML = candidates.map(p => `
        <button class="btn btn-glass assessor-select-btn" data-assessor-name="${Game.sanitize.escapeHtml(p.name)}"
                style="display:flex; justify-content:space-between; align-items:center; padding:10px 14px;">
            <span>${Game.sanitize.escapeHtml(p.name)}</span>
            <span style="font-size:0.8rem; color:#a0a0b8;">${Game.getFocusAreaById(p.phase).emoji}</span>
        </button>
    `).join('');

    // 🔴 Correção de segurança: nome do jogador vinha interpolado direto
    // em onclick="Game.ui.chooseAdvisor('${p.name}')". Escapar HTML
    // (&#39; etc.) NÃO protege esse caso — o navegador decodifica as
    // entidades antes de rodar o JS do onclick, reintroduzindo a aspas.
    // Por isso trocamos para data-attribute + addEventListener.
    document.querySelectorAll('#assessoriaJogadoresList .assessor-select-btn').forEach(btn => {
        btn.addEventListener('click', () => chooseAdvisor(btn.dataset.assessorName));
    });

    document.getElementById('modalAssessoriaSelect').style.display = 'flex';
}

function chooseAdvisor(advisorName) {
    document.getElementById('modalAssessoriaSelect').style.display = 'none';
    const ok = Game.core.requestAdvisory(advisorName);
    if (ok) {
        document.getElementById('btnPedirAssessoria').disabled = true;
        document.getElementById('assessoriaStatus').textContent = Game.i18n.t('advisory.aguardandoResposta', { assessor: advisorName });
        document.querySelectorAll('.alternative-btn').forEach(b => b.disabled = true);

        if (Game.state.currentRound) {
            Game.state.currentRound.assessoria = {
                assessorName: advisorName,
                status: 'pending',
                sugestao: null
            };
        }
    }
}

function showAdvisoryStarted(msg) {
    const state = Game.state;
    if (state.playerName === state.currentRound?.respondedor) {
        document.getElementById('btnPedirAssessoria').disabled = true;
        document.getElementById('assessoriaStatus').textContent = Game.i18n.t('advisory.aguardandoResposta', { assessor: msg.assessorName });

        if (state.currentRound) {
            state.currentRound.assessoria = {
                assessorName: msg.assessorName,
                status: 'pending',
                sugestao: null
            };
        }
    }
}

function showAdvisoryQuestionModal(msg) {
    const round = Game.state.currentRound;
    document.getElementById('assessoriaModalPerguntador').textContent = round?.perguntador || '---';
    document.getElementById('assessoriaModalRespondedor').textContent = round?.respondedor || '---';
    document.getElementById('assessoriaQuestionText').textContent = msg.question;
    document.getElementById('assessoriaAlternativesList').innerHTML = msg.alternatives.map(alt => {
        const letter = alt.charAt(0).toLowerCase();
        return `<button class="btn btn-glass" onclick="Game.ui.answerAdvisory('${letter}', false)"
                    style="text-align:left; padding:10px 14px;">${alt}</button>`;
    }).join('');

    let seconds = Math.floor(CONFIG.JOGO.ASSESSORIA_TIMEOUT / 1000);
    document.getElementById('assessoriaTimerText').textContent = Game.i18n.t('advisory.tempoRestante', { seconds });

    clearInterval(advisoryCountdownInterval);
    advisoryCountdownInterval = setInterval(() => {
        seconds--;
        document.getElementById('assessoriaTimerText').textContent = Game.i18n.t('advisory.tempoRestante', { seconds: Math.max(seconds, 0) });
        if (seconds <= 0) {
            clearInterval(advisoryCountdownInterval);
            document.getElementById('modalAssessoriaQuestion').style.display = 'none';
        }
    }, 1000);

    document.getElementById('modalAssessoriaQuestion').style.display = 'flex';
}

function answerAdvisory(alternative, declined) {
    clearInterval(advisoryCountdownInterval);
    document.getElementById('modalAssessoriaQuestion').style.display = 'none';

    const state = Game.state;
    const msg = { type: 'assessoria-answer', alternativa: alternative, recusado: !!declined };

    if (state.isHost) {
        Game.core.handleAdvisoryAnswer(msg);
    } else {
        Game.network.sendToHost(msg);
    }
}

function showAdvisoryResult(msg) {
    const state = Game.state;
    if (state.playerName !== state.currentRound?.respondedor) return;

    const statusEl = document.getElementById('assessoriaStatus');
    if (!statusEl) return;

    if (state.currentRound?.assessoria) {
        state.currentRound.assessoria.status = msg.recusado ? 'declined' : 'accepted';
        state.currentRound.assessoria.sugestao = msg.recusado ? null : msg.sugestao;
    }

    if (msg.recusado) {
        if (msg.invalido && msg.motivo === 'fase-encerramento') {
            statusEl.textContent = Game.i18n.t('advisory.faseEncerramento');
        } else if (msg.invalido) {
            statusEl.textContent = Game.i18n.t('advisory.invalido', { assessor: msg.assessorName });
        } else if (msg.timeout) {
            statusEl.textContent = Game.i18n.t('advisory.timeout', { assessor: msg.assessorName });
        } else {
            statusEl.textContent = Game.i18n.t('advisory.recusado', { assessor: msg.assessorName });
        }
    } else {
        statusEl.textContent = Game.i18n.t('advisory.sugestao', { assessor: msg.assessorName, sugestao: msg.sugestao.toUpperCase() });
    }

    if (!state.currentRound.respondeu) {
        document.querySelectorAll('.alternative-btn').forEach(b => b.disabled = false);
    }

    if (msg.invalido && msg.motivo !== 'fase-encerramento') {
        const requestButton = document.getElementById('btnPedirAssessoria');
        if (requestButton && !state.currentRound.respondeu) requestButton.disabled = false;

        if (state.currentRound) {
            state.currentRound.assessoria = null;
        }
    }
}

// ============================================
// EXPORTAÇÃO
// ============================================
window.Game = window.Game || {};
window.Game.ui = window.Game.ui || {};
Object.assign(window.Game.ui, {
    showAdvisorySelectModal,
    chooseAdvisor,
    showAdvisoryStarted,
    showAdvisoryQuestionModal,
    answerAdvisory,
    showAdvisoryResult
});