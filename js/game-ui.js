// ============================================
// PM: The KPI Master - INTERFACE DO USUÁRIO (V2)
// ============================================
// Responsabilidades:
//   - Configurar event listeners (setupUI)
//   - Navegar entre telas (lobby, jogo, gameover)
//   - Renderizar perguntas, alternativas, ranking
//   - Atualizar timer, lista de jogadores, KPI
//   - Mostrar recursos 
//   - Modal de evento
//   - Exibir modais e mensagens
//
// Namespace: Game.ui
// ============================================

const DOM = {
    screenLobby: document.getElementById('screenLobby'),
    screenGame: document.getElementById('screenGame'),
    screenGameOver: document.getElementById('screenGameOver'),
    modalResult: document.getElementById('modalResult'),
    modalEvento: document.getElementById('modalEvento'),
};

// ============================================
// SETUP INICIAL
// ============================================

function setupUI() {
    const state = Game.state;

    if (state.isHost) {
        document.getElementById('hostControls').style.display = 'block';
        document.getElementById('playerWaiting').style.display = 'none';
        document.getElementById('hostRoomIdSection').style.display = 'block';
        document.getElementById('roomPeerId').textContent = state.peerId;
        document.getElementById('btnEndSession').style.display = 'inline-block';
        document.getElementById('btnEndMatch').style.display = 'block';
        document.getElementById('btnLeaveSession').style.display = 'none';
        document.getElementById('btnLeaveMatch').style.display = 'none';

        if (!state.players.find(p => p.isHost)) {
            state.players.unshift({
                name: state.playerName,
                peerId: state.peerId,
                kpi: 0,
                phase: CONFIG.FASES[0].id,
                activities: 0,
                isHost: true,
                waitingInLobby: false,
                recursos: CONFIG.RECURSOS_INICIAIS
            });
        }
        updatePlayersList();

        document.getElementById('btnStartGame').addEventListener('click', () => {
            Game.network.broadcastAll({ type: 'game-start', timer: state.timer });
            Game.core.startGame();
        });

        document.getElementById('btnCopyId').addEventListener('click', () => {
            navigator.clipboard.writeText(state.peerId).then(() => {
                const btn = document.getElementById('btnCopyId');
                btn.textContent = '✅ Copiado!';
                setTimeout(() => { btn.textContent = '📋 Copiar'; }, 2000);
            }).catch(() => { });
        });
    } else {
        document.getElementById('hostControls').style.display = 'none';
        document.getElementById('playerWaiting').style.display = 'block';
        document.getElementById('hostRoomIdSection').style.display = 'none';
        document.getElementById('btnEndSession').style.display = 'none';
        document.getElementById('btnEndMatch').style.display = 'none';
        document.getElementById('btnLeaveSession').style.display = 'inline-block';
        document.getElementById('btnLeaveMatch').style.display = 'block';
    }

    // Botões de sessão/partida
    document.getElementById('btnEndSession').addEventListener('click', Game.core.endSession);
    document.getElementById('btnEndMatch').addEventListener('click', Game.core.endMatch);
    document.getElementById('btnLeaveSession').addEventListener('click', Game.core.leaveSession);
    document.getElementById('btnLeaveMatch').addEventListener('click', Game.core.leaveMatch);
    document.getElementById('btnExitGameOver').addEventListener('click', () => {
        Game.network.cleanup();
        window.location.href = 'index.html';
    });
    document.getElementById('btnBackToLobby').addEventListener('click', () => {
        showScreen('lobby');
        showLobbyNormal();
        updatePlayersList();
        Game.saveState();
    });
    document.getElementById('btnCloseResult').addEventListener('click', () => {
        DOM.modalResult.style.display = 'none';
    });

    // Modal de evento
    document.getElementById('btnFecharEvento').addEventListener('click', () => {
        DOM.modalEvento.style.display = 'none';
    });

    // Alternativas clicáveis
    document.querySelectorAll('.alternative-btn').forEach(btn => {
        btn.addEventListener('click', function () {
            handleAlternativeClick(this.getAttribute('data-alt'), this);
        });
    });
    // Venda de recurso
    document.getElementById('btnVenderRecurso').addEventListener('click', () => {
        Game.ui.showVendaModal();
    });
    document.getElementById('btnFecharVenda').addEventListener('click', () => {
        Game.ui.fecharVendaModal();
    });
    // Assessoria
    document.getElementById('btnPedirAssessoria').addEventListener('click', () => {
        Game.ui.showAssessoriaSelectModal();
    });
    document.getElementById('btnFecharAssessoriaSelect').addEventListener('click', () => {
        document.getElementById('modalAssessoriaSelect').style.display = 'none';
    });
    document.getElementById('btnRecusarAssessoria').addEventListener('click', () => {
        Game.ui.responderAssessoria(null, true);
    });
}

