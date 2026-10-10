// ============================================
// PM: The KPI Master - Testes de lógica: Simulador de partidas
// ============================================
// O simulador de partidas para balanceamento (tests/simulation/) roda
// partidas inteiras com as regras e os dados REAIS do jogo (domain/,
// engines, config/game-config.js e data/), com robôs no lugar dos
// jogadores e um tempo falso. Estes testes conferem que ele usa as
// regras reais (trocar um valor do config muda o resultado), que as
// contas fecham, que a mesma semente repete as partidas, que as
// decisões dos robôs passam pelos engines, que os robôs decidem pelo que
// "sabem" (pedir apoio, quem chamar, aceitar) e que o relatório sai
// completo.
// Ambiente e ajudantes: environment.js. Rodar a partir da raiz:
//     node tests/logic/simulation.test.js
// ============================================

const {
    fs, path, vm, ROOT, test, check, start, finish
} = require('./environment');

start('Simulador de partidas');

let simulator = null;
let loadError = '';
try {
    simulator = require('../simulation/simulator');
} catch (err) {
    loadError = err.message;
}

/** Roda uma etapa assíncrona e guarda o resultado ou o erro. */
async function attempt(fn) {
    try {
        if (!simulator) throw new Error('não foi possível carregar tests/simulation/simulator.js: ' + loadError);
        return { value: await fn() };
    } catch (err) {
        return { error: err };
    }
}

/** Valor de uma etapa; se ela falhou, o teste falha com o erro dela. */
function valueOf(result) {
    if (result.error) throw result.error;
    return result.value;
}

/** CONFIG do config/game-config.js real. */
function realConfig() {
    const ctx = vm.createContext({});
    vm.runInContext('var window = this;' + fs.readFileSync(path.join(ROOT, 'config/game-config.js'), 'utf8'), ctx);
    return JSON.parse(JSON.stringify(vm.runInContext('CONFIG', ctx)));
}

/** IDs das perguntas e dos eventos dos arquivos reais de data/. */
function realDataIds() {
    const questions = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/questions.pt-BR.json'), 'utf8'));
    const events = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/events.json'), 'utf8')).events;
    const questionIds = new Set();
    Object.values(questions.domains).forEach(d => d.questions.forEach(q => questionIds.add(q.id)));
    return { questionIds, events };
}

/** Todas as partidas de uma ou mais execuções de simulateMany(). */
const matchesOf = (...runs) => runs.flatMap(r => r.matches);

const sum = (list, fn) => list.reduce((total, item) => total + fn(item), 0);

