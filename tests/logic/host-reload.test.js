// ============================================
// PM: The KPI Master - Testes de lógica: F5 do host
// ============================================
// F5 do host em cada momento da partida: faz o que aconteceria sem o F5
// (D3f, BUG-019, BUG-020).
// Ambiente simulado e ajudantes: environment.js. Rodar a partir da raiz:
//     node tests/logic/host-reload.test.js
// ============================================

const {
    fs, path, vm, RAIZ, createEnvironment, tokenOf, test, check, start, finish,
    syncTo, roundScreens, unavailable, roomToReload, reloadHost, tryReloadHost
} = require('./environment');

start('F5 do host');

/** Responde (certo) cada pergunta e avança, até o host encerrar a rodada. */
function answerUntilRoundEnds(amb) {
    for (let i = 0; i < 10 && !amb.state.rodadaEncerrada; i++) {
        const r = amb.state.currentRound;
        amb.Game.core.handleAnswer({ alternativa: r.pergunta.correct, playerName: r.respondedor });
        amb.Game.core.nextTurn();
    }
}

test('T53 F5 do host com a rodada encerrada: continua encerrada, "Nova Rodada" liberado, nada começa sozinho (B3)', (usar) => {
    const amb = usar(createEnvironment());
    roomToReload(amb);
    amb.join('A', 'peer-a');
    amb.startMatch();
    answerUntilRoundEnds(amb);
    check(amb.state.rodadaEncerrada === true, 'pré-condição: rodada encerrada, aguardando o "Nova Rodada"');

    const novo = usar(reloadHost(amb));
    const tempo = novo.fakeTime();
    novo.clearLog();
    novo.Game.core.retomarPartidaAposRecarregar();
    check(novo.state.rodadaEncerrada === true, 'depois do F5, a rodada deveria continuar encerrada');
    const telas = roundScreens(novo);
    check(telas.includes('showRoundEndedMessage'), 'o host deveria ver "Rodada encerrada", viu: ' + telas.join(', '));
    check(!telas.includes('displayQuestion') && !telas.includes('displayRoundStart'), 'não pode reabrir a última pergunta, viu: ' + telas.join(', '));
    check(novo.Game.selectors.isCycleComplete(novo.Game.getActivePlayers(), novo.state.usedRespondedorThisRound),
        'o "Nova Rodada" deveria ficar liberado (rodízio completo preservado)');
    tempo.advance(novo.CONFIG.JOGO.RESPOSTA_TIMEOUT * 2);
    check(novo.state.rodadaEncerrada === true && novo.broadcastsOfType('round-start').length === 0,
        'nada pode começar sozinho depois do F5');

    // A volta: recebe "rodada encerrada" e nada começa.
    novo.join('A', 'peer-a2');
    const sync = syncTo(novo, 'peer-a2');
    check(sync && sync.rodadaEncerrada === true && sync.partidaPausada === false, 'quem volta deveria receber "rodada encerrada"');
    check(novo.broadcastsOfType('round-start').length === 0, 'a volta de A não pode começar rodada sozinha');
    const guest = usar(createEnvironment());
    guest.receiveSync('A', sync);
    const telasGuest = roundScreens(guest);
    check(telasGuest.includes('showRoundEndedMessage') && !telasGuest.includes('displaySpectatorView'),
        'A deveria ver "Rodada encerrada" (não a última dupla em andamento), viu: ' + telasGuest.join(', '));

    // O host clica em "Nova Rodada".
    novo.Game.core.startNewRound();
    const rs = novo.broadcastsOfType('round-start').pop();
    check(novo.state.currentRound && !novo.state.currentRound.respondeu && novo.state.rodadaEncerrada === false,
        'Nova Rodada deveria começar uma dupla nova');
    check(rs && rs.respondidos.length === 0, 'rodada nova começa com o rodízio zerado');
});

