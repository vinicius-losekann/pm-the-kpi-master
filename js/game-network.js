// ============================================
// PM: The KPI Master - REDE (PeerJS)
// ============================================
// Responsabilidades:
//   - Inicializar e gerenciar conexão PeerJS
//   - Enviar/receber mensagens entre jogadores
//   - Broadcast, unicast, reconexão
//   - Host migration (queda involuntária)
//   - Atualização de UI para guests (eventos, vendas)
//
// Dependências:
//   - PeerJS (CDN carregado no HTML)
//   - Game.state (game-state.js)
//   - Game (game-core.js) para handleAnswer, etc
//   - Game (game-ui.js) para atualizar UI
//
// Namespace: Game.network
// ============================================

let myPeer = null;           // Instância PeerJS
let connections = {};        // peerId -> DataConnection

// ============================================
// INICIALIZAÇÃO PEERJS
// ============================================

async function initPeer() {
    return new Promise((resolve, reject) => {
        const state = Game.state;
        const peerId = state.isHost ? state.hostPeerId : undefined;

        // Se uma tentativa anterior falhou (ex: retry após F5 do host),
        // garante que não sobrou um Peer "zumbi" consumindo o ID antigo.
        if (myPeer && !myPeer.destroyed) {
            try { myPeer.destroy(); } catch (e) { /* ignora */ }
        }

        myPeer = new Peer(peerId, { debug: 0 });

        // BUGFIX: antes, este handler de erro (myPeer.on('error', ...))
        // ficava registrado PERMANENTEMENTE na instância de Peer, não só
        // durante esta inicialização. Qualquer erro de PeerJS ocorrido
        // DEPOIS da inicialização bem-sucedida — por exemplo um
        // 'peer-unavailable' ao tentar myPeer.connect() para um host que
        // não existe mais dentro de attemptReconnectToNewHost() — também
        // disparava este mesmo handler, chamando myPeer.destroy() no meio
        // de uma tentativa de reconexão e derrubando o peer do próprio
        // jogador sem necessidade, quebrando o fluxo de retry.
        //
        // Agora o listener genérico só fica ativo enquanto esta Promise de
        // inicialização não foi resolvida; depois disso, cada chamador
        // (attemptReconnectToNewHost, becomeHost, etc.) trata seus próprios
        // erros de conexão localmente, sem destruir o Peer inteiro.
        let initSettled = false;

        const onInitError = (err) => {
            if (initSettled) return; // erro ocorrido após init: não é mais responsabilidade deste handler
            initSettled = true;
            console.error('❌ PeerJS Error (inicialização):', err);
            Game.ui.updateConnectionStatus('error', 'Erro de conexão');
            try { myPeer.destroy(); } catch (e) { /* ignora */ }
            reject(err);
        };

        myPeer.on('open', (id) => {
            initSettled = true;
            state.peerId = id;
            if (state.isHost) {
                state.hostPeerId = id;
                document.getElementById('roomPeerId').textContent = id;
            }
            console.log('🔗 Peer aberto:', id);
            Game.ui.updateConnectionStatus('connected', 'Conectado');

            if (!state.isHost) {
                connectToHost();
            }
            resolve();
        });

        myPeer.on('connection', (conn) => handleConnection(conn));

        myPeer.on('error', onInitError);

        // Handler permanente de erros pós-inicialização: apenas loga e
        // atualiza status na UI, sem destruir o Peer — cada fluxo que
        // depende de myPeer.connect() (reconexão, migração de host) já
        // trata seus próprios timeouts/erros de conexão individualmente.
        myPeer.on('error', (err) => {
            if (!initSettled) return; // já tratado por onInitError acima
            console.warn('⚠️ PeerJS Error (pós-inicialização):', err?.type || err);
        });

        myPeer.on('disconnected', () => {
            Game.ui.updateConnectionStatus('disconnected', 'Desconectado');
            setTimeout(() => {
                if (myPeer && !myPeer.destroyed) myPeer.reconnect();
            }, 3000);
        });
    });
}

// ============================================
// CONEXÕES
// ============================================

/**
 * BUGFIX: connectToHost() tentava se conectar sempre ao hostPeerId
 * "conhecido" (normalmente o ID base da sala, vindo da URL de convite).
 * Se já tivesse ocorrido uma migração de host ANTES deste jogador entrar
 * (host original caiu, backup assumiu como base-h1), esse peerId base não
 * existia mais — um jogador entrando pela primeira vez nesse momento
 * tentava conectar a um peer morto e ficava pendurado indefinidamente,
 * sem nenhum fallback (o cálculo de versões seguintes só era usado por
 * quem JÁ estava conectado e detectou a queda via attemptReconnectToNewHost).
 *
 * Agora, se a conexão ao hostPeerId conhecido não abrir dentro de um
 * tempo razoável, tentamos as próximas versões calculadas a partir de
 * baseRoomPeerId, do mesmo jeito que attemptReconnectToNewHost já faz
 * para reconexões.
 */
