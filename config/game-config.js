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
        HOST_TIMEOUT: 10000,                  // Prazo total (ms) que os jogadores esperam o host voltar depois de uma queda; esgotado, outro jogador assume como host
        ADVISORY_TIMEOUT: 20000,              // Tempo máximo para o assessor (ou quem ajuda) responder (ms)
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