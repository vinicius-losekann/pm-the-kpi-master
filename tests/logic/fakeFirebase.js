// ============================================
// PM: The KPI Master - Testes de lógica: Firebase simulado
// ============================================
// Um Realtime Database em memória, com a parte da API "compat" do
// Firebase que o jogo usa: ref(), set(), update(), remove(), push(),
// once('value'), on('value' | 'child_added' | 'child_removed'), off(),
// transaction(), onDisconnect() e os caminhos especiais '.info/connected'
// e '.info/serverTimeOffset' (a diferença entre o relógio do aparelho e o
// do servidor, trocada pelo teste com setServerTimeOffset()).
//
// Vários "aparelhos" (client(uid)) enxergam o MESMO banco, como no
// servidor de verdade. Cada aparelho pode cair (goOffline: o servidor
// executa o que o aparelho deixou em onDisconnect()) e voltar
// (goOnline: as gravações feitas sem conexão sobem e os avisos que
// faltaram chegam). Um F5 é um aparelho novo com o mesmo uid.
//
// Como o banco de verdade, este não guarda null nem objeto ou lista
// vazios, e guarda lista como objeto com chaves "0", "1"... — é por isso
// que as mensagens viajam como texto JSON (T151).
//
// O que NÃO é simulado: as regras de segurança (testadas no emulador,
// tests/browser/connection-check.spec.js, e no T153) e os tempos de rede.
// Os avisos (on) chegam na hora, dentro da própria gravação.
// ============================================

