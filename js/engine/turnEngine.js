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
    state.answeredThisRound = [];
    Game.ui.refreshNewRoundButton();

    const event = Game.domain.event.drawEvent(state.questionsData?.events || []);
    if (!event) {
        console.error('❌ Nenhum evento disponível!');
        return;
    }

    const eventEffect = applyDrawnEvent(event);
    pickNewPair(event, 0, true, eventEffect);
}

/**
 * Aplica os efeitos do evento sorteado aos jogadores ativos e atualiza
 * a tela do host. Devolve quem foi atingido, para o aviso do evento.
 */
function applyDrawnEvent(event) {
    const { logs, effect } = Game.domain.event.applyEventEffects(event, Game.getActivePlayers(), CONFIG);
    logs.forEach(msg => console.log(msg));
    Game.ui.syncPlayerViews(Game.getPlayerByName(Game.state.playerName));
    return effect;
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
 * @param {object|null} eventEffect – quem o evento atingiu (applyEventEffects()),
 *   mostrado no aviso do evento
 */
function pickNewPair(event = null, depth = 0, showModal = true, eventEffect = null) {
    const state = Game.state;

    if (depth > CONFIG.GAME.MAX_PLAYERS * 2) {
        console.error('❌ Não foi possível formar um novo par de jogadores. Encerrando partida.');
        Game.engine.session.endGame(Game.engine.session.buildRanking());
        return;
    }

    // Se não foi passado um evento, sorteia um novo
    if (!event) {
        event = Game.domain.event.drawEvent(state.questionsData?.events || []);
        if (!event) return;
        eventEffect = applyDrawnEvent(event);
    }

    // O modal do evento só aparece no início de uma rodada nova
    // (parâmetro explícito) — não a cada pergunta dentro do mesmo ciclo.
    if (showModal) {
        Game.network.broadcastAll({ type: 'show-event', event, players: state.players, eventEffect });
        Game.ui.showEventModal(event, eventEffect);
    }

    const activePlayers = Game.getActivePlayers();
    if (activePlayers.length < CONFIG.GAME.MIN_PLAYERS) {
        // Distingue "faltam jogadores" de "falta conexão". Se,
        // contando os desconectados, ainda há jogadores suficientes, a
        // partida PAUSA em vez de encerrar — retoma sozinha quando
        // alguém reconectar (ver resumePausedMatch() e addPlayer()
        // em network/messageHandler.js). O timer da partida continua
        // correndo durante a pausa.
        const matchPlayers = Game.selectors.getMatchPlayers(state.players);
        if (matchPlayers.length >= CONFIG.GAME.MIN_PLAYERS) {
            console.warn('⏸️ Jogadores conectados insuficientes — partida pausada até alguém reconectar.');
            state.currentRound = null;
            state.matchPaused = { event };
            Game.network.broadcastAll({ type: 'match-paused' });
            Game.ui.showMatchPausedMessage();
            Game.ui.refreshNewRoundButton();
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
        !state.answeredThisRound.includes(p.name)
    );
    if (available.length === 0) {
        state.answeredThisRound = [];
        return pickNewPair(event, depth + 1, false);
    }

    const answerer = available[Math.floor(Math.random() * available.length)];
    const askers = activePlayers.filter(p => p.peerId !== answerer.peerId);
    if (askers.length === 0) return;

    const asker = askers[Math.floor(Math.random() * askers.length)];
    const question = Game.domain.deck.drawQuestion(state.decks, state.questionsData, answerer.focusArea);

    if (!question) {
        console.error('❌ Sem pergunta disponível!');
        return;
    }

    // Os nomes de domínio e área (as etiquetas da tela) ficam na própria
    // pergunta da rodada — é ela que vai no estado salvo e no state-sync,
    // então o F5 do host e quem volta à partida também veem as etiquetas.
    const domainName = state.questionsData.domains[question.domain_key]?.name || question.domain_key;
    const areaName = Game.getFocusAreaById(answerer.focusArea).name;

    state.matchPaused = null;
    state.roundEnded = false;
    state.currentRound = {
        event,
        asker: asker.name,
        answerer: answerer.name,
        question: { ...question, domain: domainName, area: areaName },
        answered: false,
        // A pergunta só vai para o Respondedor quando o Perguntador a faz
        // (ver askQuestion()). Rodada sem o campo (estado salvo ou cópia
        // de uma versão anterior) conta como pergunta já feita.
        asked: false
    };

    console.log('🎯 Nova dupla:', asker.name, 'pergunta para', answerer.name);
    console.log('📋 Evento:', event.title);

    // `answeredThisRound` = quem já respondeu nesta rodada (vazio
    // numa rodada nova). Os guests guardam — quem assumir como host
    // continua o rodízio de onde parou.
    Game.network.broadcastAll({
        type: 'round-start',
        event,
        asker: asker.name,
        answerer: answerer.name,
        answeredThisRound: state.answeredThisRound.slice()
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

    // Envia a pergunta (com gabarito) para o Perguntador. O Respondedor
    // só a recebe quando o Perguntador a faz (askQuestion()).
    Game.network.sendToPlayer(asker.peerId, { ...questionMsg, isAsker: true });

    if (CONFIG.GAME.ASK_TIMEOUT > 0) {
        armAskTimeout();
    } else {
        askQuestion(true);
    }

    Game.ui.refreshNewRoundButton();
    Game.saveState();
}

/**
 * Arma o prazo do Perguntador: se ele não clicar em "Fazer a pergunta"
 * até CONFIG.GAME.ASK_TIMEOUT, a pergunta vai sozinha. Também usada no
 * F5 do host e na troca de host com a pergunta ainda por fazer.
 */
function armAskTimeout() {
    const state = Game.state;
    clearAskTimeout();
    state.askTimeout = setTimeout(() => {
        console.log('⌛ O Perguntador não clicou a tempo — a pergunta vai sozinha.');
        askQuestion(true);
    }, CONFIG.GAME.ASK_TIMEOUT);
}

/** Cancela o prazo do Perguntador, se estiver armado. */
function clearAskTimeout() {
    const state = Game.state;
    if (state.askTimeout) {
        clearTimeout(state.askTimeout);
        state.askTimeout = null;
    }
}

/**
 * Host: o Perguntador clicou em "Fazer a pergunta" (mensagem
 * 'ask-question', ou a própria tela do host). Pedido de outro jogador é
 * ignorado.
 */
function handleAskQuestion(msg) {
    const round = Game.state.currentRound;
    if (!Game.state.isHost || !round || msg.playerName !== round.asker) return;
    askQuestion(false);
}

/**
 * Host: a pergunta foi feita (clique ou prazo do Perguntador). Avisa
 * todos ('question-asked'), manda a pergunta, sem o gabarito, ao
 * Respondedor e liga o prazo de resposta. Só vale uma vez por pergunta.
 * @param {boolean} auto - true quando foi o prazo, não o clique
 */
function askQuestion(auto) {
    const state = Game.state;
    const round = state.currentRound;
    if (!state.isHost || !round || round.asked !== false || round.answered) return;

    clearAskTimeout();
    round.asked = true;
    console.log('🗣️ ' + round.asker + ' fez a pergunta' + (auto ? ' (prazo do Perguntador)' : '') + '.');

    // broadcastAll não manda para o próprio host: a tela dele é avisada aqui.
    Game.network.broadcastAll({ type: 'question-asked', auto });
    if (state.playerName === round.asker) Game.ui.showQuestionAsked();

    const answerer = Game.getPlayerByName(round.answerer);
    const q = round.question;
    if (answerer) {
        Game.network.sendToPlayer(answerer.peerId, {
            type: 'question',
            question: q.question,
            domain: q.domain,
            area: q.area,
            alternatives: q.alternatives,
            id: q.id,
            isAnswerer: true
        });
    }

    armAnswerTimeout(round.answerer);
    Game.saveState();
}

/**
 * Arma um timeout para evitar que a rodada fique travada se o Respondedor
 * não responder (desconexão, travamento, etc.). `ms` é o prazo que resta
 * (depois de um apoio, continua de onde parou); sem ele, o prazo inteiro.
 */
function armAnswerTimeout(answererName, ms = CONFIG.GAME.ANSWER_TIMEOUT) {
    const state = Game.state;
    if (state.answerTimeout) {
        clearTimeout(state.answerTimeout);
        state.answerTimeout = null;
    }
    state.answerDeadline = Date.now() + ms;
    state.answerTimeout = setTimeout(() => {
        console.warn('⌛ Timeout: ' + answererName + ' não respondeu a tempo. Pulando vez automaticamente.');
        Game.engine.answer.handleAnswer({ alternative: null, playerName: answererName, timeout: true });
    }, ms);
}

/**
 * Para o prazo de resposta (apoio pendente) e devolve quanto faltava, em
 * ms — ou undefined, se o prazo não estava correndo.
 */
function pauseAnswerTimeout() {
    const state = Game.state;
    if (!state.answerTimeout) return undefined;
    clearTimeout(state.answerTimeout);
    state.answerTimeout = null;
    return Math.max(0, state.answerDeadline - Date.now());
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
 * O fim do ciclo fica registrado em `state.roundEnded`
 * (zerado quando a próxima dupla é formada). Sem isso, quem reconecta
 * nessa espera recebia a última pergunta — já respondida — como se a
 * rodada estivesse em andamento (ver addPlayer()/restoreState() em
 * network/messageHandler.js).
 */
function nextTurn() {
    const state = Game.state;
    if (endRoundIfCycleComplete()) return;
    pickNewPair(state.currentRound?.event, 0, false);
}

/**
 * Se todos os jogadores ativos já responderam nesta rodada, encerra a
 * rodada: marca `state.roundEnded`, libera o "Nova Rodada", avisa
 * os guests ('round-ended') e mostra o aviso. A próxima rodada só começa
 * com o clique do host.
 *
 * Usada também ao retomar uma partida pausada (resumePausedMatch()).
 * @returns {boolean} true se encerrou a rodada
 */
function endRoundIfCycleComplete() {
    const state = Game.state;
    if (!Game.selectors.isCycleComplete(Game.getActivePlayers(), state.answeredThisRound)) return false;

    console.log('✅ Todos os jogadores ativos já responderam nesta rodada. Aguardando o host clicar em "Nova Rodada".');
    state.roundEnded = true;
    Game.ui.refreshNewRoundButton();
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
    const pause = state.matchPaused;
    if (!state.isHost || !pause) return;

    state.matchPaused = null;
    console.log('▶️ Jogador reconectou — retomando a partida.');

    if (pause.event && endRoundIfCycleComplete()) return;

    if (pause.event) {
        pickNewPair(pause.event, 0, false);
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
    armAskTimeout,
    clearAskTimeout,
    handleAskQuestion,
    askQuestion,
    armAnswerTimeout,
    pauseAnswerTimeout,
    nextTurn,
    endRoundIfCycleComplete,
    resumePausedMatch
};

// Game.core.* é o namespace usado por ui/ e network/ para chamar as
// funções deste engine — convenção de chamada entre camadas, não é
// compatibilidade temporária nem trabalho pendente (ver _docs/architecture.md).
window.Game.core = window.Game.core || {};
Object.assign(window.Game.core, window.Game.engine.turn);
