// ============================================
// PM: The KPI Master - Network: Host Migration
// ============================================
// Lida com a perda de conexão com o host: primeiro tenta reconectar
// ao MESMO host (pode ter sido só um F5 dele), e só se isso falhar
// assume que houve migração de host de verdade (versão incrementada).
// Fase 4.3 do roadmap.
//
// 🐛 BUG-002 (ver ISSUES.md): a versão original ia direto para a
// lógica de "migração" (assumir nova versão do host / virar host)
// sempre que a conexão caía — mesmo quando era só um F5 do host com
// o MESMO ID. Isso fazia o guest (backup) virar host indevidamente.
// A correção adiciona attemptReconnectToSameHost() como primeira
// tentativa, antes de cair no fluxo de migração original.
//
// Fase D3b: CONFIG.JOGO.HOST_TIMEOUT passou a ser o prazo TOTAL que os
// guests esperam o host voltar (tentativas curtas e repetidas ao mesmo
// host, contadas a partir da queda). Esgotado o prazo, o backup assume.
// O host antigo continua na partida como jogador comum desconectado e,
// se recarregar a página depois disso, volta como jogador comum (ver
// retomarComoJogadorSeOutroAssumiu()).
//
// Fase D3c: a procura da sala em várias versões do host (usada por quem
// entra, por quem volta e pela verificação do host antigo) fica em
// network/hostSearch.js.
// ============================================

// Fase D3b: ritmo das tentativas de reconexão ao mesmo host dentro do
// prazo (CONFIG.JOGO.HOST_TIMEOUT). Cada tentativa espera no máximo
// TENTATIVA_HOST_MS pela conexão; entre uma e outra há INTERVALO_HOST_MS.
// Uma tentativa nova só começa se ainda couber MINIMO_TENTATIVA_MS dentro
// do prazo — assim o backup assume sem passar do prazo.
const TENTATIVA_HOST_MS = 2500;
const INTERVALO_HOST_MS = 1000;
const MINIMO_TENTATIVA_MS = 1000;

// Fase D3b: quanto tempo o host antigo, ao recarregar a página, espera
// para descobrir se alguém já assumiu a sala (ver
// retomarComoJogadorSeOutroAssumiu()). Sem resposta nesse prazo, segue
// como host, como antes. Fase D3c: cobre abrir a sonda e a busca nas
// versões seguintes (hostSearch.js).
const SONDA_HOST_MS = 7000;

// Momento (Date.now()) em que acaba a espera pelo host atual; 0 quando
// não há espera em andamento. Impede que duas quedas seguidas abram
// duas cadeias de tentativas ao mesmo tempo.
let prazoVoltaDoHost = 0;

/**
 * Lida com a desconexão do host. Tenta reconectar ao mesmo host
 * (versão atual) até o prazo de CONFIG.JOGO.HOST_TIMEOUT; só depois
 * presume migração de host.
 */
function handleHostDisconnect() {
    if (Game.state.isHost) return;
    if (prazoVoltaDoHost) {
        console.log('⏳ Queda do host já está sendo tratada — aguardando a espera em andamento.');
        return;
    }

    console.warn('⚠️ Host desconectado! Tentando reconectar por até ' + (CONFIG.JOGO.HOST_TIMEOUT / 1000) + 's...');
    Game.ui.updateConnectionStatus('error', Game.i18n.t('connection.hostDesconectado'));

    prazoVoltaDoHost = Date.now() + CONFIG.JOGO.HOST_TIMEOUT;
    attemptReconnectToSameHost(1);
}

/**
 * Fase D: pede ao PeerJS uma conexão com `peerId`, ou devolve null se
 * não for possível. Quando o peer local não existe mais ou perdeu o
 * servidor de sinalização, o PeerJS não lança exceção: devolve
 * undefined — e o `.on(...)` logo em seguida quebraria a cadeia inteira
 * de tentativas. Com null, a tentativa só conta como falhada.
 */
function conectarSePossivel(peerId) {
    const peer = Game.network.connectionState.getPeer();
    if (!peer || peer.destroyed) return null;
    try {
        return peer.connect(peerId, { reliable: true }) || null;
    } catch (e) {
        return null;
    }
}

/**
 * Fase D3b: marca na URL da página se este jogador é o host
 * (`host=true`/`host=false`), sem recarregar. Um F5 lê o papel da URL
 * (ver init() em main.js): sem isto, quem assumiu como host voltaria
 * de um F5 achando que é guest, e o host antigo que virou jogador comum
 * voltaria achando que é host. Os outros parâmetros não mudam — o
 * `peerId` da URL continua sendo o ID base da sala.
 */
