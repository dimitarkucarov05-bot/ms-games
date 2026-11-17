# Протокол каска ⇄ лоби

Сървърът на лобито (`server.js`) върви на компютъра в залата (Windows или Mac).

| Какво | Къде |
|---|---|
| Екранът на лобито | `http://<компютър>:47801` |
| Каските | WebSocket `ws://<компютър>:47801/headset` |
| Екранът (браузър) | WebSocket `ws://<компютър>:47801/ui` |
| „Тук съм" (откриване) | UDP broadcast на порт **47800**, на всеки 2 с: `{"app":"vrvarna-lobby","port":47801}` |

Каската (`VRLobbyClient` в Unreal) слуша UDP 47800, взима адреса на изпращача и се свързва.
Ако `ServerAddress` в `DefaultGame.ini` е попълнен, ползва него.

Всички съобщения са JSON с поле `type`.

## Каска → лоби

| type | Полета | Кога |
|---|---|---|
| `hello` | `id` (сериен номер), `name`, `model`, `calibrationVersion?`, `app?` | веднага след свързване |
| `status` | `battery` (0–100), `charging`, `controllers {left,right}` (0–100), `fps`, `tracking` (`ok`/`low`), `pos {x,y,z}` (метри; x — ширина, z — дълбочина), `yaw` (радиани; погледът е `(sin yaw, cos yaw)` по `(x, z)`), `volume` (0–100), `sleeping`, `app`, `user?` | всяка секунда |
| `launched` | `ok`, `error?` | след `launch` |
| `stopped` | | след `stop` |
| `calibApplied` | `version` | след `applyCalibration` |
| `calibCorner` | `index` (0–3), `x,y,z` | при всеки ъгъл по време на калибриране |
| `calibDone` | `corners [4×{x,z}]`, `hasMap` | край на калибрирането |
| `calibCancelled` | | прекъснато / не се поддържа |

## Лоби → каска

| type | Полета | Какво прави каската |
|---|---|---|
| `welcome` | `name` | запомня името, дадено в лобито |
| `identify` | | вибрират двата контролера |
| `volume` | `value` (0–100) | сила на звука |
| `reboot` | | рестарт (PICO Enterprise) |
| `launch` | `game {id, package, map}`, `server {port}`, `players` | влиза в общата игра на компютъра: `<адреса на лобито>:<port>?HeadsetId=<id>`; отговаря с `launched`, когато е вътре (или `ok:false` след 30 с) |
| `stop` | | връща се в своето лоби (`/Game/Maps/Lobby`) |
| `calibrate` | `corners` | калибриране: десният Trigger отбелязва ъгъл (в проследяването на каската), 4 пъти |
| `applyCalibration` | `calibration {version, origin, yawDeg, width, depth, corners}`, `mapUrl?` | мести нулата на проследяването в арената: `origin` → центъра (0, 0), посоката ъгъл 1 → ъгъл 2 (`yawDeg`) → оста X |

| `lbe` | `enable`, `length`, `width` (3–10 м), `originType` (1 маркер / 0 сама), `distance` (≥ 0,5 м), `openVst` | PICO Large Space бърз режим: включва (или само сменя размера, ако е включен) / изключва → `lbeResult` |
| `lbeOrigin` | `originType`, `distance`, `openVst` | нова нула (сканира маркера пак) → `lbeResult` |
| `lbeStatus` | | казва състоянието → `lbeResult {action:"status"}` |
| `tracking` | `on` | включва/изключва проследяването (6DoF) → `lbeResult {action:"tracking"}`. Само ръчно: превключването спира VR сесията на играта — после рестарт на играта |
| `setBorder` | | отваря настройката на границата на PICO в очилата (под, височина, място) → `lbeResult {action:"border"}` |
| `calibrateFromLbe` | | праща правоъгълника на границата (LBE) → `lbeBounds {reason:"request"}` |
| `largeSpace` | `on` | LBE на ниво система (картата от LSpace) → `lbeResult {action:"largeSpaceOn/Off", largeSpace}` |
| `openLSpace` | | отваря LSpace (нова LBE карта) → `lbeResult {action:"lspace"}` |

