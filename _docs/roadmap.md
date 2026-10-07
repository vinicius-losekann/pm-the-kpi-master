# Roadmap: Melhorias para o PM: The KPI Master

> **Contém:** itens `N.M` aceitos para o futuro, por seção (1 a 9), e a
> seção "Itens retirados". **Não contém:** o que já foi feito (→
> `../CHANGELOG.md`), bugs e limpezas (→ `issues.md`) nem decisões de
> desenho ainda em aberto. O número de um item não muda nem é
> reaproveitado.

## 1. Arquitetura e Organização

> Sem itens em aberto: o projeto tem `domain/`, `state/`, `engine/`,
> `network/` e `ui/` como camadas separadas (`architecture.md`).
> **NOTA-005** (`domain/` muta o estado recebido em vez de retornar deltas)
> está fechada como "não será corrigida".

---

## 2. Tratamento de Erros e Robustez

| # | Melhoria | Justificativa |
|---|----------|---------------|
| 2.1 | **Política de retry mais inteligente** | Em `initPeerWithRetry`, as tentativas são fixas. Poderiam ser exponenciais com jitter para evitar sobrecarga do servidor. |
| 2.2 | **Timeouts em todas as operações de rede** | Além do timeout de resposta, implementar timeouts para envio de mensagens, reconexão, etc. |
| 2.3 | **Religar `Game.logger.*` no lugar de `console.*`** | Infraestrutura já pronta (`utils/logger.js`). Prioritário: com múltiplas salas simultâneas em produção, não dá para depurar via `console.log` de uma sala que ninguém está observando ao vivo. Trabalho mecânico, mas espalhado por praticamente todo arquivo `.js` — ver **NOTA-004** em `architecture.md`. |
| 2.4 | **Validação de dados recebidos via rede** | Mensagens de outros peers podem estar malformadas; validar com esquemas (ex: JSON Schema) para evitar crashes. |
| 2.5 | **Fallback para quando o host migra** | Garantir que a migração de host seja atômica e que o novo host sincronize completamente o estado com todos os peers. Grande parte feita na **Fase D** (`../CHANGELOG.md`): prazo de 10s, sala encontrada em qualquer versão do host, host antigo volta como jogador comum, rodízio da rodada preservado. Resta: janela de menos de 1s com dois hosts, se o host antigo recarregar exatamente enquanto o outro assume. |
| 2.6 | **Relógio pela hora de término** | Guests que reconectam ficam ~1s diferentes do host (a contagem é local, corrigida a cada 10s). Mandar a hora de término em vez do tempo restante acabaria com a diferença, mas exige estimar a diferença entre os relógios dos aparelhos (que podem divergir em vários segundos) — sem isso, fica pior que hoje. Baixa prioridade: a diferença atual é imperceptível no jogo. |
| 2.7 | **Servidor de retransmissão (TURN) para redes restritivas** | Redes de instituição podem bloquear a conexão direta entre navegadores. Um servidor TURN resolve, mas as credenciais não podem ir para os arquivos do site (o GitHub Pages é público) — exige um serviço com credenciais temporárias. A biblioteca PeerJS (1.5.1) já usa por padrão um TURN público e gratuito do próprio PeerJS, sem garantia de disponibilidade. Validar antes com o teste manual M9 de `manual-test-scripts.md` (o roteiro anota se a conexão foi direta ou passou pelo TURN). |
| 2.8 | **Travamento do Edge no Windows** | Relatado em teste (uma vez travou o computador inteiro; outra, ~5s ao criar sala). Não reproduz no Chromium. Investigar: Chrome na mesma máquina, Edge sem aceleração de hardware, Gerenciador de Tarefas aberto antes. |

---

## 3. Persistência e Estado

| # | Melhoria | Justificativa |
|---|----------|---------------|
| 3.2 | **Compressão de dados** | O estado pode crescer; usar compressão (ex: LZString) para reduzir tamanho. |
| 3.3 | **Sincronização parcial (delta sync)** | Em vez de enviar o estado completo em `state-sync`, enviar apenas as mudanças (diffs), economizando banda. |

---

## 4. Segurança

> Nota: para o que **já foi corrigido** — XSS via nome de jogador e
> falsificação de identidade em mensagens de rede (`SEC-001` e `SEC-002`,
> em `../CHANGELOG.md`); nome do host tomado e reconexão no lugar de outro
> jogador (`SEC-003` e `SEC-004`, em `issues.md`).

| # | Melhoria | Justificativa |
|---|----------|---------------|
| 4.2 | **Validação de ações do host** | O host é a fonte da verdade, mas suas ações devem ser validadas (ex: não pode conceder KPI indevidamente). Atualmente já há alguma validação, mas pode ser reforçada. |
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
| 6.3 | **Minimizar broadcasts desnecessários** | Alguns broadcasts (ex: `player-list`) são enviados a cada mudança; poderia ser enviado apenas quando houver mudança real. |
| 6.4 | **Lazy loading de perguntas** | Carregar perguntas sob demanda por área foco, em vez de todas de uma vez. |

