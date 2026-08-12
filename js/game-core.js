// ============================================
// PM: The KPI Master - Núcleo do Jogo
// ============================================
// Responsabilidades:
//   - Sorteio de pares (Perguntador/Respondedor) e eventos
//   - Controle de baralho de perguntas (evitar repetições)
//   - Cálculo de KPI, progressão de fases e recursos
//   - Gerenciamento de partida (iniciar, encerrar)
//   - Sistema de venda de recursos e assessoria
// ============================================

// ============================================
// RODADA – SORTEIO E PERGUNTAS
// ============================================

/**
 * Inicia uma nova rodada: sorteia um evento, aplica seus efeitos e
 * escolhe um par Perguntador/Respondedor.
 */
function startNewRound() {
    const state = Game.state;
    const evento = sortearEvento();
    if (!evento) {
        console.error('❌ Nenhum evento disponível!');
        return;
    }

    // Aplica os efeitos do evento sobre os recursos
    aplicarEfeitosEvento(evento);

    // Atualiza a interface após o evento
    Game.ui.updatePlayersOnlineList();
    Game.ui.updateRankingList();

    const me = Game.getPlayerByName(state.playerName);
    if (me) {
        document.getElementById('myRecursos').textContent = me.recursos;
        document.getElementById('myKPI').textContent = me.kpi;
    }

    pickNewPair(evento);
}

/**
 * Escolhe aleatoriamente um Perguntador e um Respondedor entre os
 * jogadores ativos, respeitando o rodízio e a disponibilidade de recursos.
 * @param {object} evento – o evento da rodada (pode ser reutilizado em chamadas recursivas)
 * @param {number} depth – profundidade da recursão (previne loops infinitos)
 */
function pickNewPair(evento = null, depth = 0) {
    const state = Game.state;

    if (depth > CONFIG.JOGO.MAX_PLAYERS * 2) {
        console.error('❌ Nenhum jogador com recursos disponíveis. Encerrando partida.');
        endGame(buildRanking());
        return;
    }

    // Se não foi passado um evento, sorteia um novo
    const eventoJaExibidoNestaRodada = depth > 0;
    if (!evento) {
        evento = sortearEvento();
        if (!evento) return;
        aplicarEfeitosEvento(evento);

        Game.ui.updatePlayersOnlineList();
        Game.ui.updateRankingList();
        const me = Game.getPlayerByName(state.playerName);
        if (me) {
            document.getElementById('myRecursos').textContent = me.recursos;
            document.getElementById('myKPI').textContent = me.kpi;
        }
    }

    // Mostra o modal do evento apenas na primeira vez que ele é exibido
    if (!eventoJaExibidoNestaRodada) {
        Game.network.broadcastAll({ type: 'show-evento', evento: evento, players: state.players });
        Game.ui.showEventoModal(evento);
    }

    const activePlayers = Game.getActivePlayers();
    if (activePlayers.length < CONFIG.JOGO.MIN_PLAYERS) {
        console.warn('⚠️ Jogadores ativos insuficientes para continuar a partida.');
        endGame(buildRanking());
        return;
    }

    // Filtra Respondedores com recursos (exceto se o evento for "Reserva de Contingência")
    const semCustoNestaRodada = evento?.reserva_contingencia === true;
    const comRecursos = semCustoNestaRodada
        ? activePlayers
        : activePlayers.filter(p => p.recursos > 0);

    // Jogadores sem recursos pulam a vez (marcados como já usados nesta rodada)
    if (!semCustoNestaRodada) {
        activePlayers
            .filter(p => p.recursos <= 0 && !state.usedRespondedorThisRound.includes(p.name))
            .forEach(p => {
                console.log('⏭️ ' + p.name + ' sem recursos — pulando a vez neste ciclo.');
                state.usedRespondedorThisRound.push(p.name);
            });
    }

    if (comRecursos.length === 0) {
        console.warn('⚠️ Nenhum jogador ativo tem recursos. Encerrando partida.');
        endGame(buildRanking());
        return;
    }

    // Seleciona um Respondedor que ainda não tenha respondido nesta rodada
    const available = comRecursos.filter(p =>
        !state.usedRespondedorThisRound.includes(p.name)
    );
    if (available.length === 0) {
        state.usedRespondedorThisRound = [];
        return pickNewPair(evento, depth + 1);
    }

    const respondedor = available[Math.floor(Math.random() * available.length)];
    const askers = activePlayers.filter(p => p.peerId !== respondedor.peerId);
    if (askers.length === 0) return;

    const perguntador = askers[Math.floor(Math.random() * askers.length)];
    const pergunta = sortearPergunta(respondedor.phase);

    if (!pergunta) {
        console.error('❌ Sem pergunta disponível!');
        return;
    }

    state.currentRound = {
        evento,
        perguntador: perguntador.name,
        respondedor: respondedor.name,
        pergunta,
        respondeu: false
    };

    console.log('🎯 Nova dupla:', perguntador.name, 'pergunta para', respondedor.name);
    console.log('📋 Evento:', evento.titulo);

    Game.network.broadcastAll({
        type: 'round-start',
        evento,
        perguntador: perguntador.name,
        respondedor: respondedor.name
    });

    const areaNome = state.questionsData.areas[pergunta.area_key]?.nome || pergunta.area_key;
    const grupoNome = Game.getFaseById(respondedor.phase).nome;

    const perguntaData = {
        type: 'question',
        pergunta: pergunta.pergunta,
        area: areaNome,
        grupo: grupoNome,
        alternativas: pergunta.alternativas,
        correta: pergunta.correta,
        id: pergunta.id
    };

    // Envia a pergunta (com gabarito) para o Perguntador
    Game.network.sendToPlayer(perguntador.peerId, { ...perguntaData, isPerguntador: true });

    // Envia a pergunta (sem gabarito) para o Respondedor
    Game.network.sendToPlayer(respondedor.peerId, { ...perguntaData, isRespondedor: true, correta: undefined });

    // Espectadores veem a tela de espera
    if (state.playerName !== perguntador.name && state.playerName !== respondedor.name) {
        Game.ui.displaySpectatorView(perguntador.name, respondedor.name);
    }

    Game.ui.displayRoundStart();

    // Timeout de segurança para o Respondedor
    armarRespostaTimeout(respondedor.name);

    Game.saveState();
}

