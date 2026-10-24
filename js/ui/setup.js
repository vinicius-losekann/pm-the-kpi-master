// ============================================
// PM: The KPI Master - UI: Setup
// ============================================
// Alterna a visibilidade dos elementos conforme o papel do jogador
// (host/guest) e delega o bind dos botões de ação para
// ui/components/controlsComponent.js (Game.ui.bindControls()).
//
// Este arquivo cuida só de: (1) mostrar/esconder elementos conforme o
// papel, e (2) navegação de tela / fechamento de modais que não são,
// estritamente, "ações do jogo" (essas ficam em controlsComponent.js).
// ============================================

let commonListenersBound = false;

/**
 * Configura a UI. É chamada na inicialização, depois de a sala abrir
 * (o papel vem do banco).
 */
function setupUI() {
    const state = Game.state;

    // Faixa "👑 Você é o host" no topo da tela da partida, só no host.
    const hostBanner = document.getElementById('hostBanner');
    hostBanner.textContent = Game.i18n.t('host.banner');
    hostBanner.style.display = state.isHost ? 'block' : 'none';

    if (state.isHost) {
        document.getElementById('hostControls').style.display = 'block';
        document.getElementById('playerWaiting').style.display = 'none';
        document.getElementById('hostRoomIdSection').style.display = 'block';
        document.getElementById('roomPeerId').textContent = state.roomName;
        document.getElementById('btnEndSession').style.display = 'inline-block';
        document.getElementById('btnEndMatch').style.display = 'block';
        document.getElementById('btnNewRound').style.display = 'block';
        document.getElementById('btnNewRound').disabled = true;
        document.getElementById('btnLeaveSession').style.display = 'none';
        document.getElementById('btnLeaveMatch').style.display = 'none';

        // Depois de um F5, a entrada do host já veio do estado salvo.
        if (!state.players.find(p => p.isHost)) {
            state.players.unshift({
                name: state.playerName,
                peerId: state.peerId,
                kpi: 0,
                focusArea: CONFIG.FOCUS_AREAS[0].id,
                activities: 0,
                isHost: true,
                waitingInLobby: false,
                resources: CONFIG.STARTING_RESOURCES
            });
        }
        Game.ui.updatePlayersList();
    } else {
        document.getElementById('hostControls').style.display = 'none';
        document.getElementById('playerWaiting').style.display = 'block';
        document.getElementById('hostRoomIdSection').style.display = 'none';
        document.getElementById('btnEndSession').style.display = 'none';
        document.getElementById('btnEndMatch').style.display = 'none';
        document.getElementById('btnNewRound').style.display = 'none';
        document.getElementById('btnLeaveSession').style.display = 'inline-block';
        document.getElementById('btnLeaveMatch').style.display = 'block';
    }

    // Botões de ação (assessoria ou ajuda, sessão, partida, nova rodada)
    // agora são responsabilidade de controlsComponent.js.
    Game.ui.bindControls();

    // Recalcula o estado real do botão "Nova Rodada" (ciclo completo ou
    // não) — inclusive depois de um F5 do host no meio da partida.
    Game.ui.refreshNewRoundButton();

    if (commonListenersBound) return;

    // Navegação de tela e fechamento de modais.
    document.getElementById('btnExitGameOver').addEventListener('click', () => {
        Game.network.cleanup();
        window.location.href = './';
    });
    document.getElementById('btnBackToLobby').addEventListener('click', () => {
        // Lógica em sessionEngine.backToLobby() (também tira
        // da lista quem caiu durante a partida e não voltou).
        Game.core.backToLobby();
    });
    document.getElementById('btnCloseResult').addEventListener('click', () => {
        document.getElementById('modalResult').style.display = 'none';
    });

    document.getElementById('btnCloseEvent').addEventListener('click', () => {
        document.getElementById('modalEvent').style.display = 'none';
    });

    document.querySelectorAll('.alternative-btn').forEach(btn => {
        btn.addEventListener('click', function () {
            Game.ui.handleAlternativeClick(this.getAttribute('data-alt'), this);
        });
    });

    document.getElementById('btnCloseAdvisorySelect').addEventListener('click', () => {
        document.getElementById('modalAdvisorySelect').style.display = 'none';
    });

    document.getElementById('btnDeclineAdvisory').addEventListener('click', () => {
        Game.ui.answerAdvisory(null, true);
    });

    commonListenersBound = true;
}

// ============================================
// EXPORTAÇÃO
// ============================================
window.Game = window.Game || {};
window.Game.ui = window.Game.ui || {};
Object.assign(window.Game.ui, { setupUI });