// ============================================
// PM: The KPI Master - Testes no navegador: jogadores e ajudantes
// ============================================
// Cada "jogador" é um contexto separado do navegador: armazenamento,
// token de identidade e abas próprios — como um navegador diferente.
// O PeerJS vem do pacote local (mesma versão do jogo) e aponta para o
// servidor de sinalização local; fontes e outros endereços externos
// são bloqueados, para o teste não depender da internet.
// ============================================

const path = require('path');
const { test: base, expect } = require('@playwright/test');

const ROOT = path.resolve(__dirname, '..', '..');
const SITE = 'http://127.0.0.1:' + (process.env.SITE_PORT || 8080);
const PEER_PORT = Number(process.env.PEER_PORT || 9000);
const LOCAL_PEERJS = path.join(ROOT, 'node_modules', 'peerjs', 'dist', 'peerjs.min.js');
const ROOM_PREFIX = 'pm-the-kpi-master-';

/** Código de sala único por cenário (evita sobra de um cenário no outro). */
function roomCode() {
    return 'e2e' + Date.now().toString(36).slice(-5) + Math.floor(Math.random() * 1000);
}

/** ID completo da sala (prefixo + código), como o jogo monta. */
function roomId(code) {
    return ROOM_PREFIX + code;
}

async function createPlayer(browser, name) {
    const context = await browser.newContext();
    const logs = [];

    await context.route('**/*', (route) => {
        const url = route.request().url();
        // Site do jogo e servidor PeerJS local (o PeerJS pede um ID novo
        // por HTTP a quem entra sem ID fixo).
        if (url.startsWith('http://127.0.0.1:')) return route.continue();
        if (/unpkg\.com\/peerjs@/.test(url)) {
            return route.fulfill({ path: LOCAL_PEERJS, contentType: 'application/javascript' });
        }
        return route.abort();
    });

    // Aponta o PeerJS do jogo para o servidor local: acrescenta uma linha
    // ao config servido, sem mexer no arquivo do repositório.
    await context.route(SITE + '/config/game-config.js', async (route) => {
        const response = await route.fetch();
        const body = (await response.text()) +
            "\nCONFIG.PEER = { debug: 0, host: '127.0.0.1', port: " + PEER_PORT + ", path: '/', secure: false };\n";
        await route.fulfill({ response, body });
    });

    const player = {
        name,
        context,
        logs,
        page: null,

        async newTab() {
            const page = await context.newPage();
            page.on('console', (m) => logs.push('[' + name + '] ' + m.text()));
            page.on('pageerror', (e) => logs.push('[' + name + '] ERRO NA PÁGINA: ' + e.message));
            page.on('dialog', (d) => { logs.push('[' + name + '] AVISO: ' + d.message()); d.accept().catch(() => {}); });
            player.page = page;
            return page;
        },

        /** Abre o jogo direto pelo link da partida (como o link gerado pela tela inicial). */
        async openGame(code, { host }) {
            const id = roomId(code);
            const params = new URLSearchParams({ host: host ? 'true' : 'false', room: id, playerName: name, peerId: id });
            if (!player.page || player.page.isClosed()) await player.newTab();
            await player.page.goto(SITE + '/game.html?' + params.toString());
            await player.waitFor(() => window.Game && Game.network && Game.network.connectionState.getPeer() &&
                Game.network.connectionState.getPeer().open === true);
        },

        /**
         * Entra pela tela inicial, como um jogador faria: "Entrar em uma
         * sala", nome e código. Espera chegar ao jogo e o PeerJS abrir.
         */
        async joinFromHomeScreen(code) {
            await player.tryJoinFromHomeScreen(code);
            await player.page.waitForURL(/game\.html/, { timeout: 20000 });
            await player.waitFor(() => window.Game && Game.network && Game.network.connectionState.getPeer() &&
                Game.network.connectionState.getPeer().open === true);
        },

        /**
         * Preenche "Entrar em uma sala" na tela inicial e clica em entrar,
         * sem esperar o resultado (para quem pode ser recusado).
         */
        async tryJoinFromHomeScreen(code) {
            if (!player.page || player.page.isClosed()) await player.newTab();
            await player.page.goto(SITE + '/index.html');
            await player.page.click('#btnChooseJoin');
            await player.page.fill('#joinPlayerName', name);
            await player.page.fill('#joinRoomSuffix', code);
            await player.page.click('#btnJoinRoom');
        },

        /**
         * "Criar sala" na tela inicial com o código informado. Devolve se
         * chegou à tela "Sala criada", o aviso de erro (se houver) e
         * quantos segundos levou do clique até a resposta.
         */
        async createRoomFromHomeScreen(code) {
            if (!player.page || player.page.isClosed()) await player.newTab();
            const page = player.page;
            await page.goto(SITE + '/index.html');
            await page.click('#btnChooseCreate');
            await page.fill('#createPlayerName', name);
            await page.fill('#createRoomId', code);
            const start = Date.now();
            await page.click('#btnCreateRoom');
            await page.waitForFunction(() => document.getElementById('screenCreated').style.display === 'block' ||
                document.getElementById('createFeedback').classList.contains('feedback-error'),
            null, { timeout: 20000, polling: 100 });
            const seconds = (Date.now() - start) / 1000;
            const result = await page.evaluate(() => ({
                created: document.getElementById('screenCreated').style.display === 'block',
                warning: document.getElementById('createFeedback').classList.contains('feedback-error')
                    ? document.getElementById('createFeedback').textContent : ''
            }));
            return { ...result, seconds };
        },

        /**
         * Faz o estado salvo deste navegador parecer gravado há `minutes`
         * minutos (o jogo só restaura o que tem menos de 5). Usa uma aba
         * à parte, no endereço do site. Devolve false se não havia estado salvo.
         */
        async ageSavedState(minutes) {
            const tab = await context.newPage();
            await tab.goto(SITE + '/index.html');
            const existed = await tab.evaluate((ms) => {
                const saved = localStorage.getItem('pmKPI_roomState');
                if (!saved) return false;
                const savedState = JSON.parse(saved);
                savedState.timestamp = new Date(Date.now() - ms).toISOString();
                localStorage.setItem('pmKPI_roomState', JSON.stringify(savedState));
                return true;
            }, minutes * 60 * 1000);
            await tab.close();
            return existed;
        },

        /**
         * Clica num botão como o jogador faria: antes, fecha os avisos que
         * cobrem a tela (evento da rodada, resultado da resposta).
         */
        async click(selector) {
            for (const [modal, closeButton] of [['#modalEvent', '#btnCloseEvent'], ['#modalResult', '#btnCloseResult']]) {
                if (await player.page.locator(modal).isVisible()) {
                    await player.page.evaluate((sel) => document.querySelector(sel).click(), closeButton);
                }
            }
            await player.page.click(selector, { timeout: 10000 });
        },

        /**
         * Está com a pergunta aberta para responder (modal visível, botões
         * ativos)? #altA é o texto da alternativa; o botão é o elemento
         * em volta dele.
         */
        hasOpenQuestion() {
            return player.page.evaluate(() => {
                const modal = document.getElementById('modalAnswerQuestion');
                const alt = document.getElementById('altA');
                const button = alt && alt.closest('button');
                return !!modal && modal.style.display === 'flex' && !!button && !button.disabled;
            });
        },

        /** Está conectado ao host do ID informado (conexão aberta)? */
        isConnectedTo(hostId) {
            return player.page.evaluate((id) => {
                const c = Game.network.connectionState.getConnection(id);
                return Game.state.isHost === false && Game.state.hostPeerId === id && !!c && c.open === true;
            }, hostId);
        },

        /** Reabre o mesmo endereço numa aba nova (como reabrir pelo histórico). */
        async reopen(url) {
            await player.newTab();
            await player.page.goto(url);
        },

        /** Fecha a aba como um usuário fecharia (dispara pagehide/beforeunload). */
        async closeTab() {
            const url = player.page.url();
            await player.page.close({ runBeforeUnload: true });
            return url;
        },

        /** Lê um valor do estado do jogo na página. */
        state(fn, arg) {
            return player.page.evaluate(fn, arg);
        },

        /** Espera uma condição (função executada na página) ficar verdadeira. */
        async waitFor(fn, options = {}) {
            await player.page.waitForFunction(fn, options.arg, { timeout: options.timeout || 20000, polling: 200 });
        },

        /** Se for a vez deste jogador responder, clica na alternativa A. */
        async answerIfMyTurn() {
            return player.page.evaluate(() => {
                const modal = document.getElementById('modalAnswerQuestion');
                const alt = document.getElementById('altA');
                const button = alt && alt.closest('button');
                if (!modal || modal.style.display !== 'flex' || !button || button.disabled) return false;
                button.click();
                return true;
            });
        }
    };

    return player;
}

