// MS Games 2 · setup wizard (console side of section 3): entry points First setup, Add headset,
// Reset play area, Re-calibrate points. Numbered steps on the left, the current step on the right.
// Calibration: the first headset touches marks A and B, then every other headset confirms them.

'use strict';

const WIZ = {
  first: ['venue', 'headsets', 'floor', 'area', 'points', 'done'],
  add: ['headsets', 'points', 'done'],
  area: ['area', 'done'],
  points: ['points', 'done'],
};
const WSTEP = {
  venue: ['Venue', 'Name, logo, units'],
  headsets: ['Headsets', 'Install over USB'],
  floor: ['Prepare the floor', 'Checklist'],
  area: ['Play area', 'Size or boundary'],
  points: ['Calibration points', 'Marks A and B'],
  done: ['Done', 'Summary'],
};
const FLOOR = [
  ['clear', 'The floor is clear', 'Nothing to trip over inside the play area.'],
  ['light', 'Even light', 'No direct sun, no dark corners. The headsets track by camera.'],
  ['mirror', 'No mirrors or big windows', 'Cover them: reflections confuse tracking.'],
  ['marks', 'Two floor marks, 2 m apart or more', 'Tape crosses. Mark A at the front-left corner, mark B along the left edge towards the back.'],
  ['router', 'Router close by, on 5 GHz', 'One network name, only for the arena.'],
];
const SIZES = ['4x4', '5x5', '6x6', '6x8', '8x8', '8x10', '10x10'];
const W = { kind: null, step: null, ticks: new Set(), areaKind: 'preset', size: '6x6', rotation: 0, entrance: 'middle', drawId: null, firstId: null, started: false, synced: false, usbSet: {} };
App.wiz = W;

const ENTRY = { first: 'first', add: 'addHeadset', area: 'resetArea', points: 'recalibrate' };
App.startSetup = function (kind) {
  Object.assign(W, { kind, step: WIZ[kind][0], ticks: new Set(), started: false, synced: false, firstId: null, drawId: null });
  api('/api/setup', { entry: ENTRY[kind], step: W.step, ...(kind === 'points' ? { reset: 'points' } : {}) }, { quiet: true });
  const a = state && state.setup && state.setup.area;
  if (a && a.kind === 'preset' && a.w) { W.size = `${a.w}x${a.d}`; W.rotation = a.rotation || 0; W.entrance = a.entrance || 'middle'; }
  go('setup');
};
App.onGo.setup = () => {};

const hsList = () => [...(state.headsets || [])].sort(byNumber);
const ptsOf = id => (state.setup && state.setup.points && state.setup.points[id]) || null;

function wizCan() {
  const s = W.step;
  if (s === 'venue') return venueOf(state.settings).name.trim() ? '' : 'Type the venue name.';
  if (s === 'headsets') return (state.headsets || []).length ? '' : 'Install a headset, or press Skip.';
  if (s === 'floor') return W.ticks.size === FLOOR.length ? '' : `Tick all ${FLOOR.length}, or press Skip.`;
  if (s === 'area') {
    if (W.areaKind === 'draw') { const a = state.setup && state.setup.area, zn = state.zone; return (a && a.kind === 'draw' && a.state === 'done') || (a && a.kind === 'draw' && zn && zn.poly && zn.poly.length > 2) ? '' : 'Draw the boundary in the headset first.'; }
    return '';
  }
  if (s === 'points') return W.firstId && ptsOf(W.firstId) === 'done' ? '' : 'The first headset has to touch marks A and B.';
  return '';
}