// ============================================
// MODAL DE EVENTO
// ============================================

/**
 * Exibe o modal de evento para todos os jogadores
 * @param {object} evento - Dados do evento sorteado
 */
function showEventoModal(evento) {
    if (!evento) return;
    document.getElementById('eventoModalTitulo').textContent = evento.titulo;
    document.getElementById('eventoModalDesc').textContent = evento.descricao;
    DOM.modalEvento.style.display = 'flex';
}

// ============================================
// NAVEGAÇÃO ENTRE TELAS
// ============================================

function showScreen(screen) {
    DOM.screenLobby.classList.remove('active');
    DOM.screenGame.classList.remove('active');
    DOM.screenGameOver.classList.remove('active');

    switch (screen) {
        case 'lobby': DOM.screenLobby.classList.add('active'); break;
        case 'game': DOM.screenGame.classList.add('active'); break;
        case 'gameover': DOM.screenGameOver.classList.add('active'); break;
    }
}

// ============================================
// LOBBY
// ============================================

function showLobbyNormal() {
    const state = Game.state;
    document.getElementById('hostControls').style.display = state.isHost ? 'block' : 'none';
    document.getElementById('playerWaiting').style.display = state.isHost ? 'none' : 'block';
    document.getElementById('playerWaiting').innerHTML = `
        <div class="waiting-animation">
            <span class="waiting-dot"></span><span class="waiting-dot"></span><span class="waiting-dot"></span>
        </div>
        <p>Aguardando o host iniciar a partida...</p>
    `;
    document.getElementById('btnEndSession').style.display = state.isHost ? 'inline-block' : 'none';
    document.getElementById('btnLeaveSession').style.display = state.isHost ? 'none' : 'inline-block';
    updatePlayersList();
}

function showLobbyWaitingView() {
    document.getElementById('hostControls').style.display = 'none';
    document.getElementById('playerWaiting').style.display = 'block';
    document.getElementById('btnEndSession').style.display = 'none';
    document.getElementById('btnLeaveSession').style.display = 'inline-block';

    const playing = Game.getActivePlayers();
    const waiting = Game.state.players.filter(p => p.waitingInLobby);

    document.getElementById('playerWaiting').innerHTML = `
        <span style="font-size:2rem;">⚠️</span>
        <p><strong>Partida em andamento</strong></p>
        <p style="color:#a0a0b8; font-size:0.85rem;">Você saiu da partida. Aguarde o host encerrar.</p>
    `;

    document.getElementById('playersList').innerHTML = `
        <div style="margin-bottom:8px;"><strong>👥 Em jogo (${playing.length})</strong>${playing.map(p => `<div>• ${p.name}</div>`).join('')}</div>
        <div><strong>👤 Aguardando (${waiting.length})</strong>${waiting.map(p => `<div>• ${p.name}</div>`).join('')}</div>
    `;
}

function updateConnectionStatus(status, text) {
    const dot = document.querySelector('.status-dot');
    const textEl = document.getElementById('statusText');
    dot.className = 'status-dot';
    if (status === 'connected') dot.classList.add('status-connected');
    else if (status === 'error') dot.classList.add('status-error');
    else dot.classList.add('status-connecting');
    textEl.textContent = text;
}

