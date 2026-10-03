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

## 2. Casos cobertos por teste automatizado (55 testes)

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
| Criar sala com código de partida em andamento numa versão migrada | 🤖 T47 · 🤖 no Chromium real: "já está em uso" em 0,7s, sem travar | ⬜ no Edge do Windows houve travamento de ~5s (seção 5) |

### Queda e volta de guest
| Caso | Testes | Manual |
|---|---|---|
| Espectador cai: fica na lista, fora do sorteio, volta com tudo | 🤖 T4 | — |
| Participante da rodada cai: rodada abortada, nova dupla | 🤖 T5 | — |
| Falta só conexão: partida pausa e retoma com o mesmo evento | 🤖 T6, T33 | — |
| Ciclo da rodada termina sem esperar o desconectado | 🤖 T8 | — |
| Guest volta com o relógio andando e sem reabrir pergunta já respondida | 🤖 T30–T34 | 👤 (diferença de ~1s entre relógios, esperada) |
| Sala cheia: quem caiu consegue voltar | 🤖 T9 | — |

### Queda e troca de host
| Caso | Testes | Manual |
|---|---|---|
| F5/fechar do host encerra as conexões sem mexer no jogo | 🤖 T12, T13 | — |
| Host volta dentro de 10s: guests reconectam, sem troca de host | 🤖 T38 | ⬜ **P1** |
| Host não volta: backup assume em ~10s, não antes | 🤖 T39, T40 · 🌐 E2 | 👤 |
| Backup desconectado é pulado, o próximo assume | 🤖 T10 | — |
| Novo host marca os outros como desconectados, pausa e retoma | 🤖 T17, T21, T21b | 👤 |
| Todos recebem quem já respondeu na rodada (resposta, nova dupla, reconexão) | 🤖 T49 | — |
| Troca de host com a rodada encerrada: continua encerrada, nada começa sozinho | 🤖 T35, T50 · 🌐 E5 | 👤 |
| Troca de host no meio da rodada: quem ia responder não perde a vez; ninguém responde duas vezes | 🤖 T50, T51 | ⬜ **P1** (M20) |
| Novo host confere o token pelos hashes da lista | 🤖 T26 | — |
| Troca de host no lobby | 🤖 T18 | ⬜ P2 |
| Host antigo volta como jogador comum, com o KPI dele | 🤖 T41, T43 · 🌐 E5 (pelo link antigo) | 👤 (pela tela inicial) |
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
| Guest sai da partida, ela acaba, e o host inicia outra | 🤖 T48 | 👤 |
| Pausa retomada com todos os conectados já tendo respondido: rodada encerra em vez de recomeçar | 🤖 T52 | — |
| Sair da partida: se faltar jogador, a partida acaba | 🤖 T7 | 👤 |

---

## 3. Bugs encontrados, ainda não corrigidos

Nenhum aberto. Corrigidos: B1 (botão "Iniciar" desabilitado depois de
um "Sair da partida") na D3d; B2 (rodada que começava sozinha depois de
uma troca de host) na D3e.

---

## 4. Falta testar manualmente

Cada teste com navegadores **diferentes** (não duas abas do mesmo
navegador — elas compartilham o estado salvo e o token) e com as
janelas visíveis lado a lado (aba em segundo plano fica mais lenta).

