# TODO: Melhorias para o PM: The KPI Master

## 1. Arquitetura e Organização

> ✅ **Resolvida pela migração de arquitetura (Fases 0–7).** Os itens que
> estavam aqui (desacoplar UI da lógica, estado centralizado, separação de
> camadas) descreviam problemas do antigo `game-core.js`/`game-ui.js`
> monolítico — já não existem: hoje o projeto tem `domain/`, `state/`,
> `engine/`, `network/` e `ui/` como camadas separadas. Detalhes completos em
> `ARCHITECTURE.md`.
>
> **NOTA-005** em `ARCHITECTURE.md` (`domain/` muta o estado recebido em vez
> de retornar deltas) foi avaliada e fechada como "não será corrigida" —
> decisão do usuário de não escrever testes automatizados, que era a única
> situação em que valeria o risco de mexer nessa lógica.

---

## 2. Tratamento de Erros e Robustez

| # | Melhoria | Justificativa |
|---|----------|---------------|
| 2.1 | **Política de retry mais inteligente** | Em `initPeerWithRetry`, as tentativas são fixas. Poderiam ser exponenciais com jitter para evitar sobrecarga do servidor. |
| 2.2 | **Timeouts em todas as operações de rede** | Além do timeout de resposta, implementar timeouts para envio de mensagens, reconexão, etc. |
| 2.3 | **Religar `Game.logger.*` no lugar de `console.*`** | Infraestrutura já pronta (`utils/logger.js`). Prioritário: com múltiplas salas simultâneas em produção, não dá para depurar via `console.log` de uma sala que ninguém está observando ao vivo. Trabalho mecânico, mas espalhado por praticamente todo arquivo `.js` — ver **NOTA-004** em `ARCHITECTURE.md`. |
| 2.4 | **Validação de dados recebidos via rede** | Mensagens de outros peers podem estar malformadas; validar com esquemas (ex: JSON Schema) para evitar crashes. |
| 2.5 | **Fallback para quando o host migra** | Garantir que a migração de host seja atômica e que o novo host sincronize completamente o estado com todos os peers. |

---

## 3. Persistência e Estado

| # | Melhoria | Justificativa |
|---|----------|---------------|
| 3.1 | **Versionamento do estado salvo** | `localStorage` não tem versão; mudanças futuras podem corromper o carregamento. Adicionar `version` e função de migração. |
| 3.2 | **Compressão de dados** | O estado pode crescer; usar compressão (ex: LZString) para reduzir tamanho. |
| 3.3 | **Sincronização parcial (delta sync)** | Em vez de enviar o estado completo em `state-sync`, enviar apenas as mudanças (diffs), economizando banda. |

---

## 4. Segurança

> Nota: itens abaixo tratam de superfícies gerais de segurança que ainda não
> foram endereçadas. Para o que **já foi corrigido** (XSS via nome de
> jogador, falsificação de identidade em mensagens de rede), ver `SEC-001` e
> `SEC-002` em `ISSUES.md` — mitigam parte do risco descrito em 4.1/4.2, mas
> não substituem uma autenticação real.

| # | Melhoria | Justificativa |
|---|----------|---------------|
| 4.1 | **Autenticação de jogadores** | Impedir que um usuário se passe por outro de forma mais robusta que a verificação atual de `peerId` (ver `SEC-002`). Desenho detalhado (token por sala em `localStorage`) já feito — ver **Fase D** na seção 9, adiada por decisão do usuário. |
| 4.2 | **Validação de ações do host** | O host é a fonte da verdade, mas suas ações devem ser validadas (ex: não pode conceder KPI indevidamente). Atualmente já há alguma validação, mas pode ser reforçada. |
| 4.3 | **Criptografia de ponta a ponta** | PeerJS suporta `secure: true` para conexões WebRTC criptografadas. Ativar para proteção de dados sensíveis. |

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
| 7.6 | **Extrair helper compartilhado de renderização de alternativas** | `questionComponent.js` (Respondedor) e `advisoryModal.js` (Assessor) duplicam a lógica de montar a lista de alternativas + timer — visualmente quase idênticas, mas disparam ações diferentes no clique (`handleAnswer` vs `responderAssessoria`). Não fundir os dois modais (são interações conceitualmente diferentes), só extrair a parte genuinamente igual (montagem da lista + texto do timer) para uma função compartilhada tipo `Game.ui.renderAlternativesList(container, alternativas, onEscolher)`. Baixo risco, ganho pequeno — não é bug, é redução de duplicação. |

---

## 8. Funcionalidades Futuras