function updatePlayersList() {
    const state = Game.state;
    document.getElementById('playerCount').textContent = state.players.length;
    document.getElementById('playersList').innerHTML = state.players.map(p => `
        <div class="player-item">
            <div class="player-avatar-sm">${p.name.charAt(0).toUpperCase()}</div>
            <span class="player-item-name">${p.name}</span>
            ${p.isHost ? '<span class="host-badge">HOST</span>' : ''}
            ${p.waitingInLobby ? '<span style="font-size:0.7rem; color:#ffa502;">(aguardando)</span>' : ''}
            <span class="player-status-dot status-connected"></span>
        </div>
    `).join('') || `<div class="player-empty"><span class="empty-icon">🎯</span><p>Aguardando jogadores...</p></div>`;
}

function checkStartCondition() {
    const state = Game.state;
    if (!state.isHost) return;
    const btnStart = document.getElementById('btnStartGame');
    const hint = document.getElementById('startHint');
    const activeCount = Game.getActivePlayers().length;
    if (activeCount >= CONFIG.JOGO.MIN_PLAYERS) {
        btnStart.disabled = false;
        hint.textContent = `${activeCount} jogadores ativos - pronto!`;
        hint.style.color = '#00ff88';
    } else {
        btnStart.disabled = true;
        hint.textContent = `Mínimo de ${CONFIG.JOGO.MIN_PLAYERS} jogadores ativos`;
        hint.style.color = '#a0a0b0';
    }
}

// ============================================
// JOGO - TIMER E RODADA
// ============================================

function updateTimerDisplay() {
    const state = Game.state;
    const display = document.getElementById('timerDisplay');
    const card = document.getElementById('timerCard');
    const m = Math.floor(state.timer / 60);
    const s = state.timer % 60;
    display.textContent = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    card.className = 'timer-card glass-card';
    if (state.timer <= CONFIG.TIMER.CRITICAL) card.classList.add('timer-critical');
    else if (state.timer <= CONFIG.TIMER.DANGER) card.classList.add('timer-danger');
    else if (state.timer <= CONFIG.TIMER.WARNING) card.classList.add('timer-warning');
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
    }

    // Reseta UI de assessoria a cada nova rodada
    document.getElementById('modalAssessoriaSelect').style.display = 'none';
    document.getElementById('modalAssessoriaQuestion').style.display = 'none';
    const assessoriaArea = document.getElementById('assessoriaArea');
    if (assessoriaArea) assessoriaArea.style.display = 'none';
}

function displayQuestion(q) {
    const isPerg = Game.state.playerName === Game.state.currentRound?.perguntador;
    const isResp = Game.state.playerName === Game.state.currentRound?.respondedor;
    document.getElementById('questionText').textContent = q.pergunta;
    document.getElementById('badgeArea').textContent = q.area;
    document.getElementById('badgeGrupo').textContent = q.grupo;

    if (isResp && q.isRespondedor !== false) {
        document.getElementById('alternativesGrid').style.display = 'grid';
        document.getElementById('allAlternativesArea').style.display = 'none';
        document.getElementById('roleNotice').style.display = 'block';
        document.getElementById('roleNotice').innerHTML = '🎯 <strong>Você está respondendo!</strong> Escolha uma alternativa.';
        document.getElementById('roleNotice').className = 'role-notice role-respondedor';
        document.getElementById('altA').textContent = q.alternativas[0];
        document.getElementById('altB').textContent = q.alternativas[1];
        document.getElementById('altC').textContent = q.alternativas[2];
        document.getElementById('altD').textContent = q.alternativas[3];
        document.querySelectorAll('.alternative-btn').forEach(b => { b.disabled = false; b.className = 'alternative-btn'; });
        // Botão de Assessoria — oculto na fase de Encerramento
        const me = Game.getPlayerByName(Game.state.playerName);
        const emEncerramento = me && Game.getFaseIndex(me.phase) === CONFIG.FASES.length - 1;
        const assessoriaArea = document.getElementById('assessoriaArea');
        if (assessoriaArea) {
            if (emEncerramento) {
                assessoriaArea.style.display = 'none';
            } else {
                assessoriaArea.style.display = 'block';
                document.getElementById('btnPedirAssessoria').disabled = false;
                document.getElementById('assessoriaStatus').textContent = '';
            }
        }
    } else if (isPerg || q.isPerguntador) {
        document.getElementById('alternativesGrid').style.display = 'none';
        document.getElementById('allAlternativesArea').style.display = 'block';
        document.getElementById('roleNotice').style.display = 'block';
        document.getElementById('roleNotice').innerHTML = '👀 <strong>Você está perguntando!</strong> Tela somente leitura.';
        document.getElementById('roleNotice').className = 'role-notice role-perguntador';
        document.getElementById('allAlternativesList').innerHTML = q.alternativas.map(alt => {
            const letter = alt.charAt(0).toLowerCase();
            const isCorrect = letter === q.correta;
            return `<div style="padding:12px 16px; background:${isCorrect ? 'rgba(0,255,136,0.12)' : 'rgba(255,255,255,0.03)'}; border:2px solid ${isCorrect ? 'rgba(0,255,136,0.4)' : 'rgba(255,255,255,0.08)'}; border-radius:10px; color:${isCorrect ? '#00ff88' : '#e0e0e0'}; font-size:0.9rem; ${isCorrect ? 'font-weight:600;' : ''}">${isCorrect ? '✅ ' : ''}${alt}</div>`;
        }).join('');
    }
}

