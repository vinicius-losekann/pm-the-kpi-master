// ============================================
// PM: The KPI Master - Engine: Rodada (Turnos)
// ============================================
// Orquestra o ciclo de rodada: sorteio de evento, escolha do par
// Perguntador/Respondedor, sorteio de pergunta e avanço de turno.
// Usa as regras puras de js/domain/*.js — não contém regra de
// negócio, só coordenação entre domain, state, network e ui.
// ============================================

/**
 * Inicia uma nova rodada: sorteia um evento, aplica seus efeitos e
 * escolhe um par Perguntador/Respondedor.
 *
 * Chamada em 3 situações: (1) início da partida (sessionEngine.startGame),
 * (2) clique do host no botão "Nova Rodada" (a rodada nova nunca começa
 * sozinha), (3) retomada de uma pausa cujo evento se perdeu
 * (resumePausedMatch).
 */
function startNewRound() {
    const state = Game.state;

    // Reset defensivo: toda vez que uma rodada de verdade começa, o
    // rodízio de quem já respondeu precisa estar zerado — independente
    // de quem chamou esta função.
    state.usedRespondedorThisRound = [];
    Game.ui.refreshNovaRodadaButton();

    const event = Game.domain.event.drawEvent(state.questionsData?.eventos || []);
    if (!event) {
        console.error('❌ Nenhum evento disponível!');
        return;
    }

    const active = Game.getActivePlayers();
    const logs = Game.domain.event.applyEventEffects(event, active);
    logs.forEach(msg => console.log(msg));

    Game.ui.syncPlayerViews(Game.getPlayerByName(state.playerName));

    pickNewPair(event);
}

/**
 * Escolhe aleatoriamente um Perguntador e um Respondedor entre os
 * jogadores ativos, respeitando o rodízio.
 * @param {object} event – o evento da rodada (reaproveitado entre perguntas da mesma rodada)
 * @param {number} depth – profundidade da recursão (previne loops infinitos)
 * @param {boolean} showModal – se true, exibe o modal de evento agora
 *   (só deve ser true no INÍCIO de uma rodada nova — startNewRound() usa
 *   o padrão `true`; continuações dentro da mesma rodada, vindas de
 *   nextTurn(), passam `false` explicitamente)
 */
