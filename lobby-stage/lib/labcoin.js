// The link to LabCoin (design: docs/LABCOIN-LINK.md): scan a player's code, keep the player's skin and perks,
// send the result of a match back so LabCoin can pay HEX.
//
// Config: data/labcoin.json  { "baseUrl": "https://app.labcoin.bg", "key": "...", "venue": "vr-sofia", "mode": "live|mock|off", "ttlHours": 6 }
//   or env LABCOIN_BASE_URL / LABCOIN_ARENA_KEY / LABCOIN_VENUE / LABCOIN_MOCK=1. The file is read at every call (no restart).
//   No mode given: baseUrl and key present -> live, else (dev server) mock, else off. The key never leaves this PC and is never sent to a page.
//
// Contract (X-Arena-Key header):
//   POST /api/partner/arena/scan    { code, venue, headsetNumber }  -> { ok, player } | { ok: false, error }
//   POST /api/partner/arena/result  { ref, venue, gameId, sessionId, playerId, points, kills, deaths, placement, teamWon, durationSec }
//                                   -> { ok, hex, capped, total }   (idempotent by ref)

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createMock, mockSkinSvg } from './labcoin-mock.js';

export const ENDPOINTS = { scan: '/api/partner/arena/scan', result: '/api/partner/arena/result' };

const TEXT = {
  off: 'Връзката с LabCoin не е включена на този компютър',
  code_bad: 'Кодът е 6 знака (букви и цифри)',
  code_unknown: 'Непознат код',
  code_expired: 'Кодът е изтекъл (важи 5 минути). Играчът да покаже нов от профила си',
  code_used: 'Кодът вече е използван. Играчът да покаже нов',
  banned: 'Този играч не може да влиза',
  offline: 'Няма връзка с LabCoin. Опитай пак',
  key_rejected: 'LabCoin не приема ключа на тази зала',
  rate_limited: 'Твърде много проби. Изчакай малко',
  bad_answer: 'LabCoin върна нещо неразбираемо',
  no_headset: 'Няма каска, към която да се върже играчът',
  too_many: 'Твърде много проби за минута',
};
export const errorText = code => TEXT[code] || `Грешка от LabCoin (${String(code).slice(0, 40)})`;
const fail = (error, detail) => ({ ok: false, error, text: errorText(error), ...(detail ? { detail: String(detail).slice(0, 200) } : {}) });

export function loadConfig(dir, env = process.env) {
  let f = {};
  try { f = JSON.parse(fs.readFileSync(path.join(dir, 'labcoin.json'), 'utf8')) || {}; } catch { /* no file: defaults */ }
  const key = String(env.LABCOIN_ARENA_KEY || f.key || '');
  const baseUrl = String(env.LABCOIN_BASE_URL || f.baseUrl || '').replace(/\/+$/, '');
  const venue = String(env.LABCOIN_VENUE || f.venue || 'arena').slice(0, 40);
  let mode = String(f.mode || '').toLowerCase();
  if (env.LABCOIN_MOCK === '1') mode = 'mock';
  if (!['live', 'mock', 'off'].includes(mode)) mode = key && baseUrl ? 'live' : (env.ARENA_DEV === '1' ? 'mock' : 'off');
  if (mode === 'live' && !(key && baseUrl)) mode = 'off';
  const ttlHours = Math.max(0.5, Math.min(48, Number(f.ttlHours) || 6));
  return { mode, baseUrl, key, venue, ttlHours };
}

/** What a person types or what a QR holds -> the 6-character code, or null. */
export function normalizeCode(raw) {
  let s = String(raw ?? '').trim();
  if (!s) return null;
  const squeezed = s.replace(/[\s-]+/g, '').toUpperCase();
  if (/^[A-Z0-9]{6}$/.test(squeezed)) return squeezed;
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) {
    try {
      const u = new URL(s);
      s = u.searchParams.get('code') || u.searchParams.get('c') || u.searchParams.get('k') || u.pathname.split('/').filter(Boolean).pop() || '';
    } catch { /* not a URL after all */ }
  }
  s = (s.split(/[\s:|,;]+/).filter(Boolean).pop() || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  return /^[A-Z0-9]{6}$/.test(s) ? s : null;
}

const str = (v, n) => (typeof v === 'string' ? v.slice(0, n) : '');
const idOf = v => String(v ?? '').replace(/[^\w-]/g, '').slice(0, 60);
function cleanSkin(s) {
  if (!s || typeof s !== 'object' || s.id == null || !idOf(s.id)) return null;
  return {
    id: idOf(s.id), name: str(s.name, 40), stars: Math.max(0, Math.min(5, Math.round(+s.stars) || 0)),
    imageUrl: /^(https?:|mock:)/.test(String(s.imageUrl || '')) ? String(s.imageUrl).slice(0, 300) : '',
    modelKey: str(s.modelKey, 40).replace(/[^\w-]/g, '') || null,
  };
}
/**
 * The only fields we keep from LabCoin's answer. Kids are players: a nickname and a skin, nothing else
 * (no real name, e-mail, photo, place or phone, even if the server sent them).
 */
