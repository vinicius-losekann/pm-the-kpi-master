// js/game.js

let allQuestions = [];
let currentQuestion = null;
let selectedOption = null;
// currentLanguage é inicializado com um valor padrão em AppConfig
let currentLanguage = AppConfig.defaultLanguage; 

const translations = {
    "pt-BR": {
        game_page_base_title: "Jogo de Gerenciamento de Projetos - Sessão",
        label_session: "Sessão",
        label_back_to_home: "Voltar para o Início",
        label_choose_area: "Escolha a Área da Próxima Carta:",
        area_integration: "Integração",
        area_scope: "Escopo",
        area_schedule: "Cronograma",
        area_cost: "Custos",
        area_quality: "Qualidade",
        area_resources: "Recursos",
        area_communications: "Comunicações",
        area_risks: "Riscos",
        area_acquisitions: "Aquisições",
        area_stakeholders: "Partes Interessadas",
        button_random_card: "Carta Aleatória",
        button_check_answer: "Verificar Resposta",
        button_next_card: "Próxima Carta",
        feedback_correct: "Parabéns! Resposta Correta!",
        feedback_incorrect_prefix: "Ops! Resposta Incorreta. A resposta correta é ",
        explanation_prefix: "Explicação: ",
        error_no_session_id: "Nenhum ID de sessão encontrado. Redirecionando para a página inicial.",
        error_loading_questions: "Erro ao carregar as perguntas. Por favor, recarregue a página.",
        session_deleted_message: "Sessão encerrada ou não encontrada. Redirecionando para a página inicial.",
        session_not_found_message: "Sessão não encontrada. Redirecionando para a página inicial.",
        session_load_failed_message: "Erro ao carregar dados da sessão. Redirecionando para a página inicial.",
        no_session_id_message: "Nenhum ID de sessão fornecido. Redirecionando para a página inicial.",
        no_more_questions: "Não há mais perguntas disponíveis para esta área/idioma!"
    },
    "en-US": {
        game_page_base_title: "Project Management Game - Session",
        label_session: "Session",
        label_back_to_home: "Back to Home",
        label_choose_area: "Choose the Area for the Next Card:",
        area_integration: "Integration",
        area_scope: "Scope",
        area_schedule: "Schedule",
        area_cost: "Cost",
        area_quality: "Quality",
        area_resources: "Resource",
        area_communications: "Communications",
        area_risks: "Risk",
        area_acquisitions: "Procurement",
        area_stakeholders: "Stakeholder",
        button_random_card: "Random Card",
        button_check_answer: "Check Answer",
        button_next_card: "Next Card",
        feedback_correct: "Congratulations! Correct Answer!",
        feedback_incorrect_prefix: "Oops! Incorrect Answer. The correct answer is ",
        explanation_prefix: "Explanation: ",
        error_no_session_id: "No session ID found. Redirecting to home page.",
        error_loading_questions: "Error loading questions. Please reload the page.",
        session_deleted_message: "Session ended or not found. Redirecting to home page.",
        session_not_found_message: "Session not found. Redirecting to home page.",
        session_load_failed_message: "Error loading session data. Redirecting to home page.",
        no_session_id_message: "No session ID provided. Redirecting to home page.",
        no_more_questions: "No more questions available for this area/language!"
    },
    "es-ES": {
        game_page_base_title: "Juego de Gestión de Proyectos - Sesión",
        label_session: "Sesión",
        label_back_to_home: "Volver al Inicio",
        label_choose_area: "Elige el Área para la Siguiente Tarjeta:",
        area_integration: "Integración",
        area_scope: "Alcance",
        area_schedule: "Cronograma",
        area_cost: "Costos",
        area_quality: "Calidad",
        area_resources: "Recursos",
        area_communications: "Comunicaciones",
        area_risks: "Riesgos",
        area_acquisitions: "Adquisiciones",
        area_stakeholders: "Interesados",
        button_random_card: "Tarjeta Aleatória",
        button_check_answer: "Verificar Respuesta",
        button_next_card: "Siguiente Tarjeta",
        feedback_correct: "¡Felicidades! ¡Respuesta Correcta!",
        feedback_incorrect_prefix: "¡Uy! Respuesta Incorrecta. La respuesta correcta es ",
        explanation_prefix: "Explicación: ",
        error_no_session_id: "No se encontró ID de sesión. Redireccionando a la página de inicio.",
        error_loading_questions: "Error al cargar las preguntas. Por favor, recargue la página.",
        session_deleted_message: "Sesión finalizada o no encontrada. Redireccionando a la página de inicio.",
        session_not_found_message: "Sesión no encontrada. Redireccionando a la página de inicio.",
        session_load_failed_message: "Error al cargar datos de la sesión. Redireccionando a la página de inicio.",
        no_session_id_message: "No se proporcionó ID de sessão. Redirecionando a la página de inicio.",
        no_more_questions: "¡No hay más preguntas disponibles para esta área/idioma!"
    }
};