function renderSetup() {
  const inWiz = !!W.kind;
  show($('setupEntry'), !inWiz);
  show($('setupWiz'), inWiz);
  if (!inWiz) {
    const hs = state.headsets || [], cal = hs.filter(h => !h.desk && hsAligned(h)).length, area = areaNow();
    text($('setupNow'), `Now: ${area ? `play area ${App.fmtArea(area)}` : 'no play area'}, ${cal} of ${hs.length} headsets calibrated.`);
    return;
  }
  const steps = WIZ[W.kind], ci = steps.indexOf(W.step);
  syncList($('wizSteps'), steps, s => s, () => make('<li><button type="button"><b data-f="n"></b><span data-f="k"></span><small data-f="d"></small></button></li>'), (li, s) => {
    const p = parts(li), i = steps.indexOf(s);
    text(p.n, i + 1); text(p.k, WSTEP[s][0]); text(p.d, WSTEP[s][1]);
    attr(li, 'data-s', s === W.step ? 'now' : i < ci ? 'done' : 'todo');
    li.firstChild.disabled = i >= ci;
  });
  const pane = $('wizPane');
  if (pane.dataset.step !== W.step) { pane.dataset.step = W.step; pane.textContent = ''; pane.scrollTop = 0; buildPane(pane, W.step); }
  fillPane(pane, W.step);
  const why = wizCan();
  text($('wizWhy'), why);
  $('wizNext').disabled = !!why;
  text($('wizNext'), W.step === 'done' ? 'Finish' : W.step === 'area' && W.areaKind === 'preset' ? 'Use this area' : 'Next');
  show($('wizSkip'), W.step === 'headsets' || W.step === 'floor');
  text($('wizSkip'), W.step === 'headsets' ? 'Skip, my headsets are ready' : 'Skip');
  text($('wizBack'), ci === 0 ? 'Setup' : 'Back');
  show($('wizStop'), W.step !== 'done');
}
App.views.setup = renderSetup;

// ---------- panes ----------

const USB_ART = '<svg viewBox="0 0 76 46" aria-hidden="true"><rect x="2" y="9" width="30" height="20" rx="5"/><path d="M8 29v4a3 3 0 0 0 3 3h12a3 3 0 0 0 3-3v-4"/><path d="M32 19h12c6 0 6 8 12 8h8"/><rect x="64" y="23" width="10" height="8" rx="1.5"/></svg>';

