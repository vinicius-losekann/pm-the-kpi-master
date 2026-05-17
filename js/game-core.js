// ============================================
// PM: The KPI Master - NÚCLEO DO JOGO (V2)
// ============================================
// Responsabilidades:
//   - Lógica de rodadas (sorteio de pares, perguntas)
//   - Controle de baralho (evitar repetição)
//   - Cálculo de KPI e progressão de fases
//   - Sistema de recursos (V2)
//   - Controle de partida (iniciar, encerrar)
//   - Controle de sessão (encerrar, sair)
//
// Regras V2:
//   - Recursos iniciais: 10 por jogador
//   - Responder gasta 1 recurso (acertando ou errando)
//   - Atividade só ganha se acertar
//   - KPI fixo: 10 por atividade completada
//   - Eventos afetam recursos (não KPI)
//   - KPI Final = KPI acertos + KPI vendas - KPI compras + (recursos restantes × 5)
//   - Atualização de UI: após evento, após venda, após resposta
//
// Dependências:
//   - Game.state (game-state.js)
//   - Game.network (game-network.js)
//   - Game.ui (game-ui.js)
//
// Namespace: Game.core
// ============================================

// ============================================
// RODADA - SORTEIO E PERGUNTAS
// ============================================

function startNewRound() {
    const state = Game.state;
    const eventos = state.questionsData?.eventos || [];
    if (eventos.length === 0) {
        console.error('❌ Nenhum evento disponível!');
        return;
    }
    const evento = eventos[Math.floor(Math.random() * eventos.length)];

    // V2: Aplica efeitos do evento nos recursos
    aplicarEfeitosEvento(evento);

    // 🔧 V2: Atualiza UI imediatamente após o evento (Momento 1)
    Game.ui.updatePlayersOnlineList();
    Game.ui.updateRankingList();
    
    // Atualiza recursos e KPI do próprio jogador na tela
    const me = Game.getPlayerByName(state.playerName);
    if (me) {
        document.getElementById('myRecursos').textContent = me.recursos;
        document.getElementById('myKPI').textContent = me.kpi;
    }

    pickNewPair(evento);
}

