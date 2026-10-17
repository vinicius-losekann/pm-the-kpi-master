// ============================================
// PM: The KPI Master - Tela do teste de conexão pelo Firebase
// ============================================
// Liga a página firebase-check.html à lógica de
// js/network/connectionCheck.js: carrega o Firebase, faz o login
// anônimo, cria ou entra na sala, mostra os aparelhos, as mensagens de
// teste com o tempo de ida e volta e o tráfego. Depois de um F5, entra
// de novo sozinha na última sala (guardada neste navegador).
//
// Não faz parte do jogo (roadmap 2.9). Como a tela inicial
// (roomEntry.js), os textos ficam aqui, sem o i18n do jogo.
// Os avisos dizem em que ponto a conexão falhou (arquivos do Firebase,
// login ou banco), para o teste em redes diferentes.
// ============================================

const CHECK_STORAGE_KEY = 'pmKPI_connectionCheck';
// Sem login nesse prazo, avisa que a rede pode estar bloqueando.
const SIGN_IN_WARNING_MS = 15000;

const CHECK_REASONS = {
    'invalid-code': 'Código inválido: use de 1 a 20 letras, números, "_" ou "-".',
    'invalid-name': 'Digite o seu nome (até 20 caracteres).',
    'room-exists': 'Já existe uma sala com esse código. Escolha outro código ou clique em "Entrar".',
    'room-not-found': 'Não existe sala com esse código. Confira o código ou crie a sala.',
    'not-configured': 'O Firebase ainda não foi configurado neste site (CONFIG.FIREBASE em config/game-config.js).',
    'sdk-blocked': 'Não foi possível carregar o Firebase (www.gstatic.com). A rede pode estar bloqueando os serviços do Google.',
    'sign-in-slow': 'O login no Firebase está demorando. A rede pode estar bloqueando o Firebase — anote a rede e o aparelho.',
    'sign-in-failed': 'O login no Firebase falhou: ',
    'error': 'Erro ao falar com o Firebase: '
};

const checkPage = { uid: null, check: null, db: null, busy: false };
window.Game = window.Game || {};
window.Game.connectionCheckPage = checkPage;

const nameInput = document.getElementById('checkName');
const codeInput = document.getElementById('checkCode');
const createButton = document.getElementById('btnCheckCreate');
const joinButton = document.getElementById('btnCheckJoin');
const pingButton = document.getElementById('btnCheckPing');
const leaveButton = document.getElementById('btnCheckLeave');
const feedback = document.getElementById('checkFeedback');
const statusLabel = document.getElementById('checkStatus');
const roomLabel = document.getElementById('checkRoom');
const roleLabel = document.getElementById('checkRole');
const networkLabel = document.getElementById('checkNetwork');
const devicesList = document.getElementById('checkDevices');
const logList = document.getElementById('checkLog');
const trafficLabel = document.getElementById('checkTraffic');

// ============================================
// AVISOS E SALA GUARDADA
// ============================================

function showFeedback(reason, detail) {
    feedback.textContent = (CHECK_REASONS[reason] || CHECK_REASONS.error) + (detail || '');
    feedback.setAttribute('data-reason', reason);
    feedback.hidden = false;
}

function clearFeedback() {
    feedback.textContent = '';
    feedback.setAttribute('data-reason', '');
    feedback.hidden = true;
}

function loadSavedRoom() {
    try {
        const saved = JSON.parse(localStorage.getItem(CHECK_STORAGE_KEY) || 'null');
        return saved && typeof saved.name === 'string' && typeof saved.code === 'string' ? saved : null;
    } catch (e) {
        return null;
    }
}

function saveRoom(saved) {
    try {
        if (saved) localStorage.setItem(CHECK_STORAGE_KEY, JSON.stringify(saved));
        else localStorage.removeItem(CHECK_STORAGE_KEY);
    } catch (e) { /* sem armazenamento (aba anônima): só não volta sozinho depois do F5 */ }
}

// ============================================
// TELA
// ============================================

function setStatus(state, text) {
    statusLabel.setAttribute('data-state', state);
    statusLabel.textContent = text;
}

function listItem(text, kind) {
    const li = document.createElement('li');
    li.textContent = text;
    if (kind) li.setAttribute('data-kind', kind);
    return li;
}

