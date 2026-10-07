// ============================================
// PM: The KPI Master - Testes de lógica: Economia de recursos
// ============================================
// Recursos como orçamento do projeto: o erro gasta recurso sem piso
// (estouro de orçamento), o Corte de Orçamento também, e o KPI Final e
// o ranking descontam o estouro. As telas mostram o recurso negativo.
// O Patrocinador Generoso e a Reestruturação olham as atividades
// concluídas, e o aviso do evento diz quem foi atingido.
// Ambiente simulado e ajudantes: environment.js. Rodar a partir da raiz:
//     node tests/logic/economy.test.js
// ============================================

const {
    fs, path, vm, ROOT, createEnvironment, recordScreens, test, check, start, finish
} = require('./environment');

start('Economia de recursos');

/** Uma alternativa errada para a pergunta da rodada. */
const wrongFor = (round) => ['A', 'B', 'C', 'D'].find(x => x !== round.question.correct);

/** Partida com 4 jogadores e tempo falso (a próxima dupla vem com time.advance(3000)). */
function matchWithFourPlayers(use) {
    const env = use(createEnvironment());
    const time = env.fakeTime();
    env.createRoomAsHost();
    env.join('A', 'peer-a');
    env.join('B', 'peer-b');
    env.join('C', 'peer-c');
    env.startMatch();
    return { env, time };
}

/** Próxima pergunta da mesma rodada, com outro Respondedor. */
function nextQuestion(env, time, previousAnswerer) {
    time.advance(3000);
    const round = env.state.currentRound;
    check(round && !round.answered && round.answerer !== previousAnswerer,
        'pré-condição: próxima pergunta, com outro Respondedor, veio: ' + JSON.stringify(round && { answerer: round.answerer, answered: round.answered }));
    return round;
}

/** Último kpi-update mandado aos guests sobre um jogador. */
const lastUpdateOf = (env, name) => env.broadcastsOfType('kpi-update').filter(m => m.playerName === name).pop();

/** Cópia simples (tira o objeto do contexto vm); undefined continua undefined. */
const copy = (x) => (x === undefined ? undefined : JSON.parse(JSON.stringify(x)));

/** Um evento do data/events.json real, copiado. */
function eventById(id) {
    const json = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/events.json'), 'utf8'));
    return copy(json.events.find(e => e.id === id));
}

/**
 * Regras reais de evento (domain/eventRules.js) com o CONFIG real, num
 * contexto próprio. `player(name, areaIndex, activities, resources)`
 * monta um jogador na área foco de índice `areaIndex`.
 */
function realEventRules() {
    const ctx = vm.createContext({});
    vm.runInContext('var window = this;' + fs.readFileSync(path.join(ROOT, 'config/game-config.js'), 'utf8'), ctx);
    vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/domain/eventRules.js'), 'utf8'), ctx);
    const C = vm.runInContext('CONFIG', ctx);
    return {
        rules: ctx.Game.domain.event,
        C,
        setRandom: (value) => vm.runInContext('Math.random = () => ' + value, ctx),
        player: (name, areaIndex, activities, resources) => ({ name, focusArea: C.FOCUS_AREAS[areaIndex].id, activities, resources })
    };
}

/** Recursos dos jogadores, "P:1,Q:2", para comparar e mostrar na mensagem. */
const resourcesOf = (players) => players.map(p => p.name + ':' + p.resources).join(',');