function buildPane(pane, step) {
  if (step === 'venue') {
    pane.innerHTML = `<div class="pane-intro"><h2 class="pane-title">Venue</h2><p class="pane-sub">Shown on the status bar, on scorecards and on the waiting-room floor.</p></div>
      <div class="sets">${setRow('Venue name', '', '<input class="input input-lg" data-venue="venueName" type="text" maxlength="40" style="width:min(420px,60vw)" autocomplete="off">')}
      ${setRow('Logo', 'PNG or SVG, light on transparent works best', '<span class="logo-box" data-f="logo"></span><label class="btn btn-lg">Choose file<input type="file" accept="image/png,image/svg+xml,image/jpeg" data-logo hidden></label>')}
      ${setRow('Units', '', '<div class="seg seg-lg" data-venue-seg="units"><button type="button" data-v="m">Metres</button><button type="button" data-v="ft">Feet</button></div>')}</div>`;
  } else if (step === 'headsets') {
    pane.innerHTML = `<div class="pane-intro"><h2 class="pane-title">Headsets</h2><p class="pane-sub">Each headset gets the MS Games app, its number, colour and name, and joins the arena Wi-Fi by itself.</p></div>
      <div class="usb-art">${USB_ART}<span>Plug a headset into this computer with a USB data cable. Put it on and allow USB debugging when it asks.</span></div>
      <div class="usb-list" data-f="list"></div><p class="empty-note" data-f="none">No headset on USB yet.</p>`;
  } else if (step === 'floor') {
    pane.innerHTML = `<div class="pane-intro"><h2 class="pane-title">Prepare the floor</h2><p class="pane-sub">Tick each one when it is true.</p></div>
      <ul class="checklist">${FLOOR.map(([id, k, d]) => `<li><label><input type="checkbox" data-tick="${id}"><b>${esc(k)}</b><small>${esc(d)}</small></label></li>`).join('')}</ul>`;
  } else if (step === 'area') {
    pane.innerHTML = `<div class="pane-intro pane-intro-row"><div><h2 class="pane-title">Play area</h2><p class="pane-sub">A rectangle placed from the two marks, or a boundary drawn with the laser in one headset.</p></div>
      <div class="seg seg-lg" data-areakind><button type="button" data-v="preset">Preset rectangle</button><button type="button" data-v="draw">Draw in the headset</button></div></div>
      <div class="area"><div class="sets" data-f="ctl"></div><figure class="area-plan"><svg data-f="plan" viewBox="0 0 320 320"></svg><figcaption data-f="cap"></figcaption></figure></div>`;
  } else if (step === 'points') {
    pane.innerHTML = `<div class="pane-intro"><h2 class="pane-title">Calibration points</h2><p class="pane-sub">The first headset walks to mark A and touches the floor with the controller, then mark B. Then every other headset does the same, one by one. The headset shows what to do in bold white text.</p></div>
      <div class="points-head"><label class="field-col"><span>First headset</span><select class="select input-lg" data-first></select></label><button type="button" class="btn btn-lg btn-primary" data-pstart>Start with this headset</button><button type="button" class="btn btn-lg" data-psync>Sync to all headsets</button></div>
      <div class="prow-list" data-f="rows"></div><p class="hint" data-f="note"></p>`;
  } else {
    pane.innerHTML = `<div class="pane-intro"><h2 class="pane-title">Done</h2><p class="pane-sub">The calibration is saved and kept in the history; Advanced, Calibration can restore an older one. Each headset holds the two marks with persistent anchors, so it stays aligned after it is taken off and put on again.</p></div>
      <div class="done-sum"><div><b data-f="size"></b><span class="label">Play area</span></div><div><b data-f="cal"></b><span class="label">Headsets calibrated</span></div><div><b data-f="off"></b><span class="label">Still to do</span></div></div>`;
  }
  pane._p = null;
}

function fillPane(pane, step) {
  const p = parts(pane), s = state.settings || {};
  if (step === 'venue') {
    const inp = pane.querySelector('[data-venue="venueName"]');
    if (document.activeElement !== inp && inp.value !== venueOf(s).name) inp.value = venueOf(s).name;
    for (const b of pane.querySelectorAll('[data-venue-seg="units"] button')) b.classList.toggle('on', b.dataset.v === (s.units || 'm'));
    const logo = venueOf(s).logo || '';
    if (p.logo._l !== logo) { p.logo._l = logo; p.logo.innerHTML = logo ? `<img alt="Venue logo" src="${esc(logo)}">` : '<span class="ph">No logo</span>'; }
  } else if (step === 'headsets') {
    const usb = state.usb || [];
    show(p.none, !usb.length);
    syncList(p.list, usb, u => u.serial, () => make(`<div class="usb-row"><div class="usb-dev"><b data-f="m"></b><small data-f="ser"></small><span class="usb-state" data-f="st"></span></div>
      <div class="usb-set" data-f="set"><input class="input input-lg num" data-usb="number" type="number" min="1" max="20" aria-label="Number"><span class="colors" data-f="cols"></span><input class="input input-lg" data-usb="name" type="text" maxlength="16" placeholder="Name" aria-label="Name"><button type="button" class="btn btn-lg btn-primary" data-install>Install</button></div>
      <span class="bar" data-f="bar" hidden><i data-f="fill"></i></span></div>`), (el, u) => {
      const f = parts(el), st = usbState(u);
      text(f.m, u.model || 'Headset');
      text(f.ser, u.serial);
      attr(f.st, 'data-s', st.s);
      text(f.st, st.w);
      const cfg = W.usbSet[u.serial] || (W.usbSet[u.serial] = { number: nextNumber(), color: null, name: '' });
      show(f.set, st.s === 'ready' || st.s === 'failed');
      const ni = f.set.querySelector('[data-usb="number"]'), na = f.set.querySelector('[data-usb="name"]');
      if (document.activeElement !== ni && ni.value !== String(cfg.number)) ni.value = cfg.number;
      if (document.activeElement !== na) { na.value = cfg.name; na.placeholder = `Quest ${cfg.number}`; }
      const col = cfg.color || HS_COLORS[(cfg.number - 1) % HS_COLORS.length];
      const ch = HS_COLORS.map((c, i) => `<button type="button" data-col="${i}" style="--hc:${c}" class="${c === col ? 'on' : ''}" aria-label="Colour ${i + 1}"></button>`).join('');
      if (f.cols._h !== ch) { f.cols._h = ch; f.cols.innerHTML = ch; }
      text(f.set.querySelector('[data-install]'), st.s === 'failed' ? 'Try again' : 'Install');
      show(f.bar, st.s === 'installing');
      attr(f.bar, 'data-mode', u.progress == null ? 'indet' : 'pct');
      f.fill.style.width = u.progress == null ? '' : `${Math.round(u.progress * 100)}%`;
    });
  } else if (step === 'floor') {
    for (const c of pane.querySelectorAll('[data-tick]')) c.checked = W.ticks.has(c.dataset.tick);
  } else if (step === 'area') fillArea(pane, p);
  else if (step === 'points') fillPoints(pane, p);
  else if (step === 'done') {
    const hs = (state.headsets || []).filter(h => !h.desk);
    const cal = hs.filter(hsAligned).length;
    text(p.size, areaNow() ? App.fmtArea(areaNow()).replace(' m', '') : 'none');
    text(p.cal, `${cal}/${hs.length}`);
    text(p.off, String(hs.length - cal));
  }
}

