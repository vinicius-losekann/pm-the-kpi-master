// ============================================
// PM: The KPI Master - Engine: Rodada (Turnos)
// ============================================
// Orquestra o ciclo de rodada: sorteio de evento, escolha do par
// Perguntador/Respondedor, sorteio de pergunta e avanço de turno.
// Usa as regras puras de js/domain/*.js — não contém regra de
// negócio, só coordenação entre domain, state, network e ui.
//
// Dupla guardada: quando quem está na dupla cai, a dupla fica guardada
// (state.heldPairs, com a pergunta) até o fim da rodada; quando os dois
// estão conectados de novo, ela é a próxima dupla. No fim da rodada, quem
// caiu sem responder segura o fim (espera, state.waitingFor) até voltar ou
// o host clicar em "Nova Rodada". Cada dupla tem um número (pairId): o
// host ignora resposta e pedido de pergunta de outra dupla.
// ============================================

/**
 * Inicia uma nova rodada: sorteia um evento, aplica seus efeitos e
 * escolhe um par Perguntador/Respondedor.
 *
 * Chamada em 3 situações: (1) início da partida (sessionEngine.startGame),
 * (2) clique do host no botão "Nova Rodada" (a rodada nova nunca começa
 * sozinha; na espera do fim da rodada, segue sem quem caiu), (3) retomada
 * de uma pausa cujo evento se perdeu (resumePausedMatch).
 */