test('T107 Estouro de orçamento: errar com 0 recursos vai a −1 e com −1 vai a −2; acertar no estouro não mexe nos recursos', (use) => {
    const { env, time } = matchWithFourPlayers(use);

    // 1) Errou com 0: fica com −1, e os guests recebem o −1.
    const round1 = env.state.currentRound;
    const first = round1.answerer;
    env.player(first).resources = 0;
    env.Game.core.handleAnswer({ type: 'answer', alternative: wrongFor(round1), playerName: first });
    check(env.player(first).resources === -1, 'errar com 0 recursos deveria deixar em −1 (estouro), veio: ' + env.player(first).resources);
    const update1 = lastUpdateOf(env, first);
    check(update1 && update1.resources === -1 && update1.isCorrect === false,
        'o kpi-update deveria levar o recurso negativo (−1), veio: ' + JSON.stringify(update1));

    // 2) Errou com −1: aprofunda o estouro para −2.
    const round2 = nextQuestion(env, time, first);
    const second = round2.answerer;
    env.player(second).resources = -1;
    env.Game.core.handleAnswer({ type: 'answer', alternative: wrongFor(round2), playerName: second });
    check(env.player(second).resources === -2, 'errar com −1 deveria deixar em −2, veio: ' + env.player(second).resources);
    check(lastUpdateOf(env, second) && lastUpdateOf(env, second).resources === -2,
        'o kpi-update deveria levar −2, veio: ' + JSON.stringify(lastUpdateOf(env, second)));

    // 3) Acertou no estouro: ganha o KPI e a atividade, e o recurso não muda.
    const round3 = nextQuestion(env, time, second);
    const third = round3.answerer;
    Object.assign(env.player(third), { resources: -2, kpi: 0, activities: 0 });
    env.Game.core.handleAnswer({ type: 'answer', alternative: round3.question.correct, playerName: third });
    check(env.player(third).resources === -2 && env.player(third).kpi === env.CONFIG.KPI.CORRECT_ANSWER && env.player(third).activities === 1,
        'acertar no estouro: +' + env.CONFIG.KPI.CORRECT_ANSWER + ' KPI, +1 atividade e o recurso continua −2, veio: ' +
        JSON.stringify({ resources: env.player(third).resources, kpi: env.player(third).kpi, activities: env.player(third).activities }));

    // 4) O estado salvo guarda o negativo (um F5 do host não "conserta" o estouro).
    env.Game.saveState();
    const saved = JSON.parse(env.storage['pmKPI_roomState']);
    const savedFirst = saved.players.find(p => p.name === first);
    check(savedFirst && savedFirst.resources === -1, 'o estado salvo deveria guardar −1, veio: ' + JSON.stringify(savedFirst));
});

test('T108 Reserva de Contingência protege o erro também no estouro (com 0 e com −1, o recurso não muda)', (use) => {
    const { env, time } = matchWithFourPlayers(use);
    const reserve = { id: 'e4', title: 'Reserva de Contingência', contingencyReserve: true };

    const round1 = env.state.currentRound;
    round1.event = reserve;
    const first = round1.answerer;
    env.player(first).resources = -1;
    env.Game.core.handleAnswer({ type: 'answer', alternative: wrongFor(round1), playerName: first });
    check(env.player(first).resources === -1, 'com a reserva, errar com −1 deveria continuar em −1, veio: ' + env.player(first).resources);
    check(lastUpdateOf(env, first) && lastUpdateOf(env, first).resources === -1,
        'o kpi-update deveria levar −1, veio: ' + JSON.stringify(lastUpdateOf(env, first)));

    const round2 = nextQuestion(env, time, first);
    round2.event = reserve;
    const second = round2.answerer;
    env.player(second).resources = 0;
    env.Game.core.handleAnswer({ type: 'answer', alternative: wrongFor(round2), playerName: second });
    check(env.player(second).resources === 0, 'com a reserva, errar com 0 deveria continuar em 0, veio: ' + env.player(second).resources);
});