/**
 * Fixture `players`: cria jogadores (navegadores separados) e, se o
 * cenário falhar, anexa o console de cada um ao relatório.
 */
const test = base.extend({
    players: async ({ browser }, use, testInfo) => {
        const list = [];
        await use({
            add: async (name) => {
                const p = await createPlayer(browser, name);
                list.push(p);
                return p;
            }
        });
        if (testInfo.status !== testInfo.expectedStatus) {
            for (const p of list) {
                await testInfo.attach('console de ' + p.name, { body: p.logs.join('\n'), contentType: 'text/plain' });
            }
        }
        for (const p of list) await p.context.close().catch(() => {});
    }
});

/**
 * Prepara uma partida em andamento: o primeiro jogador cria a sala como
 * host, os outros entram, e o host inicia.
 */
async function startMatch(host, guests, code) {
    await host.openGame(code, { host: true });
    for (const g of guests) await g.openGame(code, { host: false });
    const total = guests.length + 1;
    await host.waitFor((n) => Game.state.players.length === n, { arg: total });
    await host.click('#btnStartGame');
    for (const p of [host, ...guests]) {
        await p.waitFor(() => Game.state.gameStarted === true);
    }
}

/**
 * Responde (sempre a alternativa A) a cada vez que alguém do grupo é o
 * Respondedor, até o host marcar a rodada como encerrada.
 */
