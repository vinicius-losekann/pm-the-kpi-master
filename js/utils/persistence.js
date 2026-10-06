// ============================================
// PM: The KPI Master - Persistência (localStorage)
// ============================================
// Salva e restaura o estado da partida no localStorage, permitindo
// retomar a sessão após um F5 (dentro de uma janela de 5 minutos).
// Roadmap 3.1: o estado salvo tem versão e passa pela migração antes de
// ser restaurado (ver STATE_VERSION e STATE_MIGRATIONS abaixo).
// ============================================

const ROOM_STATE_KEY = 'pmKPI_roomState';
const MY_DATA_KEY = 'pmKPI_myData';
const RESTORE_WINDOW_MS = 5 * 60 * 1000;

// Roadmap 3.1: versão do formato do estado salvo (campo stateVersion —
// não confundir com hostVersion, que conta as trocas de host). Ao mudar
// o formato (ex.: renomear um campo), aumentar a versão e acrescentar
// em STATE_MIGRATIONS o passo que converte da versão anterior. Estado
// salvo sem versão (antes do 3.1) é a versão 1. O número vale para as
// duas chaves (são sempre gravadas juntas).
const STATE_VERSION = 6;

/**
 * Cópia de `obj` com os campos renomeados conforme `names`
 * ({ nomeAntigo: nomeNovo }). Campo ausente continua ausente.
 */
function renameFields(obj, names) {
    if (!obj || typeof obj !== 'object') return obj;
    const result = { ...obj };
    for (const [oldName, newName] of Object.entries(names)) {
        if (oldName in result) {
            result[newName] = result[oldName];
            delete result[oldName];
        }
    }
    return result;
}

/**
 * Versão 1 → 2: campos da rodada e da partida passam para inglês
 * (quem já respondeu, rodada encerrada, pausa, ranking final, baralhos e
 * a rodada em andamento). Jogadores, assessoria e pmKPI_myData não mudam.
 */
function migrateRoundFieldsToEnglish(roomState, myData) {
    const room = renameFields(roomState, {
        usedRespondedorThisRound: 'answeredThisRound',
        rodadaEncerrada: 'roundEnded',
        partidaPausada: 'matchPaused',
        rankingFinal: 'finalRanking',
        baralhos: 'decks'
    });
    if (room.matchPaused) room.matchPaused = renameFields(room.matchPaused, { evento: 'event' });
    if (room.decks && typeof room.decks === 'object') {
        const decks = {};
        for (const [key, deck] of Object.entries(room.decks)) {
            const d = renameFields(deck, { perguntas: 'questions', disponiveis: 'available' });
            if (d && Array.isArray(d.questions)) d.questions = d.questions.map(q => renameFields(q, { usada: 'used' }));
            decks[key] = d;
        }
        room.decks = decks;
    }
    if (room.currentRound) {
        const round = renameFields(room.currentRound, {
            evento: 'event',
            perguntador: 'asker',
            respondedor: 'answerer',
            pergunta: 'question',
            respondeu: 'answered'
        });
        if (round.question) {
            round.question = renameFields(round.question, { usada: 'used', isPerguntador: 'isAsker', isRespondedor: 'isAnswerer' });
        }
        if (round.pendingAnswer) round.pendingAnswer = renameFields(round.pendingAnswer, { alternativa: 'alternative' });
        room.currentRound = round;
    }
    return { roomState: room, myData };
}

/**
 * Versão 2 → 3: campos do jogador e do ranking final passam para inglês
 * (recursos e área foco dos jogadores, também em pmKPI_myData; posição e
 * KPI final do ranking). Rodada, baralhos e assessoria não mudam.
 */
function migratePlayerFieldsToEnglish(roomState, myData) {
    const playerNames = { recursos: 'resources', phase: 'focusArea' };
    const room = { ...roomState };
    if (Array.isArray(room.players)) {
        room.players = room.players.map(p => renameFields(p, playerNames));
    }
    if (Array.isArray(room.finalRanking)) {
        room.finalRanking = room.finalRanking.map(p => renameFields(p, { ...playerNames, posicao: 'position', kpiFinal: 'finalKpi' }));
    }
    return { roomState: room, myData: renameFields(myData, { phase: 'focusArea' }) };
}

/**
 * Versão 3 → 4: a assessoria da rodada passa para inglês (assessor e
 * sugestão). O pedido de ajuda não é salvo; jogadores, baralhos e
 * pmKPI_myData não mudam.
 */
function migrateAdvisoryFieldsToEnglish(roomState, myData) {
    const room = { ...roomState };
    if (room.currentRound) {
        const round = renameFields(room.currentRound, { assessoria: 'advisory' });
        if (round.advisory) round.advisory = renameFields(round.advisory, { assessorName: 'advisorName', sugestao: 'suggestion' });
        room.currentRound = round;
    }
    return { roomState: room, myData };
}

