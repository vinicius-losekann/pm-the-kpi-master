/*
  ARQUIVO: js/utils/eventBus.js
  ARQUIVO LEGADO DE BASE: NOVO (Substitui o acoplamento direto via window.Game).
  
  RESPONSABILIDADE:
  - Barramento de Eventos (Pub/Sub) para desacoplamento total da aplicação.
  - Permite emissão (`emit`) e escuta (`on`) de eventos sem importação cruzada de instâncias.
*/