function registrarPapelNaUrl(souHost) {
    try {
        const url = new URL(window.location.href);
        url.searchParams.set('host', souHost ? 'true' : 'false');
        window.history.replaceState(window.history.state, '', url.toString());
    } catch (e) {
        console.warn('⚠️ Não foi possível atualizar a URL com o papel do jogador:', e && e.message);
    }
}

// ============================================
// RECONEXÃO AO MESMO HOST (correção do BUG-002)
// ============================================

/**
 * Tenta reconectar ao host na versão ATUAL (mesmo ID de sempre).
 * Cobre o caso mais comum: o host só deu F5, sem migração nenhuma.
 *
 * Fase D3b: repete tentativas curtas até o prazo aberto em
 * handleHostDisconnect() (CONFIG.JOGO.HOST_TIMEOUT a partir da queda).
 * Chamada direta, sem prazo em andamento, abre um prazo novo.
 */
function attemptReconnectToSameHost(attempt = 1) {
    const state = Game.state;
    if (state.isHost) return;
    if (!prazoVoltaDoHost) prazoVoltaDoHost = Date.now() + CONFIG.JOGO.HOST_TIMEOUT;

    const maxAttempts = maximoDeTentativasAoMesmoHost();
    const currentHostId = Game.computeHostPeerId(state.baseRoomPeerId, state.hostVersion);
    const esperaMs = Math.min(TENTATIVA_HOST_MS, Math.max(MINIMO_TENTATIVA_MS, prazoVoltaDoHost - Date.now()));

    console.log(`🔁 Tentativa ${attempt}: reconectando ao host atual (${currentHostId})...`);
    Game.ui.updateConnectionStatus('disconnected', Game.i18n.t('connection.reconectandoHost', { attempt: Math.min(attempt, maxAttempts), max: maxAttempts }));

    let settled = false;
    const cs = Game.network.connectionState;
    const conn = conectarSePossivel(currentHostId);
    if (!conn) {
        console.warn('⚠️ Sem peer utilizável para reconectar — tentativa contada como falha.');
        retryReconnectSameHostOrMigrate(attempt);
        return;
    }

    conn.on('open', () => {
        if (settled) return;
        settled = true;
        prazoVoltaDoHost = 0;

        cs.setConnection(currentHostId, conn);
        console.log('✅ Reconectado ao mesmo host (sem migração):', currentHostId);
        Game.ui.updateConnectionStatus('connected', Game.i18n.t('connection.reconectado'));

        Game.network.handleConnection(conn);
        Game.network.enviarPlayerJoin();
        Game.saveState();
    });

    conn.on('error', () => {
        if (settled) return;
        settled = true;
        retryReconnectSameHostOrMigrate(attempt);
    });

    setTimeout(() => {
        if (settled) return;
        settled = true;
        try { conn.close(); } catch (e) { /* ignora */ }
        retryReconnectSameHostOrMigrate(attempt);
    }, esperaMs);
}

/**
 * Fase D3b: quantas tentativas cabem no prazo (só para o texto de
 * status "Reconectando ao host (x/y)").
 */
function maximoDeTentativasAoMesmoHost() {
    return Math.max(1, Math.ceil(CONFIG.JOGO.HOST_TIMEOUT / (TENTATIVA_HOST_MS + INTERVALO_HOST_MS)));
}

function retryReconnectSameHostOrMigrate(attempt) {
    if (Game.state.isHost) {
        prazoVoltaDoHost = 0;
        return;
    }

    const restante = prazoVoltaDoHost - Date.now();
    if (restante >= INTERVALO_HOST_MS + MINIMO_TENTATIVA_MS) {
        setTimeout(() => attemptReconnectToSameHost(attempt + 1), INTERVALO_HOST_MS);
        return;
    }

    prazoVoltaDoHost = 0;
    console.warn('⚠️ O host não voltou dentro do prazo. Presumindo migração de host...');
    decideHostTakeoverOrReconnectNewVersion();
}

/**
 * Só chamada depois que attemptReconnectToSameHost() esgotou as tentativas.
 * Decide se este jogador é o backup (assume como host) ou tenta localizar
 * um novo host em uma versão de ID incrementada.
 */
