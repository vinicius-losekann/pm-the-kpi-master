// ============================================
// PM: The KPI Master - Testes de lógica: ambiente simulado
// ============================================
// Carrega os arquivos REAIS do jogo num "navegador" simulado (contexto
// `vm` do Node), sem navegador e sem PeerJS: a rede é trocada por
// conexões falsas, a tela por um registro de chamadas e o localStorage
// por um objeto em memória (um F5 é um ambiente novo com o mesmo
// localStorage). As entradas e quedas de jogador passam pelo
// handleConnection() REAL de peerService.js (conexões falsas disparam
// 'open'/'data'/'close' como o PeerJS faria).
//
// Também tem o mini-framework de teste (test/check/start/finish) e os
// ajudantes usados por mais de um arquivo de teste. Cada arquivo
// *.test.js desta pasta roda sozinho (`node tests/logic/<arquivo>`);
// no GitHub Actions, todos rodam a cada push (ver
// .github/workflows/testes.yml), com uma tabela de resumo por arquivo.
//
// O que NÃO é testado aqui (fica para tests/browser e para o teste
// manual): se o navegador/PeerJS de fato entrega o 'close' ao outro
// lado, e em quanto tempo, e a parte visual.
//
// Os números dos testes (T1, T2...) são os citados em
// _docs/connection-tests.md e _docs/issues.md — não mudam.
// ============================================

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..', '..');

// Mesma ordem de carregamento do game.html para os arquivos envolvidos.
const FILES = [
    'js/utils/persistence.js',
    'js/utils/identity.js',
    'js/network/hostSearch.js',
    'js/state/store.js',
    'js/state/selectors.js',
    'js/state/mutations.js',
    'js/domain/kpiRules.js',
    'js/domain/advisoryRules.js',
    'js/engine/sessionEngine.js',
    'js/engine/turnEngine.js',
    'js/engine/answerEngine.js',
    'js/engine/advisoryEngine.js',
    'js/domain/tradeRules.js',
    'js/engine/tradeEngine.js',
    'js/network/peerService.js',
    'js/network/messageHandler.js',
    'js/network/hostMigration.js',
    'js/ui/setup.js',
];

// CONFIG próprio do teste (valores fixos, independentes do jogo real).
const TEST_CONFIG = `
var CONFIG = {
    GAME: {
        MIN_PLAYERS: 2,
        MAX_PLAYERS: 6,
        SESSION_DURATION: 3600,
        ANSWER_TIMEOUT: 60000,
        ADVISORY_TIMEOUT: 20000,
        HELP_OFFER_TIMEOUT: 20000,
        HOST_TIMEOUT: 10000,
        ACTIVITIES_PER_FOCUS_AREA: 2
    },
    FOCUS_AREAS: [
        { id: 'initiating', name: 'Iniciação', emoji: '🚀' },
        { id: 'planning', name: 'Planejamento', emoji: '📋' }
    ],
    STARTING_RESOURCES: 10,
    KPI: { FINAL_RESOURCE_VALUE: 2, CORRECT_ANSWER: 10, RESOURCE_PRICE: 10 },
    RESOURCES: { ADVISORY_FEE: 2 },          // diferente do real (1): o jogo tem de ler o CONFIG, não um 1 fixo
    PEER: { debug: 0 }
};
`;

// ============================================
// AMBIENTE SIMULADO
// ============================================

/** D2: token "do navegador" de cada jogador nos testes. */
function tokenOf(name) {
    return 'token-do-navegador-de-' + name;
}

/**
 * Cria um "navegador" novo e isolado, carrega os arquivos reais do
 * jogo nele e devolve atalhos para simular jogadores entrando/saindo.
 * D3f: `options.storage` reaproveita o localStorage de outro
 * ambiente — a mesma página depois de um F5 (ver reloadHost()).
 */
