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
        // Etapa "Fazer a pergunta": o Perguntador lê a pergunta em voz alta
        // e clica; só então quem responde vê as alternativas.
        askButton: '🗣️ Fazer a pergunta',
        askHint: 'Leia a pergunta e as alternativas em voz alta para {{answerer}} e clique quando terminar. Se você não clicar, ela vai sozinha em alguns segundos.',
        waitingToBeAsked: '👂 {{asker}} vai te fazer uma pergunta — preste atenção! As alternativas aparecem quando a pergunta for feita.',
    },

    spectator: {
        waitingForQuestion: '⏳ {{asker}} pergunta para {{answerer}}...',
    },

    // Assessoria (com 1 recurso ou mais). O aguardando, a sugestão, o
    // prazo e o pedido inválido valem também para o pedido de ajuda.
    advisory: {
        requestButton: '📞 Pedir Assessoria',
        selectTitle: 'Pedir Assessoria',
        modalTitle: 'Pedido de Assessoria',
        noAdvisorAvailable: '⚠️ Nenhum jogador disponível para assessoria.',
        waitingForAnswer: '📞 Aguardando resposta de {{advisor}}...',
        suggestion: '🧭 {{advisor}} sugere: {{suggestion}}',
        declined: '❌ {{advisor}} recusou o pedido de assessoria.',
        timeout: '⌛ {{advisor}} não respondeu a tempo.',
        invalid: '⚠️ Não foi possível chamar {{advisor}}. Escolha uma alternativa.',
        closingFocusArea: '⚠️ Jogadores na Área Foco Encerramento não podem pedir assessoria nem ajuda.',
        needsResources: '⚠️ Para pedir assessoria é preciso ter pelo menos 1 recurso.',
        feeHint: '💡 Honorário de {{amount}} 📦 ao assessor, só se você seguir a sugestão e acertar.',
        feeNotice: '💼 Se a sua sugestão for seguida e estiver certa, você recebe {{amount}} 📦 de honorário.',
        timeLeft: '⏱️ {{seconds}}s',
    },

    // Pedido de ajuda (com 0 recursos ou menos): fiança na vez de
    // responder (ver engine/advisoryEngine.js e engine/answerEngine.js).
    help: {
        requestButton: '🆘 Pedir Ajuda',
        hint: '💡 Quem ajudar cobre o seu erro; se acertar, ganha {{amount}} 📦 do patrocinador.',
        selectTitle: 'Pedir Ajuda',
        modalTitle: 'Pedido de Ajuda',
        notice: '🆘 Se seguirem sua sugestão: acertou, +{{reward}} 📦 do patrocinador; errou, você cobre com {{cover}} 📦.',
        declined: '❌ {{advisor}} recusou o pedido de ajuda.',
        hasResources: '⚠️ Pedido de ajuda só com 0 recursos ou menos — com recurso, peça assessoria.',
        helperWithoutResources: '⚠️ {{advisor}} está sem recursos para cobrir um erro. Escolha outro jogador.',
        noHelperAvailable: '⚠️ Nenhum jogador com recurso para ajudar agora.',
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

    result: {
        correct: '✅ Acertou!',
        wrong: '❌ Errou!',
        timeout: '⌛ Tempo esgotado!',
        kpiGained: '+{{kpi}} KPI',
        kpiZero: '0 KPI',
        withResources: ' | 📦 {{resources}} recursos',
        // Apoio: o que aconteceu para quem pediu (vem depois dos recursos)
        // e o aviso de quem apoiou (ver ui/modals/resultModal.js).
        feePaid: ' | 🧭 Você pagou {{amount}} 📦 de honorário a {{advisor}}.',
        advisoryTitle: '🧭 Assessoria!',
        feeReceived: '{{requester}} seguiu sua sugestão e acertou: +{{amount}} 📦 de honorário.',
        helperRewarded: ' | 🎁 {{helper}} te ajudou e ganhou {{amount}} 📦 do patrocinador.',
        errorCovered: ' | 🛡️ {{helper}} cobriu o seu erro: você não perdeu recurso.',
        helpTitle: '🆘 Ajuda!',
        rewardReceived: '🎁 O patrocinador reconheceu sua ajuda a {{requester}}: +{{amount}} 📦.',
        coverPaid: '🛡️ Você cobriu o erro de {{requester}}: −{{amount}} 📦.',
    },

    ranking: {
        noActivePlayers: 'Nenhum jogador ativo',
        finalKpiFormula: 'KPI Final = KPI acumulado + (Recursos × {{value}}) — recurso negativo (estouro de orçamento) desconta',
        overrun: 'Estouro de orçamento: recurso negativo desconta do KPI Final',
        rankingDetail: 'KPI acumulado (acertos): {{kpi}} | Recursos: {{resources}}📦 × {{value}} = {{resourcesKpi}} KPI',
        disconnected: 'Desconectado, aguardando reconexão',
        tiebreakNote: 'Empate no KPI Final: fica à frente quem avançou mais nas áreas foco e, se ainda empatar, quem tem mais KPI acumulado. Empate em tudo divide a posição.',
    },

    connection: {
        connected: 'Conectado',
        disconnected: 'Desconectado',
        error: 'Erro de conexão',
        couldNotConnect: 'Não foi possível conectar. Recarregue a página.',
        hostDisconnected: 'Host desconectado — aguardando a volta dele...',
        // Depois de uma troca de host (ver network/roomLink.js).
        newHost: 'Conectado — {{name}} agora é o host',
    },
};