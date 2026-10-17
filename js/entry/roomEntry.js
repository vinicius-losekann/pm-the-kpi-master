// ============================================
// PM: The KPI Master - Room Entry (Tela Inicial)
// ============================================
// Cria e confere as salas pelo Firebase (login anônimo em
// network/firebaseLogin.js; sala em network/roomLink.js e
// network/roomChannel.js, carregados antes deste arquivo no index.html).
// A sala é o código digitado. Quem cria é o dono da sala no banco: ao
// abrir o jogo no mesmo navegador (mesmo login), entra como host.
// O jogo abre em game.html?room=<código>&playerName=<nome>.
// ============================================

console.log('[ENTRY] Inicializando...');

// --- Telas ---
const screenChoose = document.getElementById('screenChoose');
const screenCreate = document.getElementById('screenCreate');
const screenCreated = document.getElementById('screenCreated');
const screenJoin = document.getElementById('screenJoin');

// --- Criar Sala ---
const createPlayerName = document.getElementById('createPlayerName');
const createRoomId = document.getElementById('createRoomId');
const btnCreateRoom = document.getElementById('btnCreateRoom');
const btnBackFromCreate = document.getElementById('btnBackFromCreate');
const createFeedback = document.getElementById('createFeedback');

// --- Sala Criada ---
const createdRoomIdDisplay = document.getElementById('createdRoomIdDisplay');
const btnCopyCreatedId = document.getElementById('btnCopyCreatedId');
const btnEnterCreatedRoom = document.getElementById('btnEnterCreatedRoom');
const btnBackFromCreated = document.getElementById('btnBackFromCreated');
const createdFeedback = document.getElementById('createdFeedback');

// --- Entrar ---
const joinPlayerName = document.getElementById('joinPlayerName');
const joinRoomSuffix = document.getElementById('joinRoomSuffix');
const btnJoinRoom = document.getElementById('btnJoinRoom');
const btnBackFromJoin = document.getElementById('btnBackFromJoin');
const joinFeedback = document.getElementById('joinFeedback');

let createdRoomCode = '';
let createdPlayerNameValue = '';

// --- Login anônimo (começa ao abrir a página; os botões esperam por ele) ---
function startEntryLogin() {
    if (typeof firebase === 'undefined' || !CONFIG.FIREBASE) {
        return Promise.reject(new Error('Firebase indisponível'));
    }
    return Game.network.firebaseLogin.start({ firebase, config: CONFIG.FIREBASE, emulator: CONFIG.FIREBASE_EMULATOR });
}
const entryLogin = startEntryLogin();
entryLogin.catch(err => console.error('[ENTRY] Login anônimo falhou:', err));

/** URL do jogo para a sala e o nome. */
function gameUrl(code, playerName) {
    return 'game.html?' + new URLSearchParams({ room: code, playerName }).toString();
}

// --- Navegação ---
function showScreen(screen) {
    [screenChoose, screenCreate, screenCreated, screenJoin].forEach(s => s.style.display = 'none');
    screen.style.display = 'block';
    screen.style.animation = 'none';
    screen.offsetHeight;
    screen.style.animation = 'slideUp 0.4s ease';
}

function showFeedback(el, message, type) {
    console.log('[ENTRY]', type + ':', message);
    el.textContent = message;
    el.className = `form-feedback feedback-${type}`;
    el.style.display = 'block';
    el.style.animation = 'none';
    el.offsetHeight;
    el.style.animation = 'slideIn 0.3s ease';
}

function hideFeedback(el) {
    el.style.display = 'none';
}

// --- Botões: Escolher Modo ---
document.getElementById('btnChooseCreate').addEventListener('click', () => {
    console.log('[ENTRY] Modo: CRIAR SALA');
    showScreen(screenCreate);
    createPlayerName.focus();
});

document.getElementById('btnChooseJoin').addEventListener('click', () => {
    console.log('[ENTRY] Modo: ENTRAR');
    showScreen(screenJoin);
    joinPlayerName.focus();
});

// --- Botões: Criar Sala ---
btnBackFromCreate.addEventListener('click', () => {
    showScreen(screenChoose);
    hideFeedback(createFeedback);
});

