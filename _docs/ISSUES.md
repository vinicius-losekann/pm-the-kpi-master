# 🐛 Issues Conhecidas

Registro de bugs em aberto ou em investigação. Bugs da migração inicial
(Fases 0–7: BUG-001 a BUG-007, REGRESSÃO-001/002, SEC-001/002,
ESCLARECIMENTO-001) foram corrigidos, estão estáveis há tempo e seu
histórico técnico completo (causa raiz, correção aplicada) foi movido
para `../CHANGELOG.md` — este arquivo agora foca em bugs atuais e nos
corrigidos recentemente (Fase D).

---

## Em investigação

### BUG-021: F5 na tela de fim de jogo volta para a partida

- **Status:** 🔍 Suspeita, encontrada por leitura do código (03/10/2026),
  ainda não conferida no navegador
- **Local:** `utils/persistence.js` (`saveState()`/`tryRestoreState()`)
  e `network/messageHandler.js` (`addPlayer()` → `state-sync`)
- **Sintoma esperado:** (1) o host dá F5 com o ranking final na tela e
  volta para a tela de jogo; se a partida acabou porque alguém completou
  a última fase, uma dupla nova é sorteada e a partida recomeça; (2) um
  guest que dá F5 (ou reconecta) no fim de jogo volta para a tela de
  jogo em vez do ranking.
- **Causa provável:** `gameOver` não é gravado no estado salvo nem vai
  no `state-sync`; a retomada (`retomarPartidaAposRecarregar()`) vê
  `gameStarted` sem `gameOver` e, sem rodada, chama `pickNewPair()`.
- **Próximo passo:** frente própria, com teste (F5 do host e volta de
  guest no fim de jogo).

---

## Fase D (conexão, identidade e troca de host) — corrigidos

Encontrados nos testes da Fase D (automatizados e com navegadores reais).
Cada correção veio com teste automatizado — os números (T…, E…) são os
de `tests/faseD.test.js` e `tests/e2e`; o mapa completo está em
`testes-conexao.md`.

| ID | Sintoma | Causa | Correção |
|---|---|---|---|
| SEC-003 | Alguém entrando com o nome do host tomava o lugar dele na lista | `addPlayer()` tratava o nome do host como reconexão (o host não tem conexão consigo mesmo) | D1a: nome do host sempre "em uso" (`name-taken`) — T3b |
| SEC-004 | Quem soubesse o nome de um jogador desconectado entrava no lugar dele e herdava KPI, recursos e fase | Reconexão conferia só o nome | D2: token de identidade por sala; o host guarda só o hash e exige o mesmo token (`identity-mismatch`) — T22–T29 |
| BUG-008 | Troca de host falhava: o guest que tentava achar a sala nova perdia a própria conexão | Qualquer erro do PeerJS (inclusive o esperado `peer-unavailable`) destruía o peer local | D1b: depois de aberto, erro não destrói mais o peer; tentativa sem peer conta como falha — T19, T20 |
| BUG-009 | Rodada travada depois da troca de host | O novo host continuava uma pergunta sem ter o gabarito | D1b: sem gabarito, a pergunta é descartada e a partida segue com o mesmo evento — T21, T21b |
| BUG-010 | Relógio de quem reconectava andava de 10 em 10 segundos | A contagem local só era ligada no início da partida | D2b: `iniciarRelogio()` também na reconexão — T30, T31 |
| BUG-011 | Quem reconectava via de novo uma pergunta já respondida | O `state-sync` não dizia se a rodada estava encerrada, pausada ou entre duas duplas | D2b: `state-sync` leva a situação da rodada — T32–T34 |
| BUG-012 | Erro "cannot reconnect" 3s depois de assumir como host | O aviso de desconexão do peer antigo mandava reconectar o peer novo | D3c: só reconecta o peer em uso e de fato desconectado — T46 |
| BUG-013 | Depois de uma troca de host, entrar pela tela inicial dava "Sala não encontrada" | A procura olhava só o ID base da sala (a sala muda para `-h1`, `-h2`...) | D3c: procura o ID base e as versões seguintes ao mesmo tempo — T44, T45, T47 · E3 |
| BUG-014 (B1) | Depois de um "Sair da partida", o host não conseguia iniciar outra com 2 jogadores | "Voltar ao lobby" não zerava a marca de "aguardando no lobby" | D3d: voltar ao lobby zera os jogadores — T48 · E8 |
| BUG-015 (B2) | Depois de uma troca de host, uma rodada nova começava sozinha ou alguém respondia duas vezes | Só o host sabia quem já tinha respondido na rodada | D3e: todos recebem a lista (`respondidos`) — T35, T49–T52 · E4, E5 |
| BUG-016 (B3) | F5 do host com a rodada encerrada: telas erradas ("Aguardando início da rodada...", última dupla como em andamento) | "Rodada encerrada" não era salvo; a retomada reabria a última rodada | D3f: estado salvo leva a situação; `retomarPartidaAposRecarregar()` — T53, T57 · E9 |
| BUG-017 (B4) | F5 do host logo depois de uma resposta: partida travada | O aviso para seguir à próxima dupla (3s depois) se perdia com a página | D3f: a retomada segue para a próxima dupla, encerra a rodada ou encerra a partida — T54, T58 · E10 |
| BUG-018 (B5) | F5 do host com a partida pausada: outro evento sorteado, efeitos reaplicados | A pausa não era salva | D3f: continua pausada com o mesmo evento — T55, T57 · E11 |
| BUG-019 | F5 do host com um pedido de assessoria sem resposta: rodada presa (quem responde com os botões travados, "Nova Rodada" bloqueado) até acabar o tempo da partida | O prazo de 20s do assessor (`setTimeout`) se perdia com a página, e o assessor perdia a pergunta ao reconectar (a reconexão fecha os modais); a resposta ficava guardada esperando para sempre | O F5 cancela o pedido pendente (quem responde pode pedir de novo, como numa troca de host); resposta já guardada é processada — T59, T60 · E12 |
| BUG-020 | F5 do host fora da dupla com a pergunta aberta: o host via a área da pergunta em vez de "Fulano pergunta para Beltrano"; as etiquetas de domínio e área ficavam vazias depois do F5 do host e para quem voltava à partida | A retomada não olhava o papel do host; a pergunta guardada na rodada (estado salvo, `state-sync`) não tinha os nomes de domínio e área — só a mensagem `question` tinha | A retomada mostra a tela de espectador fora da dupla; a pergunta da rodada guarda domínio e área — T64, T65 |

---

## REGRESSÃO-003: campo de gabarito ainda blindado pelo nome antigo após rename do schema

- **Status:** ✅ Corrigido na Fase 8, antes de qualquer impacto ao usuário
- **Detectado em:** Fase 8 (rename de nomenclatura PMBOK 8ª ed.), ao caçar
  cada ocorrência do campo antigo `correta` pelo código inteiro após a
  migração de `data/questions.pt-BR.json` para chaves em inglês
  (`correta` → `correct`, entre outras — ver `architecture.md`)
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