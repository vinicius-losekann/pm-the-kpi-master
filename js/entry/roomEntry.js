// ============================================
// PM: The KPI Master - Room Entry (Tela Inicial)
// ============================================
// Gerencia a criação e entrada em salas via PeerJS.
// Fase 0.4: movido de js/index.js para js/entry/roomEntry.js,
// sem mudança de lógica — apenas de localização.
//
// Fase D3c: depois de uma migração de host, a sala deixa o ID base e
// passa a existir em `<ID base>-h1`, `-h2`... Entrar e criar sala agora
// procuram também essas versões (Game.network.procurarHost(), em
// network/hostSearch.js, carregado antes deste arquivo no index.html).
// ============================================

console.log('[ENTRY] Inicializando...');
console.log('[ENTRY] PeerJS disponível:', typeof Peer !== 'undefined');
console.log('[ENTRY] CONFIG:', CONFIG);

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
    console.log('[ENTRY] Criando sala:', createdRoomFullId);
    showFeedback(createFeedback, '🔄 Verificando disponibilidade...', 'info');

    const testPeer = new Peer(createdRoomFullId, { ...CONFIG.PEER });
    let concluido = false;
    let busca = null;

    const concluir = (mensagemErro) => {
        if (concluido) return;
        concluido = true;
        if (busca) busca.cancelar();
        if (!testPeer.destroyed) testPeer.destroy();
        if (mensagemErro) {
            showFeedback(createFeedback, mensagemErro, 'error');
            return;
        }
        createdRoomIdDisplay.textContent = createdRoomFullId;
        showScreen(screenCreated);
        hideFeedback(createFeedback);
    };

    testPeer.on('open', (id) => {
        console.log('[ENTRY] Peer ID confirmado:', id);
        // Fase D3c: o ID base estar livre não basta — uma partida com
        // este código pode continuar numa versão migrada do host
        // (`-h1`, `-h2`...). Nesse caso o código também está em uso.
        busca = Game.network.procurarHost(testPeer, createdRoomFullId, {
            versaoInicial: 1,
            aoAchar: (conn, versao, idAchado) => {
                console.log('[ENTRY] Partida com este código em andamento em', idAchado);
                concluir('⚠️ Este código já está em uso. Escolha outro.');
            },
            aoDesistir: () => concluir(null)
        });
    });

    testPeer.on('error', (err) => {
        // 'peer-unavailable' vem da procura acima: aquela versão não existe.
        if (err.type === 'peer-unavailable') {
            Game.network.avisarPeerIndisponivel(err);
            return;
        }
        console.error('[ENTRY] Erro:', err);
        if (err.type === 'unavailable-id') {
            concluir('⚠️ Este código já está em uso. Escolha outro.');
        } else {
            concluir('⚠️ Erro de conexão. Verifique sua internet.');
        }
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
    console.log('[ENTRY] Host entrando:', createdRoomFullId);
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
    console.log('[ENTRY] Tentando entrar:', roomId);
    showFeedback(joinFeedback, '🔄 Procurando sala...', 'info');

    const testPeer = new Peer({ ...CONFIG.PEER });
    let concluido = false;
    let busca = null;

    const encerrarTeste = () => {
        concluido = true;
        if (busca) busca.cancelar();
        if (!testPeer.destroyed) testPeer.destroy();
    };

    testPeer.on('open', (myTestId) => {
        console.log('[ENTRY] Peer teste:', myTestId);
        // Fase D3c: procura a sala no ID base e nas versões migradas do
        // host. O link do jogo continua com o ID base (peerId) — o jogo
        // faz a mesma procura ao conectar (peerService.connectToHost()).
        busca = Game.network.procurarHost(testPeer, roomId, {
            aoAchar: (conn, versao, idAchado) => {
                if (concluido) return;
                console.log('[ENTRY] Sala encontrada em', idAchado);
                try { conn.close(); } catch (e) { /* ignora */ }
                encerrarTeste();

                const params = new URLSearchParams({
                    host: 'false',
                    room: roomId,
                    playerName: playerName,
                    peerId: roomId
                });
                showFeedback(joinFeedback, '✅ Sala encontrada! Entrando...', 'success');
                setTimeout(() => { window.location.href = `game.html?${params.toString()}`; }, 800);
            },
            aoDesistir: () => {
                if (concluido) return;
                console.log('[ENTRY] Sala não encontrada:', roomId);
                encerrarTeste();
                showFeedback(joinFeedback, '⚠️ Sala não encontrada. Verifique o código e se o host está online.', 'error');
            }
        });
    });

    testPeer.on('error', (err) => {
        // 'peer-unavailable' vem da procura acima: aquela versão da sala
        // não existe — a procura segue com as outras.
        if (err.type === 'peer-unavailable') {
            Game.network.avisarPeerIndisponivel(err);
            return;
        }
        if (concluido) return;
        console.error('[ENTRY] Erro peer:', err);
        encerrarTeste();
        showFeedback(joinFeedback, '⚠️ Erro de conexão. Verifique sua internet.', 'error');
    });
});

// --- Inicialização ---
showScreen(screenChoose);
console.log('[ENTRY] Pronto!');