export function cleanPlayer(p) {
  if (!p || typeof p !== 'object' || p.id == null || !idOf(p.id)) return null;
  const username = str(p.username, 30).trim();
  if (!username) return null;
  return {
    id: idOf(p.id), username,
    ageGroup: ['kid', 'teen', 'adult'].includes(p.ageGroup) ? p.ageGroup : 'unknown',
    level: Number.isFinite(+p.level) ? Math.max(0, Math.round(+p.level)) : null,
    skin: cleanSkin(p.skin),
    skins: (Array.isArray(p.skins) ? p.skins : []).slice(0, 60).map(cleanSkin).filter(Boolean),
    hex: Number.isFinite(+p.hex) ? Math.round(+p.hex) : null,
    labpass: { active: !!p.labpass?.active, until: /^\d{4}-\d{2}-\d{2}/.test(String(p.labpass?.until || '')) ? String(p.labpass.until).slice(0, 10) : null },
    perks: (Array.isArray(p.perks) ? p.perks : []).slice(0, 8).filter(k => k && typeof k.type === 'string')
      .map(k => ({ type: k.type.slice(0, 40), value: Number.isFinite(+k.value) ? +k.value : str(String(k.value ?? ''), 40) })),
  };
}

/**
 * One result per bound player at the end of a game (res: the game's results with players[{id, score, kills, deaths}]).
 * Placement counts every player in the game, bound or not; equal scores share a place.
 */
export function buildResultPayloads({ venue, gameId, sessionId, res, bound }) {
  const players = Array.isArray(res?.players) ? res.players : [];
  const rows = players.map(p => ({ p, score: Math.round(+p.score || 0) }));
  const sorted = [...rows].sort((a, b) => b.score - a.score);
  const place = new Map();
  sorted.forEach((r, i) => place.set(r.p, i > 0 && sorted[i - 1].score === r.score ? place.get(sorted[i - 1].p) : i + 1));
  const int = v => (Number.isFinite(+v) ? Math.max(0, Math.round(+v)) : 0);
  const out = [];
  for (const { p, score } of rows) {
    const player = p.id != null ? bound.get(p.id) : null;
    if (!player) continue;
    out.push({
      payload: {
        ref: `${venue}:${sessionId}:${player.id}`, venue, gameId: String(gameId || ''), sessionId: String(sessionId || ''), playerId: player.id,
        points: score, kills: int(p.kills), deaths: int(p.deaths ?? p.downs), placement: place.get(p), teamWon: res?.won === true,
        durationSec: Number.isFinite(+res?.durationMs) ? Math.round(+res.durationMs / 1000) : null,
      },
      meta: { headsetId: p.id, username: player.username },
    });
  }
  return out;
}

const BACKOFF_MS = [5e3, 15e3, 60e3, 300e3, 600e3];
const GIVE_UP_MS = 48 * 3600e3;