/**
 * Arma um timeout para evitar que a rodada fique travada se o Respondedor
 * não responder (desconexão, travamento, etc.).
 */
function armarRespostaTimeout(respondedorName) {
    const state = Game.state;
    if (state.respostaTimeout) {
        clearTimeout(state.respostaTimeout);
        state.respostaTimeout = null;
    }
    state.respostaTimeout = setTimeout(() => {
        console.warn('⌛ Timeout: ' + respondedorName + ' não respondeu a tempo. Pulando vez automaticamente.');
        Game.core.handleAnswer({ alternativa: null, playerName: respondedorName, timeout: true });
    }, CONFIG.JOGO.RESPOSTA_TIMEOUT);
}

/**
 * Sorteia uma pergunta não utilizada de uma área compatível com a fase
 * do Respondedor. Se todas as perguntas de uma área forem usadas, o
 * baralho é reiniciado.
 */
function sortearPergunta(grupoProcesso) {
    const state = Game.state;
    let areasDisponiveis = [];

    for (const [key, area] of Object.entries(state.questionsData?.areas || {})) {
        if (area.grupos.includes(grupoProcesso) && state.baralhos[key]?.disponiveis > 0) {
            areasDisponiveis.push(key);
        }
    }

    if (areasDisponiveis.length === 0) {
        for (const [key, area] of Object.entries(state.questionsData?.areas || {})) {
            if (area.grupos.includes(grupoProcesso)) {
                resetBaralho(key);
                areasDisponiveis.push(key);
            }
        }
    }

    if (areasDisponiveis.length === 0) return null;

    const areaSorteada = areasDisponiveis[Math.floor(Math.random() * areasDisponiveis.length)];
    const baralho = state.baralhos[areaSorteada];
    if (!baralho || baralho.disponiveis <= 0) return null;

    const disponiveis = baralho.perguntas.filter(p => !p.usada);
    if (disponiveis.length === 0) return null;

    const pergunta = disponiveis[Math.floor(Math.random() * disponiveis.length)];
    pergunta.usada = true;
    baralho.disponiveis--;

    return { ...pergunta, area_key: areaSorteada };
}

/**
 * Reinicia o baralho de uma área, marcando todas as perguntas como não usadas.
 */
function resetBaralho(areaKey) {
    const baralho = Game.state.baralhos[areaKey];
    if (baralho) {
        baralho.perguntas.forEach(p => p.usada = false);
        baralho.disponiveis = baralho.total;
    }
}

