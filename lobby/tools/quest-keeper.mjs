// Държи каската (по кабел) в играта: щом се събуди, отваря страницата, оставя един раздел,
// влиза във VR и, ако още няма начертана зона, пуска чертането.
//
//   node tools/quest-keeper.mjs V3          (Ctrl+C за край; сам спира след 90 минути)
//   node tools/quest-keeper.mjs V3 --wifi   играта върви по Wi-Fi през приложението „Арена"; кабелът служи само за
//                                            управление и може да се извади, щом каската влезе във VR

import { execFileSync } from 'node:child_process';
import os from 'node:os';
import WebSocket from 'ws';

const ADB = process.env.ADB || 'C:/Android/sdk/platform-tools/adb.exe';
const PORT = 47801;
const args = process.argv.slice(2);
const WIFI = args.includes('--wifi');
const name = args.find(a => !a.startsWith('--')) || '';
// при две каски на кабел: --serial=<сериен номер> избира коя да пази, --cdp=<порт> е местният порт за нейния браузър
const SERIAL = (args.find(a => a.startsWith('--serial=')) || '').slice(9);
const CDP = Number((args.find(a => a.startsWith('--cdp=')) || '').slice(6)) || 9222;
const PC = process.env.PC_IP || Object.values(os.networkInterfaces()).flat().find(a => a && a.family === 'IPv4' && !a.internal && a.address.startsWith('192.168.'))?.address || '';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const adb = (...a) => { try { return execFileSync(ADB, a, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 8000 }).trim(); } catch { return ''; } };
const log = (...a) => console.log(new Date().toTimeString().slice(0, 8), ...a);

let lastEnter = 0, lastDraw = 0, lastState = '', needReload = true, lastApp = 0;
function say(s) { if (s !== lastState) { lastState = s; log(s); } }

async function cdp(page, fn) {
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.once('open', res); ws.once('error', rej); setTimeout(() => rej(new Error('cdp timeout')), 4000); });
  let id = 0; const waiting = new Map();
  ws.on('message', d => { const m = JSON.parse(d); if (m.id && waiting.has(m.id)) { waiting.get(m.id)(m); waiting.delete(m.id); } });
  const call = (method, params = {}) => new Promise(res => { const i = ++id; waiting.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); setTimeout(() => res({}), 5000); });
  const ev = async (expression, gesture = false) => (await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true, userGesture: gesture })).result?.result?.value;
  try { return await fn(ev, call); } finally { ws.close(); }
}

function openGame(serial, url) {
  if (WIFI) return adb('-s', serial, 'shell', 'am', 'start', '-n', 'bg.arena.play/.MainActivity', ...(PC ? ['--es', 'pc', PC] : []), ...(name ? ['--es', 'name', name] : []));
  return adb('-s', serial, 'shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', `'${url}'`, 'com.oculus.browser');
}

