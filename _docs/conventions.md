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

Padrão de nomenclatura de mensagens: `<coisa>-request` (pedido) → `<coisa>` ou `<coisa>-oferta` (o host processa e encaminha) → `<coisa>-response` (resposta de quem foi perguntado) → `<coisa>-confirmada`/`<coisa>-confirmed` (resultado final, broadcast pra todos). Ver `engine/tradeEngine.js` (`ajuda-request` → `ajuda-oferta` → `ajuda-oferta-response` → `ajuda-confirmada`) como referência mais recente e mais limpa desse padrão.

### Mensagens de conexão e identidade (Fase D)

| Mensagem | Quem envia | Campos / observação |
|---|---|---|
| `player-join` | guest → host | `playerName`, `peerId`, `token` (identidade por sala; o host guarda só o hash). Montada só em `sendPlayerJoin()` (`network/peerService.js`) |
| `join-rejected` | host → quem tentou entrar | `reason`: `room-full`, `room-locked` (partida em andamento, nome novo), `name-taken`, `identity-mismatch` (token diferente do registrado) |
| `state-sync` | host → quem entra ou volta | `fullState` com a rodada, o relógio, `rodadaEncerrada`, `partidaPausada`, `respondidos` (quem já respondeu na rodada), `gameOver` e `rankingFinal` (fim de jogo) |
| `round-start` | host → todos | também leva `respondidos` |
| `kpi-update` (da resposta) | host → todos | também leva `respondidos` |
| `round-ended` | host → todos | rodada encerrada, aguardando o "Nova Rodada" |
| `partida-pausada` | host → todos | faltam jogadores conectados; retoma sozinha quando alguém volta |

Mensagem que chega sem um campo novo (de uma versão anterior do jogo) mantém o comportamento antigo.

## Testes

- `tests/logic/*.test.js`: lógica do jogo, um arquivo por assunto (entrada e identidade, queda e volta, troca de host, F5 do host, estado salvo, fim de partida, pedido de ajuda e assessoria, banco de perguntas). Carrega os arquivos reais em contextos isolados do Node, com rede, tela e `localStorage` simulados; o ambiente simulado e os ajudantes ficam em `tests/logic/environment.js`. Sem dependências: `node tests/logic/<arquivo>`. Teste novo entra no arquivo do assunto dele, com o próximo número (T66, T67...).
- `tests/browser/*.spec.js`: o jogo no navegador, com Playwright — o jogo real em janelas separadas do Chromium, com o site e um servidor PeerJS locais. As dependências do `package.json` são só destes testes; o jogo não usa nenhuma.
- Os dois rodam no GitHub Actions a cada push e pull request (`.github/workflows/testes.yml`); o resumo aparece na página da execução.
- Toda mudança de lógica vem com teste. A frente vai em dois commits: primeiro só os testes (os novos devem falhar no Actions), depois o código (tudo passa). Isso confirma que os testes novos de fato pegam o problema.
- Código novo de lógica fica onde o teste alcança (`engine/`, `network/`, `state/`, `utils/`); `main.js` só orquestra a inicialização.

## Nomenclatura — estado atual (em transição)

**Isto está deliberadamente inconsistente hoje** — é o assunto da Fase E do roadmap (tradução completa pra inglês, ainda não feita):

- **Chaves de schema de dados** (`data/questions.*.json` e os campos que viajam com uma pergunta pela rede): já estão em inglês desde a Fase 8 (`domains`, `name`, `areas`, `questions`, `question`, `alternatives`, `correct`, `domain_key`). Motivo: precisam ser estáveis entre arquivos de idiomas diferentes (`questions.en-US.json` reusa as mesmas chaves, só traduz os valores).
- **Identificadores internos do código** (nomes de função, variável, parâmetro): em tradução para inglês na Fase E, camada por camada (E1: domain → state → engine → network → ui → main; E2: campos do estado e mensagens de rede; E3: chaves de configuração, de eventos e de idioma; E4: IDs e classes do HTML/CSS). Já em inglês: `js/domain/`, `state/`, `engine/`, `network/`, `entry/`, `ui/` e os testes (falta `utils/` e `main.js`). **Código novo usa inglês e o glossário abaixo.**
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
- **Comentários**: sempre em português, inclusive depois da Fase E (só os identificadores serão traduzidos, não os comentários). Explicam o que o código faz e por quê — sem fase, número de bug ou item do roadmap e sem a história do "antes era assim": isso fica no `roadmap.md`, no `ISSUES.md`, no `CHANGELOG.md` e no histórico do Git. Os títulos dos testes continuam com os números (T…, E…, BUG-…), que ligam o teste ao registro.
- **Tipos de mensagem de rede** (`msg.type`): kebab-case, com o nome da coisa em português e os sufixos do padrão acima (`assessoria-request`, `ajuda-oferta-response`, `partida-pausada`). Exceções antigas, mantidas por compatibilidade: `player-join`, `state-sync`, `round-start` e outras da tabela da Fase D.
- **IDs de elemento HTML e classes CSS**: camelCase pra IDs (`btnPedirAjuda`, `modalAjudaOferta`), kebab-case pra classes (`.phase-item`, `.stat-chip`).
- **Nomes de arquivo `.js`**: camelCase (`profileComponent.js`, `tradeEngine.js`, `deckRules.js`).

## Convenção de commit

Conventional Commits, em português: `tipo(escopo opcional): descrição curta` — por exemplo `fix(rede): ...`, `feat(jogo): ...`, `test: ...`, `docs: ...`, `chore: ...` — com corpo explicando o quê e o porquê quando a mudança não é óbvia.