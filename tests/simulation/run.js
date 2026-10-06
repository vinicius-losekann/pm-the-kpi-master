// ============================================
// PM: The KPI Master - Simulador de partidas: execução
// ============================================
// Lê o formulário do "Run workflow" (variáveis de ambiente com os nomes
// dos campos, em maiúsculas: PARTIDAS, JOGADORES, SEMENTE, ACERTOS,
// TEMPO_RESPOSTA, ASSESSORIA, PEDIR_AJUDA, ACEITAR_AJUDA, CENARIO_B),
// roda as partidas do config atual e, se houver, as do cenário B (com
// as mesmas sementes), e grava:
//   - simulacao/relatorio.md (também no resumo da execução do Actions);
//   - simulacao/partidas.csv e simulacao/partidas-cenario-b.csv.
// Rodar a partir da raiz (workflow .github/workflows/simulacao.yml):
//     node tests/simulation/run.js
// ============================================

const fs = require('fs');
const path = require('path');
const simulator = require('./simulator');

const OUTPUT = path.resolve(__dirname, '..', '..', 'simulacao');
const FIELDS = ['partidas', 'jogadores', 'semente', 'acertos', 'tempo_resposta', 'assessoria', 'pedir_ajuda', 'aceitar_ajuda', 'cenario_b'];

function progress(label) {
    return (done, total) => {
        if (done === total || done % 50 === 0) console.log('  ' + label + ': ' + done + '/' + total + ' partidas');
    };
}

async function main() {
    const inputs = Object.fromEntries(FIELDS.map(field => [field, process.env[field.toUpperCase()]]));
    const { options, overridesB } = simulator.optionsFromInputs(inputs);

    console.log('🎲 Simulando ' + options.matches + ' partidas de ' + options.players + ' jogadores (semente ' + options.seed + ')');
    const a = await simulator.simulateMany(options, progress('Config atual'));
    const b = overridesB ? await simulator.simulateMany({ ...options, overrides: overridesB }, progress('Cenário B')) : null;

    const report = simulator.buildReport({ a, b, commit: (process.env.GITHUB_SHA || 'local').slice(0, 7) });
    fs.mkdirSync(OUTPUT, { recursive: true });
    fs.writeFileSync(path.join(OUTPUT, 'relatorio.md'), report);
    fs.writeFileSync(path.join(OUTPUT, 'partidas.csv'), simulator.toCsv(a));
    if (b) fs.writeFileSync(path.join(OUTPUT, 'partidas-cenario-b.csv'), simulator.toCsv(b));
    if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, report);

    console.log('\n' + report);
}

main().catch((err) => {
    const message = '❌ Simulação não rodou: ' + err.message;
    console.log(message);
    if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, '### ' + message + '\n');
    process.exit(1);
});
