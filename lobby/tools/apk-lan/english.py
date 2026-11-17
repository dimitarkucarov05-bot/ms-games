"""English text for the headset app that goes out with the portable MS Games package (owner: everything in English).
Same app as tools/apk (bg.arena.play: finds the computer on any Wi-Fi by its UDP signal, serves the game on the
headset's localhost so WebXR works without a certificate); only what the player sees is replaced here.
Run once after copying tools/apk here:  python english.py"""
import io, os

here = os.path.dirname(os.path.abspath(__file__))
src = os.path.join(here, 'src', 'bg', 'arena', 'play')

TABLE = {
    'Forwarder.java': [
        ('<title>Арена</title>', '<title>MS Games</title>'),
        ('letter-spacing:.02em\\">Арена</div>', 'letter-spacing:.02em\\">MS Games</div>'),
        ('Компютърът на залата не отговаря. Опитвам пак…', 'The arena computer is not answering. Trying again…'),
    ],
    'ForwardService.java': [
        ('new NotificationChannel(CHANNEL, "Арена"', 'new NotificationChannel(CHANNEL, "MS Games"'),
        ('"Връзката на играта с компютъра на залата"', '"The game\'s link to the arena computer"'),
        ('.setContentTitle("Арена")', '.setContentTitle("MS Games")'),
        ('"Свързвам се с компютъра на залата"', '"Connecting to the arena computer"'),
        ('"Играта е свързана с компютъра на залата ("', '"Connected to the arena computer ("'),
    ],
    'MainActivity.java': [
        ('"Търся компютъра на залата…"', '"Looking for the arena computer…"'),
        ('"Свързвам се с компютъра на залата…"', '"Connecting…"'),
        ('"Компютърът е намерен, но не пуска каската."', '"Found the computer, but it does not let the headset in."'),
        ('"Адрес " + pc.host + ". Провери дали играта върви на компютъра и дали защитната стена не я спира. "',
         '"Address " + pc.host + ". Check that MS Games is running on the computer and that Windows Firewall allows it. "'),
        ('+ "Опитвам пак сам."', '+ "Trying again by itself."'),
        ('"Порт " + listenPort + " в каската е зает."', '"Port " + listenPort + " on the headset is busy."'),
        ('"Затвори другото приложение, което го ползва, или рестартирай каската."', '"Close the other app that uses it, or restart the headset."'),
        ('"Връзката не тръгна."', '"Could not connect."'),
        ('why == null ? "Опитай пак." : why', 'why == null ? "Try again." : why'),
        ('"Готово. Браузърът не се отваря (проба)."', '"Done. The browser is not opened (test)."'),
        ('"Отварям играта…"', '"Opening the game…"'),
        ('"Не намирам браузъра на каската."', '"Cannot find the headset browser."'),
        ('"Арена е спряна."', '"MS Games is stopped."'),
        ('"Компютърът на залата не е намерен."', '"The arena computer was not found."'),
        ('"Провери дали компютърът е включен и дали каската е в същата Wi‑Fi мрежа. Опитвам пак сам."',
         '"Check that MS Games is running on the computer and that the headset is on the same Wi-Fi. Trying again by itself."'),
        ('primary.setText("Опитай пак")', 'primary.setText("Try again")'),
        ('status.setText("Арена работи.")', 'status.setText("MS Games is running.")'),
        ('"Играта е свързана с компютъра на залата ("', '"Connected to the arena computer ("'),
        ('secondary.setText("Спри Арена")', 'secondary.setText("Stop")'),
        ('"Към играта (" + left + ")"', '"To the game (" + left + ")"'),
        ('title.setText("Арена")', 'title.setText("MS Games")'),
    ],
}

for name, pairs in TABLE.items():
    p = os.path.join(src, name)
    s = io.open(p, encoding='utf-8').read()
    for a, b in pairs:
        if b in s and a not in s:
            continue
        assert s.count(a) >= 1, (name, a)
        s = s.replace(a, b)
    io.open(p, 'w', encoding='utf-8', newline='').write(s)
    print('english:', name)

p = os.path.join(here, 'res', 'values', 'strings.xml')
s = io.open(p, encoding='utf-8').read().replace('>Арена<', '>MS Games<')
io.open(p, 'w', encoding='utf-8', newline='').write(s)
print('english: strings.xml')
