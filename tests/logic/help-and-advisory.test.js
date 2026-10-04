// ============================================
// PM: The KPI Master - Testes de lógica: Pedido de ajuda e assessoria
// ============================================
// Pedido de ajuda (fila automática de quem pode doar um recurso) e
// pedido de assessoria (o Respondedor chama outro jogador para sugerir
// uma alternativa).
// Ambiente simulado e ajudantes: environment.js. Rodar a partir da raiz:
//     node tests/logic/help-and-advisory.test.js
// ============================================

const {
    fs, path, vm, RAIZ, createEnvironment, tokenOf, test, check, start, finish,
    syncTo, roundScreens, unavailable, roomToReload, reloadHost, tryReloadHost, recordScreens
} = require('./environment');

start('Pedido de ajuda e assessoria');

/**
 * Partida de 4 (Host, A, B, C). A está sem recursos e com KPI para pedir
 * ajuda; a fila de quem pode doar fica B (5), C (3), Host (1).
 */
function matchWithHelpQueue(usar) {
    const amb = usar(createEnvironment());
    amb.fakeTime();
    amb.createRoomAsHost();
    amb.join('A', 'peer-a');
    amb.join('B', 'peer-b');
    amb.join('C', 'peer-c');
    amb.startMatch();
    Object.assign(amb.player('A'), { recursos: 0, kpi: 20 });
    Object.assign(amb.player('B'), { recursos: 5, kpi: 0 });
    Object.assign(amb.player('C'), { recursos: 3, kpi: 0 });
    Object.assign(amb.player('Host'), { recursos: 1, kpi: 0 });
    return amb;
}

/** Ofertas de ajuda enviadas a um peer. */
function offersTo(amb, peerId) {
    return amb.registro.enviados.filter(e => e.para === peerId && e.msg.type === 'ajuda-oferta');
}

test('T69 Pedido de ajuda: quem caiu é pulado na fila; se quem pediu cai, o pedido é cancelado', (usar) => {
    // C cai enquanto B decide; B recusa: o pedido vai direto ao Host.
    const amb = matchWithHelpQueue(usar);
    amb.Game.network.handleMessage({ type: 'ajuda-request', requesterName: 'A' }, 'peer-a');
    check(offersTo(amb, 'peer-b').length === 1, 'pré-condição: B (mais recursos) é o primeiro da fila');
    amb.drop('peer-c');
    check(amb.player('C').disconnected === true, 'pré-condição: C caiu');
    amb.Game.network.handleMessage({ type: 'ajuda-oferta-response', candidatoName: 'B', aceito: false }, 'peer-b');
    check(offersTo(amb, 'peer-c').length === 0, 'C caiu: não deveria receber o pedido de ajuda');
    check(offersTo(amb, 'peer-host').length === 1, 'depois de B, o pedido deveria ir direto ao Host');
    const tentando = amb.registro.enviados.filter(e => e.para === 'peer-a' && e.msg.type === 'ajuda-tentando').pop();
    check(tentando && tentando.msg.candidatoName === 'Host', 'A deveria ver que o pedido está com o Host, veio: ' + JSON.stringify(tentando && tentando.msg));

    // Quem pediu cai antes de B aceitar: nada é transferido e ninguém mais é consultado.
    const amb2 = matchWithHelpQueue(usar);
    amb2.Game.network.handleMessage({ type: 'ajuda-request', requesterName: 'A' }, 'peer-a');
    amb2.drop('peer-a');
    amb2.clearLog();
    amb2.Game.network.handleMessage({ type: 'ajuda-oferta-response', candidatoName: 'B', aceito: true }, 'peer-b');
    check(amb2.player('A').recursos === 0 && amb2.player('B').recursos === 5 && amb2.player('B').kpi === 0,
        'quem pediu caiu: nenhum recurso pode ser transferido');
    check(amb2.broadcastsOfType('ajuda-confirmada').length === 0, 'não deveria confirmar ajuda para quem caiu');
    check(!amb2.state.ajudaFila, 'o pedido deveria ser cancelado');

    // Mesmo caso, com B recusando: a fila não segue para C.
    const amb3 = matchWithHelpQueue(usar);
    amb3.Game.network.handleMessage({ type: 'ajuda-request', requesterName: 'A' }, 'peer-a');
    amb3.drop('peer-a');
    amb3.clearLog();
    amb3.Game.network.handleMessage({ type: 'ajuda-oferta-response', candidatoName: 'B', aceito: false }, 'peer-b');
    check(offersTo(amb3, 'peer-c').length === 0 && offersTo(amb3, 'peer-host').length === 0, 'quem pediu caiu: ninguém mais deveria ser consultado');
    check(!amb3.state.ajudaFila, 'o pedido deveria ser cancelado');

    // Controle: sem ninguém cair, B aceita e a ajuda acontece.
    const amb4 = matchWithHelpQueue(usar);
    amb4.Game.network.handleMessage({ type: 'ajuda-request', requesterName: 'A' }, 'peer-a');
    amb4.Game.network.handleMessage({ type: 'ajuda-oferta-response', candidatoName: 'B', aceito: true }, 'peer-b');
    check(amb4.player('A').recursos === 1 && amb4.player('B').recursos === 4, 'sem quedas, a ajuda deveria acontecer');
});

