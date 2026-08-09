# 🎯 PM: The KPI Master — v1.0

> **Quiz multiplayer P2P sobre os Domínios de Conhecimento do PMBOK (8ª Edição)**
>
---

## 🎮 Como Jogar

### Fluxo do Jogo

1. **Host** cria uma sala e compartilha o código
2. **Jogadores** (2-6) entram na sala
3. Host inicia a partida (90 minutos)
4. A cada rodada:
   - Um **evento** é sorteado (afeta recursos)
   - Um **modal** mostra o evento para todos
   - Um jogador **pergunta** (vê a resposta)
   - Outro jogador **responde** (escolhe entre 4 alternativas)
   - O Respondedor pode, opcionalmente, **pedir Assessoria** a outro jogador antes de responder
     (exceto se estiver na fase de Encerramento)
5. **Acertar** = +10 KPI + 1 atividade
6. **Errar** = 0 KPI + 0 atividade
7. **Toda resposta gasta 1 recurso** (exceto com 🛡️ Reserva de Contingência)
8. **Sem recursos** = pula a vez
9. **Vender recurso**: 1📦 por 10 KPI para outro jogador
10. O jogo termina quando o primeiro jogador completa o **Encerramento**
11. Vence quem tiver o **maior KPI Final**

---

## ⭐ Sistema de KPI

| Situação | KPI | Atividade | Recurso |
|---|---|---|---|
| ✅ Acertou | +10 | +1 | -1📦 |
| ❌ Errou | 0 | 0 | -1📦 |
| 🛡️ Respondeu com Reserva de Contingência | +10 (se acertar) / 0 (se errar) | +1 (se acertar) | 0 |
| ⚠️ Sem recursos | - | - | Pula vez |
| 💰 Vendeu recurso | +10 | - | -1📦 |
| 💰 Comprou recurso | -10 | - | +1📦 |
| 🧭 Assessorou e acertou | +5 | - | - |

### KPI Final
```
KPI Total = KPI de acertos + KPI de vendas - KPI de compras + KPI de assessorias + (Recursos restantes × 5)
```

---

## 🃏 Eventos

| # | Evento | Efeito |
|---|---|---|
| e1 | 🟢 **Apoio da Alta Gestão** | +1 recurso para todos |
| e2 | 🔴 **Corte de Orçamento** | -1 recurso de todos |
| e3 | 🎁 **Patrocinador Generoso** | +1 recursos para quem tem menos |
| e4 | 🛡️ **Reserva de Contingência** | A resposta desta atividade não gasta recurso, acertando ou errando |
| e5 | 🔄 **Reestruturação** | Mais rico dá 1 para mais pobre |

---

## 💰 Venda de Recursos

| Ação | Vendedor | Comprador |
|---|---|---|
| 📦 Recurso | -1 | +1 |
| ⭐ KPI | +10 | -10 |

- Disponível a qualquer momento durante a partida
- Comprador precisa ter pelo menos 10 KPI
- Vendedor precisa ter pelo menos 1 recurso

---

## 🧭 Sistema de Assessoria

> Qualquer jogador pode ser chamado para ajudar quem está respondendo — e ganha KPI se acertar.

### Objetivo

Permitir que jogadores fora da dupla ativa da rodada participem de forma significativa, sem
duplicar perguntas simultâneas nem exigir reestruturar o fluxo de rodada. Reflete, na mecânica
do jogo, o uso de **Expert Judgment** (juízo especializado), uma das técnicas mais recorrentes
do PMBOK em praticamente todos os domínios de desempenho.

### Como funciona

1. Ao ser escolhido como **Respondedor**, antes de selecionar uma alternativa, o jogador pode
   clicar em **📞 Pedir Assessoria**.
2. Ele escolhe **um jogador ativo** (exceto o Perguntador da rodada) para chamar como assessor.
3. O assessor recebe a mesma pergunta e as 4 alternativas — **sem saber qual é a correta**. Ele
   raciocina do zero, como se estivesse respondendo.
4. O assessor pode **aceitar** e enviar sua sugestão, ou **recusar** o pedido a qualquer momento
   dentro da janela de tempo.
5. O assessor tem **20 segundos** para enviar sua sugestão ou recusar. Se o tempo esgotar sem
   resposta, o pedido é tratado como recusado automaticamente.
6. O Respondedor vê a sugestão recebida (quando houver), mas a decisão final é sempre dele:
   pode seguir a sugestão ou escolher outra alternativa.
7. O resultado é revelado normalmente, seguindo as regras já existentes de KPI e recursos.

### Restrição: fase de Encerramento

Um Respondedor que estiver na fase de **Encerramento** **não pode pedir Assessoria**. Como o
jogo termina assim que o primeiro jogador completa essa fase, essa restrição evita que a
mecânica de ajuda vire uma decisão sobre "ajudar o adversário a encerrar a partida para todo
mundo". Fora dessa situação, a Assessoria funciona normalmente.

Essa restrição afeta apenas o **pedido**: um jogador que já está na fase de Encerramento
continua podendo ser **chamado como assessor** por colegas em fases anteriores.

### Quem pode ser assessor

| Papel | Pode ser assessor? |
|---|---|
| Perguntador da rodada | ❌ Não (já sabe a resposta correta) |
| Respondedor da rodada | — (é quem está pedindo ajuda) |
| Qualquer outro jogador ativo | ✅ Sim |
| Jogador aguardando no lobby (`waitingInLobby`) | ❌ Não |

