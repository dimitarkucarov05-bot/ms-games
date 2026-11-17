// Отваря играта в каска, вързана с кабел (USB), и ѝ дава име.
//
//   node tools/quest.mjs V3            отваря страницата в браузъра на каската с име V3
//   node tools/quest.mjs V3 --enter    и натиска „Влез" вместо теб
//   node tools/quest.mjs --log         показва какво пише конзолата на страницата в каската
//   node tools/quest.mjs --shot f.png  снимка на това, което се вижда в каската
//
// Каската трябва да е в режим за разработчици и да си приел „Allow USB debugging" в нея.
// През кабела страницата се отваря като http://localhost, затова не иска сертификат.

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import WebSocket from 'ws';

const args = process.argv.slice(2);
const flag = f => args.includes(f);
const name = args.find(a => !a.startsWith('--') && args[args.indexOf(a) - 1] !== '--shot') || '';
const PORT = Number(process.env.PORT || 47801);
const ADB = process.env.ADB || (fs.existsSync('C:/Android/sdk/platform-tools/adb.exe') ? 'C:/Android/sdk/platform-tools/adb.exe' : 'adb');
const adb = (serial, ...a) => execFileSync(ADB, serial ? ['-s', serial, ...a] : a, { encoding: 'utf8' }).trim();
const sleep = ms => new Promise(r => setTimeout(r, ms));

const lines = adb(null, 'devices').split('\n').slice(1).map(l => l.trim().split(/\s+/)).filter(l => l[0]);
const ready = lines.filter(l => l[1] === 'device').map(l => l[0]);
for (const l of lines) if (l[1] !== 'device') console.log(`${l[0]}: ${l[1] === 'unauthorized' ? 'чака „Allow USB debugging" в каската' : l[1]}`);
if (!ready.length) { console.log('Няма готова каска по кабел.'); process.exit(1); }

async function cdp(serial, fn) {
  const local = 9222 + ready.indexOf(serial);
  adb(serial, 'forward', `tcp:${local}`, 'localabstract:chrome_devtools_remote');
  let page = null;
  for (let i = 0; i < 20 && !page; i++) {
    const list = await fetch(`http://127.0.0.1:${local}/json`).then(r => r.json()).catch(() => []);
    page = list.find(p => p.type === 'page' && p.url.includes('/play/'));
    if (!page) await sleep(500);
  }
  if (!page) throw new Error('не намирам страницата на играта в браузъра на каската');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.once('open', res); ws.once('error', rej); });
  let id = 0;
  const waiting = new Map();
  ws.on('message', d => { const m = JSON.parse(d); if (m.id && waiting.has(m.id)) { waiting.get(m.id)(m); waiting.delete(m.id); } else ws.emit('event', m); });
  const call = (method, params = {}) => new Promise(res => { const i = ++id; waiting.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
  try { return await fn(call, ws); } finally { if (!flag('--log')) ws.close(); }
}

for (const serial of ready) {
  const model = adb(serial, 'shell', 'getprop', 'ro.product.model');
  if (flag('--shot')) {
    const file = args[args.indexOf('--shot') + 1] || `quest-${serial}.png`;
    fs.writeFileSync(file, execFileSync(ADB, ['-s', serial, 'exec-out', 'screencap', '-p'], { maxBuffer: 64e6 }));
    console.log(`${serial}: снимка → ${file}`);
    continue;
  }
  if (flag('--log')) {
    await cdp(serial, async (call, ws) => {
      await call('Runtime.enable'); await call('Log.enable');
      ws.on('event', m => {
        if (m.method === 'Runtime.consoleAPICalled') console.log(`[${m.params.type}]`, ...m.params.args.map(a => a.value ?? a.description ?? ''));
        if (m.method === 'Runtime.exceptionThrown') console.log('[грешка]', m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
        if (m.method === 'Log.entryAdded') console.log(`[${m.params.entry.level}]`, m.params.entry.text, m.params.entry.url || '');
      });
      console.log(`${serial}: слушам конзолата (Ctrl+C за край)`);
      await new Promise(() => {});
    });
    continue;
  }
  if (flag('--eval')) {
    const expr = args[args.indexOf('--eval') + 1];
    const r = await cdp(serial, call => call('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true, userGesture: true }));
    console.log(JSON.stringify(r.result?.result?.value ?? r.result?.exceptionDetails ?? r, null, 1));
    continue;
  }
  adb(serial, 'reverse', `tcp:${PORT}`, `tcp:${PORT}`);
  const url = `http://localhost:${PORT}/play/?id=${encodeURIComponent(serial)}${name ? `&name=${encodeURIComponent(name)}` : ''}`;
  adb(serial, 'shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', `'${url}'`, 'com.oculus.browser');
  console.log(`${serial} (${model}): отворих ${url}`);
  if (flag('--enter')) {
    await sleep(2500);
    const r = await cdp(serial, async call => {
      for (let i = 0; i < 20; i++) {
        const s = await call('Runtime.evaluate', { expression: "(() => { const b = document.getElementById('enter'); return b ? (b.disabled ? 'wait' : b.textContent) : 'none'; })()", returnByValue: true });
        if (s.result?.result?.value && !['wait', 'none'].includes(s.result.result.value)) break;
        await sleep(500);
      }
      return call('Runtime.evaluate', { expression: "document.getElementById('enter').click(); document.getElementById('enter').textContent", returnByValue: true, userGesture: true });
    });
    console.log(`${serial}: натиснах „${r.result?.result?.value || '?'}"`);
  }
}