btnCreateRoom.addEventListener('click', async () => {
    const playerName = createPlayerName.value.trim();
    const roomCode = createRoomId.value.trim();
    hideFeedback(createFeedback);

    if (!playerName || playerName.length < 3 || playerName.length > 20) {
        showFeedback(createFeedback, '⚠️ Nome deve ter entre 3 e 20 caracteres', 'warning');
        createPlayerName.focus();
        return;
    }
    if (!roomCode || roomCode.length < 1 || roomCode.length > 20) {
        showFeedback(createFeedback, '⚠️ Escolha um código para a sala (1-20 caracteres)', 'warning');
        createRoomId.focus();
        return;
    }
    if (!/^[a-zA-Z0-9_-]+$/.test(roomCode)) {
        showFeedback(createFeedback, '⚠️ Use apenas letras, números, hífens e underscores', 'warning');
        createRoomId.focus();
        return;
    }

    console.log('[ENTRY] Criando sala:', roomCode);
    showFeedback(createFeedback, '🔄 Verificando disponibilidade...', 'info');
    btnCreateRoom.disabled = true;
    try {
        const login = await entryLogin;
        const result = await Game.network.createRoom({ db: login.db, uid: login.uid, code: roomCode, timestamp: login.timestamp });
        if (!result.ok) {
            showFeedback(createFeedback, '⚠️ Este código já está em uso. Escolha outro.', 'error');
            return;
        }
        createdRoomCode = roomCode;
        createdPlayerNameValue = playerName;
        createdRoomIdDisplay.textContent = roomCode;
        showScreen(screenCreated);
        hideFeedback(createFeedback);
    } catch (err) {
        console.error('[ENTRY] Erro:', err);
        showFeedback(createFeedback, '⚠️ Erro de conexão. Verifique sua internet.', 'error');
    } finally {
        btnCreateRoom.disabled = false;
    }
});

// --- Botões: Sala Criada ---
btnCopyCreatedId.addEventListener('click', () => {
    navigator.clipboard.writeText(createdRoomCode).then(() => {
        btnCopyCreatedId.textContent = '✅ Copiado!';
        setTimeout(() => { btnCopyCreatedId.textContent = '📋 Copiar'; }, 2000);
    }).catch(() => {
        const range = document.createRange();
        range.selectNode(createdRoomIdDisplay);
        window.getSelection().removeAllRanges();
        window.getSelection().addRange(range);
        document.execCommand('copy');
        window.getSelection().removeAllRanges();
        btnCopyCreatedId.textContent = '✅ Copiado!';
        setTimeout(() => { btnCopyCreatedId.textContent = '📋 Copiar'; }, 2000);
    });
});

btnEnterCreatedRoom.addEventListener('click', () => {
    console.log('[ENTRY] Host entrando:', createdRoomCode);
    showFeedback(createdFeedback, '🔄 Entrando na sala...', 'info');
    setTimeout(() => { window.location.href = gameUrl(createdRoomCode, createdPlayerNameValue); }, 500);
});

btnBackFromCreated.addEventListener('click', () => {
    createdRoomCode = '';
    createdPlayerNameValue = '';
    showScreen(screenCreate);
    hideFeedback(createdFeedback);
});

// --- Botões: Entrar em Sala ---
btnBackFromJoin.addEventListener('click', () => {
    showScreen(screenChoose);
    hideFeedback(joinFeedback);
});

btnJoinRoom.addEventListener('click', async () => {
    const playerName = joinPlayerName.value.trim();
    const roomCode = joinRoomSuffix.value.trim();
    hideFeedback(joinFeedback);

    if (!playerName || playerName.length < 3 || playerName.length > 20) {
        showFeedback(joinFeedback, '⚠️ Nome deve ter entre 3 e 20 caracteres', 'warning');
        joinPlayerName.focus();
        return;
    }
    if (!roomCode) {
        showFeedback(joinFeedback, '⚠️ Informe o código da sala', 'warning');
        joinRoomSuffix.focus();
        return;
    }

    console.log('[ENTRY] Tentando entrar:', roomCode);
    showFeedback(joinFeedback, '🔄 Procurando sala...', 'info');
    btnJoinRoom.disabled = true;
    let result;
    try {
        const login = await entryLogin;
        result = await Game.network.checkRoom({ db: login.db, code: roomCode });
    } catch (err) {
        console.error('[ENTRY] Erro:', err);
        showFeedback(joinFeedback, '⚠️ Erro de conexão. Verifique sua internet.', 'error');
        btnJoinRoom.disabled = false;
        return;
    }
    btnJoinRoom.disabled = false;

    if (!result.ok) {
        const message = result.reason === 'version-mismatch'
            ? '⚠️ Esta página está desatualizada em relação à sala. Recarregue a página (Ctrl+F5; no celular, feche a aba e abra de novo) e tente de novo.'
            : '⚠️ Sala não encontrada. Verifique o código com o host.';
        showFeedback(joinFeedback, message, 'error');
        return;
    }
    showFeedback(joinFeedback, '✅ Sala encontrada! Entrando...', 'success');
    setTimeout(() => { window.location.href = gameUrl(roomCode, playerName); }, 800);
});

// --- Inicialização ---
showScreen(screenChoose);
console.log('[ENTRY] Pronto!');
