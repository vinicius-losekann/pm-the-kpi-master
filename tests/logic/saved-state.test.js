// ============================================
// PM: The KPI Master - Testes de lógica: Estado salvo
// ============================================
// O que vai no estado salvo (localStorage), a versão do formato e a
// migração entre versões (roadmap 3.1).
// Ambiente simulado e ajudantes: environment.js. Rodar a partir da raiz:
//     node tests/logic/saved-state.test.js
// ============================================

const {
    fs, path, vm, ROOT, createEnvironment, tokenOf, test, check, start, finish,
    syncTo, roundScreens, unavailable, roomToReload, reloadHost, tryReloadHost, recordScreens,
    savedStateV1, savedStateV2, finalRankingV2, oldNamesIn, oldPlayerNamesIn,
    savedStateV3, oldAdvisoryNamesIn
} = require('./environment');

start('Estado salvo');

/** Mesmos campos e valores, em qualquer ordem. */
function sameFields(a, b) {
    return JSON.stringify(Object.entries(a).sort()) === JSON.stringify(Object.entries(b).sort());
}

test('T57 Estado salvo leva "rodada encerrada" e a pausa (com o evento); estado salvo antigo restaura sem eles', (use) => {
    const env = use(createEnvironment());
    roomToReload(env);
    env.join('A', 'peer-a');
    env.startMatch();
    env.state.roundEnded = true;
    env.state.matchPaused = { event: { id: 'e-x', title: 'Evento X' } };
    env.Game.saveState();
    const saved = JSON.parse(env.storage['pmKPI_roomState']);
    check(saved.roundEnded === true, 'o estado salvo deveria ter roundEnded');
    check(saved.matchPaused && saved.matchPaused.event && saved.matchPaused.event.id === 'e-x', 'o estado salvo deveria ter a pausa com o evento');

    const reloaded = use(reloadHost(env));
    check(reloaded.state.roundEnded === true, 'roundEnded deveria ser restaurado');
    check(reloaded.state.matchPaused && reloaded.state.matchPaused.event.id === 'e-x', 'a pausa deveria ser restaurada com o evento');

    // Sem rodada encerrada e sem pausa: restaura zerado.
    env.state.roundEnded = false;
    env.state.matchPaused = null;
    env.Game.saveState();
    const reloaded2 = use(reloadHost(env));
    check(reloaded2.state.roundEnded === false && reloaded2.state.matchPaused === null, 'sem pausa nem rodada encerrada, restaura zerado');

    // Estado salvo por uma versão anterior (sem os campos): restaura como antes.
    const old = JSON.parse(env.storage['pmKPI_roomState']);
    delete old.roundEnded;
    delete old.matchPaused;
    env.storage['pmKPI_roomState'] = JSON.stringify(old);
    const reloaded3 = use(reloadHost(env));
    check(reloaded3.state.roundEnded === false && reloaded3.state.matchPaused === null, 'estado salvo antigo: sem pausa e sem rodada encerrada');
    check(reloaded3.state.gameStarted === true && reloaded3.state.players.length === 2, 'o resto do estado continua sendo restaurado');
});

