// ============================================
// PM: The KPI Master - Testes de lógica: Estado salvo
// ============================================
// O que vai no estado salvo (localStorage), a versão do formato e a
// migração entre versões (roadmap 3.1).
// Ambiente simulado e ajudantes: environment.js. Rodar a partir da raiz:
//     node tests/logic/saved-state.test.js
// ============================================

const {
    fs, path, vm, RAIZ, createEnvironment, tokenOf, test, check, start, finish,
    syncTo, roundScreens, unavailable, roomToReload, reloadHost, tryReloadHost
} = require('./environment');

start('Estado salvo');

test('T57 Estado salvo leva "rodada encerrada" e a pausa (com o evento); estado salvo antigo restaura sem eles', (usar) => {
    const amb = usar(createEnvironment());
    roomToReload(amb);
    amb.join('A', 'peer-a');
    amb.startMatch();
    amb.state.rodadaEncerrada = true;
    amb.state.partidaPausada = { evento: { id: 'e-x', titulo: 'Evento X' } };
    amb.Game.saveState();
    const salvo = JSON.parse(amb.armazenamento['pmKPI_roomState']);
    check(salvo.rodadaEncerrada === true, 'o estado salvo deveria ter rodadaEncerrada');
    check(salvo.partidaPausada && salvo.partidaPausada.evento && salvo.partidaPausada.evento.id === 'e-x', 'o estado salvo deveria ter a pausa com o evento');

    const novo = usar(reloadHost(amb));
    check(novo.state.rodadaEncerrada === true, 'rodadaEncerrada deveria ser restaurado');
    check(novo.state.partidaPausada && novo.state.partidaPausada.evento.id === 'e-x', 'a pausa deveria ser restaurada com o evento');

    // Sem rodada encerrada e sem pausa: restaura zerado.
    amb.state.rodadaEncerrada = false;
    amb.state.partidaPausada = null;
    amb.Game.saveState();
    const novo2 = usar(reloadHost(amb));
    check(novo2.state.rodadaEncerrada === false && novo2.state.partidaPausada === null, 'sem pausa nem rodada encerrada, restaura zerado');

    // Estado salvo por uma versão anterior (sem os campos): restaura como antes.
    const antigo = JSON.parse(amb.armazenamento['pmKPI_roomState']);
    delete antigo.rodadaEncerrada;
    delete antigo.partidaPausada;
    amb.armazenamento['pmKPI_roomState'] = JSON.stringify(antigo);
    const novo3 = usar(reloadHost(amb));
    check(novo3.state.rodadaEncerrada === false && novo3.state.partidaPausada === null, 'estado salvo antigo: sem pausa e sem rodada encerrada');
    check(novo3.state.gameStarted === true && novo3.state.players.length === 2, 'o resto do estado continua sendo restaurado');
});

test('T62 Estado salvo tem versão: sem versão restaura como hoje; versão mais nova é guardada sem restaurar; inválida é apagada', (usar) => {
    const amb = usar(createEnvironment());
    roomToReload(amb);
    amb.join('A', 'peer-a');
    amb.startMatch();
    amb.Game.saveState();
    const salvo = JSON.parse(amb.armazenamento['pmKPI_roomState']);
    check(salvo.stateVersion === 1, 'o estado salvo deveria ter stateVersion: 1, veio: ' + JSON.stringify(salvo.stateVersion));
    const meusDados = amb.armazenamento['pmKPI_myData'];
    const perguntaAberta = amb.state.currentRound.pergunta.id;

    // Sem versão (salvo antes do 3.1): restaura igual e, ao salvar, ganha a versão.
    const semVersao = { ...salvo };
    delete semVersao.stateVersion;
    amb.armazenamento['pmKPI_roomState'] = JSON.stringify(semVersao);
    const novo = usar(reloadHost(amb));
    check(novo.state.gameStarted === true && novo.state.players.length === 2 &&
        novo.state.currentRound && novo.state.currentRound.pergunta.id === perguntaAberta,
        'estado sem versão deveria restaurar como hoje');
    novo.Game.saveState();
    check(JSON.parse(amb.armazenamento['pmKPI_roomState']).stateVersion === 1, 'ao salvar de novo, o estado deveria passar a ter stateVersion: 1');

    // Gravado com o nome provisório do campo (`version`, só no 4ac5ac8): conta como sem versão.
    amb.armazenamento['pmKPI_roomState'] = JSON.stringify({ ...semVersao, version: 1 });
    const provisorio = usar(reloadHost(amb));
    check(provisorio.state.gameStarted === true && provisorio.state.players.length === 2, 'estado com o campo `version` deveria restaurar');

    // Versão mais nova que o código: não restaura e continua guardado.
    const maisNovo = JSON.stringify({ ...salvo, stateVersion: 2 });
    amb.armazenamento['pmKPI_roomState'] = maisNovo;
    amb.armazenamento['pmKPI_myData'] = meusDados;
    const t1 = tryReloadHost(amb);
    usar(t1.novo);
    check(t1.restaurou === false, 'versão mais nova não deveria ser restaurada');
    check(t1.novo.state.gameStarted === false && t1.novo.state.players.length === 0, 'nada do estado mais novo deveria ser copiado');
    check(amb.armazenamento['pmKPI_roomState'] === maisNovo && amb.armazenamento['pmKPI_myData'] === meusDados,
        'o estado de versão mais nova deveria continuar guardado (a versão nova do código ainda o usa)');

    // Versão inválida: tratada como estado corrompido (apagado).
    for (const versao of ['x', '1', 0, -1, 1.5, null]) {
        amb.armazenamento['pmKPI_roomState'] = JSON.stringify({ ...salvo, stateVersion: versao });
        amb.armazenamento['pmKPI_myData'] = meusDados;
        const t = tryReloadHost(amb);
        usar(t.novo);
        check(t.restaurou === false, 'versão ' + JSON.stringify(versao) + ' não deveria ser restaurada');
        check(!('pmKPI_roomState' in amb.armazenamento) && !('pmKPI_myData' in amb.armazenamento),
            'versão ' + JSON.stringify(versao) + ' deveria ser apagada, como estado corrompido');
    }
});