/**
 * Reinicia todos os baralhos (usado ao iniciar uma nova partida).
 */
function resetAllBaralhos() {
    Object.keys(Game.state.baralhos).forEach(key => resetBaralho(key));
    console.log('🔄 Baralhos de perguntas resetados para a próxima partida.');
}

// ============================================
// EFEITOS DOS EVENTOS
// ============================================

/**
 * Aplica os efeitos do evento sobre os recursos dos jogadores ativos.
 */
function aplicarEfeitosEvento(evento) {
    const state = Game.state;
    if (!evento) return;

    const ativos = Game.getActivePlayers();

    if (evento.recursos_todos > 0) {
        ativos.forEach(p => p.recursos += evento.recursos_todos);
        console.log('🟢 Evento: +' + evento.recursos_todos + ' recurso(s) para todos os ativos');
    }

    if (evento.recursos_todos < 0) {
        ativos.forEach(p => {
            p.recursos = Math.max(0, p.recursos + evento.recursos_todos);
        });
        console.log('🔴 Evento: ' + evento.recursos_todos + ' recurso(s) de todos os ativos');
    }

    if (evento.recursos_menos && ativos.length > 0) {
        const minRecursos = Math.min(...ativos.map(p => p.recursos));
        const beneficiados = ativos.filter(p => p.recursos === minRecursos);
        beneficiados.forEach(p => p.recursos += evento.recursos_menos);
        console.log('🎁 Evento: +' + evento.recursos_menos + ' recursos para ' + beneficiados.map(p => p.name).join(', '));
    }

    if (evento.troca_recursos && ativos.length > 0) {
        const maxRecursos = Math.max(...ativos.map(p => p.recursos));
        const minRecursos = Math.min(...ativos.map(p => p.recursos));
        if (maxRecursos > minRecursos) {
            const rico = ativos.find(p => p.recursos === maxRecursos);
            const pobre = ativos.find(p => p.recursos === minRecursos);
            if (rico && pobre && rico !== pobre) {
                rico.recursos--;
                pobre.recursos++;
                console.log('🔄 Evento: ' + rico.name + ' deu 1 recurso para ' + pobre.name);
            }
        }
    }
}

/**
 * Sorteia um evento, dando 50% de chance para o evento neutro (se houver)
 * e distribuindo os outros 50% entre os demais.
 */
function sortearEvento() {
    const eventos = Game.state.questionsData?.eventos || [];
    if (eventos.length === 0) return null;

    const neutro = eventos.find(e => e.neutro === true);
    const outros = eventos.filter(e => e.neutro !== true);

    if (neutro && (outros.length === 0 || Math.random() < 0.5)) {
        return neutro;
    }
    return outros[Math.floor(Math.random() * outros.length)];
}

// ============================================
// RESPOSTA E CÁLCULO DE KPI
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
        if (state.isHost) setTimeout(() => pickNewPair(), 500);
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
        setTimeout(() => nextTurn(), 2000);
        Game.saveState();
        return;
    }

    if (gastaRecurso) {
        respondedor.recursos--;
    }

    let kpiGanho = 0;
    if (acertou) {
        kpiGanho = CONFIG.KPI.ACERTO_BASE;
        respondedor.kpi += kpiGanho;
        respondedor.activities++;

        const faseIdx = Game.getFaseIndex(respondedor.phase);
        if (respondedor.activities >= CONFIG.JOGO.ACTIVITIES_PER_PHASE && faseIdx < CONFIG.FASES.length - 1) {
            respondedor.phase = CONFIG.FASES[faseIdx + 1].id;
            respondedor.activities = 0;
        }
    }

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

    // Bônus de assessoria (se a sugestão foi seguida e correta)
    const assessoria = state.currentRound.assessoria;
    if (assessoria && assessoria.status === 'accepted' && assessoria.sugestao === msg.alternativa && acertou) {
        const assessor = Game.getPlayerByName(assessoria.assessorName);
        if (assessor) {
            assessor.kpi += CONFIG.KPI.ASSESSORIA_ACERTO;
            console.log('🧭 Assessoria: ' + assessor.name + ' +' + CONFIG.KPI.ASSESSORIA_ACERTO + ' KPI');

            Game.network.broadcastAll({
                type: 'kpi-update',
                playerName: assessor.name,
                kpi: assessor.kpi,
                phase: assessor.phase,
                activities: assessor.activities,
                recursos: assessor.recursos,
                assessoriaBonus: CONFIG.KPI.ASSESSORIA_ACERTO
            });

            if (state.isHost && assessor.name === state.playerName) {
                updatePlayerKPI({
                    playerName: assessor.name,
                    kpi: assessor.kpi,
                    phase: assessor.phase,
                    activities: assessor.activities,
                    recursos: assessor.recursos,
                    assessoriaBonus: CONFIG.KPI.ASSESSORIA_ACERTO
                });
            }
        }
    }

    state.usedRespondedorThisRound.push(respondedorName);

    const faseIdx = Game.getFaseIndex(respondedor.phase);
    if (faseIdx === CONFIG.FASES.length - 1 && respondedor.activities >= CONFIG.JOGO.ACTIVITIES_PER_PHASE) {
        setTimeout(() => endGame(buildRanking()), 3000);
    } else {
        setTimeout(() => nextTurn(), 3000);
    }

    Game.saveState();
}

