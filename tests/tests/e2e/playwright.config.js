// ============================================
// PM: The KPI Master - Testes de ponta a ponta: configuração
// ============================================
// Rodar a partir da raiz do repositório:
//   npm ci
//   npx playwright install chromium
//   npx playwright test --config tests/e2e/playwright.config.js
// ============================================

const path = require('path');
const { defineConfig } = require('@playwright/test');

const RAIZ = path.resolve(__dirname, '..', '..');
const NO_ACTIONS = !!process.env.CI;

module.exports = defineConfig({
    testDir: __dirname,
    testMatch: '*.spec.js',
    // Cada cenário espera de verdade o prazo de troca de host (10s).
    timeout: 120000,
    expect: { timeout: 20000 },
    // Um cenário por vez: os jogadores de um cenário são janelas
    // separadas do mesmo navegador, e os tempos de rede ficam mais
    // previsíveis sem cenários disputando a máquina.
    workers: 1,
    // Uma repetição no Actions para separar falha real de instabilidade
    // de rede; o relatório mostra se precisou repetir.
    retries: NO_ACTIONS ? 1 : 0,
    reporter: NO_ACTIONS
        ? [['list'], ['github'], ['./resumo.js'], ['html', { open: 'never', outputFolder: path.join(RAIZ, 'playwright-report') }]]
        : [['list']],
    outputDir: path.join(RAIZ, 'test-results'),
    use: {
        browserName: 'chromium',
        headless: true,
        trace: 'retain-on-failure'
    },
    webServer: {
        command: 'node tests/e2e/servidores.js',
        cwd: RAIZ,
        url: 'http://127.0.0.1:8080/index.html',
        reuseExistingServer: !NO_ACTIONS,
        timeout: 30000
    }
});