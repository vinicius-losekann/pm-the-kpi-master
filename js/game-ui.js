// ============================================
// PM: The KPI Master - INTERFACE DO USUÁRIO
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

/**
 * BUGFIX (XSS): playerName vem da URL (?playerName=...) e é propagado via
 * P2P para todos os clientes sem qualquer sanitização. Vários pontos deste
 * arquivo usavam innerHTML interpolando `${p.name}` (ou outros textos
 * vindos da rede, como evento/oferta de venda) diretamente — um jogador
 * mal-intencionado podia usar um nome como "<img src=x onerror=...>" e
 * executar script na tela de todos os outros participantes. Além disso,
 * alguns pontos montavam `onclick="fn('${nome}')"` como string, o que
 * também quebra (ou pior, permite escapar do literal) se o nome tiver
 * aspas simples.
 *
 * escapeHtml() converte caracteres perigosos para entidades HTML antes de
 * qualquer interpolação em innerHTML. É usada em TODO texto vindo de rede
 * (nomes de jogador, títulos/descrições de evento, sugestões de
 * assessoria) que é inserido via innerHTML neste arquivo.
 */
function escapeHtml(str) {
    if (str === undefined || str === null) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// ============================================
// SETUP INICIAL
// ============================================

// Guards contra listeners duplicados. setupUI() é chamado mais de uma vez
// na vida da página sempre que um guest assume como host no meio da
// partida (becomeHost() chama Game.ui.setupUI() de novo para religar a UI
// de host). Sem esses guards, cada clique em botões como "Sair", "Iniciar
// Partida" ou nas alternativas de resposta disparava a ação múltiplas
// vezes (confirm()/alert() duplicados, broadcasts em dobro, etc).
let commonListenersBound = false;
let hostOnlyListenersBound = false;
let ofertaVendaAtual = null;

/** Exibe ao comprador a oferta recebida de outro jogador. */
function showVendaOfertaModal(msg) {
    ofertaVendaAtual = msg;
    document.getElementById('vendaOfertaTexto').innerHTML =
        `<strong>${escapeHtml(msg.vendedorName)}</strong> oferece 1📦 por <strong style="color:#ffd700;">${escapeHtml(msg.valor)} KPI</strong>`;
    document.getElementById('modalVendaOferta').style.display = 'flex';
}

/** Envia a resposta do comprador (aceite/recusa) ao host. */
function responderOfertaVenda(aceito) {
    document.getElementById('modalVendaOferta').style.display = 'none';
    if (!ofertaVendaAtual) return;

    const msg = {
        type: 'venda-offer-response',
        vendedorName: ofertaVendaAtual.vendedorName,
        compradorName: ofertaVendaAtual.compradorName,
        aceito: !!aceito
    };

    if (Game.state.isHost) {
        Game.core.handleVendaOfertaResponse(msg);
    } else {
        Game.network.sendToHost(msg);
    }
    ofertaVendaAtual = null;
}

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

        // Só liga uma vez: este bloco roda de novo quando um guest vira
        // host no meio da partida (primeira vez que ELE precisa desses
        // listeners), mas nunca deve religar para quem já era host.
        if (!hostOnlyListenersBound) {
            document.getElementById('btnStartGame').addEventListener('click', () => {
                // Garante que o timer enviado no broadcast (e usado
                // localmente pelo host) seja sempre o tempo cheio da
                // sessão — sem isso, reiniciar uma partida após uma
                // anterior ter terminado antes do tempo esgotar propagava
                // um timer quase zerado para todos os jogadores.
                Game.state.timer = CONFIG.JOGO.SESSION_DURATION;

                Game.network.broadcastAll({ type: 'game-start', timer: Game.state.timer });
                Game.core.startGame();
            });

            document.getElementById('btnCopyId').addEventListener('click', () => {
                navigator.clipboard.writeText(Game.state.peerId).then(() => {
                    const btn = document.getElementById('btnCopyId');
                    btn.textContent = '✅ Copiado!';
                    setTimeout(() => { btn.textContent = '📋 Copiar'; }, 2000);
                }).catch(() => { });
            });

            hostOnlyListenersBound = true;
        }
    } else {
        document.getElementById('hostControls').style.display = 'none';
        document.getElementById('playerWaiting').style.display = 'block';
        document.getElementById('hostRoomIdSection').style.display = 'none';
        document.getElementById('btnEndSession').style.display = 'none';
        document.getElementById('btnEndMatch').style.display = 'none';
        document.getElementById('btnLeaveSession').style.display = 'inline-block';
        document.getElementById('btnLeaveMatch').style.display = 'block';
    }

    // Os listeners abaixo existem independente do papel (host/guest) e não
    // precisam ser religados quando o papel muda — só a primeira vez.
    if (commonListenersBound) return;

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
        // Sem isso, 'gameStarted'/'gameOver' continuavam true após o fim
        // natural de uma partida, e o baralho de perguntas usadas não era
        // resetado neste fluxo (só era resetado em "Encerrar Partida"). A
        // correção em startGame() já reseta KPI/fase/atividades/timer, mas
        // manter esses campos de estado coerentes evita comportamentos
        // estranhos na tela de lobby entre uma partida e outra.
        Game.state.gameStarted = false;
        Game.state.gameOver = false;
        Game.state.currentRound = null;
        Game.core.resetAllBaralhos();

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
    document.getElementById('btnAceitarVendaOferta').addEventListener('click', () => {
        Game.ui.responderOfertaVenda(true);
    });
    document.getElementById('btnRecusarVendaOferta').addEventListener('click', () => {
        Game.ui.responderOfertaVenda(false);
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

    commonListenersBound = true;
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
    // titulo/descricao vêm do JSON de perguntas (confiável, não de rede
    // controlada por outro jogador), mas usamos textContent de qualquer
    // forma — já era o comportamento original e continua correto/seguro.
    document.getElementById('eventoModalTitulo').textContent = evento.titulo;
    document.getElementById('eventoModalDesc').textContent = evento.descricao;
    DOM.modalEvento.style.display = 'flex';
}

// ============================================
// NAVEGAÇÃO ENTRE TELAS
// ============================================

function showScreen(screen) {
    // Garante que nenhum modal (evento, venda, assessoria, resultado) fique
    // visível "por cima" ao trocar de tela — ex.: jogador clica em
    // Sair/Encerrar com o modal de evento ainda aberto na tela.
    closeAllModals();

    DOM.screenLobby.classList.remove('active');
    DOM.screenGame.classList.remove('active');
    DOM.screenGameOver.classList.remove('active');

    switch (screen) {
        case 'lobby': DOM.screenLobby.classList.add('active'); break;
        case 'game': DOM.screenGame.classList.add('active'); break;
        case 'gameover': DOM.screenGameOver.classList.add('active'); break;
    }
}

/** Fecha todos os modais do jogo. */
function closeAllModals() {
    ['modalResult', 'modalEvento', 'modalVenda', 'modalVendaOferta',
     'modalAssessoriaSelect', 'modalAssessoriaQuestion'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
    });
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
        <div style="margin-bottom:8px;"><strong>👥 Em jogo (${playing.length})</strong>${playing.map(p => `<div>• ${escapeHtml(p.name)}</div>`).join('')}</div>
        <div><strong>👤 Aguardando (${waiting.length})</strong>${waiting.map(p => `<div>• ${escapeHtml(p.name)}</div>`).join('')}</div>
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
            <div class="player-avatar-sm">${escapeHtml(p.name.charAt(0).toUpperCase())}</div>
            <span class="player-item-name">${escapeHtml(p.name)}</span>
            ${p.isHost ? '<span class="host-badge">HOST</span>' : ''}
            ${p.waitingInLobby ? '<span style="font-size:0.7rem; color:#ffa502;">(aguardando)</span>' : ''}
            ${p.disconnected ? '<span style="font-size:0.7rem; color:#ff4757;">(reconectando...)</span>' : ''}
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
    // Nomes de jogador via textContent (seguro por padrão, sem precisar de
    // escapeHtml — mantido assim pois já era textContent no original).
    document.getElementById('perguntadorName').textContent = round.perguntador;
    document.getElementById('respondedorName').textContent = round.respondedor;
    if (round.evento) {
        document.getElementById('eventCard').style.display = 'flex';
        document.getElementById('eventTitle').textContent = round.evento.titulo;
        document.getElementById('eventDesc').textContent = round.evento.descricao;
    } else {
        document.getElementById('eventCard').style.display = 'none';
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

        // Reflete o estado real da rodada em vez de sempre habilitar —
        // relevante após reload (F5) ou reconexão, quando a rodada já pode
        // ter sido respondida ou ter uma assessoria em andamento.
        const round = Game.state.currentRound;
        const jaRespondeu = !!round?.respondeu;
        const assessoriaPendente = round?.assessoria?.status === 'pending';
        document.querySelectorAll('.alternative-btn').forEach(b => {
            b.disabled = jaRespondeu || assessoriaPendente;
            b.className = 'alternative-btn';
        });

        // Botão de Assessoria — oculto na fase de Encerramento
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

            // Reconstrói o status de assessoria (pedido já feito, aceito,
            // recusado etc.) em vez de assumir que nenhum pedido existe.
            if (round?.assessoria) {
                document.getElementById('btnPedirAssessoria').disabled = true;
                const st = round.assessoria;
                const statusEl = document.getElementById('assessoriaStatus');
                if (st.status === 'pending') {
                    statusEl.textContent = `📞 Aguardando resposta de ${st.assessorName}...`;
                } else if (st.status === 'accepted') {
                    statusEl.textContent = `🧭 ${st.assessorName} sugere: ${st.sugestao.toUpperCase()}`;
                } else if (st.status === 'declined') {
                    statusEl.textContent = `❌ ${st.assessorName} recusou o pedido de assessoria.`;
                }
            } else if (!jaRespondeu) {
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
        // Alternativas vêm do baralho local de perguntas (JSON confiável),
        // não de outro jogador — innerHTML aqui já era seguro no original.
        document.getElementById('allAlternativesList').innerHTML = q.alternativas.map(alt => {
            const letter = alt.charAt(0).toLowerCase();
            const isCorrect = letter === q.correta;
            return `<div style="padding:12px 16px; background:${isCorrect ? 'rgba(0,255,136,0.12)' : 'rgba(255,255,255,0.03)'}; border:2px solid ${isCorrect ? 'rgba(0,255,136,0.4)' : 'rgba(255,255,255,0.08)'}; border-radius:10px; color:${isCorrect ? '#00ff88' : '#e0e0e0'}; font-size:0.9rem; ${isCorrect ? 'font-weight:600;' : ''}">${isCorrect ? '✅ ' : ''}${escapeHtml(alt)}</div>`;
        }).join('');

        // Perguntador é somente leitura: garante que a área de assessoria
        // (exclusiva do Respondedor) fique escondida na tela dele.
        const assessoriaAreaPerg = document.getElementById('assessoriaArea');
        if (assessoriaAreaPerg) assessoriaAreaPerg.style.display = 'none';
    }
}

function displaySpectatorView(perguntador, respondedor) {
    document.getElementById('questionArea').style.display = 'none';
    document.getElementById('spectatorArea').style.display = 'block';
    // textContent — seguro por padrão, sem necessidade de escapeHtml.
    document.getElementById('spectatorMessage').textContent = `⏳ ${perguntador} pergunta para ${respondedor}...`;
    const assessoriaArea = document.getElementById('assessoriaArea');
    if (assessoriaArea) assessoriaArea.style.display = 'none';
}

/**
 * BUGFIX: `state.currentRound.respondeu = true` só é setado aqui no ramo
 * do GUEST (feedback local otimista antes da confirmação do host chegar
 * via rede). Quando o próprio HOST é o Respondedor, handleAnswer() (em
 * game-core.js) é chamado de forma síncrona sobre a MESMA instância de
 * state.currentRound — e se houver uma assessoria pendente, handleAnswer
 * deliberadamente NÃO marca respondeu=true (a resposta fica em
 * pendingAnswer até a assessoria ser resolvida). Antes desta correção,
 * esta função sobrescrevia respondeu=true logo em seguida de qualquer
 * forma, fazendo handleAnswer() descartar a resposta pendente quando
 * reprocessada ("Rodada já foi respondida!") e travando a rodada para
 * sempre nesse cenário (host = Respondedor + assessoria solicitada).
 */
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
        state.currentRound.respondeu = true;
    }
}