test('T109 Corte de Orçamento sem piso: leva quem tem 0 ao estouro e aprofunda quem já está; Apoio da Alta Gestão soma a partir do negativo', (use) => {
    const json = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/events.json'), 'utf8'));
    const byId = (id) => JSON.parse(JSON.stringify(json.events.find(e => e.id === id)));
    check(byId('e2').resourcesForAll === -1 && byId('e1').resourcesForAll === 1, 'pré-condição: e2 = Corte (−1) e e1 = Apoio (+1) no events.json');

    // 1) Regra pura (domain/eventRules.js real) com os eventos do events.json.
    const eventCtx = vm.createContext({});
    vm.runInContext('var window = this;', eventCtx);
    const eventRulesSource = fs.readFileSync(path.join(ROOT, 'js/domain/eventRules.js'), 'utf8');
    vm.runInContext(eventRulesSource, eventCtx);
    const rules = eventCtx.Game.domain.event;
    const ps = [{ name: 'X', resources: 0 }, { name: 'Y', resources: -1 }, { name: 'Z', resources: 2 }];
    rules.applyEventEffects(byId('e2'), ps);
    check(ps.map(p => p.resources).join() === '-1,-2,1', 'o Corte deveria tirar 1 de todos, sem piso (−1, −2, 1), veio: ' + ps.map(p => p.resources).join());
    rules.applyEventEffects(byId('e1'), ps);
    check(ps.map(p => p.resources).join() === '0,-1,2', 'o Apoio deveria somar 1 a partir do negativo (0, −1, 2), veio: ' + ps.map(p => p.resources).join());

    // 2) Na partida: o host aplica o Corte no início da rodada e os guests
    // recebem os recursos negativos no show-event.
    const env = use(createEnvironment());
    vm.runInContext(eventRulesSource, env.ctx);
    env.Game.domain.event.drawEvent = () => byId('e2');
    env.createRoomAsHost();
    env.join('A', 'peer-a');
    env.join('B', 'peer-b');
    env.player('Host').resources = 0;
    env.player('A').resources = -1;
    env.player('B').resources = 2;
    env.startMatch();
    const after = ['Host', 'A', 'B'].map(n => env.player(n).resources).join();
    check(after === '-1,-2,1', 'o Corte no início da rodada deveria deixar Host −1, A −2 e B 1, veio: ' + after);
    const shown = env.broadcastsOfType('show-event')[0];
    const sent = shown && ['Host', 'A', 'B'].map(n => (shown.players.find(p => p.name === n) || {}).resources).join();
    check(sent === '-1,-2,1', 'o show-event deveria levar os recursos negativos aos guests, veio: ' + sent);
});

