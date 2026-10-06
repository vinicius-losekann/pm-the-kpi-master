// ============================================
// PM: The KPI Master - Testes de lógica: Configuração e textos da tela
// ============================================
// Confere as chaves do CONFIG (config/game-config.js): o jogo e os testes
// só usam chaves que existem no config real, e o CONFIG de teste tem o
// mesmo formato do real. Confere também os textos da tela
// (js/locales/pt-BR.js): toda chave pedida existe, toda chave do
// dicionário é usada e cada chamada passa os marcadores que o texto usa.
// E os nomes do HTML e do CSS (IDs, classes e atributos data-*): o jogo e
// os testes no navegador só pedem o que existe no HTML e no CSS, e o CSS
// não tem regra que nenhuma tela usa.
// Ambiente simulado e ajudantes: environment.js. Rodar a partir da raiz:
//     node tests/logic/config-and-texts.test.js
// ============================================

const {
    fs, path, vm, ROOT, createEnvironment, test, check, start, finish
} = require('./environment');

start('Configuração e textos da tela');

/** CONFIG do config/game-config.js real. */
function realConfig() {
    const ctx = vm.createContext({});
    vm.runInContext('var window = this;' + fs.readFileSync(path.join(ROOT, 'config/game-config.js'), 'utf8'), ctx);
    return vm.runInContext('CONFIG', ctx);
}

/** Arquivos .js de uma pasta do repositório, com subpastas. */
function jsFilesIn(dir) {
    const full = path.join(ROOT, dir);
    return fs.readdirSync(full, { withFileTypes: true }).flatMap(entry => {
        const rel = dir + '/' + entry.name;
        if (entry.isDirectory()) return jsFilesIn(rel);
        return entry.name.endsWith('.js') ? [rel] : [];
    });
}

/** Caminhos de chave (ex.: "GAME.ANSWER_TIMEOUT") de um objeto, sem descer em listas. */
function keyPaths(obj, prefix = '') {
    return Object.entries(obj).flatMap(([key, value]) => {
        const p = prefix + key;
        return value && typeof value === 'object' && !Array.isArray(value) ? [p, ...keyPaths(value, p + '.')] : [p];
    });
}

/** Valor de um caminho de chave ("GAME.ANSWER_TIMEOUT") em `obj`, ou undefined. */
function valueAt(obj, keyPath) {
    return keyPath.split('.').reduce((o, k) => (o && typeof o === 'object' ? o[k] : undefined), obj);
}

// Chaves do CONFIG antes da tradução para inglês.
const OLD_CONFIG_KEYS = [
    'JOGO', 'FASES', 'nome', 'RECURSOS_INICIAIS', 'ACERTO_BASE', 'VALOR_RECURSO_FINAL', 'VALOR_VENDA_RECURSO',
    'ASSESSORIA_ACERTO', 'ASSESSORIA_TIMEOUT', 'RESPOSTA_TIMEOUT', 'ACTIVITIES_PER_PHASE'
];

