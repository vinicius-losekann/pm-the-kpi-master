# Changelog

Todas as mudanças notáveis deste projeto são documentadas aqui.

O formato segue [Keep a Changelog](https://keepachangelog.com/pt-BR/1.0.0/).
Bugs da migração inicial (Fases 0–7) estão resumidos aqui permanentemente.
`_docs/ISSUES.md` foca em bugs atuais — causa raiz, correção aplicada, status —
não é mais um arquivo de arquivo morto.

---

## [Sem versão] - 2026-10-03 — Fase D: conexão, identidade e troca de host

Detalhes de cada bug corrigido (sintoma, causa e testes) em
`_docs/ISSUES.md`; mapa de casos cobertos e testes manuais pendentes em
`_docs/testes-conexao.md`.

### Added
- **Sala travada durante a partida:** nome novo é recusado; só volta
  quem já estava na partida.
- **Jogador desconectado:** quem cai no meio da partida continua na
  lista (📴), com KPI, recursos, fase e vaga preservados, fora do
  sorteio até voltar.
- **Partida pausada** quando faltam jogadores conectados (mas não
  jogadores da partida); retoma sozinha, com o mesmo evento, quando
  alguém volta.
- **Identidade por sala:** cada navegador gera um token por sala
  (`js/utils/identity.js`); a reconexão exige o mesmo token, não só o
  nome. O host guarda só o hash (SHA-256 próprio, que funciona também
  fora de HTTPS).
- **Troca de host:** os jogadores esperam o host voltar por até 10s
  (`CONFIG.JOGO.HOST_TIMEOUT`); depois, outro assume numa versão nova
  da sala (`-h1`, `-h2`...). O host antigo volta como jogador comum.
  A sala é encontrada em qualquer versão, inclusive pela tela inicial
  (`js/network/hostSearch.js`).
- **Opções do PeerJS num lugar só** (`CONFIG.PEER`).
- **Testes automatizados** no GitHub Actions: lógica
  (`tests/faseD.test.js`, 61 testes) e ponta a ponta com o jogo real no
  Chromium (`tests/e2e`, 10 cenários).

### Changed
- Saída da página (fechar aba, F5) encerra as conexões na hora, para os
  outros perceberem sem esperar o tempo limite da rede.
- Quem reconecta volta com o relógio contando e na situação certa da
  rodada (em andamento, encerrada, pausada ou entre duas duplas).
- Depois de uma troca de host, a rodada continua de onde parou (todos
  sabem quem já respondeu).
- F5 do host em qualquer momento da partida faz o que aconteceria sem o
  F5. A retomada saiu de `js/main.js` para
  `js/engine/sessionEngine.js` (`retomarPartidaAposRecarregar()`).
- "Voltar ao lobby" zera os jogadores e tira da lista quem estava
  desconectado.

### Fixed
- BUG-008 a BUG-018 (inclusive B1–B5 do checklist de conexão).

### Security
- **SEC-003:** o nome do host não pode mais ser tomado por quem entra.
- **SEC-004:** reconexão no lugar de um jogador desconectado exige o
  token de identidade dele.

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
- `_docs/ISSUES.md` reduzido de 477 para 47 linhas: as 12 entradas da migração
  inicial (Fases 0–7) foram resumidas e movidas para este arquivo
  (seção "Migração de Arquitetura" abaixo), preservando o histórico
  técnico completo. `_docs/ISSUES.md` passa a focar só em bugs atuais.
- `_docs/architecture.md`: tabela "Status da Migração" e checklist de limpeza
  (ambos 100% concluídos) resumidos para poucas linhas + pointer pra
  este changelog. NOTA-001 e NOTA-002 removidas (já resolvidas, sem
  pendência real a documentar).
- Sistema de venda de recursos reescrito como "Pedido de Ajuda"
  (Fase 9). Motivado por feedback do piloto: o botão "Vender Recurso"
  ficava sempre visível e virou distração paralela ao quiz. Agora só
  quem está com 0 recursos vê o botão; ao pedir, o host monta uma fila
  automática (jogadores ativos com recurso, do maior pro menor) e
  pergunta um de cada vez, avançando sozinho a cada recusa/timeout —
  sem escolha manual de quem vender/comprar. Matemática da troca
  inalterada; `domain/tradeRules.js` reaproveitado sem mudança.
  Mensagem amigável (nunca "fim de jogo") quando ninguém pode ajudar ou
  falta KPI pra pedir, explicando os caminhos alternativos (Perguntador,
  Assessor, evento de Reserva de Contingência). Arquivos: `tradeEngine.js`,
  `tradeModal.js`, `controlsComponent.js`, `setup.js`,
  `profileComponent.js`, `messageHandler.js`, `debugTools.js`,
  `locales/pt-BR.js`, `game.html`, `sessionEngine.js`.
- Documentação reorganizada em `_docs/`: `architecture.md`, `roadmap.md`
  (ex-`todo.md`) e `ISSUES.md` movidos pra lá; `README.md` e
  `CHANGELOG.md` continuam na raiz. Criado `_docs/conventions.md`
  (padrões de nomenclatura, arquitetura em camadas, pegadinha do
  host-autoritativo que já causou 3 bugs, stack técnica).
- **Feedback do piloto com alunos (roadmap.md, seção 9), Fases A-C:**
  - **Fase A:** botões reordenados (Nova Rodada primeiro, Encerrar
    Partida discreto e separado no fim — reduz clique acidental no
    mobile); URL sem `/index.html` (`location.href` trocado por `'./'`
    em 5 pontos); modal de resultado ganhou lembrete de avançar no
    tabuleiro físico ao acertar.
  - **Fase B:** card de perfil (avatar/KPI/recursos/fase única/
    progresso) e card de Fases consolidados num só, com status por
    fase (completa/em andamento/não iniciada) derivado de
    `player.phase`+`player.activities`, sem estado novo — reduz
    quantidade de cards pra rolar no celular.
  - **Fase C (economia de recursos):** recursos iniciais 20 → 10;
    **acertar nunca gasta recurso** (antes gastava igual a errar);
    errar continua gastando 1, protegido pela Reserva de Contingência;
    **removido o "pular vez por falta de recurso"** — todo jogador
    ativo sempre tenta responder, recurso só trava em 0 (nunca
    negativo). A decisão de gastar recurso moveu de `answerEngine.js`
    para dentro de `domain/kpiRules.js` (campo `gastaRecurso`, antes
    calculado e nunca lido). `engine/turnEngine.js` também perdeu o
    filtro por recurso na escolha do Respondedor, que senão continuaria
    barrando jogador zerado de ser sorteado. `README.md` atualizado
    (a seção "Venda de Recursos" ainda descrevia o mercado livre da
    Fase 9 anterior — nunca tinha sido corrigida).

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
  uma rodada em andamento. Ver `REGRESSÃO-003` em `_docs/ISSUES.md`.

---

## [Não datado] — Migração de Arquitetura (Fases 0–7)

### Changed
- Reestruturação completa do código: de um conjunto de arquivos monolíticos
  (`game-core.js`, `game-ui.js`, `game-network.js`, `game-state.js`) para uma
  arquitetura em camadas (`domain/`, `state/`, `engine/`, `network/`, `ui/`).
  Detalhes completos em `_docs/architecture.md`.
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