/**
 * Avança para a próxima rodada ou, se todos já responderam, inicia uma nova rodada.
 */
function nextTurn() {
    const state = Game.state;
    const activePlayers = Game.getActivePlayers();
    const allDone = activePlayers.every(p => state.usedRespondedorThisRound.includes(p.name));

    if (allDone) {
        state.usedRespondedorThisRound = [];
        startNewRound();
    } else {
        pickNewPair();
    }
}

/**
 * Atualiza a interface do jogador com seus novos valores de KPI, fase, etc.
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

    if (msg.playerName === state.playerName) {
        document.getElementById('myKPI').textContent = msg.kpi;
        if (msg.recursos !== undefined) {
            document.getElementById('myRecursos').textContent = msg.recursos;
        }
        const fase = Game.getFaseById(msg.phase);
        document.getElementById('myPhaseName').textContent = fase.nome;
        document.getElementById('myPhaseIcon').textContent = fase.emoji;
        document.getElementById('myActivity').textContent = msg.activities;
        document.getElementById('myProgressFill').style.width =
            (msg.activities / CONFIG.JOGO.ACTIVITIES_PER_PHASE * 100) + '%';

        if (msg.semRecursos) {
            Game.ui.showResultModal(false, 0, msg.recursos);
            const resultMsg = document.getElementById('resultMessage');
            if (resultMsg) resultMsg.textContent = '⚠️ Sem recursos — vez pulada';
        } else if (msg.acertou !== undefined) {
            Game.ui.showResultModal(msg.acertou, msg.kpiGanho, msg.recursos);
        } else if (msg.assessoriaBonus) {
            Game.ui.showAssessoriaBonusModal(msg.assessoriaBonus);
        }
    }

    Game.ui.updatePlayersOnlineList();
    Game.ui.updateRankingList();
}

// ============================================
// SISTEMA DE ASSESSORIA
// ============================================

/**
 * Solicita assessoria a outro jogador (chamado pelo Respondedor).
 * Verifica se a rodada ainda está ativa e se o jogador não está na fase de Encerramento.
 */
function requestAssessoria(assessorName) {
    const state = Game.state;

    if (!state.currentRound || state.currentRound.assessoria) {
        console.warn('⚠️ Já existe um pedido de assessoria nesta rodada.');
        return false;
    }
    if (state.currentRound.respondeu) {
        console.warn('⚠️ Rodada já foi respondida — não é mais possível pedir assessoria.');
        return false;
    }
    const me = Game.getPlayerByName(state.playerName);
    if (me && Game.getFaseIndex(me.phase) === CONFIG.FASES.length - 1) {
        alert('⚠️ Jogadores na fase de Encerramento não podem pedir assessoria.');
        return false;
    }

    if (state.isHost) {
        handleAssessoriaRequest({ assessorName, requesterName: state.playerName });
    } else {
        Game.network.sendToHost({ type: 'assessoria-request', assessorName, requesterName: state.playerName });
    }
    return true;
}

/**
 * Host: processa o pedido de assessoria, valida e encaminha para o assessor.
 */