test('T87 CONFIG em inglês: o jogo e os testes só usam chaves que existem no config real; prazo próprio para a oferta de ajuda', (use) => {
    const C = realConfig();

    // 1) O config real tem as chaves novas e nenhuma antiga.
    for (const keyPath of ['GAME.MAX_PLAYERS', 'GAME.MIN_PLAYERS', 'GAME.SESSION_DURATION', 'GAME.ACTIVITIES_PER_FOCUS_AREA',
        'GAME.HOST_TIMEOUT', 'GAME.ADVISORY_TIMEOUT', 'GAME.HELP_OFFER_TIMEOUT', 'GAME.ANSWER_TIMEOUT', 'STARTING_RESOURCES',
        'KPI.CORRECT_ANSWER', 'KPI.FINAL_RESOURCE_VALUE', 'KPI.RESOURCE_PRICE', 'KPI.ADVISOR_BONUS']) {
        check(typeof valueAt(C, keyPath) === 'number', 'config/game-config.js deveria ter CONFIG.' + keyPath + ' (número)');
    }
    check(C.GAME.HELP_OFFER_TIMEOUT === 20000, 'a oferta de ajuda deveria continuar com 20s, veio: ' + C.GAME.HELP_OFFER_TIMEOUT);
    check(Array.isArray(C.FOCUS_AREAS) && C.FOCUS_AREAS.length === 5 &&
        C.FOCUS_AREAS.every(f => typeof f.id === 'string' && typeof f.name === 'string' && typeof f.emoji === 'string'),
        'CONFIG.FOCUS_AREAS deveria ter as 5 áreas foco com id, name e emoji');
    const oldInReal = keyPaths(C).concat(C.FOCUS_AREAS ? C.FOCUS_AREAS.flatMap(f => Object.keys(f)) : [])
        .filter(p => OLD_CONFIG_KEYS.includes(p.split('.').pop()));
    check(oldInReal.length === 0, 'config/game-config.js ainda tem chaves antigas: ' + oldInReal.join(', '));

    // 2) Toda referência CONFIG.X.Y (ou config.X.Y, o parâmetro das regras)
    // no jogo e nos testes existe no config real; nenhum nome antigo
    // sobrou, nem em comentário.
    const files = [...jsFilesIn('js'), 'config/game-config.js', ...jsFilesIn('tests/browser'),
        ...jsFilesIn('tests/logic').filter(f => !f.endsWith('config-and-texts.test.js'))];
    const missing = [];
    const oldWords = [];
    // nome, JOGO e FASES também são palavras em português (ex.: "FIM DE
    // JOGO" num comentário): só contam como chave (".JOGO", "FASES:",
    // ".nome" — o nome da área foco lido pela tela e pela rodada).
    const portugueseWords = ['nome', 'JOGO', 'FASES'];
    const oldWordPattern = new RegExp('\\b(' + OLD_CONFIG_KEYS.filter(k => !portugueseWords.includes(k)).join('|') + ')\\b' +
        '|\\.(JOGO|FASES|nome)\\b|\\b(JOGO|FASES)\\s*:');
    for (const file of files) {
        fs.readFileSync(path.join(ROOT, file), 'utf8').split('\n').forEach((line, i) => {
            for (const match of line.matchAll(/\b(?:CONFIG|config)((?:\.[A-Z][A-Z0-9_]*)+)/g)) {
                const keyPath = match[1].slice(1);
                if (valueAt(C, keyPath) === undefined) missing.push(file + ':' + (i + 1) + ' CONFIG.' + keyPath);
            }
            const old = line.match(oldWordPattern);
            if (old) oldWords.push(file + ':' + (i + 1) + ' ' + old[0]);
        });
    }
    check(missing.length === 0, 'chaves que não existem no config real: ' + missing.join('; '));
    check(oldWords.length === 0, 'nomes antigos do CONFIG: ' + oldWords.join('; '));

    // 3) O CONFIG de teste tem o mesmo formato do real (só chaves que o real tem).
    const env = use(createEnvironment());
    const notInReal = keyPaths(env.CONFIG).filter(p => valueAt(C, p) === undefined);
    check(notInReal.length === 0, 'o CONFIG de teste (environment.js) tem chaves que o real não tem: ' + notInReal.join(', '));
    const notInTest = keyPaths(C).filter(p => /^(GAME|KPI)\.|^STARTING_RESOURCES$|^FOCUS_AREAS$/.test(p) && valueAt(env.CONFIG, p) === undefined);
    check(notInTest.length === 0, 'faltam no CONFIG de teste (environment.js) chaves do jogo e do KPI: ' + notInTest.join(', '));
    check(env.CONFIG.FOCUS_AREAS.every(f => f.id && f.name && f.emoji), 'as áreas foco do CONFIG de teste deveriam ter id, name e emoji');

    // 4) A oferta de ajuda usa HELP_OFFER_TIMEOUT e a assessoria, ADVISORY_TIMEOUT.
    env.createRoomAsHost();
    env.join('A', 'peer-a');
    env.join('B', 'peer-b');
    env.startMatch();
    env.CONFIG.GAME.ADVISORY_TIMEOUT = 25000;
    env.CONFIG.GAME.HELP_OFFER_TIMEOUT = 35000;
    const time = env.fakeTime();
    const r = env.state.currentRound;
    const third = ['Host', 'A', 'B'].find(n => n !== r.asker && n !== r.answerer);
    env.Game.core.handleAdvisoryRequest({ type: 'advisory-request', advisorName: third, requesterName: r.answerer });
    check(env.state.currentRound.advisory && env.state.currentRound.advisory.status === 'pending', 'a assessoria deveria ficar pendente');
    time.advance(24999);
    check(env.state.currentRound.advisory.status === 'pending', 'a assessoria não deveria vencer antes de ADVISORY_TIMEOUT');
    time.advance(1);
    check(env.state.currentRound.advisory.status === 'declined', 'a assessoria deveria vencer em ADVISORY_TIMEOUT (25s), veio: ' + env.state.currentRound.advisory.status);

    Object.assign(env.player('A'), { resources: 0, kpi: 20 });
    Object.assign(env.player('B'), { resources: 5 });
    env.Game.network.handleMessage({ type: 'help-request', requesterName: 'A' }, 'peer-a');
    check(env.state.helpQueue && JSON.stringify(env.state.helpQueue.candidates) === '["Host","B"]',
        'a fila deveria ser Host (10 recursos) e B (5), veio: ' + JSON.stringify(env.state.helpQueue));
    time.advance(34999);
    check(env.state.helpQueue && env.state.helpQueue.index === 0, 'a oferta ao Host não deveria vencer antes de HELP_OFFER_TIMEOUT (ADVISORY_TIMEOUT é 25s)');
    time.advance(1);
    check(env.state.helpQueue && env.state.helpQueue.index === 1, 'a oferta deveria passar ao próximo em HELP_OFFER_TIMEOUT (35s), veio: ' + JSON.stringify(env.state.helpQueue));
});

