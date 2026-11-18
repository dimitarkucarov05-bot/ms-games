# Windows: тест на MS Games от GitHub

Репото е **публично** (решение на Мартин, 18.11.2026, „за сега“). Внимание: в него са Synty моделите, лицензирани само за екипа на LabCoin; ако това трябва да спре, репото се връща в частно (вече свалените копия остават).

## Най-бързо: едно .exe, винаги най-новото

GitHub сам го строи при всяка промяна в `main` (около 10 минути след качването) и го слага на един и същ адрес:

    https://github.com/martiness14/ms-games/releases/latest/download/MS-Games-Setup.exe

(без вход в GitHub). Пусни го: не иска Node, Git, нищо друго.
Бележката на release-а казва от кой къмит и кога е. Така Windows компютърът винаги взема последния билд.

## За разработка (git)

### Първи път

1. Инсталирай **Git for Windows** (git-scm.com) и **Node.js 24** (nodejs.org).
2. В PowerShell или cmd, в папката, където искаш проекта:

       git clone https://github.com/martiness14/ms-games.git
       cd ms-games

   Първия път Git ще отвори браузър за вход в GitHub (акаунт `martiness14`).
   Репото е около 600 MB; клонирането отнема няколко минути.
3. Двоен клик на **`dev-windows.cmd`**. Той сам прави `git pull`, инсталира Node (с winget), ако липсва, прави `npm install` и двете
   връзки (`mklink /J`), после пуска сървъра и отваря конзолата. Следващия път същият двоен клик взема най-новото и пуска.
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

## Инсталаторът

Виж най-горе: един файл `MS-Games-Setup.exe` в **Releases → latest**, строи се автоматично (`.github/workflows/windows-installer.yml`).
Проверка на файла: `Get-FileHash .\MS-Games-Setup.exe -Algorithm SHA256` (сумата е в бележката на release-а).
Каските: MS Games → Setup → Headsets, включи каската с USB кабел и натисни Install.
Картинките в самия инсталатор (екранът на setup-а) още са със старите зелени цветове.

## LabCoin връзката (скан, скинове, HEX) в инсталираното приложение

По подразбиране е **изключена**, докато не е свързан истинският LabCoin. За проба с пробни играчи (HOTDOG, WOMAN1, KID001) пусни в PowerShell
(след първото пускане на MS Games, когато папката вече съществува):

    '{"mode":"mock","grantPin":"1234"}' | Set-Content "$env:LOCALAPPDATA\MS Games\data\labcoin.json"

Без рестарт. Скан: `http://localhost:47801/scan/` (инсталираното слуша на порт 47801); HEX на ръка: конзолата → Headsets → картата на
каската с вързан играч → сума → „Send HEX“ два пъти (PIN `1234`). Истинският LabCoin се включва със същия файл:
`{"baseUrl":"https://app.labcoin.bg","key":"…","venue":"vr-sofia","mode":"live","grantPin":"…"}` (ключът не се пише в чата и в git).
