# 🐛 Issues Conhecidas — Migração de Arquitetura

Registro de bugs identificados durante a migração que **não são corrigidos
imediatamente** para não misturar "mover código" com "mudar comportamento".
Cada issue tem uma fase prevista de correção.

---

## BUG-001: Pergunta trocada ao dar F5 no host durante rodada ativa

- **Status:** ✅ Corrigido na Fase 3 (engine/turnEngine.js + js/main.js)
- **Detectado em:** Fase 0 (teste manual de restauração de estado)
- **Local:** `js/main.js` → `resumeGameEngineIfHost()`
- **Sintoma:**
  - Ao recarregar (F5) a página do **host** durante uma partida em andamento,
    a pergunta/rodada atual é substituída por uma nova, em vez de manter a
    rodada que estava em curso.
  - Possível efeito colateral no lado do **guest** (parece mudar de sessão) —
    ainda não confirmado, depende da análise de `game-network.js` (Fase 4).
- **Causa raiz:**
  ```js
  if (!state.currentRound) {
      Game.core.pickNewPair();
  } else {
      state.currentRound = null;
      Game.core.pickNewPair();   // ⚠️ os dois ramos sempre chamam pickNewPair()
  }
  ```
  O `if/else` não tem efeito prático: os dois caminhos sempre sorteiam um
  novo par (Perguntador/Respondedor) e uma nova pergunta, mesmo quando já
  existia uma rodada em curso que deveria ser preservada.
- **Correção aplicada:** em `js/main.js` → `resumeGameEngineIfHost()`, o ramo
  `else` (quando já existe `state.currentRound`) agora **reexibe a rodada
  existente** em vez de descartá-la e sortear uma nova:
  ```js
  } else {
      Game.ui.displayRoundStart();
      if (state.currentRound.pergunta) {
          Game.ui.displayQuestion(state.currentRound.pergunta);
      }
      Game.core.armarRespostaTimeout(state.currentRound.respondedor);
  }
  ```
  Esse é exatamente o padrão que já funcionava corretamente em
  `becomeHost()` (`js/game-network.js`), usado como referência.
- **Ainda a confirmar:** o efeito colateral relatado no lado do guest
  ("parece mudar de sessão") — deve ser reavaliado em teste manual agora
  que a causa raiz do lado do host foi corrigida. Se persistir após os
  testes desta fase, abrir uma nova issue com os detalhes.
- **Confirmado como pré-existente:** sim — diff entre `game-main.js` (original)
  e `js/main.js` (migrado na Fase 0) mostra que a única mudança foi a injeção
  de `Game.bus`; a função `resumeGameEngineIfHost()` é idêntica.

---

## BUG-002: Guest vira host indevidamente após F5 no host

- **Status:** ✅ Corrigido na Fase 4 (`js/network/hostMigration.js`)
- **Detectado em:** Fase 3 (teste manual de F5 no host, após corrigir o BUG-001)
- **Local:** `js/game-network.js` → `handleHostDisconnect()` / `attemptReconnectToNewHost()`
- **Sintoma:**
  - Após dar F5 no host, o host volta e mostra a mesma rodada corretamente
    (BUG-001 corrigido), mas **o guest não recebe mais atualizações** (ex:
    quando o host responde uma pergunta, o guest não vê o resultado).
  - Depois de um tempo, **o guest (backup) assume como novo host**, mesmo
    o host original continuando ativo e funcional.
- **Causa raiz:**
  1. No F5, `initPeer()` cria uma **nova instância** de `Peer`, mas reaproveita
     o **mesmo `hostPeerId`** (reload simples não é migração de host).
  2. A `DataConnection` que o guest tinha com a instância *antiga* do `Peer`
     do host morre (o objeto antigo foi destruído).
  3. O guest recebe o fechamento da conexão e chama `handleHostDisconnect()`,
     que **sempre assume migração de host** — tenta reconectar em
     `computeHostPeerId(baseRoomPeerId, hostVersion + 1)`, um ID com a
     versão incrementada (ex: `sala-h1`).
  4. Só que o host não mudou de versão no F5 — continua no ID original.
     O guest fica tentando um ID que não existe, esgota as tentativas em
     `attemptReconnectToNewHost()` e, se for o backup, **assume como novo
     host de verdade** via `becomeHost()`.
  - Em resumo: falta um caminho de **"tentar reconectar no mesmo host de
    sempre"** antes de presumir que houve migração de host.