function pickNewPair(event = null, depth = 0, showModal = true) {
    const state = Game.state;

    if (depth > CONFIG.JOGO.MAX_PLAYERS * 2) {
        console.error('❌ Não foi possível formar um novo par de jogadores. Encerrando partida.');
        Game.engine.session.endGame(Game.engine.session.buildRanking());
        return;
    }

    // Se não foi passado um evento, sorteia um novo
    if (!event) {
        event = Game.domain.event.drawEvent(state.questionsData?.eventos || []);
        if (!event) return;

        const active = Game.getActivePlayers();
        const logs = Game.domain.event.applyEventEffects(event, active);
        logs.forEach(msg => console.log(msg));

        Game.ui.syncPlayerViews(Game.getPlayerByName(state.playerName));
    }

    // O modal do evento só aparece no início de uma rodada nova
    // (parâmetro explícito) — não a cada pergunta dentro do mesmo ciclo.
    if (showModal) {
        Game.network.broadcastAll({ type: 'show-evento', evento: event, players: state.players });
        Game.ui.showEventoModal(event);
    }

    const activePlayers = Game.getActivePlayers();
    if (activePlayers.length < CONFIG.JOGO.MIN_PLAYERS) {
        // Distingue "faltam jogadores" de "falta conexão". Se,
        // contando os desconectados, ainda há jogadores suficientes, a
        // partida PAUSA em vez de encerrar — retoma sozinha quando
        // alguém reconectar (ver resumePausedMatch() e addPlayer()
        // em network/messageHandler.js). O timer da partida continua
        // correndo durante a pausa.
        const matchPlayers = Game.selectors.getMatchPlayers(state.players);
        if (matchPlayers.length >= CONFIG.JOGO.MIN_PLAYERS) {
            console.warn('⏸️ Jogadores conectados insuficientes — partida pausada até alguém reconectar.');
            state.currentRound = null;
            state.partidaPausada = { evento: event };
            Game.network.broadcastAll({ type: 'partida-pausada' });
            Game.ui.showPartidaPausadaMessage();
            Game.ui.refreshNovaRodadaButton();
            Game.saveState();
            return;
        }

        console.warn('⚠️ Jogadores ativos insuficientes para continuar a partida.');
        Game.engine.session.endGame(Game.engine.session.buildRanking());
        return;
    }

    // Recurso não limita quem pode ser Respondedor: qualquer jogador
    // ativo sempre tenta responder, mesmo com 0 recursos, já que só errar
    // gasta recurso (domain/kpiRules.js).

    // Seleciona um Respondedor que ainda não tenha respondido nesta rodada
    const available = activePlayers.filter(p =>
        !state.usedRespondedorThisRound.includes(p.name)
    );
    if (available.length === 0) {
        state.usedRespondedorThisRound = [];
        return pickNewPair(event, depth + 1, false);
    }

    const answerer = available[Math.floor(Math.random() * available.length)];
    const askers = activePlayers.filter(p => p.peerId !== answerer.peerId);
    if (askers.length === 0) return;

    const asker = askers[Math.floor(Math.random() * askers.length)];
    const question = Game.domain.deck.drawQuestion(state.baralhos, state.questionsData, answerer.phase);

    if (!question) {
        console.error('❌ Sem pergunta disponível!');
        return;
    }

    // Os nomes de domínio e área (as etiquetas da tela) ficam na própria
    // pergunta da rodada — é ela que vai no estado salvo e no state-sync,
    // então o F5 do host e quem volta à partida também veem as etiquetas.
    const domainName = state.questionsData.domains[question.domain_key]?.name || question.domain_key;
    const areaName = Game.getFocusAreaById(answerer.phase).nome;

    state.partidaPausada = null;
    state.rodadaEncerrada = false;
    state.currentRound = {
        evento: event,
        perguntador: asker.name,
        respondedor: answerer.name,
        pergunta: { ...question, domain: domainName, area: areaName },
        respondeu: false
    };

    console.log('🎯 Nova dupla:', asker.name, 'pergunta para', answerer.name);
    console.log('📋 Evento:', event.titulo);

    // `respondidos` = quem já respondeu nesta rodada (vazio
    // numa rodada nova). Os guests guardam — quem assumir como host
    // continua o rodízio de onde parou.
    Game.network.broadcastAll({
        type: 'round-start',
        evento: event,
        perguntador: asker.name,
        respondedor: answerer.name,
        respondidos: state.usedRespondedorThisRound.slice()
    });

    // Ordem das telas: para os GUESTS, 'round-start'
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
    if (state.playerName !== asker.name && state.playerName !== answerer.name) {
        Game.ui.displaySpectatorView(asker.name, answerer.name);
    } else {
        Game.ui.displayRoundStart();
    }

    const questionMsg = {
        type: 'question',
        question: question.question,
        domain: domainName,
        area: areaName,
        alternatives: question.alternatives,
        correct: question.correct,
        id: question.id
    };

    // Envia a pergunta (com gabarito) para o Perguntador
    Game.network.sendToPlayer(asker.peerId, { ...questionMsg, isPerguntador: true });

    // Envia a pergunta (sem gabarito) para o Respondedor
    Game.network.sendToPlayer(answerer.peerId, { ...questionMsg, isRespondedor: true, correct: undefined });

    // Timeout de segurança para o Respondedor
    armAnswerTimeout(answerer.name);

    Game.ui.refreshNovaRodadaButton();
    Game.saveState();
}

/**
 * Arma um timeout para evitar que a rodada fique travada se o Respondedor
 * não responder (desconexão, travamento, etc.).
 */