test('T110 KPI Final e ranking descontam o estouro; as telas mostram o recurso negativo em destaque', (use) => {
    // 1) Regra pura (domain/rankingRules.js real, config real).
    const rankCtx = vm.createContext({});
    vm.runInContext('var window = this;' + fs.readFileSync(path.join(ROOT, 'config/game-config.js'), 'utf8'), rankCtx);
    vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/domain/rankingRules.js'), 'utf8'), rankCtx);
    const C = vm.runInContext('CONFIG', rankCtx);
    const v = C.KPI.FINAL_RESOURCE_VALUE;
    const first = C.FOCUS_AREAS[0].id;
    const player = (name, kpi, resources) => ({ name, kpi, resources, focusArea: first, activities: 0, isHost: false, waitingInLobby: false });
    const ranking = JSON.parse(JSON.stringify(rankCtx.Game.domain.ranking.buildRanking(
        [player('P', 30, -2), player('Q', 20, 1), player('R', 10, 0)], C)));
    check(ranking.map(p => p.name).join() === 'Q,P,R' && ranking.map(p => p.position).join() === '1,2,3',
        'o estouro deveria descontar no KPI Final e mudar a ordem (Q, P, R), veio: ' + JSON.stringify(ranking));
    const p = ranking.find(r => r.name === 'P');
    check(p.finalKpi === 30 - 2 * v && p.resources === -2,
        'KPI Final de P = 30 + (−2 × ' + v + ') = ' + (30 - 2 * v) + ', veio: ' + JSON.stringify(p));

    // 2) Telas reais: card de perfil, lista de jogadores e ranking final.
    const env = use(createEnvironment());
    const elements = {};
    env.ctx.document = {
        getElementById: (id) => elements[id] || (elements[id] = { id, textContent: '', innerHTML: '', className: '', style: {} }),
        querySelectorAll: () => []
    };
    env.Game.i18n.t = (key, values) => key + (values ? ' ' + JSON.stringify(values) : '');
    for (const file of ['js/utils/sanitize.js', 'js/domain/rankingRules.js', 'js/ui/components/profileComponent.js',
        'js/ui/components/rankingComponent.js']) {
        vm.runInContext(fs.readFileSync(path.join(ROOT, file), 'utf8'), env.ctx, { filename: file });
    }
    const area = env.CONFIG.FOCUS_AREAS[0].id;
    const ev = env.CONFIG.KPI.FINAL_RESOURCE_VALUE;
    const hasClass = (el, name) => !!el && String(el.className).split(/\s+/).includes(name);

    // Card de perfil no estouro: número negativo, em destaque, e o rótulo de estouro.
    env.ctx.renderProfileCard({ name: 'Ana', kpi: 5, resources: -1, focusArea: area, activities: 0 });
    check(elements.myResources.textContent === -1, 'o card deveria mostrar −1 em myResources, veio: ' + elements.myResources.textContent);
    check(hasClass(elements.myResources, 'resources-overrun') && hasClass(elements.myResources, 'stat-value'),
        'no estouro, myResources deveria ter as classes stat-value e resources-overrun, veio: "' + elements.myResources.className + '"');
    check(elements.myResourcesLabel && elements.myResourcesLabel.textContent === 'profile.overrunLabel',
        'no estouro, o rótulo (myResourcesLabel) deveria ser o de estouro (profile.overrunLabel), veio: ' + JSON.stringify(elements.myResourcesLabel));
    check(elements.btnRequestHelp && elements.btnRequestHelp.style.display === 'block', 'no estouro, o botão de ajuda continua visível');

    // Voltou a 0: sai o destaque e volta o rótulo normal.
    env.ctx.renderProfileCard({ name: 'Ana', kpi: 5, resources: 0, focusArea: area, activities: 0 });
    check(elements.myResources.textContent === 0 && hasClass(elements.myResources, 'stat-value') && !hasClass(elements.myResources, 'resources-overrun'),
        'com 0 recursos, myResources não deveria ter resources-overrun, veio: "' + elements.myResources.className + '"');
    check(elements.myResourcesLabel.textContent === 'profile.resourcesLabel',
        'com 0 recursos, o rótulo deveria voltar a profile.resourcesLabel, veio: ' + elements.myResourcesLabel.textContent);

    // Lista de jogadores: o negativo aparece, em destaque só para quem está no estouro.
    env.state.players = [
        { name: 'Ana', kpi: 30, resources: -2, focusArea: area, activities: 0, waitingInLobby: false },
        { name: 'Beto', kpi: 10, resources: 3, focusArea: area, activities: 0, waitingInLobby: false },
        { name: 'Caio', kpi: 0, resources: 0, focusArea: area, activities: 0, waitingInLobby: false }
    ];
    env.ctx.updatePlayersOnlineList();
    const rows = elements.playersOnlineList.innerHTML.split('class="online-player"').slice(1);
    const rowOf = (name) => rows.find(r => r.includes('>' + name + '<')) || '';
    check(rowOf('Ana').includes('📦-2') && rowOf('Ana').includes('resources-overrun'),
        'na lista, Ana deveria aparecer com 📦-2 e a classe resources-overrun, veio: ' + rowOf('Ana'));
    check(rowOf('Beto').includes('📦3') && !rowOf('Beto').includes('resources-overrun'),
        'na lista, Beto (3 recursos) não deveria ter resources-overrun, veio: ' + rowOf('Beto'));
    check(rowOf('Caio').includes('📦0') && !rowOf('Caio').includes('resources-overrun'),
        'na lista, Caio (0 recursos) não está em estouro: sem resources-overrun, veio: ' + rowOf('Caio'));

    // Ranking final: a conta do detalhe leva o negativo.
    env.ctx.displayFinalRanking(env.Game.core.buildRanking());
    const final = elements.finalRanking.innerHTML;
    check(final.includes((30 - 2 * ev) + ' ⭐') && final.includes('"resources":-2') && final.includes('"resourcesKpi":' + (-2 * ev)),
        'o ranking final deveria mostrar o KPI Final de Ana (' + (30 - 2 * ev) + ') e o detalhe com −2 recursos = ' + (-2 * ev) + ', veio: ' + final);
});