| # | Prioridade | Caso | Como testar | Esperado |
|---|---|---|---|---|
| M1 | **P1** | F5 do host no meio de uma pergunta | Host dá F5 com a pergunta aberta | Guests reconectam em poucos segundos, sem troca de host; a partida segue |
| M2 | **P1** | F5 do host com "rodada encerrada" | Host dá F5 esperando o "Nova Rodada" | Continua esperando o clique (hoje suspeito de reabrir a rodada — a investigar) |
| M3 | ✅ 🌐 E2 | F5 do novo host depois da troca | Depois que o guest assumiu, ele dá F5 | Volta como host na mesma sala; os outros reconectam |
| M4 | ✅ 🌐 E5 | Host antigo reabre o **link antigo** da partida (não a tela inicial), em até 5 min | Fechar a aba do host, esperar a troca, reabrir pelo histórico | Entra como jogador comum; URL passa a `host=false` |
| M5 | **P1** | Troca de host com 3 jogadores | Host fecha a aba | O backup assume e o terceiro jogador acha o novo host sozinho |
| M6 | **P1** | Guest cai e volta | Guest dá F5 no meio da própria pergunta; outro guest fecha e volta pela tela inicial | Voltam ao próprio lugar, com KPI; rodada tratada como nos testes T5/T34 |
| M7 | **P1** | Queda de rede real (não fechar aba) | Desligar o Wi-Fi do guest por 20s; depois do host | Guest: volta sozinho ou ao recarregar. Host: troca de host depois de perceber a queda (mais lento que fechar a aba) |
| M8 | **P1** | Celular com tela bloqueada / navegador em segundo plano | Bloquear o celular por 1 min no meio da partida | Ao desbloquear, volta à partida (ou ao recarregar) |
| M9 | **P1** | Redes diferentes | Host no Wi-Fi da instituição, guest no 4G | Conecta. **Risco:** redes corporativas/universitárias podem bloquear a conexão direta entre navegadores sem um servidor de retransmissão (TURN) |
| M10 | ✅ | Nova partida depois de "saiu da partida" | 2 jogadores; guest sai; host volta ao lobby e inicia outra | Conferido em 30/09/2026 |
| M11 | P2 | Duas trocas de host seguidas | 3 jogadores: host sai; depois o novo host sai | Sala vai para `-h2`; entrar pela tela inicial com o código funciona |
| M12 | P2 | Troca de host no lobby | Host fecha a aba antes de iniciar | Backup assume; os outros voltam como jogadores novos |
| M13 | P2 | Host sai com a partida pausada | Pausar (guest cai), depois o host fecha | Novo host segue pausado e retoma quando der |
| M14 | P2 | Criar sala com código em uso | Código de sala aberta e de sala migrada | "Já está em uso", em até ~2s |
| M15 | P2 | Sala cheia (6 jogadores) | 6 navegadores/dispositivos; 1 cai e volta | Volta ao lugar; 7º nome é recusado |
| M16 | P2 | Reusar o código depois que todos saem | Todos fecham; reabrir em 1 min e depois de 5 min | Até 5 min restaura a partida; depois, lobby novo |
| M17 | P2 | Navegadores | Chrome, Edge (inclusive InPrivate), Firefox, Safari no iPhone | Mesmo comportamento |
| M18 | P2 | Aba em segundo plano por muito tempo | Deixar a aba escondida 10 min | Ao voltar, o jogo se recupera (pode precisar de F5) |
| M19 | ✅ 👤 🌐 E5 | Troca de host com a rodada encerrada | Todos respondem; com "Rodada encerrada" na tela, o host fecha a aba | O novo host vê "Rodada encerrada" com o "Nova Rodada" liberado; quando os outros voltam, nada começa sozinho |
| M20 | **P1** (pendente: faltam 3 navegadores; previsto na automação D4b) | Troca de host no meio da rodada | 3 jogadores; o host fecha a aba no meio de uma pergunta que não é do novo host | A partida pausa e, quando alguém volta, continua com quem ainda não respondeu; ninguém responde duas vezes na mesma rodada |

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
| E2 | Host fecha a aba: outro assume em ~10s (não antes de 7s); URL `host=true`; F5 do novo host continua host | M3 |
| E5 | Troca de host com a rodada encerrada: continua encerrada; host antigo volta pelo link antigo como jogador comum; nada começa até o "Nova Rodada" | M4, M19 |

Próximos (D4b): F5 do host (M1), 3 jogadores com troca no meio da
pergunta (M5, M20), guest que cai e volta (M6), guest sem rede por 20s
(parte de M7), nova partida depois de "Sair da partida" (M10) e os P2
automatizáveis (M11–M16).

**Continuam manuais:** M8 (celular), M9 (redes reais diferentes), M17
(Firefox, Safari) e M18 (aba esquecida em segundo plano).

Rodar localmente (precisa de Node): `npm ci`, `npx playwright install
chromium` e `npx playwright test --config tests/e2e/playwright.config.js`.