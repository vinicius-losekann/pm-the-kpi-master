# Roadmap: Melhorias para o PM: The KPI Master

## 1. Arquitetura e Organização

> ✅ **Resolvida pela migração de arquitetura (Fases 0–7).** Os itens que
> estavam aqui (desacoplar UI da lógica, estado centralizado, separação de
> camadas) descreviam problemas do antigo `game-core.js`/`game-ui.js`
> monolítico — já não existem: hoje o projeto tem `domain/`, `state/`,
> `engine/`, `network/` e `ui/` como camadas separadas. Detalhes completos em
> `architecture.md`.
>
> **NOTA-005** em `architecture.md` (`domain/` muta o estado recebido em vez
> de retornar deltas) foi avaliada e fechada como "não será corrigida" —
> decisão do usuário, mantida mesmo depois de o projeto ganhar testes
> automatizados (Fase D).

---

## 2. Tratamento de Erros e Robustez

| # | Melhoria | Justificativa |
|---|----------|---------------|
| 2.1 | **Política de retry mais inteligente** | Em `initPeerWithRetry`, as tentativas são fixas. Poderiam ser exponenciais com jitter para evitar sobrecarga do servidor. |
| 2.2 | **Timeouts em todas as operações de rede** | Além do timeout de resposta, implementar timeouts para envio de mensagens, reconexão, etc. |
| 2.3 | **Religar `Game.logger.*` no lugar de `console.*`** | Infraestrutura já pronta (`utils/logger.js`). Prioritário: com múltiplas salas simultâneas em produção, não dá para depurar via `console.log` de uma sala que ninguém está observando ao vivo. Trabalho mecânico, mas espalhado por praticamente todo arquivo `.js` — ver **NOTA-004** em `architecture.md`. |
| 2.4 | **Validação de dados recebidos via rede** | Mensagens de outros peers podem estar malformadas; validar com esquemas (ex: JSON Schema) para evitar crashes. |
| 2.5 | **Fallback para quando o host migra** | Garantir que a migração de host seja atômica e que o novo host sincronize completamente o estado com todos os peers. Grande parte feita na **Fase D** (seção 9): prazo de 10s, sala encontrada em qualquer versão do host, host antigo volta como jogador comum, rodízio da rodada preservado. Resta: janela de menos de 1s com dois hosts, se o host antigo recarregar exatamente enquanto o outro assume. |
| 2.6 | **Relógio pela hora de término** | Guests que reconectam ficam ~1s diferentes do host (a contagem é local, corrigida a cada 10s). Mandar a hora de término em vez do tempo restante acabaria com a diferença, mas exige estimar a diferença entre os relógios dos aparelhos (que podem divergir em vários segundos) — sem isso, fica pior que hoje. Baixa prioridade: a diferença atual é imperceptível no jogo. |
| 2.7 | **Servidor de retransmissão (TURN) para redes restritivas** | Redes de instituição podem bloquear a conexão direta entre navegadores. Um servidor TURN resolve, mas as credenciais não podem ir para os arquivos do site (o GitHub Pages é público) — exige um serviço com credenciais temporárias. A biblioteca PeerJS (1.5.1) já usa por padrão um TURN público e gratuito do próprio PeerJS, sem garantia de disponibilidade. Validar antes com o teste manual M9 de `testes-conexao.md` (o roteiro anota se a conexão foi direta ou passou pelo TURN). |
| 2.8 | **Travamento do Edge no Windows** | Relatado em teste (uma vez travou o computador inteiro; outra, ~5s ao criar sala). Não reproduz no Chromium. Investigar: Chrome na mesma máquina, Edge sem aceleração de hardware, Gerenciador de Tarefas aberto antes. |

---

## 3. Persistência e Estado

| # | Melhoria | Justificativa |
|---|----------|---------------|
| 3.1 | **Versionamento do estado salvo** | ✅ Feito (03/10/2026): o estado salvo tem `stateVersion` (hoje 1) e passa por `migrateSavedState()` em `utils/persistence.js` antes de ser restaurado. Estado sem versão conta como 1; versão mais nova é ignorada sem ser apagada; versão inválida é apagada. Ao mudar o formato (ex.: Fase E), aumentar `STATE_VERSION` e acrescentar o passo em `STATE_MIGRATIONS`. |
| 3.2 | **Compressão de dados** | O estado pode crescer; usar compressão (ex: LZString) para reduzir tamanho. |
| 3.3 | **Sincronização parcial (delta sync)** | Em vez de enviar o estado completo em `state-sync`, enviar apenas as mudanças (diffs), economizando banda. |

---

## 4. Segurança

