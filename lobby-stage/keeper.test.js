// Проби на пазача на каските без каски: adb е подменен с функция, която отговаря като каска и записва какво ѝ е поискано.
//   node --test keeper.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { startKeeper, installHeadset, runInstall, shq, GRANTS, ID_FILE } from './keeper.js';

/** Една измислена каска зад adb. opts: model, ip, app (има ли приложението), awake, powered, running (върви ли приложението). */
function world(devices) {
  const calls = [];
  const exec = async args => {
    calls.push(args.join(' '));
    if (args[0] === 'devices') return ['List of devices attached', ...Object.keys(devices).filter(s => devices[s].on !== false).map(s => `${s}\tdevice`)].join('\n');
    if (args[0] === 'connect') { const d = devices[args[1]]; if (d) d.on = true; return d ? `connected to ${args[1]}` : ''; }
    if (args[0] !== '-s') return '';
    const d = devices[args[1]], rest = args.slice(2).join(' ');
    if (!d) return '';
    if (rest === 'tcpip 5555') { const twin = devices[`${d.ip}:5555`]; if (twin) twin.ready = true; return 'restarting in TCP mode port: 5555'; }
    if (rest === 'shell getprop ro.product.model') return d.model;
    if (rest.startsWith('shell ip -4 addr show wlan0')) return `    inet ${d.ip}/24 brd 192.168.1.255 scope global wlan0`;
    if (rest.startsWith('shell pm list packages')) return d.app ? 'package:bg.arena.play' : '';
    if (rest.startsWith('install -r')) { d.app = true; return 'Performing Streamed Install\nSuccess'; }
    if (rest === 'shell dumpsys power') return `mWakefulness=${d.awake ? 'Awake' : 'Asleep'}`;
    if (rest === 'shell dumpsys battery') return `  AC powered: false\n  USB powered: ${d.powered ? 'true' : 'false'}`;
    if (rest === 'shell input keyevent KEYCODE_WAKEUP') { d.awake = true; return ''; }
    if (rest === 'shell pidof bg.arena.play') return d.running ? '4242' : '';
    if (rest.startsWith('shell am start -n bg.arena.play/.MainActivity')) { d.running = true; return 'Starting: Intent'; }
    if (rest === 'reverse --list') return '';
    return '';
  };
  return { calls, exec };
}
function keeperFor(devices, lobby = { headsets: [], zone: true, session: false }) {
  const w = world(devices), said = [], aligned = [];
  const file = path.join(os.tmpdir(), `keeper-test-${process.pid}-${Math.random().toString(36).slice(2)}.json`);
  const k = startKeeper({ adb: 'adb', port: 47801, apk: fileURLToPathSafe(), file, exec: w.exec, every: 0, state: () => lobby, align: id => aligned.push(id), say: (t, l) => said.push(`${l}: ${t}`), pc: () => '192.168.1.45' });
  return { k, w, said, aligned, file };
}
// пазачът проверява дали файлът с приложението съществува: за пробата стига самият този файл
// (fileURLToPath, не URL.pathname: pathname оставя %20 за интервал в пътя и файлът не се намира)
function fileURLToPathSafe() { return fileURLToPath(import.meta.url); }