---

## 7. Manutenção e Qualidade de Código

| # | Melhoria | Justificativa |
|---|----------|---------------|
| 7.1 | **JSDoc completo** | Muitas funções já têm comentários, mas faltam parâmetros e retornos detalhados. Padronizar. |
| 7.3 | **Linter (ESLint) e formatter (Prettier)** | Manter estilo consistente e evitar erros comuns. |
| 7.6 | **Extrair helper compartilhado de renderização de alternativas** | `questionComponent.js` (Respondedor) e `advisoryModal.js` (Assessor) duplicam a lógica de montar a lista de alternativas + timer — visualmente quase idênticas, mas disparam ações diferentes no clique (`handleAnswer` vs `answerAdvisory`). Não fundir os dois modais (são interações conceitualmente diferentes), só extrair a parte genuinamente igual (montagem da lista + texto do timer) para uma função compartilhada tipo `Game.ui.renderAlternativesList(container, alternativas, onEscolher)`. Baixo risco, ganho pequeno — não é bug, é redução de duplicação. |
| 7.8 | **Node 24 nos testes** | O workflow roda os testes com `node-version: 20`, fora de suporte desde 04/2026 (as ações do workflow já usam Node 24). Trocar pode mudar o resultado dos testes (`vm`, `crypto`, Playwright), por isso fica como frente própria, com o Actions conferido antes e depois. |

---

## 8. Funcionalidades Futuras

| # | Melhoria | Justificativa |
|---|----------|---------------|
| 8.1 | **QR code no tabuleiro** | Facilitar a entrada de jogadores em sala física, sem precisar digitar o código manualmente. |
| 8.4 | **Suporte a múltiplos idiomas (i18n)** | Criar `en-US.js` e `es-ES.js` com as mesmas chaves de `pt-BR.js` e adicionar seletor de idioma na UI — infraestrutura já pronta, ver **NOTA-003** em `architecture.md`. Conteúdo das perguntas: `data/questions.pt-BR.json` já usa chaves de schema em inglês (Fase 8), então um `questions.en-US.json`/`questions.es-ES.json` futuro só precisa traduzir os valores, reusando as mesmas chaves de domínio — ver `architecture.md`. |
| 8.5 | **Nome do jogador sem diferenciar maiúsculas** | Em teste, "vHost" e "Vhost" foram tratados como jogadores diferentes: quem volta digitando o nome com outra grafia é recusado no meio da partida. Comparar nomes ignorando maiúsculas/minúsculas. |
| 8.6 | **Bônus por sequência de acertos** | Ideia antiga (maio/2026): 3 ou mais acertos seguidos dão um bônus de KPI. Valor e regra a definir. |
| 8.7 | **Penalidade por erros seguidos** | Ideia antiga (maio/2026): 3 erros seguidos dão uma penalidade. Avaliar junto com qualquer mudança na economia de recursos, porque também mexe no custo de errar. |
| 8.8 | **Eventos novos** | Ideia antiga (maio/2026): eventos de bloqueio e de bônus de recurso, além dos 6 de `data/events.json`. |
| 8.9 | **Chamar outro colega depois de uma recusa** | Hoje a recusa do assessor (ou o prazo esgotado) gasta o pedido da pergunta: quem responde segue sozinho. Isso obriga a escolher bem quem chamar e limita a espera a 20s. Rever com o jogo em uso: permitir uma segunda tentativa, na assessoria e no pedido de ajuda, mede-se pelo tempo extra da pergunta e por quantas recusas acontecem. |

---

## 9. Pendências da Fase D

| # | Melhoria | Justificativa |
|---|----------|---------------|
| 9.5 | **Testes manuais P1 de conexão** | O que não dá para automatizar: M9 (redes diferentes), M7 (queda de rede real) e M8 (celular com tela bloqueada). Roteiros em `manual-test-scripts.md`. Fecham a Fase D. |

---

## Itens retirados

Itens que saíram sem estar na lista do `CHANGELOG.md`, com o motivo. Os
números não são reaproveitados.

| # | Item | Saiu em | Motivo |
|---|---|---|---|
| 4.3 | Criptografia de ponta a ponta | 05/10/2026 | A conexão WebRTC entre os navegadores já é sempre criptografada (DTLS), e a opção `secure` do PeerJS trata só da conexão com o servidor de sinalização, que no servidor público já é HTTPS |
| 6.2 | Virtualização de listas | 05/10/2026 | Com no máximo 6 jogadores, as listas são pequenas demais para ganhar algo com isso |
| 7.5 | Separar helpers (ex.: `buildRanking`) | 05/10/2026 | Já estava feito: o ranking fica em `js/domain/rankingRules.js` |
| 7.9 | Simulador de partidas para balanceamento | 06/10/2026 | Feito: `tests/simulation/`, workflow "Simulação de partidas" (ver `architecture.md`). Os ajustes do config que o relatório sugerir são decididos com o titular, cada um como frente própria |
