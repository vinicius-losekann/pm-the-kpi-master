// ============================================
// PM: The KPI Master - FERRAMENTAS DE DEBUG
// ============================================
// Responsabilidades:
//   - Simular jogadores e partidas para teste
//   - Testar funções de core sem precisar de 2 pessoas
//   - Expor estado e funções no console (F12)
//
// Uso: Carregue o jogo, abra F12, use Game.debug.*
//
// ⚠️ APENAS PARA DESENVOLVIMENTO
// Comente a linha no game.html para produção
// ============================================

window.Game = window.Game || {};

window.Game.debug = {

    /**
     * Cria jogadores falsos para testar sem precisar conectar
     * @param {number} count - Quantos jogadores (padrão 3)
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
                waitingInLobby: false
            });
        }

        // Ajusta para debug local
        state.isHost = true;
        state.playerName = names[0];
        state.peerId = 'fake-peer-0';
        state.hostPeerId = 'fake-peer-0';

        console.log(`✅ ${count} jogadores falsos criados:`, state.players.map(p => p.name).join(', '));
        console.log('👑 Host:', names[0]);
        console.log('👤 Guests:', state.players.filter(p => !p.isHost).map(p => p.name).join(', '));
        console.log('💡 Agora use Game.debug.fakeStartGame() para simular partida');
        Game.ui.updatePlayersList();
        Game.ui.checkStartCondition();
    },

    /**
     * Simula início de partida (sem precisar de PeerJS)
     */
    fakeStartGame() {
        const state = Game.state;

        if (state.players.length < 2) {
            console.warn('⚠️ Crie jogadores primeiro: Game.debug.fakePlayers(3)');
            return;
        }

        if (!state.questionsData || Object.keys(state.questionsData.areas || {}).length === 0) {
            console.warn('⚠️ Perguntas não carregadas. Execute Game.debug.loadFallback() primeiro.');
            return;
        }

        state.gameStarted = true;
        state.usedRespondedorThisRound = [];
        state.timer = CONFIG.JOGO.SESSION_DURATION;
        Game.ui.showScreen('game');
        Game.ui.updateTimerDisplay();
        Game.ui.updatePlayersOnlineList();
        Game.ui.updateRankingList();
        console.log('✅ Partida simulada iniciada!');
        console.log('💡 Use Game.debug.simularPartidaCompleta() para uma partida inteira');
        console.log('💡 Use Game.debug.testKPI(5) para simular algumas respostas');
    },

    /**
     * Testa o sorteio de perguntas (executa N vezes e mostra distribuição)
     * @param {number} times - Quantas vezes sortear
     * @param {string} fase - Fase para testar (padrão: 'planejamento')
     */
    testSortear(times = 20, fase = 'planejamento') {
        const state = Game.state;

        if (!state.questionsData) {
            console.warn('⚠️ Perguntas não carregadas.');
            return;
        }

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
            const bar = '█'.repeat(Math.max(1, count));
            console.log(`   ${area}: ${count}x ${bar}`);
        }

        const unicas = new Set(perguntasSorteadas);
        if (unicas.size === perguntasSorteadas.length) {
            console.log('✅ Nenhuma pergunta repetida!');
        } else {
            console.warn(`⚠️ Houve repetição! ${perguntasSorteadas.length - unicas.size} perguntas repetidas.`);
        }
    },

    /**
     * Simula N respostas e mostra evolução do KPI
     * @param {number} count - Quantas respostas simular
     * @param {string} playerName - Nome do jogador (padrão: você mesmo)
     */
    testKPI(count = 5, playerName = null) {
        const state = Game.state;
        const name = playerName || state.playerName;

        if (!state.gameStarted) {
            console.warn('⚠️ Inicie a partida primeiro: Game.debug.fakeStartGame()');
            return;
        }

        const player = Game.getPlayerByName(name);
        if (!player) {
            console.warn(`⚠️ Jogador "${name}" não encontrado.`);
            console.log('💡 Jogadores disponíveis:', state.players.map(p => p.name).join(', '));
            return;
        }

        console.log(`🎯 Simulando ${count} respostas para ${name}...`);
        console.log(`   Fase inicial: ${Game.getFaseById(player.phase).emoji} ${Game.getFaseById(player.phase).nome} | KPI: ${player.kpi}`);

        for (let i = 0; i < count; i++) {
            const pergunta = Game.core.sortearPergunta(player.phase);
            if (!pergunta) {
                console.error('❌ Sem perguntas disponíveis para a fase:', player.phase);
                break;
            }

            const acertou = Math.random() > 0.3;
            const evento = (state.questionsData?.eventos || [])[Math.floor(Math.random() * 5)];
            const alternativa = acertou ? pergunta.correta : 'x';

            state.currentRound = {
                evento,
                respondedor: name,
                pergunta,
                respondeu: false
            };

            const kpiGanho = acertou
                ? (CONFIG.KPI.ACERTO_BASE * evento.modificador) + (evento.bonus || 0)
                : 0;

            player.kpi += kpiGanho;
            player.activities++;

            const faseIdx = Game.getFaseIndex(player.phase);
            if (player.activities >= CONFIG.JOGO.ACTIVITIES_PER_PHASE && faseIdx < CONFIG.FASES.length - 1) {
                player.phase = CONFIG.FASES[faseIdx + 1].id;
                player.activities = 0;
            }

            const status = acertou ? '✅' : '❌';
            const fase = Game.getFaseById(player.phase);
            console.log(`   ${i + 1}. ${status} → +${kpiGanho} KPI | ${fase.emoji} ${fase.nome} | Total: ${player.kpi}`);
        }

        Game.ui.updatePlayersOnlineList();
        Game.ui.updateRankingList();
        
        if (name === state.playerName) {
            document.getElementById('myKPI').textContent = player.kpi;
            const fase = Game.getFaseById(player.phase);
            document.getElementById('myPhaseName').textContent = fase.nome;
            document.getElementById('myPhaseIcon').textContent = fase.emoji;
            document.getElementById('myActivity').textContent = player.activities;
            document.getElementById('myProgressFill').style.width = (player.activities / CONFIG.JOGO.ACTIVITIES_PER_PHASE * 100) + '%';
        }
        
        console.log('✅ Teste concluído!');
    },

    /**
     * Força um jogador a pular para uma fase específica
     * @param {string} phaseId - 'iniciacao' | 'planejamento' | 'execucao' | 'monitoramento_controle' | 'encerramento'
     * @param {string} playerName - Nome do jogador (padrão: você mesmo)
     */
    skipToPhase(phaseId, playerName) {
        const name = playerName || Game.state.playerName;
        const player = Game.getPlayerByName(name);

        if (!player) {
            console.warn(`⚠️ Jogador "${name}" não encontrado.`);
            console.log('💡 Jogadores disponíveis:', Game.state.players.map(p => p.name).join(', '));
            return;
        }

        if (!CONFIG.FASES.find(f => f.id === phaseId)) {
            console.warn(`⚠️ Fase "${phaseId}" inválida. Use: ${CONFIG.FASES.map(f => f.id).join(', ')}`);
            return;
        }

        player.phase = phaseId;
        player.activities = 0;
        const fase = Game.getFaseById(phaseId);
        console.log(`✅ ${name} pulou para ${fase.emoji} ${fase.nome}`);
        Game.ui.updatePlayersOnlineList();
    },

    /**
     * Simula uma partida completa com progressão INDIVIDUAL (igual ao jogo real)
     * Cada jogador avança no seu próprio ritmo
     * Termina quando o PRIMEIRO jogador completa o Encerramento
     * 
     * @param {number} numJogadores - Quantos jogadores (padrão: 3)
     * @param {number} chanceAcerto - Probabilidade de acerto 0-1 (padrão: 0.5)
     */
    async simularPartidaCompleta(numJogadores = 3, chanceAcerto = 0.5) {
        console.log('🚀 Iniciando simulação de partida completa...');
        console.log(`👥 Jogadores: ${numJogadores} | 🎯 Chance de acerto: ${Math.round(chanceAcerto * 100)}%`);
        console.log('📋 Regra: Progressão INDIVIDUAL (igual ao jogo real)');
        console.log('🛑 Termina quando o PRIMEIRO completar o Encerramento\n');
        
        // Garante que temos jogadores e partida iniciada
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
        
        // Loop principal: continua até alguém completar o Encerramento
        while (!jogoFinalizado) {
            rodada++;
            console.log(`\n🔄 RODADA ${rodada}`);
            console.log('─'.repeat(40));
            
            // Embaralha jogadores para ordem aleatória
            const ordem = [...jogadores].sort(() => Math.random() - 0.5);
            
            for (const jogador of ordem) {
                if (jogoFinalizado) break; // Outro jogador já finalizou
                
                const faseAtual = Game.getFaseById(jogador.phase);
                
                // Sorteia pergunta da fase atual do jogador
                const pergunta = Game.core.sortearPergunta(jogador.phase);
                if (!pergunta) {
                    console.warn(`⚠️ ${jogador.name}: sem perguntas para ${faseAtual.nome}`);
                    continue;
                }
                
                const acertou = Math.random() < chanceAcerto;
                const evento = Game.state.questionsData.eventos[Math.floor(Math.random() * 5)];
                
                const kpiGanho = acertou 
                    ? (CONFIG.KPI.ACERTO_BASE * evento.modificador) + (evento.bonus || 0) 
                    : 0;
                
                jogador.kpi += kpiGanho;
                jogador.activities++;
                
                const status = acertou ? '✅' : '❌';
                
                // Verifica progressão
                if (jogador.activities >= CONFIG.JOGO.ACTIVITIES_PER_PHASE) {
                    const faseIdx = Game.getFaseIndex(jogador.phase);
                    
                    if (faseIdx < CONFIG.FASES.length - 1) {
                        // Avança para próxima fase
                        const faseAntiga = Game.getFaseById(jogador.phase);
                        jogador.phase = CONFIG.FASES[faseIdx + 1].id;
                        jogador.activities = 0;
                        const faseNova = Game.getFaseById(jogador.phase);
                        console.log(`   ${status} ${jogador.name}: +${kpiGanho} KPI | ${faseAntiga.emoji} → ${faseNova.emoji} AVANÇOU! | Total: ${jogador.kpi}`);
                    } else {
                        // 🏁 COMPLETOU O ENCERRAMENTO!
                        console.log(`   ${status} ${jogador.name}: +${kpiGanho} KPI | 🏁 COMPLETOU O ENCERRAMENTO! | Total: ${jogador.kpi}`);
                        console.log(`\n🏁 ${jogador.name} COMPLETOU O ENCERRAMENTO! FIM DE JOGO!`);
                        jogoFinalizado = true;
                        vencedor = jogador.name;
                        break;
                    }
                } else {
                    const faseAtual = Game.getFaseById(jogador.phase);
                    console.log(`   ${status} ${jogador.name}: +${kpiGanho} KPI | ${faseAtual.emoji} ${faseAtual.nome} (${jogador.activities}/${CONFIG.JOGO.ACTIVITIES_PER_PHASE}) | Total: ${jogador.kpi}`);
                }
            }
        }
        
        // Mostra estado final de cada jogador
        console.log('\n📊 ESTADO FINAL DE CADA JOGADOR:');
        console.log('═'.repeat(50));
        jogadores.forEach(p => {
            const fase = Game.getFaseById(p.phase);
            const completou = p.name === vencedor ? ' ✅ COMPLETOU!' : '';
            console.log(`   ${p.name}: ${p.kpi} KPI | ${fase.emoji} ${fase.nome} (${p.activities}/${CONFIG.JOGO.ACTIVITIES_PER_PHASE})${completou}`);
        });
        
        // Ranking final
        console.log('\n🏆 RESULTADO FINAL:');
        console.log('═'.repeat(50));
        
        const ranking = [...Game.state.players].sort((a, b) => b.kpi - a.kpi);
        ranking.forEach((p, i) => {
            const medalha = ['🥇', '🥈', '🥉'][i] || `#${i+1}`;
            const fase = Game.getFaseById(p.phase);
            console.log(`${medalha} ${p.name}: ${p.kpi} KPI | ${fase.emoji} ${fase.nome} (${p.activities}/${CONFIG.JOGO.ACTIVITIES_PER_PHASE})`);
        });
        
        // Atualiza UI
        Game.ui.updatePlayersOnlineList();
        Game.ui.updateRankingList();
        Game.ui.showScreen('gameover');
        Game.ui.displayFinalRanking(ranking.map((p, i) => ({
            posicao: i + 1,
            name: p.name,
            kpi: p.kpi,
            phase: p.phase
        })));
        
        console.log(`\n🎯 Quem disparou o fim: ${vencedor}`);
        console.log(`🏆 Vencedor (maior KPI): ${ranking[0].name}`);
        console.log(`🔄 Total de rodadas: ${rodada}`);
        console.log('✅ Simulação concluída!');
    },

    /**
     * Testa KPI de todos os jogadores (simula respostas para cada um)
     * @param {number} rounds - Quantas rodadas simular
     */
    testAllPlayers(rounds = 2) {
        const state = Game.state;

        if (!state.gameStarted) {
            console.warn('⚠️ Inicie a partida primeiro: Game.debug.fakeStartGame()');
            return;
        }

        console.log(`🎯 Simulando ${rounds} rodadas para todos os jogadores...`);

        for (let r = 0; r < rounds; r++) {
            console.log(`\n--- Rodada ${r + 1} ---`);
            state.players.forEach(player => {
                if (player.waitingInLobby) return;
                
                const pergunta = Game.core.sortearPergunta(player.phase);
                if (!pergunta) return;

                const acertou = Math.random() > 0.3;
                const evento = (state.questionsData?.eventos || [])[Math.floor(Math.random() * 5)];
                const kpiGanho = acertou ? (CONFIG.KPI.ACERTO_BASE * evento.modificador) + (evento.bonus || 0) : 0;

                player.kpi += kpiGanho;
                player.activities++;
                const faseIdx = Game.getFaseIndex(player.phase);
                if (player.activities >= CONFIG.JOGO.ACTIVITIES_PER_PHASE && faseIdx < CONFIG.FASES.length - 1) {
                    player.phase = CONFIG.FASES[faseIdx + 1].id;
                    player.activities = 0;
                }

                const status = acertou ? '✅' : '❌';
                const fase = Game.getFaseById(player.phase);
                console.log(`   ${status} ${player.name}: +${kpiGanho} KPI | ${fase.emoji} | Total: ${player.kpi}`);
            });
        }

        console.log('\n📊 Resultado Final:');
        const ranking = Game.core.buildRanking();
        ranking.forEach((p, i) => {
            const medalha = ['🥇', '🥈', '🥉'][i] || `#${i+1}`;
            console.log(`   ${medalha} ${p.name}: ${p.kpi} KPI`);
        });

        Game.ui.updatePlayersOnlineList();
        Game.ui.updateRankingList();
    },

    /**
     * Mostra o estado atual completo no console
     */
    dumpState() {
        const state = Game.state;
        console.log('══════════════ STATE DUMP ══════════════');
        console.log('👑 isHost:', state.isHost);
        console.log('👤 playerName:', state.playerName);
        console.log('🏠 roomName:', state.roomName);
        console.log('🔗 peerId:', state.peerId);
        console.log('🎮 gameStarted:', state.gameStarted);
        console.log('⏱️ timer:', Math.floor(state.timer / 60), 'min');
        console.log('👥 players:', state.players.length);
        state.players.forEach(p => {
            const fase = Game.getFaseById(p.phase);
            const hostBadge = p.isHost ? '👑' : '  ';
            const waitingBadge = p.waitingInLobby ? ' [AGUARDANDO]' : '';
            console.log(`   ${hostBadge} ${p.name} | KPI: ${p.kpi} | ${fase.emoji} ${fase.nome} | Atv: ${p.activities}/${CONFIG.JOGO.ACTIVITIES_PER_PHASE}${waitingBadge}`);
        });
        console.log('📚 Áreas carregadas:', Object.keys(state.questionsData?.areas || {}).length);
        console.log('🃏 Baralhos:', Object.keys(state.baralhos).length);
        if (state.currentRound) {
            console.log('🎯 Rodada atual:', state.currentRound.perguntador, '→', state.currentRound.respondedor);
        }
        console.log('════════════════════════════════════════');
    },

    /**
     * Tenta carregar o fallback de perguntas (se disponível)
     */
    loadFallback() {
        if (typeof FALLBACK_QUESTIONS !== 'undefined') {
            Game.state.questionsData = FALLBACK_QUESTIONS;
            Game.state.baralhos = {};
            for (const [key, area] of Object.entries(FALLBACK_QUESTIONS.areas)) {
                Game.state.baralhos[key] = {
                    perguntas: area.perguntas.map(p => ({ ...p, usada: false })),
                    disponiveis: area.perguntas.length,
                    total: area.perguntas.length
                };
            }
            console.log('✅ Fallback carregado:', Object.keys(FALLBACK_QUESTIONS.areas).length, 'áreas');
        } else {
            console.warn('⚠️ FALLBACK_QUESTIONS não disponível. Inclua questions-fallback.js no HTML.');
        }
    },

    /**
     * Reseta completamente o estado (volta ao lobby vazio)
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
console.log('   simularPartidaCompleta()  - Partida realista (progressão individual) ⭐');
console.log('   simularPartidaCompleta(4) - Com 4 jogadores');
console.log('   simularPartidaCompleta(3, 0.3) - 3 jogadores, 30% acerto');
console.log('   fakePlayers(3)            - Cria Host_Debug + Guests');
console.log('   fakeStartGame()           - Inicia partida simulada');
console.log('   testKPI(5)                - Simula 5 respostas para você');
console.log('   testAllPlayers(2)         - Simula 2 rodadas para todos');
console.log('   testSortear()             - Testa distribuição de sorteio');
console.log('   skipToPhase("execucao")   - Pula para Execução');
console.log('   dumpState()               - Mostra estado completo');
console.log('   resetAll()                - Reseta tudo');