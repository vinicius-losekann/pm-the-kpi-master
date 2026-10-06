# Convenções — PM: The KPI Master

> Este documento descreve **como** o código é escrito neste projeto —
> padrões de nomenclatura, arquitetura e decisões de stack. Para o
> estado atual de cada arquivo, veja `architecture.md`. Para o
> histórico de por que certas decisões foram tomadas, veja
> `../CHANGELOG.md`.

## Stack técnica

- **Vanilla JavaScript**, sem framework (React, Vue, etc.) e sem bundler/build step. Todo arquivo `.js` é carregado via `<script>` simples em `game.html`/`index.html`, na ordem em que aparece — a ordem importa (um arquivo que usa `Game.domain.kpi` precisa ser carregado depois de `domain/kpiRules.js`).
- **Namespace global único**: `window.Game`, subdividido em `Game.domain`, `Game.state`, `Game.engine`, `Game.network`, `Game.ui`. Todo arquivo exporta pra dentro desse namespace no final (bloco `// EXPORTAÇÃO`).
- **PeerJS** para conexão P2P (WebRTC) — sem servidor próprio, usa o broker público gratuito do PeerJS só para sinalização inicial; depois disso a comunicação é direta entre os navegadores. Todo `new Peer(...)` recebe uma cópia de `CONFIG.PEER` (`config/game-config.js`) — é o único lugar para apontar outro servidor de sinalização.
- **CSS puro**, sem pré-processador, tema único "dark + glassmorphism" definido via custom properties em `:root` (`css/style.css`).
- **Testes automatizados no GitHub Actions** (desde a Fase D) — ver "Testes" abaixo. O que depende de rede real, celular ou outros navegadores continua manual (`testes-conexao.md`).

## Padrão de arquitetura: camadas

```
domain/   → regras puras (sem DOM, sem rede, sem Game.state). Recebem
            parâmetros, retornam resultado. Testáveis isoladamente.
state/    → Game.state é a fonte única da verdade. selectors.js lê,
            mutations.js escreve (ver exceção abaixo).
engine/   → orquestração: chama domain/, mexe em state, aciona
            network/ e ui/. Não tem regra de negócio própria.
network/  → tudo que fala PeerJS: enviar, receber, rotear mensagens,
            reconexão, migração de host.
ui/       → tudo que mexe no DOM: components/ (telas/elementos
            persistentes) e modals/ (overlays).
```

**Exceção conhecida, aceita:** o contrato original previa que só `mutations.js` escrevesse em `Game.state`, e que `domain/` retornasse deltas em vez de mutar. Isso não foi seguido à risca — `engine/*.js` escreve direto em `Game.state.players`, e algumas funções de `domain/` mutam o objeto recebido. Registrado como dívida arquitetural aceita (NOTA-005) — decisão de não corrigir, mantida mesmo depois de o projeto ganhar testes automatizados.

## Padrão de rede: host autoritativo

O **host é sempre a fonte da verdade**. Um guest nunca aplica uma mudança de estado por conta própria — ele manda uma mensagem `-request` pro host, o host valida e decide, e distribui o resultado via `broadcastAll()`.

**Pegadinha recorrente (já causou BUG-002, BUG-006 e BUG-007 — vale ler antes de mexer em qualquer fluxo de rede novo):** `Game.network.sendToPlayer()`/`broadcastAll()`, quando o destinatário é o próprio host, processam a mensagem **na hora, de forma síncrona** — não passam pela rede de verdade. Isso significa que a ordem de execução no host pode ficar diferente da ordem que um guest recebe (que é sempre sequencial, via rede). Ao adicionar um fluxo novo que envolve o host mandar algo pra si mesmo, sempre perguntar: "essa sequência de eventos faz sentido também quando roda tudo de uma vez, sem esperar a rede?"

Padrão de nomenclatura de mensagens: `<coisa>-request` (pedido) → `<coisa>` ou `<coisa>-offer` (o host processa e encaminha) → `<coisa>-response` (resposta de quem foi perguntado) → `<coisa>-confirmed` (resultado final, broadcast pra todos). Ver `engine/tradeEngine.js` (`help-request` → `help-offer` → `help-offer-response` → `help-confirmed`) como referência mais recente e mais limpa desse padrão.

### Mensagens de rede

