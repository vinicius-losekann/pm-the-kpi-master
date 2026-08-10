// ============================================
// PM: The KPI Master - NÚCLEO DO JOGO
// ============================================
// Responsabilidades:
//   - Lógica de rodadas (sorteio de pares, perguntas)
//   - Controle de baralho (evitar repetição)
//   - Cálculo de KPI e progressão de fases
//   - Sistema de recursos 
//   - Controle de partida (iniciar, encerrar)
//   - Controle de sessão (encerrar, sair) 
//   - Recursos iniciais: 10 por jogador
//   - Responder gasta 1 recurso (acertando ou errando)
//   - Atividade só ganha se acertar
//   - KPI fixo: 10 por atividade completada
//   - Eventos afetam recursos (não KPI)
//   - KPI Final = KPI acertos + KPI vendas - KPI compras + (recursos restantes × 5)
//   - Atualização de UI: após evento, após venda, após resposta
//
// Dependências:
//   - Game.state (game-state.js)
//   - Game.network (game-network.js)
//   - Game.ui (game-ui.js)
//
// Namespace: Game.core
// ============================================

// ============================================
// RODADA - SORTEIO E PERGUNTAS
// ============================================

function startNewRound() {
    const state = Game.state;
    const eventos = state.questionsData?.eventos || [];
    if (eventos.length === 0) {
        console.error('❌ Nenhum evento disponível!');
        return;
    }
    const evento = eventos[Math.floor(Math.random() * eventos.length)];

    // Aplica efeitos do evento nos recursos
    aplicarEfeitosEvento(evento);

    // Atualiza UI imediatamente após o evento (Momento 1)
    Game.ui.updatePlayersOnlineList();
    Game.ui.updateRankingList();

    // Atualiza recursos e KPI do próprio jogador na tela
    const me = Game.getPlayerByName(state.playerName);
    if (me) {
        document.getElementById('myRecursos').textContent = me.recursos;
        document.getElementById('myKPI').textContent = me.kpi;
    }

    pickNewPair(evento);
}

function pickNewPair(evento = null, depth = 0) {
    const state = Game.state;

    // Guard contra recursão infinita: se não sobrar ninguém com recursos
    // disponíveis mesmo após resetar a lista de "já jogou nesta rodada",
    // encerra a partida em vez de travar em loop.
    if (depth > CONFIG.JOGO.MAX_PLAYERS * 2) {
        console.error('❌ Nenhum jogador com recursos disponíveis. Encerrando partida.');
        endGame(buildRanking());
        return;
    }

    // CORRIGIDO: chamadas recursivas (depth > 0) reaproveitam o MESMO
    // evento só para tentar sortear um novo par de jogadores — nenhum
    // evento novo é sorteado/aplicado nelas. Antes, o bloco abaixo que
    // faz broadcast + abre o modal de evento rodava de novo em toda
    // chamada, mesmo reutilizando o evento já mostrado, fazendo o mesmo
    // modal reaparecer duas (ou mais) vezes seguidas para todos.
    const eventoJaExibidoNestaRodada = depth > 0;

    if (!evento) {
        const eventos = state.questionsData?.eventos || [];
        if (eventos.length === 0) return;
        evento = eventos[Math.floor(Math.random() * eventos.length)];
        aplicarEfeitosEvento(evento);

        // Atualiza UI se o evento foi aplicado aqui também
        Game.ui.updatePlayersOnlineList();
        Game.ui.updateRankingList();
        const me = Game.getPlayerByName(state.playerName);
        if (me) {
            document.getElementById('myRecursos').textContent = me.recursos;
            document.getElementById('myKPI').textContent = me.kpi;
        }
    }

    // Mostra modal do evento para todos — apenas na primeira vez que ele é
    // exibido nesta busca por um novo par (ver comentário acima).
    if (!eventoJaExibidoNestaRodada) {
        Game.network.broadcastAll({ type: 'show-evento', evento: evento, players: state.players });
        Game.ui.showEventoModal(evento);
    }

    const activePlayers = Game.getActivePlayers();

    if (activePlayers.length < CONFIG.JOGO.MIN_PLAYERS) {
        console.warn('⚠️ Jogadores ativos insuficientes para continuar a partida.');
        endGame(buildRanking());
        return;
    }

    // Só considera respondedor quem ainda tem recursos — quem está sem
    // recursos deve pular a vez em vez de receber a pergunta e ter a
    // resposta descartada depois em handleAnswer().
    // EXCEÇÃO: numa rodada com o evento 🛡️ Reserva de Contingência (e4),
    // a resposta não gasta recurso algum ("acertando ou errando", conforme
    // README), então mesmo jogadores com 0 recursos continuam elegíveis
    // como Respondedor nessa rodada específica.
    const semCustoNestaRodada = evento?.reserva_contingencia === true;
    const comRecursos = semCustoNestaRodada
        ? activePlayers
        : activePlayers.filter(p => p.recursos > 0);

    if (comRecursos.length === 0) {
        console.warn('⚠️ Nenhum jogador ativo tem recursos. Encerrando partida.');
        endGame(buildRanking());
        return;
    }

    const available = comRecursos.filter(p =>
        !state.usedRespondedorThisRound.includes(p.name)
    );

    if (available.length === 0) {
        state.usedRespondedorThisRound = [];
        return pickNewPair(evento, depth + 1);
    }

    const respondedor = available[Math.floor(Math.random() * available.length)];
    const askers = activePlayers.filter(p => p.peerId !== respondedor.peerId);
    if (askers.length === 0) return;

    const perguntador = askers[Math.floor(Math.random() * askers.length)];
    const pergunta = sortearPergunta(respondedor.phase);

    if (!pergunta) {
        console.error('❌ Sem pergunta disponível!');
        return;
    }

    state.currentRound = {
        evento,
        perguntador: perguntador.name,
        respondedor: respondedor.name,
        pergunta,
        respondeu: false
    };

    console.log('🎯 Nova dupla:', perguntador.name, 'pergunta para', respondedor.name);
    console.log('📋 Evento:', evento.titulo);

    Game.network.broadcastAll({
        type: 'round-start',
        evento,
        perguntador: perguntador.name,
        respondedor: respondedor.name
    });

    const areaNome = state.questionsData.areas[pergunta.area_key]?.nome || pergunta.area_key;
    const grupoNome = Game.getFaseById(respondedor.phase).nome;

    const perguntaData = {
        type: 'question',
        pergunta: pergunta.pergunta,
        area: areaNome,
        grupo: grupoNome,
        alternativas: pergunta.alternativas,
        correta: pergunta.correta,
        id: pergunta.id
    };

    Game.network.sendToPlayer(perguntador.peerId, { ...perguntaData, isPerguntador: true });

    // CORRIGIDO: o Respondedor NUNCA deve receber o gabarito (`correta`),
    // independentemente de ser o host ou um guest. Antes, quando o próprio
    // host era sorteado como Respondedor, a mensagem era enviada com
    // `perguntaData` completo (incluindo `correta`), vazando a resposta
    // certa só para esse caso específico — inconsistente com a regra do
    // README de que o Respondedor só vê a pergunta e as alternativas.
    Game.network.sendToPlayer(respondedor.peerId, { ...perguntaData, isRespondedor: true, correta: undefined });

    if (state.playerName !== perguntador.name && state.playerName !== respondedor.name) {
        Game.ui.displaySpectatorView(perguntador.name, respondedor.name);
    }

    Game.ui.displayRoundStart();

    // NOVO: arma um timeout de segurança para o caso do Respondedor sumir
    // (queda de conexão sem o evento 'close' disparar corretamente,
    // aba em segundo plano travada, etc). Sem isso, a rodada — e a
    // partida inteira, já que o timer principal continua rodando mas
    // ninguém mais avança — ficava travada até o fim dos 90 minutos.
    // Ao expirar, é tratado como resposta errada (sem alternativa
    // marcada), consumindo o recurso normalmente e liberando a vez.
    armarRespostaTimeout(respondedor.name);

    Game.saveState();
}

