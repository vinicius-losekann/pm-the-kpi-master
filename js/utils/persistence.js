// ============================================
// PM: The KPI Master - Persistência (localStorage)
// ============================================
// Salva e restaura o estado da partida no localStorage, permitindo
// retomar a sessão após um F5 (dentro de uma janela de 5 minutos).
// Fase 7.2 do roadmap — extraído de js/main.js (antes js/game-main.js).
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
const STATE_VERSION = 1;

// Passo N: converte da versão N para N+1. Recebe (roomState, myData) e
// devolve { roomState, myData }.
const STATE_MIGRATIONS = {};

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
        baralhos: state.baralhos,
        timer: state.timer,
        gameStarted: state.gameStarted,
        usedRespondedorThisRound: state.usedRespondedorThisRound,
        // Fase D3f: sem estes dois, um F5 do host com a rodada encerrada
        // ou com a partida pausada perdia essa situação (ver
        // retomarPartidaAposRecarregar() em engine/sessionEngine.js).
        rodadaEncerrada: !!state.rodadaEncerrada,
        partidaPausada: state.partidaPausada || null,
        timestamp: new Date().toISOString()
    }));

    const me = Game.getPlayerByName(state.playerName);
    localStorage.setItem(MY_DATA_KEY, JSON.stringify({
        playerName: state.playerName,
        kpi: me?.kpi || 0,
        phase: me?.phase || CONFIG.FASES[0].id,
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
        Game.state.timer = saved.timer ?? CONFIG.JOGO.SESSION_DURATION;
        Game.state.gameStarted = !!saved.gameStarted;
        Game.state.currentRound = saved.currentRound || null;
        Game.state.baralhos = saved.baralhos || {};
        Game.state.usedRespondedorThisRound = saved.usedRespondedorThisRound || [];
        // Estado salvo antes da Fase D3f não tem os campos: sem rodada
        // encerrada e sem pausa, como antes.
        Game.state.rodadaEncerrada = !!saved.rodadaEncerrada;
        Game.state.partidaPausada = saved.partidaPausada || null;

        const me = Game.getPlayerByName(myData.playerName);
        if (me) {
            me.kpi = myData.kpi ?? me.kpi;
            me.phase = myData.phase ?? me.phase;
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