function usbState(u) {
  switch (u.state) {
    case 'plug': case 'plugin': case 'none': return { s: 'plugin', w: u.text || 'Plug in' };
    case 'allow': case 'debug': case 'unauthorized': return { s: 'debug', w: u.text || 'Put the headset on and allow USB debugging' };
    case 'installing': return { s: 'installing', w: u.text || (u.step ? `Installing: ${u.step}` : 'Installing') };
    case 'done': return { s: 'done', w: u.text || 'Done. It joins the Wi-Fi by itself.' };
    case 'failed': return { s: 'failed', w: `Failed: ${u.error || u.text || 'unknown reason'}` };
    default: return { s: 'ready', w: u.text || 'Ready to install' };
  }
}
// the USB list is read by the server when asked: ask every 3 s while the Headsets step is open
setInterval(() => { if (section === 'setup' && W.kind && W.step === 'headsets' && !document.hidden) api('/api/usb', undefined, { quiet: true }).then(r => { if (r.ok && r.data.usb && state) { state.usb = r.data.usb; W.apk = r.data.apk; scheduleRender(); } }); }, 3000);
function nextNumber() {
  const used = new Set((state.headsets || []).map(h => h.number).concat(Object.values(W.usbSet).map(c => c.number)));
  for (let n = 1; n < 30; n++) if (!used.has(n)) return n;
  return 1;
}

