"""Auto-start in the lobby (owner: "R3 does not start automatically, like VEX"; "build it in").
Every headset that joins through the game page gets the two-point alignment if its anchor is lost, then the chosen
game, once per connection. On by default with The Back Room; a switch and a game picker in Settings.
Replaces the scratchpad helper autostart.mjs. Run with the folder of the lobby (staging or live)."""
import io, os, sys

root = sys.argv[1]


def patch(rel, pairs):
    p = os.path.join(root, rel)
    s = io.open(p, encoding='utf-8').read()
    for a, b in pairs:
        if b in s:
            continue      # already patched
        assert s.count(a) == 1, (rel, s.count(a), a[:80])
        s = s.replace(a, b)
    io.open(p, 'w', encoding='utf-8', newline='\n').write(s)
    print('patched', rel)


AUTO = r"""
// ---------- Сам пуска игра на всяка каска, която дойде (като залите на VEX) ----------
// Каска, влязла през страницата на играта: ако котвата ѝ е загубена, получава двете точки; после избраната игра.
// Веднъж на връзка: каска, която излезе от мрежата и се върне, минава наново. Включва се и се сменя в „Settings".
const AUTO_DEFAULT = { on: true, gameId: 'backroom', theme: 'night' };
if (!arena.autoStart) arena.autoStart = { ...AUTO_DEFAULT };
const autoSeen = new Map();      // каска → { step: 'new' | 'aligning' | 'started' | 'retry', at }
function autoStartTick() {
  const cfg = arena.autoStart;
  for (const h of headsets.values()) {
    if (!h.online) { autoSeen.delete(h.id); continue; }
    if (!cfg?.on || h.desk || !h.web) continue;
    const seen = autoSeen.get(h.id), now = Date.now();
    if (!seen) { autoSeen.set(h.id, { step: 'new', at: now }); continue; }
    if (seen.step === 'new' && (now - seen.at < 3000 || h.anchor == null)) continue;      // its first status report first
    if (seen?.step === 'started') continue;
    if (seen?.step === 'retry' && now - seen.at < 30_000) continue;
    if (session && (session.headsets || []).includes(h.id)) { autoSeen.set(h.id, { step: 'started', at: now }); continue; }
    if (h.phase !== 'idle') continue;
    const name = arena.names[h.id] || h.name || h.id;
    if (h.anchor !== 'ok') {
      if (seen?.step !== 'aligning' && arena.zone && !session) {
        try { api['POST /api/zone/align']({ headsetId: h.id }); autoSeen.set(h.id, { step: 'aligning', at: now }); toast(`${name}: two-point alignment first, then the game starts by itself`, 'ok'); }
        catch { /* следващия път */ }
      }
      continue;
    }
    if (session && session.gameId !== cfg.gameId) continue;      // върви друга игра: каската чака в лобито
    try {
      api['POST /api/launch']({ gameId: cfg.gameId, headsetIds: [h.id], theme: cfg.theme || undefined, fast: false });
      autoSeen.set(h.id, { step: 'started', at: now });
      toast(`${name}: started by itself`, 'ok');
    } catch (e) {
      if (seen?.step !== 'retry') toast(`${name}: the game did not start by itself (${e.message})`, 'warn');
      autoSeen.set(h.id, { step: 'retry', at: now });
    }
    pushState();
  }
}
setInterval(autoStartTick, 2000);

"""

patch('server.js', [
    ("    zone: zoneView(),", "    zone: zoneView(),\n    autoStart: arena.autoStart || null,      // сам пуска игра на всяка каска, която дойде"),
    ("  'POST /api/zone/align': ({ headsetId }) => {",
     """  'POST /api/autostart': ({ on, gameId, theme }) => {
    const cur = arena.autoStart || { ...AUTO_DEFAULT };
    const id = gameId === undefined ? cur.gameId : String(gameId);
    const game = games.find(g => g.id === id);
    if (!game || !game.web) throw new Error('No such game');
    const themes = game.themes || [];
    const th = theme !== undefined ? String(theme) : (id === cur.gameId ? cur.theme : (themes[0]?.id || null));
    arena.autoStart = { on: on === undefined ? !!cur.on : !!on, gameId: id, theme: themes.some(t => t.id === th) ? th : (themes[0]?.id || null) };
    writeJson(ARENA_FILE, arena);
    if (arena.autoStart.on) autoSeen.clear();      // включено наново: каските, които вече са тук, също минават
    return { ok: true, autoStart: arena.autoStart };
  },
  'POST /api/zone/align': ({ headsetId }) => {"""),
    ("// ---------- HTTPS за каските ----------", AUTO + "// ---------- HTTPS за каските ----------"),
])

patch('public/index.html', [
    ("""      <dl class="facts" id="facts"></dl>""",
     """      <div class="auto" id="autoBox">
        <label class="toggle"><input id="autoOn" type="checkbox"><i></i><span>Start a game on every headset that joins</span></label>
        <select id="autoGame" class="select" aria-label="Game to start"></select>
        <p class="hint" id="autoHint"></p>
      </div>
      <dl class="facts" id="facts"></dl>"""),
])

patch('public/console.js', [
    ("function renderSettings() {\n",
     """function renderAuto() {
  const a = state.autoStart || { on: false, gameId: '' };
  const webGames = state.games.filter(g => g.web && g.status !== 'soon');
  const box = $('autoGame');
  syncList(box, webGames, g => g.id, () => document.createElement('option'), (el, g) => { el.value = g.id; text(el, g.name); });
  if (document.activeElement !== box) box.value = a.gameId || '';
  if (document.activeElement !== $('autoOn')) $('autoOn').checked = !!a.on;
  box.disabled = !a.on;
  const g = webGames.find(x => x.id === a.gameId);
  text($('autoHint'), a.on
    ? `A headset that comes online is aligned if it needs it, then ${g ? g.name : 'the game'} starts on it by itself. Once per connection.`
    : 'Off: headsets wait in the lobby until you start a game.');
}

function renderSettings() {
  renderAuto();
"""),
    ("  if (t.id === 'fastGame') {",
     "  if (t.id === 'autoOn' || t.id === 'autoGame') { call('/api/autostart', { on: $('autoOn').checked, gameId: $('autoGame').value }).catch(() => {}); return; }\n  if (t.id === 'fastGame') {"),
])

patch('public/console.css', [
    (".facts { display: grid;",
     ".auto { display: flex; flex-wrap: wrap; align-items: center; gap: 12px 18px; max-width: 760px; margin-bottom: 22px; }\n"
     ".auto .hint { flex-basis: 100%; margin: 0; }\n"
     ".facts { display: grid;"),
])