function displaySpectatorView(perguntador, respondedor) {
    document.getElementById('questionArea').style.display = 'none';
    document.getElementById('spectatorArea').style.display = 'block';
    document.getElementById('spectatorMessage').textContent = `⏳ ${perguntador} pergunta para ${respondedor}...`;
    const assessoriaArea = document.getElementById('assessoriaArea');
    if (assessoriaArea) assessoriaArea.style.display = 'none';
}

function handleAlternativeClick(alt, btn) {
    const state = Game.state;
    if (!state.currentRound || state.currentRound.respondeu) return;
    if (state.playerName !== state.currentRound.respondedor) return;
    document.querySelectorAll('.alternative-btn').forEach(b => b.disabled = true);
    btn.classList.add('selected');
    if (state.isHost) {
        Game.core.handleAnswer({ alternativa: alt, playerName: state.playerName });
    } else {
        Game.network.sendToHost({ type: 'answer', alternativa: alt, playerName: state.playerName });
    }
    state.currentRound.respondeu = true;
}

// ============================================
// MODAL DE RESULTADO (V2)
// ============================================

function showResultModal(acertou, kpiGanho, recursosRestantes) {
    document.getElementById('resultTitle').textContent = acertou ? '✅ Acertou!' : '❌ Errou!';
    document.getElementById('resultTitle').className = 'result-title ' + (acertou ? 'result-success' : 'result-error');
    let msg = acertou ? `+${kpiGanho} KPI` : '0 KPI';
    if (recursosRestantes !== undefined) msg += ` | 📦 ${recursosRestantes} recursos`;
    document.getElementById('resultMessage').textContent = msg;
    DOM.modalResult.style.display = 'flex';
}

// ============================================
// RANKING (V2)
// ============================================

function updatePlayersOnlineList() {
    document.getElementById('playersOnlineList').innerHTML = Game.getActivePlayers().map(p => {
        const fase = Game.getFaseById(p.phase);
        return `<div class="online-player"><div class="player-avatar-xs">${p.name.charAt(0)}</div><span>${p.name}</span><span style="font-size:0.7rem; color:#ffd700;">📦${p.recursos || 0}</span><span class="mini-phase">${fase.emoji}</span></div>`;
    }).join('') || '<div style="color:#6a6a80; font-size:0.8rem;">Nenhum jogador ativo</div>';
}

function updateRankingList() {
    const ranking = Game.core.buildRanking();
    const medalhas = ['🥇', '🥈', '🥉'];
    document.getElementById('rankingList').innerHTML = ranking.map((p, i) => `
        <div class="rank-item"><span class="rank-pos">${medalhas[i] || '#' + p.posicao}</span><span class="rank-name">${p.name}</span><span class="rank-kpi">${p.kpiFinal} ⭐</span></div>
    `).join('');
}

