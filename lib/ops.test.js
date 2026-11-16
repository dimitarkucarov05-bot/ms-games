// Tests for precheck.js, setup.js, diagnose.js, bugreport.js, scorecards.js
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { precheck, tileReason, playerRange, minAreaOf } from './precheck.js';
import { presetZone, cleanPreset, createSetupTracker, parseAdbDevices, usbState, abDistance } from './setup.js';
import { parsePingMs, firewallRuleOk, firewallFixCommand, buildChecks, FIREWALL_RULES } from './diagnose.js';
import { makeZip, readZip, reportName } from './bugreport.js';
import { createScorecards, labelTspl, ippPrintJob } from './scorecards.js';
import { solveAlign } from '../zone.js';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 's2-'));
const motel = { id: 'motel', name: 'The Motel', web: true, status: 'ready', minPlayers: 1, maxPlayers: 6, minArea: [3, 3] };
const hs = (o = {}) => ({ id: 'H1', name: 'One', online: true, web: true, hasCalibration: true, calibrated: true, battery: 80, tracking: 'ok', build: 36, ...o });

test('precheck: clean headset passes; each problem is one item with a fix where possible', () => {
  assert.deepEqual(precheck(motel, [hs()], { area: { w: 4, d: 4 }, pageBuild: 36 }), { ok: true, items: [] });
  const r = precheck(motel, [
    hs({ id: 'A', battery: 12 }), hs({ id: 'B', hasCalibration: false }), hs({ id: 'C', online: false }),
    hs({ id: 'D', web: false }), hs({ id: 'E', controllers: { left: 0, right: 15 } }), hs({ id: 'F', needsCalibration: 'anchors-lost' }),
    hs({ id: 'G', build: 30 }), hs({ id: 'H', desk: true, hasCalibration: false }),
  ], { area: { w: 4, d: 4 }, pageBuild: 36 });
  const by = id => r.items.filter(i => i.headsetId === id).map(i => i.code);
  assert.deepEqual(by('A'), ['battery']);
  assert.deepEqual(by('B'), ['not_calibrated']);
  assert.equal(r.items.find(i => i.headsetId === 'B').fix.action, 'recalibrate');
  assert.deepEqual(by('C'), ['offline']);
  assert.deepEqual(by('D'), ['page']);
  assert.deepEqual(by('E'), ['controller', 'controller_battery']);
  assert.deepEqual(by('F'), ['needs_calibration']);
  assert.deepEqual(by('G'), ['old_page']);
  assert.deepEqual(by('H'), [], 'the desktop test page needs no calibration');
  assert.ok(r.items.some(i => i.code === 'too_many'), '7 online for a 6-player game');
  assert.ok(precheck(motel, [hs()], { area: { w: 2, d: 2 } }).items.some(i => i.code === 'area'));
  assert.ok(precheck(motel, [hs()], { area: { w: 4, d: 4 }, running: { gameId: 'x', gameName: 'X' } }).items.some(i => i.code === 'busy'));
  assert.equal(precheck(null, []).items[0].code, 'no_game');
});

test('tile reasons and player ranges by area', () => {
  const g = { ...motel, minArea: null, players: { '4x4': [1, 4], '6x6': [2, 6] } };
  assert.deepEqual(playerRange(g, { w: 6.2, d: 6 }).range, [2, 6]);
  assert.deepEqual(playerRange(g, { w: 5, d: 4 }).range, [1, 4]);
  assert.equal(minAreaOf(g), '4x4');
  assert.equal(tileReason(g, { area: { w: 3, d: 3 }, ready: 2, calibrated: 2 }), 'Play area too small (needs 4x4)');
  assert.equal(tileReason(g, { area: { w: 6, d: 6 }, ready: 1, calibrated: 1 }), 'Needs 2+ headsets');
  assert.equal(tileReason(g, { area: { w: 6, d: 6 }, ready: 2, calibrated: 0 }), 'Not calibrated');
  assert.equal(tileReason(g, { area: { w: 6, d: 6 }, ready: 2, calibrated: 2 }), null);
  assert.equal(tileReason(g, { area: { w: 6, d: 6 }, ready: 2, calibrated: 2, running: { gameId: 'motel' } }), 'Already running');
  assert.equal(tileReason({ ...g, status: 'soon' }, {}), 'Coming soon');
});