function connectToHost(attempt = 0, maxAttempts = 10) {
    const state = Game.state;
    if (state.isHost) return;

    const targetId = attempt === 0
        ? state.hostPeerId
        : Game.computeHostPeerId(state.baseRoomPeerId, state.hostVersion + attempt);

    console.log(`🔌 Conectando ao host (tentativa ${attempt + 1}/${maxAttempts}): ${targetId}`);

    let settled = false;
    const conn = myPeer.connect(targetId, { reliable: true });

    conn.on('open', () => {
        if (settled) return;
        settled = true;
        console.log('✅ Conexão estabelecida com o host!');

        if (attempt > 0) {
            state.hostVersion = state.hostVersion + attempt;
            state.hostPeerId = targetId;
        }

        handleConnection(conn);
    });

    conn.on('error', () => {
        if (settled) return;
        settled = true;
        if (attempt < maxAttempts) {
            console.log(`⏳ Erro na tentativa ${attempt+1}, nova tentativa em 3s...`);
            setTimeout(() => connectToHost(attempt + 1, maxAttempts), 3000);
        } else {
            console.error('❌ Não foi possível conectar a nenhuma versão conhecida do host.');
            Game.ui.updateConnectionStatus('error', 'Não foi possível conectar à sala. Verifique o link e tente novamente.');
        }
    });

    // Timeout de segurança aumentado para 20 segundos
    setTimeout(() => {
        if (settled) return;
        settled = true;
        try { conn.close(); } catch (e) { /* ignora */ }
        if (attempt < maxAttempts) {
            console.log(`⏳ Timeout na tentativa ${attempt+1}, nova tentativa em 3s...`);
            setTimeout(() => connectToHost(attempt + 1, maxAttempts), 3000);
        } else {
            console.error('❌ Não foi possível conectar a nenhuma versão conhecida do host (timeout).');
            Game.ui.updateConnectionStatus('error', 'Não foi possível conectar à sala. Verifique o link e tente novamente.');
        }
    }, 20000); // 20 segundos
}


function handleConnection(conn) {
    const state = Game.state;

    conn.on('open', () => {
        connections[conn.peer] = conn;
        console.log('🔗 Conectado a:', conn.peer);

        if (!state.isHost) {
            sendToHost({
                type: 'player-join',
                playerName: state.playerName,
                peerId: state.peerId
            });
        }
    });

    conn.on('data', (data) => {
        Game.network.handleMessage(data, conn.peer);
    });

    conn.on('close', () => {
        console.warn('⚠️ Conexão fechada:', conn.peer);
        delete connections[conn.peer];

        if (!state.isHost && conn.peer === state.hostPeerId) {
            Game.network.handleHostDisconnect();
        }

        if (state.isHost) {
            Game.network.handleGuestDisconnected(conn.peer);
        }
    });

    conn.on('error', (err) => {
        console.error('❌ Erro na conexão:', err);
    });
}

// ============================================
// ENVIO DE MENSAGENS
// ============================================

function sendToHost(data) {
    const conn = connections[Game.state.hostPeerId];
    if (conn && conn.open) conn.send(data);
}

function broadcast(data, exclude = []) {
    for (const [peerId, conn] of Object.entries(connections)) {
        if (!exclude.includes(peerId) && conn.open) {
            conn.send(data);
        }
    }
}

function broadcastAll(data) {
    broadcast(data, []);
}

function sendToPlayer(peerId, data) {
    const state = Game.state;
    if (peerId === state.peerId && state.isHost) {
        Game.network.handleMessage(data, state.peerId);
        return;
    }
    const conn = connections[peerId];
    if (conn && conn.open) conn.send(data);
}

// ============================================
// RECEBIMENTO DE MENSAGENS
// ============================================