function handleAssessoriaRequest(msg) {
    const state = Game.state;
    if (!state.isHost || !state.currentRound || state.currentRound.assessoria) return;
    if (msg.requesterName !== state.currentRound.respondedor) return;
    if (state.currentRound.respondeu) {
        const req = Game.getPlayerByName(msg.requesterName);
        if (req) {
            Game.network.sendToPlayer(req.peerId, {
                type: 'assessoria-result',
                assessorName: msg.assessorName,
                sugestao: null,
                recusado: true,
                invalido: true,
                motivo: 'ja-respondido'
            });
        }
        return;
    }

    const requester = Game.getPlayerByName(msg.requesterName);
    const assessor = Game.getPlayerByName(msg.assessorName);

    const requesterEmEncerramento = requester &&
        Game.getFaseIndex(requester.phase) === CONFIG.FASES.length - 1;

    const invalido =
        !assessor ||
        assessor.waitingInLobby ||
        requesterEmEncerramento ||
        msg.assessorName === state.currentRound.perguntador ||
        msg.assessorName === state.currentRound.respondedor;

    if (invalido) {
        console.warn('⚠️ Pedido de assessoria rejeitado pelo host:', msg.assessorName,
            requesterEmEncerramento ? '(Respondedor na fase de Encerramento)' : '');
        if (requester) {
            Game.network.sendToPlayer(requester.peerId, {
                type: 'assessoria-result',
                assessorName: msg.assessorName,
                sugestao: null,
                recusado: true,
                invalido: true,
                motivo: requesterEmEncerramento ? 'fase-encerramento' : undefined
            });
        }
        return;
    }

    state.currentRound.assessoria = {
        assessorName: msg.assessorName,
        status: 'pending',
        sugestao: null
    };

    // Pausa o timeout de resposta enquanto aguarda a assessoria
    if (state.respostaTimeout) {
        clearTimeout(state.respostaTimeout);
        state.respostaTimeout = null;
    }

    Game.network.broadcastAll({
        type: 'assessoria-started',
        assessorName: msg.assessorName,
        requesterName: msg.requesterName
    });

    const pergunta = state.currentRound.pergunta;
    const areaNome = state.questionsData.areas[pergunta.area_key]?.nome || pergunta.area_key;

    Game.network.sendToPlayer(assessor.peerId, {
        type: 'assessoria-question',
        pergunta: pergunta.pergunta,
        area: areaNome,
        alternativas: pergunta.alternativas,
        id: pergunta.id
    });

    if (state.assessoriaTimeout) clearTimeout(state.assessoriaTimeout);
    state.assessoriaTimeout = setTimeout(() => {
        handleAssessoriaAnswer({ alternativa: null, recusado: true, timeout: true });
    }, CONFIG.JOGO.ASSESSORIA_TIMEOUT);

    Game.saveState();
}

/**
 * Host: processa a resposta (ou recusa/timeout) do assessor.
 */
function handleAssessoriaAnswer(msg) {
    const state = Game.state;
    if (!state.isHost || !state.currentRound || !state.currentRound.assessoria) return;
    if (state.currentRound.assessoria.status !== 'pending') return;

    if (state.assessoriaTimeout) {
        clearTimeout(state.assessoriaTimeout);
        state.assessoriaTimeout = null;
    }

    state.currentRound.assessoria.status = msg.recusado ? 'declined' : 'accepted';
    state.currentRound.assessoria.sugestao = msg.recusado ? null : msg.alternativa;

    const resultMsg = {
        type: 'assessoria-result',
        assessorName: state.currentRound.assessoria.assessorName,
        sugestao: state.currentRound.assessoria.sugestao,
        recusado: !!msg.recusado,
        timeout: !!msg.timeout
    };

    Game.network.broadcastAll(resultMsg);
    Game.ui.showAssessoriaResult(resultMsg);

    // Rearma o timeout de resposta se a rodada ainda não foi respondida
    if (!state.currentRound.respondeu && !state.currentRound.pendingAnswer) {
        armarRespostaTimeout(state.currentRound.respondedor);
    }

    // Se o Respondedor já tinha enviado uma resposta, processa agora
    if (state.currentRound.pendingAnswer) {
        const pending = state.currentRound.pendingAnswer;
        state.currentRound.pendingAnswer = null;
        handleAnswer(pending);
    }

    Game.saveState();
}

// ============================================
// CONTROLE DE PARTIDA
// ============================================

/**
 * Inicia uma nova partida: reseta todos os jogadores, inicia o timer e
 * dá início à primeira rodada (se for o host).
 */
