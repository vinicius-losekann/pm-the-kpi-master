# Roteiros dos testes manuais P1 (M21, M22, M7, M8, M18)

> **Contém:** os roteiros `M` passo a passo dos testes de conexão que não
> dá para automatizar (rede real, celular, aba escondida), o que anotar, o
> que fazer se falhar e o modelo de registro. **Não contém:** a lista de
> casos, a prioridade e o resultado de cada um (→ `connection-tests.md`;
> ao terminar um roteiro, atualizar a marca do item lá, seção 4).

Todos são **P1**: precisam passar antes do deploy de uma versão para uso
em aula. Os cenários automatizados (`tests/browser`) já cobrem a lógica
de cada caso contra o emulador do Firebase; aqui se confere o que só
aparece com redes, celulares e navegadores de verdade.

Ordem: **M21 na instituição primeiro** (se a rede de lá bloquear o
Firebase, muda o plano da aula), depois M22, M7, M8 e M18. Dá para fazer
cada roteiro sozinho, com os aparelhos lado a lado.

**Tempos que o jogo usa** (`config/game-config.js`): cada aparelho manda
um sinal de vida a cada 2 s; o host dá um jogador como caído com o sinal
parado há mais de **20 s** (até lá, é tolerância: um F5 ou uma queda
curta não tiram ninguém da rodada); os jogadores dão o host como caído
com o sinal dele parado há mais de **10 s**, e então um deles assume.

## Antes de qualquer roteiro

1. Conferir que o GitHub Pages publica a versão a testar: na aba
   Actions, o último deploy do Pages verde no commit certo. Em cada
   aparelho, abrir o jogo sem cache (Ctrl+F5 no computador; no
   celular, fechar a aba e abrir de novo).
2. Nos computadores, abrir o console (F12 → Console) **antes** de
   entrar na sala e ligar "Preserve log" (Chrome/Edge) ou "Persist
   Logs" (Firefox), para o console não se apagar no F5 nem na recarga
   de quem assume como host.
3. Deixar à vista um relógio com segundos (o do celular serve) e anotar
   a hora de cada ação (ex.: "14:03:20 desliguei o Wi-Fi do B").
4. Um navegador diferente por jogador. Duas abas do mesmo navegador não
   servem: elas têm o mesmo login, e a segunda aba não entra na sala
   (`connection-tests.md`, seção 5).
5. Host de preferência no Chrome: o travamento do Edge em investigação
   (`connection-tests.md`, seção 5) confundiria o resultado.
6. Nomes curtos: Host, A, B, C.
7. O 📴 ao lado do nome, na lista de jogadores e no ranking, marca quem
   está desconectado. A linha de status do lobby mostra "Conectado",
   "Host desconectado — aguardando a volta dele..." ou "Conectado —
   Fulano agora é o host".

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

## M21 — Teste de conexão pelo Firebase em redes reais

**O que testa:** se a página de teste de conexão
(`firebase-check.html`, endereço do site + `/firebase-check.html`)
consegue criar sala, entrar e trocar mensagens pelo Firebase em redes
reais — os mesmos serviços que o jogo usa (`gstatic.com` e
`firebaseio.com`). A página não faz parte do jogo; é o jeito mais rápido
de saber se a rede de um lugar deixa o jogo funcionar.

**Precisa de:** um computador e um celular. Duas partes: em casa
(computador no Wi-Fi, celular **com o Wi-Fi desligado**, nos dados
móveis) e na instituição (celular no 5G; computador na rede da
instituição). Na instituição, repetir com o celular também na rede
dela, se houver.

**Passos (em cada parte):**

1. Abrir a página nos dois aparelhos. **Esperado:** em até ~5s, o
   status "⚪ Login feito — fora de sala" e os botões liberados. Anotar a
   linha "Rede:" do celular.
2. No computador: nome "PC", código novo (ex.: `casa1`), "Criar sala".
   **Esperado:** "🟢 Conectado", sala `casa1` (você criou), "PC" na lista.
3. No celular: nome "Celular", o mesmo código, "Entrar". **Esperado:** os
   dois aparelhos na lista dos dois lados.
4. No celular, "Enviar teste" três vezes; depois, no computador, três
   vezes. **Esperado:** o outro lado mostra "📩 ... enviou uma mensagem
   de teste"; quem enviou, "↩️ ... respondeu em N ms". Anotar os seis
   tempos.
5. No celular, F5 (ou fechar a aba e abrir de novo pelo mesmo endereço).
   **Esperado:** volta sozinho à sala, "🟢 Conectado"; o computador
   continua vendo os dois.