function handleMessage(msg, fromPeerId) {
    console.log('📨 Mensagem recebida:', msg.type);
    const state = Game.state;

    switch (msg.type) {

        // --- LOBBY ---
        case 'player-join':
            if (state.isHost) addPlayer(msg, fromPeerId);
            break;

        case 'join-rejected': {
            Game.network.cleanup();
            const motivo = msg.reason === 'room-full'
                ? '⚠️ Sala cheia (máximo de ' + CONFIG.JOGO.MAX_PLAYERS + ' jogadores).'
                : '⚠️ Esse nome já está em uso nesta sala. Escolha outro nome e entre novamente.';
            alert(motivo);
            window.location.href = 'index.html';
            break;
        }

        case 'player-list':
            state.players = msg.players;
            Game.ui.updatePlayersList();
            break;

        case 'state-sync':
            restoreState(msg.fullState);
            break;

        // --- SESSÃO ---
        case 'session-ended':
            Game.ui.closeAllModals();
            alert('⛔ O host encerrou a sessão.');
            Game.network.cleanup();
            window.location.href = 'index.html';
            break;

        case 'host-changed':
            state.hostPeerId = msg.newHostPeerId;
            if (msg.hostVersion !== undefined) state.hostVersion = msg.hostVersion;
            if (msg.players) state.players = msg.players;
            if (msg.respostasCount) state.respostasCount = msg.respostasCount;
            if (!state.isHost) reconnectToNewHost(msg.newHostPeerId);
            // Retoma a visualização correta caso a partida já esteja em andamento
            if (state.gameStarted && !state.gameOver) {
                Game.ui.showScreen('game');
                Game.ui.updatePlayersOnlineList();
                Game.ui.updateRankingList();
                Game.ui.updateTimerDisplay();
                if (state.currentRound) {
                    const isParticipant =
                        state.playerName === state.currentRound.perguntador ||
                        state.playerName === state.currentRound.respondedor;
                    if (isParticipant) {
                        Game.ui.displayRoundStart();
                        if (state.currentRound.pergunta) {
                            Game.ui.displayQuestion(state.currentRound.pergunta);
                        }
                    } else {
                        Game.ui.displaySpectatorView(state.currentRound.perguntador, state.currentRound.respondedor);
                    }
                }
            }
            Game.saveState();
            break;

        // --- PARTIDA ---
        case 'game-start':
            state.timer = msg.timer;
            Game.core.startGame();
            break;

        case 'leave-match-request':
            if (state.isHost) Game.core.handleLeaveMatchRequest(msg, fromPeerId);
            break;

        case 'match-ended':
            Game.core.handleMatchEnded(msg);
            break;

        case 'game-over':
            Game.core.endGame(msg.ranking);
            break;

        // --- RODADA ---
        case 'round-start':
            state.currentRound = {
                evento: msg.evento,
                perguntador: msg.perguntador,
                respondedor: msg.respondedor,
                pergunta: null,
                respondeu: false
            };
            // Mantém a cópia local sincronizada com o host a cada rodada —
            // é o que garante que, numa migração de host (becomeHost),
            // quem assumir já tenha a contagem correta do rodízio.
            if (msg.respostasCount) state.respostasCount = msg.respostasCount;
            // Só quem participa da rodada vê a tela de pergunta;
            // os demais (espectadores) veem a tela de espera.
            if (state.playerName === msg.perguntador || state.playerName === msg.respondedor) {
                Game.ui.displayRoundStart();
            } else {
                Game.ui.displaySpectatorView(msg.perguntador, msg.respondedor);
            }
            break;

        case 'question':
            // Quando o HOST é o Respondedor, sendToPlayer() despacha a
            // mensagem para ele mesmo (mesmo processo/objeto de estado).
            // Sem esta checagem, `state.currentRound.pergunta` — a cópia
            // AUTORITATIVA usada por handleAnswer() para conferir a
            // resposta — era sobrescrita pela versão "stripped" (correta:
            // undefined) enviada ao Respondedor, fazendo o host errar toda
            // pergunta em que ele mesmo era o Respondedor.
            if (!state.isHost) {
                state.currentRound.pergunta = msg;
            }
            state.currentRound.respondeu = false;
            Game.ui.displayQuestion(msg);
            break;

        case 'answer':
            if (
                state.isHost &&
                state.currentRound &&
                !state.currentRound.respondeu &&
                msg.playerName === state.currentRound.respondedor
            ) {
                Game.core.handleAnswer(msg, fromPeerId);
            }
            break;

        case 'kpi-update':
            // Sincroniza currentRound.respondeu em TODOS os clientes quando
            // a mensagem é o resultado da resposta do Respondedor da rodada
            // atual (não um bônus de Assessoria para outro jogador, que
            // também usa 'kpi-update' mas sem `acertou`/`semRecursos`). Sem
            // isso, só o HOST sabia localmente que a rodada já tinha sido
            // julgada — se ele caísse entre broadcastar este kpi-update e
            // efetivamente avançar a partida (nextTurn/pickNewPair,
            // atrasado por setTimeout), o próximo host (becomeHost)
            // "resumia" a rodada antiga como se ainda estivesse em aberto,
            // podendo reprocessar a mesma resposta.
            if (
                state.currentRound &&
                msg.playerName === state.currentRound.respondedor &&
                (msg.acertou !== undefined || msg.semRecursos)
            ) {
                state.currentRound.respondeu = true;
            }
            Game.core.updatePlayerKPI(msg);
            break;

        case 'timer-update':
            state.timer = msg.remaining;
            Game.ui.updateTimerDisplay();
            break;

        // --- EVENTO ---
        case 'show-evento': {
            if (msg.players) {
                state.players = msg.players;
            }

            Game.ui.showEventoModal(msg.evento);
            Game.ui.updatePlayersOnlineList();
            Game.ui.updateRankingList();

            const me = Game.getPlayerByName(state.playerName);
            if (me) {
                document.getElementById('myRecursos').textContent = me.recursos;
                document.getElementById('myKPI').textContent = me.kpi;
            }
            break;
        }

        case 'assessoria-request':
            if (state.isHost) Game.core.handleAssessoriaRequest(msg, fromPeerId);
            break;

        case 'assessoria-started':
            Game.ui.showAssessoriaStarted(msg);
            break;

        case 'assessoria-question':
            Game.ui.showAssessoriaQuestionModal(msg);
            break;

        case 'assessoria-answer':
            if (state.isHost) Game.core.handleAssessoriaAnswer(msg, fromPeerId);
            break;

        case 'assessoria-result':
            Game.ui.showAssessoriaResult(msg);
            break;

        // --- VENDA ---
        case 'venda-offer-request':
            if (state.isHost) {
                Game.core.handleVendaOfertaRequest(msg, fromPeerId);
            }
            break;

        case 'venda-offer':
            Game.ui.showVendaOfertaModal(msg);
            break;

        case 'venda-offer-response':
            if (state.isHost) {
                Game.core.handleVendaOfertaResponse(msg, fromPeerId);
            }
            break;

        case 'venda-oferta-sync':
            state.pendingVendaOfertas = state.pendingVendaOfertas || {};
            if (msg.action === 'add') {
                state.pendingVendaOfertas[msg.vendedorName] = msg.compradorName;
            } else {
                delete state.pendingVendaOfertas[msg.vendedorName];
            }
            break;

        case 'venda-rejected':
            alert('⚠️ ' + msg.motivo);
            Game.ui.fecharVendaModal();
            break;

        case 'venda-confirmed': {
            const vendedor = Game.getPlayerByName(msg.vendedor);
            const comprador = Game.getPlayerByName(msg.comprador);
            if (vendedor) {
                vendedor.kpi = msg.vendedorKPI;
                vendedor.recursos = msg.vendedorRecursos;
            }
            if (comprador) {
                comprador.kpi = msg.compradorKPI;
                comprador.recursos = msg.compradorRecursos;
            }
            Game.ui.updatePlayersOnlineList();
            Game.ui.updateRankingList();

            const me2 = Game.getPlayerByName(state.playerName);
            if (me2) {
                document.getElementById('myRecursos').textContent = me2.recursos;
                document.getElementById('myKPI').textContent = me2.kpi;
            }
            // Agora que confirmarVenda() em game-ui.js não fecha mais o
            // modal de forma otimista, é aqui — na confirmação real vinda
            // do host — que o fechamento deve acontecer de fato.
            if (state.playerName === msg.vendedor) {
                Game.ui.fecharVendaModal();
            }
            console.log('💰 Venda confirmada:', msg.vendedor, '→', msg.comprador);
            break;
        }
    }
}

