// ============================================
// PM: The KPI Master - Testes de lógica: Economia de recursos
// ============================================
// Recursos como orçamento do projeto: o erro gasta recurso sem piso
// (estouro de orçamento), o Corte de Orçamento também, e o KPI Final e
// o ranking descontam o estouro. As telas mostram o recurso negativo.
// Ambiente simulado e ajudantes: environment.js. Rodar a partir da raiz:
//     node tests/logic/economy.test.js
// ============================================

const {
    fs, path, vm, ROOT, createEnvironment, test, check, start, finish
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

finish('Economia de recursos');
