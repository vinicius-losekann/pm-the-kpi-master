// ============================================
// PM: The KPI Master - Testes no navegador: jogadores e ajudantes
// ============================================
// Cada "jogador" é um contexto separado do navegador: armazenamento,
// login anônimo (uid) e abas próprios — como um navegador diferente.
// Os arquivos do Firebase (gstatic.com, mesma versão do jogo) vêm da
// internet; o banco e o login são os do emulador local (projeto "demo-",
// que não existe fora do emulador). Fontes e outros endereços externos
// são bloqueados, para o teste não depender de mais nada.
// ============================================

const { test: base, expect } = require('@playwright/test');

const SITE = 'http://127.0.0.1:' + (process.env.SITE_PORT || 8080);
// Emulador do Firebase (firebase.json); o projeto "demo-" só existe nele.
const FIREBASE_PROJECT = 'demo-pm-the-kpi-master';
const FIREBASE_AUTH_PORT = 9099;
const FIREBASE_DATABASE_PORT = 9400;

/** Código de sala único por cenário (evita sobra de um cenário no outro). */
function roomCode() {
    return 'e2e' + Date.now().toString(36).slice(-5) + Math.floor(Math.random() * 1000);
}

// Funções executadas na página (cada uma sozinha, sem nada de fora).

/** O jogo está ligado à sala: host, ou guest aceito. */
function linkReadyInPage() {
    const n = window.Game && Game.network;
    if (!n || !n.linkStatus) return false;
    const s = n.linkStatus();
    return !!s && (s.isHost === true || s.isAdmitted === true);
}

/** Guest ligado ao host: aceito, com o host presente e o estado recebido. */
function connectedToHostInPage() {
    const n = window.Game && Game.network;
    if (!n || !n.linkStatus || Game.state.isHost !== false) return false;
    const s = n.linkStatus();
    return !!s && s.isAdmitted === true && s.hostOnline === true && s.synced === true;
}

/** É o host da sala. */
function roomHostInPage() {
    const n = window.Game && Game.network;
    if (!n || !n.linkStatus || Game.state.isHost !== true) return false;
    const s = n.linkStatus();
    return !!s && s.isHost === true;
}

