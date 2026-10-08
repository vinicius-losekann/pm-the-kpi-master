// ============================================
// PM: The KPI Master - Locale: pt-BR
// ============================================
// Dicionário de strings de UI em português (Brasil).
//
// Usado pela tela via Game.i18n.t('chave') (js/utils/i18n.js). Os
// avisos de entrada recusada (join-rejected) e os textos de confirm()
// ainda são fixos no código.
//
// Organização: um namespace por componente/modal, espelhando os
// arquivos de js/ui/components/ e js/ui/modals/.
//
// NÃO inclui: mensagens de console.log/console.warn (não são texto
// de UI, são para depuração) nem o conteúdo de data/questions.pt-BR.json
// e data/events.json (perguntas/eventos são conteúdo do jogo, não
// strings de interface).
// ============================================

window.Game = window.Game || {};
window.Game.locales = window.Game.locales || {};
window.Game.locales['pt-BR'] = {

    lobby: {
        waitingForHost: 'Aguardando o host iniciar a partida...',
        matchInProgressTitle: 'Partida em andamento',
        matchInProgressDesc: 'Você saiu da partida. Aguarde o host encerrar.',
        playing: '👥 Em jogo ({{count}})',
        waiting: '👤 Aguardando ({{count}})',
        waitingForPlayers: 'Aguardando jogadores...',
        badgeHost: 'HOST',
        badgeWaiting: '(aguardando)',
    },

    controls: {
        readyToStart: '{{count}} jogadores ativos - pronto!',
        minPlayers: 'Mínimo de {{min}} jogadores ativos',
        copied: '✅ Copiado!',
        copy: '📋 Copiar',
    },

    // Card de perfil: o rótulo dos recursos vira "Estouro" quando o
    // recurso fica negativo (estouro de orçamento).
    profile: {
        resourcesLabel: 'Recursos',
        overrunLabel: 'Estouro',
    },

    question: {
        youAreAsking: '👀 <strong>Você está perguntando!</strong> Tela somente leitura.',
        timeLeft: '⏱️ {{seconds}}s',
        roundEndedHost: '🏁 Rodada encerrada! Clique em "Nova Rodada" para continuar.',
        roundEndedGuest: '🏁 Rodada encerrada! Aguardando o host iniciar uma nova rodada.',
        matchPaused: '⏸️ Partida pausada: não há jogadores conectados suficientes. Ela continua sozinha assim que alguém reconectar.',
    },

    spectator: {
        waitingForQuestion: '⏳ {{asker}} pergunta para {{answerer}}...',
    },

    advisory: {
        noAdvisorAvailable: '⚠️ Nenhum jogador disponível para assessoria.',
        waitingForAnswer: '📞 Aguardando resposta de {{advisor}}...',
        suggestion: '🧭 {{advisor}} sugere: {{suggestion}}',
        declined: '❌ {{advisor}} recusou o pedido de assessoria.',
        timeout: '⌛ {{advisor}} não respondeu a tempo.',
        invalid: '⚠️ Não foi possível chamar {{advisor}}. Escolha uma alternativa.',
        closingFocusArea: '⚠️ Jogadores na Área Foco Encerramento não podem pedir assessoria.',
        timeLeft: '⏱️ {{seconds}}s',
    },

    // Aviso do evento: quem foi atingido pelo Patrocinador Generoso ou
    // pela Reestruturação (ver ui/modals/eventModal.js).
    event: {
        received: '🎁 {{names}} recebeu +{{amount}} recurso.',
        receivedMany: '🎁 {{names}} receberam +{{amount}} recurso cada.',
        gave: '🔄 {{giver}} cedeu {{amount}} recurso a {{receiver}}.',
        noneTied: '🔄 Todos estão empatados em atividades e recursos: ninguém cedeu.',
        noneGiverWithoutResources: '🔄 {{giver}} está à frente, mas sem recursos para ceder: ninguém cedeu.',
    },

    // Pedido de ajuda: só quem está sem recurso pode pedir; fila
    // automática, sem escolha manual (ver engine/tradeEngine.js).
    trade: {
        helpOffer: '<strong>{{requester}}</strong> está sem recursos e pediu ajuda — topa dar 1📦?',
        insufficientKpi: '⚠️ Você está sem recursos e sem KPI suficiente para pedir ajuda agora. Continue jogando como Perguntador ou Assessor para conseguir mais KPI — assim que tiver o suficiente, tenta pedir ajuda de novo.',
        noHelp: '⚠️ Ninguém pôde te ajudar agora. Você ainda ganha KPI sendo Perguntador ou Assessor — tenta pedir ajuda de novo daqui a pouco.',
        helpBusy: '⚠️ Outro jogador está pedindo ajuda agora. Tenta de novo daqui a pouco.',
    },

    result: {
        correct: '✅ Acertou!',
        wrong: '❌ Errou!',
        kpiGained: '+{{kpi}} KPI',
        kpiZero: '0 KPI',
        withResources: ' | 📦 {{resources}} recursos',
        advisoryTitle: '🧭 Assessoria!',
        advisorBonus: '+{{bonus}} KPI (sugestão correta)',
    },

    ranking: {
        noActivePlayers: 'Nenhum jogador ativo',
        finalKpiFormula: 'KPI Final = KPI acumulado + (Recursos × {{value}}) — recurso negativo (estouro de orçamento) desconta',
        overrun: 'Estouro de orçamento: recurso negativo desconta do KPI Final',
        rankingDetail: 'KPI acumulado (acertos, ajudas e assessorias): {{kpi}} | Recursos: {{resources}}📦 × {{value}} = {{resourcesKpi}} KPI',
        disconnected: 'Desconectado, aguardando reconexão',
        tiebreakNote: 'Empate no KPI Final: fica à frente quem avançou mais nas áreas foco e, se ainda empatar, quem tem mais KPI acumulado. Empate em tudo divide a posição.',
    },

    connection: {
        connected: 'Conectado',
        disconnected: 'Desconectado',
        error: 'Erro de conexão',
        couldNotConnect: 'Não foi possível conectar. Recarregue a página.',
        reconnecting: 'Reconectando ({{attempt}}/{{max}})...',
        hostDisconnected: 'Host desconectado — tentando reconectar...',
        reconnectingToHost: 'Reconectando ao host ({{attempt}}/{{max}})...',
        reconnected: 'Reconectado',
        searchingForNewHost: 'Procurando novo host ({{attempt}}/{{max}})...',
        couldNotReconnect: 'Não foi possível reconectar. Recarregue a página.',
        hostTakeoverFailed: 'Falha ao assumir a sala como host.',
    },
};