"""Changes for the portable "The Motel" package (owner, 2026-11-15: an exe to send to somebody; on their PC it finds the
headsets on their network and starts the game; only the game with the guns, not the one with the lab).
Applied by launcher/package-motel.ps1 to the PACKED COPY only (app folder), never to the lobby itself:
- The Motel is the game that starts by itself (the lobby default was The Back Room, which is not in this package).
- adb comes with the package (app/headset/adb.exe): the console can install the headset app over a USB cable.
- POST /api/headset/install-app: installs app/headset/MSGames-Headset.apk on every headset on the cable and opens it.
- HTTPS without OpenSSL on that PC: a ready self-signed certificate (app/tls-default) is copied into the data folder.
- Console, Headsets view: an "Add a headset" block with the Install button and the browser address as a fallback.
Usage: python lan_patch.py <app folder>"""
import io, os, sys

root = sys.argv[1]


def patch(rel, pairs):
    p = os.path.join(root, rel)
    s = io.open(p, encoding='utf-8').read()
    for a, b in pairs:
        n = s.count(a)
        assert n >= 1, (rel, 'not found', a[:90])
        s = s.replace(a, b)
    io.open(p, 'w', encoding='utf-8', newline='\n').write(s)
    print('lan patch:', rel)


patch('server.js', [
    ("const AUTO_DEFAULT = { on: true, gameId: 'backroom', theme: 'night' };",
     "const AUTO_DEFAULT = { on: true, gameId: 'motel', theme: 'night' };"),
    ("api['POST /api/launch']({ gameId: 'backroom', headsetIds: [id], theme: 'night', fast: false });",
     "api['POST /api/launch']({ gameId: (arena.autoStart && arena.autoStart.gameId) || 'motel', headsetIds: [id], theme: 'night', fast: false });"),
    ("const ADB = process.env.ADB || ['C:/Android/sdk/platform-tools/adb.exe']",
     "const ADB = process.env.ADB || [path.join(HERE, 'headset', 'adb.exe'), 'C:/Android/sdk/platform-tools/adb.exe']"),
    ("""  'POST /api/headset/clear-space': ({ headsetId }) => {""",
     """  'POST /api/headset/install-app': () => { installHeadsetApp(); return { ok: true }; },
  'POST /api/headset/clear-space': ({ headsetId }) => {"""),
    ("""async function clearSpaceHistory(headsetId) {""",
     """// Пакетът за друга зала: приложението на каската (MS Games, bg.arena.play) се слага по кабел с бутон от пулта.
// После каската намира този компютър сама по UDP сигнала, в която и да е Wi-Fi мрежа.
const HEADSET_APK = path.join(HERE, 'headset', 'MSGames-Headset.apk');
let installing = false;
async function installHeadsetApp() {
  if (installing) return toast('Already installing, wait a moment', 'warn');
  installing = true;
  try {
    if (!fs.existsSync(HEADSET_APK)) return toast('The headset app is missing from this copy of MS Games', 'error');
    const list = await adbRun(['devices'], 20000);
    if (!list.ok) return toast(`USB tools did not start: ${(list.err || '').slice(0, 120)}`, 'error');
    const rows = list.out.split('\\n').slice(1).map(l => l.trim().split(/\\s+/)).filter(l => l[0]);
    const ready = rows.filter(l => l[1] === 'device').map(l => l[0]);
    if (rows.some(l => l[1] === 'unauthorized')) toast('Put the headset on and allow USB debugging, then press Install again', 'warn');
    if (!ready.length) { if (!rows.some(l => l[1] === 'unauthorized')) toast('No headset on the cable. Plug it in with USB (developer mode on) and press Install again', 'warn'); return; }
    for (const serial of ready) {
      toast(`${serial}: installing the headset app…`, 'info');
      const r = await adbRun(['-s', serial, 'install', '-r', HEADSET_APK], 120000);
      if (!r.ok || !/Success/i.test(r.out)) { toast(`${serial}: install failed: ${(r.out || r.err || '').split('\\n').pop().slice(0, 140)}`, 'error'); continue; }
      await adbRun(['-s', serial, 'shell', 'am', 'start', '-n', 'bg.arena.play/.MainActivity'], 20000);
      toast(`${serial}: done. In the headset: Library, Unknown Sources, MS Games. It finds this computer by itself over Wi-Fi.`, 'ok');
    }
  } finally { installing = false; pushState(); }
}
async function clearSpaceHistory(headsetId) {"""),
    ("""    if (!made) return null;
  }""",
     """    if (!made) {      // няма openssl на този компютър: готовият самоподписан сертификат от пакета
      try {
        fs.copyFileSync(path.join(HERE, 'tls-default', 'key.pem'), keyFile);
        fs.copyFileSync(path.join(HERE, 'tls-default', 'cert.pem'), certFile);
      } catch { return null; }
    }
  }"""),
])

patch('public/index.html', [
    ("""        <p>The headset must be on the same Wi-Fi network as this computer. Open the address below in the headset browser and press Enter. It appears here by itself and stays in the list.</p>
        <p class="empty-addr">Headset address: <b id="hsAddr" class="num"></b></p>
      </div>""",
     """        <p>Headsets appear here by themselves once they run the MS Games app on the same Wi-Fi as this computer, and stay in the list.</p>
        <p class="empty-addr" hidden>Headset address: <b id="hsAddr" class="num"></b></p>
      </div>
      <div class="empty hs-setup" id="hsSetup">
        <p class="empty-title">Add a headset</p>
        <p>Once per headset: turn on developer mode for it in the Meta Horizon phone app, plug it into this computer with a USB cable, put it on and allow USB debugging, then press Install.</p>
        <p>After that the cable is not needed. On the headset open Library, Unknown Sources, <b>MS Games</b>. It finds this computer on the same Wi-Fi by itself; press Enter on the page and the headset shows up here.</p>
        <p><button id="hsInstall" class="btn">Install the headset app</button></p>
        <p class="empty-addr">Without the app: open <b id="hsAddr2" class="num"></b> in the headset browser, choose Advanced and Proceed, then press Enter.</p>
      </div>"""),
])

patch('public/console.js', [
    ("  text($('hsAddr'), playUrl() || 'none (HTTPS is off)');",
     "  text($('hsAddr'), playUrl() || 'none (HTTPS is off)');\n  text($('hsAddr2'), playUrl() || 'none (HTTPS is off)');"),
    ("  el.append('The headset must be on the same Wi-Fi network as this computer. Open in its browser ', b, ' and press Enter.');",
     "  el.append('Open the MS Games app on the headset (same Wi-Fi as this computer). No app yet? Headsets, Install the headset app. Or open ', b, ' in its browser and press Enter.');"),
    ("  const spaceBtn = t.closest('[data-space]');",
     "  if (t.closest('#hsInstall')) return call('/api/headset/install-app').catch(() => {});\n\n  const spaceBtn = t.closest('[data-space]');"),
])

patch('public/console.css', [
    (".empty-note {", ".hs-setup { margin-top: 28px; }\n.empty-note {"),
])