function fillArea(pane, p) {
  for (const b of pane.querySelectorAll('[data-areakind] button')) b.classList.toggle('on', b.dataset.v === W.areaKind);
  const ctl = p.ctl;
  let html;
  if (W.areaKind === 'preset') {
    html = setRow('Size', 'Metres, width × depth', `<div class="sizes">${SIZES.map(s => `<button type="button" data-size="${s}" class="${s === W.size ? 'on' : ''}">${s.replace('x', '×')}</button>`).join('')}</div>`)
      + setRow('Rotation', 'Which way the area turns from the marks', seg([0, 90, 180, 270].map(r => ({ id: r, name: `${r}°` })), W.rotation, 'data-aseg="rotation"'))
      + setRow('Entrance', 'Where players walk in, along the front edge', seg([{ id: 'left', name: 'Left' }, { id: 'middle', name: 'Middle' }, { id: 'right', name: 'Right' }], W.entrance, 'data-aseg="entrance"'));
  } else {
    const a = state.setup && state.setup.area, drawing = a && a.kind === 'draw' && a.state === 'drawing';
    const online = hsList().filter(h => h.online && !h.desk);
    html = setRow('Headset that draws', 'Put it on, draw the boundary with the laser, then the obstacles', `<select class="select input-lg" data-drawhs>${online.map(h => `<option value="${esc(h.id)}" ${h.id === W.drawId ? 'selected' : ''}>${esc(`${h.number || ''} ${h.name}`)}</option>`).join('')}</select><button type="button" class="btn btn-lg btn-primary" data-draw ${online.length ? '' : 'disabled'}>${drawing ? 'Drawing now' : a && a.kind === 'draw' && a.state === 'done' ? 'Draw again' : 'Start drawing'}</button>`);
    if (a && a.kind === 'draw') html += setRow('Now', '', `<span class="${a.state === 'done' ? '' : 'muted'}">${a.state === 'done' ? `Drawn: ${esc(App.fmtArea(a))}` : 'Drawing in the headset. The plan updates as it goes.'}</span>`);
  }
  if (ctl._h !== html) { ctl._h = html; ctl.innerHTML = html; }
  drawPlanSvg(p.plan, p.cap);
}

/** Top-down preview: the rectangle, marks A and B, the entrance. Or the drawn zone. */
function drawPlanSvg(svg, cap) {
  let w, d, poly = null;
  const zn = state.zone;
  if (W.areaKind === 'draw' && zn && zn.poly && zn.poly.length > 2) {
    const xs = zn.poly.map(q => q[0]), zs = zn.poly.map(q => q[1]);
    w = Math.max(...xs) - Math.min(...xs); d = Math.max(...zs) - Math.min(...zs); poly = zn.poly;
  } else { [w, d] = W.size.split('x').map(Number); }
  const rot = W.areaKind === 'preset' ? W.rotation : 0;
  const sw = rot % 180 ? d : w, sd = rot % 180 ? w : d;
  const k = 260 / Math.max(sw, sd), ox = 160 - (sw * k) / 2, oy = 160 - (sd * k) / 2;
  let g = `<rect x="${ox}" y="${oy}" width="${sw * k}" height="${sd * k}" fill="var(--surface)" stroke="var(--text-3)" stroke-width="1.5"/>`;
  for (let x = 1; x < sw; x++) g += `<line x1="${ox + x * k}" y1="${oy}" x2="${ox + x * k}" y2="${oy + sd * k}" stroke="var(--line)" />`;
  for (let z = 1; z < sd; z++) g += `<line x1="${ox}" y1="${oy + z * k}" x2="${ox + sw * k}" y2="${oy + z * k}" stroke="var(--line)" />`;
  if (poly) {
    const cx = (Math.max(...poly.map(q => q[0])) + Math.min(...poly.map(q => q[0]))) / 2, cz = (Math.max(...poly.map(q => q[1])) + Math.min(...poly.map(q => q[1]))) / 2;
    g += `<polygon points="${poly.map(q => `${160 + (q[0] - cx) * k},${160 + (q[1] - cz) * k}`).join(' ')}" fill="none" stroke="var(--signal)" stroke-width="2" stroke-dasharray="7 5"/>`;
  }
  // marks: A at the front-left corner, B along the left edge 2 m towards the back (before rotation)
  const pt = (x, z) => { // x across, z from front (bottom) to back (top), in the unrotated rectangle
    let px = x, pz = z;
    if (rot === 90) [px, pz] = [z, w - x]; else if (rot === 180) [px, pz] = [w - x, d - z]; else if (rot === 270) [px, pz] = [d - z, x];
    return [ox + px * k, oy + sd * k - pz * k];
  };
  const A = pt(0, 0), B = pt(0, Math.min(2, d));
  const mark = ([x, y], l) => `<g><line x1="${x - 7}" y1="${y}" x2="${x + 7}" y2="${y}" stroke="var(--text)" stroke-width="2"/><line x1="${x}" y1="${y - 7}" x2="${x}" y2="${y + 7}" stroke="var(--text)" stroke-width="2"/><text x="${x + 10}" y="${y - 8}" fill="var(--text)" font-family="Sofia Sans XC, sans-serif" font-weight="800" font-size="20">${l}</text></g>`;
  if (W.areaKind === 'preset') g += `<line x1="${A[0]}" y1="${A[1]}" x2="${B[0]}" y2="${B[1]}" stroke="var(--text-3)" stroke-dasharray="3 4"/>` + mark(A, 'A') + mark(B, 'B');
  // entrance: a gap marker on the chosen side
  if (W.areaKind === 'preset') {
    const along = { left: 0.18, middle: 0.5, right: 0.82 }[W.entrance] ?? 0.5;
    const E0 = pt(w * along, 0), E1 = pt(w * along, -0.45);      // a short arrow outside the front edge, pointing in
    g += `<line x1="${E1[0]}" y1="${E1[1] + (rot === 0 ? 10 : 0)}" x2="${E0[0]}" y2="${E0[1]}" stroke="var(--signal)" stroke-width="3" stroke-linecap="round"/><circle cx="${E0[0]}" cy="${E0[1]}" r="4.5" fill="var(--signal)"/>`;
  }
  if (svg._g !== g) { svg._g = g; svg.innerHTML = g; }
  text(cap, W.areaKind === 'preset' ? `${W.size.replace('x', ' × ')} m. A is the front-left corner, B is on the left edge 2 m towards the back. The green mark is the entrance. The area is placed when the first headset touches A and B.` : poly ? 'The boundary as drawn in the headset.' : 'The drawing appears here as the headset draws it.');
}