/**
 * Arma (ou rearma) o timeout de segurança para a resposta do Respondedor
 * da rodada atual. Se ninguém responder dentro de CONFIG.JOGO.RESPOSTA_TIMEOUT,
 * a resposta é tratada automaticamente como errada (sem alternativa),
 * liberando a vez para o próximo jogador.
 */
function armarRespostaTimeout(respondedorName) {
    const state = Game.state;
    if (state.respostaTimeout) {
        clearTimeout(state.respostaTimeout);
        state.respostaTimeout = null;
    }
    state.respostaTimeout = setTimeout(() => {
        console.warn('⌛ Timeout: ' + respondedorName + ' não respondeu a tempo. Pulando vez automaticamente.');
        Game.core.handleAnswer({ alternativa: null, playerName: respondedorName, timeout: true });
    }, CONFIG.JOGO.RESPOSTA_TIMEOUT);
}

function sortearPergunta(grupoProcesso) {
    const state = Game.state;
    let areasDisponiveis = [];

    for (const [key, area] of Object.entries(state.questionsData?.areas || {})) {
        if (area.grupos.includes(grupoProcesso) && state.baralhos[key]?.disponiveis > 0) {
            areasDisponiveis.push(key);
        }
    }

    if (areasDisponiveis.length === 0) {
        for (const [key, area] of Object.entries(state.questionsData?.areas || {})) {
            if (area.grupos.includes(grupoProcesso)) {
                resetBaralho(key);
                areasDisponiveis.push(key);
            }
        }
    }

    if (areasDisponiveis.length === 0) return null;

    const areaSorteada = areasDisponiveis[Math.floor(Math.random() * areasDisponiveis.length)];
    const baralho = state.baralhos[areaSorteada];
    if (!baralho || baralho.disponiveis <= 0) return null;

    const disponiveis = baralho.perguntas.filter(p => !p.usada);
    if (disponiveis.length === 0) return null;

    const pergunta = disponiveis[Math.floor(Math.random() * disponiveis.length)];
    pergunta.usada = true;
    baralho.disponiveis--;

    return { ...pergunta, area_key: areaSorteada };
}

function resetBaralho(areaKey) {
    const baralho = Game.state.baralhos[areaKey];
    if (baralho) {
        baralho.perguntas.forEach(p => p.usada = false);
        baralho.disponiveis = baralho.total;
    }
}

// NOVO
function resetAllBaralhos() {
    Object.keys(Game.state.baralhos).forEach(key => resetBaralho(key));
    console.log('🔄 Baralhos de perguntas resetados para a próxima partida.');
}

// ============================================
// EFEITOS DOS EVENTOS
// ============================================

function aplicarEfeitosEvento(evento) {
    const state = Game.state;
    if (!evento) return;

    // NOVO: só afeta quem ainda está ativo na partida — jogadores que
    // saíram (waitingInLobby) não devem ganhar nem perder recursos por
    // eventos sorteados depois que pararam de jogar.
    const ativos = Game.getActivePlayers();

    // e1: +1 recurso para todos os ativos
    if (evento.recursos_todos > 0) {
        ativos.forEach(p => p.recursos += evento.recursos_todos);
        console.log('🟢 Evento: +' + evento.recursos_todos + ' recurso(s) para todos os ativos');
    }

    // e2: -1 recurso de todos os ativos (mínimo 0)
    if (evento.recursos_todos < 0) {
        ativos.forEach(p => {
            p.recursos = Math.max(0, p.recursos + evento.recursos_todos);
        });
        console.log('🔴 Evento: ' + evento.recursos_todos + ' recurso(s) de todos os ativos');
    }

    // e3: +N recursos para quem tem menos, entre os ativos
    if (evento.recursos_menos && ativos.length > 0) {
        const minRecursos = Math.min(...ativos.map(p => p.recursos));
        const beneficiados = ativos.filter(p => p.recursos === minRecursos);
        beneficiados.forEach(p => p.recursos += evento.recursos_menos);
        console.log('🎁 Evento: +' + evento.recursos_menos + ' recursos para ' + beneficiados.map(p => p.name).join(', '));
    }

    // e5: mais rico dá 1 para mais pobre, entre os ativos
    if (evento.troca_recursos && ativos.length > 0) {
        const maxRecursos = Math.max(...ativos.map(p => p.recursos));
        const minRecursos = Math.min(...ativos.map(p => p.recursos));

        if (maxRecursos > minRecursos) {
            const rico = ativos.find(p => p.recursos === maxRecursos);
            const pobre = ativos.find(p => p.recursos === minRecursos);
            if (rico && pobre && rico !== pobre) {
                rico.recursos--;
                pobre.recursos++;
                console.log('🔄 Evento: ' + rico.name + ' deu 1 recurso para ' + pobre.name);
            }
        }
    }
}

