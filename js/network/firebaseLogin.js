// ============================================
// PM: The KPI Master - Network: Login anônimo no Firebase
// ============================================
// Inicia o Firebase (API "compat", carregada de www.gstatic.com pelo
// HTML), aponta o login e o banco para o emulador quando configurado
// (CONFIG.FIREBASE_EMULATOR, só nos testes no navegador) e faz o login
// anônimo. O uid do login é a identidade do aparelho: o Firebase guarda
// o login no navegador, então ele sobrevive a um F5 e a fechar a aba.
// Recebe o SDK por parâmetro — por isso os testes trocam por um falso.
// ============================================

/**
 * Faz o login anônimo.
 *
 * @param {Object} options
 * @param {Object} options.firebase - o SDK do Firebase (window.firebase)
 * @param {Object} options.config - configuração web (CONFIG.FIREBASE)
 * @param {Object|null} options.emulator - { host, authPort, databasePort } ou null
 * @returns {Promise<{db: Object, uid: string, timestamp: Function}>} o
 *   banco, o uid e o valor que grava a hora do servidor; recusada se o
 *   login falhar
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
    const credential = await auth.signInAnonymously();
    console.log('🔐 Login anônimo feito');
    return {
        db,
        uid: credential.user.uid,
        timestamp: () => firebase.database.ServerValue.TIMESTAMP
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
