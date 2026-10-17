// ============================================
// PM: The KPI Master - Network: Login anônimo no Firebase
// ============================================
// Inicia o Firebase (API "compat", carregada de www.gstatic.com pelo
// HTML), aponta o login e o banco para o emulador quando configurado
// (CONFIG.FIREBASE_EMULATOR, só nos testes no navegador) e faz o login
// anônimo. O uid do login é a identidade do aparelho: o Firebase guarda
// o login no navegador, então ele sobrevive a um F5 e a fechar a aba.
// Também dá a hora do servidor (serverNow), usada no relógio e nos prazos.
// Recebe o SDK por parâmetro — por isso os testes trocam por um falso.
// ============================================

/**
 * Faz o login anônimo.
 *
 * @param {Object} options
 * @param {Object} options.firebase - o SDK do Firebase (window.firebase)
 * @param {Object} options.config - configuração web (CONFIG.FIREBASE)
 * @param {Object|null} options.emulator - { host, authPort, databasePort } ou null
 * @returns {Promise<{db: Object, uid: string, timestamp: Function, serverNow: Function}>}
 *   o banco, o uid, o valor que grava a hora do servidor e a hora do
 *   servidor agora, em ms; recusada se o login falhar
 */
async function startFirebaseLogin({ firebase, config, emulator }) {
    if (!firebase.apps.length) firebase.initializeApp(config);
    const auth = firebase.auth();
    const db = firebase.database();
    // O emulador precisa ser ligado antes de qualquer uso do login e do banco.
    if (emulator) {
        auth.useEmulator('http://' + emulator.host + ':' + emulator.authPort, { disableWarnings: true });
        db.useEmulator(emulator.host, emulator.databasePort);
    }
    // Hora do servidor = relógio do aparelho + a diferença que o Firebase
    // mede ao conectar (e mede de novo a cada reconexão). Relógio e prazos
    // da partida contam por ela: todos os aparelhos mostram o mesmo tempo,
    // mesmo com o relógio do computador errado.
    let serverTimeOffset = 0;
    db.ref('.info/serverTimeOffset').on('value', (snap) => {
        serverTimeOffset = Number(snap.val()) || 0;
    });
    const credential = await auth.signInAnonymously();
    console.log('🔐 Login anônimo feito');
    return {
        db,
        uid: credential.user.uid,
        timestamp: () => firebase.database.ServerValue.TIMESTAMP,
        serverNow: () => Date.now() + serverTimeOffset
    };
}

// ============================================
// EXPORTAÇÃO
// ============================================
window.Game = window.Game || {};
window.Game.network = window.Game.network || {};
window.Game.network.firebaseLogin = {
    start: startFirebaseLogin
};
