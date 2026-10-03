# Testes de conexão — o que está coberto e o que falta

Mapa dos casos de conexão do jogo (entrada, queda, reconexão, troca de
host) com a situação de cada um. Serve de checklist antes de cada
deploy: nenhum item marcado **P1** pode ficar pendente.

**Legenda**

| Marca | Significado |
|---|---|
| 🤖 | Coberto por teste automatizado (`tests/faseD.test.js`, roda no GitHub Actions a cada push) |
| 🌐 | Coberto por teste de ponta a ponta (`tests/e2e`, jogo de verdade no Chromium, roda no GitHub Actions a cada push) |
| 👤 | Conferido em teste manual (navegadores reais, GitHub Pages) |
| ⬜ | Falta testar manualmente |
| 🐛 | Bug encontrado, ainda não corrigido |
| ⚠️ | Limitação conhecida (comportamento aceito por ora) |
| **P1** | Obrigatório antes do deploy · **P2** desejável |

> Os testes de `tests/faseD.test.js` simulam o PeerJS: garantem a
> **lógica** do jogo em cada situação. Os de ponta a ponta (`tests/e2e`)
> rodam o jogo de verdade em janelas separadas do Chromium, com um
> servidor PeerJS local — cobrem a conexão, mas não redes reais
> diferentes, celular nem outros navegadores. Esses continuam na lista
> manual.

---

## 1. Fluxo geral

```mermaid
flowchart TD
    A[Tela inicial] -->|Criar sala| B{Código livre?<br/>ID base e versões -h1..-h5}
    B -->|sim| C[Host abre a sala]
    B -->|não| B1[Já está em uso]
    A -->|Entrar| D{Procura a sala<br/>ID base e -h1..-h5}
    D -->|achou| E{Situação da sala}
    D -->|não achou| D1[Sala não encontrada]
    E -->|lobby| F[Entra como jogador novo]
    E -->|partida em andamento,<br/>nome da partida + token certo| G[Volta ao próprio lugar]
    E -->|nome novo ou token errado| E1[Recusado]

    G --> H[Jogando]
    F --> H
    C --> H

    H -->|guest cai| I[Fica desconectado na lista<br/>rodada dele é abortada<br/>pausa se faltar gente conectada]
    I -->|volta com o token| G

    H -->|host cai| J[Guests tentam o mesmo host<br/>por até 10s]
    J -->|host voltou - F5| K[Reconectam, sem troca de host]
    J -->|não voltou| L[Backup assume em -hN<br/>URL host=true]
    L --> M[Outros guests acham o novo host]
    L --> N[Host antigo vira jogador comum<br/>desconectado]
    N -->|reabre o link ou entra pela tela inicial| G

    H -->|guest sai da partida| O[Vai para o lobby<br/>se faltar jogador, a partida acaba]
    O --> P[Fim de jogo → Voltar ao lobby → Nova partida]

    classDef ok fill:#1e5631,color:#fff,stroke:#0f3
    classDef auto fill:#1f3b5c,color:#fff,stroke:#39f
    classDef bug fill:#6b1d1d,color:#fff,stroke:#f33
    class A,B,B1,D,D1,E,E1,F,G,H,I,J,L,M,N,O ok
    class C,K,P auto
```

Cores: **verde** = automatizado e conferido manualmente · **azul** =
só automatizado (falta o manual).

---

## 2. Casos cobertos por teste automatizado (66 testes)

### Entrada na sala e identidade
| Caso | Testes | Manual |
|---|---|---|
| Lobby: guest que cai sai da lista | 🤖 T1 | — |
| Partida em andamento: nome novo recusado | 🤖 T2, T9 | 👤 (nome com maiúsculas diferentes foi recusado) |
| Nome em uso por quem está conectado continua bloqueado | 🤖 T3 | — |
| Nome do próprio host recusado, host não perde o lugar | 🤖 T3b | — |
| Token por sala: criado uma vez, só o hash sai do navegador | 🤖 T22, T23, T24, T29 | — |
| Reconexão com token errado ou sem token recusada | 🤖 T25 | 👤 impostor em outro navegador recusado |
| Estado salvo antes do token (transição) | 🤖 T27 | — |
| Guest manda o token na 1ª conexão e nas reconexões | 🤖 T28 | 👤 |
| Tela inicial acha a sala migrada; sala inexistente e erro de rede com a mensagem certa | 🤖 T47 | 👤 entrou pelo código depois da troca de host |
| Criar sala com código de sala aberta ou de partida em andamento numa versão migrada: "já está em uso" em até 3s; código livre é aceito | 🤖 T47 · 🌐 E13 | ⬜ no Edge do Windows houve travamento de ~5s (seção 5) |