- **Correção aplicada:** adicionada a função `attemptReconnectToSameHost()`,
  chamada **antes** de qualquer lógica de migração. Ela tenta reconectar ao
  host na **versão atual** (mesmo ID) por até 3 tentativas. Só se todas
  falharem é que o fluxo cai em `decideHostTakeoverOrReconnectNewVersion()`
  (a lógica original de decidir se este jogador vira host ou procura uma
  versão incrementada do ID).
  ```
  handleHostDisconnect()
    └─▶ attemptReconnectToSameHost()          [NOVO — tenta o host de sempre]
          └─▶ (falhou 3x) retryReconnectSameHostOrMigrate()
                └─▶ decideHostTakeoverOrReconnectNewVersion()  [fluxo original]
                      ├─▶ becomeHost()                    (se for o backup)
                      └─▶ attemptReconnectToNewHost()      (senão)
  ```
- **Validado em:** teste manual de F5 no host com 1 guest conectado — a
  descrever pelo usuário no teste desta fase.
- **Confirmado como pré-existente:** sim — `game-network.js` está idêntico
  ao arquivo original enviado; nenhuma mudança da migração o afetou até agora.

---

## BUG-003: Card de perfil do host não reflete o progresso real após F5

- **Status:** ✅ Corrigido na Fase 5 (`ui/components/profileComponent.js`)
- **Detectado em:** Fase 4 (teste manual de F5 no host, após corrigir BUG-001 e BUG-002)
- **Local:** `js/main.js` → `resumeGameEngineIfHost()`
- **Sintoma:**
  - Depois do F5 no host durante uma partida em andamento, a rodada é
    restaurada corretamente (BUG-001) e o guest permanece conectado
    (BUG-002), mas o **card de perfil do próprio host** (KPI, fase e
    atividades) volta exibindo valores desatualizados — ex: atividades
    mostrando `0/2` quando na verdade já estavam em `1/2` antes do reload.
  - Os dados em si **não se perdem** (`Game.state.players` e o objeto `me`
    são restaurados corretamente por `tryRestoreState()`), o problema é
    puramente de **exibição**: os elementos do DOM (`myKPI`, `myPhaseName`,
    `myPhaseIcon`, `myActivity`, `myProgressFill`) nunca são atualizados
    de volta com os valores restaurados.
- **Causa raiz:**
  A lógica de "atualizar o card de perfil na tela" está duplicada em pelo
  menos 3 lugares diferentes do código (cada um atualiza os mesmos 5
  elementos do DOM manualmente):
  - `js/engine/sessionEngine.js` → `startGame()` (zera tudo no início da partida)
  - `js/engine/answerEngine.js` → `updatePlayerKPI()` (atualiza após responder)
  - `js/network/messageHandler.js` → `restoreState()` (atualiza o lado do **guest** após reconectar)
  - `js/main.js` → `resumeGameEngineIfHost()` — **este é o único que NÃO
    atualiza o card**, por isso o bug só aparece do lado do host.
- **Correção aplicada:** criada `Game.ui.renderProfileCard(player)` em
  `ui/components/profileComponent.js`. Os 4 pontos que atualizavam o card
  manualmente agora chamam essa função: `sessionEngine.startGame()`,
  `answerEngine.updatePlayerKPI()`, `messageHandler.restoreState()`
  (guest) e — o que realmente corrige o bug — `main.js` →
  `resumeGameEngineIfHost()` (host), que antes nunca atualizava o card.
