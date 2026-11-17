"""MS Games VR app, the page side: straight into VR when started from the app (?app=1); the web app manifest link.
Run with the folder of the lobby (staging or live)."""
import io, sys, os
root = sys.argv[1]
p = os.path.join(root, 'public/play/play.js'); s = io.open(p, encoding='utf-8').read()
if "qs.get('app') === '1'" not in s:
    a = "    $('note').textContent = 'Put the headset on and press the button with the controller.';"
    assert s.count(a) == 1
    s = s.replace(a, a + """
    // started from the MS Games VR app on the headset: straight in (the tap on the icon counts as the press);
    // if the browser still wants a press, the button stays
    if (qs.get('app') === '1') enterXR().catch(e => console.warn('auto-enter:', e.message));""")
    io.open(p, 'w', encoding='utf-8', newline='\n').write(s)
p = os.path.join(root, 'public/play/index.html'); s = io.open(p, encoding='utf-8').read()
if 'manifest.webmanifest' not in s:
    a = '<meta name="theme-color" content="#131411">'
    assert s.count(a) == 1
    s = s.replace(a, a + '\n<link rel="manifest" href="/play/manifest.webmanifest">')
    io.open(p, 'w', encoding='utf-8', newline='\n').write(s)
print('play patched:', root)