function decideHostTakeoverOrReconnectNewVersion() {
    if (Game.state.isHost) return;

    // Fase D: jogadores desconectados continuam na lista durante a
    // partida, mas não podem ser escolhidos como backup — se o backup
    // fosse um deles, ninguém assumiria a sala. Como todos os guests
    // filtram a mesma lista, todos chegam ao mesmo backup.
    const sorted = [...Game.state.players].filter(p => !p.disconnected).sort((a, b) => {
        if (a.isHost) return -1;
        if (b.isHost) return 1;
        return 0;
    });

    const me = sorted.find(p => p.name === Game.state.playerName);
    const myIndex = sorted.indexOf(me);
    const souOBackup = myIndex === 1 || (myIndex === 0 && !sorted[0]?.isHost);

    if (souOBackup) {
        console.log('👑 Assumindo como novo host!');
        becomeHost();
    } else {
        attemptReconnectToNewHost();
    }
}

// ============================================
// MIGRAÇÃO DE HOST DE VERDADE (versão incrementada)
// ============================================

/**
 * Tenta se conectar a uma nova versão do host (calculada deterministicamente).
 * Só é chamada depois que a reconexão ao host atual falhou de verdade.
 */
function attemptReconnectToNewHost(attempt = 1) {
    const state = Game.state;
    if (state.isHost) return;

    const MAX_ATTEMPTS = 5;
    const nextVersion = state.hostVersion + 1;
    const candidateId = Game.computeHostPeerId(state.baseRoomPeerId, nextVersion);

    console.log(`🔁 Tentativa ${attempt}/${MAX_ATTEMPTS}: procurando novo host em ${candidateId}...`);
    Game.ui.updateConnectionStatus('disconnected', Game.i18n.t('connection.procurandoNovoHost', { attempt, max: MAX_ATTEMPTS }));

    let settled = false;
    const cs = Game.network.connectionState;
    const conn = conectarSePossivel(candidateId);
    if (!conn) {
        console.warn('⚠️ Sem peer utilizável para procurar o novo host — tentativa contada como falha.');
        retryOrGiveUp(attempt, MAX_ATTEMPTS);
        return;
    }

    conn.on('open', () => {
        if (settled) return;
        settled = true;

        state.hostVersion = nextVersion;
        state.hostPeerId = candidateId;
        cs.setConnection(candidateId, conn);

        console.log('✅ Reconectado ao novo host:', candidateId);
        Game.ui.updateConnectionStatus('connected', Game.i18n.t('connection.reconectado'));

        Game.network.handleConnection(conn);
        Game.network.enviarPlayerJoin();
        Game.saveState();
    });

    conn.on('error', () => {
        if (settled) return;
        settled = true;
        retryOrGiveUp(attempt, MAX_ATTEMPTS);
    });

    setTimeout(() => {
        if (settled) return;
        settled = true;
        try { conn.close(); } catch (e) { /* ignora */ }
        retryOrGiveUp(attempt, MAX_ATTEMPTS);
    }, 4000);
}

function retryOrGiveUp(attempt, maxAttempts) {
    if (Game.state.isHost) return;

    if (attempt >= maxAttempts) {
        console.error('❌ Não foi possível localizar um novo host.');
        Game.ui.updateConnectionStatus('error', Game.i18n.t('connection.naoFoiPossivelReconectar'));
        return;
    }

    setTimeout(() => attemptReconnectToNewHost(attempt + 1), 2000);
}

/**
 * Torna-se o novo host (executado pelo backup).
 */
