/*
  FILE: js/ui/components/gameControlsComponent.js
  ARQUIVO LEGADO DE BASE: game-ui.js (listeners de botões de venda, assessoria e encerramento)[cite: 3].
  
  RESPONSABILIDADE:
  - Componente de Interface: Gerencia a barra de ações e atalhos do jogador.
  - Dispara requisições via EventBus para:
    1. Venda/Compra de recursos (abre o resourceTradeModal).
    2. Pedido de Assessoria (abre o advisoryModal).
    3. Encerrar a partida (disponível para o Host)[cite: 1, 3].
*/