6. No celular, modo avião por 30s e depois desligar. **Esperado:** em
   algum momento o computador mostra só "PC" (pode levar até ~3 min: a
   página depende do servidor do Firebase perceber a queda sem aviso,
   ~2 min nas medidas de 17/10 e 20/10; o jogo não depende disso, usa o
   sinal de vida de 20 s) e,
   ao desligar o modo avião, o celular volta sozinho à lista e ao
   "🟢 Conectado". Anotar quanto tempo o computador levou para ver a
   saída e a volta.
7. No celular, bloquear a tela por 2 min e desbloquear. **Esperado:**
   volta ao "🟢 Conectado" sozinho ou com um F5.
8. No computador, "Sair da sala". **Esperado:** a sala some; no celular,
   "Entrar" com o mesmo código diz que a sala não existe.

**Se falhar:** anotar o aviso em vermelho da página (ele diz em que
ponto parou: arquivos do Firebase, login ou banco), a rede e o
aparelho, e o console do computador (F12). Se o celular não sair do
"Fazendo login...", o aviso aparece em 15s.

**Registrar** com o modelo acima; no campo "Tempos medidos", os tempos
de ida e volta do passo 4 e os tempos de saída e volta do passo 6.

## M22 — Troca de host em navegadores e redes reais

**O que testa:** o host cai no meio de uma pergunta e outro jogador
assume, com aparelhos e redes de verdade. Nos testes automatizados
(E31, E36), a troca levou ~11 s e o F5 de um jogador nesse meio-tempo
esperou ~9 s; numa rede real, os tempos devem ser um pouco maiores.

**O que precisa:**
- **H** (host): computador no Wi-Fi, Chrome;
- **A**: outro navegador (Firefox ou Edge) no mesmo computador ou em
  outro, no Wi-Fi;
- **C**: celular **com o Wi-Fi desligado**, nos dados móveis.

**Preparação:** H cria a sala; A e C entram. Iniciar a partida.

**M22.1 — Host fecha a aba com a pergunta aberta**

| Passo | Ação | Esperado |
|---|---|---|
| 1 | Jogar até uma pergunta em que H **não** está na dupla (de preferência com C respondendo). Com a pergunta aberta para quem responde, fechar a aba do H e marcar a hora | — |
| 2 | Observar A e C | Nos primeiros segundos, nada ou "Host desconectado". Entre ~10 e ~20 s depois, a tela de um deles (A ou C) **recarrega uma vez** e abre como host; o outro vê "Conectado — Fulano agora é o host". Anotar quanto tempo levou e quem assumiu |
| 3 | Conferir a pergunta | A mesma pergunta continua, com a mesma dupla. O contador de quem responde pode ter chegado a zero durante a troca e volta com o tempo devolvido |
| 4 | Quem responde responde | O resultado aparece para todos e a partida segue com a próxima dupla |
| 5 | Reabrir o jogo no navegador do H pelo mesmo link | H entra como **jogador comum**, com o KPI e os recursos de antes; o host continua o mesmo do passo 2 |

**M22.2 — Jogador dá F5 enquanto a sala está sem host**

| Passo | Ação | Esperado |
|---|---|---|
| 1 | Com o host atual (do M22.1) na partida, fechar a aba dele | — |
| 2 | ~2 s depois, dar F5 no outro jogador (o que não é host) e cronometrar | Fica no lobby com "Host desconectado" até a troca e então volta à partida (ou vira ele mesmo o host). Esperado: até ~20 s. Anotar o tempo |

**O que anotar:** tempo do fechamento da aba até a recarga de quem
assume (M22.1, passo 2) e do F5 até voltar à partida (M22.2); quem
assumiu; se a pergunta continuou.

**Se falhar:** com dois aparelhos mostrando "você é o host", parar e
juntar prints, consoles e horas de todos. Ninguém assumiu em 30 s:
console de todos, com a hora do fechamento.

## M7 — Queda de rede real

**O que testa:** a rede some (Wi-Fi desligado, sinal perdido) sem
fechar a aba. O jogo percebe pela falta do sinal de vida, não por um
aviso de saída: um jogador cai para os outros 20 s depois do último
sinal; o host, 10 s depois. Quedas mais curtas não tiram ninguém da
rodada. No celular, a conexão com o Firebase leva de 18 s a 60 s para
voltar depois que a rede volta: uma queda curta pode durar mais que os
20 s. Quem cai na dupla não perde a pergunta: ela fica guardada até o fim
da rodada.

**O que precisa:** 3 aparelhos cuja rede dá para cortar separadamente:
- **H** (host): computador, Chrome;
- **A**: notebook ou outro computador, outro navegador;
- **B**: celular (corta com modo avião) ou outro computador.