Каската → лоби: `lbeBounds {reason, ok, corners [4×{x,z}]}` — вписаният правоъгълник на границата
(`GetBoundaryGeometryPICO(InscribedRectangle)`), в проследяването на каската, метри. Праща го сама на
всеки 5 с, **ако се е сменил** (нова LBE карта), и при `calibrateFromLbe`. Лобито нарежда ъглите с
дългата страна първа и, ако размерът е като залата (10 × 5 ± 1,5 м), записва калибровка `source:"lbe"`
за тази каска и я праща (`applyCalibration`). Ръчното калибриране с 4 ъгъла остава; по време на него
каската показва залата през камерите (`SetVirtualBoundarySeeThroughVisiblePICO`).

Каската → лоби: `lbeResult {action, code, on, length, width, origin}` — `code` 0 готово, 1 неуспех, -3 размер извън 3–10,
104 без проследяване, 201 вече включено, 202 не е включено, 203 не се поддържа, 204 маркерът не е намерен навреме.

Калибровката е **на каска**: ъглите са в проследяването на тази каска, а то е различно за всяка.
**С LBE** (`POST /api/lbe`) всички каски са с една нула от маркера → калибровката се прави веднъж и
се записва като `sharedCalibration` за всички. Включване/изключване на LBE изтрива калибровките.
Лобито пази `calibrations[<id>]` в `data/arena.json` и я праща при всяко свързване, ако версията не съвпада.
Всички каски минават **същите** физически ъгли в **същия** ред.

## Обща игра (компютърът е сървър)

`Builds/Windows/VRArena.exe /Game/Maps/Lobby?listen -LobbyCameras -LiveDir=<lobby/public/live>` —
играта на компютъра, порт **UDP 7777**. Самият компютър е само зрител. Каските влизат при `launch`;
главата и ръцете им се пращат на сървъра 30 пъти/с, изстрелите и попаденията се решават там.
`POST /api/launch` отказва, ако сървърът не върви (няма пресен `status.json` с `mode: "server"`)
или някоя от каските няма калибровка.

## Unreal ⇄ лоби (камерите)

Кадрите са в `lobby/public/live/` (`cam_*_<0..7>.jpg` на кръг + `status.json`). Пише ги или играта
на компютъра (`VRLobbyCameras`, `mode: "server"` — истинската игра), или редакторът с
`VRArena/Scripts/lobby_bridge.py` (`mode: "editor"`/`"play"` — фигури по позициите от лобито).
Двете заедно не бива да вървят. И двете четат `GET /api/state` (`liveWant`). Сървърът дава последния
готов кадър на `GET /live/<камера>.jpg`. Кои камери да снима — `POST /api/live/want {cams:[…]}` от екрана.

## LBE карта: споделяне от каска към каска (07.11.2026)

Каската → лоби: `lbeMap {has, uuid, markers, file, fileTime, bytes, inEffect, width, depth}` — при свързване, на всеки 30 с
и след внос/износ. `inEffect` — кодът на `PE_IsMapInEffect` (0 активна, 101 няма файл, 104 локализацията е изключена) или -1.
`width/depth` — размерът на LBE границата, ако се знае, иначе 0.

| Лоби → каска | Полета | Каската |
|---|---|---|
| `lbeExport` | `requestId` | `PE_SaveLargeSpaceMaps` + `PE_ExportMaps` → най-новия zip от `/sdcard/maps/export` го качва с `POST /api/lbe/upload?headset=<id>&requestId=<id>` (тялото = суров zip, `application/zip`, до 300 MB) → `lbeExportResult {requestId, ok, error, bytes, uuid}` |
| `lbeImport` | `requestId`, `url` (`/api/lbe/map/<mapId>.zip`), `uuid` | сваля zip-а, `PE_ImportMapByPath`, `PE_IsMapInEffect` → `lbeImportResult {requestId, ok, code, error, inEffect}` (`ok`/`code` — от `PE_ImportMapByPath`; `inEffect` — `PE_IsMapInEffect`, -1 не се знае; лобито брои успех само при `ok` и `inEffect` 0 или -1), после нов `lbeMap`. Каската тегли zip-а направо във файл |

Екранът: „Каски" → „⇪ LBE" на каска с карта → избор на каските → `POST /api/lbe/share {from, to:[ids]}`
(`POST /api/lbe/share/cancel` спира). Zip-ът се пази в `lobby/data/lbe_maps/<време>_<каска>.zip` (последните 5).
Всяка стъпка е ред в `data/calibration.log` (`lbeShareStart/Upload/Export/ImportSent/Download/Import/Done/Fail`, `lbeShareMap` при смяна на картата).
Срок: 5 мин за износ + качване, 5 мин за вноса на всички.

