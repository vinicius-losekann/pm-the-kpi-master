// ============================================
// PM: The KPI Master - Sanitização de HTML
// ============================================
// Utilitário central para escapar strings vindas do usuário (nomes de
// jogador) antes de inseri-las via innerHTML.
//
// 🔴 CORREÇÃO DE SEGURANÇA (ver ISSUES.md): nomes de jogador vêm
// direto do input de texto em entry/roomEntry.js, validados só por
// TAMANHO (3-20 caracteres) — sem restrição de caracteres. Como esses
// nomes eram interpolados direto em innerHTML em vários componentes
// (lobby, ranking, modais de assessoria/venda), um jogador poderia se
// cadastrar com um nome contendo HTML/JS (ex: '<svg/onload=alert(1)>',
// que cabe nos 20 caracteres) e executar código na tela de outros
// jogadores conectados na mesma sala (XSS armazenado).
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