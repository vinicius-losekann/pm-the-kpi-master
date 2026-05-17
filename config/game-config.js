// ============================================
// PM: The KPI Master - CONFIGURAÇÕES GLOBAIS (V2)
// ============================================
// Centraliza todas as constantes do jogo.
// Para ajustar pontuação, fases ou timer, edite apenas este arquivo.
// ============================================

const CONFIG = {

    // --- PONTUAÇÃO (KPI) ---
    KPI: {
        ACERTO_BASE: 10,           // KPI por atividade completada
        VALOR_RECURSO_FINAL: 5,    // KPI por recurso restante no fim do jogo
        VALOR_VENDA_RECURSO: 15,   // KPI por venda de recurso
    },

    // --- RECURSOS ---
    RECURSOS_INICIAIS: 10,          // Recursos que cada jogador recebe no início

    // --- REGRAS DO JOGO ---
    JOGO: {
        MAX_PLAYERS: 6,            // Máximo de jogadores na sala
        MIN_PLAYERS: 2,            // Mínimo para iniciar partida
        SESSION_DURATION: 7200,    // 120 minutos (em segundos)
        ACTIVITIES_PER_PHASE: 2,   // Atividades para avançar de fase
        HOST_TIMEOUT: 30000,       // 30s para detectar host offline
    },

    // --- FASES (Grupos de Processo PMBOK) ---
    FASES: [
        { id: 'iniciacao',              nome: 'Iniciação',                   emoji: '🚀' },
        { id: 'planejamento',           nome: 'Planejamento',                emoji: '📋' },
        { id: 'execucao',               nome: 'Execução',                    emoji: '⚙️' },
        { id: 'monitoramento_controle', nome: 'Monitoramento e Controle',   emoji: '📊' },
        { id: 'encerramento',           nome: 'Encerramento',                emoji: '🏁' },
    ],

    // --- SALA ---
    ROOM_PREFIX: 'pm-the-kpi-master-',

    // --- TIMER ---
    TIMER: {
        WARNING: 1800,   // 30 min - amarelo
        DANGER: 600,     // 10 min - vermelho
        CRITICAL: 300,   // 5 min  - piscando
    },
};

window.CONFIG = CONFIG;