> Nota: para o que **já foi corrigido** — XSS via nome de jogador e
> falsificação de identidade em mensagens de rede (`SEC-001` e `SEC-002`,
> em `../CHANGELOG.md`); nome do host tomado e reconexão no lugar de outro
> jogador (`SEC-003` e `SEC-004`, em `ISSUES.md`).

| # | Melhoria | Justificativa |
|---|----------|---------------|
| 4.1 | **Autenticação de jogadores** | ✅ Feito na **Fase D** (seção 9): token de identidade por sala em `localStorage`; o host guarda só o hash e exige o token na reconexão. Limitação aceita: trocar de navegador/aba anônima ou limpar os dados no meio da partida perde a identidade. |
| 4.2 | **Validação de ações do host** | O host é a fonte da verdade, mas suas ações devem ser validadas (ex: não pode conceder KPI indevidamente). Atualmente já há alguma validação, mas pode ser reforçada. |
| 4.3 | **Criptografia de ponta a ponta** | PeerJS suporta `secure: true` para conexões WebRTC criptografadas. Ativar para proteção de dados sensíveis. |
| 4.4 | **Ocultar as perguntas e o gabarito** | Hoje as respostas não são secretas: `data/questions.pt-BR.json` é público no site (qualquer um abre no navegador) e quem reconecta recebe o baralho com o gabarito no `state-sync` (quem assume como host precisa dele). Ocultar exige tirar o gabarito do arquivo público (ex.: só o host carrega as respostas, de um lugar não publicado) e mandar a quem reconecta só o que foi usado do baralho. Por ora, vale a regra da aula (não abrir o F12 nem o arquivo de perguntas). |

---

## 5. Experiência do Usuário (UX/UI)

| # | Melhoria | Justificativa |
|---|----------|---------------|
| 5.2 | **Animações mais suaves** | Transições entre telas e modais com animações CSS já existem, mas podem ser aprimoradas (ex: uso de `will-change`). |
| 5.3 | **Indicadores de carregamento** | Mostrar spinners durante reconexão, carregamento de perguntas, etc. |
| 5.5 | **Modo noturno** | Já tem tema escuro; poderia ter opção de claro. |

---

## 6. Desempenho

| # | Melhoria | Justificativa |
|---|----------|---------------|
| 6.1 | **Debounce em atualizações de UI** | Muitas atualizações de ranking/lista de jogadores ocorrem com alta frequência; usar `requestAnimationFrame` ou debounce. |
| 6.2 | **Virtualização de listas** | Para ranking com muitos jogadores (máx 6, então não crítico). |
| 6.3 | **Minimizar broadcasts desnecessários** | Alguns broadcasts (ex: `player-list`) são enviados a cada mudança; poderia ser enviado apenas quando houver mudança real. |
| 6.4 | **Lazy loading de perguntas** | Carregar perguntas sob demanda por fase, em vez de todas de uma vez. |

---

## 7. Manutenção e Qualidade de Código

| # | Melhoria | Justificativa |
|---|----------|---------------|
| 7.1 | **JSDoc completo** | Muitas funções já têm comentários, mas faltam parâmetros e retornos detalhados. Padronizar. |
| 7.3 | **Linter (ESLint) e formatter (Prettier)** | Manter estilo consistente e evitar erros comuns. |
| 7.5 | **Separar helpers em arquivos próprios** | Funções como `buildRanking` poderiam estar em um arquivo `ranking-utils.js`. |
| 7.6 | **Extrair helper compartilhado de renderização de alternativas** | `questionComponent.js` (Respondedor) e `advisoryModal.js` (Assessor) duplicam a lógica de montar a lista de alternativas + timer — visualmente quase idênticas, mas disparam ações diferentes no clique (`handleAnswer` vs `answerAdvisory`). Não fundir os dois modais (são interações conceitualmente diferentes), só extrair a parte genuinamente igual (montagem da lista + texto do timer) para uma função compartilhada tipo `Game.ui.renderAlternativesList(container, alternativas, onEscolher)`. Baixo risco, ganho pequeno — não é bug, é redução de duplicação. |
| 7.7 | **Testes de ponta a ponta com navegadores de verdade** | Hoje os testes automatizados (`tests/`) simulam o PeerJS. Rodar o jogo em navegadores reais no GitHub Actions (Playwright + servidor PeerJS local + servidor estático) cobre quase todo o checklist manual de `testes-conexao.md`. ✅ **Feito**: estrutura em `tests/browser` e 17 cenários (troca de host — inclusive no lobby e duas seguidas —, F5 do host em vários momentos da partida — inclusive com assessoria pendente —, volta pela tela inicial, 3 jogadores, sala cheia, criar sala com código em uso, reabrir a sala depois que todos saíram, nova partida). O que depende de rede real, celular ou outros navegadores continua manual (M7, M8, M9, M17, M18). |
| 7.8 | **Node 24 nos testes** | O workflow roda os testes com `node-version: 20`, fora de suporte desde 04/2026 (as ações do workflow já usam Node 24). Trocar pode mudar o resultado dos testes (`vm`, `crypto`, Playwright), por isso fica como frente própria, com o Actions conferido antes e depois. |
| 7.9 | **Simulador de partidas para balanceamento** | Rodar muitas partidas simuladas (sem rede nem tela) para medir quantas rodadas uma partida leva, como os recursos variam e se a economia (Fase C) e os eventos estão justos. Precisa usar as regras de verdade (`domain/` e os engines, como os testes de `tests/logic`) — o antigo `js/dev/debugTools.js` tinha uma cópia própria das regras, que podia divergir do jogo, e foi removido. Saída: um relatório (tabela ou gráfico) para decidir ajustes de `config/game-config.js`. |