/** Dicionário do js/locales/pt-BR.js real. */
function realDictionary() {
    const ctx = vm.createContext({});
    vm.runInContext('var window = this;' + fs.readFileSync(path.join(ROOT, 'js/locales/pt-BR.js'), 'utf8'), ctx);
    return vm.runInContext("Game.locales['pt-BR']", ctx);
}

/** Marcadores {{x}} de um texto, em ordem alfabética e sem repetição. */
function markersOf(text) {
    return [...new Set([...text.matchAll(/\{\{(\w+)\}\}/g)].map(m => m[1]))].sort();
}

/**
 * Nomes passados no objeto que abre em `source[open]` ("{"), até a chave
 * que o fecha: "{ attempt, max: maxAttempts }" → ["attempt", "max"].
 * Vírgulas dentro de parênteses (Math.max(seconds, 0)) não separam nomes.
 */
function namesInObjectAt(source, open) {
    const parts = [];
    let part = '';
    let depth = 0;
    for (let i = open + 1; i < source.length; i++) {
        const ch = source[i];
        if ('({['.includes(ch)) depth++;
        if (')}]'.includes(ch)) depth--;
        if (depth < 0) break;
        if (ch === ',' && depth === 0) { parts.push(part); part = ''; } else { part += ch; }
    }
    parts.push(part);
    return parts.map(p => p.trim()).filter(Boolean).map(p => p.match(/^\w+/)[0]).sort();
}

// Chaves dos textos da tela antes da tradução para inglês → nome novo.
// Ficam como estavam: lobby.badgeHost, advisory.timeout, result.kpiZero.
const I18N_RENAMES = {
    'lobby.aguardandoHost': 'lobby.waitingForHost',
    'lobby.partidaEmAndamentoTitulo': 'lobby.matchInProgressTitle',
    'lobby.partidaEmAndamentoDesc': 'lobby.matchInProgressDesc',
    'lobby.emJogo': 'lobby.playing',
    'lobby.aguardando': 'lobby.waiting',
    'lobby.aguardandoJogadores': 'lobby.waitingForPlayers',
    'lobby.badgeAguardando': 'lobby.badgeWaiting',
    'controls.prontoParaIniciar': 'controls.readyToStart',
    'controls.minimoJogadores': 'controls.minPlayers',
    'controls.copiado': 'controls.copied',
    'controls.copiar': 'controls.copy',
    'question.voceEstaPerguntando': 'question.youAreAsking',
    'question.tempoRestante': 'question.timeLeft',
    'question.rodadaEncerradaHost': 'question.roundEndedHost',
    'question.rodadaEncerradaGuest': 'question.roundEndedGuest',
    'question.partidaPausada': 'question.matchPaused',
    'spectator.aguardandoPergunta': 'spectator.waitingForQuestion',
    'advisory.nenhumJogadorDisponivel': 'advisory.noAdvisorAvailable',
    'advisory.aguardandoResposta': 'advisory.waitingForAnswer',
    'advisory.sugestao': 'advisory.suggestion',
    'advisory.recusado': 'advisory.declined',
    'advisory.invalido': 'advisory.invalid',
    'advisory.faseEncerramento': 'advisory.closingFocusArea',
    'advisory.tempoRestante': 'advisory.timeLeft',
    'trade.pedidoRecebido': 'trade.helpOffer',
    'trade.semKpiParaPedirAjuda': 'trade.insufficientKpi',
    'trade.ninguemPodeAjudar': 'trade.noHelp',
    'result.acertou': 'result.correct',
    'result.errou': 'result.wrong',
    'result.kpiGanho': 'result.kpiGained',
    'result.comRecursos': 'result.withResources',
    'result.assessoriaTitulo': 'result.advisoryTitle',
    'result.assessoriaBonus': 'result.advisorBonus',
    'ranking.nenhumJogadorAtivo': 'ranking.noActivePlayers',
    'ranking.formulaKpiFinal': 'ranking.finalKpiFormula',
    'ranking.detalheRanking': 'ranking.rankingDetail',
    'ranking.desconectado': 'ranking.disconnected',
    'connection.conectado': 'connection.connected',
    'connection.desconectado': 'connection.disconnected',
    'connection.erro': 'connection.error',
    'connection.naoFoiPossivelConectar': 'connection.couldNotConnect',
    'connection.reconectando': 'connection.reconnecting',
    'connection.hostDesconectado': 'connection.hostDisconnected',
    'connection.reconectandoHost': 'connection.reconnectingToHost',
    'connection.reconectado': 'connection.reconnected',
    'connection.procurandoNovoHost': 'connection.searchingForNewHost',
    'connection.naoFoiPossivelReconectar': 'connection.couldNotReconnect',
    'connection.falhaAssumirHost': 'connection.hostTakeoverFailed'
};
const OLD_I18N_KEYS = Object.keys(I18N_RENAMES);
const OLD_I18N_MARKERS = ['assessor', 'sugestao', 'perguntador', 'respondedor', 'recursos', 'valor', 'kpiRecursos'];
const I18N_MARKERS = ['advisor', 'answerer', 'asker', 'attempt', 'bonus', 'count', 'kpi', 'max', 'min',
    'requester', 'resources', 'resourcesKpi', 'seconds', 'suggestion', 'value'];

