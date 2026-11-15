// Проби на пазача на каските без каски: adb е подменен с функция, която отговаря като каска и записва какво ѝ е поискано.
//   node --test keeper.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { startKeeper } from './keeper.js';

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
function fileURLToPathSafe() { return new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'); }

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
  assert.ok(said.some(t => /installing the Arena app/.test(t)));
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
