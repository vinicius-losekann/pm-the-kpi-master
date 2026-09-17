# Changelog

Todas as mudanças notáveis deste projeto são documentadas aqui.

O formato segue [Keep a Changelog](https://keepachangelog.com/pt-BR/1.0.0/).
Bugs individuais, com causa raiz e correção, ficam detalhados em `ISSUES.md`;
este arquivo é um resumo de alto nível por período.

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