// Elementos do DOM (Verificar se existem antes de usar em updateUITexts para evitar null errors)
const sessionIdDisplay = document.getElementById('sessionIdDisplay');
const backToHomeButton = document.getElementById('backToHomeButton');

const areaSelector = document.getElementById('areaSelector');
const areaSelectButtons = document.querySelectorAll('#areaSelector .area-select-button');
const randomAreaButtonSelector = document.getElementById('randomAreaButtonSelector');

const gameCard = document.getElementById('gameCard');
const questionArea = document.getElementById('questionArea');
const questionText = document.getElementById('questionText');
const optionsContainer = document.getElementById('optionsContainer');
const submitAnswerButton = document.getElementById('submitAnswerButton');
const feedbackContainer = document.getElementById('feedbackContainer');
const nextCardButton = document.getElementById('nextCardButton');

// Variáveis para o estado da sessão em tempo real
let currentSessionId = null;
let currentSessionDocRef = null;
let answeredQuestionsCache = new Set();
let playersInSessionCache = {};
let unsubscribeSession = null;
let unsubscribeAnsweredQuestions = null;
let unsubscribePlayers = null;

// Função para extrair o idioma de um ID de sessão como "1234PTBR"
// Retorna o código de idioma ou null se o formato não for o esperado
function getLanguageFromSessionIdString(sessionId) {
    const languageCodeToLangMap = {
        'PTBR': 'pt-BR',
        'ESES': 'es-ES',
        'ENUS': 'en-US'
    };
    if (sessionId && sessionId.length >= 4) { // Pelo menos 4 caracteres para o código do idioma
        const code = sessionId.substring(sessionId.length - 4).toUpperCase(); // Pega os últimos 4 caracteres
        return languageCodeToLangMap[code] || null;
    }
    return null;
}