test('T54 F5 do host logo depois de uma resposta (antes da próxima dupla): a partida segue (B4)', (usar) => {
    // Faltam outros: segue para a próxima dupla, com o mesmo evento.
    const amb = usar(createEnvironment());
    roomToReload(amb);
    amb.join('A', 'peer-a');
    amb.join('B', 'peer-b');
    amb.startMatch();
    const r = amb.state.currentRound;
    amb.Game.core.handleAnswer({ alternativa: r.pergunta.correct, playerName: r.respondedor });
    const kpiDeQuemRespondeu = amb.player(r.respondedor).kpi;
    // F5 antes do nextTurn(): o setTimeout de 3s se perde com a página.

    const novo = usar(reloadHost(amb));
    novo.clearLog();
    novo.Game.core.retomarPartidaAposRecarregar();
    const r2 = novo.state.currentRound;
    check(r2 && r2.respondeu === false && r2.respondedor !== r.respondedor,
        'deveria seguir para a próxima dupla, com outro Respondedor, veio: ' + JSON.stringify(r2 && { r: r2.respondedor, respondeu: r2.respondeu }));
    check(r2.evento && r2.evento.id === r.evento.id, 'a rodada continua com o mesmo evento');
    check(novo.broadcastsOfType('round-start').length === 1, 'deveria avisar a nova dupla');
    check(novo.broadcastsOfType('show-evento').length === 0 && !novo.registro.ui.includes('showEventoModal'), 'não deveria reexibir o evento');
    check(JSON.stringify(novo.state.usedRespondedorThisRound) === JSON.stringify([r.respondedor]), 'quem respondeu continua no rodízio');
    check(!novo.state.rodadaEncerrada, 'a rodada ainda não acabou');
    check(novo.player(r.respondedor).kpi === kpiDeQuemRespondeu, 'a resposta não pode ser contada de novo');

    // Era a última resposta da rodada: a rodada encerra.
    const amb2 = usar(createEnvironment());
    roomToReload(amb2);
    amb2.join('A', 'peer-a');
    amb2.startMatch();
    let rr = amb2.state.currentRound;
    amb2.Game.core.handleAnswer({ alternativa: rr.pergunta.correct, playerName: rr.respondedor });
    amb2.Game.core.nextTurn();
    rr = amb2.state.currentRound;
    amb2.Game.core.handleAnswer({ alternativa: rr.pergunta.correct, playerName: rr.respondedor });
    check(!amb2.state.rodadaEncerrada, 'pré-condição: F5 antes de a rodada ser encerrada');

    const novo2 = usar(reloadHost(amb2));
    novo2.clearLog();
    novo2.Game.core.retomarPartidaAposRecarregar();
    check(novo2.state.rodadaEncerrada === true, 'todos já responderam: a rodada deveria encerrar');
    check(novo2.broadcastsOfType('round-ended').length === 1 && novo2.broadcastsOfType('round-start').length === 0,
        'deveria avisar "rodada encerrada", sem começar outra dupla');
    check(novo2.registro.ui.includes('showRoundEndedMessage'), 'o host deveria ver "Rodada encerrada"');

    // Pergunta respondida pelo outro sinal (Respondedor já no rodízio, sem `respondeu`).
    const amb3 = usar(createEnvironment());
    roomToReload(amb3);
    amb3.join('A', 'peer-a');
    amb3.join('B', 'peer-b');
    amb3.startMatch();
    const r3 = amb3.state.currentRound;
    amb3.Game.core.handleAnswer({ alternativa: r3.pergunta.correct, playerName: r3.respondedor });
    amb3.state.currentRound.respondeu = false;
    amb3.Game.saveState();

    const novo3 = usar(reloadHost(amb3));
    novo3.clearLog();
    novo3.Game.core.retomarPartidaAposRecarregar();
    check(novo3.state.currentRound && novo3.state.currentRound.respondedor !== r3.respondedor,
        'Respondedor já no rodízio: a pergunta conta como respondida e a partida segue');
    check(novo3.broadcastsOfType('round-start').length === 1 && !novo3.registro.ui.includes('displayQuestion'),
        'deveria formar a próxima dupla, sem reabrir a pergunta já respondida');
});