### Queda e volta de guest
| Caso | Testes | Manual |
|---|---|---|
| Espectador cai: fica na lista, fora do sorteio, volta com tudo | 🤖 T4 | — |
| Participante da rodada cai: rodada abortada, nova dupla | 🤖 T5 | — |
| Falta só conexão: partida pausa e retoma com o mesmo evento | 🤖 T6, T33 | — |
| Ciclo da rodada termina sem esperar o desconectado | 🤖 T8 | — |
| Guest volta com o relógio andando e sem reabrir pergunta já respondida | 🤖 T30–T34 | 👤 (diferença de ~1s entre relógios, esperada) |
| Sala cheia: 7º nome recusado no lobby; quem caiu consegue voltar | 🤖 T9 · 🌐 E16 | — (coberto por E16) |

### Queda e troca de host
| Caso | Testes | Manual |
|---|---|---|
| F5/fechar do host encerra as conexões sem mexer no jogo | 🤖 T12, T13 | — |
| Host volta dentro de 10s: guests reconectam, sem troca de host | 🤖 T38 · 🌐 E1 | — (coberto por E1) |
| F5 do host com a pergunta aberta: a mesma pergunta continua; relógio e prazo de resposta religados | 🤖 T56 · 🌐 E1 | — (coberto por E1) |
| F5 do host com a rodada encerrada: continua encerrada para todos, nada começa sozinho | 🤖 T53, T57 · 🌐 E9 | — (coberto por E9) |
| F5 do host logo depois de uma resposta: segue para a próxima dupla ou encerra a rodada; se a resposta completou a última fase, a partida termina | 🤖 T54, T58 · 🌐 E10 | — (coberto por E10) |
| F5 do host com a partida pausada: continua pausada com o mesmo evento e retoma quando alguém volta | 🤖 T55, T57 · 🌐 E11 | — (coberto por E11) |
| F5 do host com um pedido de assessoria sem resposta: o pedido é cancelado, quem responde pode pedir de novo e a rodada segue; assessoria já respondida continua valendo | 🤖 T59, T60 · 🌐 E12 | — (coberto por E12) |
| Host não volta: backup assume em ~10s, não antes | 🤖 T39, T40 · 🌐 E2 | 👤 |
| Backup desconectado é pulado, o próximo assume | 🤖 T10 | — |
| Novo host marca os outros como desconectados, pausa e retoma | 🤖 T17, T21, T21b | 👤 |
| Todos recebem quem já respondeu na rodada (resposta, nova dupla, reconexão) | 🤖 T49 | — |
| Troca de host com a rodada encerrada: continua encerrada, nada começa sozinho | 🤖 T35, T50 · 🌐 E5 | 👤 |
| Troca de host no meio da rodada: quem ia responder não perde a vez; ninguém responde duas vezes | 🤖 T50, T51 · 🌐 E4 | — (coberto por E4) |
| Novo host confere o token pelos hashes da lista | 🤖 T26 | — |
| Troca de host no lobby: os outros voltam como jogadores novos; host antigo pelo link antigo vira jogador comum | 🤖 T18 · 🌐 E14 | — (coberto por E14) |
| Duas trocas de host seguidas: sala em `-h2`, achada pela tela inicial e pelo link antigo do host de `-h1` | 🌐 E15 | — (coberto por E15) |
| Host antigo volta como jogador comum, com o KPI dele | 🤖 T41, T43 · 🌐 E5 (link antigo), E3 (tela inicial) | 👤 (pela tela inicial) |
| Quem assumiu fica com `host=true` na URL (F5 continua host) | 🤖 T42 · 🌐 E2 | — (coberto por E2) |
| Guest acha o host em qualquer versão (`-h1`, `-h2`...) | 🤖 T44, T45 | 👤 (versão 0 e -h1) |
| Assumir como host sem o erro "cannot reconnect" | 🤖 T46 | 👤 |
| Erros do PeerJS depois de aberto não derrubam o peer | 🤖 T19, T20 | — |
| Todo peer usa a configuração única (`CONFIG.PEER`) | 🤖 T36, T37 | — |

