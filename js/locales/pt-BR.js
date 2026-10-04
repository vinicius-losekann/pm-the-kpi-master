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
// de UI, são para depuração) nem o conteúdo de data/questions.json
// (perguntas/eventos são conteúdo do jogo, não strings de interface —
// e ficam em data/).
// ============================================

window.Game = window.Game || {};
window.Game.locales = window.Game.locales || {};
window.Game.locales['pt-BR'] = {

    lobby: {
        aguardandoHost: 'Aguardando o host iniciar a partida...',
        partidaEmAndamentoTitulo: 'Partida em andamento',
        partidaEmAndamentoDesc: 'Você saiu da partida. Aguarde o host encerrar.',
        emJogo: '👥 Em jogo ({{count}})',
        aguardando: '👤 Aguardando ({{count}})',
        aguardandoJogadores: 'Aguardando jogadores...',
        badgeHost: 'HOST',
        badgeAguardando: '(aguardando)',
    },

    controls: {
        prontoParaIniciar: '{{count}} jogadores ativos - pronto!',
        minimoJogadores: 'Mínimo de {{min}} jogadores ativos',
        copiado: '✅ Copiado!',
        copiar: '📋 Copiar',
    },

    question: {
        voceEstaPerguntando: '👀 <strong>Você está perguntando!</strong> Tela somente leitura.',
        tempoRestante: '⏱️ {{seconds}}s',
        rodadaEncerradaHost: '🏁 Rodada encerrada! Clique em "Nova Rodada" para continuar.',
        rodadaEncerradaGuest: '🏁 Rodada encerrada! Aguardando o host iniciar uma nova rodada.',
        partidaPausada: '⏸️ Partida pausada: não há jogadores conectados suficientes. Ela continua sozinha assim que alguém reconectar.',
    },

    spectator: {
        aguardandoPergunta: '⏳ {{perguntador}} pergunta para {{respondedor}}...',
    },

    advisory: {
        nenhumJogadorDisponivel: '⚠️ Nenhum jogador disponível para assessoria.',
        aguardandoResposta: '📞 Aguardando resposta de {{assessor}}...',
        sugestao: '🧭 {{assessor}} sugere: {{sugestao}}',
        recusado: '❌ {{assessor}} recusou o pedido de assessoria.',
        timeout: '⌛ {{assessor}} não respondeu a tempo.',
        invalido: '⚠️ Não foi possível chamar {{assessor}}. Escolha uma alternativa.',
        faseEncerramento: '⚠️ Jogadores na Área Foco Encerramento não podem pedir assessoria.',
        tempoRestante: '⏱️ {{seconds}}s',
    },

    // Pedido de ajuda: só quem está sem recurso pode pedir; fila
    // automática, sem escolha manual (ver engine/tradeEngine.js).
    trade: {
        pedidoRecebido: '<strong>{{requester}}</strong> está sem recursos e pediu ajuda — topa dar 1📦?',
        semKpiParaPedirAjuda: '⚠️ Você está sem recursos e sem KPI suficiente para pedir ajuda agora. Continue jogando como Perguntador ou Assessor para conseguir mais KPI — assim que tiver o suficiente, tenta pedir ajuda de novo.',
        ninguemPodeAjudar: '⚠️ Ninguém pôde te ajudar agora. Você ainda ganha KPI sendo Perguntador ou Assessor — tenta pedir ajuda de novo daqui a pouco.',
    },

    result: {
        acertou: '✅ Acertou!',
        errou: '❌ Errou!',
        kpiGanho: '+{{kpi}} KPI',
        kpiZero: '0 KPI',
        comRecursos: ' | 📦 {{recursos}} recursos',
        assessoriaTitulo: '🧭 Assessoria!',
        assessoriaBonus: '+{{bonus}} KPI (sugestão correta)',
    },

    ranking: {
        nenhumJogadorAtivo: 'Nenhum jogador ativo',
        formulaKpiFinal: 'KPI Final = KPI acumulado + (Recursos restantes × {{valor}})',
        detalheRanking: 'KPI acumulado (acertos, vendas, compras e assessorias): {{kpi}} | Recursos: {{recursos}}📦 × {{valor}} = {{kpiRecursos}} KPI',
        desconectado: 'Desconectado, aguardando reconexão', 
    },

    connection: {
        conectado: 'Conectado',
        desconectado: 'Desconectado',
        erro: 'Erro de conexão',
        naoFoiPossivelConectar: 'Não foi possível conectar. Recarregue a página.',
        reconectando: 'Reconectando ({{attempt}}/{{max}})...',
        hostDesconectado: 'Host desconectado — tentando reconectar...',
        reconectandoHost: 'Reconectando ao host ({{attempt}}/{{max}})...',
        reconectado: 'Reconectado',
        procurandoNovoHost: 'Procurando novo host ({{attempt}}/{{max}})...',
        naoFoiPossivelReconectar: 'Não foi possível reconectar. Recarregue a página.',
        falhaAssumirHost: 'Falha ao assumir a sala como host.',
    },
};