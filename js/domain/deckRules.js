// ============================================
// PM: The KPI Master - Domain: Baralho de Perguntas
// ============================================
// Regras PURAS de sorteio e controle do baralho de perguntas.
// Não acessa Game.state, network ou DOM diretamente — recebe tudo
// por parâmetro e retorna/mutação apenas dos objetos passados.
// Fase 1.3 do roadmap.
//
// Fase 8 (nomenclatura PMBOK 8ª ed.): questionsData.areas virou
// questionsData.domains (Domínios de Desempenho), e o campo interno
// de cada domínio que lista as fases compatíveis (antes "grupos")
// virou "areas" (Áreas de Foco). Ver ARCHITECTURE.md.
// ============================================

/**
 * Sorteia uma pergunta não utilizada de um domínio compatível com a fase
 * (grupoProcesso) informada. Se todas as perguntas de um domínio elegível
 * estiverem usadas, reinicia o(s) baralho(s) desse(s) domínio(s) antes de sortear.
 *
 * @param {object} baralhos - Game.state.baralhos (mutado in-place)
 * @param {object} questionsData - Game.state.questionsData
 * @param {string} grupoProcesso - fase/grupo do Respondedor
 * @returns {object|null} pergunta sorteada (com domain_key) ou null se não houver nenhuma
 */
function sortearPergunta(baralhos, questionsData, grupoProcesso) {
    let domainsDisponiveis = [];

    for (const [key, domain] of Object.entries(questionsData?.domains || {})) {
        if (domain.areas.includes(grupoProcesso) && baralhos[key]?.disponiveis > 0) {
            domainsDisponiveis.push(key);
        }
    }

    if (domainsDisponiveis.length === 0) {
        for (const [key, domain] of Object.entries(questionsData?.domains || {})) {
            if (domain.areas.includes(grupoProcesso)) {
                resetBaralho(baralhos, key);
                domainsDisponiveis.push(key);
            }
        }
    }

    if (domainsDisponiveis.length === 0) return null;

    const domainSorteado = domainsDisponiveis[Math.floor(Math.random() * domainsDisponiveis.length)];
    const baralho = baralhos[domainSorteado];
    if (!baralho || baralho.disponiveis <= 0) return null;

    const disponiveis = baralho.perguntas.filter(p => !p.usada);
    if (disponiveis.length === 0) return null;

    const pergunta = disponiveis[Math.floor(Math.random() * disponiveis.length)];
    pergunta.usada = true;
    baralho.disponiveis--;

    return { ...pergunta, domain_key: domainSorteado };
}

/**
 * Reinicia o baralho de um domínio, marcando todas as perguntas como não usadas.
 */
function resetBaralho(baralhos, domainKey) {
    const baralho = baralhos[domainKey];
    if (baralho) {
        baralho.perguntas.forEach(p => p.usada = false);
        baralho.disponiveis = baralho.total;
    }
}

/**
 * Reinicia todos os baralhos (usado ao iniciar uma nova partida).
 */
function resetAllBaralhos(baralhos) {
    Object.keys(baralhos).forEach(key => resetBaralho(baralhos, key));
}

// ============================================
// EXPORTAÇÃO
// ============================================
window.Game = window.Game || {};
window.Game.domain = window.Game.domain || {};
window.Game.domain.deck = {
    sortearPergunta,
    resetBaralho,
    resetAllBaralhos
};