test('T55 F5 do host com a partida pausada: continua pausada com o mesmo evento e retoma quando alguém volta (B5)', (usar) => {
    const amb = usar(createEnvironment());
    roomToReload(amb);
    amb.join('A', 'peer-a');
    amb.startMatch();
    amb.drop('peer-a');
    check(amb.state.partidaPausada && amb.state.partidaPausada.evento, 'pré-condição: partida pausada, com o evento');
    const eventoPausado = amb.state.partidaPausada.evento;

    const novo = usar(reloadHost(amb));
    const ev = novo.Game.domain.event;
    const sortear = ev.sortearEvento;
    const aplicar = ev.aplicarEfeitosEvento;
    let sorteios = 0;
    let efeitos = 0;
    ev.sortearEvento = (...a) => { sorteios++; return sortear(...a); };
    ev.aplicarEfeitosEvento = (...a) => { efeitos++; return aplicar(...a); };
    novo.clearLog();
    novo.Game.core.retomarPartidaAposRecarregar();
    check(novo.state.partidaPausada && novo.state.partidaPausada.evento && novo.state.partidaPausada.evento.id === eventoPausado.id,
        'deveria continuar pausada com o MESMO evento, veio: ' + JSON.stringify(novo.state.partidaPausada));
    check(novo.state.currentRound === null, 'não deveria haver dupla durante a pausa');
    check(sorteios === 0 && efeitos === 0, 'não pode sortear outro evento nem reaplicar efeitos (sorteios: ' + sorteios + ', efeitos: ' + efeitos + ')');
    check(novo.broadcastsOfType('show-evento').length === 0 && !novo.registro.ui.includes('showEventoModal'), 'não deveria mostrar evento');
    check(novo.registro.ui.includes('showPartidaPausadaMessage'), 'o host deveria ver o aviso de pausa');

    // A volta: retoma com o mesmo evento, sem modal.
    novo.join('A', 'peer-a2');
    check(!novo.state.partidaPausada, 'a volta de A deveria retomar a partida');
    const r = novo.state.currentRound;
    check(r && r.evento && r.evento.id === eventoPausado.id, 'a rodada retomada deveria usar o mesmo evento');
    check(novo.broadcastsOfType('round-start').length === 1 && novo.broadcastsOfType('show-evento').length === 0,
        'deveria mandar a nova dupla, sem reexibir o evento');
    check(sorteios === 0 && efeitos === 0, 'a retomada também não sorteia nem reaplica');
});

