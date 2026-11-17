// LabCoin Арена — сървър за залата. Пуска се с: node server.js
// Без база данни: всичко е в data/db.json. Чете (само чете) лобито на арената и Google календара.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import QRCode from 'qrcode';
import * as core from './lib/core.js';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_FILE = process.env.CONFIG_FILE || path.join(DIR, 'config.json');   // за проба: друг config
const DB_FILE = process.env.DB_FILE || path.join(DIR, 'data', 'db.json');   // за проба: DB_FILE=data/test.json
const QUESTIONS_FILE = path.join(DIR, 'questions.json');
const SCHEDULE_FILE = path.join(DIR, 'schedule.json');
const DEFAULT_SCHEDULE = { parts: [{ key: 'labcoin', label: 'LabCoin игри', minutes: 45 }] };

const DEFAULT_CONFIG = {
  port: 4780,
  lobbyUrl: 'http://127.0.0.1:47801',   // лобито на VR арената (само GET /api/state)
  icalUrl: '',                          // РЕЗЕРВА: тайният iCal адрес на Google календара (слага го собственикът)
  // ОСНОВНО: базата на панела VR Varna (Cloudflare D1), САМО ЧЕТЕНЕ с фиксиран SELECT (по Делта, 12.11).
  // Токенът (Account → D1 → Read) го създава и слага Митко. Панелът не се променя.
  d1AccountId: '',
  d1DatabaseId: '',
  d1Token: '',
  d1ApiBase: 'https://api.cloudflare.com/client/v4',
  maxHeadsets: 5,                       // колко каски има на арената (лобито познава 5)
  quizSeconds: 15,
  quizQuestions: 12,
  publicBaseUrl: '',                    // ако лидербордът се качи в интернет — адресът му
  publishKey: '',                       // ключът за писане в публичния лидерборд (само тук, в залата)
  lobbyControl: true,                   // приложението пише в лобито: имена, отбори, старт/стоп (одобрено от Митко 12.11)
  arenaRoundsToWin: null,               // число = праща се на лобито при старт; null = каквото е в лобито
};

const readJson = (f, fallback) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return fallback; } };
const config = { ...DEFAULT_CONFIG, ...readJson(CONFIG_FILE, {}) };
if (!fs.existsSync(CONFIG_FILE)) fs.writeFileSync(CONFIG_FILE, JSON.stringify(DEFAULT_CONFIG, null, 2) + '\n');
if (process.env.PORT) config.port = Number(process.env.PORT);
if (process.env.LOBBY_URL) config.lobbyUrl = process.env.LOBBY_URL;

const db = readJson(DB_FILE, { birthdays: {} });
db.seenEvents ||= [];      // eventId от лобито (за дубликати)
db.lobbyRestore ||= {};    // headsetId → оригиналното име (за връщане накрая)
let saveTimer = null;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
    const tmp = DB_FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
    fs.renameSync(tmp, DB_FILE);
  }, 200);
}
const questions = () => readJson(QUESTIONS_FILE, []);
const uid = (p = '') => p + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-3);
const todayYmd = () => core.localYmd(new Date().toISOString());

// ─── Google календар ─────────────────────────────────────────────────────────
let calCache = { at: 0, events: [], error: null };
async function calendarEvents(force = false) {
  if (!config.icalUrl) return { events: [], error: 'Няма iCal адрес в config.json (icalUrl). Рождените дни се добавят на ръка.' };
  if (!force && Date.now() - calCache.at < 5 * 60_000) return calCache;
  try {
    const res = await fetch(config.icalUrl, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) throw new Error('Календарът върна ' + res.status);
    const text = await res.text();
    if (!/BEGIN:VCALENDAR/.test(text)) throw new Error('Това не е iCal');
    calCache = { at: Date.now(), events: core.parseICalFeed(text), error: null };
  } catch (e) {
    calCache = { ...calCache, at: Date.now(), error: 'Календарът не се чете: ' + e.message };
  }
  return calCache;
}

// ─── Панелът VR Varna (D1, само четене) ─────────────────────────────────────
// ЕДИНСТВЕНАТА заявка към панела. Без parent_name, phone, raw_description (лични данни).
const PANEL_SQL = `SELECT e.id, e.start_time, e.end_time, e.duration_minutes, e.child_name, e.children_count,
       e.package, e.theme, e.is_kpop, e.cancelled_at IS NOT NULL AS cancelled,
       w1.name AS animator1, w2.name AS animator2
FROM birthday_events e
LEFT JOIN workers w1 ON w1.id = e.animator_id
LEFT JOIN workers w2 ON w2.id = e.animator_id_2
WHERE e.start_time >= ?1 AND e.start_time < ?2 ORDER BY e.start_time`;
const panelOn = () => !!(config.d1Token && config.d1AccountId && config.d1DatabaseId);
const panelCache = new Map();   // ymd → { at, list, error }