- **Confirmado como pré-existente:** provável — a função `resumeGameEngineIfHost()`
  já não atualizava esses elementos antes da nossa migração; não foi algo
  introduzido pelas Fases 0–4.

---

## REGRESSÃO-001 (encontrada e corrigida antes de causar bug visível): `Game.core.resetAllBaralhos` ausente após a Fase 3

- **Status:** ✅ Corrigido na Fase 5, antes de qualquer impacto ao usuário
- **Detectado em:** Fase 5, ao conferir cruzadamente todas as chamadas
  `Game.core.*` de `game-ui.js` contra os exports atuais dos engines
- **Local:** `js/engine/sessionEngine.js`
- **O que aconteceu:** na Fase 3, ao extrair `game-core.js` para os 5
  arquivos de `engine/`, o wrapper `resetAllBaralhos()` (que delega para
  `domain/deckRules.js`) foi **esquecido** — não foi recriado nem exportado
  em nenhum engine. Isso não gerou nenhum erro visível até agora porque
  `game-ui.js` (o único consumidor, no botão "voltar ao lobby" da tela de
  fim de jogo) só foi carregado nesta Fase 5.
- **Correção aplicada:** função `resetAllBaralhos()` recriada em
  `sessionEngine.js` e exportada via `Game.engine.session` / `Game.core`.
  Também usada internamente por `endMatch()` e `handleMatchEnded()` no
  lugar da chamada duplicada a `Game.domain.deck.resetAllBaralhos(...)`.
- **Lição para as próximas fases:** ao final de cada fase, fazer uma
  checagem cruzada entre todas as chamadas `Game.X.*` do arquivo ainda não
  migrado contra os exports do que já foi migrado — é assim que este gap
  foi pego antes de virar um bug real.

---

## REGRESSÃO-002 (encontrada e corrigida antes de causar bug visível): `Game.core.sortearPergunta`/`sortearEvento`/`aplicarEfeitosEvento` ausentes após a Fase 3

- **Status:** ✅ Corrigido na Fase 7, antes de qualquer impacto ao usuário
- **Detectado em:** Fase 7, ao migrar `js/game-debug.js` para `js/dev/debugTools.js`
- **Local:** `js/dev/debugTools.js` (4 ocorrências: `testSortear`, `testKPI`,
  `simularPartidaCompleta` ×2)
- **O que aconteceu:** exatamente o mesmo padrão da REGRESSÃO-001. Na Fase 3,
  ao extrair `game-core.js` para os 5 arquivos de `engine/`, os wrappers
  `sortearPergunta()`, `sortearEvento()` e `aplicarEfeitosEvento()` (que
  delegavam para `domain/deckRules.js` e `domain/eventRules.js`) foram
  **inlinados diretamente em `turnEngine.js`** em vez de recriados como
  `Game.core.X()`. Isso é correto para o próprio `turnEngine.js`, mas
  quebrou silenciosamente qualquer outro consumidor externo desses nomes —
  e `game-debug.js` era o único. Como as ferramentas de debug só foram
  migradas agora (Fase 7), o gap não tinha aparecido antes.
- **Correção aplicada:** as 4 chamadas em `debugTools.js` agora chamam
  `Game.domain.deck.sortearPergunta(baralhos, questionsData, fase)` e
  `Game.domain.event.sortearEvento(eventos)` /
  `Game.domain.event.aplicarEfeitosEvento(evento, jogadores)` diretamente,
  em vez de depender de wrappers em `Game.core` que não existem mais.
- **Lição reforçada:** a checagem cruzada de chamadas `Game.X.*` contra os
  exports atuais (introduzida depois da REGRESSÃO-001) continua valendo a
  pena — encontrou um segundo caso do mesmo tipo de gap.

---

## SEC-001: XSS armazenado via nome de jogador

