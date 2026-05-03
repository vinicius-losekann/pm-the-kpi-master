// ============================================
// PM: The KPI Master - Index Script
// ============================================

console.log('[INDEX] Inicializando...');
console.log('[INDEX] PeerJS disponível:', typeof Peer !== 'undefined');
console.log('[INDEX] CONFIG:', CONFIG);

const PREFIX = CONFIG.ROOM_PREFIX;

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

// --- Estado ---
let createdRoomFullId = '';
let createdPlayerNameValue = '';

// --- Navegação ---
function showScreen(screen) {
    [screenChoose, screenCreate, screenCreated, screenJoin].forEach(s => s.style.display = 'none');
    screen.style.display = 'block';
    screen.style.animation = 'none';
    screen.offsetHeight;
    screen.style.animation = 'slideUp 0.4s ease';
}

function showFeedback(el, message, type) {
    console.log('[INDEX]', type + ':', message);
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
    console.log('[INDEX] Modo: CRIAR SALA');
    showScreen(screenCreate);
    createPlayerName.focus();
});

document.getElementById('btnChooseJoin').addEventListener('click', () => {
    console.log('[INDEX] Modo: ENTRAR');
    showScreen(screenJoin);
    joinPlayerName.focus();
});

// --- Botões: Criar Sala ---
btnBackFromCreate.addEventListener('click', () => {
    showScreen(screenChoose);
    hideFeedback(createFeedback);
});

btnCreateRoom.addEventListener('click', () => {
    const playerName = createPlayerName.value.trim();
    const roomSuffix = createRoomId.value.trim();
    hideFeedback(createFeedback);

    if (!playerName || playerName.length < 3 || playerName.length > 20) {
        showFeedback(createFeedback, '⚠️ Nome deve ter entre 3 e 20 caracteres', 'warning');
        createPlayerName.focus();
        return;
    }
    if (!roomSuffix || roomSuffix.length < 1 || roomSuffix.length > 20) {
        showFeedback(createFeedback, '⚠️ Escolha um código para a sala (1-20 caracteres)', 'warning');
        createRoomId.focus();
        return;
    }
    if (!/^[a-zA-Z0-9_-]+$/.test(roomSuffix)) {
        showFeedback(createFeedback, '⚠️ Use apenas letras, números, hífens e underscores', 'warning');
        createRoomId.focus();
        return;
    }

    createdRoomFullId = PREFIX + roomSuffix;
    createdPlayerNameValue = playerName;
    console.log('[INDEX] Criando sala:', createdRoomFullId);
    showFeedback(createFeedback, '🔄 Verificando disponibilidade...', 'info');

    const testPeer = new Peer(createdRoomFullId, { debug: 0 });

    testPeer.on('open', (id) => {
        console.log('[INDEX] Peer ID confirmado:', id);
        testPeer.destroy();
        createdRoomIdDisplay.textContent = createdRoomFullId;
        showScreen(screenCreated);
        hideFeedback(createFeedback);
    });

    testPeer.on('error', (err) => {
        console.error('[INDEX] Erro:', err);
        if (err.type === 'unavailable-id') {
            showFeedback(createFeedback, '⚠️ Este código já está em uso. Escolha outro.', 'error');
        } else {
            showFeedback(createFeedback, '⚠️ Erro de conexão. Verifique sua internet.', 'error');
        }
        if (testPeer) testPeer.destroy();
    });
});

// --- Botões: Sala Criada ---
btnCopyCreatedId.addEventListener('click', () => {
    navigator.clipboard.writeText(createdRoomFullId).then(() => {
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
    console.log('[INDEX] Host entrando:', createdRoomFullId);
    const params = new URLSearchParams({
        host: 'true',
        room: createdRoomFullId,
        playerName: createdPlayerNameValue,
        peerId: createdRoomFullId
    });
    showFeedback(createdFeedback, '🔄 Entrando na sala...', 'info');
    setTimeout(() => { window.location.href = `game.html?${params.toString()}`; }, 500);
});

btnBackFromCreated.addEventListener('click', () => {
    createdRoomFullId = '';
    createdPlayerNameValue = '';
    showScreen(screenCreate);
    hideFeedback(createdFeedback);
});

// --- Botões: Entrar em Sala ---
btnBackFromJoin.addEventListener('click', () => {
    showScreen(screenChoose);
    hideFeedback(joinFeedback);
});

btnJoinRoom.addEventListener('click', () => {
    const playerName = joinPlayerName.value.trim();
    const roomSuffix = joinRoomSuffix.value.trim();
    hideFeedback(joinFeedback);

    if (!playerName || playerName.length < 3 || playerName.length > 20) {
        showFeedback(joinFeedback, '⚠️ Nome deve ter entre 3 e 20 caracteres', 'warning');
        joinPlayerName.focus();
        return;
    }
    if (!roomSuffix) {
        showFeedback(joinFeedback, '⚠️ Informe o código da sala', 'warning');
        joinRoomSuffix.focus();
        return;
    }

    const roomId = PREFIX + roomSuffix;
    console.log('[INDEX] Tentando entrar:', roomId);
    showFeedback(joinFeedback, '🔄 Procurando sala...', 'info');

    const testPeer = new Peer({ debug: 0 });

    testPeer.on('open', (myTestId) => {
        console.log('[INDEX] Peer teste:', myTestId);
        const conn = testPeer.connect(roomId, { reliable: true });
        let resolved = false;

        conn.on('open', () => {
            if (resolved) return;
            resolved = true;
            console.log('[INDEX] Sala encontrada!');
            conn.close();
            testPeer.destroy();

            const params = new URLSearchParams({
                host: 'false',
                room: roomId,
                playerName: playerName,
                peerId: roomId
            });
            showFeedback(joinFeedback, '✅ Sala encontrada! Entrando...', 'success');
            setTimeout(() => { window.location.href = `game.html?${params.toString()}`; }, 800);
        });

        conn.on('error', (err) => {
            if (resolved) return;
            resolved = true;
            console.error('[INDEX] Erro:', err);
            testPeer.destroy();
            showFeedback(joinFeedback, '⚠️ Sala não encontrada. Verifique o código.', 'error');
        });

        setTimeout(() => {
            if (!resolved) {
                resolved = true;
                console.log('[INDEX] Timeout');
                testPeer.destroy();
                showFeedback(joinFeedback, '⚠️ Sala não respondeu. O host está online?', 'error');
            }
        }, 5000);
    });

    testPeer.on('error', (err) => {
        console.error('[INDEX] Erro peer:', err);
        if (testPeer) testPeer.destroy();
        showFeedback(joinFeedback, '⚠️ Erro de conexão. Verifique sua internet.', 'error');
    });
});

// --- Inicialização ---
showScreen(screenChoose);
console.log('[INDEX] Pronto!');