// Função para atualizar os textos da UI com base no idioma
function updateUITexts() {
    // Garante que currentLanguage tem um valor válido
    if (!currentLanguage || !translations[currentLanguage]) {
        console.warn(`[updateUITexts] Idioma '${currentLanguage}' inválido ou traduções não carregadas. Usando 'pt-BR' como fallback.`);
        currentLanguage = 'pt-BR'; // Define fallback
        if (!translations[currentLanguage]) {
            console.error("[updateUITexts] Erro fatal: Fallback para 'pt-BR' também falhou. Certifique-se de que 'pt-BR' está definido.");
            return; // Sai se nem o fallback for válido
        }
    }
    const currentLangTranslations = translations[currentLanguage];

    // Atualiza o título da página
    if (document.title) document.title = currentLangTranslations.game_page_base_title;

    // Atualiza textos com data-lang-key
    document.querySelectorAll('[data-lang-key]').forEach(element => {
        const key = element.getAttribute('data-lang-key');
        if (currentLangTranslations[key]) {
            element.textContent = currentLangTranslations[key];
        }
    });

    // Atualiza elementos específicos que não usam data-lang-key
    if (sessionIdDisplay) sessionIdDisplay.textContent = currentSessionId || 'N/A'; // Atualiza ID da sessão
    if (document.getElementById('labelSession')) document.getElementById('labelSession').textContent = currentLangTranslations.label_session;
    if (document.getElementById('labelBackToHome')) document.getElementById('labelBackToHome').textContent = currentLangTranslations.label_back_to_home;
    if (document.getElementById('labelChooseArea')) document.getElementById('labelChooseArea').textContent = currentLangTranslations.label_choose_area;

    if (currentQuestion) {
        if (questionArea) questionArea.textContent = currentQuestion.area; 
        if (questionText) questionText.textContent = currentQuestion.questionText;

        if (optionsContainer) {
            optionsContainer.innerHTML = '';
            const options = currentQuestion.options;
            for (const key in options) {
                const optionButton = document.createElement('button');
                optionButton.className = 'option-button bg-gray-100 hover:bg-gray-200 text-gray-800 font-semibold py-3 px-5 rounded-lg text-left w-full shadow';
                optionButton.innerHTML = `<span class="font-bold mr-2">${key})</span> ${options[key]}`;
                optionButton.setAttribute('data-option', key);

                optionButton.addEventListener('click', () => {
                    document.querySelectorAll('.option-button').forEach(btn => { btn.classList.remove('selected'); });
                    optionButton.classList.add('selected');
                    selectedOption = key;
                    if (submitAnswerButton) {
                        submitAnswerButton.disabled = false;
                        submitAnswerButton.classList.remove('opacity-50', 'cursor-not-allowed');
                    }
                });
                optionsContainer.appendChild(optionButton);
            }
        }
        
        if (feedbackContainer && feedbackContainer.innerHTML) { // Verifica se há feedback para atualizar
            const isCorrect = (selectedOption === currentQuestion.correctAnswer);
            feedbackContainer.innerHTML = ''; 
            const feedbackDiv = document.createElement('div');
            const explanationDiv = document.createElement('div');
            explanationDiv.className = 'explanation text-left';

            if (isCorrect) {
                feedbackDiv.className = 'feedback correct';
                feedbackDiv.textContent = currentLangTranslations.feedback_correct;
            } else {
                feedbackDiv.className = 'feedback incorrect';
                feedbackDiv.textContent = currentLangTranslations.feedback_incorrect_prefix + `${currentQuestion.correctAnswer}).`;
            }
            explanationDiv.textContent = currentLangTranslations.explanation_prefix + currentQuestion.explanation;

            feedbackContainer.appendChild(feedbackDiv);
            feedbackContainer.appendChild(explanationDiv);
        }
    }
}

// Nova função para carregar traduções da UI
async function loadUITranslations(lang) {
    console.log(`[loadUITranslations] Tentando carregar traduções para: ${lang}`);
    currentLanguage = lang;
    document.documentElement.lang = currentLanguage;
    updateUITexts(); // Atualiza a UI imediatamente com o idioma carregado
}

// Função para carregar as perguntas do Firestore com base no idioma
async function loadQuestions(lang) {
    try {
        if (!window.db || !window.appId || !window.firestore) {
            throw new Error("Objetos Firebase não inicializados.");
        }

        // Usando window.firestore para todas as operações do Firestore
        const questionsCollectionRef = window.firestore.collection(window.db, `artifacts/${window.appId}/public/data/questions`);
        
        // Usando window.firestore.query e window.firestore.where
        const querySnapshot = await window.firestore.getDocs(
            window.firestore.query(questionsCollectionRef, window.firestore.where('language', '==', lang))
        );
        
        allQuestions = querySnapshot.docs.map(docSnapshot => ({
            id: docSnapshot.id,
            ...docSnapshot.data()
        }));

        console.log(`Perguntas em ${lang} carregadas com sucesso do Firestore da coleção 'questions':`, allQuestions.length);

        // Habilitar botões se existirem
        areaSelectButtons.forEach(button => button.disabled = false);
        if (randomAreaButtonSelector) randomAreaButtonSelector.disabled = false;

    } catch (error) {
        console.error('Falha ao carregar as perguntas do Firestore:', error);
        if (areaSelector) { 
            areaSelector.innerHTML = `<p class="text-red-600">${translations[currentLanguage].error_loading_questions}: ${error.message}</p>`;
        }
        areaSelectButtons.forEach(button => button.disabled = true);
        if (randomAreaButtonSelector) randomAreaButtonSelector.disabled = true;
    }
}