test('T62 Estado salvo tem versão: sem versão restaura como hoje; versão mais nova é guardada sem restaurar; inválida é apagada', (use) => {
    const env = use(createEnvironment());
    roomToReload(env);
    env.join('A', 'peer-a');
    env.startMatch();
    env.Game.saveState();
    const current = env.Game.persistence.STATE_VERSION;
    const saved = JSON.parse(env.storage['pmKPI_roomState']);
    check(saved.stateVersion === current, 'o estado salvo deveria ter stateVersion: ' + current + ', veio: ' + JSON.stringify(saved.stateVersion));
    const myData = env.storage['pmKPI_myData'];

    // Sem versão (salvo antes do 3.1): é o formato da versão 1 — migra,
    // restaura e, ao salvar, ganha a versão atual.
    const noVersion = savedStateV1().roomState;
    delete noVersion.stateVersion;
    env.storage['pmKPI_roomState'] = JSON.stringify(noVersion);
    const reloaded = use(reloadHost(env));
    check(reloaded.state.gameStarted === true && reloaded.state.players.length === 2 &&
        reloaded.state.currentRound && reloaded.state.currentRound.question && reloaded.state.currentRound.question.id === 'q7',
        'estado sem versão deveria ser migrado da versão 1 e restaurado');
    reloaded.Game.saveState();
    check(JSON.parse(env.storage['pmKPI_roomState']).stateVersion === current, 'ao salvar de novo, o estado deveria passar a ter a versão atual (' + current + ')');

    // Gravado com o nome provisório do campo (`version`, só no 4ac5ac8): conta como sem versão.
    env.storage['pmKPI_roomState'] = JSON.stringify({ ...noVersion, version: 1 });
    const provisional = use(reloadHost(env));
    check(provisional.state.gameStarted === true && provisional.state.players.length === 2 &&
        provisional.state.currentRound && provisional.state.currentRound.question,
        'estado com o campo `version` deveria ser migrado da versão 1 e restaurado');

    // Versão mais nova que o código: não restaura e continua guardado.
    const newer = JSON.stringify({ ...saved, stateVersion: current + 1 });
    env.storage['pmKPI_roomState'] = newer;
    env.storage['pmKPI_myData'] = myData;
    const t1 = tryReloadHost(env);
    use(t1.reloaded);
    check(t1.restored === false, 'versão mais nova não deveria ser restaurada');
    check(t1.reloaded.state.gameStarted === false && t1.reloaded.state.players.length === 0, 'nada do estado mais novo deveria ser copiado');
    check(env.storage['pmKPI_roomState'] === newer && env.storage['pmKPI_myData'] === myData,
        'o estado de versão mais nova deveria continuar guardado (a versão nova do código ainda o usa)');

    // Versão inválida: tratada como estado corrompido (apagado).
    for (const version of ['x', '1', 0, -1, 1.5, null]) {
        env.storage['pmKPI_roomState'] = JSON.stringify({ ...saved, stateVersion: version });
        env.storage['pmKPI_myData'] = myData;
        const t = tryReloadHost(env);
        use(t.reloaded);
        check(t.restored === false, 'versão ' + JSON.stringify(version) + ' não deveria ser restaurada');
        check(!('pmKPI_roomState' in env.storage) && !('pmKPI_myData' in env.storage),
            'versão ' + JSON.stringify(version) + ' deveria ser apagada, como estado corrompido');
    }
});

