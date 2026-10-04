// ============================================
// PM: The KPI Master - Domain: Baralho de Perguntas
// ============================================
// Regras PURAS de sorteio e controle do baralho de perguntas.
// Não acessa Game.state, network ou DOM diretamente — recebe tudo
// por parâmetro e retorna/mutação apenas dos objetos passados.
//
// Nomenclatura PMBOK 8ª ed.: questionsData.domains são os Domínios de
// Desempenho, e o campo "areas" de cada domínio lista as áreas foco
// compatíveis.
// ============================================

/**
 * Sorteia uma pergunta não utilizada de um domínio compatível com a área
 * foco informada. Se todas as perguntas dos domínios elegíveis estiverem
 * usadas, reinicia o(s) baralho(s) desse(s) domínio(s) antes de sortear.
 *
 * @param {object} decks - Game.state.baralhos (mutado in-place)
 * @param {object} questionsData - Game.state.questionsData
 * @param {string} focusAreaId - área foco do Respondedor
 * @returns {object|null} pergunta sorteada (com domain_key) ou null se não houver nenhuma
 */
function drawQuestion(decks, questionsData, focusAreaId) {
    let availableDomains = [];

    for (const [key, domain] of Object.entries(questionsData?.domains || {})) {
        if (domain.areas.includes(focusAreaId) && decks[key]?.disponiveis > 0) {
            availableDomains.push(key);
        }
    }

    if (availableDomains.length === 0) {
        for (const [key, domain] of Object.entries(questionsData?.domains || {})) {
            if (domain.areas.includes(focusAreaId)) {
                resetDeck(decks, key);
                availableDomains.push(key);
            }
        }
    }

    if (availableDomains.length === 0) return null;

    const drawnDomain = availableDomains[Math.floor(Math.random() * availableDomains.length)];
    const deck = decks[drawnDomain];
    if (!deck || deck.disponiveis <= 0) return null;

    const unused = deck.perguntas.filter(p => !p.usada);
    if (unused.length === 0) return null;

    const question = unused[Math.floor(Math.random() * unused.length)];
    question.usada = true;
    deck.disponiveis--;

    return { ...question, domain_key: drawnDomain };
}

/**
 * Reinicia o baralho de um domínio, marcando todas as perguntas como não usadas.
 */
function resetDeck(decks, domainKey) {
    const deck = decks[domainKey];
    if (deck) {
        deck.perguntas.forEach(p => p.usada = false);
        deck.disponiveis = deck.total;
    }
}

/**
 * Reinicia todos os baralhos (usado ao iniciar uma nova partida).
 */
function resetAllDecks(decks) {
    Object.keys(decks).forEach(key => resetDeck(decks, key));
}

// ============================================
// EXPORTAÇÃO
// ============================================
window.Game = window.Game || {};
window.Game.domain = window.Game.domain || {};
window.Game.domain.deck = {
    drawQuestion,
    resetDeck,
    resetAllDecks
};