// ============================================
// RESPOSTA E KPI (COM RECURSOS)
// ============================================

function handleAnswer(msg) {

    const state = Game.state;

    // CORRIGIDO: state.currentRound pode ser null se esta mensagem chegar
    // atrasada (ex.: latência de rede) logo após o fim da partida — endGame()
    // zera state.currentRound explicitamente. Sem este guard, o acesso a
    // `state.currentRound.respondedor` logo abaixo lançava
    // "TypeError: Cannot read properties of null".
    if (!state.currentRound) {
        console.warn('⚠️ handleAnswer chamado sem rodada ativa — ignorando (provavelmente resposta atrasada).');
        return;
    }

    const { respondedor: respondedorName } = state.currentRound;

    if (msg.playerName !== respondedorName) {
        console.warn('⚠️ Resposta ignorada: jogador não é o respondedor da rodada.');
        return;
    }

    if (state.currentRound.respondeu) {
        console.warn('⚠️ Rodada já foi respondida!');
        return;
    }

    // NOVO: o Respondedor efetivamente respondeu (ou o timeout de
    // segurança disparou) — cancela o timeout pendente, já que não é mais
    // necessário pular a vez automaticamente.
    if (state.respostaTimeout) {
        clearTimeout(state.respostaTimeout);
        state.respostaTimeout = null;
    }

    // NOVO: se há uma assessoria pendente para esta rodada, não processa a
    // resposta ainda — guarda e reprocessa quando a assessoria for resolvida
    // (aceita, recusada ou expirada). Sem isso, o bônus do assessor era
    // perdido silenciosamente quando o Respondedor respondia antes da hora.
    const assessoriaPendente = state.currentRound.assessoria &&
        state.currentRound.assessoria.status === 'pending';
    if (assessoriaPendente) {
        console.log('⏳ Resposta recebida com assessoria pendente — aguardando resolução...');
        state.currentRound.pendingAnswer = msg;
        return;
    }

    state.currentRound.respondeu = true;

    const { pergunta, evento } = state.currentRound;
    const acertou = msg.alternativa === pergunta.correta;
    /*const respondedor = Game.getPlayerByName(respondedorName);*/
    // DEPOIS
    const respondedor = Game.getPlayerByName(respondedorName);

    // CORRIGIDO: antes, se o respondedor já tivesse sido removido de
    // state.players (ex.: desconexão detectada entre o disparo do
    // armarRespostaTimeout e sua execução), a função retornava aqui sem
    // liberar a vez — travando a partida para todos os demais jogadores
    // até o fim dos 90 minutos. Agora aborta a rodada e sorteia uma nova.
    if (!respondedor) {
        console.warn('⚠️ Respondedor não encontrado (provavelmente desconectou) — abortando rodada.');
        state.currentRound = null;
        if (state.isHost) setTimeout(() => pickNewPair(), 500);
        Game.saveState();
        return;
    }

    // Esta checagem é uma segunda linha de defesa: o respondedor já é
    // filtrado em pickNewPair() para nunca chegar aqui sem recursos.
    // Mantemos como salvaguarda para reconexões/estados divergentes.
    /*if (respondedor.recursos <= 0) {
        console.warn('⚠️ ' + respondedorName + ' sem recursos! Pulando vez.');
        Game.network.broadcastAll({
            type: 'kpi-update',
            playerName: respondedorName,
            kpi: respondedor.kpi,
            phase: respondedor.phase,
            activities: respondedor.activities,
            recursos: respondedor.recursos,
            acertou: false,
            kpiGanho: 0,
            semRecursos: true
        });
        state.usedRespondedorThisRound.push(respondedorName);
        setTimeout(() => nextTurn(), 2000);
        Game.saveState();
        return;
    }

    // Reserva de Contingência (e4) — não gasta recurso, acertando ou errando
    const temReserva = evento?.reserva_contingencia === true;
    const gastaRecurso = !temReserva;

    if (gastaRecurso) {
        respondedor.recursos--;
    }*/
    // Reserva de Contingência (e4) — não gasta recurso, acertando ou errando
    const temReserva = evento?.reserva_contingencia === true;
    const gastaRecurso = !temReserva;

    // Esta checagem é uma segunda linha de defesa: o respondedor já é
    // filtrado em pickNewPair() para nunca chegar aqui sem recursos — exceto
    // justamente na rodada de Reserva de Contingência, onde 0 recursos é uma
    // situação válida e esperada, já que a resposta não custa nada. Por isso
    // o "pula vez" só se aplica quando NÃO há reserva de contingência ativa.
    if (respondedor.recursos <= 0 && !temReserva) {
        console.warn('⚠️ ' + respondedorName + ' sem recursos! Pulando vez.');
        Game.network.broadcastAll({
            type: 'kpi-update',
            playerName: respondedorName,
            kpi: respondedor.kpi,
            phase: respondedor.phase,
            activities: respondedor.activities,
            recursos: respondedor.recursos,
            acertou: false,
            kpiGanho: 0,
            semRecursos: true
        });
        state.usedRespondedorThisRound.push(respondedorName);
        setTimeout(() => nextTurn(), 2000);
        Game.saveState();
        return;
    }

    if (gastaRecurso) {
        respondedor.recursos--;
    }
    let kpiGanho = 0;
    if (acertou) {
        kpiGanho = CONFIG.KPI.ACERTO_BASE;
        respondedor.kpi += kpiGanho;
        respondedor.activities++;

        const faseIdx = Game.getFaseIndex(respondedor.phase);
        if (respondedor.activities >= CONFIG.JOGO.ACTIVITIES_PER_PHASE && faseIdx < CONFIG.FASES.length - 1) {
            respondedor.phase = CONFIG.FASES[faseIdx + 1].id;
            respondedor.activities = 0;
        }
    }

    const seguroMsg = temReserva ? ' (reserva de contingência)' : '';
    console.log('📊 ' + (acertou ? '✅ Acertou' : '❌ Errou') + ' | Recursos: ' + respondedor.recursos + seguroMsg + ' | KPI: ' + respondedor.kpi);

    Game.network.broadcastAll({
        type: 'kpi-update',
        playerName: respondedorName,
        kpi: respondedor.kpi,
        phase: respondedor.phase,
        activities: respondedor.activities,
        recursos: respondedor.recursos,
        acertou,
        kpiGanho
    });

    if (state.isHost && respondedorName === state.playerName) {
        updatePlayerKPI({
            playerName: respondedorName,
            kpi: respondedor.kpi,
            phase: respondedor.phase,
            activities: respondedor.activities,
            recursos: respondedor.recursos,
            acertou,
            kpiGanho
        });
    }

    // Bônus de Assessoria — assessor ganha +5 KPI se a sugestão foi seguida e estava correta
    const assessoria = state.currentRound.assessoria;
    if (assessoria && assessoria.status === 'accepted' && assessoria.sugestao === msg.alternativa && acertou) {
        const assessor = Game.getPlayerByName(assessoria.assessorName);
        if (assessor) {
            assessor.kpi += CONFIG.KPI.ASSESSORIA_ACERTO;
            console.log('🧭 Assessoria: ' + assessor.name + ' +' + CONFIG.KPI.ASSESSORIA_ACERTO + ' KPI');

            Game.network.broadcastAll({
                type: 'kpi-update',
                playerName: assessor.name,
                kpi: assessor.kpi,
                phase: assessor.phase,
                activities: assessor.activities,
                recursos: assessor.recursos,
                assessoriaBonus: CONFIG.KPI.ASSESSORIA_ACERTO
            });

            if (state.isHost && assessor.name === state.playerName) {
                updatePlayerKPI({
                    playerName: assessor.name,
                    kpi: assessor.kpi,
                    phase: assessor.phase,
                    activities: assessor.activities,
                    recursos: assessor.recursos,
                    assessoriaBonus: CONFIG.KPI.ASSESSORIA_ACERTO
                });
            }
        }
    }

    state.usedRespondedorThisRound.push(respondedorName);

    const faseIdx = Game.getFaseIndex(respondedor.phase);
    if (faseIdx === CONFIG.FASES.length - 1 && respondedor.activities >= CONFIG.JOGO.ACTIVITIES_PER_PHASE) {
        setTimeout(() => endGame(buildRanking()), 3000);
    } else {
        setTimeout(() => nextTurn(), 3000);
    }

    Game.saveState();
}

