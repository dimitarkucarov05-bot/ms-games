// Пазач на каските. Сървърът сам вкарва в лобито всяка каска Quest, до която стига през adb (по кабел или по мрежата),
// и не спира да опитва: слага ѝ приложението „Арена", ако го няма; включва ѝ управление по Wi-Fi, докато е на кабел
// (за да я стига и след като кабелът се извади); буди я, ако се зарежда; пуска приложението; оставя един раздел със
// страницата на играта; натиска „Enter VR" вместо играча; пуска двете точки, ако каската не е подравнена.
// Това е tools/quest-keeper.mjs, но за всички каски наведнъж и вътре в сървъра. Нищо тук не чака: всяка команда към
// adb е с ограничено време и върви встрани от играта.
//
//   const keeper = startKeeper({ adb, port, apk, file, state, align, say, pc });
//   keeper.status()  → [{ serial, ip, name, state }]     keeper.stop()
//
// Пипа само устройства, чийто модел е Quest, и само с тези команди: devices, connect, tcpip, getprop, ip addr,
// dumpsys power/battery, pidof, pm list packages, install -r на нашето Arena.apk, am start на нашето приложение,
// forward към инструментите на браузъра, reverse --remove на нашия порт, input keyevent WAKEUP и сигнала за сензора
// на челото. Никога не чисти данни и не пипа други приложения.

import { execFile } from 'node:child_process';
import fs from 'node:fs';
import WebSocket from 'ws';

const PKG = 'bg.arena.play';
const EVERY = 4000;