test('T111 Patrocinador Generoso: +1 para quem concluiu menos atividades; empate → quem tem menos recursos; empate em tudo → todos os empatados', () => {
    const { rules, C, player } = realEventRules();
    const sponsor = eventById('e3');
    check(sponsor && sponsor.resourcesForFewest === 1, 'pré-condição: e3 = Patrocinador Generoso (resourcesForFewest 1) no events.json');

    /** Aplica o Patrocinador e confere os recursos e quem recebeu (effect.receivers). */
    function expectSponsor(label, players, expectedResources, expectedReceivers) {
        const result = rules.applyEventEffects(sponsor, players, C);
        const effect = copy(result && result.effect);
        check(resourcesOf(players) === expectedResources,
            label + ': os recursos deveriam ficar ' + expectedResources + ', veio: ' + resourcesOf(players));
        check(effect && JSON.stringify(effect.receivers) === JSON.stringify(expectedReceivers) &&
            effect.amount === sponsor.resourcesForFewest && effect.giver === undefined,
            label + ': o efeito deveria ter receivers ' + JSON.stringify(expectedReceivers) + ' e amount ' + sponsor.resourcesForFewest +
            ', sem giver, veio: ' + JSON.stringify(effect));
    }

    // R concluiu menos atividades e recebe, mesmo sendo quem tem mais recursos.
    expectSponsor('menos atividades', [player('P', 0, 1, 2), player('Q', 1, 0, 0), player('R', 0, 0, 5)], 'P:2,Q:0,R:6', ['R']);
    // Atividades concluídas = índice da área foco × atividades por área + as da área atual:
    // P (2ª área, 0 na área) concluiu mais que Q (1ª área, 1 na área).
    check(C.GAME.ACTIVITIES_PER_FOCUS_AREA > 1, 'pré-condição: mais de 1 atividade por área foco');
    expectSponsor('atividades de áreas anteriores contam', [player('P', 1, 0, 5), player('Q', 0, 1, 5)], 'P:5,Q:6', ['Q']);
    // Empate em atividades: quem tem menos recursos.
    expectSponsor('empate em atividades', [player('P', 0, 0, 3), player('Q', 0, 0, 1), player('R', 1, 1, 0)], 'P:3,Q:2,R:0', ['Q']);
    // Empate em tudo: todos os empatados recebem.
    expectSponsor('empate em tudo', [player('P', 0, 0, 2), player('Q', 0, 0, 2), player('R', 1, 0, 0)], 'P:3,Q:3,R:0', ['P', 'Q']);
    // No estouro: o mais atrás no tabuleiro recebe, não o de menor recurso.
    expectSponsor('no estouro', [player('S', 0, 0, -2), player('T', 0, 1, -3)], 'S:-1,T:-3', ['S']);
});

