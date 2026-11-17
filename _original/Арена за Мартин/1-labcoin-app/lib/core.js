// LabCoin Арена — чиста логика (без файлове и мрежа), за да се тества лесно.

// ─── Google календар (Bookeo → iCal) ─────────────────────────────────────────
// Същото разчитане като в панела VR Varna (worker/index.ts: parseICalFeed / parseBookingDescription).

function parseICalDate(val) {
  const dateStr = val.includes(':') ? val.split(':').slice(1).join(':') : val;
  if (/^\d{8}$/.test(dateStr)) return `${dateStr.slice(0, 4)}-${dateStr.slice(4, 6)}-${dateStr.slice(6, 8)}T00:00:00.000Z`;
  const m = dateStr.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/);
  if (!m) return null;
  const [, y, mo, d, h, mi, s, z] = m;
  // Без Z = местно време на календара (София). Пазим го без зона и го показваме както е.
  return z ? `${y}-${mo}-${d}T${h}:${mi}:${s}.000Z` : `${y}-${mo}-${d}T${h}:${mi}:${s}`;
}

const unescapeIcal = s => s.replace(/\\n/g, '\n').replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\\\/g, '\\');

export function parseICalFeed(icsText) {
  const lines = String(icsText || '').replace(/\r\n[ \t]/g, '').replace(/\n[ \t]/g, '').split(/\r?\n/);
  const events = [];
  let cur = null;
  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') { cur = {}; continue; }
    if (line === 'END:VEVENT') {
      if (cur && cur.uid && cur.dtStart) events.push({ uid: cur.uid, summary: cur.summary || '', description: cur.description || '', dtStart: cur.dtStart, dtEnd: cur.dtEnd || cur.dtStart });
      cur = null; continue;
    }
    if (!cur) continue;
    const i = line.indexOf(':');
    if (i < 0) continue;
    const key = line.slice(0, i).toUpperCase();
    const val = unescapeIcal(line.slice(i + 1));
    if (key === 'UID') cur.uid = val;
    else if (key === 'SUMMARY') cur.summary = val;
    else if (key === 'DESCRIPTION') cur.description = val;
    else if (key.startsWith('DTSTART')) cur.dtStart = parseICalDate(line.slice(i + 1));
    else if (key.startsWith('DTEND')) cur.dtEnd = parseICalDate(line.slice(i + 1));
  }
  return events;
}

/** Само това, което трябва на играта: рожденик, брой деца, пакет. Телефон и имейл НЕ се пазят. */
export function parseBooking(desc) {
  const lines = String(desc || '').split('\n').map(l => l.trim()).filter(Boolean);
  const serviceLine = lines.find(l => /^Service:/i.test(l));
  const pkg = serviceLine ? serviceLine.replace(/^Service:\s*/i, '').trim() : null;
  const peopleLine = lines.find(l => /\d+\s+people\b/i.test(l));
  const childrenCount = peopleLine ? parseInt(peopleLine.match(/\d+/)[0], 10) : null;
  const isBool = l => /^(yes|no|true|false)$/i.test(l);
  let childName = null;
  for (let i = 0; i < lines.length - 1; i++) {
    if (isBool(lines[i]) && isBool(lines[i + 1])) {
      for (let j = i + 2; j < lines.length; j++) if (!isBool(lines[j])) { childName = lines[j]; break; }
      break;
    }
  }
  return { pkg, childrenCount, childName };
}

/** Събитията за даден ден (YYYY-MM-DD, по местния час на календара). */
export function birthdaysForDate(events, ymd) {
  return events
    .filter(e => localYmd(e.dtStart) === ymd)
    .map(e => {
      const b = parseBooking(e.description);
      return {
        uid: e.uid,
        childName: b.childName || e.summary || 'Рожден ден',
        childrenCount: b.childrenCount,
        pkg: b.pkg,
        start: e.dtStart,
        end: e.dtEnd,
      };
    })
    .sort((a, b) => String(a.start).localeCompare(String(b.start)));
}

export function localYmd(iso) {
  if (!iso) return null;
  if (!/Z$/.test(iso)) return iso.slice(0, 10);   // вече е местно време
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Sofia' }).format(new Date(iso));
}