// ============================================
// GERENCIAR JOGADORES (HOST)
// ============================================

function addPlayer(msg, fromPeerId) {
    const state = Game.state;

    if (state.players.length >= CONFIG.JOGO.MAX_PLAYERS) {
        const c = connections[fromPeerId];
        if (c && c.open) {
            c.send({ type: 'join-rejected', reason: 'room-full' });
        }
        setTimeout(() => { if (c) c.close(); }, 300);
        return;
    }

    // Impede que dois jogadores diferentes assumam o mesmo nome.
    // Só tratamos como reconexão quando o peerId antigo NÃO está mais
    // conectado (ou seja, é de fato uma queda/retomada do mesmo jogador).
    const existingIdx = state.players.findIndex(p => p.name === msg.playerName);
    if (existingIdx >= 0) {
        const existingPlayer = state.players[existingIdx];

        // O HOST nunca "reconecta" via player-join — seu registro é criado
        // localmente em setupUI() e ele não mantém uma entrada em
        // `connections` para si mesmo (fala consigo por chamada direta,
        // não por DataConnection — ver sendToPlayer). Isso fazia `oldConn`
        // abaixo ser SEMPRE undefined para o host, então `oldPeerStillConnected`
        // era sempre false e qualquer guest podia enviar player-join com o
        // nome do host para sequestrar o peerId do registro do host,
        // quebrando a premissa de que o host é a fonte da verdade da partida.
        if (existingPlayer.isHost) {
            console.warn('⚠️ player-join rejeitado: tentativa de usar o nome do host.');
            const c = connections[fromPeerId];
            if (c && c.open) {
                c.send({ type: 'join-rejected', reason: 'name-taken' });
            }
            setTimeout(() => { if (c) c.close(); }, 300);
            return;
        }

        const oldConn = connections[existingPlayer.peerId];
        const oldPeerStillConnected = oldConn && oldConn.open && existingPlayer.peerId !== fromPeerId;

        if (oldPeerStillConnected) {
            const c = connections[fromPeerId];
            if (c && c.open) {
                c.send({ type: 'join-rejected', reason: 'name-taken' });
            }
            setTimeout(() => { if (c) c.close(); }, 300);
            return;
        }

        state.players[existingIdx].peerId = fromPeerId;

        // Reconectou dentro do período de graça (ver handleGuestDisconnected):
        // limpa a marca de desconectado e cancela o timeout que o removeria,
        // preservando KPI/fase/atividades/recursos que ele já tinha.
        if (state.players[existingIdx].disconnected) {
            state.players[existingIdx].disconnected = false;
        }
        if (state.disconnectTimeouts && state.disconnectTimeouts[msg.playerName]) {
            clearTimeout(state.disconnectTimeouts[msg.playerName]);
            delete state.disconnectTimeouts[msg.playerName];
        }

        console.log('🔄 Reconectado:', msg.playerName);
    } else {
        state.players.push({
            name: msg.playerName,
            peerId: fromPeerId,
            kpi: 0,
            phase: CONFIG.FASES[0].id,
            activities: 0,
            isHost: false,
            waitingInLobby: false,
            recursos: CONFIG.RECURSOS_INICIAIS
        });

        if (state.players.length === 2 && !state.backupPeerId) {
            state.backupPeerId = fromPeerId;
        }
    }

    broadcastAll({ type: 'player-list', players: state.players });
    Game.ui.updatePlayersList();
    Game.ui.checkStartCondition();

    const conn = connections[fromPeerId];
    if (conn && conn.open) {
        // Nunca reenvie o gabarito (`correta`) para quem não é o
        // Perguntador da rodada atual. Antes, `state.currentRound` era
        // enviado sem qualquer filtro em todo state-sync (entrada/
        // reconexão), vazando a resposta correta para o Respondedor (ou
        // espectadores) que reconectasse no meio de uma rodada —
        // contrariando a regra já aplicada no envio normal da pergunta em
        // pickNewPair().
        let currentRoundForSync = state.currentRound;
        if (currentRoundForSync && currentRoundForSync.pergunta) {
            const isPerguntadorDaRodada = msg.playerName === currentRoundForSync.perguntador;
            if (!isPerguntadorDaRodada) {
                currentRoundForSync = {
                    ...currentRoundForSync,
                    pergunta: { ...currentRoundForSync.pergunta, correta: undefined }
                };
            }
        }

        conn.send({
            type: 'state-sync',
            fullState: {
                players: state.players,
                baralhos: state.baralhos,
                timer: state.timer,
                currentRound: currentRoundForSync,
                gameStarted: state.gameStarted,
                // BUGFIX: gameOver e pendingVendaOfertas nunca eram enviados
                // aqui. Sem gameOver, um jogador que entra/reconecta durante
                // a tela de ranking final (gameStarted ainda true, gameOver
                // true, antes do host clicar "Encerrar Partida") era jogado
                // de volta para a tela de jogo em andamento. Sem
                // pendingVendaOfertas, um jogador que entra depois que uma
                // oferta de venda já existe nunca fica sabendo dela — e, se
                // mais tarde assumir como host, a oferta "desaparece" para
                // sempre (comprador nunca é notificado, vendedor fica
                // esperando indefinidamente).
                gameOver: state.gameOver,
                pendingVendaOfertas: state.pendingVendaOfertas,
                hostVersion: state.hostVersion,
                respostasCount: state.respostasCount
            }
        });
    }

    Game.saveState();
}

