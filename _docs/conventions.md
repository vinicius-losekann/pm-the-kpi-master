# Convenções — PM: The KPI Master

> Este documento descreve **como** o código é escrito neste projeto —
> padrões de nomenclatura, arquitetura e decisões de stack. Para o
> estado atual de cada arquivo, veja `architecture.md`. Para o
> histórico de por que certas decisões foram tomadas, veja
> `../CHANGELOG.md`.

## Stack técnica

- **Vanilla JavaScript**, sem framework (React, Vue, etc.) e sem bundler/build step. Todo arquivo `.js` é carregado via `<script>` simples em `game.html`/`index.html`, na ordem em que aparece — a ordem importa (um arquivo que usa `Game.domain.kpi` precisa ser carregado depois de `domain/kpiRules.js`).
- **Namespace global único**: `window.Game`, subdividido em `Game.domain`, `Game.state`, `Game.engine`, `Game.network`, `Game.ui`. Todo arquivo exporta pra dentro desse namespace no final (bloco `// EXPORTAÇÃO`).
- **PeerJS** para conexão P2P (WebRTC) — sem servidor próprio, usa o broker público gratuito do PeerJS só para sinalização inicial; depois disso a comunicação é direta entre os navegadores.
- **CSS puro**, sem pré-processador, tema único "dark + glassmorphism" definido via custom properties em `:root` (`css/style.css`).
- **Sem testes automatizados** — decisão registrada (ver NOTA-005 em `architecture.md`). Validação é sempre manual (multi-cliente, F5, DevTools).

## Padrão de arquitetura: camadas

```
domain/   → regras puras (sem DOM, sem rede, sem Game.state). Recebem
            parâmetros, retornam resultado. Testáveis isoladamente
            (mesmo sem teste automatizado hoje).
state/    → Game.state é a fonte única da verdade. selectors.js lê,
            mutations.js escreve (ver exceção abaixo).
engine/   → orquestração: chama domain/, mexe em state, aciona
            network/ e ui/. Não tem regra de negócio própria.
network/  → tudo que fala PeerJS: enviar, receber, rotear mensagens,
            reconexão, migração de host.
ui/       → tudo que mexe no DOM: components/ (telas/elementos
            persistentes) e modals/ (overlays).
```

**Exceção conhecida, aceita:** o contrato original previa que só `mutations.js` escrevesse em `Game.state`, e que `domain/` retornasse deltas em vez de mutar. Isso não foi seguido à risca — `engine/*.js` escreve direto em `Game.state.players`, e algumas funções de `domain/` mutam o objeto recebido. Registrado como dívida arquitetural aceita (NOTA-005) — só valeria a pena corrigir se o projeto um dia tiver testes automatizados de verdade, o que não está nos planos.

## Padrão de rede: host autoritativo

O **host é sempre a fonte da verdade**. Um guest nunca aplica uma mudança de estado por conta própria — ele manda uma mensagem `-request` pro host, o host valida e decide, e distribui o resultado via `broadcastAll()`.

**Pegadinha recorrente (já causou BUG-002, BUG-006 e BUG-007 — vale ler antes de mexer em qualquer fluxo de rede novo):** `Game.network.sendToPlayer()`/`broadcastAll()`, quando o destinatário é o próprio host, processam a mensagem **na hora, de forma síncrona** — não passam pela rede de verdade. Isso significa que a ordem de execução no host pode ficar diferente da ordem que um guest recebe (que é sempre sequencial, via rede). Ao adicionar um fluxo novo que envolve o host mandar algo pra si mesmo, sempre perguntar: "essa sequência de eventos faz sentido também quando roda tudo de uma vez, sem esperar a rede?"

Padrão de nomenclatura de mensagens: `<coisa>-request` (pedido) → `<coisa>` ou `<coisa>-oferta` (o host processa e encaminha) → `<coisa>-response` (resposta de quem foi perguntado) → `<coisa>-confirmada`/`<coisa>-confirmed` (resultado final, broadcast pra todos). Ver `engine/tradeEngine.js` (`ajuda-request` → `ajuda-oferta` → `ajuda-oferta-response` → `ajuda-confirmada`) como referência mais recente e mais limpa desse padrão.

## Nomenclatura — estado atual (em transição)

**Isto está deliberadamente inconsistente hoje** — é o assunto da Fase E do roadmap (tradução completa pra inglês, ainda não feita):

- **Chaves de schema de dados** (`data/questions.*.json` e os campos que viajam com uma pergunta pela rede): já estão em inglês desde a Fase 8 (`domains`, `name`, `areas`, `questions`, `question`, `alternatives`, `correct`, `domain_key`). Motivo: precisam ser estáveis entre arquivos de idiomas diferentes (`questions.en-US.json` reusa as mesmas chaves, só traduz os valores).
- **Identificadores internos do código** (nomes de função, variável, parâmetro): ainda em português (`sortearPergunta`, `respondedorName`, `handleAssessoriaAnswer`). Isso muda quando a Fase E for feita — até lá, **código novo deve seguir português**, pra não ficar meio-traduzido no meio de uma feature só.
- **Comentários**: sempre em português, inclusive depois da Fase E (só os identificadores serão traduzidos, não os comentários).
- **Tipos de mensagem de rede** (`msg.type`): sempre em português, kebab-case (`assessoria-request`, `venda-confirmed`... na real "venda" já virou "ajuda", ver exemplo acima).
- **IDs de elemento HTML e classes CSS**: camelCase pra IDs (`btnPedirAjuda`, `modalAjudaOferta`), kebab-case pra classes (`.phase-item`, `.stat-chip`).
- **Nomes de arquivo `.js`**: camelCase (`profileComponent.js`, `tradeEngine.js`, `deckRules.js`).

## Convenção de commit

Sem padrão rígido tipo Conventional Commits, mas os commits deste projeto seguem informalmente `tipo: descrição curta` no título (`feat:`, `fix:`, `docs:`, `refactor:`, `chore:`), com corpo explicando o quê e o porquê quando a mudança não é óbvia.