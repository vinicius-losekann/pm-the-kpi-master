# 🎯 PM: The KPI Master - V2

> **Quiz multiplayer P2P sobre as 10 Áreas de Conhecimento do PMBOK**
>
---

## 🆕 O que mudou na V2

| Aspecto | V1 | V2 |
|---|---|---|
| **Recursos** | Não existia | 10 iniciais por jogador |
| **Gasto ao responder** | Grátis | -1📦 (acertando ou errando) |
| **Atividade** | Sempre ganhava | Só ganha se **acertar** |
| **KPI** | 10 × evento | **10 fixo** por acerto |
| **Eventos** | Modificavam KPI | Modificam **recursos** |
| **Sem recursos** | Não se aplicava | **Pula a vez** |
| **KPI Final** | Só acertos | Acertos + (recursos × 5) |
| **Modal de Evento** | Não existia | Pop-up no início de cada rodada |
| **Venda de Recursos** | Não existia | 1📦 por 15 KPI entre jogadores |
| **Debug mode** | Simulação básica | Progressão individual, travas de segurança |

---

## 🎮 Como Jogar

### Fluxo do Jogo

1. **Host** cria uma sala e compartilha o código
2. **Jogadores** (2-6) entram na sala
3. Host inicia a partida (120 minutos)
4. A cada rodada:
   - Um **evento** é sorteado (afeta recursos)
   - Um **modal** mostra o evento para todos
   - Um jogador **pergunta** (vê a resposta)
   - Outro jogador **responde** (escolhe entre 4 alternativas)
5. **Acertar** = +10 KPI + 1 atividade
6. **Errar** = 0 KPI + 0 atividade
7. **Toda resposta gasta 1 recurso** (exceto com 🛡️ Seguro de Projeto)
8. **Sem recursos** = pula a vez
9. **Vender recurso**: 1📦 por 15 KPI para outro jogador
10. O jogo termina quando o primeiro completa o **Encerramento**
11. Vence quem tiver o **maior KPI Final**

---

## ⭐ Sistema de KPI

| Situação | KPI | Atividade | Recurso |
|---|---|---|---|
| ✅ Acertou | +10 | +1 | -1📦 |
| ❌ Errou | 0 | 0 | -1📦 |
| ❌ Errou com 🛡️ Seguro | 0 | 0 | 0 |
| ⚠️ Sem recursos | - | - | Pula vez |

### KPI Final
```
KPI Total = KPI de acertos + KPI de Vendas de Recursos + (Recursos restantes × 5)
```

---

## 🃏 Eventos

| # | Evento | Efeito |
|---|---|---|
| e1 | 🟢 **Apoio da Alta Gestão** | +1 recurso para todos |
| e2 | 🔴 **Corte de Orçamento** | -1 recurso de todos |
| e3 | 🎁 **Patrocinador Generoso** | +2 recursos para quem tem menos |
| e4 | 🛡️ **Seguro de Projeto** | Não gasta recurso se errar |
| e5 | 🔄 **Reestruturação** | Mais rico dá 1 para mais pobre |

---

## 💰 Venda de Recursos

| Ação | Vendedor | Comprador |
|---|---|---|
| 📦 Recurso | -1 | +1 |
| ⭐ KPI | +15 | -15 |

- Disponível a qualquer momento durante a partida
- Comprador precisa ter pelo menos 15 KPI
- Vendedor precisa ter pelo menos 1 recurso

---

## 👥 Papéis na Rodada

| Papel | O que vê | O que faz |
|---|---|---|
| 🗣️ **Perguntador** | Pergunta + resposta correta destacada | Somente leitura |
| 🎯 **Respondedor** | Pergunta + 4 alternativas | Escolhe a resposta |
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
| 📚 100 perguntas (10 áreas) | ✅ |
| 🎯 5 fases PMBOK | ✅ |
| ⭐ KPI fixo (10 por acerto) | ✅ |
| 📋 5 eventos | ✅ |
| 🪟 Modal de evento | ✅ |
| 📦 Sistema de recursos | 🆕 |
| 💰 Venda de recursos | 🆕 |
| ⏱️ Timer 120min | ✅ |
| 🏆 Ranking com KPI Final | ✅ |
| 🚪 Sair/Encerrar | ✅ |
| 👑 Host migration | ✅ |
| 🐛 Debug mode | ✅ |

---

**🎯 Domine o PMBOK, gerencie seus recursos!**