---

## 8. Funcionalidades Futuras

| # | Melhoria | Justificativa |
|---|----------|---------------|
| 8.1 | **QR code no tabuleiro** | Facilitar a entrada de jogadores em sala física, sem precisar digitar o código manualmente. |
| 8.4 | **Suporte a múltiplos idiomas (i18n)** | Criar `en-US.js` e `es-ES.js` seguindo o mesmo dicionário de `pt-BR.js` (51 chaves em 03/10/2026) e adicionar seletor de idioma na UI — infraestrutura já pronta, ver **NOTA-003** em `architecture.md`. Conteúdo das perguntas: `data/questions.pt-BR.json` já usa chaves de schema em inglês (Fase 8), então um `questions.en-US.json`/`questions.es-ES.json` futuro só precisa traduzir os valores, reusando as mesmas chaves de domínio — ver `architecture.md`. |
| 8.5 | **Nome do jogador sem diferenciar maiúsculas** | Em teste, "vHost" e "Vhost" foram tratados como jogadores diferentes: quem volta digitando o nome com outra grafia é recusado no meio da partida. Comparar nomes ignorando maiúsculas/minúsculas. |

---

## 9. Feedback do Piloto (Set/2026)

> Lote de ideias trazidas após o primeiro teste piloto com alunos. Organizado
> em fases de execução — ver `architecture.md` para o racional completo de
> cada decisão. Substitui a antiga seção "Ideias de rebalanceamento a
> avaliar" (as 3 propostas antigas foram descartadas em favor da Fase C
> abaixo, decidida com o usuário).

### Fase A — ajustes rápidos — ✅ concluída (18/09/2026)

| # | Melhoria | Justificativa |
|---|----------|---------------|
| 9.1 | **Reordenar botões: Nova Rodada acima de Encerrar Partida** | Ordem atual (`btnEndMatch` antes de `btnNovaRodada` no HTML) convida a clique errado no mobile — Nova Rodada é clicado toda hora, Encerrar Partida é raro e destrutivo (zera KPI de todos). Reordenar + separar visualmente. |
| 9.2 | **URL limpa (sem `/index.html`)** | `window.location.href = 'index.html'` (usado em sair da sessão, host encerrando, erro de conexão) força o navegador a mostrar o nome do arquivo na URL. Trocar por `'./'` resolve, sem depender de configuração do GitHub Pages. |
| 9.3 | **Modal de lembrete "avance no tabuleiro" após acerto** | O jogo tem um componente físico (tabuleiro) — estender `resultModal.js` com um aviso quando `acertou === true`, lembrando o jogador de mover a peça. |

### Fase B — card de fases consolidado — ✅ concluída (18/09/2026)

| # | Melhoria | Justificativa |
|---|----------|---------------|
| 9.4 | **Unificar KPI/recursos/fase/progresso dentro do card de Fases** | Em vez de um card de perfil separado, mostrar por fase: completo / X de 2 / não iniciado. Derivável do estado que já existe (`player.phase` + `player.activities`, progressão é sempre linear) — não precisou de campo novo. Layout confirmado e implementado. |

### Fase C — economia de recursos — ✅ concluída (18/09/2026)

| Regra | Valor |
|---|---|
| Recursos iniciais | **10** |
| Resposta certa | **não gasta recurso** |
| Resposta errada | -1 recurso (como hoje) |
| Evento Corte de Orçamento | **-1 para todos (mantido como está hoje — não muda)** |
| Evento Reserva de Contingência | reinterpretado: protege quem **errar** de perder recurso nesta rodada (acerto já não gasta nada, então o evento passa a valer só pro cenário que ainda existe) |
| Apoio da Alta Gestão / Patrocinador Generoso / Reestruturação | sem mudança |

Objetivo confirmado com o usuário: recurso vira punição só por errar, não mais um custo incondicional de participar.