/**
 * HOST: chamado quando a conexão de um guest fecha (queda de rede, aba
 * fechada, F5). Marca o jogador como `disconnected` e concede um período
 * de graça para ele reconectar, em vez de removê-lo imediatamente de
 * `state.players`.
 *
 * BUGFIX (perda de progresso ao reconectar): antes, esta função removia o
 * jogador de `state.players` na hora. Como o guest recebe um peerId NOVO
 * do PeerJS a cada reconexão (não reaproveita o antigo), addPlayer() não
 * encontrava mais nenhum registro com o mesmo nome ao processar o
 * 'player-join' de reconexão e criava um jogador do zero (KPI, fase,
 * atividades e recursos todos resetados) — e o 'player-list' resultante,
 * ao ser propagado, sobrescrevia até o estado que o próprio jogador tinha
 * acabado de restaurar do localStorage (ver tryRestoreState em
 * game-main.js). Agora o registro é preservado durante o período de
 * graça; só é removido de fato se o jogador não reconectar a tempo (ver
 * purgePlayer, abaixo).
 */
function handleGuestDisconnected(peerId) {
    const state = Game.state;

    const player = state.players.find(p => p.peerId === peerId);
    if (!player) return; // já removido/desconhecido — nada a fazer

    console.warn('⚠️ ' + player.name + ' desconectou — aguardando reconexão antes de removê-lo.');
    player.disconnected = true;

    broadcastAll({ type: 'player-list', players: state.players });
    Game.ui.updatePlayersList();
    Game.ui.updatePlayersOnlineList();
    Game.ui.updateRankingList();
    Game.ui.checkStartCondition();

    // Uma desconexão involuntária do Perguntador ou Respondedor da rodada
    // em curso travava a partida indefinidamente — nada mais avançava o
    // jogo até o timer da sessão zerar. Aplica aqui o mesmo tratamento já
    // usado para saída voluntária (handleLeaveMatchRequest em
    // game-core.js). Diferente da remoção em si, isso NÃO espera o
    // período de graça: não faz sentido travar a rodada de todo mundo só
    // porque um participante pode ou não voltar nos próximos segundos.
    if (state.gameStarted && !state.gameOver) {
        Game.core.abortRoundIfParticipant(player.name);
    }

    armarDisconnectTimeout(player.name, peerId);
    Game.saveState();
}

/**
 * HOST: arma (ou rearma) o período de graça de reconexão de um jogador
 * desconectado. Se `msg 'player-join'` chegar com o mesmo nome antes do
 * timeout disparar, addPlayer() cancela este timeout e limpa
 * `disconnected` — o jogador nunca chega a ser removido. Exportada para
 * reuso em becomeHost() (herda jogadores já desconectados do host
 * anterior) e em game-main.js (host que recarrega a própria página
 * enquanto alguém está no período de graça precisa rearmar do zero, já
 * que o timeout antigo, em memória, morre junto com o reload).
 */
function armarDisconnectTimeout(playerName, peerId) {
    const state = Game.state;
    state.disconnectTimeouts = state.disconnectTimeouts || {};

    if (state.disconnectTimeouts[playerName]) {
        clearTimeout(state.disconnectTimeouts[playerName]);
    }

    const graceMs = (CONFIG.JOGO && CONFIG.JOGO.RECONNECT_GRACE_TIMEOUT) || 30000;

    state.disconnectTimeouts[playerName] = setTimeout(() => {
        delete state.disconnectTimeouts[playerName];

        // Só remove de fato se ainda estiver marcado como desconectado —
        // se ele reconectou, addPlayer() já cancelou este timeout, mas a
        // checagem extra é uma segunda linha de defesa contra qualquer
        // condição de corrida.
        const player = state.players.find(p => p.name === playerName);
        if (!player || !player.disconnected) return;

        purgePlayer(playerName, peerId);
    }, graceMs);
}

