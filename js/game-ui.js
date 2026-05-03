// ============================================
// PM: The KPI Master - INTERFACE DO USUÁRIO
// ============================================
// Responsabilidades:
//   - Configurar event listeners (setupUI)
//   - Navegar entre telas (lobby, jogo, gameover)
//   - Renderizar perguntas, alternativas, ranking
//   - Atualizar timer, lista de jogadores, KPI
//   - Exibir modais e mensagens
//
// Dependências:
//   - Game.state (game-state.js)
//   - Game.core (game-core.js) para callbacks
//   - Game.network (game-network.js) para enviar respostas
//
// Namespace: Game.ui
// ============================================

// Cache de elementos DOM frequentes
const DOM = {
    screenLobby: document.getElementById('screenLobby'),
    screenGame: document.getElementById('screenGame'),
    screenGameOver: document.getElementById('screenGameOver'),
    modalResult: document.getElementById('modalResult'),
};

// ============================================
// SETUP INICIAL
// ============================================

/**
 * Configura toda a interface: botões, eventos, visibilidade
 * Chamado uma vez na inicialização e após host migration
 */
function setupUI() {
    const state = Game.state;

    // --- Visibilidade dos botões conforme papel ---
    if (state.isHost) {
        // Host vê controles de host
        document.getElementById('hostControls').style.display = 'block';
        document.getElementById('playerWaiting').style.display = 'none';
        document.getElementById('hostRoomIdSection').style.display = 'block';
        document.getElementById('roomPeerId').textContent = state.peerId;
        document.getElementById('btnEndSession').style.display = 'inline-block';
        document.getElementById('btnEndMatch').style.display = 'block';
        document.getElementById('btnLeaveSession').style.display = 'none';
        document.getElementById('btnLeaveMatch').style.display = 'none';

        // Adiciona host à lista se não estiver
        if (!state.players.find(p => p.isHost)) {
            state.players.unshift({
                name: state.playerName,
                peerId: state.peerId,
                kpi: 0,
                phase: CONFIG.FASES[0].id,
                activities: 0,
                isHost: true,
                waitingInLobby: false
            });
        }
        updatePlayersList();

        // Evento: Iniciar Partida
        document.getElementById('btnStartGame').addEventListener('click', () => {
            Game.network.broadcastAll({ type: 'game-start', timer: state.timer });
            Game.core.startGame();
        });

        // Evento: Copiar ID
        document.getElementById('btnCopyId').addEventListener('click', () => {
            navigator.clipboard.writeText(state.peerId).then(() => {
                const btn = document.getElementById('btnCopyId');
                btn.textContent = '✅ Copiado!';
                setTimeout(() => { btn.textContent = '📋 Copiar'; }, 2000);
            }).catch(() => {});
        });
    } else {
        // Jogador comum
        document.getElementById('hostControls').style.display = 'none';
        document.getElementById('playerWaiting').style.display = 'block';
        document.getElementById('hostRoomIdSection').style.display = 'none';
        document.getElementById('btnEndSession').style.display = 'none';
        document.getElementById('btnEndMatch').style.display = 'none';
        document.getElementById('btnLeaveSession').style.display = 'inline-block';
        document.getElementById('btnLeaveMatch').style.display = 'block';
    }

    // --- Event listeners comuns ---
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

    // --- Alternativas clicáveis ---
    document.querySelectorAll('.alternative-btn').forEach(btn => {
        btn.addEventListener('click', function () {
            handleAlternativeClick(this.getAttribute('data-alt'), this);
        });
    });
}

// ============================================
// NAVEGAÇÃO ENTRE TELAS
// ============================================

/**
 * Mostra uma tela específica
 * @param {string} screen - 'lobby' | 'game' | 'gameover'
 */
