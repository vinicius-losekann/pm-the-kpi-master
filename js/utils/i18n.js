// ============================================
// PM: The KPI Master - i18n Resolver
// ============================================
// Resolve chaves de tradução a partir dos dicionários em js/locales/*.js.
//
// A tela (js/ui/*.js) usa Game.i18n.t('chave') para os textos; só
// existe o dicionário pt-BR por enquanto. Faltam en-US e es-ES e o
// seletor de idioma.
// ============================================

const SUPPORTED_LOCALES = ['pt-BR']; // en-US e es-ES entram com os dicionários deles
const DEFAULT_LOCALE = 'pt-BR';

let currentLocale = DEFAULT_LOCALE;

/**
 * Define o idioma atual. Ignora e avisa no console se o idioma não
 * tiver um dicionário carregado.
 */
function setLocale(locale) {
    if (!window.Game?.locales?.[locale]) {
        console.warn(`⚠️ i18n: locale "${locale}" não tem dicionário carregado. Mantendo "${currentLocale}".`);
        return;
    }
    currentLocale = locale;
}

function getLocale() {
    return currentLocale;
}

/**
 * Resolve uma chave de tradução (ex: "lobby.aguardandoHost") para a
 * string no idioma atual. Suporta interpolação simples via {{variavel}}.
 * Se a chave não existir, retorna a própria chave (fallback visível,
 * fácil de notar durante o desenvolvimento) e avisa no console.
 *
 * @param {string} key - chave no formato "namespace.subchave"
 * @param {object} vars - variáveis para interpolar no texto (opcional)
 */
function t(key, vars = {}) {
    const dict = window.Game?.locales?.[currentLocale];
    if (!dict) {
        console.warn(`⚠️ i18n: dicionário "${currentLocale}" não carregado.`);
        return key;
    }

    const value = key.split('.').reduce((obj, part) => (obj ? obj[part] : undefined), dict);

    if (value === undefined) {
        console.warn(`⚠️ i18n: chave "${key}" não encontrada em "${currentLocale}".`);
        return key;
    }

    if (typeof value !== 'string') return value;

    return value.replace(/\{\{(\w+)\}\}/g, (match, varName) =>
        vars[varName] !== undefined ? vars[varName] : match
    );
}

// ============================================
// EXPORTAÇÃO
// ============================================
window.Game = window.Game || {};
window.Game.i18n = {
    t,
    setLocale,
    getLocale,
    SUPPORTED_LOCALES,
    DEFAULT_LOCALE
};