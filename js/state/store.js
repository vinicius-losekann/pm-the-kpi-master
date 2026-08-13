/*
  ARQUIVO: js/state/store.js
  ARQUIVO LEGADO DE BASE: [source: 5] (state.js) - Estrutura do objeto window.Game.state.
  
  RESPONSABILIDADE:
  - Fonte Única da Verdade para o estado da partida (jogadores, rodada atual, KPIs, etc).
  - Garante imutabilidade do estado.
  - Dispara o evento STATE_CHANGED no EventBus a cada atualização.
*/