// Função para obter o ID da sessão e o idioma da URL
function getQueryParams() {
    console.log(`[getQueryParams] window.location.search: ${window.location.search}`);
    const urlParams = new URLSearchParams(window.location.search);
    const sessionParam = urlParams.get('session');
    const langParam = urlParams.get('lang');

    console.log(`[getQueryParams] sessionParam: ${sessionParam}, langParam: ${langParam}`);
    return {
        session: sessionParam,
        lang: langParam // Retorna o idioma da URL, pode ser null
    };
}

// Função para filtrar perguntas já respondidas (usando o cache local)
function getUnansweredQuestions(areaFilter = null) {
    let availableQuestions = allQuestions;

    if (areaFilter) {
        availableQuestions = availableQuestions.filter(q => q.area === areaFilter); 
    }
    
    return availableQuestions.filter(q => !answeredQuestionsCache.has(q.originalId));
}

// Função para iniciar uma nova pergunta (puxa carta) - Apenas o HOST (ou quem pode puxar a carta) deve chamar isso
async function displayNextQuestion(areaFilter = null) {
    const unansweredQuestions = getUnansweredQuestions(areaFilter);

    if (unansweredQuestions.length === 0) {
        alert(translations[currentLanguage].no_more_questions);
        await updateSessionState(currentSessionId, { status: "completed" });
        return;
    }

    const randomIndex = Math.floor(Math.random() * unansweredQuestions.length);
    const questionToAsk = unansweredQuestions[randomIndex];

    await updateSessionState(currentSessionId, { 
        currentQuestion: {
            id: questionToAsk.id,
            originalId: questionToAsk.originalId,
            area: questionToAsk.area,
            questionText: questionToAsk.question,
            options: questionToAsk.options,
            correctAnswer: questionToAsk.correct,
            explanation: questionToAsk.explanation,
            askedByPlayerId: window.currentUserId,
            timestampAsked: window.firestore.serverTimestamp() // Usando window.firestore.serverTimestamp
        }
    });
}

// Função para exibir a pergunta na UI (chamada pelo listener onSnapshot)
function displayQuestionInUI(question) {
    currentQuestion = question;
    selectedOption = null;
    if (submitAnswerButton) {
        submitAnswerButton.disabled = false;
        submitAnswerButton.classList.remove('opacity-50', 'cursor-not-allowed');
    }
    if (nextCardButton) nextCardButton.classList.add('hidden');

    if (questionArea) questionArea.textContent = question.area; 
    if (questionText) questionText.textContent = question.questionText;
    if (optionsContainer) optionsContainer.innerHTML = '';
    if (feedbackContainer) feedbackContainer.innerHTML = '';

    const options = question.options;

    if (optionsContainer) {
        for (const key in options) {
            const optionButton = document.createElement('button');
            optionButton.className = 'option-button bg-gray-100 hover:bg-gray-200 text-gray-800 font-semibold py-3 px-5 rounded-lg text-left w-full shadow';
            optionButton.innerHTML = `<span class="font-bold mr-2">${key})</span> ${options[key]}`;
            optionButton.setAttribute('data-option', key);

            optionButton.addEventListener('click', () => {
                document.querySelectorAll('.option-button').forEach(btn => {
                    btn.classList.remove('selected');
                });
                optionButton.classList.add('selected');
                selectedOption = key;
                if (submitAnswerButton) {
                    submitAnswerButton.disabled = false;
                    submitAnswerButton.classList.remove('opacity-50', 'cursor-not-allowed');
                }
            });
            optionsContainer.appendChild(optionButton);
        }
    }

    if (areaSelector) areaSelector.classList.add('hidden');
    if (gameCard) gameCard.classList.remove('hidden');
}

// ==============================================
// FUNÇÕES DE GERENCIAMENTO DE SESSÃO NO FIRESTORE
// ==============================================