### Recusa de Assessoria

O jogador convidado a assessorar não é obrigado a ajudar. Ele pode recusar o pedido
explicitamente (botão **❌ Recusar**) ou simplesmente deixar o tempo esgotar sem enviar
sugestão — ambos os casos têm o mesmo efeito.

- A recusa **consome o pedido de Assessoria da rodada**. O Respondedor não pode chamar outro
  jogador na mesma rodada; ele responde sozinho a partir daí.
- Recusar não gera penalidade nem bônus para o Assessor.
- Não há limite de quantas vezes um jogador pode recusar ao longo da partida.

### Regras de recompensa

| Situação | Respondedor | Assessor |
|---|---|---|
| Pediu ajuda, assessor aceitou, seguiu a sugestão, **acertou** | +10 KPI, -1📦 (regra padrão) | **+5 KPI** |
| Pediu ajuda, assessor aceitou, seguiu a sugestão, **errou** | 0 KPI, -1📦 (regra padrão) | +0 KPI |
| Pediu ajuda, mas **ignorou** a sugestão recebida | Resultado normal, sem alteração | +0 KPI (sugestão não validada) |
| Assessor **recusou** ou não respondeu a tempo | Resultado normal, sem custo extra | — |

**Notas importantes:**
- Pedir assessoria **não consome recurso adicional**. O custo de responder continua sendo o
  já existente (-1📦, exceto com 🛡️ Reserva de Contingência).
- O assessor só ganha KPI se sua sugestão **coincidir com a alternativa final escolhida pelo
  Respondedor** e essa alternativa estiver correta.
- Limite de **1 pedido de assessoria por Respondedor por rodada** — não é possível consultar
  mais de um jogador na mesma pergunta, mesmo em caso de recusa.
- Um mesmo jogador pode ser chamado como assessor em rodadas diferentes sem limite de
  quantas vezes na partida.

### Fluxo resumido

```
Respondedor recebe pergunta
        │
        ├── Está na fase de Encerramento? → Sim → não pode pedir Assessoria
        │
        ├── (opcional) Pede Assessoria → escolhe jogador ativo (≠ Perguntador)
        │         │
        │         └── Assessor recebe pergunta + alternativas (sem gabarito)
        │                   │
        │                   ├── Aceita → envia sugestão em até 20s
        │                   └── Recusa (ou expira) → pedido encerrado, sem sugestão
        │
        ├── Respondedor decide: segue sugestão (se houver) ou escolhe outra alternativa
        │
        └── Resultado revelado → aplica regras de KPI/recursos (Respondedor)
                              → aplica bônus de assessoria, se aplicável (Assessor)
```

---

## 👥 Papéis na Rodada

| Papel | O que vê | O que faz |
|---|---|---|
| 🗣️ **Perguntador** | Pergunta + resposta correta destacada | Somente leitura |
| 🎯 **Respondedor** | Pergunta + 4 alternativas | Escolhe a resposta; pode pedir Assessoria (exceto no Encerramento) |
| 🧭 **Assessor** | Pergunta + 4 alternativas (sem gabarito) | Aceita e sugere, ou recusa, se chamado |
| ⏳ **Espectador** | Quem está jogando | Aguarda sua vez |

---

## 🏗️ Tecnologias

| Tecnologia | Uso |
|---|---|
| **PeerJS (WebRTC)** | Comunicação P2P |
| **Vanilla JavaScript** | Sem frameworks |
| **CSS3** | Glassmorphism, animações |
| **GitHub Pages** | Hospedagem gratuita |

---

## 📁 Estrutura do Projeto

```
📁 pm-the-kpi-master/
├── 📄 index.html
├── 📄 game.html
├── 📁 css/style.css
├── 📁 config/game-config.js
├── 📁 data/questions.json
└── 📁 js/
    ├── index.js
    ├── game-state.js
    ├── game-network.js
    ├── game-core.js
    ├── game-ui.js
    ├── game-debug.js
    └── game-main.js
```

---

## 🚀 Como Executar

### Produção
`https://[seu-usuario].github.io/pm-the-kpi-master/`

### Desenvolvimento
```bash
python -m http.server 8080
# http://localhost:8080
```

---

## 🎯 Funcionalidades

| Funcionalidade | Status |
|---|---|
| 🔗 Conexão P2P | ✅ |
| 👥 2-6 jogadores | ✅ |
| 📚 100 perguntas (10 domínios de conhecimento) | ✅ |
| 🎯 5 Áreas de Foco (Focus Areas) | ✅ |
| ⭐ KPI fixo (10 por acerto) | ✅ |
| 📋 5 eventos | ✅ |
| 🪟 Modal de evento | ✅ |
| 📦 Sistema de recursos | ✅ |
| 💰 Venda de recursos | ✅ |
| 🧭 Sistema de Assessoria (com recusa) | ✅ |
| ⏱️ Timer 90min | ✅ |
| 🏆 Ranking com KPI Final | ✅ |
| 🚪 Sair/Encerrar | ✅ |
| 👑 Host migration | ✅ |
| 🐛 Debug mode | ✅ |

---

**🎯 Domine o PMBOK, gerencie seus recursos e conte com sua equipe!**