// ============================================
// PM: The KPI Master - Testes automatizados da Fase D
// ============================================
// Roda a lógica REAL de sala travada / jogador desconectado / pausa
// (Fase D1a) e de limpeza de desconectados ao voltar ao lobby e na
// migração de host (Fase D1b, incluindo a robustez da própria
// migração) num ambiente simulado, sem navegador e sem PeerJS: a rede
// é trocada por conexões falsas e a UI por um registro de chamadas.
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
// manual da D1a e da D1b.
// ============================================

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const RAIZ = path.resolve(__dirname, '..');

// Mesma ordem de carregamento do game.html para os arquivos envolvidos.
const ARQUIVOS = [
    'js/state/store.js',
    'js/state/selectors.js',
    'js/state/mutations.js',
    'js/engine/sessionEngine.js',
    'js/engine/turnEngine.js',
    'js/network/peerService.js',
    'js/network/messageHandler.js',
    'js/network/hostMigration.js',
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
        HOST_TIMEOUT: 30000,
        ACTIVITIES_PER_PHASE: 2
    },
    FASES: [
        { id: 'iniciacao', nome: 'Iniciação', emoji: '🚀' },
        { id: 'planejamento', nome: 'Planejamento', emoji: '📋' }
    ],
    RECURSOS_INICIAIS: 10,
    KPI: { VALOR_RECURSO_FINAL: 2 }
};
`;

// ============================================
// AMBIENTE SIMULADO
// ============================================

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

    const ctx = vm.createContext({
        console: consoleSilencioso,
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
        sendToHost: () => {},
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
        ctx, Game, state, registro, CONFIG: vm.runInContext('CONFIG', ctx),

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

        /** Guest conecta e envia player-join pela conexão (como o guest real faz). */
        entrar(nome, peerId) {
            const c = abrirConexao(peerId);
            c.disparar('data', { type: 'player-join', playerName: nome, peerId });
        },

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
         * não abre sozinha, ou `opcoes.connectDevolve`, se informado.
         */
        instalarPeerFalso(opcoes = {}) {
            const peersCriados = [];
            ctx.Peer = function (id) {
                const handlers = {};
                this.id = id;
                this.destroyed = false;
                this.conexoesPedidas = [];
                this.on = (evento, cb) => { handlers[evento] = cb; };
                this.destroy = () => { this.destroyed = true; };
                this.connect = (destino) => {
                    this.conexoesPedidas.push(destino);
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

        broadcastsDoTipo: (tipo) => registro.broadcasts.filter(m => m.type === tipo),
        limparRegistro() {
            registro.enviados.length = 0;
            registro.broadcasts.length = 0;
            registro.ui.length = 0;
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

console.log('\n🧪 Fase D — sala travada, jogador desconectado, pausa, saída da página, volta ao lobby, migração\n');

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

teste('T17 Migração no meio da partida: novo host marca os outros como desconectados, pausa e retoma', (usar) => {
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
    confere(!amb.jogador('Host'), 'o host antigo deveria sair da lista');
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

    let erro = null;
    try { amb.Game.network.attemptReconnectToSameHost(3); } catch (e) { erro = e; }
    confere(!erro, 'última tentativa ao mesmo host não deveria lançar erro, lançou: ' + (erro && erro.message));
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