async function addOrUpdatePlayerToSession(sessionId, userId, userName = `Jogador_${userId.substring(0,4)}`) {
    const appId = window.appId;
    const db = window.db;
    const firestore = window.firestore;
    const playerDocRef = firestore.doc(db, `artifacts/${appId}/public/data/sessions/${sessionId}/players`, userId);

    try {
        const playerSnap = await firestore.getDoc(playerDocRef);
        let playerInitialScore = 0;
        if (playerSnap.exists()) {
            playerInitialScore = playerSnap.data().score || 0;
        }

        await firestore.setDoc(playerDocRef, {
            uid: userId,
            name: userName, 
            score: playerInitialScore,
            lastActive: firestore.serverTimestamp(), // Usando firestore.serverTimestamp
            status: "connected"
        }, { merge: true }); 
        console.log(`Jogador ${userId} adicionado/atualizado na sessão ${sessionId}.`);

        await firestore.updateDoc(firestore.doc(db, `artifacts/${appId}/public/data/sessions`, sessionId), {
            currentPlayers: firestore.arrayUnion(userId) // Usando firestore.arrayUnion
        });
    } catch (error) {
        console.error("Erro ao adicionar/atualizar jogador na sessão:", error);
    }
}

async function removePlayerFromSession(sessionId, userId) {
    const appId = window.appId;
    const db = window.db;
    const firestore = window.firestore;
    const playerDocRef = firestore.doc(db, `artifacts/${appId}/public/data/sessions/${sessionId}/players`, userId);

    try {
        await firestore.updateDoc(playerDocRef, {
            status: "disconnected",
            lastActive: firestore.serverTimestamp() // Usando firestore.serverTimestamp
        });
        console.log(`Jogador ${userId} marcado como desconectado na sessão ${sessionId}.`);

        await firestore.updateDoc(firestore.doc(db, `artifacts/${appId}/public/data/sessions`, sessionId), {
            currentPlayers: firestore.arrayRemove(userId) // Usando firestore.arrayRemove
        });
    } catch (error) {
        console.error("Erro ao remover jogador da sessão:", error);
    }
}

async function updateSessionState(sessionId, data) {
    const appId = window.appId;
    const db = window.db;
    const firestore = window.firestore;
    const sessionDocRef = firestore.doc(db, `artifacts/${appId}/public/data/sessions`, sessionId);
    try {
        await firestore.updateDoc(sessionDocRef, data);
        console.log(`Estado da sessão ${sessionId} atualizado no Firestore.`, data);
    } catch (error) {
        console.error("Erro ao atualizar estado da sessão:", error);
    }
}

function listenToSessionChanges(sessionId) {
    const appId = window.appId;
    const db = window.db;
    const firestore = window.firestore;

    const sessionDocRef = firestore.doc(db, `artifacts/${appId}/public/data/sessions`, sessionId);
    unsubscribeSession = firestore.onSnapshot(sessionDocRef, (docSnap) => {
        if (docSnap.exists()) {
            const sessionData = docSnap.data();
            console.log("Mudanças na sessão (principal):", sessionData);
            
            if (sessionData.currentQuestion) {
                if (sessionData.currentQuestion.id !== currentQuestion?.id || (gameCard && gameCard.classList.contains('hidden'))) {
                    console.log("Nova pergunta ativa detectada ou carta precisa ser exibida:", sessionData.currentQuestion.questionText);
                    displayQuestionInUI(sessionData.currentQuestion);
                }
            } else {
                if (gameCard) gameCard.classList.add('hidden');
                if (areaSelector) areaSelector.classList.remove('hidden');
                if (feedbackContainer) feedbackContainer.innerHTML = '';
                if (nextCardButton) nextCardButton.classList.add('hidden');
                currentQuestion = null;
            }

        } else {
            console.error(`Sessão ${sessionId} não existe ou foi excluída.`);
            alert(translations[currentLanguage].session_deleted_message);
            window.location.href = 'index.html?error=session_deleted';
        }
    });

    const answeredQuestionsColRef = firestore.collection(db, `artifacts/${appId}/public/data/sessions/${sessionId}/answeredQuestions`);
    unsubscribeAnsweredQuestions = firestore.onSnapshot(answeredQuestionsColRef, (snapshot) => {
        answeredQuestionsCache.clear();
        snapshot.forEach((doc) => {
            answeredQuestionsCache.add(doc.data().originalQuestionId);
        });
        console.log("Perguntas respondidas atualizadas (cache):", Array.from(answeredQuestionsCache));
    });

    const playersColRef = firestore.collection(db, `artifacts/${appId}/public/data/sessions/${sessionId}/players`);
    unsubscribePlayers = firestore.onSnapshot(playersColRef, (snapshot) => {
        playersInSessionCache = {}; 
        snapshot.forEach((doc) => {
            playersInSessionCache[doc.id] = doc.data();
        });
        console.log("Detalhes dos jogadores atualizados (cache):", playersInSessionCache);
    });
}


