// ============================================
// PM: The KPI Master - Persistência (estado da partida no banco da sala)
// ============================================
// O host grava o estado completo da partida no banco da sala
// (secret/state, ver saveRoomState() em network/roomLink.js) e, ao abrir
// a sala de novo (F5, ou depois de todos saírem), restaura a partida dali
// (openRoom(), em roomLink.js). Vale enquanto a sala existir.
// Roadmap 3.1: o estado salvo tem versão e passa pela migração antes de
// ser restaurado (ver STATE_VERSION e STATE_MIGRATIONS abaixo).
// ============================================

// Roadmap 3.1: versão do formato do estado salvo (campo stateVersion). Ao mudar
// o formato (ex.: renomear um campo), aumentar a versão e acrescentar
// em STATE_MIGRATIONS o passo que converte da versão anterior. Estado
// salvo sem versão (antes do 3.1) é a versão 1. Até a versão 9 o estado
// ficava no navegador do host, em duas partes: a da sala (roomState) e a
// do próprio host (pmKPI_myData). Os passos continuam recebendo e
// devolvendo as duas; a restauração pelo banco passa myData null.
const STATE_VERSION = 9;

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

/**
 * Versão 6 → 7: o pedido de ajuda passou a usar o mesmo campo da
 * assessoria (currentRound.advisory), com o tipo em `kind`. A assessoria
 * salva antes disso ganha kind 'advisory'. Rodada sem assessoria (ou com
 * ela cancelada, null), jogadores, baralhos e pmKPI_myData não mudam.
 */
function addSupportKind(roomState, myData) {
    const room = { ...roomState };
    const advisory = room.currentRound && room.currentRound.advisory;
    if (advisory && typeof advisory === 'object' && !('kind' in advisory)) {
        room.currentRound = { ...room.currentRound, advisory: { ...advisory, kind: 'advisory' } };
    }
    return { roomState: room, myData };
}

/**
 * Versão 7 → 8: saem os campos da conexão pelo PeerJS — os IDs do host,
 * do backup e da sala, o número da troca de host e o hash do token de
 * cada jogador (a identidade passou a ser o uid do aparelho, no
 * `peerId`). O resto, inclusive o ranking final e pmKPI_myData, não muda.
 */
function removePeerConnectionFields(roomState, myData) {
    const { hostPeerId, backupPeerId, baseRoomPeerId, hostVersion, ...room } = roomState;
    if (Array.isArray(room.players)) {
        room.players = room.players.map(p => {
            if (!p || typeof p !== 'object') return p;
            const { tokenHash, ...player } = p;
            return player;
        });
    }
    return { roomState: room, myData };
}

/**
 * Versão 8 → 9: o relógio da partida passou a contar pela hora de término
 * (`endsAt`, em ms). O tempo que faltava (`timer`, em segundos) vira
 * endsAt = hora da gravação (`timestamp`) + timer. Sem timer (ou com a
 * hora da gravação ilegível), fica sem endsAt. Os prazos da rodada
 * (askEndsAt, answerEndsAt) não existiam: no F5, ausentes valem inteiros.
 * O resto, inclusive pmKPI_myData, não muda.
 */
function timerToEndsAt(roomState, myData) {
    const { timer, ...room } = roomState;
    const savedAt = Date.parse(room.timestamp);
    if (typeof timer === 'number' && !Number.isNaN(savedAt)) room.endsAt = savedAt + timer * 1000;
    return { roomState: room, myData };
}

// Passo N: converte da versão N para N+1. Recebe (roomState, myData) e
// devolve { roomState, myData }.
const STATE_MIGRATIONS = {
    1: migrateRoundFieldsToEnglish,
    2: migratePlayerFieldsToEnglish,
    3: migrateAdvisoryFieldsToEnglish,
    4: migrateEventFieldsToEnglish,
    5: migrateFocusAreaIdsToEnglish,
    6: addSupportKind,
    7: removePeerConnectionFields,
    8: timerToEndsAt
};

/**
 * Leva o estado salvo da versão em que foi gravado até a versão atual,
 * aplicando os passos de STATE_MIGRATIONS em ordem. Erro se faltar um passo.
 * @param {object} roomState - o estado salvo (secret/state; antes, pmKPI_roomState)
 * @param {object} myData - conteúdo de pmKPI_myData (null na restauração pelo banco)
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
 * Host: grava o estado completo da partida no banco da sala (secret/state,
 * que só o host lê) pelo Game.network.saveRoomState(). A rodada vai com
 * as horas de término dos prazos (askEndsAt, answerEndsAt,
 * advisory.endsAt) e a partida com a dela (endsAt): o F5 continua do
 * mesmo ponto. No guest, não faz nada — o estado dele vem do host
 * (state-sync).
 */