async function tick() {
  const serial = adb('devices').split('\n').map(l => l.trim().split(/\s+/)).find(l => l[1] === 'device' && (!SERIAL || l[0] === SERIAL))?.[0];
  if (!serial) return say('каската не е на кабел или чака разрешение');
  if (!adb('-s', serial, 'shell', 'dumpsys', 'power').includes('mWakefulness=Awake')) return say('каската спи (не е на главата)');
  if (!WIFI) adb('-s', serial, 'reverse', `tcp:${PORT}`, `tcp:${PORT}`);
  else {
    // по Wi-Fi: порт 47801 в каската трябва да е на приложението „Арена" (то прелива към компютъра), не на кабела
    if (adb('-s', serial, 'reverse', '--list').includes(`tcp:${PORT}`)) adb('-s', serial, 'reverse', '--remove', `tcp:${PORT}`);
    if (!adb('-s', serial, 'shell', 'pidof', 'bg.arena.play')) {
      if (Date.now() - lastApp > 14_000) {
        lastApp = Date.now();
        say('пускам приложението „Арена" (трябва каската да е на главата)');
        adb('-s', serial, 'shell', 'am', 'start', '-n', 'bg.arena.play/.MainActivity', ...(PC ? ['--es', 'pc', PC] : []), ...(name ? ['--es', 'name', name] : []));
      }
      lastState = '';
      return sleep(3000);
    }
  }
  adb('-s', serial, 'forward', `tcp:${CDP}`, 'localabstract:chrome_devtools_remote');
  const url = `http://localhost:${PORT}/play/?id=${serial}${name ? `&name=${encodeURIComponent(name)}` : ''}`;
  let pages = await fetch(`http://127.0.0.1:${CDP}/json`, { signal: AbortSignal.timeout(3000) }).then(r => r.json()).catch(() => null);
  if (!pages) {
    say('отварям браузъра на каската');
    openGame(serial, url);
    return sleep(4000);
  }
  const play = pages.filter(p => p.type === 'page' && p.url.includes('/play/'));
  if (WIFI) play.sort((x, y) => (y.url.includes('id=Q2-') ? 1 : 0) - (x.url.includes('id=Q2-') ? 1 : 0));      // остава разделът, отворен от приложението
  if (!play.length) {
    say('отварям играта');
    openGame(serial, url);
    return sleep(4000);
  }
  for (const p of play.slice(1)) await fetch(`http://127.0.0.1:${CDP}/json/close/${p.id}`).catch(() => {});
  // страницата може да е отворена от приложението „Арена" (по Wi-Fi) със своя номер Q2-…: пазим него, не го сменяме със серийния
  let hid = serial, pageUrl = url;
  try { const u = new URL(play[0].url); const own = u.searchParams.get('id'); if (own) { hid = own; u.searchParams.delete('t'); pageUrl = u.toString(); } } catch { /* остава серийният */ }
  if (needReload) {      // веднъж на пускане: страницата взима последната версия на кода
    needReload = false;
    say('презареждам страницата с последната версия');
    await cdp(play[0], (ev, call) => call('Page.navigate', { url: pageUrl })).catch(() => {});
    return sleep(3500);
  }
  const st = await cdp(play[0], ev => ev("JSON.stringify({ live: typeof window.__arena === 'object', inVR: !!window.__arena?.presenting, zoneActive: !!window.__arena?.zoneActive, pending: !!window.__arena?.pendingZone, ready: !!document.getElementById('enter') && !document.getElementById('enter').disabled, note: document.getElementById('note')?.textContent || '', connected: !!window.__arena?.connected })")).then(JSON.parse).catch(() => null);
  if (!st) return say('страницата не отговаря');
  if (!st.live) {      // браузърът е показал стар запис на страницата (без код), защото тунелът е бил прекъснат
    say('страницата е стар запис: зареждам я наново');
    await cdp(play[0], async (ev, call) => { await call('Network.enable'); await call('Network.setCacheDisabled', { cacheDisabled: true }); await call('Page.navigate', { url: `${pageUrl}${pageUrl.includes('?') ? '&' : '?'}t=${Date.now()}` }); }).catch(() => {});
    return sleep(4000);
  }
  if (/already an active/.test(st.note)) {      // влизането вече е поискано и чака нещо в каската (най-често прозорец за разрешение)
    say('влизането във VR чака в каската: виж дали има прозорец за разрешение и натисни Allow');
    await cdp(play[0], ev => ev("document.getElementById('note').textContent = 'Чака разрешение в каската.'")).catch(() => {});
    lastEnter = Date.now() + 30_000;
    return;
  }
  if (!st.inVR) {
    if (st.ready && Date.now() - lastEnter > 25_000) {
      lastEnter = Date.now();
      say('натискам „Влез"');
      await cdp(play[0], ev => ev("document.getElementById('enter').click()", true)).catch(() => {});
    }
    return;
  }
  if (!st.connected) return say('във VR, чака връзка с пулта');
  const lobby = await fetch(`http://127.0.0.1:${PORT}/api/state`, { signal: AbortSignal.timeout(3000) }).then(r => r.json()).catch(() => null);
  const h = lobby?.headsets.find(x => x.id === hid);
  if (!lobby || !h?.online) return say('във VR, пултът още не я вижда');
  if (!lobby.zone && h.phase === 'idle' && !lobby.session && Date.now() - lastDraw > 60_000) {
    lastDraw = Date.now();
    say('няма зона: пускам чертането');
    await fetch(`http://127.0.0.1:${PORT}/api/zone/draw`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ headsetId: hid }) }).catch(() => {});
    return;
  }
  if (lobby.zone && !h.hasCalibration && h.phase === 'idle' && !lobby.session && !st.zoneActive && Date.now() - lastDraw > 30_000) {
    lastDraw = Date.now();
    say('има зона, но каската не е подравнена: пускам двете точки');
    await fetch(`http://127.0.0.1:${PORT}/api/zone/align`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ headsetId: hid }) }).catch(() => {});
    return;
  }
  say(lobby.zone ? `във VR, зона с ${lobby.zone.poly.length} точки, място за игра ${lobby.zone.hall.w} × ${lobby.zone.hall.d} м` : `във VR, ${st.zoneActive ? 'чертае зоната' : st.pending ? 'чертежът чака да стигне до пулта' : 'готова'}`);
}

const until = Date.now() + 90 * 60_000;
log('пазя каската', name || '', WIFI ? `по Wi-Fi (компютър ${PC || 'по сигнал'})` : 'по кабел');
while (Date.now() < until) {
  try { await tick(); } catch (e) { say('грешка: ' + e.message); }
  await sleep(3000);
}