export function startKeeper({ adb, port, apk, file, state, align, say, pc, exec, every = EVERY }) {
  // exec: за пробите (вместо истинския adb); every = 0: без собствен часовник, стъпките се викат отвън с tick()
  const run = exec || ((args, timeout = 6000) => new Promise(res => execFile(adb, args, { timeout, windowsHide: true }, (err, out) => res(err ? '' : String(out || '').trim()))));
  const sh = (serial, ...cmd) => run(['-s', serial, 'shell', ...cmd]);
  const now = () => Date.now();
  const devs = new Map();      // сериен номер → каквото знаем за каската
  let known = [];              // адреси на каски, които някога са били на кабел: към тях се опитва връзка по мрежата
  try { known = JSON.parse(fs.readFileSync(file, 'utf8')).ips || []; } catch { /* още няма */ }
  const remember = ip => { if (ip && !known.includes(ip)) { known.push(ip); try { fs.writeFileSync(file, JSON.stringify({ ips: known }, null, 1)); } catch { /* без запис */ } } };
  let lastConnect = 0, busy = false, stopped = false, nextPort = 9300;

  const note = (d, text, level) => { if (d.said !== text) { d.said = text; d.state = text; if (level) say(`${d.name || d.ip || d.serial}: ${text}`, level); } };

  async function cdp(wsUrl, fn) {
    const ws = new WebSocket(wsUrl);
    await new Promise((res, rej) => { ws.once('open', res); ws.once('error', rej); setTimeout(() => rej(new Error('cdp timeout')), 4000); });
    let id = 0; const waiting = new Map();
    ws.on('message', m => { try { const o = JSON.parse(m); if (o.id && waiting.has(o.id)) { waiting.get(o.id)(o); waiting.delete(o.id); } } catch { /* не е отговор */ } });
    const call = (method, params = {}) => new Promise(res => { const i = ++id; waiting.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); setTimeout(() => res({}), 5000); });
    const ev = async (expression, gesture = false) => (await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true, userGesture: gesture })).result?.result?.value;
    try { return await fn(ev, call); } finally { try { ws.close(); } catch { /* вече е затворена */ } }
  }
  const getJson = (url, ms = 3000) => fetch(url, { signal: AbortSignal.timeout(ms) }).then(r => r.json()).catch(() => null);

  function openApp(d) {
    if (now() - (d.lastApp || 0) < 14_000) return;
    d.lastApp = now();
    const address = pc();
    return run(['-s', d.serial, 'shell', 'am', 'start', '-n', `${PKG}/.MainActivity`, ...(address ? ['--es', 'pc', address] : []), ...(d.name ? ['--es', 'name', d.name] : [])]);
  }

  async function keep(d, st) {
    // 1. само Quest
    if (d.quest === undefined) { d.quest = /Quest/i.test(await sh(d.serial, 'getprop', 'ro.product.model')); }
    if (!d.quest) return note(d, 'not a Quest: left alone');
    // 2. адресът ѝ в мрежата и каската от лобито, която стои зад него
    if (!d.ip || now() - (d.ipAt || 0) > 30_000) { d.ip = ((await sh(d.serial, 'ip', '-4', 'addr', 'show', 'wlan0')).match(/inet (\d+\.\d+\.\d+\.\d+)/) || [])[1] || d.ip || ''; d.ipAt = now(); }
    const h = st.headsets.find(x => x.online && x.web && d.ip && String(x.ip || '').replace('::ffff:', '') === d.ip) || null;
    if (h) d.name = h.name;
    // 3. нашето приложение: слага се веднъж, ако го няма
    if (!d.app) {
      if ((await sh(d.serial, 'pm', 'list', 'packages', PKG)).includes(PKG)) d.app = true;
      else if (apk && fs.existsSync(apk) && now() - (d.installAt || 0) > 60_000) {
        d.installAt = now();
        note(d, 'installing the Arena app', 'info');
        d.app = /Success/i.test(await run(['-s', d.serial, 'install', '-r', apk], 90_000));
        if (!d.app) return note(d, 'the Arena app did not install', 'warn');
      } else return note(d, 'the Arena app is missing');
    }
    // 4. будна ли е; каска, която се зарежда, се буди и се държи будна; извадена от зарядното пак заспива сама
    const awake = (await sh(d.serial, 'dumpsys', 'power')).includes('mWakefulness=Awake');
    const powered = /(AC|USB|Wireless) powered: true/.test(await sh(d.serial, 'dumpsys', 'battery'));
    if (!powered && d.prox) { d.prox = false; await sh(d.serial, 'am', 'broadcast', '-a', 'com.oculus.vrpowermanager.automation_disable'); }
    if (!awake) {
      if (!powered) return note(d, 'asleep (not worn, not charging)');
      if (now() - (d.wakeAt || 0) > 20_000) {
        d.wakeAt = now(); d.prox = true;
        await sh(d.serial, 'input', 'keyevent', 'KEYCODE_WAKEUP');
        await sh(d.serial, 'am', 'broadcast', '-a', 'com.oculus.vrpowermanager.prox_close');
      }
      return note(d, 'waking it up');
    }
    // 5. играта върви по Wi-Fi през приложението: порт на кабела не трябва да му пречи
    if (!d.tcp && (await run(['-s', d.serial, 'reverse', '--list'])).includes(`tcp:${port}`)) await run(['-s', d.serial, 'reverse', '--remove', `tcp:${port}`]);
    if (!(await sh(d.serial, 'pidof', PKG))) { await openApp(d); return note(d, 'starting the Arena app'); }
    // 6. страницата в браузъра: един раздел, жива, във VR
    d.port ||= nextPort++;
    await run(['-s', d.serial, 'forward', `tcp:${d.port}`, 'localabstract:chrome_devtools_remote']);
    const pages = await getJson(`http://127.0.0.1:${d.port}/json`);
    if (!pages) { await openApp(d); return note(d, 'opening the browser'); }
    const play = pages.filter(p => p.type === 'page' && String(p.url).includes('/play/'));
    play.sort((x, y) => (String(y.url).includes('id=Q2-') ? 1 : 0) - (String(x.url).includes('id=Q2-') ? 1 : 0));      // остава разделът, отворен от приложението
    if (!play.length) { await openApp(d); return note(d, 'opening the lobby page'); }
    for (const p of play.slice(1)) await fetch(`http://127.0.0.1:${d.port}/json/close/${p.id}`).catch(() => {});
    const page = play[0];
    const seen = await cdp(page.webSocketDebuggerUrl, ev => ev("JSON.stringify({ live: typeof window.__arena === 'object', inVR: !!window.__arena?.presenting, zoneActive: !!window.__arena?.zoneActive, ready: !!document.getElementById('enter') && !document.getElementById('enter').disabled, note: document.getElementById('note')?.textContent || '', connected: !!window.__arena?.connected })")).then(JSON.parse).catch(() => null);
    if (!seen) return note(d, 'the page does not answer');
    if (!seen.live) {      // стар запис на страницата без код: зарежда се наново покрай кеша
      if (now() - (d.reloadAt || 0) > 10_000) {
        d.reloadAt = now();
        await cdp(page.webSocketDebuggerUrl, async (ev, call) => { await call('Network.enable'); await call('Network.setCacheDisabled', { cacheDisabled: true }); await call('Page.navigate', { url: `${page.url}${String(page.url).includes('?') ? '&' : '?'}t=${now()}` }); }).catch(() => {});
      }
      return note(d, 'reloading a stale page');
    }
    if (/already an active/.test(seen.note)) { d.lastEnter = now() + 30_000; return note(d, 'VR is waiting for a permission prompt inside the headset: press Allow', 'warn'); }
    if (!seen.inVR) {
      if (seen.ready && now() - (d.lastEnter || 0) > 25_000) {
        d.lastEnter = now();
        await cdp(page.webSocketDebuggerUrl, ev => ev("document.getElementById('enter').click()", true)).catch(() => {});
        return note(d, 'pressing Enter VR', 'info');
      }
      return note(d, 'page open, entering VR');
    }
    if (!seen.connected || !h) return note(d, 'in VR, waiting for the lobby');
    // 7. във VR и в лобито: каска без подравняване получава двете точки
    if (st.zone && !h.hasCalibration && h.phase === 'idle' && !st.session && !seen.zoneActive && now() - (d.lastAlign || 0) > 30_000) {
      d.lastAlign = now();
      try { align(h.id); } catch { /* пултът ще каже защо */ }
      return note(d, 'in the lobby, starting the two-point alignment', 'info');
    }
    note(d, h.hasCalibration ? 'in the lobby' : 'in the lobby, not aligned yet');
  }

  async function tick() {
    if (busy || stopped) return;
    busy = true;
    try {
      const st = state();
      const list = (await run(['devices'])).split('\n').slice(1).map(l => l.trim().split(/\s+/)).filter(l => l[1] === 'device').map(l => l[0]);
      for (const serial of [...devs.keys()]) if (!list.includes(serial)) devs.delete(serial);
      for (const serial of list) if (!devs.has(serial)) devs.set(serial, { serial, tcp: serial.includes(':'), ip: serial.includes(':') ? serial.split(':')[0] : '', state: 'found' });
      // каска на кабел: управлението ѝ се включва и по мрежата, после се работи през мрежовата връзка
      for (const d of devs.values()) {
        if (d.tcp || d.quest === false) continue;
        if (d.quest === undefined) d.quest = /Quest/i.test(await sh(d.serial, 'getprop', 'ro.product.model'));
        if (!d.quest) continue;
        if (!d.ip) d.ip = ((await sh(d.serial, 'ip', '-4', 'addr', 'show', 'wlan0')).match(/inet (\d+\.\d+\.\d+\.\d+)/) || [])[1] || '';
        if (!d.ip) continue;
        remember(d.ip);
        if (!devs.has(`${d.ip}:5555`) && now() - (d.tcpAt || 0) > 30_000) {
          d.tcpAt = now();
          await run(['-s', d.serial, 'tcpip', '5555'], 8000);
          await new Promise(r => setTimeout(r, 2500));
          await run(['connect', `${d.ip}:5555`], 5000);
        }
      }
      // познати каски, които не са на кабел: опит за връзка по мрежата (успява, докато не са рестартирани)
      if (now() - lastConnect > 20_000) {
        lastConnect = now();
        for (const ip of known) if (!devs.has(`${ip}:5555`)) run(['connect', `${ip}:5555`], 3500);
      }
      // всяка каска се пази през една връзка: мрежовата, ако я има
      for (const d of devs.values()) {
        if (!d.tcp && d.ip && devs.has(`${d.ip}:5555`)) { d.state = 'on the cable (kept over Wi-Fi)'; continue; }
        try { await keep(d, st); } catch (e) { note(d, `error: ${String(e?.message || e).slice(0, 80)}`); }
      }
    } finally { busy = false; }
  }

  const timer = every ? setInterval(() => { tick().catch(() => {}); }, every) : null;
  return {
    status: () => [...devs.values()].map(d => ({ serial: d.serial, ip: d.ip || '', name: d.name || '', state: d.state || '' })),
    stop() { stopped = true; if (timer) clearInterval(timer); },
    tick,
  };
}
