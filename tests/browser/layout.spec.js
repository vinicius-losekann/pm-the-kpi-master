// ============================================
// PM: The KPI Master - Testes no navegador: layout em telas pequenas
// ============================================
// Mede, no jogo de verdade, se o que o jogador precisa ver cabe na tela:
// card de perfil com a coluna estreita, janela de resposta no celular e
// ranking final no celular (BUG-025 a BUG-027 em _docs/issues.md).
// ============================================

const { test, expect, roomCode, startMatch, waitForOpenQuestion } = require('./players');

test('E20 Card de perfil com estouro numa janela de 1000 px: os chips de KPI e recursos ficam dentro do card', async ({ players }) => {
    const ana = await players.add('Ana');
    const beto = await players.add('Beto');
    await startMatch(ana, [beto], roomCode());

    // Entre 769 e 1200 px a coluna do perfil encolhe; o estouro com dois
    // dígitos deixa o chip de recursos no tamanho mais largo.
    await ana.page.setViewportSize({ width: 1000, height: 800 });
    await ana.state(() => {
        const me = Game.getPlayerByName('Ana');
        me.resources = -12;
        Game.ui.renderProfileCard(me);
    });
    await expect(ana.page.locator('#myResourcesLabel'), 'pré-condição: o card mostra o estouro').toHaveText('Estouro');

    const layout = await ana.state(() => {
        const card = document.querySelector('.focus-areas-card').getBoundingClientRect();
        const chips = Array.from(document.querySelectorAll('.stat-chip')).map(c => c.getBoundingClientRect());
        return {
            card: { left: card.left, right: card.right },
            chips: chips.map(c => ({ left: c.left, right: c.right }))
        };
    });
    expect(layout.chips.length).toBe(2);
    layout.chips.forEach((chip, i) => {
        const name = i === 0 ? 'KPI' : 'recursos';
        expect(chip.left, 'o chip de ' + name + ' começa antes da borda esquerda do card').toBeGreaterThanOrEqual(layout.card.left);
        expect(chip.right, 'o chip de ' + name + ' passa da borda direita do card').toBeLessThanOrEqual(layout.card.right);
    });
});

test('E21 Janela de resposta num celular baixo (375×480): a janela cabe na tela e rola até a última alternativa', async ({ players }) => {
    const ana = await players.add('Ana');
    const beto = await players.add('Beto');
    await startMatch(ana, [beto], roomCode());
    const answerer = await waitForOpenQuestion(ana, [ana, beto], [ana, beto]);

    await answerer.page.setViewportSize({ width: 375, height: 480 });
    // A janela abre com animação de escala (começa em 30% do tamanho):
    // medir antes de ela terminar daria uma janela menor que a real.
    await answerer.waitFor(() => document.querySelector('#modalAnswerQuestion .modal-card').getAnimations().length === 0);
    const card = await answerer.state(() => {
        const r = document.querySelector('#modalAnswerQuestion .modal-card').getBoundingClientRect();
        return { top: r.top, bottom: r.bottom, viewport: window.innerHeight };
    });
    expect(card.top, 'o topo da janela fica acima da tela').toBeGreaterThanOrEqual(0);
    expect(card.bottom, 'o fim da janela fica abaixo da tela').toBeLessThanOrEqual(card.viewport);

    // A última alternativa precisa ser alcançável rolando a janela.
    const lastAlternative = answerer.page.locator('#alternativesGrid .alternative-btn[data-alt="d"]');
    await lastAlternative.scrollIntoViewIfNeeded();
    const box = await lastAlternative.boundingBox();
    expect(box.y, 'a alternativa D deveria aparecer depois de rolar').toBeGreaterThanOrEqual(0);
    expect(box.y + box.height, 'a alternativa D deveria aparecer inteira depois de rolar').toBeLessThanOrEqual(card.viewport);
});

test('E22 Ranking final no celular (375 px): o detalhe de cada jogador fica abaixo do nome, não na mesma linha', async ({ players }) => {
    const ana = await players.add('Ana');
    const beto = await players.add('Beto');
    await startMatch(ana, [beto], roomCode());

    // Beto sai da partida: com um jogador só, ela acaba (como no E8).
    if (await beto.hasOpenQuestion()) {
        await beto.answerIfMyTurn();
        await expect(beto.page.locator('#modalAnswerQuestion')).toBeHidden();
    }
    await beto.click('#btnLeaveMatch');
    await ana.waitFor(() => Game.state.gameOver === true);

    await ana.page.setViewportSize({ width: 375, height: 800 });
    await expect(ana.page.locator('#finalRanking .final-rank-detail').first()).toBeVisible();
    const rows = await ana.state(() => Array.from(document.querySelectorAll('#finalRanking .final-rank-item')).map(item => ({
        nameBottom: item.querySelector('.final-rank-name').getBoundingClientRect().bottom,
        detailTop: item.querySelector('.final-rank-detail').getBoundingClientRect().top
    })));
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
        expect(row.detailTop, 'o detalhe deveria começar abaixo do nome').toBeGreaterThanOrEqual(row.nameBottom);
    }
});