### Fim de partida e lobby
| Caso | Testes | Manual |
|---|---|---|
| Fim de jogo: quem cai sai da lista | 🤖 T11 | — |
| Encerrar partida (normal e pausada) | 🤖 T14, T15 | — |
| Voltar ao lobby após o fim de jogo (host e guest) | 🤖 T16, T16b | — |
| Guest sai da partida, ela acaba, e o host inicia outra | 🤖 T48 · 🌐 E8 | 👤 |
| Pausa retomada com todos os conectados já tendo respondido: rodada encerra em vez de recomeçar | 🤖 T52 | — |
| Sair da partida: se faltar jogador, a partida acaba | 🤖 T7 | 👤 |
| Todos saem e a sala é reaberta: até 5 min a partida é restaurada (pausada, com o mesmo evento); depois, lobby novo | 🌐 E17, E18 | — (coberto por E17 e E18) |

---

## 3. Bugs encontrados, ainda não corrigidos

Nenhum no momento.

Em investigação fora da conexão: BUG-020 (tela do host depois do F5 com
a pergunta aberta), em `ISSUES.md`.

Corrigidos: B1 (botão "Iniciar" desabilitado depois de um "Sair da
partida") na D3d; B2 (rodada que começava sozinha depois de uma troca de
host) na D3e; B3, B4 e B5 (F5 do host em momentos específicos da
partida, encontrados com navegadores reais em 03/10/2026) na D3f;
BUG-019 (F5 do host com assessoria pendente, ver `ISSUES.md`) em
03/10/2026:

| ID | Situação antes da correção | Causa |
|---|---|---|
| B3 | F5 do host com a rodada encerrada: o host voltava com "Aguardando início da rodada..." e os outros viam a última dupla como em andamento, em vez de "Rodada encerrada" | "Rodada encerrada" não era salvo, e a retomada reexibia a última rodada (já respondida) |
| B4 | F5 do host logo depois de uma resposta, nos ~3s antes da próxima dupla: a partida travava ("Nova Rodada" bloqueado, nenhuma dupla nova) | O aviso para seguir à próxima dupla (agendado para 3s depois) se perdia com a página, e a retomada reabria a pergunta já respondida |
| B5 | F5 do host com a partida pausada: sorteava outro evento e reaplicava os efeitos | A pausa não era salva, e a retomada começava uma rodada nova |
| BUG-019 | F5 do host com um pedido de assessoria sem resposta: quem responde ficava com os botões travados e a rodada parada até acabar o tempo da partida | O prazo do assessor se perdia com a página, e o assessor perdia a pergunta ao reconectar |

---

## 4. Falta testar manualmente

Cada teste com navegadores **diferentes** (não duas abas do mesmo
navegador — elas compartilham o estado salvo e o token) e com as
janelas visíveis lado a lado (aba em segundo plano fica mais lenta).

