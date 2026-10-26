# Changelog

> **Contém:** as mudanças notáveis do projeto, em blocos por fase (o mais
> novo primeiro; o do topo fica aberto até a fase fechar), com as seções
> do [Keep a Changelog](https://keepachangelog.com/pt-BR/1.0.0/):
> `Added`, `Changed`, `Removed`, `Fixed`, `Security`, `Known issues`.
> **Não contém:** passo a passo técnico (→ `_docs/architecture.md`) nem a
> descrição completa dos bugs corrigidos a partir da Fase D (→
> `_docs/issues.md`); os da migração inicial (Fases 0–7) estão resumidos
> aqui. Blocos fechados não se reescrevem: os nomes citados neles são os
> da época.

---

## [Sem versão] — Em andamento (depois da Fase E)

### Added
- **Desempate do ranking:** com o mesmo KPI Final, fica à frente quem
  avançou mais nas áreas foco, depois quem tem mais atividades e, por
  fim, quem tem mais KPI acumulado; empate em tudo divide a posição e a
  medalha (🥇 🥇 🥉). A tela final avisa o critério quando há empate no
  KPI Final. Antes, valia a ordem da lista (o host primeiro). Testes
  T100–T102.
- **Simulador de partidas para balanceamento:** workflow "Simulação de
  partidas" (botão "Run workflow"), com robôs no lugar dos jogadores e as
  regras reais do jogo (`tests/simulation/`). Mostra duração, recursos,
  economia, eventos e justiça, e compara com uma troca do config
  ("cenário B"). Não muda o jogo publicado. Testes T93–T99.
- **"Fazer a pergunta":** no início de cada pergunta, só o Perguntador a
  vê, com o gabarito e o botão "🗣️ Fazer a pergunta"; quem responde vê o
  aviso de quem vai perguntar. O Perguntador lê em voz alta e clica (sem
  o clique, ela vai sozinha em 30 segundos); só então quem responde vê as
  alternativas e o tempo começa a contar. Veio da partida de teste na
  UFSM, em que tudo parecia rápido demais e quem perguntava não sabia que
  era a vez dele. A versão das mensagens entre os jogadores (protocolo)
  passou da 8 para a 9. Testes T130–T133, T136, T138–T141 e cenário E23.
- **Aviso de tempo esgotado:** quando o tempo de resposta acaba, o
  resultado mostra "⌛ Tempo esgotado!" em vez de "Errou"; continua
  contando como erro. Teste T137.
- **Página de teste de conexão** (`firebase-check.html`, fora do jogo,
  sem link nele): cria sala, entra e troca mensagens pelo Firebase,
  mostrando o tempo de ida e volta, para conferir antes da aula se a
  rede de cada lugar deixa o jogo funcionar (roteiro M21 em
  `_docs/manual-test-scripts.md`). Testes T143–T153 e cenários E24 e
  E25.
- **Troca de host que continua a partida:** se o host cai (fecha a aba,
  perde a rede, celular bloqueado), outro jogador assume cerca de 10
  segundos depois do último sinal dele; a tela de quem assume recarrega
  uma vez, todos veem "Fulano agora é o host" e a mesma pergunta
  continua, com o tempo sem host devolvido aos prazos da rodada. A troca
  é decidida pelo banco: só um assume, mesmo que vários tentem juntos. O
  host antigo que volta entra como jogador comum, com KPI e recursos.
  Testes T192–T204 e cenários E26 e E31–E36.
- São 167 testes de lógica em 15 arquivos e 28 cenários no navegador.

### Changed
- **Estouro de orçamento:** o recurso pode ficar negativo. Errar com 0
  recursos deixa em −1 (e com −1, em −2), e o Corte de Orçamento também
  tira de quem tem 0. O KPI Final continua `KPI + recursos × 5`, então o
  negativo desconta. O card do jogador mostra o negativo em vermelho, com
  o rótulo "Estouro", e a lista de jogadores também em vermelho. Antes,
  com 0 recursos, errar e o corte não custavam nada. Testes T107–T110.
- **Eventos pelo tabuleiro:** o Patrocinador Generoso dá +1 recurso a
  quem concluiu menos atividades (empate: quem tem menos recursos; empate
  em tudo: todos os empatados), e na Reestruturação quem concluiu mais
  atividades cede 1 recurso a quem concluiu menos (empate: cede quem tem
  mais recursos, recebe quem tem menos; empate em tudo de um lado:
  sorteio). A Reestruturação não acontece se todos estão empatados ou se
  quem cederia está com 0 recursos ou menos. O aviso do evento passa a
  mostrar quem foi atingido. Antes, os dois eventos olhavam só os
  recursos. Testes T111–T113.
- **Assessoria com honorário:** só pede assessoria quem tem 1 recurso ou
  mais (com 0 ou menos, a opção some e o pedido é recusado). Nada é pago
  no pedido: se quem respondeu seguiu a sugestão e acertou, paga 1
  recurso de honorário ao assessor; nos outros casos, ninguém paga. Sai o
  bônus de +5 KPI do assessor (o honorário vale o mesmo no KPI Final). Os
  dois veem o honorário na tela. A versão das mensagens entre os
  jogadores (protocolo) passou da 7 para a 8. Testes T114–T117.
- **Pedido de ajuda como fiança:** a ajuda passa a ser pedida na vez de
  responder, por quem está com 0 recursos ou menos, no lugar da
  assessoria (o mesmo botão vira "Pedir Ajuda"; um apoio por pergunta,
  fora do Encerramento). Quem pede escolhe um colega com recurso, que tem
  20 segundos para sugerir ou recusar. Seguiu a sugestão e acertou: quem
  ajudou ganha 2 recursos do patrocinador. Seguiu e errou: quem ajudou
  cobre o erro com 1 recurso, e quem pediu não perde (com a Reserva de
  Contingência, ninguém perde). Saem a fila automática e a doação de
  recurso por 10 KPI (e, com elas, o caso do BUG-024): o KPI agora só vem
  dos acertos. O estado salvo passou da versão 6 para a 7; o protocolo
  continua na 8. Testes T118–T125 e o cenário E19 no navegador.
- **Simulador com robôs que decidem:** cada robô "sabe" ou não a resposta
  pela chance do perfil (sozinho, continua acertando a chance do perfil);
  só quem não sabe pede apoio, chama de preferência quem acerta mais, e
  quem é chamado aceita quando sabe. O relatório passa a medir estouro de
  orçamento, menor recurso, apoio pedido nas perguntas difíceis, partidas
  com ajuda, honorários do vencedor e o apoio por perfil. Antes, os robôs
  pediam apoio por sorteio, sem olhar se sabiam. Testes T126–T129.
- **Economia calibrada pelo simulador:** cada jogador continua começando
  com 10 recursos, e a recompensa de quem ajuda fica em 2. Com 10, o
  estouro e o pedido de ajuda acontecem com quem erra muito: a ajuda é
  rede de segurança, não algo de toda partida. Com menos recursos
  iniciais, um em cada três jogadores entraria em estouro.
- **Documentação reorganizada:** cada documento abre com o que contém e
  o que não contém; os nomes dos arquivos passaram para o inglês
  (`_docs/connection-tests.md`, `_docs/issues.md`); os roteiros dos
  testes manuais saíram do checklist para `_docs/manual-test-scripts.md`;
  o README aponta para `_docs/architecture.md` em vez de repetir a
  árvore de arquivos; o roadmap ganhou a seção "Itens retirados" e as
  ideias 8.6 a 8.8.
- **Prazos:** quem responde tem 1 minuto e 30 segundos (antes, 1 minuto)
  e quem é chamado para assessorar ou ajudar tem 1 minuto (antes, 20
  segundos). Teste T142.
- **Sincronia pelo Firebase no lugar da conexão direta (P2P):** na
  partida de teste da UFSM, um celular no 5G não achou a sala e quem caiu
  não conseguia voltar, porque a conexão direta entre navegadores (PeerJS)
  esbarra no bloqueio das redes de instituição e das operadoras móveis.
  Agora todos conversam pelo Firebase (plano gratuito: login anônimo e
  Realtime Database), que passa por HTTPS, e o estado da partida fica
  guardado no banco, não só no navegador do host. Para quem joga:
  - quem cai volta sozinho em 1–2 segundos quando a conexão volta;
  - o F5 de quem está na dupla não sorteia outra dupla: a mesma pergunta
    continua, com o mesmo prazo;
  - o F5 do host continua a partida com o relógio e os prazos de onde
    estavam (antes, os prazos voltavam do zero), e um pedido de
    assessoria ou de ajuda sem resposta continua valendo;
  - todos veem o mesmo tempo, mesmo com o relógio do aparelho errado;
  - quem fecha a aba, bloqueia a tela ou fica sem rede sai do sorteio
    depois de 20 segundos sem sinal (antes, na hora): um F5 ou uma queda
    curta não tira ninguém da rodada;
  - a identidade de cada jogador passa a ser o login anônimo do
    navegador; a partida salva vale enquanto a sala existir (antes, 5
    minutos depois de todos saírem);
  - do clique ao resultado, cerca de meio segundo (antes, ~0,1 s).
  O protocolo passou da 9 para a 12 e o estado salvo da 7 para a 9: quem
  estiver com a página antiga aberta é recusado ao entrar na sala e vê o
  aviso para recarregar. Testes T154–T191 e cenários E26–E30. Conclui o
  roadmap 2.9, o 2.6 (relógio pela hora de término) e o 2.5 (troca de
  host sem dois hosts ao mesmo tempo).

### Fixed
- **Perguntador que volta à sala ficava sem a pergunta (BUG-035):** quem
  voltava (por exemplo, o host antigo depois de uma troca de host) e caía
  direto como Perguntador numa dupla reaberta podia receber a pergunta
  antes do aviso da dupla; a tela dele ficava sem a pergunta e ela "ia
  sozinha" pelo prazo. Agora a pergunta leva o número da dupla e espera o
  aviso dela. Testes T219 e T220.
- **Queda curta de quem está na dupla perdia a pergunta (BUG-033):** no
  celular, a conexão com o Firebase leva de 18 a 60 segundos para voltar
  depois que a rede volta, e quase toda queda curta de quem perguntava ou
  respondia descartava a pergunta. Agora a dupla fica guardada até o fim da
  rodada (mesma pergunta, o tempo de resposta que faltava): todos veem por
  alguns segundos "📴 Fulano caiu — a pergunta dele fica para o fim da
  rodada", a partida segue com outras duplas e, quando ele volta, a dupla
  dele é a próxima. Se todos os outros já responderam e ele não voltou, a
  rodada espera: o host vê "Esperando Fulano voltar (caiu há m:ss)" e pode
  seguir sem ele no "Nova Rodada" ou, se quem caiu foi quem pergunta,
  passar a pergunta para outra pessoa. A tela do host mostra "👑 Você é o
  host", e a lista de jogadores, o 👑 ao lado do host. A versão das
  mensagens entre os jogadores (protocolo) passou da 12 para a 13 e a do
  estado salvo, da 9 para a 10. Testes T211–T213, T215–T218 e cenários E39
  e E40.
- **Resposta mandada sem conexão podia valer para outra pergunta
  (BUG-034):** cada dupla tem agora um número, que vai na resposta e no
  "Fazer a pergunta"; o host ignora o que chega de outra dupla. Teste T214.
- **Evento repetido quando alguém da dupla cai (BUG-032):** quando quem
  perguntava ou respondia caía ou saía da partida, a dupla nova vinha com
  o aviso de outro evento, e o efeito dele era aplicado de novo (outro
  recurso a mais, outro corte). Agora a dupla nova continua a mesma
  rodada, com o mesmo evento; o evento só sai no "Nova Rodada". O console
  de cada jogador mostra o número da rodada ("🎯 Rodada N") a cada dupla.
  Testes T209 e T210.
- **Jogador desconectado com a página aberta (BUG-030):** quem deixava a
  janela do jogo escondida por alguns minutos (atrás de outra janela ou
  minimizada) aparecia como desconectado (📴) e saía do sorteio, e só
  voltava dando F5, mesmo jogando de novo com a janela visível. Agora o
  host o traz de volta sozinho, uns 2 a 4 segundos depois de a janela
  voltar a ficar visível; se a partida estava pausada por falta dele, ela
  continua. Testes T205–T208 e cenário E38 no navegador.
- **Ranking e jogadores em tela estreita (BUG-029):** com a janela abaixo
  de 1200 px (notebook com meia tela, tablet, celular), o ranking e a
  lista de jogadores sumiam durante a partida. Agora ficam abaixo da
  pergunta e, no celular, depois do perfil e do "Nova Rodada"; o "Sair
  da Partida" e o "Encerrar Partida" vão para o fim da página.
  Cenário E37 no navegador.
- **Tempo de quem responde durante o apoio (BUG-028):** com a assessoria
  ou a ajuda pendente, o contador na tela continuava descendo e podia
  chegar a zero, embora o prazo de verdade estivesse parado; no fim do
  apoio, o prazo voltava inteiro. Agora o contador para junto e, no fim,
  os dois continuam de onde pararam. Testes T134 e T135.
- **Telas pequenas (BUG-025 a BUG-027):** com a janela entre 769 e
  1200 px, os números de KPI e de recursos ("Estouro") saíam do card do
  jogador; agora descem para uma segunda linha. No celular, a janela
  "Sua vez de responder!" ficava maior que a tela e cortava o fim (com o
  botão de assessoria ou de ajuda); agora toda janela cabe na tela e
  rola por dentro. No ranking final, o detalhe de cada jogador fica numa
  linha própria, abaixo do nome. Cenários E20–E22 no navegador.
- **Dois pedidos de ajuda ao mesmo tempo (BUG-024):** o segundo apagava o
  primeiro, e a doação aceita para o primeiro ia para o segundo. Agora é
  um pedido por vez: quem pede enquanto outro jogador está pedindo vê um
  aviso e tenta de novo depois, e a doação sempre vai para quem a oferta
  foi feita. A versão das mensagens entre os jogadores (protocolo) passou
  da 6 para a 7: quem estiver com a página antiga aberta é recusado ao
  entrar na sala e vê o aviso para recarregar. Testes T103–T106.
- **Detalhe do ranking final (NOTA-008):** o KPI acumulado de cada
  jogador é descrito como "acertos, ajudas e assessorias"; antes citava
  vendas e compras, do mercado de recursos que não existe mais. Com o
  pedido de ajuda como fiança, o texto passou a "acertos", porque o KPI
  acumulado só vem do acerto.

### Removed
- **PeerJS:** a conexão direta, a procura da sala nas versões `-h1`,
  `-h2`... depois de uma troca de host, o token de identidade por sala
  (`js/utils/identity.js`), a janela de 5 minutos da partida salva no
  navegador e, nos testes, o servidor PeerJS local e os pacotes `peer` e
  `peerjs`. Saiu com eles a janela de menos de 1 s com dois hosts.

### Security
- **SEC-005:** quem entrava ou voltava à sala podia ler, pelo console do
  navegador, a resposta certa de qualquer pergunta da partida (os
  baralhos iam no estado mandado a ele). Agora o estado vai sem os
  baralhos e sem a resposta guardada de quem responde, e o gabarito da
  pergunta da vez só vai para o Perguntador. Teste T186.
- As regras do banco (`database.rules.json`) decidem quem lê e grava o
  quê: só o host lê o estado completo da partida, cada um grava só o
  próprio sinal e os próprios pedidos, e a troca de host só vale com o
  host antigo parado há mais de 5 segundos. Conferidas no emulador pelos
  cenários E25 e E26.

### Known issues
- Quem fecha a aba sai da lista do lobby só ~20 segundos depois, e a
  sala fica ~10 segundos sem host numa troca. Com a aba do host escondida
  por mais de 5 minutos, o Chrome e o Edge espaçam o sinal de vida dele, e
  os outros podem tomar o host (conferir no teste manual M18). No Windows,
  a janela do Edge coberta por inteiro por outra janela conta como
  escondida: o professor não deve ser o host pelo Edge. Lista completa em
  `_docs/connection-tests.md`, seção 5.

---

## [Sem versão] - 2026-10-05 — Fase E: identificadores do código em inglês

Os nomes do código passaram para o inglês: funções, variáveis, campos do
estado e das mensagens, chaves de configuração e dos textos, IDs e classes
do HTML/CSS. Todos seguem o glossário de `_docs/conventions.md`. Os
comentários continuam em português. **Para quem joga, nada muda na tela:**
textos, regras e prazos são os mesmos.

**Atualização no meio de uma partida:** o estado salvo no navegador passou
da versão 1 para a 6, e a versão das mensagens entre os jogadores
(protocolo) também passou da 1 para a 6. Uma partida salva antes da
atualização é convertida quando a página é recarregada. Quem ainda estiver
com a página antiga aberta é recusado ao entrar na sala e vê um aviso para
recarregar a página.

Os nomes citados nas entradas anteriores deste arquivo (ex.: `CONFIG.JOGO`,
`retomarPartidaAposRecarregar()`) são os de antes da tradução.

### Added
- **Versão do jogo na entrada da sala:** quem entra com outra versão é
  recusado (`version-mismatch`) e recebe o aviso para recarregar a página.
  Antes, a partida travava sem aviso quando, logo depois de uma atualização
  do site, uns jogadores rodavam o código novo e outros o antigo.
- **Conversão do estado salvo** das versões 1 a 5 para a 6
  (`js/utils/persistence.js`), um passo por versão.
- **Testes T76–T91:** são 94 testes de lógica em 9 arquivos e 17 cenários
  no navegador.

### Changed
| Etapa | O que mudou | Estado salvo | Protocolo |
|---|---|---|---|
| E1 | Funções, parâmetros e variáveis em todo o `js/` e nos testes (ex.: `sortearPergunta` → `drawQuestion`; "fase" → `focusArea`) | — | — |
| E2a | Versão do protocolo na entrada da sala | — | 1 |
| E2b | Rodada e partida (`answeredThisRound`, `roundEnded`, `matchPaused`, `finalRanking`, `decks`, `asker`/`answerer`) | 2 | 2 |
| E2c | Jogador e ranking (`resources`, `focusArea`, `position`, `finalKpi`) | 3 | 3 |
| E2d | Assessoria e pedido de ajuda (`advisory`, `helpQueue`, mensagens `advisory-*`/`help-*`, motivos de recusa) | 4 | 4 |
| E3a | Chaves do CONFIG (`GAME`, `FOCUS_AREAS`, `STARTING_RESOURCES`, `KPI.*`); a oferta do pedido de ajuda ganhou prazo próprio (`HELP_OFFER_TIMEOUT`), com os mesmos 20s | — | — |
| E3b | Chaves e marcadores dos textos da tela (`js/locales/pt-BR.js`) | — | — |
| E3c | Campos dos eventos (`data/events.json`: `events`, `title`, `description`, efeitos) | 5 | 5 |
| E3d | Áreas foco: `focusAreas` no JSON das perguntas e IDs `initiating`, `planning`, `executing`, `monitoringControlling`, `closing` (o nome na tela não muda) | 6 | 6 |
| E4 | IDs do `game.html`, classes do `style.css` e atributos `data-*` | — | — |

### Removed
- Regras do `css/style.css` que nenhuma tela usava, encontradas na E4
  (NOTA-006 em `_docs/issues.md`). Não tinham efeito para quem joga. O
  T92 (95 testes de lógica a partir daqui) confere que o CSS não volta a
  ter regra sem uso.

---

## [Sem versão] - 2026-10-03 — Fase D: conexão, identidade e troca de host

Detalhes de cada bug corrigido (sintoma, causa e testes) em
`_docs/issues.md`; mapa de casos cobertos e testes manuais pendentes em
`_docs/connection-tests.md`.

**Fechada em 18/10/2026 sem os testes manuais P1** M9 (redes
diferentes), M7 (queda de rede real) e M8 (celular com tela bloqueada):
antes deles, a conexão direta (P2P) foi trocada pelo Firebase (bloco
acima). O M9 perdeu o objeto; o M7 e o M8 foram reescritos para o
Firebase, em `_docs/manual-test-scripts.md`.

### Added
- **Sala travada durante a partida:** nome novo é recusado; só volta
  quem já estava na partida.
- **Jogador desconectado:** quem cai no meio da partida continua na
  lista (📴), com KPI, recursos, fase e vaga preservados, fora do
  sorteio até voltar.
- **Partida pausada** quando faltam jogadores conectados (mas não
  jogadores da partida); retoma sozinha, com o mesmo evento, quando
  alguém volta.
- **Identidade por sala:** cada navegador gera um token por sala
  (`js/utils/identity.js`); a reconexão exige o mesmo token, não só o
  nome. O host guarda só o hash (SHA-256 próprio, que funciona também
  fora de HTTPS).
- **Troca de host:** os jogadores esperam o host voltar por até 10s
  (`CONFIG.JOGO.HOST_TIMEOUT`); depois, outro assume numa versão nova
  da sala (`-h1`, `-h2`...). O host antigo volta como jogador comum.
  A sala é encontrada em qualquer versão, inclusive pela tela inicial
  (`js/network/hostSearch.js`).
- **Opções do PeerJS num lugar só** (`CONFIG.PEER`).
- **Versão no estado salvo:** o estado guardado no navegador tem um
  número de versão e passa por migração antes de ser restaurado
  (`js/utils/persistence.js`) — pré-requisito da Fase E.
- **Fim de jogo guardado:** um F5 na tela final volta ao mesmo ranking;
  quem cai no fim de jogo pode voltar à sala e vê o ranking.
- **Testes automatizados** no GitHub Actions, a cada push: lógica do
  jogo com rede simulada (`tests/logic`, 78 testes em 8 arquivos por
  assunto) e o jogo real em várias janelas do Chromium
  (`tests/browser`, 17 cenários).
- **Roteiros dos testes manuais P1** (M9, M7, M8), substituídos depois
  pelos roteiros sobre o Firebase em `_docs/manual-test-scripts.md`.

### Changed
- Saída da página (fechar aba, F5) encerra as conexões na hora, para os
  outros perceberem sem esperar o tempo limite da rede.
- Quem reconecta volta com o relógio contando e na situação certa da
  rodada (em andamento, encerrada, pausada ou entre duas duplas).
- Depois de uma troca de host, a rodada continua de onde parou (todos
  sabem quem já respondeu).
- F5 do host em qualquer momento da partida faz o que aconteceria sem o
  F5. A retomada saiu de `js/main.js` para
  `js/engine/sessionEngine.js` (`retomarPartidaAposRecarregar()`).
- "Voltar ao lobby" zera os jogadores e tira da lista quem estava
  desconectado.
- Quem assume como host usa a mesma contagem do relógio do início da
  partida; saiu o aviso de troca de host que não chegava a ninguém.
- Quem caiu fica fora do pedido de ajuda e não pode ser chamado como
  assessor.
- Mais espaço entre o lembrete do tabuleiro e o botão OK.
- Na tela, "Fases" virou **"Áreas Foco"** (nomenclatura do PMBOK 8 para os
  antigos grupos de processos), inclusive no aviso de assessoria da Área
  Foco Encerramento.
- **Banco de perguntas revisado pelo professor:** 5 perguntas retiradas,
  correções de texto nos enunciados e alternativas marcados (sem termos
  em inglês entre parênteses, "Segundo o PMBOK", "Áreas Foco") e
  gabarito redistribuído entre a, b, c e d (antes quase tudo era "b").
  São 71 perguntas, conferidas por teste (formato e equilíbrio do
  gabarito). As perguntas marcadas para substituir ficam para o
  professor.
- Testes reorganizados por assunto (`tests/logic`, `tests/browser`),
  com nomes de arquivos e funções em inglês.
- Limpeza: prazos (resposta, assessoria, pedido de ajuda) cancelados
  num lugar só; removidos código sem uso e `js/dev/debugTools.js`
  (tinha uma cópia própria das regras — um simulador de balanceamento
  com as regras reais está no roadmap, 7.9); comentários do código
  explicam só o funcionamento (fase, bug e roadmap ficam nos
  documentos).

### Fixed
- BUG-008 a BUG-018 (inclusive B1–B5 do checklist de conexão).
- BUG-019: F5 do host com um pedido de assessoria sem resposta travava
  a rodada.
- BUG-020: depois do F5, o host fora da dupla via a área da pergunta;
  etiquetas de domínio e área vazias.
- BUG-021: F5 na tela de fim de jogo recomeçava a partida (host) ou
  recusava o jogador (guest).
- BUG-022: pedido de ajuda e assessoria esperavam 20s por quem tinha
  caído.
- BUG-023: nome com "&" aparecia como "&amp;" no aviso de ajuda.

### Known issues
- As respostas das perguntas não são secretas: o arquivo
  `data/questions.pt-BR.json` é público no site e o baralho vai com o
  gabarito a quem reconecta. Ocultar está no roadmap (4.4); por ora,
  vale a regra da aula.

### Security
- **SEC-003:** o nome do host não pode mais ser tomado por quem entra.
- **SEC-004:** reconexão no lugar de um jogador desconectado exige o
  token de identidade dele.

---

## [Sem versão] - 2026-09-18

### Changed
- Reorganização de infraestrutura interna: consolidada a atualização de
  tela pós-mudança de estado de jogador (card de perfil, lista online,
  ranking), antes duplicada manualmente em 7 pontos do código, numa
  função única (`Game.ui.syncPlayerViews()`).
- Removido `js/utils/eventBus.js` (nunca usado). `js/utils/logger.js`
  mantido — religamento planejado para antes de rodar com múltiplas
  salas simultâneas em produção.
- `Game.core.*` documentado como a API pública oficial entre camadas de
  engine (comentários antigos sugeriam ser "compatibilidade temporária",
  o que não era mais verdade).
- Removidos arquivos órfãos: `js/index.js` (duplicado de
  `js/entry/roomEntry.js`) e `js/config/constants.js` (nunca preenchido).
- `data/questions.pt-BR.json`: schema renomeado para alinhar com a
  terminologia da 8ª edição do PMBOK e usar chaves em inglês,
  independentes do idioma do conteúdo (`areas`→`domains`,
  `grupos`→`areas`, `pergunta`→`question`, `alternativas`→`alternatives`,
  `correta`→`correct`, chaves de domínio como `governanca`→`governance`).
  Prepara o terreno para `questions.en-US.json`/`questions.es-ES.json`
  futuros sem precisar re-trabalhar o schema depois.
- Sistema de venda de recursos reescrito como "Pedido de Ajuda"
  (Fase 9). Motivado por feedback do piloto: o botão "Vender Recurso"
  ficava sempre visível e virou distração paralela ao quiz. Agora só
  quem está com 0 recursos vê o botão; ao pedir, o host monta uma fila
  automática (jogadores ativos com recurso, do maior pro menor) e
  pergunta um de cada vez, avançando sozinho a cada recusa/timeout —
  sem escolha manual de quem vender/comprar. Matemática da troca
  inalterada; `domain/tradeRules.js` reaproveitado sem mudança.
  Mensagem amigável (nunca "fim de jogo") quando ninguém pode ajudar ou
  falta KPI pra pedir, explicando os caminhos alternativos (Perguntador,
  Assessor, evento de Reserva de Contingência). Arquivos: `tradeEngine.js`,
  `tradeModal.js`, `controlsComponent.js`, `setup.js`,
  `profileComponent.js`, `messageHandler.js`, `debugTools.js`,
  `locales/pt-BR.js`, `game.html`, `sessionEngine.js`.
- Documentação técnica reunida em `_docs/` (`architecture.md`,
  `conventions.md`, `roadmap.md`, `issues.md`); `README.md` e
  `CHANGELOG.md` continuam na raiz.
- **Feedback do piloto com alunos, Fases A-C:**
  - **Fase A:** botões reordenados (Nova Rodada primeiro, Encerrar
    Partida discreto e separado no fim — reduz clique acidental no
    mobile); URL sem `/index.html` (`location.href` trocado por `'./'`
    em 5 pontos); modal de resultado ganhou lembrete de avançar no
    tabuleiro físico ao acertar.
  - **Fase B:** card de perfil (avatar/KPI/recursos/fase única/
    progresso) e card de Fases consolidados num só, com status por
    fase (completa/em andamento/não iniciada) derivado de
    `player.phase`+`player.activities`, sem estado novo — reduz
    quantidade de cards pra rolar no celular.
  - **Fase C (economia de recursos):** recursos iniciais 20 → 10;
    **acertar nunca gasta recurso** (antes gastava igual a errar);
    errar continua gastando 1, protegido pela Reserva de Contingência;
    **removido o "pular vez por falta de recurso"** — todo jogador
    ativo sempre tenta responder, recurso só trava em 0 (nunca
    negativo). A decisão de gastar recurso moveu de `answerEngine.js`
    para dentro de `domain/kpiRules.js` (campo `gastaRecurso`, antes
    calculado e nunca lido). `engine/turnEngine.js` também perdeu o
    filtro por recurso na escolha do Respondedor, que senão continuaria
    barrando jogador zerado de ser sorteado. `README.md` atualizado
    (a seção "Venda de Recursos" ainda descrevia o mercado livre da
    Fase 9 anterior — nunca tinha sido corrigida).

### Added
- Modais de resposta do Respondedor (`#modalResponderPergunta`) e do
  Assessor (`#modalAssessoriaQuestion`) agora mostram quem pergunta e
  quem responde na rodada — antes essa informação só existia no
  `#roundInfo` por trás do modal, pouco visível com o overlay aberto.
  Sem mudança de payload de rede (os dois já tinham acesso a
  `Game.state.currentRound.perguntador`/`.respondedor` via
  `'round-start'`).

### Fixed
- Corrigido um ponto em `messageHandler.js` que ainda blindava o gabarito
  pelo nome de campo antigo (`correta`) após o rename acima — sem a
  correção, a resposta certa vazaria para jogadores entrando no meio de
  uma rodada em andamento. Ver `REGRESSÃO-003` em `_docs/issues.md`.

---

## [Não datado] — Migração de Arquitetura (Fases 0–7)

### Changed
- Reestruturação completa do código: de um conjunto de arquivos monolíticos
  (`game-core.js`, `game-ui.js`, `game-network.js`, `game-state.js`) para uma
  arquitetura em camadas (`domain/`, `state/`, `engine/`, `network/`, `ui/`).
  Detalhes completos em `_docs/architecture.md`.
- Perguntas e eventos separados em arquivos distintos
  (`data/questions.pt-BR.json` + `data/events.json`), antes um único
  `data/questions.json`.
- Sistema de internacionalização (i18n) implementado e religado para pt-BR
  (`utils/i18n.js` + `locales/pt-BR.js`, 51 chaves).
- Sistema de Assessoria adicionado: jogadores fora da dupla ativa da rodada
  podem ser chamados para ajudar quem está respondendo.

### Fixed
- **BUG-001**: F5 no host trocava a pergunta da rodada em andamento em vez de restaurá-la.
- **BUG-002**: guest virava host indevidamente após F5 no host (falha de reconexão).
- **BUG-003**: card de perfil do host não atualizava (KPI/fase/atividades) após F5.
- **REGRESSÃO-001**: `resetAllBaralhos()` esquecida na extração de `game-core.js` (Fase 3), encontrada antes de gerar bug visível.
- **BUG-004/BUG-005**: modal de evento reaparecendo a cada pergunta; rodada avançando sozinha em vez de esperar o host clicar em "Nova Rodada".
- **REGRESSÃO-002**: wrappers de sorteio (`sortearPergunta`/`sortearEvento`) esquecidos na extração de `game-core.js`, quebravam `debugTools.js` silenciosamente.
- **BUG-006**: tela do host não atualizava quando ele era Perguntador, Respondedor ou Espectador.
- **BUG-007**: ranking do host não atualizava quando um guest respondia.
- **ESCLARECIMENTO-001**: diferença entre "+10 KPI" na modal e "+5" no ranking — comportamento intencional (custo de recurso descontado no ranking), não bug.

### Security
- **SEC-001**: XSS armazenado via nome de jogador, em 8 pontos de renderização.
- **SEC-002**: falsificação de identidade em mensagens de rede (um guest podia agir como outro jogador).

---

## [Sem versão] - 2026-08-12

### Fixed
- Evento neutro agora ocorre em ~50% das rodadas, como esperado.
- Venda de recursos: o comprador agora precisa aceitar a compra explicitamente.
- Modal de evento não fecha mais de forma abrupta quando um jogador clica em "sair".
- Garantido que todos os jogadores ativos respondam ao menos uma vez antes que
  algum jogador responda novamente (jogadores sem recursos são marcados como
  "turno usado" em `pickNewPair()`).
- Corrigido o botão "✕ Cancelar" do modal de Venda de Recurso, que não tinha
  funcionalidade.

### Changed
- README.md atualizado quanto ao número de eventos (5 → 6, incluindo o
  evento neutro e6).