function fillPoints(pane, p) {
  const hs = hsList().filter(h => !h.desk);
  const online = hs.filter(h => h.online);
  const sel = pane.querySelector('[data-first]');
  if (!W.firstId || !online.some(h => h.id === W.firstId)) W.firstId = (state.setup && (state.setup.ref || state.setup.first)) || W.drawId || (online[0] || {}).id || null;
  const opts = online.map(h => `<option value="${esc(h.id)}">${esc(`${h.number || ''} ${h.name}`)}</option>`).join('');
  if (sel._h !== opts) { sel._h = opts; sel.innerHTML = opts; }
  if (document.activeElement !== sel && W.firstId) sel.value = W.firstId;
  const firstSt = ptsOf(W.firstId);
  pane.querySelector('[data-pstart]').disabled = !W.firstId || ['p1', 'p2', 'waiting'].includes(firstSt);
  text(pane.querySelector('[data-pstart]'), firstSt === 'done' ? 'Again with this headset' : ['p1', 'p2', 'waiting'].includes(firstSt) ? 'Touching the marks' : 'Start with this headset');
  pane.querySelector('[data-psync]').disabled = firstSt !== 'done' || online.length < 2;
  const ck = (state.setup && state.setup.check) || {};
  const rows = [...online.filter(h => h.id === W.firstId), ...online.filter(h => h.id !== W.firstId), ...hs.filter(h => !h.online)];
  syncList(p.rows, rows, h => h.id, () => make(`<div class="prow-pts"><span class="hsq" data-f="sq"></span><span class="prow-main"><span class="prow-name" data-f="name"></span><span class="pts-check" data-f="ck"></span></span>
    <span class="pts"><span data-f="p1">Point 1</span><span data-f="p2">Point 2</span><span data-f="dn">Done</span></span><button type="button" class="btn btn-lg" data-redo>Redo</button></div>`), (el, h) => {
    const f = parts(el), st = ptsOf(h.id), first = h.id === W.firstId;
    paintSq(f.sq, h);
    text(f.name, `${h.name}${first ? ' · first headset' : ''}`);
    const order = { waiting: 0, p1: 1, p2: 2, done: 3 }[st] ?? -1;
    f.p1.className = st === 'failed' ? 'fail' : order === 1 ? 'now' : order > 1 ? 'done' : '';
    f.p2.className = st === 'failed' ? 'fail' : order === 2 ? 'now' : order > 2 ? 'done' : '';
    f.dn.className = st === 'failed' ? 'fail' : order === 3 ? 'done' : '';
    text(f.dn, st === 'failed' ? 'Failed' : 'Done');
    const c = ck[h.id], cm = c && typeof c.abDelta === 'number' ? Math.round(Math.abs(c.abDelta) * 100) : null;
    const off = !first && c ? c.ok === false || (cm != null && cm > 5) : false;
    const err = state.setup && state.setup.errors && state.setup.errors[h.id];
    const word = !h.online ? 'Offline' : err ? err : st === 'waiting' ? 'Waiting' : st === 'p1' ? 'Touch mark A' : st === 'p2' ? 'Touch mark B' : st === 'failed' ? 'Failed, redo it' : st === 'done' ? (first ? `Marks set${c && c.ab ? `, A to B ${(Math.round(c.ab * 100) / 100).toString().replace('.', ',')} m` : ''}` : cm == null ? 'Matched' : off ? `A to B differs by ${cm} cm from the first headset` : `Matches the first headset (${cm} cm)`) : hsAligned(h) ? 'Calibrated before' : 'Not calibrated';
    text(f.ck, word);
    attr(f.ck, 'data-tone', off || st === 'failed' || err ? 'warn' : null);
    const redo = el.querySelector('[data-redo]');
    show(redo, h.online && (st === 'done' || st === 'failed'));
    redo.className = `btn btn-lg ${off || st === 'failed' ? 'btn-warn' : ''}`;
  });
  const waiting = online.filter(h => h.id !== W.firstId && ptsOf(h.id) !== 'done').length;
  text(p.note, firstSt === 'done' ? (waiting ? `${plural(waiting, 'headset', 'headsets')} still to confirm the marks.` : 'Every connected headset matches the marks.') : 'Choose the headset that defines the marks. Default: the one that drew the boundary.');
}