function displayFinalRanking(ranking) {
    const medalhas = ['🥇', '🥈', '🥉'];
    document.getElementById('finalRanking').innerHTML = ranking.map((p, i) => {
        const kpiRecursos = p.recursos * CONFIG.KPI.VALOR_RECURSO_FINAL;
        return `<div class="final-rank-item ${i < 3 ? 'top-' + (i + 1) : ''}">
            <span class="final-rank-pos">${medalhas[i] || '#' + p.posicao}</span>
            <span class="final-rank-name">${p.name}</span>
            <span class="final-rank-kpi">${p.kpiFinal} ⭐</span>
            <div class="final-rank-detail" style="font-size:0.75rem; color:#a0a0b8; margin-top:4px;">Atividades: ${p.kpi} KPI | Recursos: ${p.recursos}📦 × ${CONFIG.KPI.VALOR_RECURSO_FINAL} = ${kpiRecursos} KPI</div>
        </div>`;
    }).join('');
}
// ============================================
// VENDA DE RECURSOS
// ============================================

/**
 * Abre o modal de venda de recursos
 */
function showVendaModal() {
    const state = Game.state;
    const me = Game.getPlayerByName(state.playerName);

    if (!me || me.recursos < 1) {
        alert('⚠️ Você não tem recursos para vender.');
        return;
    }

    const compradores = Game.core.getCompradores();

    if (compradores.length === 0) {
        alert('⚠️ Nenhum jogador disponível para comprar (precisa ter pelo menos ' + CONFIG.KPI.VALOR_VENDA_RECURSO + ' KPI).');
        return;
    }

    // Atualiza informações
    document.getElementById('vendaSeusRecursos').textContent =
        'Seus recursos: 📦 ' + me.recursos;

    // Lista de compradores
    document.getElementById('vendaCompradores').innerHTML = compradores.map(c => `
        <button class="btn btn-glass" onclick="Game.ui.confirmarVenda('${c.name}')" 
                style="display:flex; justify-content:space-between; align-items:center; padding:10px 14px;">
            <span>${c.name}</span>
            <span style="color:#ffd700; font-size:0.8rem;">⭐${c.kpi} KPI</span>
        </button>
    `).join('');

    document.getElementById('modalVenda').style.display = 'flex';
}

/**
 * Confirma a venda para um comprador
 */
function confirmarVenda(compradorName) {
    if (confirm('Vender 1📦 para ' + compradorName + ' por ' + CONFIG.KPI.VALOR_VENDA_RECURSO + ' KPI?')) {
        const sucesso = Game.core.venderRecurso(compradorName);
        if (sucesso) {
            document.getElementById('modalVenda').style.display = 'none';
        }
    }
}

/**
 * Fecha o modal de venda
 */
function fecharVendaModal() {
    document.getElementById('modalVenda').style.display = 'none';
}

// ============================================
// SISTEMA DE ASSESSORIA
// ============================================

let assessoriaCountdownInterval = null;

/**
 * Abre o modal de seleção de assessor (visão do Respondedor)
 */
function showAssessoriaSelectModal() {
    const state = Game.state;
    const round = state.currentRound;
    if (!round) return;

    const candidatos = Game.getActivePlayers().filter(p =>
        p.name !== round.perguntador && p.name !== state.playerName
    );

    if (candidatos.length === 0) {
        alert('⚠️ Nenhum jogador disponível para assessoria.');
        return;
    }

    document.getElementById('assessoriaJogadoresList').innerHTML = candidatos.map(p => `
        <button class="btn btn-glass" onclick="Game.ui.escolherAssessor('${p.name}')"
                style="display:flex; justify-content:space-between; align-items:center; padding:10px 14px;">
            <span>${p.name}</span>
            <span style="font-size:0.8rem; color:#a0a0b8;">${Game.getFaseById(p.phase).emoji}</span>
        </button>
    `).join('');

    document.getElementById('modalAssessoriaSelect').style.display = 'flex';
}

/**
 * Confirma a escolha do assessor e envia o pedido
 */
function escolherAssessor(assessorName) {
    document.getElementById('modalAssessoriaSelect').style.display = 'none';
    const ok = Game.core.requestAssessoria(assessorName);
    if (ok) {
        document.getElementById('btnPedirAssessoria').disabled = true;
        document.getElementById('assessoriaStatus').textContent = `📞 Aguardando resposta de ${assessorName}...`;
    }
}

