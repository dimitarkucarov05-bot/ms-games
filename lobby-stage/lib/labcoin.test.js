// Tests of the LabCoin link without LabCoin: a fake fetch stands in for the server.
//   node --test lib/labcoin.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createLabcoin, normalizeCode, cleanPlayer, buildResultPayloads, loadConfig, ENDPOINTS } from './labcoin.js';
import { createMock, mockSkinSvg } from './labcoin-mock.js';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'labcoin-test-'));
const live = dir => { fs.writeFileSync(path.join(dir, 'labcoin.json'), JSON.stringify({ baseUrl: 'https://lab.example/', key: 'K3Y', venue: 'vr-test', mode: 'live' })); return dir; };
const jsonRes = (status, body) => ({ status, ok: status >= 200 && status < 300, json: async () => body, headers: new Map([['content-type', 'application/json']]) });

test('the code: typed, with spaces or dashes, from a link or from a prefixed QR', () => {
  assert.equal(normalizeCode('ab12cd'), 'AB12CD');
  assert.equal(normalizeCode(' ab 12-cd '), 'AB12CD');
  assert.equal(normalizeCode('https://app.labcoin.bg/arena?code=hotdog'), 'HOTDOG');
  assert.equal(normalizeCode('https://app.labcoin.bg/arena/zq81xk'), 'ZQ81XK');
  assert.equal(normalizeCode('LCARENA:ab12cd'), 'AB12CD');
  assert.equal(normalizeCode('abc'), null);
  assert.equal(normalizeCode(''), null);
  assert.equal(normalizeCode(null), null);
  assert.equal(normalizeCode('1234567'), null);
});

test('config: live needs a base URL and a key; dev server without a file is mock; production without a file is off', () => {
  const d = tmp();
  assert.equal(loadConfig(d, {}).mode, 'off');
  assert.equal(loadConfig(d, { ARENA_DEV: '1' }).mode, 'mock');
  assert.equal(loadConfig(d, { LABCOIN_MOCK: '1' }).mode, 'mock');
  assert.equal(loadConfig(d, { LABCOIN_BASE_URL: 'https://x.test/', LABCOIN_ARENA_KEY: 'k' }).mode, 'live');
  assert.equal(loadConfig(d, { LABCOIN_BASE_URL: 'https://x.test/', LABCOIN_ARENA_KEY: 'k' }).baseUrl, 'https://x.test');
  fs.writeFileSync(path.join(d, 'labcoin.json'), JSON.stringify({ mode: 'live', baseUrl: 'https://x.test' }));
  assert.equal(loadConfig(d, {}).mode, 'off', 'live without a key is off, never half-working');
});

test('a player keeps only the nickname and the skin: no real name, e-mail, photo, place or phone', () => {
  const p = cleanPlayer({
    id: 'u-1', username: 'HotDogKing', realName: 'Ivan Petrov', email: 'x@y.bg', phone: '0888', photo: 'https://x/p.jpg', lat: 42.6, lng: 23.3,
    ageGroup: 'kid', level: 12.4, hex: 18450.2, skin: { id: 481, name: 'Хот-дог', stars: 3, imageUrl: 'https://cdn.example/481.png', modelKey: 'hot dog!', secret: 1 },
    skins: [{ id: 481, name: 'Хот-дог' }, null, { name: 'no id' }], labpass: { active: true, until: '2027-01-04T00:00:00Z' }, perks: [{ type: 'hex_multiplier', value: 2 }, { nope: 1 }],
  });
  assert.deepEqual(Object.keys(p).sort(), ['ageGroup', 'hex', 'id', 'labpass', 'level', 'perks', 'skin', 'skins', 'username']);
  assert.equal(p.skin.modelKey, 'hotdog');
  assert.equal(p.skin.id, '481');
  assert.equal(p.skins.length, 1);
  assert.equal(p.labpass.until, '2027-01-04');
  assert.deepEqual(p.perks, [{ type: 'hex_multiplier', value: 2 }]);
  assert.equal(cleanPlayer({ id: 'u', username: '  ' }), null);
  assert.equal(cleanPlayer({ username: 'x' }), null);
  assert.equal(cleanPlayer(null), null);
});

