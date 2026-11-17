// Екранът на лобито: получава състоянието от сървъра по WebSocket и го рисува.

const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let state = null;
const selected = new Set();

const PHASE = { idle: 'Свободна', playing: 'Играе', loading: 'Зарежда', calibrating: 'Калибрира', offline: 'Изключена' };
const COLORS = ['#4f8cff', '#3ccf7a', '#f2b33d', '#ff7ab6', '#b67cff', '#38d6e0', '#ff8c4f', '#a3e05a'];

// ---------- връзка ----------

function connect() {
  const ws = new WebSocket(`ws://${location.host}/ui`);
  ws.onopen = () => { $('conn').textContent = 'Свързано'; $('conn').className = 'badge ok'; };
  ws.onclose = () => { $('conn').textContent = 'Няма връзка'; $('conn').className = 'badge off'; setTimeout(connect, 1500); };
  ws.onmessage = e => {
    const msg = JSON.parse(e.data);
    if (msg.type === 'state') { state = msg; render(); }
    if (msg.type === 'toast') toast(msg.text, msg.level);
  };
}

async function call(path, body = {}) {
  const res = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { toast(data.error || 'Грешка', 'error'); throw new Error(data.error); }
  return data;
}

function toast(text, level = 'info') {
  const el = document.createElement('div');
  el.className = `toast ${level}`;
  el.textContent = text;
  $('toasts').append(el);
  setTimeout(() => el.remove(), 4500);
}

// ---------- рисуване ----------

function battColor(b, charging) {
  if (charging) return 'var(--accent)';
  return b < 20 ? 'var(--bad)' : b < 40 ? 'var(--warn)' : 'var(--ok)';
}

function render() {
  const hs = state.headsets;
  for (const id of [...selected]) if (!hs.find(h => h.id === id && h.online)) selected.delete(id);

  // горе: калибровка
  const cal = state.calibration;
  $('calibBadge').textContent = cal ? `Калибрирано №${cal.version} · ${cal.width.toFixed(2)} × ${cal.depth.toFixed(2)} м` : 'Залата не е калибрирана';
  $('calibBadge').className = `badge ${cal ? 'ok' : 'bad'}`;

  // каски
  const online = hs.filter(h => h.online).length;
  $('hsCount').textContent = `· ${online} от ${hs.length} свързани`;
  $('noHeadsets').hidden = hs.length > 0;
  $('headsets').innerHTML = hs.map((h, i) => headsetCard(h, i)).join('');

  renderArena();
  renderGames();
  renderSession();
  renderCalibDialog();
}

function headsetCard(h, i) {
  const phase = h.online ? h.phase : 'offline';
  const b = h.battery ?? 0;
  const ctrl = h.controllers || {};
  const busy = !h.online || h.phase !== 'idle';
  return `
  <div class="card ${h.online ? '' : 'offline'} ${selected.has(h.id) ? 'selected' : ''}">
    <div class="sel" data-select="${esc(h.id)}" title="Избери за играта"></div>
    <div class="card-head">
      <div>
        <div class="card-name" data-rename="${esc(h.id)}" title="Цъкни за ново име">
          <span style="color:${COLORS[i % COLORS.length]}">●</span> ${esc(h.name)}
        </div>
        <div class="card-id">${esc(h.id)}${h.ip ? ' · ' + esc(h.ip) : ''}</div>
      </div>
      <span class="pill ${phase}">${PHASE[phase]}${phase === 'calibrating' ? ` ${h.calibStep || 0}/4` : ''}</span>
    </div>
    <div class="battery">
      <div class="batt-num ${h.lowBattery ? 'low' : ''}">${h.battery == null ? '—' : b + '%'}</div>
      <div class="batt-bar"><div class="batt-fill" style="width:${b}%;background:${battColor(b, h.charging)}"></div></div>
    </div>
    <div class="meta">
      <span>Контролери: <b class="${ctrl.left < 20 ? 'low' : ''}">Л ${ctrl.left ?? '—'}%</b> <b class="${ctrl.right < 20 ? 'low' : ''}">Д ${ctrl.right ?? '—'}%</b></span>
      <span>${h.charging ? '<b style="color:var(--accent)">⚡ Зарежда</b>' : h.lowBattery ? '<b class="low">Слаба батерия!</b>' : ''}</span>
      <span>Wi-Fi: <b>${h.wifi != null ? wifiText(h.wifi) : '—'}</b></span>
      <span>Зала: <b style="color:${h.calibrated ? 'var(--ok)' : 'var(--bad)'}">${h.calibrated ? '✓ заредена' : '✗ няма'}</b></span>
    </div>
    <div class="card-actions">
      <button class="btn small" data-act="identify" data-id="${esc(h.id)}" ${h.online ? '' : 'disabled'}>Вибрирай</button>
      <button class="btn small" data-act="recalibrate" data-id="${esc(h.id)}" ${h.online && state.calibration ? '' : 'disabled'}>Прати залата</button>
      <button class="btn small" data-act="reboot" data-id="${esc(h.id)}" ${h.online && !busy ? '' : 'disabled'}>Рестарт</button>
    </div>
  </div>`;
}

