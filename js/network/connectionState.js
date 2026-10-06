// ============================================
// PM: The KPI Master - Network: Connection State
// ============================================
// Guarda o estado de conexão compartilhado entre peerService.js,
// messageHandler.js e hostMigration.js: a instância do PeerJS (`myPeer`)
// e o mapa de conexões ativas (`connections`).
// Os três arquivos precisam enxergar a MESMA conexão — por isso ela fica
// aqui, acessada por getters/setters.
// ============================================

let myPeer = null;
let connections = {};

function getPeer() {
    return myPeer;
}

function setPeer(peer) {
    myPeer = peer;
}

function getConnections() {
    return connections;
}

function getConnection(peerId) {
    return connections[peerId];
}

function setConnection(peerId, conn) {
    connections[peerId] = conn;
}

function removeConnection(peerId) {
    delete connections[peerId];
}

/**
 * Limpa todas as conexões, preservando a mesma referência do objeto
 * (em vez de reatribuir `connections = {}`), para não deixar
 * referências antigas apontando para um objeto "morto".
 */
function resetConnections() {
    Object.keys(connections).forEach(key => delete connections[key]);
}

// ============================================
// EXPORTAÇÃO
// ============================================
window.Game = window.Game || {};
window.Game.network = window.Game.network || {};
window.Game.network.connectionState = {
    getPeer,
    setPeer,
    getConnections,
    getConnection,
    setConnection,
    removeConnection,
    resetConnections
};