async function answerUntilRoundEnds(host, everyone) {
    const deadline = Date.now() + 60000;
    while (Date.now() < deadline) {
        if (await host.state(() => Game.state.roundEnded === true)) return;
        for (const p of everyone) await p.answerIfMyTurn();
        await host.page.waitForTimeout(500);
    }
    throw new Error('A rodada não terminou em 60s');
}

/**
 * Faz a partida andar (o host clica em "Nova Rodada" quando a rodada
 * acaba e quem tiver pergunta aberta fora de `targets` responde) até um
 * dos jogadores de `targets` estar com a pergunta aberta. Devolve esse
 * jogador.
 */
async function waitForOpenQuestion(host, everyone, targets) {
    const deadline = Date.now() + 60000;
    while (Date.now() < deadline) {
        for (const p of targets) {
            if (await p.hasOpenQuestion()) return p;
        }
        if (await host.state(() => Game.state.roundEnded === true)) {
            await host.click('#btnNewRound');
        }
        for (const p of everyone) {
            if (!targets.includes(p)) await p.answerIfMyTurn();
        }
        await host.page.waitForTimeout(300);
    }
    throw new Error('Nenhuma pergunta abriu para ' + targets.map(p => p.name).join('/') + ' em 60s');
}

/** Espera um dos jogadores assumir como host (com o peer novo aberto). Devolve quem assumiu. */
async function waitForNewHost(candidates, timeout = 25000) {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
        for (const p of candidates) {
            const tookOver = await p.state(() => Game.state.isHost === true && Game.state.peerId === Game.state.hostPeerId);
            if (tookOver) return p;
        }
        await candidates[0].page.waitForTimeout(200);
    }
    throw new Error('Ninguém assumiu como host em ' + (timeout / 1000) + 's');
}

module.exports = {
    test, expect, roomCode, roomId, startMatch, answerUntilRoundEnds,
    waitForOpenQuestion, waitForNewHost, SITE
};