// ============================================
// MODAL DE RESULTADO
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
// RANKING
// ============================================

function updatePlayersOnlineList() {
    document.getElementById('playersOnlineList').innerHTML = Game.getActivePlayers().map(p => {
        const fase = Game.getFaseById(p.phase);
        return `<div class="online-player"><div class="player-avatar-xs">${escapeHtml(p.name.charAt(0))}</div><span>${escapeHtml(p.name)}</span><span style="font-size:0.7rem; color:#ffd700;">📦${p.recursos || 0}</span><span class="mini-phase">${fase.emoji}</span></div>`;
    }).join('') || '<div style="color:#6a6a80; font-size:0.8rem;">Nenhum jogador ativo</div>';
}

function updateRankingList() {
    // O ranking exibido durante a partida reflete apenas jogadores ativos,
    // consistente com a lista de "Jogadores" (updatePlayersOnlineList).
    // Jogadores que saíram da partida (waitingInLobby) só reaparecem no
    // ranking final de fim de jogo (displayFinalRanking).
    const ranking = Game.core.buildRanking().filter(p => !p.waitingInLobby);
    const medalhas = ['🥇', '🥈', '🥉'];
    document.getElementById('rankingList').innerHTML = ranking.map((p, i) => `
        <div class="rank-item"><span class="rank-pos">${medalhas[i] || '#' + (i + 1)}</span><span class="rank-name">${escapeHtml(p.name)}</span><span class="rank-kpi">${p.kpiFinal} ⭐</span></div>
    `).join('');
}