- **Status:** ✅ Corrigido
- **Detectado em:** revisão de segurança solicitada pelo usuário, fora do fluxo normal de migração
- **Local:** `js/entry/roomEntry.js` (validação de entrada) + 8 pontos em `js/ui/components/lobbyComponent.js`, `rankingComponent.js`, `js/ui/modals/advisoryModal.js`, `tradeModal.js` (renderização)
- **Sintoma:** o campo de nome de jogador só valida **tamanho** (3–20
  caracteres) — sem restrição de caracteres. Esse nome é interpolado
  direto em `innerHTML` em pelo menos 8 lugares (lista de jogadores do
  lobby, ranking online, ranking parcial, ranking final, seleção de
  assessor, lista de compradores, texto de oferta de venda). Um jogador
  poderia se cadastrar com um nome como `<svg/onload=alert(1)>` (cabe
  nos 20 caracteres) e executar JavaScript na tela de outros jogadores
  conectados na mesma sala.
- **Agravante encontrado durante a correção:** em 2 desses pontos
  (seleção de assessor e seleção de comprador), o nome também era
  interpolado dentro de um atributo `onclick="...('${nome}')"`. Nesse
  caso, **escapar entidades HTML não é suficiente** — o navegador
  decodifica as entidades do atributo antes de executar o JavaScript do
  `onclick`, reintroduzindo a aspas simples e permitindo quebrar para
  fora da string e injetar código arbitrário mesmo com o nome escapado.
- **Correção aplicada:**
  1. Criado `js/utils/sanitize.js` com `Game.sanitize.escapeHtml(str)`,
     aplicado nos 8 pontos de renderização que usam `innerHTML` com
     nome de jogador.
  2. Nos 2 pontos com `onclick` inline (`advisoryModal.js` e
     `tradeModal.js`), trocado por `data-*` attribute +
     `addEventListener` — elimina completamente o problema de
     contexto duplo (HTML + JS), em vez de tentar escapar para os dois
     contextos ao mesmo tempo.
  3. Pontos que já usavam `.textContent` (não `.innerHTML`) foram
     conferidos e confirmados como já seguros por natureza — não
     precisaram de alteração.
- **Não corrigido (fora do escopo, risco menor):**
  `advisoryModal.js` → `showAssessoriaQuestionModal()` ainda tem
  `onclick="Game.ui.responderAssessoria('${letra}', false)"`, onde
  `letra` vem do conteúdo da pergunta (`msg.alternativas`, dado enviado
  pelo host via rede) — não é nome de jogador digitado livremente.
  Mesma classe de problema, mas superfície de ataque menor (o host já
  tem controle amplo sobre a partida nessa arquitetura P2P). Registrar
  como item de backlog se decidirem endurecer esse ponto também.

---

## SEC-002: Falsificação de identidade em mensagens de rede

- **Status:** ✅ Corrigido
- **Detectado em:** mesma revisão de segurança do SEC-001
- **Local:** `js/network/messageHandler.js`
- **Sintoma:** o host processava várias mensagens confiando cegamente
  no campo de nome informado na própria mensagem (`msg.playerName`,
  `msg.requesterName`, `msg.vendedorName`, `msg.compradorName`), sem
  verificar se o peer que **de fato enviou** a mensagem (`fromPeerId`)
  correspondia àquele jogador. Qualquer guest conectado podia enviar
  uma mensagem alegando ser outro jogador. Vetores confirmados:
  - `answer` — responder a pergunta no lugar de outro jogador, roubando a vez dele
  - `leave-match-request` — expulsar qualquer jogador da partida
  - `assessoria-request` — pedir assessoria fingindo ser o respondedor da rodada
  - `assessoria-answer` — responder a assessoria no lugar do assessor designado
  - `venda-offer-request` — iniciar uma venda em nome de outro jogador
  - `venda-offer-response` — aceitar/recusar uma oferta de compra em nome de outro jogador