function showScreen(screen) {
    DOM.screenLobby.classList.remove('active');
    DOM.screenGame.classList.remove('active');
    DOM.screenGameOver.classList.remove('active');

    switch (screen) {
        case 'lobby':
            DOM.screenLobby.classList.add('active');
            break;
        case 'game':
            DOM.screenGame.classList.add('active');
            break;
        case 'gameover':
            DOM.screenGameOver.classList.add('active');
            break;
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

/**
 * Mostra lobby em modo "partida em andamento" (jogador que saiu)
 */
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
        <p style="color:#a0a0b8; font-size:0.85rem;">
            Você saiu da partida. Aguarde o host encerrar para participar da próxima.
        </p>
    `;

    document.getElementById('playersList').innerHTML = `
        <div style="margin-bottom:8px;">
            <strong>👥 Em jogo (${playing.length})</strong>
            ${playing.map(p => `<div style="padding:4px 0; color:#e0e0e0;">• ${p.name} ${p.isHost ? '(HOST)' : ''}</div>`).join('')}
        </div>
        <div>
            <strong>👤 Aguardando (${waiting.length})</strong>
            ${waiting.map(p => `<div style="padding:4px 0; color:#6a6a80;">• ${p.name}</div>`).join('')}
        </div>
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

    // Cores conforme tempo restante
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

/**
 * Exibe a pergunta conforme o papel do jogador
 * - Respondedor: botões clicáveis
 * - Perguntador: todas alternativas com destaque na correta
 */
function displayQuestion(q) {
    const isPerg = Game.state.playerName === Game.state.currentRound?.perguntador;
    const isResp = Game.state.playerName === Game.state.currentRound?.respondedor;

    document.getElementById('questionText').textContent = q.pergunta;
    document.getElementById('badgeArea').textContent = q.area;
    document.getElementById('badgeGrupo').textContent = q.grupo;

    if (isResp && q.isRespondedor !== false) {
        // --- RESPONDEDOR: botões clicáveis ---
        document.getElementById('alternativesGrid').style.display = 'grid';
        document.getElementById('allAlternativesArea').style.display = 'none';
        document.getElementById('roleNotice').style.display = 'block';
        document.getElementById('roleNotice').innerHTML = '🎯 <strong>Você está respondendo!</strong> Escolha uma alternativa.';
        document.getElementById('roleNotice').className = 'role-notice role-respondedor';

        document.getElementById('altA').textContent = q.alternativas[0];
        document.getElementById('altB').textContent = q.alternativas[1];
        document.getElementById('altC').textContent = q.alternativas[2];
        document.getElementById('altD').textContent = q.alternativas[3];

        document.querySelectorAll('.alternative-btn').forEach(b => {
            b.disabled = false;
            b.className = 'alternative-btn';
        });
    } else if (isPerg || q.isPerguntador) {
        // --- PERGUNTADOR: todas alternativas com destaque na correta ---
        document.getElementById('alternativesGrid').style.display = 'none';
        document.getElementById('allAlternativesArea').style.display = 'block';
        document.getElementById('roleNotice').style.display = 'block';
        document.getElementById('roleNotice').innerHTML = '👀 <strong>Você está perguntando!</strong> Tela somente leitura.';
        document.getElementById('roleNotice').className = 'role-notice role-perguntador';

        document.getElementById('allAlternativesList').innerHTML = q.alternativas.map(alt => {
            const letter = alt.charAt(0).toLowerCase();
            const isCorrect = letter === q.correta;
            return `
                <div style="
                    padding:12px 16px;
                    background:${isCorrect ? 'rgba(0,255,136,0.12)' : 'rgba(255,255,255,0.03)'};
                    border:2px solid ${isCorrect ? 'rgba(0,255,136,0.4)' : 'rgba(255,255,255,0.08)'};
                    border-radius:10px;
                    color:${isCorrect ? '#00ff88' : '#e0e0e0'};
                    font-size:0.9rem;
                    ${isCorrect ? 'font-weight:600;' : ''}
                ">
                    ${isCorrect ? '✅ ' : ''}${alt}
                </div>`;
        }).join('');
    }
}

function displaySpectatorView(perguntador, respondedor) {
    document.getElementById('questionArea').style.display = 'none';
    document.getElementById('spectatorArea').style.display = 'block';
    document.getElementById('spectatorMessage').textContent =
        `⏳ ${perguntador} pergunta para ${respondedor}...`;
}

/**
 * Clique em uma alternativa (apenas respondedor)
 */
function handleAlternativeClick(alt, btn) {
    const state = Game.state;
    
    console.log('🖱️ [UI] Clique na alternativa:', alt);
    console.log('🖱️ [UI] Jogador:', state.playerName);
    console.log('🖱️ [UI] É host?', state.isHost);
    console.log('🖱️ [UI] currentRound:', state.currentRound);
    console.log('🖱️ [UI] respondedor esperado:', state.currentRound?.respondedor);
    console.log('🖱️ [UI] já respondeu?', state.currentRound?.respondeu);
    
    if (!state.currentRound) {
        console.warn('⚠️ [UI] Sem rodada atual!');
        return;
    }
    
    if (state.currentRound.respondeu) {
        console.warn('⚠️ [UI] Já respondeu esta rodada!');
        return;
    }
    
    if (state.playerName !== state.currentRound.respondedor) {
        console.warn('⚠️ [UI] Não é sua vez de responder! Você é', state.playerName, 'mas o respondedor é', state.currentRound.respondedor);
        return;
    }

    // Desabilita todos os botões
    document.querySelectorAll('.alternative-btn').forEach(b => b.disabled = true);
    btn.classList.add('selected');

    // Se for o host respondendo, processa localmente
    if (state.isHost) {
        console.log('🖱️ [UI] Host respondendo localmente...');
        Game.core.handleAnswer({ alternativa: alt, playerName: state.playerName });
    } else {
        console.log('🖱️ [UI] Enviando resposta para o host...');
        Game.network.sendToHost({
            type: 'answer',
            alternativa: alt,
            playerName: state.playerName
        });
    }

    state.currentRound.respondeu = true;
    console.log('🖱️ [UI] Resposta processada!');
}

// ============================================
// MODAL DE RESULTADO
// ============================================

function showResultModal(acertou, kpiGanho, todosGanham) {
    document.getElementById('resultTitle').textContent = acertou ? '✅ Acertou!' : '❌ Errou!';
    document.getElementById('resultTitle').className = 'result-title ' +
        (acertou ? 'result-success' : 'result-error');

    let msg = acertou ? `+${kpiGanho} KPI` : '0 KPI';
    if (todosGanham > 0) msg += ` | Todos +${todosGanham}`;

    document.getElementById('resultMessage').textContent = msg;
    DOM.modalResult.style.display = 'flex';
}

// ============================================
// RANKING
// ============================================

function updatePlayersOnlineList() {
    document.getElementById('playersOnlineList').innerHTML = Game.getActivePlayers().map(p => {
        const fase = Game.getFaseById(p.phase);
        return `<div class="online-player">
            <div class="player-avatar-xs">${p.name.charAt(0)}</div>
            <span>${p.name}</span>
            <span class="mini-phase">${fase.emoji}</span>
        </div>`;
    }).join('') || '<div style="color:#6a6a80; font-size:0.8rem;">Nenhum jogador ativo</div>';
}

function updateRankingList() {
    const ranking = Game.core.buildRanking();
    const medalhas = ['🥇', '🥈', '🥉'];
    document.getElementById('rankingList').innerHTML = ranking.map((p, i) => `
        <div class="rank-item">
            <span class="rank-pos">${medalhas[i] || '#' + p.posicao}</span>
            <span class="rank-name">${p.name}</span>
            <span class="rank-kpi">${p.kpi} ⭐</span>
        </div>
    `).join('');
}

function displayFinalRanking(ranking) {
    const medalhas = ['🥇', '🥈', '🥉'];
    document.getElementById('finalRanking').innerHTML = ranking.map((p, i) => {
        const fase = Game.getFaseById(p.phase);
        return `<div class="final-rank-item ${i < 3 ? 'top-' + (i + 1) : ''}">
            <span class="final-rank-pos">${medalhas[i] || '#' + p.posicao}</span>
            <span class="final-rank-name">${p.name}</span>
            <span class="final-rank-kpi">${p.kpi} ⭐</span>
            <span class="final-rank-phase">${fase.emoji} ${fase.nome}</span>
        </div>`;
    }).join('');
}

// ============================================
// EXPORTAÇÃO
// ============================================
window.Game = window.Game || {};
window.Game.ui = {
    setupUI,
    showScreen,
    showLobbyNormal,
    showLobbyWaitingView,
    updateConnectionStatus,
    updatePlayersList,
    checkStartCondition,
    updateTimerDisplay,
    displayRoundStart,
    displayQuestion,
    displaySpectatorView,
    showResultModal,
    updatePlayersOnlineList,
    updateRankingList,
    displayFinalRanking,
    handleAlternativeClick
};