function nextTurn() {
    const state = Game.state;
    const activePlayers = Game.getActivePlayers();
    const allDone = activePlayers.every(p => state.usedRespondedorThisRound.includes(p.name));

    if (allDone) {
        state.usedRespondedorThisRound = [];
        startNewRound();
    } else {
        pickNewPair();
    }
}

function updatePlayerKPI(msg) {
    const state = Game.state;
    const player = Game.getPlayerByName(msg.playerName);

    if (player) {
        player.kpi = msg.kpi;
        player.phase = msg.phase;
        player.activities = msg.activities;
        if (msg.recursos !== undefined) player.recursos = msg.recursos;
    }

    if (msg.playerName === state.playerName) {
        document.getElementById('myKPI').textContent = msg.kpi;
        if (msg.recursos !== undefined) {
            document.getElementById('myRecursos').textContent = msg.recursos;
        }
        const fase = Game.getFaseById(msg.phase);
        document.getElementById('myPhaseName').textContent = fase.nome;
        document.getElementById('myPhaseIcon').textContent = fase.emoji;
        document.getElementById('myActivity').textContent = msg.activities;
        document.getElementById('myProgressFill').style.width =
            (msg.activities / CONFIG.JOGO.ACTIVITIES_PER_PHASE * 100) + '%';

        if (msg.semRecursos) {
            Game.ui.showResultModal(false, 0, msg.recursos);
            const resultMsg = document.getElementById('resultMessage');
            if (resultMsg) resultMsg.textContent = '⚠️ Sem recursos — vez pulada';
        } else if (msg.acertou !== undefined) {
            Game.ui.showResultModal(msg.acertou, msg.kpiGanho, msg.recursos);
        } else if (msg.assessoriaBonus) {
            Game.ui.showAssessoriaBonusModal(msg.assessoriaBonus);
        }
    }

    Game.ui.updatePlayersOnlineList();
    Game.ui.updateRankingList();
}

// ============================================
// SISTEMA DE ASSESSORIA
// ============================================

/**
 * Chamado pelo cliente do Respondedor ao escolher um assessor.
 * Esta é apenas uma checagem otimista/local para dar feedback rápido ao
 * jogador — a validação que realmente vale é feita pelo HOST em
 * handleAssessoriaRequest(), já que é ele a fonte da verdade da partida
 * e não deve confiar no estado local de quem envia o pedido.
 */
function requestAssessoria(assessorName) {
    const state = Game.state;

    if (!state.currentRound || state.currentRound.assessoria) {
        console.warn('⚠️ Já existe um pedido de assessoria nesta rodada.');
        return false;
    }
    // NOVO: reforça no cliente a regra "antes de responder" do README.
    if (state.currentRound.respondeu) {
        console.warn('⚠️ Rodada já foi respondida — não é mais possível pedir assessoria.');
        return false;
    }
    const me = Game.getPlayerByName(state.playerName);
    if (me && Game.getFaseIndex(me.phase) === CONFIG.FASES.length - 1) {
        alert('⚠️ Jogadores na fase de Encerramento não podem pedir assessoria.');
        return false;
    }

    if (state.isHost) {
        handleAssessoriaRequest({ assessorName, requesterName: state.playerName });
    } else {
        Game.network.sendToHost({ type: 'assessoria-request', assessorName, requesterName: state.playerName });
    }
    return true;
}