test('T63 Migração do estado salvo: passos em ordem até a versão atual, e a restauração usa o resultado', (use) => {
    const env = use(createEnvironment());
    const P = env.Game.persistence;
    check(typeof P.migrateSavedState === 'function', 'Game.persistence.migrateSavedState deveria existir');
    check(Number.isInteger(P.STATE_VERSION) && P.STATE_VERSION >= 2, 'a versão atual do estado salvo deveria ser um inteiro >= 2, veio: ' + P.STATE_VERSION);

    // Cadeia de mentira 1 → 2 → 3: cada passo recebe o resultado do anterior.
    const order = [];
    const migrations = {
        1: (roomState, myData) => { order.push(1); const { baralhos, ...rest } = roomState; return { roomState: { ...rest, decks: baralhos }, myData: { ...myData, points: myData.kpi } }; },
        2: (roomState, myData) => { order.push(2); return { roomState: { ...roomState, decksV3: roomState.decks }, myData }; }
    };
    const r = P.migrateSavedState({ stateVersion: 1, baralhos: { d1: 'x' } }, { kpi: 5 }, 3, migrations);
    check(order.join(',') === '1,2', 'deveria rodar os passos 1 e 2, nessa ordem, rodou: ' + order.join(','));
    check(r.roomState.stateVersion === 3, 'o resultado deveria estar na versão 3, veio: ' + r.roomState.stateVersion);
    check(r.roomState.decksV3 && r.roomState.decksV3.d1 === 'x' && !('baralhos' in r.roomState), 'o passo 2 deveria receber o resultado do passo 1');
    check(r.myData.points === 5, 'os dados do próprio jogador também passam pelos passos');

    // A partir da versão 2: só o passo 2. Sem versão conta como 1.
    order.length = 0;
    P.migrateSavedState({ stateVersion: 2, decks: {} }, {}, 3, migrations);
    check(order.join(',') === '2', 'da versão 2 deveria rodar só o passo 2, rodou: ' + order.join(','));
    order.length = 0;
    const r2 = P.migrateSavedState({ baralhos: {} }, { kpi: 1 }, 2, migrations);
    check(order.join(',') === '1' && r2.roomState.stateVersion === 2, 'sem versão deveria contar como 1 e rodar só o passo 1');

    // Já na versão final: nada muda.
    order.length = 0;
    const r3 = P.migrateSavedState({ stateVersion: 3, a: 1 }, { kpi: 2 }, 3, migrations);
    check(order.length === 0 && r3.roomState.a === 1 && r3.myData.kpi === 2, 'na versão final, nenhum passo deveria rodar');

    // Passo faltando: erro (vira estado corrompido na restauração).
    let error = null;
    try { P.migrateSavedState({ stateVersion: 1 }, {}, 3, { 1: migrations[1] }); } catch (e) { error = e; }
    check(error, 'faltando o passo 2, a migração deveria dar erro');

    // Tabela real: na versão atual, nada muda (os passos estão no T78 e no T81).
    const r4 = P.migrateSavedState({ stateVersion: P.STATE_VERSION, roomName: 'sala' }, { kpi: 3 });
    check(r4.roomState.roomName === 'sala' && r4.roomState.stateVersion === P.STATE_VERSION && r4.myData.kpi === 3, 'na versão atual, a tabela real não muda nada');

    // A restauração usa o resultado da migração (antes de conferir sala e jogador).
    roomToReload(env);
    env.join('A', 'peer-a');
    env.startMatch();
    env.Game.saveState();
    const saved = JSON.parse(env.storage['pmKPI_roomState']);
    const mine = JSON.parse(env.storage['pmKPI_myData']);
    const { roomName, ...withoutName } = saved;
    env.storage['pmKPI_roomState'] = JSON.stringify({ ...withoutName, oldRoomName: roomName });
    env.storage['pmKPI_myData'] = JSON.stringify({ ...mine, kpi: undefined, points: 42 });
    const { reloaded, restored } = (() => {
        // Ambiente novo com a migração trocada por uma que desfaz o nome trocado.
        const n = createEnvironment({ storage: env.storage });
        n.Game.persistence.migrateSavedState = (roomState, myData) => {
            const { oldRoomName, ...rest } = roomState;
            const { points, ...myRest } = myData;
            return { roomState: { ...rest, roomName: oldRoomName }, myData: { ...myRest, kpi: points } };
        };
        n.ctx.location.search = '?' + new URLSearchParams({ host: 'true', room: 'sala', playerName: 'Host', peerId: 'sala' }).toString();
        Object.assign(n.state, { isHost: true, roomName: 'sala', playerName: 'Host', hostPeerId: 'sala', baseRoomPeerId: 'sala', hostVersion: 0 });
        return { reloaded: n, restored: n.Game.persistence.tryRestoreState() };
    })();
    use(reloaded);
    check(restored === true, 'com a migração trazendo o nome da sala de volta, o estado deveria ser restaurado');
    check(reloaded.state.roomName === 'sala' && reloaded.state.players.length === 2, 'a restauração deveria usar a sala migrada');
    check(reloaded.player('Host').kpi === 42, 'os dados do próprio jogador deveriam vir da migração');
});

