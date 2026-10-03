// ============================================
// PM: The KPI Master - Testes de lógica: Entrada na sala e identidade
// ============================================
// Entrar na sala (lobby, sala travada, sala cheia, nome em uso), token
// de identidade por sala e a tela inicial (entrar e criar sala).
// Ambiente simulado e ajudantes: environment.js. Rodar a partir da raiz:
//     node tests/logic/joining-and-identity.test.js
// ============================================

const {
    fs, path, vm, RAIZ, createEnvironment, tokenOf, test, check, start, finish,
    syncTo, roundScreens, unavailable, roomToReload, reloadHost, tryReloadHost
} = require('./environment');

start('Entrada na sala e identidade');

test('T1  Lobby: guest que cai é removido da lista (como antes)', (usar) => {
    const amb = usar(createEnvironment());
    amb.createRoomAsHost();
    amb.join('A', 'peer-a');
    check(amb.player('A'), 'A deveria ter entrado no lobby');
    amb.drop('peer-a');
    check(!amb.player('A'), 'A deveria ter sido removido da lista');
});

test('T2  Partida em andamento: nome novo é recusado (room-locked)', (usar) => {
    const amb = usar(createEnvironment());
    amb.createRoomAsHost();
    amb.join('A', 'peer-a');
    amb.join('B', 'peer-b');
    amb.startMatch();
    amb.join('C', 'peer-c');
    check(amb.rejectionFor('peer-c') === 'room-locked', 'esperava recusa room-locked, veio: ' + amb.rejectionFor('peer-c'));
    check(!amb.player('C'), 'C não deveria ter entrado na lista');
    check(amb.state.players.length === 3, 'lista deveria continuar com 3 jogadores');
});

test('T3  Nome em uso por jogador conectado continua bloqueado (name-taken)', (usar) => {
    const amb = usar(createEnvironment());
    amb.createRoomAsHost();
    amb.join('A', 'peer-a');
    amb.join('B', 'peer-b');
    amb.startMatch();
    amb.join('A', 'peer-impostor');
    check(amb.rejectionFor('peer-impostor') === 'name-taken', 'esperava name-taken, veio: ' + amb.rejectionFor('peer-impostor'));
    check(amb.player('A').peerId === 'peer-a', 'A original não deveria ter perdido o peerId');
});

test('T3b Nome do próprio host é recusado (name-taken), host não perde o lugar', (usar) => {
    for (const comPartida of [false, true]) {
        const amb = usar(createEnvironment());
        amb.createRoomAsHost();
        amb.join('A', 'peer-a');
        if (comPartida) amb.startMatch();
        amb.join('Host', 'peer-intruso');
        const onde = comPartida ? ' (partida em andamento)' : ' (lobby)';
        check(amb.rejectionFor('peer-intruso') === 'name-taken', 'esperava name-taken' + onde + ', veio: ' + amb.rejectionFor('peer-intruso'));
        check(amb.player('Host').peerId === 'peer-host', 'o host não pode perder o próprio peerId' + onde);
    }
});

test('T9  Sala cheia: quem caiu consegue voltar; nome novo leva room-locked', (usar) => {
    const amb = usar(createEnvironment());
    amb.CONFIG.JOGO.MAX_PLAYERS = 3;
    amb.createRoomAsHost();
    amb.join('A', 'peer-a');
    amb.join('B', 'peer-b');
    amb.startMatch();

    amb.drop('peer-a');
    amb.join('A', 'peer-a2');
    check(amb.rejectionFor('peer-a2') === null, 'A não deveria ser recusado, veio: ' + amb.rejectionFor('peer-a2'));
    check(!amb.player('A').disconnected, 'A deveria estar conectado de novo');

    amb.join('D', 'peer-d');
    check(amb.rejectionFor('peer-d') === 'room-locked', 'esperava room-locked para D, veio: ' + amb.rejectionFor('peer-d'));
});

/** Algum token cru apareceu em alguma mensagem que saiu do host? */
function tokenLeaked(amb, token) {
    const tudo = JSON.stringify(amb.registro.broadcasts) + JSON.stringify(amb.registro.enviados);
    return tudo.includes(token);
}

