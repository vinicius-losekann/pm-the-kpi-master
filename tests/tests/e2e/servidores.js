// ============================================
// PM: The KPI Master - Testes de ponta a ponta: servidores locais
// ============================================
// Sobe, na própria máquina dos testes:
//   - um servidor estático com os arquivos do jogo (a raiz do
//     repositório), em http://127.0.0.1:8080;
//   - um servidor de sinalização PeerJS, em 127.0.0.1:9000, no lugar do
//     servidor público (0.peerjs.com).
// Assim os testes não dependem da internet nem do servidor público.
// Iniciado pelo Playwright (webServer em playwright.config.js).
// ============================================

const http = require('http');
const fs = require('fs');
const path = require('path');
const { PeerServer } = require('peer');

const RAIZ = path.resolve(__dirname, '..', '..');
const PORTA_SITE = Number(process.env.PORTA_SITE || 8080);
const PORTA_PEER = Number(process.env.PORTA_PEER || 9000);

const TIPOS = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.ico': 'image/x-icon'
};

const site = http.createServer((req, res) => {
    let caminho = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname);
    if (caminho.endsWith('/')) caminho += 'index.html';
    const arquivo = path.normalize(path.join(RAIZ, caminho));
    if (!arquivo.startsWith(RAIZ)) {
        res.writeHead(403);
        res.end();
        return;
    }
    fs.readFile(arquivo, (erro, conteudo) => {
        if (erro) {
            res.writeHead(404);
            res.end('não encontrado');
            return;
        }
        res.writeHead(200, {
            'Content-Type': TIPOS[path.extname(arquivo)] || 'application/octet-stream',
            'Cache-Control': 'no-store'
        });
        res.end(conteudo);
    });
});

site.listen(PORTA_SITE, '127.0.0.1', () => {
    console.log('Site do jogo em http://127.0.0.1:' + PORTA_SITE);
});

PeerServer({ port: PORTA_PEER, host: '127.0.0.1', path: '/' }, () => {
    console.log('Servidor PeerJS em 127.0.0.1:' + PORTA_PEER);
});