| Mensagem | Quem envia | Campos / observação |
|---|---|---|
| `player-join` | guest → host | `playerName`, `peerId`, `token` (identidade por sala; o host guarda só o hash), `protocolVersion` (versão do formato das mensagens; sem o campo conta como 1). Montada só em `sendPlayerJoin()` (`network/peerService.js`) |
| `join-rejected` | host → quem tentou entrar | `reason`: `version-mismatch` (outra versão do jogo — conferida antes de tudo), `room-full`, `room-locked` (partida em andamento, nome novo), `name-taken`, `identity-mismatch` (token diferente do registrado) |
| `state-sync` | host → quem entra ou volta | `fullState` com os jogadores (`players`), a rodada (`currentRound`: `event`, `asker`, `answerer`, `question`, `answered`), os baralhos (`decks`), o relógio, `roundEnded`, `matchPaused`, `answeredThisRound` (quem já respondeu na rodada), `gameOver` e `finalRanking` (fim de jogo) |
| `round-start` | host → todos | `event`, `asker`, `answerer`, `answeredThisRound` |
| `question` | host → Perguntador e Respondedor | a pergunta; `isAsker` (com o gabarito `correct`) ou `isAnswerer` (sem o gabarito) |
| `answer` | Respondedor → host | `alternative`, `playerName` |
| `kpi-update` | host → todos | o jogador: `kpi`, `focusArea`, `activities`, `resources`; da resposta: `isCorrect`, `kpiGained`, `answeredThisRound`; do bônus de assessoria: `advisorBonus` |
| `player-list`, `match-ended` | host → todos | `players` (cada jogador com `kpi`, `resources`, `focusArea`, `activities`...) |
| `game-over` | host → todos | `ranking`: cada jogador com `position`, `finalKpi` (KPI + recursos × `FINAL_RESOURCE_VALUE`), `kpi`, `resources`, `focusArea` |
| `show-event` | host → todos | `event` (início de rodada nova) e `players` (os efeitos do evento mudam os recursos) |
| `round-ended` | host → todos | rodada encerrada, aguardando o "Nova Rodada" |
| `match-paused` | host → todos | faltam jogadores conectados; retoma sozinha quando alguém volta |
| `advisory-request` | Respondedor → host | `advisorName`, `requesterName`. A assessoria fica na rodada: `currentRound.advisory` (`advisorName`, `status` `pending`/`accepted`/`declined`, `suggestion`) |
| `advisory-started` / `advisory-question` | host → todos / host → assessor | `advisorName`, `requesterName` / a pergunta (sem o gabarito) |
| `advisory-answer` | assessor → host | `alternative`, `declined` |
| `advisory-result` | host → todos (ou só a quem pediu, se o pedido é inválido) | `advisorName`, `suggestion`, `declined`, `timeout`; pedido inválido: `invalid` e `reason` (`closing-focus-area`, `already-answered` ou nenhum) |
| `help-request` | quem pediu → host | `requesterName`. A fila fica só no host: `helpQueue` (`requesterName`, `candidates`, `index`) |
| `help-trying` / `help-offer` | host → quem pediu / host → candidato | `candidateName` / `requesterName` |
| `help-offer-response` | candidato → host | `candidateName`, `accepted` |
| `help-no-candidates` | host → quem pediu | `reason`: `insufficient-kpi`, `no-donors`, `all-declined` |
| `help-confirmed` | host → todos | `donor`, `requester`, `amount`, `donorKpi`, `donorResources`, `requesterKpi`, `requesterResources` |

Mensagem que chega sem um campo novo (de uma versão anterior do jogo) mantém o comportamento antigo.

**Versão do protocolo:** ao mudar o nome ou o formato de um campo de mensagem, aumentar `PROTOCOL_VERSION` (`network/peerService.js`). O host recusa quem entra com outra versão (`version-mismatch`), em vez de a partida travar quando, logo depois de um deploy, uns jogadores rodam o código novo e outros o antigo. Se o mesmo campo também é salvo no `localStorage`, aumentar junto o `STATE_VERSION`, com o passo de migração (`utils/persistence.js`).

## Testes