function startGame() {
    const state = Game.state;
    state.gameStarted = true;
    state.gameOver = false;
    state.usedRespondedorThisRound = [];

    Game.resetAllPlayers();

    const me = Game.getPlayerByName(state.playerName);
    if (me) {
        document.getElementById('myKPI').textContent = me.kpi;
        document.getElementById('myRecursos').textContent = me.recursos;
        const fase = Game.getFaseById(me.phase);
        document.getElementById('myPhaseName').textContent = fase.nome;
        document.getElementById('myPhaseIcon').textContent = fase.emoji;
        document.getElementById('myActivity').textContent = me.activities;
        document.getElementById('myProgressFill').style.width = '0%';
    }

    clearInterval(state.timerInterval);
    state.timerInterval = setInterval(() => {
        state.timer--;
        Game.ui.updateTimerDisplay();

        if (state.timer % 10 === 0 && state.isHost) {
            Game.network.broadcastAll({ type: 'timer-update', remaining: state.timer });
        }

        if (state.timer <= 0) {
            clearInterval(state.timerInterval);
            if (state.isHost) endGame(buildRanking());
        }
    }, 1000);

    Game.ui.showScreen('game');
    Game.ui.updatePlayersOnlineList();
    Game.ui.updateTimerDisplay();

    if (state.isHost) startNewRound();
    Game.saveState();
}

/**
 * Encerra a partida, exibe o ranking final e notifica todos os jogadores.
 */
function endGame(ranking) {
    const state = Game.state;
    state.gameOver = true;
    clearInterval(state.timerInterval);

    if (state.assessoriaTimeout) {
        clearTimeout(state.assessoriaTimeout);
        state.assessoriaTimeout = null;
    }
    if (state.respostaTimeout) {
        clearTimeout(state.respostaTimeout);
        state.respostaTimeout = null;
    }
    state.currentRound = null;

    if (state.isHost) {
        Game.network.broadcastAll({ type: 'game-over', ranking });
    }

    Game.ui.showScreen('gameover');
    Game.ui.displayFinalRanking(ranking);
    Game.saveState();
}

/**
 * Encerra a partida e retorna todos ao lobby (apenas host).
 */
function endMatch() {
    if (!Game.state.isHost) return;
    if (!confirm('🏁 Encerrar a partida? Todos voltarão ao lobby com KPI zerado.')) return;

    if (Game.state.assessoriaTimeout) {
        clearTimeout(Game.state.assessoriaTimeout);
        Game.state.assessoriaTimeout = null;
    }
    if (Game.state.respostaTimeout) {
        clearTimeout(Game.state.respostaTimeout);
        Game.state.respostaTimeout = null;
    }

    Game.resetAllPlayers();
    Game.resetGameState();
    Game.core.resetAllBaralhos();

    Game.network.broadcastAll({ type: 'match-ended', players: Game.state.players });
    Game.ui.showScreen('lobby');
    Game.ui.showLobbyNormal();
    Game.ui.updatePlayersList();
    Game.ui.updateTimerDisplay();
    Game.ui.checkStartCondition();
    Game.saveState();
}

/**
 * Guest: processa a mensagem de 'match-ended' vinda do host.
 */
function handleMatchEnded(msg) {
    Game.state.players = msg.players;
    Game.resetAllPlayers();
    Game.resetGameState();
    Game.core.resetAllBaralhos();
    Game.ui.showScreen('lobby');
    Game.ui.showLobbyNormal();
    Game.ui.updatePlayersList();
    Game.ui.updateTimerDisplay();
    Game.saveState();
}

// ============================================
// VENDA DE RECURSOS
// ============================================

/**
 * Inicia uma oferta de venda: o vendedor escolhe um comprador,
 * e o host encaminha a oferta para o comprador decidir.
 */
function venderRecurso(compradorName) {
    const state = Game.state;

    if (state.isHost) {
        handleVendaOfertaRequest({ vendedorName: state.playerName, compradorName });
    } else {
        Game.network.sendToHost({
            type: 'venda-offer-request',
            vendedorName: state.playerName,
            compradorName
        });
    }
    return true;
}

/**
 * Host: valida a oferta e a encaminha ao comprador.
 */