test('preset zone: A is the front-left corner, B on the left edge; rotation keeps the rectangle, A–B is L', () => {
  for (const rotation of [0, 90, 180, 270]) {
    const z = presetZone({ w: 6, d: 8, rotation, entrance: 'left' }, 2.5);
    assert.deepEqual(z.hall, { w: 6, d: 8 });
    const [A, B] = z.markers;
    assert.ok(Math.abs(Math.hypot(B[0] - A[0], B[1] - A[1]) - 2.5) < 0.002, `A–B at rotation ${rotation}`);
    assert.ok(z.poly.every(([x, zz]) => Math.abs(Math.abs(x) - 3) < 0.002 && Math.abs(Math.abs(zz) - 4) < 0.002), `rectangle centred, width along X at ${rotation}`);
    assert.ok(z.poly.some(([x, zz]) => Math.abs(x - A[0]) < 0.002 && Math.abs(zz - A[1]) < 0.002), 'A is a corner');
  }
  const z0 = presetZone({ w: 6, d: 8, rotation: 0 }, 2);
  assert.deepEqual(z0.markers[0], [-3, -4]);
  assert.deepEqual(z0.markers[1], [-3, -2]);
  // a headset that touched A and B in its own tracking space gets a frame that maps the marks back exactly
  const yaw = 0.7, o = [1.2, -0.4], T = z0.markers.map(([x, zz]) => [o[0] + x * Math.cos(yaw) - zz * Math.sin(yaw), o[1] + x * Math.sin(yaw) + zz * Math.cos(yaw)]);
  const f = solveAlign(z0.markers, T);
  assert.ok(f.error < 0.001);
  assert.throws(() => cleanPreset({ w: 7, d: 7 }));
  assert.throws(() => cleanPreset({ w: 6, d: 6, rotation: 45 }));
});

test('setup tracker: p1 → p2 → done, distance check against the first headset, too-close marks fail', () => {
  const t = createSetupTracker();
  t.ask('A', true);
  assert.equal(t.st.points.A, 'p1');
  assert.equal(t.touch('A', 0, 0, 0).done, false);
  assert.equal(t.st.points.A, 'p2');
  const r = t.touch('A', 1, 0, 2.5);
  assert.equal(r.done, true);
  assert.equal(t.finish('A', r.points, { isRef: true }).ok, true);
  assert.equal(t.st.refAB, 2.5);
  t.ask('B', true); t.touch('B', 0, 5, 5);
  const rb = t.touch('B', 1, 5, 7.58);
  t.finish('B', rb.points);
  assert.deepEqual(t.st.check.B, { abDelta: 0.08, ab: 2.58, ok: false });
  t.ask('C', false);
  assert.equal(t.st.points.C, 'waiting');
  t.ask('D', true); t.touch('D', 0, 0, 0);
  const rd = t.touch('D', 1, 0, 1);
  assert.equal(t.finish('D', rd.points).ok, false);
  assert.equal(t.st.points.D, 'failed');
  assert.match(t.st.errors.D, /at least 2 m/);
  assert.equal(t.touch('A', 0, 1, 1).ignored, true, 'a done headset ignores stray touches');
  assert.equal(abDistance([{ x: 0, z: 0 }, { x: 3, z: 4 }]), 5);
});

test('usb: adb device list and row states', () => {
  const list = parseAdbDevices(`List of devices attached
1WMHH000000001  device usb:1-1 product:hollywood model:Quest_2 device:hollywood transport_id:1
2G0YC1ZF8B0000  unauthorized usb:1-2 transport_id:2
192.168.1.50:5555 device product:eureka model:Quest_3 transport_id:3
`);
  assert.deepEqual(list.map(d => [d.serial, d.state, d.model]), [['1WMHH000000001', 'device', 'Quest 2'], ['2G0YC1ZF8B0000', 'unauthorized', null]]);
  assert.equal(usbState(list[1]).state, 'allow');
  assert.equal(usbState(list[0]).state, 'ready');
  assert.equal(usbState(list[0], { state: 'failed', error: 'x' }).error, 'x');
});