- `tests/logic/*.test.js`: lógica do jogo, um arquivo por assunto (entrada e identidade, queda e volta, troca de host, F5 do host, estado salvo, fim de partida, pedido de ajuda e assessoria, banco de perguntas, configuração e textos da tela). Carrega os arquivos reais em contextos isolados do Node, com rede, tela e `localStorage` simulados; o ambiente simulado e os ajudantes ficam em `tests/logic/environment.js`. Sem dependências: `node tests/logic/<arquivo>`. Teste novo entra no arquivo do assunto dele, com o próximo número da sequência (T1, T2...).
- `tests/browser/*.spec.js`: o jogo no navegador, com Playwright — o jogo real em janelas separadas do Chromium, com o site e um servidor PeerJS locais. As dependências do `package.json` são só destes testes; o jogo não usa nenhuma.
- Os dois rodam no GitHub Actions a cada push e pull request (`.github/workflows/testes.yml`); o resumo aparece na página da execução.
- Toda mudança de lógica vem com teste. A frente vai em dois commits: primeiro só os testes (os novos devem falhar no Actions), depois o código (tudo passa). Isso confirma que os testes novos de fato pegam o problema.
- Código novo de lógica fica onde o teste alcança (`engine/`, `network/`, `state/`, `utils/`); `main.js` só orquestra a inicialização.

## Nomenclatura

Os identificadores do código estão em inglês desde a Fase E do roadmap (concluída em 05/10/2026); os comentários continuam em português:

- **Chaves de schema de dados** (`data/questions.*.json` e os campos que viajam com uma pergunta pela rede): já estão em inglês desde a Fase 8 (`domains`, `name`, `focusAreas`, `questions`, `question`, `alternatives`, `correct`, `domain_key`); os IDs das áreas foco (valores de `focusAreas`, de `CONFIG.FOCUS_AREAS` e do `focusArea` do jogador), desde a E3d (`initiating`, `planning`, `executing`, `monitoringControlling`, `closing`). Motivo: precisam ser estáveis entre arquivos de idiomas diferentes (`questions.en-US.json` reusa as mesmas chaves, só traduz os valores).
- **Identificadores do código** (funções, variáveis, parâmetros, campos do estado e das mensagens, chaves do CONFIG e dos textos da tela, campos dos eventos, IDs e classes do HTML/CSS): em inglês, inclusive nos testes. **Código novo usa inglês e o glossário abaixo.**
- **Glossário** (português → inglês), para todo o código usar os mesmos nomes:

  | Português | Inglês |
  |---|---|
  | partida / rodada / sala / jogador | match / round / room / player |
  | Perguntador / Respondedor | asker / answerer |
  | assessoria / assessor / sugestão | advisory / advisor / suggestion |
  | pedido de ajuda / doador / quem pediu / fila / oferta | help request / donor / requester / queue / offer |
  | recursos / baralho / pergunta / alternativa | resources / deck / question / alternative |
  | evento / reserva de contingência | event / contingency reserve |
  | área foco (PMBOK 8; antes "fase") / atividades | focus area (`focusArea`) / activities |
  | sortear / acertou / KPI ganho | draw / isCorrect / kpiGained |
  | partida pausada / rodada encerrada / fim de jogo | paused / round ended / game over |
  | quem já respondeu na rodada (rodízio) | answeredThisRound |
  | relógio / prazo | clock / timeout |
  | troca de host / host antigo / backup | host migration / old host / backup |
  | token de identidade / estado salvo | identity token / saved state |
- **Comentários**: sempre em português. Explicam o que o código faz e por quê — sem fase, número de bug ou item do roadmap e sem a história do "antes era assim": isso fica no `roadmap.md`, no `ISSUES.md`, no `CHANGELOG.md` e no histórico do Git. Os títulos dos testes continuam com os números (T…, E…, BUG-…), que ligam o teste ao registro.
- **Tipos de mensagem de rede** (`msg.type`) e seus campos: em inglês, kebab-case para o tipo, com os sufixos do padrão acima (`match-paused`, `show-event`, `round-start`, `advisory-request`, `help-offer-response`); os valores de motivo (`reason`) também em inglês, kebab-case (`already-answered`, `no-donors`). Mudar o nome de um tipo ou campo exige aumentar `PROTOCOL_VERSION` (acima).
- **IDs de elemento HTML e classes CSS**: em inglês, com o glossário acima; camelCase pra IDs (`btnRequestHelp`, `modalHelpOffer`), kebab-case pra classes e atributos `data-*` (`.focus-area-item`, `.stat-chip`, `data-advisor-name`). O T91 confere que todo ID, seletor e `dataset` pedido pelo jogo e pelos testes no navegador existe no HTML e no CSS.
- **Nomes de arquivo `.js`**: camelCase (`profileComponent.js`, `tradeEngine.js`, `deckRules.js`).

## Convenção de commit

Conventional Commits, em português: `tipo(escopo opcional): descrição curta` — por exemplo `fix(rede): ...`, `feat(jogo): ...`, `test: ...`, `docs: ...`, `chore: ...` — com corpo explicando o quê e o porquê quando a mudança não é óbvia.