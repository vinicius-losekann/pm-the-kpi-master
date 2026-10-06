// ============================================
// PM: The KPI Master - Simulador de partidas (balanceamento)
// ============================================
// Roda partidas inteiras, sem rede e sem tela, para medir quantas
// rodadas uma partida leva, como os recursos variam e se a economia e
// os eventos estão justos (roadmap 7.9). Usa as regras REAIS: carrega
// num contexto `vm` do Node o config/game-config.js, os arquivos de
// js/state/, js/domain/, js/engine/ e o js/main.js (que monta os
// baralhos a partir de data/), como os testes de tests/logic fazem.
// Nada aqui é cópia de regra do jogo, e nada do jogo é alterado: as
// trocas de config ("cenário B") valem só dentro da partida simulada.
//
// No lugar dos jogadores, robôs: o host do jogo real recebe as
// mensagens dos robôs (resposta, pedido de assessoria, resposta do
// assessor, pedido de ajuda, resposta à oferta de ajuda) pelas mesmas
// funções de Game.core que a rede chamaria. O tempo é falso (os prazos
// e o relógio de 90 minutos andam sem esperar), e o sorteio usa uma
// semente: a mesma semente repete as mesmas partidas.
//
// Roda no GitHub Actions (workflow "Simulação de partidas", botão "Run
// workflow"), por tests/simulation/run.js. Testes: T93–T99 em
// tests/logic/simulation.test.js.
// ============================================

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..', '..');

// Mesma ordem de carregamento do game.html (só o que a partida usa;
// config/game-config.js é carregado antes, à parte, para as trocas
// valerem já na criação do estado).
const GAME_FILES = [
    'js/state/selectors.js',
    'js/state/mutations.js',
    'js/state/store.js',
    'js/domain/kpiRules.js',
    'js/domain/eventRules.js',
    'js/domain/deckRules.js',
    'js/domain/rankingRules.js',
    'js/domain/tradeRules.js',
    'js/domain/advisoryRules.js',
    'js/engine/sessionEngine.js',
    'js/engine/turnEngine.js',
    'js/engine/answerEngine.js',
    'js/engine/tradeEngine.js',
    'js/engine/advisoryEngine.js',
    'js/main.js',
];

const DATA_FILES = ['data/questions.pt-BR.json', 'data/events.json'];

// Padrões dos robôs (o formulário do "Run workflow" pode trocar).
const DEFAULT_OPTIONS = Object.freeze({
    matches: 200,                    // partidas por cenário
    players: 4,
    seed: 1,
    accuracies: [0.4, 0.6, 0.8],     // perfis de chance de acerto; cada jogador sorteia um
    answerSeconds: [20, 50],         // tempo para responder (mín, máx)
    newRoundSeconds: 10,             // espera até o host clicar em "Nova Rodada"
    advisoryChance: 0.3,             // o Respondedor pede assessoria
    advisorAcceptChance: 0.9,        // o assessor responde (senão recusa)
    advisorSeconds: [5, 15],
    followSuggestionChance: 0.8,     // o Respondedor segue a sugestão
    helpChance: 0.5,                 // quem chega a 0 recursos pede ajuda
    helpAcceptChance: 0.5,           // cada jogador da fila aceita doar
    helpOfferSeconds: [2, 8],
    timeoutChance: 0,                // o Respondedor deixa o prazo vencer
    overrides: {}                    // trocas do config, ex.: { 'KPI.FINAL_RESOURCE_VALUE': 3 }
});

// Chaves do config mostradas no relatório (as trocadas entram também).
const REPORT_CONFIG_KEYS = [
    'STARTING_RESOURCES', 'KPI.CORRECT_ANSWER', 'KPI.FINAL_RESOURCE_VALUE', 'KPI.RESOURCE_PRICE',
    'KPI.ADVISOR_BONUS', 'GAME.SESSION_DURATION', 'GAME.ACTIVITIES_PER_FOCUS_AREA', 'GAME.ANSWER_TIMEOUT'
];

// ============================================
// ARQUIVOS DO JOGO (lidos uma vez)
// ============================================

let cache = null;

function gameSources() {
    if (cache) return cache;
    const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
    cache = {
        config: new vm.Script('var window = this;\n' + read('config/game-config.js'), { filename: 'config/game-config.js' }),
        scripts: GAME_FILES.map(file => new vm.Script(read(file), { filename: file })),
        data: Object.fromEntries(DATA_FILES.map(file => [file, read(file)]))
    };
    return cache;
}