test('T22 SHA-256 próprio: vetores oficiais e mesmo resultado do Node', (usar) => {
    const amb = usar(createEnvironment());
    const sha = amb.Game.identity.sha256Hex;
    const vetores = {
        '': 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
        'abc': 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
        'abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq': '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1'
    };
    for (const [entrada, esperado] of Object.entries(vetores)) {
        check(sha(entrada) === esperado, 'SHA-256("' + entrada + '") errado: ' + sha(entrada));
    }

    const nodeSha = (t) => require('crypto').createHash('sha256').update(t, 'utf8').digest('hex');
    // Todos os tamanhos de 0 a 130 (cobre as fronteiras de bloco em 55/56/64/119/120/128).
    for (let n = 0; n <= 130; n++) {
        const t = 'x'.repeat(n);
        check(sha(t) === nodeSha(t), 'diverge do Node com ' + n + ' caracteres');
    }
    for (const t of ['Ação é João', 'ñ ç ü € 日本語', 'emoji 🎯🚀 no meio', amb.Game.identity.obterTokenDaSala('sala')]) {
        check(sha(t) === nodeSha(t), 'diverge do Node em "' + t + '"');
    }
});

test('T23 Token por sala: criado uma vez, reaproveitado, diferente entre salas', (usar) => {
    const amb = usar(createEnvironment());
    const id = amb.Game.identity;
    const t1 = id.obterTokenDaSala('sala-x');
    check(/^[0-9a-f]{32}$/.test(t1), 'token deveria ter 32 caracteres hexadecimais, veio: ' + t1);
    check(amb.armazenamento['pmKPI_token_sala-x'] === t1, 'token deveria ficar no localStorage, na chave da sala');
    check(id.obterTokenDaSala('sala-x') === t1, 'a mesma sala deveria devolver o mesmo token (F5, reconexão)');
    check(id.obterTokenDaSala('sala-y') !== t1, 'outra sala deveria ter outro token');
    check(id.meuTokenHash('sala-x') === id.hashToken(t1) && id.hashToken(t1) !== t1, 'meuTokenHash deveria ser o hash do token');

    // Um ambiente novo (outro "navegador") gera outro token para a mesma sala.
    const outro = usar(createEnvironment());
    check(outro.Game.identity.obterTokenDaSala('sala-x') !== t1, 'outro navegador deveria ter outro token');

    // localStorage indisponível: continua funcionando enquanto a página estiver aberta.
    const semStorage = usar(createEnvironment());
    semStorage.localStorageFalso.getItem = () => { throw new Error('bloqueado'); };
    semStorage.localStorageFalso.setItem = () => { throw new Error('bloqueado'); };
    const t3 = semStorage.Game.identity.obterTokenDaSala('sala-z');
    check(/^[0-9a-f]{32}$/.test(t3) && semStorage.Game.identity.obterTokenDaSala('sala-z') === t3,
        'sem localStorage, o token deveria ser estável durante a página');
});

test('T24 Entrada guarda só o hash do token; o token cru nunca sai do host', (usar) => {
    const amb = usar(createEnvironment());
    amb.createRoomAsHost();
    amb.join('A', 'peer-a');
    amb.join('B', 'peer-b');
    check(amb.player('A').tokenHash === amb.hash(tokenOf('A')), 'A deveria ficar com o hash do token dele');
    check(!JSON.stringify(amb.state.players).includes(tokenOf('A')), 'o token cru não pode ficar na lista de jogadores');

    amb.startMatch();
    amb.drop('peer-a');
    amb.join('A', 'peer-a2');
    check(amb.registro.enviados.some(e => e.para === 'peer-a2' && e.msg.type === 'state-sync'), 'pré-condição: A recebeu state-sync');
    check(amb.registro.broadcasts.some(m => m.type === 'player-list'), 'pré-condição: houve player-list');
    for (const nome of ['A', 'B']) {
        check(!tokenLeaked(amb, tokenOf(nome)), 'o token cru de ' + nome + ' vazou em alguma mensagem do host');
    }
    const lista = amb.broadcastsOfType('player-list').pop();
    check(lista.players.find(p => p.name === 'A').tokenHash === amb.hash(tokenOf('A')), 'o hash circula na lista (para sobreviver à migração)');
});

