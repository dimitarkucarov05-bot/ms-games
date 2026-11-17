// Оставя един-единствен раздел с играта в каската, презарежда го и натиска „Влез".
import { execFileSync } from 'node:child_process';
import WebSocket from 'ws';
const ADB = 'C:/Android/sdk/platform-tools/adb.exe';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const name = process.argv[2] || '';
const serial = execFileSync(ADB, ['devices'], { encoding: 'utf8' }).split('\n').map(l => l.trim().split(/\s+/)).find(l => l[1] === 'device')?.[0];
if (!serial) { console.log('няма каска по кабел'); process.exit(1); }
execFileSync(ADB, ['-s', serial, 'reverse', 'tcp:47801', 'tcp:47801']);
execFileSync(ADB, ['-s', serial, 'forward', 'tcp:9222', 'localabstract:chrome_devtools_remote']);
const list = async () => (await fetch('http://127.0.0.1:9222/json').then(r => r.json())).filter(p => p.type === 'page');
let pages = (await list()).filter(p => p.url.includes('/play/'));
console.log('раздели с играта:', pages.length);
for (const p of pages.slice(1)) { await fetch(`http://127.0.0.1:9222/json/close/${p.id}`); console.log('затворих', p.id); }
const url = `http://localhost:47801/play/?id=${serial}${name ? `&name=${encodeURIComponent(name)}` : ''}`;
if (!pages.length) {
  execFileSync(ADB, ['-s', serial, 'shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', `'${url}'`, 'com.oculus.browser']);
  await sleep(3000);
  pages = (await list()).filter(p => p.url.includes('/play/'));
}
const page = pages[0];
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.once('open', res); ws.once('error', rej); });
let id = 0; const waiting = new Map();
ws.on('message', d => { const m = JSON.parse(d); if (m.id && waiting.has(m.id)) { waiting.get(m.id)(m); waiting.delete(m.id); } });
const call = (method, params = {}) => new Promise(res => { const i = ++id; waiting.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (expression, gesture = false) => (await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true, userGesture: gesture })).result?.result?.value;
await call('Page.enable');
await call('Page.navigate', { url });
await sleep(3500);
for (let i = 0; i < 20; i++) { const s = await ev("(() => { const b = document.getElementById('enter'); return b && !b.disabled ? b.textContent : ''; })()"); if (s) break; await sleep(400); }
console.log('бутон:', await ev("document.getElementById('enter').click(); document.getElementById('enter').textContent", true));
await sleep(3000);
console.log(await ev("JSON.stringify({ inVR: document.getElementById('card').hidden, note: document.getElementById('note').textContent, connected: window.__arena?.connected, n: window.__arena?.me.n, name: window.__arena?.me.name })"));
ws.close();