Com só 2 aparelhos: fazer M7.2 e M7.4 com H e A.

**Como cortar a rede:** computador — desligar o Wi-Fi pelo ícone de
rede da barra de tarefas (ou tirar o cabo); celular — modo avião.
Religar do mesmo jeito.

**Preparação:** H cria a sala; A e B entram. Iniciar a partida e esperar
a primeira dupla aparecer.

**M7.1 — Queda curta de B (10 s)**

| Passo | Ação | Esperado |
|---|---|---|
| 1 | Com B na dupla (de preferência respondendo), cortar a rede de B por 10 s e religar; no console do B, anotar as linhas "📡 Conexão com o banco caiu" e "voltou depois de N s" | Se a conexão voltar em menos de ~20 s: nada muda, a pergunta continua. Se demorar mais: todos veem por alguns segundos "📴 B caiu — a pergunta dele fica para o fim da rodada", a partida segue com outra dupla e, quando B volta, a dupla dele é a próxima, com a mesma pergunta (quem pergunta clica em "Fazer a pergunta" de novo; B tem o tempo que faltava) |

**M7.2 — Queda longa de B (60 s)**

| Passo | Ação | Esperado |
|---|---|---|
| 1 | Cortar a rede de B; no H, cronometrar até B aparecer com 📴 | ~20 s (até ~25 s). Se B estava na dupla, aviso "📴 B caiu" e a pergunta dele fica para o fim da rodada; a partida segue sem ele |
| 2 | Se a rodada terminar antes da volta: conferir as telas | O H vê "Esperando B (caiu há m:ss) voltar" e o "Nova Rodada" liberado; A vê "Esperando B voltar". Se B era quem perguntava, o H também vê "Passar a pergunta pendente para outra pessoa". Não clicar ainda |
| 3 | Aos 60 s, religar a rede de B (pode levar até ~1 min para a conexão voltar) | B volta sozinho, sem F5; a dupla guardada dele abre com a mesma pergunta |
| 4 | Conferir B | De volta ao próprio lugar, com KPI e recursos de antes; o 📴 some no H; a resposta dele vale |

**M7.3 — Queda curta do host (5 s)**

| Passo | Ação | Esperado |
|---|---|---|
| 1 | Cortar a rede do H por 5 s e religar | Ninguém assume. A e B não veem nada, ou "Host desconectado" por poucos segundos. A partida segue com o H |

**M7.4 — Queda longa do host (60 s)**

| Passo | Ação | Esperado |
|---|---|---|
| 1 | Cortar a rede do H; cronometrar em A e B | Entre ~10 e ~20 s, a tela de A ou de B recarrega e abre como host, com "👑 Você agora é o host da partida" e a faixa "👑 Você é o host"; o outro vê "Conectado — Fulano agora é o host". A partida continua (a mesma pergunta, se havia uma aberta fora da dupla do H; se o H estava na dupla, a pergunta dele fica para o fim da rodada) |
| 2 | Observar o H (sem rede) | O H não marca ninguém como caído enquanto está sem rede — normal |
| 3 | Aos 60 s, religar a rede do H | Em poucos segundos, a página do H **recarrega sozinha** e ele entra como jogador comum, com o KPI de antes; o host novo continua host |

**O que anotar:** tempo do corte até o 📴 (M7.2), do corte até alguém
assumir (M7.4) e da religação até cada um voltar; se cada volta foi
sozinha ou precisou de F5.

