// ============================================
// PM: The KPI Master - Engine: Rodada (Turnos)
// ============================================
// Orquestra o ciclo de rodada: sorteio de evento, escolha do par
// Perguntador/Respondedor, sorteio de pergunta e avanço de turno.
// Usa as regras puras de js/domain/*.js — não contém regra de
// negócio, só coordenação entre domain, state, network e ui.
// Fase 3.2 do roadmap.
// ============================================

/**
 * Inicia uma nova rodada: sorteia um evento, aplica seus efeitos e
 * escolhe um par Perguntador/Respondedor.
 *
 * Chamada em 3 situações: (1) início da partida (sessionEngine.startGame),
 * (2) clique manual do host no botão "Nova Rodada" (ver ISSUES.md BUG-005
 * — antes disso era automático ao final do ciclo, agora é sempre uma
 * ação explícita do host), (3) recovery paths (resumeGameEngineIfHost,
 * becomeHost) quando não há state.currentRound nenhum.
 */
function startNewRound() {
    const state = Game.state;

    // Reset defensivo: toda vez que uma rodada de verdade começa, o
    // rodízio de quem já respondeu precisa estar zerado — independente
    // de quem chamou esta função.
    state.usedRespondedorThisRound = [];
    Game.ui.refreshNovaRodadaButton();

    const evento = Game.domain.event.sortearEvento(state.questionsData?.eventos || []);
    if (!evento) {
        console.error('❌ Nenhum evento disponível!');
        return;
    }

    const ativos = Game.getActivePlayers();
    const logs = Game.domain.event.aplicarEfeitosEvento(evento, ativos);
    logs.forEach(msg => console.log(msg));

    Game.ui.syncPlayerViews(Game.getPlayerByName(state.playerName));

    pickNewPair(evento);
}

/**
 * Escolhe aleatoriamente um Perguntador e um Respondedor entre os
 * jogadores ativos, respeitando o rodízio e a disponibilidade de recursos.
 * @param {object} evento – o evento da rodada (reaproveitado entre perguntas da mesma rodada)
 * @param {number} depth – profundidade da recursão (previne loops infinitos)
 * @param {boolean} mostrarModal – se true, exibe o modal de evento agora
 *   (só deve ser true no INÍCIO de uma rodada nova — startNewRound() usa
 *   o padrão `true`; continuações dentro da mesma rodada, vindas de
 *   nextTurn(), passam `false` explicitamente)
 */
