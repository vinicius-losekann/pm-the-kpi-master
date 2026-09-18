# 🐛 Issues Conhecidas

Registro de bugs em aberto ou em investigação. Bugs da migração inicial
(Fases 0–7: BUG-001 a BUG-007, REGRESSÃO-001/002, SEC-001/002,
ESCLARECIMENTO-001) foram corrigidos, estão estáveis há tempo e seu
histórico técnico completo (causa raiz, correção aplicada) foi movido
para `CHANGELOG.md` — este arquivo agora foca em bugs atuais.

---

## REGRESSÃO-003: campo de gabarito ainda blindado pelo nome antigo após rename do schema

- **Status:** ✅ Corrigido na Fase 8, antes de qualquer impacto ao usuário
- **Detectado em:** Fase 8 (rename de nomenclatura PMBOK 8ª ed.), ao caçar
  cada ocorrência do campo antigo `correta` pelo código inteiro após a
  migração de `data/questions.pt-BR.json` para chaves em inglês
  (`correta` → `correct`, entre outras — ver `ARCHITECTURE.md`)
- **Local:** `js/network/messageHandler.js` → `addPlayer()`, montagem de
  `currentRoundForSync`
- **O que aconteceu:** ao sincronizar o estado da partida para um jogador
  entrando durante uma rodada já em andamento, o código blinda a resposta
  correta antes de enviar (pra quem não é o Perguntador não receber o
  gabarito). Essa blindagem apagava explicitamente o campo `correta:
  undefined` — só que o rename do schema já tinha trocado esse campo para
  `correct` em todo o resto do código. Como o `{...spread, correta:
  undefined}` cria um campo `correta` NOVO (que não existe mais no
  objeto) em vez de apagar o `correct` existente, o campo `correct` com o
  gabarito real continuaria presente no objeto enviado — a resposta certa
  vazaria para qualquer jogador entrando no meio de uma rodada.
- **Correção aplicada:** `correta: undefined` → `correct: undefined` no
  mesmo ponto.
- **Lição reforçada:** mesmo padrão de risco das correções da migração —
  renomear um campo usado em vários arquivos tem um jeito de deixar para
  trás um ponto que "apaga o campo errado" em vez de dar erro visível.
  Buscar cada ocorrência do nome antigo pelo código inteiro depois de um
  rename continua sendo o jeito de pegar isso antes de virar bug real.

---

## Como usar este arquivo

- Ao encontrar um bug durante os testes de qualquer fase, adicione uma entrada
  aqui **antes de decidir se corrige na hora ou depois**.
- Sempre registre: status, local no código, sintoma, causa raiz (se souber) e
  fase prevista de correção.
- Ao corrigir, mude o status para `✅ Corrigido` e anote a fase/data em que
  foi resolvido.