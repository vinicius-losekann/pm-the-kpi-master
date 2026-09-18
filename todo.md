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
| 4.1 | **Autenticação de jogadores** | Impedir que um usuário se passe por outro de forma mais robusta que a verificação atual de `peerId` (ver `SEC-002`). Usar tokens gerados pelo host ou chave de sala. |
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

---

## 8. Funcionalidades Futuras

| # | Melhoria | Justificativa |
|---|----------|---------------|
| 8.1 | **QR code no tabuleiro** | Facilitar a entrada de jogadores em sala física, sem precisar digitar o código manualmente. |
| 8.4 | **Suporte a múltiplos idiomas (i18n)** | Criar `en-US.js` e `es-ES.js` seguindo o mesmo dicionário de `pt-BR.js` (51 chaves) e adicionar seletor de idioma na UI — infraestrutura já pronta, ver **NOTA-003** em `ARCHITECTURE.md`. Conteúdo das perguntas: `data/questions.pt-BR.json` já usa chaves de schema em inglês (Fase 8), então um `questions.en-US.json`/`questions.es-ES.json` futuro só precisa traduzir os valores, reusando as mesmas chaves de domínio — ver `ARCHITECTURE.md`. |

### Ideias de rebalanceamento a avaliar

> ⚠️ Estas três ideias **divergem das regras hoje implementadas e
> documentadas no README** (evento e2 "Corte de Orçamento" tira -1 recurso
> de todos incondicionalmente; e1 "Apoio da Alta Gestão" dá +1 para todos;
> acerto dá +10 KPI e bônus de assessoria +5 KPI, sem depender um do outro —
> ver `ESCLARECIMENTO-001` em `ISSUES.md`). Mantidas aqui como propostas de
> mudança de design, não como bugs.

- Corte de Orçamento: -2 para todos, exceto -1 para quem acertar a pergunta da rodada.
- Apoio da Alta Gestão: +1 recurso apenas para quem acertar a pergunta (hoje é para todos os ativos).
- KPI: acerto e assessoria valendo +5 cada, em vez do atual +10 (acerto) / +5 (assessoria).