## Копие на калибровката и дневник (07.11.2026, gta-vr-1)

Само на този Mac — картата на залата е лична: `lobby/data/calibration_history/` и `lobby/data/*.log` са в `.gitignore`.

- **Копие**: при всяка смяна (`confirm` — 4 ъгъла, `fromBounds` — по LBE, `rotate`, `restore`, `reset`, `lbeImport` — успешен внос на LBE карта)
  лобито пише `data/calibration_history/<време>_v<версия>.json` с всички калибровки ПРЕДИ смяната, а след нея и
  `после:<събитие>` със СЛЕД смяната. Пазят се последните 50.
- **Дневник** `data/lobby_journal.log` — един ред за събитие: `време | каска (id) | събитие №версия | Ш×Д м | ъгъл° | резултат`.
  Събития: `calibDone`, `confirm`, `fromBounds*`, `rotate`, `reset`, `restore`, `restorePrevious`, `applyCalibration`
  (изпратена / не е изпратена), `calibApplied` (каската прие №), `lbeShare*` (вкл. `lbeShareImport` с код/грешка), `migrate`.
  Машинният JSON лог `data/calibration.log` си остава.
- `GET /api/calibration/history` — всички копия; `POST /api/calibration/restore {file}` — връща точно това копие.
- `GET /api/calibration/previous` → `{previous: {file, savedAt, event, width, depth, yawDeg, headsets} | null, matchRunning}` —
  най-новото копие, различно от сегашната, със същото LBE (вкл./изкл.). След връщане се търси по-старо от върнатото —
  всяко натискане връща още една стъпка назад.
- `POST /api/calibration/restore-previous {file}` — връща го (нова версия) и праща `applyCalibration` на свързаните каски.
  `file` = видяното в потвърждението; ако историята се е сменила междувременно — грешка. Отказва по време на мач/игра.
- Кръг 3: всяко копие пази `lbeUuids {<каска>: uuid}` (от `lbeMap.uuid` в статуса; `''` = каската няма карта).
  `restore` / `restore-previous` отказват с ясна грешка, ако сегашният uuid на някоя каска е различен от този в копието
  (сравняват се само каски, познати и в копието, и сега; старите копия без `lbeUuids` не се проверяват).
  `previous` връща и `lbeMismatch: [{id, saved, now}]`.
- Екранът: „Калибровка" → „↶ Върни предишната калибровка" → потвърждение (дата, размер, ъгъл). Спрян по време на мач.

## Мач: червени срещу сини (07.11.2026)