function displayFinalRanking(ranking) {
    const medalhas = ['🥇', '🥈', '🥉'];
    const formula = document.getElementById('kpiFinalFormula');

    if (formula) {
        formula.textContent =
            `KPI Final = KPI acumulado + (Recursos restantes × ${CONFIG.KPI.VALOR_RECURSO_FINAL})`;
    }
    document.getElementById('finalRanking').innerHTML = ranking.map((p, i) => {
        const kpiRecursos = p.recursos * CONFIG.KPI.VALOR_RECURSO_FINAL;
        return `<div class="final-rank-item ${i < 3 ? 'top-' + (i + 1) : ''}">
        <span class="final-rank-pos">${medalhas[i] || '#' + p.posicao}</span>
        <span class="final-rank-name">${escapeHtml(p.name)}</span>
        <span class="final-rank-kpi">${p.kpiFinal} ⭐</span>
        <div class="final-rank-detail" style="font-size:0.75rem; color:#a0a0b8; margin-top:4px;">KPI acumulado (acertos, vendas, compras e assessorias): ${p.kpi} | Recursos: ${p.recursos}📦 × ${CONFIG.KPI.VALOR_RECURSO_FINAL} = ${kpiRecursos} KPI</div>
    </div>`;
    }).join('');
}

// ============================================
// VENDA DE RECURSOS
// ============================================