function wifiText(rssi) {
  return rssi > -55 ? 'отличен' : rssi > -67 ? 'добър' : rssi > -75 ? 'слаб' : 'много слаб';
}

function renderArena() {
  const cal = state.calibration;
  const w = cal?.width || 6, d = cal?.depth || 6;
  const lines = [];
  for (let x = -Math.floor(w / 2); x <= w / 2; x++) lines.push(`<line x1="${x}" y1="${-d / 2}" x2="${x}" y2="${d / 2}" stroke="#2a303c" stroke-width="0.02"/>`);
  for (let z = -Math.floor(d / 2); z <= d / 2; z++) lines.push(`<line x1="${-w / 2}" y1="${z}" x2="${w / 2}" y2="${z}" stroke="#2a303c" stroke-width="0.02"/>`);
  const dots = state.headsets.map((h, i) => (h.online && h.pos && h.calibrated) ? `
    <g transform="translate(${h.pos.x} ${h.pos.z})">
      <circle r="0.22" fill="${COLORS[i % COLORS.length]}" opacity="0.25"/>
      <circle r="0.12" fill="${COLORS[i % COLORS.length]}"/>
      <text y="-0.3" text-anchor="middle" font-size="0.26" fill="#e8ebf1">${esc(h.name.replace(/^Каска\s*/, ''))}</text>
    </g>` : '').join('');
  $('arenaMap').setAttribute('viewBox', `${-w / 2 - 0.6} ${-d / 2 - 0.6} ${w + 1.2} ${d + 1.2}`);
  $('arenaMap').innerHTML = `
    ${lines.join('')}
    <rect x="${-w / 2}" y="${-d / 2}" width="${w}" height="${d}" fill="none" stroke="${cal ? '#3ccf7a' : '#ff5d5d'}" stroke-width="0.05" stroke-dasharray="${cal ? '' : '0.2 0.12'}"/>
    <circle r="0.06" fill="#8a93a6"/>
    ${dots}`;
  $('arenaInfo').textContent = cal
    ? `Калибрирана на ${new Date(cal.at).toLocaleString('bg-BG')} · ${state.headsets.filter(h => h.calibrated).length} каски са с тази зала`
    : 'Цъкни „Калибрирай" — минаваш веднъж с една каска по 4-те ъгъла, после всички каски я получават сами.';
}

function renderGames() {
  const free = state.headsets.filter(h => h.online && h.phase === 'idle');
  const chosen = selected.size ? free.filter(h => selected.has(h.id)) : free;
  $('selectHint').textContent = selected.size
    ? `Избрани ${selected.size} каски за играта · цъкни картата отново за отказ`
    : 'Цъкни карта, за да избереш само определени каски (иначе — всички свободни)';
  $('games').innerHTML = state.games.map(g => {
    let why = '';
    if (!state.calibration) why = 'Първо калибрирай залата';
    else if (state.session) why = 'Вече тече игра';
    else if (!chosen.length) why = 'Няма свободни каски';
    else if (chosen.length > g.maxPlayers) why = `До ${g.maxPlayers} играчи`;
    const low = chosen.filter(h => h.lowBattery).length;
    return `
    <div class="game" style="border-left-color:${esc(g.color || '#4f8cff')}">
      <div class="game-title">${esc(g.name)}</div>
      <div class="muted small">${esc(g.description || '')}</div>
      <div class="game-row">
        <span class="muted small">${g.minPlayers}–${g.maxPlayers} играчи · ${g.minutes} мин</span>
        <button class="btn primary" data-launch="${esc(g.id)}" ${why ? 'disabled' : ''} title="${esc(why)}">
          ${why ? esc(why) : `Пусни на ${chosen.length}`}
        </button>
      </div>
      ${low && !why ? `<div class="warn">${low} от каските са със слаба батерия</div>` : ''}
    </div>`;
  }).join('');
}