test('T78 Estado salvo 1 → 2: rodada, baralhos, rodízio, pausa e ranking final passam para os nomes novos, com os mesmos valores', (use) => {
    const env = use(createEnvironment());
    const P = env.Game.persistence;
    check(Number.isInteger(P.STATE_VERSION) && P.STATE_VERSION >= 2, 'a versão atual do estado salvo deveria ser um inteiro >= 2, veio: ' + P.STATE_VERSION);

    // Só o passo 1 → 2 (alvo 2 nas migrações abaixo): o passo seguinte é do T81.
    // Versão 1 com todos os campos preenchidos (pergunta como o Perguntador
    // guest a guarda, com resposta esperando o assessor).
    const v1 = savedStateV1({
        usedRespondedorThisRound: ['B'],
        rodadaEncerrada: true,
        partidaPausada: { evento: { id: 'e-pausa', titulo: 'Evento da pausa' } },
        rankingFinal: [{ posicao: 1, name: 'Host', kpiFinal: 30 }]
    });
    const round = v1.roomState.currentRound;
    round.pergunta = { ...round.pergunta, type: 'question', isPerguntador: true };
    round.assessoria = { assessorName: 'B', status: 'pending', sugestao: null };
    round.pendingAnswer = { type: 'answer', alternativa: 'b', playerName: 'A' };
    const input = JSON.parse(JSON.stringify(v1));

    const r = P.migrateSavedState(v1.roomState, v1.myData, 2);
    const s = r.roomState;
    check(s.stateVersion === 2, 'o estado migrado deveria estar na versão 2, veio: ' + s.stateVersion);
    const found = oldNamesIn(r);
    check(found.length === 0, 'nenhum nome antigo deveria sobrar, sobraram: ' + found.join(', '));

    check(JSON.stringify(s.answeredThisRound) === '["B"]', 'usedRespondedorThisRound → answeredThisRound, veio: ' + JSON.stringify(s.answeredThisRound));
    check(s.roundEnded === true, 'rodadaEncerrada → roundEnded');
    check(s.matchPaused && s.matchPaused.event && s.matchPaused.event.id === 'e-pausa' && s.matchPaused.event.titulo === 'Evento da pausa',
        'partidaPausada { evento } → matchPaused { event }, veio: ' + JSON.stringify(s.matchPaused));
    check(JSON.stringify(s.finalRanking) === JSON.stringify(input.roomState.rankingFinal), 'rankingFinal → finalRanking, com o mesmo ranking');

    const deck = s.decks && s.decks.d1;
    check(deck && deck.available === 1 && deck.total === 2 && Array.isArray(deck.questions) && deck.questions.length === 2,
        'baralhos { perguntas, disponiveis } → decks { questions, available }, veio: ' + JSON.stringify(s.decks));
    check(deck.questions[0].used === true && deck.questions[1].used === false &&
        deck.questions[0].id === 'q7' && deck.questions[0].correct === 'b' && deck.questions[1].question === 'Outra pergunta?',
        'cada pergunta do baralho: usada → used, com o resto igual');

    const cr = s.currentRound;
    check(cr && cr.asker === 'Host' && cr.answerer === 'A' && cr.answered === false && cr.event && cr.event.id === 'e-salvo',
        'rodada: evento/perguntador/respondedor/respondeu → event/asker/answerer/answered, veio: ' + JSON.stringify(cr));
    check(cr.question && cr.question.id === 'q7' && cr.question.correct === 'b' && cr.question.used === true && cr.question.isAsker === true &&
        cr.question.domain === 'Domínio de teste' && cr.question.area === 'Iniciação' && cr.question.domain_key === 'd1',
        'pergunta da rodada: pergunta → question, usada → used, isPerguntador → isAsker, com o resto igual, veio: ' + JSON.stringify(cr.question));
    check(cr.pendingAnswer && cr.pendingAnswer.alternative === 'b' && cr.pendingAnswer.playerName === 'A' && cr.pendingAnswer.type === 'answer',
        'resposta guardada: alternativa → alternative, veio: ' + JSON.stringify(cr.pendingAnswer));
    check(JSON.stringify(cr.assessoria) === JSON.stringify(input.roomState.currentRound.assessoria), 'a assessoria da rodada não muda nesta versão');

    // O resto não muda: jogadores (com os próprios campos), sala, relógio, dados do jogador.
    for (const key of ['players', 'roomName', 'hostPeerId', 'backupPeerId', 'baseRoomPeerId', 'hostVersion', 'timer', 'gameStarted', 'gameOver', 'timestamp']) {
        check(JSON.stringify(s[key]) === JSON.stringify(input.roomState[key]), key + ' não deveria mudar, veio: ' + JSON.stringify(s[key]));
    }
    check(JSON.stringify(r.myData) === JSON.stringify(input.myData), 'pmKPI_myData não muda nesta versão');

    // Pergunta como o Respondedor guest a guarda: isRespondedor → isAnswerer.
    const answererCopy = savedStateV1();
    answererCopy.roomState.currentRound.pergunta = { ...answererCopy.roomState.currentRound.pergunta, correct: undefined, isRespondedor: true };
    const ra = P.migrateSavedState(answererCopy.roomState, answererCopy.myData, 2).roomState;
    check(ra.currentRound.question && ra.currentRound.question.isAnswerer === true && oldNamesIn(ra).length === 0,
        'isRespondedor → isAnswerer, veio: ' + JSON.stringify(ra.currentRound.question));

    // Campos vazios continuam vazios; estado antigo sem os campos não ganha nomes antigos.
    const empty = P.migrateSavedState(savedStateV1({ currentRound: null, baralhos: {}, partidaPausada: null, rankingFinal: null }).roomState, {}, 2).roomState;
    check(empty.currentRound === null && empty.matchPaused === null && empty.finalRanking === null &&
        JSON.stringify(empty.decks) === '{}' && oldNamesIn(empty).length === 0,
        'rodada, pausa e ranking vazios continuam vazios, com os nomes novos, veio: ' + JSON.stringify(empty));
    const bare = P.migrateSavedState({ stateVersion: 1, roomName: 'sala' }, {}, 2).roomState;
    check(bare.roomName === 'sala' && bare.stateVersion === 2 && oldNamesIn(bare).length === 0,
        'estado da versão 1 sem os campos da rodada deveria migrar sem erro');
});