function createEnvironment(options = {}) {
    const record = {
        sent: [],         // { to, msg } — mensagens diretas (sendToPlayer / conn.send)
        broadcasts: [],   // msg — broadcastAll
        ui: [],           // nomes de funções de Game.ui chamadas
        logs: [],         // console.* (guardado para mostrar em caso de falha)
        listeners: [],    // eventos registrados em window.addEventListener
        toHost: [],       // msg — sendToHost (lado guest)
        spies: { becomeHost: 0, attemptReconnectToNewHost: 0 }
    };

    const connections = {};
    let currentPeer = null;
    const connectionState = {
        getConnection: (id) => connections[id],
        getConnections: () => connections,
        setConnection: (id, c) => { connections[id] = c; },
        removeConnection: (id) => { delete connections[id]; },
        resetConnections: () => { for (const k of Object.keys(connections)) delete connections[k]; },
        getPeer: () => currentPeer,
        setPeer: (p) => { currentPeer = p; }
    };

    const silentConsole = {};
    ['log', 'warn', 'error', 'info'].forEach(level => {
        silentConsole[level] = (...args) => record.logs.push(level + ': ' + args.join(' '));
    });

    // localStorage em memória (D2: guarda o token de identidade por sala;
    // D3f: e o estado salvo da partida, pelo persistence.js real).
    const storage = options.storage || {};
    const fakeLocalStorage = {
        getItem: (k) => (k in storage ? storage[k] : null),
        setItem: (k, v) => { storage[k] = String(v); },
        removeItem: (k) => { delete storage[k]; }
    };

    const ctx = vm.createContext({
        console: silentConsole,
        localStorage: fakeLocalStorage,
        crypto: require('crypto').webcrypto,
        // Timers desligados: nada roda "depois" — o teste é síncrono.
        setTimeout: () => 0,
        clearTimeout: () => {},
        setInterval: () => 0,
        clearInterval: () => {},
        alert: () => {},
        confirm: () => true,
        addEventListener: (event) => { record.listeners.push(event); },
        URLSearchParams,
        location: { reload: () => {}, href: '', search: '' }
    });
    vm.runInContext('var window = this;' + TEST_CONFIG, ctx);

    // Game.saveState / Game.persistence vêm do persistence.js real (D3f).
    ctx.Game = {
        ui: new Proxy({}, {
            get: (_, name) => (...args) => { record.ui.push(String(name)); }
        }),
        i18n: { t: (key) => key },
        domain: {
            event: {
                drawEvent: () => ({ id: 'e' + Math.random().toString(36).slice(2, 7), title: 'Evento de teste' }),
                applyEventEffects: () => ({ logs: [], effect: null })
            },
            deck: {
                drawQuestion: () => ({ id: 'q1', question: 'Pergunta?', alternatives: ['A', 'B', 'C', 'D'], correct: 'A', domain_key: 'd1' }),
                resetAllDecks: () => {}
            },
            ranking: {
                buildRanking: (players) => players.map((p, i) => ({ position: i + 1, name: p.name, finalKpi: p.kpi }))
            }
        },
        network: {
            connectionState,
            broadcastAll: (msg) => { record.broadcasts.push(msg); },
            sendToPlayer: (peerId, msg) => { record.sent.push({ to: peerId, msg }); },
            sendToHost: () => {},
            cleanup: () => {}
        }
    };

    for (const file of FILES) {
        const filePath = path.join(ROOT, file);
        if (!fs.existsSync(filePath)) {
            throw new Error('Arquivo não encontrado: ' + file + ' (rode a partir da raiz do repositório)');
        }
        vm.runInContext(fs.readFileSync(filePath, 'utf8'), ctx, { filename: file });
    }

    // peerService.js real substitui o envio de mensagens pelo envio via
    // PeerJS; aqui voltam os stubs que só registram (handleConnection e
    // closeConnectionsOnExit continuam os reais).
    Object.assign(ctx.Game.network, {
        broadcastAll: (msg) => { record.broadcasts.push(msg); },
        sendToPlayer: (peerId, msg) => { record.sent.push({ to: peerId, msg }); },
        sendToHost: (msg) => { record.toHost.push(msg); },
        cleanup: () => {},
        handleHostDisconnect: () => {}
    });

    // Espiões no lugar das funções de migração que abririam conexões de verdade.
    ctx.becomeHost = () => { record.spies.becomeHost++; };
    ctx.attemptReconnectToNewHost = () => { record.spies.attemptReconnectToNewHost++; };

    const Game = ctx.Game;
    const state = Game.state;
    state.questionsData = { domains: { d1: { name: 'Domínio de teste' } }, events: [] };

    /**
     * Conexão falsa com a mesma interface usada do PeerJS: on(event, cb),
     * send(), close() — close() dispara o 'close' registrado, como o
     * PeerJS faz. Passa pelo handleConnection() real.
     */
    function openConnection(peerId) {
        const handlers = {};
        const c = {
            peer: peerId,
            open: true,
            on: (event, cb) => { handlers[event] = cb; },
            send: (msg) => { record.sent.push({ to: peerId, msg }); },
            close: () => {
                if (!c.open) return;
                c.open = false;
                if (handlers.close) handlers.close();
            },
            fire: (event, arg) => { if (handlers[event]) handlers[event](arg); }
        };
        Game.network.handleConnection(c);
        c.fire('open');
        return c;
    }

    const env = {
        ctx, Game, state, record, storage, fakeLocalStorage, CONFIG: vm.runInContext('CONFIG', ctx),

        /** Conexão falsa já aberta, passando pelo handleConnection() real. */
        connect: (peerId) => openConnection(peerId),

        /** Host sozinho no lobby. */
        createRoomAsHost() {
            state.isHost = true;
            state.playerName = 'Host';
            state.peerId = 'peer-host';
            state.players = [{
                name: 'Host', peerId: 'peer-host', isHost: true, kpi: 0, resources: 10,
                focusArea: 'initiating', activities: 0, waitingInLobby: false
            }];
        },

        /**
         * Guest conecta e envia player-join pela conexão (como o guest real
         * faz), com a versão do protocolo do jogo. D2: por padrão cada nome
         * usa sempre o mesmo token (o do "navegador" dele); passe outro
         * token para simular um impostor, ou null para um player-join sem
         * token.
         */
        join(name, peerId, token = tokenOf(name)) {
            const c = openConnection(peerId);
            const msg = { type: 'player-join', playerName: name, peerId, protocolVersion: Game.network.PROTOCOL_VERSION };
            if (token !== null) msg.token = token;
            c.fire('data', msg);
        },

        /** Hash que o host deveria guardar para um token. */
        hash: (token) => Game.identity.hashToken(token),

        /** Queda de conexão vista pelo host: dispara o 'close' da conexão. */
        drop(peerId) {
            const c = connectionState.getConnection(peerId);
            if (!c) throw new Error('não há conexão aberta para ' + peerId);
            c.close();
        },

        /** Simula o início da partida sem timer/DOM (o que startGame faz de relevante). */
        startMatch() {
            state.gameStarted = true;
            state.gameOver = false;
            state.answeredThisRound = [];
            Game.core.startNewRound();
        },

        player: (name) => state.players.find(p => p.name === name),
        rejectionFor(peerId) {
            const r = record.sent.find(e => e.to === peerId && e.msg.type === 'join-rejected');
            return r ? r.msg.reason : null;
        },
        /**
         * Troca o Peer do PeerJS (e o document) por dublês. Cada
         * `new Peer()` entra na lista devolvida, com os handlers
         * registrados (fire(event, arg) os chama) e os destinos
         * pedidos em connect(). connect() devolve uma conexão falsa que
         * não abre sozinha, ou `options.connectReturns`, se informado, ou
         * o que `options.onConnect(target)` devolver (D3c: uma conexão
         * por destino, para a procura em várias versões do host).
         */
        installFakePeer(options = {}) {
            const createdPeers = [];
            ctx.Peer = function (id, peerOptions) {
                const handlers = {};
                this.id = id;
                this.peerOptions = peerOptions;
                this.destroyed = false;
                this.disconnected = false;
                this.reconnects = 0;
                this.reconnect = () => { this.reconnects++; };
                this.requestedConnections = [];
                this.on = (event, cb) => { handlers[event] = cb; };
                this.destroy = () => { this.destroyed = true; };
                this.connect = (target) => {
                    this.requestedConnections.push(target);
                    if (options.onConnect) return options.onConnect(target);
                    if ('connectReturns' in options) return options.connectReturns;
                    return { peer: target, open: false, on: () => {}, send: () => {}, close: () => {} };
                };
                this.fire = (event, arg) => { if (handlers[event]) handlers[event](arg); };
                createdPeers.push(this);
            };
            ctx.document = { getElementById: () => ({ style: {}, textContent: '' }) };
            return createdPeers;
        },

        /**
         * D1b: este jogador (guest) assume como host pelo becomeHost()
         * REAL; o 'open' do peer novo é disparado na hora, como se o
         * broker tivesse aceitado o ID da sala nova.
         */
        takeOverAsHost() {
            const peers = this.installFakePeer();
            Game.network.becomeHost();
            peers[peers.length - 1].fire('open', Game.computeHostPeerId(state.baseRoomPeerId, state.hostVersion));
        },

        /**
         * D2b: troca setInterval/clearInterval por um relógio controlado
         * pelo teste. tick(n) avança n segundos em todas as contagens
         * ligadas; activeCount() diz quantas estão ligadas.
         */
        fakeClock() {
            const intervals = [];
            ctx.setInterval = (fn) => { intervals.push({ fn, active: true }); return intervals.length; };
            ctx.clearInterval = (id) => { if (intervals[id - 1]) intervals[id - 1].active = false; };
            return {
                tick(n = 1) {
                    for (let i = 0; i < n; i++) intervals.filter(c => c.active).forEach(c => c.fn());
                },
                activeCount: () => intervals.filter(c => c.active).length
            };
        },

        /** D2b: este ambiente vira um guest e recebe um state-sync do host. */
        receiveSync(name, fullState) {
            state.isHost = false;
            state.playerName = name;
            Game.network.handleMessage({ type: 'state-sync', fullState }, 'sala');
        },

        /**
         * D3b: troca setTimeout/clearTimeout e Date.now() por um tempo
         * controlado pelo teste. advance(ms) anda o relógio e roda, na
         * ordem, os timers que vencerem (inclusive os agendados durante
         * o avanço).
         */
        fakeTime() {
            let now = 1000000;
            let seq = 0;
            const queue = [];
            ctx.setTimeout = (fn, ms) => { const id = ++seq; queue.push({ id, fn, at: now + (ms || 0) }); return id; };
            ctx.clearTimeout = (id) => { const i = queue.findIndex(t => t.id === id); if (i >= 0) queue.splice(i, 1); };
            ctx.Date = class extends Date { static now() { return now; } };
            return {
                now: () => now,
                // Quantos timers ainda estão agendados (não venceram nem foram cancelados).
                pending: () => queue.length,
                advance(ms) {
                    const end = now + ms;
                    for (;;) {
                        queue.sort((a, b) => a.at - b.at || a.id - b.id);
                        if (!queue.length || queue[0].at > end) break;
                        const t = queue.shift();
                        now = t.at;
                        t.fn();
                    }
                    now = end;
                }
            };
        },

        /**
         * D3b: peer local (guest) cujas conexões só abrem quando o teste
         * mandar — a lista devolvida guarda todas as pedidas, na ordem.
         */
        guestPeer() {
            const connections = [];
            const peer = {
                destroyed: false,
                connect(target) {
                    const h = {};
                    const c = {
                        peer: target, open: false, closed: false,
                        on: (ev, cb) => { h[ev] = cb; },
                        send: () => {},
                        close() { c.closed = true; c.open = false; },
                        openNow() { c.open = true; if (h.open) h.open(); }
                    };
                    connections.push(c);
                    return c;
                }
            };
            connectionState.setPeer(peer);
            return connections;
        },

        /** D3b: URL da página e history.replaceState simulados. */
        fakeUrl(href) {
            const replacements = [];
            ctx.URL = URL;
            ctx.location.href = href;
            ctx.history = {
                state: null,
                replaceState: (_, __, url) => { replacements.push(url); ctx.location.href = url; }
            };
            return {
                replacements,
                param: (name) => new URL(ctx.location.href).searchParams.get(name)
            };
        },

        broadcastsOfType: (type) => record.broadcasts.filter(m => m.type === type),
        clearLog() {
            record.sent.length = 0;
            record.broadcasts.length = 0;
            record.ui.length = 0;
            record.toHost.length = 0;
        }
    };
    return env;
}

