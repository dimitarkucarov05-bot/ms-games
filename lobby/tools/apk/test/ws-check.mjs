// Проверява, че WebSocket минава през препращача: собствен малък ws сървър (не сървърът на играта),
// пред него Java препращачът от APK-то, и клиент, който говори през него с текст и с двоични данни.
// Пуска се от test/run.ps1 след компилирането (иска build/pctest и модула ws от lobby/node_modules).
import { spawn } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import WebSocket, { WebSocketServer } from 'ws';

const here = path.dirname(fileURLToPath(import.meta.url));
const java = process.env.ARENA_JAVA || 'java';
const classes = path.join(here, '..', 'build', 'pctest');

const freePort = () => new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });

const wss = new WebSocketServer({ port: 0, host: '127.0.0.1' });
await new Promise(res => wss.once('listening', res));
wss.on('connection', (ws, req) => {
  ws.send(JSON.stringify({ type: 'welcome', url: req.url }));
  ws.on('message', (data, isBinary) => ws.send(data, { binary: isBinary }));
});

const listen = await freePort();
const fwd = spawn(java, ['-cp', classes, 'ForwardCli', String(listen), `127.0.0.1:${wss.address().port}`], { stdio: ['ignore', 'pipe', 'inherit'] });
const lines = [];
await new Promise((res, rej) => {
  fwd.stdout.on('data', d => { lines.push(...String(d).split(/\r?\n/).filter(Boolean)); if (lines.some(l => l.startsWith('READY'))) res(); });
  fwd.once('exit', code => rej(new Error('препращачът спря, код ' + code)));
  setTimeout(() => rej(new Error('препращачът не тръгна за 10 секунди')), 10000);
});

let failed = 0;
const check = (what, ok, detail = '') => { console.log(`  ${ok ? 'OK   ' : 'FAIL '} ${what}${detail ? `  (${detail})` : ''}`); if (!ok) failed++; };

try {
  const ws = new WebSocket(`ws://localhost:${listen}/headset?id=Q2-test`);
  const inbox = [];
  let wake = null;
  ws.on('message', (data, isBinary) => { inbox.push({ data, isBinary }); wake?.(); });
  const next = () => new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error('няма отговор за 5 секунди')), 5000);
    const take = () => { if (inbox.length) { clearTimeout(t); wake = null; res(inbox.shift()); } };
    wake = take; take();
  });
  await new Promise((res, rej) => { ws.once('open', res); ws.once('error', rej); });
  const hello = JSON.parse((await next()).data);
  check('ръкостискането минава и сървърът вижда пътя', hello.type === 'welcome' && hello.url === '/headset?id=Q2-test', hello.url);

  ws.send('Здравей, Арена');
  const text = await next();
  check('текстово съобщение на кирилица отива и се връща', !text.isBinary && String(text.data) === 'Здравей, Арена');

  const blob = crypto.randomBytes(300 * 1024);
  ws.send(blob);
  const bin = await next();
  check('300 KB двоични данни се връщат непроменени', bin.isBinary && Buffer.compare(Buffer.from(bin.data), blob) === 0);

  const t0 = performance.now();
  for (let i = 0; i < 200; i++) { ws.send('p' + i); await next(); }
  const ms = (performance.now() - t0) / 200;
  check('200 малки съобщения едно след друго', true, `${ms.toFixed(2)} ms на отиване и връщане`);

  const closed = new Promise(res => ws.once('close', code => res(code)));
  ws.close(1000);
  check('затварянето минава чисто', (await closed) === 1000);
  await new Promise(r => setTimeout(r, 200));
  check('в дневника на препращача има заявката за надграждане', lines.some(l => l.includes('GET /headset?id=Q2-test HTTP/1.1')));
} catch (e) {
  check('WebSocket през препращача', false, e.message);
} finally {
  fwd.kill();
  wss.close();
}
console.log(failed ? `НЕУСПЕШНИ ПРОВЕРКИ: ${failed}` : 'WEBSOCKET МИНАВА');
process.exit(failed ? 1 : 0);
