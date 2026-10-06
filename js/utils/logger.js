// ============================================
// PM: The KPI Master - Logger
// ============================================
// Logs com níveis (debug/info/warn/error), permitindo silenciar
// ruído em produção sem apagar os console.log espalhados pelo código.
//
// ⚠️ FASE 7 — APENAS INFRAESTRUTURA:
// este arquivo existe e funciona isoladamente (Game.logger.info(...)
// já funciona se chamado), mas NENHUM arquivo do projeto foi religado
// para usar Game.logger.* no lugar de console.log/warn/error direto.
// Religar o código ao logger ainda não foi feito.
// ============================================

const LEVELS = { debug: 0, info: 1, warn: 2, error: 3, silent: 4 };
let currentLevel = LEVELS.info;

/**
 * Define o nível mínimo de log exibido. Mensagens abaixo desse nível
 * são silenciadas. Ex: setLevel('warn') esconde debug e info.
 */
function setLevel(levelName) {
    if (!(levelName in LEVELS)) {
        console.warn(`⚠️ Logger: nível "${levelName}" inválido. Use um de: ${Object.keys(LEVELS).join(', ')}`);
        return;
    }
    currentLevel = LEVELS[levelName];
}

function getLevel() {
    return Object.keys(LEVELS).find(name => LEVELS[name] === currentLevel);
}

function debug(...args) {
    if (currentLevel <= LEVELS.debug) console.log('[DEBUG]', ...args);
}

function info(...args) {
    if (currentLevel <= LEVELS.info) console.log(...args);
}

function warn(...args) {
    if (currentLevel <= LEVELS.warn) console.warn(...args);
}

function error(...args) {
    if (currentLevel <= LEVELS.error) console.error(...args);
}

// ============================================
// EXPORTAÇÃO
// ============================================
window.Game = window.Game || {};
window.Game.logger = {
    debug,
    info,
    warn,
    error,
    setLevel,
    getLevel,
    LEVELS
};