- **Correção aplicada:** criada `isSenderVerified(claimedName, fromPeerId)`
  em `messageHandler.js`, que confirma que `Game.getPlayerByName(claimedName).peerId === fromPeerId`
  antes de despachar a ação. Aplicada nos 6 `case`s listados acima, no
  ponto de despacho da mensagem — sem precisar alterar a assinatura de
  nenhuma função dos 4 arquivos de `engine/` que processam essas ações.
  Mensagens rejeitadas geram um `console.warn` no host, mas não
  quebram a sessão (a mensagem é simplesmente ignorada).
- **Não afetado:** as chamadas em que o próprio host aciona a função
  diretamente para si mesmo (ex: `tradeEngine.venderRecurso()` quando
  quem vende é o próprio host) não passam por `handleMessage()` — não
  precisam de `fromPeerId` porque não vêm da rede.
- **Testado:** simulação isolada da função `isSenderVerified` confirmando
  que um peer tentando agir como outro jogador é rejeitado, e o
  jogador legítimo continua funcionando normalmente.

---

## BUG-004/BUG-005: Modal de evento reaparecendo a cada pergunta + rodada avançando sozinha

- **Status:** ✅ Corrigido (correção definitiva — a primeira tentativa, registrada aqui como BUG-004, foi incompleta)
- **Detectado em:** revisão de arquitetura solicitada pelo usuário, em duas rodadas de feedback
- **Local:** `js/engine/turnEngine.js` (`pickNewPair()`, `nextTurn()`, `startNewRound()`) + `js/ui/components/controlsComponent.js` (botão "Nova Rodada")

### Sintoma 1 (BUG-004, correção incompleta na 1ª tentativa)
Dentro do mesmo ciclo de rodada, cada nova pergunta sorteava um evento
novo, quando o esperado é o evento persistir durante toda a rodada.

**Causa raiz:** `nextTurn()` chamava `pickNewPair()` sem argumento, e
`pickNewPair(evento = null, ...)` sorteia um evento novo sempre que não
recebe um.

**Primeira correção (insuficiente):** fazer `nextTurn()` passar
`state.currentRound?.evento` para `pickNewPair()`. Isso parou de
**sortear** um evento novo, mas **não parou o modal de reaparecer** —
a condição que decidia mostrar o modal (`depth > 0`) não tinha nenhuma
relação com "esse evento já foi mostrado". Reportado de volta pelo
usuário como ainda incorreto.

### Sintoma 2 (design corrigido a pedido do usuário)
Além do modal reaparecendo, o fluxo esperado é diferente do que o
código fazia: o evento deve aparecer **só no início de uma rodada**, e
quando todos os jogadores da rodada vigente respondem, o jogo **não**
deve iniciar a próxima rodada sozinho — o host precisa clicar
explicitamente em "Nova Rodada" para então sortear e mostrar o
próximo evento.

### Correção definitiva aplicada
1. `pickNewPair(evento, depth, mostrarModal = true)` ganhou um terceiro
   parâmetro explícito para controlar a exibição do modal, substituindo
   a checagem por `depth`. `startNewRound()` chama com o padrão (`true`);
   `nextTurn()` chama explicitamente com `false`; a recursão interna de
   retry também propaga `false`.
2. `startNewRound()` agora reseta `state.usedRespondedorThisRound = []`
   defensivamente logo no início, independente de quem a chamou.
3. `nextTurn()` não chama mais `startNewRound()` automaticamente ao
   detectar que o ciclo terminou — apenas loga e retorna, deixando o
   jogo parado aguardando o host.
4. O botão "Nova Rodada" (`controlsComponent.js`) passou a chamar
   `Game.core.startNewRound()` diretamente, em vez de
   `Game.core.nextTurn()` — é ele quem de fato inicia uma rodada nova
   (sorteia evento, mostra modal, reseta o rodízio).

**Nota de design:** com essa mudança, o botão "Nova Rodada" pode ser
clicado pelo host a qualquer momento, inclusive no meio de um ciclo em
andamento — nesse caso ele força o início de uma rodada nova
(descartando o ciclo vigente). Isso não foi explicitamente pedido nem
proibido; se for indesejado, uma melhoria futura seria desabilitar o
botão até o ciclo atual realmente terminar.

