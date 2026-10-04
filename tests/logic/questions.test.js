// ============================================
// PM: The KPI Master - Testes de lógica: Banco de perguntas
// ============================================
// Confere o arquivo de perguntas (data/questions.pt-BR.json): formato
// que o jogo espera (4 alternativas "a) ".."d) ", gabarito de a a d,
// ids únicos, áreas de foco válidas), gabarito equilibrado entre as
// letras e as perguntas retiradas na revisão do professor.
// Ambiente simulado e ajudantes: environment.js. Rodar a partir da raiz:
//     node tests/logic/questions.test.js
// ============================================

const {
    fs, path, vm, RAIZ, createEnvironment, tokenOf, test, check, start, finish,
    syncTo, roundScreens, unavailable, roomToReload, reloadHost, tryReloadHost, recordScreens
} = require('./environment');

start('Banco de perguntas');

/** Perguntas do arquivo real, com o domínio de cada uma. */
function loadQuestions() {
    const data = JSON.parse(fs.readFileSync(path.join(RAIZ, 'data/questions.pt-BR.json'), 'utf8'));
    const all = [];
    for (const [domainKey, domain] of Object.entries(data.domains)) {
        for (const q of domain.questions) all.push({ domainKey, q });
    }
    return { data, all };
}

/** Ids das áreas de foco do config real (CONFIG.FASES). */
function focusAreaIds() {
    const ctx = vm.createContext({});
    vm.runInContext('var window = this;' + fs.readFileSync(path.join(RAIZ, 'config/game-config.js'), 'utf8'), ctx);
    return vm.runInContext('CONFIG.FASES', ctx).map(f => f.id);
}

test('T73 Banco de perguntas no formato que o jogo espera: 4 alternativas "a) ".."d) ", gabarito de a a d, ids únicos, áreas de foco válidas', () => {
    const { data, all } = loadQuestions();
    const areas = focusAreaIds();
    const ids = new Set();
    for (const [domainKey, domain] of Object.entries(data.domains)) {
        check(typeof domain.name === 'string' && domain.name.length > 0, domainKey + ': falta o nome do domínio');
        check(Array.isArray(domain.areas) && domain.areas.length > 0, domainKey + ': falta a lista de áreas de foco');
        for (const a of domain.areas) check(areas.includes(a), domainKey + ': área de foco desconhecida "' + a + '"');
        check(Array.isArray(domain.questions) && domain.questions.length > 0, domainKey + ': sem perguntas');
    }
    for (const { domainKey, q } of all) {
        const onde = domainKey + '/' + q.id;
        check(typeof q.id === 'string' && !ids.has(q.id), onde + ': id ausente ou repetido');
        ids.add(q.id);
        check(typeof q.question === 'string' && q.question.trim().length > 0, onde + ': sem enunciado');
        check(Array.isArray(q.alternatives) && q.alternatives.length === 4, onde + ': deveria ter 4 alternativas');
        q.alternatives.forEach((alt, i) => {
            const letra = 'abcd'[i];
            check(typeof alt === 'string' && alt.startsWith(letra + ') ') && alt.length > 3,
                onde + ': a alternativa ' + (i + 1) + ' deveria começar com "' + letra + ') ", veio: ' + JSON.stringify(alt));
        });
        check(['a', 'b', 'c', 'd'].includes(q.correct), onde + ': gabarito deveria ser a, b, c ou d, veio: ' + JSON.stringify(q.correct));
    }
    // Toda área de foco tem perguntas para sortear.
    for (const a of areas) {
        const total = Object.values(data.domains).filter(d => d.areas.includes(a)).reduce((n, d) => n + d.questions.length, 0);
        check(total > 0, 'a área de foco "' + a + '" ficou sem perguntas');
    }
});

test('T74 Gabarito equilibrado: cada letra é a resposta certa de 20% a 30% das perguntas', () => {
    const { all } = loadQuestions();
    const contagem = { a: 0, b: 0, c: 0, d: 0 };
    for (const { q } of all) contagem[q.correct] = (contagem[q.correct] || 0) + 1;
    const total = all.length;
    for (const letra of ['a', 'b', 'c', 'd']) {
        const fracao = contagem[letra] / total;
        check(fracao >= 0.2 && fracao <= 0.3,
            'a letra ' + letra + ' é a certa em ' + contagem[letra] + ' de ' + total + ' perguntas (' + Math.round(fracao * 100) + '%) — distribuição: ' + JSON.stringify(contagem));
    }
});

test('T75 Revisão do professor: perguntas retiradas não voltam ao banco', () => {
    const { all } = loadQuestions();
    const ids = all.map(({ q }) => q.id);
    for (const id of ['gov_7', 'gov_9', 'gov_15', 'fin_2', 'fin_3']) {
        check(!ids.includes(id), 'a pergunta ' + id + ' foi retirada na revisão e não deveria estar no banco');
    }
    check(all.length === 71, 'o banco deveria ter 71 perguntas depois da revisão, tem ' + all.length);
});

finish('Banco de perguntas');