/** CONFIG do config/game-config.js real (cópia nova a cada chamada). */
function realConfig() {
    const ctx = vm.createContext({});
    gameSources().config.runInContext(ctx);
    return JSON.parse(JSON.stringify(vm.runInContext('CONFIG', ctx)));
}

/** Eventos de data/events.json (id e título, para o relatório). */
function realEvents() {
    return JSON.parse(gameSources().data['data/events.json']).events;
}

// ============================================
// TROCAS DO CONFIG
// ============================================

function valueAt(obj, keyPath) {
    return keyPath.split('.').reduce((o, k) => (o && typeof o === 'object' ? o[k] : undefined), obj);
}

/** Recusa troca de chave que não existe no config real ou que não é número. */
function checkOverrides(overrides, config) {
    for (const [key, value] of Object.entries(overrides || {})) {
        if (typeof valueAt(config, key) !== 'number') {
            throw new Error('troca do config recusada: ' + key + ' não existe no config/game-config.js (ou não é um número)');
        }
        if (typeof value !== 'number' || !Number.isFinite(value)) {
            throw new Error('troca do config recusada: ' + key + ' deveria receber um número, veio ' + JSON.stringify(value));
        }
    }
}

function applyOverrides(config, overrides) {
    checkOverrides(overrides, config);
    for (const [key, value] of Object.entries(overrides || {})) {
        const keys = key.split('.');
        const parent = keys.slice(0, -1).reduce((o, k) => o[k], config);
        parent[keys[keys.length - 1]] = value;
    }
}

/** "KPI.FINAL_RESOURCE_VALUE=3; STARTING_RESOURCES=5" → { 'KPI.FINAL_RESOURCE_VALUE': 3, STARTING_RESOURCES: 5 }. */
function parseOverrides(text, config) {
    const overrides = {};
    for (const part of String(text).split(/[;\n]/).map(p => p.trim()).filter(Boolean)) {
        const match = part.match(/^([A-Z_][A-Z0-9_.]*)\s*=\s*(-?\d+(?:\.\d+)?)$/);
        if (!match) throw new Error('troca do config recusada: "' + part + '" deveria ser CHAVE=número (ex.: KPI.FINAL_RESOURCE_VALUE=3)');
        overrides[match[1]] = Number(match[2]);
    }
    checkOverrides(overrides, config);
    return overrides;
}

// ============================================
// SORTEIO COM SEMENTE E TEMPO FALSO
// ============================================