| # | Prioridade | Caso | Como testar | Esperado |
|---|---|---|---|---|
| M1 | ✅ 🌐 E1 | F5 do host no meio de uma pergunta | Host dá F5 com a pergunta aberta | Guests reconectam em poucos segundos, sem troca de host; a partida segue |
| M2 | ✅ 🌐 E9 | F5 do host com "rodada encerrada" | Host dá F5 esperando o "Nova Rodada" | Continua "Rodada encerrada" para todos, esperando o clique (B3 corrigido na D3f) |
| M3 | ✅ 🌐 E2 | F5 do novo host depois da troca | Depois que o guest assumiu, ele dá F5 | Volta como host na mesma sala; os outros reconectam |
| M4 | ✅ 🌐 E5 | Host antigo reabre o **link antigo** da partida (não a tela inicial), em até 5 min | Fechar a aba do host, esperar a troca, reabrir pelo histórico | Entra como jogador comum; URL passa a `host=false` |
| M5 | ✅ 🌐 E4 | Troca de host com 3 jogadores | Host fecha a aba | O backup assume e o terceiro jogador acha o novo host sozinho |
| M6 | ✅ 🌐 E6 | Guest cai e volta | Guest dá F5 no meio da própria pergunta; outro guest fecha e volta pela tela inicial | Voltam ao próprio lugar, com KPI; rodada tratada como nos testes T5/T34 |
| M7 | **P1** | Queda de rede real (não fechar aba) | Roteiro na seção 7.2 (queda curta e longa de guest, do backup e do host) | Guest: volta sozinho ou ao recarregar. Host: troca de host depois de perceber a queda (mais lento que fechar a aba) |
| M8 | **P1** | Celular com tela bloqueada / navegador em segundo plano | Roteiro na seção 7.3 (tela bloqueada, outro app na frente) | Ao desbloquear, volta à partida (ou ao recarregar) |
| M9 | **P1** | Redes diferentes | Roteiro na seção 7.1 (todos na rede da instituição; host na instituição e guest no 4G) | Conecta. **Risco:** redes corporativas/universitárias podem bloquear a conexão direta entre navegadores sem um servidor de retransmissão (TURN) |
| M10 | ✅ 🌐 E8 | Nova partida depois de "saiu da partida" | 2 jogadores; guest sai; host volta ao lobby e inicia outra | Conferido em 30/09/2026 |
| M11 | ✅ 🌐 E15 | Duas trocas de host seguidas | 3 jogadores: host sai; depois o novo host sai | Sala vai para `-h2`; entrar pela tela inicial com o código funciona |
| M12 | ✅ 🌐 E14 | Troca de host no lobby | Host fecha a aba antes de iniciar | Backup assume; os outros voltam como jogadores novos |
| M13 | ✅ 🌐 E17 | Host sai com a partida pausada | Guest cai (a partida pausa), depois o host fecha a aba e a reabre | Continua pausada com o mesmo evento e retoma quando o guest volta. Obs.: a partida só pausa quando o host é o único conectado, então não sobra ninguém para assumir — o caso real é o host voltar em até 5 min (M16) |
| M14 | ✅ 🌐 E13 | Criar sala com código em uso | Código de sala aberta e de sala migrada | "Já está em uso", em até ~2s (no teste, até 3s) |
| M15 | ✅ 🌐 E16 | Sala cheia (6 jogadores) | 6 navegadores/dispositivos; 1 cai e volta | Volta ao lugar; 7º nome é recusado |
| M16 | ✅ 🌐 E17, E18 | Reusar o código depois que todos saem | Todos fecham; reabrir em 1 min e depois de 5 min | Até 5 min restaura a partida; depois, lobby novo |
| M17 | P2 | Navegadores | Chrome, Edge (inclusive InPrivate), Firefox, Safari no iPhone | Mesmo comportamento |
| M18 | P2 | Aba em segundo plano por muito tempo | Deixar a aba escondida 10 min | Ao voltar, o jogo se recupera (pode precisar de F5) |
| M19 | ✅ 👤 🌐 E5 | Troca de host com a rodada encerrada | Todos respondem; com "Rodada encerrada" na tela, o host fecha a aba | O novo host vê "Rodada encerrada" com o "Nova Rodada" liberado; quando os outros voltam, nada começa sozinho |
| M20 | ✅ 🌐 E4 | Troca de host no meio da rodada | 3 jogadores; o host fecha a aba no meio de uma pergunta que não é do novo host | A partida pausa e, quando alguém volta, continua com quem ainda não respondeu; ninguém responde duas vezes na mesma rodada |

---

## 5. Limitações conhecidas (aceitas por ora)

- ⚠️ Nomes diferenciam maiúsculas: "vHost" e "Vhost" são jogadores diferentes — durante a partida, a grafia errada é recusada. Melhoria futura (roadmap 8.5).
- ⚠️ Abas do mesmo navegador compartilham o token e o estado salvo; trocar de navegador, usar aba anônima ou limpar os dados no meio da partida perde a identidade (só volta no lobby).
- ⚠️ Janela de menos de 1s em que o host antigo, recarregando exatamente enquanto o backup assume, pode reabrir a sala antiga (dois hosts).
- ⚠️ A procura da sala olha até 5 trocas de host seguidas (`-h5`).
- ⚠️ Depois de 5 tentativas sem achar o novo host, o guest desiste (precisa recarregar).
- ⚠️ Diferença de ~1s entre o relógio do host e o dos guests que reconectam.
- ⚠️ **Em investigação:** travamentos do Edge no Windows (uma vez travou o computador inteiro; outra, ~5s ao criar sala). Reproduzindo o mesmo cenário no Chromium (mesmo motor do Edge), a página não travou: nenhuma tarefa acima de 100 ms, e memória e elementos da página estáveis durante a partida. Falta medir no próprio Edge (Gerenciador de Tarefas do navegador, Shift+Esc) e comparar com o Chrome na mesma máquina.

---

## 6. Testes de ponta a ponta (`tests/e2e`)

