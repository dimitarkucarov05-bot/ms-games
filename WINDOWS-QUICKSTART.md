# Windows: тест на MS Games от GitHub

Репото е **частно** (в него са Synty моделите, лицензирани само за екипа на LabCoin). Не го правете публично.

## Първи път (на другия Windows компютър)

1. Инсталирай **Git for Windows** (git-scm.com) и **Node.js 24** (nodejs.org).
2. В PowerShell или cmd, в папката, където искаш проекта:

       git clone https://github.com/martiness14/ms-games.git
       cd ms-games

   Първия път Git ще отвори браузър за вход в GitHub (акаунт `martiness14`).
   Репото е около 600 MB; клонирането отнема няколко минути.
3. Двоен клик на **`dev-windows.cmd`**. Първия път той прави `npm install` в `lobby` и двете връзки (`mklink /J`),
   които описва `README-PACKAGE.md`, после пуска сървъра и отваря конзолата.
   Windows ще попита за защитната стена: натисни **Да** (Allow).

## Адреси

| Какво | Адрес |
|---|---|
| Конзолата на оператора | http://localhost:47901 |
| Играта без каска (W A S D, дясно копче гледа, ляво хваща, интервал е спусъкът) | http://localhost:47901/play/?desktop=1&id=DEV&name=DEV |
| Телевизорът | http://localhost:47901/tv/ |
| Скан на играч (служебният телефон; демо кодове HOTDOG, WOMAN1, KID001) | http://localhost:47901/scan/ |
| HTTPS за телефони/каски (камера на браузъра) | `https://<IP на компютъра>:47843/` |

## Всеки ден

    git pull          # взима последното от Mac-а
    git add -A
    git commit -m "какво е променено"
    git push          # праща към Mac-а

Работете от една машина наведнъж, за да не се засичате. Ако `git pull` се оплаче, първо `git commit`, после `git pull`.

## Тестове (109 теста)

    cd lobby-stage
    node --test lib/*.test.js game/*.test.js keeper.test.js

С пуснат сървър: `node tools\s2-e2e.mjs 47901` (пълен път със симулирани каски).

## Готовият инсталатор

В GitHub → **Releases** → `MS-Games-Setup-2.0.0.exe` (165 MB). Контролна сума SHA-256 е в бележката на release-а.
Проверка в PowerShell: `Get-FileHash .\MS-Games-Setup-2.0.0.exe -Algorithm SHA256`.
Каските: MS Games → Setup → Headsets, включи каската с USB кабел и натисни Install.

## Какво не е в репото

- `config.json` на `labcoin-app` (в `.gitignore` на приложението; има `config.example.json`, копирай го и го преименувай).
- `node_modules` (чрез `npm install`), работните `*.log`, `data-dev*` (сървърът ги прави сам).
- Големите библиотеки със звуци и гласовия инструмент (виж `README-PACKAGE.md`, „Left out of this package“).