// ---------- input ----------

function wizGo(step) { W.step = step; api('/api/setup', { step }, { quiet: true }); scheduleRender(); }
$('wizSteps').addEventListener('click', e => { const li = e.target.closest('li'); if (li && !li.firstChild.disabled) wizGo(li.dataset.key); });
$('wizBack').onclick = () => { const s = WIZ[W.kind], i = s.indexOf(W.step); if (i <= 0) wizEnd(); else wizGo(s[i - 1]); };
$('wizSkip').onclick = () => { const s = WIZ[W.kind]; wizGo(s[s.indexOf(W.step) + 1]); };
function wizEnd() { W.kind = null; api('/api/setup', { step: null, entry: null }, { quiet: true }); scheduleRender(); }
$('wizStop').onclick = e => twoStep(e.currentTarget, wizEnd);
$('wizNext').onclick = async () => {
  if (W.step === 'done') { wizEnd(); return go('home'); }
  if (W.step === 'area' && W.areaKind === 'preset') {
    const [w, d] = W.size.split('x').map(Number);
    const r = await api('/api/setup/area', { kind: 'preset', w, d, rotation: W.rotation, entrance: W.entrance });
    if (!r.ok) return;
    toast(`Play area ${W.size.replace('x', ' × ')} m`, 'ok');
  }
  const s = WIZ[W.kind];
  wizGo(s[s.indexOf(W.step) + 1]);
};
$('setupEntry').addEventListener('click', e => { const b = e.target.closest('[data-entry]'); if (b) App.startSetup(b.dataset.entry); });