function handleVendaOfertaRequest(msg) {
    const state = Game.state;
    if (!state.isHost) return;

    const vendedor = Game.getPlayerByName(msg.vendedorName);
    const comprador = Game.getPlayerByName(msg.compradorName);

    const erro =
        (!vendedor || !comprador) ? 'Vendedor ou comprador não encontrado.' :
        (vendedor.name === comprador.name) ? 'Você não pode vender para si mesmo.' :
        (vendedor.waitingInLobby || comprador.waitingInLobby) ? 'Jogador não está mais ativo na partida.' :
        (vendedor.recursos < 1) ? 'Vendedor não tem recursos para vender.' :
        (comprador.kpi < CONFIG.KPI.VALOR_VENDA_RECURSO) ? 'Comprador não tem KPI suficiente.' :
        null;

    if (erro) {
        console.warn('⚠️ Oferta de venda rejeitada:', erro);
        Game.network.sendToPlayer(vendedor?.peerId, { type: 'venda-rejected', motivo: erro });
        return;
    }

    Game.network.sendToPlayer(comprador.peerId, {
        type: 'venda-offer',
        vendedorName: vendedor.name,
        compradorName: comprador.name,
        valor: CONFIG.KPI.VALOR_VENDA_RECURSO
    });
}

/**
 * Host: processa a resposta do comprador à oferta.
 */
function handleVendaOfertaResponse(msg) {
    const state = Game.state;
    if (!state.isHost) return;

    if (!msg.aceito) {
        const vendedor = Game.getPlayerByName(msg.vendedorName);
        if (vendedor) {
            Game.network.sendToPlayer(vendedor.peerId, {
                type: 'venda-rejected',
                motivo: msg.compradorName + ' recusou a oferta de compra.'
            });
        }
        return;
    }

    processVenda(msg.vendedorName, msg.compradorName);
}

/**
 * Host: executa a venda efetivamente (única fonte da verdade).
 */
function processVenda(vendedorName, compradorName) {
    const state = Game.state;
    if (!state.isHost) return;

    const vendedor = Game.getPlayerByName(vendedorName);
    const comprador = Game.getPlayerByName(compradorName);

    const erro =
        (!vendedor || !comprador) ? 'Vendedor ou comprador não encontrado.' :
        (vendedor.name === comprador.name) ? 'Você não pode vender para si mesmo.' :
        (vendedor.waitingInLobby || comprador.waitingInLobby) ? 'Jogador não está mais ativo na partida.' :
        (vendedor.recursos < 1) ? 'Vendedor não tem recursos para vender.' :
        (comprador.kpi < CONFIG.KPI.VALOR_VENDA_RECURSO) ? 'Comprador não tem KPI suficiente.' :
        null;

    if (erro) {
        console.warn('⚠️ Venda rejeitada:', erro);
        Game.network.sendToPlayer(vendedor?.peerId, { type: 'venda-rejected', motivo: erro });
        return false;
    }

    vendedor.recursos--;
    vendedor.kpi += CONFIG.KPI.VALOR_VENDA_RECURSO;
    comprador.recursos++;
    comprador.kpi -= CONFIG.KPI.VALOR_VENDA_RECURSO;

    console.log('💰 Venda:', vendedor.name, 'vendeu 1📦 para', comprador.name, 'por', CONFIG.KPI.VALOR_VENDA_RECURSO, 'KPI');

    Game.network.broadcastAll({
        type: 'venda-confirmed',
        vendedor: vendedor.name,
        comprador: comprador.name,
        valor: CONFIG.KPI.VALOR_VENDA_RECURSO,
        vendedorKPI: vendedor.kpi,
        vendedorRecursos: vendedor.recursos,
        compradorKPI: comprador.kpi,
        compradorRecursos: comprador.recursos
    });

    // Atualiza a UI do próprio host
    Game.network.handleMessage({
        type: 'venda-confirmed',
        vendedor: vendedor.name,
        comprador: comprador.name,
        valor: CONFIG.KPI.VALOR_VENDA_RECURSO,
        vendedorKPI: vendedor.kpi,
        vendedorRecursos: vendedor.recursos,
        compradorKPI: comprador.kpi,
        compradorRecursos: comprador.recursos
    }, state.peerId);

    Game.saveState();
    return true;
}

/**
 * Retorna a lista de jogadores que podem comprar (têm KPI suficiente e estão ativos).
 */
function getCompradores() {
    const state = Game.state;
    return state.players.filter(p =>
        p.name !== state.playerName &&
        !p.waitingInLobby &&
        p.kpi >= CONFIG.KPI.VALOR_VENDA_RECURSO
    );
}

// ============================================
// CONTROLE DE SESSÃO
// ============================================

/**
 * Encerra a sessão completamente (host) – destrói a sala e redireciona todos.
 */
