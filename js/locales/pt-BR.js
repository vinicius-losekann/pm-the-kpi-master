// ============================================
// PM: The KPI Master - Locale: pt-BR
// ============================================
// Dicionário de strings de UI em português (Brasil).
//
// ⚠️ FASE 6 — APENAS INFRAESTRUTURA: este dicionário reflete as
// strings ATUALMENTE hardcoded nos arquivos js/ui/*.js, mas nenhum
// desses arquivos foi religado para usar Game.i18n.t() ainda —
// ver NOTA-003 em ARCHITECTURE.md.
//
// Organização: um namespace por componente/modal, espelhando os
// arquivos de js/ui/components/ e js/ui/modals/.
//
// NÃO inclui: mensagens de console.log/console.warn (não são texto
// de UI, são para depuração) nem o conteúdo de data/questions.json
// (perguntas/eventos são conteúdo do jogo, não strings de interface —
// ver nota em data/ no roadmap).
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
        voceEstaRespondendo: '🎯 <strong>Você está respondendo!</strong> Escolha uma alternativa.',
        voceEstaPerguntando: '👀 <strong>Você está perguntando!</strong> Tela somente leitura.',
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
        faseEncerramento: '⚠️ Jogadores na fase de Encerramento não podem pedir assessoria.',
        tempoRestante: '⏱️ {{seconds}}s',
    },

    trade: {
        semRecursos: '⚠️ Você não tem recursos para vender.',
        nenhumComprador: '⚠️ Nenhum jogador disponível para comprar (precisa ter pelo menos {{valor}} KPI).',
        seusRecursos: 'Seus recursos: 📦 {{recursos}}',
        aguardandoAceite: '🔄 Aguardando {{comprador}} aceitar a oferta...',
        confirmarOferta: 'Enviar oferta de venda de 1📦 para {{comprador}} por {{valor}} KPI?',
        ofertaRecebida: '<strong>{{vendedor}}</strong> oferece 1📦 por <strong style="color:#ffd700;">{{valor}} KPI</strong>',
    },

    result: {
        acertou: '✅ Acertou!',
        errou: '❌ Errou!',
        kpiGanho: '+{{kpi}} KPI',
        kpiZero: '0 KPI',
        comRecursos: ' | 📦 {{recursos}} recursos',
        assessoriaTitulo: '🧭 Assessoria!',
        assessoriaBonus: '+{{bonus}} KPI (sugestão correta)',
        semRecursosVezPulada: '⚠️ Sem recursos — vez pulada',
    },

    ranking: {
        nenhumJogadorAtivo: 'Nenhum jogador ativo',
        formulaKpiFinal: 'KPI Final = KPI acumulado + (Recursos restantes × {{valor}})',
        detalheRanking: 'KPI acumulado (acertos, vendas, compras e assessorias): {{kpi}} | Recursos: {{recursos}}📦 × {{valor}} = {{kpiRecursos}} KPI',
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