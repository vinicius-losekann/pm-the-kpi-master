// ============================================
// PM: The KPI Master - Testes no navegador: servidores locais
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

const ROOT = path.resolve(__dirname, '..', '..');
const SITE_PORT = Number(process.env.SITE_PORT || 8080);
const PEER_PORT = Number(process.env.PEER_PORT || 9000);

const CONTENT_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.ico': 'image/x-icon'
};

const site = http.createServer((req, res) => {
    let urlPath = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname);
    if (urlPath.endsWith('/')) urlPath += 'index.html';
    const file = path.normalize(path.join(ROOT, urlPath));
    if (!file.startsWith(ROOT)) {
        res.writeHead(403);
        res.end();
        return;
    }
    fs.readFile(file, (error, content) => {
        if (error) {
            res.writeHead(404);
            res.end('não encontrado');
            return;
        }
        res.writeHead(200, {
            'Content-Type': CONTENT_TYPES[path.extname(file)] || 'application/octet-stream',
            'Cache-Control': 'no-store'
        });
        res.end(content);
    });
});

site.listen(SITE_PORT, '127.0.0.1', () => {
    console.log('Site do jogo em http://127.0.0.1:' + SITE_PORT);
});

PeerServer({ port: PEER_PORT, host: '127.0.0.1', path: '/' }, () => {
    console.log('Servidor PeerJS em 127.0.0.1:' + PEER_PORT);
});