test('a Quest on the cable: Wi-Fi control is switched on, the app is installed, it is woken while charging and the app is started', async () => {
  const devices = {
    USB1: { model: 'Quest 2', ip: '192.168.1.88', app: false, awake: false, powered: true, running: false },
    '192.168.1.88:5555': { model: 'Quest 2', ip: '192.168.1.88', app: false, awake: false, powered: true, running: false, on: false },
  };
  const { k, w, said, file } = keeperFor(devices);
  await k.tick();
  assert.ok(w.calls.includes('-s USB1 tcpip 5555'), 'Wi-Fi control switched on over the cable');
  assert.ok(w.calls.includes('connect 192.168.1.88:5555'));
  assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')).ips, ['192.168.1.88'], 'the address is remembered for later');
  // следващите стъпки вървят през мрежовата връзка; двете „каски" в пробата са една и съща, затова огледално
  const tcp = devices['192.168.1.88:5555'];
  await k.tick();
  assert.ok(w.calls.some(c => c.startsWith('-s 192.168.1.88:5555 install -r')), 'our app is installed when missing');
  assert.ok(said.some(t => /installing the headset app/.test(t)));
  assert.ok(w.calls.includes('-s 192.168.1.88:5555 shell input keyevent KEYCODE_WAKEUP'), 'a charging headset is woken');
  assert.ok(w.calls.includes('-s 192.168.1.88:5555 shell am broadcast -a com.oculus.vrpowermanager.prox_close'));
  assert.equal(tcp.awake, true);
  await k.tick();
  const start = w.calls.find(c => c.startsWith('-s 192.168.1.88:5555 shell am start -n bg.arena.play/.MainActivity'));
  assert.ok(start && start.includes('--es pc 192.168.1.45'), 'the app is started with the address of this computer');
  // нищо не се праща по кабелната връзка, щом има мрежова
  assert.ok(!w.calls.some(c => c.startsWith('-s USB1 shell am start')), 'the cabled twin is not driven twice');
  assert.equal(k.status().find(d => d.serial === 'USB1').state, 'on the cable (kept over Wi-Fi)');
  k.stop();
  fs.rmSync(file, { force: true });
});

test('a headset that sleeps and is not charging is left asleep; a phone is never touched', async () => {
  const devices = {
    '192.168.1.90:5555': { model: 'Quest 2', ip: '192.168.1.90', app: true, awake: false, powered: false, running: false },
    PHONE: { model: 'Pixel 7', ip: '192.168.1.50', app: false, awake: true, powered: true, running: false },
  };
  const { k, w, file } = keeperFor(devices);
  await k.tick(); await k.tick();
  assert.ok(!w.calls.some(c => c.includes('KEYCODE_WAKEUP')), 'no wake-up without a charger');
  assert.ok(!w.calls.some(c => c.startsWith('-s PHONE') && !c.endsWith('getprop ro.product.model')), 'only the model of the phone was asked');
  assert.ok(!w.calls.some(c => c.startsWith('-s PHONE tcpip')));
  assert.match(k.status().find(d => d.serial === '192.168.1.90:5555').state, /asleep/);
  assert.match(k.status().find(d => d.serial === 'PHONE').state, /not a Quest/);
  k.stop();
  fs.rmSync(file, { force: true });
});

test('known addresses are tried again over Wi-Fi; nothing dangerous is ever sent', async () => {
  const devices = { '192.168.1.88:5555': { model: 'Quest 2', ip: '192.168.1.88', app: true, awake: true, powered: false, running: true, on: false } };
  const { k, w, file } = keeperFor(devices);
  fs.writeFileSync(file, JSON.stringify({ ips: ['192.168.1.88'] }));
  k.stop();
  const again = startKeeper({ adb: 'adb', port: 47801, apk: '', file, exec: w.exec, every: 0, state: () => ({ headsets: [], zone: true, session: false }), align() {}, say() {}, pc: () => '192.168.1.45' });
  await again.tick();
  assert.ok(w.calls.includes('connect 192.168.1.88:5555'), 'a remembered headset is looked for on the network');
  await again.tick(); await again.tick();
  for (const c of w.calls) assert.ok(!/pm clear|uninstall|rm |reboot|wipe|settings put/.test(c), `forbidden command: ${c}`);
  again.stop();
  fs.rmSync(file, { force: true });
});

// ---------------------------------------------------------------- 2.1: the setup wizard's install, and the app's new start