// ============================================
// MINI-FRAMEWORK DE TESTE
// ============================================

let passed = 0;
let failed = 0;
const results = []; // { name, ok, error } — usado no resumo do GitHub Actions

/** Mostra o título do arquivo de teste no log. */
function start(title) {
    console.log('\n🧪 ' + title + '\n');
}

function test(name, fn) {
    let env = null;
    try {
        fn((e) => { env = e; return e; });
        passed++;
        results.push({ name, ok: true });
        console.log('  ✅ ' + name);
    } catch (err) {
        failed++;
        results.push({ name, ok: false, error: err.message });
        console.log('  ❌ ' + name);
        console.log('     → ' + err.message);
        if (env && env.record.logs.length) {
            console.log('     Últimos logs do jogo:');
            env.record.logs.slice(-6).forEach(l => console.log('       ' + l));
        }
    }
}

function check(condition, message) {
    if (!condition) throw new Error(message);
}

/**
 * Fim do arquivo de teste: mostra o total, escreve a tabela de resumo na
 * página da execução do GitHub Actions (a variável GITHUB_STEP_SUMMARY só
 * existe lá) e encerra com erro se algum teste falhou.
 */
function finish(title) {
    console.log('\n' + (failed === 0 ? '🎉' : '⚠️') + ' ' + title + ': ' + passed + ' passaram, ' + failed + ' falharam\n');
    if (process.env.GITHUB_STEP_SUMMARY) {
        const escape = (t) => String(t).replace(/\|/g, '\\|').replace(/\n/g, ' ');
        const lines = [
            '### 🧪 ' + title + ' — ' + passed + ' passaram, ' + failed + ' falharam',
            '',
            '| | Teste | Detalhe da falha |',
            '|---|---|---|',
            ...results.map(r => '| ' + (r.ok ? '✅' : '❌') + ' | ' + escape(r.name) + ' | ' + (r.ok ? '' : escape(r.error)) + ' |'),
            ''
        ];
        fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, lines.join('\n') + '\n');
    }
    process.exit(failed === 0 ? 0 : 1);
}

