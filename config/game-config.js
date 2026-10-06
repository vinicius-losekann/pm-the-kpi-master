// ============================================
// PM: The KPI Master - Configurações do Jogo
// ============================================
// Centraliza todas as constantes ajustáveis.
// ============================================

const CONFIG = {

    KPI: {
        CORRECT_ANSWER: 10,                   // KPI ganho por acerto
        FINAL_RESOURCE_VALUE: 5,              // Multiplicador de recursos no KPI final
        RESOURCE_PRICE: 10,                   // Preço de 1 recurso no pedido de ajuda (em KPI)
        ADVISOR_BONUS: 5,                     // Bônus de KPI para o assessor quando sua sugestão é seguida e correta
    },

    STARTING_RESOURCES: 10,                   // Recursos que cada jogador recebe no início de cada partida (recurso é punição por erro, não custo incondicional — ver _docs/architecture.md)

    GAME: {
        MAX_PLAYERS: 6,
        MIN_PLAYERS: 2,
        SESSION_DURATION: 5400,               // 90 minutos (em segundos)
        ACTIVITIES_PER_FOCUS_AREA: 2,         // Atividades necessárias para avançar de área foco
        HOST_TIMEOUT: 10000,                  // Prazo total (ms) que os jogadores esperam o host voltar depois de uma queda; esgotado, outro jogador assume como host
        ADVISORY_TIMEOUT: 20000,              // Tempo máximo para o assessor responder (ms)
        HELP_OFFER_TIMEOUT: 20000,            // Tempo máximo para cada jogador da fila responder ao pedido de ajuda (ms)
        ANSWER_TIMEOUT: 60000,                // Tempo máximo para o Respondedor escolher uma alternativa (ms)
    },

    FOCUS_AREAS: [
        { id: 'initiating', name: 'Iniciação', emoji: '🚀' },
        { id: 'planning', name: 'Planejamento', emoji: '📋' },
        { id: 'executing', name: 'Execução', emoji: '⚙️' },
        { id: 'monitoringControlling', name: 'Monitoramento e Controle', emoji: '📊' },
        { id: 'closing', name: 'Encerramento', emoji: '🏁' },
    ],

    ROOM_PREFIX: 'pm-the-kpi-master-',        // Prefixo usado para identificar salas no PeerJS

    // Opções passadas a TODO `new Peer(...)` do jogo (tela inicial, peer do
    // jogador e peer de quem assume como host). É aqui que se aponta para
    // um servidor de sinalização próprio, se um dia for preciso sair do
    // servidor público gratuito do PeerJS — ex: { host, port, path, secure }.
    // Quem usa passa uma cópia ({ ...CONFIG.PEER }): o PeerJS pode alterar
    // o objeto recebido.
    PEER: {
        debug: 0,                             // 0 = sem logs do PeerJS no console (3 = todos)
    },

    TIMER: {
        WARNING: 1800,                        // 30 min – alerta amarelo
        DANGER: 600,                          // 10 min – alerta vermelho
        CRITICAL: 300,                        // 5 min – pisca e fica crítico
    },
};

window.CONFIG = CONFIG;