function pickNewPair(evento = null, depth = 0, mostrarModal = true) {
    const state = Game.state;

    if (depth > CONFIG.JOGO.MAX_PLAYERS * 2) {
        console.error('❌ Nenhum jogador com recursos disponíveis. Encerrando partida.');
        Game.engine.session.endGame(Game.engine.session.buildRanking());
        return;
    }

    // Se não foi passado um evento, sorteia um novo
    if (!evento) {
        evento = Game.domain.event.sortearEvento(state.questionsData?.eventos || []);
        if (!evento) return;

        const ativos = Game.getActivePlayers();
        const logs = Game.domain.event.aplicarEfeitosEvento(evento, ativos);
        logs.forEach(msg => console.log(msg));

        Game.ui.syncPlayerViews(Game.getPlayerByName(state.playerName));
    }

    // 🐛 Correção (ver ISSUES.md BUG-005): antes, a condição de exibir o
    // modal era baseada em `depth > 0` — o que não tem relação nenhuma
    // com "o evento já foi mostrado nesta rodada". Isso fazia o modal
    // reaparecer a cada pergunta dentro do mesmo ciclo. Agora é um
    // parâmetro explícito: só mostra quando de fato é o início de uma
    // rodada nova.
    if (mostrarModal) {
        Game.network.broadcastAll({ type: 'show-evento', evento: evento, players: state.players });
        Game.ui.showEventoModal(evento);
    }

    const activePlayers = Game.getActivePlayers();
    if (activePlayers.length < CONFIG.JOGO.MIN_PLAYERS) {
        console.warn('⚠️ Jogadores ativos insuficientes para continuar a partida.');
        Game.engine.session.endGame(Game.engine.session.buildRanking());
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
        Game.engine.session.endGame(Game.engine.session.buildRanking());
        return;
    }

    // Seleciona um Respondedor que ainda não tenha respondido nesta rodada
    const available = comRecursos.filter(p =>
        !state.usedRespondedorThisRound.includes(p.name)
    );
    if (available.length === 0) {
        state.usedRespondedorThisRound = [];
        return pickNewPair(evento, depth + 1, false);
    }

    const respondedor = available[Math.floor(Math.random() * available.length)];
    const askers = activePlayers.filter(p => p.peerId !== respondedor.peerId);
    if (askers.length === 0) return;

    const perguntador = askers[Math.floor(Math.random() * askers.length)];
    const pergunta = Game.domain.deck.sortearPergunta(state.baralhos, state.questionsData, respondedor.phase);

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

    // 🐛 Correção (ver ISSUES.md BUG-006): para os GUESTS, 'round-start'
    // chega pela rede ANTES de 'question' (mensagens em sequência no
    // mesmo canal). Só que para o HOST, sendToPlayer() ao enviar pra si
    // mesmo processa a mensagem NA HORA (sem passar pela rede) — então
    // se a tela de "início de rodada" (displayRoundStart/
    // displaySpectatorView) só fosse montada DEPOIS do envio das
    // perguntas, ela sobrescrevia o que displayQuestion() acabara de
    // configurar (ex: apagava a área de assessoria que tinha acabado de
    // aparecer, ou revertia a visão de espectador de volta pra tela de
    // pergunta vazia). Por isso a tela do host é montada ANTES de enviar
    // as mensagens — replicando a ordem que os guests já recebem
    // naturalmente pela rede.
    if (state.playerName !== perguntador.name && state.playerName !== respondedor.name) {
        Game.ui.displaySpectatorView(perguntador.name, respondedor.name);
    } else {
        Game.ui.displayRoundStart();
    }

    const domainNome = state.questionsData.domains[pergunta.domain_key]?.name || pergunta.domain_key;
    const areaNome = Game.getFaseById(respondedor.phase).nome;

    const perguntaData = {
        type: 'question',
        question: pergunta.question,
        domain: domainNome,
        area: areaNome,
        alternatives: pergunta.alternatives,
        correct: pergunta.correct,
        id: pergunta.id
    };

    // Envia a pergunta (com gabarito) para o Perguntador
    Game.network.sendToPlayer(perguntador.peerId, { ...perguntaData, isPerguntador: true });

    // Envia a pergunta (sem gabarito) para o Respondedor
    Game.network.sendToPlayer(respondedor.peerId, { ...perguntaData, isRespondedor: true, correct: undefined });

    // Timeout de segurança para o Respondedor
    armarRespostaTimeout(respondedor.name);

    Game.ui.refreshNovaRodadaButton();
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
        Game.engine.answer.handleAnswer({ alternativa: null, playerName: respondedorName, timeout: true });
    }, CONFIG.JOGO.RESPOSTA_TIMEOUT);
}

/**
 * Avança para o próximo par dentro da rodada vigente.
 *
 * 🐛 Correção (ver ISSUES.md BUG-005): antes, quando todos os jogadores
 * ativos já tinham respondido (ciclo completo), esta função chamava
 * startNewRound() automaticamente — o que também disparava o modal de
 * evento sozinho. Agora, ao completar o ciclo, o jogo apenas PARA e
 * aguarda: é o host quem precisa clicar em "Nova Rodada"
 * (Game.core.startNewRound(), ligado em controlsComponent.js) para
 * sortear o próximo evento e mostrar o modal.
 */
function nextTurn() {
    const state = Game.state;
    const activePlayers = Game.getActivePlayers();

    if (Game.selectors.isCycleComplete(activePlayers, state.usedRespondedorThisRound)) {
        console.log('✅ Todos os jogadores ativos já responderam nesta rodada. Aguardando o host clicar em "Nova Rodada".');
        Game.ui.refreshNovaRodadaButton();
        Game.network.broadcastAll({ type: 'round-ended' });
        Game.ui.showRoundEndedMessage();
        return;
    }

    pickNewPair(state.currentRound?.evento, 0, false);
}

// ============================================
// EXPORTAÇÃO
// ============================================
window.Game = window.Game || {};
window.Game.engine = window.Game.engine || {};
window.Game.engine.turn = {
    startNewRound,
    pickNewPair,
    armarRespostaTimeout,
    nextTurn
};

// Game.core.* é o namespace usado por ui/ e network/ para chamar as
// funções deste engine — convenção de chamada entre camadas, não é
// compatibilidade temporária nem trabalho pendente (ver ARCHITECTURE.md).
window.Game.core = window.Game.core || {};
Object.assign(window.Game.core, window.Game.engine.turn);