test('results: only bound players, placement counts everyone, equal scores share a place, win from the game', () => {
  const bound = new Map([['hs-1', { id: 'u-1', username: 'A' }], ['hs-3', { id: 'u-3', username: 'C' }]]);
  const res = { won: true, durationMs: 780500, players: [
    { id: 'hs-1', score: 900, kills: 10, deaths: 1 }, { id: 'hs-2', score: 900, kills: 8, downs: 2 }, { id: 'hs-3', score: 100, kills: 1 }, { id: 'hs-4', score: 500 },
  ] };
  const out = buildResultPayloads({ venue: 'vr-test', gameId: 'motel', sessionId: 's1', res, bound });
  assert.equal(out.length, 2);
  assert.deepEqual(out[0].payload, { ref: 'vr-test:s1:u-1', venue: 'vr-test', gameId: 'motel', sessionId: 's1', playerId: 'u-1', points: 900, kills: 10, deaths: 1, placement: 1, teamWon: true, durationSec: 781 });
  assert.equal(out[1].payload.placement, 4);
  assert.equal(out[1].payload.deaths, 0);
  assert.deepEqual(out[1].meta, { headsetId: 'hs-3', username: 'C' });
  assert.equal(buildResultPayloads({ venue: 'v', gameId: 'g', sessionId: 's', res: { players: [{ id: 'hs-1', score: 1 }] }, bound: new Map() }).length, 0);
  assert.equal(buildResultPayloads({ venue: 'v', gameId: 'g', sessionId: 's', res: { won: null, players: [{ id: 'hs-1', score: 1 }] }, bound }).at(0).payload.teamWon, false);
});

test('mock LabCoin: codes, errors, HEX rules (50 + 50 for a win or top 3, 300 a day), idempotent by ref', () => {
  const m = createMock();
  assert.equal(m.scan('HOTDOG').player.username, 'HotDogKing');
  assert.equal(m.scan('BANNED').error, 'banned');
  assert.equal(m.scan('EXPIRE').error, 'code_expired');
  assert.equal(m.scan('USED01').error, 'code_used');
  assert.equal(m.scan('NOPE00').error, 'code_unknown');
  const r1 = m.result({ ref: 'a', playerId: 'mock-0001', placement: 5, teamWon: false });
  assert.deepEqual([r1.hex, r1.capped, r1.total], [50, false, 18500]);
  const r2 = m.result({ ref: 'b', playerId: 'mock-0001', placement: 2, teamWon: false });
  assert.equal(r2.hex, 100);
  assert.deepEqual(m.result({ ref: 'b', playerId: 'mock-0001', placement: 2 }), r2, 'the same ref gives the same answer and pays nothing more');
  for (const ref of ['c', 'd']) m.result({ ref, playerId: 'mock-0001', teamWon: true });          // 100 + 100: 350 wanted in total by now
  const capped = m.result({ ref: 'e', playerId: 'mock-0001', teamWon: true });
  assert.deepEqual([capped.hex, capped.capped], [0, true], 'the daily cap of 300 holds');
  assert.equal(m.result({ ref: 'x' }).ok, false);
  assert.match(mockSkinSvg(481), /^<svg/);
});

test('live scan: sends the key and the contract body, maps every kind of answer', async () => {
  const dir = live(tmp()), calls = [];
  const answers = [
    jsonRes(200, { ok: true, player: { id: 'u-1', username: 'Nick', realName: 'Secret', skin: { id: 1, name: 'S' } } }),
    jsonRes(200, { ok: false, error: 'code_expired' }),
    jsonRes(401, { error: 'bad key' }), jsonRes(429, {}), jsonRes(502, null), jsonRes(200, { ok: true, player: { nope: 1 } }),
  ];
  const lc = createLabcoin({ dir, env: {}, fetchImpl: async (url, opt) => { calls.push({ url, opt }); return answers.shift(); } });
  const ok = await lc.scan('ab12cd', { headsetNumber: 3 });
  assert.equal(ok.ok, true);
  assert.equal(ok.player.username, 'Nick');
  assert.equal('realName' in ok.player, false);
  assert.equal(calls[0].url, `https://lab.example${ENDPOINTS.scan}`);
  assert.equal(calls[0].opt.headers['x-arena-key'], 'K3Y');
  assert.deepEqual(JSON.parse(calls[0].opt.body), { code: 'AB12CD', venue: 'vr-test', headsetNumber: 3 });
  assert.equal((await lc.scan('ab12cd')).error, 'code_expired');
  assert.equal((await lc.scan('ab12cd')).error, 'key_rejected');
  assert.equal((await lc.scan('ab12cd')).error, 'rate_limited');
  assert.equal((await lc.scan('ab12cd')).error, 'offline');
  assert.equal((await lc.scan('ab12cd')).error, 'bad_answer');
  assert.equal((await lc.scan('zz')).error, 'code_bad');
  assert.equal(calls.length, 6, 'a bad code never goes to LabCoin');
});

test('live scan: a network failure is "offline", with no key shown anywhere', async () => {
  const lc = createLabcoin({ dir: live(tmp()), env: {}, fetchImpl: async () => { throw Object.assign(new Error('fetch failed'), { cause: { code: 'ECONNREFUSED' } }); } });
  const r = await lc.scan('AB12CD');
  assert.equal(r.error, 'offline');
  assert.ok(!JSON.stringify(r).includes('K3Y'));
  assert.ok(!JSON.stringify(lc.status()).includes('K3Y'));
});