/**
 * HOST: remove definitivamente um jogador que não reconectou dentro do
 * período de graça. Equivalente ao antigo removePlayerByPeerId(), mas
 * disparado só depois da espera, não na hora da queda de conexão.
 */
function purgePlayer(playerName, peerIdAtDisconnect) {
    const state = Game.state;

    const removedPlayer = state.players.find(p => p.name === playerName);
    state.players = state.players.filter(p => p.name !== playerName);

    if (state.backupPeerId === peerIdAtDisconnect && state.players.length > 1) {
        state.backupPeerId = state.players[1]?.peerId;
    }

    console.warn('🗑️ ' + playerName + ' não reconectou a tempo — removido da sala.');

    broadcastAll({ type: 'player-list', players: state.players });
    Game.ui.updatePlayersList();
    Game.ui.updatePlayersOnlineList();
    Game.ui.updateRankingList();
    Game.ui.checkStartCondition();

    // Cobre o caso raro de o jogador ter voltado a ser participante de uma
    // NOVA rodada sorteada depois da desconexão original (não deveria
    // acontecer, já que getActivePlayers() o exclui enquanto
    // `disconnected` for true, mas fica como segunda linha de defesa).
    if (removedPlayer && state.gameStarted && !state.gameOver) {
        Game.core.abortRoundIfParticipant(removedPlayer.name);
    }

    Game.saveState();
}

// ============================================
// RECONEXÃO E HOST MIGRATION
// ============================================

function restoreState(fullState) {
    const state = Game.state;
    state.players = fullState.players;
    state.baralhos = fullState.baralhos;
    state.timer = fullState.timer;
    state.currentRound = fullState.currentRound;
    state.gameStarted = fullState.gameStarted;
    // BUGFIX: gameOver e pendingVendaOfertas agora fazem parte do
    // fullState (ver addPlayer) e precisam ser restaurados aqui também.
    state.gameOver = !!fullState.gameOver;
    state.pendingVendaOfertas = fullState.pendingVendaOfertas || {};
    if (fullState.hostVersion !== undefined) state.hostVersion = fullState.hostVersion;
    // Sem isso, um jogador que entra/reconecta fica com respostasCount
    // vazio; se ele mais tarde virar host, o rodízio reiniciava do zero
    // para todo mundo a partir dali.
    state.respostasCount = fullState.respostasCount || {};

    if (state.gameOver) {
        // BUGFIX: sem esta checagem, um jogador que entra/reconecta depois
        // que a partida já terminou (mas antes do host clicar "Encerrar
        // Partida") caía no branch de "partida em andamento" abaixo, pois
        // state.gameStarted continua true até o host encerrar de fato.
        Game.ui.showScreen('gameover');
        Game.ui.displayFinalRanking(Game.core.buildRanking());
    } else if (state.gameStarted) {
        // Garante que a tela correta seja exibida após reconexão/reload,
        // e não deixa o jogador preso visualmente no lobby.
        Game.ui.showScreen('game');
        Game.ui.updateTimerDisplay();
        Game.ui.updatePlayersOnlineList();
        Game.ui.updateRankingList();

        const me = Game.getPlayerByName(state.playerName);
        if (me) {
            document.getElementById('myKPI').textContent = me.kpi;
            document.getElementById('myRecursos').textContent = me.recursos;
            const fase = Game.getFaseById(me.phase);
            document.getElementById('myPhaseName').textContent = fase.nome;
            document.getElementById('myPhaseIcon').textContent = fase.emoji;
            document.getElementById('myActivity').textContent = me.activities;
            document.getElementById('myProgressFill').style.width =
                (me.activities / CONFIG.JOGO.ACTIVITIES_PER_PHASE * 100) + '%';
        }

        if (state.currentRound) {
            const isParticipant =
                state.playerName === state.currentRound.perguntador ||
                state.playerName === state.currentRound.respondedor;

            if (isParticipant) {
                Game.ui.displayRoundStart();
                if (state.currentRound.pergunta) {
                    Game.ui.displayQuestion(state.currentRound.pergunta);
                }
            } else {
                Game.ui.displaySpectatorView(state.currentRound.perguntador, state.currentRound.respondedor);
            }
        }
    } else {
        Game.ui.showScreen('lobby');
        Game.ui.showLobbyNormal();
    }

    Game.ui.updatePlayersList();
    Game.ui.updateTimerDisplay();
    Game.saveState();
}

/**
 * BUGFIX: souOBackup era calculado reordenando state.players (host
 * primeiro) e olhando o índice resultante — um segundo mecanismo paralelo
 * a state.backupPeerId (já mantido à parte, atualizado em addPlayer,
 * handleGuestDisconnected/purgePlayer e becomeHost). Os dois podiam divergir (ex.: a
 * ordem de state.players nem sempre reflete quem foi designado como
 * backup), e depender de reordenação implícita é frágil e difícil de
 * auditar. Agora usamos diretamente state.backupPeerId como fonte única
 * da verdade sobre quem deve assumir como host.
 */