/** Números entre 0 e 1 a partir de uma semente (mulberry32). */
function createRandom(seed) {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6D2B79F5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/**
 * setTimeout/setInterval falsos: step() roda o próximo agendado (o mais
 * cedo; no empate, o agendado antes) e avança o relógio até ele.
 */
function createClock() {
    let now = 0;
    let seq = 0;
    const queue = [];
    const add = (fn, ms, every) => {
        const id = ++seq;
        queue.push({ id, fn, at: now + Math.max(0, Number(ms) || 0), every });
        return id;
    };
    return {
        now: () => now,
        setTimeout: (fn, ms) => add(fn, ms, 0),
        setInterval: (fn, ms) => add(fn, ms, Math.max(1, Number(ms) || 0)),
        clear: (id) => {
            const i = queue.findIndex(t => t.id === id);
            if (i >= 0) queue.splice(i, 1);
        },
        step() {
            if (queue.length === 0) return false;
            let next = 0;
            for (let i = 1; i < queue.length; i++) {
                const t = queue[i];
                const best = queue[next];
                if (t.at < best.at || (t.at === best.at && t.id < best.id)) next = i;
            }
            const timer = queue[next];
            now = timer.at;
            if (timer.every) {
                timer.at = now + timer.every;   // continua na fila (o próprio fn pode cancelar)
            } else {
                queue.splice(next, 1);
            }
            timer.fn();
            return true;
        }
    };
}

// ============================================
// UMA PARTIDA
// ============================================

/**
 * Simula uma partida do início ao ranking final.
 * @param {object} options - DEFAULT_OPTIONS com as trocas desejadas
 * @returns {Promise<object>} resultado da partida (ver o fim da função)
 */
async function simulateMatch(options = DEFAULT_OPTIONS) {
    const o = { ...DEFAULT_OPTIONS, ...options };
    const seed = o.seed >>> 0;
    const sources = gameSources();
    const clock = createClock();
    const botRandom = createRandom(Math.imul(seed, 0x9E3779B1) ^ 0x5BD1E995);
    const between = ([min, max]) => min + botRandom() * (max - min);
    const pick = (list) => list[Math.floor(botRandom() * list.length)];

    const result = {
        seed,
        endReason: 'other',
        rounds: 0,
        questions: 0,
        durationSeconds: 0,
        questionIds: [],
        events: {},
        advisories: { requested: 0, accepted: 0, declined: 0, bonusTotal: 0 },
        help: { requested: 0, accepted: 0, kpiMoved: 0, noDonors: 0, insufficientKpi: 0, allDeclined: 0 },
        config: null,
        players: []
    };

    const silent = { log() {}, warn() {}, error() {}, info() {} };
    const ctx = vm.createContext({
        console: silent,
        setTimeout: clock.setTimeout,
        clearTimeout: clock.clear,
        setInterval: clock.setInterval,
        clearInterval: clock.clear,
        alert() {},
        confirm: () => true,
        document: { addEventListener() {}, getElementById: () => null },
        fetch: (file) => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(JSON.parse(sources.data[file])) })
    });
    sources.config.runInContext(ctx);
    const CONFIG = vm.runInContext('CONFIG', ctx);
    applyOverrides(CONFIG, o.overrides);
    vm.runInContext('Math', ctx).random = createRandom(Math.imul(seed, 0x85EBCA6B) ^ 0xC2B2AE35);

    // Rede e tela trocadas: a tela não faz nada; o que o host mandaria
    // pela rede vai para os robôs e para as medidas.
    ctx.Game = {
        ui: new Proxy({}, { get: () => () => {} }),
        i18n: { t: (key) => key },
        saveState() {},
        network: {
            broadcastAll: (msg) => onBroadcast(msg),
            sendToPlayer: (peerId, msg) => onSend(peerId, msg),
            sendToHost() {},
            handleMessage() {},
            cleanup() {}
        }
    };
    sources.scripts.forEach(script => script.runInContext(ctx));

    const Game = ctx.Game;
    const state = Game.state;
    const names = Array.from({ length: o.players }, (_, i) => 'J' + (i + 1));
    state.isHost = true;
    state.playerName = names[0];
    state.peerId = 'peer-' + names[0];
    state.players = names.map((name, i) => ({
        name, peerId: 'peer-' + name, isHost: i === 0, kpi: 0, resources: CONFIG.STARTING_RESOURCES,
        focusArea: CONFIG.FOCUS_AREAS[0].id, activities: 0, waitingInLobby: false
    }));

    const stats = {};
    names.forEach(name => {
        stats[name] = {
            accuracy: pick(o.accuracies), answers: 0, correct: 0, minResources: Infinity, timesAtZero: 0,
            advisorBonus: 0, advisoriesGiven: 0, helpsAsked: 0, helpsReceived: 0, helpsGiven: 0,
            atZero: false, wantsHelp: false, askedThisTime: false
        };
    });
    const byPeer = (peerId) => state.players.find(p => p.peerId === peerId);
    let resourcesBeforeEvent = null;

    /** Alternativa marcada por quem tem a chance de acerto `accuracy`. */
    function guess(question, accuracy) {
        if (botRandom() < accuracy) return question.correct;
        return pick(['a', 'b', 'c', 'd'].filter(letter => letter !== question.correct));
    }

    function spread(resources) {
        const values = Object.values(resources);
        return values.length ? Math.max(...values) - Math.min(...values) : 0;
    }

    function activeResources() {
        return Object.fromEntries(Game.getActivePlayers().map(p => [p.name, p.resources]));
    }

    // --- O que o host manda para todos ---
    function onBroadcast(msg) {
        if (msg.type === 'show-event') {
            result.rounds++;
            const e = result.events[msg.event.id] || (result.events[msg.event.id] = { count: 0, resourcesDelta: 0, spreadDelta: 0 });
            e.count++;
            if (resourcesBeforeEvent) {
                const after = activeResources();
                e.resourcesDelta += Object.keys(after).reduce((t, n) => t + after[n] - (resourcesBeforeEvent[n] ?? after[n]), 0);
                e.spreadDelta += spread(after) - spread(resourcesBeforeEvent);
            }
            resourcesBeforeEvent = null;
        } else if (msg.type === 'round-start') {
            result.questions++;
            result.questionIds.push(state.currentRound.question.id);
        } else if (msg.type === 'kpi-update') {
            const s = stats[msg.playerName];
            if (msg.isCorrect !== undefined) {
                s.answers++;
                if (msg.isCorrect) s.correct++;
            }
            if (msg.advisorBonus) {
                s.advisorBonus += msg.advisorBonus;
                result.advisories.bonusTotal += msg.advisorBonus;
            }
        } else if (msg.type === 'advisory-started') {
            result.advisories.requested++;
        } else if (msg.type === 'advisory-result') {
            if (msg.declined) {
                result.advisories.declined++;
            } else {
                result.advisories.accepted++;
                stats[msg.advisorName].advisoriesGiven++;
            }
        } else if (msg.type === 'help-confirmed') {
            result.help.accepted++;
            result.help.kpiMoved += msg.amount;
            stats[msg.donor].helpsGiven++;
            stats[msg.requester].helpsReceived++;
        } else if (msg.type === 'round-ended') {
            // O host clica em "Nova Rodada" depois de um tempo.
            clock.setTimeout(() => {
                if (state.gameOver || !state.roundEnded) return;
                resourcesBeforeEvent = activeResources();
                Game.core.startNewRound();
            }, o.newRoundSeconds * 1000);
        }
    }

    // --- O que o host manda para um jogador ---
    function onSend(peerId, msg) {
        const player = byPeer(peerId);
        if (!player) return;
        if (msg.type === 'question' && msg.isAnswerer) {
            answererRobot(player);
        } else if (msg.type === 'advisory-question') {
            advisorRobot(player);
        } else if (msg.type === 'help-offer') {
            clock.setTimeout(() => {
                Game.core.handleHelpOfferResponse({ type: 'help-offer-response', candidateName: player.name, accepted: botRandom() < o.helpAcceptChance });
            }, between(o.helpOfferSeconds) * 1000);
        } else if (msg.type === 'help-no-candidates') {
            if (msg.reason === 'no-donors') result.help.noDonors++;
            if (msg.reason === 'insufficient-kpi') result.help.insufficientKpi++;
            if (msg.reason === 'all-declined') result.help.allDeclined++;
        }
    }

    /** Respondedor: talvez peça assessoria; responde (ou deixa o prazo vencer). */
    function answererRobot(player) {
        const round = state.currentRound;
        if (botRandom() < o.timeoutChance) return;   // o prazo de resposta do jogo encerra a pergunta
        const think = between(o.answerSeconds);
        const inClosing = Game.getFocusAreaIndex(player.focusArea) === CONFIG.FOCUS_AREAS.length - 1;
        if (!inClosing && botRandom() < o.advisoryChance) {
            const candidates = Game.getActivePlayers().filter(p => p.name !== round.asker && p.name !== round.answerer);
            if (candidates.length > 0) {
                const advisor = pick(candidates);
                clock.setTimeout(() => {
                    if (state.currentRound !== round || round.answered) return;
                    Game.core.handleAdvisoryRequest({ type: 'advisory-request', advisorName: advisor.name, requesterName: player.name });
                }, Math.min(5, think / 2) * 1000);
            }
        }
        clock.setTimeout(() => {
            if (state.gameOver || state.currentRound !== round || round.answered || round.pendingAnswer) return;
            const advisory = round.advisory;
            const alternative = advisory && advisory.status === 'accepted' && advisory.suggestion && botRandom() < o.followSuggestionChance
                ? advisory.suggestion
                : guess(round.question, stats[player.name].accuracy);
            Game.core.handleAnswer({ type: 'answer', playerName: player.name, alternative });
        }, think * 1000);
    }

    /** Assessor: responde com a própria chance de acerto, ou recusa. */
    function advisorRobot(player) {
        const round = state.currentRound;
        clock.setTimeout(() => {
            if (state.currentRound !== round || !round.advisory || round.advisory.status !== 'pending') return;
            if (botRandom() < o.advisorAcceptChance) {
                Game.core.handleAdvisoryAnswer({ type: 'advisory-answer', alternative: guess(round.question, stats[player.name].accuracy), declined: false });
            } else {
                Game.core.handleAdvisoryAnswer({ type: 'advisory-answer', alternative: null, declined: true });
            }
        }, between(o.advisorSeconds) * 1000);
    }

    /**
     * Depois de cada passo: mínimo de recursos e vezes em 0 de cada um;
     * quem chegou a 0 decide (uma vez por vez em 0) se pede ajuda, e
     * pede quando tem KPI para pagar e não há outro pedido em andamento.
     */
    function afterStep() {
        for (const p of state.players) {
            const s = stats[p.name];
            s.minResources = Math.min(s.minResources, p.resources);
            if (p.resources > 0) {
                s.atZero = false;
                continue;
            }
            if (!s.atZero) {
                s.atZero = true;
                s.timesAtZero++;
                s.wantsHelp = botRandom() < o.helpChance;
                s.askedThisTime = false;
            }
            if (s.wantsHelp && !s.askedThisTime && !state.helpQueue && !state.gameOver &&
                p.kpi >= CONFIG.KPI.RESOURCE_PRICE) {
                s.askedThisTime = true;
                s.helpsAsked++;
                result.help.requested++;
                Game.core.handleHelpRequest({ type: 'help-request', requesterName: p.name });
            }
        }
    }

    await Game.loadQuestions();
    resourcesBeforeEvent = Object.fromEntries(names.map(n => [n, CONFIG.STARTING_RESOURCES]));
    Game.core.startGame();
    afterStep();

    const limit = (CONFIG.GAME.SESSION_DURATION + 600) * 1000;
    while (!state.gameOver) {
        if (!clock.step()) throw new Error('a partida simulada travou (semente ' + seed + '): nada mais agendado');
        if (clock.now() > limit) throw new Error('a partida simulada passou do tempo (semente ' + seed + ')');
        afterStep();
    }

    const last = CONFIG.FOCUS_AREAS.length - 1;
    const completed = state.players.some(p =>
        Game.getFocusAreaIndex(p.focusArea) === last && p.activities >= CONFIG.GAME.ACTIVITIES_PER_FOCUS_AREA);
    result.endReason = completed ? 'last-focus-area' : (state.timer <= 0 ? 'time' : 'other');
    result.durationSeconds = CONFIG.GAME.SESSION_DURATION - state.timer;
    result.config = JSON.parse(JSON.stringify(CONFIG));
    result.players = state.finalRanking.map(r => {
        const s = stats[r.name];
        return {
            name: r.name, accuracy: s.accuracy, position: r.position, kpi: r.kpi, resources: r.resources, finalKpi: r.finalKpi,
            focusAreaIndex: Game.getFocusAreaIndex(r.focusArea), activities: r.activities,
            answers: s.answers, correct: s.correct, minResources: s.minResources, timesAtZero: s.timesAtZero,
            advisorBonus: s.advisorBonus, advisoriesGiven: s.advisoriesGiven,
            helpsAsked: s.helpsAsked, helpsReceived: s.helpsReceived, helpsGiven: s.helpsGiven
        };
    });
    return result;
}

