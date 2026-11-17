// Tests for the small stores: store.js, settings.js, records.js, presets.js, health.js
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readJson, writeJson, appendJsonl, tailJsonl, slug } from './store.js';
import { createSettings, merge, normalize, DEFAULTS, seasonFor } from './settings.js';
import { createRecords, periodStart } from './records.js';
import { createPresets } from './presets.js';
import { createHealth } from './health.js';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 's2-'));

test('store: atomic json, jsonl append and tail, slug', () => {
  const d = tmp(), f = path.join(d, 'a', 'x.json');
  writeJson(f, { a: 1 });
  assert.deepEqual(readJson(f, null), { a: 1 });
  assert.equal(readJson(path.join(d, 'none.json'), 7), 7);
  const l = path.join(d, 's.jsonl');
  for (let i = 0; i < 30; i++) appendJsonl(l, { i });
  fs.appendFileSync(l, '{broken\n');
  const t = tailJsonl(l, 5);
  assert.deepEqual(t.map(x => x.i), [25, 26, 27, 28, 29]);
  assert.deepEqual(tailJsonl(path.join(d, 'none.jsonl')), []);
  assert.equal(slug('Wölfe & Co / 2'), 'Wolfe-Co-2');
  assert.equal(slug(''), 'x');
});

test('settings: defaults, partial updates, validation, persistence', () => {
  const d = tmp(), f = path.join(d, 'settings.json');
  const s = createSettings(f, { initial: { autoStart: true } });
  assert.equal(s.get().autoStart, true);
  assert.equal(s.get().clockScope, 'game');
  s.update({ venue: { name: '  Arena  Varna ' }, clockScope: 'all', resultsSec: 999, endMessage: { preset: 'custom', text: 'Bye' } });
  assert.equal(s.get().venue.name, 'Arena  Varna');
  assert.equal(s.get().resultsSec, 120);
  assert.deepEqual(s.get().endMessage, { preset: 'custom', text: 'Bye' });
  assert.throws(() => s.update({ clockScope: 'week' }));
  assert.throws(() => s.update({ difficulty: 'insane' }));
  assert.throws(() => s.update({ venue: { logo: 'http://evil/x.png' } }));
  s.update({ venue: { logo: 'data:image/png;base64,iVBORw0KGgo=' } });
  assert.ok(s.get().venue.logo.startsWith('data:image/png'));
  const again = createSettings(f);
  assert.equal(again.get().clockScope, 'all', 'saved to disk');
  assert.equal(normalize({ junk: 1 }).difficulty, DEFAULTS.difficulty);
  assert.equal(merge(DEFAULTS, { printer: { kind: 'thermal' } }).printer.kind, 'thermal');
  assert.equal(seasonFor('auto', new Date(2026, 11, 20)), 'christmas');
  assert.equal(seasonFor('auto', new Date(2026, 9, 31)), 'halloween');
  assert.equal(seasonFor('auto', new Date(2026, 6, 1)), null);
  assert.equal(seasonFor('off', new Date(2026, 11, 20)), null);
});

test('records: rank per game and difficulty, new record, periods, rename, remove, csv, import', () => {
  const d = tmp(), f = path.join(d, 'records.json');
  const r = createRecords(f, { importFrom: [{ id: 'old', gameId: 'motel', game: 'The Motel', team: 'Old', score: 500, at: '2026-01-01T10:00:00Z' }, { id: 't', gameId: 'motel', score: 9999, test: true }] });
  assert.equal(r.all().length, 1, 'trial results are not imported');
  const a = r.add({ gameId: 'motel', game: 'The Motel', team: 'Wolves', score: 800, players: [{ name: 'Ann', score: 400, kills: 3 }] });
  assert.equal(a.rank, 1); assert.equal(a.newRecord, true);
  const b = r.add({ gameId: 'motel', game: 'The Motel', team: 'Bears', score: 600 });
  assert.equal(b.rank, 2); assert.equal(b.newRecord, false);
  const c = r.add({ gameId: 'motel', game: 'The Motel', team: 'Kids', score: 100, difficulty: 'easy' });
  assert.equal(c.rank, 1, 'separate per difficulty');
  const list = r.list({ gameId: 'motel', difficulty: 'normal' });
  assert.deepEqual(list.list.map(e => e.team), ['Wolves', 'Bears', 'Old']);
  assert.equal(r.list({ gameId: 'motel', period: 'today' }).total, 3);
  r.rename(b.entry.id, '  New  Bears ');
  assert.equal(r.all().find(e => e.id === b.entry.id).team, 'New Bears');
  assert.throws(() => r.rename('nope', 'x'));
  r.remove(c.entry.id);
  assert.equal(r.all().length, 3);
  assert.match(r.csv({ gameId: 'motel' }), /^rank,game,team,score/);
  assert.deepEqual(r.board('motel', 2).map(x => x.team), ['Wolves', 'New Bears']);
  assert.equal(createRecords(f).all().length, 3, 'persisted, no second import');
  assert.ok(periodStart('week') > 0 && periodStart('all') === 0);
});

test('presets: save, replace by name, remove, validation', () => {
  const d = tmp(), f = path.join(d, 'playlists.json');
  const p = createPresets(f);
  p.save({ name: 'Birthday', items: [{ gameId: 'motel', minutes: 10 }], breakSec: 999 }, id => id === 'motel');
  assert.equal(p.list()[0].breakSec, 300);
  p.save({ name: 'birthday', items: [{ gameId: 'motel', difficulty: 'easy' }] }, id => id === 'motel');
  assert.equal(p.list().length, 1, 'same name replaces');
  assert.throws(() => p.save({ name: 'X', items: [{ gameId: 'nope' }] }, id => id === 'motel'), /No such game/);
  assert.throws(() => p.save({ name: '', items: [{ gameId: 'motel' }] }));
  assert.equal(createPresets(f).list().length, 1);
  p.remove('BIRTHDAY');
  assert.equal(p.list().length, 0);
});

test('health: ping now, min/max over the window, drops', () => {
  let t = 0;
  const h = createHealth({ now: () => t, windowMs: 60_000 });
  h.ping('A', 20); t += 1000; h.ping('A', 80); t += 1000; h.ping('A', 40);
  let v = h.view('A', -50);
  assert.deepEqual([v.pingMs, v.pingMin, v.pingMax, v.wifi], [40, 20, 80, -50]);
  h.drop('A');
  assert.equal(h.view('A').drops, 1);
  t += 70_000;
  h.ping('A', 30);
  v = h.view('A');
  assert.deepEqual([v.pingMin, v.pingMax, v.drops, v.dropsTotal], [30, 30, 0, 1]);
  assert.equal(h.view('nobody').pingMs, null);
});