// ===========================================
// FUNÇÃO PRINCIPAL DE INICIALIZAÇÃO DO JOGO
// Esta função é chamada SOMENTE após o Firebase estar pronto
// ===========================================
async function initGameLogic() {
    console.log("[initGameLogic] Iniciando...");
    console.log(`[initGameLogic] AppConfig.defaultLanguage está acessível? ${!!AppConfig.defaultLanguage}. Valor: ${AppConfig.defaultLanguage}`);

    const params = getQueryParams();
    console.log(`[initGameLogic] Parâmetros recebidos de getQueryParams: session='${params.session}', lang='${params.lang}'`);

    currentSessionId = params.session;
    console.log(`[initGameLogic] currentSessionId após atribuição de params.session: '${currentSessionId}'`);
    
    let langFromUrl = params.lang; 
    console.log(`[initGameLogic] langFromUrl (do parâmetro URL): '${langFromUrl}'`);


    if (currentSessionId) {
        console.log(`[initGameLogic] currentSessionId É VÁLIDO: '${currentSessionId}'. Prosseguindo com a lógica de sessão.`);
        if (sessionIdDisplay) sessionIdDisplay.textContent = currentSessionId;

        // PRIORIDADE 1: Idioma do parâmetro 'lang' da URL
        if (langFromUrl && translations[langFromUrl]) {
            currentLanguage = langFromUrl;
            console.log(`[initGameLogic] Idioma definido a partir da URL: ${currentLanguage}`);
        } else {
            // PRIORIDADE 2: Idioma inferido do ID da sessão (se o formato for "XXXXLLLL")
            let langFromSessionId = getLanguageFromSessionIdString(currentSessionId);
            if (langFromSessionId && translations[langFromSessionId]) {
                currentLanguage = langFromSessionId;
                console.log(`[initGameLogic] Idioma definido a partir do ID da sessão: ${currentLanguage}`);
            } else {
                // PRIORIDADE 3: Idioma padrão do AppConfig
                // Garante que AppConfig.defaultLanguage é válido antes de atribuir
                if (AppConfig.defaultLanguage && translations[AppConfig.defaultLanguage]) {
                    currentLanguage = AppConfig.defaultLanguage;
                    console.log(`[initGameLogic] Idioma definido como padrão do AppConfig: ${currentLanguage}`);
                } else {
                    // Último recurso: fallback para pt-BR se AppConfig.defaultLanguage for inválido
                    currentLanguage = 'pt-BR';
                    console.error(`[initGameLogic] AppConfig.defaultLanguage inválido ou não encontrado. Definindo idioma como 'pt-BR'.`);
                }
            }
        }
        console.log(`[initGameLogic] Idioma final determinado: ${currentLanguage}`);
        
        document.documentElement.lang = currentLanguage;
        await loadUITranslations(currentLanguage); // Carrega e aplica traduções iniciais

        const appId = window.appId;
        const db = window.db; 
        const firestore = window.firestore; 
        currentSessionDocRef = firestore.doc(db, `artifacts/${appId}/public/data/sessions`, currentSessionId);

        try {
            const docSnap = await firestore.getDoc(currentSessionDocRef);

            if (docSnap.exists()) {
                const sessionData = docSnap.data();
                // Opcional: Se a sessão no Firestore tiver um idioma diferente, podemos logar um aviso
                if (sessionData.language && sessionData.language !== currentLanguage) {
                    console.warn(`[initGameLogic] Idioma da sessão no Firestore ('${sessionData.language}') difere do idioma determinado ('${currentLanguage}').`);
                }

                await addOrUpdatePlayerToSession(currentSessionId, window.currentUserId);

                listenToSessionChanges(currentSessionId);
                
                await loadQuestions(currentLanguage); // Carrega as perguntas do Firestore com o idioma determinado

                if (sessionData.currentQuestion) {
                    displayQuestionInUI(sessionData.currentQuestion);
                } else {
                    if (areaSelector) areaSelector.classList.remove('hidden');
                    if (gameCard) gameCard.classList.add('hidden');
                }

            } else {
                console.error(`[initGameLogic] Sessão '${currentSessionId}' não encontrada no Firestore. Redirecionando para a página inicial.`);
                alert(translations[currentLanguage].session_not_found_message);
                window.location.href = 'index.html?error=session_not_found';
                return;
            }
        } catch (e) {
            console.error("[initGameLogic] Erro ao carregar ou ingressar na sessão Firestore: ", e);
            alert(translations[currentLanguage].session_load_failed_message);
            window.location.href = 'index.html?error=session_load_failed';
            return;
        }

    } else {
        // NENHUM ID DE SESSÃO NA URL
        console.error(`[initGameLogic] currentSessionId é NULO ou VAZIO. Redirecionando para a página inicial.`);
        if (sessionIdDisplay) sessionIdDisplay.textContent = 'N/A';
        // Garante que o idioma padrão é carregado para a mensagem de erro
        // Usa AppConfig.defaultLanguage como fallback se translations[currentLanguage] ainda for problemático
        const fallbackLang = (AppConfig.defaultLanguage && translations[AppConfig.defaultLanguage]) ? AppConfig.defaultLanguage : 'pt-BR';
        await loadUITranslations(fallbackLang); 

        console.error(translations[currentLanguage].error_no_session_id);
        alert(translations[currentLanguage].no_session_id_message);
        window.location.href = 'index.html?error=no_session_id';
    }

    // Adiciona listener para remover jogador ao fechar/navegar
    window.addEventListener('beforeunload', async () => {
        if (currentSessionId && window.currentUserId) {
            await removePlayerFromSession(currentSessionId, window.currentUserId);
        }
    });

    // Anexar event listeners aos botões aqui, uma vez que o DOM está garantido carregado e elementos existem
    if (submitAnswerButton) {
        submitAnswerButton.addEventListener('click', async () => {
            if (!currentQuestion || !selectedOption) return;

            document.querySelectorAll('.option-button').forEach(btn => { btn.disabled = true; });
            submitAnswerButton.disabled = true;
            submitAnswerButton.classList.add('opacity-50', 'cursor-not-allowed');

            feedbackContainer.innerHTML = '';
            const feedbackDiv = document.createElement('div');
            const explanationDiv = document.createElement('div');
            explanationDiv.className = 'explanation text-left';

            const isCorrect = (selectedOption === currentQuestion.correctAnswer);

            if (isCorrect) {
                feedbackDiv.className = 'feedback correct';
                feedbackDiv.textContent = translations[currentLanguage].feedback_correct;
            } else {
                feedbackDiv.className = 'feedback incorrect';
                feedbackDiv.textContent = translations[currentLanguage].feedback_incorrect_prefix + `${currentQuestion.correctAnswer}).`;
            }
            explanationDiv.textContent = translations[currentLanguage].explanation_prefix + currentQuestion.explanation;

            feedbackContainer.appendChild(feedbackDiv);
            feedbackContainer.appendChild(explanationDiv);

            const appId = window.appId;
            const db = window.db;
            const firestore = window.firestore;

            const answeredQuestionDocRef = firestore.doc(db, `artifacts/${appId}/public/data/sessions/${currentSessionId}/answeredQuestions`, currentQuestion.originalId);

            try {
                await firestore.setDoc(answeredQuestionDocRef, {
                    originalQuestionId: currentQuestion.originalId,
                    area: currentQuestion.area,
                    answeredCorrectlyBy: isCorrect ? firestore.arrayUnion(window.currentUserId) : firestore.arrayRemove(window.currentUserId),
                    answeredByAnyPlayer: true,
                    timestampAnswered: firestore.serverTimestamp()
                }, { merge: true });
                console.log(`Pergunta ${currentQuestion.originalId} marcada como respondida no Firestore.`);

                const playerDocRef = firestore.doc(db, `artifacts/${appId}/public/data/sessions/${currentSessionId}/players`, window.currentUserId);
                if (isCorrect) {
                    await firestore.updateDoc(playerDocRef, {
                        score: (playersInSessionCache[window.currentUserId]?.score || 0) + 1,
                        lastActive: firestore.serverTimestamp()
                    });
                    console.log(`Pontuação de ${window.currentUserId} atualizada.`);
                } else {
                    await firestore.updateDoc(playerDocRef, {
                        lastActive: firestore.serverTimestamp()
                    });
                }

            } catch (error) {
                console.error("Erro ao atualizar pergunta respondida ou pontuação no Firestore:", error);
            }
            
            if (nextCardButton) nextCardButton.classList.remove('hidden');
        });
    }

    areaSelectButtons.forEach(button => {
        button.addEventListener('click', () => {
            const areaName = button.getAttribute('data-area'); 
            displayNextQuestion(areaName);
        });
    });

    if (randomAreaButtonSelector) {
        randomAreaButtonSelector.addEventListener('click', () => {
            if (allQuestions.length === 0) {
                console.warn(translations[currentLanguage].error_loading_questions);
                return;
            }
            displayNextQuestion();
        });
    }

    if (nextCardButton) {
        nextCardButton.addEventListener('click', async () => {
            await updateSessionState(currentSessionId, { currentQuestion: null });

            if (gameCard) gameCard.classList.add('hidden');
            if (areaSelector) areaSelector.classList.remove('hidden');
            if (feedbackContainer) feedbackContainer.innerHTML = '';
            if (nextCardButton) nextCardButton.classList.add('hidden');
            currentQuestion = null;
        });
    }

    if (backToHomeButton) {
        backToHomeButton.addEventListener('click', async () => {
            console.log('Botão "Voltar para o Início" clicado!');
            if (unsubscribeSession) { unsubscribeSession(); }
            if (unsubscribeAnsweredQuestions) { unsubscribeAnsweredQuestions(); }
            if (unsubscribePlayers) { unsubscribePlayers(); }

            if (currentSessionId && window.currentUserId) {
                await removePlayerFromSession(currentSessionId, window.currentUserId);
            }
            window.location.href = 'index.html';
        });
    }
}