test('T63 Migração do estado salvo: passos em ordem até a versão atual, e a restauração usa o resultado', (usar) => {
    const amb = usar(createEnvironment());
    const P = amb.Game.persistence;
    check(typeof P.migrateSavedState === 'function', 'Game.persistence.migrateSavedState deveria existir');
    check(P.STATE_VERSION === 1, 'a versão atual do estado salvo deveria ser 1, veio: ' + P.STATE_VERSION);

    // Cadeia de mentira 1 → 2 → 3: cada passo recebe o resultado do anterior.
    const ordem = [];
    const migracoes = {
        1: (roomState, myData) => { ordem.push(1); const { baralhos, ...resto } = roomState; return { roomState: { ...resto, decks: baralhos }, myData: { ...myData, pontos: myData.kpi } }; },
        2: (roomState, myData) => { ordem.push(2); return { roomState: { ...roomState, decksV3: roomState.decks }, myData }; }
    };
    const r = P.migrateSavedState({ stateVersion: 1, baralhos: { d1: 'x' } }, { kpi: 5 }, 3, migracoes);
    check(ordem.join(',') === '1,2', 'deveria rodar os passos 1 e 2, nessa ordem, rodou: ' + ordem.join(','));
    check(r.roomState.stateVersion === 3, 'o resultado deveria estar na versão 3, veio: ' + r.roomState.stateVersion);
    check(r.roomState.decksV3 && r.roomState.decksV3.d1 === 'x' && !('baralhos' in r.roomState), 'o passo 2 deveria receber o resultado do passo 1');
    check(r.myData.pontos === 5, 'os dados do próprio jogador também passam pelos passos');

    // A partir da versão 2: só o passo 2. Sem versão conta como 1.
    ordem.length = 0;
    P.migrateSavedState({ stateVersion: 2, decks: {} }, {}, 3, migracoes);
    check(ordem.join(',') === '2', 'da versão 2 deveria rodar só o passo 2, rodou: ' + ordem.join(','));
    ordem.length = 0;
    const r2 = P.migrateSavedState({ baralhos: {} }, { kpi: 1 }, 2, migracoes);
    check(ordem.join(',') === '1' && r2.roomState.stateVersion === 2, 'sem versão deveria contar como 1 e rodar só o passo 1');

    // Já na versão final: nada muda.
    ordem.length = 0;
    const r3 = P.migrateSavedState({ stateVersion: 3, a: 1 }, { kpi: 2 }, 3, migracoes);
    check(ordem.length === 0 && r3.roomState.a === 1 && r3.myData.kpi === 2, 'na versão final, nenhum passo deveria rodar');

    // Passo faltando: erro (vira estado corrompido na restauração).
    let erro = null;
    try { P.migrateSavedState({ stateVersion: 1 }, {}, 3, { 1: migracoes[1] }); } catch (e) { erro = e; }
    check(erro, 'faltando o passo 2, a migração deveria dar erro');

    // Tabela real de hoje: versão 1 passa sem mudança.
    const r4 = P.migrateSavedState({ stateVersion: 1, roomName: 'sala' }, { kpi: 3 });
    check(r4.roomState.roomName === 'sala' && r4.roomState.stateVersion === 1 && r4.myData.kpi === 3, 'na versão 1, a tabela real não muda nada');

    // A restauração usa o resultado da migração (antes de conferir sala e jogador).
    roomToReload(amb);
    amb.join('A', 'peer-a');
    amb.startMatch();
    amb.Game.saveState();
    const salvo = JSON.parse(amb.armazenamento['pmKPI_roomState']);
    const meus = JSON.parse(amb.armazenamento['pmKPI_myData']);
    const { roomName, ...semNome } = salvo;
    amb.armazenamento['pmKPI_roomState'] = JSON.stringify({ ...semNome, nomeDaSala: roomName });
    amb.armazenamento['pmKPI_myData'] = JSON.stringify({ ...meus, kpi: undefined, pontos: 42 });
    const { novo, restaurou } = (() => {
        // Ambiente novo com a migração trocada por uma que desfaz o nome trocado.
        const n = createEnvironment({ armazenamento: amb.armazenamento });
        n.Game.persistence.migrateSavedState = (roomState, myData) => {
            const { nomeDaSala, ...resto } = roomState;
            const { pontos, ...meusResto } = myData;
            return { roomState: { ...resto, roomName: nomeDaSala }, myData: { ...meusResto, kpi: pontos } };
        };
        n.ctx.location.search = '?' + new URLSearchParams({ host: 'true', room: 'sala', playerName: 'Host', peerId: 'sala' }).toString();
        Object.assign(n.state, { isHost: true, roomName: 'sala', playerName: 'Host', hostPeerId: 'sala', baseRoomPeerId: 'sala', hostVersion: 0 });
        return { novo: n, restaurou: n.Game.persistence.tryRestoreState() };
    })();
    usar(novo);
    check(restaurou === true, 'com a migração trazendo o nome da sala de volta, o estado deveria ser restaurado');
    check(novo.state.roomName === 'sala' && novo.state.players.length === 2, 'a restauração deveria usar a sala migrada');
    check(novo.player('Host').kpi === 42, 'os dados do próprio jogador deveriam vir da migração');
});

finish('Estado salvo');