O jogo de verdade, em janelas separadas do Chromium (cada uma com
armazenamento e token próprios, como navegadores diferentes), com um
servidor PeerJS e o site servidos localmente dentro do GitHub Actions —
sem depender da internet nem do servidor público. Os arquivos do jogo
não mudam: o teste só aponta o PeerJS para o servidor local.

| # | Cenário | Cobre |
|---|---|---|
| E1 | F5 do host no meio da pergunta: o outro reconecta ao mesmo host, sem troca de host; a rodada vai até o fim | M1 |
| E2 | Host fecha a aba: outro assume em ~10s (não antes de 7s); URL `host=true`; F5 do novo host continua host | M3 |
| E3 | Host antigo volta pela tela inicial digitando o código: acha a sala em `-h1` e entra como jogador comum, com o KPI dele | — |
| E4 | 3 jogadores, host sai no meio da pergunta de um guest (com alguém já tendo respondido): o terceiro acha o novo host; ninguém responde duas vezes; quem ia responder não perde a vez | M5, M20 |
| E5 | Troca de host com a rodada encerrada: continua encerrada; host antigo volta pelo link antigo como jogador comum; nada começa até o "Nova Rodada" | M4, M19 |
| E6 | Jogador dá F5; outro fecha e volta pela tela inicial; nome novo é recusado; a rodada vai até o fim | M6 |
| E8 | Jogador sai da partida, ela acaba; voltar ao lobby e iniciar outra | M10 |
| E9 | F5 do host com a rodada encerrada: continua encerrada para os dois, "Nova Rodada" liberado, nada começa sozinho | M2, B3 |
| E10 | F5 do host logo depois de responder: a partida segue (próxima dupla ou fim da rodada) e a rodada seguinte começa | B4 |
| E11 | F5 do host com a partida pausada: continua pausada com o mesmo evento, sem mostrar outro; retoma quando o outro volta | B5 |
| E12 | 3 jogadores; um guest pede assessoria, o assessor não responde e o host dá F5: o guest volta com os botões e o "Pedir Assessoria" liberados, responde e a partida segue | BUG-019 |
| E13 | Criar sala pela tela inicial com o código de uma sala aberta e, depois da troca de host, de uma sala migrada: "já está em uso" em até 3s, sem derrubar ninguém; código livre chega a "Sala criada" | M14 |
| E14 | Host fecha a aba no lobby: outro assume em `-h1` e fica só com quem voltou; o terceiro entra como jogador novo; o host antigo reabre o link antigo e vira jogador comum; a partida começa com os três | M12 |
| E15 | Duas trocas de host seguidas (sala em `-h2`): o primeiro host volta pela tela inicial, com o KPI dele; o host de `-h1` reabre o link dele e vira jogador comum; a partida retoma | M11 |
| E16 | 6 jogadores: o 7º é recusado no lobby ("Sala cheia"); com a partida em andamento, um cai e volta ao próprio lugar | M15 |
| E17 | Guest sai (pausa), depois o host; o host reabre: continua pausada com o mesmo evento, sem mostrar outro; retoma quando o guest volta | M13, M16 (até 5 min) |
| E18 | Todos saem e voltam depois de 5 min: lobby novo, quem volta entra como jogador novo e uma partida nova começa | M16 (depois de 5 min) |

Queda de rede (M7) não entrou: a simulação de "sem rede" do navegador
não derruba a conexão direta entre janelas na mesma máquina (conferido —
as mensagens continuaram chegando), então o cenário não testaria nada.
Continua manual.

No E18, os 5 minutos não são esperados de verdade (cada cenário tem
limite de 2 minutos): antes de reabrir, o teste muda a hora gravada no
estado salvo de cada navegador para 6 minutos atrás — o mesmo dado que
o jogo usa para decidir se restaura.

**Continuam manuais:** M7 (queda de rede real), M8 (celular), M9 (redes
reais diferentes) — roteiros na seção 7 —, M17 (Firefox, Safari) e M18
(aba esquecida em segundo plano).

Rodar localmente (precisa de Node): `npm ci`, `npx playwright install
chromium` e `npx playwright test --config tests/e2e/playwright.config.js`.

---

## 7. Roteiros dos testes manuais P1 (M9, M7, M8)

Ordem: **M9 primeiro** (maior risco: se a rede da instituição bloquear
a conexão, muda o plano da aula), depois M7 e M8. Dá para fazer cada
roteiro sozinho, com os aparelhos lado a lado.