/**
 * Simula `options.matches` partidas, a partida i com a semente
 * `options.seed + i`. Devolve { options, config, matches }.
 */
async function simulateMany(options = DEFAULT_OPTIONS, onProgress = null) {
    const o = { ...DEFAULT_OPTIONS, ...options };
    const matches = [];
    for (let i = 0; i < o.matches; i++) {
        matches.push(await simulateMatch({ ...o, seed: o.seed + i }));
        if (onProgress) onProgress(i + 1, o.matches);
    }
    const config = matches.length ? matches[0].config : (() => { const c = realConfig(); applyOverrides(c, o.overrides); return c; })();
    return { options: o, config, matches };
}

// ============================================
// FORMULÁRIO DO "RUN WORKFLOW"
// ============================================

/**
 * Campos do formulário (texto, em português e com chances em %) →
 * opções do simulador e as trocas do cenário B (null se vazio). Campo
 * vazio fica com o padrão; valor inválido é recusado com o nome do campo.
 */
function optionsFromInputs(inputs = {}) {
    const C = realConfig();
    const options = {
        ...DEFAULT_OPTIONS,
        accuracies: [...DEFAULT_OPTIONS.accuracies],
        answerSeconds: [...DEFAULT_OPTIONS.answerSeconds],
        advisorSeconds: [...DEFAULT_OPTIONS.advisorSeconds],
        helpOfferSeconds: [...DEFAULT_OPTIONS.helpOfferSeconds],
        overrides: {}
    };
    const text = (field) => (inputs[field] === undefined || inputs[field] === null ? '' : String(inputs[field]).trim());
    const fail = (field, message) => { throw new Error(field + ': ' + message); };
    const integer = (field, min, max) => {
        const t = text(field);
        if (!t) return null;
        if (!/^\d+$/.test(t)) fail(field, 'deveria ser um número inteiro, veio "' + t + '"');
        const n = Number(t);
        if (n < min || n > max) fail(field, 'deveria ficar entre ' + min + ' e ' + max + ', veio ' + n);
        return n;
    };
    const percent = (field, value) => {
        if (!/^\d+(?:[.,]\d+)?$/.test(value)) fail(field, 'deveria ser uma porcentagem de 0 a 100, veio "' + value + '"');
        const n = Number(value.replace(',', '.'));
        if (n > 100) fail(field, 'deveria ser uma porcentagem de 0 a 100, veio ' + n);
        return n / 100;
    };
    const chance = (field) => (text(field) ? percent(field, text(field)) : null);
    const set = (key, value) => { if (value !== null) options[key] = value; };

    set('matches', integer('partidas', 1, 5000));
    set('players', integer('jogadores', C.GAME.MIN_PLAYERS, C.GAME.MAX_PLAYERS));
    set('seed', integer('semente', 0, 2147483647));
    if (text('acertos')) {
        options.accuracies = text('acertos').split(',').map(v => percent('acertos', v.trim()));
    }
    if (text('tempo_resposta')) {
        const t = text('tempo_resposta');
        const match = t.match(/^(\d+)\s*-\s*(\d+)$/);
        const limit = C.GAME.ANSWER_TIMEOUT / 1000;
        if (!match) fail('tempo_resposta', 'deveria ser mínimo-máximo em segundos (ex.: 20-50), veio "' + t + '"');
        const [min, max] = [Number(match[1]), Number(match[2])];
        if (min < 1 || min > max || max >= limit) {
            fail('tempo_resposta', 'deveria ter 1 ≤ mínimo ≤ máximo < ' + limit + ' (o prazo de resposta do jogo), veio ' + t);
        }
        options.answerSeconds = [min, max];
    }
    set('advisoryChance', chance('assessoria'));
    set('helpChance', chance('pedir_ajuda'));
    set('helpAcceptChance', chance('aceitar_ajuda'));

    let overridesB = null;
    if (text('cenario_b')) {
        try {
            overridesB = parseOverrides(text('cenario_b'), C);
        } catch (err) {
            fail('cenario_b', err.message);
        }
    }
    return { options, overridesB };
}

