# TODO: Melhorias para o PM: The KPI Master

## 1. Arquitetura e Organização

| # | Melhoria | Justificativa |
|---|----------|---------------|
| 1.1 | **Desacoplar UI da lógica de negócio** | `game-core.js` atualiza diretamente o DOM (ex: `document.getElementById('myRecursos')`). Isso dificulta testes e manutenção. Adotar padrão **Observer** ou **Event Bus** para notificar a UI sobre mudanças de estado. |
| 1.2 | **Gerenciamento de estado centralizado** | O estado global `Game.state` é mutável e acessado por todos os módulos. Utilizar uma **store** com imutabilidade (ex: via `Object.freeze` ou biblioteca como Redux) e ações específicas para alterações, facilitando rastreamento de mudanças. |
| 1.3 | **Injeção de dependências** | Módulos referenciam `Game` globalmente. Usar um container de injeção ou passar dependências explicitamente nas funções, melhorando testabilidade. |
| 1.4 | **Separação de camadas** | Criar camadas claras: **Model** (estado), **Controller** (regras de negócio), **View** (UI), **Network** (comunicação). Atualmente, `game-core` mistura lógica de jogo com manipulação de rede e UI. |

---

## 2. Tratamento de Erros e Robustez

| # | Melhoria | Justificativa |
|---|----------|---------------|
| 2.1 | **Política de retry mais inteligente** | Em `initPeerWithRetry`, as tentativas são fixas. Poderiam ser exponenciais com jitter para evitar sobrecarga do servidor. |
| 2.2 | **Timeouts em todas as operações de rede** | Além do timeout de resposta, implementar timeouts para envio de mensagens, reconexão, etc. |
| 2.3 | **Logs com níveis (debug, info, warn, error)** | Em produção, muitos logs poluem o console. Utilizar uma biblioteca de log ou implementar níveis. |
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

| # | Melhoria | Justificativa |
|---|----------|---------------|
| 4.1 | **Autenticação de jogadores** | Impedir que um usuário se passe por outro. Usar tokens gerados pelo host ou chave de sala. |
| 4.2 | **Validação de ações do host** | O host é a fonte da verdade, mas suas ações devem ser validadas (ex: não pode conceder KPI indevidamente). Atualmente já há alguma validação, mas pode ser reforçada. |
| 4.3 | **Criptografia de ponta a ponta** | PeerJS suporta `secure: true` para conexões WebRTC criptografadas. Ativar para proteção de dados sensíveis. |

---

## 5. Experiência do Usuário (UX/UI)

| # | Melhoria | Justificativa |
|---|----------|---------------|
| 5.1 | **Feedback sonoro** | Sons para início de rodada, acerto/erro, eventos, fim de jogo, melhorando imersão. |
| 5.2 | **Animações mais suaves** | Transições entre telas e modais com animações CSS já existem, mas podem ser aprimoradas (ex: uso de `will-change`). |
| 5.3 | **Indicadores de carregamento** | Mostrar spinners durante reconexão, carregamento de perguntas, etc. |
| 5.4 | **Acessibilidade** | Adicionar atributos ARIA, navegação por teclado (TAB, Enter), contraste adequado para daltonismo. |
| 5.5 | **Modo noturno** | Já tem tema escuro; poderia ter opção de claro. |
| 5.6 | **Tutorial interativo** | Para novos jogadores, um passo a passo explicando mecânicas (recursos, KPI, fases). |

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
| 7.2 | **Testes unitários e de integração** | Implementar testes com Jest + Testing Library para UI e lógica. A falta de testes torna o código frágil. |
| 7.3 | **Linter (ESLint) e formatter (Prettier)** | Manter estilo consistente e evitar erros comuns. |
| 7.4 | **Extrair constantes e mensagens** | Strings de UI (ex: "Aguardando o host...") centralizadas em um arquivo de localização para facilitar internacionalização. |
| 7.5 | **Separar helpers em arquivos próprios** | Funções como `buildRanking` poderiam estar em um arquivo `ranking-utils.js`. |

---

## 8. Funcionalidades Futuras

| # | Melhoria | Justificativa |
|---|----------|---------------|
| 8.1 | **Salvamento do histórico da partida** | Armazenar logs de ações para replay ou análise posterior. |
| 8.2 | **Modo de jogo avançado** | Diferentes cenários (ex: tempo reduzido, recursos variáveis). |
| 8.3 | **Integração com backend** | Para ranking global, estatísticas, salas persistentes. |
| 8.4 | **Suporte a múltiplos idiomas (i18n)** | Preparar arquivos de tradução para português, inglês, etc. |
| 8.5 | **Compartilhamento de tela ou chat** | Melhorar interação social entre jogadores. |

- Botão iniciar rodada antes de o evento surgir magicamente na tela
- kpi quem acerta pergunta + 5 e quem assessora + 5
- arrumar assessoria
- qrcode no tabuleiro
- corte de verbas -2 pra todo mundo, menos 1 para quem acerta a pergunta
- apoio da alta gestão (+1 recurso somente para quem acerta)