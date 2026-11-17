// LabCoin Арена — публичен лидерборд (отделен Cloudflare Worker, НЕ сайтът и НЕ панелът на VR Varna).
// Посетителите само четат. Пише само приложението в залата с ключ (secret PUBLISH_KEY).
// На страницата: името на рожденика (само първо име), никнеймите и точките. Без фамилии, телефони, имейли.

const SLUG = /^[a-z0-9-]{8,60}$/;
const HEADERS = { 'x-robots-tag': 'noindex, nofollow', 'referrer-policy': 'no-referrer', 'x-content-type-options': 'nosniff' };

const clean = (s, n) => String(s ?? '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, n);
const int = v => Math.max(0, Math.min(100000, Math.round(Number(v) || 0)));

/** Пази само позволените полета — каквото и да прати приложението. */
function sanitize(body) {
  if (!body || typeof body !== 'object' || !Array.isArray(body.rows)) throw new Error('rows липсва');
  const firstName = clean(body.childName, 40).split(/\s+/)[0] || 'рожденика';
  return {
    title: `Рожденият ден на ${firstName}`,
    date: /^\d{4}-\d{2}-\d{2}$/.test(body.date) ? body.date : null,
    updatedAt: new Date().toISOString(),
    rows: body.rows.slice(0, 30).map(r => ({
      name: clean(r.name, 24) || '?', place: int(r.place), total: int(r.total),
      quiz: int(r.quiz), arena: int(r.arena), step: int(r.step), kills: int(r.kills),
    })),
  };
}

async function authorized(request, env) {
  const got = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!env.PUBLISH_KEY || !got) return false;
  const a = new TextEncoder().encode(got), b = new TextEncoder().encode(env.PUBLISH_KEY);
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...HEADERS } });

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const p = url.pathname;

    if (p === '/robots.txt') return new Response('User-agent: *\nDisallow: /\n', { headers: { 'content-type': 'text/plain' } });

    let m = p.match(/^\/api\/lb\/([^/]+)$/);
    if (m) {
      const slug = m[1];
      if (!SLUG.test(slug)) return json({ error: 'Няма такъв рожден ден' }, 404);
      if (request.method === 'GET') {
        const data = await env.LB.get('lb:' + slug, 'json');
        return data ? json(data) : json({ error: 'Няма такъв рожден ден' }, 404);
      }
      if (request.method === 'PUT') {
        if (!(await authorized(request, env))) return json({ error: 'Нямаш право' }, 401);
        let data;
        try { data = sanitize(await request.json()); } catch (e) { return json({ error: e.message }, 400); }
        await env.LB.put('lb:' + slug, JSON.stringify(data), { expirationTtl: 60 * 60 * 24 * 400 });   // пази се ~13 месеца
        return json({ ok: true });
      }
      if (request.method === 'DELETE') {
        if (!(await authorized(request, env))) return json({ error: 'Нямаш право' }, 401);
        await env.LB.delete('lb:' + slug);
        return json({ ok: true });
      }
      return json({ error: 'Само четене' }, 405);
    }

    m = p.match(/^\/lb\/([^/]+)$/);
    if (m && request.method === 'GET' && SLUG.test(m[1])) {
      return new Response(PAGE, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=60', ...HEADERS } });
    }

    if (p === '/') return new Response('LabCoin Арена · VR Varna\nСканирай QR кода от рождения ден.\n', { headers: { 'content-type': 'text/plain; charset=utf-8', ...HEADERS } });
    return new Response('Няма такава страница', { status: 404, headers: { 'content-type': 'text/plain; charset=utf-8', ...HEADERS } });
  },
};

const PAGE = `<!doctype html>
<html lang="bg">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Лидерборд — LabCoin Арена</title>
<link rel="icon" href="/brand/favicon.png">
<link rel="stylesheet" href="/style.css">
</head>
<body>
<div class="wrap" style="max-width:680px">
  <div class="island"><img class="logo" src="/brand/logo.png" alt=""><span class="mark"><span class="coin-pip"></span><span><span class="vr">VR&nbsp;</span><span class="city">VARNA</span></span></span><span class="chip">LabCoin Арена</span></div>
  <div id="app" class="card">Зарежда…</div>
  <p class="muted small">Точки по място във всяка игра: 1-во 10, 2-ро 8, 3-то 7 … Игрите са куиз, VR арена и Step Matrix.</p>
</div>
<script>
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
const medal = p => ({ 1:'🥇', 2:'🥈', 3:'🥉' })[p] || p;
async function load() {
  const r = await fetch('/api/lb/' + location.pathname.split('/').pop());
  const d = await r.json();
  const app = document.getElementById('app');
  if (!r.ok) { app.textContent = d.error || 'Грешка'; return; }
  document.title = d.title + ' — LabCoin Арена';
  app.innerHTML = '<h1>' + esc(d.title) + '</h1><div class="muted">' + esc(d.date || '') + '</div>' +
    '<table><tr><th>#</th><th>Име</th><th class="num">Куиз</th><th class="num">Арена</th><th class="num">Step</th><th class="num">Общо</th></tr>' +
    d.rows.map(r => '<tr class="place-' + r.place + '"><td>' + medal(r.place) + '</td><td>' + esc(r.name) + '</td><td class="num">' + r.quiz + '</td><td class="num">' + r.arena + '</td><td class="num">' + r.step + '</td><td class="num"><b>' + r.total + '</b></td></tr>').join('') +
    '</table>';
}
load(); setInterval(load, 15000);
</script>
</body>
</html>`;