test('T56 F5 do host com a pergunta aberta e sem rodada: como antes; relógio e prazo de resposta religados', (usar) => {
    // Pergunta aberta: reexibida, com o prazo de resposta rearmado.
    const amb = usar(createEnvironment());
    roomToReload(amb);
    amb.join('A', 'peer-a');
    amb.startMatch();
    const r = amb.state.currentRound;

    const novo = usar(reloadHost(amb));
    const tempo = novo.fakeTime();
    const relogio = novo.fakeClock();
    novo.clearLog();
    novo.Game.core.retomarPartidaAposRecarregar();
    const r2 = novo.state.currentRound;
    check(r2 && r2.perguntador === r.perguntador && r2.respondedor === r.respondedor && r2.pergunta.id === r.pergunta.id && !r2.respondeu,
        'a mesma pergunta deveria continuar em andamento');
    const telas = roundScreens(novo);
    check(telas.includes('displayRoundStart') && telas.includes('displayQuestion'), 'deveria reexibir a pergunta, viu: ' + telas.join(', '));
    check(novo.broadcastsOfType('round-start').length === 0 && novo.broadcastsOfType('show-evento').length === 0,
        'não pode trocar a pergunta (BUG-001)');

    check(relogio.activeCount() === 1, 'o relógio da partida deveria voltar a contar, ligados: ' + relogio.activeCount());
    const t0 = novo.state.timer;
    relogio.tick();
    check(novo.state.timer === t0 - 1, 'deveria contar 1 segundo, veio: ' + novo.state.timer);

    tempo.advance(novo.CONFIG.JOGO.RESPOSTA_TIMEOUT);
    check(novo.state.currentRound.respondeu === true && novo.broadcastsOfType('kpi-update').some(m => m.playerName === r.respondedor),
        'o prazo de resposta deveria estar rearmado (a vez é pulada ao fim do prazo)');

    // Partida em andamento sem rodada (nem pausada, nem encerrada): começa uma.
    const amb2 = usar(createEnvironment());
    roomToReload(amb2);
    amb2.join('A', 'peer-a');
    amb2.state.gameStarted = true;
    amb2.Game.saveState();
    const novo2 = usar(reloadHost(amb2));
    novo2.clearLog();
    novo2.Game.core.retomarPartidaAposRecarregar();
    check(novo2.state.currentRound && !novo2.state.currentRound.respondeu, 'sem rodada, deveria começar uma dupla');
    check(novo2.broadcastsOfType('show-evento').length === 1, 'rodada nova, com o evento');

    // Lobby: nada a retomar.
    const amb3 = usar(createEnvironment());
    roomToReload(amb3);
    amb3.join('A', 'peer-a');
    const novo3 = usar(reloadHost(amb3));
    novo3.clearLog();
    novo3.Game.core.retomarPartidaAposRecarregar();
    check(novo3.registro.ui.length === 0 && novo3.registro.broadcasts.length === 0 && novo3.state.currentRound === null,
        'no lobby, a retomada não faz nada');

    // Guest e fim de jogo: nada a retomar (o motor da partida é do host).
    for (const caso of ['guest', 'fim de jogo']) {
        const novo4 = usar(reloadHost(amb2));
        if (caso === 'guest') novo4.state.isHost = false;
        else novo4.state.gameOver = true;
        const rodadaAntes = JSON.stringify(novo4.state.currentRound);
        novo4.clearLog();
        novo4.Game.core.retomarPartidaAposRecarregar();
        check(novo4.registro.ui.length === 0 && novo4.registro.broadcasts.length === 0 && JSON.stringify(novo4.state.currentRound) === rodadaAntes,
            caso + ': a retomada não deveria fazer nada');
    }

    // main.js só chama a retomada (a lógica fica no sessionEngine.js, testável aqui).
    const main = fs.readFileSync(path.join(RAIZ, 'js/main.js'), 'utf8');
    check(/if \(state\.isHost\) \{\s*Game\.core\.retomarPartidaAposRecarregar\(\);/.test(main),
        'init() deveria chamar Game.core.retomarPartidaAposRecarregar() para o host');
    check(!/armarRespostaTimeout|pickNewPair|setInterval/.test(main), 'main.js não deveria ter lógica própria de retomada');
});

test('T58 F5 do host logo depois da resposta que completa a última fase: a partida termina, como sem o F5', (usar) => {
    // 3 jogadores: a rodada ainda não acabou, então só o fim de jogo explica parar.
    const prepareLastAnswer = (amb) => {
        roomToReload(amb);
        amb.join('A', 'peer-a');
        amb.join('B', 'peer-b');
        amb.startMatch();
        const r = amb.state.currentRound;
        const ultimaFase = amb.CONFIG.FASES[amb.CONFIG.FASES.length - 1].id;
        Object.assign(amb.player(r.respondedor), { phase: ultimaFase, activities: amb.CONFIG.JOGO.ACTIVITIES_PER_PHASE - 1 });
        return r;
    };

    // Controle, sem F5: 3s depois da resposta, a partida termina.
    const semF5 = usar(createEnvironment());
    const tempo = semF5.fakeTime();
    const r0 = prepareLastAnswer(semF5);
    semF5.Game.core.handleAnswer({ alternativa: r0.pergunta.correct, playerName: r0.respondedor });
    tempo.advance(3000);
    check(semF5.state.gameOver === true, 'pré-condição: sem F5, a resposta que completa a última fase encerra a partida');

    // Com F5 antes dos 3s: a retomada também encerra.
    const amb = usar(createEnvironment());
    const r = prepareLastAnswer(amb);
    amb.Game.core.handleAnswer({ alternativa: r.pergunta.correct, playerName: r.respondedor });
    check(!amb.state.gameOver, 'pré-condição: F5 antes de a partida terminar');

    const novo = usar(reloadHost(amb));
    novo.clearLog();
    novo.Game.core.retomarPartidaAposRecarregar();
    check(novo.state.gameOver === true, 'depois do F5, a partida deveria terminar');
    check(novo.broadcastsOfType('game-over').length === 1, 'deveria avisar os guests do fim de jogo');
    check(novo.broadcastsOfType('round-start').length === 0 && novo.broadcastsOfType('round-ended').length === 0,
        'não pode seguir para outra dupla nem encerrar só a rodada');
});

/**
 * Partida de 3 (Host, A, B) com a dupla fixada e um pedido de
 * assessoria aceito pelo host, ainda sem resposta do assessor.
 */
function preparePendingAdvisory(amb, { perguntador, respondedor, assessor }) {
    roomToReload(amb);
    amb.join('A', 'peer-a');
    amb.join('B', 'peer-b');
    amb.startMatch();
    // O sorteio da dupla é aleatório: fixa os papéis (mesma pergunta e evento).
    amb.state.currentRound = { ...amb.state.currentRound, perguntador, respondedor, respondeu: false };
    amb.state.usedRespondedorThisRound = [];
    if (respondedor === 'Host') {
        amb.Game.core.requestAssessoria(assessor);
    } else {
        amb.Game.network.handleMessage({ type: 'assessoria-request', assessorName: assessor, requesterName: respondedor }, amb.player(respondedor).peerId);
    }
    const a = amb.state.currentRound.assessoria;
    check(a && a.status === 'pending' && a.assessorName === assessor, 'pré-condição: assessoria pendente');
    check(amb.registro.enviados.some(e => e.para === amb.player(assessor).peerId && e.msg.type === 'assessoria-question'),
        'pré-condição: o assessor recebeu a pergunta');
    return amb.state.currentRound;
}

test('T59 F5 do host com assessoria pendente: o pedido é cancelado, quem responde pode pedir de novo e a rodada não fica presa (BUG-019)', (usar) => {
    // 1) Respondedor guest (A), assessor guest (B), o host pergunta.
    const amb = usar(createEnvironment());
    const r = preparePendingAdvisory(amb, { perguntador: 'Host', respondedor: 'A', assessor: 'B' });

    const novo = usar(reloadHost(amb));
    const tempo = novo.fakeTime();
    novo.clearLog();
    novo.Game.core.retomarPartidaAposRecarregar();
    const r2 = novo.state.currentRound;
    check(r2 && r2.respondedor === 'A' && r2.pergunta.id === r.pergunta.id && !r2.respondeu,
        'a mesma pergunta deveria continuar em andamento');
    check(!r2.assessoria, 'o pedido de assessoria pendente deveria ser cancelado no F5, veio: ' + JSON.stringify(r2.assessoria));

    // Resposta atrasada do assessor do pedido cancelado: ignorada.
    novo.Game.network.handleMessage({ type: 'assessoria-answer', alternativa: r.pergunta.correct, recusado: false }, 'peer-b');
    check(novo.broadcastsOfType('assessoria-result').length === 0 && !novo.state.currentRound.assessoria,
        'a resposta atrasada do assessor do pedido cancelado deveria ser ignorada');

    // Quem responde volta e recebe a pergunta sem o pedido pendente (botões liberados).
    novo.join('A', 'peer-a2');
    const sync = syncTo(novo, 'peer-a2');
    check(sync && sync.currentRound && sync.currentRound.respondedor === 'A' && !sync.currentRound.assessoria,
        'A deveria receber a pergunta sem assessoria pendente, veio: ' + JSON.stringify(sync && sync.currentRound && sync.currentRound.assessoria));

    // Prazo de resposta rearmado: sem resposta, a vez é pulada e a partida segue.
    tempo.advance(novo.CONFIG.JOGO.RESPOSTA_TIMEOUT);
    check(novo.state.currentRound.respondeu === true && novo.broadcastsOfType('kpi-update').some(m => m.playerName === 'A'),
        'ao fim do prazo de resposta, a vez de A deveria ser pulada (a rodada não pode ficar presa)');
    tempo.advance(3000);
    check(novo.broadcastsOfType('round-start').length === 1, 'depois disso, a próxima dupla deveria começar');

    // 2) Depois do F5, quem responde pode pedir assessoria de novo — e o pedido corre normalmente.
    const amb2 = usar(createEnvironment());
    preparePendingAdvisory(amb2, { perguntador: 'Host', respondedor: 'A', assessor: 'B' });
    const novo2 = usar(reloadHost(amb2));
    const tempo2 = novo2.fakeTime();
    novo2.Game.core.retomarPartidaAposRecarregar();
    novo2.join('A', 'peer-a2');
    novo2.join('B', 'peer-b2');
    novo2.clearLog();
    novo2.Game.network.handleMessage({ type: 'assessoria-request', assessorName: 'B', requesterName: 'A' }, 'peer-a2');
    check(novo2.broadcastsOfType('assessoria-started').length === 1 &&
        novo2.registro.enviados.some(e => e.para === 'peer-b2' && e.msg.type === 'assessoria-question'),
        'A deveria conseguir pedir assessoria de novo, e B receber a pergunta');
    tempo2.advance(novo2.CONFIG.JOGO.ASSESSORIA_TIMEOUT);
    const resultado = novo2.broadcastsOfType('assessoria-result').pop();
    check(resultado && resultado.timeout === true, 'o novo pedido deveria ter o prazo de assessoria normal');
    tempo2.advance(novo2.CONFIG.JOGO.RESPOSTA_TIMEOUT);
    check(novo2.broadcastsOfType('kpi-update').some(m => m.playerName === 'A'), 'e depois o prazo de resposta normal');

    // 3) O host é quem responde: a tela dele já abre sem o pedido pendente.
    const amb3 = usar(createEnvironment());
    preparePendingAdvisory(amb3, { perguntador: 'A', respondedor: 'Host', assessor: 'B' });
    const novo3 = usar(reloadHost(amb3));
    const tempo3 = novo3.fakeTime();
    const assessoriaNaTela = [];
    const uiReal = novo3.Game.ui;
    novo3.Game.ui = new Proxy({}, {
        get: (_, nome) => (...args) => {
            if (nome === 'displayQuestion') assessoriaNaTela.push(novo3.state.currentRound && novo3.state.currentRound.assessoria);
            return uiReal[nome](...args);
        }
    });
    novo3.Game.core.retomarPartidaAposRecarregar();
    check(assessoriaNaTela.length === 1 && !assessoriaNaTela[0],
        'o host deveria ver a pergunta sem o pedido pendente (botões liberados), viu: ' + JSON.stringify(assessoriaNaTela));
    tempo3.advance(novo3.CONFIG.JOGO.RESPOSTA_TIMEOUT);
    check(novo3.broadcastsOfType('kpi-update').some(m => m.playerName === 'Host'),
        'ao fim do prazo de resposta, a vez do host deveria ser pulada');

    // 4) A resposta já tinha chegado e esperava o assessor: é processada no F5.
    const amb4 = usar(createEnvironment());
    const r4 = preparePendingAdvisory(amb4, { perguntador: 'Host', respondedor: 'A', assessor: 'B' });
    amb4.Game.network.handleMessage({ type: 'answer', alternativa: r4.pergunta.correct, playerName: 'A' }, 'peer-a');
    check(amb4.state.currentRound.pendingAnswer, 'pré-condição: resposta guardada esperando a assessoria');
    amb4.Game.saveState(); // salvo por outro motivo antes do F5 (ex.: alguém caiu)
    const novo4 = usar(reloadHost(amb4));
    const tempo4 = novo4.fakeTime();
    novo4.clearLog();
    novo4.Game.core.retomarPartidaAposRecarregar();
    const kpiDeA = novo4.broadcastsOfType('kpi-update').find(m => m.playerName === 'A');
    check(kpiDeA && kpiDeA.acertou === true, 'a resposta guardada deveria ser processada depois do F5');
    check(!novo4.registro.ui.includes('displayQuestion'), 'a pergunta já respondida não pode ser reexibida');
    const r5 = novo4.state.currentRound;
    check(novo4.state.usedRespondedorThisRound.includes('A') && r5 && !r5.pendingAnswer && !r5.assessoria,
        'A entra no rodízio; nada fica guardado nem pendente, veio: ' + JSON.stringify(r5 && { p: r5.pendingAnswer, a: r5.assessoria }));
    tempo4.advance(3000);
    check(novo4.broadcastsOfType('round-start').length === 1, 'e a partida segue para a próxima dupla');
});

test('T60 F5 do host com a assessoria já resolvida: a sugestão (ou a recusa) continua valendo', (usar) => {
    // Sugestão recebida antes do F5: continua na rodada e o bônus do assessor vale.
    const amb = usar(createEnvironment());
    const r = preparePendingAdvisory(amb, { perguntador: 'Host', respondedor: 'A', assessor: 'B' });
    amb.Game.network.handleMessage({ type: 'assessoria-answer', alternativa: r.pergunta.correct, recusado: false }, 'peer-b');
    check(amb.state.currentRound.assessoria.status === 'accepted', 'pré-condição: sugestão recebida');

    const novo = usar(reloadHost(amb));
    novo.fakeTime();
    novo.clearLog();
    novo.Game.core.retomarPartidaAposRecarregar();
    const a = novo.state.currentRound.assessoria;
    check(a && a.status === 'accepted' && a.assessorName === 'B' && a.sugestao === r.pergunta.correct,
        'a sugestão deveria continuar na rodada, veio: ' + JSON.stringify(a));
    novo.join('A', 'peer-a2');
    const sync = syncTo(novo, 'peer-a2');
    check(sync && sync.currentRound.assessoria && sync.currentRound.assessoria.status === 'accepted', 'A deveria voltar vendo a sugestão');
    novo.Game.network.handleMessage({ type: 'answer', alternativa: r.pergunta.correct, playerName: 'A' }, 'peer-a2');
    check(novo.broadcastsOfType('kpi-update').some(m => m.playerName === 'B' && m.assessoriaBonus === novo.CONFIG.KPI.ASSESSORIA_ACERTO),
        'seguindo a sugestão certa, o assessor deveria ganhar o bônus');

    // Prazo do assessor esgotado antes do F5: continua recusada e não dá para pedir de novo.
    const amb2 = usar(createEnvironment());
    const tempo2 = amb2.fakeTime();
    preparePendingAdvisory(amb2, { perguntador: 'Host', respondedor: 'A', assessor: 'B' });
    tempo2.advance(amb2.CONFIG.JOGO.ASSESSORIA_TIMEOUT);
    check(amb2.state.currentRound.assessoria.status === 'declined', 'pré-condição: prazo do assessor esgotado');
    const novo2 = usar(reloadHost(amb2));
    novo2.fakeTime();
    novo2.Game.core.retomarPartidaAposRecarregar();
    check(novo2.state.currentRound.assessoria && novo2.state.currentRound.assessoria.status === 'declined', 'a recusa deveria continuar valendo');
    novo2.join('A', 'peer-a2');
    novo2.clearLog();
    novo2.Game.network.handleMessage({ type: 'assessoria-request', assessorName: 'B', requesterName: 'A' }, 'peer-a2');
    check(novo2.broadcastsOfType('assessoria-started').length === 0, 'só um pedido de assessoria por pergunta, como sem o F5');
});

/**
 * Passa a registrar também os argumentos das funções de tela chamadas
 * (o registro padrão guarda só os nomes). Devolve a lista { nome, args }.
 */
function recordScreens(amb) {
    const chamadas = [];
    const uiAnterior = amb.Game.ui;
    amb.Game.ui = new Proxy({}, {
        get: (_, nome) => (...args) => {
            chamadas.push({ nome: String(nome), args });
            return uiAnterior[nome](...args);
        }
    });
    return chamadas;
}

/**
 * Partida de 3 (Host, A, B) com a dupla fixada e a pergunta aberta;
 * o host dá F5 e a partida é retomada. Devolve o host recarregado, o
 * tempo controlado e as telas que ele montou na retomada.
 */
function reloadWithOpenQuestion(usar, papeis) {
    const amb = usar(createEnvironment());
    roomToReload(amb);
    amb.join('A', 'peer-a');
    amb.join('B', 'peer-b');
    amb.startMatch();
    // O sorteio da dupla é aleatório: fixa os papéis (mesma pergunta e evento).
    amb.state.currentRound = { ...amb.state.currentRound, ...papeis, respondeu: false };
    amb.state.usedRespondedorThisRound = [];
    amb.Game.saveState();

    const novo = usar(reloadHost(amb));
    const tempo = novo.fakeTime();
    const telas = recordScreens(novo);
    novo.Game.core.retomarPartidaAposRecarregar();
    return { novo, tempo, telas };
}

test('T64 F5 do host fora da dupla com a pergunta aberta: volta vendo a tela de espectador e o prazo de resposta continua (BUG-020)', (usar) => {
    const { novo, tempo, telas } = reloadWithOpenQuestion(usar, { perguntador: 'A', respondedor: 'B' });
    const nomes = telas.map(t => t.nome);
    const espectador = telas.find(t => t.nome === 'displaySpectatorView');
    check(espectador && espectador.args[0] === 'A' && espectador.args[1] === 'B',
        'o host fora da dupla deveria ver "A pergunta para B", viu: ' + nomes.join(', '));
    check(!nomes.includes('displayRoundStart') && !nomes.includes('displayQuestion'),
        'o host fora da dupla não pode ver a área da pergunta, viu: ' + nomes.join(', '));
    const r = novo.state.currentRound;
    check(r && r.perguntador === 'A' && r.respondedor === 'B' && !r.respondeu, 'a mesma pergunta deveria continuar em andamento');
    check(novo.broadcastsOfType('round-start').length === 0, 'não pode trocar a pergunta');
    tempo.advance(novo.CONFIG.JOGO.RESPOSTA_TIMEOUT);
    check(novo.broadcastsOfType('kpi-update').some(m => m.playerName === 'B'),
        'o prazo de resposta deveria estar rearmado (sem resposta, a vez de B é pulada)');

    // Controle: o host na dupla (perguntando ou respondendo) continua vendo a pergunta.
    for (const papeis of [{ perguntador: 'Host', respondedor: 'A' }, { perguntador: 'A', respondedor: 'Host' }]) {
        const c = reloadWithOpenQuestion(usar, papeis);
        const n = c.telas.map(t => t.nome);
        check(n.includes('displayRoundStart') && n.includes('displayQuestion') && !n.includes('displaySpectatorView'),
            'host como ' + (papeis.perguntador === 'Host' ? 'Perguntador' : 'Respondedor') + ' deveria ver a pergunta, viu: ' + n.join(', '));
        c.tempo.advance(c.novo.CONFIG.JOGO.RESPOSTA_TIMEOUT);
        check(c.novo.broadcastsOfType('kpi-update').some(m => m.playerName === papeis.respondedor),
            'o prazo de resposta também deveria estar rearmado com o host na dupla');
    }
});

test('T65 A pergunta da rodada leva domínio e área: o F5 do host e quem volta à partida veem as etiquetas (BUG-020)', (usar) => {
    const amb = usar(createEnvironment());
    roomToReload(amb);
    amb.join('A', 'peer-a');
    amb.join('B', 'peer-b');
    amb.startMatch();
    const r = amb.state.currentRound;
    const area = amb.Game.getFaseById(amb.player(r.respondedor).phase).nome;
    check(r.pergunta.domain === 'Domínio de teste' && r.pergunta.area === area,
        'a pergunta guardada na rodada deveria ter domínio e área, veio: ' + JSON.stringify({ domain: r.pergunta.domain, area: r.pergunta.area }));

    // A mensagem do início da rodada continua igual: mesmos nomes, gabarito só para o Perguntador.
    const perguntas = amb.registro.enviados.filter(e => e.msg.type === 'question').map(e => e.msg);
    check(perguntas.length === 2 && perguntas.every(m => m.domain === 'Domínio de teste' && m.area === area),
        'as perguntas enviadas deveriam ter domínio e área');
    check(perguntas.find(m => m.isPerguntador).correct === r.pergunta.correct && perguntas.find(m => m.isRespondedor).correct === undefined,
        'só o Perguntador recebe o gabarito');

    // F5 do host Perguntador: a pergunta reexibida tem as etiquetas.
    const { novo, telas } = reloadWithOpenQuestion(usar, { perguntador: 'Host', respondedor: 'A' });
    const naTela = telas.find(t => t.nome === 'displayQuestion');
    check(naTela && naTela.args[0].domain === 'Domínio de teste' && naTela.args[0].area === 'Iniciação',
        'depois do F5, o host deveria ver as etiquetas, veio: ' + JSON.stringify(naTela && { domain: naTela.args[0].domain, area: naTela.args[0].area }));

    // A (o Respondedor) volta à partida: recebe a pergunta com as etiquetas e sem o gabarito.
    novo.join('A', 'peer-a2');
    const sync = syncTo(novo, 'peer-a2');
    const p = sync && sync.currentRound && sync.currentRound.pergunta;
    check(p && p.domain === 'Domínio de teste' && p.area === 'Iniciação', 'quem volta deveria receber domínio e área, veio: ' + JSON.stringify(p && { domain: p.domain, area: p.area }));
    check(p.correct === undefined, 'o Respondedor não pode receber o gabarito');
    const guest = usar(createEnvironment());
    const telasGuest = recordScreens(guest);
    guest.receiveSync('A', sync);
    const naTelaGuest = telasGuest.find(t => t.nome === 'displayQuestion');
    check(naTelaGuest && naTelaGuest.args[0].domain === 'Domínio de teste' && naTelaGuest.args[0].area === 'Iniciação',
        'A deveria ver as etiquetas ao voltar');
});

finish('F5 do host');
