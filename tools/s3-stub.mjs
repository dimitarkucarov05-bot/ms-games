// S3 test stub: serves public/ and a fake /headset socket, so the headset page can be tested without the real server.
//
//   node tools/s3-stub.mjs [--port 47958]
//   open http://localhost:47958/play/?desktop=1&id=DEV&name=DEV
//
//   POST /stub/send   {type, ...}        -> sent to every connected headset page
//   GET  /stub/log                        -> the last 300 messages from the headsets (pose left out)
//   GET  /stub/status                     -> the last status of every headset
//
// Answers `hello` with `welcome`, a one-player `room` every second and `ping {t}` every 2 s (like the server will).

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';

const HERE = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const PUB = path.join(HERE, 'public');
const arg = n => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : null; };
const PORT = Number(arg('--port') || 47958);
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.glb': 'model/gltf-binary', '.ogg': 'audio/ogg', '.webmanifest': 'application/manifest+json' };

const log = [], status = {}, socks = new Set();
const body = req => new Promise(r => { let s = ''; req.on('data', d => { s += d; }); req.on('end', () => r(s)); });
const json = (res, o, code = 200) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/stub/send' && req.method === 'POST') {
    let m; try { m = JSON.parse(await body(req)); } catch { return json(res, { error: 'bad json' }, 400); }
    for (const ws of socks) ws.send(JSON.stringify(m));
    return json(res, { ok: true, sent: socks.size });
  }
  if (url.pathname === '/stub/helpers.js') { res.writeHead(200, { 'content-type': 'text/javascript', 'cache-control': 'no-store' }); return res.end(fs.readFileSync(path.join(HERE, 'tools', 's3-devpage.js'))); }
  if (url.pathname === '/stub/log') return json(res, log.slice(-Number(url.searchParams.get('n') || 300)));
  if (url.pathname === '/stub/status') return json(res, status);
  if (req.method === 'PUT' && url.pathname === '/dev/save') {      // pictures from the page, like the dev server's
    const rel = (url.searchParams.get('path') || '').replace(/\\/g, '/');
    if (!/^[\w./ -]+$/.test(rel) || rel.includes('..')) return json(res, { error: 'bad path' }, 400);
    const out = path.join(HERE, '..', 'research', 'shots', 's3', path.basename(rel));
    fs.mkdirSync(path.dirname(out), { recursive: true });
    const chunks = []; req.on('data', d => chunks.push(d)); req.on('end', () => { fs.writeFileSync(out, Buffer.concat(chunks)); json(res, { ok: true, file: out }); });
    return;
  }
  let p = decodeURIComponent(url.pathname);
  if (p.endsWith('/')) p += 'index.html';
  const file = path.join(PUB, p);
  if (!file.startsWith(PUB)) { res.writeHead(403); return res.end(); }
  fs.stat(file, (e, st) => {
    if (e || !st.isFile()) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
    fs.createReadStream(file).pipe(res);
  });
});

const wss = new WebSocketServer({ noServer: true });
server.on('upgrade', (req, socket, head) => {
  if (new URL(req.url, 'http://x').pathname !== '/headset') return socket.destroy();
  wss.handleUpgrade(req, socket, head, ws => wss.emit('connection', ws));
});
wss.on('connection', ws => {
  socks.add(ws);
  let id = null, name = 'Headset';
  const room = setInterval(() => { if (id) ws.send(JSON.stringify({ type: 'room', players: [{ id, n: 1, name, team: 0, c: 1, p: new Array(21).fill(0) }] })); }, 1000);
  const ping = setInterval(() => ws.send(JSON.stringify({ type: 'ping', t: Date.now(), lastMs: status[id]?.lastPing ?? null })), 2000);
  ws.on('message', d => {
    let m; try { m = JSON.parse(d); } catch { return; }
    if (m.type === 'pose') return;
    if (m.type === 'status') { status[id] = { ...(status[id] || {}), ...m, at: Date.now() }; return; }
    if (m.type === 'hello') { id = m.id; name = m.name || name; ws.send(JSON.stringify({ type: 'welcome', name })); }
    if (m.type === 'health' && m.t) { status[id] = { ...(status[id] || {}), lastPing: Date.now() - m.t }; }
    log.push({ at: new Date().toISOString().slice(11, 23), from: id, ...m });
    if (log.length > 1000) log.splice(0, 500);
    if (m.type !== 'health') console.log('<-', id, JSON.stringify(m).slice(0, 200));
  });
  ws.on('close', () => { socks.delete(ws); clearInterval(room); clearInterval(ping); });
});
server.listen(PORT, () => console.log(`S3 stub on http://localhost:${PORT}/play/?desktop=1&id=DEV&name=DEV`));