function render(s) {
    if (!s) s = { code: null, isHost: false, connected: false, devices: [], pings: [], roundTrips: [], bytesSent: 0, bytesReceived: 0 };

    if (!s.code) setStatus('idle', checkPage.uid ? '⚪ Login feito — fora de sala' : '⚪ Fazendo login...');
    else if (s.connected) setStatus('connected', '🟢 Conectado');
    else setStatus('disconnected', '🔴 Sem conexão — tentando voltar...');

    roomLabel.textContent = s.code || '—';
    roleLabel.textContent = s.code ? (s.isHost ? '(você criou)' : '(você entrou)') : '';

    devicesList.replaceChildren(...s.devices.map(d =>
        listItem('📱 ' + d.name + (d.uid === checkPage.uid ? ' (você)' : ''))));

    const log = [
        ...s.roundTrips.map(r => listItem('↩️ ' + r.name + ' respondeu em ' + r.ms + ' ms', 'echo')),
        ...s.pings.map(p => listItem('📩 ' + p.name + ' enviou uma mensagem de teste', 'ping'))
    ];
    logList.replaceChildren(...log.reverse());

    trafficLabel.textContent = 'Tráfego desta página: enviados ' + s.bytesSent + ' bytes · recebidos ' + s.bytesReceived + ' bytes';

    pingButton.disabled = !s.code || checkPage.busy;
    leaveButton.disabled = !s.code || checkPage.busy;
    createButton.disabled = !checkPage.uid || checkPage.busy;
    joinButton.disabled = !checkPage.uid || checkPage.busy;
}

function showNetwork() {
    const c = navigator.connection;
    const type = c && c.effectiveType ? c.effectiveType : 'não informado pelo navegador';
    networkLabel.textContent = 'Rede: ' + type + (navigator.onLine === false ? ' (o navegador diz que está sem internet)' : '');
}

function currentSnapshot() {
    return checkPage.check ? checkPage.check.snapshot() : null;
}

// ============================================
// AÇÕES
// ============================================

/** Cria (createRoom) ou entra (joinRoom) na sala com o nome e o código da tela. */
async function enterRoom(action) {
    clearFeedback();
    const name = nameInput.value.trim();
    const code = codeInput.value.trim();
    if (!name || name.length > 20) { showFeedback('invalid-name'); return; }
    if (!checkPage.uid || checkPage.busy) return;

    checkPage.busy = true;
    render(currentSnapshot());
    try {
        if (checkPage.check) await checkPage.check.leave();
        checkPage.check = Game.connectionCheck.create({ db: checkPage.db, uid: checkPage.uid, name, onChange: render });
        const result = await checkPage.check[action](code);
        if (result.ok) {
            saveRoom({ name, code });
        } else {
            showFeedback(result.reason);
            if (result.reason === 'room-not-found') saveRoom(null);
        }
    } catch (e) {
        console.error('❌ Teste de conexão:', e);
        showFeedback('error', (e && (e.code || e.message)) || String(e));
    } finally {
        checkPage.busy = false;
        render(currentSnapshot());
    }
}

async function sendPing() {
    if (!checkPage.check) return;
    try {
        await checkPage.check.sendPing();
    } catch (e) {
        console.error('❌ Mensagem de teste:', e);
        showFeedback('error', (e && (e.code || e.message)) || String(e));
    }
}

async function leaveRoom() {
    if (!checkPage.check) return;
    clearFeedback();
    try {
        await checkPage.check.leave();
    } catch (e) {
        console.error('❌ Sair da sala:', e);
        showFeedback('error', (e && (e.code || e.message)) || String(e));
    }
    saveRoom(null);
    render(currentSnapshot());
}

createButton.addEventListener('click', () => enterRoom('createRoom'));
joinButton.addEventListener('click', () => enterRoom('joinRoom'));
pingButton.addEventListener('click', sendPing);
leaveButton.addEventListener('click', leaveRoom);

// ============================================
// INÍCIO: FIREBASE E LOGIN ANÔNIMO
// ============================================

function start() {
    showNetwork();
    render(null);

    if (typeof firebase === 'undefined') { showFeedback('sdk-blocked'); setStatus('idle', '⚪ Sem Firebase'); return; }
    if (!CONFIG.FIREBASE) { showFeedback('not-configured'); setStatus('idle', '⚪ Sem Firebase'); return; }

    firebase.initializeApp(CONFIG.FIREBASE);
    const auth = firebase.auth();
    const db = firebase.database();
    const emulator = CONFIG.FIREBASE_EMULATOR;
    if (emulator) {
        auth.useEmulator('http://' + emulator.host + ':' + emulator.authPort, { disableWarnings: true });
        db.useEmulator(emulator.host, emulator.databasePort);
    }
    checkPage.db = db;

    const slowTimer = setTimeout(() => { if (!checkPage.uid) showFeedback('sign-in-slow'); }, SIGN_IN_WARNING_MS);

    auth.signInAnonymously().then((credential) => {
        clearTimeout(slowTimer);
        checkPage.uid = credential.user.uid;
        console.log('🔐 Login anônimo feito');
        if (feedback.getAttribute('data-reason') === 'sign-in-slow') clearFeedback();
        render(currentSnapshot());

        // Depois de um F5: entra de novo na última sala.
        const saved = loadSavedRoom();
        if (saved) {
            nameInput.value = saved.name;
            codeInput.value = saved.code;
            enterRoom('joinRoom');
        }
    }).catch((e) => {
        clearTimeout(slowTimer);
        console.error('❌ Login anônimo:', e);
        showFeedback('sign-in-failed', (e && (e.code || e.message)) || String(e));
        setStatus('idle', '⚪ Sem login');
    });
}

start();