/**
 * HOST: processa o pedido de assessoria e envia a pergunta ao assessor escolhido.
 *
 * Esta função é a fonte da verdade: revalida no servidor (host) tudo que o
 * cliente do Respondedor já checou localmente em requestAssessoria(), pois
 * o estado do cliente pode estar desatualizado (ex.: acabou de avançar
 * para Encerramento mas ainda não recebeu o kpi-update) ou a mensagem
 * 'assessoria-request' pode chegar diretamente sem passar pela checagem
 * do cliente. Sem essa revalidação, a restrição do README — "Respondedor
 * na fase de Encerramento não pode pedir Assessoria" — poderia ser burlada.
 */
function handleAssessoriaRequest(msg) {
    const state = Game.state;
    if (!state.isHost || !state.currentRound || state.currentRound.assessoria) return;
    if (msg.requesterName !== state.currentRound.respondedor) return;
    // NOVO: o host é a fonte da verdade e não deve confiar só na UI do
    // cliente para bloquear um pedido de assessoria após a rodada já ter
    // sido respondida (mesmo raciocínio da checagem de fase de Encerramento).
    if (state.currentRound.respondeu) {
        const req = Game.getPlayerByName(msg.requesterName);
        if (req) {
            Game.network.sendToPlayer(req.peerId, {
                type: 'assessoria-result',
                assessorName: msg.assessorName,
                sugestao: null,
                recusado: true,
                invalido: true,
                motivo: 'ja-respondido'
            });
        }
        return;
    }

    const requester = Game.getPlayerByName(msg.requesterName);
    const assessor = Game.getPlayerByName(msg.assessorName);

    // NOVO: valida no host (fonte da verdade) que o Respondedor não está
    // na fase de Encerramento. Repete a regra já checada no cliente, pois
    // aquela checagem sozinha não é suficiente — o host nunca deve confiar
    // apenas no que o cliente diz sobre seu próprio estado.
    const requesterEmEncerramento = requester &&
        Game.getFaseIndex(requester.phase) === CONFIG.FASES.length - 1;

    const invalido =
        !assessor ||
        assessor.waitingInLobby ||
        requesterEmEncerramento ||
        msg.assessorName === state.currentRound.perguntador ||
        msg.assessorName === state.currentRound.respondedor;

    // NOVO: se o assessor ficou inválido por alguma condição de corrida
    // (ex.: saiu da partida entre a seleção e o envio) ou por o Respondedor
    // estar na fase de Encerramento, avisa o solicitante em vez de deixar
    // a UI presa em "Aguardando resposta de..." para sempre.
    if (invalido) {
        console.warn('⚠️ Pedido de assessoria rejeitado pelo host:', msg.assessorName,
            requesterEmEncerramento ? '(Respondedor na fase de Encerramento)' : '');
        if (requester) {
            Game.network.sendToPlayer(requester.peerId, {
                type: 'assessoria-result',
                assessorName: msg.assessorName,
                sugestao: null,
                recusado: true,
                invalido: true,
                motivo: requesterEmEncerramento ? 'fase-encerramento' : undefined
            });
        }
        return;
    }

    state.currentRound.assessoria = {
        assessorName: msg.assessorName,
        status: 'pending',
        sugestao: null
    };
    // NOVO: pausa o timeout de segurança da resposta enquanto se aguarda o
    // assessor. Esse timeout existe para detectar um Respondedor que sumiu
    // (queda de conexão), não para penalizar quem está seguindo o fluxo de
    // Assessoria descrito no README (até 20s de espera + tempo de decisão).
    // Sem isso, o combo "esperar o assessor + decidir" podia ultrapassar o
    // RESPOSTA_TIMEOUT e a rodada era marcada como errada automaticamente,
    // mesmo com o jogador ativo na tela.
    if (state.respostaTimeout) {
        clearTimeout(state.respostaTimeout);
        state.respostaTimeout = null;
    }
    Game.network.broadcastAll({
        type: 'assessoria-started',
        assessorName: msg.assessorName,
        requesterName: msg.requesterName
    });

    const pergunta = state.currentRound.pergunta;
    const areaNome = state.questionsData.areas[pergunta.area_key]?.nome || pergunta.area_key;

    Game.network.sendToPlayer(assessor.peerId, {
        type: 'assessoria-question',
        pergunta: pergunta.pergunta,
        area: areaNome,
        alternativas: pergunta.alternativas,
        id: pergunta.id
    });

    if (state.assessoriaTimeout) clearTimeout(state.assessoriaTimeout);
    state.assessoriaTimeout = setTimeout(() => {
        handleAssessoriaAnswer({ alternativa: null, recusado: true, timeout: true });
    }, CONFIG.JOGO.ASSESSORIA_TIMEOUT);
    Game.saveState(); // NOVO
}

/**
 * HOST: processa a resposta (ou recusa/timeout) do assessor.
 */