test('T81 Estado salvo 2 → 3: recursos e área foco dos jogadores e os campos do ranking final passam para os nomes novos, com os mesmos valores', (use) => {
    const env = use(createEnvironment());
    const P = env.Game.persistence;
    check(Number.isInteger(P.STATE_VERSION) && P.STATE_VERSION >= 3, 'a versão atual do estado salvo deveria ser um inteiro >= 3, veio: ' + P.STATE_VERSION);

    // Só o passo 2 → 3 (alvo 3 nas migrações abaixo): o passo seguinte é do T84.
    // Versão 2 com o ranking final preenchido e um jogador desconectado
    // (com o hash do token), para conferir que os outros campos ficam.
    const v2 = savedStateV2({ finalRanking: finalRankingV2() });
    Object.assign(v2.roomState.players[1], { disconnected: true, tokenHash: 'hash-de-a' });
    const input = JSON.parse(JSON.stringify(v2));

    const r = P.migrateSavedState(v2.roomState, v2.myData, 3);
    const s = r.roomState;
    check(s.stateVersion === 3, 'o estado migrado deveria estar na versão 3, veio: ' + s.stateVersion);
    const found = oldPlayerNamesIn(r);
    check(found.length === 0, 'nenhum nome antigo deveria sobrar, sobraram: ' + found.join(', '));

    check(Array.isArray(s.players) && s.players.length === 2, 'os dois jogadores deveriam continuar, veio: ' + JSON.stringify(s.players));
    s.players.forEach((p, i) => {
        const { recursos, phase, ...rest } = input.roomState.players[i];
        check(sameFields(p, { ...rest, resources: recursos, focusArea: phase }),
            'jogador ' + rest.name + ': recursos → resources e phase → focusArea, com o resto igual, veio: ' + JSON.stringify(p));
    });

    check(Array.isArray(s.finalRanking) && s.finalRanking.length === 2, 'o ranking final deveria continuar, veio: ' + JSON.stringify(s.finalRanking));
    s.finalRanking.forEach((p, i) => {
        const { posicao, kpiFinal, recursos, phase, ...rest } = input.roomState.finalRanking[i];
        check(sameFields(p, { ...rest, position: posicao, finalKpi: kpiFinal, resources: recursos, focusArea: phase }),
            'ranking (' + rest.name + '): posicao → position, kpiFinal → finalKpi, recursos → resources, phase → focusArea, com o resto igual, veio: ' + JSON.stringify(p));
    });

    const { phase, ...myRest } = input.myData;
    check(sameFields(r.myData, { ...myRest, focusArea: phase }),
        'pmKPI_myData: phase → focusArea, com o resto igual, veio: ' + JSON.stringify(r.myData));

    // O resto não muda: rodada, baralhos, sala, relógio...
    for (const key of Object.keys(input.roomState).filter(k => !['players', 'finalRanking', 'stateVersion'].includes(k))) {
        check(JSON.stringify(s[key]) === JSON.stringify(input.roomState[key]), key + ' não deveria mudar, veio: ' + JSON.stringify(s[key]));
    }
    check(Object.keys(s).length === Object.keys(input.roomState).length,
        'nenhum campo do estado deveria ser criado nem perdido, veio: ' + Object.keys(s).join(', '));

    // Ranking vazio continua vazio; jogador e dados sem os campos não ganham campos.
    const empty = P.migrateSavedState(savedStateV2({ players: [{ name: 'X' }], finalRanking: null }).roomState, { playerName: 'X' }, 3);
    check(empty.roomState.finalRanking === null && sameFields(empty.roomState.players[0], { name: 'X' }) && sameFields(empty.myData, { playerName: 'X' }),
        'ranking vazio e jogador sem os campos deveriam continuar como estão, veio: ' + JSON.stringify(empty));
    const bare = P.migrateSavedState({ stateVersion: 2, roomName: 'sala' }, {}, 3);
    check(bare.roomState.roomName === 'sala' && bare.roomState.stateVersion === 3 && !('players' in bare.roomState) && !('finalRanking' in bare.roomState),
        'estado da versão 2 sem jogadores nem ranking deveria migrar sem erro, veio: ' + JSON.stringify(bare.roomState));

    // Da versão 1 até a 3: os dois passos, sem nenhum nome antigo.
    const v1 = savedStateV1({ rankingFinal: finalRankingV2() });
    const all = P.migrateSavedState(v1.roomState, v1.myData, 3);
    const leftovers = [...oldNamesIn(all), ...oldPlayerNamesIn(all)];
    check(all.roomState.stateVersion === 3 && leftovers.length === 0,
        'da versão 1, deveria chegar à 3 sem nomes antigos, sobraram: ' + leftovers.join(', '));
    check(all.roomState.players[0].resources === 9 && all.roomState.players[0].focusArea === 'iniciacao' &&
        all.roomState.finalRanking[1].finalKpi === 24 && all.roomState.finalRanking[1].position === 2 && all.myData.focusArea === 'iniciacao',
        'da versão 1, os valores deveriam chegar iguais, veio: ' + JSON.stringify({ players: all.roomState.players, myData: all.myData }));
});

