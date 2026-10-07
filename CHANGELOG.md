# Changelog

> **Contém:** as mudanças notáveis do projeto, em blocos por fase (o mais
> novo primeiro; o do topo fica aberto até a fase fechar), com as seções
> do [Keep a Changelog](https://keepachangelog.com/pt-BR/1.0.0/):
> `Added`, `Changed`, `Removed`, `Fixed`, `Security`, `Known issues`.
> **Não contém:** passo a passo técnico (→ `_docs/architecture.md`) nem a
> descrição completa dos bugs corrigidos a partir da Fase D (→
> `_docs/issues.md`); os da migração inicial (Fases 0–7) estão resumidos
> aqui. Blocos fechados não se reescrevem: os nomes citados neles são os
> da época.

---

## [Sem versão] — Em andamento (depois da Fase E)

### Added
- **Desempate do ranking:** com o mesmo KPI Final, fica à frente quem
  avançou mais nas áreas foco, depois quem tem mais atividades e, por
  fim, quem tem mais KPI acumulado; empate em tudo divide a posição e a
  medalha (🥇 🥇 🥉). A tela final avisa o critério quando há empate no
  KPI Final. Antes, valia a ordem da lista (o host primeiro). Testes
  T100–T102.
- **Simulador de partidas para balanceamento:** workflow "Simulação de
  partidas" (botão "Run workflow"), com robôs no lugar dos jogadores e as
  regras reais do jogo (`tests/simulation/`). Mostra duração, recursos,
  economia, eventos e justiça, e compara com uma troca do config
  ("cenário B"). Não muda o jogo publicado. Testes T93–T99.
- São 113 testes de lógica em 11 arquivos e 17 cenários no navegador.

### Changed
- **Estouro de orçamento:** o recurso pode ficar negativo. Errar com 0
  recursos deixa em −1 (e com −1, em −2), e o Corte de Orçamento também
  tira de quem tem 0. O KPI Final continua `KPI + recursos × 5`, então o
  negativo desconta. O card do jogador mostra o negativo em vermelho, com
  o rótulo "Estouro", e a lista de jogadores também em vermelho. Antes,
  com 0 recursos, errar e o corte não custavam nada. Testes T107–T110.
- **Documentação reorganizada:** cada documento abre com o que contém e
  o que não contém; os nomes dos arquivos passaram para o inglês
  (`_docs/connection-tests.md`, `_docs/issues.md`); os roteiros dos
  testes manuais saíram do checklist para `_docs/manual-test-scripts.md`;
  o README aponta para `_docs/architecture.md` em vez de repetir a
  árvore de arquivos; o roadmap ganhou a seção "Itens retirados" e as
  ideias 8.6 a 8.8.

### Fixed
- **Dois pedidos de ajuda ao mesmo tempo (BUG-024):** o segundo apagava o
  primeiro, e a doação aceita para o primeiro ia para o segundo. Agora é
  um pedido por vez: quem pede enquanto outro jogador está pedindo vê um
  aviso e tenta de novo depois, e a doação sempre vai para quem a oferta
  foi feita. A versão das mensagens entre os jogadores (protocolo) passou
  da 6 para a 7: quem estiver com a página antiga aberta é recusado ao
  entrar na sala e vê o aviso para recarregar. Testes T103–T106.
- **Detalhe do ranking final (NOTA-008):** o KPI acumulado de cada
  jogador é descrito como "acertos, ajudas e assessorias"; antes citava
  vendas e compras, do mercado de recursos que não existe mais.

---

## [Sem versão] - 2026-10-05 — Fase E: identificadores do código em inglês

Os nomes do código passaram para o inglês: funções, variáveis, campos do
estado e das mensagens, chaves de configuração e dos textos, IDs e classes
do HTML/CSS. Todos seguem o glossário de `_docs/conventions.md`. Os
comentários continuam em português. **Para quem joga, nada muda na tela:**
textos, regras e prazos são os mesmos.

**Atualização no meio de uma partida:** o estado salvo no navegador passou
da versão 1 para a 6, e a versão das mensagens entre os jogadores
(protocolo) também passou da 1 para a 6. Uma partida salva antes da
atualização é convertida quando a página é recarregada. Quem ainda estiver
com a página antiga aberta é recusado ao entrar na sala e vê um aviso para
recarregar a página.

Os nomes citados nas entradas anteriores deste arquivo (ex.: `CONFIG.JOGO`,
`retomarPartidaAposRecarregar()`) são os de antes da tradução.

### Added
- **Versão do jogo na entrada da sala:** quem entra com outra versão é
  recusado (`version-mismatch`) e recebe o aviso para recarregar a página.
  Antes, a partida travava sem aviso quando, logo depois de uma atualização
  do site, uns jogadores rodavam o código novo e outros o antigo.
- **Conversão do estado salvo** das versões 1 a 5 para a 6
  (`js/utils/persistence.js`), um passo por versão.
- **Testes T76–T91:** são 94 testes de lógica em 9 arquivos e 17 cenários
  no navegador.

### Changed
| Etapa | O que mudou | Estado salvo | Protocolo |
|---|---|---|---|
| E1 | Funções, parâmetros e variáveis em todo o `js/` e nos testes (ex.: `sortearPergunta` → `drawQuestion`; "fase" → `focusArea`) | — | — |
| E2a | Versão do protocolo na entrada da sala | — | 1 |
| E2b | Rodada e partida (`answeredThisRound`, `roundEnded`, `matchPaused`, `finalRanking`, `decks`, `asker`/`answerer`) | 2 | 2 |
| E2c | Jogador e ranking (`resources`, `focusArea`, `position`, `finalKpi`) | 3 | 3 |
| E2d | Assessoria e pedido de ajuda (`advisory`, `helpQueue`, mensagens `advisory-*`/`help-*`, motivos de recusa) | 4 | 4 |
| E3a | Chaves do CONFIG (`GAME`, `FOCUS_AREAS`, `STARTING_RESOURCES`, `KPI.*`); a oferta do pedido de ajuda ganhou prazo próprio (`HELP_OFFER_TIMEOUT`), com os mesmos 20s | — | — |
| E3b | Chaves e marcadores dos textos da tela (`js/locales/pt-BR.js`) | — | — |
| E3c | Campos dos eventos (`data/events.json`: `events`, `title`, `description`, efeitos) | 5 | 5 |
| E3d | Áreas foco: `focusAreas` no JSON das perguntas e IDs `initiating`, `planning`, `executing`, `monitoringControlling`, `closing` (o nome na tela não muda) | 6 | 6 |
| E4 | IDs do `game.html`, classes do `style.css` e atributos `data-*` | — | — |

### Removed
- Regras do `css/style.css` que nenhuma tela usava, encontradas na E4
  (NOTA-006 em `_docs/issues.md`). Não tinham efeito para quem joga. O
  T92 (95 testes de lógica a partir daqui) confere que o CSS não volta a
  ter regra sem uso.

---

## [Sem versão] - 2026-10-03 — Fase D: conexão, identidade e troca de host (em fechamento)

Detalhes de cada bug corrigido (sintoma, causa e testes) em
`_docs/issues.md`; mapa de casos cobertos e testes manuais pendentes em
`_docs/connection-tests.md`.

**Pendente para fechar a fase:** os testes manuais P1 que não dão para
automatizar — M9 (redes diferentes), M7 (queda de rede real) e M8
(celular com tela bloqueada). Os roteiros estão em
`_docs/manual-test-scripts.md`.

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
- **Versão no estado salvo:** o estado guardado no navegador tem um
  número de versão e passa por migração antes de ser restaurado
  (`js/utils/persistence.js`) — pré-requisito da Fase E.
- **Fim de jogo guardado:** um F5 na tela final volta ao mesmo ranking;
  quem cai no fim de jogo pode voltar à sala e vê o ranking.
- **Testes automatizados** no GitHub Actions, a cada push: lógica do
  jogo com rede simulada (`tests/logic`, 78 testes em 8 arquivos por
  assunto) e o jogo real em várias janelas do Chromium
  (`tests/browser`, 17 cenários).
- **Roteiros dos testes manuais P1** (M9, M7, M8), hoje em
  `_docs/manual-test-scripts.md`.

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
- Quem assume como host usa a mesma contagem do relógio do início da
  partida; saiu o aviso de troca de host que não chegava a ninguém.
- Quem caiu fica fora do pedido de ajuda e não pode ser chamado como
  assessor.
- Mais espaço entre o lembrete do tabuleiro e o botão OK.
- Na tela, "Fases" virou **"Áreas Foco"** (nomenclatura do PMBOK 8 para os
  antigos grupos de processos), inclusive no aviso de assessoria da Área
  Foco Encerramento.
- **Banco de perguntas revisado pelo professor:** 5 perguntas retiradas,
  correções de texto nos enunciados e alternativas marcados (sem termos
  em inglês entre parênteses, "Segundo o PMBOK", "Áreas Foco") e
  gabarito redistribuído entre a, b, c e d (antes quase tudo era "b").
  São 71 perguntas, conferidas por teste (formato e equilíbrio do
  gabarito). As perguntas marcadas para substituir ficam para o
  professor.
- Testes reorganizados por assunto (`tests/logic`, `tests/browser`),
  com nomes de arquivos e funções em inglês.
- Limpeza: prazos (resposta, assessoria, pedido de ajuda) cancelados
  num lugar só; removidos código sem uso e `js/dev/debugTools.js`
  (tinha uma cópia própria das regras — um simulador de balanceamento
  com as regras reais está no roadmap, 7.9); comentários do código
  explicam só o funcionamento (fase, bug e roadmap ficam nos
  documentos).

### Fixed
- BUG-008 a BUG-018 (inclusive B1–B5 do checklist de conexão).
- BUG-019: F5 do host com um pedido de assessoria sem resposta travava
  a rodada.
- BUG-020: depois do F5, o host fora da dupla via a área da pergunta;
  etiquetas de domínio e área vazias.
- BUG-021: F5 na tela de fim de jogo recomeçava a partida (host) ou
  recusava o jogador (guest).
- BUG-022: pedido de ajuda e assessoria esperavam 20s por quem tinha
  caído.
- BUG-023: nome com "&" aparecia como "&amp;" no aviso de ajuda.

### Known issues
- As respostas das perguntas não são secretas: o arquivo
  `data/questions.pt-BR.json` é público no site e o baralho vai com o
  gabarito a quem reconecta. Ocultar está no roadmap (4.4); por ora,
  vale a regra da aula.

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
- Documentação técnica reunida em `_docs/` (`architecture.md`,
  `conventions.md`, `roadmap.md`, `issues.md`); `README.md` e
  `CHANGELOG.md` continuam na raiz.
- **Feedback do piloto com alunos, Fases A-C:**
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
  uma rodada em andamento. Ver `REGRESSÃO-003` em `_docs/issues.md`.

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