test('T25 Reconexão com token errado ou sem token: recusada, vaga e dados preservados', (usar) => {
    const amb = usar(createEnvironment());
    amb.createRoomAsHost();
    amb.join('A', 'peer-a');
    amb.startMatch();
    Object.assign(amb.player('A'), { kpi: 7, recursos: 4, phase: 'planejamento', activities: 1 });
    amb.drop('peer-a');
    check(amb.state.partidaPausada, 'pré-condição: partida pausada com A desconectado');

    amb.join('A', 'peer-impostor', 'token-de-outro-navegador');
    check(amb.rejectionFor('peer-impostor') === 'identity-mismatch', 'esperava identity-mismatch, veio: ' + amb.rejectionFor('peer-impostor'));

    amb.join('A', 'peer-sem-token', null);
    check(amb.rejectionFor('peer-sem-token') === 'identity-mismatch', 'sem token deveria dar identity-mismatch, veio: ' + amb.rejectionFor('peer-sem-token'));

    const a = amb.player('A');
    check(a.disconnected === true && a.peerId === 'peer-a', 'A deveria continuar desconectado, com o peerId antigo');
    check(a.kpi === 7 && a.recursos === 4 && a.phase === 'planejamento' && a.activities === 1, 'dados de A não podem mudar');
    check(a.tokenHash === amb.hash(tokenOf('A')), 'o hash registrado não pode ser trocado');
    check(amb.state.partidaPausada, 'a partida não pode ser retomada por um impostor');
    check(!amb.registro.enviados.some(e => (e.para === 'peer-impostor' || e.para === 'peer-sem-token') && e.msg.type === 'state-sync'),
        'impostor não pode receber o estado da partida');

    // O A de verdade continua conseguindo voltar.
    amb.join('A', 'peer-a2');
    check(amb.rejectionFor('peer-a2') === null, 'A com o token certo deveria voltar, veio: ' + amb.rejectionFor('peer-a2'));
    check(!amb.player('A').disconnected && amb.player('A').peerId === 'peer-a2', 'A deveria estar conectado de novo');
    check(!amb.state.partidaPausada && amb.state.currentRound, 'a volta de A deveria retomar a partida');
});

test('T27 Transição: entrada salva antes do token é aceita pelo nome e passa a exigir o token', (usar) => {
    const amb = usar(createEnvironment());
    amb.createRoomAsHost();
    amb.join('A', 'peer-a');
    amb.join('B', 'peer-b');
    amb.startMatch();
    delete amb.player('A').tokenHash; // como num estado salvo por uma versão anterior
    amb.drop('peer-a');

    amb.join('A', 'peer-a2');
    check(amb.rejectionFor('peer-a2') === null, 'sem hash registrado, deveria aceitar pelo nome (como antes), veio: ' + amb.rejectionFor('peer-a2'));
    check(amb.player('A').tokenHash === amb.hash(tokenOf('A')), 'deveria adotar o hash deste token');

    amb.drop('peer-a2');
    amb.join('A', 'peer-impostor', 'token-de-outro-navegador');
    check(amb.rejectionFor('peer-impostor') === 'identity-mismatch', 'depois de adotar, deveria exigir o token, veio: ' + amb.rejectionFor('peer-impostor'));
});

test('T28 Guest envia o token no player-join (1ª conexão e as duas reconexões)', (usar) => {
    const amb = usar(createEnvironment());
    amb.state.isHost = false;
    amb.state.playerName = 'A';
    amb.state.peerId = 'peer-a';
    amb.state.baseRoomPeerId = 'sala';
    amb.state.hostPeerId = 'sala';
    amb.state.hostVersion = 0;
    const meuToken = amb.Game.identity.obterTokenDaSala('sala');
    const checkJoin = (onde) => {
        const join = amb.registro.paraHost.filter(m => m.type === 'player-join').pop();
        check(join, onde + ': deveria enviar player-join');
        check(join.playerName === 'A' && join.token === meuToken, onde + ': player-join deveria levar o token da sala, veio: ' + join.token);
        amb.clearLog();
    };

    // 1) Primeira conexão (handleConnection, lado guest).
    amb.connect('sala');
    checkJoin('primeira conexão');

    // Conexão falsa que abre quando o teste mandar (para as reconexões).
    const newConnection = (destino) => {
        const h = {};
        return { peer: destino, open: true, on: (ev, cb) => { h[ev] = cb; }, send: () => {}, close: () => {}, fire: (ev) => h[ev] && h[ev]() };
    };

    // 2) Reconexão ao mesmo host.
    let conn = newConnection('sala');
    amb.installFakePeer({ connectDevolve: conn });
    amb.Game.network.connectionState.setPeer(new amb.ctx.Peer('peer-a'));
    amb.Game.network.attemptReconnectToSameHost(1);
    conn.fire('open');
    checkJoin('reconexão ao mesmo host');

    // 3) Reconexão ao novo host (depois de uma migração).
    conn = newConnection('sala-h1');
    amb.installFakePeer({ connectDevolve: conn });
    amb.Game.network.connectionState.setPeer(new amb.ctx.Peer('peer-a'));
    amb.Game.network.attemptReconnectToNewHost(1);
    conn.fire('open');
    checkJoin('reconexão ao novo host');
    check(amb.state.hostPeerId === 'sala-h1', 'pré-condição: guest deveria ter ido para a sala nova');
    check(amb.Game.identity.obterTokenDaSala(amb.state.baseRoomPeerId) === meuToken, 'o token não muda com a migração (chave pelo ID base)');
});

