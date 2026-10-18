// ============================================
// PM: The KPI Master - Configurações do Jogo
// ============================================
// Centraliza todas as constantes ajustáveis.
// ============================================

const CONFIG = {

    KPI: {
        CORRECT_ANSWER: 10,                   // KPI ganho por acerto
        FINAL_RESOURCE_VALUE: 5,              // Multiplicador de recursos no KPI final
    },

    RESOURCES: {
        ADVISORY_FEE: 1,                      // Honorário (em recursos) que quem pediu assessoria paga ao assessor, só se seguiu a sugestão e acertou
        HELP_REWARD: 2,                       // Recompensa (em recursos) do patrocinador a quem ajudou, se a sugestão foi seguida e estava certa
        HELP_COVER: 1,                        // Recursos com que quem ajudou cobre o erro de quem pediu (sugestão seguida e errada); também o mínimo para poder ajudar
    },

    STARTING_RESOURCES: 10,                   // Recursos que cada jogador recebe no início de cada partida (recurso é punição por erro, não custo incondicional — ver _docs/architecture.md)

    GAME: {
        MAX_PLAYERS: 6,
        MIN_PLAYERS: 2,
        SESSION_DURATION: 5400,               // 90 minutos (em segundos)
        ACTIVITIES_PER_FOCUS_AREA: 2,         // Atividades necessárias para avançar de área foco
        ADVISORY_TIMEOUT: 60000,              // Tempo máximo para o assessor (ou quem ajuda) responder (ms)
        ANSWER_TIMEOUT: 90000,                // Tempo máximo para o Respondedor escolher uma alternativa (ms), contado da pergunta feita; para enquanto o apoio está pendente
        ASK_TIMEOUT: 30000,                   // Tempo para o Perguntador clicar em "Fazer a pergunta" (ms); esgotado, a pergunta vai sozinha. 0 = sem essa etapa: a pergunta vai direto para quem responde
        HEARTBEAT_INTERVAL: 2000,             // Sinal de vida: de quanto em quanto tempo cada aparelho avisa o banco que está na sala (ms)
        PRESENCE_TIMEOUT: 20000,              // Tolerância: o host dá o jogador como caído com o sinal parado há mais que isso (ms) — um F5 rápido não é queda
        HOST_TIMEOUT: 10000,                  // Os jogadores dão o host como caído com o sinal dele parado há mais que isso (ms); não pode ficar abaixo de 5000
    },

    FOCUS_AREAS: [
        { id: 'initiating', name: 'Iniciação', emoji: '🚀' },
        { id: 'planning', name: 'Planejamento', emoji: '📋' },
        { id: 'executing', name: 'Execução', emoji: '⚙️' },
        { id: 'monitoringControlling', name: 'Monitoramento e Controle', emoji: '📊' },
        { id: 'closing', name: 'Encerramento', emoji: '🏁' },
    ],

    // Configuração web do projeto do Firebase, usada pelo jogo (login
    // anônimo e salas) e pela página de teste de conexão
    // (firebase-check.html). É pública por natureza (vai para o navegador
    // de quem abre a página); a proteção vem das regras do banco
    // (database.rules.json). Nunca colocar aqui chave de conta de serviço.
    // null = ainda não configurado (o jogo não conecta; a página avisa).
    FIREBASE: {
        apiKey: 'AIzaSyDPKTnL1DTS5b7QT3lgZXPxUCG-SWm_Ro4',
        authDomain: 'pm-the-kpi-master.firebaseapp.com',
        databaseURL: 'https://pm-the-kpi-master-default-rtdb.firebaseio.com',
        projectId: 'pm-the-kpi-master',
        storageBucket: 'pm-the-kpi-master.firebasestorage.app',
        messagingSenderId: '736157504763',
        appId: '1:736157504763:web:1aac887291ccb4b5814c5e',
    },

    // Só os testes no navegador ligam: aponta o login e o banco para o
    // emulador local, ex: { host, authPort, databasePort }.
    FIREBASE_EMULATOR: null,

    TIMER: {
        WARNING: 1800,                        // 30 min – alerta amarelo
        DANGER: 600,                          // 10 min – alerta vermelho
        CRITICAL: 300,                        // 5 min – pisca e fica crítico
    },
};

window.CONFIG = CONFIG;