// ============================================
// AJUDANTES COMPARTILHADOS
// ============================================

/** Último state-sync que o host mandou para um peer. */
function syncTo(env, peerId) {
    const e = env.record.sent.filter(x => x.to === peerId && x.msg.type === 'state-sync').pop();
    return e ? e.msg.fullState : null;
}

/** Telas de pergunta/rodada que o guest montou. */
function roundScreens(env) {
    return env.record.ui.filter(n => ['displayQuestion', 'displayRoundStart', 'displaySpectatorView',
        'showRoundEndedMessage', 'showMatchPausedMessage'].includes(n));
}

const unavailable = (id) => ({ type: 'peer-unavailable', message: 'Could not connect to peer ' + id });

/**
 * Host sozinho no lobby, com nome e ID de sala — o estado salvo só é
 * restaurado no F5 se a sala e o jogador da URL baterem com ele.
 */
function roomToReload(env) {
    env.createRoomAsHost();
    env.state.roomName = 'sala';
    env.state.baseRoomPeerId = 'sala';
    env.state.hostPeerId = 'sala';
}

/**
 * F5 do host: página nova (outro ambiente, mesmo localStorage) que lê a
 * URL como init() (main.js) e restaura o estado salvo pelo
 * persistence.js real. A retomada da partida fica para o teste chamar
 * (Game.core.resumeMatchAfterReload()), depois de instalar os
 * dublês de que precisar.
 */