### 7.0 Antes de qualquer roteiro

1. Conferir que o GitHub Pages está na versão mais nova: na aba
   Actions, o último deploy do Pages verde no commit atual. Em cada
   aparelho, abrir o jogo sem cache (Ctrl+F5 no computador; no
   celular, fechar a aba e abrir de novo).
2. Nos computadores, abrir o console (F12 → Console) **antes** de
   entrar na sala e ligar "Preserve log" (Chrome/Edge) ou "Persist
   Logs" (Firefox), para o console não se apagar no F5.
3. Deixar à vista um relógio com segundos (o do celular serve) e anotar
   a hora de cada ação (ex.: "14:03:20 desliguei o Wi-Fi do B").
4. Um navegador diferente por jogador. Duas abas do mesmo navegador não
   servem (seção 4).
5. Host de preferência no Chrome: o travamento do Edge em investigação
   (seção 5) confundiria o resultado.
6. Nomes curtos: Host, A, B, C.

**Se algo falhar (vale para todos os roteiros):** antes de recarregar
qualquer coisa, (1) tirar print de todas as telas, (2) salvar o console
de cada computador (clique direito no console → "Save as...") e (3)
anotar a hora e o número do passo. Esses três itens são o que precisa
ser analisado.

**Como registrar:** no fim de cada roteiro, preencher o modelo abaixo e
atualizar a marca do item na tabela da seção 4 (✅ 👤 se passou; 🐛 e
registro em `ISSUES.md` se falhou).

```
Mx — data: __/__/2026
Aparelhos e navegadores:
Redes:
Passos: 1 ok · 2 ok · 3 falhou (o que aconteceu, hora)
Tempos medidos:
Observações:
```

### 7.1 M9 — Redes diferentes

**O que testa:** se a conexão entre os navegadores passa pela rede da
instituição. O jogo usa dois serviços externos: o servidor público de
sinalização do PeerJS (só para os navegadores se acharem) e, quando a
conexão direta não passa, um servidor de retransmissão (TURN) público
que já vem na biblioteca PeerJS. Esse TURN é gratuito e sem garantia:
se o jogo só funcionar por ele, é um risco para a aula (roadmap 2.7).

**O que precisa:**
- notebook no Wi-Fi da instituição (host), com Chrome;
- celular com dados móveis (4G) e acesso ao Wi-Fi da instituição;
- de preferência, um terceiro aparelho na rede da instituição
  (computador do laboratório ou outro notebook).

**Preparação:**
1. No notebook, antes de abrir o jogo, abrir em outra aba
   `chrome://webrtc-internals` (no Edge, `edge://webrtc-internals`) e
   deixar aberta. Ela registra cada conexão e mostra se foi direta ou
   retransmitida.
2. Anotar o nome da rede Wi-Fi (ex.: rede de visitantes) — nunca a
   senha.

**M9a — todos na rede da instituição (o caso da sala de aula)**

| Passo | Ação | Esperado |
|---|---|---|
| 1 | Notebook: criar sala | "Sala criada" e o código em até ~5s. Se não aparecer, a rede bloqueia o servidor de sinalização — ver "se falhar" |
| 2 | Celular no Wi-Fi da instituição (dados móveis desligados): entrar com o código | Entra no lobby em até ~5s e aparece na lista do host |
| 3 | (Se houver) terceiro aparelho entra | Idem |
| 4 | Iniciar a partida e jogar uma rodada inteira, até "Rodada encerrada" (com 3 jogadores, pedir uma assessoria) | Perguntas, respostas e relógio iguais em todas as telas, sem quedas |
| 5 | Deixar a partida parada por 5 min com as telas acesas; depois clicar em "Nova Rodada" e jogar mais uma pergunta | Continua conectada (algumas redes derrubam conexão parada) |
| 6 | No `webrtc-internals` do notebook, abrir cada conexão; nas estatísticas, achar o par de candidatos com estado "succeeded" e anotar o tipo do candidato local e do remoto | `host` (rede local direta), `srflx`/`prflx` (direta, atravessando o roteador) ou `relay` (passou pelo TURN). Clicar em "Create dump" → baixar o arquivo e guardar fora do repositório |

**M9b — host na instituição, jogador no 4G**

| Passo | Ação | Esperado |
|---|---|---|
| 1 | Celular: desligar o Wi-Fi, ficar só nos dados móveis. No notebook, encerrar a partida anterior e voltar à tela inicial | — |
| 2 | Repetir os passos 1, 2, 4, 5 e 6 do M9a | Igual ao M9a. O tipo provavelmente será `srflx` ou `relay` |