function startNewRound() {
    const state = Game.state;

    // Reset defensivo: toda vez que uma rodada de verdade começa, o
    // rodízio de quem já respondeu precisa estar zerado — independente
    // de quem chamou esta função. Quem tinha dupla guardada perde a vez:
    // a pergunta volta ao baralho.
    state.answeredThisRound = [];
    discardHeldPairs(() => true);
    state.waitingFor = [];
    Game.ui.refreshNewRoundButton();

    const event = Game.domain.event.drawEvent(state.questionsData?.events || []);
    if (!event) {
        console.error('❌ Nenhum evento disponível!');
        return;
    }

    // Número e evento da rodada: as trocas de dupla dentro dela
    // (pickNewPair() sem evento) continuam com os dois (BUG-032).
    state.roundNumber = (state.roundNumber || 0) + 1;
    state.roundEvent = event;
    const eventEffect = applyDrawnEvent(event);
    pickNewPair(event, true, eventEffect);
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

/** O jogador está ativo (na partida e conectado)? */
function isActive(name) {
    return Game.getActivePlayers().some(p => p.name === name);
}

/**
 * Tira das duplas guardadas as que `isDiscarded(dupla)` aponta, e a
 * pergunta de cada uma volta ao baralho.
 */
function discardHeldPairs(isDiscarded) {
    const state = Game.state;
    state.heldPairs = (state.heldPairs || []).filter(pair => {
        if (!isDiscarded(pair)) return true;
        Game.domain.deck.returnQuestion(state.decks, pair.question);
        console.log('↩️ A pergunta guardada de ' + pair.answerer + ' volta ao baralho.');
        return false;
    });
}

/**
 * Duplas guardadas que deixaram de valer: quem responde já respondeu na
 * rodada, ou um dos dois saiu da partida (ou da sala).
 */
function discardStaleHeldPairs() {
    const state = Game.state;
    const inMatch = (name) => Game.selectors.getMatchPlayers(state.players).some(p => p.name === name);
    discardHeldPairs(pair => state.answeredThisRound.includes(pair.answerer) || !inMatch(pair.asker) || !inMatch(pair.answerer));
}

/**
 * Escolhe a próxima dupla da rodada: primeiro a dupla guardada com os dois
 * conectados (quem caiu voltou); senão, sorteia um Perguntador e um
 * Respondedor entre os jogadores ativos, respeitando o rodízio (quem tem
 * dupla guardada não é sorteado para responder, mas pode perguntar). Se
 * ninguém mais pode responder, a rodada encerra ou espera quem caiu
 * (endRoundOrWait()).
 *
 * Sem evento (troca de dupla no meio da rodada: quem estava na dupla caiu
 * ou saiu, quem responde sumiu, retomada do host sem dupla), continua a
 * rodada com o evento dela (`state.roundEvent`), sem o aviso e sem aplicar
 * o efeito de novo — o evento só sai no início da rodada (startNewRound()).
 * Sem o evento da rodada (estado salvo de antes do campo), começa uma.
 * @param {object} event – o evento da rodada (reaproveitado entre perguntas da mesma rodada)
 * @param {boolean} showModal – se true, exibe o modal de evento agora
 *   (só deve ser true no INÍCIO de uma rodada nova — startNewRound() usa
 *   o padrão `true`; continuações dentro da mesma rodada, vindas de
 *   nextTurn(), passam `false` explicitamente)
 * @param {object|null} eventEffect – quem o evento atingiu (applyEventEffects()),
 *   mostrado no aviso do evento
 */
function pickNewPair(event = null, showModal = true, eventEffect = null) {
    const state = Game.state;

    if (!event && state.roundEvent) {
        event = state.roundEvent;
        showModal = false;
    } else if (!event) {
        startNewRound();
        return;
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
        // correndo durante a pausa. As duplas guardadas continuam.
        const matchPlayers = Game.selectors.getMatchPlayers(state.players);
        if (matchPlayers.length >= CONFIG.GAME.MIN_PLAYERS) {
            console.warn('⏸️ Jogadores conectados insuficientes — partida pausada até alguém reconectar.');
            state.currentRound = null;
            state.waitingFor = [];
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

    discardStaleHeldPairs();
    const ready = state.heldPairs.find(pair => isActive(pair.asker) && isActive(pair.answerer));
    if (ready) {
        reopenHeldPair(ready, event, ready.asker);
        return;
    }

    // Recurso não limita quem pode ser Respondedor: qualquer jogador
    // ativo sempre tenta responder, mesmo com 0 recursos, já que só errar
    // gasta recurso (domain/kpiRules.js).

    // Seleciona um Respondedor que ainda não tenha respondido nesta rodada
    // nem tenha dupla guardada.
    const held = state.heldPairs.map(pair => pair.answerer);
    const available = activePlayers.filter(p =>
        !state.answeredThisRound.includes(p.name) && !held.includes(p.name)
    );
    if (available.length === 0) {
        endRoundOrWait();
        return;
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
    startPair(event, asker.name, answerer.name, { ...question, domain: domainName, area: areaName });
}

/**
 * Reabre uma dupla guardada como a dupla da vez, com outro número, a
 * mesma pergunta e quem responde com o tempo que faltava; o Perguntador
 * (`askerName`: o de antes, ou outro, ao passar a pergunta) a faz de novo.
 */
function reopenHeldPair(pair, event, askerName) {
    const state = Game.state;
    state.heldPairs = state.heldPairs.filter(p => p !== pair);
    console.log('🔁 Dupla guardada de volta: ' + askerName + ' pergunta para ' + pair.answerer + '.');
    startPair(event, askerName, pair.answerer, pair.question, pair.answerTimeLeft);
}

/**
 * Começa a dupla da vez: número novo, avisa todos ('round-start'), monta
 * a tela do host e manda a pergunta (com o gabarito) ao Perguntador.
 * `answerTimeLeft` (ms): o prazo de resposta que faltava, numa dupla
 * guardada que reabre; sem ele, o prazo inteiro.
 */
function startPair(event, askerName, answererName, question, answerTimeLeft) {
    const state = Game.state;
    const asker = Game.getPlayerByName(askerName);

    state.matchPaused = null;
    state.roundEnded = false;
    state.waitingFor = [];
    state.lastPairId = (state.lastPairId || 0) + 1;
    state.currentRound = {
        event,
        asker: askerName,
        answerer: answererName,
        question,
        answered: false,
        // A pergunta só vai para o Respondedor quando o Perguntador a faz
        // (ver askQuestion()). Rodada sem o campo (estado salvo ou cópia
        // de uma versão anterior) conta como pergunta já feita.
        asked: false,
        pairId: state.lastPairId
    };
    if (typeof answerTimeLeft === 'number') state.currentRound.answerTimeLeft = answerTimeLeft;

    console.log('🎯 Rodada ' + state.roundNumber + ' — nova dupla: ' + askerName + ' pergunta para ' + answererName);
    console.log('📋 Evento:', event ? event.title : '(nenhum)');

    // `answeredThisRound` = quem já respondeu nesta rodada (vazio
    // numa rodada nova). Os guests guardam — quem assumir como host
    // continua o rodízio de onde parou. `roundNumber`: para o console de
    // cada um mostrar em que rodada está. `pairId`: o guest manda de
    // volta na resposta e no "Fazer a pergunta".
    Game.network.broadcastAll({
        type: 'round-start',
        event,
        asker: askerName,
        answerer: answererName,
        answeredThisRound: state.answeredThisRound.slice(),
        roundNumber: state.roundNumber,
        pairId: state.lastPairId
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
    if (state.playerName !== askerName && state.playerName !== answererName) {
        Game.ui.displaySpectatorView(askerName, answererName);
    } else {
        Game.ui.displayRoundStart();
    }

    // Envia a pergunta (com gabarito) para o Perguntador. O Respondedor
    // só a recebe quando o Perguntador a faz (askQuestion()). O número da
    // dupla vai junto: a pergunta pode chegar antes do 'round-start' (BUG-035).
    if (asker) {
        Game.network.sendToPlayer(asker.peerId, {
            type: 'question',
            question: question.question,
            domain: question.domain,
            area: question.area,
            alternatives: question.alternatives,
            correct: question.correct,
            id: question.id,
            isAsker: true,
            pairId: state.lastPairId
        });
    }

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
 * até CONFIG.GAME.ASK_TIMEOUT, a pergunta vai sozinha. A hora de término
 * fica na rodada (`askEndsAt`, hora do servidor), para o F5 do host
 * continuar do mesmo ponto. `ms` é o prazo que resta (no F5); sem ele, o
 * prazo inteiro; zero ou menos, a pergunta vai na hora.
 */
function armAskTimeout(ms = CONFIG.GAME.ASK_TIMEOUT) {
    const state = Game.state;
    clearAskTimeout();
    if (state.currentRound) state.currentRound.askEndsAt = Game.network.serverNow() + ms;
    state.askTimeout = setTimeout(() => {
        console.log('⌛ O Perguntador não clicou a tempo — a pergunta vai sozinha.');
        askQuestion(true);
    }, Math.max(0, ms));
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
 * Host: a mensagem é de outra dupla (o número que ela traz não é o da
 * dupla da vez)? Ex.: a resposta mandada sem conexão, que chega depois de
 * a dupla ter mudado. Sem o número, vale como antes.
 */
function isFromOtherPair(msg) {
    const round = Game.state.currentRound;
    if (!round || typeof msg.pairId !== 'number' || msg.pairId === round.pairId) return false;
    console.warn('⚠️ ' + (msg.type || 'answer') + ' de ' + msg.playerName + ' ignorado: é de outra dupla (número ' + msg.pairId + ', a da vez é ' + round.pairId + ').');
    return true;
}

/**
 * Host: o Perguntador clicou em "Fazer a pergunta" (mensagem
 * 'ask-question', ou a própria tela do host). Pedido de outro jogador, ou
 * de outra dupla, é ignorado.
 */
function handleAskQuestion(msg) {
    const round = Game.state.currentRound;
    if (!Game.state.isHost || !round || msg.playerName !== round.asker) return;
    if (isFromOtherPair(msg)) return;
    askQuestion(false);
}

/**
 * Host: a pergunta foi feita (clique ou prazo do Perguntador). Avisa
 * todos ('question-asked'), manda a pergunta, sem o gabarito, ao
 * Respondedor e liga o prazo de resposta (inteiro, ou o que faltava numa
 * dupla guardada que reabriu). Só vale uma vez por pergunta.
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

    // O prazo de resposta é armado antes do envio: a pergunta leva a hora
    // de término dele, pela qual conta o contador de quem responde.
    const left = typeof round.answerTimeLeft === 'number' ? round.answerTimeLeft : undefined;
    round.answerTimeLeft = null;
    armAnswerTimeout(round.answerer, left);

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
            isAnswerer: true,
            answerEndsAt: round.answerEndsAt,
            pairId: round.pairId
        });
    }

    Game.saveState();
}

/**
 * Arma um timeout para evitar que a rodada fique travada se o Respondedor
 * não responder (desconexão, travamento, etc.). A hora de término fica na
 * rodada (`answerEndsAt`, hora do servidor). `ms` é o prazo que resta
 * (depois de um apoio ou de um F5 do host, continua de onde parou); sem
 * ele, o prazo inteiro; zero ou menos, a vez é pulada na hora.
 */
function armAnswerTimeout(answererName, ms = CONFIG.GAME.ANSWER_TIMEOUT) {
    const state = Game.state;
    if (state.answerTimeout) {
        clearTimeout(state.answerTimeout);
        state.answerTimeout = null;
    }
    if (state.currentRound) state.currentRound.answerEndsAt = Game.network.serverNow() + ms;
    state.answerTimeout = setTimeout(() => {
        console.warn('⌛ Timeout: ' + answererName + ' não respondeu a tempo. Pulando vez automaticamente.');
        Game.engine.answer.handleAnswer({ alternative: null, playerName: answererName, timeout: true });
    }, Math.max(0, ms));
}

/**
 * Para o prazo de resposta (apoio pendente), apaga a hora de término da
 * rodada e devolve quanto faltava, em ms — ou undefined, se o prazo não
 * estava correndo (rodada sem `answerEndsAt`). Quem diz se o prazo corre
 * é a hora de término guardada (vai no estado salvo), não o timer.
 */
function pauseAnswerTimeout() {
    const state = Game.state;
    if (state.answerTimeout) {
        clearTimeout(state.answerTimeout);
        state.answerTimeout = null;
    }
    const round = state.currentRound;
    if (!round || typeof round.answerEndsAt !== 'number') return undefined;
    const left = Math.max(0, round.answerEndsAt - Game.network.serverNow());
    round.answerEndsAt = null;
    return left;
}

/**
 * Avança para o próximo par dentro da rodada vigente.
 *
 * Quando todos os jogadores ativos já responderam (ciclo completo), o
 * jogo PARA e aguarda: é o host quem clica em "Nova Rodada"
 * (Game.core.startNewRound(), ligado em controlsComponent.js) para
 * sortear o próximo evento e mostrar o modal — a rodada nova nunca
 * começa sozinha. Se alguém caiu sem responder, a rodada espera por ele
 * (endRoundOrWait()).
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
    pickNewPair(state.currentRound?.event, false);
}

/**
 * Se todos os jogadores ativos já responderam nesta rodada, encerra a
 * rodada ou a deixa esperando quem caiu (endRoundOrWait()).
 *
 * Usada também ao retomar uma partida pausada (resumePausedMatch()).
 * @returns {boolean} true se encerrou a rodada ou ela ficou esperando
 */
function endRoundIfCycleComplete() {
    const state = Game.state;
    if (!Game.selectors.isCycleComplete(Game.getActivePlayers(), state.answeredThisRound)) return false;
    endRoundOrWait();
    return true;
}

/**
 * Quem a rodada espera para fechar: os desconectados de cada dupla
 * guardada e quem caiu sem ter respondido nesta rodada.
 */
function namesToWaitFor() {
    const state = Game.state;
    const match = Game.selectors.getMatchPlayers(state.players);
    const isOut = (name) => match.some(p => p.name === name && p.disconnected);
    const names = [];
    const add = (name) => { if (isOut(name) && !names.includes(name)) names.push(name); };
    state.heldPairs.forEach(pair => { add(pair.asker); add(pair.answerer); });
    match.filter(p => !state.answeredThisRound.includes(p.name)).forEach(p => add(p.name));
    return names;
}

/**
 * A dupla guardada que o host pode passar a outro Perguntador: quem
 * responde conectado e quem pergunta fora, com mais alguém para perguntar.
 */
function handOverCandidate() {
    const state = Game.state;
    const pair = state.heldPairs.find(p => isActive(p.answerer) && !isActive(p.asker));
    if (!pair || !Game.getActivePlayers().some(p => p.name !== pair.answerer)) return null;
    return pair;
}

/**
 * Ninguém mais pode responder nesta rodada. Sem ninguém para esperar, a
 * rodada encerra: marca `state.roundEnded`, libera o "Nova Rodada", avisa
 * os guests ('round-ended') e mostra o aviso. Com alguém caído sem ter
 * respondido, a rodada espera por ele ('round-waiting' com os nomes): a
 * volta dele reabre a dupla (refreshRoundWaiting()), e o host pode seguir
 * sem ele ("Nova Rodada") ou passar a pergunta pendente a outro
 * Perguntador (handOverHeldQuestion()).
 */
function endRoundOrWait() {
    const state = Game.state;
    discardStaleHeldPairs();
    const waitingFor = namesToWaitFor();
    if (waitingFor.length === 0) {
        console.log('✅ Todos os jogadores ativos já responderam nesta rodada. Aguardando o host clicar em "Nova Rodada".');
        state.roundEnded = true;
        state.waitingFor = [];
        Game.ui.refreshNewRoundButton();
        Game.network.broadcastAll({ type: 'round-ended' });
        Game.ui.showRoundEndedMessage();
        Game.saveState();
        return;
    }

    console.log('⏳ A rodada espera ' + waitingFor.join(', ') + ' voltar (ou o host clicar em "Nova Rodada").');
    state.currentRound = null;
    state.roundEnded = false;
    state.waitingFor = waitingFor;
    Game.network.broadcastAll({ type: 'round-waiting', waitingFor: waitingFor.slice() });
    Game.ui.showRoundWaitingMessage(waitingFor.slice(), !!handOverCandidate());
    Game.ui.refreshNewRoundButton();
    Game.saveState();
}

/**
 * Host: com a rodada esperando quem caiu, alguém voltou ou caiu — a dupla
 * guardada de quem voltou reabre, ou a espera é recalculada.
 */
function refreshRoundWaiting() {
    const state = Game.state;
    if (!state.isHost || !(state.waitingFor || []).length || state.currentRound || state.matchPaused) return;
    pickNewPair();
}

/**
 * Host, na espera do fim da rodada (botão "Passar a pergunta pendente
 * para outra pessoa"): a dupla guardada com quem responde conectado e
 * quem pergunta fora reabre com outro Perguntador, sorteado entre os
 * conectados, menos quem responde.
 */
function handOverHeldQuestion() {
    const state = Game.state;
    if (!state.isHost || !(state.waitingFor || []).length) return;
    const pair = handOverCandidate();
    if (!pair) return;
    const askers = Game.getActivePlayers().filter(p => p.name !== pair.answerer);
    const asker = askers[Math.floor(Math.random() * askers.length)];
    console.log('🔁 A pergunta pendente de ' + pair.answerer + ' passa de ' + pair.asker + ' para ' + asker.name + '.');
    reopenHeldPair(pair, state.roundEvent, asker.name);
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
        pickNewPair(pause.event, false);
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
    isFromOtherPair,
    handleAskQuestion,
    askQuestion,
    armAnswerTimeout,
    pauseAnswerTimeout,
    nextTurn,
    endRoundIfCycleComplete,
    refreshRoundWaiting,
    handOverHeldQuestion,
    resumePausedMatch
};

// Game.core.* é o namespace usado por ui/ e network/ para chamar as
// funções deste engine — convenção de chamada entre camadas, não é
// compatibilidade temporária nem trabalho pendente (ver _docs/architecture.md).
window.Game.core = window.Game.core || {};
Object.assign(window.Game.core, window.Game.engine.turn);
