// ============================================
// PM: The KPI Master - Testes no navegador: configuração
// ============================================
// Rodar a partir da raiz do repositório:
//   npm ci
//   npx playwright install chromium
//   npm install -g firebase-tools@15.32.1   (precisa de Java 21)
//   npx playwright test --config tests/browser/playwright.config.js
// ============================================

const path = require('path');
const { defineConfig } = require('@playwright/test');

const ROOT = path.resolve(__dirname, '..', '..');
const ON_CI = !!process.env.CI;

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
    retries: ON_CI ? 1 : 0,
    reporter: ON_CI
        ? [['list'], ['github'], ['./summary.js'], ['html', { open: 'never', outputFolder: path.join(ROOT, 'playwright-report') }]]
        : [['list']],
    outputDir: path.join(ROOT, 'test-results'),
    use: {
        browserName: 'chromium',
        headless: true,
        trace: 'retain-on-failure'
    },
    webServer: [
        {
            command: 'node tests/browser/servers.js',
            cwd: ROOT,
            url: 'http://127.0.0.1:8080/index.html',
            reuseExistingServer: !ON_CI,
            timeout: 30000
        },
        {
            // Emulador do Firebase (login e banco) para a página de teste
            // de conexão; portas e regras no firebase.json. O projeto
            // "demo-" só existe no emulador: não usa o projeto de verdade.
            // Na primeira vez, o emulador baixa os arquivos dele.
            command: 'firebase emulators:start --only auth,database --project demo-pm-the-kpi-master',
            cwd: ROOT,
            url: 'http://127.0.0.1:9099',
            reuseExistingServer: !ON_CI,
            timeout: 180000
        }
    ]
});