**O que anotar:** nome da rede, tempo para criar a sala e para entrar,
tipo de conexão de cada jogador em cada variante, quedas (hora).

**Como ler o resultado:**
- só `host`/`srflx`/`prflx`: a conexão direta passa nessa rede; o TURN
  não foi necessário;
- `relay`: funciona, mas depende do TURN público do PeerJS — registrar
  em `ISSUES.md` como risco e levar ao roadmap 2.7;
- não conecta: ver abaixo.

**Se falhar:**
- **Sala não criada (passo 1):** a rede bloqueia a sinalização. Para
  confirmar, ligar o notebook à internet do celular (roteador do
  celular) e criar a sala de novo. Juntar: console do notebook, print,
  nome da rede.
- **Sala criada, mas o celular recebe "Sala não encontrada" com o host
  aberto:** a conexão direta e o TURN foram bloqueados. Repetir uma vez
  para descartar acaso. Juntar: console do notebook, dump do
  `webrtc-internals`, print do celular.
- **Conecta, mas cai sozinho depois:** anotar depois de quanto tempo;
  juntar console e dump.

### 7.2 M7 — Queda de rede real

**O que testa:** a rede some (Wi-Fi desligado, sinal perdido) sem
fechar a aba. Diferente de fechar a aba (coberto pelos testes
automáticos), o outro lado não é avisado: o jogo só percebe quando a
conexão desiste, o que costuma levar de ~30s a mais de 1 min. Quedas
curtas podem nem ser percebidas — a conexão se recupera sozinha.

**Quem é o backup:** o primeiro jogador que entrou depois do host. É
ele que assume se o host cair.

**O que precisa:** 3 aparelhos cuja rede dá para cortar separadamente,
todos na mesma rede de casa (redes diferentes são o M9):
- **H** (host): computador, Chrome;
- **A** (entra primeiro, é o backup): notebook, outro navegador;
- **B** (entra em segundo): celular (corta com modo avião) ou outro
  computador.

Com só 2 aparelhos: fazer M7.2 e M7.4 com H e A.

**Como cortar a rede:** computador — desligar o Wi-Fi pelo ícone de
rede da barra de tarefas (ou tirar o cabo); celular — modo avião.
Religar do mesmo jeito.

**Preparação:**
1. H cria a sala; A entra; **depois** B entra. Conferir a ordem na
   lista do lobby: H, A, B.
2. Iniciar a partida e esperar a primeira dupla aparecer.

**M7.1 — Queda curta de B (20s)**

| Passo | Ação | Esperado |
|---|---|---|
| 1 | Cortar a rede de B por 20s e religar | Nada muda para ninguém, ou B aparece com 📴 por poucos segundos e volta sozinho. A partida segue |

**M7.2 — Queda longa de B (90s)**

| Passo | Ação | Esperado |
|---|---|---|
| 1 | Cortar a rede de B; no H, cronometrar até B aparecer com 📴 | Entre ~30s e ~1min30. Se B estava na dupla, a pergunta dele é descartada e sai outra dupla |
| 2 | Aos 90s, religar a rede de B | B volta sozinho em até ~15s, **ou** mostra "não foi possível reconectar" — então dar F5 em B |
| 3 | Conferir B | De volta ao próprio lugar, com KPI e recursos de antes; o 📴 some no H |

**M7.3 — Queda longa de A, o backup (90s)**

| Passo | Ação | Esperado |
|---|---|---|
| 1 | Cortar a rede de A | No H, A fica com 📴 em ~30s–1min30; a partida segue com H e B |
| 2 | Observar A (sem rede) | Depois de perceber a queda, A tenta voltar ao host por ~10s e, como é o backup, tenta assumir a sala; sem rede isso falha e aparece aviso de erro de conexão. **Não deve** aparecer "Você agora é o host!" |
| 3 | Aos 90s, religar a rede de A e dar F5 em A | A volta como jogador comum ao próprio lugar, com o KPI; H continua host |

Se A mostrar "Você agora é o host!" com o H funcionando, são dois
hosts: parar, juntar prints e consoles dos três e as horas.

**M7.4 — Queda longa do host (90s)**

