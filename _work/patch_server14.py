"""Saves for web games (The Back Room career): data/saves/<game>/<key>.json. The game asks for a save with
opts.loadSave(key) and hands out what to write with game.takeSaves(). Usage: python patch_server14.py <server.js>"""
import io, sys

p = sys.argv[1]
s = io.open(p, encoding='utf-8').read()


def rep(a, b):
    global s
    assert s.count(a) == 1, (s.count(a), a[:90])
    s = s.replace(a, b)


rep("function webHall() {",
    """// Saves of web games that keep a career: one JSON file per game and per player (or team) name.
const SAVES_DIR = path.join(DATA, 'saves');
const saveFile = (gameId, key) => path.join(SAVES_DIR, String(gameId).replace(/[^\\w-]/g, ''), `${String(key).replace(/[^\\w .-]/g, '').trim().slice(0, 40) || 'player'}.json`);
function loadGameSave(gameId, key) { return readJson(saveFile(gameId, key), null); }
function writeGameSaves() {
  if (!web || typeof web.game.takeSaves !== 'function') return;
  for (const e of web.game.takeSaves()) {
    try { const f = saveFile(web.def.id, e.key); fs.mkdirSync(path.dirname(f), { recursive: true }); writeJson(f, { ...e.data, savedAt: new Date().toISOString() }); }
    catch (err) { console.error('save', err); }
  }
}

function webHall() {""")
rep("    const g = def.create({ hall: webHall(), rooms: arena.zone?.rooms?.length ? arena.zone.rooms : undefined, doors: arena.zone?.doors || [], obstacles: arena.zone?.blocked || [], theme: theme === 'kids' ? 'kids' : 'night', fast: !!fast, skipTo, difficulty: level, seed: Date.now() % 1e9, now: Date.now() });",
    "    const g = def.create({ hall: webHall(), rooms: arena.zone?.rooms?.length ? arena.zone.rooms : undefined, doors: arena.zone?.doors || [], obstacles: arena.zone?.blocked || [], theme: theme === 'kids' ? 'kids' : 'night', fast: !!fast, skipTo, difficulty: level, seed: Date.now() % 1e9, now: Date.now(),\n"
    "      career: !skipTo && !fast, team: teamName(team) || undefined, loadSave: key => loadGameSave(game.id, key) });")
rep("    web.game.tick(now - web.held);\n", "    web.game.tick(now - web.held);\n    writeGameSaves();\n")
io.open(p, 'w', encoding='utf-8', newline='\n').write(s)
print('server patched:', p)
