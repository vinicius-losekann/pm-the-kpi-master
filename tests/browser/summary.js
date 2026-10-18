// ============================================
// PM: The KPI Master - Testes no navegador: resumo no Actions
// ============================================
// Escreve a tabela de resultados na página da execução do GitHub
// Actions (mesmo formato do resumo dos testes de tests/logic).
// ============================================

const fs = require('fs');

class Summary {
    constructor() {
        this.results = new Map();
    }

    onTestEnd(test, result) {
        // Com repetição, vale o último resultado de cada cenário.
        // Medidas que o cenário anotou (type 'measure', ex.: o tempo do F5
        // do host no E1) vão para a coluna "Detalhe".
        const notes = [...(test.annotations || []), ...(result.annotations || [])]
            .filter(a => a && a.type === 'measure' && a.description)
            .map(a => a.description);
        const measures = notes.filter((d, i) => notes.indexOf(d) === i);
        this.results.set(test.id, { title: test.title, result, attempts: result.retry + 1, measures });
    }

    onEnd() {
        const target = process.env.GITHUB_STEP_SUMMARY;
        if (!target) return;

        const list = Array.from(this.results.values());
        const passed = list.filter(r => r.result.status === 'passed').length;
        const failed = list.length - passed;

        const lines = [
            '### 🌐 No navegador — ' + passed + ' passaram, ' + failed + ' falharam',
            '',
            '| | Cenário | Tempo | Detalhe |',
            '|---|---|---|---|'
        ];
        for (const r of list) {
            const ok = r.result.status === 'passed';
            const seconds = Math.round(r.result.duration / 1000) + 's';
            let detail = '';
            if (!ok && r.result.error) {
                detail = String(r.result.error.message || '').split('\n')[0].replace(/\|/g, '\\|').slice(0, 200);
            } else if (ok && r.attempts > 1) {
                detail = 'passou na repetição';
            }
            if (ok && r.measures.length) {
                detail = [detail, ...r.measures].filter(Boolean).join(' · ').replace(/\|/g, '\\|');
            }
            lines.push('| ' + (ok ? '✅' : '❌') + ' | ' + r.title + ' | ' + seconds + ' | ' + detail + ' |');
        }
        fs.appendFileSync(target, lines.join('\n') + '\n');
    }
}

module.exports = Summary;