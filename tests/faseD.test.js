// ============================================
// PM: The KPI Master - Testes automatizados da Fase D
// ============================================
// Roda a lógica REAL de sala travada / jogador desconectado / pausa
// (Fase D1a), de limpeza de desconectados ao voltar ao lobby e na
// migração de host (Fase D1b, incluindo a robustez da própria
// migração), do token de identidade por sala (Fase D2) e do estado que
// o guest recebe ao reconectar — relógio e situação da rodada (Fase
// D2b) — das opções centralizadas do PeerJS (Fase D3a), do prazo de
// espera pelo host / volta do host antigo como jogador comum (Fase
// D3b) e da procura da sala depois de migrações de host, inclusive na
// tela inicial (Fase D3c) num ambiente
// simulado, sem navegador e sem PeerJS: a rede é trocada por conexões
// falsas, a UI por um registro de chamadas e o localStorage por um
// objeto em memória.
//
// Roda automaticamente no GitHub a cada push (ver
// .github/workflows/testes.yml) — resultado na aba "Actions" do
// repositório, com resumo em tabela e log completo para download.
// Também dá para rodar localmente, se houver Node 14+ instalado
// (a partir da raiz do repositório):
//     node tests/faseD.test.js
//
// As entradas e quedas de jogador passam pelo handleConnection() REAL
// de peerService.js (conexões falsas disparam 'open'/'data'/'close'
// como o PeerJS faria).
//
// O que NÃO é testado aqui (continua precisando de teste manual):
// - se o navegador/PeerJS de fato entrega o 'close' ao outro lado, e
//   em quanto tempo — isso depende de rede de verdade;
// - a parte visual (📴 na lista, aviso de partida pausada).
//
// Os números dos testes (T1, T2...) batem com o roteiro de teste
// manual da D1a, da D1b, da D2, da D2b e da D3 (a, b, c).
// ============================================

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const RAIZ = path.resolve(__dirname, '..');