test('T29 Host se insere na lista (setupUI) com o hash do próprio token', (usar) => {
    const amb = usar(createEnvironment());
    const element = () => ({ style: {}, textContent: '', disabled: false, addEventListener: () => {} });
    amb.ctx.document = { getElementById: element, querySelectorAll: () => [] };
    amb.state.isHost = true;
    amb.state.playerName = 'Ana';
    amb.state.peerId = 'sala';
    amb.state.baseRoomPeerId = 'sala';
    amb.state.players = [];

    amb.ctx.setupUI();
    const host = amb.player('Ana');
    const meuToken = amb.Game.identity.obterTokenDaSala('sala');
    check(host && host.isHost, 'o host deveria estar na lista');
    check(host.tokenHash === amb.hash(meuToken), 'a entrada do host deveria ter o hash do token dele');
    check(!JSON.stringify(amb.state.players).includes(meuToken), 'o token cru do host não pode ficar na lista');

    // Chamada de novo (ex: becomeHost) não duplica nem troca a entrada.
    amb.ctx.setupUI();
    check(amb.state.players.length === 1 && amb.player('Ana') === host, 'setupUI de novo não deveria duplicar o host');

    // O nome do host continua sempre em uso, com ou sem o token certo.
    amb.join('Ana', 'peer-intruso', meuToken);
    check(amb.rejectionFor('peer-intruso') === 'name-taken', 'nome do host deveria continuar name-taken, veio: ' + amb.rejectionFor('peer-intruso'));
});

/**
 * D3c: carrega a tela inicial (hostSearch.js + roomEntry.js, como o
 * index.html) com DOM, PeerJS e timers falsos.
 */
function createHomeScreen() {
    const elementos = {};
    const element = (id) => {
        if (!elementos[id]) {
            const handlers = {};
            elementos[id] = {
                id, value: '', textContent: '', className: '', style: {}, offsetHeight: 0,
                focus: () => {},
                addEventListener: (ev, fn) => { handlers[ev] = fn; },
                click: () => handlers.click && handlers.click()
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
        document: { getElementById: element, execCommand: () => {}, createRange: () => ({ selectNode: () => {} }) },
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
                const c = { peer: destino, open: false, fechada: false, on: (ev, cb) => { h[ev] = cb; }, close() { c.fechada = true; }, fire: (ev) => h[ev] && h[ev]() };
                this.pedidos[destino] = c;
                return c;
            };
            this.fire = (ev, arg) => handlers[ev] && handlers[ev](arg);
            peers.push(this);
        }
    });
    vm.runInContext('var window = this;' + fs.readFileSync(path.join(RAIZ, 'config/game-config.js'), 'utf8'), ctx);
    vm.runInContext(fs.readFileSync(path.join(RAIZ, 'js/network/hostSearch.js'), 'utf8'), ctx, { filename: 'hostSearch.js' });
    vm.runInContext(fs.readFileSync(path.join(RAIZ, 'js/entry/roomEntry.js'), 'utf8'), ctx, { filename: 'roomEntry.js' });
    const prefixo = vm.runInContext('CONFIG.ROOM_PREFIX', ctx);

    // Guarda cada mensagem mostrada (roomEntry sobrescreve textContent).
    ['joinFeedback', 'createFeedback'].forEach(id => {
        const el = element(id);
        let texto = '';
        Object.defineProperty(el, 'textContent', { get: () => texto, set: (v) => { texto = v; feedbacks.push({ onde: id, texto: v }); } });
    });

    return {
        ctx, element, feedbacks, peers, prefixo,
        advance(ms) {
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
        answerUnavailable(peer, existe = []) {
            Object.keys(peer.pedidos).filter(d => !existe.includes(d)).forEach(d => peer.fire('error', unavailable(d)));
        }
    };
}

