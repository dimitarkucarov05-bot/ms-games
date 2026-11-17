import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as c from '../lib/core.js';

test('точки по място, равните делят мястото', () => {
  const r = c.rankByScore({ a: 300, b: 300, c: 100, d: 0 });
  assert.equal(r.a.place, 1); assert.equal(r.b.place, 1); assert.equal(r.a.points, 10);
  assert.equal(r.c.place, 3); assert.equal(r.c.points, 7);
  assert.equal(r.d.place, 4);
});

test('куиз: верен 100 + бързина, грешен 0', () => {
  assert.equal(c.quizAnswerPoints(true, 0, 15000), 150);
  assert.equal(c.quizAnswerPoints(true, 15000, 15000), 100);
  assert.equal(c.quizAnswerPoints(false, 100, 15000), 0);
});

test('отбори: 10 деца в 4 отбора = 3-3-2-2, всички са вътре', () => {
  const ids = Array.from({ length: 10 }, (_, i) => 'k' + i);
  const t = c.randomTeams(ids, 4);
  assert.deepEqual(t.map(x => x.kidIds.length).sort(), [2, 2, 3, 3]);
  assert.equal(new Set(t.flatMap(x => x.kidIds)).size, 10);
});

test('брой отбори според каските', () => {
  assert.equal(c.suggestTeamCount(10), 4);
  assert.equal(c.suggestTeamCount(3), 2);
});

test('4 отбора → 2 полуфинала + финал', () => {
  const m = c.planMatches([{ id: 't1' }, { id: 't2' }, { id: 't3' }, { id: 't4' }]);
  assert.equal(m.length, 3); assert.deepEqual(m[2].from, ['m1', 'm2']);
  assert.deepEqual([m[0].a, m[0].b, m[1].a, m[1].b], ['t1', 't4', 't2', 't3']);   // голям срещу малък
});

test('броене на убийства: първото четене е нула, нулиране между рундовете не губи', () => {
  let t = c.trackKills(null, 7);           // стар мач: 7 → не се брои
  assert.equal(c.trackedValue(t), 0);
  t = c.trackKills(t, 9);                  // +2
  assert.equal(c.trackedValue(t), 2);
  t = c.trackKills(t, 0);                  // нов рунд: брояч 0
  t = c.trackKills(t, 3);                  // +3
  assert.equal(c.trackedValue(t), 5);
});

test('арена: убийства + 3 за победа', () => {
  const b = { arena: { teams: [{ id: 't1', kidIds: ['a'] }, { id: 't2', kidIds: ['b'] }], matches: [
    { status: 'done', a: 't1', b: 't2', winner: 't1', result: { a: { kills: 4 }, b: { kills: 5 } } }] } };
  assert.deepEqual(c.arenaScores(b), { a: 7, b: 5 });
});

test('общо класиране и ред за Step Matrix (последният първи)', () => {
  const qs = [{ id: 'q1', correct: 0 }];
  const b = {
    kids: [{ id: 'a', name: 'Ани' }, { id: 'b', name: 'Боби' }],
    quiz: { questionIds: ['q1'], idx: 0, phase: 'reveal', seconds: 15, answers: { 0: { a: { choice: 0, ms: 1000 }, b: { choice: 1, ms: 500 } } } },
    arena: { teams: [], matches: [] }, step: { scores: {} },
  };
  const lb = c.leaderboard(b, qs);
  assert.equal(lb[0].name, 'Ани'); assert.equal(lb[0].total, 10); assert.equal(lb[1].total, 8);
  assert.deepEqual(c.stepOrder(b, qs), ['b', 'a']);
});

test('календар: разчита Bookeo описанието', () => {
  const ics = ['BEGIN:VCALENDAR', 'BEGIN:VEVENT', 'UID:x1', 'SUMMARY:РД', 'DTSTART;TZID=Europe/Sofia:20261112T150000', 'DTEND;TZID=Europe/Sofia:20261112T173000',
    'DESCRIPTION:Мария Петрова\\n0888 (mobile)\\nService: STANDARD\\nMinecraft\\n10 people\\nyes\\nno\\nИвчо', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
  const [e] = c.birthdaysForDate(c.parseICalFeed(ics), '2026-11-12');
  assert.equal(e.childName, 'Ивчо'); assert.equal(e.childrenCount, 10); assert.equal(e.pkg, 'STANDARD');
  assert.equal(c.localHm(e.start), '15:00');
});

test('куиз: 12 въпроса = 5 лесни, 5 средни, 2 трудни, от лесни към трудни', () => {
  const all = [...Array(20)].map((_, i) => ({ id: 'e' + i, level: 1 })).concat([...Array(18)].map((_, i) => ({ id: 'm' + i, level: 2 })), [...Array(12)].map((_, i) => ({ id: 'h' + i, level: 3 })));
  const ids = c.pickQuestions(all, 12);
  assert.equal(ids.length, 12); assert.equal(new Set(ids).size, 12);
  const lv = ids.map(id => all.find(q => q.id === id).level);
  assert.deepEqual([lv.filter(l => l === 1).length, lv.filter(l => l === 2).length, lv.filter(l => l === 3).length], [5, 5, 2]);
  assert.deepEqual(lv, [...lv].sort());
});

test('въпросите: 40–60, всеки с 4 отговора и верен индекс, без повтарящи се id', async () => {
  const qs = JSON.parse((await import('node:fs')).readFileSync(new URL('../questions.json', import.meta.url), 'utf8'));
  assert.ok(qs.length >= 40 && qs.length <= 60);
  assert.equal(new Set(qs.map(q => q.id)).size, qs.length);
  for (const q of qs) { assert.equal(q.a.length, 4, q.id); assert.ok(q.correct >= 0 && q.correct <= 3, q.id); assert.ok([1, 2, 3].includes(q.level), q.id); }
});
