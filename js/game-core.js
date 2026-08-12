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
//   - Recursos iniciais: Definidos em game-config.js
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

/**
 * Sorteia o evento da rodada, aplica seus efeitos nos recursos e
 * atualiza a UI local imediatamente (Momento 1, antes de saber quem serão
 * perguntador/respondedor). Extraído de startNewRound()/pickNewPair(),
 * que faziam exatamente a mesma sequência de forma duplicada — qualquer
 * correção futura precisava ser replicada nos dois lugares.
 *
 * @returns {object|null} o evento sorteado, ou null se não houver eventos
 * disponíveis (sem baralho de eventos carregado).
 */
function sortearEAplicarEvento() {
    const state = Game.state;
    const evento = sortearEvento();
    if (!evento) return null;

    aplicarEfeitosEvento(evento);

    Game.ui.updatePlayersOnlineList();
    Game.ui.updateRankingList();

    const me = Game.getPlayerByName(state.playerName);
    if (me) {
        document.getElementById('myRecursos').textContent = me.recursos;
        document.getElementById('myKPI').textContent = me.kpi;
    }

    return evento;
}

function startNewRound() {
    const evento = sortearEAplicarEvento();
    if (!evento) {
        console.error('❌ Nenhum evento disponível!');
        return;
    }
    pickNewPair(evento);
}