/** UTC граници на местния ден (София). */
function dayRangeUtc(ymd) {
  const from = isoWithZone(`${ymd}T00:00:00`);
  const to = new Date(new Date(from).getTime() + 26 * 3600_000).toISOString();   // +26 ч (смяна на часа), филтрираме после
  return [from, to];
}
async function panelBirthdays(ymd, force = false) {
  if (!panelOn()) return { list: [], error: 'Няма d1Token в config.json (панелът не се чете).' };
  const c = panelCache.get(ymd);
  if (!force && c && Date.now() - c.at < 2 * 60_000) return c;
  try {
    const res = await fetch(`${config.d1ApiBase.replace(/\/$/, '')}/accounts/${config.d1AccountId}/d1/database/${config.d1DatabaseId}/query`, {
      method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + config.d1Token },
      body: JSON.stringify({ sql: PANEL_SQL, params: dayRangeUtc(ymd) }), signal: AbortSignal.timeout(10_000),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok || j.success === false) throw new Error((j.errors || []).map(e => e.message).join('; ') || 'HTTP ' + res.status);
    const rows = j.result?.[0]?.results || [];
    const list = rows
      .filter(r => core.localYmd(r.start_time) === ymd)
      .map(r => ({
        uid: 'panel:' + r.id, source: 'panel',
        childName: r.child_name || 'Рожден ден', childrenCount: r.children_count, pkg: r.package, theme: r.theme,
        start: r.start_time, end: r.end_time, durationMinutes: r.duration_minutes,
        animators: [r.animator1, r.animator2].filter(Boolean), cancelled: !!r.cancelled, kpop: !!r.is_kpop,
      }));
    const out = { at: Date.now(), list, error: null };
    panelCache.set(ymd, out);
    return out;
  } catch (e) {
    const out = { at: Date.now(), list: c?.list || [], error: 'Панелът не се чете: ' + e.message };
    panelCache.set(ymd, out);
    return out;
  }
}

/** Рождените дни за деня: първо от панела; ако панелът не е настроен или не отговаря — от iCal (резерва). */
async function birthdaySource(ymd, force = false) {
  const panel = await panelBirthdays(ymd, force);
  if (panelOn() && !panel.error) return { source: 'panel', list: panel.list, error: null };
  const cal = await calendarEvents(force);
  const list = core.birthdaysForDate(cal.events || [], ymd).map(e => ({ ...e, source: 'calendar' }));
  const errors = [panelOn() ? panel.error : null, cal.error].filter(Boolean);
  return { source: config.icalUrl ? 'calendar' : 'none', list, error: errors.join(' · ') || null, panelError: panelOn() ? panel.error : null };
}

// ─── Лобито на арената ───────────────────────────────────────────────────────
let lobby = { ok: false, at: 0, error: 'още не е питано', headsets: [], match: null };
async function pollLobby() {
  try {
    // user-agent с „node“ → лобито НЕ го брои като играта (виж matchSeenBy в лобито)
    const res = await fetch(config.lobbyUrl.replace(/\/$/, '') + '/api/state', { headers: { 'user-agent': 'LabCoinArena node' }, signal: AbortSignal.timeout(2500) });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const s = await res.json();
    lobby = {
      ok: true, at: Date.now(), error: null,
      headsets: (s.headsets || []).map(h => ({ id: h.id, number: h.number, name: h.name, online: !!h.online, battery: h.battery })),
      match: s.match ? {
        phase: s.match.phase, red: s.match.red, blue: s.match.blue,
        redRounds: s.match.redRounds, blueRounds: s.match.blueRounds,
        board: (s.match.board || []).map(p => ({ id: p.id, team: p.team, kills: p.kills, deaths: p.deaths })),
      } : null,
    };
    trackLiveMatches();
  } catch (e) {
    lobby = { ...lobby, ok: false, at: Date.now(), error: 'Лобито не отговаря (' + e.message + ')' };
  }
}
setInterval(pollLobby, 1500);
pollLobby();