function handleAssessoriaAnswer(msg) {
    const state = Game.state;
    if (!state.isHost || !state.currentRound || !state.currentRound.assessoria) return;
    if (state.currentRound.assessoria.status !== 'pending') return;

    if (state.assessoriaTimeout) {
        clearTimeout(state.assessoriaTimeout);
        state.assessoriaTimeout = null;
    }

    state.currentRound.assessoria.status = msg.recusado ? 'declined' : 'accepted';
    state.currentRound.assessoria.sugestao = msg.recusado ? null : msg.alternativa;

    const resultMsg = {
        type: 'assessoria-result',
        assessorName: state.currentRound.assessoria.assessorName,
        sugestao: state.currentRound.assessoria.sugestao,
        recusado: !!msg.recusado,
        timeout: !!msg.timeout
    };

    Game.network.broadcastAll(resultMsg);

    // CORRIGIDO: broadcastAll() nunca reenvia a mensagem para o próprio
    // host (só existe conexão P2P com os outros peers). Sem esta chamada,
    // quando o HOST é o Respondedor que pediu a assessoria, a tela dele
    // nunca recebe o resultado: o texto fica preso em "Aguardando
    // resposta..." e as alternativas continuam desabilitadas para sempre,
    // já que só showAssessoriaResult() as reabilita. Mesmo padrão de
    // self-dispatch já usado em processVenda() e handleAnswer(). A própria
    // showAssessoriaResult() já ignora a chamada se quem está rodando não
    // for o Respondedor, então é seguro chamar sempre, sem checar isHost.
    Game.ui.showAssessoriaResult(resultMsg);
    // NOVO: a Assessoria foi resolvida (aceita, recusada ou expirada) e o
    // Respondedor ainda não enviou a resposta final — rearma o timeout de
    // segurança do zero, dando a ele o tempo cheio para decidir, em vez de
    // deixar a rodada sem nenhuma rede de segurança contra uma desconexão
    // que aconteça só agora.
    if (!state.currentRound.respondeu && !state.currentRound.pendingAnswer) {
        armarRespostaTimeout(state.currentRound.respondedor);
    }
    // NOVO: se o Respondedor já tinha enviado uma resposta enquanto a
    // assessoria ainda estava pendente, processa agora que ela foi resolvida.
    if (state.currentRound.pendingAnswer) {
        const pending = state.currentRound.pendingAnswer;
        state.currentRound.pendingAnswer = null;
        handleAnswer(pending);
    }
    Game.saveState(); // NOVO
}
// ============================================
// CONTROLE DE PARTIDA
// ============================================

/*function startGame() {
    const state = Game.state;
    state.gameStarted = true;
    state.usedRespondedorThisRound = [];

    // Inicializa recursos
    state.players.forEach(p => {
        p.recursos = CONFIG.RECURSOS_INICIAIS;
    });

    clearInterval(state.timerInterval);
    state.timerInterval = setInterval(() => {
        state.timer--;
        Game.ui.updateTimerDisplay();

        if (state.timer % 10 === 0 && state.isHost) {
            Game.network.broadcastAll({ type: 'timer-update', remaining: state.timer });
        }

        if (state.timer <= 0) {
            clearInterval(state.timerInterval);
            if (state.isHost) endGame(buildRanking());
        }
    }, 1000);

    Game.ui.showScreen('game');
    Game.ui.updatePlayersOnlineList();
    Game.ui.updateTimerDisplay();

    if (state.isHost) startNewRound();
    Game.saveState();
}
*/
function startGame() {
    const state = Game.state;
    state.gameStarted = true;
    state.gameOver = false; // NOVO — endGame() define gameOver=true e nada revertia isso
    state.usedRespondedorThisRound = [];

    // CORRIGIDO: antes só 'recursos' era reinicializado aqui. Se uma
    // partida terminasse naturalmente e o host clicasse em "Voltar ao
    // Lobby" seguido de "Iniciar Partida" de novo (sem passar por
    // "Encerrar Partida", que já fazia o reset completo via
    // Game.resetAllPlayers()), a nova partida começava com o KPI, fase e
    // atividades remanescentes da partida anterior — quebrando a
    // premissa de que toda partida começa do zero.
    Game.resetAllPlayers();
    // NOVO: sincroniza o HUD do próprio jogador com o estado recém-resetado,
    // em vez de depender que o texto padrão do HTML "coincida" com
    // CONFIG.RECURSOS_INICIAIS/fase inicial, ou que o broadcast do primeiro
    // evento (show-evento) chegue a tempo para guests.
    const me = Game.getPlayerByName(state.playerName);
    if (me) {
        document.getElementById('myKPI').textContent = me.kpi;
        document.getElementById('myRecursos').textContent = me.recursos;
        const fase = Game.getFaseById(me.phase);
        document.getElementById('myPhaseName').textContent = fase.nome;
        document.getElementById('myPhaseIcon').textContent = fase.emoji;
        document.getElementById('myActivity').textContent = me.activities;
        document.getElementById('myProgressFill').style.width = '0%';
    }
    clearInterval(state.timerInterval);
    state.timerInterval = setInterval(() => {
        state.timer--;
        Game.ui.updateTimerDisplay();

        if (state.timer % 10 === 0 && state.isHost) {
            Game.network.broadcastAll({ type: 'timer-update', remaining: state.timer });
        }

        if (state.timer <= 0) {
            clearInterval(state.timerInterval);
            if (state.isHost) endGame(buildRanking());
        }
    }, 1000);

    Game.ui.showScreen('game');
    Game.ui.updatePlayersOnlineList();
    Game.ui.updateTimerDisplay();

    if (state.isHost) startNewRound();
    Game.saveState();
}

function endGame(ranking) {
    const state = Game.state;
    state.gameOver = true;
    clearInterval(state.timerInterval);

    // NOVO: cancela qualquer timeout de assessoria pendente e zera a rodada
    // atual — sem isso, uma assessoria em andamento no exato momento do fim
    // de partida disparava depois, atualizando KPI/recursos e abrindo modais
    // com a tela de "Fim de Partida" já visível para todos.
    if (state.assessoriaTimeout) {
        clearTimeout(state.assessoriaTimeout);
        state.assessoriaTimeout = null;
    }
    // NOVO: mesma razão acima, mas para o timeout de resposta do
    // Respondedor — evita que ele dispare depois do fim de jogo e chame
    // handleAnswer() para uma rodada que não existe mais.
    if (state.respostaTimeout) {
        clearTimeout(state.respostaTimeout);
        state.respostaTimeout = null;
    }
    state.currentRound = null;

    if (state.isHost) {
        Game.network.broadcastAll({ type: 'game-over', ranking });
    }

    Game.ui.showScreen('gameover');
    Game.ui.displayFinalRanking(ranking);
    Game.saveState();
}

