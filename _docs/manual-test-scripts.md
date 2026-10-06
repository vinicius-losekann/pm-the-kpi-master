# Roteiros dos testes manuais P1 (M9, M7, M8)

> **Contém:** os roteiros `M` passo a passo dos testes de conexão que não
> dá para automatizar (rede real, celular), o que anotar, o que fazer se
> falhar e o modelo de registro. **Não contém:** a lista de casos, a
> prioridade e o resultado de cada um (→ `connection-tests.md`; ao
> terminar um roteiro, atualizar a marca do item lá, seção 4).

Os três ainda faltam e são **P1**: fecham a Fase D e precisam passar
antes do deploy de uma versão para uso em aula.

Ordem: **M9 primeiro** (maior risco: se a rede da instituição bloquear
a conexão, muda o plano da aula), depois M7 e M8. Dá para fazer cada
roteiro sozinho, com os aparelhos lado a lado.

## Antes de qualquer roteiro

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
   servem (`connection-tests.md`, seção 4).
5. Host de preferência no Chrome: o travamento do Edge em investigação
   (`connection-tests.md`, seção 5) confundiria o resultado.
6. Nomes curtos: Host, A, B, C.

**Se algo falhar (vale para todos os roteiros):** antes de recarregar
qualquer coisa, (1) tirar print de todas as telas, (2) salvar o console
de cada computador (clique direito no console → "Save as...") e (3)
anotar a hora e o número do passo. Esses três itens são o que precisa
ser analisado.

**Como registrar:** no fim de cada roteiro, preencher o modelo abaixo e
atualizar a marca do item na tabela da seção 4 de `connection-tests.md`
(✅ 👤 se passou; 🐛 e registro em `issues.md` se falhou).

```
Mx — data: __/__/2026
Aparelhos e navegadores:
Redes:
Passos: 1 ok · 2 ok · 3 falhou (o que aconteceu, hora)
Tempos medidos:
Observações:
```

## M9 — Redes diferentes

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
  em `issues.md` como risco e levar ao roadmap 2.7;
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

## M7 — Queda de rede real

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

## M8 — Celular com tela bloqueada / navegador em segundo plano

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
