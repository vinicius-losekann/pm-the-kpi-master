// ============================================
// PM: The KPI Master - Sanitização de HTML
// ============================================
// Utilitário central para escapar strings vindas do usuário (nomes de
// jogador) antes de inseri-las via innerHTML.
//
// Segurança: nomes de jogador vêm direto do input de texto em
// entry/roomEntry.js, validados só por TAMANHO (3-20 caracteres) — sem
// restrição de caracteres. Inserido sem escapar num innerHTML, um nome
// com HTML/JS (ex: '<svg/onload=alert(1)>', que cabe nos 20 caracteres)
// executaria código na tela dos outros jogadores (XSS armazenado).
// Com textContent não precisa escapar.
// ============================================

/**
 * Escapa os 5 caracteres HTML perigosos. Use sempre que uma string
 * controlada pelo usuário (nome de jogador, etc.) for inserida via
 * innerHTML/template string, em vez de textContent.
 */
function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// ============================================
// EXPORTAÇÃO
// ============================================
window.Game = window.Game || {};
window.Game.sanitize = {
    escapeHtml
};