function endMatch() {
    if (!Game.state.isHost) return;
    if (!confirm('🏁 Encerrar a partida? Todos voltarão ao lobby com KPI zerado.')) return;

    // NOVO: cancela timeouts pendentes (resposta/assessoria) da rodada que
    // está sendo encerrada abruptamente — evitam disparos tardios chamando
    // handleAnswer/handleAssessoriaAnswer para uma partida que já foi
    // resetada.
    if (Game.state.assessoriaTimeout) {
        clearTimeout(Game.state.assessoriaTimeout);
        Game.state.assessoriaTimeout = null;
    }
    if (Game.state.respostaTimeout) {
        clearTimeout(Game.state.respostaTimeout);
        Game.state.respostaTimeout = null;
    }

    Game.resetAllPlayers();
    Game.resetGameState();
    Game.core.resetAllBaralhos(); // NOVO

    Game.network.broadcastAll({ type: 'match-ended', players: Game.state.players });
    Game.ui.showScreen('lobby');
    Game.ui.showLobbyNormal();
    Game.ui.updatePlayersList();
    Game.ui.updateTimerDisplay();
    Game.ui.checkStartCondition();
    Game.saveState();
}

function handleMatchEnded(msg) {
    Game.state.players = msg.players;
    Game.resetAllPlayers();
    Game.resetGameState();
    Game.core.resetAllBaralhos(); // NOVO — mantém a cópia local do guest coerente,
    // relevante caso ele vire host numa migração futura
    Game.ui.showScreen('lobby');
    Game.ui.showLobbyNormal();
    Game.ui.updatePlayersList();
    Game.ui.updateTimerDisplay();
    Game.saveState();
}

// ============================================
// VENDA DE RECURSOS
// ============================================

/**
 * Chamado pelo cliente (host ou guest) ao confirmar uma venda.
 * Guests enviam o pedido ao host; o host processa e faz broadcast.
 */
function venderRecurso(compradorName) {
    const state = Game.state;

    if (state.isHost) {
        processVenda(state.playerName, compradorName);
    } else {
        Game.network.sendToHost({
            type: 'venda-request',
            vendedorName: state.playerName,
            compradorName
        });
    }
    return true; // feedback otimista; rejeição chega via 'venda-rejected'
}

/**
 * HOST: valida e executa a venda de fato. Única fonte de verdade —
 * evita que vendas feitas por um guest fiquem invisíveis para os
 * demais guests, já que a topologia P2P é uma estrela (guests só
 * têm conexão direta com o host, não entre si).
 */
function processVenda(vendedorName, compradorName) {
    const state = Game.state;
    if (!state.isHost) return;

    const vendedor = Game.getPlayerByName(vendedorName);
    const comprador = Game.getPlayerByName(compradorName);

    const erro =
        (!vendedor || !comprador) ? 'Vendedor ou comprador não encontrado.' :
            (vendedor.name === comprador.name) ? 'Você não pode vender para si mesmo.' :
                (vendedor.waitingInLobby || comprador.waitingInLobby) ? 'Jogador não está mais ativo na partida.' :
                    (vendedor.recursos < 1) ? 'Vendedor não tem recursos para vender.' :
                        (comprador.kpi < CONFIG.KPI.VALOR_VENDA_RECURSO) ? 'Comprador não tem KPI suficiente.' :
                            null;

    if (erro) {
        console.warn('⚠️ Venda rejeitada:', erro);
        Game.network.sendToPlayer(vendedor?.peerId, { type: 'venda-rejected', motivo: erro });
        return false;
    }

    // Executa a venda
    vendedor.recursos--;
    vendedor.kpi += CONFIG.KPI.VALOR_VENDA_RECURSO;
    comprador.recursos++;
    comprador.kpi -= CONFIG.KPI.VALOR_VENDA_RECURSO;

    console.log('💰 Venda:', vendedor.name, 'vendeu 1📦 para', comprador.name, 'por', CONFIG.KPI.VALOR_VENDA_RECURSO, 'KPI');

    Game.network.broadcastAll({
        type: 'venda-confirmed',
        vendedor: vendedor.name,
        comprador: comprador.name,
        valor: CONFIG.KPI.VALOR_VENDA_RECURSO,
        vendedorKPI: vendedor.kpi,
        vendedorRecursos: vendedor.recursos,
        compradorKPI: comprador.kpi,
        compradorRecursos: comprador.recursos
    });

    // O host também precisa atualizar sua própria UI, já que broadcastAll
    // não reenvia para si mesmo (mesmo padrão usado em handleAnswer/kpi-update).
    Game.network.handleMessage({
        type: 'venda-confirmed',
        vendedor: vendedor.name,
        comprador: comprador.name,
        valor: CONFIG.KPI.VALOR_VENDA_RECURSO,
        vendedorKPI: vendedor.kpi,
        vendedorRecursos: vendedor.recursos,
        compradorKPI: comprador.kpi,
        compradorRecursos: comprador.recursos
    }, state.peerId);

    Game.saveState();
    return true;
}

function getCompradores() {
    const state = Game.state;
    return state.players.filter(p =>
        p.name !== state.playerName &&
        !p.waitingInLobby &&
        p.kpi >= CONFIG.KPI.VALOR_VENDA_RECURSO
    );
}

// ============================================
// CONTROLE DE SESSÃO
// ============================================

function endSession() {
    if (!Game.state.isHost) return;
    if (!confirm('⛔ Encerrar a sessão? Todos os jogadores serão desconectados e a sala destruída.')) return;

    Game.network.broadcastAll({ type: 'session-ended' });
    Game.network.cleanup();
    window.location.href = 'index.html';
}

/**
 * CORRIGIDO: antes, esta função só alterava `waitingInLobby` na cópia
 * LOCAL de state.players do jogador que clicou em "🚶 Sair da Partida" —
 * não existia nenhuma mensagem de rede equivalente. O host (fonte da
 * verdade da partida) e os demais jogadores continuavam enxergando esse
 * jogador como ativo, podendo sorteá-lo como perguntador ou respondedor
 * mesmo com a tela dele já mostrando o lobby — travando aquela rodada
 * indefinidamente (só resolvido quando o timer de 90 min zerasse) e
 * deixando ranking/lista de jogadores incorretos para todo mundo.
 *
 * Agora, além de atualizar a cópia local (feedback imediato para quem
 * saiu), o guest notifica o host via 'leave-match-request'; o host é
 * quem de fato marca o jogador como waitingInLobby na fonte da verdade e
 * propaga a mudança para todos via 'player-list' (ver
 * handleLeaveMatchRequest, abaixo, e o case correspondente em
 * game-network.js).
 */