function reloadHost(env) {
    const { reloaded, restored } = tryReloadHost(env);
    check(restored === true, 'o F5 deveria restaurar o estado salvo');
    return reloaded;
}

/**
 * Como reloadHost(), mas sem exigir que o estado seja restaurado
 * (roadmap 3.1: versão desconhecida ou inválida não restaura).
 */
function tryReloadHost(env) {
    const reloaded = createEnvironment({ storage: env.storage });
    const s = reloaded.state;
    const base = env.state.baseRoomPeerId;
    reloaded.ctx.location.search = '?' + new URLSearchParams({ host: 'true', room: env.state.roomName, playerName: env.state.playerName, peerId: base }).toString();
    s.isHost = true;
    s.roomName = env.state.roomName;
    s.playerName = env.state.playerName;
    s.hostPeerId = base;
    s.baseRoomPeerId = base;
    s.hostVersion = 0;
    const restored = reloaded.Game.persistence.tryRestoreState();
    s.peerId = env.state.peerId; // initPeer() abre de novo com o mesmo ID
    return { reloaded, restored };
}

/**
 * Passa a registrar também os argumentos das funções de tela chamadas
 * (o registro padrão guarda só os nomes). Devolve a lista { name, args }.
 */
function recordScreens(env) {
    const calls = [];
    const previousUi = env.Game.ui;
    env.Game.ui = new Proxy({}, {
        get: (_, name) => (...args) => {
            calls.push({ name: String(name), args });
            return previousUi[name](...args);
        }
    });
    return calls;
}

/**
 * Guest com a cópia dos jogadores do host e as telas reais de `files`,
 * com DOM falso (cada elemento pedido é criado na hora e fica em
 * `elements`). O i18n devolve a chave seguida dos valores, para o teste
 * ver quais campos a tela leu; os avisos (alert) ficam em `alerts`.
 */
function guestWithScreens(use, host, name, files) {
    const guest = use(createEnvironment());
    guest.state.playerName = name;
    guest.state.peerId = host.player(name).peerId;
    guest.state.players = JSON.parse(JSON.stringify(host.state.players));
    const elements = {};
    guest.ctx.document = {
        getElementById: (id) => elements[id] || (elements[id] = {
            id, textContent: '', innerHTML: '', disabled: false, style: {}, classList: { add() {} }, addEventListener() {}
        }),
        querySelectorAll: () => []
    };
    guest.Game.i18n.t = (key, values) => key + (values ? ' ' + JSON.stringify(values) : '');
    const alerts = [];
    guest.ctx.alert = (text) => { alerts.push(String(text)); };
    for (const file of files) vm.runInContext(fs.readFileSync(path.join(ROOT, file), 'utf8'), guest.ctx, { filename: file });
    return { guest, elements, alerts };
}

/**
 * Estado salvo na versão 1 (nomes em português dos campos da rodada e da
 * partida), escrito à mão — o saveState() grava sempre a versão atual.
 * Partida de Host e A na sala de roomToReload(), com a pergunta aberta:
 * Host pergunta, A responde. `overrides` troca campos de pmKPI_roomState.
 * Devolve { roomState, myData } (objetos novos a cada chamada).
 */