function endSession() {
    if (!Game.state.isHost) return;
    if (!confirm('⛔ Encerrar a sessão? Todos os jogadores serão desconectados e a sala destruída.')) return;

    Game.ui.closeAllModals();
    Game.network.broadcastAll({ type: 'session-ended' });
    Game.network.cleanup();
    window.location.href = 'index.html';
}

/**
 * Guest: solicita sair da partida em andamento (volta ao lobby como espectador).
 */
function leaveMatch() {
    if (Game.state.isHost) return;
    if (!confirm('🚶 Sair da partida? Você aguardará no lobby até a próxima partida.')) return;

    const me = Game.getPlayerByName(Game.state.playerName);
    if (me) me.waitingInLobby = true;

    Game.network.sendToHost({ type: 'leave-match-request', playerName: Game.state.playerName });

    Game.ui.showScreen('lobby');
    Game.ui.showLobbyWaitingView();
    Game.saveState();
}

/**
 * Host: processa o pedido de saída da partida de um guest.
 */
function handleLeaveMatchRequest(msg) {
    const state = Game.state;
    if (!state.isHost) return;

    const player = Game.getPlayerByName(msg.playerName);
    if (!player || player.waitingInLobby) return;

    player.waitingInLobby = true;
    console.log('🚶 ' + player.name + ' saiu da partida (waitingInLobby=true).');

    Game.network.broadcastAll({ type: 'player-list', players: state.players });
    Game.ui.updatePlayersOnlineList();
    Game.ui.updateRankingList();

    abortRoundIfParticipant(player.name);

    Game.saveState();
}

/**
 * Aborta a rodada atual se o jogador mencionado for o Perguntador ou Respondedor.
 */
function abortRoundIfParticipant(playerName) {
    const state = Game.state;
    if (!state.isHost) return;

    const round = state.currentRound;
    if (round && !round.respondeu &&
        (round.perguntador === playerName || round.respondedor === playerName)) {
        console.warn('⚠️ Participante da rodada atual ficou indisponível — abortando rodada e sorteando nova.');
        if (state.assessoriaTimeout) {
            clearTimeout(state.assessoriaTimeout);
            state.assessoriaTimeout = null;
        }
        if (state.respostaTimeout) {
            clearTimeout(state.respostaTimeout);
            state.respostaTimeout = null;
        }
        state.currentRound = null;
        Game.core.pickNewPair();
    }
}

/**
 * Sai da sessão (qualquer jogador) – redireciona para a página inicial.
 */
function leaveSession() {
    if (Game.state.isHost) {
        endSession();
        return;
    }
    if (!confirm('🚪 Sair da sessão? Você voltará à tela inicial.')) return;

    Game.ui.closeAllModals();
    Game.network.cleanup();
    window.location.href = 'index.html';
}

// ============================================
// RANKING (KPI final)
// ============================================

/**
 * Constrói o ranking final de todos os jogadores.
 * O KPI final = KPI acumulado + (recursos restantes × VALOR_RECURSO_FINAL).
 */
function buildRanking() {
    return [...Game.state.players]
        .map(p => ({
            name: p.name,
            kpi: p.kpi,
            recursos: p.recursos,
            kpiFinal: p.kpi + (p.recursos * CONFIG.KPI.VALOR_RECURSO_FINAL),
            phase: p.phase,
            activities: p.activities,
            isHost: p.isHost,
            waitingInLobby: !!p.waitingInLobby
        }))
        .sort((a, b) => b.kpiFinal - a.kpiFinal)
        .map((p, i) => ({
            posicao: i + 1,
            ...p
        }));
}

// ============================================
// EXPORTAÇÃO
// ============================================
window.Game = window.Game || {};
window.Game.core = {
    startNewRound,
    pickNewPair,
    armarRespostaTimeout,
    sortearPergunta,
    resetBaralho,
    resetAllBaralhos,
    aplicarEfeitosEvento,
    sortearEvento,
    handleAnswer,
    updatePlayerKPI,
    nextTurn,
    startGame,
    endGame,
    endMatch,
    handleMatchEnded,
    endSession,
    leaveMatch,
    handleLeaveMatchRequest,
    abortRoundIfParticipant,
    leaveSession,
    buildRanking,
    handleVendaOfertaRequest,
    handleVendaOfertaResponse,
    venderRecurso,
    processVenda,
    getCompradores,
    requestAssessoria,
    handleAssessoriaRequest,
    handleAssessoriaAnswer
};