// ─── Писане в лобито (одобрено от Митко 12.11: имена, отбори, старт/стоп; накрая — старите имена) ──
async function lobbyPost(pathname, body) {
  const res = await fetch(config.lobbyUrl.replace(/\/$/, '') + pathname, {
    method: 'POST', headers: { 'content-type': 'application/json', 'user-agent': 'LabCoinArena node' },
    body: JSON.stringify(body), signal: AbortSignal.timeout(4000),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || j.error) throw new Error(`Лобито ${pathname}: ${j.error || 'HTTP ' + res.status}`);
  return j;
}
async function lobbyState() {
  const res = await fetch(config.lobbyUrl.replace(/\/$/, '') + '/api/state', { headers: { 'user-agent': 'LabCoinArena node' }, signal: AbortSignal.timeout(3000) });
  if (!res.ok) throw new Error('Лобито не отговаря (HTTP ' + res.status + ')');
  return res.json();
}

/** Връща оригиналните имена на каските (или ги изтрива, ако не е имало собствено име). */
async function restoreLobbyNames() {
  const left = {};
  for (const [headsetId, orig] of Object.entries(db.lobbyRestore || {})) {
    try { await lobbyPost('/api/headset/rename', { headsetId, name: orig && orig !== headsetId ? orig : '' }); }
    catch (e) { left[headsetId] = orig; }
  }
  db.lobbyRestore = left; save();
  return { restored: true, left: Object.keys(left).length };
}

// ─── Събития от лобито (вариант 2: лобито праща края на рунд и мач) ─────────
/** Прилага round_end / match_end към мача на живо. Връща какво е направено. */
function applyArenaEvent(ev) {
  if (!ev || ev.v !== 1 || !['round_end', 'match_end'].includes(ev.type) || !ev.eventId) throw new Error('Невалидно събитие');
  if (db.seenEvents.includes(ev.eventId)) return { ok: true, dup: true };
  db.seenEvents.push(ev.eventId);
  if (db.seenEvents.length > 500) db.seenEvents.splice(0, db.seenEvents.length - 500);
  db.lastEventId = ev.eventId;
  const live = liveMatch();
  if (!live) { save(); return { ok: true, applied: false, reason: 'няма мач на живо' }; }
  const { b, m } = live;
  // закъсняло събитие от предишен мач (преди старта на този) не се прилага
  if (ev.at && Date.parse(ev.at) < m.startedAt - 2000) { save(); return { ok: true, applied: false, reason: 'събитие отпреди старта на мача' }; }
  const rows = Array.isArray(ev.board) ? ev.board : [];
  m.result ||= {}; m.manual ||= {}; m.events ||= [];
  for (const [kidId, hsId] of Object.entries(m.headsetIds || {})) {
    const row = rows.find(r => r.headsetId === hsId) || rows.find(r => Number(r.number) === Number(m.headsets[kidId]));
    if (!row || m.manual[kidId]) continue;
    const base = m.base?.[hsId] || { kills: 0, deaths: 0 };
    // kills/deaths в събитието са натрупани за цялата игра → разлика спрямо снимката при старт
    const k = Number(row.kills) - base.kills, d = Number(row.deaths) - base.deaths;
    m.result[kidId] = { kills: Math.max(0, k || 0), deaths: Math.max(0, d || 0) };
  }
  m.lobbyRounds = { red: Number(ev.redRounds) || 0, blue: Number(ev.blueRounds) || 0 };
  m.events.push({ type: ev.type, round: ev.round ?? null, winnerTeam: ev.winnerTeam ?? 0, at: ev.at || new Date().toISOString() });
  let ended = false;
  if (ev.type === 'match_end' && (ev.winnerTeam === 1 || ev.winnerTeam === 2)) {
    finishMatch(b, m, ev.winnerTeam === 1 ? m.a : m.b);   // червен = отбор А, син = отбор Б
    ended = true;
  }
  save();
  return { ok: true, applied: true, birthday: b.id, match: m.id, ended };
}
function liveMatch() {
  for (const b of Object.values(db.birthdays)) for (const m of b.arena?.matches || []) if (m.status === 'live') return { b, m };
  return null;
}
/** Наваксване: събитията, пропуснати докато приложението е било спряно. */
async function catchUpEvents() {
  try {
    const q = db.lastEventId ? '?since=' + encodeURIComponent(db.lastEventId) : '';
    const res = await fetch(config.lobbyUrl.replace(/\/$/, '') + '/api/match/events' + q, { headers: { 'user-agent': 'LabCoinArena node' }, signal: AbortSignal.timeout(3000) });
    if (!res.ok) return;
    const j = await res.json();
    for (const ev of (Array.isArray(j) ? j : j.events || [])) { try { applyArenaEvent(ev); } catch {} }
  } catch {}
}
setTimeout(catchUpEvents, 1000);

/** За всеки мач на живо: убийства/смърти по каска → по дете. */
function trackLiveMatches() {
  for (const b of Object.values(db.birthdays)) {
    for (const m of b.arena?.matches || []) {
      if (m.status !== 'live') continue;
      m.track ||= {};
      for (const [kidId, num] of Object.entries(m.headsets || {})) {
        const hsId = m.headsetIds?.[kidId] || lobby.headsets.find(h => Number(h.number) === Number(num))?.id;
        const row = hsId && lobby.match?.board.find(p => p.id === hsId);
        if (!row) continue;   // каската е излязла от мрежата → пазим последната стойност
        m.result ||= {};
        const base = m.base?.[hsId];
        if (base) {   // снимка при старт → разлика (броячите в лобито са за цялата игра)
          if (!m.manual?.[kidId]) m.result[kidId] = { kills: Math.max(0, row.kills - base.kills), deaths: Math.max(0, row.deaths - base.deaths) };
          continue;
        }
        const t = m.track[kidId] ||= {};
        t.kills = core.trackKills(t.kills, row.kills);
        t.deaths = core.trackKills(t.deaths, row.deaths);
        m.result ||= {};
        if (!m.manual?.[kidId]) m.result[kidId] = { kills: core.trackedValue(t.kills), deaths: core.trackedValue(t.deaths) };
      }
      if (lobby.match) m.lobbyRounds = { red: lobby.match.redRounds || 0, blue: lobby.match.blueRounds || 0 };
      save();
    }
  }
}

// ─── Рожден ден ──────────────────────────────────────────────────────────────
function newBirthday({ childName, childrenCount, pkg, start, end, uid: calUid, source }) {
  const id = uid('b');
  const name = String(childName || 'Рожденика').trim();
  const kids = [{ id: uid('k'), name, seat: 1, birthdayKid: true, status: 'present' }];
  const n = Math.max(1, Math.min(20, Number(childrenCount) || 1));
  for (let i = 2; i <= n; i++) kids.push({ id: uid('k'), name: '', seat: i, status: 'present' });
  return {
    id, slug: `${core.slugify(name)}-${id.slice(-4)}`,
    publicId: newPublicId(name),
    title: `Рожденият ден на ${name}`,
    childName: name, pkg: pkg || null, start: start || new Date().toISOString(), end: end || null, date: core.localYmd(start || new Date().toISOString()),
    source, calendarUid: calUid || null, createdAt: new Date().toISOString(),
    kids,
    quiz: { questionIds: [], idx: -1, phase: 'idle', seconds: config.quizSeconds, answers: {} },
    arena: { teams: [], matches: [] },
    step: { scores: {} },
    screen: 'seats',
  };
}

function bdayView(b) {
  const qs = questions();
  const q = b.quiz;
  const current = q.idx >= 0 ? qs.find(x => x.id === q.questionIds[q.idx]) : null;
  const remainingMs = q.phase === 'question' ? Math.max(0, q.seconds * 1000 - (Date.now() - q.startedAt)) : 0;
  return {
    ...b,
    activeKids: activeKids(b).map(k => k.id),
    quizView: {
      idx: q.idx, total: q.questionIds.length, phase: q.phase, remainingMs, seconds: q.seconds,
      question: current ? { q: current.q, a: current.a, correct: q.phase === 'reveal' || q.phase === 'done' ? current.correct : null } : null,
      answered: Object.keys(q.answers[q.idx] || {}),
      answers: q.phase === 'reveal' || q.phase === 'done' ? (q.answers[q.idx] || {}) : null,
    },
    board: core.leaderboard({ ...b, kids: activeKids(b) }, qs),
    stepOrder: b.step?.order ? b.step.order.filter(id => activeKids(b).some(k => k.id === id)) : core.stepOrder({ ...b, kids: activeKids(b) }, qs),
    stepLocked: !!b.step?.order,
    maxHeadsets: config.maxHeadsets,
    scheduleView: scheduleView(b),
    lobbyControl: !!config.lobbyControl,
    namesToRestore: Object.keys(db.lobbyRestore || {}).length,
    publicOn: publicOn(), publish: publishState[b.id] || null,
  };
}
// Правило на Митко: дете, което е закъсняло или липсва, НЕ влиза в LabCoin игрите.
const KID_STATUS = ['present', 'late', 'absent'];
const activeKids = b => b.kids.filter(k => k.name && k.name.trim() && (k.status || 'present') === 'present');

// ─── График по части ─────────────────────────────────────────────────────────
// Шаблонът е в schedule.json (пълният график на рождените дни идва от Митко по-късно).
// Котва: началото на LabCoin частта = края на рождения ден − labcoinMinutes, или ръчно „Старт сега“.
function scheduleView(b) {
  const tpl = scheduleTemplate(b);
  const anchor = b.schedule?.anchor || defaultAnchor(b, tpl);
  let t = new Date(anchor).getTime();
  const now = Date.now();
  const parts = (tpl.parts || []).map(p => {
    const from = t, to = t + p.minutes * 60_000;
    t = to;
    return { key: p.key, label: p.label, minutes: p.minutes, labcoin: !!p.labcoin, from: new Date(from).toISOString(), to: new Date(to).toISOString(), fromHm: core.localHm(new Date(from).toISOString()), toHm: core.localHm(new Date(to).toISOString()), now: now >= from && now < to };
  });
  const total = parts.reduce((s, p) => s + p.minutes, 0);
  const real = b.start && b.end ? Math.round((new Date(isoWithZone(b.end)) - new Date(isoWithZone(b.start))) / 60_000) : null;
  const all = readJson(SCHEDULE_FILE, DEFAULT_SCHEDULE);
  return { anchor, packageLabel: tpl.packageLabel || null, packageKey: tpl.packageKey || null, assumed: !!tpl.assumed,
    packages: (all.packages || []).map(p => ({ key: p.match, label: p.label })),
    realMinutes: real, mismatch: real !== null && real !== total, manual: !!b.schedule?.anchor, fromEnd: !b.schedule?.anchor && !!b.end, totalMinutes: parts.reduce((s, p) => s + p.minutes, 0), parts, note: tpl.note || null };
}
/** Шаблонът за пакета: schedule.json → packages[] {match (regex по името на пакета), parts}; иначе общите parts. */
function scheduleTemplate(b) {
  const all = readJson(SCHEDULE_FILE, DEFAULT_SCHEDULE);
  const hit = (b.packageKey && (all.packages || []).find(p => p.match === b.packageKey))
    || (all.packages || []).find(p => { try { return new RegExp(p.match, 'i').test(b.pkg || ''); } catch { return false; } });
  return hit ? { ...all, parts: hit.parts, packageLabel: hit.label || hit.match, packageKey: hit.match, assumed: !!hit.assumed } : all;
}
function defaultAnchor(b, tpl) {
  const total = (tpl.parts || []).reduce((s, p) => s + p.minutes, 0);
  if (b.end) return new Date(new Date(isoWithZone(b.end)).getTime() - total * 60_000).toISOString();
  return b.createdAt;
}
// Часът от календара без зона е местно време (София) → правим го ISO с отместване.
function isoWithZone(s) {
  if (/Z$|[+-]\d\d:\d\d$/.test(s)) return s;
  const guess = new Date(s + 'Z');
  const off = new Date(guess.toLocaleString('en-US', { timeZone: 'Europe/Sofia' })).getTime() - new Date(guess.toLocaleString('en-US', { timeZone: 'UTC' })).getTime();
  return new Date(guess.getTime() - off).toISOString();
}

function autoReveal() {
  for (const b of Object.values(db.birthdays)) {
    const q = b.quiz;
    if (q.phase !== 'question') continue;
    const all = activeKids(b).every(k => q.answers[q.idx]?.[k.id]);
    if (all || Date.now() - q.startedAt >= q.seconds * 1000) { q.phase = 'reveal'; save(); }
  }
}
setInterval(autoReveal, 250);

// ─── Действия ────────────────────────────────────────────────────────────────
const actions = {
  'kids': (b, { kids }) => {
    if (!Array.isArray(kids)) throw new Error('kids трябва да е списък');
    const old = Object.fromEntries(b.kids.map(k => [k.id, k]));
    b.kids = kids.slice(0, 20).map((k, i) => ({
      id: k.id || uid('k'), name: String(k.name || '').trim().slice(0, 24), seat: i + 1, birthdayKid: !!k.birthdayKid,
      status: KID_STATUS.includes(k.status) ? k.status : (old[k.id]?.status || 'present'),
    }));
  },
  'kid/status': (b, { kidId, status }) => {
    if (!KID_STATUS.includes(status)) throw new Error('status: present | late | absent');
    const k = b.kids.find(x => x.id === kidId);
    if (!k) throw new Error('Няма такова дете');
    k.status = status;
  },
  // „Старт сега“: part = ключът на частта, която почва сега (напр. 'lc-intro' = LabCoin почва сега)
  'schedule/start': (b, { at, part }) => {
    const parts = scheduleTemplate(b).parts || [];
    const i = part ? parts.findIndex(p => p.key === part) : 0;
    if (i < 0) throw new Error('Няма такава част в графика');
    const before = parts.slice(0, i).reduce((s, p) => s + p.minutes, 0);
    const now = at ? new Date(at).getTime() : Date.now();
    b.schedule = { anchor: new Date(now - before * 60_000).toISOString() };
  },
  'pkg': (b, { key }) => { if (key) b.packageKey = String(key); else delete b.packageKey; },
  'schedule/auto': (b) => { delete b.schedule; },
  'screen': (b, { mode }) => { b.screen = String(mode); },

  'quiz/start': (b, { count }) => {
    const all = questions();
    const n = Math.min(all.length, Number(count) || config.quizQuestions);
    b.quiz = { questionIds: core.pickQuestions(all, n), idx: -1, phase: 'ready', seconds: config.quizSeconds, answers: {} };
    b.screen = 'quiz';
  },
  'quiz/next': (b) => {
    const q = b.quiz;
    if (!q.questionIds.length) throw new Error('Първо „Нов куиз“');
    if (q.phase === 'question') throw new Error('Въпросът още тече');
    if (q.idx + 1 >= q.questionIds.length) { q.phase = 'done'; b.screen = 'board'; return; }
    q.idx += 1; q.phase = 'question'; q.startedAt = Date.now(); q.answers[q.idx] = {};
    b.screen = 'quiz';
  },
  'quiz/reveal': (b) => { if (b.quiz.phase === 'question') b.quiz.phase = 'reveal'; },
  'quiz/press': (b, { seat, choice }) => {
    const q = b.quiz;
    if (q.phase !== 'question') return { ignored: 'няма въпрос' };
    const kid = activeKids(b).find(k => Number(k.seat) === Number(seat));
    if (!kid) return { ignored: 'няма дете на място ' + seat };
    q.answers[q.idx] ||= {};
    if (q.answers[q.idx][kid.id]) return { ignored: 'вече е отговорило' };
    const c = Number(choice);
    if (!(c >= 0 && c <= 3)) throw new Error('choice 0–3');
    q.answers[q.idx][kid.id] = { choice: c, ms: Date.now() - q.startedAt };
    return { ok: true, kid: kid.name };
  },

  'arena/teams': (b, { teamCount }) => {
    const kids = activeKids(b);
    if (kids.length < 2) throw new Error('Трябват поне 2 деца');
    if (b.arena.matches.some(m => m.status !== 'planned')) throw new Error('Има започнат мач — първо „Изчисти арената“');
    const n = Number(teamCount) || core.suggestTeamCount(kids.length);
    const teams = core.randomTeams(kids.map(k => k.id), Math.min(n, kids.length));
    b.arena = { teams, matches: core.planMatches(teams).map(m => ({ ...m, status: 'planned', headsets: {}, sides: {}, result: {} })) };
    b.arena.matches.forEach(m => fillMatchHeadsets(b, m));
    b.screen = 'teams';
  },
  'arena/reset': (b) => { b.arena = { teams: [], matches: [] }; },
  'arena/headset': (b, { matchId, kidId, number }) => {
    const m = findMatch(b, matchId);
    if (number === '' || number === null) delete m.headsets[kidId]; else m.headsets[kidId] = Number(number);
  },
  'arena/start': async (b, { matchId }) => {
    const m = findMatch(b, matchId);
    if (!m.a || !m.b) throw new Error('Финалът чака двата полуфинала');
    if (b.arena.matches.some(x => x.status === 'live' && x.id !== m.id)) throw new Error('Друг мач е на живо');
    const n = Object.values(m.headsets).filter(x => x).length;
    if (n > config.maxHeadsets) throw new Error(`С каска са ${n} деца, а каските са ${config.maxHeadsets}. Сложи „–“ на едно дете — то чака.`);
    const nums = Object.values(m.headsets);
    if (new Set(nums).size !== nums.length) throw new Error('Две деца са с една и съща каска');
    if (liveMatch() && liveMatch().m !== m) throw new Error('Друг мач (на друг рожден ден) е на живо');
    m.headsetIds = {}; m.base = {};
    if (config.lobbyControl) {
      const st = await lobbyState();
      const kidsWithHs = Object.entries(m.headsets).filter(([, n]) => n);
      for (const [kidId, num] of kidsWithHs) {
        const h = (st.headsets || []).find(x => Number(x.number) === Number(num));
        if (!h) throw new Error(`Каска №${num} не е в лобито`);
        if (!h.online) throw new Error(`Каска №${num} не е онлайн`);
        m.headsetIds[kidId] = h.id;
        // оригиналното име се пази само веднъж (първия мач), за да се върне накрая
        if (!(h.id in db.lobbyRestore)) db.lobbyRestore[h.id] = h.name;
        const row = (st.match?.board || []).find(r => r.id === h.id);
        m.base[h.id] = { kills: Number(row?.kills) || 0, deaths: Number(row?.deaths) || 0 };
      }
      save();
      const kidName = id => b.kids.find(k => k.id === id)?.name || '?';
      for (const [kidId, hsId] of Object.entries(m.headsetIds)) {
        await lobbyPost('/api/headset/rename', { headsetId: hsId, name: kidName(kidId).slice(0, 30) });
        await lobbyPost('/api/match/team', { headsetId: hsId, team: m.sides[kidId] === 'a' ? 1 : 2 });
      }
      const startCmd = { command: 'start' };
      if (config.arenaRoundsToWin) startCmd.roundsToWin = config.arenaRoundsToWin;
      await lobbyPost('/api/match', startCmd);
    }
    m.status = 'live'; m.track = {}; m.result = {}; m.manual = {}; m.events = []; m.startedAt = Date.now();
    b.screen = 'arena';
  },
  'arena/restore-names': async () => restoreLobbyNames(),
  'arena/kills': (b, { matchId, kidId, kills, deaths }) => {
    const m = findMatch(b, matchId);
    m.result ||= {}; m.manual ||= {};
    m.result[kidId] = { kills: Math.max(0, Number(kills) || 0), deaths: Math.max(0, Number(deaths) || 0) };
    m.manual[kidId] = true;   // ръчно → лобито не го презаписва
  },
  'arena/end': async (b, { matchId, winner }) => {
    const m = findMatch(b, matchId);
    const w = winner === 'a' ? m.a : winner === 'b' ? m.b : core.matchWinner(m, m.lobbyRounds);
    if (!w) throw new Error('Равно е. Натисни „Победа …“ за отбора, който печели (напр. след още един рунд).');
    // ръчен край → спираме мача в лобито (фазата „over“ идва и след всеки рунд, не само в края на мача)
    if (config.lobbyControl && m.status === 'live') {
      try { await lobbyPost('/api/match', { command: 'stop' }); } catch (e) { console.warn(e.message); }
    }
    finishMatch(b, m, w);
  },
  'arena/reopen': (b, { matchId }) => { const m = findMatch(b, matchId); m.status = 'live'; },

  // Редът „от последния“ се заключва при първия резултат (иначе децата се разместват по време на играта).
  'step/lock': (b) => { b.step.order = core.stepOrder({ ...b, kids: activeKids(b) }, questions()); },
  'step/unlock': (b) => { if (Object.values(b.step.scores).some(v => v !== '')) throw new Error('Вече има резултати — първо ги изтрий'); delete b.step.order; },
  'step/score': (b, { kidId, score }) => {
    if (!b.step.order) b.step.order = core.stepOrder({ ...b, kids: activeKids(b) }, questions());
    b.step.scores[kidId] = score === '' || score === null ? '' : Math.max(0, Number(score) || 0);
  },
};

function finishMatch(b, m, w) {
  for (const kidId of Object.keys(m.sides)) m.result[kidId] ||= { kills: 0, deaths: 0 };
  m.status = 'done'; m.endedAt = Date.now(); m.winner = w;
  // финалът: победителите от полуфиналите
  for (const f of b.arena.matches) {
    if (!f.from || f.status !== 'planned') continue;
    const [x, y] = f.from.map(id => findMatch(b, id));
    if (x.status === 'done' && y.status === 'done') { f.a = x.winner; f.b = y.winner; fillMatchHeadsets(b, f); }
  }
  b.screen = 'board';
  // всички мачове са изиграни → връщаме старите имена на каските
  if (config.lobbyControl && b.arena.matches.every(x => x.status === 'done')) restoreLobbyNames().catch(e => console.warn(e.message));
}

function findMatch(b, id) {
  const m = b.arena.matches.find(x => x.id === id);
  if (!m) throw new Error('Няма такъв мач');
  return m;
}

/** Отборите в мача и каските им: отбор А = червени (1…), отбор Б = сини. */
function fillMatchHeadsets(b, m) {
  m.sides = {}; m.headsets = {};
  if (!m.a || !m.b) return;
  const ta = b.arena.teams.find(t => t.id === m.a), tb = b.arena.teams.find(t => t.id === m.b);
  let n = 1;
  for (const k of ta.kidIds) { m.sides[k] = 'a'; if (n <= config.maxHeadsets) m.headsets[k] = n++; }
  for (const k of tb.kidIds) { m.sides[k] = 'b'; if (n <= config.maxHeadsets) m.headsets[k] = n++; }
}

// ─── HTTP ────────────────────────────────────────────────────────────────────
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.woff2': 'font/woff2' };

function send(res, code, body, type = 'application/json; charset=utf-8') {
  res.writeHead(code, { 'content-type': type, 'cache-control': 'no-store' });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}
async function readBody(req) {
  let s = '';
  for await (const c of req) { s += c; if (s.length > 1e6) throw new Error('твърде голямо'); }
  return s ? JSON.parse(s) : {};
}
function lanIp() {
  for (const list of Object.values(os.networkInterfaces())) for (const a of list || []) if (a.family === 'IPv4' && !a.internal) return a.address;
  return '127.0.0.1';
}
// Публичен адрес: трудно отгатваем (име + 12 случайни знака), за да не се изреждат чужди рождени дни.
function newPublicId(name) { return `${core.slugify(String(name).split(/\s+/)[0])}-${crypto.randomBytes(6).toString('hex')}`; }
const publicOn = () => !!(config.publicBaseUrl && config.publishKey);
const lbUrl = b => publicOn()
  ? `${config.publicBaseUrl.replace(/\/$/, '')}/lb/${b.publicId || (b.publicId = newPublicId(b.childName))}`
  : `http://${lanIp()}:${config.port}/lb/${b.slug}`;

// ─── Качване на лидерборда в интернет (отделен Cloudflare Worker, разрешено от Митко 12.11) ──
// Само никнеймите, първото име на рожденика и точките. Пише само това приложение, с ключ (publishKey).
const published = new Map();   // birthdayId → последно качения JSON
const publishState = {};       // birthdayId → { ok, at, error }
function publicPayload(b) {
  return {
    childName: String(b.childName || '').split(/\s+/)[0], date: b.date,
    rows: core.leaderboard({ ...b, kids: activeKids(b) }, questions()).map(r => ({ name: r.name, place: r.place, total: r.total, quiz: r.quiz?.points || 0, arena: r.arena?.points || 0, step: r.step?.points || 0, kills: r.kills })),
  };
}
async function publishChanged() {
  if (!publicOn()) return;
  for (const b of Object.values(db.birthdays)) {
    if (!activeKids(b).length) continue;
    const body = JSON.stringify(publicPayload(b));
    if (published.get(b.id) === body) continue;
    if (!b.publicId) { b.publicId = newPublicId(b.childName); save(); }
    try {
      const res = await fetch(`${config.publicBaseUrl.replace(/\/$/, '')}/api/lb/${b.publicId}`, {
        method: 'PUT', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + config.publishKey }, body, signal: AbortSignal.timeout(8000),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || 'HTTP ' + res.status);
      published.set(b.id, body);
      publishState[b.id] = { ok: true, at: new Date().toISOString() };
    } catch (e) {
      publishState[b.id] = { ok: false, at: new Date().toISOString(), error: e.message };
    }
  }
}
// при старт качваме само днешните (старите вече са горе)
for (const b of Object.values(db.birthdays)) if (b.date !== todayYmd()) published.set(b.id, JSON.stringify(publicPayload(b)));
let publishing = false;
setInterval(async () => { if (publishing) return; publishing = true; try { await publishChanged(); } finally { publishing = false; } }, 4000);

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const p = url.pathname;
  try {
    if (req.method === 'GET' && p === '/api/status') {
      return send(res, 200, { lobby: { ok: lobby.ok, error: lobby.error, headsets: lobby.headsets, phase: lobby.match?.phase ?? null }, lastEventId: db.lastEventId || null, namesToRestore: Object.keys(db.lobbyRestore).length, config: { lobbyControl: !!config.lobbyControl, maxHeadsets: config.maxHeadsets, hasIcal: !!config.icalUrl, lobbyUrl: config.lobbyUrl, quizSeconds: config.quizSeconds } });
    }
    if (req.method === 'POST' && p === '/api/arena/event') {
      return send(res, 200, applyArenaEvent(await readBody(req)));
    }
    if (req.method === 'POST' && p === '/api/lobby/restore-names') {
      return send(res, 200, await restoreLobbyNames());
    }
    if (req.method === 'GET' && p === '/api/today') {
      const ymd = url.searchParams.get('date') || todayYmd();
      const src = await birthdaySource(ymd, url.searchParams.has('refresh'));
      const ours = Object.values(db.birthdays).filter(b => b.date === ymd);
      return send(res, 200, {
        date: ymd, source: src.source, calendarError: src.error,
        calendar: src.list.map(e => ({ ...e, time: core.localHm(e.start), endTime: core.localHm(e.end), opened: ours.find(b => b.calendarUid === e.uid)?.id || null })),
        birthdays: ours.map(b => ({ id: b.id, title: b.title, time: core.localHm(b.start), kids: activeKids(b).length, source: b.source })),
      });
    }
    if (req.method === 'GET' && p === '/api/history') {
      return send(res, 200, Object.values(db.birthdays).sort((a, b) => b.start.localeCompare(a.start)).slice(0, 100)
        .map(b => { const top = core.leaderboard({ ...b, kids: activeKids(b) }, questions())[0]; return { id: b.id, slug: b.slug, title: b.title, date: b.date, kids: activeKids(b).length, winner: top && top.total ? top.name : null }; }));
    }
    if (req.method === 'POST' && p === '/api/birthdays') {
      const body = await readBody(req);
      if (body.calendarUid) {
        const existing = Object.values(db.birthdays).find(b => b.calendarUid === body.calendarUid);
        if (existing) return send(res, 200, { id: existing.id });
        const ev = (await birthdaySource(body.date || todayYmd())).list.find(e => e.uid === body.calendarUid);
        if (!ev) throw new Error('Няма такъв рожден ден в панела/календара');
        if (ev.cancelled) throw new Error('Този рожден ден е отменен');
        const b = newBirthday({ ...ev, source: ev.source });
        b.theme = ev.theme || null; b.animators = ev.animators || [];
        db.birthdays[b.id] = b; save();
        return send(res, 200, { id: b.id });
      }
      const b = newBirthday({ childName: body.childName, childrenCount: body.childrenCount, source: 'manual' });
      db.birthdays[b.id] = b; save();
      return send(res, 200, { id: b.id });
    }
    let m = p.match(/^\/api\/b\/([\w-]+)$/);
    if (req.method === 'GET' && m) {
      const b = db.birthdays[m[1]];
      if (!b) return send(res, 404, { error: 'Няма такъв рожден ден' });
      const url = lbUrl(b); save();
      return send(res, 200, { ...bdayView(b), lbUrl: url });
    }
    if (req.method === 'DELETE' && m) {
      if (!db.birthdays[m[1]]) return send(res, 404, { error: 'Няма такъв рожден ден' });
      delete db.birthdays[m[1]]; save();
      return send(res, 200, { ok: true });
    }
    m = p.match(/^\/api\/b\/([\w-]+)\/(.+)$/);
    if (req.method === 'POST' && m) {
      const b = db.birthdays[m[1]];
      if (!b) return send(res, 404, { error: 'Няма такъв рожден ден' });
      const fn = actions[m[2]];
      if (!fn) return send(res, 404, { error: 'Няма такова действие' });
      const out = (await fn(b, await readBody(req))) || { ok: true };
      save();
      return send(res, 200, out);
    }
    m = p.match(/^\/api\/lb\/([\w-]+)$/);
    if (req.method === 'GET' && m) {
      const b = Object.values(db.birthdays).find(x => x.slug === m[1]);
      if (!b) return send(res, 404, { error: 'Няма такъв рожден ден' });
      // Публичното: само име, места и точки. Нищо от Bookeo (телефон, родител) не излиза.
      return send(res, 200, { title: b.title, date: b.date, rows: core.leaderboard({ ...b, kids: activeKids(b) }, questions()).map(r => ({ name: r.name, place: r.place, total: r.total, quiz: r.quiz?.points || 0, arena: r.arena?.points || 0, step: r.step?.points || 0, kills: r.kills })) });
    }
    m = p.match(/^\/api\/qr\/([\w-]+)\.svg$/);
    if (req.method === 'GET' && m) {
      const b = Object.values(db.birthdays).find(x => x.slug === m[1]);
      if (!b) return send(res, 404, 'няма');
      return send(res, 200, await QRCode.toString(lbUrl(b), { type: 'svg', margin: 1 }), 'image/svg+xml');
    }

    // страници
    let file = null;
    if (p === '/' ) file = 'index.html';
    else if (/^\/screen\/[\w-]+$/.test(p)) file = 'screen.html';
    else if (/^\/lb\/[\w-]+$/.test(p)) file = 'lb.html';
    else if (/^\/(brand\/(fonts\/)?)?[\w.-]+$/.test(p)) file = p.slice(1);
    if (file) {
      const f = path.join(DIR, 'public', file);
      if (f.startsWith(path.join(DIR, 'public')) && fs.existsSync(f)) return send(res, 200, fs.readFileSync(f), MIME[path.extname(f)] || 'application/octet-stream');
    }
    send(res, 404, { error: 'няма' });
  } catch (e) {
    send(res, 400, { error: e.message });
  }
});

server.listen(config.port, () => {
  console.log(`LabCoin Арена: http://localhost:${config.port}  (в мрежата: http://${lanIp()}:${config.port})`);
  console.log(`Лоби: ${config.lobbyUrl} · календар: ${config.icalUrl ? 'да' : 'НЯМА (config.json → icalUrl)'}`);
});