function becomeHost() {
    const state = Game.state;
    const cs = Game.network.connectionState;

    const newVersion = state.hostVersion + 1;
    const newHostId = Game.computeHostPeerId(state.baseRoomPeerId, newVersion);

    state.isHost = true;
    state.hostPeerId = newHostId;
    state.hostVersion = newVersion;

    const oldPeer = cs.getPeer();
    if (oldPeer && !oldPeer.destroyed) oldPeer.destroy();
    cs.resetConnections();

    const newPeer = new Peer(newHostId, { ...CONFIG.PEER });
    cs.setPeer(newPeer);

    newPeer.on('open', (id) => {
        state.peerId = id;

        // Fase D3b: o host antigo NÃO sai da lista — passa a ser um
        // jogador comum (isHost: false), com KPI, recursos, fase e o
        // tokenHash dele preservados. Com a partida em andamento ele fica
        // desconectado como os outros (abaixo) e, se voltar, entra pelo
        // player-join com o token, como qualquer jogador que caiu.
        state.players.forEach(p => {
            if (p.name !== state.playerName) p.isHost = false;
        });

        const me = Game.getPlayerByName(state.playerName);
        if (me) { me.isHost = true; me.peerId = id; }

        // Fase D: neste momento ninguém está conectado ao novo host —
        // cada guest ainda precisa achar a sala nova e reenviar o
        // player-join (ver attemptReconnectToNewHost()). Com a partida
        // em andamento (ou no fim de jogo), todos ficam marcados como
        // desconectados até voltarem: fora do sorteio e do rodízio, e
        // com a vaga reservada. Se não sobrar ninguém conectado para
        // formar dupla, pickNewPair() pausa e addPlayer() retoma quando
        // eles reconectarem. No lobby, quem cai sai da lista — aqui
        // também: quem voltar entra de novo como jogador novo.
        if (state.gameStarted) {
            state.players.forEach(p => {
                if (p.name !== state.playerName) p.disconnected = true;
            });
        } else {
            state.players = state.players.filter(p => p.name === state.playerName);
        }

        const proximoBackup = state.players.find(p => p.name !== state.playerName);
        state.backupPeerId = proximoBackup ? proximoBackup.peerId : '';

        Game.network.broadcastAll({ type: 'host-changed', newHostPeerId: id, hostVersion: newVersion, players: state.players });

        Game.ui.setupUI();

        if (state.gameStarted && !state.gameOver) {
            Game.ui.showScreen('game');
            Game.ui.updatePlayersOnlineList();
            Game.ui.updateRankingList();
            Game.ui.updateTimerDisplay();

            clearInterval(state.timerInterval);
            state.timerInterval = setInterval(() => {
                state.timer--;
                Game.ui.updateTimerDisplay();
                if (state.timer % 10 === 0) {
                    Game.network.broadcastAll({ type: 'timer-update', remaining: state.timer });
                }
                if (state.timer <= 0) {
                    clearInterval(state.timerInterval);
                    Game.core.endGame(Game.core.buildRanking());
                }
            }, 1000);

            // Fase D: só dá para continuar a rodada em andamento se este
            // jogador tem o gabarito — ou seja, se era o Perguntador (só
            // ele recebe a pergunta com `correct`; o Respondedor recebe
            // sem, e os espectadores nem recebem). Sem o gabarito, a
            // resposta (ou o timeout) quebraria em handleAnswer() e a
            // rodada ficaria travada para sempre — por exemplo quando o
            // Perguntador era o próprio host que saiu. Nesses casos a
            // rodada é descartada e uma dupla nova é sorteada com o
            // MESMO evento, sem reexibir o modal. Como os outros acabaram
            // de ser marcados como desconectados, normalmente a partida
            // pausa aqui e retoma quando eles reconectarem (o 'round-start'
            // da retomada também fecha a pergunta velha na tela deles).
            const round = state.currentRound;
            const podeContinuarRodada = !!round && !round.respondeu &&
                round.perguntador === state.playerName &&
                !!round.pergunta && round.pergunta.correct !== undefined;

            if (!round) {
                Game.core.pickNewPair();
            } else if (!podeContinuarRodada) {
                console.warn('⚠️ Novo host não tem como conduzir a rodada em andamento — sorteando nova dupla com o mesmo evento.');
                state.currentRound = null;
                if (round.evento) {
                    Game.core.pickNewPair(round.evento, 0, false);
                } else {
                    Game.core.pickNewPair(); // sem evento guardado: rodada nova, com modal
                }
            } else {
                Game.ui.displayRoundStart();
                if (state.currentRound.pergunta) {
                    Game.ui.displayQuestion(state.currentRound.pergunta);
                }
                Game.core.armarRespostaTimeout(state.currentRound.respondedor);
            }
        } else {
            Game.ui.showLobbyNormal();
            Game.ui.updatePlayersList();
            Game.ui.checkStartCondition();
        }

        document.getElementById('roomPeerId').textContent = id;
        document.getElementById('hostRoomIdSection').style.display = 'block';
        registrarPapelNaUrl(true);
        alert('👑 Você agora é o host!');
        Game.saveState();
    });

    newPeer.on('connection', (conn) => Game.network.handleConnection(conn));

    newPeer.on('error', (err) => {
        console.error('❌ Erro ao assumir como host:', err);
        Game.ui.updateConnectionStatus('error', Game.i18n.t('connection.falhaAssumirHost'));
    });
}

