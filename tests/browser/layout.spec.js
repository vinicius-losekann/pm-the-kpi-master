// ============================================
// PM: The KPI Master - Testes no navegador: layout em telas pequenas
// ============================================
// Mede, no jogo de verdade, se o que o jogador precisa ver cabe na tela:
// card de perfil com a coluna estreita, janela de resposta no celular,
// ranking final no celular (BUG-025 a BUG-027 em _docs/issues.md) e
// ranking e lista de jogadores da partida em tela estreita (BUG-029).
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

test('E37 Ranking e lista de jogadores numa janela de 1000 px e no celular (375 px): aparecem, cabem na largura e não cobrem a pergunta nem o perfil', async ({ players }) => {
    const ana = await players.add('Ana');
    const beto = await players.add('Beto');
    await startMatch(ana, [beto], roomCode());

    // O host tem "Nova Rodada" e "Encerrar Partida"; o guest, "Sair da
    // Partida" (setup.js esconde os do outro papel). No celular, o "Nova
    // Rodada" fica acima do ranking e os outros dois, abaixo.
    const roles = [
        { player: ana, who: 'host', rare: '#btnEndMatch', rareName: '"Encerrar Partida"', above: '#btnNewRound', aboveName: '"Nova Rodada"' },
        { player: beto, who: 'guest', rare: '#btnLeaveMatch', rareName: '"Sair da Partida"', above: null }
    ];

    // 1000 px: duas colunas (perfil à esquerda, ranking e jogadores abaixo
    // da pergunta); 375 px: uma coluna só.
    for (const width of [1000, 375]) {
        for (const { player, who, rare, rareName, above, aboveName } of roles) {
            const at = ' a ' + width + ' px (' + who + ')';
            await player.page.setViewportSize({ width, height: 800 });
            // Os cards e os botões têm `transition: all`: ao estreitar a
            // janela, a posição na ordem (order) leva até 0,3 s para chegar;
            // medir antes pegaria o perfil ainda acima da pergunta. As
            // animações sem fim (ex.: o ⏳) não são transição e não contam.
            await player.waitFor(() => !document.getAnimations().some(a => a instanceof CSSTransition));
            await expect(player.page.locator('#screenGame .ranking-card'), 'o card do ranking deveria aparecer' + at).toBeVisible();
            await expect(player.page.locator('#screenGame .players-online'), 'o card dos jogadores deveria aparecer' + at).toBeVisible();
            await expect(player.page.locator('#rankingList .rank-item'), 'o ranking deveria mostrar os dois jogadores' + at).toHaveCount(2);
            await expect(player.page.locator('#playersOnlineList .online-player'), 'a lista deveria mostrar os dois jogadores' + at).toHaveCount(2);
            await expect(player.page.locator(rare), 'pré-condição: o ' + rareName + ' aparece para o ' + who).toBeVisible();
            if (above) await expect(player.page.locator(above), 'pré-condição: o ' + aboveName + ' aparece para o ' + who).toBeVisible();

            const layout = await player.state(({ rare, above }) => {
                const box = (selector) => {
                    const r = document.querySelector(selector).getBoundingClientRect();
                    return { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
                };
                return {
                    viewport: document.documentElement.clientWidth,
                    ranking: box('#screenGame .ranking-card'),
                    online: box('#screenGame .players-online'),
                    main: box('#screenGame .main-area'),
                    // No celular a coluna do perfil não tem caixa própria
                    // (display: contents): mede o card e os botões.
                    profile: box('#screenGame .focus-areas-card'),
                    rare: box(rare),
                    above: above ? box(above) : null
                };
            }, { rare, above });
            if (width === 375) {
                expect(layout.profile.top, 'o perfil deveria ficar abaixo da área da pergunta' + at).toBeGreaterThanOrEqual(layout.main.bottom);
                if (above) {
                    expect(layout.above.top, 'o ' + aboveName + ' deveria ficar abaixo do perfil' + at).toBeGreaterThanOrEqual(layout.profile.bottom);
                    expect(layout.ranking.top, 'o ranking deveria ficar abaixo do ' + aboveName + at).toBeGreaterThanOrEqual(layout.above.bottom);
                }
            }
            const overlaps = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
            for (const [name, card] of [['ranking', layout.ranking], ['jogadores', layout.online]]) {
                expect(card.left, 'o card de ' + name + ' começa antes da borda esquerda da tela' + at).toBeGreaterThanOrEqual(0);
                expect(card.right, 'o card de ' + name + ' passa da borda direita da tela' + at).toBeLessThanOrEqual(layout.viewport);
                expect(overlaps(card, layout.main), 'o card de ' + name + ' cobre a área da pergunta' + at).toBe(false);
                expect(overlaps(card, layout.profile), 'o card de ' + name + ' cobre o perfil' + at).toBe(false);
                expect(card.top, 'o card de ' + name + ' deveria ficar abaixo da área da pergunta' + at).toBeGreaterThanOrEqual(layout.main.bottom);
                if (width === 1000) {
                    expect(card.left, 'o card de ' + name + ' deveria ficar na coluna da pergunta, à direita do perfil,' + at).toBeGreaterThanOrEqual(layout.profile.right);
                } else {
                    // No celular, depois do perfil e antes do botão raro.
                    expect(card.top, 'o card de ' + name + ' deveria ficar abaixo do perfil' + at).toBeGreaterThanOrEqual(layout.profile.bottom);
                    expect(layout.rare.top, 'o ' + rareName + ' deveria ficar abaixo do card de ' + name + at).toBeGreaterThanOrEqual(card.bottom);
                }
            }
        }
    }
});
