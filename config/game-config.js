const CONFIG = {

    KPI: {
        ACERTO_BASE: 10,
        VALOR_RECURSO_FINAL: 5,
        VALOR_VENDA_RECURSO: 10,   // era 15 — README pede 10
        ASSESSORIA_ACERTO: 5,     // NOVO — bônus do assessor quando acerta
    },

    RECURSOS_INICIAIS: 20,

    JOGO: {
        MAX_PLAYERS: 6,
        MIN_PLAYERS: 2,
        SESSION_DURATION: 5400,    // era 7200 — README pede 90 minutos
        ACTIVITIES_PER_PHASE: 2,
        HOST_TIMEOUT: 30000,
        ASSESSORIA_TIMEOUT: 20000, // NOVO — 20s para o assessor responder
        RESPOSTA_TIMEOUT: 60000,   // CORRIGIDO — faltava esta constante. Sem ela,
        // CONFIG.JOGO.RESPOSTA_TIMEOUT era `undefined` em
        // js/game-core.js (armarRespostaTimeout), e
        // setTimeout(fn, undefined) é coagido para
        // setTimeout(fn, 0) — o "pulo automático de vez"
        // disparava quase instantaneamente para TODO
        // Respondedor, e não só como salvaguarda contra
        // desconexão, quebrando o fluxo de resposta
        // descrito no README.
    },

    FASES: [
        { id: 'iniciacao', nome: 'Iniciação', emoji: '🚀' },
        { id: 'planejamento', nome: 'Planejamento', emoji: '📋' },
        { id: 'execucao', nome: 'Execução', emoji: '⚙️' },
        { id: 'monitoramento_controle', nome: 'Monitoramento e Controle', emoji: '📊' },
        { id: 'encerramento', nome: 'Encerramento', emoji: '🏁' },
    ],

    ROOM_PREFIX: 'pm-the-kpi-master-',

    TIMER: {
        WARNING: 1800,
        DANGER: 600,
        CRITICAL: 300,
    },
};

window.CONFIG = CONFIG;