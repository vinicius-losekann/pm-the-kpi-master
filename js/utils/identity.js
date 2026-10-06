// ============================================
// PM: The KPI Master - Identidade do jogador por sala
// ============================================
// Cada navegador guarda um token aleatório por sala (chave
// pelo ID base da sala, que não muda com a migração de host). O guest
// envia o token no 'player-join'; o host guarda na lista de jogadores
// apenas o HASH (SHA-256) do token, em `tokenHash`. Assim:
//   - a reconexão de um jogador desconectado exige o mesmo token —
//     saber o nome de quem caiu não basta mais para entrar no lugar
//     dele;
//   - o hash pode circular em 'player-list'/'state-sync' sem expor o
//     token (a partir do hash não dá para obter o token);
//   - depois de uma migração, o novo host já tem os hashes de todo
//     mundo (vieram na lista) e continua conseguindo conferir.
//
// SHA-256 próprio e síncrono (em vez de crypto.subtle) por dois
// motivos: crypto.subtle só existe em HTTPS/localhost — quebraria o
// jogo aberto por IP na rede local — e é assíncrono, o que obrigaria
// addPlayer() a esperar o cálculo, abrindo espaço para duas entradas
// se cruzarem no meio. Conferido nos testes automatizados contra os
// vetores oficiais e contra a implementação nativa do Node.
//
// Limitação aceita: trocar de navegador, usar aba anônima ou limpar
// os dados do site no meio da partida perde a identidade (o jogador
// só volta quando o host voltar ao lobby). Abas do mesmo navegador
// compartilham o mesmo token.
// ============================================

const TOKEN_KEY_PREFIX = 'pmKPI_token_';

// Reserva em memória para quando o localStorage não está disponível
// (ex: alguns modos privados). Vale só enquanto a página estiver
// aberta — um F5 gera um token novo.
const inMemoryTokens = {};

/**
 * Gera um token aleatório de 128 bits em hexadecimal (32 caracteres).
 * crypto.getRandomValues funciona também fora de HTTPS.
 */
function generateToken() {
    const bytes = new Uint8Array(16);
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
        crypto.getRandomValues(bytes);
    } else {
        for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
    }
    return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Devolve o token deste navegador para a sala informada, criando e
 * guardando um novo na primeira vez. Nunca é apagado ao sair da
 * sessão: quem sai e volta na mesma partida continua reconhecido.
 * @param {string} baseRoomPeerId - ID base da sala (Game.state.baseRoomPeerId)
 */
function getRoomToken(baseRoomPeerId) {
    const key = TOKEN_KEY_PREFIX + (baseRoomPeerId || '');

    try {
        const saved = localStorage.getItem(key);
        if (saved) return saved;
        const created = generateToken();
        localStorage.setItem(key, created);
        return created;
    } catch (e) {
        if (!inMemoryTokens[key]) {
            console.warn('⚠️ localStorage indisponível — a identidade nesta sala vale só enquanto a página estiver aberta.');
            inMemoryTokens[key] = generateToken();
        }
        return inMemoryTokens[key];
    }
}

// ============================================
// SHA-256 (FIPS 180-4)
// ============================================

const SHA256_K = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
];

/**
 * Converte texto em bytes UTF-8 (sem depender de TextEncoder).
 */
function toUtf8(text) {
    const bytes = [];
    for (let i = 0; i < text.length; i++) {
        let cp = text.charCodeAt(i);
        // Par substituto (caracteres fora do plano básico, ex: emoji)
        if (cp >= 0xd800 && cp <= 0xdbff && i + 1 < text.length) {
            const low = text.charCodeAt(i + 1);
            if (low >= 0xdc00 && low <= 0xdfff) {
                cp = 0x10000 + ((cp - 0xd800) << 10) + (low - 0xdc00);
                i++;
            }
        }
        if (cp < 0x80) {
            bytes.push(cp);
        } else if (cp < 0x800) {
            bytes.push(0xc0 | (cp >> 6), 0x80 | (cp & 0x3f));
        } else if (cp < 0x10000) {
            bytes.push(0xe0 | (cp >> 12), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f));
        } else {
            bytes.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 0x3f), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f));
        }
    }
    return bytes;
}

function rotr(x, n) {
    return (x >>> n) | (x << (32 - n));
}

/**
 * SHA-256 de um texto (UTF-8), em hexadecimal minúsculo (64 caracteres).
 */
function sha256Hex(text) {
    const bytes = toUtf8(String(text));
    const bitLength = bytes.length * 8;

    // Preenchimento: 0x80, zeros e o tamanho original em 64 bits (big-endian),
    // completando um múltiplo de 64 bytes.
    const total = Math.ceil((bytes.length + 9) / 64) * 64;
    const msg = new Uint8Array(total);
    msg.set(bytes);
    msg[bytes.length] = 0x80;
    const dv = new DataView(msg.buffer);
    dv.setUint32(total - 8, Math.floor(bitLength / 0x100000000));
    dv.setUint32(total - 4, bitLength >>> 0);

    const h = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
    const w = new Uint32Array(64);

    for (let block = 0; block < total; block += 64) {
        for (let i = 0; i < 16; i++) w[i] = dv.getUint32(block + i * 4);
        for (let i = 16; i < 64; i++) {
            const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
            const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
            w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
        }

        let a = h[0], b = h[1], c = h[2], d = h[3], e = h[4], f = h[5], g = h[6], hh = h[7];
        for (let i = 0; i < 64; i++) {
            const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
            const ch = (e & f) ^ (~e & g);
            const t1 = (hh + S1 + ch + SHA256_K[i] + w[i]) >>> 0;
            const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
            const maj = (a & b) ^ (a & c) ^ (b & c);
            const t2 = (S0 + maj) >>> 0;
            hh = g; g = f; f = e; e = (d + t1) >>> 0;
            d = c; c = b; b = a; a = (t1 + t2) >>> 0;
        }

        h[0] = (h[0] + a) >>> 0; h[1] = (h[1] + b) >>> 0;
        h[2] = (h[2] + c) >>> 0; h[3] = (h[3] + d) >>> 0;
        h[4] = (h[4] + e) >>> 0; h[5] = (h[5] + f) >>> 0;
        h[6] = (h[6] + g) >>> 0; h[7] = (h[7] + hh) >>> 0;
    }

    return h.map(x => x.toString(16).padStart(8, '0')).join('');
}

/**
 * Hash que vai para `tokenHash` na lista de jogadores.
 */
function hashToken(token) {
    return sha256Hex(token);
}

/**
 * Atalho: hash do token deste navegador para a sala informada.
 */
function myTokenHash(baseRoomPeerId) {
    return hashToken(getRoomToken(baseRoomPeerId));
}

// ============================================
// EXPORTAÇÃO
// ============================================
window.Game = window.Game || {};
window.Game.identity = {
    getRoomToken,
    hashToken,
    myTokenHash,
    sha256Hex
};