**Se falhar:** juntar prints, consoles de H, A e B (com "Preserve
log") e as horas, com o número do passo.

## M8 — Celular com tela bloqueada / navegador em segundo plano

**O que testa:** com a tela bloqueada ou outro app na frente, o
navegador do celular congela a página e o sinal de vida para. Depois de
20 s, o celular sai do sorteio; ao voltar, o jogo precisa voltar
sozinho.

**O que precisa:** H no computador (Chrome); **C** no celular (Android
com Chrome ou iPhone com Safari — se tiver os dois, fazer com cada um);
um terceiro jogador **B** em outro navegador do computador (Firefox ou
Edge), para a partida não ficar só pausando. Bloqueio automático de
tela do celular desligado durante a preparação.

**Preparação:**
1. H cria a sala; C entra; B entra. Iniciar a partida.
2. Anotar modelo do celular, sistema e navegador.

**M8.1 — Tela bloqueada por 1 min, C fora da dupla**

| Passo | Ação | Esperado |
|---|---|---|
| 1 | Com C fora da dupla, bloquear o celular (botão lateral) | — |
| 2 | Observar o H | C fica com 📴 ~20 s depois; a partida segue com H e B |
| 3 | Aos 60 s, desbloquear | Em poucos segundos, C volta sozinho com a tela da rodada atual; o 📴 some no H |

**M8.2 — Tela bloqueada por 10 s, C respondendo**

| Passo | Ação | Esperado |
|---|---|---|
| 1 | Com uma pergunta aberta em que C responde, bloquear por 10 s e desbloquear | A mesma pergunta continua aberta no celular, com o prazo que faltava; C responde e a resposta vale |

**M8.3 — Tela bloqueada por 1 min, C respondendo**

| Passo | Ação | Esperado |
|---|---|---|
| 1 | Com uma pergunta aberta em que C responde, bloquear | — |
| 2 | Observar o H | ~20 s depois, C fica com 📴, aviso "📴 C caiu — a pergunta dele fica para o fim da rodada" e a partida segue com outra dupla |
| 3 | Aos 60 s, desbloquear | C volta sozinho; depois da dupla em andamento (ou na hora, se a rodada já esperava por ele), a mesma pergunta abre de novo para C, com o tempo que faltava, e a resposta vale |

**M8.4 — Outro app na frente por 1 min**

| Passo | Ação | Esperado |
|---|---|---|
| 1 | Com C fora da dupla, abrir outro app (ex.: WhatsApp) por 60 s, sem bloquear; voltar ao navegador | Igual ao M8.1 |

**M8.5 — Tela bloqueada por 6 min**

| Passo | Ação | Esperado |
|---|---|---|
| 1 | Bloquear C por 6 min e desbloquear | Volta sozinho, ou com um F5, ao próprio lugar, com o KPI (a partida salva vale enquanto a sala existir) |

**M8.6 — Celular como host**

| Passo | Ação | Esperado |
|---|---|---|
| 1 | C cria a sala; o computador (H) e B entram; iniciar | — |
| 2 | Bloquear C por 60 s | Entre ~10 e ~20 s, H ou B assume (a tela dele recarrega uma vez); o outro vê "Fulano agora é o host" |
| 3 | Desbloquear C | A página do celular recarrega sozinha e C volta como jogador comum, com o KPI |

**O que anotar:** tempo até o 📴 ou até a troca; se voltou sozinho ou
com F5; o que a tela do celular mostrava ao desbloquear.

**Se falhar:** print da tela do celular logo ao desbloquear (antes de
recarregar), console do computador H e a hora. O console do celular só
se for pedido: no Android, ligando o celular por USB e abrindo
`chrome://inspect` no computador (precisa da "Depuração USB" ligada).

## M18 — Aba do jogo escondida por muito tempo (com o host)

**O que testa:** o caso da aula em que o professor é o host e deixa a
aba do jogo atrás de outra (slides, outro site) por vários minutos. Com a
aba escondida há mais de 5 min, o Chrome e o Edge passam a rodar os
timers da página só uma vez por minuto: o sinal de vida do host, de 2 em
2 s, fica de minuto em minuto, e os outros podem dá-lo como caído e
assumir. Este roteiro mede o que acontece de fato.

**O que precisa:** H no computador (Chrome), **A** em outro navegador ou
computador, **B** no celular. Todos visíveis, menos a aba do H.

**M18.1 — Aba do host escondida por 10 min**

| Passo | Ação | Esperado |
|---|---|---|
| 1 | H cria a sala; A e B entram; iniciar e jogar uma pergunta | — |
| 2 | No H, abrir outra aba na mesma janela (ex.: os slides) e deixar a do jogo escondida por 10 min, sem minimizar a janela. Em A, anotar a hora de qualquer mudança na linha de status ou na lista | Ideal: H continua host até o fim. Se a partir de ~5 min alguém assumir, é o risco descrito acima: anotar a hora, quem assumiu e se a partida continuou |
| 3 | Aos 10 min, voltar à aba do jogo no H | Se ninguém assumiu: tudo continua. Se alguém assumiu: a página do H recarrega e ele volta como jogador comum |

**M18.2 — Aba de um jogador escondida por 10 min**

| Passo | Ação | Esperado |
|---|---|---|
| 1 | Repetir o passo 2 com a aba do A escondida | A pode ganhar 📴 e sair do sorteio a partir de ~5 min; ao voltar à aba, o 📴 some sozinho em poucos segundos, sem F5, e A volta ao sorteio. Se continuar 📴 depois de 10 s com a aba visível, anotar e pedir o console (F12) do host |

**O que anotar:** hora em que a aba foi escondida e de cada mudança vista
nos outros aparelhos.

**Se falhar ou se houver troca no M18.1:** registrar o resultado em
`connection-tests.md` (seção 4, M18) e a hora; a correção (ex.: manter o
host vivo com a aba escondida) é frente própria.
