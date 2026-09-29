// ============================================
// PM: The KPI Master - Configurações do Jogo
// ============================================
// Centraliza todas as constantes ajustáveis.
// ============================================

const CONFIG = {

    KPI: {
        ACERTO_BASE: 10,                      // KPI ganho por acerto
        VALOR_RECURSO_FINAL: 5,               // Multiplicador de recursos no KPI final
        VALOR_VENDA_RECURSO: 10,              // Preço de venda de 1 recurso (em KPI)
        ASSESSORIA_ACERTO: 5,                 // Bônus de KPI para o assessor quando sua sugestão é seguida e correta
    },

    RECURSOS_INICIAIS: 10,                    // Recursos que cada jogador recebe no início de cada partida (Fase 9: recurso agora é punição por erro, não custo incondicional — ver ARCHITECTURE.md)

    JOGO: {
        MAX_PLAYERS: 6,
        MIN_PLAYERS: 2,
        SESSION_DURATION: 5400,               // 90 minutos (em segundos)
        ACTIVITIES_PER_PHASE: 2,              // Atividades necessárias para avançar de fase
        HOST_TIMEOUT: 30000,                  // Tempo para detectar queda do host (ms)
        ASSESSORIA_TIMEOUT: 20000,            // Tempo máximo para o assessor responder (ms)
        RESPOSTA_TIMEOUT: 60000,              // Tempo máximo para o Respondedor escolher uma alternativa (ms)
    },

    FASES: [
        { id: 'iniciacao', nome: 'Iniciação', emoji: '🚀' },
        { id: 'planejamento', nome: 'Planejamento', emoji: '📋' },
        { id: 'execucao', nome: 'Execução', emoji: '⚙️' },
        { id: 'monitoramento_controle', nome: 'Monitoramento e Controle', emoji: '📊' },
        { id: 'encerramento', nome: 'Encerramento', emoji: '🏁' },
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