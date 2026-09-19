// ============================================
// PM: The KPI Master - UI: Setup
// ============================================
// Alterna a visibilidade dos elementos conforme o papel do jogador
// (host/guest) e delega o bind dos botões de ação para
// ui/components/controlsComponent.js (Game.ui.bindControls()).
// Fase 5.2 do roadmap.
//
// Reorganizado para resolver a sobreposição de responsabilidade com
// controlsComponent.js (ver NOTA-001 em ARCHITECTURE.md): antes, os
// listeners dos botões de ação (vender, assessoria, sessão, partida,
// nova rodada) estavam aqui; agora moraram para controlsComponent.js,
// que passa a ser o dono de fato da "barra de ações". Este arquivo
// cuida só de: (1) mostrar/esconder elementos conforme o papel, e
// (2) navegação de tela / fechamento de modais que não são,
// estritamente, "ações do jogo".
// ============================================

let commonListenersBound = false;

/**
 * Configura a UI. É chamada uma vez na inicialização e novamente
 * quando um guest se torna host (para ativar controles de host).
 */
function setupUI() {
    const state = Game.state;

    if (state.isHost) {
        document.getElementById('hostControls').style.display = 'block';
        document.getElementById('playerWaiting').style.display = 'none';
        document.getElementById('hostRoomIdSection').style.display = 'block';
        document.getElementById('roomPeerId').textContent = state.peerId;
        document.getElementById('btnEndSession').style.display = 'inline-block';
        document.getElementById('btnEndMatch').style.display = 'block';
        document.getElementById('btnNovaRodada').style.display = 'block';
        document.getElementById('btnNovaRodada').disabled = true;
        document.getElementById('btnLeaveSession').style.display = 'none';
        document.getElementById('btnLeaveMatch').style.display = 'none';

        if (!state.players.find(p => p.isHost)) {
            state.players.unshift({
                name: state.playerName,
                peerId: state.peerId,
                kpi: 0,
                phase: CONFIG.FASES[0].id,
                activities: 0,
                isHost: true,
                waitingInLobby: false,
                recursos: CONFIG.RECURSOS_INICIAIS
            });
        }
        Game.ui.updatePlayersList();
    } else {
        document.getElementById('hostControls').style.display = 'none';
        document.getElementById('playerWaiting').style.display = 'block';
        document.getElementById('hostRoomIdSection').style.display = 'none';
        document.getElementById('btnEndSession').style.display = 'none';
        document.getElementById('btnEndMatch').style.display = 'none';
        document.getElementById('btnNovaRodada').style.display = 'none';
        document.getElementById('btnLeaveSession').style.display = 'inline-block';
        document.getElementById('btnLeaveMatch').style.display = 'block';
    }

    // Botões de ação (ajuda, assessoria, sessão, partida, nova rodada)
    // agora são responsabilidade de controlsComponent.js.
    Game.ui.bindControls();

    // Recalcula o estado real do botão "Nova Rodada" (ciclo completo ou
    // não) — cobre tanto a inicialização normal quanto becomeHost()
    // (guest assumindo como host no meio de uma partida em andamento).
    Game.ui.refreshNovaRodadaButton();

    if (commonListenersBound) return;

    // Navegação de tela e fechamento de modais.
    document.getElementById('btnExitGameOver').addEventListener('click', () => {
        Game.network.cleanup();
        window.location.href = './';
    });
    document.getElementById('btnBackToLobby').addEventListener('click', () => {
        Game.state.gameStarted = false;
        Game.state.gameOver = false;
        Game.state.currentRound = null;
        Game.core.resetAllBaralhos();

        Game.ui.showScreen('lobby');
        Game.ui.showLobbyNormal();
        Game.ui.updatePlayersList();
        Game.saveState();
    });
    document.getElementById('btnCloseResult').addEventListener('click', () => {
        document.getElementById('modalResult').style.display = 'none';
    });

    document.getElementById('btnFecharEvento').addEventListener('click', () => {
        document.getElementById('modalEvento').style.display = 'none';
    });

    document.querySelectorAll('.alternative-btn').forEach(btn => {
        btn.addEventListener('click', function () {
            Game.ui.handleAlternativeClick(this.getAttribute('data-alt'), this);
        });
    });

    document.getElementById('btnFecharPedirAjuda').addEventListener('click', () => {
        Game.ui.fecharPedirAjudaModal();
    });

    document.getElementById('btnAceitarAjudaOferta').addEventListener('click', () => {
        Game.ui.responderOfertaAjuda(true);
    });

    document.getElementById('btnRecusarAjudaOferta').addEventListener('click', () => {
        Game.ui.responderOfertaAjuda(false);
    });

    document.getElementById('btnFecharAssessoriaSelect').addEventListener('click', () => {
        document.getElementById('modalAssessoriaSelect').style.display = 'none';
    });

    document.getElementById('btnRecusarAssessoria').addEventListener('click', () => {
        Game.ui.responderAssessoria(null, true);
    });

    commonListenersBound = true;
}

// ============================================
// EXPORTAÇÃO
// ============================================
window.Game = window.Game || {};
window.Game.ui = window.Game.ui || {};
Object.assign(window.Game.ui, { setupUI });