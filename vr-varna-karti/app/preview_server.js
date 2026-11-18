// Локален преглед на editor.html с каталога и иконките (Джак, 13.11.2026). Само четене, само 127.0.0.1.
const h = require('http'), f = require('fs');
const M = '/Users/kucarov/VR-Arena/team/maps';
const E = '/Users/kucarov/VR-Arena/desktop/MapEditor/editor.html';
h.createServer((q, r) => {
  const u = decodeURIComponent(q.url.split('?')[0]);
  let p = E;
  if (u.startsWith('/proba')) p = M + '/' + (u.slice(1).replace(/[^a-z0-9_]/g, '') || 'proba_katalog') + '.json';
  else if (u === '/katalog_obekti.json') p = M + '/katalog_obekti.json';
  else if (u.startsWith('/ikoni/') && !u.includes('..')) p = M + u;
  f.readFile(p, (e, d) => {
    if (e) { r.writeHead(404); return r.end(String(e)); }
    r.writeHead(200, { 'content-type': p.endsWith('json') ? 'application/json' : p.endsWith('png') ? 'image/png' : 'text/html; charset=utf-8' });
    r.end(d);
  });
}).listen(process.env.PORT || 5333, '127.0.0.1');