test('diagnose: ping parsing, firewall rule output, fix command, checks with one sentence each', () => {
  assert.equal(parsePingMs('Reply from 192.168.1.5: bytes=32 time=14ms TTL=64'), 14);
  assert.equal(parsePingMs('Reply from 192.168.1.5: bytes=32 time<1ms TTL=64'), 1);
  assert.equal(parsePingMs('64 bytes from 192.168.1.45: icmp_seq=1 ttl=128 time=5.31 ms'), 5);
  assert.equal(parsePingMs('Request timed out.'), null);
  assert.equal(firewallRuleOk('Rule Name: MS Games (TCP)\nEnabled: Yes\nDirection: In\nAction: Allow'), true);
  assert.equal(firewallRuleOk('No rules match the specified criteria.'), false);
  assert.equal(firewallRuleOk('Rule Name: x\nEnabled: No\nAction: Allow'), false);
  const c = firewallFixCommand({ node: 'C:\\MS Games\\node.exe' });
  assert.match(c.cmds, /name="MS Games \(TCP\)".*program="C:\\MS Games\\node.exe" protocol=TCP localport=47801,47843/);
  assert.match(c.args.at(-1), /-Verb RunAs/);
  assert.equal(FIREWALL_RULES.udp, 'MS Games (UDP)');
  const r = buildChecks({
    addresses: ['192.168.1.45'], chosen: '192.168.1.45', version: '1', pageBuild: 36, firewall: { tcp: true, udp: false, available: true }, adb: true,
    headsets: [{ id: 'A', name: 'One', online: true, wsPingMs: 250, pcPingMs: null, build: 30, battery: 10 }, { id: 'B', name: 'Two', online: false }],
  });
  const ids = r.checks.filter(x => x.ok === false).map(x => x.id);
  assert.deepEqual(ids, ['pc.firewall', 'hs.A.link', 'hs.A.pcping', 'hs.A.build', 'hs.A.battery', 'hs.B.online']);
  assert.ok(r.checks.filter(x => x.ok === false).every(x => x.text.endsWith('.')), 'every failure says what to do');
  assert.equal(r.checks.find(x => x.id === 'pc.firewall').fix, 'firewall');
  assert.ok(r.router.length >= 3);
});

test('bug report zip round-trips', () => {
  const z = makeZip([{ name: 'note.txt', data: 'hello' }, { name: 'dir/state.json', data: Buffer.from('{"a":1}') }, { name: 'empty.log', data: '' }]);
  const back = readZip(z);
  assert.deepEqual(back.map(f => [f.name, f.data.toString()]), [['note.txt', 'hello'], ['dir/state.json', '{"a":1}'], ['empty.log', '']]);
  assert.equal(z.readUInt32LE(z.length - 22), 0x06054b50);
  assert.match(reportName(new Date(2026, 10, 16, 9, 5, 7)), /^MSGames-bugreport-2026-11-16_090507\.zip$/);
});

test('scorecards: sidecar, list, png upload, remove, thermal label and IPP body', () => {
  const d = tmp();
  const sc = createScorecards(d, { edge: null });
  const base = sc.save({ id: 'run-1', gameId: 'motel', game: 'The Motel', team: 'Wolves', score: 1234, rank: 1, players: [{ name: 'Ann', score: 600 }], date: '2026-11-16T10:00:00Z' });
  assert.match(base, /_The-Motel_Wolves$/);
  assert.equal(sc.get('run-1').score, 1234);
  assert.equal(sc.get(base).id, 'run-1');
  assert.equal(sc.list()[0].png, null);
  assert.throws(() => sc.savePng('run-1', Buffer.from('nope')));
  const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(100)]);
  assert.equal(sc.savePng('run-1', png), `/scorecards/${base}.png`);
  assert.ok(sc.file(`${base}.png`));
  assert.equal(sc.file('../x.png'), null);
  const t = labelTspl(sc.get('run-1'), { venue: 'MS Games' });
  assert.match(t, /^SIZE 100 mm,90 mm/);
  assert.match(t, /NEW RECORD/);
  assert.match(t, /PRINT 1,1\r\n$/);
  const body = ippPrintJob('192.168.1.40:631', 'thermal', Buffer.from(t));
  assert.equal(body.readUInt16BE(2), 0x0002);
  assert.ok(body.includes(Buffer.from('application/vnd.cups-raw')));
  sc.remove('run-1');
  assert.equal(sc.list().length, 0);
});
