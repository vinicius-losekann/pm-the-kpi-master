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
        p.name !== round.asker && p.name !== state.playerName
    );

    if (candidates.length === 0) {
        alert(Game.i18n.t('advisory.noAdvisorAvailable'));
        return;
    }

    document.getElementById('advisoryPlayersList').innerHTML = candidates.map(p => `
        <button class="btn btn-glass advisor-select-btn" data-advisor-name="${Game.sanitize.escapeHtml(p.name)}"
                style="display:flex; justify-content:space-between; align-items:center; padding:10px 14px;">
            <span>${Game.sanitize.escapeHtml(p.name)}</span>
            <span style="font-size:0.8rem; color:#a0a0b8;">${Game.getFocusAreaById(p.focusArea).emoji}</span>
        </button>
    `).join('');

    // 🔴 Correção de segurança: nome do jogador vinha interpolado direto
    // em onclick="Game.ui.chooseAdvisor('${p.name}')". Escapar HTML
    // (&#39; etc.) NÃO protege esse caso — o navegador decodifica as
    // entidades antes de rodar o JS do onclick, reintroduzindo a aspas.
    // Por isso trocamos para data-attribute + addEventListener.
    document.querySelectorAll('#advisoryPlayersList .advisor-select-btn').forEach(btn => {
        btn.addEventListener('click', () => chooseAdvisor(btn.dataset.advisorName));
    });

    document.getElementById('modalAdvisorySelect').style.display = 'flex';
}

function chooseAdvisor(advisorName) {
    document.getElementById('modalAdvisorySelect').style.display = 'none';
    const ok = Game.core.requestAdvisory(advisorName);
    if (ok) {
        document.getElementById('btnRequestAdvisory').disabled = true;
        document.getElementById('advisoryStatus').textContent = Game.i18n.t('advisory.waitingForAnswer', { advisor: advisorName });
        document.querySelectorAll('.alternative-btn').forEach(b => b.disabled = true);

        if (Game.state.currentRound) {
            Game.state.currentRound.advisory = {
                advisorName: advisorName,
                status: 'pending',
                suggestion: null
            };
        }
    }
}

function showAdvisoryStarted(msg) {
    const state = Game.state;
    if (state.playerName === state.currentRound?.answerer) {
        document.getElementById('btnRequestAdvisory').disabled = true;
        document.getElementById('advisoryStatus').textContent = Game.i18n.t('advisory.waitingForAnswer', { advisor: msg.advisorName });

        if (state.currentRound) {
            state.currentRound.advisory = {
                advisorName: msg.advisorName,
                status: 'pending',
                suggestion: null
            };
        }
    }
}

function showAdvisoryQuestionModal(msg) {
    const round = Game.state.currentRound;
    document.getElementById('advisoryModalAsker').textContent = round?.asker || '---';
    document.getElementById('advisoryModalAnswerer').textContent = round?.answerer || '---';
    document.getElementById('advisoryQuestionText').textContent = msg.question;
    document.getElementById('advisoryAlternativesList').innerHTML = msg.alternatives.map(alt => {
        const letter = alt.charAt(0).toLowerCase();
        return `<button class="btn btn-glass" onclick="Game.ui.answerAdvisory('${letter}', false)"
                    style="text-align:left; padding:10px 14px;">${alt}</button>`;
    }).join('');

    let seconds = Math.floor(CONFIG.GAME.ADVISORY_TIMEOUT / 1000);
    document.getElementById('advisoryTimerText').textContent = Game.i18n.t('advisory.timeLeft', { seconds });

    clearInterval(advisoryCountdownInterval);
    advisoryCountdownInterval = setInterval(() => {
        seconds--;
        document.getElementById('advisoryTimerText').textContent = Game.i18n.t('advisory.timeLeft', { seconds: Math.max(seconds, 0) });
        if (seconds <= 0) {
            clearInterval(advisoryCountdownInterval);
            document.getElementById('modalAdvisoryQuestion').style.display = 'none';
        }
    }, 1000);

    document.getElementById('modalAdvisoryQuestion').style.display = 'flex';
}

function answerAdvisory(alternative, declined) {
    clearInterval(advisoryCountdownInterval);
    document.getElementById('modalAdvisoryQuestion').style.display = 'none';

    const state = Game.state;
    const msg = { type: 'advisory-answer', alternative: alternative, declined: !!declined };

    if (state.isHost) {
        Game.core.handleAdvisoryAnswer(msg);
    } else {
        Game.network.sendToHost(msg);
    }
}

function showAdvisoryResult(msg) {
    const state = Game.state;
    if (state.playerName !== state.currentRound?.answerer) return;

    const statusEl = document.getElementById('advisoryStatus');
    if (!statusEl) return;

    if (state.currentRound?.advisory) {
        state.currentRound.advisory.status = msg.declined ? 'declined' : 'accepted';
        state.currentRound.advisory.suggestion = msg.declined ? null : msg.suggestion;
    }

    if (msg.declined) {
        if (msg.invalid && msg.reason === 'closing-focus-area') {
            statusEl.textContent = Game.i18n.t('advisory.closingFocusArea');
        } else if (msg.invalid) {
            statusEl.textContent = Game.i18n.t('advisory.invalid', { advisor: msg.advisorName });
        } else if (msg.timeout) {
            statusEl.textContent = Game.i18n.t('advisory.timeout', { advisor: msg.advisorName });
        } else {
            statusEl.textContent = Game.i18n.t('advisory.declined', { advisor: msg.advisorName });
        }
    } else {
        statusEl.textContent = Game.i18n.t('advisory.suggestion', { advisor: msg.advisorName, suggestion: msg.suggestion.toUpperCase() });
    }

    if (!state.currentRound.answered) {
        document.querySelectorAll('.alternative-btn').forEach(b => b.disabled = false);
    }

    if (msg.invalid && msg.reason !== 'closing-focus-area') {
        const requestButton = document.getElementById('btnRequestAdvisory');
        if (requestButton && !state.currentRound.answered) requestButton.disabled = false;

        if (state.currentRound) {
            state.currentRound.advisory = null;
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