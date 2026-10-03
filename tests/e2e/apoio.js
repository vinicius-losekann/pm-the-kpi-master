// ============================================
// PM: The KPI Master - Testes de ponta a ponta: apoio
// ============================================
// Cada "jogador" é um contexto separado do navegador: armazenamento,
// token de identidade e abas próprios — como um navegador diferente.
// O PeerJS vem do pacote local (mesma versão do jogo) e aponta para o
// servidor de sinalização local; fontes e outros endereços externos
// são bloqueados, para o teste não depender da internet.
// ============================================

const path = require('path');
const { test: base, expect } = require('@playwright/test');

const RAIZ = path.resolve(__dirname, '..', '..');
const SITE = 'http://127.0.0.1:' + (process.env.PORTA_SITE || 8080);
const PORTA_PEER = Number(process.env.PORTA_PEER || 9000);
const PEERJS_LOCAL = path.join(RAIZ, 'node_modules', 'peerjs', 'dist', 'peerjs.min.js');
const PREFIXO_SALA = 'pm-the-kpi-master-';

/** Código de sala único por cenário (evita sobra de um cenário no outro). */
function codigoDeSala() {
    return 'e2e' + Date.now().toString(36).slice(-5) + Math.floor(Math.random() * 1000);
}

/** ID completo da sala (prefixo + código), como o jogo monta. */
function idDaSala(codigo) {
    return PREFIXO_SALA + codigo;
}

async function criarJogador(browser, nome) {
    const contexto = await browser.newContext();
    const logs = [];

    await contexto.route('**/*', (rota) => {
        const url = rota.request().url();
        // Site do jogo e servidor PeerJS local (o PeerJS pede um ID novo
        // por HTTP a quem entra sem ID fixo).
        if (url.startsWith('http://127.0.0.1:')) return rota.continue();
        if (/unpkg\.com\/peerjs@/.test(url)) {
            return rota.fulfill({ path: PEERJS_LOCAL, contentType: 'application/javascript' });
        }
        return rota.abort();
    });

    // Aponta o PeerJS do jogo para o servidor local: acrescenta uma linha
    // ao config servido, sem mexer no arquivo do repositório.
    await contexto.route(SITE + '/config/game-config.js', async (rota) => {
        const resposta = await rota.fetch();
        const corpo = (await resposta.text()) +
            "\nCONFIG.PEER = { debug: 0, host: '127.0.0.1', port: " + PORTA_PEER + ", path: '/', secure: false };\n";
        await rota.fulfill({ response: resposta, body: corpo });
    });

    const jogador = {
        nome,
        contexto,
        logs,
        page: null,

        async novaAba() {
            const page = await contexto.newPage();
            page.on('console', (m) => logs.push('[' + nome + '] ' + m.text()));
            page.on('pageerror', (e) => logs.push('[' + nome + '] ERRO NA PÁGINA: ' + e.message));
            page.on('dialog', (d) => { logs.push('[' + nome + '] AVISO: ' + d.message()); d.accept().catch(() => {}); });
            jogador.page = page;
            return page;
        },

        /** Abre o jogo direto pelo link da partida (como o link gerado pela tela inicial). */
        async abrirJogo(codigo, { host }) {
            const id = idDaSala(codigo);
            const params = new URLSearchParams({ host: host ? 'true' : 'false', room: id, playerName: nome, peerId: id });
            if (!jogador.page || jogador.page.isClosed()) await jogador.novaAba();
            await jogador.page.goto(SITE + '/game.html?' + params.toString());
            await jogador.esperar(() => window.Game && Game.network && Game.network.connectionState.getPeer() &&
                Game.network.connectionState.getPeer().open === true);
        },

        /**
         * Entra pela tela inicial, como um jogador faria: "Entrar em uma
         * sala", nome e código. Espera chegar ao jogo e o PeerJS abrir.
         */
        async entrarPelaTelaInicial(codigo) {
            if (!jogador.page || jogador.page.isClosed()) await jogador.novaAba();
            await jogador.page.goto(SITE + '/index.html');
            await jogador.page.click('#btnChooseJoin');
            await jogador.page.fill('#joinPlayerName', nome);
            await jogador.page.fill('#joinRoomSuffix', codigo);
            await jogador.page.click('#btnJoinRoom');
            await jogador.page.waitForURL(/game\.html/, { timeout: 20000 });
            await jogador.esperar(() => window.Game && Game.network && Game.network.connectionState.getPeer() &&
                Game.network.connectionState.getPeer().open === true);
        },

        /**
         * Clica num botão como o jogador faria: antes, fecha os avisos que
         * cobrem a tela (evento da rodada, resultado da resposta).
         */
        async clicar(seletor) {
            for (const [modal, fechar] of [['#modalEvento', '#btnFecharEvento'], ['#modalResult', '#btnCloseResult']]) {
                if (await jogador.page.locator(modal).isVisible()) {
                    await jogador.page.evaluate((sel) => document.querySelector(sel).click(), fechar);
                }
            }
            await jogador.page.click(seletor, { timeout: 10000 });
        },

        /** Está com a pergunta aberta para responder (modal visível, botões ativos)? */
        temPerguntaAberta() {
            return jogador.page.evaluate(() => {
                const modal = document.getElementById('modalResponderPergunta');
                const alt = document.getElementById('altA');
                return !!modal && modal.style.display === 'flex' && !!alt && !alt.disabled;
            });
        },

        /** Está conectado ao host do ID informado (conexão aberta)? */
        conectadoA(idDoHost) {
            return jogador.page.evaluate((id) => {
                const c = Game.network.connectionState.getConnection(id);
                return Game.state.isHost === false && Game.state.hostPeerId === id && !!c && c.open === true;
            }, idDoHost);
        },

        /** Reabre o mesmo endereço numa aba nova (como reabrir pelo histórico). */
        async reabrir(url) {
            await jogador.novaAba();
            await jogador.page.goto(url);
        },

        /** Fecha a aba como um usuário fecharia (dispara pagehide/beforeunload). */
        async fecharAba() {
            const url = jogador.page.url();
            await jogador.page.close({ runBeforeUnload: true });
            return url;
        },

        /** Lê um valor do estado do jogo na página. */
        estado(funcao, arg) {
            return jogador.page.evaluate(funcao, arg);
        },

        /** Espera uma condição (função executada na página) ficar verdadeira. */
        async esperar(funcao, opcoes = {}) {
            await jogador.page.waitForFunction(funcao, opcoes.arg, { timeout: opcoes.timeout || 20000, polling: 200 });
        },

        /** Se for a vez deste jogador responder, clica na alternativa A. */
        async responderSeForMinhaVez() {
            return jogador.page.evaluate(() => {
                const modal = document.getElementById('modalResponderPergunta');
                const alt = document.getElementById('altA');
                if (!modal || modal.style.display !== 'flex' || !alt || alt.disabled) return false;
                alt.click();
                return true;
            });
        }
    };

    return jogador;
}