test('T88 Textos da tela em inglês: toda chave pedida existe no pt-BR.js real, toda chave dele é usada e cada chamada passa os marcadores do texto', () => {
    const dict = realDictionary();
    const textKeys = keyPaths(dict).filter(p => typeof valueAt(dict, p) === 'string');

    // 1) O dicionário tem as chaves e os marcadores novos e nenhum antigo.
    const missingNew = Object.values(I18N_RENAMES).concat(['lobby.badgeHost', 'advisory.timeout', 'result.kpiZero'])
        .filter(k => !textKeys.includes(k));
    check(missingNew.length === 0, 'faltam no pt-BR.js as chaves novas: ' + missingNew.join(', '));
    const oldKeys = textKeys.filter(k => OLD_I18N_KEYS.includes(k));
    check(oldKeys.length === 0, 'o pt-BR.js ainda tem chaves antigas: ' + oldKeys.join(', '));
    const markers = [...new Set(textKeys.flatMap(k => markersOf(valueAt(dict, k))))].sort();
    const oldMarkers = markers.filter(m => OLD_I18N_MARKERS.includes(m));
    check(oldMarkers.length === 0, 'o pt-BR.js ainda tem marcadores antigos: ' + oldMarkers.join(', '));
    check(JSON.stringify(markers) === JSON.stringify(I18N_MARKERS), 'os marcadores do pt-BR.js deveriam ser ' + I18N_MARKERS.join(', ') + '; vieram: ' + markers.join(', '));

    // 2) Toda chave 'secao.chave' do jogo (inclusive num ternário ou em
    // comentário) existe no dicionário; e cada chamada passa ao texto
    // exatamente os marcadores que ele usa (nenhum, se não vem objeto).
    const keyPattern = new RegExp('([\'"])((?:' + Object.keys(dict).join('|') + ')\\.\\w+)\\1', 'g');
    const used = new Set();
    const notInDict = [];
    const wrongMarkers = [];
    for (const file of jsFilesIn('js').filter(f => !f.startsWith('js/locales/'))) {
        const source = fs.readFileSync(path.join(ROOT, file), 'utf8');
        for (const match of source.matchAll(keyPattern)) {
            const key = match[2];
            const where = file + ':' + source.slice(0, match.index).split('\n').length + ' ' + key;
            used.add(key);
            const text = valueAt(dict, key);
            if (typeof text !== 'string') { notInDict.push(where); continue; }
            const after = source.slice(match.index + match[0].length);
            const call = after.match(/^\s*,\s*\{/);
            const passed = call ? namesInObjectAt(after, call[0].length - 1) : [];
            const expected = markersOf(text);
            if (JSON.stringify(passed) !== JSON.stringify(expected)) {
                wrongMarkers.push(where + ' passa [' + passed.join(', ') + '], o texto usa [' + expected.join(', ') + ']');
            }
        }
    }
    check(notInDict.length === 0, 'chaves que não existem no pt-BR.js: ' + notInDict.join('; '));
    check(wrongMarkers.length === 0, 'marcadores diferentes dos do texto: ' + wrongMarkers.join('; '));
    const unused = textKeys.filter(k => !used.has(k));
    check(unused.length === 0, 'chaves do pt-BR.js que o jogo não usa: ' + unused.join(', '));
});

// IDs de elemento do game.html antes da tradução para inglês → nome novo.
const ELEMENT_ID_RENAMES = {
    btnNovaRodada: 'btnNewRound',
    btnPedirAjuda: 'btnRequestHelp',
    btnPedirAssessoria: 'btnRequestAdvisory',
    btnAceitarAjudaOferta: 'btnAcceptHelpOffer',
    btnRecusarAjudaOferta: 'btnDeclineHelpOffer',
    btnRecusarAssessoria: 'btnDeclineAdvisory',
    btnFecharEvento: 'btnCloseEvent',
    btnFecharPedirAjuda: 'btnCloseHelpRequest',
    btnFecharAssessoriaSelect: 'btnCloseAdvisorySelect',
    modalEvento: 'modalEvent',
    modalPedirAjuda: 'modalHelpRequest',
    modalAjudaOferta: 'modalHelpOffer',
    modalAssessoriaSelect: 'modalAdvisorySelect',
    modalAssessoriaQuestion: 'modalAdvisoryQuestion',
    modalResponderPergunta: 'modalAnswerQuestion',
    respostaTimerText: 'answerTimerText',
    respModalPerguntador: 'answerModalAsker',
    respModalRespondedor: 'answerModalAnswerer',
    respModalQuestionText: 'answerModalQuestionText',
    respModalRoundInfo: 'answerModalRoundInfo',
    perguntadorName: 'askerName',
    respondedorName: 'answererName',
    assessoriaArea: 'advisoryArea',
    assessoriaStatus: 'advisoryStatus',
    assessoriaJogadoresList: 'advisoryPlayersList',
    assessoriaAlternativesList: 'advisoryAlternativesList',
    assessoriaModalPerguntador: 'advisoryModalAsker',
    assessoriaModalRespondedor: 'advisoryModalAnswerer',
    assessoriaModalRoundInfo: 'advisoryModalRoundInfo',
    assessoriaQuestionText: 'advisoryQuestionText',
    assessoriaTimerText: 'advisoryTimerText',
    ajudaTentandoCom: 'helpTryingWith',
    ajudaOfertaTexto: 'helpOfferText',
    ajudaValorKPI: 'helpKpiCost',
    eventoModalTitulo: 'eventModalTitle',
    eventoModalDesc: 'eventModalDesc',
    myRecursos: 'myResources',
    phasesList: 'focusAreasList',
    kpiFinalFormula: 'finalKpiFormula',
    resultTabuleiroReminder: 'resultBoardReminder'
};
// Classes antes da tradução → nome novo. As com regra no style.css:
const STYLED_CLASS_RENAMES = {
    'phases-card': 'focus-areas-card',
    'phases-list': 'focus-areas-list',
    'phase-item': 'focus-area-item',
    'phase-status': 'focus-area-status',
    'phase-completed': 'focus-area-completed',
    'phase-current': 'focus-area-current',
    'mini-phase': 'mini-focus-area',
    'role-perguntador': 'role-asker',
    'badge-area': 'badge-domain',
    'badge-group': 'badge-focus-area'
};
// ...e as que só servem de marcação (sem regra no CSS).
const UNSTYLED_CLASS_RENAMES = {
    'assessoria-area': 'advisory-area',
    'assessor-select-btn': 'advisor-select-btn'
};
// ...e as que nenhuma tela usava (regras apagadas do CSS; o nome antigo não pode voltar).
const REMOVED_CLASS_RENAMES = {
    'final-rank-phase': 'final-rank-focus-area',
    'role-respondedor': 'role-answerer'
};
const DATA_ATTRIBUTE_RENAMES = { 'data-assessor-name': 'data-advisor-name', 'data-phase': 'data-focus-area' };
const DATASET_RENAMES = { assessorName: 'advisorName' };

/** Texto de um arquivo do repositório. */
function readRepoFile(file) {
    return fs.readFileSync(path.join(ROOT, file), 'utf8');
}

/** Texto pronto para entrar numa RegExp como está ("a.b" → "a\.b"). */
function escapeRegExp(text) {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** IDs (id="...") de um HTML. */
function htmlIds(html) {
    return new Set([...html.matchAll(/\bid="([\w-]+)"/g)].map(m => m[1]));
}

/** Seletores do CSS (o texto antes de cada "{", fora dos comentários). */
function cssSelectors(css) {
    return css.replace(/\/\*[\s\S]*?\*\//g, '').split('{').map(part => part.split('}').pop());
}

/** Classes que têm regra no CSS (os ".nome" dos seletores). */
function cssClasses(css) {
    return new Set(cssSelectors(css).flatMap(s => [...s.matchAll(/\.([A-Za-z][\w-]*)/g)].map(m => m[1])));
}

/** IDs que têm regra no CSS (os "#nome" dos seletores). */
function cssIds(css) {
    return new Set(cssSelectors(css).flatMap(s => [...s.matchAll(/#([A-Za-z][\w-]*)/g)].map(m => m[1])));
}

/** Texto sem comentários (de bloco, de HTML e linhas //): nome citado só em comentário não conta como uso. */
function withoutComments(text) {
    return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/<!--[\s\S]*?-->/g, '').replace(/^\s*\/\/.*$/gm, '');
}

/** Classes de um texto: os nomes dentro de class="..." (sem os pedaços montados com ${...}). */
function classTokens(text) {
    return [...text.matchAll(/class="([^"]*)"/g)]
        .flatMap(m => m[1].replace(/\$\{[^}]*\}/g, ' ').split(/\s+/))
        .filter(c => /^[A-Za-z][\w-]*$/.test(c));
}

/** "advisorName" → "data-advisor-name". */
function dataAttributeOf(datasetName) {
    return 'data-' + datasetName.replace(/[A-Z]/g, ch => '-' + ch.toLowerCase());
}

test('T91 HTML e CSS em inglês: IDs, classes e atributos data-* com os nomes novos; o jogo e os testes no navegador só pedem IDs e classes que existem', (use) => {
    const gameHtml = readRepoFile('game.html');
    const indexHtml = readRepoFile('index.html');
    const css = readRepoFile('css/style.css');
    const gameIds = htmlIds(gameHtml);
    const indexIds = htmlIds(indexHtml);
    const styled = cssClasses(css);
    // Fica de fora só a migração do estado salvo, que precisa dos nomes
    // antigos dos campos (assessorName é também um campo antigo da assessoria).
    const gameJs = jsFilesIn('js').filter(f => f !== 'js/utils/persistence.js');
    const jsSources = Object.fromEntries(gameJs.map(f => [f, readRepoFile(f)]));

    // 1) Nenhum nome antigo no HTML, no CSS e no js/, só nas formas de
    // nome (id="x", #x, 'x', .x, class="... x", data-x, dataset.x).
    const scanned = { 'game.html': gameHtml, 'index.html': indexHtml, 'css/style.css': css, ...jsSources };
    const patterns = [
        ...Object.keys(ELEMENT_ID_RENAMES).map(id => [id, new RegExp('(?:\\bid=["\']|#|[\'"`])' + id + '(?![\\w-])')]),
        ...Object.keys({ ...STYLED_CLASS_RENAMES, ...UNSTYLED_CLASS_RENAMES, ...REMOVED_CLASS_RENAMES, ...DATA_ATTRIBUTE_RENAMES })
            .map(name => [name, new RegExp('(?<![\\w-])' + escapeRegExp(name) + '(?![\\w-])')]),
        ...Object.keys(DATASET_RENAMES).map(name => ['dataset.' + name, new RegExp('\\.dataset\\.' + name + '\\b')])
    ];
    const oldFound = [];
    for (const [file, source] of Object.entries(scanned)) {
        source.split('\n').forEach((line, i) => {
            for (const [name, pattern] of patterns) {
                if (pattern.test(line)) oldFound.push(file + ':' + (i + 1) + ' ' + name);
            }
        });
    }
    check(oldFound.length === 0, 'nomes antigos no HTML, no CSS ou no js/: ' + oldFound.join('; '));

    // 2) Os nomes novos existem: os IDs no game.html; as classes com regra
    // no CSS e usadas pelo HTML ou pelo js/.
    const missingIds = Object.values(ELEMENT_ID_RENAMES).filter(id => !gameIds.has(id));
    check(missingIds.length === 0, 'faltam no game.html os IDs novos: ' + missingIds.join(', '));
    const missingStyles = Object.values(STYLED_CLASS_RENAMES).filter(c => !styled.has(c));
    check(missingStyles.length === 0, 'faltam no style.css as classes novas: ' + missingStyles.join(', '));
    const allSources = gameHtml + '\n' + Object.values(jsSources).join('\n');
    const notUsed = [...Object.values(STYLED_CLASS_RENAMES), ...Object.values(UNSTYLED_CLASS_RENAMES)]
        .filter(c => !new RegExp('(?<![\\w-])' + escapeRegExp(c) + '(?![\\w-])').test(allSources));
    check(notUsed.length === 0, 'classes novas que o game.html e o js/ não usam: ' + notUsed.join(', '));

    // 3) Tudo o que o jogo pede existe: getElementById, os #id e .classe
    // dos querySelector, a lista de closeAllModals (todos os modais do
    // game.html, nenhum a mais), as classes postas por className/classList
    // (têm regra no CSS) e cada dataset.x com o seu data-x.
    const knownClasses = new Set([...classTokens(gameHtml), ...Object.values(jsSources).flatMap(classTokens)]);
    const unknown = [];
    for (const [file, source] of Object.entries(jsSources)) {
        const ids = file === 'js/entry/roomEntry.js' ? indexIds : gameIds;
        for (const m of source.matchAll(/getElementById\(\s*['"]([\w-]+)['"]\s*\)/g)) {
            if (!ids.has(m[1])) unknown.push(file + ' getElementById ' + m[1]);
        }
        for (const m of source.matchAll(/querySelector(?:All)?\(\s*['"]([^'"]+)['"]/g)) {
            for (const id of m[1].match(/#[\w-]+/g) || []) if (!ids.has(id.slice(1))) unknown.push(file + ' seletor ' + id);
            for (const c of m[1].match(/\.[\w-]+/g) || []) if (!knownClasses.has(c.slice(1))) unknown.push(file + ' seletor ' + c);
        }
        for (const m of source.matchAll(/(?:className\s*=\s*|classList\.(?:add|remove|toggle|contains)\(\s*)'([^']+)'/g)) {
            for (const c of m[1].split(/\s+/).filter(Boolean)) if (!styled.has(c)) unknown.push(file + ' classe sem regra no CSS ' + c);
        }
        for (const m of source.matchAll(/\.dataset\.(\w+)/g)) {
            if (!allSources.includes(dataAttributeOf(m[1]) + '=')) unknown.push(file + ' dataset.' + m[1] + ' sem ' + dataAttributeOf(m[1]));
        }
    }
    const modalIds = [...gameHtml.matchAll(/<div id="([\w-]+)" class="modal"/g)].map(m => m[1]).sort();
    const closeAll = (jsSources['js/ui/screenManager.js'].match(/function closeAllModals\(\)[\s\S]*?\[([\s\S]*?)\]\.forEach/) || [])[1] || '';
    const closed = [...closeAll.matchAll(/'([\w-]+)'/g)].map(m => m[1]).sort();
    check(modalIds.length === 7 && JSON.stringify(closed) === JSON.stringify(modalIds),
        'closeAllModals deveria fechar exatamente os 7 modais do game.html (' + modalIds.join(', ') + '), fecha: ' + closed.join(', '));

    // Os testes no navegador: todo #id dos seletores existe num dos HTML.
    for (const file of jsFilesIn('tests/browser')) {
        const source = readRepoFile(file);
        const asked = [...source.matchAll(/['"`]#([\w-]+)/g), ...source.matchAll(/getElementById\(\s*['"]([\w-]+)['"]\s*\)/g)];
        for (const m of asked) if (!gameIds.has(m[1]) && !indexIds.has(m[1])) unknown.push(file + ' #' + m[1]);
    }
    check(unknown.length === 0, 'IDs, classes ou data-* pedidos que não existem: ' + unknown.join('; '));

    // 4) As telas reais desenham os nomes novos, e toda classe desenhada no
    // card das áreas foco tem regra no CSS.
    const env = use(createEnvironment());
    const C = env.CONFIG;
    const elements = {};
    env.ctx.document = {
        getElementById: (id) => elements[id] || (elements[id] = { id, textContent: '', innerHTML: '', style: {} }),
        querySelectorAll: () => []
    };
    for (const file of ['js/utils/sanitize.js', 'js/domain/rankingRules.js', 'js/ui/components/profileComponent.js',
        'js/ui/components/rankingComponent.js', 'js/ui/modals/advisoryModal.js']) {
        vm.runInContext(readRepoFile(file), env.ctx, { filename: file });
    }
    const [first, second] = C.FOCUS_AREAS.map(f => f.id);
    env.ctx.renderProfileCard({ name: 'Ana', kpi: 5, resources: 0, focusArea: second, activities: 1 });
    const card = (elements.focusAreasList || {}).innerHTML || '';
    check(card.includes('class="focus-area-item focus-area-completed" data-focus-area="' + first + '"') &&
        card.includes('class="focus-area-item focus-area-current" data-focus-area="' + second + '"') &&
        card.includes('class="focus-area-status"'),
        'o card deveria marcar a área foco completa e a atual com as classes e o data-focus-area novos, veio: ' + card);
    const cardClasses = classTokens(card);
    const cardWithoutStyle = [...new Set(cardClasses)].filter(c => !styled.has(c));
    check(cardClasses.length > 0 && cardWithoutStyle.length === 0, 'classes do card sem regra no CSS: ' + cardWithoutStyle.join(', '));
    check(elements.myResources && elements.myResources.textContent === 0 &&
        elements.btnRequestHelp && elements.btnRequestHelp.style.display === 'block',
        'o card deveria mostrar 0 recursos em myResources e o botão btnRequestHelp');

    env.state.players = [
        { name: 'Ana', kpi: 5, resources: 0, focusArea: second, activities: 1 },
        { name: 'Beto', kpi: 0, resources: 3, focusArea: first, activities: 0 }
    ];
    env.ctx.updatePlayersOnlineList();
    const online = (elements.playersOnlineList || {}).innerHTML || '';
    check(online.includes('class="mini-focus-area"'), 'a lista de jogadores deveria usar a classe mini-focus-area, veio: ' + online);

    env.createRoomAsHost();
    env.join('A', 'peer-a');
    env.join('B', 'peer-b');
    env.startMatch();
    const r = env.state.currentRound;
    const third = ['Host', 'A', 'B'].find(n => n !== r.asker && n !== r.answerer);
    env.state.playerName = r.answerer;
    env.ctx.showAdvisorySelectModal();
    const list = (elements.advisoryPlayersList || {}).innerHTML || '';
    check(list.includes('advisor-select-btn" data-advisor-name="' + third + '"') &&
        elements.modalAdvisorySelect && elements.modalAdvisorySelect.style.display === 'flex',
        'a escolha do assessor deveria abrir modalAdvisorySelect com o botão de ' + third + ' (advisor-select-btn, data-advisor-name), veio: ' + list);
});

// Classes que o jogo monta juntando pedaços (não aparecem inteiras no
// código): o pedaço que as monta no js/ → as classes com regra no CSS.
const BUILT_CLASSES = {
    'feedback-${': ['feedback-info', 'feedback-warning', 'feedback-error', 'feedback-success'],
    "'top-' +": ['top-1', 'top-2', 'top-3']
};

test('T92 CSS sem regra sobrando: toda classe com regra no style.css é usada pelo HTML ou pelo js/, e todo #id dele existe no HTML', () => {
    const css = readRepoFile('css/style.css');
    const html = withoutComments(readRepoFile('game.html') + '\n' + readRepoFile('index.html'));
    const js = jsFilesIn('js').map(f => withoutComments(readRepoFile(f))).join('\n');

    // 1) As classes montadas por pedaços: o pedaço continua no js/.
    for (const [piece, classes] of Object.entries(BUILT_CLASSES)) {
        check(js.includes(piece), 'o js/ deveria montar as classes ' + classes.join(', ') + ' com ' + piece);
    }
    const built = Object.values(BUILT_CLASSES).flat();

    // 2) Toda outra classe com regra no CSS aparece no HTML ou no js/ (fora de comentário).
    const unused = [...cssClasses(css)].filter(c => !built.includes(c))
        .filter(c => !new RegExp('(?<![\\w-])' + escapeRegExp(c) + '(?![\\w-])').test(html + '\n' + js));
    check(unused.length === 0, 'classes com regra no style.css que nenhuma tela usa: ' + unused.join(', '));

    // 3) Todo #id com regra no CSS existe no game.html ou no index.html.
    const ids = htmlIds(html);
    const missingIds = [...cssIds(css)].filter(id => !ids.has(id));
    check(missingIds.length === 0, 'IDs com regra no style.css que não existem no game.html nem no index.html: ' + missingIds.join(', '));
});

finish('Configuração e textos da tela');