function savedStateV1(overrides = {}) {
    const question = { id: 'q7', question: 'Pergunta salva?', alternatives: ['a) Um', 'b) Dois', 'c) Três', 'd) Quatro'], correct: 'b' };
    const other = { id: 'q8', question: 'Outra pergunta?', alternatives: ['a) Um', 'b) Dois', 'c) Três', 'd) Quatro'], correct: 'a' };
    const roomState = {
        stateVersion: 1,
        hostPeerId: 'sala',
        backupPeerId: 'peer-a',
        baseRoomPeerId: 'sala',
        hostVersion: 0,
        roomName: 'sala',
        players: [
            { name: 'Host', peerId: 'peer-host', isHost: true, kpi: 20, recursos: 9, phase: 'iniciacao', activities: 1, waitingInLobby: false },
            { name: 'A', peerId: 'peer-a', isHost: false, kpi: 10, recursos: 10, phase: 'iniciacao', activities: 1, waitingInLobby: false }
        ],
        currentRound: {
            evento: { id: 'e-salvo', titulo: 'Evento salvo' },
            perguntador: 'Host',
            respondedor: 'A',
            pergunta: { ...question, usada: true, domain_key: 'd1', domain: 'Domínio de teste', area: 'Iniciação' },
            respondeu: false
        },
        baralhos: {
            d1: { perguntas: [{ ...question, usada: true }, { ...other, usada: false }], disponiveis: 1, total: 2 }
        },
        timer: 3000,
        gameStarted: true,
        usedRespondedorThisRound: [],
        rodadaEncerrada: false,
        partidaPausada: null,
        gameOver: false,
        rankingFinal: null,
        timestamp: new Date().toISOString(),
        ...overrides
    };
    const myData = { playerName: 'Host', kpi: 20, phase: 'iniciacao', activities: 1 };
    return { roomState, myData };
}

/**
 * Estado salvo na versão 2 (rodada e partida já em inglês; jogadores e
 * ranking ainda com `recursos`, `phase`, `posicao` e `kpiFinal`), escrito
 * à mão. Mesma partida de savedStateV1(), com recursos diferentes para
 * cada jogador. No pmKPI_myData, a área foco e as atividades do host são
 * outras que as da lista, de propósito: o F5 usa as do pmKPI_myData, e
 * assim o teste vê se ele também foi migrado. `overrides` troca campos de
 * pmKPI_roomState. Devolve { roomState, myData } (objetos novos a cada
 * chamada).
 */
function savedStateV2(overrides = {}) {
    const question = { id: 'q7', question: 'Pergunta salva?', alternatives: ['a) Um', 'b) Dois', 'c) Três', 'd) Quatro'], correct: 'b' };
    const other = { id: 'q8', question: 'Outra pergunta?', alternatives: ['a) Um', 'b) Dois', 'c) Três', 'd) Quatro'], correct: 'a' };
    const roomState = {
        stateVersion: 2,
        hostPeerId: 'sala',
        backupPeerId: 'peer-a',
        baseRoomPeerId: 'sala',
        hostVersion: 0,
        roomName: 'sala',
        players: [
            { name: 'Host', peerId: 'peer-host', isHost: true, kpi: 20, recursos: 9, phase: 'iniciacao', activities: 1, waitingInLobby: false },
            { name: 'A', peerId: 'peer-a', isHost: false, kpi: 10, recursos: 7, phase: 'iniciacao', activities: 1, waitingInLobby: false }
        ],
        currentRound: {
            event: { id: 'e-salvo', titulo: 'Evento salvo' },
            asker: 'Host',
            answerer: 'A',
            question: { ...question, used: true, domain_key: 'd1', domain: 'Domínio de teste', area: 'Iniciação' },
            answered: false
        },
        decks: {
            d1: { questions: [{ ...question, used: true }, { ...other, used: false }], available: 1, total: 2 }
        },
        timer: 3000,
        gameStarted: true,
        answeredThisRound: [],
        roundEnded: false,
        matchPaused: null,
        gameOver: false,
        finalRanking: null,
        timestamp: new Date().toISOString(),
        ...overrides
    };
    const myData = { playerName: 'Host', kpi: 20, phase: 'planejamento', activities: 0 };
    return { roomState, myData };
}

/**
 * Ranking final no formato das versões 1 e 2 (`posicao`, `kpiFinal`,
 * `recursos`, `phase`), da partida de savedStateV2(), com o
 * FINAL_RESOURCE_VALUE do CONFIG de teste (2). Lista nova a cada chamada.
 */
function finalRankingV2() {
    return [
        { posicao: 1, name: 'Host', kpi: 20, recursos: 9, kpiFinal: 38, phase: 'iniciacao', activities: 1, isHost: true, waitingInLobby: false },
        { posicao: 2, name: 'A', kpi: 10, recursos: 7, kpiFinal: 24, phase: 'iniciacao', activities: 1, isHost: false, waitingInLobby: false }
    ];
}

/**
 * Estado salvo na versão 3 (rodada, partida, jogadores e ranking já em
 * inglês; a assessoria da rodada ainda com `assessoria`, `assessorName` e
 * `sugestao`), escrito à mão. Partida de Host, A e B na sala de
 * roomToReload(), com a pergunta aberta: Host pergunta, A responde e
 * pediu assessoria a B, ainda sem resposta. `overrides` troca campos de
 * pmKPI_roomState. Devolve { roomState, myData } (objetos novos a cada
 * chamada).
 */
