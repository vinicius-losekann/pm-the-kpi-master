// ============================================
// PM: The KPI Master - INTERFACE DO USUÁRIO (V2)
// ============================================
// Responsabilidades:
//   - Configurar event listeners (setupUI)
//   - Navegar entre telas (lobby, jogo, gameover)
//   - Renderizar perguntas, alternativas, ranking
//   - Atualizar timer, lista de jogadores, KPI
//   - Mostrar recursos (V2)
//   - Modal de evento (V2)
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

    // Modal de evento (V2)
    document.getElementById('btnFecharEvento').addEventListener('click', () => {
        DOM.modalEvento.style.display = 'none';
    });

    // Alternativas clicáveis
    document.querySelectorAll('.alternative-btn').forEach(btn => {
        btn.addEventListener('click', function () {
            handleAlternativeClick(this.getAttribute('data-alt'), this);
        });
    });
    // Venda de recurso (V3)
    document.getElementById('btnVenderRecurso').addEventListener('click', () => {
        Game.ui.showVendaModal();
    });
    document.getElementById('btnFecharVenda').addEventListener('click', () => {
        Game.ui.fecharVendaModal();
    });
}

// ============================================
// MODAL DE EVENTO (V2)
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
// VENDA DE RECURSOS (V3)
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
    fecharVendaModal
};