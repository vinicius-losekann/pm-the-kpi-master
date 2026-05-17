// ============================================
// PM: The KPI Master - FERRAMENTAS DE DEBUG (V3)
// ============================================
// Responsabilidades:
//   - Simular jogadores e partidas para teste
//   - Testar funções de core sem precisar de 2 pessoas
//   - Expor estado e funções no console (F12)
//   - V3: Venda de recursos
//
// ⚠️ APENAS PARA DESENVOLVIMENTO
// Comente a linha no game.html para produção
// ============================================

window.Game = window.Game || {};

window.Game.debug = {

    /**
     * Cria jogadores falsos para testar sem precisar conectar
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
     * Simula início de partida
     */
    fakeStartGame() {
        const state = Game.state;

        if (state.players.length < 2) {
            console.warn('⚠️ Crie jogadores primeiro: Game.debug.fakePlayers(3)');
            return;
        }

        if (!state.questionsData || Object.keys(state.questionsData.areas || {}).length === 0) {
            console.warn('⚠️ Perguntas não carregadas.');
            return;
        }

        state.gameStarted = true;
        state.usedRespondedorThisRound = [];
        state.timer = CONFIG.JOGO.SESSION_DURATION;

        state.players.forEach(p => p.recursos = CONFIG.RECURSOS_INICIAIS);

        Game.ui.showScreen('game');
        Game.ui.updateTimerDisplay();
        Game.ui.updatePlayersOnlineList();
        Game.ui.updateRankingList();
        console.log('✅ Partida simulada iniciada!');
    },

    /**
     * Testa o sorteio de perguntas
     */
    testSortear(times = 20, fase = 'planejamento') {
        const state = Game.state;
        if (!state.questionsData) { console.warn('⚠️ Perguntas não carregadas.'); return; }

        console.log(`📊 Testando sortearPergunta('${fase}') ${times}x...`);
        const contagem = {};
        const perguntasSorteadas = [];

        for (let i = 0; i < times; i++) {
            const p = Game.core.sortearPergunta(fase);
            if (p) {
                contagem[p.area_key] = (contagem[p.area_key] || 0) + 1;
                perguntasSorteadas.push(p.id);
            }
        }

        console.log('📊 Distribuição por área:');
        for (const [area, count] of Object.entries(contagem)) {
            console.log(`   ${area}: ${count}x ${'█'.repeat(Math.max(1, count))}`);
        }

        const unicas = new Set(perguntasSorteadas);
        console.log(unicas.size === perguntasSorteadas.length ? '✅ Nenhuma repetida!' : `⚠️ ${perguntasSorteadas.length - unicas.size} repetidas.`);
    },

    /**
     * Simula N respostas para um jogador (V2: com recursos)
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

            const pergunta = Game.core.sortearPergunta(player.phase);
            if (!pergunta) break;

            const acertou = Math.random() < 0.5;
            const evento = (state.questionsData?.eventos || [])[Math.floor(Math.random() * 5)];
            const temSeguro = evento?.seguro_erro === true;
            const gastaRecurso = acertou ? true : !temSeguro;
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
     * Força um jogador a pular para uma fase específica
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
    // V3: VENDA DE RECURSOS
    // ============================================

    /**
     * Simula uma venda de recurso entre dois jogadores
     */
    testVenda(vendedorName, compradorName) {
        const vendedor = Game.getPlayerByName(vendedorName);
        const comprador = Game.getPlayerByName(compradorName);

        if (!vendedor || !comprador) {
            console.warn('⚠️ Jogador não encontrado.');
            console.log('💡 Jogadores disponíveis:', Game.state.players.map(p => p.name).join(', '));
            return;
        }

        console.log('💰 Simulando venda...');
        console.log('   ANTES:');
        console.log('   ' + vendedor.name + ': ⭐' + vendedor.kpi + ' | 📦' + vendedor.recursos);
        console.log('   ' + comprador.name + ': ⭐' + comprador.kpi + ' | 📦' + comprador.recursos);

        if (vendedor.recursos < 1) { console.warn('⚠️ Vendedor sem recursos!'); return; }
        if (comprador.kpi < CONFIG.KPI.VALOR_VENDA_RECURSO) {
            console.warn('⚠️ Comprador sem KPI suficiente! (precisa de ' + CONFIG.KPI.VALOR_VENDA_RECURSO + ')');
            return;
        }

        vendedor.recursos--;
        vendedor.kpi += CONFIG.KPI.VALOR_VENDA_RECURSO;
        comprador.recursos++;
        comprador.kpi -= CONFIG.KPI.VALOR_VENDA_RECURSO;

        console.log('   DEPOIS:');
        console.log('   ' + vendedor.name + ': ⭐' + vendedor.kpi + ' | 📦' + vendedor.recursos + ' (+' + CONFIG.KPI.VALOR_VENDA_RECURSO + ' KPI)');
        console.log('   ' + comprador.name + ': ⭐' + comprador.kpi + ' | 📦' + comprador.recursos + ' (+1📦)');
        console.log('✅ Venda simulada com sucesso!');

        Game.ui.updatePlayersOnlineList();
        Game.ui.updateRankingList();
    },

    /**
     * Simula várias vendas automáticas
     */
    testVendasAutomaticas(quantidade = 3) {
        const state = Game.state;
        if (!state.gameStarted) { console.warn('⚠️ Inicie a partida primeiro.'); return; }

        console.log('💰 Simulando ' + quantidade + ' vendas automáticas...\n');

        for (let i = 0; i < quantidade; i++) {
            const vendedores = [...state.players]
                .filter(p => p.recursos > 1 && !p.waitingInLobby)
                .sort((a, b) => b.recursos - a.recursos);

            const compradores = [...state.players]
                .filter(p => p.kpi >= CONFIG.KPI.VALOR_VENDA_RECURSO && !p.waitingInLobby)
                .sort((a, b) => b.kpi - a.kpi);

            if (vendedores.length === 0 || compradores.length === 0) {
                console.warn('⚠️ Sem vendedores ou compradores disponíveis.');
                break;
            }

            const vendedor = vendedores[0];
            const comprador = compradores.find(c => c.name !== vendedor.name) || compradores[0];

            if (vendedor.name === comprador.name) { console.warn('⚠️ Apenas um jogador.'); break; }

            vendedor.recursos--;
            vendedor.kpi += CONFIG.KPI.VALOR_VENDA_RECURSO;
            comprador.recursos++;
            comprador.kpi -= CONFIG.KPI.VALOR_VENDA_RECURSO;

            console.log('   💰 ' + vendedor.name + ' → ' + comprador.name + ' | +' + CONFIG.KPI.VALOR_VENDA_RECURSO + '⭐ / +1📦');
        }

        console.log('\n📊 Estado após vendas:');
        state.players.forEach(p => console.log('   ' + p.name + ': ⭐' + p.kpi + ' | 📦' + p.recursos));

        Game.ui.updatePlayersOnlineList();
        Game.ui.updateRankingList();
        console.log('✅ Vendas automáticas concluídas!');
    },

    // ============================================
    // SIMULAÇÃO COMPLETA (V3 - Com Vendas)
    // ============================================

    /**
     * Simula uma partida completa com vendas automáticas
     * Cada jogador avança no seu próprio ritmo
     * Inclui vendas aleatórias durante a partida
     */
    async simularPartidaCompleta(numJogadores = 3, chanceAcerto = 0.5) {
        const MAX_RODADAS = 500;
        const MAX_SEM_RECURSOS = 10;

        console.log('🚀 Iniciando simulação de partida completa (V3)...');
        console.log(`👥 Jogadores: ${numJogadores} | 🎯 Chance de acerto: ${Math.round(chanceAcerto * 100)}%`);
        console.log(`📦 Recursos iniciais: ${CONFIG.RECURSOS_INICIAIS} | ⭐ KPI por acerto: ${CONFIG.KPI.ACERTO_BASE}`);
        console.log(`💰 Valor de venda: ${CONFIG.KPI.VALOR_VENDA_RECURSO} KPI por recurso`);
        console.log('📋 Regras V3: Venda de recursos entre jogadores');
        console.log('🛑 Termina quando o PRIMEIRO completar o Encerramento\n');

        if (Game.state.players.length < 2) {
            console.log('💡 Criando jogadores automaticamente...');
            this.fakePlayers(numJogadores);
        }

        if (!Game.state.gameStarted) {
            console.log('💡 Iniciando partida automaticamente...');
            this.fakeStartGame();
        }

        const jogadores = Game.state.players.filter(p => !p.waitingInLobby);
        let rodada = 0;
        let jogoFinalizado = false;
        let vencedor = null;
        let rodadasSemNinguemResponder = 0;
        let interrompidoPorTrava = false;
        let totalVendas = 0;

        while (!jogoFinalizado) {
            rodada++;

            if (rodada > MAX_RODADAS) {
                console.error(`\n🛑 TRAVA: ${MAX_RODADAS} rodadas!`);
                interrompidoPorTrava = true;
                break;
            }

            const evento = Game.state.questionsData.eventos[Math.floor(Math.random() * 5)];
            Game.core.aplicarEfeitosEvento(evento);

            // V3: Chance de venda automática a cada rodada (15%)
            if (Math.random() < 0.15 && rodada > 3) {
                const vendedores = jogadores.filter(p => p.recursos > 1);
                const compradores = jogadores.filter(p => p.kpi >= CONFIG.KPI.VALOR_VENDA_RECURSO);
                
                if (vendedores.length > 0 && compradores.length > 0) {
                    const vendedor = vendedores[Math.floor(Math.random() * vendedores.length)];
                    const comprador = compradores.filter(c => c.name !== vendedor.name)[0];
                    
                    if (comprador) {
                        vendedor.recursos--;
                        vendedor.kpi += CONFIG.KPI.VALOR_VENDA_RECURSO;
                        comprador.recursos++;
                        comprador.kpi -= CONFIG.KPI.VALOR_VENDA_RECURSO;
                        totalVendas++;
                    }
                }
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
                const pergunta = Game.core.sortearPergunta(jogador.phase);

                if (!pergunta) { continue; }

                const acertou = Math.random() < chanceAcerto;
                const temSeguro = evento?.seguro_erro === true;
                const gastaRecurso = acertou ? true : !temSeguro;
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

        console.log(`\n💰 Total de vendas realizadas: ${totalVendas}`);
        console.log(`🎯 Quem disparou o fim: ${vencedor}`);
        console.log(`🏆 Vencedor (maior KPI final): ${ranking[0].name} (${ranking[0].kpiFinal} KPI)`);
        console.log(`🔄 Total de rodadas: ${rodada}`);
        console.log('✅ Simulação V3 concluída!');
    },

    /**
     * Mostra o estado atual completo no console
     */
    dumpState() {
        const state = Game.state;
        console.log('══════════════ STATE DUMP (V3) ══════════════');
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
     * Reseta completamente o estado
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

console.log('🔍 Game Debug V3 carregado! Use Game.debug.* no console (F12)');
console.log('💡 Comandos principais:');
console.log('   simularPartidaCompleta()     - Partida completa V3 (com vendas) ⭐');
console.log('   simularPartidaCompleta(4, 0.3) - 4 jogadores, 30% acerto');
console.log('   testVenda("Host_Debug", "Guest1_Debug") - Testa venda 💰');
console.log('   testVendasAutomaticas(3)    - Simula 3 vendas 💰');
console.log('   fakePlayers(3)              - Cria jogadores (📦10 recursos)');
console.log('   dumpState()                 - Estado completo');
console.log('   resetAll()                  - Reseta tudo');
console.log('🔒 Travas: 500 rodadas máx | 10 rodadas sem resposta');