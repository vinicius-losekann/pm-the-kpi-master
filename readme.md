# 🎯 PM: The KPI Master

> **Quiz multiplayer P2P sobre as 10 Áreas de Conhecimento do PMBOK**
>
> Domine o gerenciamento de projetos enquanto compete com amigos em tempo real!

---

## 🎮 Como Jogar

### Fluxo do Jogo

1. **Host** acessa o site e cria uma sala (ex: `pm-the-kpi-master-001`)
2. **Jogadores** (2-6) entram na sala usando o código
3. Host inicia a partida (120 minutos)
4. A cada rodada, um jogador **pergunta** e outro **responde**
5. Acertos geram **KPI** (pontuação)
6. **Eventos** modificam a pontuação da rodada
7. Complete as **5 fases** dos grupos de processo
8. O jogo termina quando o primeiro jogador completa o **Encerramento**
9. Vence quem tiver o **maior KPI** no ranking final

### Fases (Grupos de Processo PMBOK)

| Fase | Ícone | O que é |
|---|---|---|
| **Iniciação** | 🚀 | Começo do projeto |
| **Planejamento** | 📋 | Definição do plano |
| **Execução** | ⚙️ | Trabalho em andamento |
| **Monitoramento e Controle** | 📊 | Acompanhamento |
| **Encerramento** | 🏁 | Finalização |

### Papéis na Rodada

| Papel | O que vê | O que faz |
|---|---|---|
| 🗣️ **Perguntador** | Pergunta + resposta correta destacada | Somente leitura |
| 🎯 **Respondedor** | Pergunta + 4 alternativas | Escolhe a resposta |
| ⏳ **Espectador** | Quem está jogando | Aguarda sua vez |

---

## ⭐ Sistema de KPI (Pontuação)

| Situação | Pontuação |
|---|---|
| Acerto base | **10 pontos** |
| Evento: Apoio da Alta Gestão | KPI **dobrado** (×2) |
| Evento: Corte de Orçamento | KPI pela **metade** (×0.5) |
| Evento: Stakeholder Engagement | KPI normal + **bônus de 5** |
| Evento: Lições Aprendidas | **Todos** ganham 3 pontos |

### Fórmula
```
KPI da rodada = (10 × modificador do evento) + bônus do evento
```

---

## 📚 Áreas de Conhecimento (PMBOK 6ª Edição)

| # | Área | Foco |
|---|---|---|
| 1 | **Integração** | Coordenação do projeto |
| 2 | **Escopo** | O que será entregue |
| 3 | **Cronograma** | Prazos e sequenciamento |
| 4 | **Custos** | Orçamento e controle financeiro |
| 5 | **Qualidade** | Padrões e conformidade |
| 6 | **Recursos** | Equipe e materiais |
| 7 | **Comunicações** | Fluxo de informações |
| 8 | **Riscos** | Incertezas do projeto |
| 9 | **Aquisições** | Contratos e fornecedores |
| 10 | **Partes Interessadas** | Stakeholders |

**100 perguntas no total** (10 por área), distribuídas entre os 5 grupos de processo.

---

## 🏗️ Tecnologias

| Tecnologia | Uso |
|---|---|
| **PeerJS (WebRTC)** | Comunicação P2P direta entre jogadores |
| **Vanilla JavaScript** | Sem frameworks, JS puro (ES6+) |
| **CSS3** | Glassmorphism, animações, responsivo |
| **GitHub Pages** | Hospedagem gratuita |

---

## 📁 Estrutura do Projeto

```
📁 pm-the-kpi-master/
│
├── 📄 index.html              ← Tela de entrada
├── 📄 game.html               ← Tela do jogo
├── 📄 README.md
│
├── 📁 css/
│   └── 🎨 style.css           ← Tema gamificado
│
├── 📁 config/
│   └── ⚙️ game-config.js      ← Constantes (KPI, fases, timer)
│
├── 📁 data/
│   └── 📚 questions.json      ← 100 perguntas + 5 eventos
│
└── 📁 js/
    ├── 📄 index.js            ← Lógica da tela de entrada
    ├── 📄 game-state.js       ← Estado central + helpers
    ├── 📄 game-network.js     ← PeerJS + conexões + mensagens
    ├── 📄 game-core.js        ← Regras do jogo
    ├── 📄 game-ui.js          ← Interface do usuário
    └── 📄 game-main.js        ← Orquestrador principal
```

---

## 🚀 Como Executar

### Produção (Jogar)
Acesse: **`https://[seu-usuario].github.io/pm-the-kpi-master/`**

1. Host: cria uma sala e compartilha o código
2. Jogadores: entram com o código
3. Divirtam-se!

### Desenvolvimento Local
```bash
# Clone o repositório
git clone https://github.com/[seu-usuario]/pm-the-kpi-master.git

# Sirva com qualquer servidor HTTP
python -m http.server 8080
# ou
npx serve .

# Acesse http://localhost:8080
```

> ⚠️ Não funciona abrindo o arquivo diretamente (`file://`). Use um servidor HTTP.

---

## 🎯 Funcionalidades da V1

| Funcionalidade | Descrição |
|---|---|
| 🔗 **Conexão P2P** | PeerJS com criação/entrada em salas |
| 👥 **2-6 jogadores** | Host + guests |
| 📚 **100 perguntas** | 10 áreas de conhecimento × 10 perguntas |
| 🎯 **5 fases** | Iniciação → Planejamento → Execução → M&C → Encerramento |
| 🃏 **Baralho inteligente** | Não repete perguntas até esgotar a área |
| ⭐ **KPI** | 10 pontos base por acerto |
| 📋 **Eventos** | 5 cartas que modificam KPI |
| 🔄 **Turnos** | Perguntador e respondedor aleatórios |
| 👀 **Papéis** | Perguntador vê resposta, respondedor clica |
| ⏱️ **Timer** | 120 minutos com alertas visuais |
| 🏆 **Ranking** | Ordenado por KPI ao fim da partida |
| 🏁 **Fim de jogo** | Quando o primeiro completa Encerramento |
| 🚪 **Sair/Encerrar** | Host encerra sessão, jogador sai sozinho |
| 👑 **Host migration** | Se host cai, backup assume |
| 💾 **localStorage** | Estado persiste entre recargas |
| 📱 **Responsivo** | Funciona em desktop e mobile |
| 🎨 **Tema gamificado** | Dark mode, glassmorphism, animações |

---

## 🔮 Próximas Versões

### V2 (Em breve)
- 🃏 Cartas recurso e sistema de venda
- 🤝 Consultoria entre jogadores
- 🔥 Streaks de acertos e penalidades
- ❌ Atividades só contam com acerto
- 📋 Novos eventos

### V3 (Futuro)
- 🗺️ Tabuleiro visual de progresso
- 💎 Power-ups e itens
- 🔊 Efeitos sonoros
- 🕐 Modo rápido (30 min)
- 🏅 Sistema de conquistas

---

## 📄 Licença

MIT - Livre para usar, modificar e distribuir.

---

**🎯 Domine o PMBOK, um KPI por vez!**
```
