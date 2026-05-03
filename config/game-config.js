// ============================================
// PM: The KPI Master - CONFIGURAÇÕES GLOBAIS
// ============================================
// Centraliza todas as constantes do jogo.
// Para ajustar pontuação, fases ou timer, edite apenas este arquivo.
// ============================================

const CONFIG = {

    // --- PONTUAÇÃO (KPI) ---
    // Altere aqui para balancear o jogo
    KPI: {
        ACERTO_BASE: 10,           // Pontos por acertar uma pergunta
        VENDA_CARTA_RECURSO: 10,   // (V2) Pontos por venda de carta recurso
        CONSULTORIA: 10,           // (V2) Pontos de consultoria
    },

    // --- REGRAS DO JOGO ---
    JOGO: {
        MAX_PLAYERS: 6,            // Máximo de jogadores na sala
        MIN_PLAYERS: 2,            // Mínimo para iniciar partida
        SESSION_DURATION: 7200,    // 120 minutos (em segundos)
        ACTIVITIES_PER_PHASE: 2,   // Atividades para avançar de fase
        HOST_TIMEOUT: 30000,       // 30s para detectar host offline
    },

    // --- FASES (Grupos de Processo PMBOK) ---
    // Ordem define progressão: iniciacao → planejamento → execucao → m&c → encerramento
    FASES: [
        { id: 'iniciacao',              nome: 'Iniciação',                   emoji: '🚀' },
        { id: 'planejamento',           nome: 'Planejamento',                emoji: '📋' },
        { id: 'execucao',               nome: 'Execução',                    emoji: '⚙️' },
        { id: 'monitoramento_controle', nome: 'Monitoramento e Controle',   emoji: '📊' },
        { id: 'encerramento',           nome: 'Encerramento',                emoji: '🏁' },
    ],

    // --- SALA ---
    ROOM_PREFIX: 'pm-the-kpi-master-',   // Prefixo do ID da sala

    // --- TIMER ---
    // Limiares para mudança de cor do timer
    TIMER: {
        WARNING: 1800,   // 30 min - fica amarelo
        DANGER: 600,     // 10 min - fica vermelho
        CRITICAL: 300,   // 5 min  - fica piscando
    },
};

// Expõe globalmente para todos os módulos
window.CONFIG = CONFIG;