export function localHm(iso) {
  if (!iso) return '';
  if (!/Z$/.test(iso)) return iso.slice(11, 16);
  return new Intl.DateTimeFormat('bg-BG', { timeZone: 'Europe/Sofia', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
}

// ─── Точки ───────────────────────────────────────────────────────────────────

/** Точки по място: 1-во 10, 2-ро 8, 3-то 7 … 9-то 1, после по 1. */
export const PLACE_POINTS = [10, 8, 7, 6, 5, 4, 3, 2, 1];
export const placeToPoints = place => PLACE_POINTS[place - 1] ?? 1;

/**
 * Класира децата по резултат (по-голямото е по-добро). Равните са на едно място.
 * scores: { kidId: number }; деца без резултат не се класират и взимат 0 т.
 * Връща { kidId: { place, points, score } }.
 */
export function rankByScore(scores) {
  const entries = Object.entries(scores).filter(([, s]) => typeof s === 'number' && Number.isFinite(s));
  entries.sort((a, b) => b[1] - a[1]);
  const out = {};
  let place = 0, prev = null;
  entries.forEach(([id, s], i) => {
    if (s !== prev) { place = i + 1; prev = s; }
    out[id] = { place, points: placeToPoints(place), score: s };
  });
  return out;
}

// ─── Куиз ────────────────────────────────────────────────────────────────────

/** Подбира n въпроса: ~40% лесни, ~40% средни, ~20% трудни, подредени от лесни към трудни.
 *  Ако на някое ниво няма достатъчно, допълва от другите. Въпрос без level = средно ниво. */
export function pickQuestions(all, n, rng = Math.random) {
  const by = l => shuffle(all.filter(q => (q.level || 2) === l), rng);
  const pools = { 1: by(1), 2: by(2), 3: by(3) };
  n = Math.min(n, all.length);
  const want = { 1: Math.round(n * 0.4), 3: Math.round(n * 0.2) };
  want[2] = n - want[1] - want[3];
  const out = [];
  for (const l of [1, 2, 3]) out.push(...pools[l].splice(0, want[l]));
  for (const l of [2, 1, 3]) while (out.length < n && pools[l].length) out.push(pools[l].shift());
  return out.sort((a, b) => (a.level || 2) - (b.level || 2)).map(q => q.id);
}

export const QUIZ_CORRECT = 100;
export const QUIZ_SPEED_MAX = 50;

/** Точки за един отговор: 100 за верен + до 50 за бързина. Грешен = 0. */
export function quizAnswerPoints(correct, ms, limitMs) {
  if (!correct) return 0;
  const left = Math.max(0, Math.min(1, 1 - ms / limitMs));
  return QUIZ_CORRECT + Math.round(QUIZ_SPEED_MAX * left);
}

/** Резултат от куиза за всяко дете (само ако куизът е започнал). */
export function quizScores(bday, questions) {
  const q = bday.quiz;
  if (!q || q.idx < 0) return {};
  const scores = {};
  for (const kid of bday.kids) scores[kid.id] = 0;
  const limitMs = (q.seconds || 15) * 1000;
  q.questionIds.forEach((qid, i) => {
    if (i > q.idx || (i === q.idx && q.phase === 'question')) return;   // броим само разкритите
    const question = questions.find(x => x.id === qid);
    const answers = q.answers[i] || {};
    for (const [kidId, a] of Object.entries(answers)) {
      if (!(kidId in scores) || !question) continue;
      scores[kidId] += quizAnswerPoints(a.choice === question.correct, a.ms, limitMs);
    }
  });
  return scores;
}

// ─── Арена ───────────────────────────────────────────────────────────────────

export const TEAM_COLORS = [
  { name: 'Червени', color: '#ff1a3c' },
  { name: 'Сини', color: '#19e3ff' },
  { name: 'Зелени', color: '#27f08a' },
  { name: 'Жълти', color: '#ffd23f' },
  { name: 'Лилави', color: '#8a4dff' },
  { name: 'Оранжеви', color: '#ff8a1f' },
];

/** Разбърква масив (Fisher–Yates). rng() → [0,1). */
export function shuffle(arr, rng = Math.random) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Колко отбора: 4 (желанието на Митко), при малко деца 2. Ако двата отбора в мач са повече от каските,
 *  аниматорът слага „–“ на едно дете и то чака (виж сървъра). */
export function suggestTeamCount(kidCount) {
  return kidCount >= 4 ? 4 : 2;
}

/** Случайни отбори с почти равни размери (разлика ≤ 1). */
export function randomTeams(kidIds, teamCount, rng = Math.random) {
  const mixed = shuffle(kidIds, rng);
  const teams = Array.from({ length: teamCount }, (_, i) => ({ id: `t${i + 1}`, ...TEAM_COLORS[i % TEAM_COLORS.length], kidIds: [] }));
  mixed.forEach((id, i) => teams[i % teamCount].kidIds.push(id));
  return teams;
}

/** Мини турнир: при 4 отбора 2 полуфинала + финал (финалът се попълва после); иначе всеки срещу всеки. */
export function planMatches(teams) {
  const ids = teams.map(t => t.id);
  if (ids.length === 4) {
    return [
      // randomTeams пълни първо първите отбори → голям срещу малък (3+2 при 10 деца)
      { id: 'm1', label: 'Полуфинал 1', a: ids[0], b: ids[3] },
      { id: 'm2', label: 'Полуфинал 2', a: ids[1], b: ids[2] },
      { id: 'm3', label: 'Финал', a: null, b: null, from: ['m1', 'm2'] },
    ];
  }
  const out = [];
  let n = 1;
  for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) out.push({ id: `m${n}`, label: `Мач ${n++}`, a: ids[i], b: ids[j] });
  return out;
}

export const ARENA_WIN_BONUS = 3;

/** Резултат от арената: убийствата + 3 за всеки спечелен мач на отбора. */
export function arenaScores(bday) {
  const ar = bday.arena;
  if (!ar || !ar.matches?.some(m => m.status === 'done')) return {};
  const scores = {};
  const teamOf = {};
  for (const t of ar.teams) for (const k of t.kidIds) teamOf[k] = t.id;
  for (const k of Object.keys(teamOf)) scores[k] = 0;
  for (const m of ar.matches) {
    if (m.status !== 'done') continue;
    for (const [kidId, r] of Object.entries(m.result || {})) {
      if (!(kidId in scores)) continue;
      scores[kidId] += Number(r.kills) || 0;
      if (m.winner && teamOf[kidId] === m.winner) scores[kidId] += ARENA_WIN_BONUS;
    }
  }
  return scores;
}

/** Общо убийства (за равенство в общото класиране). */
export function arenaKills(bday) {
  const out = {};
  for (const m of bday.arena?.matches || []) {
    if (m.status !== 'done') continue;
    for (const [k, r] of Object.entries(m.result || {})) out[k] = (out[k] || 0) + (Number(r.kills) || 0);
  }
  return out;
}

/** Сумира убийствата сам — лобито може да нулира броячите между рундовете. */
export function trackKills(track, current) {
  // track: { last, carry }; current: число от лобито
  const t = track || { base: null, last: 0, carry: 0 };
  const cur = Number(current) || 0;
  if (t.base === null) { t.base = cur; t.last = cur; return t; }   // първото четене = нула (стар мач)
  if (cur < t.last) { t.carry += t.last - t.base; t.base = 0; }    // брояч нулиран → пазим натрупаното
  t.last = cur;
  return t;
}
export const trackedValue = t => (t ? t.carry + (t.last - (t.base ?? 0)) : 0);

/** Победител в мача: по рундове от лобито (ако ги има), иначе по сбор убийства. */
export function matchWinner(match, lobbyRounds) {
  if (lobbyRounds && (lobbyRounds.red || lobbyRounds.blue) && lobbyRounds.red !== lobbyRounds.blue) {
    return lobbyRounds.red > lobbyRounds.blue ? match.a : match.b;
  }
  let a = 0, b = 0;
  for (const [kidId, r] of Object.entries(match.result || {})) {
    if (match.sides?.[kidId] === 'a') a += Number(r.kills) || 0;
    else if (match.sides?.[kidId] === 'b') b += Number(r.kills) || 0;
  }
  if (a === b) return null;
  return a > b ? match.a : match.b;
}

// ─── Step Matrix ─────────────────────────────────────────────────────────────

export function stepScores(bday) {
  const out = {};
  for (const [k, v] of Object.entries(bday.step?.scores || {})) if (v !== '' && v !== null && Number.isFinite(Number(v))) out[k] = Number(v);
  return out;
}

// ─── Общо класиране ──────────────────────────────────────────────────────────

export function leaderboard(bday, questions) {
  const quiz = rankByScore(quizScores(bday, questions));
  const arena = rankByScore(arenaScores(bday));
  const step = rankByScore(stepScores(bday));
  const kills = arenaKills(bday);
  const qs = quizScores(bday, questions);
  const rows = bday.kids.map(k => {
    const qp = quiz[k.id]?.points || 0, ap = arena[k.id]?.points || 0, sp = step[k.id]?.points || 0;
    return {
      id: k.id, name: k.name, seat: k.seat,
      quiz: quiz[k.id] || null, arena: arena[k.id] || null, step: step[k.id] || null,
      kills: kills[k.id] || 0, quizScore: qs[k.id] || 0,
      total: qp + ap + sp,
    };
  });
  rows.sort((a, b) => b.total - a.total || b.kills - a.kills || b.quizScore - a.quizScore || a.name.localeCompare(b.name, 'bg'));
  let place = 0;
  rows.forEach((r, i) => {
    const p = rows[i - 1];
    if (!p || p.total !== r.total || p.kills !== r.kills || p.quizScore !== r.quizScore) place = i + 1;
    r.place = place;
  });
  return rows;
}

/** Редът за Step Matrix: първо е последният в класирането досега. */
export function stepOrder(bday, questions) {
  return leaderboard(bday, questions).slice().reverse().map(r => r.id);
}

export function slugify(s) {
  const map = { а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sht', ъ: 'a', ь: 'y', ю: 'yu', я: 'ya' };
  return String(s || '').toLowerCase().split('').map(c => map[c] ?? c).join('').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30) || 'rd';
}