async function createPlayer(browser, name) {
    const context = await browser.newContext();
    const logs = [];

    await context.route('**/*', (route) => {
        const url = route.request().url();
        // Site do jogo e emulador do Firebase (locais) e os arquivos do Firebase.
        if (url.startsWith('http://127.0.0.1:')) return route.continue();
        if (/^https:\/\/www\.gstatic\.com\/firebasejs\//.test(url)) return route.continue();
        return route.abort();
    });

    // Aponta o Firebase do jogo e da página de teste de conexão para o
    // emulador: acrescenta linhas ao config servido, sem mexer no arquivo
    // do repositório.
    await context.route(SITE + '/config/game-config.js', async (route) => {
        const response = await route.fetch();
        const body = (await response.text()) +
            "\nCONFIG.FIREBASE = { apiKey: 'demo-key', authDomain: '" + FIREBASE_PROJECT + ".firebaseapp.com', " +
            "databaseURL: 'https://" + FIREBASE_PROJECT + "-default-rtdb.firebaseio.com', projectId: '" + FIREBASE_PROJECT + "' };\n" +
            "CONFIG.FIREBASE_EMULATOR = { host: '127.0.0.1', authPort: " + FIREBASE_AUTH_PORT +
            ", databasePort: " + FIREBASE_DATABASE_PORT + " };\n";
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

        /**
         * Abre o jogo: o host cria a sala na tela inicial e entra; o guest
         * abre o link da sala (código e nome). Espera o jogo ficar ligado
         * à sala.
         */
        async openGame(code, { host }) {
            if (!player.page || player.page.isClosed()) await player.newTab();
            if (host) {
                const created = await player.createRoomFromHomeScreen(code);
                if (!created.created) throw new Error(name + ' não conseguiu criar a sala ' + code + ': ' + created.warning);
                await player.page.click('#btnEnterCreatedRoom');
                await player.page.waitForURL(/game\.html/, { timeout: 20000 });
            } else {
                await player.page.goto(SITE + '/game.html?' + new URLSearchParams({ room: code, playerName: name }).toString());
            }
            await player.waitFor(linkReadyInPage);
        },

        /**
         * Entra pela tela inicial, como um jogador faria: "Entrar em uma
         * sala", nome e código. Espera chegar ao jogo e ficar ligado à sala.
         */
        async joinFromHomeScreen(code) {
            await player.tryJoinFromHomeScreen(code);
            await player.page.waitForURL(/game\.html/, { timeout: 20000 });
            await player.waitFor(linkReadyInPage);
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

        /** É guest e está ligado ao host da sala, com o estado recebido? */
        isConnectedToHost() {
            return player.page.evaluate(connectedToHostInPage);
        },

        /** É o host da sala? */
        isRoomHost() {
            return player.page.evaluate(roomHostInPage);
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

        /**
         * Se for a vez deste jogador perguntar (botão "Fazer a pergunta"
         * visível e liberado), clica nele.
         */
        async askIfMyTurn() {
            return player.page.evaluate(() => {
                const button = document.getElementById('btnAskQuestion');
                if (!button || button.disabled || !button.offsetParent) return false;
                button.click();
                return true;
            });
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
 * Faz a pergunta e responde (sempre a alternativa A) a cada vez que
 * alguém do grupo é o Perguntador ou o Respondedor, até o host marcar a
 * rodada como encerrada.
 */
async function answerUntilRoundEnds(host, everyone) {
    const deadline = Date.now() + 60000;
    while (Date.now() < deadline) {
        if (await host.state(() => Game.state.roundEnded === true)) return;
        for (const p of everyone) await p.askIfMyTurn();
        for (const p of everyone) await p.answerIfMyTurn();
        await host.page.waitForTimeout(500);
    }
    throw new Error('A rodada não terminou em 60s');
}

/**
 * Faz a partida andar (o host clica em "Nova Rodada" quando a rodada
 * acaba, o Perguntador faz a pergunta e quem tiver pergunta aberta fora
 * de `targets` responde) até um dos jogadores de `targets` estar com a
 * pergunta aberta. Devolve esse jogador.
 */
async function waitForOpenQuestion(host, everyone, targets) {
    const deadline = Date.now() + 60000;
    while (Date.now() < deadline) {
        for (const p of everyone) await p.askIfMyTurn();
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

// Quanto esperar pela queda de quem fecha a aba: o host só dá o jogador
// como caído com o sinal de vida parado há mais de PRESENCE_TIMEOUT (20 s
// no config real), conferido a cada 1 s — mais a folga do Actions.
const DROP_WAIT = 35000;

/** Espera o host voltar (F5 ou aba reaberta): de novo host da sala, com a partida em andamento. */
async function waitForHostBack(host) {
    await expect.poll(() => host.isRoomHost(), { timeout: 25000, message: host.name + ' deveria voltar como host da sala' }).toBe(true);
    await host.waitFor(() => Game.state.gameStarted === true, { timeout: 25000 });
}

/**
 * Troca de host: espera um dos `candidates` virar o host da sala (quem
 * assume recarrega a página antes) e o devolve. Durante a recarga, a
 * página não responde: conta como "ainda não".
 */
async function waitForNewHost(candidates, timeout = 25000) {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
        for (const p of candidates) {
            if (!p.page || p.page.isClosed()) continue;
            if (await p.isRoomHost().catch(() => false)) return p;
        }
        await new Promise(resolve => setTimeout(resolve, 250));
    }
    throw new Error('Nenhum de ' + candidates.map(p => p.name).join('/') + ' assumiu a sala em ' + (timeout / 1000) + 's');
}

module.exports = {
    test, expect, roomCode, startMatch, answerUntilRoundEnds,
    waitForOpenQuestion, waitForHostBack, waitForNewHost, SITE, DROP_WAIT
};