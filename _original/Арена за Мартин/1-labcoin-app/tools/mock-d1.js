// Имитация на Cloudflare D1 HTTP API (за проба без токен). Връща примерните редове на Делта за 14.11.2026.
// Токен „bad“ → отказ 403 (като при токен без права). Пускане: MOCK_D1_PORT=47812 node tools/mock-d1.js
import http from 'node:http';
const rows = [
  { id: 'e1', start_time: '2026-11-14T08:00:00.000Z', end_time: '2026-11-14T10:00:00.000Z', duration_minutes: 120, child_name: 'Радослав', children_count: 14, package: 'VARNA / STANDART с хранене в Godzila 199€', theme: 'Зелен рожден ден', is_kpop: 0, cancelled: 0, animator1: 'Даниел', animator2: null },
  { id: 'e2', start_time: '2026-11-14T09:00:00.000Z', end_time: '2026-11-14T11:30:00.000Z', duration_minutes: 150, child_name: 'Александър', children_count: 10, package: 'VARNA / STANDART 199€  / 390лв', theme: 'Рожден ден', is_kpop: 0, cancelled: 0, animator1: 'Ачо', animator2: null },
  { id: 'e3', start_time: '2026-11-14T13:00:00.000Z', end_time: '2026-11-14T15:30:00.000Z', duration_minutes: 150, child_name: 'Отменко', children_count: 8, package: 'PERFECT', theme: null, is_kpop: 0, cancelled: 1, animator1: null, animator2: null },
];
http.createServer(async (req, res) => {
  let body = ''; for await (const c of req) body += c;
  const auth = req.headers.authorization || '';
  res.setHeader('content-type', 'application/json');
  if (auth === 'Bearer bad') { res.statusCode = 403; return res.end(JSON.stringify({ success: false, errors: [{ code: 10000, message: 'Authentication error' }] })); }
  const { sql, params } = JSON.parse(body || '{}');
  if (!/^SELECT /.test(sql) || /phone|parent_name|raw_description/.test(sql)) { res.statusCode = 400; return res.end(JSON.stringify({ success: false, errors: [{ message: 'неочаквана заявка' }] })); }
  const [from, to] = params;
  const out = rows.filter(r => r.start_time >= from && r.start_time < to);
  console.log('[mock-d1]', from, to, '→', out.length);
  res.end(JSON.stringify({ success: true, result: [{ results: out, success: true }] }));
}).listen(Number(process.env.MOCK_D1_PORT || 47812), () => console.log('[mock-d1] готов'));