export function createLabcoin({ dir, env = process.env, fetchImpl = (...a) => fetch(...a), now = Date.now, log = () => {}, onResult = () => {} } = {}) {
  const mock = createMock({ now });
  const boxFile = path.join(dir, 'labcoin-outbox.json');
  const skinDir = path.join(dir, 'labcoin-skins');
  const cfg = () => loadConfig(dir, env);

  let box = { items: [], failed: [] };
  try { const b = JSON.parse(fs.readFileSync(boxFile, 'utf8')); if (Array.isArray(b.items)) box = { items: b.items, failed: Array.isArray(b.failed) ? b.failed : [] }; } catch { /* first run */ }
  const done = new Set();          // refs paid in this run: a repeated enqueue is ignored
  let lastError = null, pumping = false, timer = null;
  const recent = [];               // the last answers, for the scan page

  function save() {
    try { fs.mkdirSync(dir, { recursive: true }); const tmp = `${boxFile}.tmp`; fs.writeFileSync(tmp, JSON.stringify(box)); fs.renameSync(tmp, boxFile); }
    catch (e) { log(`outbox not saved: ${e.message}`); }
  }

  async function call(c, kind, body) {
    if (c.mode === 'mock') return { status: 200, json: kind === 'scan' ? mock.scan(body.code) : mock.result(body) };
    try {
      const res = await fetchImpl(c.baseUrl + ENDPOINTS[kind], {
        method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json', 'x-arena-key': c.key },
        body: JSON.stringify(body), signal: AbortSignal.timeout(kind === 'scan' ? 6000 : 10000),
      });
      let json = null;
      try { json = await res.json(); } catch { /* not JSON */ }
      return { status: res.status, json };
    } catch (e) { return { status: 0, json: null, error: e.name === 'TimeoutError' ? 'no answer in time' : String(e.cause?.code || e.message || e) }; }
  }

  async function scan(rawCode, { headsetNumber = null } = {}) {
    const c = cfg();
    if (c.mode === 'off') return fail('off');
    const code = normalizeCode(rawCode);
    if (!code) return fail('code_bad');
    const r = await call(c, 'scan', { code, venue: c.venue, headsetNumber });
    if (r.status === 0) { lastError = r.error; return fail('offline', r.error); }
    if (r.status === 401 || r.status === 403) return fail('key_rejected');
    if (r.status === 429) return fail('rate_limited');
    if (r.status >= 500) return fail('offline', `HTTP ${r.status}`);
    if (r.json?.ok === true) {
      const player = cleanPlayer(r.json.player);
      return player ? { ok: true, player } : fail('bad_answer');
    }
    return fail(typeof r.json?.error === 'string' && r.json.error ? r.json.error.replace(/[^\w-]/g, '').slice(0, 40) : 'bad_answer');
  }

  function enqueue(payload, meta = {}) {
    if (!payload?.ref || done.has(payload.ref) || box.items.some(i => i.payload.ref === payload.ref)) return false;
    box.items.push({ payload, meta, createdAt: now(), tries: 0, nextAt: 0, lastError: null });
    save();
    if (cfg().mode === 'mock') setImmediate(() => pump());
    else pump();
    return true;
  }

  async function pump() {
    if (pumping) return;
    const c = cfg();
    if (c.mode === 'off' || !box.items.length) return;
    pumping = true;
    try {
      for (const it of [...box.items]) {
        if (it.nextAt > now()) continue;
        const r = await call(c, 'result', it.payload);
        it.tries++;
        if (r.status === 200 && r.json?.ok === true) {
          box.items = box.items.filter(x => x !== it);
          done.add(it.payload.ref);
          const answer = { hex: Number(r.json.hex) || 0, capped: !!r.json.capped, total: r.json.total ?? null };
          recent.unshift({ at: now(), ref: it.payload.ref, playerId: it.payload.playerId, username: it.meta?.username || null, ...answer });
          recent.length = Math.min(recent.length, 20);
          lastError = null;
          save();
          try { onResult(it, answer); } catch (e) { log(`onResult: ${e.message}`); }
          continue;
        }
        const permanent = (r.status === 200 && r.json && r.json.ok === false) || [400, 404, 409, 410, 422].includes(r.status);
        const why = r.error || (r.json?.error ? String(r.json.error).slice(0, 80) : `HTTP ${r.status}`);
        it.lastError = why; lastError = why;
        if (permanent || now() - it.createdAt > GIVE_UP_MS) {
          box.items = box.items.filter(x => x !== it);
          box.failed.unshift({ ...it, failedAt: now() });
          box.failed.length = Math.min(box.failed.length, 50);
          log(`result ${it.payload.ref} dropped: ${why}`);
        } else {
          it.nextAt = now() + BACKOFF_MS[Math.min(it.tries - 1, BACKOFF_MS.length - 1)];
          log(`result ${it.payload.ref}: ${why}, again in ${Math.round((it.nextAt - now()) / 1000)} s`);
        }
        save();
      }
    } finally { pumping = false; }
  }

  function start() { if (!timer) { timer = setInterval(() => pump().catch(e => log(`pump: ${e.message}`)), 5000); timer.unref?.(); } }

  /** The picture of a skin: cached on disk, drawn locally for a mock skin, fetched once for a real one. */
  async function skinImage(skinId, imageUrl) {
    const id = idOf(skinId);
    if (!id) return null;
    const url = String(imageUrl || '');
    if (url.startsWith('mock:')) return { type: 'image/svg+xml', body: Buffer.from(mockSkinSvg(id)) };
    const tag = crypto.createHash('sha1').update(url).digest('hex').slice(0, 8);
    const file = path.join(skinDir, `${id}-${tag}`);
    try { return { type: fs.readFileSync(`${file}.type`, 'utf8'), body: fs.readFileSync(`${file}.img`) }; } catch { /* not cached yet */ }
    const c = cfg();
    if (c.mode !== 'live' || !/^https?:\/\//.test(url)) return null;
    try {
      const sameHost = new URL(url).host === new URL(c.baseUrl).host;
      if (!url.startsWith('https:') && !sameHost) return null;
      const res = await fetchImpl(url, { signal: AbortSignal.timeout(8000) });
      const type = String(res.headers.get('content-type') || '').split(';')[0].trim();
      if (!res.ok || !/^image\/(png|jpeg|webp|gif|svg\+xml)$/.test(type)) return null;
      const body = Buffer.from(await res.arrayBuffer());
      if (!body.length || body.length > 2e6) return null;
      fs.mkdirSync(skinDir, { recursive: true });
      fs.writeFileSync(`${file}.img`, body); fs.writeFileSync(`${file}.type`, type);
      return { type, body };
    } catch (e) { log(`skin ${id}: ${e.message}`); return null; }
  }

  function status() {
    const c = cfg();
    return { mode: c.mode, venue: c.venue, ttlHours: c.ttlHours, pending: box.items.length, failed: box.failed.length, lastError, recent: recent.slice(0, 8) };
  }

  return { cfg, scan, enqueue, pump, start, skinImage, status, _box: () => box };
}
