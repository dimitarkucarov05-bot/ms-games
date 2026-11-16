// MS Games scorecard page: /scorecard/?id=<sessionId|base>&look=digital|print[&print=1][&capture=1]
// Renders from GET /api/scorecard?id= (S2). The server captures it to PNG with headless Edge (capture=1);
// print=1 opens the browser print dialog once everything has loaded.

'use strict';

(async () => {
  const q = new URLSearchParams(location.search);
  const id = q.get('id') || '';
  const look = q.get('look') === 'print' ? 'print' : 'digital';
  const $ = i => document.getElementById(i);
  const card = $('card');
  card.dataset.look = look;
  const COLS = { score: 'Score', kills: 'Kills', deaths: 'Deaths', orders: 'Orders', tips: 'Tips', mistakes: 'Mistakes', boards: 'Boards' };
  const LEVEL = { easy: 'Easy', normal: 'Normal', hard: 'Hard', nightmare: 'Nightmare' };
  const PALETTE = ['oklch(0.7 0.16 28)', 'oklch(0.71 0.12 250)', 'oklch(0.75 0.14 152)', 'oklch(0.7 0.13 300)', 'oklch(0.77 0.14 62)', 'oklch(0.76 0.1 195)', 'oklch(0.73 0.14 350)', 'oklch(0.86 0.13 98)', 'oklch(0.7 0.03 250)', 'oklch(0.9 0.01 110)'];
  const num = v => (typeof v === 'number' ? String(Math.round(v)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ') : String(v ?? ''));
  const getJson = async url => { try { const r = await fetch(url, { cache: 'no-store' }); return r.ok ? await r.json() : null; } catch { return null; } };

  let d = await getJson(`/api/scorecard?id=${encodeURIComponent(id)}`);
  let c = d && (d.scorecard || d.card);
  if (!c && window.MSMock) {      // mock: an unknown id shows the newest card
    const list = await getJson('/api/scorecards');
    const first = list && list.scorecards && list.scorecards[0];
    if (first) { d = await getJson(`/api/scorecard?id=${encodeURIComponent(first.id)}`); c = d && d.scorecard; }
  }
  if (!c) {
    card.hidden = true;
    $('scMissing').hidden = false;
    $('scMissing').textContent = id ? 'This scorecard is not on this computer any more.' : 'No scorecard chosen.';
    document.body.dataset.ready = '1';
    return;
  }
  let venue = c.venue || null;
  if (!venue || !venue.name) { const s = await getJson('/api/settings'); venue = s && s.settings && s.settings.venue ? s.settings.venue : { name: 'MS Games' }; }

  const gameName = c.game || c.gameName || 'MS Games';
  const date = new Date(c.date || c.savedAt || Date.now());
  $('scGame').textContent = gameName;
  $('scDate').textContent = date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) + ', ' + date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  $('scCoverName').textContent = gameName;
  if (c.color) card.style.setProperty('--g', c.color);

  const team = c.team || 'Team';
  $('scTeam').textContent = team;
  $('scTeam').classList.toggle('long', team.length > 16);
  const meta = [];
  if (c.minutes) meta.push(`${c.minutes} min`);
  if (c.difficulty) meta.push(LEVEL[c.difficulty] || c.difficulty);
  if (c.kids) meta.push('kids mode');
  if (c.won === true) meta.push('survived the night');
  $('scMeta').textContent = meta.join(' · ');
  $('scScore').textContent = num(c.score);
  const rank = Number(c.rank) || 0;
  $('scRankBox').hidden = !rank;
  $('scRank').textContent = rank ? `#${rank}` : '';
  $('scRankLabel').textContent = c.difficulty ? `Rank on ${LEVEL[c.difficulty] || c.difficulty}` : 'Rank';
  $('scRankBox').classList.toggle('first', rank === 1);
  $('scRecord').hidden = !c.newRecord;

  const cols = (c.columns || ['score', 'kills', 'deaths']).slice(0, 3);
  $('scHead').innerHTML = `<th>№</th><th>Player</th>${cols.map(k => `<th>${COLS[k] || k}</th>`).join('')}`;
  const players = [...(c.players || [])].sort((a, b) => (Number(b.score) || 0) - (Number(a.score) || 0)).slice(0, 10);
  const body = $('scRows');
  for (const p of players) {
    const tr = document.createElement('tr');
    const n = Number(p.n) || players.indexOf(p) + 1;
    const val = k => (k in p ? p[k] : p.extra && k in p.extra ? p.extra[k] : '');
    tr.innerHTML = `<td class="n"><span class="sq"></span></td><td class="name"></td>${cols.map(() => '<td class="v"></td>').join('')}`;
    tr.querySelector('.sq').textContent = n;
    tr.querySelector('.sq').style.setProperty('--hc', p.color || PALETTE[(n - 1) % PALETTE.length]);
    tr.querySelector('.name').textContent = p.name || '';
    tr.querySelectorAll('.v').forEach((td, i) => { td.textContent = num(val(cols[i])); });
    body.append(tr);
  }
  document.querySelector('.sc-players').classList.toggle('dense', players.length > 6);

  const vEl = $('scVenue');
  vEl.textContent = venue.name || 'MS Games';
  const waits = [document.fonts ? document.fonts.ready : Promise.resolve()];
  if (venue.logo) waits.push(new Promise(res => { const img = new Image(); img.alt = venue.name || ''; img.onload = () => { vEl.textContent = ''; vEl.append(img); res(); }; img.onerror = res; img.src = venue.logo; }));
  const cover = c.cover || (c.gameId ? `/play/games/${encodeURIComponent(c.gameId)}/cover.jpg` : '');
  if (cover && look === 'digital') waits.push(new Promise(res => { const img = new Image(); img.alt = ''; img.onload = () => { $('scCover').prepend(img); $('scCover').classList.add('has-img'); res(); }; img.onerror = res; img.src = cover; }));
  await Promise.all(waits);
  card.removeAttribute('aria-busy');
  document.title = `${team} · ${gameName} · Scorecard`;
  document.body.dataset.ready = '1';      // headless capture can wait for this
  if (q.get('print') === '1') setTimeout(() => window.print(), 150);
})();
