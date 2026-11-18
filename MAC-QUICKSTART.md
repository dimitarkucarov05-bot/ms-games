# MacBook: MS Games като програма

## Най-лесно: програмата (един файл, винаги най-новото)

GitHub сам строи **`MS-Games-Mac.dmg`** при всяка промяна в `main` (след Windows инсталатора, общо около 10 минути) и го слага в същия release:

    https://github.com/martiness14/ms-games/releases/latest/download/MS-Games-Mac.dmg

1. Отвори `.dmg` и плъзни „MS Games“ в Applications.
2. **Първо пускане:** програмата не е заверена от Apple (няма Apple Developer ID), затова macOS пита веднъж: десен бутон → Open → Open
   (ако предлага само „Move to Bin“: System Settings → Privacy & Security → „Open Anyway“). Или в Terminal:
   `xattr -dr com.apple.quarantine "/Applications/MS Games.app"`.
3. Програмата живее в **лентата на менюто** (иконата с контролер) и отваря конзолата на http://localhost:47801. Не иска Node, Git, нищо.
   В менюто: адресите за служебния телефон (с камера) и за каските, „Copy the phone link“, папката с данни, дневникът, „Restart the server“, „Quit“.
4. Държи Mac-а буден, докато върви; подновява HTTPS сертификата сама, когато мрежата се смени; ако сървърът падне, го пуска пак (до 5 пъти).
5. **Данни:** `~/Library/Application Support/MS Games/data/` (зона, калибровки, рекорди, **`labcoin.json`** с ключа на LabCoin, дневник на HEX).
   **Дневник:** `~/Library/Logs/MS Games/server.log`.
6. Само Apple silicon (M1 и нагоре). Intel Mac: стартерът `start-mac.command` (по-долу) върви и там с Node.

LabCoin: `labcoin.json` = `{"baseUrl":"https://app.labcoin.bg","key":"…","venue":"…","mode":"live","grantPin":"…"}`. Ключът не се пише в чата и в git.

## Като програмист: от кода

- `node lobby-stage/tools/pack-mac.mjs --dmg` (на Mac, нужни са Node, Xcode Command Line Tools) прави `dist-mac/MS Games.app` и `MS-Games-Mac.dmg`.
  Избира същото като Windows пакетът: сървърът, без тестове, само Synty пакетите, които кодът назовава, без звуците с кредит. Програмата е `lobby-stage/tools/mac/main.swift`.
- Двоен клик на **`start-mac.command`** в корена на репото: сам прави `git pull`, пита за Node 24, ако липсва, пуска пълния сървър (не пробния). Данни в `lobby-stage/data-mac/`.

| Какво | Адрес |
|---|---|
| Конзола | http://localhost:47801 |
| Служебен телефон, **камера работи** | https://&lt;IP на Mac-а&gt;:47843/scan/ (приеми предупреждението за сертификата веднъж) |
| Служебен телефон, код на ръка | http://&lt;IP на Mac-а&gt;:47801/scan/ |
| Каски (Quest) | https://&lt;IP на Mac-а&gt;:47843/play/ |

- **Защо пълен, а не пробен сървър:** `tools/dev-server.mjs` нарочно изключва HTTPS, радио-маяка и пазача на каските. Без HTTPS нито камерата на телефона, нито каските във VR работят.
- Телефонът и каските да са в същата Wi-Fi мрежа като Mac-а. macOS може да поиска разрешение за входящи връзки на Node: „Allow“.
- USB инсталаторът на каските (adb) е изключен на Mac (`NO_KEEPER=1`); иска Android platform-tools за macOS. Играта по Wi-Fi не го иска.