function souOBackup() {
    const state = Game.state;
    const me = Game.getPlayerByName(state.playerName);
    if (!me) return false;

    if (state.backupPeerId) {
        return me.peerId === state.backupPeerId;
    }

    // Fallback caso backupPeerId nunca tenha sido definido (ex.: sala com
    // apenas 1 outro jogador que nunca chegou a ser marcado): o próximo
    // jogador ativo que não seja o host vira o candidato.
    const candidato = Game.getActivePlayers().find(p => !p.isHost);
    return !!candidato && candidato.name === state.playerName;
}

function handleHostDisconnect() {
    console.warn('⚠️ Host desconectado! Aguardando...');
    Game.ui.updateConnectionStatus('error', 'Host desconectado — tentando reconectar...');

    setTimeout(() => {
        if (Game.state.isHost) return;

        if (souOBackup()) {
            console.log('👑 Assumindo como novo host!');
            becomeHost();
        } else {
            // Não sou o backup. Em vez de só esperar por uma mensagem
            // 'host-changed' que pode nunca chegar (o backup zera as
            // próprias conexões no exato momento em que faz o broadcast),
            // calculo sozinho o próximo peerId de host possível e tento
            // me conectar diretamente a ele.
            attemptReconnectToNewHost();
        }
    }, CONFIG.JOGO.HOST_TIMEOUT);
}

/**
 * Tenta se conectar diretamente ao peerId do próximo host, calculado
 * deterministicamente a partir de baseRoomPeerId + hostVersion+1.
 * Repete algumas vezes com backoff, já que o backup pode levar alguns
 * instantes para terminar de subir o próprio Peer.
 */
function attemptReconnectToNewHost(attempt = 1) {
    const state = Game.state;
    if (state.isHost) return;

    const MAX_ATTEMPTS = 5;
    const nextVersion = state.hostVersion + 1;
    const candidateId = Game.computeHostPeerId(state.baseRoomPeerId, nextVersion);

    console.log(`🔁 Tentativa ${attempt}/${MAX_ATTEMPTS}: procurando novo host em ${candidateId}...`);
    Game.ui.updateConnectionStatus('disconnected', `Procurando novo host (${attempt}/${MAX_ATTEMPTS})...`);

    let settled = false;
    const conn = myPeer.connect(candidateId, { reliable: true });

    conn.on('open', () => {
        if (settled) return;
        settled = true;

        state.hostVersion = nextVersion;
        state.hostPeerId = candidateId;
        connections[candidateId] = conn;

        console.log('✅ Reconectado ao novo host:', candidateId);
        Game.ui.updateConnectionStatus('connected', 'Reconectado');

        // handleConnection registra os handlers de data/close/error, mas seu
        // handler de 'open' não dispara mais (o evento já ocorreu), então
        // reenviamos o player-join manualmente aqui.
        handleConnection(conn);
        sendToHost({ type: 'player-join', playerName: state.playerName, peerId: state.peerId });
        Game.saveState();
    });

    conn.on('error', () => {
        if (settled) return;
        settled = true;
        retryOrGiveUp(attempt, MAX_ATTEMPTS);
    });

    // PeerJS às vezes não dispara 'error' para um peerId inexistente
    // dentro de um tempo razoável — força um timeout de segurança.
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
        Game.ui.updateConnectionStatus('error', 'Não foi possível reconectar. Recarregue a página.');
        return;
    }

    setTimeout(() => attemptReconnectToNewHost(attempt + 1), 2000);
}