/**
 * Notifica o Respondedor que o pedido foi iniciado (broadcast do host)
 */
function showAssessoriaStarted(msg) {
    const state = Game.state;
    if (state.playerName === state.currentRound?.respondedor) {
        document.getElementById('btnPedirAssessoria').disabled = true;
        document.getElementById('assessoriaStatus').textContent = `📞 Aguardando resposta de ${msg.assessorName}...`;
    }
}

/**
 * Exibe o modal de pergunta para o jogador chamado como assessor
 */
function showAssessoriaQuestionModal(msg) {
    document.getElementById('assessoriaQuestionText').textContent = msg.pergunta;
    document.getElementById('assessoriaAlternativesList').innerHTML = msg.alternativas.map(alt => {
        const letra = alt.charAt(0).toLowerCase();
        return `<button class="btn btn-glass" onclick="Game.ui.responderAssessoria('${letra}', false)"
                    style="text-align:left; padding:10px 14px;">${alt}</button>`;
    }).join('');

    let seconds = Math.floor(CONFIG.JOGO.ASSESSORIA_TIMEOUT / 1000);
    document.getElementById('assessoriaTimerText').textContent = `⏱️ ${seconds}s`;

    clearInterval(assessoriaCountdownInterval);
    assessoriaCountdownInterval = setInterval(() => {
        seconds--;
        document.getElementById('assessoriaTimerText').textContent = `⏱️ ${Math.max(seconds, 0)}s`;
        if (seconds <= 0) {
            clearInterval(assessoriaCountdownInterval);
            document.getElementById('modalAssessoriaQuestion').style.display = 'none';
        }
    }, 1000);

    document.getElementById('modalAssessoriaQuestion').style.display = 'flex';
}

/**
 * Envia a sugestão (ou recusa) do assessor ao host
 */
function responderAssessoria(alternativa, recusado) {
    clearInterval(assessoriaCountdownInterval);
    document.getElementById('modalAssessoriaQuestion').style.display = 'none';

    const state = Game.state;
    const msg = { type: 'assessoria-answer', alternativa, recusado: !!recusado };

    if (state.isHost) {
        Game.core.handleAssessoriaAnswer(msg);
    } else {
        Game.network.sendToHost(msg);
    }
}

/**
 * Mostra o resultado da assessoria na tela do Respondedor
 */
function showAssessoriaResult(msg) {
    const state = Game.state;
    if (state.playerName !== state.currentRound?.respondedor) return;

    const statusEl = document.getElementById('assessoriaStatus');
    if (!statusEl) return;

    if (msg.recusado) {
        statusEl.textContent = msg.timeout
            ? `⌛ ${msg.assessorName} não respondeu a tempo.`
            : `❌ ${msg.assessorName} recusou o pedido de assessoria.`;
    } else {
        statusEl.textContent = `🧭 ${msg.assessorName} sugere: ${msg.sugestao.toUpperCase()}`;
    }
}

/**
 * Modal simples de bônus de KPI para o assessor
 */
function showAssessoriaBonusModal(bonus) {
    document.getElementById('resultTitle').textContent = '🧭 Assessoria!';
    document.getElementById('resultTitle').className = 'result-title result-success';
    document.getElementById('resultMessage').textContent = `+${bonus} KPI (sugestão correta)`;
    DOM.modalResult.style.display = 'flex';
}
// ============================================
// EXPORTAÇÃO
// ============================================
window.Game = window.Game || {};
window.Game.ui = {
    setupUI, showScreen, showLobbyNormal, showLobbyWaitingView,
    updateConnectionStatus, updatePlayersList, checkStartCondition,
    updateTimerDisplay, displayRoundStart, displayQuestion, displaySpectatorView,
    showResultModal, showEventoModal,
    updatePlayersOnlineList, updateRankingList, displayFinalRanking,
    handleAlternativeClick,
    showVendaModal,
    confirmarVenda,
    fecharVendaModal,
    showAssessoriaSelectModal,
    escolherAssessor,
    showAssessoriaStarted,
    showAssessoriaQuestionModal,
    responderAssessoria,
    showAssessoriaResult,
    showAssessoriaBonusModal
};