Отбор: **0 = няма, 1 = ЧЕРВЕН, 2 = СИН** (вече няма „оранжев").

Каската → лоби, в `status`: `match {phase, remaining, red, blue, redRounds, blueRounds, roundsToWin,
friendlyFire, headshotOneShot, team, kills, deaths, points, leader, targetKills}`.
Стар APK, който още праща `orange` (без `red`), не чупи лобито: отборът му е 0 („не се знае"), а ако
всички каски са такива, таблото е `?` (`match.legacy = true`).

Лоби → екран (`GET /api/state` → `match`): `red`, `blue`, `redRounds`, `blueRounds`, `roundsToWin`,
`friendlyFire`, `headshotOneShot`, `reds`/`blues` (брой играчи), `unbalanced` (разлика > 1 — само
предупреждение, никой не се мести сам), `legacy`, `legacyCount`, `board[] {id, name, team, legacy, kills, deaths, points}`.
`headsets[].team` — отборът по статуса на каската. `teamWant {headsetId: 1|2}` — къде операторът е сложил
каската (последно). `matchCfg` — текущият режим. `matchRunning` — тече ли мач (фаза 1 или 2).

### Команди към играта (`matchCmd`, чете ги `VRLobbyCameras` на компютъра)

`GET /api/state` → `matchCmd` е **една** команда с растящ `seq`. Играта я прилага веднъж, ако `seq` > последния.
Всяка команда носи и целия режим:
`{seq, command, teams, targetKills, roundSeconds, roundsToWin, friendlyFire, headshotOneShot}`;
`command` = `settings` | `start` | `restart` | `stop` | `setTeam`. За `setTeam` има още `headsetId`, `team` (1/2).

**Опашка (нищо не се губи):** ако операторът даде две команди бързо (напр. `setTeam` и `start`), лобито
показва следващата чак когато играта е видяла текущата (`GET /api/state` от Unreal — user-agent без
`Mozilla`/`python`/`curl`/`node`/`wget`) или след 3 с, ако играта не пита. Така сегашната игра, която
чете само `matchCmd`, получава всяка команда по ред (≈ 0,3 с между тях). `matchPending` = колко чакат.

Допълнително (за по-нова игра): `matchCmds` — последните до 20 команди (същите обекти, по `seq`).
Игра, която ги чете, прилага всички с `seq` > последния, по ред. При първо питане (след старт на
играта) — само най-новата + `teamWant` за всички каски, и `LastMatchSeq` = най-големия `seq`.

Стара игра, която не знае `setTeam`, я прилага като `settings` (режимът е вътре) — без вреда.

Екран: `POST /api/match {command, teams, targetKills, roundSeconds, roundsToWin (1–9), friendlyFire, headshotOneShot}`;
`POST /api/match/team {headsetId, team}` (или `POST /api/match {command:"setTeam", headsetId, team}`) → `setTeam`.
Грешен отбор / непозната каска → 400.

### Кръговете преди рунда (Arena6x6, 08.11.2026)

Каската → лоби, в `status.match` (по желание; стар APK и другите карти не ги пращат):
`inCircleRed`, `inCircleBlue`, `neededRed`, `neededBlue`, `startCountdown` (секунди, от `AVRArenaGameState`), и
`inCircle` (bool, само тази каска — за името на липсващия). Приемат се и с главна буква (`InCircleRed`).

Лоби → екран (`GET /api/state` → `match.circle`): `{inRed, inBlue, neededRed, neededBlue, countdown, missingKnown,
missing: [{id, name, team}]}` или `null`, ако няма каска с `neededRed`/`neededBlue` > 0. При `null` екранът не показва блока.

Команда `forceStart` („Старт въпреки това“): `POST /api/match {command: "forceStart", ...}` → през опашката, в `matchCmd`
като `{seq, command: "forceStart", ...режимът}`. Лоби без тази версия я превръща в `settings`.

### Колоните от LBE (Arena6x6, 08.11.2026)

Каската → лоби, в `status` (на горно ниво, не в `match`; стар APK не го праща): `lbeColumns: [{x, y, r}]` — световни координати, см.
Лоби → сървърът на играта: **`GET /api/state` → `lbeColumns`**, на горно ниво, до `matchCmd`/`matchCmds`/`matchCfg`.
Винаги е масив; `[]` = още няма списък.

- Пази се последният непразен списък, от която и да е каска. Празен списък, поле, което не е масив, или елементи без крайни числа `x`, `y`, `r` (`r` > 0) не го трият. До 64 колони.
- При смяна на картата на общата игра (`POST /api/launch`, `POST /api/stop`) списъкът се чисти и 10 с след това не се приема, защото каските още са на старата карта.
- Пази се само в паметта; след рестарт на лобито идва със следващия статус.

### LBE по време на мач
Докато тече мач (`matchRunning`), `POST /api/lbe` с `enabled: true`, `POST /api/lbe/origin` и
`POST /api/largespace` връщат 400 — могат да презапишат нулата на каските. На екрана тези бутони
(„Бърз режим", „Включи LBE на всички", „Сканирай маркера пак", ключът „Pico LBE режим") са спрени по
време на мач, а иначе питат с предупреждение.

### Номер на каската (08.11.2026)
`/api/state` → `headsets[].number`: постоянен номер, започва от 1, пази се в `arena.json` → `numbers`. Познатите каски (с калибровка) го взимат при старт по реда на серийния номер, новите при първа поява. Екранът „Каски“ → „Покажи каските“ показва онлайн каските с номер; „Сподели LBE зона“ на реда ползва `POST /api/lbe/share` и иска `lbeMap.has`.

### serverInfo (09.11.2026)
Лоби → каска: `{ "type": "serverInfo", "up": true, "map": "/Game/Maps/Lobby", "port": 7777 }`. Стара каска го пренебрегва.

- `up`: играта на компютъра върви (камерите ѝ са писали в последните 5 с).
- `map`: пълният път на картата на общата игра.
- `port`: портът на играта; адресът е този на лобито.
- Праща се веднага след `welcome` и на всички свързани каски при промяна на `up` или `map` (проверка на 2 с).
- При смяна на картата `map` се сменя веднага, а Unreal зарежда още секунди; при неуспешно влизане каската опитва пак.
- Каска, отворена сама, влиза в общата игра само ако `up` е `true` и `map` е `/Game/Maps/Lobby`.
- `up` е по каска (10.11.2026): `false`, докато тази каска калибрира (`phase: calibrating` или чака „Потвърди“) или участва в незавършено LBE споделяне (износ/внос). Така тя не влиза сама в общото лоби насред калибриране или внос.

## Гласуване за карта (10.11.2026, arena13 т. 5)

Всички в общото лоби са дали READY на часовника (`UVRWristWatch::AreAllReady`) → сървърът на общата игра
(`AVRMapVote`, пуска се сам в `Lobby*` на listen сървъра) започва гласуване. Таймерът и броенето са в лобито.

| Заявка | Тяло | Отговор / какво прави |
|---|---|---|
| `GET /api/mapvote` | | изгледът (по-долу); `AVRMapVote` го чете на 0,5 с |
| `POST /api/mapvote/start` | `headsetIds?` (каските в общото лоби; празно → свързаните свободни), `seconds?` (5–120, по подразбиране 30) | `{ok, vote}`; ако вече тече — `{ok, already:true, vote}`. 400 `{error, code, retryAfter?}`, ако върви игра (`session`) — виж „Откази и повторен опит“ |
| `POST /api/mapvote/vote` | `headsetId`, `gameId`, `voteId?` | `{ok, vote}`; гласът може да се смени; непозната каска се добавя към гласоподавателите. 400: няма гласуване / старо `voteId` / карта извън гласуването |
| `POST /api/mapvote/cancel` | `reason?` | спира текущото (`state: cancelled`) |

Изглед (`vote`, също `GET /api/state` → `mapVote`):
`{id, state, options:[{gameId, name, label, map, color, votes}], voters, voted, votes:{headsetId: gameId}, remaining, seconds, result, error}`.
- `state`: `idle` | `voting` | `launching` | `launched` | `failed` | `cancelled`. Резултатът стои 15 с, после пак `idle`.
- `options`: първите **2** игри от `games.json` с карта в APK-то (без `Lobby*`); първата е „по подразбиране“.
  `label` — на латиница за надписа в очилата (`games.json` → `label`, иначе id-то с главни букви).
- Край: **мнозинство** (гласове × 2 > гласоподаватели) → веднага; **всички гласуваха** → най-много гласове
  (равенство → по-рано в списъка); **30 с** → най-много гласове, а при **0 гласа → първата карта**.
  `result: {gameId, name, reason: majority|all|timeout|empty}`.
- Пускането е **същото** като бутона на екрана: `POST /api/launch {gameId, headsetIds: гласоподавателите}`
  (serverMap → `VRLobbyCameras` прави ServerTravel → `launch` към каските). Грешка оттам → `state: failed`, `error`
  (и тост); `AVRMapVote` тогава нулира READY (`UVRWristWatch::ResetAllReady`).
- Операторът пусне игра с бутона или `POST /api/stop` по време на гласуване → `cancelled`.

### Откази и повторен опит (arena13h, 10.11.2026 — върви в живото лоби от 19:39)

- Отказ от `POST /api/mapvote/start` е HTTP 400 с `{error, code, retryAfter?}`:
  - `code: "busy"`, `retryAfter: 5` — върви игра (`session`). Клиентът пробва пак след `retryAfter` секунди.
  - `code: "no_maps"` (без `retryAfter`) — няма карти в `games.json`; нов опит няма смисъл.
  - Без отговор от лобито → клиентът пробва пак след 5 с.
  Никой не трябва да маха READY: всяко `start` след `failed` / `cancelled` / `idle` прави ново гласуване с нов `id`.
- `failed` може да дойде и СЛЕД `launched`, със същото `id`:
  - общата игра не мине на картата за ~60 с → `error: "картата X не тръгна"`;
  - никоя каска не зареди картата за 120 с → `error: "каските не заредиха картата"`.
  И в двата случая каските са пак `idle`, `session` е `null`, `serverMap` е лобито — може да се гласува веднага.
- Каска, паднала по време на игра, се води в играта още **30 с** без връзка, после е `idle`. Когато никоя каска
  от сесията не играе и не зарежда, сесията свършва и `start` пак е позволен. Върне ли се каската с пусната игра
  (`hello` с `app`), пак е `playing`.
- Каска, която „зарежда“ над 120 с без отговор, става `idle` и получава `stop`.
- `match.elapsed` (в `/api/state` → `match`): изминалите секунди от рунда, когато няма лимит (`remaining` е 0).
  Ако каската праща `match.elapsed`, важи нейното число; иначе лобито брои само от първото `phase: playing`
  (нулира се при рестарт на лобито). При рунд с лимит е 0.

### Чака рестарт (arena13i — файл `server.js.next_arena13i`, НЕ е в живото лоби)

- `POST /api/mapvote/vote` от непознато `headsetId` → 400 `code: "unknown_headset"`; гласът не се брои и не вдига
  прага. Броят се каските, които лобито познава, и `desktop-*` (проба без каска).
- Гласуване без нито един гласоподавател → `failed`, `error: "няма гласоподаватели"`; нищо не се пуска.
- `POST /api/launch`, докато върви ДРУГА игра → 400 `code: "busy"` („първо Стоп“). Същата игра: свободните каски
  влизат в нея като закъснели, сесията остава същата.

## Събития от мача към други приложения (arena14, 12.11.2026 — файл `server.js.next`, НЕ е в живото лоби)

Лобито праща края на рунд и края на мач с HTTP POST (напр. към LabCoin).

- Настройка: `data/webhooks.json` → `{"urls":["http://127.0.0.1:4780/api/arena/event"]}` (до 5 адреса, само http/https).
  Файлът се чете при всяко събитие (без рестарт). Няма файл или списъкът е празен → важи env `LABCOIN_EVENT_URL`
  (един адрес или няколко със запетая; чете се при старта на лобито). Няма нито едното → нищо не се праща и нищо
  не се пази. Адрес по подразбиране няма.
- `round_end`: `redRounds` или `blueRounds` се е увеличил. `winnerTeam` е отборът, чийто брой е нараснал.
  Рунд наравно не дава събитие (броячите не мърдат).
- `match_end`: веднъж на мач. Фаза `over` идва след ВСЕКИ рунд, затова сама не стига. Праща се, когато:
  отбор стигне `roundsToWin`; или каската прати `match.matchOver: true`; или при `over` надписът `leader` съдържа „МАЧ“
  („…ПЕЧЕЛЯТ МАЧА“, „МАЧЪТ Е НАРАВНО“ — таван рундове); или `roundsToWin` е 0 и фазата стане `over`.
  `winnerTeam`: отборът с повече рундове; при 0:0 рунда — с повече точки; иначе 0.
- Нов мач (`matchSeq` + 1): „start“ от оператора, пускане на игра, или рундовете са се нулирали.
- Тяло (`Content-Type: application/json`):
  `{v:1, type, eventId, at, matchSeq, gameId, round, winnerTeam, redRounds, blueRounds, roundsToWin, red, blue, board:[{headsetId, number, name, team, kills, deaths, points}]}`.
  `eventId` = `<време на старт на лобито в ms>-<пореден №>`; `gameId` е `null`, ако играта не е пусната през лобито;
  `round` = `redRounds + blueRounds`; `team` е 1, 2 или 0.
  `board` (и в двете събития) пази всяка каска, видяна от началото на мача: редът е `{…, online}`. Каска, излязла от
  мрежата, остава с последните видяни точки и `online: false`. Таблицата се чисти при нов мач.
- Ред: за всеки адрес има опашка — по едно събитие наведнъж, по реда на случване. Докато едно е в повторни опити,
  следващите чакат (`match_end` не изпреварва `round_end`). След 3 неуспешни опита то се отказва и тръгва следващото.
  `at` е от часовника на лобито, от момента на края (не от момента на пращане).
- `GET /api/state` → `headsets[].nameIsCustom`: `true`, ако каската има собствено име в `arena.names`
  (`POST /api/headset/rename`), `false`, ако `name` е името на устройството.
- Изпращане: 2 с след събитието (да дойде и последното убийство в таблицата), без да спира лобито; 2 с чакане на опит;
  3 опита (сега, след 1 с, след 3 с); успех е HTTP 2xx. Всичко се пише в `lobby.log` („Събитие …“).
- `GET /api/match/events?since=<eventId>` → `{ok, enabled, boot, events:[…]}`: последните 50 събития след `since`
  (без `since` или с непознат → всички). Пазят се само в паметта — рестарт на лобито ги губи, а `boot` се сменя.
- След рестарт на лобито по средата на мач първото виждане само се запомня — събитие няма.
