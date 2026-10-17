// ============================================
// PM: The KPI Master - Testes no navegador: ritmo da pergunta
// ============================================
// A etapa "Fazer a pergunta" no jogo de verdade: quem responde espera o
// Perguntador, que clica no botão; só então a janela de resposta abre,
// com o prazo inteiro.
// ============================================

const { test, expect, roomCode, startMatch } = require('./players');

test('E23 Fazer a pergunta: quem responde espera o Perguntador; com o clique, a janela de resposta abre com o prazo inteiro', async ({ players }) => {
    const ana = await players.add('Ana');
    const beto = await players.add('Beto');
    await startMatch(ana, [beto], roomCode());
    await ana.waitFor(() => Game.state.currentRound !== null && !!Game.state.currentRound.asker);
    const askerName = await ana.state(() => Game.state.currentRound.asker);
    const asker = askerName === 'Ana' ? ana : beto;
    const answerer = asker === ana ? beto : ana;

    // Antes do clique: quem responde vê o aviso com o nome de quem vai perguntar, sem a janela de resposta.
    await expect(answerer.page.locator('#spectatorMessage')).toBeVisible();
    await expect(answerer.page.locator('#spectatorMessage')).toContainText(asker.name);
    expect(await answerer.hasOpenQuestion(), 'a janela de resposta não deveria abrir antes da pergunta').toBe(false);
    await expect(asker.page.locator('#btnAskQuestion')).toBeVisible();

    // O Perguntador clica: o botão some e a janela de resposta abre com o contador perto de 90s.
    await asker.click('#btnAskQuestion');
    await answerer.waitFor(() => document.getElementById('modalAnswerQuestion').style.display === 'flex');
    expect(await answerer.hasOpenQuestion(), 'depois do clique, quem responde deveria poder escolher a alternativa').toBe(true);
    await expect(answerer.page.locator('#answerTimerText')).toContainText(/\b(8[5-9]|90)s/);
    await expect(asker.page.locator('#btnAskQuestion')).toBeHidden();
});