**Decisão adicional, tomada durante a implementação:** o "pular vez por falta de recurso" foi removido (opção 1 entre duas propostas) — qualquer jogador ativo sempre tenta responder, mesmo com 0 recursos; se errar já em 0, o recurso trava em 0 sem penalidade extra. Isso também tirou o filtro por recurso que existia em `turnEngine.js` na escolha de quem pode ser Respondedor. Detalhes técnicos em `architecture.md`.

### Fase D — sala travada + identidade única + robustez de conexão — em fechamento

| Etapa | O que mudou | Situação |
|---|---|---|
| D1a | Sala travada durante a partida (nome novo é recusado); quem cai fica na lista como desconectado, com a vaga reservada; partida pausa quando falta só conexão e retoma quando alguém volta | ✅ |
| — | Saída da página (`pagehide`/`beforeunload`) encerra as conexões na hora; nome do host não pode ser tomado | ✅ |
| D1b | Desconectados saem da lista ao voltar ao lobby; troca de host marca os outros como desconectados; rodada sem gabarito é descartada na troca | ✅ |
| D2 | Token de identidade por sala: reconexão exige o token, não só o nome | ✅ |
| D2b | Quem reconecta volta com o relógio andando e sem reabrir pergunta já respondida | ✅ |
| D3a | Opções do PeerJS num lugar só (`CONFIG.PEER`) | ✅ |
| D3b | Prazo de 10s para o host voltar; depois disso outro assume, e o host antigo volta como jogador comum | ✅ |
| D3c | Sala encontrada em qualquer versão do host (tela inicial, link antigo, conexão inicial) | ✅ |
| D3d | "Voltar ao lobby" zera os jogadores (nova partida depois de "Sair da partida") | ✅ |
| D3e | Quem já respondeu na rodada é conhecido por todos: depois da troca de host a rodada continua de onde parou, sem ninguém responder duas vezes; rodada encerrada não recomeça sozinha | ✅ |
| D3f | F5 do host em qualquer momento da partida faz o que aconteceria sem o F5: rodada encerrada continua encerrada, partida pausada continua pausada com o mesmo evento, resposta recém-dada segue para a próxima dupla (ou encerra a partida, se completou a última fase) | ✅ |
| BUG-019 | F5 do host com um pedido de assessoria sem resposta: o pedido é cancelado (quem responde pode pedir de novo) em vez de a rodada ficar presa | ✅ |
| BUG-020 | F5 do host fora da dupla: o host volta vendo a tela de espectador; etiquetas de domínio e área aparecem depois do F5 e para quem volta à partida | ✅ |
| BUG-021 | F5 na tela de fim de jogo volta à tela final com o mesmo ranking (antes a partida podia recomeçar); quem cai no fim de jogo pode voltar à sala | ✅ |
| BUG-022, BUG-023 | Quem caiu fica fora do pedido de ajuda e da assessoria (ninguém espera 20s à toa); nomes com "&" aparecem certos no aviso de ajuda | ✅ |
| — | Refatoração sem mudança para quem joga: quem assume como host usa a mesma contagem do relógio do início da partida; removido o aviso de troca de host que não chegava a ninguém | ✅ |

Checklist de conexão (casos cobertos, testes manuais pendentes e
limitações): `testes-conexao.md`. Falta: testes manuais P1 que não dão
para automatizar (M7, M8, M9), com roteiros na seção 7 de
`testes-conexao.md`. **D4** (item 7.7): feita — 17 cenários
de ponta a ponta, cobrindo também os P2 M11–M16.

### Fase E — tradução completa de identificadores para inglês (por último)

- Todas as funções e variáveis do código (ex: `sortearPergunta` → `drawQuestion`) traduzidas para inglês; comentários continuam em português.
- Decisão do usuário: varredura completa, risco aceito — mas só **depois** das Fases A–D estarem implementadas e estáveis. Rename de identificador não deve ser misturado com mudança de comportamento, e essa é a maior mudança de superfície do lote — vale isolar.
- Pré-requisito: versão no estado salvo (item **3.1**, ✅ feito), para que partidas salvas antes da tradução não quebrem ao carregar. Se a tradução mudar nomes de campos do estado salvo, acrescentar o passo de migração 1→2. Atenção: os mesmos campos vão pela rede (`state-sync`), onde não há versão.
- Andamento (etapas em `conventions.md`, seção Nomenclatura): **E1** (funções, parâmetros e variáveis locais) feita em todo o `js/` (`domain/`, `state/`, `engine/`, `network/` + `entry/`, `ui/`, `utils/` e `main.js`); faltam as variáveis locais dos testes. E2, E3 e E4 ainda não começaram.