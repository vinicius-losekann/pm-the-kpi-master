// ============================================
// PM: The KPI Master - Testes de ponta a ponta: resumo no Actions
// ============================================
// Escreve a tabela de resultados na página da execução do GitHub
// Actions (mesmo formato do resumo dos testes de tests/faseD.test.js).
// ============================================

const fs = require('fs');

class Resumo {
    constructor() {
        this.resultados = new Map();
    }

    onTestEnd(teste, resultado) {
        // Com repetição, vale o último resultado de cada cenário.
        this.resultados.set(teste.id, { titulo: teste.title, resultado, tentativas: resultado.retry + 1 });
    }

    onEnd() {
        const destino = process.env.GITHUB_STEP_SUMMARY;
        if (!destino) return;

        const lista = Array.from(this.resultados.values());
        const passou = lista.filter(r => r.resultado.status === 'passed').length;
        const falhou = lista.length - passou;

        const linhas = [
            '### 🌐 Ponta a ponta — ' + passou + ' passaram, ' + falhou + ' falharam',
            '',
            '| | Cenário | Tempo | Detalhe |',
            '|---|---|---|---|'
        ];
        for (const r of lista) {
            const ok = r.resultado.status === 'passed';
            const segundos = Math.round(r.resultado.duration / 1000) + 's';
            let detalhe = '';
            if (!ok && r.resultado.error) {
                detalhe = String(r.resultado.error.message || '').split('\n')[0].replace(/\|/g, '\\|').slice(0, 200);
            } else if (ok && r.tentativas > 1) {
                detalhe = 'passou na repetição';
            }
            linhas.push('| ' + (ok ? '✅' : '❌') + ' | ' + r.titulo + ' | ' + segundos + ' | ' + detalhe + ' |');
        }
        fs.appendFileSync(destino, linhas.join('\n') + '\n');
    }
}

module.exports = Resumo;