// ============================================
// HOST ANTIGO RECARREGANDO A PÁGINA (Fase D3b)
// ============================================

/**
 * Fase D3b: chamada por init() (main.js) quando o HOST recarrega a
 * página e restaura uma sessão salva, ANTES de abrir o ID de host.
 * Procura as versões seguintes do host (a sala que o backup abre ao
 * assumir — e, desde a D3c, também as de migrações posteriores) com um
 * peer temporário. Se alguma responder, a migração já aconteceu: este
 * jogador volta como jogador comum — isHost = false, versão encontrada
 * do host, URL com host=false — e entra na sala nova pelo player-join
 * com o token, como qualquer jogador que caiu. Sem isto, ele reabriria
 * o ID antigo e haveria dois hosts ao mesmo tempo.
 *
 * @returns {Promise<boolean>} true se virou jogador comum
 */
function retomarComoJogadorSeOutroAssumiu() {
    return new Promise((resolve) => {
        const state = Game.state;
        if (!state.isHost) { resolve(false); return; }

        const versaoSeguinte = state.hostVersion + 1;
        console.log('🔎 Verificando se outro jogador assumiu a sala (versões a partir de ' + versaoSeguinte + ')...');

        let resolvido = false;
        let sonda = null;
        let busca = null;
        const concluir = (achado) => {
            if (resolvido) return;
            resolvido = true;
            if (busca) busca.cancelar();
            if (sonda && !sonda.destroyed) {
                try { sonda.destroy(); } catch (e) { /* ignora */ }
            }
            if (achado) {
                voltarComoJogadorComum(achado.versao, achado.id);
            } else {
                console.log('👑 Ninguém assumiu a sala — seguindo como host.');
            }
            resolve(!!achado);
        };

        try {
            sonda = new Peer(undefined, { ...CONFIG.PEER });
        } catch (e) {
            concluir(null);
            return;
        }

        sonda.on('open', () => {
            if (resolvido) return;
            busca = Game.network.procurarHost(sonda, state.baseRoomPeerId, {
                versaoInicial: versaoSeguinte,
                aoAchar: (conn, versao, id) => {
                    try { conn.close(); } catch (e) { /* ignora */ }
                    concluir({ versao, id });
                },
                aoDesistir: () => concluir(null)
            });
        });

        // 'peer-unavailable' = ninguém com aquele ID: a busca descarta a
        // versão e segue com as outras. Qualquer outro erro deixa como
        // antes (segue como host).
        sonda.on('error', (err) => {
            if (err && err.type === 'peer-unavailable') {
                Game.network.avisarPeerIndisponivel(err);
                return;
            }
            concluir(null);
        });

        setTimeout(() => concluir(null), SONDA_HOST_MS);
    });
}

/**
 * Fase D3b: o host antigo passa a ser jogador comum da sala que o
 * backup abriu. A própria entrada na lista (restaurada do estado salvo)
 * deixa de ser host; a lista certa chega no state-sync do novo host.
 */
function voltarComoJogadorComum(versaoSeguinte, idSeguinte) {
    const state = Game.state;
    console.warn('🔄 Outro jogador assumiu a sala enquanto você estava fora — voltando como jogador comum.');

    state.isHost = false;
    state.hostVersion = versaoSeguinte;
    state.hostPeerId = idSeguinte;

    const me = Game.getPlayerByName(state.playerName);
    if (me) me.isHost = false;

    registrarPapelNaUrl(false);
    Game.saveState();
}

/**
 * Reconecta a um novo host (usado após receber host-changed).
 */
function reconnectToNewHost(newHostPeerId) {
    const cs = Game.network.connectionState;
    Game.state.hostPeerId = newHostPeerId;
    Object.values(cs.getConnections()).forEach(c => c.close());
    cs.resetConnections();
    const conn = cs.getPeer().connect(newHostPeerId, { reliable: true });
    Game.network.handleConnection(conn);
}

// ============================================
// EXPORTAÇÃO
// ============================================
window.Game = window.Game || {};
window.Game.network = window.Game.network || {};
Object.assign(window.Game.network, {
    handleHostDisconnect,
    attemptReconnectToSameHost,
    attemptReconnectToNewHost,
    retryOrGiveUp,
    becomeHost,
    reconnectToNewHost,
    registrarPapelNaUrl,
    retomarComoJogadorSeOutroAssumiu
});