function leaveMatch() {
    if (Game.state.isHost) return;
    if (!confirm('🚶 Sair da partida? Você aguardará no lobby até a próxima partida.')) return;

    const me = Game.getPlayerByName(Game.state.playerName);
    if (me) me.waitingInLobby = true;

    Game.network.sendToHost({ type: 'leave-match-request', playerName: Game.state.playerName });

    Game.ui.showScreen('lobby');
    Game.ui.showLobbyWaitingView();
    Game.saveState();
}

/**
 * HOST: processa o pedido de um guest para sair da partida em andamento.
 * É a fonte da verdade — marca o jogador como waitingInLobby na cópia
 * oficial de state.players e propaga via broadcast, igual ao padrão já
 * usado para entrada/saída de jogadores (addPlayer/removePlayerByPeerId).
 */
/*function handleLeaveMatchRequest(msg) {
    const state = Game.state;
    if (!state.isHost) return;

    const player = Game.getPlayerByName(msg.playerName);
    if (!player || player.waitingInLobby) return;

    player.waitingInLobby = true;
    console.log('🚶 ' + player.name + ' saiu da partida (waitingInLobby=true).');

    Game.network.broadcastAll({ type: 'player-list', players: state.players });
    Game.ui.updatePlayersOnlineList();
    Game.ui.updateRankingList();

    // NOVO: se o jogador que saiu fazia parte da rodada atual (como
    // perguntador ou respondedor) e ela ainda não foi respondida, a rodada
    // ficaria travada esperando por alguém que já não está mais jogando.
    // Aborta a rodada em aberto e sorteia uma nova imediatamente.
    const round = state.currentRound;
    if (round && !round.respondeu &&
        (round.perguntador === player.name || round.respondedor === player.name)) {
        console.warn('⚠️ Jogador da rodada atual saiu da partida — abortando rodada e sorteando nova.');
        if (state.assessoriaTimeout) {
            clearTimeout(state.assessoriaTimeout);
            state.assessoriaTimeout = null;
        }
        if (state.respostaTimeout) {
            clearTimeout(state.respostaTimeout);
            state.respostaTimeout = null;
        }
        state.currentRound = null;
        Game.core.pickNewPair();
    }

    Game.saveState();
}*/
// DEPOIS

/**
 * CORRIGIDO: extraído de handleLeaveMatchRequest() para ser reutilizável.
 * Aborta a rodada atual (se ainda não respondida) quando um dos
 * participantes (perguntador ou respondedor) deixa de estar disponível —
 * seja por sair voluntariamente da partida (leaveMatch) ou por
 * desconexão involuntária (queda de conexão, ver removePlayerByPeerId em
 * game-network.js). Sem isso, uma queda de conexão do Respondedor durante
 * a rodada travava a partida indefinidamente: handleAnswer() encontrava
 * `respondedor === undefined` (já removido de state.players) e retornava
 * sem nunca chamar pickNewPair() de novo.
 */
function abortRoundIfParticipant(playerName) {
    const state = Game.state;
    if (!state.isHost) return;

    const round = state.currentRound;
    if (round && !round.respondeu &&
        (round.perguntador === playerName || round.respondedor === playerName)) {
        console.warn('⚠️ Participante da rodada atual ficou indisponível — abortando rodada e sorteando nova.');
        if (state.assessoriaTimeout) {
            clearTimeout(state.assessoriaTimeout);
            state.assessoriaTimeout = null;
        }
        if (state.respostaTimeout) {
            clearTimeout(state.respostaTimeout);
            state.respostaTimeout = null;
        }
        state.currentRound = null;
        Game.core.pickNewPair();
    }
}

function handleLeaveMatchRequest(msg) {
    const state = Game.state;
    if (!state.isHost) return;

    const player = Game.getPlayerByName(msg.playerName);
    if (!player || player.waitingInLobby) return;

    player.waitingInLobby = true;
    console.log('🚶 ' + player.name + ' saiu da partida (waitingInLobby=true).');

    Game.network.broadcastAll({ type: 'player-list', players: state.players });
    Game.ui.updatePlayersOnlineList();
    Game.ui.updateRankingList();

    abortRoundIfParticipant(player.name);

    Game.saveState();
}

function leaveSession() {
    if (Game.state.isHost) {
        endSession();
        return;
    }
    if (!confirm('🚪 Sair da sessão? Você voltará à tela inicial.')) return;

    Game.network.cleanup();
    window.location.href = 'index.html';
}

// ============================================
// RANKING (KPI = acertos + vendas - compras + recursos)
// ============================================

function buildRanking() {
    // Inclui todos os jogadores (mesmo os que saíram da partida via
    // leaveMatch) para manter Ranking e "Jogadores online" consistentes
    // quanto a quem está sendo exibido; a UI decide o que mostrar em
    // cada lista conforme o contexto.
    return [...Game.state.players]
        .map(p => ({
            name: p.name,
            kpi: p.kpi,
            recursos: p.recursos,
            kpiFinal: p.kpi + (p.recursos * CONFIG.KPI.VALOR_RECURSO_FINAL),
            phase: p.phase,
            activities: p.activities,
            isHost: p.isHost,
            waitingInLobby: !!p.waitingInLobby
        }))
        .sort((a, b) => b.kpiFinal - a.kpiFinal)
        .map((p, i) => ({
            posicao: i + 1,
            ...p
        }));
}

// ============================================
// EXPORTAÇÃO
// ============================================
window.Game = window.Game || {};
window.Game.core = {
    startNewRound,
    pickNewPair,
    armarRespostaTimeout, // NOVO
    sortearPergunta,
    resetBaralho,        // NOVO
    resetAllBaralhos,    // NOVO
    aplicarEfeitosEvento,
    handleAnswer,
    updatePlayerKPI,
    nextTurn,
    startGame,
    endGame,
    endMatch,
    handleMatchEnded,
    endSession,
    leaveMatch,
    handleLeaveMatchRequest, // NOVO
    abortRoundIfParticipant, // NOVO
    leaveSession,
    buildRanking,
    venderRecurso,
    processVenda,      // NOVO
    getCompradores,
    requestAssessoria,
    handleAssessoriaRequest,
    handleAssessoriaAnswer
};