/**
 * Abre o modal de venda de recursos
 *
 * BUGFIX: a lista de compradores usava
 * `onclick="Game.ui.confirmarVenda('${c.name}')"` montado como string —
 * além de vulnerável a XSS, um nome contendo aspas simples (') quebrava
 * literalmente o atributo onclick gerado. Agora os botões são criados sem
 * onclick inline: o nome vai num atributo `data-name` (sempre seguro,
 * pois atributos não são interpretados como HTML) e um único listener
 * delegado lê esse atributo ao clicar.
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

    // Mantém o preço exibido sempre em sincronia com CONFIG, em vez de
    // depender de um valor fixo escrito no HTML.
    document.getElementById('vendaValorKPI').textContent = CONFIG.KPI.VALOR_VENDA_RECURSO + ' KPI';

    // Atualiza informações
    document.getElementById('vendaSeusRecursos').textContent =
        'Seus recursos: 📦 ' + me.recursos;

    // Lista de compradores — sem onclick inline (ver comentário acima).
    const compradoresEl = document.getElementById('vendaCompradores');
    compradoresEl.innerHTML = compradores.map(c => `
        <button class="btn btn-glass" data-comprador-name="${escapeHtml(c.name)}"
                style="display:flex; justify-content:space-between; align-items:center; padding:10px 14px;">
            <span>${escapeHtml(c.name)}</span>
            <span style="color:#ffd700; font-size:0.8rem;">⭐${c.kpi} KPI</span>
        </button>
    `).join('');

    compradoresEl.querySelectorAll('button[data-comprador-name]').forEach(btn => {
        btn.addEventListener('click', () => {
            Game.ui.confirmarVenda(btn.getAttribute('data-comprador-name'));
        });
    });

    document.getElementById('modalVenda').style.display = 'flex';
}

/**
 * Confirma a venda para um comprador.
 *
 * O modal não é fechado aqui de forma otimista — o fechamento vem só via
 * broadcast ('venda-confirmed') ou rejeição ('venda-rejected'),
 * processados em game-network.js. Aqui só mostramos um estado de
 * "processando" para dar feedback sem esconder uma possível rejeição do
 * host.
 */
