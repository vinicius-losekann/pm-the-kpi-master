// ============================================
// PM: The KPI Master - Ferramentas de Debug
// ============================================
// Exclusivo para desenvolvimento. Use no console (F12) para simular
// jogadores, partidas e testar funcionalidades.
// Comente a linha de inclusão em game.html para produção.
// Fase 7.3 do roadmap — substitui js/game-debug.js.
//
// 🐛 REGRESSÃO-002 (ver ISSUES.md): assim como a REGRESSÃO-001
// (resetAllBaralhos, encontrada na Fase 5), este arquivo chamava
// Game.core.sortearPergunta(), Game.core.sortearEvento() e
// Game.core.aplicarEfeitosEvento() — wrappers que existiam no
// game-core.js original mas foram removidos na Fase 3 (o
// turnEngine.js passou a chamar os domain/*.js diretamente, sem
// recriar esses wrappers). Como game-debug.js só foi migrado agora,
// o gap não tinha sido pego ainda. Corrigido chamando
// Game.domain.deck.sortearPergunta(...) e Game.domain.event.* direto.
// ============================================

window.Game = window.Game || {};

window.Game.debug = {

    /**
     * Cria jogadores falsos para testar sem conectar outros dispositivos.
     * @param {number} count – número de jogadores (máx 6)
     */
    fakePlayers(count = 3) {
        const state = Game.state;
        const names = ['Host_Debug', 'Guest1_Debug', 'Guest2_Debug', 'Guest3_Debug', 'Guest4_Debug', 'Guest5_Debug'];
        state.players = [];

        for (let i = 0; i < Math.min(count, 6); i++) {
            state.players.push({
                name: names[i],
                peerId: `fake-peer-${i}`,
                kpi: 0,
                phase: CONFIG.FASES[0].id,
                activities: 0,
                isHost: i === 0,
                waitingInLobby: false,
                recursos: CONFIG.RECURSOS_INICIAIS
            });
        }

        state.isHost = true;
        state.playerName = names[0];
        state.peerId = 'fake-peer-0';
        state.hostPeerId = 'fake-peer-0';

        console.log(`✅ ${count} jogadores falsos criados:`, state.players.map(p => p.name).join(', '));
        console.log('👑 Host:', names[0]);
        console.log('👤 Guests:', state.players.filter(p => !p.isHost).map(p => p.name).join(', '));
        console.log('📦 Recursos iniciais:', CONFIG.RECURSOS_INICIAIS, 'por jogador');
        Game.ui.updatePlayersList();
        Game.ui.checkStartCondition();
    },

    /**
     * Simula o início de uma partida com os jogadores existentes.
     * É necessário ter carregado as perguntas previamente.
     */
    fakeStartGame() {
        const state = Game.state;

        if (state.players.length < 2) {
            console.warn('⚠️ Crie jogadores primeiro: Game.debug.fakePlayers(3)');
            return;
        }

        if (!state.questionsData || Object.keys(state.questionsData.domains || {}).length === 0) {
            console.warn('⚠️ Perguntas não carregadas.');
            return;
        }

        state.gameStarted = true;
        state.gameOver = false;
        state.usedRespondedorThisRound = [];
        state.timer = CONFIG.JOGO.SESSION_DURATION;

        Game.resetAllPlayers();

        Game.ui.showScreen('game');
        Game.ui.updateTimerDisplay();
        Game.ui.updatePlayersOnlineList();
        Game.ui.updateRankingList();
        console.log('✅ Partida simulada iniciada!');
    },

    /**
     * Testa o sorteio de perguntas, mostrando a distribuição por área.
     * @param {number} times – número de sorteios a realizar
     * @param {string} fase – fase para filtrar as perguntas
     */
    testSortear(times = 20, fase = 'planejamento') {
        const state = Game.state;
        if (!state.questionsData) { console.warn('⚠️ Perguntas não carregadas.'); return; }

        console.log(`📊 Testando sortearPergunta('${fase}') ${times}x...`);
        const contagem = {};
        const perguntasSorteadas = [];

        for (let i = 0; i < times; i++) {
            const p = Game.domain.deck.sortearPergunta(state.baralhos, state.questionsData, fase);
            if (p) {
                contagem[p.domain_key] = (contagem[p.domain_key] || 0) + 1;
                perguntasSorteadas.push(p.id);
            }
        }

        console.log('📊 Distribuição por domínio:');
        for (const [domain, count] of Object.entries(contagem)) {
            console.log(`   ${domain}: ${count}x ${'█'.repeat(Math.max(1, count))}`);
        }

        const unicas = new Set(perguntasSorteadas);
        console.log(unicas.size === perguntasSorteadas.length ? '✅ Nenhuma repetida!' : `⚠️ ${perguntasSorteadas.length - unicas.size} repetidas.`);
    },

    /**
     * Simula N respostas para um jogador, avançando no KPI e fases.
     * @param {number} count – número de respostas simuladas
     * @param {string} playerName – nome do jogador (opcional, padrão = próprio)
     */
    testKPI(count = 5, playerName = null) {
        const state = Game.state;
        const name = playerName || state.playerName;

        if (!state.gameStarted) { console.warn('⚠️ Inicie a partida primeiro.'); return; }

        const player = Game.getPlayerByName(name);
        if (!player) { console.warn(`⚠️ Jogador "${name}" não encontrado.`); return; }

        console.log(`🎯 Simulando ${count} respostas para ${name}...`);
        console.log(`   Recursos: ${player.recursos} | Fase: ${Game.getFaseById(player.phase).emoji} | KPI: ${player.kpi}`);

        for (let i = 0; i < count; i++) {
            if (player.recursos <= 0) { console.log(`   ⚠️ Sem recursos! Pulando...`); continue; }

            const pergunta = Game.domain.deck.sortearPergunta(state.baralhos, state.questionsData, player.phase);
            if (!pergunta) break;

            const acertou = Math.random() < 0.5;
            const evento = (state.questionsData?.eventos || [])[Math.floor(Math.random() * state.questionsData.eventos.length)];
            const temSeguro = evento?.reserva_contingencia === true;
            const gastaRecurso = !temSeguro;
            if (gastaRecurso) player.recursos--;

            let kpiGanho = 0;
            if (acertou) {
                kpiGanho = CONFIG.KPI.ACERTO_BASE;
                player.kpi += kpiGanho;
                player.activities++;
                const faseIdx = Game.getFaseIndex(player.phase);
                if (player.activities >= CONFIG.JOGO.ACTIVITIES_PER_PHASE && faseIdx < CONFIG.FASES.length - 1) {
                    player.phase = CONFIG.FASES[faseIdx + 1].id;
                    player.activities = 0;
                }
            }

            const status = acertou ? '✅' : '❌';
            const fase = Game.getFaseById(player.phase);
            const gastoMsg = gastaRecurso ? '-1📦' : '📦🛡️';
            console.log(`   ${i + 1}. ${status} → +${kpiGanho} KPI | ${gastoMsg} | ${fase.emoji} | Recursos: ${player.recursos} | Total: ${player.kpi}`);
        }

        Game.ui.updatePlayersOnlineList();
        Game.ui.updateRankingList();

        if (name === state.playerName) {
            document.getElementById('myKPI').textContent = player.kpi;
            document.getElementById('myRecursos').textContent = player.recursos;
        }

        console.log('✅ Teste concluído!');
    },

    /**
     * Força um jogador a pular para uma fase específica (útil para testes).
     */
    skipToPhase(phaseId, playerName) {
        const name = playerName || Game.state.playerName;
        const player = Game.getPlayerByName(name);
        if (!player) { console.warn(`⚠️ Jogador "${name}" não encontrado.`); return; }
        if (!CONFIG.FASES.find(f => f.id === phaseId)) { console.warn(`⚠️ Fase inválida.`); return; }

        player.phase = phaseId;
        player.activities = 0;
        const fase = Game.getFaseById(phaseId);
        console.log(`✅ ${name} pulou para ${fase.emoji} ${fase.nome}`);
        Game.ui.updatePlayersOnlineList();
    },

    // ============================================
    // TESTES DE PEDIDO DE AJUDA (ex-VENDA — Fase 9)
    // ============================================
    // Reescritos para refletir o novo fluxo: só quem está com 0
    // recursos pede ajuda; quem doa ganha KPI. Chamam diretamente
    // Game.core.processAjuda() (o host, sem passar pela fila/rede) —
    // mesma matemática de sempre, só sem o passo de escolha manual.

    /**
     * Simula uma doação entre dois jogadores (sem passar pela fila).
     */
    testAjuda(doadorName, requesterName) {
        const doador = Game.getPlayerByName(doadorName);
        const requester = Game.getPlayerByName(requesterName);

        if (!doador || !requester) {
            console.warn('⚠️ Jogador não encontrado.');
            console.log('💡 Jogadores disponíveis:', Game.state.players.map(p => p.name).join(', '));
            return;
        }

        console.log('🆘 Simulando ajuda...');
        console.log('   ANTES:');
        console.log('   ' + doador.name + ': ⭐' + doador.kpi + ' | 📦' + doador.recursos);
        console.log('   ' + requester.name + ': ⭐' + requester.kpi + ' | 📦' + requester.recursos);

        const ok = Game.core.processAjuda(doadorName, requesterName);
        if (!ok) { console.warn('⚠️ Ajuda rejeitada (ver validarVenda em domain/tradeRules.js).'); return; }

        console.log('   DEPOIS:');
        console.log('   ' + doador.name + ': ⭐' + doador.kpi + ' | 📦' + doador.recursos + ' (+' + CONFIG.KPI.VALOR_VENDA_RECURSO + ' KPI)');
        console.log('   ' + requester.name + ': ⭐' + requester.kpi + ' | 📦' + requester.recursos + ' (+1📦)');
        console.log('✅ Ajuda simulada com sucesso!');
    },

    /**
     * Simula várias doações automáticas — sempre de quem tem mais
     * recurso pra quem está com 0 (reflete a ordem real da fila).
     */
    testAjudasAutomaticas(quantidade = 3) {
        const state = Game.state;
        if (!state.gameStarted) { console.warn('⚠️ Inicie a partida primeiro.'); return; }

        console.log('🆘 Simulando ' + quantidade + ' pedidos de ajuda automáticos...\n');

        for (let i = 0; i < quantidade; i++) {
            const requesters = [...state.players]
                .filter(p => p.recursos <= 0 && p.kpi >= CONFIG.KPI.VALOR_VENDA_RECURSO && !p.waitingInLobby);

            const doadores = [...state.players]
                .filter(p => p.recursos >= 1 && !p.waitingInLobby)
                .sort((a, b) => b.recursos - a.recursos);

            if (requesters.length === 0 || doadores.length === 0) {
                console.warn('⚠️ Sem jogadores pedindo ajuda ou sem doadores disponíveis.');
                break;
            }

            const requester = requesters[0];
            const doador = doadores.find(d => d.name !== requester.name);

            if (!doador) { console.warn('⚠️ Nenhum doador elegível.'); break; }

            const ok = Game.core.processAjuda(doador.name, requester.name);
            if (!ok) { console.warn('⚠️ Ajuda rejeitada nessa rodada de teste.'); break; }

            console.log('   🆘 ' + doador.name + ' → ' + requester.name + ' | +' + CONFIG.KPI.VALOR_VENDA_RECURSO + '⭐ / +1📦 pra quem pediu');
        }

        console.log('\n📊 Estado após ajudas:');
        state.players.forEach(p => console.log('   ' + p.name + ': ⭐' + p.kpi + ' | 📦' + p.recursos));
        console.log('✅ Ajudas automáticas concluídas!');
    },

    // ============================================
    // SIMULAÇÃO COMPLETA DE PARTIDA
    // ============================================

    /**
     * Simula uma partida completa com acertos aleatórios e vendas automáticas.
     * @param {number} numJogadores – número de jogadores (usa os existentes ou cria)
     * @param {number} chanceAcerto – probabilidade de acerto (0..1)
     */
    async simularPartidaCompleta(numJogadores = 3, chanceAcerto = 0.5) {
        const MAX_RODADAS = 500;
        const MAX_SEM_RECURSOS = 10;

        console.log('🚀 Iniciando simulação de partida completa...');
        console.log(`👥 Jogadores: ${numJogadores} | 🎯 Chance de acerto: ${Math.round(chanceAcerto * 100)}%`);
        console.log(`📦 Recursos iniciais: ${CONFIG.RECURSOS_INICIAIS} | ⭐ KPI por acerto: ${CONFIG.KPI.ACERTO_BASE}`);
        console.log(`🆘 Valor do pedido de ajuda: ${CONFIG.KPI.VALOR_VENDA_RECURSO} KPI por recurso`);
        console.log('🛑 Termina quando o PRIMEIRO completar o Encerramento\n');

        if (Game.state.players.length < 2) {
            console.log('💡 Criando jogadores automaticamente...');
            this.fakePlayers(numJogadores);
        }

        if (!Game.state.gameStarted || Game.state.gameOver) {
            console.log('💡 Iniciando partida automaticamente...');
            this.fakeStartGame();
        }

        const jogadores = Game.state.players.filter(p => !p.waitingInLobby);
        let rodada = 0;
        let jogoFinalizado = false;
        let vencedor = null;
        let rodadasSemNinguemResponder = 0;
        let interrompidoPorTrava = false;
        let totalAjudas = 0;

        while (!jogoFinalizado) {
            rodada++;

            if (rodada > MAX_RODADAS) {
                console.error(`\n🛑 TRAVA: ${MAX_RODADAS} rodadas!`);
                interrompidoPorTrava = true;
                break;
            }

            const evento = Game.domain.event.sortearEvento(Game.state.questionsData?.eventos || []);
            Game.domain.event.aplicarEfeitosEvento(evento, jogadores);

            // Pedido de ajuda automático — só dispara pra quem está com
            // 0 recursos e tem KPI suficiente (Fase 9: rede de
            // segurança em vez de mercado livre, ver ARCHITECTURE.md).
            // Sem chance aleatória: reflete a regra real, onde o pedido
            // só acontece quando há necessidade genuína.
            if (rodada > 3) {
                jogadores
                    .filter(p => p.recursos <= 0 && p.kpi >= CONFIG.KPI.VALOR_VENDA_RECURSO)
                    .forEach(requester => {
                        const doador = jogadores
                            .filter(p => p.name !== requester.name && p.recursos >= 1)
                            .sort((a, b) => b.recursos - a.recursos)[0];
                        if (doador) {
                            doador.recursos--;
                            doador.kpi += CONFIG.KPI.VALOR_VENDA_RECURSO;
                            requester.recursos++;
                            requester.kpi -= CONFIG.KPI.VALOR_VENDA_RECURSO;
                            totalAjudas++;
                        }
                    });
            }

            console.log(`\n🔄 RODADA ${rodada} | 📋 ${evento.titulo}: ${evento.descricao}`);
            console.log('─'.repeat(50));

            const ordem = [...jogadores].sort(() => Math.random() - 0.5);
            let alguemRespondeu = false;

            for (const jogador of ordem) {
                if (jogoFinalizado) break;

                if (jogador.recursos <= 0) {
                    console.log(`   ⚠️ ${jogador.name}: SEM RECURSOS! Pulou a vez.`);
                    continue;
                }

                alguemRespondeu = true;
                const faseAtual = Game.getFaseById(jogador.phase);
                const pergunta = Game.domain.deck.sortearPergunta(Game.state.baralhos, Game.state.questionsData, jogador.phase);
                if (!pergunta) { continue; }

                const acertou = Math.random() < chanceAcerto;
                const temReserva = evento?.reserva_contingencia === true;
                const gastaRecurso = !temReserva;
                if (gastaRecurso) jogador.recursos--;

                let kpiGanho = 0;
                if (acertou) {
                    kpiGanho = CONFIG.KPI.ACERTO_BASE;
                    jogador.kpi += kpiGanho;
                    jogador.activities++;

                    const faseIdx = Game.getFaseIndex(jogador.phase);
                    if (jogador.activities >= CONFIG.JOGO.ACTIVITIES_PER_PHASE) {
                        if (faseIdx < CONFIG.FASES.length - 1) {
                            const faseAntiga = Game.getFaseById(jogador.phase);
                            jogador.phase = CONFIG.FASES[faseIdx + 1].id;
                            jogador.activities = 0;
                            const faseNova = Game.getFaseById(jogador.phase);
                            const gastoMsg = gastaRecurso ? '-1📦' : '📦🛡️';
                            console.log(`   ✅ ${jogador.name}: +${kpiGanho} KPI | ${gastoMsg} | ${faseAntiga.emoji} → ${faseNova.emoji} AVANÇOU! | 📦${jogador.recursos} | ⭐${jogador.kpi}`);
                        } else {
                            const gastoMsg = gastaRecurso ? '-1📦' : '📦🛡️';
                            console.log(`   ✅ ${jogador.name}: +${kpiGanho} KPI | ${gastoMsg} | 🏁 COMPLETOU! | 📦${jogador.recursos} | ⭐${jogador.kpi}`);
                            jogoFinalizado = true;
                            vencedor = jogador.name;
                            break;
                        }
                    } else {
                        const gastoMsg = gastaRecurso ? '-1📦' : '📦🛡️';
                        console.log(`   ✅ ${jogador.name}: +${kpiGanho} KPI | ${gastoMsg} | ${faseAtual.emoji} (${jogador.activities}/${CONFIG.JOGO.ACTIVITIES_PER_PHASE}) | 📦${jogador.recursos} | ⭐${jogador.kpi}`);
                    }
                } else {
                    const gastoMsg = gastaRecurso ? '-1📦' : '📦🛡️';
                    console.log(`   ❌ ${jogador.name}: +0 KPI | ${gastoMsg} | ${faseAtual.emoji} (${jogador.activities}/${CONFIG.JOGO.ACTIVITIES_PER_PHASE}) | 📦${jogador.recursos} | ⭐${jogador.kpi}`);
                }
            }

            if (!alguemRespondeu) {
                rodadasSemNinguemResponder++;
                if (rodadasSemNinguemResponder >= MAX_SEM_RECURSOS) {
                    console.error(`\n🛑 TRAVA: ${MAX_SEM_RECURSOS} rodadas sem resposta!`);
                    interrompidoPorTrava = true;
                    break;
                }
            } else {
                rodadasSemNinguemResponder = 0;
            }
        }

        // Resultado
        if (interrompidoPorTrava) {
            console.log('\n⚠️ SIMULAÇÃO INTERROMPIDA - ESTADO PARCIAL:');
            jogadores.forEach(p => {
                const fase = Game.getFaseById(p.phase);
                const kpiFinal = p.kpi + (p.recursos * CONFIG.KPI.VALOR_RECURSO_FINAL);
                console.log(`   ${p.name}: ⭐${p.kpi} + 📦${p.recursos}×${CONFIG.KPI.VALOR_RECURSO_FINAL} = ${kpiFinal} KPI | ${fase.emoji} ${fase.nome}`);
            });
            return;
        }

        console.log('\n📊 ESTADO FINAL DE CADA JOGADOR:');
        console.log('═'.repeat(55));
        jogadores.forEach(p => {
            const fase = Game.getFaseById(p.phase);
            const kpiFinal = p.kpi + (p.recursos * CONFIG.KPI.VALOR_RECURSO_FINAL);
            const completou = p.name === vencedor ? ' ✅ COMPLETOU!' : '';
            console.log(`   ${p.name}: ⭐${p.kpi} + 📦${p.recursos}×${CONFIG.KPI.VALOR_RECURSO_FINAL} = ${kpiFinal} KPI | ${fase.emoji} ${fase.nome} (${p.activities}/${CONFIG.JOGO.ACTIVITIES_PER_PHASE})${completou}`);
        });

        const ranking = [...Game.state.players]
            .map(p => ({
                name: p.name,
                kpi: p.kpi,
                recursos: p.recursos,
                kpiFinal: p.kpi + (p.recursos * CONFIG.KPI.VALOR_RECURSO_FINAL),
                phase: p.phase,
                activities: p.activities
            }))
            .sort((a, b) => b.kpiFinal - a.kpiFinal);

        console.log('\n🏆 RESULTADO FINAL (KPI = atividades + recursos×' + CONFIG.KPI.VALOR_RECURSO_FINAL + '):');
        console.log('═'.repeat(55));
        ranking.forEach((p, i) => {
            const medalha = ['🥇', '🥈', '🥉'][i] || `#${i + 1}`;
            const fase = Game.getFaseById(p.phase);
            console.log(`${medalha} ${p.name}: ⭐${p.kpi} + 📦${p.recursos}×${CONFIG.KPI.VALOR_RECURSO_FINAL} = ${p.kpiFinal} KPI Final | ${fase.emoji} ${fase.nome}`);
        });

        Game.ui.updatePlayersOnlineList();
        Game.ui.updateRankingList();
        Game.ui.showScreen('gameover');
        Game.ui.displayFinalRanking(ranking.map((p, i) => ({
            posicao: i + 1,
            name: p.name,
            kpi: p.kpi,
            recursos: p.recursos,
            kpiFinal: p.kpiFinal,
            phase: p.phase
        })));

        console.log(`\n🆘 Total de pedidos de ajuda atendidos: ${totalAjudas}`);
        console.log(`🎯 Quem disparou o fim: ${vencedor}`);
        console.log(`🏆 Vencedor (maior KPI final): ${ranking[0].name} (${ranking[0].kpiFinal} KPI)`);
        console.log(`🔄 Total de rodadas: ${rodada}`);
        console.log('✅ Simulação concluída!');
    },

    /**
     * Exibe todo o estado atual no console.
     */
    dumpState() {
        const state = Game.state;
        console.log('══════════════ STATE DUMP ══════════════');
        console.log('👑 isHost:', state.isHost);
        console.log('👤 playerName:', state.playerName);
        console.log('🎮 gameStarted:', state.gameStarted);
        console.log('⏱️ timer:', Math.floor(state.timer / 60), 'min');
        console.log('👥 players:', state.players.length);
        state.players.forEach(p => {
            const fase = Game.getFaseById(p.phase);
            const hostBadge = p.isHost ? '👑' : '  ';
            const kpiFinal = p.kpi + (p.recursos * CONFIG.KPI.VALOR_RECURSO_FINAL);
            console.log(`   ${hostBadge} ${p.name} | ⭐${p.kpi} | 📦${p.recursos} | KPI Final: ${kpiFinal} | ${fase.emoji} ${fase.nome} | Atv: ${p.activities}/${CONFIG.JOGO.ACTIVITIES_PER_PHASE}`);
        });
        console.log('═══════════════════════════════════════════════');
    },

    /**
     * Reseta completamente o estado (limpa jogadores e partida).
     */
    resetAll() {
        Game.resetAllPlayers();
        Game.resetGameState();
        Game.state.players = [];
        Game.ui.showScreen('lobby');
        Game.ui.showLobbyNormal();
        Game.ui.updatePlayersList();
        Game.ui.updateTimerDisplay();
        console.log('✅ Estado resetado!');
    }
};

console.log('🔍 Game Debug carregado! Use Game.debug.* no console (F12)');
console.log('💡 Comandos principais:');
console.log('   simularPartidaCompleta()     - Partida completa (com ajudas) ⭐');
console.log('   simularPartidaCompleta(4, 0.3) - 4 jogadores, 30% acerto');
console.log('   testAjuda("Host_Debug", "Guest1_Debug") - Testa ajuda 🆘');
console.log('   testAjudasAutomaticas(3)    - Simula 3 ajudas 🆘');
console.log('   fakePlayers(3)              - Cria jogadores (📦' + CONFIG.RECURSOS_INICIAIS + ' recursos)');
console.log('   dumpState()                 - Estado completo');
console.log('   resetAll()                  - Reseta tudo');
console.log('🔒 Travas: 500 rodadas máx | 10 rodadas sem resposta');