/**
 * Fixture `jogadores`: cria jogadores (navegadores separados) e, se o
 * cenário falhar, anexa o console de cada um ao relatório.
 */
const test = base.extend({
    jogadores: async ({ browser }, use, testInfo) => {
        const lista = [];
        await use({
            novo: async (nome) => {
                const j = await criarJogador(browser, nome);
                lista.push(j);
                return j;
            }
        });
        if (testInfo.status !== testInfo.expectedStatus) {
            for (const j of lista) {
                await testInfo.attach('console de ' + j.nome, { body: j.logs.join('\n'), contentType: 'text/plain' });
            }
        }
        for (const j of lista) await j.contexto.close().catch(() => {});
    }
});

/**
 * Prepara uma partida em andamento: o primeiro jogador cria a sala como
 * host, os outros entram, e o host inicia.
 */
async function iniciarPartida(host, guests, codigo) {
    await host.abrirJogo(codigo, { host: true });
    for (const g of guests) await g.abrirJogo(codigo, { host: false });
    const total = guests.length + 1;
    await host.esperar((n) => Game.state.players.length === n, { arg: total });
    await host.clicar('#btnStartGame');
    for (const j of [host, ...guests]) {
        await j.esperar(() => Game.state.gameStarted === true);
    }
}

/**
 * Responde (sempre a alternativa A) a cada vez que alguém do grupo é o
 * Respondedor, até o host marcar a rodada como encerrada.
 */
async function responderAteEncerrarRodada(host, todos) {
    const limite = Date.now() + 60000;
    while (Date.now() < limite) {
        if (await host.estado(() => Game.state.rodadaEncerrada === true)) return;
        for (const j of todos) await j.responderSeForMinhaVez();
        await host.page.waitForTimeout(500);
    }
    throw new Error('A rodada não terminou em 60s');
}

/**
 * Faz a partida andar (o host clica em "Nova Rodada" quando a rodada
 * acaba e quem tiver pergunta aberta fora de `alvos` responde) até um
 * dos jogadores de `alvos` estar com a pergunta aberta. Devolve esse
 * jogador.
 */
async function esperarPerguntaAbertaPara(host, todos, alvos) {
    const limite = Date.now() + 60000;
    while (Date.now() < limite) {
        for (const j of alvos) {
            if (await j.temPerguntaAberta()) return j;
        }
        if (await host.estado(() => Game.state.rodadaEncerrada === true)) {
            await host.clicar('#btnNovaRodada');
        }
        for (const j of todos) {
            if (!alvos.includes(j)) await j.responderSeForMinhaVez();
        }
        await host.page.waitForTimeout(300);
    }
    throw new Error('Nenhuma pergunta abriu para ' + alvos.map(j => j.nome).join('/') + ' em 60s');
}

/** Espera um dos jogadores assumir como host (com o peer novo aberto). Devolve quem assumiu. */
async function esperarNovoHost(candidatos, timeout = 25000) {
    const limite = Date.now() + timeout;
    while (Date.now() < limite) {
        for (const j of candidatos) {
            const assumiu = await j.estado(() => Game.state.isHost === true && Game.state.peerId === Game.state.hostPeerId);
            if (assumiu) return j;
        }
        await candidatos[0].page.waitForTimeout(200);
    }
    throw new Error('Ninguém assumiu como host em ' + (timeout / 1000) + 's');
}

module.exports = {
    test, expect, codigoDeSala, idDaSala, iniciarPartida, responderAteEncerrarRodada,
    esperarPerguntaAbertaPara, esperarNovoHost, SITE
};