**Atualização:** implementado exatamente isso. `state/selectors.js`
ganhou `isCycleComplete(activePlayers, usedRespondedorThisRound)` —
verifica se TODOS os jogadores ativos já responderam nesta rodada, sem
número fixo (funciona com 2, 6 ou qualquer quantidade dentro do limite
configurado). `controlsComponent.js` ganhou `refreshNovaRodadaButton()`,
que usa esse selector para habilitar/desabilitar o botão, chamada em 4
pontos: início de rodada (desabilita), a cada par escolhido dentro do
ciclo (reavalia), quando o ciclo fecha em `nextTurn()` (habilita), e ao
restaurar sessão via F5 ou assumir como host (`main.js`/`setup.js`,
recalcula do zero). Testado com simulação de 5 jogadores confirmando
que o botão só habilita depois que o último responde.

**Confirmado como pré-existente (a causa raiz original):** sim — o
comportamento de sortear evento a cada pergunta já vinha do
`game-core.js` original; foi preservado fielmente nas Fases 1 e 3 da
migração. O comportamento de "avançar rodada sozinho" também era do
código original — a exigência de que isso vire uma ação manual do host
foi uma mudança de design pedida agora, não a restauração de um
comportamento anterior.

**Testado:** simulação isolada da sequência completa (partida inicia →
3 jogadores respondem em sequência → ciclo completo → host clica em
"Nova Rodada") confirmando exatamente 2 exibições do modal (início da
partida + clique manual) e nenhum avanço automático de rodada.

---

## BUG-006: Tela do host não atualizava quando ele era Perguntador, Respondedor ou Espectador