test('T70 Assessor que caiu é recusado na hora; quem responde pode chamar outro', (usar) => {
    const amb = usar(createEnvironment());
    amb.fakeTime();
    amb.createRoomAsHost();
    amb.join('A', 'peer-a');
    amb.join('B', 'peer-b');
    amb.join('C', 'peer-c');
    amb.startMatch();
    // O sorteio da dupla é aleatório: fixa os papéis (mesma pergunta e evento).
    amb.state.currentRound = { ...amb.state.currentRound, perguntador: 'Host', respondedor: 'A', respondeu: false };
    amb.state.usedRespondedorThisRound = [];

    // B cai entre a lista de assessores abrir e o clique de A.
    amb.drop('peer-b');
    amb.clearLog();
    amb.Game.network.handleMessage({ type: 'assessoria-request', assessorName: 'B', requesterName: 'A' }, 'peer-a');
    check(!amb.state.currentRound.assessoria, 'não deveria ficar esperando o assessor que caiu, veio: ' + JSON.stringify(amb.state.currentRound.assessoria));
    check(!amb.registro.enviados.some(e => e.para === 'peer-b' && e.msg.type === 'assessoria-question'), 'quem caiu não deveria receber a pergunta');
    const recusa = amb.registro.enviados.filter(e => e.para === 'peer-a' && e.msg.type === 'assessoria-result').pop();
    check(recusa && recusa.msg.invalido === true && recusa.msg.recusado === true && recusa.msg.motivo !== 'fase-encerramento',
        'A deveria receber na hora a recusa que libera o pedido a outro, veio: ' + JSON.stringify(recusa && recusa.msg));

    // A chama C (conectado): o pedido corre normalmente.
    amb.Game.network.handleMessage({ type: 'assessoria-request', assessorName: 'C', requesterName: 'A' }, 'peer-a');
    const a = amb.state.currentRound.assessoria;
    check(a && a.status === 'pending' && a.assessorName === 'C', 'A deveria conseguir chamar C');
    check(amb.registro.enviados.some(e => e.para === 'peer-c' && e.msg.type === 'assessoria-question'), 'C deveria receber a pergunta');
});

test('T71 Aviso "pedindo ajuda para…" mostra o nome como foi digitado (sem "&amp;")', (usar) => {
    const elementos = {};
    const ctx = vm.createContext({
        console: { log: () => {}, warn: () => {}, error: () => {}, info: () => {} },
        document: { getElementById: (id) => elementos[id] || (elementos[id] = { id, textContent: '', innerHTML: '', style: {} }) }
    });
    vm.runInContext("var window = this; window.Game = { i18n: { t: (chave, v) => chave + ':' + (v && v.requester) } };", ctx);
    vm.runInContext(fs.readFileSync(path.join(RAIZ, 'js/utils/sanitize.js'), 'utf8'), ctx, { filename: 'sanitize.js' });
    vm.runInContext(fs.readFileSync(path.join(RAIZ, 'js/ui/modals/tradeModal.js'), 'utf8'), ctx, { filename: 'tradeModal.js' });
    const ui = vm.runInContext('Game.ui', ctx);

    ui.showHelpCandidate({ candidatoName: 'Ana & Bia <3' });
    check(elementos['ajudaTentandoCom'].textContent === 'Ana & Bia <3',
        'o nome deveria aparecer como foi digitado, apareceu: ' + elementos['ajudaTentandoCom'].textContent);

    // Controle: onde o nome entra como HTML, ele continua protegido.
    ui.showHelpOfferModal({ requesterName: 'Ana & Bia <3' });
    check(elementos['ajudaOfertaTexto'].innerHTML === 'trade.pedidoRecebido:Ana &amp; Bia &lt;3',
        'no pedido recebido (HTML), o nome deveria continuar protegido, veio: ' + elementos['ajudaOfertaTexto'].innerHTML);
});

finish('Pedido de ajuda e assessoria');