function becomeHost() {
    const state = Game.state;

    // ID determinístico: calculado a partir do peerId BASE da sala, não do
    // hostPeerId atual (que já pode ter sido migrado antes). Isso permite
    // que qualquer jogador, mesmo sem receber o broadcast abaixo, calcule
    // o mesmo ID e tente se conectar diretamente (ver attemptReconnectToNewHost).
    const newVersion = state.hostVersion + 1;
    const newHostId = Game.computeHostPeerId(state.baseRoomPeerId, newVersion);

    state.isHost = true;
    state.hostPeerId = newHostId;
    state.hostVersion = newVersion;

    if (myPeer && !myPeer.destroyed) myPeer.destroy();
    connections = {};

    myPeer = new Peer(newHostId, { debug: 0 });

    myPeer.on('open', (id) => {
        state.peerId = id;

        // Remove tanto uma possível entrada duplicada de mim mesmo quanto,
        // principalmente, o registro do host ANTIGO (que caiu e nunca sai
        // sozinho da lista) — sem isso a sala fica com dois "HOST" e o
        // ranking/contagem de jogadores ativos ficam errados para sempre.
        state.players = state.players.filter(p =>
            p.name === state.playerName || !p.isHost
        );

        const me = Game.getPlayerByName(state.playerName);
        if (me) { me.isHost = true; me.peerId = id; }

        const proximoBackup = state.players.find(p => p.name !== state.playerName);
        state.backupPeerId = proximoBackup ? proximoBackup.peerId : '';

        // Os demais jogadores ainda estão conectados ao antigo peerId do host
        // (a conexão deles caiu junto com o peer antigo). Cada guest, ao
        // perceber a queda, calcula este MESMO newHostId sozinho (via
        // attemptReconnectToNewHost) e se conecta diretamente — não depende
        // mais só deste broadcast. Ainda assim tentamos, útil se alguma
        // conexão tiver sobrevivido.
        broadcastAll({ type: 'host-changed', newHostPeerId: id, hostVersion: newVersion, players: state.players, respostasCount: state.respostasCount });

        Game.ui.setupUI();

        if (state.gameStarted && !state.gameOver) {
            // Retoma a partida em andamento em vez de voltar ao lobby:
            // reinicia o motor do timer local e mantém a rodada atual.
            Game.ui.showScreen('game');
            Game.ui.updatePlayersOnlineList();
            Game.ui.updateRankingList();
            Game.ui.updateTimerDisplay();

            clearInterval(state.timerInterval);

            // BUGFIX: mesma proteção já aplicada em resumeGameEngineIfHost()
            // (game-main.js) para o cenário de F5 do host. Sem isso, uma
            // migração de host ocorrendo bem no fim do timer (timer já
            // zerado ou negativo no momento da migração) rearmava o
            // setInterval normalmente, deixando o timer visivelmente ir a
            // negativo por 1 tick antes de encerrar a partida.
            if (state.timer <= 0) {
                Game.core.endGame(Game.core.buildRanking());
                document.getElementById('roomPeerId').textContent = id;
                document.getElementById('hostRoomIdSection').style.display = 'block';
                alert('👑 Você agora é o host!');
                Game.saveState();
                return;
            }

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

            if (!state.currentRound) {
                Game.core.pickNewPair();
            } else {
                Game.ui.displayRoundStart();
                if (state.currentRound.pergunta) {
                    Game.ui.displayQuestion(state.currentRound.pergunta);
                }
                // Rearma a rede de segurança: o timeout do host antigo
                // morreu junto com ele. Se havia uma Assessoria pendente no
                // exato momento da migração, rearma o timeout de
                // ASSESSORIA (20s) em vez do timeout de resposta — mesmo
                // padrão já aplicado em handleAssessoriaRequest(), que
                // pausa respostaTimeout enquanto se aguarda o assessor.
                // Rearmar respostaTimeout aqui incondicionalmente
                // contradiria essa pausa e ainda deixaria a Assessoria sem
                // NENHUM timeout rodando caso o assessor nunca respondesse.
                if (state.currentRound.assessoria?.status === 'pending') {
                    Game.core.armarAssessoriaTimeout();
                } else {
                    Game.core.armarRespostaTimeout(state.currentRound.respondedor);
                }
            }

            // Rearma também os timeouts de qualquer oferta de venda
            // pendente herdada do host antigo — sem isso, ofertas em
            // aberto no momento da migração ficariam sem nenhum timeout de
            // segurança rodando (o timeout antigo morreu junto com o host
            // anterior).
            Object.entries(state.pendingVendaOfertas || {}).forEach(([vendedorName, compradorName]) => {
                Game.core.armarVendaOfertaTimeout(vendedorName, compradorName);
            });
        } else {
            Game.ui.showLobbyNormal();
            Game.ui.updatePlayersList();
            Game.ui.checkStartCondition();
        }

        // Rearma o período de graça de qualquer jogador que já estivesse
        // marcado como `disconnected` sob o host anterior — o timeout dele
        // era local ao processo do host antigo e morreu junto com ele. Sem
        // isso, esse jogador ficaria "preso" como desconectado para
        // sempre, nunca sendo removido nem contando como ativo de novo
        // (mesmo se ele nunca mais reconectar).
        state.players
            .filter(p => p.disconnected && p.name !== state.playerName)
            .forEach(p => armarDisconnectTimeout(p.name, p.peerId));

        document.getElementById('roomPeerId').textContent = id;
        document.getElementById('hostRoomIdSection').style.display = 'block';
        alert('👑 Você agora é o host!');
        Game.saveState();
    });

    myPeer.on('connection', (conn) => handleConnection(conn));

    myPeer.on('error', (err) => {
        console.error('❌ Erro ao assumir como host:', err);
        Game.ui.updateConnectionStatus('error', 'Falha ao assumir a sala como host.');
        // Não há um fallback automático seguro aqui (poderia gerar dois
        // hosts concorrentes); a sessão fica marcada com erro visível para
        // o jogador decidir recarregar a página.
    });
}

function reconnectToNewHost(newHostPeerId) {
    Game.state.hostPeerId = newHostPeerId;
    Object.values(connections).forEach(c => c.close());
    connections = {};
    const conn = myPeer.connect(newHostPeerId, { reliable: true });
    handleConnection(conn);
}

function cleanup() {
    clearInterval(Game.state.timerInterval);
    // Evita que um timeout de graça de reconexão (ver armarDisconnectTimeout)
    // dispare depois que esta sessão/aba já foi encerrada.
    Object.values(Game.state.disconnectTimeouts || {}).forEach(t => clearTimeout(t));
    Game.state.disconnectTimeouts = {};
    if (myPeer && !myPeer.destroyed) myPeer.destroy();
    localStorage.removeItem('pmKPI_roomState');
    localStorage.removeItem('pmKPI_myData');
}

// ============================================
// EXPORTAÇÃO
// ============================================
window.Game = window.Game || {};
window.Game.network = {
    initPeer,
    connectToHost,
    handleMessage,
    handleHostDisconnect,
    souOBackup,
    attemptReconnectToNewHost,
    handleGuestDisconnected,
    armarDisconnectTimeout,
    becomeHost,
    reconnectToNewHost,
    broadcastAll,
    sendToPlayer,
    sendToHost,
    cleanup
};