function pickNewPair(evento = null) {
    const state = Game.state;

    if (!evento) {
        const eventos = state.questionsData?.eventos || [];
        if (eventos.length === 0) return;
        evento = eventos[Math.floor(Math.random() * eventos.length)];
        aplicarEfeitosEvento(evento);
        
        // Atualiza UI se o evento foi aplicado aqui também
        Game.ui.updatePlayersOnlineList();
        Game.ui.updateRankingList();
        const me = Game.getPlayerByName(state.playerName);
        if (me) {
            document.getElementById('myRecursos').textContent = me.recursos;
            document.getElementById('myKPI').textContent = me.kpi;
        }
    }

    // V2: Mostra modal do evento para todos
    Game.network.broadcastAll({ type: 'show-evento', evento: evento });
    Game.ui.showEventoModal(evento);

    const activePlayers = Game.getActivePlayers();
    const available = activePlayers.filter(p =>
        !state.usedRespondedorThisRound.includes(p.name)
    );

    if (available.length === 0) {
        state.usedRespondedorThisRound = [];
        return pickNewPair(evento);
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

    Game.network.sendToPlayer(perguntador.peerId, { ...perguntaData, isPerguntador: true });

    if (respondedor.peerId === state.peerId && state.isHost) {
        Game.network.sendToPlayer(respondedor.peerId, { ...perguntaData, isRespondedor: true });
    } else {
        Game.network.sendToPlayer(respondedor.peerId, { ...perguntaData, isRespondedor: true, correta: undefined });
    }

    if (state.playerName !== perguntador.name && state.playerName !== respondedor.name) {
        Game.ui.displaySpectatorView(perguntador.name, respondedor.name);
    }

    Game.ui.displayRoundStart();
    Game.saveState();
}

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

function resetBaralho(areaKey) {
    const baralho = Game.state.baralhos[areaKey];
    if (baralho) {
        baralho.perguntas.forEach(p => p.usada = false);
        baralho.disponiveis = baralho.total;
    }
}

// ============================================
// EFEITOS DOS EVENTOS (V2)
// ============================================

function aplicarEfeitosEvento(evento) {
    const state = Game.state;
    if (!evento) return;

    // e1: +1 recurso para todos
    if (evento.recursos_todos > 0) {
        state.players.forEach(p => p.recursos += evento.recursos_todos);
        console.log('🟢 Evento: +' + evento.recursos_todos + ' recurso(s) para todos');
    }

    // e2: -1 recurso de todos (mínimo 0)
    if (evento.recursos_todos < 0) {
        state.players.forEach(p => {
            p.recursos = Math.max(0, p.recursos + evento.recursos_todos);
        });
        console.log('🔴 Evento: ' + evento.recursos_todos + ' recurso(s) de todos');
    }

    // e3: +2 recursos para quem tem menos
    if (evento.recursos_menos) {
        const minRecursos = Math.min(...state.players.map(p => p.recursos));
        const beneficiados = state.players.filter(p => p.recursos === minRecursos);
        beneficiados.forEach(p => p.recursos += evento.recursos_menos);
        console.log('🎁 Evento: +' + evento.recursos_menos + ' recursos para ' + beneficiados.map(p => p.name).join(', '));
    }

    // e5: mais rico dá 1 para mais pobre
    if (evento.troca_recursos) {
        const maxRecursos = Math.max(...state.players.map(p => p.recursos));
        const minRecursos = Math.min(...state.players.map(p => p.recursos));

        if (maxRecursos > minRecursos) {
            const rico = state.players.find(p => p.recursos === maxRecursos);
            const pobre = state.players.find(p => p.recursos === minRecursos);
            if (rico && pobre && rico !== pobre) {
                rico.recursos--;
                pobre.recursos++;
                console.log('🔄 Evento: ' + rico.name + ' deu 1 recurso para ' + pobre.name);
            }
        }
    }
}

// ============================================
// RESPOSTA E KPI (V2 - COM RECURSOS)
// ============================================

function handleAnswer(msg) {
    const state = Game.state;

    if (state.currentRound.respondeu) {
        console.warn('⚠️ Rodada já foi respondida!');
        return;
    }

    state.currentRound.respondeu = true;

    const { pergunta, evento, respondedor: respondedorName } = state.currentRound;
    const acertou = msg.alternativa === pergunta.correta;
    const respondedor = Game.getPlayerByName(respondedorName);

    if (!respondedor) return;

    // Verifica se tem recursos para responder
    if (respondedor.recursos <= 0) {
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

    // Evento e4: Seguro de Projeto - não gasta recurso se errar
    const temSeguro = evento?.seguro_erro === true;
    const gastaRecurso = acertou ? true : !temSeguro;

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

    const seguroMsg = !gastaRecurso ? ' (seguro)' : '';
    console.log('📊 ' + (acertou ? '✅ Acertou' : '❌ Errou') + ' | Recursos: ' + respondedor.recursos + seguroMsg + ' | KPI: ' + respondedor.kpi);

    // 🔧 V2: Atualiza UI após resposta (Momento 3)
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

    state.usedRespondedorThisRound.push(respondedorName);

    const faseIdx = Game.getFaseIndex(respondedor.phase);
    if (faseIdx === CONFIG.FASES.length - 1 && respondedor.activities >= CONFIG.JOGO.ACTIVITIES_PER_PHASE) {
        setTimeout(() => endGame(buildRanking()), 3000);
    } else {
        setTimeout(() => nextTurn(), 3000);
    }

    Game.saveState();
}

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

function updatePlayerKPI(msg) {
    const state = Game.state;
    const player = Game.getPlayerByName(msg.playerName);

    if (player) {
        player.kpi = msg.kpi;
        player.phase = msg.phase;
        player.activities = msg.activities;
        if (msg.recursos !== undefined) player.recursos = msg.recursos;
    }

    // 🔧 V2: Atualiza UI do próprio jogador
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

        if (msg.acertou !== undefined) {
            Game.ui.showResultModal(msg.acertou, msg.kpiGanho, msg.recursos);
        }
    }

    Game.ui.updatePlayersOnlineList();
    Game.ui.updateRankingList();
}

// ============================================
// CONTROLE DE PARTIDA
// ============================================

function startGame() {
    const state = Game.state;
    state.gameStarted = true;
    state.usedRespondedorThisRound = [];

    // V2: Inicializa recursos
    state.players.forEach(p => {
        p.recursos = CONFIG.RECURSOS_INICIAIS;
    });

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

function endGame(ranking) {
    const state = Game.state;
    state.gameOver = true;
    clearInterval(state.timerInterval);

    if (state.isHost) {
        Game.network.broadcastAll({ type: 'game-over', ranking });
    }

    Game.ui.showScreen('gameover');
    Game.ui.displayFinalRanking(ranking);
    Game.saveState();
}

function endMatch() {
    if (!Game.state.isHost) return;
    if (!confirm('🏁 Encerrar a partida? Todos voltarão ao lobby com KPI zerado.')) return;

    Game.resetAllPlayers();
    Game.resetGameState();

    Game.network.broadcastAll({ type: 'match-ended', players: Game.state.players });
    Game.ui.showScreen('lobby');
    Game.ui.showLobbyNormal();
    Game.ui.updatePlayersList();
    Game.ui.updateTimerDisplay();
    Game.ui.checkStartCondition();
    Game.saveState();
}

function handleMatchEnded(msg) {
    Game.state.players = msg.players;
    Game.resetAllPlayers();
    Game.resetGameState();
    Game.ui.showScreen('lobby');
    Game.ui.showLobbyNormal();
    Game.ui.updatePlayersList();
    Game.ui.updateTimerDisplay();
    Game.saveState();
}

// ============================================
// VENDA DE RECURSOS (V3)
// ============================================

function venderRecurso(compradorName) {
    const state = Game.state;
    const vendedor = Game.getPlayerByName(state.playerName);
    const comprador = Game.getPlayerByName(compradorName);

    if (!vendedor || !comprador) {
        console.warn('⚠️ Vendedor ou comprador não encontrado');
        return false;
    }

    if (vendedor.recursos < 1) {
        alert('⚠️ Você não tem recursos para vender.');
        return false;
    }

    if (comprador.kpi < CONFIG.KPI.VALOR_VENDA_RECURSO) {
        alert('⚠️ Comprador não tem KPI suficiente (precisa de ' + CONFIG.KPI.VALOR_VENDA_RECURSO + ').');
        return false;
    }

    if (vendedor.name === comprador.name) {
        alert('⚠️ Você não pode vender para si mesmo.');
        return false;
    }

    // Executa a venda
    vendedor.recursos--;
    vendedor.kpi += CONFIG.KPI.VALOR_VENDA_RECURSO;
    comprador.recursos++;
    comprador.kpi -= CONFIG.KPI.VALOR_VENDA_RECURSO;

    console.log('💰 Venda:', vendedor.name, 'vendeu 1📦 para', comprador.name, 'por', CONFIG.KPI.VALOR_VENDA_RECURSO, 'KPI');

    // 🔧 V2: Atualiza UI após venda (Momento 2)
    Game.ui.updatePlayersOnlineList();
    Game.ui.updateRankingList();

    // Atualiza UI do próprio jogador
    if (state.playerName === vendedor.name || state.playerName === comprador.name) {
        const me = Game.getPlayerByName(state.playerName);
        if (me) {
            document.getElementById('myKPI').textContent = me.kpi;
            document.getElementById('myRecursos').textContent = me.recursos;
        }
    }

    // Broadcast para todos
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

    Game.saveState();
    return true;
}

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

function endSession() {
    if (!Game.state.isHost) return;
    if (!confirm('⛔ Encerrar a sessão? Todos os jogadores serão desconectados e a sala destruída.')) return;

    Game.network.broadcastAll({ type: 'session-ended' });
    Game.network.cleanup();
    window.location.href = 'index.html';
}

function leaveMatch() {
    if (Game.state.isHost) return;
    if (!confirm('🚶 Sair da partida? Você aguardará no lobby até a próxima partida.')) return;

    const me = Game.getPlayerByName(Game.state.playerName);
    if (me) me.waitingInLobby = true;

    Game.ui.showScreen('lobby');
    Game.ui.showLobbyWaitingView();
    Game.saveState();
}

function leaveSession() {
    if (Game.state.isHost) {
        endSession();
        return;
    }
    if (!confirm('🚪 Sair da sessão? Você voltará à tela inicial.')) return;

    Game.network.cleanup();
    window.location.href = 'index.html';
}

// ============================================
// RANKING (V2 - KPI = acertos + vendas - compras + recursos)
// ============================================

function buildRanking() {
    return [...Game.state.players]
        .map(p => ({
            name: p.name,
            kpi: p.kpi,
            recursos: p.recursos,
            kpiFinal: p.kpi + (p.recursos * CONFIG.KPI.VALOR_RECURSO_FINAL),
            phase: p.phase,
            activities: p.activities,
            isHost: p.isHost
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
    sortearPergunta,
    aplicarEfeitosEvento,
    handleAnswer,
    updatePlayerKPI,
    nextTurn,
    startGame,
    endGame,
    endMatch,
    handleMatchEnded,
    endSession,
    leaveMatch,
    leaveSession,
    buildRanking,
    venderRecurso,
    getCompradores
};