test('T112 Reestruturação: quem concluiu mais atividades cede 1 a quem concluiu menos; empates por recursos e sorteio; sem efeito se quem cede está sem recursos ou se todos empatam', () => {
    const { rules, C, player, setRandom } = realEventRules();
    const swap = eventById('e5');
    check(swap && swap.resourceSwap === true, 'pré-condição: e5 = Reestruturação (resourceSwap) no events.json');

    /** Aplica a Reestruturação; confere recursos, soma igual e o efeito devolvido. */
    function applySwap(label, players, expectedResources) {
        const before = players.reduce((t, p) => t + p.resources, 0);
        const result = rules.applyEventEffects(swap, players, C);
        const effect = copy(result && result.effect);
        check(resourcesOf(players) === expectedResources,
            label + ': os recursos deveriam ficar ' + expectedResources + ', veio: ' + resourcesOf(players));
        check(players.reduce((t, p) => t + p.resources, 0) === before, label + ': a soma dos recursos não deveria mudar');
        return effect;
    }
    function expectTransfer(label, players, expectedResources, giver, receiver) {
        const effect = applySwap(label, players, expectedResources);
        check(effect && effect.giver === giver && JSON.stringify(effect.receivers) === JSON.stringify([receiver]) &&
            effect.amount === 1 && effect.reason === undefined,
            label + ': o efeito deveria ser giver ' + giver + ', receivers [' + receiver + '], amount 1, sem reason, veio: ' + JSON.stringify(effect));
    }

    setRandom(0.5);
    // Mais atividades (P, com poucos recursos) cede a quem tem menos atividades (R, com mais recursos).
    expectTransfer('mais → menos atividades', [player('P', 1, 1, 1), player('Q', 0, 1, 8), player('R', 0, 0, 9)], 'P:0,Q:8,R:10', 'P', 'R');
    // Empate em atividades nos dois lados: cede quem tem mais recursos, recebe quem tem menos.
    expectTransfer('empate em atividades', [player('P', 1, 1, 2), player('Q', 1, 1, 5), player('R', 0, 0, 4), player('S', 0, 0, 1)],
        'P:2,Q:4,R:4,S:2', 'Q', 'S');
    // Todos com as mesmas atividades, recursos diferentes: do mais rico para o mais pobre.
    expectTransfer('mesmas atividades', [player('P', 0, 0, 4), player('Q', 0, 0, 1), player('R', 0, 0, 2)], 'P:3,Q:2,R:2', 'P', 'Q');

    // Empate em tudo de cada lado: sorteio (com 0, o primeiro de cada lado; com 0.99, o último).
    const tied = () => [player('P', 1, 1, 5), player('Q', 1, 1, 5), player('R', 0, 0, 1), player('S', 0, 0, 1)];
    setRandom(0);
    expectTransfer('sorteio (0)', tied(), 'P:4,Q:5,R:2,S:1', 'P', 'R');
    setRandom(0.99);
    expectTransfer('sorteio (0.99)', tied(), 'P:5,Q:4,R:1,S:2', 'Q', 'S');

    // Quem cede está com 0 ou menos: o evento não acontece.
    setRandom(0.5);
    for (const resources of [0, -1]) {
        const effect = applySwap('quem cede com ' + resources, [player('P', 1, 1, resources), player('Q', 0, 0, 5)], 'P:' + resources + ',Q:5');
        check(effect && effect.giver === 'P' && Array.isArray(effect.receivers) && effect.receivers.length === 0 &&
            effect.reason === 'giver-without-resources',
            'quem cede com ' + resources + ': o efeito deveria ser giver P, receivers [], reason giver-without-resources, veio: ' + JSON.stringify(effect));
    }

    // Todos empatados em atividades e recursos: ninguém está atrás, o evento não acontece.
    const effect = applySwap('todos empatados', [player('P', 0, 0, 10), player('Q', 0, 0, 10), player('R', 0, 0, 10)], 'P:10,Q:10,R:10');
    check(effect && Array.isArray(effect.receivers) && effect.receivers.length === 0 && effect.reason === 'all-tied' && effect.giver === undefined,
        'todos empatados: o efeito deveria ser receivers [], reason all-tied, sem giver, veio: ' + JSON.stringify(effect));
});