| # | Melhoria | Justificativa |
|---|----------|---------------|
| 8.1 | **QR code no tabuleiro** | Facilitar a entrada de jogadores em sala física, sem precisar digitar o código manualmente. |
| 8.4 | **Suporte a múltiplos idiomas (i18n)** | Criar `en-US.js` e `es-ES.js` seguindo o mesmo dicionário de `pt-BR.js` (51 chaves) e adicionar seletor de idioma na UI — infraestrutura já pronta, ver **NOTA-003** em `ARCHITECTURE.md`. Conteúdo das perguntas: `data/questions.pt-BR.json` já usa chaves de schema em inglês (Fase 8), então um `questions.en-US.json`/`questions.es-ES.json` futuro só precisa traduzir os valores, reusando as mesmas chaves de domínio — ver `ARCHITECTURE.md`. |

---

## 9. Feedback do Piloto (Set/2026)

> Lote de ideias trazidas após o primeiro teste piloto com alunos. Organizado
> em fases de execução — ver `ARCHITECTURE.md` para o racional completo de
> cada decisão. Substitui a antiga seção "Ideias de rebalanceamento a
> avaliar" (as 3 propostas antigas foram descartadas em favor da Fase C
> abaixo, decidida com o usuário).

### Fase A — ajustes rápidos (prontos para implementar, sem pendência de decisão)

| # | Melhoria | Justificativa |
|---|----------|---------------|
| 9.1 | **Reordenar botões: Nova Rodada acima de Encerrar Partida** | Ordem atual (`btnEndMatch` antes de `btnNovaRodada` no HTML) convida a clique errado no mobile — Nova Rodada é clicado toda hora, Encerrar Partida é raro e destrutivo (zera KPI de todos). Reordenar + separar visualmente. |
| 9.2 | **URL limpa (sem `/index.html`)** | `window.location.href = 'index.html'` (usado em sair da sessão, host encerrando, erro de conexão) força o navegador a mostrar o nome do arquivo na URL. Trocar por `'./'` resolve, sem depender de configuração do GitHub Pages. |
| 9.3 | **Modal de lembrete "avance no tabuleiro" após acerto** | O jogo tem um componente físico (tabuleiro) — estender `resultModal.js` com um aviso quando `acertou === true`, lembrando o jogador de mover a peça. |

### Fase B — card de fases consolidado (falta confirmar layout com o usuário)

| # | Melhoria | Justificativa |
|---|----------|---------------|
| 9.4 | **Unificar KPI/recursos/fase/progresso dentro do card de Fases** | Em vez de um card de perfil separado, mostrar por fase: completo / X de 2 / não iniciado. Derivável do estado que já existe (`player.phase` + `player.activities`, progressão é sempre linear) — não precisa de campo novo. **Bloqueado em:** confirmar com o usuário o layout exato (como fica o cabeçalho com KPI/recursos, como cada fase mostra o status). |

### Fase C — economia de recursos (decidido em 18/09/2026, pronto para implementar)

| Regra | Valor |
|---|---|
| Recursos iniciais | **10** |
| Resposta certa | **não gasta recurso** |
| Resposta errada | -1 recurso (como hoje) |
| Evento Corte de Orçamento | **-1 para todos (mantido como está hoje — não muda)** |
| Evento Reserva de Contingência | reinterpretado: protege quem **errar** de perder recurso nesta rodada (acerto já não gasta nada, então o evento passa a valer só pro cenário que ainda existe) |
| Apoio da Alta Gestão / Patrocinador Generoso / Reestruturação | sem mudança |

Objetivo confirmado com o usuário: recurso vira punição só por errar, não mais um custo incondicional de participar.

### Fase D — sala travada + identidade única + robustez de conexão (desenhado, adiado por ora)

> Usuário decidiu deixar como está por enquanto — vai querer ajustar algumas
> coisas antes de implementar. Mantido aqui como referência de desenho, não
> como item pronto pra pegar.

- Travar sala: `addPlayer()` passa a rejeitar `'player-join'` de nome novo quando `state.gameStarted === true` — só permite reconexão de quem já está na lista.
- Token de identidade por sala (gerado e guardado em `localStorage` na primeira entrada, específico daquela sala) — reconexão passa a exigir o token bater, não só o nome (hoje `addPlayer()` confia só em nome + conexão antiga parecer fechada). Limitação aceita: trocar de aba/navegador ou limpar dados no meio da partida perde a identidade.
- Robustez de conexão: reduzir `HOST_TIMEOUT` (hoje 30s), adicionar handler de `beforeunload` para detectar saída mais rápido, revisar dependência do broker público do PeerJS — relacionado aos itens **2.1**, **2.2** e **2.5** acima.

### Fase E — tradução completa de identificadores para inglês (por último)

- Todas as funções e variáveis do código (ex: `sortearPergunta` → `drawQuestion`) traduzidas para inglês; comentários continuam em português.
- Decisão do usuário: varredura completa, risco aceito — mas só **depois** das Fases A–D estarem implementadas e estáveis. Rename de identificador não deve ser misturado com mudança de comportamento (mesmo princípio já registrado no cabeçalho do `ISSUES.md`), e essa é a maior mudança de superfície do lote — vale isolar.