function savedStateV3(overrides = {}) {
    const question = { id: 'q7', question: 'Pergunta salva?', alternatives: ['a) Um', 'b) Dois', 'c) Três', 'd) Quatro'], correct: 'b' };
    const other = { id: 'q8', question: 'Outra pergunta?', alternatives: ['a) Um', 'b) Dois', 'c) Três', 'd) Quatro'], correct: 'a' };
    const roomState = {
        stateVersion: 3,
        hostPeerId: 'sala',
        backupPeerId: 'peer-a',
        baseRoomPeerId: 'sala',
        hostVersion: 0,
        roomName: 'sala',
        players: [
            { name: 'Host', peerId: 'peer-host', isHost: true, kpi: 20, resources: 9, focusArea: 'iniciacao', activities: 1, waitingInLobby: false },
            { name: 'A', peerId: 'peer-a', isHost: false, kpi: 10, resources: 7, focusArea: 'iniciacao', activities: 1, waitingInLobby: false },
            { name: 'B', peerId: 'peer-b', isHost: false, kpi: 30, resources: 4, focusArea: 'iniciacao', activities: 0, waitingInLobby: false }
        ],
        currentRound: {
            event: { id: 'e-salvo', titulo: 'Evento salvo' },
            asker: 'Host',
            answerer: 'A',
            question: { ...question, used: true, domain_key: 'd1', domain: 'Domínio de teste', area: 'Iniciação' },
            answered: false,
            assessoria: { assessorName: 'B', status: 'pending', sugestao: null }
        },
        decks: {
            d1: { questions: [{ ...question, used: true }, { ...other, used: false }], available: 1, total: 2 }
        },
        timer: 3000,
        gameStarted: true,
        answeredThisRound: [],
        roundEnded: false,
        matchPaused: null,
        gameOver: false,
        finalRanking: null,
        timestamp: new Date().toISOString(),
        ...overrides
    };
    const myData = { playerName: 'Host', kpi: 20, focusArea: 'iniciacao', activities: 1 };
    return { roomState, myData };
}

/**
 * Estado salvo na versão 4 (tudo em inglês, menos os campos do evento:
 * `titulo`, `descricao` e o efeito, como em data/events.json antes da
 * versão 5), escrito à mão. Partida de Host, A e B na sala de
 * roomToReload(), com a pergunta aberta: Host pergunta, A responde; o
 * evento da rodada é a reserva de contingência. `overrides` troca campos
 * de pmKPI_roomState. Devolve { roomState, myData } (objetos novos a cada
 * chamada).
 */
function savedStateV4(overrides = {}) {
    const question = { id: 'q7', question: 'Pergunta salva?', alternatives: ['a) Um', 'b) Dois', 'c) Três', 'd) Quatro'], correct: 'b' };
    const other = { id: 'q8', question: 'Outra pergunta?', alternatives: ['a) Um', 'b) Dois', 'c) Três', 'd) Quatro'], correct: 'a' };
    const roomState = {
        stateVersion: 4,
        hostPeerId: 'sala',
        backupPeerId: 'peer-a',
        baseRoomPeerId: 'sala',
        hostVersion: 0,
        roomName: 'sala',
        players: [
            { name: 'Host', peerId: 'peer-host', isHost: true, kpi: 20, resources: 9, focusArea: 'iniciacao', activities: 1, waitingInLobby: false },
            { name: 'A', peerId: 'peer-a', isHost: false, kpi: 10, resources: 7, focusArea: 'iniciacao', activities: 1, waitingInLobby: false },
            { name: 'B', peerId: 'peer-b', isHost: false, kpi: 30, resources: 4, focusArea: 'iniciacao', activities: 0, waitingInLobby: false }
        ],
        currentRound: {
            event: { id: 'e4', titulo: 'Reserva de Contingência', descricao: 'Reserva de contingência ativada!', reserva_contingencia: true },
            asker: 'Host',
            answerer: 'A',
            question: { ...question, used: true, domain_key: 'd1', domain: 'Domínio de teste', area: 'Iniciação' },
            answered: false
        },
        decks: {
            d1: { questions: [{ ...question, used: true }, { ...other, used: false }], available: 1, total: 2 }
        },
        timer: 3000,
        gameStarted: true,
        answeredThisRound: [],
        roundEnded: false,
        matchPaused: null,
        gameOver: false,
        finalRanking: null,
        timestamp: new Date().toISOString(),
        ...overrides
    };
    const myData = { playerName: 'Host', kpi: 20, focusArea: 'iniciacao', activities: 1 };
    return { roomState, myData };
}

// Nomes da versão 1 (estado salvo e protocolo) dos campos da rodada e da
// partida, que passaram para inglês na versão 2.
const OLD_ROUND_NAMES = [
    'usedRespondedorThisRound', 'respondidos', 'rodadaEncerrada', 'partidaPausada', 'rankingFinal',
    'baralhos', 'perguntas', 'disponiveis', 'usada', 'respostaTimeout',
    'evento', 'perguntador', 'respondedor', 'pergunta', 'respondeu', 'alternativa',
    'acertou', 'kpiGanho', 'isPerguntador', 'isRespondedor'
];