function renderSession() {
  const s = state.session;
  $('sessionPanel').hidden = !s;
  if (!s) return;
  $('sessionName').textContent = s.gameName;
  $('sessionPlayers').textContent = s.headsets.map(id => state.headsets.find(h => h.id === id)?.name || id).join(', ');
}

setInterval(() => {
  const s = state?.session;
  if (!s) return;
  const sec = Math.max(0, Math.floor((Date.now() - new Date(s.startedAt)) / 1000));
  $('sessionTime').textContent = `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;
  $('sessionTime').style.color = sec > s.minutes * 60 ? 'var(--bad)' : '';
}, 500);

// ---------- калибриране ----------

let calibOpen = false;

function renderCalibDialog() {
  if (!calibOpen) return;
  const running = state.headsets.find(h => h.phase === 'calibrating');
  const pending = state.pendingCalibration;
  $('calibPick').hidden = !!(running || pending);
  $('calibRun').hidden = !running;
  $('calibResult').hidden = !pending || !!running;
  $('calibConfirm').hidden = !pending || !!running;
  $('calibRetry').hidden = !pending || !!running;

  if (!running && !pending) {
    const free = state.headsets.filter(h => h.online && h.phase === 'idle');
    $('calibHeadsets').innerHTML = free.length
      ? free.map(h => `<button type="button" class="btn" data-calib="${esc(h.id)}"><span>${esc(h.name)}</span><span class="muted">${h.battery ?? '—'}%</span></button>`).join('')
      : '<div class="muted">Няма свободна свързана каска.</div>';
  }
  if (running) {
    [...$('cornerSteps').children].forEach((li, i) => {
      li.className = i < running.calibStep ? 'done' : i === running.calibStep ? 'now' : '';
      li.textContent = i < running.calibStep ? `✓ Ъгъл ${i + 1}` : `Ъгъл ${i + 1}`;
    });
  }
  if (pending) {
    $('resultSize').textContent = `${pending.width.toFixed(2)} × ${pending.depth.toFixed(2)} м`;
    const warns = [];
    if (pending.skew > 0.15) warns.push(`Ъглите не образуват правоъгълник (разлика в диагоналите ${Math.round(pending.skew * 100)} см) — по-добре мини отначало.`);
    if (pending.width < 2 || pending.depth < 2) warns.push('Залата излиза под 2 м — вероятно е натиснат грешен ъгъл.');
    $('resultWarn').hidden = !warns.length;
    $('resultWarn').textContent = warns.join(' ');
  }
}

$('calibStart').onclick = () => { calibOpen = true; $('calibDialog').showModal(); renderCalibDialog(); };
$('calibCancel').onclick = async () => {
  calibOpen = false; $('calibDialog').close();
  if (state.pendingCalibration || state.headsets.some(h => h.phase === 'calibrating')) await call('/api/calibrate/cancel');
};
$('calibRetry').onclick = () => call('/api/calibrate/cancel');
$('calibConfirm').onclick = async () => { await call('/api/calibrate/confirm'); calibOpen = false; $('calibDialog').close(); };
$('calibDialog').addEventListener('cancel', e => { e.preventDefault(); $('calibCancel').click(); });

// ---------- кликове ----------

document.addEventListener('click', async e => {
  const t = e.target.closest('[data-select],[data-rename],[data-act],[data-launch],[data-calib]');
  if (!t) return;
  if (t.dataset.select) {
    const id = t.dataset.select;
    selected.has(id) ? selected.delete(id) : selected.add(id);
    return render();
  }
  if (t.dataset.rename) {
    const h = state.headsets.find(x => x.id === t.dataset.rename);
    const name = prompt('Ново име на каската:', h?.name);
    if (name !== null) await call('/api/headset/rename', { headsetId: t.dataset.rename, name });
    return;
  }
  if (t.dataset.act) {
    if (t.dataset.act === 'reboot' && !confirm('Да рестартирам ли каската?')) return;
    const r = await call(`/api/headset/${t.dataset.act}`, { headsetId: t.dataset.id });
    if (t.dataset.act === 'identify' && r.ok) toast('Каската вибрира — виж коя е');
    return;
  }
  if (t.dataset.launch) {
    const ids = selected.size ? [...selected] : [];
    await call('/api/launch', { gameId: t.dataset.launch, headsetIds: ids });
    selected.clear();
    return;
  }
  if (t.dataset.calib) return call('/api/calibrate', { headsetId: t.dataset.calib });
});

$('stopBtn').onclick = () => { if (confirm('Да спра ли играта на всички каски?')) call('/api/stop'); };

connect();
