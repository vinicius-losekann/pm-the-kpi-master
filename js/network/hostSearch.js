// ============================================
// PM: The KPI Master - Network: Host Search
// ============================================
// Fase D3c: encontra a sala mesmo depois de migrações de host.
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
const VERSOES_PROCURADAS = 6;

// Tempo máximo da busca inteira. Um ID que não existe costuma responder
// em uma fração de segundo ('peer-unavailable'); a sala que existe abre
// a conexão em 1–2s.
const ESPERA_BUSCA_MS = 5000;

// Buscas em andamento — recebem os avisos de 'peer-unavailable' (ver
// avisarPeerIndisponivel()).
const buscasAtivas = new Set();

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
 * Procura a sala nas versões `versaoInicial` até `versaoInicial +
 * versoes - 1`, todas ao mesmo tempo, usando o peer informado (já
 * aberto). A primeira conexão que abrir é a sala; as outras são
 * fechadas.
 *
 * O PeerJS avisa que um ID não existe com um erro no PEER, não na
 * conexão — quem chama precisa repassar esses erros para
 * avisarPeerIndisponivel(err); sem isso, a busca só termina pelo tempo
 * máximo.
 *
 * @param {Peer} peer
 * @param {string} baseId - ID base da sala
 * @param {Object} opcoes
 * @param {number} [opcoes.versaoInicial=0]
 * @param {number} [opcoes.versoes]
 * @param {number} [opcoes.esperaMs]
 * @param {Function} opcoes.aoAchar - (conn já aberta, versao, id)
 * @param {Function} [opcoes.aoDesistir] - nenhuma versão respondeu
 * @returns {{ cancelar: Function }} cancelar() encerra sem chamar aoDesistir
 */
function procurarHost(peer, baseId, opcoes = {}) {
    const versaoInicial = opcoes.versaoInicial || 0;
    const versoes = opcoes.versoes || VERSOES_PROCURADAS;
    const esperaMs = opcoes.esperaMs || ESPERA_BUSCA_MS;

    const busca = {
        pendentes: new Map(), // id -> { conn, versao }
        encerrada: false,
        falhou: null
    };

    const fecharPendentes = () => {
        busca.pendentes.forEach(({ conn }) => {
            try { conn.close(); } catch (e) { /* ignora */ }
        });
        busca.pendentes.clear();
    };

    const encerrar = () => {
        busca.encerrada = true;
        buscasAtivas.delete(busca);
        fecharPendentes();
    };

    const desistir = () => {
        if (busca.encerrada) return;
        encerrar();
        console.warn('🔎 Sala não encontrada nas versões ' + versaoInicial + ' a ' + (versaoInicial + versoes - 1) + ' de ' + baseId);
        if (opcoes.aoDesistir) opcoes.aoDesistir();
    };

    busca.falhou = (id) => {
        if (busca.encerrada || !busca.pendentes.has(id)) return;
        const { conn } = busca.pendentes.get(id);
        busca.pendentes.delete(id);
        try { conn.close(); } catch (e) { /* ignora */ }
        if (busca.pendentes.size === 0) desistir();
    };

    const achou = (id, conn, versao) => {
        if (busca.encerrada) {
            try { conn.close(); } catch (e) { /* ignora */ }
            return;
        }
        busca.pendentes.delete(id);
        encerrar();
        console.log('🔎 Sala encontrada em ' + id + ' (versão ' + versao + ' do host)');
        opcoes.aoAchar(conn, versao, id);
    };

    buscasAtivas.add(busca);

    if (peer && !peer.destroyed) {
        for (let i = 0; i < versoes && !busca.encerrada; i++) {
            const versao = versaoInicial + i;
            const id = computeHostPeerId(baseId, versao);
            let conn = null;
            try { conn = peer.connect(id, { reliable: true }) || null; } catch (e) { conn = null; }
            if (!conn) continue;
            busca.pendentes.set(id, { conn, versao });
            conn.on('open', () => achou(id, conn, versao));
            conn.on('error', () => busca.falhou(id));
        }
    }

    if (busca.pendentes.size === 0) {
        desistir();
    } else {
        setTimeout(desistir, esperaMs);
    }

    return { cancelar: () => { if (!busca.encerrada) encerrar(); } };
}

/**
 * Repassa às buscas em andamento um erro 'peer-unavailable' do PeerJS
 * ("Could not connect to peer <id>"): a versão com esse ID é descartada
 * na hora, sem esperar o tempo máximo.
 */
function avisarPeerIndisponivel(err) {
    const mensagem = (err && err.message) || '';
    buscasAtivas.forEach(busca => {
        Array.from(busca.pendentes.keys()).forEach(id => {
            if (mensagem.endsWith(' ' + id)) busca.falhou(id);
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
    procurarHost,
    avisarPeerIndisponivel
});