function saveState() {
    const state = Game.state;
    if (!state.isHost) return;
    Game.network.saveRoomState({
        stateVersion: STATE_VERSION,
        roomName: state.roomName,
        players: state.players,
        currentRound: state.currentRound,
        decks: state.decks,
        endsAt: state.endsAt ?? null,
        gameStarted: state.gameStarted,
        answeredThisRound: state.answeredThisRound,
        // Número e evento da rodada: a retomada sem dupla continua a
        // mesma rodada, sem sortear outro evento (BUG-032).
        roundNumber: state.roundNumber || 0,
        roundEvent: state.roundEvent || null,
        // Sem estes dois, um F5 do host com a rodada encerrada
        // ou com a partida pausada perdia essa situação (ver
        // resumeMatchAfterReload() em engine/sessionEngine.js).
        roundEnded: !!state.roundEnded,
        matchPaused: state.matchPaused || null,
        // Sem estes dois, um F5 na tela final recomeçaria a partida.
        gameOver: !!state.gameOver,
        finalRanking: state.finalRanking || null,
        timestamp: new Date().toISOString()
    });
}

/**
 * Host, ao abrir a sala: restaura a partida a partir do estado lido do
 * secret/state (`saved`, já convertido do texto JSON; null se não há).
 * Vale enquanto a sala existir, sem prazo de validade. Versão mais nova
 * que STATE_VERSION (ex.: arquivos antigos em cache logo depois de um
 * deploy), versão inválida ou migração que falha: não restaura e não
 * copia nada — o banco fica como está, para a versão nova ainda poder usar.
 * @returns {boolean} true se restaurou
 */
function restoreSavedState(saved) {
    if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return false;

    // Versão conferida antes de tudo: num formato mais novo, até os
    // nomes dos campos podem ter mudado.
    const version = saved.stateVersion;
    if (version !== undefined && !(Number.isInteger(version) && version >= 1)) {
        console.warn('⚠️ Estado salvo com versão inválida (' + JSON.stringify(version) + '). Ignorando.');
        return false;
    }
    if (version > STATE_VERSION) {
        console.log('💾 Estado salvo por uma versão mais nova do jogo. Ignorando.');
        return false;
    }

    let room;
    try {
        // Chamado por Game.persistence para o teste poder trocar a migração.
        room = Game.persistence.migrateSavedState(saved, null).roomState;
    } catch (e) {
        console.warn('⚠️ Estado salvo ilegível (' + e.message + '). Ignorando.');
        return false;
    }

    console.log('💾 Estado da partida restaurado do banco da sala');

    const state = Game.state;
    state.players = room.players || [];
    state.endsAt = typeof room.endsAt === 'number' ? room.endsAt : null;
    state.gameStarted = !!room.gameStarted;
    state.currentRound = room.currentRound || null;
    // Sem baralhos salvos, ficam os montados pelo loadQuestions() (main.js).
    if (room.decks && Object.keys(room.decks).length > 0) state.decks = room.decks;
    state.answeredThisRound = room.answeredThisRound || [];
    // Estado salvo antes dos campos: rodada 0 e sem evento (a retomada
    // sem dupla começa uma rodada, como antes).
    state.roundNumber = Number.isInteger(room.roundNumber) ? room.roundNumber : 0;
    state.roundEvent = room.roundEvent || null;
    // Estado salvo por versões anteriores não tem os campos: sem rodada
    // encerrada e sem pausa.
    state.roundEnded = !!room.roundEnded;
    state.matchPaused = room.matchPaused || null;
    // Nem estes: partida não acabada.
    state.gameOver = !!room.gameOver;
    state.finalRanking = room.finalRanking || null;
    return true;
}

// ============================================
// EXPORTAÇÃO
// ============================================
window.Game = window.Game || {};
window.Game.persistence = {
    saveState,
    restoreSavedState,
    migrateSavedState,
    STATE_VERSION
};

// Compatibilidade: Game.saveState() é chamado diretamente em vários
// engines e em network/messageHandler.js — mantemos o atalho.
window.Game.saveState = saveState;