/** Números entre 0 e 1 a partir de uma semente (para o sorteio da escolha de quem chamar). */
function seededRandom(seed) {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6D2B79F5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

(async () => {
    const C = realConfig();
    const configTextBefore = fs.readFileSync(path.join(ROOT, 'config/game-config.js'), 'utf8');

    const standard = await attempt(() => simulator.simulateMatch({ ...simulator.DEFAULT_OPTIONS, seed: 7, players: 4 }));
    const accounts = await attempt(() => Promise.all([
        simulator.simulateMany({ ...simulator.DEFAULT_OPTIONS, matches: 4, seed: 11, players: 5 }),
        simulator.simulateMany({ ...simulator.DEFAULT_OPTIONS, matches: 4, seed: 21, players: 4,
            helpChance: 1, helperUnsureAcceptChance: 1, advisoryChance: 0.5, overrides: { STARTING_RESOURCES: 1 } })
    ]));
    const sameSeed = await attempt(async () => [
        await simulator.simulateMany({ ...simulator.DEFAULT_OPTIONS, matches: 3, seed: 42, players: 3 }),
        await simulator.simulateMany({ ...simulator.DEFAULT_OPTIONS, matches: 3, seed: 42, players: 3 }),
        await simulator.simulateMany({ ...simulator.DEFAULT_OPTIONS, matches: 3, seed: 43, players: 3 })
    ]);
    const overridden = await attempt(async () => ({
        changed: await simulator.simulateMatch({ ...simulator.DEFAULT_OPTIONS, seed: 5, players: 2, accuracies: [1], advisoryChance: 0,
            overrides: { 'GAME.ACTIVITIES_PER_FOCUS_AREA': 1, 'KPI.FINAL_RESOURCE_VALUE': 0 } }),
        standard: await simulator.simulateMatch({ ...simulator.DEFAULT_OPTIONS, seed: 5, players: 2, accuracies: [1], advisoryChance: 0 })
    }));
    const unknownKey = await attempt(() => simulator.simulateMatch({ ...simulator.DEFAULT_OPTIONS, seed: 1, players: 2,
        overrides: { 'KPI.NAO_EXISTE': 1 } }));
    const robots = await attempt(async () => ({
        // Perfil 25% nunca sabe (sempre pede); perfil 100% sempre sabe.
        advisory: await simulator.simulateMany({ ...simulator.DEFAULT_OPTIONS, matches: 6, seed: 3, players: 4, accuracies: [0.25, 1],
            advisoryChance: 1, advisorUnsureAcceptChance: 0, followSuggestionChance: 1 }),
        noAdvisory: await simulator.simulateMany({ ...simulator.DEFAULT_OPTIONS, matches: 2, seed: 4, players: 4, advisoryChance: 0 }),
        help: await simulator.simulateMany({ ...simulator.DEFAULT_OPTIONS, matches: 6, seed: 9, players: 4, accuracies: [0.5],
            advisoryChance: 0, advisorUnsureAcceptChance: 0, helpChance: 1, helperUnsureAcceptChance: 1, followSuggestionChance: 1,
            overrides: { STARTING_RESOURCES: 1 } }),
        noHelp: await simulator.simulateMany({ ...simulator.DEFAULT_OPTIONS, matches: 2, seed: 9, players: 4, accuracies: [0.5],
            helpChance: 0, overrides: { STARTING_RESOURCES: 1 } }),
        timeout: await simulator.simulateMatch({ ...simulator.DEFAULT_OPTIONS, seed: 2, players: 2, timeoutChance: 1,
            overrides: { 'GAME.SESSION_DURATION': 600 } })
    }));
    const report = await attempt(async () => {
        const a = await simulator.simulateMany({ ...simulator.DEFAULT_OPTIONS, matches: 4, seed: 1, players: 3 });
        const b = await simulator.simulateMany({ ...simulator.DEFAULT_OPTIONS, matches: 4, seed: 1, players: 3,
            overrides: { 'KPI.FINAL_RESOURCE_VALUE': 3 } });
        return {
            a,
            withB: simulator.buildReport({ a, b, commit: 'abc1234' }),
            onlyA: simulator.buildReport({ a, b: null, commit: 'abc1234' }),
            csv: simulator.toCsv(a)
        };
    });
    const tieRun = await attempt(async () => {
        const run = await simulator.simulateMany({ ...simulator.DEFAULT_OPTIONS, matches: 20, seed: 5, players: 6 });
        return { run, report: simulator.buildReport({ a: run, b: null, commit: 'abc1234' }) };
    });
    const deciding = await attempt(async () => ({
        alwaysKnows: await simulator.simulateMany({ ...simulator.DEFAULT_OPTIONS, matches: 3, seed: 13, players: 4, accuracies: [1],
            advisoryChance: 1, helpChance: 1 }),
        neverKnows: await simulator.simulateMany({ ...simulator.DEFAULT_OPTIONS, matches: 3, seed: 14, players: 4, accuracies: [0.25],
            advisoryChance: 1, helpChance: 1, helperUnsureAcceptChance: 1 }),
        alone: await simulator.simulateMany({ ...simulator.DEFAULT_OPTIONS, matches: 30, seed: 17, players: 4,
            accuracies: [0.4, 0.6, 0.8], advisoryChance: 0, helpChance: 0 })
    }));
    const calling = await attempt(() => simulator.simulateMany({ ...simulator.DEFAULT_OPTIONS, matches: 8, seed: 23, players: 4,
        accuracies: [0.4, 0.9], advisoryChance: 1, advisorUnsureAcceptChance: 1, callNoise: 0 }));
    const accepting = await attempt(async () => ({
        help: await simulator.simulateMany({ ...simulator.DEFAULT_OPTIONS, matches: 6, seed: 9, players: 4, accuracies: [0.5],
            advisoryChance: 0, helpChance: 1, helperUnsureAcceptChance: 0, followSuggestionChance: 1,
            overrides: { STARTING_RESOURCES: 1, 'RESOURCES.HELP_REWARD': 5 } }),
        advisory: await simulator.simulateMany({ ...simulator.DEFAULT_OPTIONS, matches: 4, seed: 27, players: 4, accuracies: [0.5],
            advisoryChance: 1, advisorUnsureAcceptChance: 0, helpChance: 0, followSuggestionChance: 1 })
    }));
    const economyRun = await attempt(async () => {
        const run = await simulator.simulateMany({ ...simulator.DEFAULT_OPTIONS, matches: 6, seed: 31, players: 4,
            overrides: { STARTING_RESOURCES: 2 } });
        return { run, report: simulator.buildReport({ a: run, b: null, commit: 'abc1234' }), csv: simulator.toCsv(run) };
    });
    const configTextAfter = fs.readFileSync(path.join(ROOT, 'config/game-config.js'), 'utf8');

    test('T93 Simulador: a partida simulada termina, com o config, as perguntas e os eventos reais', () => {
        const r = valueOf(standard);
        const { questionIds, events } = realDataIds();
        check(['last-focus-area', 'time'].includes(r.endReason), 'a partida deveria terminar pela última área foco ou pelo tempo, veio: ' + r.endReason);
        check(r.questions > 0 && r.rounds > 0 && r.rounds <= r.questions,
            'deveria haver rodadas e perguntas (rodadas ≤ perguntas), veio: ' + r.rounds + ' rodadas, ' + r.questions + ' perguntas');
        check(r.durationSeconds > 0 && r.durationSeconds <= C.GAME.SESSION_DURATION,
            'a duração deveria ficar entre 0 e SESSION_DURATION, veio: ' + r.durationSeconds);

        // Config real, sem trocas.
        check(JSON.stringify(r.config.KPI) === JSON.stringify(C.KPI) && r.config.STARTING_RESOURCES === C.STARTING_RESOURCES &&
            JSON.stringify(r.config.GAME) === JSON.stringify(C.GAME),
            'sem trocas, a simulação deveria usar o config real, veio: ' + JSON.stringify(r.config));

        // Perguntas e eventos vêm de data/.
        check(r.questionIds.length === r.questions, 'deveria guardar o ID de cada pergunta sorteada');
        const unknownQuestions = r.questionIds.filter(id => !questionIds.has(id));
        check(unknownQuestions.length === 0, 'perguntas que não estão em data/questions.pt-BR.json: ' + unknownQuestions.join(', '));
        const eventIds = events.map(e => e.id);
        const unknownEvents = Object.keys(r.events).filter(id => !eventIds.includes(id));
        check(unknownEvents.length === 0, 'eventos que não estão em data/events.json: ' + unknownEvents.join(', '));
        check(sum(Object.values(r.events), e => e.count) === r.rounds,
            'cada rodada deveria sortear um evento, veio: ' + JSON.stringify(r.events) + ' para ' + r.rounds + ' rodadas');

        // Ranking final com os 4 jogadores e o motivo do fim coerente.
        check(r.players.length === 4 && r.players.map(p => p.position).join() === '1,2,3,4',
            'o ranking deveria ter os 4 jogadores, nas posições 1 a 4, veio: ' + JSON.stringify(r.players.map(p => p.position)));
        const last = C.FOCUS_AREAS.length - 1;
        if (r.endReason === 'last-focus-area') {
            check(r.players.some(p => p.focusAreaIndex === last && p.activities >= C.GAME.ACTIVITIES_PER_FOCUS_AREA),
                'fim pela última área foco: alguém deveria ter completado o Encerramento');
        } else {
            check(r.durationSeconds === C.GAME.SESSION_DURATION, 'fim pelo tempo: a duração deveria ser SESSION_DURATION, veio: ' + r.durationSeconds);
        }
    });

    test('T94 Simulador: as contas fecham (KPI de cada jogador, KPI Final, mínimo de recursos, ranking em ordem) e o estouro de orçamento acontece', () => {
        const runs = valueOf(accounts);
        const matches = matchesOf(...runs);
        check(matches.length === 8, 'deveriam ser 8 partidas, vieram ' + matches.length);
        const problems = [];
        matches.forEach((m, i) => {
            const k = m.config.KPI;
            m.players.forEach(p => {
                // Só o acerto dá KPI: honorário, recompensa e cobertura são em recurso.
                const expectedKpi = k.CORRECT_ANSWER * p.correct;
                if (p.kpi !== expectedKpi) problems.push('partida ' + i + ' ' + p.name + ': KPI ' + p.kpi + ', esperado ' + expectedKpi);
                if (p.finalKpi !== p.kpi + p.resources * k.FINAL_RESOURCE_VALUE) problems.push('partida ' + i + ' ' + p.name + ': KPI Final errado');
                if (p.minResources > p.resources) problems.push('partida ' + i + ' ' + p.name + ': mínimo de recursos maior que o final');
                if (p.kpi < 0) problems.push('partida ' + i + ' ' + p.name + ': KPI negativo');
                if (p.correct > p.answers) problems.push('partida ' + i + ' ' + p.name + ': mais acertos que respostas');
            });
            for (let j = 1; j < m.players.length; j++) {
                if (m.players[j].finalKpi > m.players[j - 1].finalKpi) problems.push('partida ' + i + ': ranking fora de ordem');
            }
            const answers = sum(m.players, p => p.answers);
            if (answers !== m.questions && answers !== m.questions - 1) {
                problems.push('partida ' + i + ': ' + answers + ' respostas para ' + m.questions + ' perguntas');
            }
            if (sum(m.players, p => p.feesReceived) !== m.advisories.feeTotal ||
                sum(m.players, p => p.feesPaid) !== m.advisories.feeTotal) problems.push('partida ' + i + ': honorários de assessoria não batem');
            if (sum(m.players, p => p.helpsAsked) !== m.help.requested ||
                sum(m.players, p => p.helpsGiven) !== m.help.accepted) problems.push('partida ' + i + ': ajudas não batem');
            if (sum(m.players, p => p.rewardsReceived) !== m.help.rewardTotal ||
                sum(m.players, p => p.coversPaid) !== m.help.coverTotal) problems.push('partida ' + i + ': recompensas e coberturas não batem');
            if (sum(m.players, p => p.advisoriesAsked) !== m.advisories.requested) problems.push('partida ' + i + ': assessorias pedidas não batem');
            // Só quem não sabe pede apoio.
            if (m.players.some(p => p.advisoriesAsked + p.helpsAsked > p.unsureAnswers)) {
                problems.push('partida ' + i + ': mais pedidos de apoio que perguntas sem saber');
            }
        });
        // Efeito medido de cada evento (o que o relatório mostra): "+N para
        // todos" soma N por jogador; a troca entre quem tem mais e quem tem
        // menos não muda a soma; o corte nunca aumenta.
        const { events } = realDataIds();
        matches.forEach((m, i) => {
            for (const e of events) {
                const measured = m.events[e.id];
                if (!measured) continue;
                if (e.resourcesForAll > 0 && measured.resourcesDelta !== measured.count * m.players.length * e.resourcesForAll) {
                    problems.push('partida ' + i + ' ' + e.id + ': soma medida ' + measured.resourcesDelta + ' em ' + measured.count + ' vez(es)');
                }
                if (e.resourceSwap && measured.resourcesDelta !== 0) problems.push('partida ' + i + ' ' + e.id + ': a troca mudou a soma');
                if (e.resourcesForAll < 0 && measured.resourcesDelta > 0) problems.push('partida ' + i + ' ' + e.id + ': o corte aumentou a soma');
            }
        });
        check(problems.length === 0, problems.slice(0, 8).join('; '));
        // Com 1 recurso no início, alguém chega a 0 e alguém passa de 0
        // (estouro de orçamento: o erro e o corte não têm piso) — o mínimo é medido.
        check(matchesOf(runs[1]).some(m => m.players.some(p => p.minResources <= 0 && p.timesAtZero > 0)),
            'com STARTING_RESOURCES 1, alguém deveria chegar a 0 recursos (minResources ≤ 0, timesAtZero > 0)');
        check(matchesOf(runs[1]).some(m => m.players.some(p => p.minResources < 0)),
            'com STARTING_RESOURCES 1, alguém deveria entrar em estouro de orçamento (minResources negativo)');
    });

    test('T95 Simulador: a mesma semente repete as mesmas partidas; outra semente dá outras', () => {
        const [first, again, other] = valueOf(sameSeed);
        check(first.matches.length === 3, 'deveriam ser 3 partidas, vieram ' + first.matches.length);
        check(JSON.stringify(first.matches) === JSON.stringify(again.matches), 'a mesma semente deveria dar exatamente as mesmas partidas');
        check(JSON.stringify(first.matches) !== JSON.stringify(other.matches), 'outra semente deveria dar outras partidas');
        check(first.matches[0].seed !== first.matches[1].seed, 'cada partida deveria ter a própria semente');
    });

    test('T96 Simulador: as trocas do config valem só na simulação (o arquivo não muda e a troca não vaza para a partida seguinte)', () => {
        const { changed, standard: plain } = valueOf(overridden);
        const last = C.FOCUS_AREAS.length - 1;
        check(changed.config.GAME.ACTIVITIES_PER_FOCUS_AREA === 1 && changed.config.KPI.FINAL_RESOURCE_VALUE === 0,
            'a troca deveria aparecer no config usado, veio: ' + JSON.stringify(changed.config));
        check(changed.endReason === 'last-focus-area' && changed.players[0].correct === C.FOCUS_AREAS.length &&
            changed.players[0].focusAreaIndex === last,
            'com 1 atividade por área e acerto 100%, o vencedor deveria completar o Encerramento com ' + C.FOCUS_AREAS.length +
            ' acertos, veio: ' + changed.endReason + ', ' + JSON.stringify(changed.players[0]));
        check(changed.players.every(p => p.finalKpi === p.kpi), 'com FINAL_RESOURCE_VALUE 0, o KPI Final deveria ser só o KPI');

        check(plain.config.GAME.ACTIVITIES_PER_FOCUS_AREA === C.GAME.ACTIVITIES_PER_FOCUS_AREA &&
            plain.config.KPI.FINAL_RESOURCE_VALUE === C.KPI.FINAL_RESOURCE_VALUE,
            'a troca não deveria vazar para a partida seguinte, veio: ' + JSON.stringify(plain.config));
        check(plain.endReason === 'last-focus-area' &&
            plain.players[0].correct === C.FOCUS_AREAS.length * C.GAME.ACTIVITIES_PER_FOCUS_AREA,
            'sem troca, o vencedor deveria completar o Encerramento com ' + (C.FOCUS_AREAS.length * C.GAME.ACTIVITIES_PER_FOCUS_AREA) +
            ' acertos, veio: ' + plain.endReason + ', ' + JSON.stringify(plain.players[0]));

        check(configTextAfter === configTextBefore, 'config/game-config.js não pode ser alterado pelo simulador');
        check(unknownKey.error && /KPI\.NAO_EXISTE/.test(unknownKey.error.message),
            'uma troca de chave que não existe no config deveria ser recusada com o nome dela, veio: ' +
            (unknownKey.error ? unknownKey.error.message : 'nenhum erro'));
    });

    test('T97 Simulador: assessoria, pedido de ajuda (recompensa e cobertura) e prazo de resposta passam pelos engines reais', () => {
        const r = valueOf(robots);
        const K = C.KPI;

        // Quem não sabe (perfil 25%) sempre pede; o assessor só aceita
        // quando sabe, e a sugestão é sempre seguida: toda assessoria
        // aceita vira honorário (quem pediu paga em recurso ao assessor).
        // Só a aceita quando a partida acaba pode ficar sem resposta.
        const fee = C.RESOURCES.ADVISORY_FEE;
        const adv = r.advisory.matches;
        const requested = sum(adv, m => m.advisories.requested);
        const accepted = sum(adv, m => m.advisories.accepted);
        check(requested > 0 && accepted > 0, 'com advisoryChance 1 e perfis 25% e 100%, deveria haver assessorias pedidas e aceitas: ' +
            JSON.stringify(adv.map(m => m.advisories)));
        check(adv.every(m => m.advisories.feeTotal % fee === 0 && m.advisories.feeTotal <= m.advisories.accepted * fee &&
            m.advisories.feeTotal >= (m.advisories.accepted - 1) * fee),
            'cada assessoria aceita, seguida e certa deveria pagar o honorário (RESOURCES.ADVISORY_FEE = ' + fee + '), veio: ' +
            JSON.stringify(adv.map(m => m.advisories)));
        check(adv.every(m => m.players.every(p => p.kpi === K.CORRECT_ANSWER * p.correct)),
            'a assessoria não deveria dar KPI a ninguém (sem bônus do assessor)');
        check(r.noAdvisory.matches.every(m => m.advisories.requested === 0 && m.advisories.feeTotal === 0),
            'com advisoryChance 0, não deveria haver assessoria');

        // Pedido de ajuda na vez de responder (com 0 recursos ou menos),
        // sempre aceito e seguido: cada ajuda vira recompensa (acertou) ou
        // cobertura (errou), em recurso; nenhum KPI muda de mãos.
        const R = C.RESOURCES;
        const helped = r.help.matches;
        const helpsAccepted = sum(helped, m => m.help.accepted);
        // Vale a chance de quem ajuda (1), não a do assessor (0). Só o
        // pedido em andamento quando a partida acaba fica sem resposta.
        check(helpsAccepted > 0 && helped.every(m => m.help.declined === 0 && m.help.accepted >= m.help.requested - 1),
            'com helperUnsureAcceptChance 1 (e advisorUnsureAcceptChance 0), todo pedido de ajuda deveria ser respondido: ' +
            JSON.stringify(helped.map(m => m.help)));
        check(sum(helped, m => m.help.rewardTotal) > 0 && sum(helped, m => m.help.coverTotal) > 0,
            'com acerto de 50%, deveria haver recompensas e coberturas: ' + JSON.stringify(helped.map(m => m.help)));
        check(helped.every(m => m.help.rewardTotal % R.HELP_REWARD === 0 && m.help.coverTotal % R.HELP_COVER === 0 &&
            m.help.rewardTotal / R.HELP_REWARD + m.help.coverTotal / R.HELP_COVER <= m.help.accepted && m.help.requested >= m.help.accepted),
            'cada ajuda aceita deveria dar no máximo uma recompensa (HELP_REWARD = ' + R.HELP_REWARD + ') ou uma cobertura (HELP_COVER = ' +
            R.HELP_COVER + '): ' + JSON.stringify(helped.map(m => m.help)));
        check(helped.every(m => m.players.every(p => p.kpi === K.CORRECT_ANSWER * p.correct)), 'a ajuda não deveria mexer no KPI de ninguém');
        check(helped.every(m => m.advisories.requested === 0 && m.advisories.feeTotal === 0),
            'com advisoryChance 0, os pedidos deveriam ser só de ajuda (sem honorário)');
        check(helped.every(m => sum(m.players, p => p.helpsAsked) === m.help.requested), 'os pedidos por jogador deveriam somar o total');
        check(r.noHelp.matches.every(m => m.help.requested === 0), 'com helpChance 0, ninguém deveria pedir ajuda');

        // Sem resposta: o prazo real (ANSWER_TIMEOUT) encerra cada pergunta.
        const t = r.timeout;
        check(t.endReason === 'time' && t.durationSeconds === 600, 'com SESSION_DURATION 600, deveria acabar pelo tempo em 600s, veio: ' +
            t.endReason + ', ' + t.durationSeconds);
        check(t.players.every(p => p.correct === 0 && p.kpi === 0), 'sem responder, ninguém deveria acertar');
        const maxQuestions = Math.ceil(600 / (C.GAME.ANSWER_TIMEOUT / 1000));
        check(t.questions >= 5 && t.questions <= maxQuestions,
            'cada pergunta deveria durar o prazo de resposta (' + (C.GAME.ANSWER_TIMEOUT / 1000) + 's): entre 5 e ' + maxQuestions +
            ' perguntas em 600s, vieram ' + t.questions);
        check(sum(t.players, p => p.answers) >= t.questions - 1, 'cada prazo vencido deveria contar como resposta (errada)');
    });

    test('T98 Simulador: relatório com todas as seções, cenário B lado a lado, e CSV com uma linha por jogador por partida', () => {
        const { a, withB, onlyA, csv } = valueOf(report);
        const { events } = realDataIds();
        for (const section of ['Duração', 'Progresso', 'Recursos', 'Economia', 'Eventos', 'Justiça']) {
            check(withB.includes(section), 'o relatório deveria ter a seção ' + section);
        }
        check(withB.includes('abc1234'), 'o relatório deveria citar o commit');
        check(withB.includes('Cenário B') && withB.includes('KPI.FINAL_RESOURCE_VALUE'),
            'com cenário B, o relatório deveria mostrar a troca KPI.FINAL_RESOURCE_VALUE');
        check(!onlyA.includes('Cenário B'), 'sem cenário B, o relatório não deveria ter a coluna do cenário B');
        const missingEvents = events.filter(e => !withB.includes(e.title)).map(e => e.title);
        check(missingEvents.length === 0, 'todo evento de data/events.json deveria aparecer no relatório, faltam: ' + missingEvents.join(', '));
        check(withB.includes('████'), 'o relatório deveria ter o histograma em barras');

        const lines = csv.trim().split('\n');
        check(lines.length === 1 + a.matches.length * 3, 'o CSV deveria ter cabeçalho + 1 linha por jogador por partida (13), veio: ' + lines.length);
        check(lines[0].includes('kpi_final') && lines[0].includes(';'), 'o cabeçalho do CSV deveria usar ";" e ter kpi_final, veio: ' + lines[0]);
        const columns = lines[0].split(';').length;
        check(lines.every(l => l.split(';').length === columns), 'todas as linhas do CSV deveriam ter ' + columns + ' colunas');
    });

    test('T99 Simulador: o formulário do Run workflow vira opções; valores inválidos são recusados com mensagem clara', () => {
        valueOf({ value: simulator, error: simulator ? null : new Error('não foi possível carregar tests/simulation/simulator.js: ' + loadError) });
        const { options, overridesB } = simulator.optionsFromInputs({
            partidas: '50', jogadores: '5', semente: '9', acertos: '40, 60,80', tempo_resposta: '20-50',
            assessoria: '30', pedir_ajuda: '50', aceitar_ajuda: '40',
            cenario_b: 'KPI.FINAL_RESOURCE_VALUE=3; STARTING_RESOURCES = 5'
        });
        check(options.matches === 50 && options.players === 5 && options.seed === 9,
            'partidas, jogadores e semente deveriam virar números, veio: ' + JSON.stringify(options));
        check(JSON.stringify(options.accuracies) === '[0.4,0.6,0.8]', 'acertos em % deveriam virar [0.4,0.6,0.8], veio: ' + JSON.stringify(options.accuracies));
        check(JSON.stringify(options.answerSeconds) === '[20,50]', 'tempo de resposta deveria virar [20,50], veio: ' + JSON.stringify(options.answerSeconds));
        check(options.advisoryChance === 0.3 && options.helpChance === 0.5 && options.helperUnsureAcceptChance === 0.4,
            'as chances em % deveriam virar frações (aceitar_ajuda → helperUnsureAcceptChance), veio: ' + JSON.stringify(options));
        const D = simulator.DEFAULT_OPTIONS;
        check(D.advisoryChance === 0.5 && D.helpChance === 0.8 && D.helperUnsureAcceptChance === 0.2 &&
            D.advisorUnsureAcceptChance === 0.5 && D.followSuggestionChance === 1 && D.callNoise === 0.2 &&
            !('advisorAcceptChance' in D) && !('helpAcceptChance' in D),
            'padrões dos robôs: assessoria 50%, ajuda 80%, aceitar ajuda sem saber 20%, assessorar sem saber 50%, segue a sugestão 100%, ' +
            'ruído na escolha 0,2, sem advisorAcceptChance/helpAcceptChance; veio: ' + JSON.stringify(D));
        check(JSON.stringify(overridesB) === JSON.stringify({ 'KPI.FINAL_RESOURCE_VALUE': 3, STARTING_RESOURCES: 5 }),
            'o cenário B deveria virar as trocas do config, veio: ' + JSON.stringify(overridesB));

        const empty = simulator.optionsFromInputs({});
        check(JSON.stringify(empty.options) === JSON.stringify(simulator.DEFAULT_OPTIONS) && empty.overridesB === null,
            'formulário vazio deveria dar os padrões e nenhum cenário B, veio: ' + JSON.stringify(empty));

        const refused = (inputs) => {
            try { simulator.optionsFromInputs(inputs); } catch (err) { return err.message; }
            return null;
        };
        for (const inputs of [{ jogadores: String(C.GAME.MAX_PLAYERS + 1) }, { jogadores: '1' }, { acertos: '120' },
            { partidas: 'muitas' }, { tempo_resposta: '50-20' }, { cenario_b: 'KPI.NAO_EXISTE=1' }, { cenario_b: 'STARTING_RESOURCES=abc' }]) {
            const message = refused(inputs);
            check(message, 'deveria recusar ' + JSON.stringify(inputs));
            const field = Object.keys(inputs)[0];
            check(message.includes(field), 'a mensagem deveria citar o campo ' + field + ', veio: ' + message);
        }
    });

    test('T102 Simulador: o ranking das partidas usa o desempate real, o relatório mede os empates que sobram e não mostra "-0"', () => {
        valueOf({ value: simulator, error: simulator ? null : new Error('não foi possível carregar tests/simulation/simulator.js: ' + loadError) });
        const n = simulator.formatNumber;
        check(typeof n === 'function', 'o simulador deveria exportar formatNumber (números do relatório)');
        check(n(-0.004, 2) === '0' && n(-0.02, 2) === '-0,02' && n(12, 1) === '12' && n(3.25, 2) === '3,25' && n(-3.97, 2) === '-3,97',
            'formatNumber: -0,004 → "0" (sem "-0"), -0,02 → "-0,02", 12 → "12", 3,25 → "3,25", veio: ' +
            [n(-0.004, 2), n(-0.02, 2), n(12, 1), n(3.25, 2), n(-3.97, 2)].join(' | '));

        const { run, report } = valueOf(tieRun);
        const last = run.config.FOCUS_AREAS.length - 1;
        let tiesInFinalKpi = 0;
        const problems = [];
        run.matches.forEach((m, i) => {
            for (let j = 1; j < m.players.length; j++) {
                const [a, b] = [m.players[j - 1], m.players[j]];
                const key = (p) => [p.finalKpi, p.focusAreaIndex, p.activities, p.kpi];
                const [ka, kb] = [key(a), key(b)];
                const cmp = ka.map((x, k) => x - kb[k]).find(d => d !== 0) || 0;
                if (cmp < 0) problems.push('partida ' + i + ': ' + b.name + ' deveria estar à frente de ' + a.name);
                if ((cmp === 0) !== (a.position === b.position)) problems.push('partida ' + i + ': posição dividida errada entre ' + a.name + ' e ' + b.name);
                if (a.finalKpi === b.finalKpi) tiesInFinalKpi++;
                if (a.focusAreaIndex < 0 || a.focusAreaIndex > last) problems.push('partida ' + i + ': área foco desconhecida');
            }
        });
        check(tiesInFinalKpi > 0, 'pré-condição: com 6 jogadores em 20 partidas deveria haver empate no KPI Final');
        check(problems.length === 0, problems.slice(0, 6).join('; '));

        const tiedAtTop = run.matches.filter(m => m.players[0].finalKpi === m.players[1].finalKpi).length;
        const shared = run.matches.filter(m => m.players[0].position === m.players[1].position).length;
        const rowOf = (label) => report.split('\n').find(l => l.startsWith('| ' + label + ' |')) || '';
        const pct = (part) => n(100 * part / run.matches.length, 1) + '%';
        const tieRow = rowOf('Empate no KPI Final do 1º lugar');
        const sharedRow = rowOf('Empate que o desempate não resolveu (medalha dividida)');
        check(tieRow.includes(pct(tiedAtTop)), 'o relatório deveria mostrar o empate no KPI Final do 1º lugar (' + pct(tiedAtTop) + '), veio: ' + tieRow);
        check(sharedRow.includes(pct(shared)), 'o relatório deveria mostrar o empate que sobra depois do desempate (' + pct(shared) + '), veio: ' + sharedRow);
        check(!/(^|[^\d,])-0(?![\d,])/.test(report), 'o relatório não deveria mostrar "-0"');
    });

    test('T126 Simulador: o robô "sabe" pela chance do perfil — quem sabe não pede apoio, quem não sabe pede ou chuta, e sozinho acerta o perfil', () => {
        const k = simulator && simulator.knowChance;
        check(typeof k === 'function', 'o simulador deveria exportar knowChance (chance de saber a partir do perfil)');
        const close = (x, y) => Math.abs(x - y) < 1e-9;
        check(close(k(0.4), 0.2) && close(k(0.8), 2.2 / 3) && close(k(1), 1) && k(0.25) === 0 && k(0.1) === 0,
            'knowChance = (4 × perfil − 1) ÷ 3, entre 0 e 1: 40% → 0,2; 80% → 0,733; 100% → 1; 25% e 10% → 0; veio: ' +
            [0.4, 0.8, 1, 0.25, 0.1].map(k).join(' | '));

        const { alwaysKnows, neverKnows, alone } = valueOf(deciding);
        check(alwaysKnows.matches.every(m => m.advisories.requested === 0 && m.help.requested === 0 &&
            m.players.every(p => p.unsureAnswers === 0 && p.correct === p.answers)),
            'com perfil 100%, o robô sempre sabe: acerta tudo e nunca pede apoio (mesmo com advisoryChance e helpChance 1), veio: ' +
            JSON.stringify(alwaysKnows.matches.map(m => [m.advisories, m.help])));

        // Perfil 25%: nunca sabe. Só a pergunta em andamento quando a partida acaba fica sem resposta.
        check(neverKnows.matches.every(m => sum(m.players, p => p.unsureAnswers) >= sum(m.players, p => p.answers) &&
            sum(m.players, p => p.unsureAnswers) <= sum(m.players, p => p.answers) + 1),
            'com perfil 25%, toda pergunta deveria contar como sem saber, veio: ' +
            JSON.stringify(neverKnows.matches.map(m => [sum(m.players, p => p.unsureAnswers), sum(m.players, p => p.answers)])));
        check(sum(neverKnows.matches, m => m.advisories.requested + m.help.requested) > 0,
            'com perfil 25% e chances de pedir 1, deveria haver pedidos de apoio');

        // Sem apoio, quem não sabe chuta 1 em 4: o acerto observado fica no perfil.
        const alonePlayers = alone.matches.flatMap(m => m.players);
        const off = [];
        for (const accuracy of [0.4, 0.6, 0.8]) {
            const group = alonePlayers.filter(p => p.accuracy === accuracy);
            const answered = sum(group, p => p.answers);
            const rate = answered ? sum(group, p => p.correct) / answered : NaN;
            if (!(answered >= 200 && Math.abs(rate - accuracy) <= 0.08)) {
                off.push('perfil ' + accuracy + ': ' + answered + ' respostas, acerto ' + rate);
            }
        }
        check(off.length === 0, 'sem apoio, o acerto observado de cada perfil deveria ficar a até 8 pontos do perfil (com 200 respostas ou mais): ' +
            off.join('; '));
    });

    test('T127 Simulador: quem pede apoio chama de preferência quem acerta mais, com ruído', () => {
        const choose = simulator && simulator.chooseSupporter;
        check(typeof choose === 'function', 'o simulador deveria exportar chooseSupporter(candidates, accuracyOf, noise, random)');
        const candidates = [{ name: 'A' }, { name: 'B' }, { name: 'C' }];
        const accuracyOf = (c) => ({ A: 0.4, B: 0.8, C: 0.6 })[c.name];
        const random = seededRandom(99);
        const exact = Array.from({ length: 50 }, () => choose(candidates, accuracyOf, 0, random).name);
        check(exact.every(name => name === 'B'), 'sem ruído, deveria chamar sempre quem acerta mais (B), veio: ' + exact.join(','));
        const counts = { A: 0, B: 0, C: 0 };
        for (let i = 0; i < 400; i++) counts[choose(candidates, accuracyOf, 0.2, random).name]++;
        check(counts.B > 300 && counts.C > 0 && counts.A === 0,
            'com ruído ±0,2 (80% contra 60% e 40%), B deveria ser chamado na maioria das vezes, C às vezes e A nunca, veio: ' + JSON.stringify(counts));
        check(choose([], accuracyOf, 0.2, random) === null, 'sem ninguém para chamar, deveria devolver null');

        // Na partida, sem ruído: nas partidas com os dois perfis, quem tem 90% assessora muito mais que quem tem 40%.
        const run = valueOf(calling);
        const mixed = run.matches.filter(m => m.players.some(p => p.accuracy === 0.9) && m.players.some(p => p.accuracy === 0.4));
        const mixedPlayers = mixed.flatMap(m => m.players);
        const givenPerPlayer = (accuracy) => {
            const group = mixedPlayers.filter(p => p.accuracy === accuracy);
            return sum(group, p => p.advisoriesGiven) / group.length;
        };
        check(mixed.length > 0 && sum(mixedPlayers, p => p.advisoriesGiven) > 0,
            'pré-condição: deveria haver partidas com os perfis 40% e 90% e assessorias dadas');
        check(givenPerPlayer(0.9) > 3 * givenPerPlayer(0.4),
            'sem ruído, quem tem 90% deveria dar mais que o triplo das assessorias de quem tem 40% (por jogador), veio: ' +
            givenPerPlayer(0.9) + ' contra ' + givenPerPlayer(0.4));
    });

    test('T128 Simulador: quem é chamado aceita quando sabe — sem aceitar sem saber, toda ajuda aceita acerta e toda assessoria aceita paga honorário (HELP_REWARD trocado vale)', () => {
        const { help, advisory } = valueOf(accepting);
        const reward = 5;
        const fee = C.RESOURCES.ADVISORY_FEE;
        const h = help.matches;
        check(h.every(m => m.config.RESOURCES.HELP_REWARD === reward), 'a troca RESOURCES.HELP_REWARD=5 deveria valer na partida');
        check(sum(h, m => m.help.accepted) > 0 && sum(h, m => m.help.declined) > 0,
            'com acerto 50%, quem é chamado para ajudar deveria aceitar (quando sabe) e recusar (quando não sabe), veio: ' +
            JSON.stringify(h.map(m => m.help)));
        check(h.every(m => m.help.coverTotal === 0), 'sem aceitar sem saber, nenhuma ajuda aceita deveria errar (sem cobertura), veio: ' +
            JSON.stringify(h.map(m => m.help)));
        check(h.every(m => m.help.rewardTotal % reward === 0 && m.help.rewardTotal <= m.help.accepted * reward &&
            m.help.rewardTotal >= (m.help.accepted - 1) * reward),
            'cada ajuda aceita deveria dar a recompensa trocada (5), veio: ' + JSON.stringify(h.map(m => m.help)));

        const a = advisory.matches;
        check(sum(a, m => m.advisories.accepted) > 0 && sum(a, m => m.advisories.declined) > 0,
            'com acerto 50%, o assessor deveria aceitar (quando sabe) e recusar (quando não sabe), veio: ' + JSON.stringify(a.map(m => m.advisories)));
        check(a.every(m => m.advisories.feeTotal % fee === 0 && m.advisories.feeTotal <= m.advisories.accepted * fee &&
            m.advisories.feeTotal >= (m.advisories.accepted - 1) * fee),
            'sem assessorar sem saber, cada assessoria aceita deveria pagar o honorário (RESOURCES.ADVISORY_FEE = ' + fee + '), veio: ' +
            JSON.stringify(a.map(m => m.advisories)));
    });

    test('T129 Simulador: relatório com estouro, menor recurso, apoio sem saber, ajuda por partida, honorários do vencedor e apoio por perfil; CSV com as colunas novas', () => {
        const { run, report: text, csv: sheet } = valueOf(economyRun);
        const n = simulator.formatNumber;
        const players = run.matches.flatMap(m => m.players);
        const pctOf = (part, whole) => n(100 * part / whole, 1) + '%';
        const avg = (list) => list.reduce((t, v) => t + v, 0) / list.length;
        const reportLines = text.split('\n');
        const rowOf = (label) => reportLines.find(l => l.startsWith('| ' + label + ' |')) || '';

        const overrun = players.filter(p => p.minResources < 0).length;
        check(overrun > 0, 'pré-condição: com STARTING_RESOURCES 2, alguém deveria entrar em estouro');
        const withFees = run.matches.filter(m => m.advisories.feeTotal > 0);
        const wonByTopFee = withFees.filter(m => m.players[0].feesReceived === Math.max(...m.players.map(p => p.feesReceived))).length;
        const expected = [
            ['Jogadores que entraram em estouro (recurso negativo)', pctOf(overrun, players.length)],
            ['Menor recurso na partida (por jogador)', 'média ' + n(avg(players.map(p => p.minResources)))],
            ['Jogadores que terminaram abaixo de −5 recursos', pctOf(players.filter(p => p.resources < -5).length, players.length)],
            ['Perguntas em que quem respondia não sabia, por partida', n(avg(run.matches.map(m => sum(m.players, p => p.unsureAnswers))))],
            ['Dessas, com apoio pedido', pctOf(sum(players, p => p.advisoriesAsked + p.helpsAsked), sum(players, p => p.unsureAnswers))],
            ['Partidas com pelo menos uma ajuda aceita', pctOf(run.matches.filter(m => m.help.accepted > 0).length, run.matches.length)],
            ['Partidas vencidas por quem mais recebeu honorários', withFees.length ? pctOf(wonByTopFee, withFees.length) : '—']
        ];
        const wrong = expected.filter(([label, value]) => !rowOf(label).includes(value))
            .map(([label, value]) => label + ' (esperado ' + value + '): "' + rowOf(label) + '"');
        check(wrong.length === 0, 'linhas do relatório: ' + wrong.join('; '));

        check(text.includes('### 🤝 Apoio por perfil'), 'o relatório deveria ter a seção "Apoio por perfil"');
        const supportHeader = reportLines.find(l => l.startsWith('| Perfil (chance de acerto) |') && l.includes('Honorários recebidos')) || '';
        const columns = ['Assessorias pedidas', 'Assessorias dadas', 'Ajudas pedidas', 'Ajudas dadas', 'Honorários recebidos',
            'Recompensas recebidas', 'Coberturas pagas', 'Saldo do apoio (recursos)', 'Entraram em estouro'];
        check(columns.every(c => supportHeader.includes(c)), 'a tabela de apoio por perfil deveria ter as colunas ' + columns.join(', ') + ', veio: ' + supportHeader);
        check(reportLines.some(l => l.startsWith('| Perfil (chance de acerto) |') && l.includes('KPI Final médio')),
            'a tabela de justiça deveria ter a coluna "KPI Final médio"');
        const profiles = [...new Set(players.map(p => p.accuracy))];
        check(profiles.every(acc => reportLines.filter(l => l.startsWith('| ' + n(100 * acc) + '% |')).length === 2),
            'cada perfil deveria ter uma linha na justiça e uma no apoio por perfil');
        check(text.includes('Pede assessoria quando não sabe') && text.includes('Escolha de quem chamar'),
            'a tabela dos robôs deveria mostrar as decisões novas');

        const sheetLines = sheet.trim().split('\n');
        const csvHeader = sheetLines[0].split(';');
        const col = (name) => csvHeader.indexOf(name);
        check(col('advisories_asked') >= 0 && col('unsure_answers') >= 0, 'o CSV deveria ter as colunas advisories_asked e unsure_answers, veio: ' + sheetLines[0]);
        const columnTotal = (name) => sheetLines.slice(1).reduce((t, l) => t + Number(l.split(';')[col(name)].replace(',', '.')), 0);
        check(columnTotal('advisories_asked') === sum(run.matches, m => m.advisories.requested) &&
            columnTotal('unsure_answers') === sum(players, p => p.unsureAnswers),
            'as colunas novas do CSV deveriam somar os totais das partidas');
    });

    finish('Simulador de partidas');
})().catch((err) => {
    console.log('❌ Erro inesperado no arquivo de testes do simulador: ' + (err && err.stack || err));
    process.exit(1);
});