/** A fake adb for installHeadset: one headset on the cable. Answers { ok, out, err } like the real runner. */
function usbWorld(h) {
  const calls = [], pushed = {};
  const exec = async args => {
    calls.push(args.join(' '));
    const ok = out => ({ ok: true, out, err: '' });
    if (args[0] === 'devices') return ok(['List of devices attached', ...(h.plugged === false ? [] : [`${h.serial}\t${h.state || 'device'}`])].join('\n'));
    if (args[0] === 'connect') return ok(h.tcp ? `connected to ${args[1]}` : `failed to connect to ${args[1]}`);
    if (args[0] !== '-s' || args[1] !== h.serial) return { ok: false, out: '', err: 'device not found' };
    const rest = args.slice(2);
    if (rest[0] === 'install') {
      if (h.installFails) return { ok: false, out: 'Performing Streamed Install', err: `adb: failed to install: Failure [${h.installFails}]` };
      h.version = h.apkVersion;
      return ok('Performing Streamed Install\nSuccess');
    }
    if (rest[0] === 'push') { pushed[rest[2]] = fs.readFileSync(rest[1], 'utf8'); return ok('1 file pushed'); }
    if (rest[0] === 'tcpip') { if (h.tcp !== false) h.tcp = true; return ok('restarting in TCP mode port: 5555'); }
    if (rest[0] !== 'shell') return ok('');
    const cmd = rest.slice(1).join(' ');
    if (cmd === 'getprop ro.product.device') return ok(h.device);
    if (cmd === 'getprop ro.product.model') return ok(h.model);
    if (cmd === 'dumpsys package bg.arena.play') return ok(h.version ? `    versionCode=${h.version} minSdk=29 targetSdk=36` : '');
    if (cmd === `cat ${ID_FILE}`) return ok(pushed[ID_FILE] || 'cat: No such file');
    let m;
    if ((m = /^appops set bg\.arena\.play (\w+) allow$/.exec(cmd))) { if (!(h.refuse || []).includes(m[1])) (h.ops ||= new Set()).add(m[1]); return ok(''); }
    if ((m = /^appops get bg\.arena\.play (\w+)$/.exec(cmd))) return ok(h.ops?.has(m[1]) ? `${m[1]}: allow` : `${m[1]}: default`);
    if (cmd.startsWith('am broadcast')) return ok('Broadcasting: Intent { act=bg.arena.play.START }\nBroadcast completed: result=0');
    if (cmd.startsWith('ip -4 addr show wlan0')) return ok(h.ip ? `    inet ${h.ip}/24 brd 192.168.1.255 scope global wlan0` : '');
    return ok('');
  };
  return { calls, pushed, exec };
}
function tempApk(versionCode) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'keeper-apk-'));
  const apk = path.join(dir, 'MSGames-Headset.apk');
  fs.writeFileSync(apk, 'not really an apk');
  fs.writeFileSync(path.join(dir, 'MSGames-Headset.json'), JSON.stringify({ package: 'bg.arena.play', versionCode, versionName: '2.1' }));
  return { apk, dir };
}
async function collect(gen) { const out = []; for await (const e of gen) out.push(e); return out; }
const FORBIDDEN = /pm clear|uninstall|\brm\b|reboot|wipe|settings put|guardian|reverse tcp|monkey/;
const noWait = async () => {};