// Nomes da versão 2 (estado salvo e protocolo) dos campos do jogador e do
// ranking, que passaram para inglês na versão 3.
const OLD_PLAYER_NAMES = ['recursos', 'phase', 'posicao', 'kpiFinal'];

// Nomes da versão 3 (estado salvo e protocolo) dos campos da assessoria e
// do pedido de ajuda, que passaram para inglês na versão 4; também os
// tipos de mensagem e os valores de motivo da mesma versão.
const OLD_ADVISORY_NAMES = [
    'assessoria', 'assessorName', 'sugestao', 'assessoriaTimeout', 'assessoriaBonus',
    'ajudaFila', 'candidatos', 'indice', 'ajudaTimeout',
    'recusado', 'invalido', 'motivo', 'alternativa', 'candidatoName', 'aceito',
    'doador', 'valor', 'doadorKPI', 'doadorRecursos', 'requesterKPI', 'requesterRecursos'
];
const OLD_ADVISORY_TYPES = [
    'assessoria-request', 'assessoria-started', 'assessoria-question', 'assessoria-answer', 'assessoria-result',
    'ajuda-request', 'ajuda-tentando', 'ajuda-oferta', 'ajuda-oferta-response', 'ajuda-sem-candidatos', 'ajuda-confirmada'
];
const OLD_ADVISORY_REASONS = ['ja-respondido', 'fase-encerramento', 'kpi-insuficiente', 'sem-doadores', 'todos-recusaram'];

// Nomes da versão 4 (estado salvo e protocolo) dos campos dos eventos
// (data/events.json), que passaram para inglês na versão 5.
const OLD_EVENT_NAMES = [
    'eventos', 'titulo', 'descricao',
    'recursos_todos', 'recursos_menos', 'troca_recursos', 'reserva_contingencia', 'neutro'
];

// IDs da versão 5 (estado salvo e protocolo) das áreas foco
// (CONFIG.FOCUS_AREAS e as listas de data/questions.pt-BR.json), que
// passaram para inglês na versão 6. São valores, não nomes de campo.
const OLD_FOCUS_AREA_IDS = ['iniciacao', 'planejamento', 'execucao', 'monitoramento_controle', 'encerramento'];

/** Valores de OLD_FOCUS_AREA_IDS (texto exato) em qualquer nível de `value`. */
function oldFocusAreaIdsIn(value, found = new Set()) {
    if (Array.isArray(value)) {
        value.forEach(v => oldFocusAreaIdsIn(v, found));
    } else if (value && typeof value === 'object') {
        Object.values(value).forEach(v => oldFocusAreaIdsIn(v, found));
    } else if (typeof value === 'string' && OLD_FOCUS_AREA_IDS.includes(value)) {
        found.add(value);
    }
    return [...found];
}

/** Nomes da lista `names` usados como campo em qualquer nível de `value`. */
function fieldNamesIn(value, names, found = new Set()) {
    if (Array.isArray(value)) {
        value.forEach(v => fieldNamesIn(v, names, found));
    } else if (value && typeof value === 'object') {
        for (const [key, v] of Object.entries(value)) {
            if (names.includes(key)) found.add(key);
            fieldNamesIn(v, names, found);
        }
    }
    return [...found];
}

/** Nomes de OLD_ROUND_NAMES usados como campo em qualquer nível de `value`. */
function oldNamesIn(value) {
    return fieldNamesIn(value, OLD_ROUND_NAMES);
}

/** Nomes de OLD_PLAYER_NAMES usados como campo em qualquer nível de `value`. */
function oldPlayerNamesIn(value) {
    return fieldNamesIn(value, OLD_PLAYER_NAMES);
}

/** Nomes de OLD_ADVISORY_NAMES usados como campo em qualquer nível de `value`. */
function oldAdvisoryNamesIn(value) {
    return fieldNamesIn(value, OLD_ADVISORY_NAMES);
}

/** Nomes de OLD_EVENT_NAMES usados como campo em qualquer nível de `value`. */
function oldEventNamesIn(value) {
    return fieldNamesIn(value, OLD_EVENT_NAMES);
}

module.exports = {
    fs, path, vm, ROOT,
    createEnvironment, tokenOf, test, check, start, finish,
    syncTo, roundScreens, unavailable, roomToReload, reloadHost, tryReloadHost, recordScreens, guestWithScreens,
    savedStateV1, savedStateV2, finalRankingV2, oldNamesIn, oldPlayerNamesIn,
    savedStateV3, oldAdvisoryNamesIn, OLD_ADVISORY_TYPES, OLD_ADVISORY_REASONS,
    savedStateV4, oldEventNamesIn, OLD_EVENT_NAMES,
    oldFocusAreaIdsIn, OLD_FOCUS_AREA_IDS
};