/** Cópia profunda de um valor já guardado. */
function clone(value) {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

/**
 * O que o banco guarda de um valor: sem null/undefined, sem objeto ou
 * lista vazios, lista vira objeto com chaves "0", "1"... Devolve
 * undefined quando não sobra nada.
 */
function stored(value) {
    if (value === null || value === undefined) return undefined;
    if (typeof value !== 'object') return value;
    const out = {};
    Object.keys(value).forEach(key => {
        const v = stored(value[key]);
        if (v !== undefined) out[String(key)] = v;
    });
    return Object.keys(out).length ? out : undefined;
}

function splitPath(path) {
    return String(path || '').split('/').filter(Boolean);
}

function snapshotOf(key, value) {
    return {
        key,
        val: () => (value === undefined ? null : clone(value)),
        exists: () => value !== undefined
    };
}

/** Caminho especial do aparelho ('.info/...'), que chega mesmo sem conexão. */
function isInfo(path) {
    return path === '.info/connected' || path === '.info/serverTimeOffset';
}

/** Valor de um caminho '.info/' para o aparelho; undefined nos outros caminhos. */
function infoValue(client, path) {
    if (path === '.info/connected') return client.online;
    if (path === '.info/serverTimeOffset') return client.serverTimeOffset;
    return undefined;
}

function createFakeFirebase() {
    let tree;            // o banco inteiro (undefined = vazio)
    let pushCounter = 0;
    const clients = [];
    const listeners = []; // { client, path, event, cb, last }

    function readAt(path) {
        let node = tree;
        for (const part of splitPath(path)) {
            if (!node || typeof node !== 'object' || !(part in node)) return undefined;
            node = node[part];
        }
        return clone(node);
    }

    function writeAt(path, value) {
        const parts = splitPath(path);
        const v = stored(value);
        if (parts.length === 0) { tree = v; return; }
        const root = tree && typeof tree === 'object' ? tree : {};
        let node = root;
        for (let i = 0; i < parts.length - 1; i++) {
            if (!node[parts[i]] || typeof node[parts[i]] !== 'object') node[parts[i]] = {};
            node = node[parts[i]];
        }
        const last = parts[parts.length - 1];
        if (v === undefined) delete node[last];
        else node[last] = v;
        tree = stored(root);
    }

    /** Valor que o ouvinte enxerga agora (os caminhos '.info/' são do aparelho). */
    function currentFor(listener) {
        return infoValue(listener.client, listener.path) ?? readAt(listener.path);
    }

    function childKeys(value) {
        return value && typeof value === 'object' ? Object.keys(value).sort() : [];
    }

    /** Avisa cada ouvinte de aparelho conectado do que mudou desde o último aviso. */
    function notify() {
        for (const l of listeners.slice()) {
            if (!listeners.includes(l)) continue;
            if (!l.client.online && !isInfo(l.path)) continue;
            const now = currentFor(l);
            if (l.event === 'value') {
                const text = JSON.stringify(now === undefined ? null : now);
                if (text !== l.last) {
                    l.last = text;
                    l.cb(snapshotOf(splitPath(l.path).pop() || null, now));
                }
            } else {
                // Guarda o que já foi visto ANTES de avisar: o aviso pode
                // gravar de novo (ex.: o eco de uma mensagem) e disparar
                // outro notify() no meio deste.
                const before = l.last || [];
                const old = l.lastValue || {};
                const after = childKeys(now);
                l.last = after;
                l.lastValue = clone(now) || {};
                if (l.event === 'child_added') {
                    after.filter(k => !before.includes(k)).forEach(k => l.cb(snapshotOf(k, now[k])));
                } else if (l.event === 'child_removed') {
                    before.filter(k => !after.includes(k)).forEach(k => l.cb(snapshotOf(k, old[k])));
                }
            }
        }
    }

    function client(uid) {
        const me = {
            uid,
            online: true,
            closed: false,
            serverTimeOffset: 0, // ms que o relógio do servidor está à frente do aparelho
            queue: [],          // gravações feitas sem conexão
            disconnectOps: [],  // { path, value } — onDisconnect()
            writes: []          // { path, value } — tudo o que este aparelho gravou
        };

        function apply(path, value) {
            me.writes.push({ path, value: clone(value) });
            if (!me.online) { me.queue.push({ path, value: clone(value) }); return; }
            writeAt(path, value);
            notify();
        }

        function ref(path) {
            const parts = splitPath(path);
            const fullPath = parts.join('/');
            const r = {
                key: parts.length ? parts[parts.length - 1] : null,
                path: fullPath,
                child: (p) => ref(fullPath + '/' + p),
                set: (value) => { apply(fullPath, value); return Promise.resolve(); },
                update: (values) => {
                    Object.keys(values).forEach(k => apply(fullPath + '/' + k, values[k]));
                    return Promise.resolve();
                },
                remove: () => { apply(fullPath, null); return Promise.resolve(); },
                push: (value) => {
                    pushCounter++;
                    const child = ref(fullPath + '/k' + String(pushCounter).padStart(8, '0'));
                    if (value !== undefined) child.set(value);
                    return child;
                },
                once: (event) => {
                    if (event !== 'value') throw new Error('fakeFirebase: once só aceita "value"');
                    const value = isInfo(fullPath) ? infoValue(me, fullPath) : readAt(fullPath);
                    return Promise.resolve(snapshotOf(r.key, value));
                },
                on: (event, cb) => {
                    if (!['value', 'child_added', 'child_removed'].includes(event)) {
                        throw new Error('fakeFirebase: evento não simulado: ' + event);
                    }
                    const l = { client: me, path: fullPath, event, cb, last: undefined, lastValue: {} };
                    if (event === 'child_removed') {
                        const now = readAt(fullPath);
                        l.last = childKeys(now);
                        l.lastValue = clone(now) || {};
                    }
                    listeners.push(l);
                    if (me.online || isInfo(fullPath)) notify();
                    return cb;
                },
                off: (event, cb) => {
                    for (let i = listeners.length - 1; i >= 0; i--) {
                        const l = listeners[i];
                        if (l.client === me && l.path === fullPath && (!event || l.event === event) && (!cb || l.cb === cb)) {
                            listeners.splice(i, 1);
                        }
                    }
                },
                transaction: (update) => {
                    const current = readAt(fullPath);
                    const next = update(current === undefined ? null : current);
                    if (next === undefined) {
                        return Promise.resolve({ committed: false, snapshot: snapshotOf(r.key, current) });
                    }
                    apply(fullPath, next);
                    return Promise.resolve({ committed: true, snapshot: snapshotOf(r.key, readAt(fullPath)) });
                },
                onDisconnect: () => ({
                    set: (value) => { me.disconnectOps.push({ path: fullPath, value: clone(value) }); return Promise.resolve(); },
                    remove: () => { me.disconnectOps.push({ path: fullPath, value: null }); return Promise.resolve(); },
                    cancel: () => {
                        me.disconnectOps = me.disconnectOps.filter(op => op.path !== fullPath);
                        return Promise.resolve();
                    }
                })
            };
            return r;
        }

        Object.assign(me, {
            db: { ref },
            /** A conexão cai sem aviso: o servidor executa o onDisconnect() deste aparelho. */
            goOffline() {
                if (!me.online) return;
                me.online = false;
                const ops = me.disconnectOps;
                me.disconnectOps = [];
                ops.forEach(op => writeAt(op.path, op.value));
                notify();
            },
            /** A conexão volta: sobem as gravações pendentes e chegam os avisos que faltaram. */
            goOnline() {
                if (me.online || me.closed) return;
                me.online = true;
                const queued = me.queue;
                me.queue = [];
                queued.forEach(op => writeAt(op.path, op.value));
                notify();
            },
            /** A página fecha (ou recarrega): cai e não ouve mais nada. */
            close() {
                me.goOffline();
                me.closed = true;
                for (let i = listeners.length - 1; i >= 0; i--) {
                    if (listeners[i].client === me) listeners.splice(i, 1);
                }
            },
            /** O Firebase informa outra diferença entre o relógio do aparelho e o do servidor. */
            setServerTimeOffset(ms) {
                me.serverTimeOffset = ms;
                notify();
            },
            /** Quantos ouvintes este aparelho tem registrados. */
            listenerCount: () => listeners.filter(l => l.client === me).length
        });
        clients.push(me);
        return me;
    }

    return {
        client,
        /** Lê direto do banco (o que o servidor guardou), fora de qualquer aparelho. */
        read: (path) => readAt(path),
        /** Grava direto no banco, como se fosse outro aparelho qualquer. */
        write: (path, value) => { writeAt(path, value); notify(); }
    };
}

/** Deixa rodar as promessas pendentes (o código do jogo é assíncrono). */
function flush() {
    return new Promise(resolve => setImmediate(resolve)).then(() => new Promise(resolve => setImmediate(resolve)));
}

module.exports = { createFakeFirebase, flush, stored };