/**
 * Versão 4 → 5: os campos do evento (título, descrição e efeito, como em
 * data/events.json) passam para inglês, no evento da rodada e no da
 * pausa. Jogadores, baralhos e pmKPI_myData não mudam.
 */
function migrateEventFieldsToEnglish(roomState, myData) {
    const eventNames = {
        titulo: 'title',
        descricao: 'description',
        recursos_todos: 'resourcesForAll',
        recursos_menos: 'resourcesForFewest',
        troca_recursos: 'resourceSwap',
        reserva_contingencia: 'contingencyReserve',
        neutro: 'neutral'
    };
    const room = { ...roomState };
    if (room.currentRound && room.currentRound.event) {
        room.currentRound = { ...room.currentRound, event: renameFields(room.currentRound.event, eventNames) };
    }
    if (room.matchPaused && room.matchPaused.event) {
        room.matchPaused = { ...room.matchPaused, event: renameFields(room.matchPaused.event, eventNames) };
    }
    return { roomState: room, myData };
}

/**
 * Versão 5 → 6: os IDs das áreas foco (valores de `focusArea`, os mesmos
 * de CONFIG.FOCUS_AREAS) passam para inglês, nos jogadores, no ranking
 * final e em pmKPI_myData. Valor que não está na tabela fica como está.
 * Rodada, baralhos e os nomes dos campos não mudam.
 */
function migrateFocusAreaIdsToEnglish(roomState, myData) {
    const focusAreaIds = {
        iniciacao: 'initiating',
        planejamento: 'planning',
        execucao: 'executing',
        monitoramento_controle: 'monitoringControlling',
        encerramento: 'closing'
    };
    const withNewId = (obj) => {
        if (!obj || typeof obj !== 'object' || !Object.prototype.hasOwnProperty.call(focusAreaIds, obj.focusArea)) return obj;
        return { ...obj, focusArea: focusAreaIds[obj.focusArea] };
    };
    const room = { ...roomState };
    if (Array.isArray(room.players)) room.players = room.players.map(withNewId);
    if (Array.isArray(room.finalRanking)) room.finalRanking = room.finalRanking.map(withNewId);
    return { roomState: room, myData: withNewId(myData) };
}

// Passo N: converte da versão N para N+1. Recebe (roomState, myData) e
// devolve { roomState, myData }.
const STATE_MIGRATIONS = {
    1: migrateRoundFieldsToEnglish,
    2: migratePlayerFieldsToEnglish,
    3: migrateAdvisoryFieldsToEnglish,
    4: migrateEventFieldsToEnglish,
    5: migrateFocusAreaIdsToEnglish
};

/**
 * Leva o estado salvo da versão em que foi gravado até a versão atual,
 * aplicando os passos de STATE_MIGRATIONS em ordem. Erro se faltar um passo.
 * @param {object} roomState - conteúdo de pmKPI_roomState
 * @param {object} myData - conteúdo de pmKPI_myData
 * @returns {{roomState: object, myData: object}}
 */
function migrateSavedState(roomState, myData, targetVersion = STATE_VERSION, migrations = STATE_MIGRATIONS) {
    let version = roomState.stateVersion === undefined ? 1 : roomState.stateVersion;
    let current = { roomState, myData };
    while (version < targetVersion) {
        const step = migrations[version];
        if (!step) throw new Error('Falta a migração do estado salvo da versão ' + version);
        current = step(current.roomState, current.myData);
        version++;
        current.roomState = { ...current.roomState, stateVersion: version };
    }
    return current;
}

/**
 * Salva o estado completo no localStorage.
 */
function saveState() {
    const state = Game.state;
    localStorage.setItem(ROOM_STATE_KEY, JSON.stringify({
        stateVersion: STATE_VERSION,
        hostPeerId: state.hostPeerId,
        backupPeerId: state.backupPeerId,
        baseRoomPeerId: state.baseRoomPeerId,
        hostVersion: state.hostVersion,
        roomName: state.roomName,
        players: state.players,
        currentRound: state.currentRound,
        decks: state.decks,
        timer: state.timer,
        gameStarted: state.gameStarted,
        answeredThisRound: state.answeredThisRound,
        // Sem estes dois, um F5 do host com a rodada encerrada
        // ou com a partida pausada perdia essa situação (ver
        // resumeMatchAfterReload() em engine/sessionEngine.js).
        roundEnded: !!state.roundEnded,
        matchPaused: state.matchPaused || null,
        // Sem estes dois, um F5 na tela final recomeçaria a partida.
        gameOver: !!state.gameOver,
        finalRanking: state.finalRanking || null,
        timestamp: new Date().toISOString()
    }));

    const me = Game.getPlayerByName(state.playerName);
    localStorage.setItem(MY_DATA_KEY, JSON.stringify({
        playerName: state.playerName,
        kpi: me?.kpi || 0,
        focusArea: me?.focusArea || CONFIG.FOCUS_AREAS[0].id,
        activities: me?.activities || 0
    }));
}

