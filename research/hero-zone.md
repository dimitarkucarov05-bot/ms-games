# Hero Zone (Hero Launcher 2.25.4): full analysis

Studied 2026-11-16 for MS Games. Sources:
- **Launcher:** the original TypeScript, recovered from the source maps Hero ships inside `app.asar`.
- **Headset app:** the manifest of `backgroundService.apk`, read with the Android SDK's `aapt`.
- **REA:** used to set up the study and to probe the package.

Nothing was run, installed or copied. Everything below is behaviour and design, written in our own words. File references point into the recovered source (`scratchpad/hero/srcdump/src`) so any claim can be checked again.

Licence: a cloud token, refreshed every 10 s, decides whether Launch is allowed. It is either credits per player or a time licence, with a short offline grace period. We do not need or copy any of this.

---

## Part A. How it is built

### A1. Shape
- **Every game has two halves:**
  - a **Windows half** on the operator PC: the game server or spectator, started by the launcher as a child process;
  - an **Android half** on each headset.
- A small **headset background app** (`com.herozone.launcher`, "Hero Zone Background Service"):
  - starts on boot (BOOT_COMPLETED plus Pico's auto-boot service hook) and runs as a foreground service;
  - may draw over other apps;
  - has storage access.
- **The launcher is one Electron app.** Inside it is one HTTP + WebSocket server on port **7788**; if that is busy it tries 7789–7793, probing each with a 400 ms connect test (`main/Server.ts:73-116`).
- **The core idea:** the launcher is a hub that holds the *desired state* ("everyone should be in game X with these settings") and keeps pushing every client toward it. Clients never need to remember anything.

### A2. Finding headsets
- **Multicast:**
  - The PC listens on UDP **14006**, joined to group **239.255.255.250** on every LAN adapter, TTL 1.
  - A headset asks `HZ_DISCOVERY_REQUEST`. The PC answers by unicast `HZ_DISCOVERY_RESPONSE {ip, port}`, choosing the adapter whose first three octets match the headset's address (`network/MulticastDiscoveryService.ts`).
  - If no adapter matches, it says nothing. Different subnets therefore never find each other.
- **Fixed IP fallback:** over USB, the launcher writes `Config.json` to the headset (`useFixedIp`, `serverIp`, `webSocketPort`). This is meant for two PCs on one network (`adb/AdbDevice.ts:328-363`).
- **Several network adapters:** the first launch asks which one to use. The chosen adapter is passed to the game server as `macAddressToUse` (`game/gameProcess.ts:82-94`).
- **Firewall:** a bundled elevated helper, `HZ-FirewallExceptions.exe`, adds an allow rule for the launcher and every game exe (`misc/FirewallExceptionManager.ts`).

### A3. Identity that survives Wi-Fi
- **Identity is set over USB:** at install time the adb serial is written to the headset (`/sdcard/pixnami/deviceId`), and the headset uses it as its websocket `deviceId`.
- **Result:** the name, colour and number the operator gives a headset over USB follow it onto Wi-Fi for ever (`AdbDevice.ts:146-158`, DB table `Headsets`).
- **Duplicate IDs:** a new socket with the same id kicks the old one (`WebsocketServer.ts:129-135`).

### A4. Connection and liveness
- **Handshake:** query parameters carry `deviceId`, `platform`, `clientType`, `state`, battery, `currentGame`, `gamesVersion`.
- **Heartbeat:** text "ping"/"pong" every **500 ms**. Three misses (about 2 s) drop the client (`WebsocketServer.ts:268-294`).
- **On every connect the PC pushes the full context:**
  - all custom settings (play-space size always included);
  - the shared calibration offset `{x, y, yaw}`;
  - name and colour;
  - whether a multi-session is running;
  - after 5 s, name entry if a session needs names (`WebsocketServer.ts:200-234`).
- So a reconnect is not a special case. The headset simply gets everything again.
- **Self-healing loop:** every 500 ms, any game client running the wrong package gets `launchPackage` again. Benched ("disabled") headsets are sent to the waiting room (`WebsocketServer.ts:262-266, 334-365`).

### A5. Message protocol
- **Envelope:** `{command, data, messageId?}`. A request with a `messageId` waits up to 5 s for a reply with the same id.

| Direction | Messages |
|---|---|
| PC → headset game | `launchPackage`, `receiveCustomSettings`, `receiveLauncherCalibrationOffset`, `setNameAndColor`, `isMultiSession`, `playerName:startSelection`, `showLaunchGameCountdown` (3 s), `gameStarting {gameId, level}`, `quit`, `pause`/`unpause`, `restartGame`, `calibrateHeight` (operator height − 15 cm), `focusCycle` (Quest tracking fix), `ReselectWeapon`, `setHandedness`, `setUseCrossbow`, `StartSafetyTutorial`, `ShowRemoveHeadset {text}`, free `message`, `toggleDisabledState`, `reloadWaitingRoomFloorTexture` |
| PC → Windows game server | `start`, `updateDifficulty`, `multiSession:start/end`, `receivePreviousScore`, `setSeasonalEvent`, per-game controls (`skipCurrentPuzzle`, skip to section) |
| Game → PC | `gameStarted`, `gameEnd {score, duration, won, player_count, difficulty, level, metadata}`, `quitGame`, `requestPreviousScore`, `insertScore {teamName}`, `generateScorecard {totalScore, players[{name, kills, deaths, assists, score, extraData}], levelIndex, duration}`, `clientError` (wrong or outdated build), `clientWarning`, `needsCalibration`, `onCalibrated`, `sendBatteryInfo` (headset + both controllers + vest), `playerName:submit`, `gameSelection:finish {gameId, difficulty, level, gamemode}`, free-form state such as `isInMainLevel` and puzzle start/stop (pushed to the UI every 1 s) |
| Headset background app | in: `headsetTelemetry:update` (battery, charging, controllers, OS version). out: `kioskMode:tryLaunchGame`, `openWaitingRoom`, `picoLBE:*`, `picoDevice:updateSettings` |

- The background app *can* launch games, but Hero turned that off: launching from the game client proved more reliable.

### A6. Installing and updating
- **PC download:**
  - A CDN `latest.json` names the version per channel (latest/beta/alpha). `<version>/index.json` lists each file with its MD5, size and block map.
  - Files are verified and downloaded in **5 MB chunks** with HTTP Range requests: 3 files and 4 chunks in parallel. Chunks that already match are skipped, which makes patches cheap.
  - A failed chunk is retried with backoff up to 100 times, and the whole file is checked by MD5 at the end (`DownloadManager.ts`).
- **Headset install, USB only** (wireless adb serials are ignored):
  1. The model is read from `ro.build.product`: hollywood = Quest 2, eureka = Quest 3, panther = Quest 3S, plus Pico and Vive models.
  2. Free space below 2 GB aborts; below 8 GB warns.
  3. The headset keeps `GameHashes.json` (the MD5 of every installed APK). Only changed or missing APKs are reinstalled.
  4. Each install is: uninstall, push to `/data/local/tmp`, `pm install -r`, delete the temp file, record the hash. The output is parsed for Success/Failure, because `pm` can exit 0 on failure.
  5. Every game gets storage, microphone, location and Bluetooth permissions (Bluetooth is for haptic vests).
  6. The version stamp is written **only after every step succeeds**.
  7. All plugged headsets install in parallel, and unplugging cancels cleanly (`adb/GameInstaller.ts`, `AdbManager.ts`).
- **Headset tools over USB:**
  - pause the Quest guardian;
  - turn off the proximity sensor;
  - disable Quest OS updates;
  - mount MTP;
  - push config;
  - start the background service (`HeadsetTools.ts`).
- **Kiosk mode:** every 5 s the background app is told to relaunch the current game, or the waiting room when idle. On Pico the system menu button is also disabled.

### A7. Play area and calibration (Hero's way)
- **Room presets:** 3×3, 4.5×4.5, 6×6, 6×9 m. Each game maps the room size to its own level or map.
- **Quest, in-game calibration:**
  - The player stands on the physical **reference spot** and presses a button combo.
  - An optional "hold every button" combo prevents accidental recalibration.
  - Headsets report `needsCalibration`/`onCalibrated`, and the operator tile turns orange until done.
- **Calibration variants:**
  - 2-point (front-left corner, then back-left corner) for large rooms;
  - floor-level (headset placed on the floor, ±200 offset);
  - mixed reality.
- **Shared coordinates:**
  - The launcher stores one global offset `{x, y, yaw}`, set in a top-down editor: drag and rotate a headset icon to where the real calibration spot is inside the room rectangle.
  - It is sent to every headset on connect and on change. Every headset is calibrated to the same spot, so all agree.
- **Pico/Vive LBE mode:**
  1. One headset exports its spatial map as a zip to the PC.
  2. The PC hosts it and every other headset imports it, checking an MD5 to skip unchanged maps.
  3. Who has which map is tracked per headset.
- **Safety:**
  - red custom boundary;
  - passthrough outside the area;
  - proximity warning between players;
  - start-position circles;
  - safety tutorial on demand.

### A8. Sessions
- **Quick Play:**
  1. Pick a game. The waiting room shows a 3 s countdown.
  2. Running game exes are killed and the Windows half is spawned with launch arguments.
  3. The 500 ms loop drives every headset into the game together.
- **Waiting room:** its own small game. It is reopened after each game and shows the top-100 high scores per game and a custom floor texture (venue logo).
- **Multi Session (party mode):**
  - Settings: max games 1–20 (default 4), seconds between games 20–120 (60), vote time 10–60 s (60), birthday mode, which games are votable.
  - Players type names, then **vote for the next game and its difficulty inside the headset**.
  - It ends by itself when the game budget is used.
- **Playlist:**
  - A fixed queue of `{game, options}`, with one optional difficulty override for all.
  - Name entry is capped at 45 s. An optional break between games is 30–300 s.
  - Team name (≤ 15 characters) auto-writes the high score. Skip, restart, end with confirm. Presets are saved.
- **A headset drops mid-game:**
  - Its tile disappears after about 2 s and the game continues.
  - When it returns it gets the full context, and the loop pulls it back into the running game.
  - Rejoining the match itself is the game's job.
- **End of game:**
  - `gameEnd` goes to cloud stats (or an offline queue), then `quitGame`. The launcher kills the process and opens the waiting room or advances the playlist.
  - A game that quits without results raises an error report.

### A9. Scores and scorecards
- **High-score table:** local SQLite. Rank = number of higher scores + 1. Rank 1 gets a **"new top team"** moment.
- **Scorecard:**
  - The game sends one flat payload. The launcher adds the game name, team name, level name and rank, drops empty slots and sorts by score.
  - Each game chooses its columns (score only; or kills/deaths/assists).
- **Rendering:** a hidden window renders the card at **1000×1250** twice:
  - a dark transparent **PNG** for sharing;
  - a white, low-ink **JPEG** for printing.
- A JSON sidecar lets a card be regenerated later. The "card ready" toast stays 10 s.
- **Gallery:** print (A4, silent), PDF preview, delete, open folder.
- **Branding:** the venue's own light and dark logos ("presented by"), with a live preview.

### A10. Operator support features
- **Diagnose:**
  - PC IP from the chosen adapter, headset IP via adb;
  - pings both ways (including headset → PC run on the headset through adb);
  - firewall state, game versions on both sides, fixed-IP config;
  - refreshes every 5 s, with "View instructions" per check.
- **Bug report:** one zip with launcher log, PC game logs, headset logs and a 1 s logcat snapshot, plus a description.
- **Crash uploader** for engine crash folders.
- **Auto-update:** release channels; the operator chooses when to download and apply.
- **Seasonal themes:** Halloween in October, Christmas from 1 Dec to about 8 Jan, plus birthday mode.
- **AI help chat** inside the launcher.
- **DB** (`heroLauncher.db`) tables: Teams (scores), Headsets (id, name, colour, number, type, version, last used, map), settings, PicoMaps, PlaylistPresets.

---

## Part B. How their games are designed

### B1. Catalogue
Player counts are given per room size: 3×3 / 4.5 / 6×6 / 6×9. A dash means the size isn't supported.

| Game | Kind | Players | Length | Modes / maps | Difficulty |
|---|---|---|---|---|---|
| Dead Ahead | co-op zombie waves | 1-3 / 1-4 / 1-6 / 1-6 | by waves; Short = one wave fewer, shorter waves | Church, Hospital, City, Circus | easy / normal / hard / nightmare |
| Cyber Shock | arcade score | – / 1-4 / 1-4 / 1-6 | – | – | easy–nightmare |
| Arrowsong | co-op archery waves | 1-3 / 1-4 / 1-6 / 1-6 | waves, "shorter waves" | Dungeon, Goblin Mine | easy–nightmare |
| Arrowsong: Dark Omen | campaign level | as above | 9 or 12 min | one level | easy–nightmare |
| Quantum Arena | PvP | – / 2-4 / 2-4 / 2-6 | 3 min × 3 rounds (max 12 min total) | TDM, FFA, Ball; 4 maps | – |
| Cops vs Robbers | heist vs AI + PvP | – / 2-4 ×3 | 8 min | Heist, TDM, FFA, Gun Game, Team Gun Game; one map per room size | Heist only, fixed once started |
| Cook'd Up | co-op cooking | – / 1-4 / 1-6 / 1-6 | 5-10 min (8) | – | – |
| Espionage Express | escape room | – / 2-3 / 2-3 / 2-6 | 10/15/20 min | – | easy/normal/hard |
| Escape From Aurora | sci-fi escape room | – / – / 1-6 / 1-6 | 30-60 min (45); short version 15 min | 10 sections | – |
| Wizard Academy | family magic | – / 1-4 / 1-6 / 1-8 | 5-20 min (15) | Exam, Free Play | – |
| Plush Rush | family | 1-3 / 1-4 / 1-6 / 1-8 | 5-15 min (10) | – | easy/normal/hard |
| Monkey Madness | family party | 1-3 / 1-4 / 1-6 / 1-8 | Short / Long | – | – |
| Terminator Uprising | licensed co-op shooter | 1-3 / 1-4 / 1-6 / 1-8 | 9 or 12 min | – | easy–nightmare |
| Versus | PvP lasers | – / 2-4 / 2-4 / 2-6 | 3 min × 3 rounds | Team, FFA; 7-10 maps per room, "Random" first | Classic / Pro |
| Trials of Atlantis | challenge adventure | – / 1-4 / 1-6 / 1-8 | 15 or 30 min | – | – |

### B2. Design rules that come out of the catalogue
1. **Player counts per room size, and maps tagged by the rooms they fit.** A game that can't run in the current room is greyed out, with the reason shown.
2. **Time is the product.** Lengths come in fixed cuts (9/12, 10/15/20, 15/30), and longer cuts cost more credits. PvP total time is capped near 12 minutes.
3. **One shared difficulty scale** (easy, normal, hard, nightmare). Nightmare is only for the shooters; PvP uses Classic/Pro instead.
4. **The operator owns money, time and safety** (length, gore, swearing, room size). **Players own fun choices** (skin, team, the next game by vote). The operator can override anything mid-game.
5. **Mixed ages:**
   - gore and swearing switches;
   - a "hide beer bottles" decor switch;
   - easy mode, auto-solve and skip-puzzle;
   - a grab mode where kids cannot drop weapons;
   - subtitles in 5-9 languages per game;
   - a family block in the list.
6. **Arena-ready checklist:**
   - a timed character room (30-100 s, default 45) and a warm-up range (default 60 s), both skippable;
   - skippable intro and tutorial;
   - start circles;
   - pause;
   - a results payload and a scorecard payload;
   - battery reporting;
   - a "needs calibration" signal;
   - live per-player fixes: restart this headset, reopen weapon menu, swap hand, calibrate height.

### B3. Operator experience
- **Clicks to a running game:**
  - Quick Play: 3 (Quick Play → cover → Launch);
  - Multi Session: 2 (players drive the rest);
  - Playlist preset: about 4.
- Opening any of the three modes also opens the waiting room in the headsets, so they are already loaded.
- **Live controls:** change difficulty, pause, start (when a game waits), skip puzzle or section, quit.
- **Always on screen:** push-to-talk, waiting-room toggle, credits or time left, status dot.
- **Background right-click menu:** send message, "remove headset" message, safety instructions, name entry, birthday mode.
- **End screen:** length, credits used, games and player counts, the remove-headset message button.
- **Headset rows:**
  - number on a colour square;
  - editable name (≤ 12 characters, upper case);
  - battery for left controller, headset and right controller, with a charging bolt;
  - vest icon;
  - state icon (ready, loading, error, warning, needs calibration).
  - A bench checkbox parks a headset in the waiting room.
- **Settings sections:** Setup, Map Sharing, Devices, Headset Tools, Diagnose, High Scores, Scorecards, Advanced, About.
- **Setup:** four plain rows: Download/Update, Install by USB, Play Area Size, Spectator Display.
- **Look:** dark, with blurred glass panels and one sentence of help per option. Launcher languages: English, Chinese, Russian.

---

## Part C. What MS Games should take from Hero Zone (ranked)
1. **Desired-state loop:** the server re-sends "be in game X" every 500 ms to any headset that is not, so crashed, rebooted or late headsets fix themselves.
2. **Full context on every connect** (settings, calibration, name/colour, session). A reconnect is free.
3. **USB-assigned identity** that follows the headset onto Wi-Fi (name, colour, number).
4. **Headset app that starts on boot** and keeps the game in front (kiosk loop). This is the answer to "R3 does not start by itself".
5. **Hash-based install** (APK/web-bundle hashes kept on the headset; stamp only after success) and chunked, resumable PC downloads.
6. **Quick Play in 3 clicks**, with the waiting room opened as soon as the operator enters a mode.
7. **Player counts per room size; grey out with a reason.**
8. **Fixed time cuts and one difficulty scale,** changeable live.
9. **Playlists with presets** and **party mode with in-headset voting**, ending at N games.
10. **Per-headset right-click fixes** (restart one, height, hand, weapon menu, remove-headset message, bench).
11. **Results payload → branded dark PNG + print JPEG scorecard,** a local record board and a "new top team" moment.
12. **Timed character room and warm-up range;** start circles; safety tutorial; proximity warning; passthrough outside.
13. **Diagnose page** (pings both ways, firewall, versions) and a **one-click bug report** zip.
14. **Seasonal themes and birthday mode;** venue logo on the waiting-room floor.
15. **Shared calibration offset** set in a top-down drag-and-rotate editor (VEX's calibration is weighed against this in the VEX report).
