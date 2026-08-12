- evento neutro (evento neutro deve ser + 50% das ocorrências) - feito
 - Vender Recursos não está funcionando corretamente. O comprador deve aceitar a compra de recurso. - feito
 - Eliminar modal de eventos quando jogador clica em sair (tratar melhor esta situação) - feito
 - Assessoria deve permitir para o host tambem. - pedente (não fazer por enquanto)
 - Garantir que todos os jogadores do jogo respondam ao menos uma vez antes que algum jogador responda novamente - feito
   (jogadores sem recursos agora são marcados como "turno usado" em pickNewPair())
 - README.md desatualizado quanto ao número de eventos (5 → 6, evento neutro e6 não documentado) - feito
 - Botão "✕ Cancelar" do modal de Venda de Recurso (btnFecharVenda) sem funcionalidade - feito
 - Caracteres "+" de diff vazando como texto visível no game.html (bloco #modalVendaOferta) - feito
- Garantir que todos os jogadores do jogo respondam ao menos uma vez antes que algum jogador responda novamente - feito (de verdade desta vez). Causa raiz encontrada: a garantia dependia de uma LISTA (usedRespondedorThisRound) que só existia na
  memória local do host e nunca era sincronizada pela rede. Quando um GUEST assumia como host
  (becomeHost(), após queda do host anterior), a lista dele estava vazia e o rodízio reiniciava do
  zero sem aviso — o que batia com o sintoma relatado de "alguém sendo chamado de novo". Trocada por
  um CONTADOR por jogador (state.respostasCount), sincronizado a cada rodada via broadcast
  'round-start' (e também em 'state-sync' e 'host-changed'): o Respondedor é sempre sorteado entre+  quem tem o MENOR valor no contador, invariante que não depende de nenhum reset no meio da partida.