test('T47 Tela inicial: entrar acha a sala migrada; criar recusa código de partida migrada; mensagens certas', (usar) => {
    // Entrar com o código 001 depois de uma migração (sala em ...-001-h1).
    const tela = createHomeScreen();
    const base = tela.prefixo + '001';
    tela.element('joinPlayerName').value = 'Vini';
    tela.element('joinRoomSuffix').value = '001';
    tela.element('btnJoinRoom').click();
    const teste1 = tela.peers[0];
    teste1.fire('open', 'peer-teste');
    check(teste1.pedidos[base] && teste1.pedidos[base + '-h1'], 'deveria procurar o ID base e as versões migradas');
    tela.answerUnavailable(teste1, [base + '-h1']);
    teste1.pedidos[base + '-h1'].fire('open');
    check(tela.feedbacks.some(f => f.texto.includes('Sala encontrada')), 'deveria achar a sala migrada');
    tela.advance(2000);
    const destino = new URL('https://x/' + tela.ctx.location.href).searchParams;
    check(tela.ctx.location.href.startsWith('game.html?') && destino.get('host') === 'false' && destino.get('peerId') === base && destino.get('room') === base,
        'deveria ir para o jogo com o ID base da sala, foi para: ' + tela.ctx.location.href);
    check(teste1.destroyed, 'o peer de teste deveria ser encerrado');

    // Código que não existe em versão nenhuma: uma mensagem só, a certa.
    const tela2 = createHomeScreen();
    tela2.element('joinPlayerName').value = 'Vini';
    tela2.element('joinRoomSuffix').value = '999';
    tela2.element('btnJoinRoom').click();
    tela2.peers[0].fire('open', 'peer-teste');
    tela2.answerUnavailable(tela2.peers[0]);
    tela2.advance(20000);
    const erros2 = tela2.feedbacks.filter(f => f.onde === 'joinFeedback' && f.texto.startsWith('⚠️'));
    check(erros2.length === 1 && erros2[0].texto.includes('Sala não encontrada'),
        'deveria mostrar só "Sala não encontrada", mostrou: ' + erros2.map(f => f.texto).join(' | '));
    check(tela2.ctx.location.href === 'index.html', 'não deveria sair da tela inicial');

    // Erro de rede no meio da procura: "Erro de conexão", uma vez, e a procura para.
    const tela5 = createHomeScreen();
    tela5.element('joinPlayerName').value = 'Vini';
    tela5.element('joinRoomSuffix').value = '001';
    tela5.element('btnJoinRoom').click();
    const teste5 = tela5.peers[0];
    teste5.fire('open', 'peer-teste');
    teste5.fire('error', { type: 'network', message: 'Lost connection to server.' });
    check(Object.values(teste5.pedidos).every(c => c.fechada), 'a procura deveria parar na hora (conexões fechadas)');
    tela5.advance(20000);
    const erros5 = tela5.feedbacks.filter(f => f.texto.startsWith('⚠️'));
    check(erros5.length === 1 && erros5[0].texto.includes('Erro de conexão'), 'deveria mostrar só "Erro de conexão", mostrou: ' + erros5.map(f => f.texto).join(' | '));

    // Criar 001 enquanto a partida continua em ...-001-h1: código em uso.
    const tela3 = createHomeScreen();
    tela3.element('createPlayerName').value = 'Outra';
    tela3.element('createRoomId').value = '001';
    tela3.element('btnCreateRoom').click();
    const teste3 = tela3.peers[0];
    check(teste3.id === base, 'pré-condição: criar reserva o ID base');
    teste3.fire('open', base);
    check(!teste3.pedidos[base] && teste3.pedidos[base + '-h1'], 'deveria procurar as versões migradas (não a própria)');
    teste3.pedidos[base + '-h1'].fire('open');
    check(tela3.feedbacks.some(f => f.texto.includes('já está em uso')), 'deveria recusar o código de uma partida migrada');
    check(tela3.element('screenCreated').style.display !== 'block', 'não deveria ir para a tela de sala criada');
    check(teste3.destroyed, 'deveria liberar o ID base reservado');

    // Criar código livre: nenhuma versão existe → sala criada.
    const tela4 = createHomeScreen();
    tela4.element('createPlayerName').value = 'Outra';
    tela4.element('createRoomId').value = '002';
    tela4.element('btnCreateRoom').click();
    tela4.peers[0].fire('open', tela4.prefixo + '002');
    tela4.answerUnavailable(tela4.peers[0]);
    check(tela4.element('screenCreated').style.display === 'block', 'código livre deveria criar a sala');
    check(!tela4.feedbacks.some(f => f.texto.startsWith('⚠️')), 'sem mensagem de erro');
    check(tela4.peers[0].destroyed, 'o peer de teste deveria ser liberado antes de entrar no jogo');
});

finish('Entrada na sala e identidade');
