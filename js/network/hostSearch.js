// ============================================
// PM: The KPI Master - Network: Host Search
// ============================================
// Encontra a sala mesmo depois de migrações de host.
//
// Quando o host sai e outro jogador assume, a sala passa a existir num
// ID novo: `<ID base>-h1`, depois `-h2`, e assim por diante (o ID base
// fica livre). Quem só conhece o ID base (tela de entrada, link antigo
// da partida) precisa procurar em qual versão a sala está agora.
//
// Este arquivo não depende do estado do jogo: é carregado tanto pela
// tela inicial (index.html) quanto pelo jogo (game.html). É aqui que
// fica a regra única de formação dos IDs de host (computeHostPeerId).
// ============================================

// Quantas versões do host são procuradas a partir da versão inicial
// (a inicial + 5 migrações seguintes).
const VERSIONS_TO_SEARCH = 6;

// Tempo máximo da busca inteira. Um ID que não existe costuma responder
// em uma fração de segundo ('peer-unavailable'); a sala que existe abre
// a conexão em 1–2s.
const SEARCH_TIMEOUT_MS = 5000;

// Buscas em andamento — recebem os avisos de 'peer-unavailable' (ver
// reportPeerUnavailable()).
const activeSearches = new Set();

/**
 * Calcula o ID do host para uma determinada versão de migração.
 * Função pura — não depende do estado, só dos parâmetros.
 * (Antes em state/store.js; veio para cá para a tela inicial usar a
 * mesma regra.)
 */
function computeHostPeerId(baseId, version) {
    return version > 0 ? `${baseId}-h${version}` : baseId;
}

/**
 * Procura a sala nas versões `startVersion` até `startVersion +
 * versionCount - 1`, todas ao mesmo tempo, usando o peer informado (já
 * aberto). A primeira conexão que abrir é a sala; as outras são
 * fechadas.
 *
 * O PeerJS avisa que um ID não existe com um erro no PEER, não na
 * conexão — quem chama precisa repassar esses erros para
 * reportPeerUnavailable(err); sem isso, a busca só termina pelo tempo
 * máximo.
 *
 * @param {Peer} peer
 * @param {string} baseId - ID base da sala
 * @param {Object} options
 * @param {number} [options.startVersion=0]
 * @param {number} [options.versionCount]
 * @param {number} [options.timeoutMs]
 * @param {Function} options.onFound - (conn já aberta, version, id)
 * @param {Function} [options.onGiveUp] - nenhuma versão respondeu
 * @returns {{ cancel: Function }} cancel() encerra sem chamar onGiveUp
 */
function findHost(peer, baseId, options = {}) {
    const startVersion = options.startVersion || 0;
    const versionCount = options.versionCount || VERSIONS_TO_SEARCH;
    const timeoutMs = options.timeoutMs || SEARCH_TIMEOUT_MS;

    const search = {
        pending: new Map(), // id -> { conn, version }
        finished: false,
        fail: null
    };

    const closePending = () => {
        search.pending.forEach(({ conn }) => {
            try { conn.close(); } catch (e) { /* ignora */ }
        });
        search.pending.clear();
    };

    const finish = () => {
        search.finished = true;
        activeSearches.delete(search);
        closePending();
    };

    const giveUp = () => {
        if (search.finished) return;
        finish();
        console.warn('🔎 Sala não encontrada nas versões ' + startVersion + ' a ' + (startVersion + versionCount - 1) + ' de ' + baseId);
        if (options.onGiveUp) options.onGiveUp();
    };

    search.fail = (id) => {
        if (search.finished || !search.pending.has(id)) return;
        const { conn } = search.pending.get(id);
        search.pending.delete(id);
        try { conn.close(); } catch (e) { /* ignora */ }
        if (search.pending.size === 0) giveUp();
    };

    const found = (id, conn, version) => {
        if (search.finished) {
            try { conn.close(); } catch (e) { /* ignora */ }
            return;
        }
        search.pending.delete(id);
        finish();
        console.log('🔎 Sala encontrada em ' + id + ' (versão ' + version + ' do host)');
        options.onFound(conn, version, id);
    };

    activeSearches.add(search);

    if (peer && !peer.destroyed) {
        for (let i = 0; i < versionCount && !search.finished; i++) {
            const version = startVersion + i;
            const id = computeHostPeerId(baseId, version);
            let conn = null;
            try { conn = peer.connect(id, { reliable: true }) || null; } catch (e) { conn = null; }
            if (!conn) continue;
            search.pending.set(id, { conn, version });
            conn.on('open', () => found(id, conn, version));
            conn.on('error', () => search.fail(id));
        }
    }

    if (search.pending.size === 0) {
        giveUp();
    } else {
        setTimeout(giveUp, timeoutMs);
    }

    return { cancel: () => { if (!search.finished) finish(); } };
}

/**
 * Repassa às buscas em andamento um erro 'peer-unavailable' do PeerJS
 * ("Could not connect to peer <id>"): a versão com esse ID é descartada
 * na hora, sem esperar o tempo máximo.
 */
function reportPeerUnavailable(err) {
    const message = (err && err.message) || '';
    activeSearches.forEach(search => {
        Array.from(search.pending.keys()).forEach(id => {
            if (message.endsWith(' ' + id)) search.fail(id);
        });
    });
}

// ============================================
// EXPORTAÇÃO
// ============================================
window.Game = window.Game || {};
window.Game.computeHostPeerId = computeHostPeerId;
window.Game.network = window.Game.network || {};
Object.assign(window.Game.network, {
    findHost,
    reportPeerUnavailable
});