/**
 * Tenta restaurar o estado salvo no localStorage.
 * Só restaura se pertencer à mesma sala/jogador e tiver menos de 5 minutos.
 * Versão mais nova que STATE_VERSION: ignora sem apagar; versão inválida:
 * apaga, como estado corrompido.
 * @returns {boolean} true se restaurou com sucesso
 */
function tryRestoreState() {
    const savedState = localStorage.getItem(ROOM_STATE_KEY);
    const savedMyData = localStorage.getItem(MY_DATA_KEY);

    if (!savedState || !savedMyData) return false;

    try {
        const parsed = JSON.parse(savedState);
        const version = parsed.stateVersion;

        // Versão conferida antes de tudo: num formato mais novo, até o
        // nome da sala pode ter mudado de campo.
        if (version !== undefined && !(Number.isInteger(version) && version >= 1)) {
            throw new Error('versão inválida: ' + JSON.stringify(version));
        }
        if (version > STATE_VERSION) {
            // Gravado por um código mais novo (ex.: arquivos antigos em
            // cache logo depois de um deploy): não restaura e não apaga,
            // para a versão nova ainda poder usar.
            console.log('💾 Estado salvo por uma versão mais nova do jogo. Ignorando.');
            return false;
        }

        // Chamado por Game.persistence para o teste poder trocar a migração.
        const migrated = Game.persistence.migrateSavedState(parsed, JSON.parse(savedMyData));
        const saved = migrated.roomState;
        const myData = migrated.myData;

        const currentParams = new URLSearchParams(window.location.search);
        const currentRoom = currentParams.get('room') || 'Sala';
        const currentPlayer = currentParams.get('playerName') || 'Jogador';
        const currentBasePeerId = currentParams.get('peerId') || '';

        const savedBasePeerId = saved.baseRoomPeerId || saved.hostPeerId || '';

        if (saved.roomName !== currentRoom ||
            savedBasePeerId !== currentBasePeerId ||
            myData.playerName !== currentPlayer) {
            console.log('💾 Estado salvo pertence a outra sala/jogador. Ignorando.');
            return false;
        }

        const timestamp = new Date(saved.timestamp);
        const now = new Date();
        if (Number.isNaN(timestamp.getTime()) || now - timestamp > RESTORE_WINDOW_MS) {
            console.log('💾 Estado salvo expirou.');
            return false;
        }

        console.log('💾 Estado restaurado do localStorage');

        Game.state.hostPeerId = saved.hostPeerId;
        Game.state.backupPeerId = saved.backupPeerId;
        Game.state.baseRoomPeerId = saved.baseRoomPeerId || saved.hostPeerId;
        Game.state.hostVersion = saved.hostVersion || 0;
        Game.state.roomName = saved.roomName;
        Game.state.players = saved.players || [];
        Game.state.timer = saved.timer ?? CONFIG.GAME.SESSION_DURATION;
        Game.state.gameStarted = !!saved.gameStarted;
        Game.state.currentRound = saved.currentRound || null;
        Game.state.decks = saved.decks || {};
        Game.state.answeredThisRound = saved.answeredThisRound || [];
        // Estado salvo por versões anteriores não tem os campos: sem rodada
        // encerrada e sem pausa.
        Game.state.roundEnded = !!saved.roundEnded;
        Game.state.matchPaused = saved.matchPaused || null;
        // Nem estes: partida não
        // acabada.
        Game.state.gameOver = !!saved.gameOver;
        Game.state.finalRanking = saved.finalRanking || null;

        const me = Game.getPlayerByName(myData.playerName);
        if (me) {
            me.kpi = myData.kpi ?? me.kpi;
            me.focusArea = myData.focusArea ?? me.focusArea;
            me.activities = myData.activities ?? me.activities;
        }

        return true;
    } catch (e) {
        console.warn('⚠️ Estado salvo corrompido. Limpando.');
        clearSavedState();
        return false;
    }
}

/**
 * Limpa o estado salvo no localStorage (ex: ao sair da sessão).
 */
function clearSavedState() {
    localStorage.removeItem(ROOM_STATE_KEY);
    localStorage.removeItem(MY_DATA_KEY);
}

// ============================================
// EXPORTAÇÃO
// ============================================
window.Game = window.Game || {};
window.Game.persistence = {
    saveState,
    tryRestoreState,
    clearSavedState,
    migrateSavedState,
    STATE_VERSION
};

// Compatibilidade: Game.saveState() é chamado diretamente em vários
// engines e em network/messageHandler.js — mantemos o atalho.
window.Game.saveState = saveState;