function armAnswerTimeout(answererName) {
    const state = Game.state;
    if (state.respostaTimeout) {
        clearTimeout(state.respostaTimeout);
        state.respostaTimeout = null;
    }
    state.respostaTimeout = setTimeout(() => {
        console.warn('⌛ Timeout: ' + answererName + ' não respondeu a tempo. Pulando vez automaticamente.');
        Game.engine.answer.handleAnswer({ alternativa: null, playerName: answererName, timeout: true });
    }, CONFIG.JOGO.RESPOSTA_TIMEOUT);
}

/**
 * Avança para o próximo par dentro da rodada vigente.
 *
 * Quando todos os jogadores ativos já responderam (ciclo completo), o
 * jogo PARA e aguarda: é o host quem clica em "Nova Rodada"
 * (Game.core.startNewRound(), ligado em controlsComponent.js) para
 * sortear o próximo evento e mostrar o modal — a rodada nova nunca
 * começa sozinha.
 *
 * O fim do ciclo fica registrado em `state.rodadaEncerrada`
 * (zerado quando a próxima dupla é formada). Sem isso, quem reconecta
 * nessa espera recebia a última pergunta — já respondida — como se a
 * rodada estivesse em andamento (ver addPlayer()/restoreState() em
 * network/messageHandler.js).
 */
function nextTurn() {
    const state = Game.state;
    if (endRoundIfCycleComplete()) return;
    pickNewPair(state.currentRound?.evento, 0, false);
}

/**
 * Se todos os jogadores ativos já responderam nesta rodada, encerra a
 * rodada: marca `state.rodadaEncerrada`, libera o "Nova Rodada", avisa
 * os guests ('round-ended') e mostra o aviso. A próxima rodada só começa
 * com o clique do host.
 *
 * Usada também ao retomar uma partida pausada (resumePausedMatch()).
 * @returns {boolean} true se encerrou a rodada
 */
function endRoundIfCycleComplete() {
    const state = Game.state;
    if (!Game.selectors.isCycleComplete(Game.getActivePlayers(), state.usedRespondedorThisRound)) return false;

    console.log('✅ Todos os jogadores ativos já responderam nesta rodada. Aguardando o host clicar em "Nova Rodada".');
    state.rodadaEncerrada = true;
    Game.ui.refreshNovaRodadaButton();
    Game.network.broadcastAll({ type: 'round-ended' });
    Game.ui.showRoundEndedMessage();
    Game.saveState();
    return true;
}

/**
 * Host: retoma uma partida pausada por falta de jogadores conectados
 * (ver pickNewPair()). Continua a mesma rodada, com o mesmo evento, sem
 * mostrar o modal de novo nem reaplicar os efeitos. Se o evento se
 * perdeu (ex: host deu F5 durante a pausa), começa uma rodada nova.
 *
 * Se todos os conectados já responderam nesta rodada, ela é encerrada
 * (aguarda o "Nova Rodada") em vez de recomeçar o rodízio sozinha.
 */
function resumePausedMatch() {
    const state = Game.state;
    const pause = state.partidaPausada;
    if (!state.isHost || !pause) return;

    state.partidaPausada = null;
    console.log('▶️ Jogador reconectou — retomando a partida.');

    if (pause.evento && endRoundIfCycleComplete()) return;

    if (pause.evento) {
        pickNewPair(pause.evento, 0, false);
    } else {
        startNewRound();
    }
}

// ============================================
// EXPORTAÇÃO
// ============================================
window.Game = window.Game || {};
window.Game.engine = window.Game.engine || {};
window.Game.engine.turn = {
    startNewRound,
    pickNewPair,
    armAnswerTimeout,
    nextTurn,
    endRoundIfCycleComplete,
    resumePausedMatch
};

// Game.core.* é o namespace usado por ui/ e network/ para chamar as
// funções deste engine — convenção de chamada entre camadas, não é
// compatibilidade temporária nem trabalho pendente (ver _docs/architecture.md).
window.Game.core = window.Game.core || {};
Object.assign(window.Game.core, window.Game.engine.turn);