test('off: nothing is sent', async () => {
  let called = 0;
  const lc = createLabcoin({ dir: tmp(), env: {}, fetchImpl: async () => { called++; return jsonRes(200, {}); } });
  assert.equal((await lc.scan('AB12CD')).error, 'off');
  lc.enqueue({ ref: 'r', playerId: 'u' });
  await lc.pump();
  assert.equal(called, 0);
  assert.equal(lc.status().pending, 1, 'the result waits until the link is switched on');
});

test('outbox: retried with a growing wait, paid once, survives a restart, dropped on a permanent refusal', async () => {
  const dir = live(tmp());
  let t = 1_000_000, step = 0, got = [];
  const fetchImpl = async (url, opt) => {
    const body = JSON.parse(opt.body); got.push(body.ref); step++;
    if (body.ref === 'bad') return jsonRes(422, { error: 'unknown_player' });
    if (step === 1) return jsonRes(503, null);
    return jsonRes(200, { ok: true, hex: 100, capped: false, total: 18550 });
  };
  const paid = [];
  const mk = () => createLabcoin({ dir, env: {}, now: () => t, fetchImpl, onResult: (it, a) => paid.push([it.payload.ref, it.meta.username, a.hex]) });
  let lc = mk();
  lc.enqueue({ ref: 'r1', playerId: 'u-1', points: 10 }, { username: 'Nick' });
  await new Promise(r => setImmediate(r));
  await lc.pump();
  assert.equal(lc.status().pending, 1, 'the first try got a 503');
  assert.equal(lc.status().lastError, 'HTTP 503');
  await lc.pump();
  assert.equal(got.length, 1, 'it waits, no second call yet');
  lc = mk();                                           // the lobby restarts: the item is still on disk
  assert.equal(lc.status().pending, 1);
  t += 6000;
  await lc.pump();
  assert.deepEqual(paid, [['r1', 'Nick', 100]]);
  assert.equal(lc.status().pending, 0);
  assert.equal(lc.enqueue({ ref: 'r1', playerId: 'u-1' }), false, 'the same result is not queued twice');
  assert.equal(lc.status().recent[0].hex, 100);
  lc.enqueue({ ref: 'bad', playerId: 'u-9' });
  await new Promise(r => setImmediate(r));
  await lc.pump();
  assert.equal(lc.status().pending, 0);
  assert.equal(lc.status().failed, 1, 'a 422 is final: it is kept for a look, not retried');
});

test('mock mode pays at once and shows the skin picture without any network', async () => {
  const paid = [];
  const lc = createLabcoin({ dir: tmp(), env: { LABCOIN_MOCK: '1' }, fetchImpl: async () => { throw new Error('no network in mock'); }, onResult: (it, a) => paid.push(a.hex) });
  const s = await lc.scan('hotdog');
  assert.equal(s.player.skin.modelKey, 'hotdog');
  lc.enqueue({ ref: 'm1', playerId: s.player.id, placement: 1, teamWon: true }, { username: s.player.username });
  await new Promise(r => setTimeout(r, 20));
  assert.deepEqual(paid, [100]);
  const img = await lc.skinImage('481', s.player.skin.imageUrl);
  assert.equal(img.type, 'image/svg+xml');
  assert.equal(await lc.skinImage('481', 'https://cdn.example/x.png'), null, 'a real URL is never fetched in mock mode');
  assert.equal(await lc.skinImage('', 'mock:1'), null);
});

test('live skin picture: fetched once, then served from the disk; only images up to 2 MB', async () => {
  const dir = live(tmp());
  let fetched = 0, type = 'image/png', size = 100;
  const fetchImpl = async () => { fetched++; return { ok: true, headers: new Map([['content-type', type]]), arrayBuffer: async () => new ArrayBuffer(size) }; };
  const lc = createLabcoin({ dir, env: {}, fetchImpl });
  const a = await lc.skinImage('481', 'https://cdn.example/481.png');
  assert.equal(a.type, 'image/png');
  const b = await lc.skinImage('481', 'https://cdn.example/481.png');
  assert.equal(b.body.length, 100);
  assert.equal(fetched, 1);
  type = 'text/html';
  assert.equal(await lc.skinImage('9', 'https://cdn.example/9.png'), null);
  type = 'image/png'; size = 3e6;
  assert.equal(await lc.skinImage('8', 'https://cdn.example/8.png'), null);
  assert.equal(await lc.skinImage('7', 'http://other.example/7.png'), null, 'plain http from another host is refused');
});