| Passo | Ação | Esperado |
|---|---|---|
| 1 | Cortar a rede do H; cronometrar em A | Em ~30s–1min30 a conexão cai em A e B; ~10s depois, A mostra "Você agora é o host!"; B acha A sozinho em alguns segundos; a partida pausa e retoma quando B chega |
| 2 | Observar o H (sem rede) | Os outros ficam com 📴 e a partida pausa — normal |
| 3 | Aos 90s, religar a rede do H | O H continua sozinho, achando que é host (não volta sozinho — comportamento atual). Ninguém deve entrar pela tela inicial neste intervalo |
| 4 | Dar F5 no H | Em até ~10s, H entra como jogador comum na sala de A (URL passa a `host=false`), com o KPI de antes; A continua host |

**O que anotar:** tempo do corte até o 📴 (M7.2, M7.3), do corte até A
assumir e até B voltar (M7.4); se cada volta foi sozinha ou com F5.

**Se falhar:** juntar prints, consoles de H, A e B (com "Preserve
log") e as horas, com o número do passo.

### 7.3 M8 — Celular com tela bloqueada / navegador em segundo plano

**O que testa:** com a tela bloqueada ou outro app na frente, o
navegador do celular congela a página e, depois de um tempo, a conexão
cai sem aviso (como no M7). Ao voltar, o jogo precisa voltar sozinho
ou com um recarregamento.

**O que precisa:** H no computador (Chrome); **C** no celular (Android
com Chrome ou iPhone com Safari — se tiver os dois, fazer com cada um);
de preferência um terceiro jogador **B** em outro navegador do
computador (Firefox ou Edge), para a partida não ficar só pausando.
Todos na mesma rede Wi-Fi. Bloqueio automático de tela do celular
desligado durante a preparação.

**Preparação:**
1. H cria a sala; C entra; B entra. Iniciar a partida.
2. Anotar modelo do celular, sistema e navegador.

**M8.1 — Tela bloqueada por 1 min, C fora da dupla**

| Passo | Ação | Esperado |
|---|---|---|
| 1 | Com C fora da dupla, bloquear o celular (botão lateral) | — |
| 2 | Observar o H | C fica com 📴 entre ~30s e ~1min (ou nem isso, se o celular manteve a conexão); a partida segue com H e B |
| 3 | Aos 60s, desbloquear | Em até ~15s, C volta sozinho com a tela da rodada atual; se a tela parecer parada ou desatualizada, recarregar a página → volta ao próprio lugar com o KPI |

**M8.2 — Tela bloqueada por 1 min, C respondendo**

| Passo | Ação | Esperado |
|---|---|---|
| 1 | Com uma pergunta aberta em que C responde, bloquear | — |
| 2 | Observar o H | Quando C ficar com 📴, a pergunta dele é descartada e sai outra dupla. Se o tempo da pergunta (60s) acabar antes, a pergunta encerra como se C não tivesse respondido — também é normal |
| 3 | Aos 60s, desbloquear | Como no M8.1; C vê a situação atual da rodada, não a pergunta antiga aberta |

**M8.3 — Outro app na frente por 1 min**

| Passo | Ação | Esperado |
|---|---|---|
| 1 | Com C fora da dupla, abrir outro app (ex.: WhatsApp) por 60s, sem bloquear; voltar ao navegador | Igual ao M8.1 |

**M8.4 (desejável) — Tela bloqueada por 6 min**

| Passo | Ação | Esperado |
|---|---|---|
| 1 | Bloquear C por 6 min e desbloquear | Volta sozinho ou recarregando; se cair na tela inicial (o estado salvo vale 5 min), entrar com o mesmo nome e código → volta ao lugar, com o KPI |

**M8.5 (desejável) — Celular como host** (só se o celular puder ser
host em aula)

| Passo | Ação | Esperado |
|---|---|---|
| 1 | C cria a sala; o computador entra primeiro (será o backup), B depois; iniciar | — |
| 2 | Bloquear C por 90s | Como no M7.4: o backup assume em ~40s–1min40 |
| 3 | Desbloquear C e recarregar | C volta como jogador comum, com o KPI |

**O que anotar:** tempo até o 📴; se voltou sozinho ou recarregando; o
que a tela do celular mostrava ao desbloquear.

**Se falhar:** print da tela do celular logo ao desbloquear (antes de
recarregar), console do computador H e a hora. O console do celular só
se for pedido: no Android, ligando o celular por USB e abrindo
`chrome://inspect` no computador (precisa da "Depuração USB" ligada); no
iPhone, precisa de um Mac — fica só o print.