// Mesma ordem de carregamento do game.html para os arquivos envolvidos.
const ARQUIVOS = [
    'js/utils/identity.js',
    'js/network/hostSearch.js',
    'js/state/store.js',
    'js/state/selectors.js',
    'js/state/mutations.js',
    'js/engine/sessionEngine.js',
    'js/engine/turnEngine.js',
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
    KPI: { VALOR_RECURSO_FINAL: 2 },
    PEER: { debug: 0 }
};
`;

// ============================================
// AMBIENTE SIMULADO
// ============================================

/** D2: token "do navegador" de cada jogador nos testes. */
function tokenDe(nome) {
    return 'token-do-navegador-de-' + nome;
}

/**
 * Cria um "navegador" novo e isolado, carrega os arquivos reais do
 * jogo nele e devolve atalhos para simular jogadores entrando/saindo.
 */
function criarAmbiente() {
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

    // localStorage em memória (D2: guarda o token de identidade por sala).
    const armazenamento = {};
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
        location: { reload: () => {}, href: '' }
    });
    vm.runInContext('var window = this;' + CONFIG_TESTE, ctx);

    ctx.Game = {
        ui: new Proxy({}, {
            get: (_, nome) => (...args) => { registro.ui.push(String(nome)); }
        }),
        i18n: { t: (chave) => chave },
        saveState: () => {},
        persistence: { clearSavedState: () => {} },
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
            cleanup: () => {},
            reconnectToNewHost: () => {}
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
        reconnectToNewHost: () => {},
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
    function abrirConexao(peerId) {
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
            disparar: (evento, arg) => { if (handlers[evento]) handlers[evento](arg); }
        };
        Game.network.handleConnection(c);
        c.disparar('open');
        return c;
    }

    const amb = {
        ctx, Game, state, registro, armazenamento, localStorageFalso, CONFIG: vm.runInContext('CONFIG', ctx),

        /** Conexão falsa já aberta, passando pelo handleConnection() real. */
        conectar: (peerId) => abrirConexao(peerId),

        /** Host sozinho no lobby. */
        criarSalaComoHost() {
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
        entrar(nome, peerId, token = tokenDe(nome)) {
            const c = abrirConexao(peerId);
            const msg = { type: 'player-join', playerName: nome, peerId };
            if (token !== null) msg.token = token;
            c.disparar('data', msg);
        },

        /** Hash que o host deveria guardar para um token. */
        hash: (token) => Game.identity.hashToken(token),

        /** Queda de conexão vista pelo host: dispara o 'close' da conexão. */
        cair(peerId) {
            const c = connectionState.getConnection(peerId);
            if (!c) throw new Error('não há conexão aberta para ' + peerId);
            c.close();
        },

        /** Simula o início da partida sem timer/DOM (o que startGame faz de relevante). */
        iniciarPartida() {
            state.gameStarted = true;
            state.gameOver = false;
            state.usedRespondedorThisRound = [];
            Game.core.startNewRound();
        },

        jogador: (nome) => state.players.find(p => p.name === nome),
        recusaPara(peerId) {
            const r = registro.enviados.find(e => e.para === peerId && e.msg.type === 'join-rejected');
            return r ? r.msg.reason : null;
        },
        /**
         * Troca o Peer do PeerJS (e o document) por dublês. Cada
         * `new Peer()` entra na lista devolvida, com os handlers
         * registrados (disparar(evento, arg) os chama) e os destinos
         * pedidos em connect(). connect() devolve uma conexão falsa que
         * não abre sozinha, ou `opcoes.connectDevolve`, se informado, ou
         * o que `opcoes.aoConectar(destino)` devolver (D3c: uma conexão
         * por destino, para a procura em várias versões do host).
         */
        instalarPeerFalso(opcoes = {}) {
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
                this.disparar = (evento, arg) => { if (handlers[evento]) handlers[evento](arg); };
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
        assumirComoHost() {
            const peers = this.instalarPeerFalso();
            Game.network.becomeHost();
            peers[peers.length - 1].disparar('open', Game.computeHostPeerId(state.baseRoomPeerId, state.hostVersion));
        },

        /**
         * D2b: troca setInterval/clearInterval por um relógio controlado
         * pelo teste. tic(n) avança n segundos em todas as contagens
         * ligadas; ativos() diz quantas estão ligadas.
         */
        relogioFalso() {
            const contagens = [];
            ctx.setInterval = (fn) => { contagens.push({ fn, ligada: true }); return contagens.length; };
            ctx.clearInterval = (id) => { if (contagens[id - 1]) contagens[id - 1].ligada = false; };
            return {
                tic(n = 1) {
                    for (let i = 0; i < n; i++) contagens.filter(c => c.ligada).forEach(c => c.fn());
                },
                ativos: () => contagens.filter(c => c.ligada).length
            };
        },

        /** D2b: este ambiente vira um guest e recebe um state-sync do host. */
        receberSync(nome, fullState) {
            state.isHost = false;
            state.playerName = nome;
            Game.network.handleMessage({ type: 'state-sync', fullState }, 'sala');
        },

        /**
         * D3b: troca setTimeout/clearTimeout e Date.now() por um tempo
         * controlado pelo teste. avancar(ms) anda o relógio e roda, na
         * ordem, os timers que vencerem (inclusive os agendados durante
         * o avanço).
         */
        tempoFalso() {
            let agora = 1000000;
            let seq = 0;
            const fila = [];
            ctx.setTimeout = (fn, ms) => { const id = ++seq; fila.push({ id, fn, quando: agora + (ms || 0) }); return id; };
            ctx.clearTimeout = (id) => { const i = fila.findIndex(t => t.id === id); if (i >= 0) fila.splice(i, 1); };
            ctx.Date = class extends Date { static now() { return agora; } };
            return {
                agora: () => agora,
                avancar(ms) {
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
        peerDeGuest() {
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
                        abrir() { c.open = true; if (h.open) h.open(); }
                    };
                    conexoes.push(c);
                    return c;
                }
            };
            connectionState.setPeer(peer);
            return conexoes;
        },

        /** D3b: URL da página e history.replaceState simulados. */
        urlFalsa(href) {
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

        broadcastsDoTipo: (tipo) => registro.broadcasts.filter(m => m.type === tipo),
        limparRegistro() {
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

let passou = 0;
let falhou = 0;
const resultados = []; // { nome, ok, erro } — usado no resumo do GitHub Actions

function teste(nome, fn) {
    let amb = null;
    try {
        fn((a) => { amb = a; return a; });
        passou++;
        resultados.push({ nome, ok: true });
        console.log('  ✅ ' + nome);
    } catch (err) {
        falhou++;
        resultados.push({ nome, ok: false, erro: err.message });
        console.log('  ❌ ' + nome);
        console.log('     → ' + err.message);
        if (amb && amb.registro.logs.length) {
            console.log('     Últimos logs do jogo:');
            amb.registro.logs.slice(-6).forEach(l => console.log('       ' + l));
        }
    }
}

function confere(condicao, mensagem) {
    if (!condicao) throw new Error(mensagem);
}

// ============================================
// TESTES
// ============================================

console.log('\n🧪 Fase D — sala travada, jogador desconectado, pausa, saída da página, volta ao lobby, migração, identidade, reconexão\n');

teste('T1  Lobby: guest que cai é removido da lista (como antes)', (usar) => {
    const amb = usar(criarAmbiente());
    amb.criarSalaComoHost();
    amb.entrar('A', 'peer-a');
    confere(amb.jogador('A'), 'A deveria ter entrado no lobby');
    amb.cair('peer-a');
    confere(!amb.jogador('A'), 'A deveria ter sido removido da lista');
});

teste('T2  Partida em andamento: nome novo é recusado (room-locked)', (usar) => {
    const amb = usar(criarAmbiente());
    amb.criarSalaComoHost();
    amb.entrar('A', 'peer-a');
    amb.entrar('B', 'peer-b');
    amb.iniciarPartida();
    amb.entrar('C', 'peer-c');
    confere(amb.recusaPara('peer-c') === 'room-locked', 'esperava recusa room-locked, veio: ' + amb.recusaPara('peer-c'));
    confere(!amb.jogador('C'), 'C não deveria ter entrado na lista');
    confere(amb.state.players.length === 3, 'lista deveria continuar com 3 jogadores');
});

teste('T3  Nome em uso por jogador conectado continua bloqueado (name-taken)', (usar) => {
    const amb = usar(criarAmbiente());
    amb.criarSalaComoHost();
    amb.entrar('A', 'peer-a');
    amb.entrar('B', 'peer-b');
    amb.iniciarPartida();
    amb.entrar('A', 'peer-impostor');
    confere(amb.recusaPara('peer-impostor') === 'name-taken', 'esperava name-taken, veio: ' + amb.recusaPara('peer-impostor'));
    confere(amb.jogador('A').peerId === 'peer-a', 'A original não deveria ter perdido o peerId');
});

teste('T3b Nome do próprio host é recusado (name-taken), host não perde o lugar', (usar) => {
    for (const comPartida of [false, true]) {
        const amb = usar(criarAmbiente());
        amb.criarSalaComoHost();
        amb.entrar('A', 'peer-a');
        if (comPartida) amb.iniciarPartida();
        amb.entrar('Host', 'peer-intruso');
        const onde = comPartida ? ' (partida em andamento)' : ' (lobby)';
        confere(amb.recusaPara('peer-intruso') === 'name-taken', 'esperava name-taken' + onde + ', veio: ' + amb.recusaPara('peer-intruso'));
        confere(amb.jogador('Host').peerId === 'peer-host', 'o host não pode perder o próprio peerId' + onde);
    }
});

teste('T4  Queda de espectador: fica na lista, fora do sorteio, volta com tudo preservado', (usar) => {
    const amb = usar(criarAmbiente());
    amb.criarSalaComoHost();
    amb.entrar('A', 'peer-a');
    amb.entrar('B', 'peer-b');
    amb.iniciarPartida();
    const a = amb.jogador('A');
    Object.assign(a, { kpi: 7, recursos: 4, phase: 'planejamento', activities: 1 });
    amb.state.currentRound = { evento: { id: 'e1' }, perguntador: 'Host', respondedor: 'B', pergunta: null, respondeu: false };

    amb.limparRegistro();
    amb.cair('peer-a');
    confere(amb.jogador('A'), 'A não deveria ter sido removido');
    confere(amb.jogador('A').disconnected === true, 'A deveria estar marcado como disconnected');
    confere(!amb.Game.getActivePlayers().some(p => p.name === 'A'), 'A não deveria estar entre os ativos');
    confere(amb.state.currentRound && amb.state.currentRound.respondedor === 'B', 'rodada de espectador não deveria ser abortada');
    const lista = amb.broadcastsDoTipo('player-list').pop();
    confere(lista && lista.players.find(p => p.name === 'A').disconnected === true, 'player-list enviado deveria mostrar A desconectado');

    amb.entrar('A', 'peer-a2');
    const volta = amb.jogador('A');
    confere(!volta.disconnected, 'A deveria voltar como conectado');
    confere(volta.peerId === 'peer-a2', 'peerId de A deveria ser o novo');
    confere(volta.kpi === 7 && volta.recursos === 4 && volta.phase === 'planejamento' && volta.activities === 1,
        'KPI/recursos/fase/atividades de A deveriam estar preservados');
    confere(amb.registro.enviados.some(e => e.para === 'peer-a2' && e.msg.type === 'state-sync'), 'A deveria receber state-sync');

    // 'close' atrasado da conexão antiga não pode derrubar o jogador de novo.
    amb.Game.network.handlePlayerDisconnect('peer-a');
    confere(!amb.jogador('A').disconnected, 'close atrasado da conexão antiga não deveria marcar A como desconectado');
});

teste('T5  Queda de participante: rodada abortada, nova dupla sem ele', (usar) => {
    for (let i = 0; i < 20; i++) {
        const amb = usar(criarAmbiente());
        amb.criarSalaComoHost();
        amb.entrar('A', 'peer-a');
        amb.entrar('B', 'peer-b');
        amb.iniciarPartida();
        amb.state.currentRound = { evento: { id: 'e1' }, perguntador: 'Host', respondedor: 'A', pergunta: null, respondeu: false };

        amb.cair('peer-a');
        const r = amb.state.currentRound;
        confere(r, 'deveria haver uma nova rodada (rodada ' + i + ')');
        confere(r.perguntador !== 'A' && r.respondedor !== 'A', 'A desconectado não pode ser sorteado (rodada ' + i + ')');
    }
});

teste('T6  Pausa quando falta só conexão, retomada com o mesmo evento', (usar) => {
    const amb = usar(criarAmbiente());
    amb.criarSalaComoHost();
    amb.entrar('A', 'peer-a');
    amb.iniciarPartida();

    amb.limparRegistro();
    amb.cair('peer-a');
    confere(!amb.state.gameOver, 'partida NÃO deveria ter sido encerrada');
    confere(amb.state.partidaPausada, 'partida deveria estar pausada');
    confere(amb.state.currentRound === null, 'não deveria haver rodada durante a pausa');
    confere(amb.broadcastsDoTipo('partida-pausada').length === 1, 'deveria ter avisado os guests da pausa');
    confere(amb.registro.ui.includes('showPartidaPausadaMessage'), 'host deveria ver o aviso de pausa');
    const eventoPausado = amb.state.partidaPausada.evento;

    amb.limparRegistro();
    amb.entrar('A', 'peer-a2');
    confere(!amb.state.partidaPausada, 'pausa deveria ter sido desfeita');
    confere(amb.state.currentRound, 'deveria haver uma nova dupla');
    confere(amb.state.currentRound.evento === eventoPausado, 'a rodada deveria continuar com o mesmo evento');
    confere(amb.broadcastsDoTipo('round-start').length === 1, 'deveria ter enviado round-start');
    confere(amb.broadcastsDoTipo('show-evento').length === 0, 'NÃO deveria reexibir o modal de evento');
    const iSync = amb.registro.enviados.findIndex(e => e.para === 'peer-a2' && e.msg.type === 'state-sync');
    confere(iSync >= 0, 'A deveria receber state-sync ao voltar');
});

teste('T7  Falta de jogador de verdade (sair da partida) ainda encerra', (usar) => {
    const amb = usar(criarAmbiente());
    amb.criarSalaComoHost();
    amb.entrar('A', 'peer-a');
    amb.iniciarPartida();
    amb.Game.network.handleMessage({ type: 'leave-match-request', playerName: 'A' }, 'peer-a');
    confere(amb.state.gameOver === true, 'partida deveria ter sido encerrada');
    confere(!amb.state.partidaPausada, 'não deveria pausar quando falta jogador de verdade');
});

teste('T8  Ciclo da rodada termina sem esperar o desconectado', (usar) => {
    const amb = usar(criarAmbiente());
    amb.criarSalaComoHost();
    amb.entrar('A', 'peer-a');
    amb.entrar('B', 'peer-b');
    amb.iniciarPartida();
    const usados = ['Host', 'A'];
    const sel = amb.Game.selectors;
    confere(!sel.isCycleComplete(amb.Game.getActivePlayers(), usados), 'com B conectado, o ciclo NÃO está completo');
    amb.jogador('B').disconnected = true;
    confere(sel.isCycleComplete(amb.Game.getActivePlayers(), usados), 'com B desconectado, o ciclo deveria estar completo');
});

teste('T9  Sala cheia: quem caiu consegue voltar; nome novo leva room-locked', (usar) => {
    const amb = usar(criarAmbiente());
    amb.CONFIG.JOGO.MAX_PLAYERS = 3;
    amb.criarSalaComoHost();
    amb.entrar('A', 'peer-a');
    amb.entrar('B', 'peer-b');
    amb.iniciarPartida();

    amb.cair('peer-a');
    amb.entrar('A', 'peer-a2');
    confere(amb.recusaPara('peer-a2') === null, 'A não deveria ser recusado, veio: ' + amb.recusaPara('peer-a2'));
    confere(!amb.jogador('A').disconnected, 'A deveria estar conectado de novo');

    amb.entrar('D', 'peer-d');
    confere(amb.recusaPara('peer-d') === 'room-locked', 'esperava room-locked para D, veio: ' + amb.recusaPara('peer-d'));
});

teste('T10 Migração: backup desconectado é pulado, próximo assume', (usar) => {
    // Visão do guest B: lista [Host, A (desconectado), B].
    const amb = usar(criarAmbiente());
    amb.state.isHost = false;
    amb.state.playerName = 'B';
    amb.state.players = [
        { name: 'Host', peerId: 'peer-host', isHost: true },
        { name: 'A', peerId: 'peer-a', isHost: false, disconnected: true },
        { name: 'B', peerId: 'peer-b', isHost: false }
    ];
    amb.ctx.decideHostTakeoverOrReconnectNewVersion();
    confere(amb.registro.spies.becomeHost === 1, 'B deveria assumir como host');

    // Controle: com A conectado, B NÃO assume (A é o backup).
    const amb2 = usar(criarAmbiente());
    amb2.state.isHost = false;
    amb2.state.playerName = 'B';
    amb2.state.players = [
        { name: 'Host', peerId: 'peer-host', isHost: true },
        { name: 'A', peerId: 'peer-a', isHost: false },
        { name: 'B', peerId: 'peer-b', isHost: false }
    ];
    amb2.ctx.decideHostTakeoverOrReconnectNewVersion();
    confere(amb2.registro.spies.becomeHost === 0 && amb2.registro.spies.attemptReconnectToNewHost === 1,
        'com A conectado, B deveria procurar o novo host em vez de assumir');
});

teste('T11 Fim de jogo: quem cai é removido (como antes)', (usar) => {
    const amb = usar(criarAmbiente());
    amb.criarSalaComoHost();
    amb.entrar('A', 'peer-a');
    amb.entrar('B', 'peer-b');
    amb.iniciarPartida();
    amb.state.gameOver = true;
    amb.cair('peer-a');
    confere(!amb.jogador('A'), 'A deveria ter sido removido após o fim de jogo');
});

teste('T12 Saída da página: handlers de pagehide/beforeunload registrados', (usar) => {
    const amb = usar(criarAmbiente());
    confere(amb.registro.listeners.includes('pagehide'), 'faltou registrar pagehide (celular)');
    confere(amb.registro.listeners.includes('beforeunload'), 'faltou registrar beforeunload (desktop)');
});

teste('T13 F5/fechar no host: encerra conexões sem mexer no estado do jogo', (usar) => {
    const amb = usar(criarAmbiente());
    amb.criarSalaComoHost();
    amb.entrar('A', 'peer-a');
    amb.entrar('B', 'peer-b');
    amb.iniciarPartida();
    const peerFalso = { destroyed: false, destroy() { this.destroyed = true; } };
    amb.Game.network.connectionState.setPeer(peerFalso);

    const rodadaAntes = amb.state.currentRound;
    amb.limparRegistro();
    amb.Game.network.encerrarConexoesAoSair();
    confere(peerFalso.destroyed, 'o peer deveria ter sido destruído');
    confere(amb.state.players.every(p => !p.disconnected), 'nenhum jogador deveria ser marcado como desconectado pelo próprio reload do host');
    confere(amb.state.currentRound === rodadaAntes, 'a rodada em andamento não deveria mudar (seria o BUG-001 de volta)');
    confere(amb.registro.broadcasts.length === 0, 'não deveria enviar nada durante a saída');

    // Idempotente: rodar de novo (pagehide + beforeunload) não faz nada.
    amb.Game.network.encerrarConexoesAoSair();
    confere(amb.state.currentRound === rodadaAntes, 'segunda chamada não deveria ter efeito');
});

teste('T14 Encerrar partida: desconectado que não voltou sai da lista do lobby', (usar) => {
    const amb = usar(criarAmbiente());
    amb.criarSalaComoHost();
    amb.entrar('A', 'peer-a');
    amb.entrar('B', 'peer-b');
    amb.iniciarPartida();
    amb.cair('peer-a');
    confere(amb.jogador('A') && amb.jogador('A').disconnected, 'pré-condição: A marcado como desconectado');

    amb.limparRegistro();
    amb.Game.core.endMatch();
    confere(!amb.jogador('A'), 'A deveria ter saído da lista ao voltar ao lobby');
    confere(amb.jogador('B') && amb.jogador('Host'), 'Host e B (conectados) deveriam continuar');
    confere(amb.state.backupPeerId === 'peer-b', 'backup era A — deveria passar para B, veio: ' + amb.state.backupPeerId);
    const fim = amb.broadcastsDoTipo('match-ended').pop();
    confere(fim && !fim.players.some(p => p.name === 'A'), 'match-ended deveria levar a lista sem A');

    // No lobby, A pode voltar normalmente como jogador novo.
    amb.entrar('A', 'peer-a2');
    confere(amb.recusaPara('peer-a2') === null, 'A deveria conseguir entrar de novo, veio: ' + amb.recusaPara('peer-a2'));
    confere(amb.jogador('A') && !amb.jogador('A').disconnected, 'A deveria estar de volta na lista');
});

teste('T15 Encerrar partida pausada: pausa não sobra para a próxima partida', (usar) => {
    const amb = usar(criarAmbiente());
    amb.criarSalaComoHost();
    amb.entrar('A', 'peer-a');
    amb.iniciarPartida();
    amb.cair('peer-a');
    confere(amb.state.partidaPausada, 'pré-condição: partida pausada');

    amb.Game.core.endMatch();
    confere(!amb.state.partidaPausada, 'a pausa deveria ter sido desfeita ao encerrar');
    confere(!amb.jogador('A'), 'A deveria ter saído da lista');
    confere(amb.state.players.length === 1, 'só o host deveria sobrar na sala');
});

teste('T16 Voltar ao lobby após o fim de jogo (host): limpa desconectados e avisa os guests', (usar) => {
    const amb = usar(criarAmbiente());
    amb.criarSalaComoHost();
    amb.entrar('A', 'peer-a');
    amb.entrar('B', 'peer-b');
    amb.iniciarPartida();
    amb.cair('peer-a');
    amb.Game.core.endGame(amb.Game.core.buildRanking());
    confere(amb.state.gameOver && amb.jogador('A'), 'pré-condição: fim de jogo com A ainda na lista');

    amb.limparRegistro();
    amb.Game.core.voltarAoLobby();
    confere(!amb.jogador('A'), 'A deveria ter saído da lista');
    confere(amb.jogador('B'), 'B deveria continuar');
    confere(!amb.state.gameStarted && !amb.state.gameOver && amb.state.currentRound === null, 'estado da partida deveria estar zerado');
    const lista = amb.broadcastsDoTipo('player-list').pop();
    confere(lista && !lista.players.some(p => p.name === 'A'), 'host deveria mandar player-list sem A para os guests');

    amb.entrar('C', 'peer-c');
    confere(amb.recusaPara('peer-c') === null, 'no lobby, nome novo deveria entrar, veio: ' + amb.recusaPara('peer-c'));
});

teste('T16b Voltar ao lobby (guest): limpa só a cópia local, sem mandar nada', (usar) => {
    const amb = usar(criarAmbiente());
    amb.state.isHost = false;
    amb.state.playerName = 'B';
    amb.state.gameStarted = true;
    amb.state.gameOver = true;
    amb.state.players = [
        { name: 'Host', peerId: 'peer-host', isHost: true },
        { name: 'A', peerId: 'peer-a', isHost: false, disconnected: true },
        // O próprio jogador nunca é removido da própria lista, mesmo
        // que uma lista antiga o mostre como desconectado.
        { name: 'B', peerId: 'peer-b', isHost: false, disconnected: true }
    ];
    amb.Game.core.voltarAoLobby();
    confere(!amb.jogador('A'), 'A deveria ter saído da lista local');
    confere(amb.jogador('B'), 'B nunca deveria remover a si mesmo');
    confere(amb.registro.broadcasts.length === 0, 'guest não deveria mandar nada');
});

teste('T17 Migração no meio da partida: novo host marca os outros como desconectados (host antigo vira jogador comum), pausa e retoma', (usar) => {
    const amb = usar(criarAmbiente());
    amb.state.isHost = false;
    amb.state.playerName = 'B';
    amb.state.peerId = 'peer-b';
    amb.state.baseRoomPeerId = 'sala';
    amb.state.hostVersion = 0;
    amb.state.gameStarted = true;
    amb.state.gameOver = false;
    amb.state.currentRound = null;
    amb.state.players = [
        { name: 'Host', peerId: 'sala', isHost: true, kpi: 0, recursos: 10, phase: 'iniciacao', activities: 0 },
        { name: 'A', peerId: 'peer-a', isHost: false, kpi: 5, recursos: 3, phase: 'planejamento', activities: 1 },
        { name: 'B', peerId: 'peer-b', isHost: false, kpi: 0, recursos: 10, phase: 'iniciacao', activities: 0 }
    ];

    amb.assumirComoHost();
    confere(amb.state.isHost && amb.jogador('B').isHost, 'B deveria ser o novo host');
    confere(amb.jogador('B').peerId === 'sala-h1', 'peerId de B deveria ser o da sala nova, veio: ' + amb.jogador('B').peerId);
    // D3b: o host antigo continua na partida, como jogador comum desconectado.
    const antigo = amb.jogador('Host');
    confere(antigo, 'o host antigo deveria continuar na lista');
    confere(antigo.isHost === false && antigo.disconnected === true, 'o host antigo deveria virar jogador comum, desconectado');
    confere(amb.state.players.filter(p => p.isHost).length === 1, 'só pode haver um host na lista');
    confere(amb.jogador('A').disconnected === true, 'A deveria ficar desconectado até reconectar ao novo host');
    confere(!amb.jogador('B').disconnected, 'o novo host não pode se marcar como desconectado');
    confere(amb.state.partidaPausada, 'só o novo host está conectado — a partida deveria pausar');
    confere(amb.state.currentRound === null, 'não deveria haver dupla com A ainda desconectado');

    amb.entrar('A', 'peer-a2');
    confere(!amb.jogador('A').disconnected && amb.jogador('A').peerId === 'peer-a2', 'A deveria voltar como conectado');
    confere(amb.jogador('A').kpi === 5 && amb.jogador('A').recursos === 3, 'KPI/recursos de A deveriam estar preservados');
    confere(!amb.state.partidaPausada && amb.state.currentRound, 'a partida deveria retomar com a volta de A');
});

teste('T18 Migração no lobby: os outros saem da lista e voltam como jogadores novos', (usar) => {
    const amb = usar(criarAmbiente());
    amb.state.isHost = false;
    amb.state.playerName = 'B';
    amb.state.peerId = 'peer-b';
    amb.state.baseRoomPeerId = 'sala';
    amb.state.hostVersion = 0;
    amb.state.gameStarted = false;
    amb.state.players = [
        { name: 'Host', peerId: 'sala', isHost: true },
        { name: 'A', peerId: 'peer-a', isHost: false },
        { name: 'B', peerId: 'peer-b', isHost: false }
    ];

    amb.assumirComoHost();
    confere(amb.state.players.length === 1 && amb.jogador('B'), 'só o novo host deveria ficar na lista do lobby');

    amb.entrar('A', 'peer-a2');
    confere(amb.recusaPara('peer-a2') === null, 'A deveria entrar de novo, veio: ' + amb.recusaPara('peer-a2'));
    confere(amb.jogador('A') && !amb.jogador('A').disconnected, 'A deveria estar na lista, conectado');
});

teste('T19 Peer já aberto: "peer-unavailable" (e outros erros) não destroem o peer', (usar) => {
    // Guest: o peer abre e já tenta conectar ao host.
    const amb = usar(criarAmbiente());
    amb.state.isHost = false;
    amb.state.hostPeerId = 'sala';
    amb.state.baseRoomPeerId = 'sala';
    const peers = amb.instalarPeerFalso();
    amb.Game.network.initPeer().catch(() => {});
    const peer = peers[0];
    peer.disparar('open', 'peer-guest');
    confere(peer.conexoesPedidas.includes('sala'), 'pré-condição: guest deveria tentar conectar ao host');

    // O que acontece na 1ª tentativa de reconexão quando o host sumiu.
    peer.disparar('error', { type: 'peer-unavailable', message: 'Could not connect to peer sala' });
    confere(!peer.destroyed, 'peer-unavailable NÃO pode destruir o peer (mataria a migração de host)');
    confere(amb.Game.network.connectionState.getPeer() === peer, 'o peer em uso deveria continuar o mesmo');

    peer.disparar('error', { type: 'socket-error', message: 'falha de socket' });
    confere(!peer.destroyed, 'depois do open, nenhum erro deveria destruir o peer');

    // Controle: ANTES do open (ex: ID do host ocupado após F5), continua
    // destruindo — o initPeerWithRetry() do main.js depende disso.
    const amb2 = usar(criarAmbiente());
    amb2.state.isHost = true;
    amb2.state.hostPeerId = 'sala';
    const peers2 = amb2.instalarPeerFalso();
    amb2.Game.network.initPeer().catch(() => {});
    peers2[0].disparar('error', { type: 'unavailable-id', message: 'ID is taken' });
    confere(peers2[0].destroyed, 'erro antes do open deveria destruir o peer (para o retry recomeçar)');
});

teste('T20 Reconexão sem peer utilizável: a tentativa falha, mas a cadeia continua', (usar) => {
    const amb = usar(criarAmbiente());
    const tempo = amb.tempoFalso();
    amb.state.isHost = false;
    amb.state.playerName = 'B';
    amb.state.baseRoomPeerId = 'sala';
    amb.state.hostVersion = 0;
    amb.state.players = [
        { name: 'Host', peerId: 'sala', isHost: true },
        { name: 'A', peerId: 'peer-a', isHost: false },
        { name: 'B', peerId: 'peer-b', isHost: false }
    ];
    // Peer que perdeu o servidor de sinalização: connect() devolve undefined.
    amb.Game.network.connectionState.setPeer({ destroyed: false, connect: () => undefined });

    // D3b: as tentativas ao mesmo host seguem até o prazo (HOST_TIMEOUT).
    let erro = null;
    try {
        amb.ctx.handleHostDisconnect();
        tempo.avancar(amb.CONFIG.JOGO.HOST_TIMEOUT);
    } catch (e) { erro = e; }
    confere(!erro, 'tentativas ao mesmo host não deveriam lançar erro, lançou: ' + (erro && erro.message));
    confere(amb.registro.spies.attemptReconnectToNewHost === 1, 'deveria seguir para a migração (procurar o novo host)');

    erro = null;
    try { amb.Game.network.attemptReconnectToNewHost(5); } catch (e) { erro = e; }
    confere(!erro, 'procurar o novo host não deveria lançar erro, lançou: ' + (erro && erro.message));
    confere(amb.registro.logs.some(l => l.includes('Não foi possível localizar um novo host')),
        'depois da última tentativa, deveria desistir de forma controlada');

    // Peer já destruído: mesmo comportamento.
    amb.Game.network.connectionState.setPeer({ destroyed: true, connect: () => { throw new Error('não deveria ser chamado'); } });
    erro = null;
    try { amb.Game.network.attemptReconnectToSameHost(1); } catch (e) { erro = e; }
    confere(!erro, 'com peer destruído, não deveria lançar erro, lançou: ' + (erro && erro.message));
});

teste('T21 Migração com rodada que o novo host não conduz: descarta, pausa e retoma com o mesmo evento', (usar) => {
    // Cenário do teste manual: o host antigo perguntava para B; A era espectador.
    const amb = usar(criarAmbiente());
    amb.state.isHost = false;
    amb.state.playerName = 'A';
    amb.state.peerId = 'peer-a';
    amb.state.baseRoomPeerId = 'sala';
    amb.state.hostVersion = 0;
    amb.state.gameStarted = true;
    amb.state.gameOver = false;
    const eventoDaRodada = { id: 'e-velho', titulo: 'Evento da rodada' };
    amb.state.currentRound = { evento: eventoDaRodada, perguntador: 'Host', respondedor: 'B', pergunta: null, respondeu: false };
    amb.state.players = [
        { name: 'Host', peerId: 'sala', isHost: true, kpi: 0, recursos: 10, phase: 'iniciacao', activities: 0 },
        { name: 'A', peerId: 'peer-a', isHost: false, kpi: 0, recursos: 10, phase: 'iniciacao', activities: 0 },
        { name: 'B', peerId: 'peer-b', isHost: false, kpi: 0, recursos: 10, phase: 'iniciacao', activities: 0 }
    ];

    amb.assumirComoHost();
    confere(amb.state.currentRound === null, 'a rodada do host antigo deveria ter sido descartada');
    confere(amb.state.partidaPausada && amb.state.partidaPausada.evento === eventoDaRodada,
        'a partida deveria pausar guardando o MESMO evento');
    confere(!amb.registro.ui.includes('showEventoModal'), 'não deveria reexibir o modal de evento');

    amb.limparRegistro();
    amb.entrar('B', 'peer-b2');
    const r = amb.state.currentRound;
    confere(!amb.state.partidaPausada && r, 'a volta de B deveria retomar a partida');
    confere(r.evento === eventoDaRodada, 'a rodada retomada deveria usar o mesmo evento');
    confere(r.perguntador !== 'Host' && r.respondedor !== 'Host', 'o host antigo não pode estar na dupla');
    confere(r.pergunta && r.pergunta.correct !== undefined, 'o novo host deveria ter o gabarito da nova pergunta');
    confere(amb.broadcastsDoTipo('round-start').length === 1, 'deveria mandar round-start (fecha a pergunta velha na tela de B)');
    confere(amb.broadcastsDoTipo('show-evento').length === 0, 'não deveria reexibir o modal de evento');
});

teste('T21b Migração quando o novo host era o Perguntador: a rodada continua', (usar) => {
    const amb = usar(criarAmbiente());
    amb.state.isHost = false;
    amb.state.playerName = 'A';
    amb.state.peerId = 'peer-a';
    amb.state.baseRoomPeerId = 'sala';
    amb.state.hostVersion = 0;
    amb.state.gameStarted = true;
    amb.state.gameOver = false;
    const pergunta = { type: 'question', question: 'Pergunta?', alternatives: ['a', 'b', 'c', 'd'], correct: 'a', id: 'q9', isPerguntador: true };
    const rodada = { evento: { id: 'e1' }, perguntador: 'A', respondedor: 'B', pergunta, respondeu: false };
    amb.state.currentRound = rodada;
    amb.state.players = [
        { name: 'Host', peerId: 'sala', isHost: true },
        { name: 'A', peerId: 'peer-a', isHost: false },
        { name: 'B', peerId: 'peer-b', isHost: false }
    ];

    amb.assumirComoHost();
    confere(amb.state.currentRound === rodada, 'a rodada deveria continuar a mesma');
    confere(!amb.state.partidaPausada, 'não deveria pausar');

    amb.entrar('B', 'peer-b2');
    const sync = amb.registro.enviados.find(e => e.para === 'peer-b2' && e.msg.type === 'state-sync');
    confere(sync && sync.msg.fullState.currentRound && sync.msg.fullState.currentRound.respondedor === 'B',
        'B deveria receber a rodada em andamento no state-sync');
    confere(sync.msg.fullState.currentRound.pergunta.correct === undefined, 'B (respondedor) não pode receber o gabarito');
    confere(amb.state.currentRound === rodada, 'a volta de B não deveria trocar a rodada');
});

// ============================================
// D2 — TOKEN DE IDENTIDADE POR SALA
// ============================================

/** Algum token cru apareceu em alguma mensagem que saiu do host? */
function vazouToken(amb, token) {
    const tudo = JSON.stringify(amb.registro.broadcasts) + JSON.stringify(amb.registro.enviados);
    return tudo.includes(token);
}

teste('T22 SHA-256 próprio: vetores oficiais e mesmo resultado do Node', (usar) => {
    const amb = usar(criarAmbiente());
    const sha = amb.Game.identity.sha256Hex;
    const vetores = {
        '': 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
        'abc': 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
        'abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq': '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1'
    };
    for (const [entrada, esperado] of Object.entries(vetores)) {
        confere(sha(entrada) === esperado, 'SHA-256("' + entrada + '") errado: ' + sha(entrada));
    }

    const nodeSha = (t) => require('crypto').createHash('sha256').update(t, 'utf8').digest('hex');
    // Todos os tamanhos de 0 a 130 (cobre as fronteiras de bloco em 55/56/64/119/120/128).
    for (let n = 0; n <= 130; n++) {
        const t = 'x'.repeat(n);
        confere(sha(t) === nodeSha(t), 'diverge do Node com ' + n + ' caracteres');
    }
    for (const t of ['Ação é João', 'ñ ç ü € 日本語', 'emoji 🎯🚀 no meio', amb.Game.identity.obterTokenDaSala('sala')]) {
        confere(sha(t) === nodeSha(t), 'diverge do Node em "' + t + '"');
    }
});

teste('T23 Token por sala: criado uma vez, reaproveitado, diferente entre salas', (usar) => {
    const amb = usar(criarAmbiente());
    const id = amb.Game.identity;
    const t1 = id.obterTokenDaSala('sala-x');
    confere(/^[0-9a-f]{32}$/.test(t1), 'token deveria ter 32 caracteres hexadecimais, veio: ' + t1);
    confere(amb.armazenamento['pmKPI_token_sala-x'] === t1, 'token deveria ficar no localStorage, na chave da sala');
    confere(id.obterTokenDaSala('sala-x') === t1, 'a mesma sala deveria devolver o mesmo token (F5, reconexão)');
    confere(id.obterTokenDaSala('sala-y') !== t1, 'outra sala deveria ter outro token');
    confere(id.meuTokenHash('sala-x') === id.hashToken(t1) && id.hashToken(t1) !== t1, 'meuTokenHash deveria ser o hash do token');

    // Um ambiente novo (outro "navegador") gera outro token para a mesma sala.
    const outro = usar(criarAmbiente());
    confere(outro.Game.identity.obterTokenDaSala('sala-x') !== t1, 'outro navegador deveria ter outro token');

    // localStorage indisponível: continua funcionando enquanto a página estiver aberta.
    const semStorage = usar(criarAmbiente());
    semStorage.localStorageFalso.getItem = () => { throw new Error('bloqueado'); };
    semStorage.localStorageFalso.setItem = () => { throw new Error('bloqueado'); };
    const t3 = semStorage.Game.identity.obterTokenDaSala('sala-z');
    confere(/^[0-9a-f]{32}$/.test(t3) && semStorage.Game.identity.obterTokenDaSala('sala-z') === t3,
        'sem localStorage, o token deveria ser estável durante a página');
});

teste('T24 Entrada guarda só o hash do token; o token cru nunca sai do host', (usar) => {
    const amb = usar(criarAmbiente());
    amb.criarSalaComoHost();
    amb.entrar('A', 'peer-a');
    amb.entrar('B', 'peer-b');
    confere(amb.jogador('A').tokenHash === amb.hash(tokenDe('A')), 'A deveria ficar com o hash do token dele');
    confere(!JSON.stringify(amb.state.players).includes(tokenDe('A')), 'o token cru não pode ficar na lista de jogadores');

    amb.iniciarPartida();
    amb.cair('peer-a');
    amb.entrar('A', 'peer-a2');
    confere(amb.registro.enviados.some(e => e.para === 'peer-a2' && e.msg.type === 'state-sync'), 'pré-condição: A recebeu state-sync');
    confere(amb.registro.broadcasts.some(m => m.type === 'player-list'), 'pré-condição: houve player-list');
    for (const nome of ['A', 'B']) {
        confere(!vazouToken(amb, tokenDe(nome)), 'o token cru de ' + nome + ' vazou em alguma mensagem do host');
    }
    const lista = amb.broadcastsDoTipo('player-list').pop();
    confere(lista.players.find(p => p.name === 'A').tokenHash === amb.hash(tokenDe('A')), 'o hash circula na lista (para sobreviver à migração)');
});

teste('T25 Reconexão com token errado ou sem token: recusada, vaga e dados preservados', (usar) => {
    const amb = usar(criarAmbiente());
    amb.criarSalaComoHost();
    amb.entrar('A', 'peer-a');
    amb.iniciarPartida();
    Object.assign(amb.jogador('A'), { kpi: 7, recursos: 4, phase: 'planejamento', activities: 1 });
    amb.cair('peer-a');
    confere(amb.state.partidaPausada, 'pré-condição: partida pausada com A desconectado');

    amb.entrar('A', 'peer-impostor', 'token-de-outro-navegador');
    confere(amb.recusaPara('peer-impostor') === 'identity-mismatch', 'esperava identity-mismatch, veio: ' + amb.recusaPara('peer-impostor'));

    amb.entrar('A', 'peer-sem-token', null);
    confere(amb.recusaPara('peer-sem-token') === 'identity-mismatch', 'sem token deveria dar identity-mismatch, veio: ' + amb.recusaPara('peer-sem-token'));

    const a = amb.jogador('A');
    confere(a.disconnected === true && a.peerId === 'peer-a', 'A deveria continuar desconectado, com o peerId antigo');
    confere(a.kpi === 7 && a.recursos === 4 && a.phase === 'planejamento' && a.activities === 1, 'dados de A não podem mudar');
    confere(a.tokenHash === amb.hash(tokenDe('A')), 'o hash registrado não pode ser trocado');
    confere(amb.state.partidaPausada, 'a partida não pode ser retomada por um impostor');
    confere(!amb.registro.enviados.some(e => (e.para === 'peer-impostor' || e.para === 'peer-sem-token') && e.msg.type === 'state-sync'),
        'impostor não pode receber o estado da partida');

    // O A de verdade continua conseguindo voltar.
    amb.entrar('A', 'peer-a2');
    confere(amb.recusaPara('peer-a2') === null, 'A com o token certo deveria voltar, veio: ' + amb.recusaPara('peer-a2'));
    confere(!amb.jogador('A').disconnected && amb.jogador('A').peerId === 'peer-a2', 'A deveria estar conectado de novo');
    confere(!amb.state.partidaPausada && amb.state.currentRound, 'a volta de A deveria retomar a partida');
});

teste('T26 Migração: o novo host confere o token com os hashes que vieram na lista', (usar) => {
    const amb = usar(criarAmbiente());
    amb.state.isHost = false;
    amb.state.playerName = 'B';
    amb.state.peerId = 'peer-b';
    amb.state.baseRoomPeerId = 'sala';
    amb.state.hostVersion = 0;
    amb.state.gameStarted = true;
    amb.state.gameOver = false;
    amb.state.currentRound = null;
    // Lista como chega ao guest B pelo player-list do host antigo.
    amb.state.players = [
        { name: 'Host', peerId: 'sala', isHost: true, kpi: 0, recursos: 10, phase: 'iniciacao', activities: 0, tokenHash: amb.hash(tokenDe('Host')) },
        { name: 'A', peerId: 'peer-a', isHost: false, kpi: 5, recursos: 3, phase: 'planejamento', activities: 1, tokenHash: amb.hash(tokenDe('A')) },
        { name: 'B', peerId: 'peer-b', isHost: false, kpi: 0, recursos: 10, phase: 'iniciacao', activities: 0, tokenHash: amb.hash(tokenDe('B')) }
    ];

    amb.assumirComoHost();
    confere(amb.jogador('B').isHost && amb.jogador('B').tokenHash === amb.hash(tokenDe('B')), 'o novo host deveria manter o próprio hash');
    confere(amb.jogador('A').disconnected && amb.jogador('A').tokenHash === amb.hash(tokenDe('A')), 'A desconectado, com o hash preservado');

    amb.entrar('A', 'peer-impostor', 'token-de-outro-navegador');
    confere(amb.recusaPara('peer-impostor') === 'identity-mismatch', 'impostor deveria ser recusado pelo novo host, veio: ' + amb.recusaPara('peer-impostor'));
    confere(amb.jogador('A').disconnected && amb.state.partidaPausada, 'A continua reservado e a partida pausada');

    amb.entrar('A', 'peer-a2');
    confere(amb.recusaPara('peer-a2') === null, 'A de verdade deveria reconectar ao novo host, veio: ' + amb.recusaPara('peer-a2'));
    confere(amb.jogador('A').kpi === 5 && !amb.state.partidaPausada, 'A volta com o KPI dele e a partida retoma');
});

teste('T27 Transição: entrada salva antes do token é aceita pelo nome e passa a exigir o token', (usar) => {
    const amb = usar(criarAmbiente());
    amb.criarSalaComoHost();
    amb.entrar('A', 'peer-a');
    amb.entrar('B', 'peer-b');
    amb.iniciarPartida();
    delete amb.jogador('A').tokenHash; // como num estado salvo por uma versão anterior
    amb.cair('peer-a');

    amb.entrar('A', 'peer-a2');
    confere(amb.recusaPara('peer-a2') === null, 'sem hash registrado, deveria aceitar pelo nome (como antes), veio: ' + amb.recusaPara('peer-a2'));
    confere(amb.jogador('A').tokenHash === amb.hash(tokenDe('A')), 'deveria adotar o hash deste token');

    amb.cair('peer-a2');
    amb.entrar('A', 'peer-impostor', 'token-de-outro-navegador');
    confere(amb.recusaPara('peer-impostor') === 'identity-mismatch', 'depois de adotar, deveria exigir o token, veio: ' + amb.recusaPara('peer-impostor'));
});

teste('T28 Guest envia o token no player-join (1ª conexão e as duas reconexões)', (usar) => {
    const amb = usar(criarAmbiente());
    amb.state.isHost = false;
    amb.state.playerName = 'A';
    amb.state.peerId = 'peer-a';
    amb.state.baseRoomPeerId = 'sala';
    amb.state.hostPeerId = 'sala';
    amb.state.hostVersion = 0;
    const meuToken = amb.Game.identity.obterTokenDaSala('sala');
    const confereJoin = (onde) => {
        const join = amb.registro.paraHost.filter(m => m.type === 'player-join').pop();
        confere(join, onde + ': deveria enviar player-join');
        confere(join.playerName === 'A' && join.token === meuToken, onde + ': player-join deveria levar o token da sala, veio: ' + join.token);
        amb.limparRegistro();
    };

    // 1) Primeira conexão (handleConnection, lado guest).
    amb.conectar('sala');
    confereJoin('primeira conexão');

    // Conexão falsa que abre quando o teste mandar (para as reconexões).
    const novaConexao = (destino) => {
        const h = {};
        return { peer: destino, open: true, on: (ev, cb) => { h[ev] = cb; }, send: () => {}, close: () => {}, disparar: (ev) => h[ev] && h[ev]() };
    };

    // 2) Reconexão ao mesmo host.
    let conn = novaConexao('sala');
    amb.instalarPeerFalso({ connectDevolve: conn });
    amb.Game.network.connectionState.setPeer(new amb.ctx.Peer('peer-a'));
    amb.Game.network.attemptReconnectToSameHost(1);
    conn.disparar('open');
    confereJoin('reconexão ao mesmo host');

    // 3) Reconexão ao novo host (depois de uma migração).
    conn = novaConexao('sala-h1');
    amb.instalarPeerFalso({ connectDevolve: conn });
    amb.Game.network.connectionState.setPeer(new amb.ctx.Peer('peer-a'));
    amb.Game.network.attemptReconnectToNewHost(1);
    conn.disparar('open');
    confereJoin('reconexão ao novo host');
    confere(amb.state.hostPeerId === 'sala-h1', 'pré-condição: guest deveria ter ido para a sala nova');
    confere(amb.Game.identity.obterTokenDaSala(amb.state.baseRoomPeerId) === meuToken, 'o token não muda com a migração (chave pelo ID base)');
});

teste('T29 Host se insere na lista (setupUI) com o hash do próprio token', (usar) => {
    const amb = usar(criarAmbiente());
    const elemento = () => ({ style: {}, textContent: '', disabled: false, addEventListener: () => {} });
    amb.ctx.document = { getElementById: elemento, querySelectorAll: () => [] };
    amb.state.isHost = true;
    amb.state.playerName = 'Ana';
    amb.state.peerId = 'sala';
    amb.state.baseRoomPeerId = 'sala';
    amb.state.players = [];

    amb.ctx.setupUI();
    const host = amb.jogador('Ana');
    const meuToken = amb.Game.identity.obterTokenDaSala('sala');
    confere(host && host.isHost, 'o host deveria estar na lista');
    confere(host.tokenHash === amb.hash(meuToken), 'a entrada do host deveria ter o hash do token dele');
    confere(!JSON.stringify(amb.state.players).includes(meuToken), 'o token cru do host não pode ficar na lista');

    // Chamada de novo (ex: becomeHost) não duplica nem troca a entrada.
    amb.ctx.setupUI();
    confere(amb.state.players.length === 1 && amb.jogador('Ana') === host, 'setupUI de novo não deveria duplicar o host');

    // O nome do host continua sempre em uso, com ou sem o token certo.
    amb.entrar('Ana', 'peer-intruso', meuToken);
    confere(amb.recusaPara('peer-intruso') === 'name-taken', 'nome do host deveria continuar name-taken, veio: ' + amb.recusaPara('peer-intruso'));
});

// ============================================
// D2b — O QUE O GUEST VÊ AO RECONECTAR
// ============================================

/** Último state-sync que o host mandou para um peer. */
function syncPara(amb, peerId) {
    const e = amb.registro.enviados.filter(x => x.para === peerId && x.msg.type === 'state-sync').pop();
    return e ? e.msg.fullState : null;
}

/** Telas de pergunta/rodada que o guest montou. */
function telasDaRodada(amb) {
    return amb.registro.ui.filter(n => ['displayQuestion', 'displayRoundStart', 'displaySpectatorView',
        'showRoundEndedMessage', 'showPartidaPausadaMessage'].includes(n));
}

teste('T30 Guest que reconecta volta com o relógio contando segundo a segundo', (usar) => {
    const amb = usar(criarAmbiente());
    const relogio = amb.relogioFalso();
    const rodada = { evento: { id: 'e1' }, perguntador: 'Host', respondedor: 'B', pergunta: null, respondeu: false };
    amb.receberSync('A', { players: [], baralhos: {}, timer: 500, currentRound: rodada, gameStarted: true, hostVersion: 0 });
    confere(relogio.ativos() === 1, 'o relógio local deveria estar ligado depois da reconexão, ligados: ' + relogio.ativos());

    relogio.tic();
    confere(amb.state.timer === 499, 'deveria contar 1 segundo, veio: ' + amb.state.timer);
    relogio.tic(9);
    confere(amb.state.timer === 490 && amb.broadcastsDoTipo('timer-update').length === 0, 'guest conta, mas não avisa ninguém');

    // O host corrige; a contagem continua a partir do valor corrigido.
    amb.Game.network.handleMessage({ type: 'timer-update', remaining: 480 }, 'sala');
    relogio.tic();
    confere(amb.state.timer === 479, 'depois do timer-update deveria seguir de 480, veio: ' + amb.state.timer);

    // Um segundo state-sync (nova reconexão) não pode ligar uma segunda contagem.
    amb.receberSync('A', { players: [], baralhos: {}, timer: 300, currentRound: rodada, gameStarted: true, hostVersion: 0 });
    relogio.tic();
    confere(relogio.ativos() === 1 && amb.state.timer === 299, 'só pode haver uma contagem ligada, timer: ' + amb.state.timer);

    // No zero, o guest só para — quem encerra a partida é o host.
    amb.state.timer = 1;
    relogio.tic();
    confere(relogio.ativos() === 0 && !amb.state.gameOver, 'guest para no zero sem encerrar a partida sozinho');

    // No lobby, não liga relógio.
    const lobby = usar(criarAmbiente());
    const relogio2 = lobby.relogioFalso();
    lobby.receberSync('A', { players: [], baralhos: {}, timer: 3600, currentRound: null, gameStarted: false, hostVersion: 0 });
    confere(relogio2.ativos() === 0, 'no lobby não deveria ligar o relógio');
});

teste('T31 Relógio do host continua igual (startGame usa a mesma contagem)', (usar) => {
    const amb = usar(criarAmbiente());
    const relogio = amb.relogioFalso();
    amb.criarSalaComoHost();
    amb.entrar('A', 'peer-a');
    amb.state.timer = 11;
    amb.Game.core.startGame();
    confere(relogio.ativos() === 1, 'startGame deveria ligar uma contagem');

    relogio.tic();
    const aviso = amb.broadcastsDoTipo('timer-update').pop();
    confere(amb.state.timer === 10 && aviso && aviso.remaining === 10, 'host deveria avisar os guests a cada 10 segundos');

    amb.state.timer = 1;
    relogio.tic();
    confere(amb.state.gameOver && amb.broadcastsDoTipo('game-over').length === 1 && relogio.ativos() === 0,
        'no zero, o host encerra a partida');
});

teste('T32 Reconexão depois do fim do ciclo: "rodada encerrada", sem reabrir a pergunta', (usar) => {
    // Cenário do teste manual: os dois responderam, o host ainda não
    // clicou em Nova Rodada, e o guest (último Perguntador) caiu e voltou.
    const host = usar(criarAmbiente());
    host.criarSalaComoHost();
    host.entrar('A', 'peer-a');
    host.iniciarPartida();
    host.state.usedRespondedorThisRound = ['Host', 'A'];
    host.state.currentRound = {
        evento: { id: 'e1' }, perguntador: 'A', respondedor: 'Host',
        pergunta: { type: 'question', question: 'Pergunta?', alternatives: ['A', 'B', 'C', 'D'], correct: 'A' }, respondeu: true
    };
    host.Game.core.nextTurn();
    confere(host.state.rodadaEncerrada === true && host.broadcastsDoTipo('round-ended').length === 1, 'pré-condição: ciclo encerrado');

    host.cair('peer-a');
    host.limparRegistro();
    host.entrar('A', 'peer-a2');
    const sync = syncPara(host, 'peer-a2');
    confere(sync && sync.rodadaEncerrada === true && sync.partidaPausada === false, 'state-sync deveria dizer que o ciclo encerrou');
    confere(host.broadcastsDoTipo('round-start').length === 0, 'a volta de A não deveria começar rodada nova sozinha');

    const guest = usar(criarAmbiente());
    guest.receberSync('A', sync);
    const telas = telasDaRodada(guest);
    confere(telas.includes('showRoundEndedMessage'), 'A deveria ver "rodada encerrada", viu: ' + telas.join(', '));
    confere(!telas.includes('displayQuestion') && !telas.includes('displayRoundStart'), 'A não pode ver a pergunta antiga de novo, viu: ' + telas.join(', '));

    // Host clica em Nova Rodada: o aviso some dos dois lados.
    host.Game.core.startNewRound();
    confere(host.state.rodadaEncerrada === false, 'Nova Rodada deveria zerar o aviso no host');
    guest.Game.network.handleMessage(host.broadcastsDoTipo('round-start').pop(), 'sala');
    confere(guest.state.rodadaEncerrada === false, 'round-start deveria zerar o aviso no guest');
    guest.Game.network.handleMessage({ type: 'round-ended' }, 'sala');
    confere(guest.state.rodadaEncerrada === true, 'round-ended deveria marcar o aviso no guest');

    // Encerrar a partida também zera.
    host.state.rodadaEncerrada = true;
    host.Game.core.endMatch();
    confere(host.state.rodadaEncerrada === false, 'encerrar a partida deveria zerar o aviso');
});

teste('T33 Reconexão com a partida ainda pausada: aviso de pausa, sem pergunta', (usar) => {
    const host = usar(criarAmbiente());
    host.CONFIG.JOGO.MIN_PLAYERS = 3;
    host.criarSalaComoHost();
    host.entrar('A', 'peer-a');
    host.entrar('B', 'peer-b');
    host.iniciarPartida();
    host.cair('peer-a');
    host.cair('peer-b');
    if (!host.state.partidaPausada) host.Game.core.pickNewPair(); // quedas de espectador não sorteiam dupla
    confere(host.state.partidaPausada, 'pré-condição: partida pausada');

    host.limparRegistro();
    host.entrar('B', 'peer-b2'); // ainda faltam jogadores conectados
    confere(host.state.partidaPausada, 'pré-condição: continua pausada');
    const sync = syncPara(host, 'peer-b2');
    confere(sync && sync.partidaPausada === true, 'state-sync deveria dizer que a partida está pausada');

    const guest = usar(criarAmbiente());
    guest.receberSync('B', sync);
    const telas = telasDaRodada(guest);
    confere(telas.includes('showPartidaPausadaMessage'), 'B deveria ver o aviso de pausa, viu: ' + telas.join(', '));
    confere(!telas.includes('displayQuestion') && guest.state.currentRound === null, 'B não pode ver pergunta durante a pausa');
});

teste('T34 Reconexão entre duas duplas: não reabre a pergunta; rodada em andamento continua igual', (usar) => {
    const pergunta = { type: 'question', question: 'Pergunta?', alternatives: ['A', 'B', 'C', 'D'] };

    // Pergunta já respondida, próxima dupla ainda não sorteada (~3s).
    const g1 = usar(criarAmbiente());
    g1.receberSync('B', { players: [], baralhos: {}, timer: 500, gameStarted: true, hostVersion: 0,
        currentRound: { evento: { id: 'e1' }, perguntador: 'A', respondedor: 'B', pergunta, respondeu: true },
        rodadaEncerrada: false, partidaPausada: false });
    const t1 = telasDaRodada(g1);
    confere(t1.includes('displaySpectatorView') && !t1.includes('displayQuestion'), 'pergunta respondida não pode reabrir, viu: ' + t1.join(', '));

    // Controle: rodada em andamento, B é o Respondedor → vê a pergunta.
    const g2 = usar(criarAmbiente());
    g2.receberSync('B', { players: [], baralhos: {}, timer: 500, gameStarted: true, hostVersion: 0,
        currentRound: { evento: { id: 'e1' }, perguntador: 'A', respondedor: 'B', pergunta, respondeu: false },
        rodadaEncerrada: false, partidaPausada: false });
    const t2 = telasDaRodada(g2);
    confere(t2.includes('displayRoundStart') && t2.includes('displayQuestion'), 'rodada em andamento deveria mostrar a pergunta, viu: ' + t2.join(', '));

    // Host antigo (sem os campos novos no state-sync): comportamento de antes.
    const g3 = usar(criarAmbiente());
    g3.receberSync('B', { players: [], baralhos: {}, timer: 500, gameStarted: true, hostVersion: 0,
        currentRound: { evento: { id: 'e1' }, perguntador: 'A', respondedor: 'B', pergunta, respondeu: false } });
    confere(telasDaRodada(g3).includes('displayQuestion'), 'sem os campos novos, deveria seguir como antes');
});

teste('T35 Guest que viu "rodada encerrada" assume como host: o aviso some quando a dupla nova começa', (usar) => {
    const amb = usar(criarAmbiente());
    amb.state.isHost = false;
    amb.state.playerName = 'B';
    amb.state.peerId = 'peer-b';
    amb.state.baseRoomPeerId = 'sala';
    amb.state.hostVersion = 0;
    amb.state.gameStarted = true;
    amb.state.gameOver = false;
    amb.state.currentRound = { evento: { id: 'e1' }, perguntador: 'Host', respondedor: 'B', pergunta: null, respondeu: true };
    amb.state.players = [
        { name: 'Host', peerId: 'sala', isHost: true, kpi: 0, recursos: 10, phase: 'iniciacao', activities: 0 },
        { name: 'A', peerId: 'peer-a', isHost: false, kpi: 0, recursos: 10, phase: 'iniciacao', activities: 0, tokenHash: amb.hash(tokenDe('A')) },
        { name: 'B', peerId: 'peer-b', isHost: false, kpi: 0, recursos: 10, phase: 'iniciacao', activities: 0 },
        { name: 'C', peerId: 'peer-c', isHost: false, kpi: 0, recursos: 10, phase: 'iniciacao', activities: 0, tokenHash: amb.hash(tokenDe('C')) }
    ];
    amb.Game.network.handleMessage({ type: 'round-ended' }, 'sala');
    confere(amb.state.rodadaEncerrada === true, 'pré-condição: B viu o fim do ciclo');

    amb.assumirComoHost();
    confere(amb.state.partidaPausada, 'pré-condição: novo host pausa até os outros voltarem');

    amb.entrar('A', 'peer-a2');
    confere(amb.state.currentRound && !amb.state.partidaPausada, 'pré-condição: a volta de A forma uma dupla nova');
    confere(amb.state.rodadaEncerrada === false, 'com a dupla nova, o aviso de "rodada encerrada" deveria sumir');

    amb.entrar('C', 'peer-c2');
    const sync = syncPara(amb, 'peer-c2');
    confere(sync && sync.rodadaEncerrada === false, 'C não pode receber "rodada encerrada" com uma dupla em andamento');
});

// ============================================
// D3a — OPÇÕES DO PEERJS CENTRALIZADAS
// ============================================

teste('T36 Todo Peer do jogo usa CONFIG.PEER (cópia), inclusive quem assume como host', (usar) => {
    const amb = usar(criarAmbiente());
    amb.CONFIG.PEER = { debug: 3, host: 'sinalizacao.exemplo', secure: true };
    const confereOpcoes = (peer, onde) => {
        confere(peer.opcoesPeer && peer.opcoesPeer.host === 'sinalizacao.exemplo' && peer.opcoesPeer.debug === 3,
            onde + ': deveria receber as opções de CONFIG.PEER, veio: ' + JSON.stringify(peer.opcoesPeer));
        confere(peer.opcoesPeer !== amb.CONFIG.PEER, onde + ': deveria receber uma cópia, não o próprio CONFIG.PEER');
    };

    // Peer do guest e do host (initPeer).
    let peers = amb.instalarPeerFalso();
    amb.state.isHost = false;
    amb.Game.network.initPeer().catch(() => {});
    confereOpcoes(peers[0], 'guest');
    amb.state.isHost = true;
    amb.state.hostPeerId = 'sala';
    amb.Game.network.initPeer().catch(() => {});
    confere(peers[1].id === 'sala', 'pré-condição: host abre com o ID da sala');
    confereOpcoes(peers[1], 'host');

    // Peer de quem assume como host (becomeHost).
    const mig = usar(criarAmbiente());
    mig.CONFIG.PEER = { debug: 3, host: 'sinalizacao.exemplo' };
    mig.state.isHost = false;
    mig.state.playerName = 'B';
    mig.state.baseRoomPeerId = 'sala';
    mig.state.hostVersion = 0;
    mig.state.players = [{ name: 'B', peerId: 'peer-b', isHost: false }];
    peers = mig.instalarPeerFalso();
    mig.Game.network.becomeHost();
    confere(peers[0].id === 'sala-h1', 'pré-condição: novo host abre na versão seguinte da sala');
    confere(peers[0].opcoesPeer && peers[0].opcoesPeer.host === 'sinalizacao.exemplo', 'becomeHost deveria usar CONFIG.PEER');
});

teste('T37 Configuração única: nenhum "new Peer" com opções soltas; CONFIG.PEER existe no config real', (usar) => {
    // Varre todo o código do jogo (inclusive a tela inicial, que não roda aqui).
    const naoUsaConfig = [];
    const varrer = (pasta) => {
        for (const item of fs.readdirSync(path.join(RAIZ, pasta), { withFileTypes: true })) {
            const rel = path.join(pasta, item.name);
            if (item.isDirectory()) { varrer(rel); continue; }
            if (!item.name.endsWith('.js')) continue;
            fs.readFileSync(path.join(RAIZ, rel), 'utf8').split('\n').forEach((linha, i) => {
                if (/new Peer\(/.test(linha) && !linha.trim().startsWith('//') && !linha.includes('CONFIG.PEER')) {
                    naoUsaConfig.push(rel + ':' + (i + 1));
                }
            });
        }
    };
    varrer('js');
    confere(naoUsaConfig.length === 0, 'new Peer sem CONFIG.PEER em: ' + naoUsaConfig.join(', '));

    // O config de verdade (o carregado pelos HTML) precisa ter PEER.
    const ctxConfig = vm.createContext({});
    vm.runInContext('var window = this;' + fs.readFileSync(path.join(RAIZ, 'config/game-config.js'), 'utf8'), ctxConfig);
    const peerReal = vm.runInContext('CONFIG.PEER', ctxConfig);
    confere(peerReal && typeof peerReal === 'object', 'config/game-config.js deveria definir CONFIG.PEER');

    // Só existe um arquivo de configuração (a cópia antiga em js/config/ foi removida).
    confere(!fs.existsSync(path.join(RAIZ, 'js/config/game-config.js')), 'js/config/game-config.js (cópia antiga, não carregada) não deveria existir');
});

// ============================================
// D3b — PRAZO DE ESPERA PELO HOST / HOST ANTIGO VOLTA COMO JOGADOR COMUM
// ============================================

/** Guest B com a lista [Host, B, A]: B é o backup. */
function guestBackup(amb) {
    amb.state.isHost = false;
    amb.state.playerName = 'B';
    amb.state.peerId = 'peer-b';
    amb.state.baseRoomPeerId = 'sala';
    amb.state.hostPeerId = 'sala';
    amb.state.hostVersion = 0;
    amb.state.players = [
        { name: 'Host', peerId: 'sala', isHost: true },
        { name: 'B', peerId: 'peer-b', isHost: false },
        { name: 'A', peerId: 'peer-a', isHost: false }
    ];
}

teste('T38 Host volta dentro do prazo (F5): guest reconecta ao mesmo host, sem migração', (usar) => {
    const amb = usar(criarAmbiente());
    const tempo = amb.tempoFalso();
    guestBackup(amb);
    const conexoes = amb.peerDeGuest();

    amb.ctx.handleHostDisconnect();
    tempo.avancar(4000);
    confere(conexoes.length >= 2 && conexoes.every(c => c.peer === 'sala'),
        'deveria tentar o MESMO host mais de uma vez dentro do prazo, tentou: ' + conexoes.map(c => c.peer).join(','));
    confere(amb.registro.spies.becomeHost === 0, 'não deveria assumir antes do prazo');

    // O host terminou de recarregar: a tentativa em andamento abre.
    conexoes[conexoes.length - 1].abrir();
    const join = amb.registro.paraHost.find(m => m.type === 'player-join');
    confere(join && join.token === amb.Game.identity.obterTokenDaSala('sala'),
        'deveria reenviar o player-join com o token ao host que voltou');

    const tentativas = conexoes.length;
    tempo.avancar(30000);
    confere(amb.registro.spies.becomeHost === 0 && amb.registro.spies.attemptReconnectToNewHost === 0,
        'depois de reconectar, não pode haver migração');
    confere(conexoes.length === tentativas, 'depois de reconectar, não deveria haver novas tentativas');

    // Uma queda posterior do mesmo host é tratada de novo (a espera anterior acabou).
    amb.ctx.handleHostDisconnect();
    confere(conexoes.length === tentativas + 1, 'uma queda nova depois da reconexão deveria abrir uma espera nova');
});

teste('T39 Host não volta: o backup assume ao fim de HOST_TIMEOUT (10s), não antes', (usar) => {
    const amb = usar(criarAmbiente());
    const tempo = amb.tempoFalso();
    guestBackup(amb);
    const conexoes = amb.peerDeGuest();
    const prazo = amb.CONFIG.JOGO.HOST_TIMEOUT;

    amb.ctx.handleHostDisconnect();
    tempo.avancar(prazo - 2500);
    confere(amb.registro.spies.becomeHost === 0, 'não deveria assumir antes do prazo');
    confere(conexoes.length >= 3, 'deveria repetir tentativas curtas ao mesmo host, foram: ' + conexoes.length);
    tempo.avancar(2500);
    confere(amb.registro.spies.becomeHost === 1, 'o backup deveria assumir até o fim do prazo');
    confere(conexoes.every(c => c.peer === 'sala'), 'antes de assumir, só deveria procurar o host atual');
    confere(conexoes.every(c => c.fechada || c.open), 'tentativas que não abriram deveriam ser fechadas');

    // O prazo vem da configuração.
    const amb2 = usar(criarAmbiente());
    const tempo2 = amb2.tempoFalso();
    guestBackup(amb2);
    amb2.peerDeGuest();
    amb2.CONFIG.JOGO.HOST_TIMEOUT = 20000;
    amb2.ctx.handleHostDisconnect();
    tempo2.avancar(12000);
    confere(amb2.registro.spies.becomeHost === 0, 'com HOST_TIMEOUT de 20s, não deveria assumir aos 12s');
    tempo2.avancar(8000);
    confere(amb2.registro.spies.becomeHost === 1, 'com HOST_TIMEOUT de 20s, deveria assumir aos 20s');

    // Valor do jogo de verdade.
    const ctxConfig = vm.createContext({});
    vm.runInContext('var window = this;' + fs.readFileSync(path.join(RAIZ, 'config/game-config.js'), 'utf8'), ctxConfig);
    confere(vm.runInContext('CONFIG.JOGO.HOST_TIMEOUT', ctxConfig) === 10000, 'config/game-config.js deveria ter HOST_TIMEOUT de 10000 ms');
});

teste('T40 Segunda queda durante a espera não abre outra cadeia de tentativas', (usar) => {
    const amb = usar(criarAmbiente());
    const tempo = amb.tempoFalso();
    guestBackup(amb);
    const conexoes = amb.peerDeGuest();

    amb.ctx.handleHostDisconnect();
    amb.ctx.handleHostDisconnect();
    confere(conexoes.length === 1, 'a segunda queda não deveria disparar outra tentativa, houve ' + conexoes.length);
    tempo.avancar(amb.CONFIG.JOGO.HOST_TIMEOUT);
    confere(amb.registro.spies.becomeHost === 1, 'deveria decidir uma única vez, decidiu ' + amb.registro.spies.becomeHost);

    // Terminada a espera, uma queda nova (ex: do novo host) abre outra.
    const antes = conexoes.length;
    amb.ctx.handleHostDisconnect();
    confere(conexoes.length === antes + 1, 'depois do prazo, uma queda nova deveria abrir uma espera nova');
});

teste('T41 Host antigo volta depois da migração: entra como jogador comum com o token dele', (usar) => {
    const amb = usar(criarAmbiente());
    amb.state.isHost = false;
    amb.state.playerName = 'B';
    amb.state.peerId = 'peer-b';
    amb.state.baseRoomPeerId = 'sala';
    amb.state.hostVersion = 0;
    amb.state.gameStarted = true;
    amb.state.gameOver = false;
    amb.state.currentRound = null;
    amb.state.players = [
        { name: 'Host', peerId: 'sala', isHost: true, kpi: 7, recursos: 4, phase: 'planejamento', activities: 1, tokenHash: amb.hash(tokenDe('Host')) },
        { name: 'A', peerId: 'peer-a', isHost: false, kpi: 0, recursos: 10, phase: 'iniciacao', activities: 0, tokenHash: amb.hash(tokenDe('A')) },
        { name: 'B', peerId: 'peer-b', isHost: false, kpi: 0, recursos: 10, phase: 'iniciacao', activities: 0, tokenHash: amb.hash(tokenDe('B')) }
    ];

    amb.assumirComoHost();
    const antigo = amb.jogador('Host');
    confere(antigo && !antigo.isHost && antigo.disconnected, 'host antigo: jogador comum desconectado');
    confere(antigo.kpi === 7 && antigo.recursos === 4 && antigo.tokenHash === amb.hash(tokenDe('Host')), 'KPI, recursos e hash do host antigo preservados');
    confere(amb.state.partidaPausada, 'pré-condição: partida pausada, só o novo host conectado');

    amb.entrar('Host', 'peer-impostor', 'token-de-outro-navegador');
    confere(amb.recusaPara('peer-impostor') === 'identity-mismatch', 'impostor com o nome do host antigo deveria ser recusado, veio: ' + amb.recusaPara('peer-impostor'));

    amb.limparRegistro();
    amb.entrar('Host', 'peer-host-voltou');
    confere(amb.recusaPara('peer-host-voltou') === null, 'o host antigo deveria conseguir voltar, veio: ' + amb.recusaPara('peer-host-voltou'));
    confere(!antigo.disconnected && antigo.peerId === 'peer-host-voltou' && antigo.isHost === false, 'volta conectado, como jogador comum');
    confere(antigo.kpi === 7, 'volta com o KPI dele');
    confere(amb.state.isHost && amb.jogador('B').isHost && amb.state.players.filter(p => p.isHost).length === 1, 'B continua sendo o único host');
    confere(!amb.state.partidaPausada && amb.state.currentRound, 'com a volta dele, a partida retoma');
    const lista = amb.broadcastsDoTipo('player-list').pop();
    confere(lista && lista.players.find(p => p.name === 'Host').isHost === false, 'a lista enviada aos outros mostra o host antigo como jogador comum');
});

teste('T42 Quem assume como host marca host=true na URL (F5 volta como host na sala nova)', (usar) => {
    const amb = usar(criarAmbiente());
    const url = amb.urlFalsa('https://exemplo.github.io/jogo/game.html?host=false&room=sala&playerName=B&peerId=sala');
    amb.state.isHost = false;
    amb.state.playerName = 'B';
    amb.state.peerId = 'peer-b';
    amb.state.baseRoomPeerId = 'sala';
    amb.state.hostVersion = 0;
    amb.state.gameStarted = true;
    amb.state.gameOver = false;
    amb.state.players = [
        { name: 'Host', peerId: 'sala', isHost: true },
        { name: 'B', peerId: 'peer-b', isHost: false }
    ];

    amb.assumirComoHost();
    confere(url.param('host') === 'true', 'a URL deveria passar a dizer host=true, diz: ' + url.param('host'));
    confere(url.param('peerId') === 'sala' && url.param('room') === 'sala' && url.param('playerName') === 'B',
        'os outros parâmetros (peerId = ID base da sala) não mudam: ' + amb.ctx.location.href);
    confere(url.trocas.length === 1, 'deveria trocar a URL sem recarregar (replaceState), uma vez');

    amb.Game.network.registrarPapelNaUrl(false);
    confere(url.param('host') === 'false', 'registrarPapelNaUrl(false) deveria voltar para host=false');

    // Sem history/URL disponíveis: não quebra.
    const amb2 = usar(criarAmbiente());
    let erro = null;
    try { amb2.Game.network.registrarPapelNaUrl(true); } catch (e) { erro = e; }
    confere(!erro, 'sem URL/history, não deveria lançar erro');
});

teste('T43 Host antigo recarregando: se outro assumiu, volta como jogador comum; senão, segue host', (usar) => {
    const prepararHostAntigo = (amb) => {
        const url = amb.urlFalsa('https://exemplo.github.io/jogo/game.html?host=true&room=sala&playerName=Host&peerId=sala');
        amb.state.isHost = true;
        amb.state.playerName = 'Host';
        amb.state.baseRoomPeerId = 'sala';
        amb.state.hostPeerId = 'sala';
        amb.state.hostVersion = 0;
        amb.state.gameStarted = true;
        amb.state.players = [
            { name: 'Host', peerId: 'sala', isHost: true, kpi: 7 },
            { name: 'A', peerId: 'peer-a', isHost: false },
            { name: 'B', peerId: 'peer-b', isHost: false }
        ];
        return url;
    };
    /** Uma conexão falsa por destino; abrir(destino) simula a sala respondendo. */
    const conexoesPorDestino = () => {
        const mapa = {};
        return {
            mapa,
            aoConectar: (destino) => {
                const h = {};
                const c = { peer: destino, open: false, fechada: false, on: (ev, cb) => { h[ev] = cb; }, send: () => {}, close() { c.fechada = true; }, disparar: (ev) => h[ev] && h[ev]() };
                mapa[destino] = c;
                return c;
            },
            abrir: (destino) => { mapa[destino].open = true; mapa[destino].disparar('open'); }
        };
    };
    const indisponivelParaTodos = (peer, exceto = []) => {
        peer.conexoesPedidas.filter(d => !exceto.includes(d)).forEach(d =>
            peer.disparar('error', { type: 'peer-unavailable', message: 'Could not connect to peer ' + d }));
    };

    // 1) A sala seguinte responde: a migração aconteceu.
    const amb = usar(criarAmbiente());
    const url = prepararHostAntigo(amb);
    const conns = conexoesPorDestino();
    const peers = amb.instalarPeerFalso({ aoConectar: conns.aoConectar });
    amb.Game.network.retomarComoJogadorSeOutroAssumiu();
    const sonda = peers[0];
    confere(sonda && sonda.id === undefined, 'deveria sondar com um peer temporário (ID aleatório), não com o ID da sala');
    confere(sonda.opcoesPeer && sonda.opcoesPeer !== amb.CONFIG.PEER && sonda.opcoesPeer.debug === amb.CONFIG.PEER.debug, 'a sonda usa uma cópia de CONFIG.PEER');
    confere(amb.Game.network.connectionState.getPeer() !== sonda, 'a sonda não pode virar o peer do jogo');
    sonda.disparar('open', 'peer-sonda');
    confere(sonda.conexoesPedidas.includes('sala-h1'), 'deveria procurar a versão seguinte do host (sala-h1), procurou: ' + sonda.conexoesPedidas.join(','));
    confere(!sonda.conexoesPedidas.includes('sala'), 'não deveria procurar a própria versão (sala)');
    confere(amb.state.isHost, 'antes da resposta, nada muda');
    conns.abrir('sala-h1');
    confere(!amb.state.isHost, 'deveria deixar de ser host');
    confere(amb.state.hostVersion === 1 && amb.state.hostPeerId === 'sala-h1', 'deveria apontar para a sala nova: ' + amb.state.hostPeerId);
    confere(amb.jogador('Host').isHost === false && amb.jogador('Host').kpi === 7, 'a própria entrada deixa de ser host, dados preservados');
    confere(url.param('host') === 'false' && url.param('peerId') === 'sala', 'a URL deveria passar a host=false (peerId base igual): ' + amb.ctx.location.href);
    confere(sonda.destroyed && conns.mapa['sala-h1'].fechada, 'a sonda deveria ser encerrada');

    // 1b) D3c: duas migrações enquanto ele estava fora — a sala está em sala-h2.
    const ambB = usar(criarAmbiente());
    prepararHostAntigo(ambB);
    const connsB = conexoesPorDestino();
    const peersB = ambB.instalarPeerFalso({ aoConectar: connsB.aoConectar });
    ambB.Game.network.retomarComoJogadorSeOutroAssumiu();
    peersB[0].disparar('open', 'peer-sonda');
    indisponivelParaTodos(peersB[0], ['sala-h2']);
    confere(ambB.state.isHost, 'enquanto sala-h2 não responde, nada muda');
    connsB.abrir('sala-h2');
    confere(!ambB.state.isHost && ambB.state.hostVersion === 2 && ambB.state.hostPeerId === 'sala-h2',
        'deveria achar a sala em sala-h2, apontou para: ' + ambB.state.hostPeerId);

    // 2) Ninguém em nenhuma versão seguinte (peer-unavailable em todas): segue como host.
    const amb2 = usar(criarAmbiente());
    const url2 = prepararHostAntigo(amb2);
    const peers2 = amb2.instalarPeerFalso({ aoConectar: conexoesPorDestino().aoConectar });
    amb2.Game.network.retomarComoJogadorSeOutroAssumiu();
    peers2[0].disparar('open', 'peer-sonda');
    indisponivelParaTodos(peers2[0]);
    confere(amb2.state.isHost && amb2.state.hostVersion === 0 && amb2.state.hostPeerId === 'sala', 'sem migração, continua host da sala de sempre');
    confere(url2.trocas.length === 0, 'sem migração, a URL não muda');
    confere(peers2[0].destroyed, 'a sonda deveria ser encerrada');

    // 3) Sem resposta no tempo limite: segue como host; resposta tardia é ignorada.
    const amb3 = usar(criarAmbiente());
    const tempo3 = amb3.tempoFalso();
    prepararHostAntigo(amb3);
    const conns3 = conexoesPorDestino();
    const peers3 = amb3.instalarPeerFalso({ aoConectar: conns3.aoConectar });
    amb3.Game.network.retomarComoJogadorSeOutroAssumiu();
    peers3[0].disparar('open', 'peer-sonda');
    tempo3.avancar(10000);
    confere(amb3.state.isHost && peers3[0].destroyed, 'sem resposta, segue como host e encerra a sonda');
    conns3.abrir('sala-h1');
    confere(amb3.state.isHost && amb3.state.hostVersion === 0, 'resposta depois do tempo limite não pode mudar o papel');

    // 4) Guest não sonda nada.
    const amb4 = usar(criarAmbiente());
    const peers4 = amb4.instalarPeerFalso();
    amb4.state.isHost = false;
    amb4.Game.network.retomarComoJogadorSeOutroAssumiu();
    confere(peers4.length === 0, 'guest não deveria criar sonda');

    // 5) main.js: a verificação roda só para host com sessão restaurada,
    // antes de abrir o ID de host.
    const main = fs.readFileSync(path.join(RAIZ, 'js/main.js'), 'utf8');
    const chamada = main.search(/if \(restaurou && state\.isHost\) \{\s*await Game\.network\.retomarComoJogadorSeOutroAssumiu\(\);/);
    confere(chamada >= 0, 'init() deveria chamar retomarComoJogadorSeOutroAssumiu() para host com sessão restaurada');
    confere(chamada < main.indexOf('await initPeerWithRetry()'), 'a verificação deveria vir antes de abrir o peer');
});

// ============================================
// D3c — ENCONTRAR A SALA DEPOIS DE MIGRAÇÕES DE HOST
// ============================================

/** Peer falso mínimo para a procura: uma conexão controlável por destino. */
function peerDeProcura() {
    const conexoes = {};
    const pedidos = [];
    return {
        conexoes, pedidos, destroyed: false,
        connect(destino) {
            const h = {};
            const c = { peer: destino, open: false, fechada: false, on: (ev, cb) => { h[ev] = cb; }, send: () => {}, close() { c.fechada = true; }, disparar: (ev) => h[ev] && h[ev]() };
            conexoes[destino] = c;
            pedidos.push(destino);
            return c;
        },
        abrir(destino) { conexoes[destino].open = true; conexoes[destino].disparar('open'); }
    };
}
const indisponivel = (id) => ({ type: 'peer-unavailable', message: 'Could not connect to peer ' + id });

teste('T44 Procura da sala: várias versões ao mesmo tempo, descarta as que não existem, fica com a que abre', (usar) => {
    const amb = usar(criarAmbiente());
    const net = amb.Game.network;
    const peer = peerDeProcura();
    let achado = null;
    let desistiu = 0;

    net.procurarHost(peer, 'sala', {
        aoAchar: (conn, versao, id) => { achado = { conn, versao, id }; },
        aoDesistir: () => { desistiu++; }
    });
    confere(peer.pedidos.join(',') === 'sala,sala-h1,sala-h2,sala-h3,sala-h4,sala-h5',
        'deveria procurar o ID base e 5 versões seguintes, procurou: ' + peer.pedidos.join(','));

    // "sala-h1 não existe" não pode descartar "sala" (o nome de um contém o do outro).
    net.avisarPeerIndisponivel(indisponivel('sala-h1'));
    confere(peer.conexoes['sala-h1'].fechada && !peer.conexoes['sala'].fechada, 'só a versão indisponível deveria ser descartada');
    ['sala', 'sala-h3', 'sala-h4', 'sala-h5'].forEach(id => net.avisarPeerIndisponivel(indisponivel(id)));
    confere(!achado && desistiu === 0, 'ainda falta sala-h2 responder');
    peer.abrir('sala-h2');
    confere(achado && achado.versao === 2 && achado.id === 'sala-h2' && achado.conn === peer.conexoes['sala-h2'], 'deveria achar sala-h2');
    confere(!achado.conn.fechada, 'a conexão achada fica aberta para quem chamou');
    net.avisarPeerIndisponivel(indisponivel('sala-h2'));
    confere(desistiu === 0, 'depois de achar, avisos atrasados não mudam nada');

    // Nenhuma versão existe: desiste uma vez só.
    const peer2 = peerDeProcura();
    let desistiu2 = 0;
    net.procurarHost(peer2, 'sala', { versaoInicial: 3, versoes: 2, aoAchar: () => { throw new Error('não deveria achar'); }, aoDesistir: () => { desistiu2++; } });
    confere(peer2.pedidos.join(',') === 'sala-h3,sala-h4', 'deveria começar da versão inicial, procurou: ' + peer2.pedidos.join(','));
    peer2.pedidos.forEach(id => net.avisarPeerIndisponivel(indisponivel(id)));
    net.avisarPeerIndisponivel(indisponivel('sala-h4'));
    confere(desistiu2 === 1, 'deveria desistir exatamente uma vez, desistiu ' + desistiu2);

    // Sem resposta nenhuma: desiste no tempo máximo, fechando tudo.
    const tempo = amb.tempoFalso();
    const peer3 = peerDeProcura();
    let desistiu3 = 0;
    net.procurarHost(peer3, 'sala', { aoAchar: () => {}, aoDesistir: () => { desistiu3++; } });
    tempo.avancar(4000);
    confere(desistiu3 === 0, 'não deveria desistir antes do tempo máximo');
    tempo.avancar(2000);
    confere(desistiu3 === 1 && Object.values(peer3.conexoes).every(c => c.fechada), 'no tempo máximo, desiste e fecha as conexões');

    // cancelar(): encerra sem chamar nada.
    const peer4 = peerDeProcura();
    let chamou = false;
    const busca = net.procurarHost(peer4, 'sala', { aoAchar: () => { chamou = true; }, aoDesistir: () => { chamou = true; } });
    busca.cancelar();
    tempo.avancar(10000);
    confere(!chamou && Object.values(peer4.conexoes).every(c => c.fechada), 'cancelada, não chama ninguém e fecha tudo');

    // Sem peer utilizável: desiste na hora, sem erro.
    let desistiu5 = 0;
    net.procurarHost({ destroyed: true, connect: () => { throw new Error('não'); } }, 'sala', { aoAchar: () => {}, aoDesistir: () => { desistiu5++; } });
    confere(desistiu5 === 1, 'sem peer utilizável, deveria desistir na hora');
    confere(amb.Game.computeHostPeerId('sala', 0) === 'sala' && amb.Game.computeHostPeerId('sala', 3) === 'sala-h3', 'regra dos IDs de host inalterada');
});

teste('T45 Guest entra/volta pelo ID base depois de migrações: acha a versão atual e manda o player-join', (usar) => {
    // Entrando agora (versão 0 conhecida), sala já em sala-h1.
    const amb = usar(criarAmbiente());
    amb.state.isHost = false;
    amb.state.playerName = 'A';
    amb.state.baseRoomPeerId = 'sala';
    amb.state.hostPeerId = 'sala';
    amb.state.hostVersion = 0;
    const conns = {};
    const peers = amb.instalarPeerFalso({
        aoConectar: (destino) => {
            const h = {};
            const c = { peer: destino, open: false, fechada: false, on: (ev, cb) => { h[ev] = cb; }, send: () => {}, close() { if (c.open && h.close) { c.open = false; h.close(); } c.fechada = true; }, disparar: (ev) => h[ev] && h[ev]() };
            conns[destino] = c;
            return c;
        }
    });
    amb.Game.network.initPeer().catch(() => {});
    const peer = peers[0];
    peer.disparar('open', 'peer-a');
    confere(peer.conexoesPedidas.includes('sala') && peer.conexoesPedidas.includes('sala-h1'),
        'deveria procurar o ID base e as versões seguintes, procurou: ' + peer.conexoesPedidas.join(','));
    // Pelo handler de erro REAL do peer (peerService.initPeer).
    peer.disparar('error', indisponivel('sala'));
    confere(conns['sala'].fechada, 'o erro peer-unavailable do peer deveria descartar a versão que não existe');
    confere(amb.registro.paraHost.length === 0, 'antes de achar, não manda nada');
    conns['sala-h1'].open = true;
    conns['sala-h1'].disparar('open');
    confere(amb.state.hostVersion === 1 && amb.state.hostPeerId === 'sala-h1', 'deveria passar a usar sala-h1, usa: ' + amb.state.hostPeerId);
    confere(amb.Game.network.connectionState.getConnection('sala-h1') === conns['sala-h1'], 'a conexão com o host deveria ficar registrada');
    const joins = amb.registro.paraHost.filter(m => m.type === 'player-join');
    confere(joins.length === 1 && joins[0].token === amb.Game.identity.obterTokenDaSala('sala'), 'deveria mandar um player-join, com o token');
    confere(['sala-h2', 'sala-h3', 'sala-h4', 'sala-h5'].every(id => conns[id].fechada), 'as outras tentativas deveriam ser fechadas');

    // A conexão achada passa pelo handleConnection() real: queda do host é percebida.
    let quedas = 0;
    amb.Game.network.handleHostDisconnect = () => { quedas++; };
    conns['sala-h1'].close();
    confere(quedas === 1, 'queda da conexão achada deveria acionar o tratamento de queda do host');

    // Voltando com a sessão restaurada (versão 1), sala já em sala-h2.
    const amb2 = usar(criarAmbiente());
    amb2.state.isHost = false;
    amb2.state.playerName = 'A';
    amb2.state.baseRoomPeerId = 'sala';
    amb2.state.hostPeerId = 'sala-h1';
    amb2.state.hostVersion = 1;
    const peers2 = amb2.instalarPeerFalso({ aoConectar: conexaoQueAbre('sala-h2') });
    amb2.Game.network.initPeer().catch(() => {});
    peers2[0].disparar('open', 'peer-a2');
    confere(!peers2[0].conexoesPedidas.includes('sala'), 'deveria começar da versão salva, procurou: ' + peers2[0].conexoesPedidas.join(','));
    confere(amb2.state.hostVersion === 2 && amb2.state.hostPeerId === 'sala-h2', 'deveria achar sala-h2, usa: ' + amb2.state.hostPeerId);

    // Sala não existe em versão nenhuma: avisa o jogador.
    const amb3 = usar(criarAmbiente());
    amb3.state.isHost = false;
    amb3.state.baseRoomPeerId = 'sala';
    amb3.state.hostVersion = 0;
    const peers3 = amb3.instalarPeerFalso({ aoConectar: conexaoQueAbre(null) });
    amb3.Game.network.initPeer().catch(() => {});
    peers3[0].disparar('open', 'peer-x');
    amb3.limparRegistro();
    peers3[0].conexoesPedidas.forEach(id => peers3[0].disparar('error', indisponivel(id)));
    confere(amb3.registro.ui.includes('updateConnectionStatus'), 'sem sala, deveria mostrar o erro de conexão');
    confere(!peers3[0].destroyed, 'o peer do jogador continua (pode tentar de novo)');
});

/** aoConectar para instalarPeerFalso: só a conexão com `destinoQueAbre` abre (na hora em que o handler 'open' é registrado). */
function conexaoQueAbre(destinoQueAbre) {
    return (destino) => {
        const c = {
            peer: destino, open: false,
            on: (ev, cb) => { if (ev === 'open' && destino === destinoQueAbre) { c.open = true; cb(); } },
            send: () => {}, close: () => { c.open = false; }
        };
        return c;
    };
}

teste('T46 Assumir como host não manda reconectar o peer novo (erro "cannot reconnect")', (usar) => {
    const amb = usar(criarAmbiente());
    const tempo = amb.tempoFalso();
    amb.state.isHost = false;
    amb.state.baseRoomPeerId = 'sala';
    const peers = amb.instalarPeerFalso();
    amb.Game.network.initPeer().catch(() => {});
    const peerAntigo = peers[0];
    peerAntigo.disparar('open', 'peer-b');

    // becomeHost(): destrói o peer antigo (o PeerJS dispara 'disconnected'
    // dentro do destroy) e passa a usar o peer novo, já conectado.
    const peerNovo = new amb.ctx.Peer('sala-h1');
    amb.Game.network.connectionState.setPeer(peerNovo);
    peerAntigo.destroyed = true;
    peerAntigo.disconnected = true;
    amb.limparRegistro();
    peerAntigo.disparar('disconnected');
    confere(!amb.registro.ui.includes('updateConnectionStatus'), 'o novo host não deveria ver "Desconectado" por causa do peer antigo');
    tempo.avancar(5000);
    confere(peerNovo.reconexoes === 0, 'não deveria mandar reconectar o peer novo');
    confere(peerAntigo.reconexoes === 0, 'nem o peer destruído');

    // Controle: o peer em uso perdeu o servidor de verdade — reconecta.
    const amb2 = usar(criarAmbiente());
    const tempo2 = amb2.tempoFalso();
    amb2.state.isHost = false;
    amb2.state.baseRoomPeerId = 'sala';
    const peers2 = amb2.instalarPeerFalso();
    amb2.Game.network.initPeer().catch(() => {});
    peers2[0].disparar('open', 'peer-b');
    peers2[0].disconnected = true;
    peers2[0].disparar('disconnected');
    tempo2.avancar(5000);
    confere(peers2[0].reconexoes === 1, 'peer em uso desconectado do servidor deveria reconectar uma vez, reconectou ' + peers2[0].reconexoes);

    // Se o PeerJS já tiver reconectado sozinho antes dos 3s, não manda de novo.
    peers2[0].disparar('disconnected');
    peers2[0].disconnected = false;
    tempo2.avancar(5000);
    confere(peers2[0].reconexoes === 1, 'peer que já voltou ao servidor não deveria ser reconectado');
});

/**
 * D3c: carrega a tela inicial (hostSearch.js + roomEntry.js, como o
 * index.html) com DOM, PeerJS e timers falsos.
 */
function criarTelaInicial() {
    const elementos = {};
    const elemento = (id) => {
        if (!elementos[id]) {
            const handlers = {};
            elementos[id] = {
                id, value: '', textContent: '', className: '', style: {}, offsetHeight: 0,
                focus: () => {},
                addEventListener: (ev, fn) => { handlers[ev] = fn; },
                clicar: () => handlers.click && handlers.click()
            };
        }
        return elementos[id];
    };
    const feedbacks = [];
    let agora = 0;
    const fila = [];
    const peers = [];
    const ctx = vm.createContext({
        console: { log: () => {}, warn: () => {}, error: () => {}, info: () => {} },
        document: { getElementById: elemento, execCommand: () => {}, createRange: () => ({ selectNode: () => {} }) },
        getSelection: () => ({ removeAllRanges: () => {}, addRange: () => {} }),
        location: { href: 'index.html' },
        URLSearchParams,
        setTimeout: (fn, ms) => { fila.push({ fn, quando: agora + (ms || 0) }); return fila.length; },
        clearTimeout: () => {},
        Peer: function (id, opcoes) {
            // new Peer(opcoes) (sem ID) também é aceito pelo PeerJS.
            if (id && typeof id === 'object') { opcoes = id; id = undefined; }
            const handlers = {};
            this.id = id;
            this.destroyed = false;
            this.pedidos = {};
            this.on = (ev, cb) => { handlers[ev] = cb; };
            this.destroy = () => { this.destroyed = true; };
            this.connect = (destino) => {
                const h = {};
                const c = { peer: destino, open: false, fechada: false, on: (ev, cb) => { h[ev] = cb; }, close() { c.fechada = true; }, disparar: (ev) => h[ev] && h[ev]() };
                this.pedidos[destino] = c;
                return c;
            };
            this.disparar = (ev, arg) => handlers[ev] && handlers[ev](arg);
            peers.push(this);
        }
    });
    vm.runInContext('var window = this;' + fs.readFileSync(path.join(RAIZ, 'config/game-config.js'), 'utf8'), ctx);
    vm.runInContext(fs.readFileSync(path.join(RAIZ, 'js/network/hostSearch.js'), 'utf8'), ctx, { filename: 'hostSearch.js' });
    vm.runInContext(fs.readFileSync(path.join(RAIZ, 'js/entry/roomEntry.js'), 'utf8'), ctx, { filename: 'roomEntry.js' });
    const prefixo = vm.runInContext('CONFIG.ROOM_PREFIX', ctx);

    // Guarda cada mensagem mostrada (roomEntry sobrescreve textContent).
    ['joinFeedback', 'createFeedback'].forEach(id => {
        const el = elemento(id);
        let texto = '';
        Object.defineProperty(el, 'textContent', { get: () => texto, set: (v) => { texto = v; feedbacks.push({ onde: id, texto: v }); } });
    });

    return {
        ctx, elemento, feedbacks, peers, prefixo,
        avancar(ms) {
            const fim = agora + ms;
            for (;;) {
                fila.sort((a, b) => a.quando - b.quando);
                if (!fila.length || fila[0].quando > fim) break;
                const t = fila.shift();
                agora = t.quando;
                t.fn();
            }
            agora = fim;
        },
        /** Todas as versões pedidas pelo peer, menos `existe`, respondem "não existe". */
        responderIndisponivel(peer, existe = []) {
            Object.keys(peer.pedidos).filter(d => !existe.includes(d)).forEach(d => peer.disparar('error', indisponivel(d)));
        }
    };
}

teste('T47 Tela inicial: entrar acha a sala migrada; criar recusa código de partida migrada; mensagens certas', (usar) => {
    // Entrar com o código 001 depois de uma migração (sala em ...-001-h1).
    const tela = criarTelaInicial();
    const base = tela.prefixo + '001';
    tela.elemento('joinPlayerName').value = 'Vini';
    tela.elemento('joinRoomSuffix').value = '001';
    tela.elemento('btnJoinRoom').clicar();
    const teste1 = tela.peers[0];
    teste1.disparar('open', 'peer-teste');
    confere(teste1.pedidos[base] && teste1.pedidos[base + '-h1'], 'deveria procurar o ID base e as versões migradas');
    tela.responderIndisponivel(teste1, [base + '-h1']);
    teste1.pedidos[base + '-h1'].disparar('open');
    confere(tela.feedbacks.some(f => f.texto.includes('Sala encontrada')), 'deveria achar a sala migrada');
    tela.avancar(2000);
    const destino = new URL('https://x/' + tela.ctx.location.href).searchParams;
    confere(tela.ctx.location.href.startsWith('game.html?') && destino.get('host') === 'false' && destino.get('peerId') === base && destino.get('room') === base,
        'deveria ir para o jogo com o ID base da sala, foi para: ' + tela.ctx.location.href);
    confere(teste1.destroyed, 'o peer de teste deveria ser encerrado');

    // Código que não existe em versão nenhuma: uma mensagem só, a certa.
    const tela2 = criarTelaInicial();
    tela2.elemento('joinPlayerName').value = 'Vini';
    tela2.elemento('joinRoomSuffix').value = '999';
    tela2.elemento('btnJoinRoom').clicar();
    tela2.peers[0].disparar('open', 'peer-teste');
    tela2.responderIndisponivel(tela2.peers[0]);
    tela2.avancar(20000);
    const erros2 = tela2.feedbacks.filter(f => f.onde === 'joinFeedback' && f.texto.startsWith('⚠️'));
    confere(erros2.length === 1 && erros2[0].texto.includes('Sala não encontrada'),
        'deveria mostrar só "Sala não encontrada", mostrou: ' + erros2.map(f => f.texto).join(' | '));
    confere(tela2.ctx.location.href === 'index.html', 'não deveria sair da tela inicial');

    // Erro de rede no meio da procura: "Erro de conexão", uma vez, e a procura para.
    const tela5 = criarTelaInicial();
    tela5.elemento('joinPlayerName').value = 'Vini';
    tela5.elemento('joinRoomSuffix').value = '001';
    tela5.elemento('btnJoinRoom').clicar();
    const teste5 = tela5.peers[0];
    teste5.disparar('open', 'peer-teste');
    teste5.disparar('error', { type: 'network', message: 'Lost connection to server.' });
    confere(Object.values(teste5.pedidos).every(c => c.fechada), 'a procura deveria parar na hora (conexões fechadas)');
    tela5.avancar(20000);
    const erros5 = tela5.feedbacks.filter(f => f.texto.startsWith('⚠️'));
    confere(erros5.length === 1 && erros5[0].texto.includes('Erro de conexão'), 'deveria mostrar só "Erro de conexão", mostrou: ' + erros5.map(f => f.texto).join(' | '));

    // Criar 001 enquanto a partida continua em ...-001-h1: código em uso.
    const tela3 = criarTelaInicial();
    tela3.elemento('createPlayerName').value = 'Outra';
    tela3.elemento('createRoomId').value = '001';
    tela3.elemento('btnCreateRoom').clicar();
    const teste3 = tela3.peers[0];
    confere(teste3.id === base, 'pré-condição: criar reserva o ID base');
    teste3.disparar('open', base);
    confere(!teste3.pedidos[base] && teste3.pedidos[base + '-h1'], 'deveria procurar as versões migradas (não a própria)');
    teste3.pedidos[base + '-h1'].disparar('open');
    confere(tela3.feedbacks.some(f => f.texto.includes('já está em uso')), 'deveria recusar o código de uma partida migrada');
    confere(tela3.elemento('screenCreated').style.display !== 'block', 'não deveria ir para a tela de sala criada');
    confere(teste3.destroyed, 'deveria liberar o ID base reservado');

    // Criar código livre: nenhuma versão existe → sala criada.
    const tela4 = criarTelaInicial();
    tela4.elemento('createPlayerName').value = 'Outra';
    tela4.elemento('createRoomId').value = '002';
    tela4.elemento('btnCreateRoom').clicar();
    tela4.peers[0].disparar('open', tela4.prefixo + '002');
    tela4.responderIndisponivel(tela4.peers[0]);
    confere(tela4.elemento('screenCreated').style.display === 'block', 'código livre deveria criar a sala');
    confere(!tela4.feedbacks.some(f => f.texto.startsWith('⚠️')), 'sem mensagem de erro');
    confere(tela4.peers[0].destroyed, 'o peer de teste deveria ser liberado antes de entrar no jogo');
});

console.log('\n' + (falhou === 0 ? '🎉' : '⚠️') + ' ' + passou + ' passaram, ' + falhou + ' falharam\n');

// No GitHub Actions, escreve também uma tabela de resumo que aparece
// direto na página da execução (variável fornecida pelo próprio GitHub;
// rodando localmente ela não existe e este bloco é ignorado).
if (process.env.GITHUB_STEP_SUMMARY) {
    const escapar = (t) => String(t).replace(/\|/g, '\\|').replace(/\n/g, ' ');
    const linhas = [
        '### 🧪 Fase D — ' + passou + ' passaram, ' + falhou + ' falharam',
        '',
        '| | Teste | Detalhe da falha |',
        '|---|---|---|',
        ...resultados.map(r => '| ' + (r.ok ? '✅' : '❌') + ' | ' + escapar(r.nome) + ' | ' + (r.ok ? '' : escapar(r.erro)) + ' |'),
        ''
    ];
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, linhas.join('\n') + '\n');
}

process.exit(falhou === 0 ? 0 : 1);