function pickNewPair(evento = null) {
    const state = Game.state;

    if (!evento) {
        evento = sortearEAplicarEvento();
        if (!evento) return;
    }

    // Mostra o modal do evento para todos (sempre exatamente uma vez por
    // chamada, já que não há mais recursão em busca de Respondedor).
    Game.network.broadcastAll({ type: 'show-evento', evento: evento, players: state.players });
    Game.ui.showEventoModal(evento);

    const activePlayers = Game.getActivePlayers();

    if (activePlayers.length < CONFIG.JOGO.MIN_PLAYERS) {
        console.warn('⚠️ Jogadores ativos insuficientes para continuar a partida.');
        endGame(buildRanking());
        return;
    }

    // Só considera respondedor quem ainda tem recursos — exceto na rodada
    // do evento 🛡️ Reserva de Contingência (e4), onde a resposta não gasta
    // recurso algum (acertando ou errando), então mesmo jogadores com 0
    // recursos continuam elegíveis como Respondedor nessa rodada.
    const semCustoNestaRodada = evento?.reserva_contingencia === true;

    const elegiveis = semCustoNestaRodada
        ? activePlayers
        : activePlayers.filter(p => p.recursos > 0);

    if (elegiveis.length === 0) {
        console.warn('⚠️ Nenhum jogador ativo tem recursos. Encerrando partida.');
        endGame(buildRanking());
        return;
    }

    // Quem está sem recursos "pula a vez" — mas o pulo CONTA como turno
    // para o rodízio (respostasCount), senão o jogador ficaria pra sempre
    // atrás na fila assim que voltasse a ter recursos.
    if (!semCustoNestaRodada) {
        activePlayers
            .filter(p => p.recursos <= 0)
            .forEach(p => {
                state.respostasCount[p.name] = (state.respostasCount[p.name] || 0) + 1;
                console.log('⏭️ ' + p.name + ' sem recursos — pulando a vez (contabilizado no rodízio).');
            });
    }

    // Rodízio por contador: escolhe entre os elegíveis com o menor número
    // de respostas já dadas, garantindo que todos respondam antes de
    // qualquer um repetir.
    const minRespostas = Math.min(...elegiveis.map(p => state.respostasCount[p.name] || 0));
    const available = elegiveis.filter(p => (state.respostasCount[p.name] || 0) === minRespostas);

    const respondedor = available[Math.floor(Math.random() * available.length)];
    const askers = activePlayers.filter(p => p.peerId !== respondedor.peerId);
    if (askers.length === 0) return;

    const perguntador = askers[Math.floor(Math.random() * askers.length)];
    const pergunta = sortearPergunta(respondedor.phase);

    // BUGFIX: antes, se sortearPergunta() retornasse null (nenhuma área
    // tem perguntas disponíveis para a fase do respondedor, mesmo após
    // resetar o baralho — ex.: baralho da fase vazio no JSON de
    // perguntas), a função só logava um erro e retornava. Como o modal de
    // evento e o broadcast 'show-evento' já tinham sido disparados para
    // TODOS os jogadores antes deste ponto, a partida ficava travada
    // silenciosamente: ninguém recebia 'round-start', a tela de espera
    // nunca saía do lugar, e nada avançava até o timer da sessão zerar
    // sozinho. Agora tentamos novamente com outro respondedor elegível
    // (pode haver perguntas para a fase de outro jogador); se ninguém
    // tiver pergunta disponível, encerra a partida em vez de travar.
    if (!pergunta) {
        console.error('❌ Sem pergunta disponível para a fase de ' + respondedor.name + ' (' + respondedor.phase + ')!');

        const outrosElegiveis = elegiveis.filter(p => p.peerId !== respondedor.peerId);
        const temPerguntaParaAlgumOutro = outrosElegiveis.some(p => temPerguntaDisponivelParaFase(p.phase));

        if (temPerguntaParaAlgumOutro) {
            // Conta o turno "perdido" do respondedor sem pergunta (evita
            // loop infinito sempre recaindo nele) e tenta de novo.
            state.respostasCount[respondedor.name] = (state.respostasCount[respondedor.name] || 0) + 1;
            pickNewPair(evento);
            return;
        }

        console.error('❌ Nenhum jogador ativo tem pergunta disponível. Encerrando partida.');
        endGame(buildRanking());
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
        respondedor: respondedor.name,
        respostasCount: state.respostasCount
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

    // O Respondedor NUNCA deve receber o gabarito (`correta`), mesmo
    // quando ele próprio for o host.
    Game.network.sendToPlayer(respondedor.peerId, { ...perguntaData, isRespondedor: true, correta: undefined });

    if (state.playerName !== perguntador.name && state.playerName !== respondedor.name) {
        Game.ui.displaySpectatorView(perguntador.name, respondedor.name);
    }

    Game.ui.displayRoundStart();

    // Timeout de segurança: se o Respondedor sumir (queda de conexão sem
    // o evento 'close' disparar, aba em segundo plano travada, etc), a
    // rodada é tratada como resposta errada, liberando a vez.
    armarRespostaTimeout(respondedor.name);

    Game.saveState();
}

/**
 * Checa (sem consumir) se existe ao menos uma pergunta disponível para a
 * fase informada — considerando também o reset automático do baralho que
 * sortearPergunta() faria. Usada apenas para decidir, em pickNewPair(),
 * se vale a pena tentar outro respondedor antes de desistir e encerrar a
 * partida.
 */
function temPerguntaDisponivelParaFase(grupoProcesso) {
    const state = Game.state;
    for (const [key, area] of Object.entries(state.questionsData?.areas || {})) {
        if (!area.grupos.includes(grupoProcesso)) continue;
        const baralho = state.baralhos[key];
        // Se o baralho já tem disponíveis>0, ou se tem perguntas no total
        // (podendo ser resetado), consideramos que há pergunta possível.
        if (baralho && (baralho.disponiveis > 0 || baralho.total > 0)) return true;
    }
    return false;
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

/**
 * Arma (ou rearma) o timeout de segurança da Assessoria pendente.
 * Extraído para função reutilizável para que becomeHost() (game-network.js)
 * também consiga rearmá-lo após uma migração de host ocorrida no meio de
 * uma Assessoria ainda pendente.
 */
function armarAssessoriaTimeout() {
    const state = Game.state;
    if (state.assessoriaTimeout) clearTimeout(state.assessoriaTimeout);
    state.assessoriaTimeout = setTimeout(() => {
        handleAssessoriaAnswer({ alternativa: null, recusado: true, timeout: true });
    }, CONFIG.JOGO.ASSESSORIA_TIMEOUT);
}

function resetBaralho(areaKey) {
    const baralho = Game.state.baralhos[areaKey];
    if (baralho) {
        baralho.perguntas.forEach(p => p.usada = false);
        baralho.disponiveis = baralho.total;
    }
}

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

    // Só afeta quem ainda está ativo na partida — jogadores que saíram
    // (waitingInLobby) não devem ganhar nem perder recursos por eventos
    // sorteados depois que pararam de jogar.
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

/**
 * Sorteia o evento da rodada. O evento marcado como "neutro" (sem efeito
 * em recursos) tem 50% de chance de ser escolhido; os demais eventos
 * dividem os outros 50% uniformemente entre si.
 */
function sortearEvento() {
    const eventos = Game.state.questionsData?.eventos || [];
    if (eventos.length === 0) return null;

    const neutro = eventos.find(e => e.neutro === true);
    const outros = eventos.filter(e => e.neutro !== true);

    if (neutro && (outros.length === 0 || Math.random() < 0.5)) {
        return neutro;
    }
    return outros[Math.floor(Math.random() * outros.length)];
}

// ============================================
// RESPOSTA E KPI (COM RECURSOS)
// ============================================

function handleAnswer(msg, fromPeerId) {
    const state = Game.state;

    // state.currentRound pode ser null se esta mensagem chegar atrasada
    // (ex.: latência de rede) logo após o fim da partida, já que endGame()
    // zera state.currentRound explicitamente.
    if (!state.currentRound) {
        console.warn('⚠️ handleAnswer chamado sem rodada ativa — ignorando (provavelmente resposta atrasada).');
        return;
    }

    const { respondedor: respondedorName } = state.currentRound;

    if (msg.playerName !== respondedorName) {
        console.warn('⚠️ Resposta ignorada: jogador não é o respondedor da rodada.');
        return;
    }

    // Valida que a mensagem veio da conexão do próprio Respondedor, não
    // apenas que o campo `playerName` do payload bate com o nome dele.
    // fromPeerId é omitido nas chamadas internas do próprio host
    // (armarRespostaTimeout expirando, host respondendo localmente como
    // Respondedor, ou o reprocessamento de pendingAnswer) e essas ficam
    // isentas da checagem.
    if (fromPeerId !== undefined) {
        const respondedorPlayer = Game.getPlayerByName(respondedorName);
        if (!respondedorPlayer || respondedorPlayer.peerId !== fromPeerId) {
            console.warn('⚠️ answer ignorado: remetente não é o Respondedor da rodada.');
            return;
        }
    }

    if (state.currentRound.respondeu) {
        console.warn('⚠️ Rodada já foi respondida!');
        return;
    }

    // O Respondedor efetivamente respondeu (ou o timeout de segurança
    // disparou) — cancela o timeout pendente.
    if (state.respostaTimeout) {
        clearTimeout(state.respostaTimeout);
        state.respostaTimeout = null;
    }

    // Se há uma assessoria pendente para esta rodada, não processa a
    // resposta ainda — guarda e reprocessa quando a assessoria for
    // resolvida (aceita, recusada ou expirada).
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
    const respondedor = Game.getPlayerByName(respondedorName);

    // Se o respondedor já tiver sido removido de state.players (ex.:
    // desconexão detectada entre o disparo do armarRespostaTimeout e sua
    // execução), aborta a rodada e sorteia uma nova em vez de travar a
    // partida para todos os demais jogadores.
    if (!respondedor) {
        console.warn('⚠️ Respondedor não encontrado (provavelmente desconectou) — abortando rodada.');
        state.currentRound = null;
        if (state.isHost) setTimeout(() => pickNewPair(), 500);
        Game.saveState();
        return;
    }

    // Reserva de Contingência (e4) — não gasta recurso, acertando ou errando
    const temReserva = evento?.reserva_contingencia === true;
    const gastaRecurso = !temReserva;

    // Segunda linha de defesa: o respondedor já é filtrado em
    // pickNewPair() para nunca chegar aqui sem recursos, exceto justamente
    // na rodada de Reserva de Contingência, onde 0 recursos é uma situação
    // válida e esperada.
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
        state.respostasCount[respondedorName] = (state.respostasCount[respondedorName] || 0) + 1;
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

    state.respostasCount[respondedorName] = (state.respostasCount[respondedorName] || 0) + 1;

    const faseIdx = Game.getFaseIndex(respondedor.phase);

    if (faseIdx === CONFIG.FASES.length - 1 && respondedor.activities >= CONFIG.JOGO.ACTIVITIES_PER_PHASE) {
        setTimeout(() => endGame(buildRanking()), 3000);
    } else {
        setTimeout(() => nextTurn(), 3000);
    }

    Game.saveState();
}

function nextTurn() {
    Game.core.pickNewPair();
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
        // BUGFIX: quando o host é o próprio Respondedor, handleAssessoriaRequest()
        // roda de forma SÍNCRONA. Se o pedido for rejeitado por uma condição de
        // corrida (ex.: assessor ficou inválido), showAssessoriaResult() já roda
        // aqui dentro e limpa state.currentRound.assessoria antes deste ponto.
        // Sem esta checagem, requestAssessoria() sempre retornava true e
        // escolherAssessor() (game-ui.js) sobrescrevia de volta para "pending",
        // travando o host numa assessoria fantasma que nunca seria respondida.
        const resultado = state.currentRound?.assessoria;
        if (!resultado || resultado.assessorName !== assessorName || resultado.status !== 'pending') {
            return false;
        }
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
 * do cliente.
 */
function handleAssessoriaRequest(msg, fromPeerId) {
    const state = Game.state;
    if (!state.isHost || !state.currentRound || state.currentRound.assessoria) return;
    if (msg.requesterName !== state.currentRound.respondedor) return;

    // Valida que o pedido veio realmente da conexão do Respondedor da
    // rodada, e não de outro jogador se passando por ele com o nome certo
    // no payload.
    if (fromPeerId !== undefined) {
        const requesterConn = Game.getPlayerByName(msg.requesterName);
        if (!requesterConn || requesterConn.peerId !== fromPeerId) {
            console.warn('⚠️ assessoria-request ignorado: remetente não é o Respondedor da rodada.');
            return;
        }
    }

    // O host é a fonte da verdade e não deve confiar só na UI do cliente
    // para bloquear um pedido de assessoria após a rodada já ter sido
    // respondida.
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

    // Valida no host (fonte da verdade) que o Respondedor não está na fase
    // de Encerramento — o host nunca deve confiar apenas no que o cliente
    // diz sobre seu próprio estado.
    const requesterEmEncerramento = requester &&
        Game.getFaseIndex(requester.phase) === CONFIG.FASES.length - 1;

    const invalido =
        !assessor ||
        assessor.waitingInLobby ||
        assessor.disconnected ||
        requesterEmEncerramento ||
        msg.assessorName === state.currentRound.perguntador ||
        msg.assessorName === state.currentRound.respondedor;

    // Se o assessor ficou inválido por alguma condição de corrida (ex.:
    // saiu da partida entre a seleção e o envio) ou por o Respondedor
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

    // Pausa o timeout de segurança da resposta enquanto se aguarda o
    // assessor. Esse timeout existe para detectar um Respondedor que
    // sumiu (queda de conexão), não para penalizar quem está seguindo o
    // fluxo de Assessoria (até 20s de espera + tempo de decisão).
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

    armarAssessoriaTimeout();
    Game.saveState();
}

/**
 * HOST: processa a resposta (ou recusa/timeout) do assessor.
 */
function handleAssessoriaAnswer(msg, fromPeerId) {
    const state = Game.state;
    if (!state.isHost || !state.currentRound || !state.currentRound.assessoria) return;
    if (state.currentRound.assessoria.status !== 'pending') return;

    // Só aceita a resposta se ela vier da conexão do assessor efetivamente
    // designado nesta rodada. fromPeerId só é omitido nas chamadas
    // internas do próprio host (timeout de 20s), que são a fonte da
    // verdade e não precisam dessa checagem.
    if (fromPeerId !== undefined) {
        const assessorDesignado = Game.getPlayerByName(state.currentRound.assessoria.assessorName);
        if (!assessorDesignado || assessorDesignado.peerId !== fromPeerId) {
            console.warn('⚠️ assessoria-answer ignorado: remetente não é o assessor designado da rodada.');
            return;
        }
    }

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

    // broadcastAll() nunca reenvia a mensagem para o próprio host (só
    // existe conexão P2P com os outros peers). Quando o HOST é o
    // Respondedor que pediu a assessoria, precisamos entregar o resultado
    // localmente também (mesmo padrão usado em processVenda/handleAnswer).
    // showAssessoriaResult() já ignora a chamada se quem está rodando não
    // for o Respondedor, então é seguro chamar sempre.
    Game.ui.showAssessoriaResult(resultMsg);

    // A Assessoria foi resolvida (aceita, recusada ou expirada) e o
    // Respondedor ainda não enviou a resposta final — rearma o timeout de
    // segurança do zero, dando a ele o tempo cheio para decidir.
    if (!state.currentRound.respondeu && !state.currentRound.pendingAnswer) {
        armarRespostaTimeout(state.currentRound.respondedor);
    }
    // Se o Respondedor já tinha enviado uma resposta enquanto a assessoria
    // ainda estava pendente, processa agora que ela foi resolvida.
    if (state.currentRound.pendingAnswer) {
        const pending = state.currentRound.pendingAnswer;
        state.currentRound.pendingAnswer = null;
        handleAnswer(pending);
    }
    Game.saveState();
}

// ============================================
// CONTROLE DE PARTIDA
// ============================================

function startGame() {
    const state = Game.state;
    state.gameStarted = true;
    state.gameOver = false; // endGame() define gameOver=true e nada revertia isso antes

    state.respostasCount = {};

    // Reseta todos os jogadores (KPI, fase, atividades, recursos) para que
    // toda nova partida comece do zero, mesmo que a anterior tenha
    // terminado naturalmente sem passar por "Encerrar Partida".
    Game.resetAllPlayers();

    // Sincroniza o HUD do próprio jogador com o estado recém-resetado, em
    // vez de depender do texto padrão do HTML ou do broadcast do primeiro
    // evento (show-evento) chegar a tempo para guests.
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

    // Cancela qualquer timeout de assessoria/resposta pendente e zera a
    // rodada atual — evita que eles disparem depois do fim da partida,
    // atualizando KPI/recursos ou chamando handlers para uma rodada que
    // não existe mais.
    if (state.assessoriaTimeout) {
        clearTimeout(state.assessoriaTimeout);
        state.assessoriaTimeout = null;
    }
    if (state.respostaTimeout) {
        clearTimeout(state.respostaTimeout);
        state.respostaTimeout = null;
    }
    // Cancela também qualquer timeout de oferta de venda pendente — sem
    // isso, uma oferta em aberto no fim da partida podia disparar depois
    // do jogo já ter terminado.
    Object.values(state.vendaOfertaTimeouts || {}).forEach(t => clearTimeout(t));
    state.vendaOfertaTimeouts = {};

    // BUGFIX: antes, só o TIMEOUT da oferta era limpo acima — a entrada em
    // si ficava em pendingVendaOfertas. Se o host voltasse ao lobby
    // ("Voltar ao Lobby") e iniciasse uma nova partida sem passar por
    // "Encerrar Partida" (que já limpava isso via resetGameState()), essa
    // oferta órfã da partida anterior sobrevivia para a partida seguinte.
    state.pendingVendaOfertas = {};

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

    // Cancela timeouts pendentes (resposta/assessoria) da rodada que está
    // sendo encerrada abruptamente, evitando disparos tardios para uma
    // partida que já foi resetada. (resetGameState() também limpa esses
    // timeouts, mas cancelamos aqui também antes de zerar currentRound
    // para manter o comportamento explícito e imediato.)
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
    Game.core.resetAllBaralhos();

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
    // Mantém a cópia local do guest coerente, relevante caso ele vire
    // host numa migração futura.
    Game.core.resetAllBaralhos();
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
 * Chamado pelo cliente ao ESCOLHER um comprador. Não executa a venda de
 * imediato: envia uma OFERTA ao comprador, que precisa aceitar
 * explicitamente. A venda só é efetivada em processVenda(), chamada a
 * partir de handleVendaOfertaResponse() quando o comprador aceita.
 */
function venderRecurso(compradorName) {
    const state = Game.state;

    if (state.isHost) {
        handleVendaOfertaRequest({ vendedorName: state.playerName, compradorName });
    } else {
        Game.network.sendToHost({
            type: 'venda-offer-request',
            vendedorName: state.playerName,
            compradorName
        });
    }
    return true; // feedback otimista; rejeição chega via 'venda-rejected'
}

/**
 * HOST: cancela (se existir) o timeout de segurança de uma oferta de
 * venda pendente para o vendedor informado.
 */
function limparVendaOfertaTimeout(vendedorName) {
    const state = Game.state;
    state.vendaOfertaTimeouts = state.vendaOfertaTimeouts || {};
    if (state.vendaOfertaTimeouts[vendedorName]) {
        clearTimeout(state.vendaOfertaTimeouts[vendedorName]);
        delete state.vendaOfertaTimeouts[vendedorName];
    }
}

/**
 * HOST: arma o timeout de segurança de uma oferta de venda pendente.
 *
 * BUGFIX: diferente da resposta e da assessoria, a oferta de venda não
 * tinha nenhum timeout — se o comprador nunca respondesse (fechou a aba,
 * ficou parado sem decidir), o vendedor ficava esperando indefinidamente,
 * só "resolvido" caso ele mesmo enviasse uma nova oferta (que sobrescreve
 * a antiga) ou saísse da partida. Agora, expirada CONFIG.JOGO.VENDA_OFERTA_TIMEOUT
 * (com fallback caso a config não defina esse valor), a oferta é tratada
 * como recusada automaticamente e o vendedor é avisado.
 */
function armarVendaOfertaTimeout(vendedorName, compradorName) {
    const state = Game.state;
    limparVendaOfertaTimeout(vendedorName);

    const timeoutMs = CONFIG.JOGO.VENDA_OFERTA_TIMEOUT || 30000;

    state.vendaOfertaTimeouts = state.vendaOfertaTimeouts || {};
    state.vendaOfertaTimeouts[vendedorName] = setTimeout(() => {
        // A oferta pode já ter sido resolvida (aceita/recusada) por uma
        // resposta que chegou bem perto do timeout — confere se ainda é a
        // mesma oferta pendente antes de expirar automaticamente.
        if (state.pendingVendaOfertas?.[vendedorName] !== compradorName) return;

        console.warn('⌛ Timeout: oferta de venda de ' + vendedorName + ' para ' + compradorName + ' expirou sem resposta.');
        handleVendaOfertaResponse({ vendedorName, compradorName, aceito: false, timeout: true });
    }, timeoutMs);
}

/**
 * HOST: valida a oferta e a encaminha ao comprador para aceite/recusa.
 */
function handleVendaOfertaRequest(msg, fromPeerId) {
    const state = Game.state;
    if (!state.isHost) return;

    const vendedor = Game.getPlayerByName(msg.vendedorName);
    const comprador = Game.getPlayerByName(msg.compradorName);

    // Valida que a oferta veio realmente da conexão do vendedor informado
    // no payload, e não de outro jogador oferecendo os recursos de terceiros.
    if (fromPeerId !== undefined && (!vendedor || vendedor.peerId !== fromPeerId)) {
        console.warn('⚠️ venda-offer-request ignorado: remetente não é o vendedor informado.');
        return;
    }

    const erro =
        (!vendedor || !comprador) ? 'Vendedor ou comprador não encontrado.' :
            (vendedor.name === comprador.name) ? 'Você não pode vender para si mesmo.' :
                (vendedor.waitingInLobby || comprador.waitingInLobby || vendedor.disconnected || comprador.disconnected) ? 'Jogador não está mais ativo na partida.' :
                    (vendedor.recursos < 1) ? 'Vendedor não tem recursos para vender.' :
                        (comprador.kpi < CONFIG.KPI.VALOR_VENDA_RECURSO) ? 'Comprador não tem KPI suficiente.' :
                            null;

    if (erro) {
        console.warn('⚠️ Oferta de venda rejeitada:', erro);
        Game.network.sendToPlayer(vendedor?.peerId, { type: 'venda-rejected', motivo: erro });
        return;
    }

    // Registra a oferta pendente NO HOST (fonte da verdade) antes de
    // notificar o comprador — sem isso, qualquer jogador podia forjar uma
    // 'venda-offer-response' com vendedorName de outro jogador e
    // aceito:true, forçando a venda de recursos de quem nunca ofereceu
    // nada. Uma nova oferta do mesmo vendedor sobrescreve a anterior.
    state.pendingVendaOfertas = state.pendingVendaOfertas || {};
    state.pendingVendaOfertas[vendedor.name] = comprador.name;

    // Arma o timeout de segurança desta oferta (ver armarVendaOfertaTimeout).
    armarVendaOfertaTimeout(vendedor.name, comprador.name);

    // Propaga a oferta pendente para TODOS os clientes (não só o
    // comprador), para que qualquer um deles, ao eventualmente assumir
    // como host numa migração, já tenha essa oferta em memória.
    Game.network.broadcastAll({
        type: 'venda-oferta-sync',
        action: 'add',
        vendedorName: vendedor.name,
        compradorName: comprador.name
    });

    Game.network.sendToPlayer(comprador.peerId, {
        type: 'venda-offer',
        vendedorName: vendedor.name,
        compradorName: comprador.name,
        valor: CONFIG.KPI.VALOR_VENDA_RECURSO
    });

    Game.saveState();
}

/**
 * HOST: processa a resposta do comprador (aceite ou recusa) a uma oferta.
 *
 * BUGFIX: fromPeerId só é validado quando é fornecido (mesmo padrão de
 * handleVendaOfertaRequest/handleAnswer/handleAssessoriaRequest). Antes,
 * a checagem `comprador.peerId !== fromPeerId` rodava incondicionalmente;
 * como game-ui.js chama esta função sem passar fromPeerId quando o
 * próprio host é o comprador (fromPeerId fica undefined), a comparação
 * nunca batia e a venda era sempre rejeitada nesse cenário — o host
 * ficava preso na tela "Aguardando aceitar oferta..." ao tentar comprar
 * de outro jogador.
 */
function handleVendaOfertaResponse(msg, fromPeerId) {
    const state = Game.state;
    if (!state.isHost) return;

    // Só aceita a resposta se vier da conexão do COMPRADOR da oferta
    // original — evita que qualquer jogador aceite ou recuse, em nome de
    // outro, uma oferta de venda que não é sua. Chamadas internas do
    // próprio host (timeout de segurança) não passam fromPeerId.
    const comprador = Game.getPlayerByName(msg.compradorName);
    if (fromPeerId !== undefined && (!comprador || comprador.peerId !== fromPeerId)) {
        console.warn('⚠️ venda-offer-response ignorado: remetente não é o comprador da oferta.');
        return;
    }

    // Só processa a resposta se existir, no HOST, uma oferta pendente
    // registrada EXATAMENTE para este par vendedor→comprador — evita
    // ofertas forjadas ou reenvio duplicado (duplo clique / replay)
    // executando a venda mais de uma vez.
    const pendingComprador = state.pendingVendaOfertas && state.pendingVendaOfertas[msg.vendedorName];
    if (pendingComprador !== msg.compradorName) {
        console.warn('⚠️ venda-offer-response ignorado: nenhuma oferta pendente correspondente.');
        return;
    }
    // Consome a oferta imediatamente — resolvida (aceita ou recusada), ela
    // deixa de existir e não pode ser respondida de novo.
    delete state.pendingVendaOfertas[msg.vendedorName];
    limparVendaOfertaTimeout(msg.vendedorName);

    // Propaga a resolução (consumo) da oferta para todos os clientes.
    Game.network.broadcastAll({
        type: 'venda-oferta-sync',
        action: 'remove',
        vendedorName: msg.vendedorName
    });

    Game.saveState();

    if (!msg.aceito) {
        const vendedor = Game.getPlayerByName(msg.vendedorName);
        if (vendedor) {
            Game.network.sendToPlayer(vendedor.peerId, {
                type: 'venda-rejected',
                motivo: msg.timeout
                    ? (msg.compradorName + ' não respondeu a tempo.')
                    : (msg.compradorName + ' recusou a oferta de compra.')
            });
        }
        return;
    }

    processVenda(msg.vendedorName, msg.compradorName);
}

/**
 * HOST: valida e executa a venda de fato. Única fonte de verdade — evita
 * que vendas feitas por um guest fiquem invisíveis para os demais guests,
 * já que a topologia P2P é uma estrela (guests só têm conexão direta com
 * o host, não entre si).
 */
function processVenda(vendedorName, compradorName) {
    const state = Game.state;
    if (!state.isHost) return;

    const vendedor = Game.getPlayerByName(vendedorName);
    const comprador = Game.getPlayerByName(compradorName);

    const erro =
        (!vendedor || !comprador) ? 'Vendedor ou comprador não encontrado.' :
            (vendedor.name === comprador.name) ? 'Você não pode vender para si mesmo.' :
                (vendedor.waitingInLobby || comprador.waitingInLobby || vendedor.disconnected || comprador.disconnected) ? 'Jogador não está mais ativo na partida.' :
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
        !p.disconnected &&
        p.kpi >= CONFIG.KPI.VALOR_VENDA_RECURSO
    );
}

// ============================================
// CONTROLE DE SESSÃO
// ============================================

function endSession() {
    if (!Game.state.isHost) return;
    if (!confirm('⛔ Encerrar a sessão? Todos os jogadores serão desconectados e a sala destruída.')) return;

    Game.ui.closeAllModals();
    Game.network.broadcastAll({ type: 'session-ended' });
    Game.network.cleanup();
    window.location.href = 'index.html';
}

/**
 * Além de atualizar a cópia local (feedback imediato para quem saiu),
 * notifica o host via 'leave-match-request'; o host é quem de fato marca
 * o jogador como waitingInLobby na fonte da verdade e propaga a mudança
 * para todos via 'player-list' (ver handleLeaveMatchRequest, abaixo).
 * Sem essa notificação de rede, o host e os demais jogadores continuariam
 * enxergando o jogador como ativo, podendo sorteá-lo como perguntador ou
 * respondedor mesmo após ele já ter saído.
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
 * Aborta a rodada atual (se ainda não respondida) quando um dos
 * participantes (perguntador ou respondedor) deixa de estar disponível —
 * seja por sair voluntariamente da partida (leaveMatch) ou por
 * desconexão involuntária (queda de conexão, ver handleGuestDisconnected em
 * game-network.js). Extraído para reutilização em handleLeaveMatchRequest.
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

/**
 * HOST: processa o pedido de um guest para sair da partida em andamento.
 * É a fonte da verdade — marca o jogador como waitingInLobby na cópia
 * oficial de state.players e propaga via broadcast, igual ao padrão já
 * usado para entrada/saída de jogadores (addPlayer/handleGuestDisconnected).
 */
function handleLeaveMatchRequest(msg, fromPeerId) {
    const state = Game.state;
    if (!state.isHost) return;

    const player = Game.getPlayerByName(msg.playerName);
    if (!player || player.waitingInLobby) return;

    // Só aceita o pedido de saída se ele vier da própria conexão do
    // jogador referenciado — evita que um jogador tire outro da partida
    // remotamente apenas informando o nome dele no payload.
    if (fromPeerId !== undefined && player.peerId !== fromPeerId) {
        console.warn('⚠️ leave-match-request ignorado: remetente não é o próprio jogador.');
        return;
    }

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

    Game.ui.closeAllModals();
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
    sortearEAplicarEvento,
    temPerguntaDisponivelParaFase,
    armarRespostaTimeout,
    armarAssessoriaTimeout,
    sortearPergunta,
    resetBaralho,
    resetAllBaralhos,
    aplicarEfeitosEvento,
    sortearEvento,
    handleAnswer,
    updatePlayerKPI,
    nextTurn,
    startGame,
    endGame,
    endMatch,
    handleMatchEnded,
    endSession,
    leaveMatch,
    handleLeaveMatchRequest,
    abortRoundIfParticipant,
    leaveSession,
    buildRanking,
    handleVendaOfertaRequest,
    handleVendaOfertaResponse,
    venderRecurso,
    processVenda,
    getCompradores,
    armarVendaOfertaTimeout,
    limparVendaOfertaTimeout,
    requestAssessoria,
    handleAssessoriaRequest,
    handleAssessoriaAnswer
};