// The staff phone page: scan the player's code (QR or typed), the arena asks LabCoin, the player is tied to a headset.
// Everything the page shows comes from /api/labcoin/*; the LabCoin key is never here (it stays on the arena PC).

const $ = id => document.getElementById(id);
const el = (tag, props = {}, ...kids) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) { if (k === 'class') n.className = v; else if (k === 'text') n.textContent = v; else if (k.startsWith('on')) n.addEventListener(k.slice(2), v); else if (v !== false && v != null) n.setAttribute(k, v === true ? '' : v); }
  for (const k of kids.flat()) if (k != null) n.append(k.nodeType ? k : document.createTextNode(String(k)));
  return n;
};
const fmt = new Intl.NumberFormat('bg-BG');
const MOCK_CODES = ['HOTDOG', 'WOMAN1', 'KID001'];
const MOCK_ERRORS = ['BANNED', 'EXPIRE', 'USED01'];

let status = null, selected = sessionStorage.getItem('scan.headset') || 'auto', busy = false, stream = null, scanning = false;
let detector = null, jsQR = null;
const sigs = {};

async function api(path, body) {
  const r = await fetch(path, body === undefined ? { cache: 'no-store' } : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
  return j;
}

const stars = n => (n > 0 ? `${n} ${n === 1 ? 'звезда' : 'звезди'}` : '');      // LabCoin дава 0 на всички герои за сега: тогава нищо не се казва
const dmy = iso => { const [y, m, d] = String(iso).split('-'); return d && m && y ? `${d}.${m}.${y}` : iso; };
const perkText = p => (p.type === 'hex_multiplier' ? `HEX ×${p.value}` : String(p.type).replace(/_/g, ' '));
const once = (key, sig, draw) => { if (sigs[key] === sig) return; sigs[key] = sig; draw(); };

// ---------- the status bar and the lists ----------
function renderLink() {
  const pill = $('link');
  let tone = '', text;
  if (!status) { tone = 'bad'; text = 'Няма връзка с арената'; }
  else if (status.mode === 'mock') { tone = 'demo'; text = 'Демо режим (без LabCoin)'; }
  else if (status.mode === 'off') { tone = 'off'; text = 'LabCoin е изключен'; }
  else if (status.lastError && status.pending) { tone = 'bad'; text = `LabCoin: няма връзка, чакат ${status.pending}`; }
  else { text = status.pending ? `LabCoin: връзка, чакат ${status.pending}` : 'LabCoin: връзка'; }
  pill.dataset.tone = tone; $('linkText').textContent = text;
}

function renderChips() {
  const heads = status?.headsets || [];
  if (selected !== 'auto' && !heads.some(h => h.id === selected)) selected = 'auto';
  once('chips', JSON.stringify([selected, heads.map(h => [h.id, h.number, h.online, h.player?.username || h.name])]), () => {
    const box = $('chips');
    box.replaceChildren(
      el('button', { type: 'button', class: 'chip', role: 'radio', 'aria-checked': String(selected === 'auto'), 'data-online': '1', onclick: () => pick('auto') },
        el('span', { class: 'n', text: 'Авто' }), el('span', { class: 'w', text: 'първата свободна' })),
      ...heads.map(h => el('button', { type: 'button', class: 'chip', role: 'radio', 'aria-checked': String(selected === h.id), 'data-online': h.online ? '1' : '0', onclick: () => pick(h.id) },
        el('span', { class: 'n' }, el('i', { 'aria-hidden': 'true' }), `№ ${h.number}`),
        el('span', { class: 'w', text: h.player ? h.player.username : h.name }),
        h.online ? null : el('span', { class: 'off', text: 'няма връзка' }))),
    );
  });
}
function pick(id) { selected = id; sessionStorage.setItem('scan.headset', id); sigs.chips = null; renderChips(); }

function renderBound() {
  const heads = (status?.headsets || []).filter(h => h.player);
  once('bound', JSON.stringify(heads.map(h => [h.id, h.player.username, h.player.skin?.name])), () => {
    $('bound').replaceChildren(...heads.map(h => el('li', {},
      el('span', { class: 'num', text: String(h.number) }),
      el('div', {}, el('div', { class: 'nm', text: h.player.username }), el('div', { class: 'sub', text: h.player.skin ? [h.player.skin.name, stars(h.player.skin.stars)].filter(Boolean).join(', ') : 'без скин' })),
      releaseButton('Освободи', async () => { await api('/api/labcoin/release', { headsetId: h.id }); await refresh(); }))));
    $('boundEmpty').hidden = heads.length > 0;
    $('releaseAll').hidden = heads.length === 0;
  });
}
function releaseButton(label, run) {
  const b = el('button', { type: 'button', class: 'btn' , text: label });
  let timer = null;
  b.addEventListener('click', async () => {
    if (b.dataset.sure !== '1') { b.dataset.sure = '1'; b.textContent = 'Сигурен ли си?'; timer = setTimeout(() => { b.dataset.sure = ''; b.textContent = label; }, 3500); return; }
    clearTimeout(timer); b.disabled = true;
    try { await run(); } catch { /* the list refreshes on the next poll */ }
    b.disabled = false; b.dataset.sure = ''; b.textContent = label;
  });
  return b;
}

function renderHints() {
  const mockHint = $('mockHint');
  if (status?.mode === 'mock') {
    mockHint.hidden = false;
    once('mock', 'm', () => {
      mockHint.replaceChildren('Пробни кодове: ', el('span', { class: 'codes' }, [...MOCK_CODES, ...MOCK_ERRORS].map(c => el('button', { type: 'button', class: 'btn btn-quiet', text: c, onclick: () => submit(c) }))));
    });
  } else { mockHint.hidden = true; sigs.mock = null; }
  const foot = [];
  const last = status?.recent?.[0];
  if (last) foot.push(`Последно към LabCoin: ${last.username || 'играч'} ${last.hex > 0 ? `+${fmt.format(last.hex)} HEX` : last.capped ? 'таван за деня' : 'без HEX'}`);
  if (status?.failed) foot.push(`Отказани от LabCoin: ${status.failed}`);
  $('foot').textContent = foot.join(' · ');
}

async function refresh() {
  try { status = await api('/api/labcoin/status'); } catch { status = null; }
  renderLink(); renderChips(); renderBound(); renderHints();
}

// ---------- the answer card ----------
function showInfo(text) { $('result').replaceChildren(el('div', { class: 'card' }, el('h3', { text }))); }
function showErr(r) {
  $('result').replaceChildren(el('div', { class: 'card err', role: 'alert' }, el('h3', { text: 'Не стана' }), el('p', { class: 'hint', text: r.text || r.error || 'Нещо се обърка' })));
}
function showOk(r) {
  const p = r.player, s = p.skin;
  const facts = [
    el('li', {}, 'Каска ', el('b', { text: `№ ${r.headset.number}` }), r.headset.online ? '' : ' (още не е свързана, ще вземе профила щом се включи)'),
    s ? el('li', {}, 'Скин: ', el('b', { text: s.name }), stars(s.stars) ? `, ${stars(s.stars)}` : '') : el('li', { text: 'Скин: няма' }),
    p.hex != null ? el('li', {}, el('b', { text: `${fmt.format(p.hex)} HEX` })) : null,
    el('li', { text: p.labpass?.active ? `LabPass до ${p.labpass.until ? dmy(p.labpass.until) : 'неизвестно'}` : 'Без LabPass' }),
    ...(p.perks || []).map(k => el('li', {}, 'Предимство: ', el('b', { text: perkText(k) }))),
  ];
  $('result').replaceChildren(el('div', { class: 'card ok' },
    el('div', { class: 'who' },
      s?.img ? el('img', { class: 'skin', src: s.img, alt: s.name, width: 92, height: 92, onerror: ev => { ev.target.style.visibility = 'hidden'; } }) : el('div', { class: 'skin', 'aria-hidden': 'true' }),
      el('div', {}, el('p', { class: 'eyebrow', text: 'Здравей' }), el('h3', { text: p.username }))),
    el('ul', { class: 'facts' }, facts),
    r.replaced ? el('p', { class: 'note', text: `На тази каска беше ${r.replaced}. Вече не е вързан.` }) : null,
    el('button', { type: 'button', class: 'btn btn-main', text: 'Следващ играч', onclick: () => { $('result').replaceChildren(); $('code').value = ''; startCamera(); } })));
  $('result').querySelector('.btn-main')?.focus({ preventScroll: false });
}

async function submit(raw) {
  raw = String(raw || '').trim();
  if (busy || !raw) return;
  busy = true; $('go').disabled = true; $('cam').disabled = true;
  showInfo('Проверявам…');
  try {
    const r = await api('/api/labcoin/scan', selected === 'auto' ? { code: raw } : { code: raw, headsetId: selected });
    r.ok ? showOk(r) : showErr(r);
    navigator.vibrate?.(r.ok ? 80 : [60, 60, 60]);
    if (r.ok) $('code').value = '';
  } catch (e) { showErr({ text: `Няма връзка с арената (${e.message})` }); }
  busy = false; $('go').disabled = false; $('cam').disabled = false;
  await refresh();
}

// ---------- the camera ----------
function camHint(content) { const h = $('camHint'); h.hidden = !content; h.replaceChildren(...(content ? [].concat(content) : [])); }
async function prepareDecoder() {
  if (detector || jsQR) return true;
  if ('BarcodeDetector' in window) {
    try { if ((await BarcodeDetector.getSupportedFormats()).includes('qr_code')) { detector = new BarcodeDetector({ formats: ['qr_code'] }); return true; } } catch { /* fall through to jsQR */ }
  }
  try {
    await new Promise((ok, bad) => { const s = document.createElement('script'); s.src = 'vendor/jsQR.js'; s.onload = ok; s.onerror = bad; document.head.append(s); });
    jsQR = window.jsQR; return !!jsQR;
  } catch { return false; }
}
async function startCamera() {
  camHint(null);
  if (!navigator.mediaDevices?.getUserMedia || !window.isSecureContext) {
    const https = status?.secure && location.protocol === 'http:' ? `https://${location.hostname}:${status.tlsPort}/scan/` : null;
    camHint(https
      ? ['Камерата работи само по защитена връзка. Отвори ', el('a', { href: https, text: https }), ' и приеми сертификата (веднъж). Дотогава въведи кода на ръка.']
      : 'Камерата не е достъпна на този адрес. Въведи кода на ръка.');
    return;
  }
  if (!(await prepareDecoder())) { camHint('Не може да се зареди четецът на QR кодове. Въведи кода на ръка.'); return; }
  try { stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } }, audio: false }); }
  catch (e) { camHint(e.name === 'NotAllowedError' ? 'Камерата е забранена. Разреши я в настройките на браузъра или въведи кода на ръка.' : `Камерата не се включи (${e.message}). Въведи кода на ръка.`); return; }
  const v = $('video'); v.srcObject = stream; await v.play().catch(() => {});
  $('camBox').hidden = false; $('cam').hidden = true; scanning = true; loop();
}
function stopCamera() {
  scanning = false;
  stream?.getTracks().forEach(t => t.stop()); stream = null;
  $('video').srcObject = null; $('camBox').hidden = true; $('cam').hidden = false;
}
async function loop() {
  const v = $('video'), canvas = document.createElement('canvas'), ctx = canvas.getContext('2d', { willReadFrequently: true });
  while (scanning) {
    await new Promise(r => setTimeout(r, 150));
    if (!scanning || v.readyState < 2 || !v.videoWidth) continue;
    let text = null;
    try {
      if (detector) text = (await detector.detect(v))[0]?.rawValue || null;
      else {
        const w = Math.min(640, v.videoWidth), h = Math.round(v.videoHeight * w / v.videoWidth);
        canvas.width = w; canvas.height = h; ctx.drawImage(v, 0, 0, w, h);
        const d = ctx.getImageData(0, 0, w, h);
        text = jsQR(d.data, w, h, { inversionAttempts: 'dontInvert' })?.data || null;
      }
    } catch { /* a bad frame: the next one */ }
    if (text) { stopCamera(); await submit(text); }
  }
}

$('cam').addEventListener('click', startCamera);
$('camStop').addEventListener('click', stopCamera);
$('manual').addEventListener('submit', e => { e.preventDefault(); submit($('code').value); });
$('releaseAll').replaceWith((() => {
  const b = releaseButton('Освободи всички', async () => { await api('/api/labcoin/release-all', {}); await refresh(); });
  b.id = 'releaseAll'; b.classList.add('btn-quiet'); b.hidden = true; return b;
})());
document.addEventListener('visibilitychange', () => { if (document.hidden) stopCamera(); else refresh(); });
await refresh();
setInterval(() => { if (!document.hidden) refresh(); }, 3000);