const pane = $('wizPane');
pane.addEventListener('click', async e => {
  const t = e.target;
  const vs = t.closest('[data-venue-seg] button');
  if (vs) return api('/api/settings', { [vs.parentElement.dataset.venueSeg]: vs.dataset.v });
  const ak = t.closest('[data-areakind] button');
  if (ak) { W.areaKind = ak.dataset.v; return scheduleRender(); }
  const sz = t.closest('[data-size]');
  if (sz) { W.size = sz.dataset.size; return scheduleRender(); }
  const as = t.closest('[data-aseg] button');
  if (as) { const k = as.parentElement.dataset.aseg; W[k] = k === 'rotation' ? Number(as.dataset.v) : as.dataset.v; return scheduleRender(); }
  if (t.closest('[data-draw]')) {
    const id = pane.querySelector('[data-drawhs]').value;
    W.drawId = id;
    const r = await api('/api/setup/area', { kind: 'draw', headsetId: id });
    if (r.ok) toast('Draw the boundary in the headset, then the obstacles');
    return;
  }
  if (t.closest('[data-pstart]')) {
    const id = pane.querySelector('[data-first]').value || W.firstId;
    W.firstId = id;
    const r = await api('/api/setup/points', { headsetId: id });
    if (r.ok) toast('Walk to mark A and touch the floor with the controller');
    return;
  }
  if (t.closest('[data-psync]')) { const r = await api('/api/setup/points', { sync: true }); if (r.ok) toast('Every other headset now touches A, then B'); return; }
  const redo = t.closest('[data-redo]');
  if (redo) return api('/api/setup/points', { redo: redo.closest('[data-key]').dataset.key });
  const col = t.closest('[data-col]');
  if (col) { const ser = col.closest('[data-key]').dataset.key; W.usbSet[ser].color = HS_COLORS[Number(col.dataset.col)]; return scheduleRender(); }
  const inst = t.closest('[data-install]');
  if (inst) {
    const ser = inst.closest('[data-key]').dataset.key, cfg = W.usbSet[ser] || {};
    const r = await api('/api/usb/install', { serial: ser, number: Number(cfg.number) || undefined, color: cfg.color || HS_COLORS[((Number(cfg.number) || 1) - 1) % HS_COLORS.length], name: cfg.name || `Quest ${cfg.number}` });
    if (r.ok) toast('Installing the headset app');
  }
});
pane.addEventListener('change', async e => {
  const t = e.target;
  if (t.matches('[data-tick]')) { if (t.checked) W.ticks.add(t.dataset.tick); else W.ticks.delete(t.dataset.tick); return scheduleRender(); }
  if (t.matches('[data-venue]')) return api('/api/settings', { [t.dataset.venue]: t.value.trim() });
  if (t.matches('[data-first]')) { W.firstId = t.value; return scheduleRender(); }
  if (t.matches('[data-drawhs]')) { W.drawId = t.value; return; }
  if (t.matches('[data-logo]')) return App.uploadLogo(t.files[0]);
});
pane.addEventListener('input', e => {
  const t = e.target;
  if (t.matches('[data-usb]')) { const ser = t.closest('[data-key]').dataset.key; const cfg = W.usbSet[ser]; cfg[t.dataset.usb] = t.dataset.usb === 'number' ? Number(t.value) : t.value; }
  if (t.matches('[data-venue]')) { clearTimeout(t._t); t._t = setTimeout(() => api('/api/settings', { venueName: t.value.trim() }, { quiet: true }), 600); }
});

/** Reads a logo file and stores it as a data URL in the settings (small files only). */
App.uploadLogo = function (file) {
  if (!file) return;
  if (file.size > 600 * 1024) return toast('The logo is too big. Use a file under 600 KB.', 'warn');
  const rd = new FileReader();
  rd.onload = () => api('/api/settings', { venue: { logo: rd.result } }).then(r => r.ok && toast('Logo saved', 'ok'));
  rd.readAsDataURL(file);
};
