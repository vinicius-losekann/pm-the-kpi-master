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
// _docs/testes-conexao.md e _docs/ISSUES.md — não mudam.
// ============================================

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const RAIZ = path.resolve(__dirname, '..', '..');

// Mesma ordem de carregamento do game.html para os arquivos envolvidos.
const ARQUIVOS = [
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
const CONFIG_TESTE = `
var CONFIG = {
    JOGO: {
        MIN_PLAYERS: 2,
        MAX_PLAYERS: 6,
        SESSION_DURATION: 3600,
        RESPOSTA_TIMEOUT: 60000,
        ASSESSORIA_TIMEOUT: 20000,
        HOST_TIMEOUT: 10000,
        ACTIVITIES_PER_PHASE: 2
    },
    FASES: [
        { id: 'iniciacao', nome: 'Iniciação', emoji: '🚀' },
        { id: 'planejamento', nome: 'Planejamento', emoji: '📋' }
    ],
    RECURSOS_INICIAIS: 10,
    KPI: { VALOR_RECURSO_FINAL: 2, ACERTO_BASE: 10, ASSESSORIA_ACERTO: 5, VALOR_VENDA_RECURSO: 10 },
    PEER: { debug: 0 }
};
`;

// ============================================
// AMBIENTE SIMULADO
// ============================================

/** D2: token "do navegador" de cada jogador nos testes. */
function tokenOf(nome) {
    return 'token-do-navegador-de-' + nome;
}

/**
 * Cria um "navegador" novo e isolado, carrega os arquivos reais do
 * jogo nele e devolve atalhos para simular jogadores entrando/saindo.
 * D3f: `opcoes.armazenamento` reaproveita o localStorage de outro
 * ambiente — a mesma página depois de um F5 (ver reloadHost()).
 */
function createEnvironment(opcoes = {}) {
    const registro = {
        enviados: [],     // { para, msg } — mensagens diretas (sendToPlayer / conn.send)
        broadcasts: [],   // msg — broadcastAll
        ui: [],           // nomes de funções de Game.ui chamadas
        logs: [],         // console.* (guardado para mostrar em caso de falha)
        listeners: [],    // eventos registrados em window.addEventListener
        paraHost: [],     // msg — sendToHost (lado guest)
        spies: { becomeHost: 0, attemptReconnectToNewHost: 0 }
    };

    const conexoes = {};
    let peerAtual = null;
    const connectionState = {
        getConnection: (id) => conexoes[id],
        getConnections: () => conexoes,
        setConnection: (id, c) => { conexoes[id] = c; },
        removeConnection: (id) => { delete conexoes[id]; },
        resetConnections: () => { for (const k of Object.keys(conexoes)) delete conexoes[k]; },
        getPeer: () => peerAtual,
        setPeer: (p) => { peerAtual = p; }
    };

    const consoleSilencioso = {};
    ['log', 'warn', 'error', 'info'].forEach(nivel => {
        consoleSilencioso[nivel] = (...args) => registro.logs.push(nivel + ': ' + args.join(' '));
    });

    // localStorage em memória (D2: guarda o token de identidade por sala;
    // D3f: e o estado salvo da partida, pelo persistence.js real).
    const armazenamento = opcoes.armazenamento || {};
    const localStorageFalso = {
        getItem: (k) => (k in armazenamento ? armazenamento[k] : null),
        setItem: (k, v) => { armazenamento[k] = String(v); },
        removeItem: (k) => { delete armazenamento[k]; }
    };

    const ctx = vm.createContext({
        console: consoleSilencioso,
        localStorage: localStorageFalso,
        crypto: require('crypto').webcrypto,
        // Timers desligados: nada roda "depois" — o teste é síncrono.
        setTimeout: () => 0,
        clearTimeout: () => {},
        setInterval: () => 0,
        clearInterval: () => {},
        alert: () => {},
        confirm: () => true,
        addEventListener: (evento) => { registro.listeners.push(evento); },
        URLSearchParams,
        location: { reload: () => {}, href: '', search: '' }
    });
    vm.runInContext('var window = this;' + CONFIG_TESTE, ctx);

    // Game.saveState / Game.persistence vêm do persistence.js real (D3f).
    ctx.Game = {
        ui: new Proxy({}, {
            get: (_, nome) => (...args) => { registro.ui.push(String(nome)); }
        }),
        i18n: { t: (chave) => chave },
        domain: {
            event: {
                sortearEvento: () => ({ id: 'e' + Math.random().toString(36).slice(2, 7), titulo: 'Evento de teste' }),
                aplicarEfeitosEvento: () => []
            },
            deck: {
                sortearPergunta: () => ({ id: 'q1', question: 'Pergunta?', alternatives: ['A', 'B', 'C', 'D'], correct: 'A', domain_key: 'd1' }),
                resetAllBaralhos: () => {}
            },
            ranking: {
                buildRanking: (players) => players.map((p, i) => ({ posicao: i + 1, name: p.name, kpiFinal: p.kpi }))
            }
        },
        network: {
            connectionState,
            broadcastAll: (msg) => { registro.broadcasts.push(msg); },
            sendToPlayer: (peerId, msg) => { registro.enviados.push({ para: peerId, msg }); },
            sendToHost: () => {},
            cleanup: () => {}
        }
    };

    for (const arquivo of ARQUIVOS) {
        const caminho = path.join(RAIZ, arquivo);
        if (!fs.existsSync(caminho)) {
            throw new Error('Arquivo não encontrado: ' + arquivo + ' (rode a partir da raiz do repositório)');
        }
        vm.runInContext(fs.readFileSync(caminho, 'utf8'), ctx, { filename: arquivo });
    }

    // peerService.js real substitui o envio de mensagens pelo envio via
    // PeerJS; aqui voltam os stubs que só registram (handleConnection e
    // encerrarConexoesAoSair continuam os reais).
    Object.assign(ctx.Game.network, {
        broadcastAll: (msg) => { registro.broadcasts.push(msg); },
        sendToPlayer: (peerId, msg) => { registro.enviados.push({ para: peerId, msg }); },
        sendToHost: (msg) => { registro.paraHost.push(msg); },
        cleanup: () => {},
        handleHostDisconnect: () => {}
    });

    // Espiões no lugar das funções de migração que abririam conexões de verdade.
    ctx.becomeHost = () => { registro.spies.becomeHost++; };
    ctx.attemptReconnectToNewHost = () => { registro.spies.attemptReconnectToNewHost++; };

    const Game = ctx.Game;
    const state = Game.state;
    state.questionsData = { domains: { d1: { name: 'Domínio de teste' } }, eventos: [] };

    /**
     * Conexão falsa com a mesma interface usada do PeerJS: on(evento, cb),
     * send(), close() — close() dispara o 'close' registrado, como o
     * PeerJS faz. Passa pelo handleConnection() real.
     */
    function openConnection(peerId) {
        const handlers = {};
        const c = {
            peer: peerId,
            open: true,
            on: (evento, cb) => { handlers[evento] = cb; },
            send: (msg) => { registro.enviados.push({ para: peerId, msg }); },
            close: () => {
                if (!c.open) return;
                c.open = false;
                if (handlers.close) handlers.close();
            },
            fire: (evento, arg) => { if (handlers[evento]) handlers[evento](arg); }
        };
        Game.network.handleConnection(c);
        c.fire('open');
        return c;
    }

    const amb = {
        ctx, Game, state, registro, armazenamento, localStorageFalso, CONFIG: vm.runInContext('CONFIG', ctx),

        /** Conexão falsa já aberta, passando pelo handleConnection() real. */
        connect: (peerId) => openConnection(peerId),

        /** Host sozinho no lobby. */
        createRoomAsHost() {
            state.isHost = true;
            state.playerName = 'Host';
            state.peerId = 'peer-host';
            state.players = [{
                name: 'Host', peerId: 'peer-host', isHost: true, kpi: 0, recursos: 10,
                phase: 'iniciacao', activities: 0, waitingInLobby: false
            }];
        },

        /**
         * Guest conecta e envia player-join pela conexão (como o guest real
         * faz). D2: por padrão cada nome usa sempre o mesmo token (o do
         * "navegador" dele); passe outro token para simular um impostor,
         * ou null para um player-join sem token.
         */
        join(nome, peerId, token = tokenOf(nome)) {
            const c = openConnection(peerId);
            const msg = { type: 'player-join', playerName: nome, peerId };
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
            state.usedRespondedorThisRound = [];
            Game.core.startNewRound();
        },

        player: (nome) => state.players.find(p => p.name === nome),
        rejectionFor(peerId) {
            const r = registro.enviados.find(e => e.para === peerId && e.msg.type === 'join-rejected');
            return r ? r.msg.reason : null;
        },
        /**
         * Troca o Peer do PeerJS (e o document) por dublês. Cada
         * `new Peer()` entra na lista devolvida, com os handlers
         * registrados (fire(evento, arg) os chama) e os destinos
         * pedidos em connect(). connect() devolve uma conexão falsa que
         * não abre sozinha, ou `opcoes.connectDevolve`, se informado, ou
         * o que `opcoes.aoConectar(destino)` devolver (D3c: uma conexão
         * por destino, para a procura em várias versões do host).
         */
        installFakePeer(opcoes = {}) {
            const peersCriados = [];
            ctx.Peer = function (id, opcoesPeer) {
                const handlers = {};
                this.id = id;
                this.opcoesPeer = opcoesPeer;
                this.destroyed = false;
                this.disconnected = false;
                this.reconexoes = 0;
                this.reconnect = () => { this.reconexoes++; };
                this.conexoesPedidas = [];
                this.on = (evento, cb) => { handlers[evento] = cb; };
                this.destroy = () => { this.destroyed = true; };
                this.connect = (destino) => {
                    this.conexoesPedidas.push(destino);
                    if (opcoes.aoConectar) return opcoes.aoConectar(destino);
                    if ('connectDevolve' in opcoes) return opcoes.connectDevolve;
                    return { peer: destino, open: false, on: () => {}, send: () => {}, close: () => {} };
                };
                this.fire = (evento, arg) => { if (handlers[evento]) handlers[evento](arg); };
                peersCriados.push(this);
            };
            ctx.document = { getElementById: () => ({ style: {}, textContent: '' }) };
            return peersCriados;
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
            const contagens = [];
            ctx.setInterval = (fn) => { contagens.push({ fn, ligada: true }); return contagens.length; };
            ctx.clearInterval = (id) => { if (contagens[id - 1]) contagens[id - 1].ligada = false; };
            return {
                tick(n = 1) {
                    for (let i = 0; i < n; i++) contagens.filter(c => c.ligada).forEach(c => c.fn());
                },
                activeCount: () => contagens.filter(c => c.ligada).length
            };
        },

        /** D2b: este ambiente vira um guest e recebe um state-sync do host. */
        receiveSync(nome, fullState) {
            state.isHost = false;
            state.playerName = nome;
            Game.network.handleMessage({ type: 'state-sync', fullState }, 'sala');
        },

        /**
         * D3b: troca setTimeout/clearTimeout e Date.now() por um tempo
         * controlado pelo teste. advance(ms) anda o relógio e roda, na
         * ordem, os timers que vencerem (inclusive os agendados durante
         * o avanço).
         */
        fakeTime() {
            let agora = 1000000;
            let seq = 0;
            const fila = [];
            ctx.setTimeout = (fn, ms) => { const id = ++seq; fila.push({ id, fn, quando: agora + (ms || 0) }); return id; };
            ctx.clearTimeout = (id) => { const i = fila.findIndex(t => t.id === id); if (i >= 0) fila.splice(i, 1); };
            ctx.Date = class extends Date { static now() { return agora; } };
            return {
                agora: () => agora,
                advance(ms) {
                    const fim = agora + ms;
                    for (;;) {
                        fila.sort((a, b) => a.quando - b.quando || a.id - b.id);
                        if (!fila.length || fila[0].quando > fim) break;
                        const t = fila.shift();
                        agora = t.quando;
                        t.fn();
                    }
                    agora = fim;
                }
            };
        },

        /**
         * D3b: peer local (guest) cujas conexões só abrem quando o teste
         * mandar — conexoes guarda todas as pedidas, na ordem.
         */
        guestPeer() {
            const conexoes = [];
            const peer = {
                destroyed: false,
                connect(destino) {
                    const h = {};
                    const c = {
                        peer: destino, open: false, fechada: false,
                        on: (ev, cb) => { h[ev] = cb; },
                        send: () => {},
                        close() { c.fechada = true; c.open = false; },
                        openNow() { c.open = true; if (h.open) h.open(); }
                    };
                    conexoes.push(c);
                    return c;
                }
            };
            connectionState.setPeer(peer);
            return conexoes;
        },

        /** D3b: URL da página e history.replaceState simulados. */
        fakeUrl(href) {
            const trocas = [];
            ctx.URL = URL;
            ctx.location.href = href;
            ctx.history = {
                state: null,
                replaceState: (_, __, url) => { trocas.push(url); ctx.location.href = url; }
            };
            return {
                trocas,
                param: (nome) => new URL(ctx.location.href).searchParams.get(nome)
            };
        },

        broadcastsOfType: (tipo) => registro.broadcasts.filter(m => m.type === tipo),
        clearLog() {
            registro.enviados.length = 0;
            registro.broadcasts.length = 0;
            registro.ui.length = 0;
            registro.paraHost.length = 0;
        }
    };
    return amb;
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
        if (env && env.registro.logs.length) {
            console.log('     Últimos logs do jogo:');
            env.registro.logs.slice(-6).forEach(l => console.log('       ' + l));
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
function syncTo(amb, peerId) {
    const e = amb.registro.enviados.filter(x => x.para === peerId && x.msg.type === 'state-sync').pop();
    return e ? e.msg.fullState : null;
}

/** Telas de pergunta/rodada que o guest montou. */
function roundScreens(amb) {
    return amb.registro.ui.filter(n => ['displayQuestion', 'displayRoundStart', 'displaySpectatorView',
        'showRoundEndedMessage', 'showPartidaPausadaMessage'].includes(n));
}

const unavailable = (id) => ({ type: 'peer-unavailable', message: 'Could not connect to peer ' + id });

/**
 * Host sozinho no lobby, com nome e ID de sala — o estado salvo só é
 * restaurado no F5 se a sala e o jogador da URL baterem com ele.
 */
function roomToReload(amb) {
    amb.createRoomAsHost();
    amb.state.roomName = 'sala';
    amb.state.baseRoomPeerId = 'sala';
    amb.state.hostPeerId = 'sala';
}

/**
 * F5 do host: página nova (outro ambiente, mesmo localStorage) que lê a
 * URL como init() (main.js) e restaura o estado salvo pelo
 * persistence.js real. A retomada da partida fica para o teste chamar
 * (Game.core.retomarPartidaAposRecarregar()), depois de instalar os
 * dublês de que precisar.
 */
function reloadHost(amb) {
    const { novo, restaurou } = tryReloadHost(amb);
    check(restaurou === true, 'o F5 deveria restaurar o estado salvo');
    return novo;
}

/**
 * Como reloadHost(), mas sem exigir que o estado seja restaurado
 * (roadmap 3.1: versão desconhecida ou inválida não restaura).
 */
function tryReloadHost(amb) {
    const novo = createEnvironment({ armazenamento: amb.armazenamento });
    const s = novo.state;
    const base = amb.state.baseRoomPeerId;
    novo.ctx.location.search = '?' + new URLSearchParams({ host: 'true', room: amb.state.roomName, playerName: amb.state.playerName, peerId: base }).toString();
    s.isHost = true;
    s.roomName = amb.state.roomName;
    s.playerName = amb.state.playerName;
    s.hostPeerId = base;
    s.baseRoomPeerId = base;
    s.hostVersion = 0;
    const restaurou = novo.Game.persistence.tryRestoreState();
    s.peerId = amb.state.peerId; // initPeer() abre de novo com o mesmo ID
    return { novo, restaurou };
}

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

module.exports = {
    fs, path, vm, RAIZ,
    createEnvironment, tokenOf, test, check, start, finish,
    syncTo, roundScreens, unavailable, roomToReload, reloadHost, tryReloadHost, recordScreens
};
