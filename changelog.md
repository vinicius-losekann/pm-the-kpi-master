# Changelog

Todas as mudanças notáveis deste projeto são documentadas aqui.

O formato segue [Keep a Changelog](https://keepachangelog.com/pt-BR/1.0.0/).
Bugs individuais, com causa raiz e correção, ficam detalhados em `ISSUES.md`;
este arquivo é um resumo de alto nível por período.

---

## [Sem versão] - 2026-09-18

### Changed
- Reorganização de infraestrutura interna: consolidada a atualização de
  tela pós-mudança de estado de jogador (card de perfil, lista online,
  ranking), antes duplicada manualmente em 7 pontos do código, numa
  função única (`Game.ui.syncPlayerViews()`).
- Removido `js/utils/eventBus.js` (nunca usado). `js/utils/logger.js`
  mantido — religamento planejado para antes de rodar com múltiplas
  salas simultâneas em produção.
- `Game.core.*` documentado como a API pública oficial entre camadas de
  engine (comentários antigos sugeriam ser "compatibilidade temporária",
  o que não era mais verdade).
- Removidos arquivos órfãos: `js/index.js` (duplicado de
  `js/entry/roomEntry.js`) e `js/config/constants.js` (nunca preenchido).
- `data/questions.pt-BR.json`: schema renomeado para alinhar com a
  terminologia da 8ª edição do PMBOK e usar chaves em inglês,
  independentes do idioma do conteúdo (`areas`→`domains`,
  `grupos`→`areas`, `pergunta`→`question`, `alternativas`→`alternatives`,
  `correta`→`correct`, chaves de domínio como `governanca`→`governance`).
  Prepara o terreno para `questions.en-US.json`/`questions.es-ES.json`
  futuros sem precisar re-trabalhar o schema depois.

### Fixed
- Corrigido um ponto em `messageHandler.js` que ainda blindava o gabarito
  pelo nome de campo antigo (`correta`) após o rename acima — sem a
  correção, a resposta certa vazaria para jogadores entrando no meio de
  uma rodada em andamento. Ver `REGRESSÃO-003` em `ISSUES.md`.

---

## [Não datado] — Migração de Arquitetura (Fases 0–7)

### Changed
- Reestruturação completa do código: de um conjunto de arquivos monolíticos
  (`game-core.js`, `game-ui.js`, `game-network.js`, `game-state.js`) para uma
  arquitetura em camadas (`domain/`, `state/`, `engine/`, `network/`, `ui/`).
  Detalhes completos em `ARCHITECTURE.md`.
- Perguntas e eventos separados em arquivos distintos
  (`data/questions.pt-BR.json` + `data/events.json`), antes um único
  `data/questions.json`.
- Sistema de internacionalização (i18n) implementado e religado para pt-BR
  (`utils/i18n.js` + `locales/pt-BR.js`, 51 chaves).
- Sistema de Assessoria adicionado: jogadores fora da dupla ativa da rodada
  podem ser chamados para ajudar quem está respondendo.

### Fixed
- Diversos bugs de sincronização entre host e guests após reconexão (F5),
  tela do host não atualizando corretamente, e modal de evento reaparecendo
  indevidamente. Ver `BUG-001` a `BUG-007` em `ISSUES.md`.

### Security
- Corrigida vulnerabilidade de XSS armazenado via nome de jogador (`SEC-001`).
- Corrigida falsificação de identidade em mensagens de rede P2P (`SEC-002`).

---

## [Sem versão] - 2026-08-12

### Fixed
- Evento neutro agora ocorre em ~50% das rodadas, como esperado.
- Venda de recursos: o comprador agora precisa aceitar a compra explicitamente.
- Modal de evento não fecha mais de forma abrupta quando um jogador clica em "sair".
- Garantido que todos os jogadores ativos respondam ao menos uma vez antes que
  algum jogador responda novamente (jogadores sem recursos são marcados como
  "turno usado" em `pickNewPair()`).
- Corrigido o botão "✕ Cancelar" do modal de Venda de Recurso, que não tinha
  funcionalidade.

### Changed
- README.md atualizado quanto ao número de eventos (5 → 6, incluindo o
  evento neutro e6).