// Listener principal DOMContentLoaded que AGUARDA a inicialização do Firebase
document.addEventListener('DOMContentLoaded', async () => {
    console.log("DOMContentLoaded disparado. Verificando AppConfig.defaultLanguage...");
    // Acessa AppConfig.defaultLanguage aqui para garantir que está disponível
    // Isso é crucial, pois AppConfig precisa ser carregado ANTES que game.js tente usá-lo.
    if (typeof AppConfig === 'undefined' || !AppConfig.defaultLanguage) {
        console.error("AppConfig ou AppConfig.defaultLanguage não está definido. Verifique a ordem de carregamento dos scripts.");
        // Pode adicionar um alert ou redirecionamento aqui se for um erro crítico.
        // Para depuração, vamos continuar e ver os próximos logs.
    } else {
        console.log(`AppConfig.defaultLanguage: ${AppConfig.defaultLanguage} (confirmado em DOMContentLoaded)`);
    }

    // Aguarda que a promessa de inicialização do Firebase seja resolvida
    // Isso garante que window.db, window.appId, window.firestore e window.currentUserId estejam definidos.
    await window.firebaseInitializedPromise;
    console.log("Firebase inicializado. Iniciando a lógica do jogo...");
    // Agora que Firebase está pronto, inicia a lógica principal do jogo
    await initGameLogic();
});
