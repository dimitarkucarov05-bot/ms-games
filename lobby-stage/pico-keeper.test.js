import test from 'node:test';
import assert from 'node:assert/strict';
import { isPicoProps, picoPageUrl, parseDevices, launchResult, startPicoKeeper } from './pico-keeper.js';

test('Pico is told by manufacturer, brand or model; Quest and others are not', () => {
  assert.equal(isPicoProps({ manufacturer: 'PICO', brand: 'PICO', model: 'A9210' }), true);
  assert.equal(isPicoProps({ manufacturer: 'Oculus', brand: 'oculus', model: 'Quest 3' }), false);
  assert.equal(isPicoProps({}), false);
});

test('the page address carries the serial as the headset id and is safe inside shell quotes', () => {
  const u = picoPageUrl({ port: 47801, serial: 'PA94Y0MGK3250545G', name: "Pico 4's" });
  assert.match(u, /^http:\/\/localhost:47801\/play\/\?app=1&id=PA94Y0MGK3250545G&name=Pico%204%27s$/);
  assert.ok(!u.includes("'"));
});

test('adb devices output is parsed, unauthorized and offline kept', () => {
  const out = 'List of devices attached\nAAA\tdevice usb:1\nBBB\tunauthorized\n* daemon started *\n';
  assert.deepEqual(parseDevices(out), [{ serial: 'AAA', status: 'device' }, { serial: 'BBB', status: 'unauthorized' }]);
});

test('am start: started, busy (kept for the user) or an error', () => {
  assert.deepEqual(launchResult('Starting: Intent { act=android.intent.action.VIEW }'), { ok: true, busy: false });
  assert.equal(launchResult('Warning: Activity not started because the  current activity is being kept for the user.').busy, true);
  assert.equal(launchResult('Error: Activity class does not exist').ok, false);
});

function fakeAdb(script) {
  const calls = [];
  const exec = async args => { calls.push(args.join(' ')); return script(args); };
  return { exec, calls };
}
const tick = ms => new Promise(r => setTimeout(r, ms));

test('a Pico on the cable gets the tunnel and the page; a Quest is never touched', async () => {
  let clock = 1_000_000;
  const { exec, calls } = fakeAdb(args => {
    const a = args.join(' ');
    if (a === 'devices') return { ok: true, out: 'List of devices attached\nPICO1\tdevice\nQUEST1\tdevice\n', err: '' };
    if (a.includes('-s PICO1') && a.includes('getprop')) return { ok: true, out: 'PICO\n---\nPICO\n---\nA9210', err: '' };
    if (a.includes('-s QUEST1') && a.includes('getprop')) return { ok: true, out: 'Oculus\n---\noculus\n---\nQuest 3', err: '' };
    if (a.includes('am start')) return { ok: true, out: 'Starting: Intent { act=android.intent.action.VIEW }', err: '' };
    return { ok: true, out: '', err: '' };
  });
  const said = [];
  const pk = startPicoKeeper({ exec, port: 47801, tlsPort: 47843, isOnline: () => false, nameFor: s => `Pico ${s.slice(-1)}`, say: t => said.push(t), now: () => clock });
  await tick(80);
  pk.stop();
  assert.ok(calls.some(c => c === '-s PICO1 reverse tcp:47801 tcp:47801'), 'tunnel for the app port');
  assert.ok(calls.some(c => c === '-s PICO1 reverse tcp:47843 tcp:47843'), 'tunnel for the HTTPS port');
  assert.ok(calls.some(c => c.startsWith('-s PICO1 shell am start') && c.includes('id=PICO1') && c.endsWith('com.pico.browser.overseas')), 'page opened in the Pico browser');
  assert.ok(!calls.some(c => c.includes('QUEST1') && /reverse|am start/.test(c)), 'a Quest gets no tunnel and no page');
  assert.deepEqual(pk.status().map(d => [d.serial, d.state]), [['PICO1', 'opened']]);
  assert.ok(said.some(t => /играта е отворена/.test(t)));
});

test('a busy headset (LBE screen) is retried, never forced; once it is in the lobby nothing is opened', async () => {
  let clock = 5_000_000, online = false, busy = true;
  const { exec, calls } = fakeAdb(args => {
    const a = args.join(' ');
    if (a === 'devices') return { ok: true, out: 'List of devices attached\nPICO1\tdevice\n', err: '' };
    if (a.includes('getprop')) return { ok: true, out: 'PICO\n---\nPICO\n---\nA9210', err: '' };
    if (a.includes('am start')) return { ok: true, out: busy ? 'Warning: Activity not started because the  current activity is being kept for the user.' : 'Starting: Intent', err: '' };
    return { ok: true, out: '', err: '' };
  });
  const pk = startPicoKeeper({ exec, port: 47801, isOnline: () => online, now: () => clock });
  await tick(60);
  assert.equal(pk.status()[0].state, 'busy');
  const starts1 = calls.filter(c => c.includes('am start')).length;
  assert.equal(starts1, 1, 'no hammering: one try per 15 s');
  pk.stop();
  clock += 20_000; busy = false;
  const pk2 = startPicoKeeper({ exec, port: 47801, isOnline: () => online, now: () => clock });
  await tick(60); pk2.stop();
  assert.equal(pk2.status()[0].state, 'opened');
  online = true; clock += 20_000;
  const before = calls.filter(c => c.includes('am start')).length;
  const pk3 = startPicoKeeper({ exec, port: 47801, isOnline: () => online, now: () => clock });
  await tick(60); pk3.stop();
  assert.equal(pk3.status()[0].state, 'lobby');
  assert.equal(calls.filter(c => c.includes('am start')).length, before, 'in the lobby: no more page launches');
});

test('an unauthorized headset is reported so the person can tap Allow', async () => {
  const { exec } = fakeAdb(args => args.join(' ') === 'devices' ? { ok: true, out: 'List of devices attached\nPICO9\tunauthorized\n', err: '' } : { ok: true, out: '', err: '' });
  const said = [];
  const pk = startPicoKeeper({ exec, port: 47801, say: (t, l) => said.push([t, l]) });
  await tick(50); pk.stop();
  assert.ok(said.some(([t, l]) => /Allow/.test(t) && l === 'warn'));
});