- **Status:** ✅ Corrigido
- **Detectado em:** relatado pelo usuário ("a atualização da tela do
  host, seja quando é perguntador, ou assessor, nada atualiza")
- **Local:** `js/engine/turnEngine.js` → `pickNewPair()`
- **Causa raiz:** `sendToPlayer(peerId, data)` (`peerService.js`), ao
  detectar que o destinatário é o **próprio host**
  (`peerId === state.peerId && state.isHost`), processa a mensagem
  **na hora, de forma síncrona** — sem passar pela rede. Já para os
  guests, a mesma sequência de mensagens (`round-start` depois
  `question`) chega pela rede **em ordem**, com atraso real entre elas.

  `pickNewPair()` enviava a mensagem `question` (via `sendToPlayer`)
  **antes** de chamar `Game.ui.displayRoundStart()`. Para os guests
  isso não importa (a ordem de chegada pela rede já é a correta). Mas
  para o host, como o auto-envio é imediato, a sequência de execução
  ficava invertida: `displayQuestion()` rodava primeiro (configurando
  corretamente a pergunta, incluindo a área de assessoria quando
  elegível), e **`displayRoundStart()` rodava depois, sobrescrevendo**
  o que acabara de ser configurado — em especial, resetando
  `assessoriaArea` de volta para escondida.

  Um segundo bug relacionado: quando o host era **espectador** (nem
  perguntador, nem respondedor), o código chamava
  `Game.ui.displaySpectatorView()` e, logo em seguida,
  **incondicionalmente** chamava `Game.ui.displayRoundStart()` — que
  reexibia a área de pergunta (vazia, já que nenhuma mensagem de
  pergunta foi enviada ao host nesse caso) e escondia de volta a área
  de espectador.
- **Correção aplicada:** invertida a ordem em `pickNewPair()` — a
  montagem da tela do host (`displayRoundStart()` ou
  `displaySpectatorView()`, dependendo do papel) agora acontece
  **antes** do envio das mensagens de pergunta, replicando a ordem que
  os guests já recebem naturalmente pela rede. `displaySpectatorView()`
  e `displayRoundStart()` viraram um `if/else` mutuamente exclusivo,
  em vez de o segundo rodar sempre incondicionalmente.
- **Testado:** simulação isolada dos 3 papéis do host (perguntador,
  respondedor, espectador) confirmando que a função certa é sempre a
  última a rodar, com o resultado final correto em todos os casos.

---

## BUG-007: Ranking do host não atualizava quando um guest respondia

- **Status:** ✅ Corrigido
- **Detectado em:** revisão de arquitetura solicitada pelo usuário
- **Local:** `js/engine/answerEngine.js` → `handleAnswer()`
- **Sintoma:**
  - Quando um **guest** respondia a pergunta (ou recebia bônus de assessoria),
    os dados internos do host ficavam corretos, mas o **ranking exibido na
    tela do host** nunca era redesenhado.
- **Causa raiz:** `Game.network.broadcastAll()` não reenvia a mensagem de
  volta para o próprio remetente. `updatePlayerKPI()` só rodava localmente
  quando o **host** era quem tinha respondido
  (`if (state.isHost && respondedorName === state.playerName)`) — não havia
  nenhum caminho que atualizasse a tela do host quando o respondedor (ou o
  assessor bonificado) era outra pessoa.
- **Correção aplicada:** adicionada uma chamada incondicional a
  `Game.ui.updatePlayersOnlineList()` + `Game.ui.updateRankingList()` no fim
  de `handleAnswer()`, executada sempre que `state.isHost` é verdadeiro —
  cobrindo tanto o caso do respondedor quanto o do bônus de assessoria,
  independente de quem seja o jogador que gerou a atualização.

---

## ESCLARECIMENTO-001 (não é bug): "+10 KPI" na modal, mas só "+5" no ranking

- **Status:** ✅ Investigado, confirmado como comportamento intencional
- **Relatado pelo usuário como:** "O KPI do respondedor não está somando
  certo, está somando com a pontuação do assessor (5 kpi), deveria
  somar com o kpi do respondedor (10 kpi)"
- **Investigação:** confirmado que `CONFIG.KPI.ACERTO_BASE = 10` e
  `ASSESSORIA_ACERTO = 5` estão corretos e não trocados. O cálculo em
  `domain/kpiRules.js` e `engine/answerEngine.js` está correto — o
  respondedor realmente ganha +10 KPI bruto por acerto, sem misturar
  com o valor do assessor. Confirmado com o usuário que **nenhuma
  assessoria estava envolvida** na rodada relatada, e que a modal de
  resultado mostrava corretamente "+10 KPI" — só o **ranking** (barra
  lateral) refletia apenas +5.
- **Explicação (não é bug):** toda resposta gasta 1 recurso para
  participar (`respondedor.recursos--`, exceto no evento "Reserva de
  Contingência"). O ranking não usa o KPI acumulado puro — usa
  `kpiFinal = kpi + (recursos × CONFIG.KPI.VALOR_RECURSO_FINAL)`
  (`domain/rankingRules.js`). Como `VALOR_RECURSO_FINAL = 5`, gastar 1
  recurso para responder tira 5 pontos do `kpiFinal`, mesmo enquanto o
  `kpi` bruto sobe 10 — resultado líquido no ranking: **+5**. A modal
  de resultado mostra o ganho bruto (+10); o ranking mostra o efeito
  líquido (+5) considerando o custo do recurso gasto. Ambos estão
  corretos, são métricas diferentes.
- **Decisão do usuário:** manter como está — é uma regra intencional
  de equilíbrio entre acumular KPI e gerir recursos.

---

## Como usar este arquivo

- Ao encontrar um bug durante os testes de qualquer fase, adicione uma entrada
  aqui **antes de decidir se corrige na hora ou depois**.
- Sempre registre: status, local no código, sintoma, causa raiz (se souber) e
  fase prevista de correção.
- Ao corrigir, mude o status para `✅ Corrigido` e anote a fase/data em que
  foi resolvido.