test('T113 Aviso do evento mostra quem foi atingido: show-event leva eventEffect, host e guests passam ao modal, e o modal monta o texto', (use) => {
    // 1) Na partida: o host aplica o evento (regras reais) e manda o efeito no show-event.
    /** Partida de Host, A e B com o evento fixo e o progresso dado: { nome: [índice da área, atividades, recursos] }. */
    function matchWithEvent(event, progress) {
        const env = use(createEnvironment());
        vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/domain/eventRules.js'), 'utf8'), env.ctx);
        env.Game.domain.event.drawEvent = () => copy(event);
        env.createRoomAsHost();
        env.join('A', 'peer-a');
        env.join('B', 'peer-b');
        for (const [name, [areaIndex, activities, resources]] of Object.entries(progress)) {
            Object.assign(env.player(name), { focusArea: env.CONFIG.FOCUS_AREAS[areaIndex].id, activities, resources });
        }
        const calls = recordScreens(env);
        env.startMatch();
        const shown = env.broadcastsOfType('show-event')[0];
        const hostModal = calls.find(c => c.name === 'showEventModal');
        return { env, shown, hostEffect: hostModal ? copy(hostModal.args[1]) : undefined };
    }
    /** O guest A recebe o show-event; devolve o efeito que ele passou ao modal. */
    function guestEffect(shown) {
        const guest = use(createEnvironment());
        guest.state.playerName = 'A';
        const calls = recordScreens(guest);
        guest.Game.network.handleMessage(copy(shown), 'sala');
        const modal = calls.find(c => c.name === 'showEventModal');
        return modal ? copy(modal.args[1]) : undefined;
    }

    // Patrocinador: B concluiu menos atividades e recebe.
    const sponsor = matchWithEvent(eventById('e3'), { Host: [1, 0, 10], A: [0, 1, 10], B: [0, 0, 10] });
    const sponsorEffect = sponsor.shown && copy(sponsor.shown.eventEffect);
    check(sponsor.env.player('B').resources === 11 && sponsor.env.player('A').resources === 10,
        'Patrocinador na partida: B (menos atividades) deveria ir a 11, veio: ' + resourcesOf(sponsor.env.state.players));
    check(sponsorEffect && JSON.stringify(sponsorEffect.receivers) === '["B"]' && sponsorEffect.amount === 1,
        'o show-event deveria levar eventEffect com receivers ["B"] e amount 1, veio: ' + JSON.stringify(sponsor.shown));
    check(JSON.stringify(sponsor.hostEffect) === JSON.stringify(sponsorEffect),
        'o host deveria passar o mesmo efeito ao próprio modal, passou: ' + JSON.stringify(sponsor.hostEffect));
    check(JSON.stringify(guestEffect(sponsor.shown)) === JSON.stringify(sponsorEffect),
        'o guest deveria passar ao modal o eventEffect do show-event');

    // Reestruturação: Host concluiu mais atividades e cede a B.
    const swap = matchWithEvent(eventById('e5'), { Host: [1, 1, 2], A: [0, 1, 10], B: [0, 0, 10] });
    const swapEffect = swap.shown && copy(swap.shown.eventEffect);
    check(swap.env.player('Host').resources === 1 && swap.env.player('B').resources === 11,
        'Reestruturação na partida: Host deveria ceder 1 a B (1 e 11), veio: ' + resourcesOf(swap.env.state.players));
    check(swapEffect && swapEffect.giver === 'Host' && JSON.stringify(swapEffect.receivers) === '["B"]' && swapEffect.amount === 1,
        'o show-event deveria levar eventEffect com giver Host e receivers ["B"], veio: ' + JSON.stringify(swap.shown));
    check(JSON.stringify(guestEffect(swap.shown)) === JSON.stringify(swapEffect), 'o guest deveria passar ao modal o efeito da Reestruturação');

    // Evento sem atingidos específicos (Apoio da Alta Gestão): sem eventEffect.
    const support = matchWithEvent(eventById('e1'), {});
    check(support.shown && support.shown.eventEffect == null && support.hostEffect == null,
        'o Apoio da Alta Gestão não deveria mandar eventEffect, veio: ' + JSON.stringify(support.shown && support.shown.eventEffect));

    // 2) O modal real (ui/modals/eventModal.js) monta o texto do efeito pelo i18n.
    const env = use(createEnvironment());
    const elements = {};
    env.ctx.document = {
        getElementById: (id) => elements[id] || (elements[id] = { id, textContent: '', innerHTML: '', className: '', style: {} }),
        querySelectorAll: () => []
    };
    env.Game.i18n.t = (key, values) => key + (values ? ' ' + JSON.stringify(values) : '');
    vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/ui/modals/eventModal.js'), 'utf8'), env.ctx, { filename: 'eventModal.js' });
    const e3 = eventById('e3');
    /** Abre o modal com o efeito e devolve o texto e a exibição da linha do efeito. */
    const effectLine = (event, effect) => {
        env.ctx.showEventModal(event, effect);
        const el = elements.eventModalEffect || { textContent: '', style: {} };
        return { text: String(el.textContent), display: el.style.display };
    };
    /** O texto é a chave `key` (sem valores) ou a chave seguida dos valores, com cada trecho de `values`. */
    const has = (text, key, values = []) => (values.length === 0 ? text === key : text.startsWith(key + ' ') && values.every(v => text.includes(v)));

    let line = effectLine(e3, { receivers: ['Carla'], amount: 1 });
    check(elements.eventModalTitle && elements.eventModalTitle.textContent === e3.title && elements.eventModalDesc.textContent === e3.description,
        'o modal continua mostrando title e description do evento');
    check(has(line.text, 'event.received', ['"names":"Carla"', '"amount":1']) && line.display !== 'none',
        'um que recebeu: texto event.received com names e amount, à mostra, veio: ' + JSON.stringify(line));
    line = effectLine(e3, { receivers: ['Ana', 'Carla'], amount: 1 });
    check(has(line.text, 'event.receivedMany', ['Ana', 'Carla', '"amount":1']), 'vários que receberam: event.receivedMany com os nomes, veio: ' + line.text);
    line = effectLine(eventById('e5'), { giver: 'Davi', receivers: ['Carla'], amount: 1 });
    check(has(line.text, 'event.gave', ['"giver":"Davi"', '"receiver":"Carla"', '"amount":1']) && line.display !== 'none',
        'troca: event.gave com giver, receiver e amount, veio: ' + JSON.stringify(line));
    line = effectLine(eventById('e5'), { receivers: [], reason: 'all-tied' });
    check(has(line.text, 'event.noneTied'), 'todos empatados: event.noneTied, veio: ' + line.text);
    line = effectLine(eventById('e5'), { giver: 'Davi', receivers: [], reason: 'giver-without-resources' });
    check(has(line.text, 'event.noneGiverWithoutResources', ['"giver":"Davi"']),
        'quem cede sem recursos: event.noneGiverWithoutResources com giver, veio: ' + line.text);
    line = effectLine(eventById('e1'), null);
    check(line.text === '' && line.display === 'none', 'sem efeito: a linha fica vazia e escondida, veio: ' + JSON.stringify(line));

    // 3) Os textos existem no pt-BR.js real, com os marcadores, e o game.html tem a linha do efeito.
    const localeCtx = vm.createContext({});
    vm.runInContext('var window = this;' + fs.readFileSync(path.join(ROOT, 'js/locales/pt-BR.js'), 'utf8'), localeCtx);
    const texts = vm.runInContext("Game.locales['pt-BR'].event || {}", localeCtx);
    const markers = (text) => [...new Set([...String(text).matchAll(/\{\{(\w+)\}\}/g)].map(m => m[1]))].sort().join();
    const expectedMarkers = { received: 'amount,names', receivedMany: 'amount,names', gave: 'amount,giver,receiver', noneTied: '', noneGiverWithoutResources: 'giver' };
    for (const [key, expected] of Object.entries(expectedMarkers)) {
        check(typeof texts[key] === 'string' && texts[key].length > 0 && markers(texts[key]) === expected,
            'o pt-BR.js deveria ter event.' + key + ' com os marcadores [' + expected + '], veio: ' + JSON.stringify(texts[key]));
    }
    check(/id="eventModalEffect"/.test(fs.readFileSync(path.join(ROOT, 'game.html'), 'utf8')), 'o game.html deveria ter o elemento eventModalEffect no modal do evento');
});

finish('Economia de recursos');
