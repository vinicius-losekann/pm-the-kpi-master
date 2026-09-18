# Changelog

Todas as mudanças notáveis deste projeto são documentadas aqui.

O formato segue [Keep a Changelog](https://keepachangelog.com/pt-BR/1.0.0/).
Bugs da migração inicial (Fases 0–7) estão resumidos aqui permanentemente.
`ISSUES.md` foca em bugs atuais — causa raiz, correção aplicada, status —
não é mais um arquivo de arquivo morto.

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
- `ISSUES.md` reduzido de 477 para 47 linhas: as 12 entradas da migração
  inicial (Fases 0–7) foram resumidas e movidas para este arquivo
  (seção "Migração de Arquitetura" abaixo), preservando o histórico
  técnico completo. `ISSUES.md` passa a focar só em bugs atuais.
- `ARCHITECTURE.md`: tabela "Status da Migração" e checklist de limpeza
  (ambos 100% concluídos) resumidos para poucas linhas + pointer pra
  este changelog. NOTA-001 e NOTA-002 removidas (já resolvidas, sem
  pendência real a documentar).

### Added
- Modais de resposta do Respondedor (`#modalResponderPergunta`) e do
  Assessor (`#modalAssessoriaQuestion`) agora mostram quem pergunta e
  quem responde na rodada — antes essa informação só existia no
  `#roundInfo` por trás do modal, pouco visível com o overlay aberto.
  Sem mudança de payload de rede (os dois já tinham acesso a
  `Game.state.currentRound.perguntador`/`.respondedor` via
  `'round-start'`).

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
- **BUG-001**: F5 no host trocava a pergunta da rodada em andamento em vez de restaurá-la.
- **BUG-002**: guest virava host indevidamente após F5 no host (falha de reconexão).
- **BUG-003**: card de perfil do host não atualizava (KPI/fase/atividades) após F5.
- **REGRESSÃO-001**: `resetAllBaralhos()` esquecida na extração de `game-core.js` (Fase 3), encontrada antes de gerar bug visível.
- **BUG-004/BUG-005**: modal de evento reaparecendo a cada pergunta; rodada avançando sozinha em vez de esperar o host clicar em "Nova Rodada".
- **REGRESSÃO-002**: wrappers de sorteio (`sortearPergunta`/`sortearEvento`) esquecidos na extração de `game-core.js`, quebravam `debugTools.js` silenciosamente.
- **BUG-006**: tela do host não atualizava quando ele era Perguntador, Respondedor ou Espectador.
- **BUG-007**: ranking do host não atualizava quando um guest respondia.
- **ESCLARECIMENTO-001**: diferença entre "+10 KPI" na modal e "+5" no ranking — comportamento intencional (custo de recurso descontado no ranking), não bug.

### Security
- **SEC-001**: XSS armazenado via nome de jogador, em 8 pontos de renderização.
- **SEC-002**: falsificação de identidade em mensagens de rede (um guest podia agir como outro jogador).

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