test('install: a fresh Quest 3 gets the app, its identity, the grants, a start and Wi-Fi control, in that order', async () => {
  const h = { serial: '2G0YC1ZF8B0123', device: 'eureka', model: 'Quest 3', version: 0, apkVersion: 11, ip: '192.168.1.91' };
  const w = usbWorld(h), { apk, dir } = tempApk(11);
  const known = path.join(dir, 'keeper.json');
  const events = await collect(installHeadset(h.serial, { number: 3, color: '#E8B33D', name: "Mia's 3" }, { apk, exec: w.exec, pc: '192.168.1.45', file: known, wait: noWait }));
  const steps = events.filter(e => e.state !== 'run').map(e => `${e.step}:${e.state}`);
  assert.deepEqual(steps, ['check:ok', 'install:ok', 'identity:ok', 'permissions:ok', 'start:ok', 'wifi:ok', 'done:done']);
  assert.ok(events.every((e, i) => i === 0 || e.pct >= events[i - 1].pct), 'progress only goes up');
  const done = events.at(-1);
  assert.equal(done.pct, 100);
  assert.deepEqual(done.result, { id: h.serial, serial: h.serial, model: 'Quest 3', ip: '192.168.1.91', versionCode: 11, wifi: true,
    identity: { id: h.serial, number: 3, color: '#e8b33d', name: "Mia's 3" } });
  assert.deepEqual(JSON.parse(w.pushed[ID_FILE]), { id: h.serial, number: 3, color: '#e8b33d', name: "Mia's 3" }, 'the identity file on the headset');
  assert.ok(w.calls.includes(`-s ${h.serial} install -r -g ${apk}`));
  for (const [op] of GRANTS) assert.ok(w.calls.includes(`-s ${h.serial} shell appops set bg.arena.play ${op} allow`), `grant ${op}`);
  const bc = w.calls.find(c => c.includes('am broadcast'));
  const quotedName = "'Mia'\\''s 3'";
  assert.equal(bc, `-s ${h.serial} shell am broadcast -n bg.arena.play/.BootReceiver -a bg.arena.play.START --es id ${h.serial} --es name ${quotedName} --ei number 3 --es color '#e8b33d' --es pc 192.168.1.45`,
    'the start carries the identity, quoted for the headset shell');
  const order = ['install -r', ' push ', 'appops set', 'am broadcast', 'tcpip 5555', 'connect 192.168.1.91:5555'].map(k => w.calls.findIndex(c => c.includes(k)));
  assert.ok(order.every(i => i >= 0), 'every step ran');
  assert.deepEqual([...order].sort((a, b) => a - b), order, 'install, identity, grants, start, then Wi-Fi adb last');
  assert.deepEqual(JSON.parse(fs.readFileSync(known, 'utf8')).ips, ['192.168.1.91'], 'the keeper will look for it over Wi-Fi');
  for (const c of w.calls) assert.ok(!FORBIDDEN.test(c), `forbidden command: ${c}`);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('install: a headset that still has to allow USB debugging, a phone, a Wi-Fi serial and an unplugged cable stop at once', async () => {
  const { apk, dir } = tempApk(11);
  const cases = [
    [{ serial: 'A1', state: 'unauthorized', device: 'hollywood', model: 'Quest 2' }, 'A1', /press Allow/],
    [{ serial: 'P7', device: 'panther', model: 'Pixel 7' }, 'P7', null],
    [{ serial: 'P8', device: 'cheetah', model: 'Pixel 7 Pro' }, 'P8', /not a Quest/],
    [{ serial: 'B2', device: 'hollywood', model: 'Quest 2' }, '192.168.1.5:5555', /USB cable only/],
    [{ serial: 'C3', device: 'hollywood', model: 'Quest 2', plugged: false }, 'C3', /plug it in again/],
  ];
  for (const [h, serial, why] of cases) {
    const w = usbWorld({ ...h, version: 0, apkVersion: 11 });
    const events = await collect(installHeadset(serial, { number: 1 }, { apk, exec: w.exec, wait: noWait }));
    if (!why) { assert.equal(events.at(-1).state, 'done', 'panther is a Quest 3S, whatever the model string says'); continue; }
    assert.equal(events.at(-1).state, 'fail', serial);
    assert.match(events.at(-1).error, why);
    assert.ok(!w.calls.some(c => c.includes(' install ') || c.includes(' push ')), `nothing installed on ${serial}`);
  }
  fs.rmSync(dir, { recursive: true, force: true });
});

test('install: the same version is not reinstalled; a refused install says why in one line; a missing grant is a warning', async () => {
  const { apk, dir } = tempApk(11);
  let w = usbWorld({ serial: 'Q1', device: 'hollywood', model: 'Quest 2', version: 11, apkVersion: 11, ip: '' });
  const events = await collect(installHeadset('Q1', { number: 2 }, { apk, exec: w.exec, wait: noWait }));
  assert.equal(events.find(e => e.step === 'install').state, 'skip');
  assert.ok(!w.calls.some(c => c.includes(' install ')));
  assert.equal(events.find(e => e.step === 'wifi' && e.state !== 'run').state, 'warn', 'not on Wi-Fi: warned, not failed');
  assert.equal(events.at(-1).state, 'done');
  assert.equal(events.at(-1).result.identity.name, 'Headset 2');

  w = usbWorld({ serial: 'Q1', device: 'hollywood', model: 'Quest 2', version: 10, apkVersion: 11, installFails: 'INSTALL_FAILED_UPDATE_INCOMPATIBLE' });
  await assert.rejects(runInstall('Q1', { number: 2 }, { apk, exec: w.exec, wait: noWait }), /other key.*uninstall bg\.arena\.play there first/);
  assert.ok(!w.calls.some(c => FORBIDDEN.test(c)), 'it never uninstalls by itself');

  w = usbWorld({ serial: 'Q1', device: 'hollywood', model: 'Quest 2', version: 10, apkVersion: 11, ip: '192.168.1.7', tcp: false, refuse: ['GET_USAGE_STATS'] });
  const seen = [];
  const result = await runInstall('Q1', { number: 4, color: 'red' }, { apk, exec: w.exec, wait: noWait }, e => seen.push(e));
  assert.match(seen.find(e => e.step === 'permissions' && e.state === 'warn').text, /GET_USAGE_STATS/);
  assert.equal(result.wifi, false, 'Wi-Fi adb that did not connect is reported, not fatal');
  assert.equal(result.identity.color, null, 'a colour that is not #rrggbb is dropped');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('shq quotes only what the headset shell would split or eat', () => {
  assert.equal(shq('bg.arena.play/.BootReceiver'), 'bg.arena.play/.BootReceiver');
  assert.equal(shq('Headset 3'), "'Headset 3'");
  assert.equal(shq('#e8b33d'), "'#e8b33d'");
  assert.equal(shq("it's"), "'it'\\''s'");
  assert.equal(shq('a;rm -rf /'), "'a;rm -rf /'");
});

test('the keeper loop: a 2.1 headset gets its grants and a broadcast start; an older app is updated, but never under a running game', async () => {
  const { apk, dir } = tempApk(11);
  const make = version => ({ '192.168.1.70:5555': { model: 'Quest 3', ip: '192.168.1.70', app: true, awake: true, powered: true, running: false, version } });
  const loop = async (devices, lobby) => {
    const calls = [];
    const base = world(devices).exec;
    const exec = async (args, t) => {
      calls.push(args.join(' '));
      const rest = args.slice(2).join(' '), d = devices[args[1]];
      if (d && rest === 'shell dumpsys package bg.arena.play') return `versionCode=${d.version}`;
      if (d && rest.startsWith('install -r')) { d.version = 11; return 'Success'; }
      if (d && rest.startsWith('shell am broadcast')) { d.running = true; return 'Broadcast completed: result=0'; }
      return base(args, t);
    };
    const file = path.join(dir, `k-${Math.random().toString(36).slice(2)}.json`);
    const k = startKeeper({ adb: 'adb', port: 47801, apk, file, exec, every: 0, state: () => lobby, align() {}, say() {}, pc: () => '192.168.1.45' });
    await k.tick(); await k.tick();
    k.stop();
    return calls;
  };
  // a running game: the old app is left alone and started the old way
  let calls = await loop(make(10), { headsets: [], zone: true, session: true });
  assert.ok(!calls.some(c => c.includes(' install ')), 'no update under a running game');
  assert.ok(calls.some(c => c.includes('am start -n bg.arena.play/.MainActivity')));
  // nothing running: updated, granted, started by broadcast
  calls = await loop(make(10), { headsets: [], zone: true, session: false });
  assert.ok(calls.includes(`-s 192.168.1.70:5555 install -r -g ${apk}`), 'updated to 11');
  for (const [op] of GRANTS) assert.ok(calls.includes(`-s 192.168.1.70:5555 shell appops set bg.arena.play ${op} allow`), `grant ${op}`);
  assert.ok(calls.includes('-s 192.168.1.70:5555 shell am broadcast -n bg.arena.play/.BootReceiver -a bg.arena.play.START --es pc 192.168.1.45'));
  assert.ok(!calls.some(c => c.includes('am start')), 'no am start for 2.1');
  for (const c of calls) assert.ok(!FORBIDDEN.test(c), `forbidden command: ${c}`);
  fs.rmSync(dir, { recursive: true, force: true });
});