function confirmarVenda(compradorName) {
    if (confirm('Enviar oferta de venda de 1📦 para ' + compradorName + ' por ' + CONFIG.KPI.VALOR_VENDA_RECURSO + ' KPI?')) {
        Game.core.venderRecurso(compradorName);

        // Feedback não-destrutivo: desabilita os botões e avisa que está
        // aguardando confirmação do host, mas mantém o modal aberto até
        // que 'venda-confirmed' (fecha e atualiza UI) ou 'venda-rejected'
        // (alerta o motivo) cheguem via game-network.js.
        document.querySelectorAll('#vendaCompradores button').forEach(b => b.disabled = true);
        const seusRecursosEl = document.getElementById('vendaSeusRecursos');
        if (seusRecursosEl) {
            seusRecursosEl.textContent = '🔄 Aguardando ' + compradorName + ' aceitar a oferta...';
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
 *
 * BUGFIX: mesma questão de segurança/robustez de showVendaModal() — troca
 * de onclick inline por data-attribute + listener delegado.
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

    const listaEl = document.getElementById('assessoriaJogadoresList');
    listaEl.innerHTML = candidatos.map(p => `
        <button class="btn btn-glass" data-assessor-name="${escapeHtml(p.name)}"
                style="display:flex; justify-content:space-between; align-items:center; padding:10px 14px;">
            <span>${escapeHtml(p.name)}</span>
            <span style="font-size:0.8rem; color:#a0a0b8;">${Game.getFaseById(p.phase).emoji}</span>
        </button>
    `).join('');

    listaEl.querySelectorAll('button[data-assessor-name]').forEach(btn => {
        btn.addEventListener('click', () => {
            Game.ui.escolherAssessor(btn.getAttribute('data-assessor-name'));
        });
    });

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
        // Evita clicar em uma alternativa enquanto a assessoria está pendente
        document.querySelectorAll('.alternative-btn').forEach(b => b.disabled = true);

        // Registra a assessoria também no estado local (não só no host),
        // incluindo quando o próprio jogador é o host. Sem isso,
        // 'currentRound.assessoria' só era populado no objeto de estado do
        // host dentro de handleAssessoriaRequest(); nos clientes (guests)
        // esse campo nunca era setado localmente ao pedir — só o texto na
        // tela mudava. Isso quebrava o guard local em requestAssessoria()
        // (`state.currentRound.assessoria` nunca bloqueava um 2º pedido no
        // client) e a reconstrução de estado em displayQuestion() após F5,
        // reconexão ou migração de host durante uma assessoria pendente.
        if (Game.state.currentRound) {
            Game.state.currentRound.assessoria = {
                assessorName,
                status: 'pending',
                sugestao: null
            };
        }
    }
}

/**
 * Notifica o Respondedor que o pedido foi iniciado (broadcast do host)
 */
function showAssessoriaStarted(msg) {
    const state = Game.state;

    // Atualiza o estado local em TODOS os clientes — não só no
    // Respondedor. Sem isso, um espectador/backup que assuma como host
    // (becomeHost) no meio de uma Assessoria pendente não sabe que ela
    // existe: o timeout de segurança correspondente nunca é rearmado (ver
    // becomeHost) e a resposta do assessor, ao chegar no novo host, é
    // descartada pelo guard `!state.currentRound.assessoria` em
    // handleAssessoriaAnswer(), travando o Respondedor indefinidamente.
    if (state.currentRound) {
        state.currentRound.assessoria = {
            assessorName: msg.assessorName,
            status: 'pending',
            sugestao: null
        };
    }

    if (state.playerName === state.currentRound?.respondedor) {
        document.getElementById('btnPedirAssessoria').disabled = true;
        document.getElementById('assessoriaStatus').textContent = `📞 Aguardando resposta de ${msg.assessorName}...`;
    }
}

/**
 * Exibe o modal de pergunta para o jogador chamado como assessor
 *
 * Alternativas vêm do baralho local de perguntas (fonte confiável), não
 * de outro jogador — o onclick aqui usa apenas a letra ('a'/'b'/'c'/'d'),
 * um valor controlado internamente, não texto arbitrário de rede.
 */
function showAssessoriaQuestionModal(msg) {
    document.getElementById('assessoriaQuestionText').textContent = msg.pergunta;
    document.getElementById('assessoriaAlternativesList').innerHTML = msg.alternativas.map(alt => {
        const letra = alt.charAt(0).toLowerCase();
        return `<button class="btn btn-glass" onclick="Game.ui.responderAssessoria('${letra}', false)"
                    style="text-align:left; padding:10px 14px;">${escapeHtml(alt)}</button>`;
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

    // As duas atualizações de ESTADO (status/sugestão da assessoria e sua
    // limpeza quando inválida) rodam em TODOS os clientes, antes de
    // qualquer early-return — mesma razão de showAssessoriaStarted acima.
    // Só o restante da função (atualização de UI) continua restrito à
    // tela do Respondedor.
    if (state.currentRound?.assessoria) {
        state.currentRound.assessoria.status = msg.recusado ? 'declined' : 'accepted';
        state.currentRound.assessoria.sugestao = msg.recusado ? null : msg.sugestao;
    }
    if (msg.invalido && state.currentRound) {
        state.currentRound.assessoria = null;
    }

    if (state.playerName !== state.currentRound?.respondedor) return;

    const statusEl = document.getElementById('assessoriaStatus');
    if (!statusEl) return;

    if (msg.recusado) {
        if (msg.invalido && msg.motivo === 'fase-encerramento') {
            statusEl.textContent = '⚠️ Jogadores na fase de Encerramento não podem pedir assessoria.';
        } else if (msg.invalido) {
            statusEl.textContent = `⚠️ Não foi possível chamar ${msg.assessorName}. Escolha uma alternativa.`;
        } else if (msg.timeout) {
            statusEl.textContent = `⌛ ${msg.assessorName} não respondeu a tempo.`;
        } else {
            statusEl.textContent = `❌ ${msg.assessorName} recusou o pedido de assessoria.`;
        }
    } else {
        statusEl.textContent = `🧭 ${msg.assessorName} sugere: ${msg.sugestao.toUpperCase()}`;
    }

    // Reabilita as alternativas agora que a assessoria foi resolvida (só
    // se ainda não houver resposta enviada nesta rodada)
    if (!state.currentRound.respondeu) {
        document.querySelectorAll('.alternative-btn').forEach(b => b.disabled = false);
    }

    // Se o pedido foi rejeitado por regra (fase de Encerramento ou
    // assessor inválido), o registro local da assessoria já foi limpo
    // acima independente do motivo. O botão "Pedir Assessoria" é que só é
    // reabilitado quando a regra permitiria um novo pedido nesta mesma
    // rodada (não é o caso da fase de Encerramento, cuja restrição vale
    // para a rodada inteira).
    if (msg.invalido && msg.motivo !== 'fase-encerramento') {
        const btnPedir = document.getElementById('btnPedirAssessoria');
        if (btnPedir && !state.currentRound.respondeu) btnPedir.disabled = false;
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
    closeAllModals,
    escapeHtml,
    updateConnectionStatus, updatePlayersList, checkStartCondition,
    updateTimerDisplay, displayRoundStart, displayQuestion, displaySpectatorView,
    showResultModal, showEventoModal,
    updatePlayersOnlineList, updateRankingList, displayFinalRanking,
    handleAlternativeClick,
    showVendaModal,
    confirmarVenda,
    fecharVendaModal,
    showVendaOfertaModal,
    responderOfertaVenda,
    showAssessoriaSelectModal,
    escolherAssessor,
    showAssessoriaStarted,
    showAssessoriaQuestionModal,
    responderAssessoria,
    showAssessoriaResult,
    showAssessoriaBonusModal
};