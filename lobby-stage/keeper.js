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
import os from 'node:os';
import path from 'node:path';
import WebSocket from 'ws';

const PKG = 'bg.arena.play';
const EVERY = 4000;
export const HEADSET_PACKAGE = PKG;
export const ID_FILE = '/sdcard/msgames/id.json';
/** Version 2.1 of the headset app is the first with the boot start, the identity file and keep-in-front. */
export const MIN_SMART_VERSION = 11;
/** appops the headset app needs (none of them is a system setting; each is for our package only). */
export const GRANTS = [
  ['SYSTEM_ALERT_WINDOW', 'open the game from the background (power-on, keep in front)'],
  ['GET_USAGE_STATS', 'see whether the game is in front'],
  ['MANAGE_EXTERNAL_STORAGE', `read ${ID_FILE}`],
];
const QUEST_DEVICES = { hollywood: 'Quest 2', eureka: 'Quest 3', panther: 'Quest 3S', seacliff: 'Quest Pro', monterey: 'Quest' };

/** Quotes one argument for the headset's sh (adb shell joins its arguments with spaces). */
export function shq(s) {
  s = String(s);
  return /^[\w@%+=:,./-]+$/.test(s) ? s : `'${s.replace(/'/g, `'\\''`)}'`;
}

/** The version of the APK next to it: build.ps1 writes MSGames-Headset.json ({versionCode, versionName}). */
export function apkVersion(apk) {
  try { return JSON.parse(fs.readFileSync(apk.replace(/\.apk$/i, '.json'), 'utf8')); } catch { return null; }
}

/** adb runner that keeps stdout, stderr and success apart: (args, timeout) → Promise<{ ok, out, err }>. */
function fullRunner(adb, exec) {
  if (exec) return async (args, timeout) => {
    const r = await exec(args, timeout);
    return typeof r === 'string' ? { ok: true, out: r, err: '' } : { ok: !!r.ok, out: String(r.out || ''), err: String(r.err || '') };
  };
  return (args, timeout = 15_000) => new Promise(res => execFile(adb, args, { timeout, windowsHide: true, maxBuffer: 4 << 20 },
    (err, out, errOut) => res({ ok: !err, out: String(out || '').trim(), err: String(errOut || err?.message || '').trim() })));
}

/**
 * The setup wizard's "Install" step for one headset on the USB cable (design section 3, step 2).
 *
 *   for await (const ev of installHeadset(serial, { number, color, name }, { adb, apk, pc })) { ... }
 *
 * who:  { number 1-99, color '#rrggbb', name, id? }. id defaults to the USB serial (fixed, like the cable it came from).
 * opts: { adb: path, apk: MSGames-Headset.apk, pc: this computer's address (optional, saves the headset a search),
 *         force: reinstall even when the same version is there, wifi: false to skip Wi-Fi adb,
 *         file: the keeper's known-addresses file (the headset's Wi-Fi address is added), exec: fake adb for tests }
 *
 * Yields progress events { step, state, text, pct, error? } with
 *   step:  'check' | 'install' | 'identity' | 'permissions' | 'start' | 'wifi' | 'done'
 *   state: 'run' (step began) | 'ok' | 'skip' | 'warn' (step did not fully work, install goes on) | 'fail' (stops) | 'done'
 * The last event is { step: 'done', state: 'done', pct: 100, result } or one with state 'fail' and a one-line error the
 * console can show as is. It never throws. result = { id, serial, model, ip, versionCode, wifi, identity }.
 *
 * Order: check, install, identity, permissions, start, Wi-Fi adb last (it restarts adbd, which drops the USB link
 * for a moment). Only these commands are sent: devices, getprop, dumpsys package, install -r -g, mkdir/push/cat in
 * /sdcard/msgames, appops set/get for our package, deviceidle whitelist of our package, input keyevent WAKEUP,
 * am broadcast to our receiver, ip addr, tcpip 5555, connect. Never clears data, never uninstalls, never touches
 * guardian or other apps.
 */
export async function* installHeadset(serial, who = {}, opts = {}) {
  const run = fullRunner(opts.adb || 'adb', opts.exec);
  const wait = opts.wait || (ms => new Promise(r => setTimeout(r, ms)));
  const s = String(serial || '');
  const sh = (cmd, timeout) => run(['-s', s, 'shell', cmd.map(shq).join(' ')], timeout);
  const ev = (step, state, text, pct, extra) => ({ step, state, text, pct, ...extra });
  const fail = (step, text, pct) => ev(step, 'fail', text, pct, { error: text });
  const lastLine = r => (r.err || r.out || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean).pop() || 'no answer';

  // 1. the headset on the cable, allowed, a Quest
  yield ev('check', 'run', 'Looking at the headset', 2);
  if (!s || s.includes(':')) { yield fail('check', 'Install works over the USB cable only', 2); return; }
  const list = await run(['devices'], 8000);
  const line = list.out.split(/\r?\n/).map(l => l.trim().split(/\s+/)).find(l => l[0] === s);
  if (!line) { yield fail('check', 'The headset is not on the cable any more: plug it in again', 2); return; }
  if (line[1] === 'unauthorized' || line[1] === 'authorizing') { yield fail('check', 'Put the headset on and press Allow for USB debugging', 2); return; }
  if (line[1] !== 'device') { yield fail('check', 'Unplug the cable and plug it in again', 2); return; }
  const device = (await sh(['getprop', 'ro.product.device'])).out.trim();
  const modelProp = (await sh(['getprop', 'ro.product.model'])).out.trim();
  const model = QUEST_DEVICES[device] || modelProp || device || 'unknown';
  if (!QUEST_DEVICES[device] && !/quest/i.test(modelProp)) { yield fail('check', `This is not a Quest headset (${model})`, 4); return; }
  yield ev('check', 'ok', model, 5);

  // 2. the app: installed only when missing or older than the APK here
  const have = Number(((await sh(['dumpsys', 'package', PKG])).out.match(/versionCode=(\d+)/) || [])[1] || 0);
  const meta = opts.apk ? apkVersion(opts.apk) : null;
  let versionCode = have;
  if (!opts.apk || !fs.existsSync(opts.apk)) {
    if (!have) { yield fail('install', 'The headset app (MSGames-Headset.apk) is missing on this computer', 10); return; }
    yield ev('install', 'skip', 'No app file here; the headset keeps its version', 35);
  } else if (have && meta && have >= meta.versionCode && !opts.force) {
    yield ev('install', 'skip', `The app is up to date (${meta.versionName || meta.versionCode})`, 35);
  } else {
    yield ev('install', 'run', have ? 'Updating the headset app' : 'Installing the headset app', 10);
    const r = await run(['-s', s, 'install', '-r', '-g', opts.apk], 180_000);
    const text = `${r.out}\n${r.err}`;
    if (!/\bSuccess\b/.test(text) || /Failure|INSTALL_FAILED/.test(text)) {
      const why = (text.match(/INSTALL_[A-Z_]+/) || [])[0];
      yield fail('install', why === 'INSTALL_FAILED_UPDATE_INCOMPATIBLE'
        ? 'Another build of the app (other key) is on the headset: uninstall bg.arena.play there first'
        : why === 'INSTALL_FAILED_INSUFFICIENT_STORAGE' ? 'The headset is full: free some space'
          : `Install failed: ${why || lastLine(r)}`, 20);
      return;
    }
    versionCode = meta?.versionCode || Number(((await sh(['dumpsys', 'package', PKG])).out.match(/versionCode=(\d+)/) || [])[1] || 0);
    yield ev('install', 'ok', 'Installed', 35);
  }

  // 3. the identity file, read back to be sure
  const identity = {
    id: String(who.id || s),
    number: Number.isInteger(Number(who.number)) && Number(who.number) > 0 ? Number(who.number) : 0,
    color: /^#[0-9a-f]{6}$/i.test(who.color || '') ? who.color.toLowerCase() : null,
    name: String(who.name || '').trim().slice(0, 30) || (who.number ? `Headset ${who.number}` : model),
  };
  yield ev('identity', 'run', 'Writing the identity', 40);
  const tmp = path.join(os.tmpdir(), `msgames-id-${s.replace(/\W/g, '')}-${process.pid}.json`);
  try {
    fs.writeFileSync(tmp, JSON.stringify(identity));
    await sh(['mkdir', '-p', path.posix.dirname(ID_FILE)]);
    const pushed = await run(['-s', s, 'push', tmp, ID_FILE], 20_000);
    if (!pushed.ok) { yield fail('identity', `Writing the identity failed: ${lastLine(pushed)}`, 45); return; }
  } finally { fs.rmSync(tmp, { force: true }); }
  let back = null;
  try { back = JSON.parse((await sh(['cat', ID_FILE])).out); } catch { /* checked below */ }
  if (!back || back.id !== identity.id) { yield fail('identity', 'The identity file did not read back the same', 45); return; }
  yield ev('identity', 'ok', `${identity.name}, number ${identity.number || '-'}`, 50);

  // 4. permissions for our package only
  yield ev('permissions', 'run', 'Allowing the app to start the game by itself', 55);
  const missing = [];
  for (const [op] of GRANTS) {
    await sh(['appops', 'set', PKG, op, 'allow']);
    const got = (await sh(['appops', 'get', PKG, op])).out;
    if (!/allow/i.test(got)) missing.push(op);
  }
  await sh(['cmd', 'deviceidle', 'whitelist', `+${PKG}`]);       // the service is not put to sleep while the headset idles
  yield missing.length
    ? ev('permissions', 'warn', `Not granted: ${missing.join(', ')} (the game may need a press to open)`, 65)
    : ev('permissions', 'ok', 'Allowed', 65);

  // 5. start: a broadcast to our receiver returns at once (am start can hang while the headset is not worn)
  yield ev('start', 'run', 'Starting the app', 70);
  await sh(['input', 'keyevent', 'KEYCODE_WAKEUP']);
  const start = ['am', 'broadcast', '-n', `${PKG}/.BootReceiver`, '-a', `${PKG}.START`,
    '--es', 'id', identity.id, '--es', 'name', identity.name];
  if (identity.number) start.push('--ei', 'number', String(identity.number));
  if (identity.color) start.push('--es', 'color', identity.color);
  if (opts.pc) start.push('--es', 'pc', String(opts.pc));
  const started = await sh(start, 15_000);
  yield /Broadcast completed/i.test(started.out)
    ? ev('start', 'ok', 'Started: the game opens on the headset', 80)
    : ev('start', 'warn', `The app did not confirm the start (${lastLine(started)}); it opens at the next power-on`, 80);

  // 6. Wi-Fi adb, last: lets the keeper reach the headset after the cable is pulled (until the headset restarts)
  let ip = '', wifi = false;
  if (opts.wifi !== false) {
    yield ev('wifi', 'run', 'Turning on control over Wi-Fi', 85);
    ip = ((await sh(['ip', '-4', 'addr', 'show', 'wlan0'])).out.match(/inet (\d+\.\d+\.\d+\.\d+)/) || [])[1] || '';
    if (!ip) yield ev('wifi', 'warn', 'The headset is not on Wi-Fi: control over Wi-Fi skipped', 95);
    else {
      await run(['-s', s, 'tcpip', '5555'], 10_000);
      await wait(2500);
      const c = await run(['connect', `${ip}:5555`], 8000);
      wifi = /connected to/i.test(c.out) && !/cannot|failed/i.test(c.out);
      if (wifi && opts.file) {
        try {
          let known = [];
          try { known = JSON.parse(fs.readFileSync(opts.file, 'utf8')).ips || []; } catch { /* first one */ }
          if (!known.includes(ip)) fs.writeFileSync(opts.file, JSON.stringify({ ips: [...known, ip] }, null, 1));
        } catch { /* the keeper finds it on the cable anyway */ }
      }
      yield wifi ? ev('wifi', 'ok', `Reachable over Wi-Fi at ${ip}`, 95)
        : ev('wifi', 'warn', `Could not reach the headset over Wi-Fi at ${ip}`, 95);
    }
  } else yield ev('wifi', 'skip', 'Skipped', 95);

  yield ev('done', 'done', 'Done', 100, { result: { id: identity.id, serial: s, model, ip, versionCode, wifi, identity } });
}

/** installHeadset with a callback instead of a loop: resolves with the result, rejects with the one-line error. */
export async function runInstall(serial, who, opts = {}, onEvent = () => {}) {
  let last = null;
  for await (const e of installHeadset(serial, who, opts)) { last = e; onEvent(e); }
  if (last?.state !== 'done') throw new Error(last?.error || 'Install stopped');
  return last.result;
}

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
    // 2.1+: a broadcast to our receiver returns at once; `am start` of a 2D app hangs while the headset is not worn
    if (d.version >= MIN_SMART_VERSION) return run(['-s', d.serial, 'shell', 'am', 'broadcast', '-n', `${PKG}/.BootReceiver`, '-a', `${PKG}.START`, ...(address ? ['--es', 'pc', address] : [])]);
    return run(['-s', d.serial, 'shell', 'am', 'start', '-n', `${PKG}/.MainActivity`, ...(address ? ['--es', 'pc', address] : []), ...(d.name ? ['--es', 'name', d.name] : [])]);
  }
  // the appops of GRANTS, once per connection (cheap, and an update or a factory reset may have dropped them)
  async function grant(d) {
    if (d.granted) return;
    for (const [op] of GRANTS) await sh(d.serial, 'appops', 'set', PKG, op, 'allow');
    d.granted = true;
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
        note(d, 'installing the headset app', 'info');
        d.app = /Success/i.test(await run(['-s', d.serial, 'install', '-r', '-g', apk], 90_000));
        if (!d.app) return note(d, 'the headset app did not install', 'warn');
        d.version = undefined;
      } else return note(d, 'the headset app is missing');
    }
    if (d.version === undefined) d.version = Number(((await sh(d.serial, 'dumpsys', 'package', PKG)).match(/versionCode=(\d+)/) || [])[1] || 0);
    // an older app is updated, but never under a running game (the update closes the app and its forwarder)
    const want = apk ? apkVersion(apk)?.versionCode || 0 : 0;
    if (want > d.version && !st.session && !st.run && fs.existsSync(apk) && now() - (d.installAt || 0) > 60_000) {
      d.installAt = now();
      note(d, `updating the headset app to ${want}`, 'info');
      if (/Success/i.test(await run(['-s', d.serial, 'install', '-r', '-g', apk], 90_000))) { d.version = want; d.granted = false; }
      else return note(d, 'the headset app did not update', 'warn');
    }
    if (d.version >= MIN_SMART_VERSION) await grant(d);
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
    if (!(await sh(d.serial, 'pidof', PKG))) { await openApp(d); return note(d, 'starting the headset app'); }
    // 6. страницата в браузъра: един раздел, жива, във VR
    d.port ||= nextPort++;
    await run(['-s', d.serial, 'forward', `tcp:${d.port}`, 'localabstract:chrome_devtools_remote']);
    const pages = await getJson(`http://127.0.0.1:${d.port}/json`);
    if (!pages) { await openApp(d); return note(d, 'opening the browser'); }
    const play = pages.filter(p => p.type === 'page' && String(p.url).includes('/play/'));
    // the tab the app opened stays: the immersive one (app=1) first, then one with an id, then the rest
    const rank = p => (/[?&]app=1/.test(p.url) ? 2 : 0) + (/[?&]id=/.test(p.url) ? 1 : 0);
    play.sort((x, y) => rank(y) - rank(x));
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

// ---------------------------------------------------------------- command line (tests on a real headset)
//
//   node keeper.js check <serial>                         read-only: model, app version, grants, identity file, front app
//   node keeper.js install <serial> <number> [color] [name]   the wizard's Install step on one cabled headset
//
// adb: $ADB or C:/Android/sdk/platform-tools/adb.exe; APK: $HEADSET_APK or ../lobby/tools/apk-lan/MSGames-Headset.apk.

export async function checkHeadset(serial, { adb = 'adb', exec } = {}) {
  const run = fullRunner(adb, exec);
  const sh = cmd => run(['-s', serial, 'shell', cmd.map(shq).join(' ')], 10_000).then(r => r.out.trim());
  const ops = {};
  for (const [op] of GRANTS) ops[op] = ((await sh(['appops', 'get', PKG, op])).match(/:\s*(\w+)/) || [])[1] || '?';
  let identity = null;
  try { identity = JSON.parse(await sh(['cat', ID_FILE])); } catch { /* none */ }
  const resumed = await sh(['dumpsys', 'activity', 'activities']);
  return {
    serial,
    model: QUEST_DEVICES[await sh(['getprop', 'ro.product.device'])] || await sh(['getprop', 'ro.product.model']),
    os: await sh(['getprop', 'ro.build.version.release']),
    app: Number(((await sh(['dumpsys', 'package', PKG])).match(/versionCode=(\d+)/) || [])[1] || 0),
    running: !!(await sh(['pidof', PKG])),
    ops,
    identity,
    front: ((resumed.match(/(?:mResumedActivity|topResumedActivity)[^\n]*?\s(\S+\/\S+)/) || [])[1]) || '',
    ip: ((await sh(['ip', '-4', 'addr', 'show', 'wlan0'])).match(/inet (\d+\.\d+\.\d+\.\d+)/) || [])[1] || '',
    log: (await run(['-s', serial, 'logcat', '-d', '-t', '40', '-s', 'Arena:*'], 10_000)).out.split(/\r?\n/).slice(-15),
  };
}

const isMain = (() => { try { return process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')); } catch { return false; } })();
if (isMain) {
  const [cmd, serial, number, color, ...name] = process.argv.slice(2);
  const adb = process.env.ADB || ['C:/Android/sdk/platform-tools/adb.exe'].find(p => fs.existsSync(p)) || 'adb';
  const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
  const apk = process.env.HEADSET_APK || path.join(here, '..', 'lobby', 'tools', 'apk-lan', 'MSGames-Headset.apk');
  if (cmd === 'check' && serial) {
    console.log(JSON.stringify(await checkHeadset(serial, { adb }), null, 2));
  } else if (cmd === 'install' && serial && number) {
    const pc = Object.values(os.networkInterfaces()).flat().find(a => a && a.family === 'IPv4' && !a.internal && /^(192\.168|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(a.address))?.address;
    const who = { number: Number(number), color: color || undefined, name: name.join(' ') || undefined };
    console.log(`install on ${serial} as ${JSON.stringify(who)}, APK ${apk}, this computer ${pc || '?'}`);
    let last = null;
    for await (const e of installHeadset(serial, who, { adb, apk, pc })) {
      last = e;
      console.log(`${String(e.pct).padStart(3)}%  ${e.step.padEnd(11)} ${e.state.padEnd(4)}  ${e.text}`);
    }
    if (last?.state === 'done') console.log(JSON.stringify(last.result, null, 2));
    process.exitCode = last?.state === 'done' ? 0 : 1;
  } else {
    console.log('usage:\n  node keeper.js check <serial>\n  node keeper.js install <serial> <number> [#rrggbb] [name]');
    process.exitCode = 2;
  }
}