// ============================================
// RELATÓRIO
// ============================================

/** Número com vírgula decimal, sem zeros sobrando; "-0" (negativo que arredonda para zero) vira "0". */
function number(n, decimals = 1) {
    if (!Number.isFinite(n)) return '—';
    const text = n.toFixed(decimals).replace('.', ',').replace(/,0+$/, '');
    return text === '-0' ? '0' : text;
}
const percentText = (part, total) => (total > 0 ? number(100 * part / total) + '%' : '—');
const mean = (list) => (list.length ? list.reduce((t, v) => t + v, 0) / list.length : NaN);
const total = (list, fn) => list.reduce((t, item) => t + fn(item), 0);

function median(list) {
    if (!list.length) return NaN;
    const sorted = [...list].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** "média 12,3 (mín 8 · mediana 12 · máx 20)" */
function spreadText(list) {
    if (!list.length) return '—';
    return 'média ' + number(mean(list)) + ' (mín ' + number(Math.min(...list)) + ' · mediana ' + number(median(list)) +
        ' · máx ' + number(Math.max(...list)) + ')';
}

const allPlayers = (run) => run.matches.flatMap(m => m.players.map(p => ({ ...p, config: m.config })));

/** Barras de quantas partidas tiveram cada número de rodadas. */
function histogram(values) {
    if (!values.length) return ['(sem partidas)'];
    const counts = new Map();
    values.forEach(v => counts.set(v, (counts.get(v) || 0) + 1));
    const max = Math.max(...counts.values());
    const lines = [];
    for (let v = Math.min(...values); v <= Math.max(...values); v++) {
        const c = counts.get(v) || 0;
        const bar = c ? '█'.repeat(Math.max(1, Math.round(30 * c / max))) : '';
        lines.push(String(v).padStart(4) + ' │ ' + bar + (c ? ' ' + c : ''));
    }
    return lines;
}

/**
 * Relatório em Markdown (resumo da execução do Actions).
 * @param {object} params
 * @param {object} params.a - simulateMany() com o config atual
 * @param {object|null} params.b - simulateMany() com as trocas do cenário B (ou null)
 * @param {string} params.commit - commit simulado
 */
function buildReport({ a, b = null, commit = '' }) {
    const runs = b ? [a, b] : [a];
    const names = b ? ['Config atual', 'Cenário B'] : ['Valor'];
    const o = a.options;
    const lines = [];
    const table = (header, rows) => {
        lines.push('| ' + header.join(' | ') + ' |', '|' + header.map(() => '---').join('|') + '|');
        rows.forEach(r => lines.push('| ' + r.join(' | ') + ' |'));
        lines.push('');
    };
    const compare = (rows) => table(['Medida', ...names], rows.map(([label, fn]) => [label, ...runs.map(fn)]));
    const perScenario = (render) => runs.forEach((run, i) => {
        if (b) lines.push('**' + names[i] + '**', '');
        render(run);
    });
    const seconds = ([min, max]) => number(min, 0) + '–' + number(max, 0) + ' s';
    const pct = (x) => number(100 * x) + '%';

    lines.push('## 🎲 Simulação de partidas — PM: The KPI Master', '');
    lines.push('Commit `' + commit + '` · ' + o.matches + ' partidas' + (b ? ' por cenário' : '') + ' · ' + o.players +
        ' jogadores · semente ' + o.seed, '');
    lines.push('Cada partida usa as regras e os dados reais do jogo, com robôs no lugar dos jogadores e o tempo simulado.' +
        (b ? ' Os dois lados usam as mesmas sementes: a diferença vem das trocas do config.' : ''), '');

    lines.push('### 🤖 Robôs', '');
    table(['Parâmetro', 'Valor'], [
        ['Chance de acerto (cada jogador sorteia um perfil)', o.accuracies.map(pct).join(', ')],
        ['Tempo para responder', seconds(o.answerSeconds)],
        ['Espera até "Nova Rodada"', number(o.newRoundSeconds, 0) + ' s'],
        ['Pede assessoria', pct(o.advisoryChance) + ' (o assessor responde em ' + pct(o.advisorAcceptChance) +
            ', a sugestão é seguida em ' + pct(o.followSuggestionChance) + ')'],
        ['Pede ajuda ao chegar a 0 recursos', pct(o.helpChance) + ' (cada jogador da fila aceita em ' + pct(o.helpAcceptChance) + ')'],
        ['Deixa o prazo de resposta vencer', pct(o.timeoutChance)]
    ]);

    lines.push('### ⚙️ Config', '');
    const keys = [...new Set([...REPORT_CONFIG_KEYS, ...runs.flatMap(r => Object.keys(r.options.overrides || {}))])];
    table(['Chave', ...names], keys.map(key => {
        const values = runs.map(r => valueAt(r.config, key));
        return ['`' + key + '`', ...values.map((v, i) => (i > 0 && v !== values[0] ? '**' + v + '**' : String(v)))];
    }));

    lines.push('### ⏱️ Duração', '');
    compare([
        ['Rodadas por partida', run => spreadText(run.matches.map(m => m.rounds))],
        ['Perguntas por partida', run => spreadText(run.matches.map(m => m.questions))],
        ['Minutos por partida', run => spreadText(run.matches.map(m => m.durationSeconds / 60))],
        ['Terminou porque alguém completou o Encerramento', run => percentText(run.matches.filter(m => m.endReason === 'last-focus-area').length, run.matches.length)],
        ['Terminou porque o tempo acabou', run => percentText(run.matches.filter(m => m.endReason === 'time').length, run.matches.length)]
    ]);
    lines.push('Rodadas por partida (cada barra = quantas partidas):', '');
    perScenario(run => lines.push('```', ...histogram(run.matches.map(m => m.rounds)), '```', ''));

    lines.push('### 🧭 Progresso', '');
    const areas = a.config.FOCUS_AREAS;
    compare([
        ...areas.map((area, i) => ['Jogadores que terminaram em ' + area.emoji + ' ' + area.name,
            run => percentText(allPlayers(run).filter(p => p.focusAreaIndex === i).length, allPlayers(run).length)]),
        ['Acertos por jogador', run => spreadText(allPlayers(run).map(p => p.correct))],
        ['Taxa de acerto observada', run => percentText(total(allPlayers(run), p => p.correct), total(allPlayers(run), p => p.answers))]
    ]);

    lines.push('### 📦 Recursos', '');
    compare([
        ['Recursos no fim (por jogador)', run => spreadText(allPlayers(run).map(p => p.resources))],
        ['Jogadores que chegaram a 0 recursos', run => percentText(allPlayers(run).filter(p => p.timesAtZero > 0).length, allPlayers(run).length)],
        ['Vezes em 0 recursos (por jogador)', run => spreadText(allPlayers(run).map(p => p.timesAtZero))],
        ['Parte do KPI Final que vem dos recursos', run => percentText(
            total(allPlayers(run), p => p.resources * p.config.KPI.FINAL_RESOURCE_VALUE), total(allPlayers(run), p => p.finalKpi))],
        ['KPI Final do vencedor', run => spreadText(run.matches.map(m => m.players[0].finalKpi))]
    ]);

    lines.push('### 💱 Economia', '');
    const perMatch = (run, fn) => number(mean(run.matches.map(fn)));
    compare([
        ['Assessorias pedidas por partida', run => perMatch(run, m => m.advisories.requested)],
        ['Assessorias respondidas', run => percentText(total(run.matches, m => m.advisories.accepted), total(run.matches, m => m.advisories.requested))],
        ['Bônus de assessoria pago por partida (KPI)', run => perMatch(run, m => m.advisories.bonusTotal)],
        ['Pedidos de ajuda por partida', run => perMatch(run, m => m.help.requested)],
        ['Pedidos de ajuda aceitos', run => percentText(total(run.matches, m => m.help.accepted), total(run.matches, m => m.help.requested))],
        ['Pedidos sem ninguém para doar / todos recusaram (por partida)', run =>
            perMatch(run, m => m.help.noDonors) + ' / ' + perMatch(run, m => m.help.allDeclined)],
        ['KPI que trocou de mãos na ajuda (por partida)', run => perMatch(run, m => m.help.kpiMoved)],
        ['Saldo de quem recebe 1 recurso de ajuda, no KPI Final', run =>
            number(run.config.KPI.FINAL_RESOURCE_VALUE - run.config.KPI.RESOURCE_PRICE, 0) + ' KPI (recurso vale ' +
            run.config.KPI.FINAL_RESOURCE_VALUE + ', custa ' + run.config.KPI.RESOURCE_PRICE + ')']
    ]);

    lines.push('### 🎴 Eventos', '');
    lines.push('Δ = mudança média a cada vez que o evento sai: na soma dos recursos de todos e na diferença entre quem tem mais e quem tem menos.', '');
    const events = realEvents();
    perScenario(run => {
        const rounds = total(run.matches, m => m.rounds);
        table(['Evento', 'Saiu (% das rodadas)', 'Δ soma dos recursos', 'Δ diferença maior − menor'], events.map(e => {
            const count = total(run.matches, m => (m.events[e.id] ? m.events[e.id].count : 0));
            const sumOf = (field) => total(run.matches, m => (m.events[e.id] ? m.events[e.id][field] : 0));
            return [e.title, count + ' (' + percentText(count, rounds) + ')',
                count ? number(sumOf('resourcesDelta') / count, 2) : '—', count ? number(sumOf('spreadDelta') / count, 2) : '—'];
        }));
    });

    lines.push('### ⚖️ Justiça', '');
    perScenario(run => {
        const players = allPlayers(run);
        const profiles = [...new Set(players.map(p => p.accuracy))].sort((x, y) => x - y);
        table(['Perfil (chance de acerto)', 'Jogadores', 'Vitórias', 'Posição média'], profiles.map(acc => {
            const group = players.filter(p => p.accuracy === acc);
            return [pct(acc), String(group.length), percentText(group.filter(p => p.position === 1).length, group.length),
                number(mean(group.map(p => p.position)))];
        }));
    });
    compare([
        ['Diferença do 1º para o 2º (KPI Final)', run => spreadText(run.matches.map(m => m.players[0].finalKpi - m.players[1].finalKpi))],
        ['Empate no KPI Final do 1º lugar', run => percentText(run.matches.filter(m => m.players[0].finalKpi === m.players[1].finalKpi).length, run.matches.length)],
        ['Empate que o desempate não resolveu (medalha dividida)', run => percentText(run.matches.filter(m => m.players[0].position === m.players[1].position).length, run.matches.length)]
    ]);

    return lines.join('\n') + '\n';
}

/** CSV (separador ";", vírgula decimal) com uma linha por jogador por partida. */
function toCsv(run) {
    const header = ['partida', 'semente', 'fim', 'rodadas', 'perguntas', 'minutos', 'jogador', 'perfil_acerto', 'posicao',
        'kpi', 'recursos', 'kpi_final', 'area_final', 'respostas', 'acertos', 'min_recursos', 'vezes_em_zero',
        'ajudas_pedidas', 'ajudas_recebidas', 'ajudas_dadas', 'assessorias_dadas', 'bonus_assessoria'];
    const rows = [header.join(';')];
    const cell = (v) => (typeof v === 'number' ? String(v).replace('.', ',') : String(v).replace(/[;\n]/g, ' '));
    run.matches.forEach((m, i) => m.players.forEach(p => {
        const area = m.config.FOCUS_AREAS[p.focusAreaIndex];
        rows.push([i + 1, m.seed, m.endReason, m.rounds, m.questions, Math.round(m.durationSeconds / 6) / 10, p.name, p.accuracy,
            p.position, p.kpi, p.resources, p.finalKpi, area ? area.name : '', p.answers, p.correct, p.minResources, p.timesAtZero,
            p.helpsAsked, p.helpsReceived, p.helpsGiven, p.advisoriesGiven, p.advisorBonus].map(cell).join(';'));
    }));
    return rows.join('\n') + '\n';
}

module.exports = {
    DEFAULT_OPTIONS,
    realConfig,
    simulateMatch,
    simulateMany,
    optionsFromInputs,
    buildReport,
    toCsv,
    formatNumber: number
};