test('T84 Estado salvo 3 → 4: a assessoria da rodada passa para os nomes novos (advisory, advisorName, suggestion), com os mesmos valores', (use) => {
    const env = use(createEnvironment());
    const P = env.Game.persistence;
    check(Number.isInteger(P.STATE_VERSION) && P.STATE_VERSION >= 4, 'a versão atual do estado salvo deveria ser um inteiro >= 4, veio: ' + P.STATE_VERSION);

    // Só o passo 3 → 4 (alvo 4). Assessoria pendente (com a resposta
    // guardada esperando o assessor), aceita com a sugestão e recusada.
    const cases = [
        { assessorName: 'B', status: 'pending', sugestao: null },
        { assessorName: 'B', status: 'accepted', sugestao: 'c' },
        { assessorName: 'B', status: 'declined', sugestao: null }
    ];
    for (const advisory of cases) {
        const v3 = savedStateV3();
        v3.roomState.currentRound.assessoria = advisory;
        if (advisory.status === 'pending') v3.roomState.currentRound.pendingAnswer = { type: 'answer', alternative: 'b', playerName: 'A' };
        const input = JSON.parse(JSON.stringify(v3));

        const r = P.migrateSavedState(v3.roomState, v3.myData, 4);
        const s = r.roomState;
        const where = ' (assessoria ' + advisory.status + ')';
        check(s.stateVersion === 4, 'o estado migrado deveria estar na versão 4' + where + ', veio: ' + s.stateVersion);
        const found = oldAdvisoryNamesIn(r);
        check(found.length === 0, 'nenhum nome antigo deveria sobrar' + where + ', sobraram: ' + found.join(', '));

        const { assessoria, ...roundRest } = input.roomState.currentRound;
        const cr = s.currentRound;
        check(cr && sameFields(cr.advisory || {}, { advisorName: assessoria.assessorName, status: assessoria.status, suggestion: assessoria.sugestao }),
            'assessoria → advisory, assessorName → advisorName, sugestao → suggestion, com o status igual' + where + ', veio: ' + JSON.stringify(cr && cr.advisory));
        const { advisory: migrated, ...crRest } = cr;
        check(sameFields(crRest, roundRest), 'o resto da rodada não deveria mudar' + where + ', veio: ' + JSON.stringify(crRest));

        // O resto não muda: jogadores, baralhos, sala, relógio, dados do jogador.
        for (const key of Object.keys(input.roomState).filter(k => !['currentRound', 'stateVersion'].includes(k))) {
            check(JSON.stringify(s[key]) === JSON.stringify(input.roomState[key]), key + ' não deveria mudar' + where + ', veio: ' + JSON.stringify(s[key]));
        }
        check(Object.keys(s).length === Object.keys(input.roomState).length,
            'nenhum campo do estado deveria ser criado nem perdido' + where + ', veio: ' + Object.keys(s).join(', '));
        check(JSON.stringify(r.myData) === JSON.stringify(input.myData), 'pmKPI_myData não muda nesta versão' + where);
    }

    // Assessoria cancelada (null) continua null; rodada sem assessoria não ganha o campo.
    const cancelled = savedStateV3();
    cancelled.roomState.currentRound.assessoria = null;
    const rc = P.migrateSavedState(cancelled.roomState, cancelled.myData, 4).roomState.currentRound;
    check(rc.advisory === null && !('assessoria' in rc), 'assessoria cancelada (null) deveria virar advisory: null, veio: ' + JSON.stringify(rc));
    const none = savedStateV3();
    delete none.roomState.currentRound.assessoria;
    const rn = P.migrateSavedState(none.roomState, none.myData, 4).roomState.currentRound;
    check(!('advisory' in rn) && !('assessoria' in rn), 'rodada sem assessoria não deveria ganhar o campo, veio: ' + JSON.stringify(rn));
    const noRound = P.migrateSavedState(savedStateV3({ currentRound: null }).roomState, {}, 4).roomState;
    check(noRound.currentRound === null && noRound.stateVersion === 4, 'sem rodada, continua sem rodada');
    const bare = P.migrateSavedState({ stateVersion: 3, roomName: 'sala' }, {}, 4);
    check(bare.roomState.roomName === 'sala' && bare.roomState.stateVersion === 4 && !('currentRound' in bare.roomState),
        'estado da versão 3 sem rodada deveria migrar sem erro, veio: ' + JSON.stringify(bare.roomState));

    // Da versão 1 até a atual: todos os passos, sem nenhum nome antigo.
    const v1 = savedStateV1({ rankingFinal: finalRankingV2() });
    v1.roomState.currentRound.assessoria = { assessorName: 'A', status: 'accepted', sugestao: 'b' };
    const all = P.migrateSavedState(v1.roomState, v1.myData);
    const leftovers = [...oldNamesIn(all), ...oldPlayerNamesIn(all), ...oldAdvisoryNamesIn(all)];
    check(all.roomState.stateVersion === P.STATE_VERSION && leftovers.length === 0,
        'da versão 1, deveria chegar à atual (' + P.STATE_VERSION + ') sem nomes antigos, sobraram: ' + leftovers.join(', '));
    const adv = all.roomState.currentRound.advisory;
    check(adv && adv.advisorName === 'A' && adv.status === 'accepted' && adv.suggestion === 'b' && all.roomState.currentRound.answerer === 'A',
        'da versão 1, a assessoria deveria chegar com os mesmos valores, veio: ' + JSON.stringify(all.roomState.currentRound));
});

finish('Estado salvo');
