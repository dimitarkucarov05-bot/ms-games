# MS Games 2: design and build contract

Owner's brief (2026-11-16):
- VEX's design and VEX's calibration;
- games played the way Hero Zone runs them;
- the best of both plus his own concept;
- delivered as a finished, tested EXE that works on any arena PC and any Wi-Fi.

Sources: `hero-zone.md`, `vex-machinery.md`, `vex-games-ux.md`, plus the owner's concept already in MS Games:
- a launcher with a game library;
- a mini lobby camp with fades between games;
- custom boundaries drawn in the headset with a laser;
- two touched calibration points held by persistent anchors;
- a headset app that finds the PC on any Wi-Fi;
- only Synty models, real sounds and haptics;
- no AI-looking screens inside games.

**Line we hold:** we take structure, flows and ideas. We never copy their code, art, text, colours or fonts, and we never touch licence checks or their servers. "VEX's design" means VEX's *layout grammar and flow* (touch-first, big tiles, status bar, guided wizard, explained guard-rails), drawn in MS Games' own look (`lobby-stage/public/console.css` tokens, see `DESIGN.md`).

Where code lives: everything is built in `vr-arena/lobby-stage` (git repo, baseline `cdc5711`). The live arena (`vr-arena/lobby`, port 47801) is never edited or restarted by sessions. The headset app is the exception: it lives in `vr-arena/lobby/tools/apk-lan` (build tooling, not served).

---

## 0. Owner direction #2 (2026-11-16, overrides anything below that conflicts)

1. **Reimagine all of MS Games; touch everything.** Rebuild it the way it should be, not as a patch on the old console and flows. Nothing old is sacred except:
   - the persistent-anchor calibration;
   - the any-Wi-Fi headset link;
   - The Motel's content.
2. **The Back Room is gone.** It is archived in `vr-arena/_archive/the-back-room-2026-11-16.zip` and removed from `lobby-stage` (commit `aee43bf`). **MS Games ships with The Motel only.** Keep the platform able to take more games later (manifests), but every screen must look right with a single game: no empty grid. A single game becomes the hero of Home.
3. **VEX wins on everything visible:**
   - visuals;
   - presentation;
   - **loading** (the transition into the game, the in-headset loading);
   - **spectating** (the TV / second-monitor view of a running game);
   - **calibration**.
   Make ours at least as polished as VEX's.
4. **Hero Zone wins on game tactics only:** what makes the games themselves better to play (pacing, warm-up, waves, records, voting, per-player fixes). Its presentation and its calibration are weak; do not imitate how it presents.
5. **Game quality and feel:** study what makes arena games actually interesting and high quality. Raise The Motel to that level:
   - pacing, variety, scripted moments, feedback, juice;
   - **professional sound**: download the best royalty-free libraries licensed for commercial games and use them. We do not take sound files out of VEX or Hero Zone; their sounds are their property.
6. **Spectator view** becomes its own workstream (S7): a TV page with live cameras, follow cams, the score, and attract mode (trailer and records) when idle.

### 0b. Owner direction #3 (2026-11-16): brand, colours, shared lobby

1. **Brand look.** VEX's design approach (bold, branded, polished) in **our own colours**: VEX is blue, so we are **green, white and yellow**. The palette replaces the old neutral and volt look everywhere: console, TV, headset UI text accents, scorecards, installer.

   | Role | Value |
   |---|---|
   | Base (night green) | `oklch(0.155 0.022 155)` |
   | Panel | `oklch(0.19 0.026 155)` |
   | Line | `oklch(0.28 0.03 155)` |
   | Primary (arena green) | `oklch(0.76 0.19 148)` |
   | Deep green | `oklch(0.52 0.15 150)` |
   | Accent (signal yellow) | `oklch(0.91 0.17 100)` |
   | Text (white) | `oklch(0.97 0.012 130)` |
   | Muted text | `oklch(0.72 0.02 140)` |

   Fonts stay local: Sofia Sans, plus Sofia Sans Extra Condensed for display and wordmark.
2. **Logo:** an original **M** mark ("MS GAMES / VR ARENA"). Three options are in `lobby-stage/public/brand/options.html` (render: `research/shots/brand/logo-options.png`): A Peak, B Visor, C Stack. The owner picks one; until then use **C Stack** as the placeholder. The final SVGs go in `public/brand/` (`logo.svg`, `mark.svg`, `icon-512.png`). The logo appears in:
   - the console top bar and the splash/loading;
   - the TV attract mode;
   - the installer and the app icons;
   - the lobby floor and walls in the headset (as a decal or sign; the owner's brand art is allowed there).
3. **One shared lobby for the whole system** (like VEX Lobby). It is not a Motel camp: it is the MS Games hub world that every headset sits in between games and from which every game is launched. It holds:
   - a neutral, premium branded space in green, white and yellow light;
   - the M logo on the floor or wall, and the venue logo when one is set;
   - **game portals or doors**, one per installed game, with its key art on a Synty billboard or poster prop (today: The Motel);
   - the **record board**;
   - a **mini-game for waiting players** (a shooting range with its own high score);
   - the vote and countdown;
   - seasonal dressing.

   It is built from any Synty pack (city, shops, nightclubs, sci-fi or whatever fits best), at natural size. The current zombie camp can become The Motel's own intro scene (the place behind its portal), so the work is kept.

## 1. What comes from where

| Area | Taken from | What it means for us |
|---|---|---|
| Operator console layout and flow | VEX | Session type, then game grid with greyed reasons, mode cards, players and headsets, settings panel, pre-start check, Start; status bar always visible; Simple/Advanced toggle |
| Setup wizard | VEX | Numbered steps with entry points First setup / Add headset / Reset play area / Re-calibrate points; prep checklist; per-headset sync rows |
| Calibration | VEX two-point, plus our anchors | Two floor marks at least 2 m apart. The first headset defines them, every other headset confirms them one by one, and the console shows Point 1 / Point 2 / Done per headset. Persistent anchors keep it across headset off/on |
| Play area | VEX presets plus our drawing | Either a preset rectangle (4x4, 5x5, 6x6, 6x8, 8x8, 8x10, 10x10, rotation 0/90/180/270, entrance side) placed from the two marks, or a custom boundary drawn with the laser plus obstacles (owner's concept, already built) |
| How games run | Hero | Waiting room (our mini lobby) opens as soon as the operator enters a mode; desired-state loop pulls every headset into the current game; 3-2-1 countdown; name entry; party mode with in-headset voting; playlists with presets; per-headset right-click fixes; live controls; results then scorecard and records |
| Guard-rails | VEX | Explained-disabled tiles, pre-start check with "start anyway", clock scope, auto-pause on disconnect with auto-resume, end-message presets, per-headset health |
| Game contract | Hero arena-ready checklist + VEX Death Squad options | Difficulty easy-nightmare changeable live, short version, kids mode, pause, results payload, respawn ramp instead of game over, player-count scaling |
| Headset app | Hero + VEX | Starts on boot, identity written over USB, keeps the game in front (kiosk loop), finds the PC on any Wi-Fi (ours) |
| Operations | Hero | Diagnose page (pings both ways, firewall, versions), one-click bug report zip, firewall rule on first run, records, scorecards (dark PNG + print), seasonal themes and birthday mode |

---

## 2. Operator console (owner: VEX design)

Touch-first, one window, dark. Big hit targets (min 48 px), no modals except confirmations, no emojis.

**Always visible:**
- **Top status bar:**
  - venue name;
  - connected headsets "4 / 6";
  - a status chip (OK / Warning / Error, opens the System status panel);
  - the current session clock;
  - Simple/Advanced toggle;
  - Help.
- **Right side rail:** headset cards. It opens by itself on launch and can be collapsed.

**Home:** three large tiles plus a row of smaller links.
- **Quick Play:** one game now (Hero's 3 clicks).
- **Playlist:** a fixed order of games, presets, breaks.
- **Party:** players vote in the headset for the next game, ending after N games or at a time limit (VEX Vote / Time-based + Hero Multi Session).
- Smaller row: Setup, Records, Scorecards, Settings, Diagnose.
- Entering any of the three modes sends every connected headset to the waiting room (`lobby` message) at once.

**Flow inside a mode:** a step strip at the top, which can be skipped where a default exists.
1. **Game:** the grid of covers. Each tile shows players "1-6", minutes, tags.
   - A tile that cannot run now is dimmed with one line why: "Needs 2+ headsets", "Play area too small (needs 4x4)", "Not calibrated", "Already running".
2. **Mode:** cards with a one-line description; one tagged Recommended. Skipped when the game has one mode.
3. **Players:**
   - Headset rows (number on its colour, name, ready state).
   - Tap to include or exclude; optional team name; optional names (typed on the console or "names in headset").
   - "Same group as last time" button.
4. **Settings panel:** difficulty (Easy/Normal/Hard/Nightmare), length (the game's cuts), kids mode, language (English for now), plus the game's own options from its manifest.
5. **Start:**
   - Runs the **pre-start check** (`GET /api/precheck`).
   - If anything is flagged, a panel lists it per headset (low battery < 20 %, controller off, not calibrated, page not loaded, tracking lost) with **Fix** where possible and **Start anyway**.
   - Then a 3-2-1 countdown in the headsets.

**Running view** (replaces Home while a session runs):
- **Clock:** elapsed and remaining for the game, and for the whole playlist or party. Clock scope comes from Settings: game only / waiting room + game.
- **Live controls:** Pause/Resume, Difficulty, game stage controls from the manifest (Motel: "Skip to boss"), Restart game, Next (playlist), Skip vote (party), Quit (two-step).
- **Queue timeline:** shown for playlist and party.
- **Headset cards:** each shows its in-game state (Loading 43 %, Playing, Paused, Dropped 0:12).
- **Auto-pause:** when a headset drops, the game pauses and a banner says who. It resumes by itself when the headset is back, or the operator presses "Continue without".

**End view:**
- Results table: team, score, per-player kills/deaths/score, length, difficulty.
- "New record" banner if rank 1.
- Buttons: View scorecard, Print, End message (Remove headset / Thank you / Wait for staff / custom text), Back to Home.
- The waiting room reopens in the headsets.

**Headset card** (rail and Headsets page):
- number on its colour, name (tap to rename);
- headset battery plus L and R controller battery with charging mark;
- Wi-Fi quality (ping now, min/max over 30 min, drops);
- state word (Ready, Waiting room, Loading, Playing, Paused, Dropped, Not calibrated, Sleeping, Offline).
- **Long-press / right-click menu:**
  - Identify (vibrate);
  - Restart game on this headset;
  - Recalibrate points;
  - Calibrate height (enter cm);
  - Swap hands;
  - Send message;
  - Remove-headset message;
  - Bench (keep in waiting room);
  - Reboot (adb only);
  - Reload page.

**Other pages:**
- **Records:** per game, top 100, editable team names, delete, export; "today / week / all".
- **Scorecards:** gallery, view, print (system printer or thermal label printer), delete.
- **Settings:** venue name and logo (used on scorecards and the waiting-room floor), clock scope, default difficulty, auto-start on/off, seasonal theme (auto / off / Christmas / Halloween / Birthday), end-message default, printer choice.
- **Diagnose:** see section 8.

---

## 3. Setup wizard and calibration (owner: VEX calibration)

Opened from Home > Setup. Entry points: **First setup**, **Add headset**, **Reset play area**, **Re-calibrate points**. A numbered step list sits on the left and the current step on the right. Leaving early asks "Stop setup?".

1. **Venue:** venue name, logo (optional), units m/ft.
2. **Headsets:**
   - "Plug a headset into this PC with a USB cable" and a live list of USB devices (state: Plug in / Allow USB debugging in the headset / Installing / Done / Failed with reason).
   - Install button. Each headset gets a number and colour (auto or manual) and a name.
   - The headset app is installed, the identity file written, Wi-Fi control enabled, and the app started.
   - "Skip, my headsets are ready" is allowed.
3. **Prepare the floor (checklist):** clear floor, even light, no mirrors, two floor marks (tape crosses) at least 2 m apart, router close by on 5 GHz. Tick boxes; Next is enabled when all are ticked or "skip" is pressed.
4. **Play area:** two choices.
   - **Preset rectangle:** size (4x4 ... 10x10), rotation, entrance side. Mark A = front-left corner; mark B = on the left edge, at least 2 m from A towards the back. A top-down preview shows the rectangle, marks A/B and the entrance.
   - **Draw in the headset:** the existing laser flow (draw the boundary, then obstacles), started from the console for one chosen headset. The console mirrors the drawing live.
5. **Calibration points:**
   - The **first headset** (chosen, default the one that drew) walks to mark A and touches the floor with the controller, then mark B. Its row moves Point 1, Point 2, Done.
   - Then **Sync to all headsets:** every other connected headset row shows Waiting / Point 1 / Point 2 / Done / Failed.
   - The headset itself shows bold white instructions ("Touch mark A on the floor") and draws ghost rings where it expects the marks.
   - **Check:** after each headset is done, the console compares its A-B distance with the first headset's. A difference over 5 cm is shown amber with "Redo". Each row keeps a Redo button.
6. **Done:** summary (size, headsets calibrated). Calibration is saved and goes to history (existing undo works).

**Persistence (our edge over both):** each headset plants WebXR persistent anchors on its two marks (already built: `followAnchors`). After the headset is taken off and put on again it stays aligned. A headset that loses its anchors reports `needsCalibration`; its card turns amber and the console offers "Re-calibrate points" for just that headset.

**Re-sync options** (VEX):
- Reset play area only (keep points);
- Re-calibrate points only (keep area);
- Everything.

---

## 4. How games run (owner: Hero Zone way)

**Session engine** (server, `lobby-stage/lib/session.js`, wired into `server.js`):
- **States:** `idle` → `waiting` (waiting room) → `countdown` → `loading` → `playing` ⇄ `paused` → `results` → `waiting` or `idle`.
- **End reason:** `finished`, `stopped_by_operator`, `stopped_by_game`, `unexpected`. Every session is appended to `data/sessions.jsonl` (start, end, game, headsets, players, reason, result).
- **Desired-state loop** (every 1 s): each connected headset that should be in the current game but is not (or is in the wrong game) gets the start message again. A headset that should be in the waiting room gets `lobby`. A headset that comes back mid-game is pulled straight into the running game (`gameStart` again, `join`). Benched headsets stay in the waiting room.
- **On every connect** the server sends full context: name, colour, number, calibration, live settings, current lobby or game state.
- **Countdown:** `countdown {seconds:3}` to all chosen headsets, then the game starts.
- **Auto-pause:** a headset in the game dropped for more than 3 s pauses the game (`game.pause(true)`) and raises an operator banner. It resumes 2 s after the last dropped headset is back, or when the operator presses Continue (which removes the dropped player).
- **Clock scope:** the setting `clockScope` is `game` or `all`. Remaining time is shown for the game's length cut. The game ends itself; the server never kills it at time-out except as a safety net (length + 2 min).
- **Playlist:** items `[{gameId, mode, difficulty, minutes, options}]`, `breakSec` 0-300 (time in the waiting room between games), optional one difficulty for all, team name, names on/off. Presets are saved in `data/playlists.json`. Controls: Next, Restart, End.
- **Party:** `games` (votable ids), `maxGames` 1-20, `voteSec` 10-60, `breakSec` 20-120, `birthday`. In the waiting room every headset gets `vote {options, endsAt}`. The highest vote wins, ties are broken at random, and with no vote the next unplayed game is chosen. It ends at `maxGames`.
- **Names:** with names on, the waiting room asks each headset for a name (`nameEntry`). A virtual keyboard in the headset is not wanted: names come from the console (typed) or presets (headset name). For the first version, names are typed on the console only. Players can still pick their colour in the headset later.
- **Results:** when the rules module ends, the server takes `game.results()`, records it, renders the scorecard (section 6), shows scores in the headsets for `resultsSec` (default 20 s), then sends the end message preset, then returns everyone to the waiting room.

**Waiting room** (headset; our mini lobby camp, `public/play/minilobby.js`):
- the night camp from Synty props;
- the venue logo on the floor (decal from the logo setting);
- the record board as a physical Synty object showing team names and scores, painted on a sign texture from Synty, without our own UI panels;
- seasonal dressing (Christmas or Halloween props from Synty packs, birthday balloons if a pack has them; otherwise skip).
- **Voting** happens here: one Synty object per game (for example a crate with the game's cover on a poster prop). The player points the laser and pulls the trigger. A haptic tick and a sound confirm the vote.
- The countdown is shown as a big bold number with a sound.

**Per-headset fixes from the console:**
- `restartGame` (leave and rejoin the running game);
- `calibrateHeight {cm}`;
- `swapHands`;
- `message {text}` (bold white text for 6 s in the headset);
- `endMessage {preset|text}`;
- `bench {on}`;
- `identify`;
- `reload`;
- `recalibrate` (points only for that headset).

---

## 5. Game contract (arena-ready)

The rules module (`game/<id>.js`, `createGame(opts)`) gains these options and methods. Old ones keep working.

- **opts:**
  - `difficulty` ('easy'|'normal'|'hard'|'nightmare');
  - `minutes` (one of the manifest's cuts);
  - `kids` (bool: no blood, no gore, softer sounds);
  - `short` (bool: short version);
  - `players` (number, for scaling);
  - `options` (object of the manifest's own options).
- **Methods:**
  - `pause(on, now)`: freezes all timers and enemies.
  - `setDifficulty(level, now)`: live change.
  - `stage(name, now)`: optional, an operator stage control (Motel: 'boss').
  - `results()`: returns `{ score, won, durationMs, difficulty, level, players: [{ id, name, score, kills, deaths, extra: {...} }], extra: {...} }`.
- **Manifest** (`game/<id>.game.json`) gains:
  - `players: { "4x4": [1,4], "6x6": [1,6], ... }`, or `minArea: [w, d]` plus `minPlayers`/`maxPlayers`;
  - `cuts: [10, 15]` (minutes);
  - `modes: [{id, name, description, recommended}]`;
  - `options: [{id, name, type: bool|enum|range, default, min, max, values}]`;
  - `stages: [{id, name}]`;
  - `scorecard: { columns: ['score','kills','deaths'] }`;
  - `family: true|false`.

**The Motel** (`game/motel.js` + `public/play/games/motel/`):
- difficulty live; 10 or 15 min cuts (short = one wave fewer);
- kids mode: no blood decals and no gore, zombies fall and fade;
- pause; stage 'boss';
- **respawn ramp instead of game over:** a downed player respawns after 5 s, plus 3 s per death already in this wave, max 20 s;
- player-count scaling;
- results with kills/deaths/score per player.

**The Back Room** (`game/backroom.js` + `public/play/games/backroom/`): shift cuts 10/15/20 min, pause, difficulty live (customer pace), kids theme exists, results (orders served, tips, mistakes per player).

Inside games the owner's rules stand: no panels, readouts or hint texts of our own. Everything is told through the world: Synty objects, real sounds, light, haptics.

---

## 6. Records and scorecards

- **Records:** `data/records.json` per game: `{team, score, players, difficulty, minutes, date, kids}`. Rank = higher scores + 1, separate per difficulty. Rank 1 gives "New record".
- **Scorecard:**
  - Rendered by the console page as HTML at `/scorecard/?id=<sessionId>`, 1000×1250, with two looks:
    - **digital:** dark;
    - **print:** white, low ink.
  - Contents: game cover crop, team name, score, rank badge, per-player rows, date, the venue logo ("presented by").
  - The server saves the PNG through a headless capture where available (Edge `--headless --screenshot` with the bundled profile); otherwise the console saves it on first view through canvas.
  - Files: `data/scorecards/<date>_<game>_<team>.png` plus a JSON sidecar.
- **Print:**
  - system printer through the browser print dialog (print look);
  - or the thermal label printer (Poskey DB403, raw TSPL to CUPS `thermal` queue at 192.168.1.40:631, 100×90 mm) as a compact text and score label, when configured in Settings.

---

## 7. Headset app (MSGames-Headset.apk, `bg.arena.play`)

Built from `vr-arena/lobby/tools/apk-lan` with its `build.ps1` (no Gradle).

- **Starts on boot:** BOOT_COMPLETED receiver starts the forward service. It finds the PC (UDP beacon / last address / subnet scan, already built) and opens the game page.
- **Identity:**
  - The installer writes `/sdcard/msgames/id.json` (`{id, number, color, name}`) over adb.
  - The app passes `?id=` to the page, so the console's name, number and colour follow the headset onto Wi-Fi.
  - Without the file the app falls back to its current id.
- **Keep in front:** while the operator console is in a session or waiting room, if the page is not in front for more than 5 s the app brings it back (needs the overlay permission granted over adb at install).
- **Enter VR without a press:**
  - investigate and pick the most reliable way on Quest 2/3 on any network;
  - the keeper's adb + DevTools click works when wireless adb is up (enabled while on the cable);
  - a WebXR custom tab or TWA only for our own domain;
  - document the result.
- **Passthrough** waiting room as an option.

---

## 8. Operations

- **Diagnose page:**
  - PC IPs and chosen adapter;
  - firewall rule present (`netsh advfirewall firewall show rule`);
  - per headset: ping from PC, ping from headset to PC (via adb when available), page build version, app version, battery, last drop;
  - router checklist text (5 GHz, one SSID, PC wired);
  - each failure with one sentence of what to do.
- **Bug report:** one zip with server log, `sessions.jsonl` tail, state snapshot, headset logcat (adb, when available), and the operator's note. It is saved to Desktop and named with the date.
- **Firewall:** on first run the launcher asks Windows once (UAC) to add inbound rules for its node.exe (TCP 47801/47843, UDP 47810). A Fix button sits on Diagnose.
- **Installer:**
  - the full product (both games);
  - the Motel-only "share" build (existing `package-motel.ps1` pattern, now from the new code).

---

## 9. Protocol additions (exact)

**REST** (console → server; all return `{ok:true,...}` or `{error, code}`):

| Route | Body | Does |
|---|---|---|
| `POST /api/flow/open` | `{kind:'quick'|'playlist'|'party'}` | enters a mode; all headsets get `lobby` |
| `POST /api/flow/close` | | back to idle (headsets stay in waiting room) |
| `GET /api/precheck` | `?gameId=&headsetIds=a,b` | `{ok, items:[{headsetId, level:'warn'|'error', code, text, fix?}]}` |
| `POST /api/session/start` | `{gameId, mode?, difficulty, minutes, kids, options, headsetIds, team?, names?:{id:name}, ignoreWarnings?}` | Quick Play start (countdown, then game) |
| `POST /api/session/pause` | `{on}` | |
| `POST /api/session/difficulty` | `{level}` | |
| `POST /api/session/stage` | `{stage}` | |
| `POST /api/session/restart` | | restart current game, same players |
| `POST /api/session/stop` | `{reason?}` | operator stop |
| `POST /api/session/continue` | | continue without dropped headsets |
| `POST /api/playlist/start` | `{items, breakSec, difficulty?, team?, names?}` | |
| `POST /api/playlist/next` | | |
| `GET /api/playlist/presets` / `POST /api/playlist/presets` | `{name, items, breakSec, ...}` / `{remove:name}` | |
| `POST /api/party/start` | `{games, maxGames, voteSec, breakSec, birthday, team?}` | |
| `POST /api/party/skipvote` | | |
| `POST /api/headset/action` | `{headsetId, action, value?}` | actions in section 4 |
| `POST /api/endmessage` | `{headsetIds?, preset:'remove'|'thanks'|'staff'|'custom', text?}` | |
| `GET /api/records` | `?gameId=&period=` | |
| `POST /api/records/rename` / `remove` | | |
| `GET /api/scorecards` / `GET /scorecards/<file>` | | |
| `POST /api/settings` | partial settings object | persisted in `data/settings.json` |
| `GET /api/diagnose` | | checks list |
| `POST /api/bugreport` | `{note}` | `{file}` |
| `GET /api/usb` / `POST /api/usb/install` | `{serial, number?, color?, name?}` | wizard step 2 |
| `POST /api/setup/area` | `{kind:'preset', w, d, rotation, entrance}` or `{kind:'draw', headsetId}` | |
| `POST /api/setup/points` | `{headsetId}` / `{sync:true}` / `{redo:headsetId}` | |

Existing routes stay (launch, stop, zone, calibration and so on). The old `POST /api/launch` keeps working and maps to `session/start`.

**State** (`GET /api/state` and the `/ui` socket push) adds:
- `flow: {kind, step}`;
- `run`, which is null or: `{ id, kind, state, gameId, gameName, mode, difficulty, kids, minutes, clockScope, startedAt, gameStartedAt, elapsedMs, remainingMs, pausedBy:[headsetIds], queue:[{gameId, state:'done'|'now'|'next'}], index, maxGames, vote:{endsAt, counts:{gameId:n}}, team, players:[{headsetId, name, color, n}], results? }`;
- `settings`;
- `precheck` (last result);
- `setup: {step, area, points:{[headsetId]: 'waiting'|'p1'|'p2'|'done'|'failed'}, check:{[headsetId]: {abDelta}}}`;
- `usb:[{serial, model, state, error?}]`;
- per-headset health: `health: {pingMs, pingMin, pingMax, drops, wifi}`.

**Server → headset** (WebSocket `/headset`, JSON `type`):
- `lobby {theme, board:[{team, score, game}], venue:{name, logo}, birthday, season}`;
- `vote {options:[{gameId, name, cover}], endsAt}` / `voteEnd {gameId}`;
- `countdown {seconds}`;
- `pause {on, who:[names]}`;
- `settings {difficulty, kids, volume, ...}`;
- `results {team, score, rank, players:[...], seconds}`;
- `endMessage {preset, text}`;
- `message {text, seconds}`;
- `swapHands`;
- `calibrateHeight {cm}`;
- `setupPoints {step:'p1'|'p2'|'done', marks?}`;
- `identity {id, n, name, color}`.

Existing messages stay (`gameStart`, `game`, zone, calibration, ...).

**Headset → server:**
- `vote {gameId}`;
- `worn {on}` (headset on head);
- `needsCalibration {reason}`;
- `setupPoint {index, x, y, z}` (reuses the zone touch code);
- `health {pingMs}` (echo of a server ping).

---

## 10. Workstreams (parallel sessions, strict file ownership)

Every session:
- works in `vr-arena/lobby-stage`, commits only its own files (`git add <paths>`; retry if `index.lock` is busy), and starts its own commit messages with its tag;
- tests on its own dev server (`node tools/dev-server.mjs --port <its port> --data data-dev-<tag>`), never 47801;
- never touches the live lobby or real headsets without the owner;
- keeps the Synty licence (team only, nothing uploaded, nothing through AI);
- writes English UI text, no emojis;
- reads `research/ms-games-2-design.md` (this file) first.

If a session needs a contract change, it writes it under "Contract changes" at the end of this file and tells the main session.

| Tag | Port | Owns | Delivers |
|---|---|---|---|
| S1 console | 47931 | `public/index.html`, `public/console.css`, `public/console.js`, new `public/console/*`, `public/scorecard/*` | Sections 2, 3 (console side), 6 (scorecard page); works against the contract with a mock state until S2 lands |
| S2 engine | 47932 | `server.js`, new `lib/*.js` (session, records, settings, precheck, diagnose, bugreport, usb setup) | Sections 4 (server), 3 (server side), 6 (records, saving), 8, 9 |
| S3 headset | 47933 | `public/play/play.js`, `public/play/minilobby.js`, `public/play/zone.js`, `public/play/index.html`, new `public/play/lobby/*` | Waiting room, vote, countdown, results, end messages, pause overlay, setup-points guidance, per-headset actions (section 4) |
| S4 motel | 47934 | `game/motel*.js`, `game/motel.game.json`, `game/motel.map.json`, `public/play/games/motel/*` | Section 5 (Motel), tests |
| ~~S5 backroom~~ | | removed (section 0) | |
| S7 spectator + loading | 47937 | new `public/tv/*` (spectator TV page) and the in-headset loading transition module `public/play/loading/*` (S3 imports it) | Section 0.3 and 0.6: VEX-grade spectating and loading |
| S8 sound + game feel | 47938 | new `public/play/assets/sfx/motel/*` (curated sounds), `vr-arena/_sound-src/<library>/` (downloads), `research/game-feel.md` | Section 0.5: research what makes arena games good, download pro libraries, curate and hand a sound map to S4 |
| S6 app | none | `vr-arena/lobby/tools/apk-lan/*`, `lobby-stage/keeper.js`, `keeper.test.js` | Section 7, keeper install and identity |

The main session integrates: launcher/installer, the final end-to-end tests, and the release with the owner's yes.

## Contract changes

(sessions add dated entries here)

- **2026-11-16, S3 (headset), additive only:**
  - `ping {t}` (server → headset, any rate): the headset answers at once with `health {t, pingMs}`, where `t` is echoed untouched (server RTT = now − t) and `pingMs` is `ping.lastMs` if the server sent it, else null. No other timing on the headset.
  - Per-headset actions arrive as their own `type` (same names as `POST /api/headset/action`): `restartGame` (headset drops the running game and waits for the next `gameStart`), `recalibrate` (points only; the old `zoneAlign` keeps working), `bench {on}` (headset shows "Wait for the next game" in the waiting room), `identify`, `reload`, `swapHands {on?}` (no `on` = toggle), `calibrateHeight {cm}` (0 or missing = back to the anchored floor).
  - `needsCalibration {reason}` reasons: `anchors-lost` (anchors not seen for 12 s), `no-anchors` (calibrated, but this headset has no anchors of its own), `no-calibration`. When it is fine again the headset sends `needsCalibration {reason: null}`.
  - `status` gains `worn`, `needsCal` (reason or null), `swap` (bool), `heightCm` (number or null), `bench` (bool), `voted` (gameId or null).
  - `lobby` is idempotent: sending it every second is fine; it ends a running game on that headset only the first time.
  - `setupPoints {step:'p1'|'p2'|'done'|'cancel', marks?:[[x,z],[x,z]]}`; `marks` in hall coordinates (only drawn as ghost rings when the headset is aligned). `setupPoint {index:0|1, x, y, z}` is in the headset's raw tracking space (same as the old `calibCorner`). The headset does NOT align itself from the two touches; the server answers with the usual `applyCalibration {calibration:{..., fresh:true, markers}}`, which plants the persistent anchors.

- **2026-11-16, S2 (engine), routes answer on the S2 dev server (port 47932); additive to section 9:**
  - **Extra routes:** `POST /api/flow/step {step}` · `POST /api/setup {step?, entry?:'first'|'addHeadset'|'resetArea'|'recalibrate', reset?:'points'|'area'|'all'}` · `GET /api/settings` · `GET /api/sessions?limit=` (tail of sessions.jsonl, newest first) · `GET /api/records?...&format=csv` (download) · `GET /api/scorecard?id=<sessionId|base>` → `{scorecard}` (the sidecar the scorecard page renders) · `POST /api/scorecards/png {id, png:'data:image/png;base64,...'}` (console saves its canvas render) · `POST /api/scorecards/remove {id}` · `POST /api/scorecards/print {id}` (thermal label; system printer = browser print) · `GET /scorecards/<base>.png|json` · `GET /venue/logo` · `POST /api/firewall/fix`.
  - **Errors:** the pre-start gate answers 400 `{error, code:'precheck', items:[...]}`. `ignoreWarnings:true` ("Start anyway") passes everything except `no_game`, `busy`, `not_ready`. Party start checks only those hard ones. `POST /api/launch` (old) = Quick Play through the engine (countdown included); same game running → late headsets join.
  - **State additions:** `sessionState` ('idle'|'waiting'|run.state) · `last` (last finished run: `{runId, kind, endedAt, team, history:[{gameId, reason, score}], results, players}`) · `gameReasons {gameId: reason|null}` (dimmed tile line) · `recordsVersion`, `scorecardsVersion`, `playlists` (names) · `settings.venue.logo` is a URL in state, never inline.
  - **`run` extra fields:** `gameElapsedMs, gameRemainingMs, totalElapsedMs, totalRemainingMs` (elapsedMs/remainingMs follow clockScope), `dropped:[{headsetId, sinceMs}]`, `operatorPaused, autoPaused, played, breakSec, voteSec, birthday, options, lastVote, countdownEndsAt, nextAt` (break end or vote end), `resultsEndsAt, history, error`; `vote` also has `options, voted`; queue rows have `name` (+`difficulty, minutes` in playlists; party future slots `{gameId:null, name:'Vote', state:'next'}`); `results` = `{score, won, team, difficulty, players:[{id, n, name, score, kills, deaths, extra}], extra, sessionId, rank, newRecord, recordId, scorecard (file base)}`.
  - **Headset rows add:** `color`, `state` (Ready / Waiting room / Loading / Playing / Paused / Dropped / Not calibrated / Sleeping / Offline / Calibrating / Benched), `health {pingMs, pingMin, pingMax, drops (30 min), dropsTotal, lastDropAt, wifi}`, `benched`, `needsCalibration` (reason|null), `worn`, `appVersion`, `setupPoint`.
  - **`setup`:** `{step, entry, area:{kind:'preset', w, d, rotation, entrance}|{kind:'draw', headsetId}|null, ref, refAB, points:{id:'waiting'|'p1'|'p2'|'done'|'failed'}, check:{id:{abDelta, ab, ok}}, errors:{id:text}}`. 'waiting' = asked while offline, 'p1' = touch mark A, 'p2' = A in, touch B. The preset rectangle is placed when the first headset's two marks arrive (A = front-left corner, B on the left edge; rotation turns it clockwise about A); `POST /api/setup/area` also returns `preview` (the zone with a 2 m A–B) for the top-down drawing.
  - **`usb` rows:** `{serial, model, product, state:'ready'|'allow'|'plug'|'installing'|'done'|'failed', text, error?}`; install = APK (`tools/apk/MSGames-Headset.apk`, else `../lobby/tools/apk-lan/`), `/sdcard/msgames/id.json`, overlay appops, `adb tcpip 5555`, start the app.
  - **Server → headset extras:** `stop` is still sent before `lobby` when a headset leaves a game; `countdown {seconds, gameId, name}`; `vote {..., seconds}`; `voteEnd {gameId, counts}`; `results {..., newRecord, won, gameId}`; `bench {on}`; `restartGame`; `ping {t, lastMs}` every 5 s to game pages; `gameStart` gains `runId, difficulty, kids`; `game` snapshots carry `paused:true` while paused; `setupPoints {step:'cancel', error}` on a failed pair; pages with build < 35 (and no `caps:['setupPoints']` in hello) get the old `zoneAlign` instead. Optional hello fields `caps`, `appVersion`.
  - **Game contract (S4):** `createGame` opts also get `minutes, kids, short, players, options, mode`. `pause(on, now)` gets the game clock; a module without `pause()` is frozen by the server holding its clock. `results()` is optional (else `snapshot().result`); `snapshot().left` (seconds) feeds the remaining time.
  - **Firewall rule names** (launcher and Diagnose must agree): `MS Games (TCP)` (node.exe, TCP 47801,47843) and `MS Games (UDP)` (UDP 47810).
  - **Scorecard capture:** headless Edge opens `/scorecard/?id=<sessionId>&look=digital&capture=1` at 1000×1250 (only when `public/scorecard/index.html` exists); the page should render from `GET /api/scorecard?id=`.
  - `settings.endMessage.preset` also accepts `'none'`. Data files: `settings.json, records.json` (imported once from scores.json), `playlists.json, sessions.jsonl, scorecards/, server.log`.

- 2026-11-16 S4 (Motel 3.0.0), additions only, nothing removed:
  - `results().level` is the difficulty (same as `difficulty`, matching the old `result.level`); the wave reached is in `extra.wave` / `extra.waves`.
  - `stage('wave')` (manifest name "Start next wave now") ends the prep or a break at once; `stage('boss')` as specified.
  - `pause(on, now)` and `setDifficulty(level, now)` ignore `now`: the pause is measured between `tick()` calls, so any clock works (the server's `web.held` offset does not matter).
  - The start message carries `kids`, `minutes`, `short`, `options`, `waves`, `waveNames`, `darkWaves`, `respawn`; the snapshot carries `paused` and `level`.
  - Rules options (manifest `options`): `barrels`, `blackout`, `boards`, `ammo`, `crowd`, `prep`. `opts.mode === 'short'` equals `short: true`; `theme: 'kids'` equals `kids: true`.

- **2026-11-16, S3 (headset), after owner direction #2, additive:**
  - **Generic vote options:** `vote.options[]` may be `{id, name, hint?, cover?}` (difficulty, rounds, ...) as well as `{gameId, name, cover}`. Key = `id ?? gameId`. The headset votes with `vote {id: key, gameId: gameId ?? null}` and `voteEnd` may name the winner as `id` or `gameId` (none = called off). An option without `cover` shows real Synty things on its crate (easy = machete, normal = pistol, hard = shotgun + fuel can, nightmare = chainsaw + propane; or the option's own `props: [{p: pack, n: model, x, z, yaw, lay, lean, ground}]`), never a screen or drawn words; its `name` is only the floating label above; `title` (optional) is the line above the frame. `vote.question` (optional) is the line over the row (default "Vote for the next game" for game options, else "Vote").
  - **Loading hook (S7):** `public/play/loading/index.js` may export `createLoading(env)` returning `{ into({title, cover, start, load}), out({swap}) }`. `into` must `await load(progress)` once (progress(pct, what)) and return its result; `load` builds the game and swaps the world before returning. `out` must `await swap()` once. env: `{THREE, scene, renderer, camera, view(), sfx, haptic, panel, fallback}` (fallback = the current fade, usable piecemeal). Loaded once at boot; when the file is missing the default fade stays.
  - **Sound hooks (S8):** the headset plays by hook name (`lobby/sfx.js` HOOKS: vote.hover/pick/win/last, countdown.tick/go, results.show, message.in, endmessage.in, pause.toggle, ui.click, setup.point/done, identify, ambience.fire/night/wind). Files listed in `/play/assets/sfx/lobby/hooks.json` (`{"hook": "file.ogg" | ["a.ogg","b.ogg"]}`, paths relative to that folder) replace the defaults hook by hook.

- **2026-11-16, S6 (headset app + keeper):**
  - **`installHeadset` (keeper.js), for the setup wizard's Install step:**
    - Signature: `installHeadset(serial, {number, color, name, id?}, {adb, apk, pc?, force?, wifi?, file?})`. It is an **async generator** of progress events `{step, state, text, pct, error?}`.
    - `step`: `check` | `install` | `identity` | `permissions` | `start` | `wifi` | `done`.
    - `state`: `run` | `ok` | `skip` | `warn` | `fail` | `done`.
    - It never throws. The last event is either `{step:'done', state:'done', pct:100, result:{id, serial, model, ip, versionCode, wifi, identity}}` or a `fail` with a one-line `error` the console can show as is (for example "Put the headset on and press Allow for USB debugging").
    - `runInstall(serial, who, opts, onEvent)` is the same as a promise (rejects with that line).
    - `id` defaults to the USB serial, the same as S2's `usbInstall`.
    - Order: install `-r -g`, only when the headset's versionCode is below `MSGames-Headset.json`'s; identity push and read-back; appops; start by `am broadcast` (not `am start`, not `monkey`); Wi-Fi adb **last**, because `tcpip` drops the USB link.
    - Suggested change in `server.js` `usbInstall` (S2 owns it): `for await (const e of installHeadset(s, identity, { adb: ADB, apk: headsetApk(), pc: <chosen IP>, file: path.join(DATA, 'keeper.json') })) set(e.text)`, then fail the job on `e.state === 'fail'`. This replaces `lib/setup.js`'s `installHeadset`, which starts the app with `monkey` after `tcpip` and does not grant usage access or storage.
  - **`startKeeper`:**
    - The server should pass `apk: headsetApk()`. Today it passes `tools/apk/Arena.apk`, the old Bulgarian app.
    - The server should add `run: !!<current run>` to `state()`. The keeper updates an older headset app only when neither `session` nor `run` is set.
  - **Page address:** the app opens `/play/?id=<id>&name=<name>&n=<number>&color=<#hex>&app=1`. `n` and `color` are new and optional (S3 may read them before the server's `identity` message arrives). `app=1` is set only in the immersive tab.
  - **New route request to S2:** `GET /api/keep?id=<headsetId>` → `{keep: true|false}`.
    - Meaning: this headset should be in the game or the waiting room now (a flow is open or a run is on, and the headset is not removed from it).
    - The app polls it every 3 s through its forwarder and brings the game back to the front when `keep` is true.
    - Until the route exists, the app falls back to `GET /api/state` (`run` or `flow` not null), which is heavier.
  - **Optional, only for variant B of entering VR (`research/enter-vr.md`):** `domainSni` should match every name of the domain certificate (or a list in `domain.txt`), so that a loopback name such as `lo.arena.osmantush.com` gets the real certificate on 47843. `/.well-known/assetlinks.json` already lists `bg.arena.play` with the right key.

- **2026-11-16, S2 (engine), after owner direction #2:**
  - **Spectator feed for S7:** WebSocket `/tv` (same socket as the old `/watch`). On connect: `hall {hall, calibrated}`, `zone {zone}`, `session {...}`, and `gameStart` when a game runs. Then `game` (rules snapshot, 10 Hz, `paused:true` while paused), `room {t, players:[{id, n, name, team, c, p:[21 numbers: head, left hand, right hand; xyz + quaternion each, hall coordinates]}]}` (20 Hz), `zone` on change, `stop`, and `session` on every state change: `{state, flow, run, last, venue:{name, logo}, season, game:{id, name, cover}, board:[top 10 all time: {rank, team, score, difficulty, date}], today:[top 10 today], headsets:[{id, n, name, color, online, state, inGame}]}`. Read-only: the TV sends nothing.
  - **Party with one game** (The Motel only): `run.voteOn` / `vote.on` = `'difficulty'`; `vote {on:'difficulty', options:[{id:'easy'|'normal'|'hard'|'nightmare', gameId:'motel', difficulty, name, cover, hint}]}`; the headset answers `vote {id, gameId}` (S3's vote.js already sends `id`); `voteEnd {id, gameId, difficulty, counts}`; no vote → the party's or the default difficulty. With two or more games `on:'game'` and option `id` = `gameId`. `POST /api/party/start` accepts `voteOn:'game'|'difficulty'` to force one.
  - Defaults that named The Back Room now use the first ready game (`motel`); a saved auto-start game that is no longer installed falls back the same way.
  - Static MIME types added: `.ogg .oga .opus .mp3 .m4a .aac .wav .flac .webm .mp4 .gif .jpeg .woff .ttf .gltf .bin .ktx2 .txt`.

- **2026-11-16, S2 (engine), for S6 and S3:**
  - `GET /api/keep?id=<headsetId>` → `{ok, keep, state}`; `keep` = a mode is open or a run is on, and this headset was not removed from the run (Continue without). Benched headsets keep (they wait in the waiting room).
  - The setup wizard's USB install now runs keeper.js `installHeadset` (S6); `usb` rows add `step` and `pct` from its events; a `fail` event's `error` is the row's `error`. `lib/setup.js` no longer installs anything.
  - `startKeeper` gets `apk: headsetApk()` (`tools/apk/MSGames-Headset.apk`, else `../lobby/tools/apk-lan/MSGames-Headset.apk`) and `state().run`.
  - `vote` messages carry `question` ("Vote for the next game", or "How hard is round N?" in a one-game party).

- **2026-11-16, S1 (console), additive; what the console sends and reads:**
  - **Sends:** `POST /api/flow/step {step}` on every step change; `POST /api/setup {entry, step}` when the wizard opens or moves (`entry` = first / addHeadset / resetArea / recalibrate; `reset:'points'` for Re-calibrate points; `{step:null, entry:null}` when it closes). `playlist/start` and `party/start` carry `headsetIds, kids, difficulty, ignoreWarnings` like `session/start`. Settings patches use S2's shape: `{venueName}` or `{venue:{logo}}`, `{endMessage:{preset}|{text}}`, `{printer:{kind}}`, `{theme}`, `{clockScope}`, `{difficulty}`, `{resultsSec}`. Firewall Fix calls `POST /api/firewall/fix`. Scorecards: `GET /api/scorecards`, `GET /api/scorecard?id=`, `POST /api/scorecards/remove {id}`, `POST /api/scorecards/print {id}` (only when `settings.printer.kind === 'thermal'`; otherwise the browser prints `/scorecard/?id=&look=print&print=1`).
  - **Reads:** `gameReasons[gameId]` is the line on a dimmed tile and on Home (the console's own check is only the fallback). The precheck rejection `{code:'precheck', items}` opens the per-headset list; items with `headsetId:null` show as one "Arena" row, `code:'area'` gets a "Set the play area" button. `last` (with `flow.step === 'end'` or a `runId` the operator has not closed) drives the end view after a run is gone; `dropped[].sinceMs` drives "Dropped 0:12". Headset `state` word is used as is (Loading gets the percent from `load`).
  - **Asks of S2 (optional):** `run.live = {headsetId: {score, kills, deaths}}` while playing, so the running table can show live scores (the column stays empty without it). `gameReasons` says "Play area not set" when no area exists, instead of "Play area too small (needs 3x3)".
  - **Asks of S4:** the manifest lists stage `wave` ("Start next wave now"), but `stage('wave')` answers "The Motel has no stage 'wave'".
  - **Scorecard page** (`public/scorecard/`): renders from `GET /api/scorecard?id=`, sets `document.body.dataset.ready = '1'` once fonts, cover and logo are in, so a headless capture can wait for it. `look=print` is white and low ink (no cover photo). The canvas fallback that posts `POST /api/scorecards/png` is not built.
  - **Found in the end-to-end run (S1 + S2 dev server + `tools/sim-headsets.js`):** a Quick trial (`fast:true`) was saved as a record and got "New record"; the console tells the operator a trial does not count, so S2 should skip records for `fast` (or the console text changes). Results players have no `color`, so the scorecard falls back to its own palette by number; adding the headset `color` to `results.players` keeps the squares the same colour as on the console.
- **2026-11-16, S2:** `lobby` carries `games:[{id, name, cover}]` (every installed web game with status ready, from the manifests) for the hub's portals.

- **2026-11-16, S7 (spectator TV + loading), additive; nothing in server.js or play.js was edited:**
  - **TV page:** `/tv/` (`public/tv/index.html`, `tv.js`, `director.js`, `tv.css`). It reads the `/tv` socket as S2 defined it (session, gameStart, game, room, stop) and `GET /api/state` once for the manifest facts (tagline, players, cuts). The live picture is the watch page `/play/?watch=1&tv=1` in a frame, steered through `window.__arena` (`camera`, `desk.yaw/pitch`, `arena`, `renderer`, `game`). **S3: please keep those `__arena` fields and the watch mode's `deskUpdate` (camera from `desk.yaw/pitch`)**; a rename there breaks the TV cameras. Checks: `/tv/?shot=wide|follow|hero|horde|crane`, `?quality=0.75`, `?debug=1`.
  - **Brand:** the TV uses `/brand/mark.svg` when it exists, else the built-in option C mark.
  - **Loading module:** `public/play/loading/index.js` exports `createLoading(env)` exactly as S3's hook asks. Requests to S3 (play.js):
    1. `loadPct` (the per cent the console shows) is set only inside `loadStep`, which the default fade calls. With the module in place the headset reports `load: null` while loading. Please set `loadPct = pct; sendStatus()` in the `progress` wrapper inside `startGame`, independent of the visual.
    2. Optional: expose the module on `__arena` (`loading`) so the TV curtain can follow the real per cent (`loading.state.pct`); today the TV line is estimated.
  - **Sound hooks for S8** (listed in `/play/assets/sfx/lobby/hooks.json` like the others): `loading.dissolve` (the hub sinks, about 0.9 s), `loading.title` (the title lands; default today = the recorded whoosh-impact of `countdown.go`), `loading.reveal` (the world appears, about 2 s), `loading.out` (leaving a game).
  - **In-world texts of the game on the TV:** The Motel's own bold texts ("WAVE 3", "GATE DOWN") are drawn for the viewer and also show in the TV picture, next to the TV's own banner. S4 may hide them when `ctx` is a watch page (`location.search` has `watch=1`); not required.

- **2026-11-16, S3 (headset), after owner direction #3, additive:**
  - The waiting room is the **MS Games hub** (`public/play/lobby/hub.js`, Synty Sci-Fi Space Pack, built to `assets/synty/sci-fi-space-pack` from `lobby/tools/synty/want/hub-scifi.json`). `lobby.games: [{id, name, cover}]` (optional) gives one portal per installed game; without it The Motel's portal is shown.
  - The M mark on the hub floor loads `/brand/mark.svg`; until it exists the Stack placeholder from `brand/options.html` is drawn.
  - **Game intros:** a `countdown {seconds, gameId}` for a game with an intro (today `motel` = the night camp, `minilobby.js`) moves the headset through the portal into the intro; the intro's gate opens on GO; `gameStart` loads from there. Back in the hub when the game ends or on `lobby` without a game.
  - **Shooting range:** headset → server `rangeScore {score, best}` at the end of each 30 s round (best = this headset's own best, kept in the headset). The server may keep a daily best and send it back as `lobby.rangeBest` (not used yet).
  - Sound hooks added: `range.shot`, `range.hit`, `range.best`, `portal.open`.
  - (S3, later) `__arena.loading` = `{module, active, pct, what, game}` for the TV; `status.load` is set on every loading step whichever loading module draws it. Hooks added: `ambience.hub` (station hum), `portal.open` is now a starship hatch.
  - Shared assets added by S3 (new files only, include in packaging): `public/play/assets/synty/sci-fi-space-pack/` (144 models + textures incl. Skybox_03, Texture_03_F, Emissive_02), from `lobby/tools/synty/want/hub-scifi.json`.

- **2026-11-16, S8 (sound + game feel), additive; no code touched:**
  - **Motel sound bank is delivered:** `/play/assets/sfx/motel/map.json` in exactly S4's format (`games/motel/sfx-events.json`): `events[name] = {files, kids?, gain, pitch:[min,max], cooldown?, loop?}`, paths relative to the map. All 63 names of `sfx-events.json` have files (`_missing` is empty). 161 events with 348 OGG files loaded (417 with the alternatives), 14 MB. Extra advisory fields the loader can ignore: `space` (`3d` at the thing / `2d` in the head; "2d own / 3d others" for shots), `note`, `added`, and for voice lines `text`, `seconds`.
  - **Events the bank adds** (list in the map's `_added`; S4 wires them when the feature exists): `gun.mag.out`, `gun.mag.in`, `shotgun.pump` (0.35 s after `shot.shotgun`, which is the blast only), `shell.drop`, `shell.drop.shotgun`, `bullet.impact.metal|wood`, `melee.swing`, `melee.saw.start`, `zombie.bodyfall`, `fence.rattle`, `boss.rage`, `boss.hurt`, `boss.windup`, `boss.slam`, `stinger.wave|blackout|boss|jump`, `riser.10s`, `score.tick`, `score.final`, `score.record`, `award.reveal`, `plank.drop`, `chest.fly`, `world.neon.hum` (loop), `world.spark`, `world.heli.away`, `world.heli.in`, `radio.open`, `radio.close`, `ambience.rain` (loop), `ambience.fire` (loop).
  - **Voice lines:** `voice.<id>` for the 64 lines of `lobby/tools/voice/lines.json` (RAVEN, deep male, made offline with Kokoro in `_voice-tool`, no account): `voice.behind`, `voice.reload`, `voice.boss_in`, `voice.wave_1` ... Play 2D, one at a time, duck music 6 dB. The radio-band version of every line is under `alternatives` as `voice.radio.<id>`.
  - **`alternatives` (top level of the map) is NOT loaded by the player code.** It holds the radio voice set and five `*.ccby` music entries (Kevin MacLeod, CC BY 4.0). The CC BY music may be switched in only together with the credit lines of `_sound-src/LICENSES.md` on a credits screen; the default bank (Sonniss + Kenney + our voice) needs no credit.
  - **Requests to S4 (loader):** (1) the bank decodes to about 150 MB at 48 kHz if every event is decoded at load, as `loadBank()` does now: decode beds (`music.*`, `ambience.*`, `world.heli.*`) and `voice.*` on first use, or play beds through an `<audio>` element; (2) `loop: true` events other than music/ambience (`world.neon.hum`, `ambience.fire`, `melee.saw.idle`) need a positioned loop player; (3) `melee.saw.idle` / `melee.saw.cut` are seamless 1.5-1.85 s slices with a `cooldown` equal to their length: `saw()` is called every 0.11 s today and must not restart them; (4) own shots 2D at full gain, other players' shots 3D at 0.6; (5) stereo files (beds only) must not go through the panner.
  - **Waiting room:** `/play/assets/sfx/lobby/hooks.json` (S3's format, plain `{hook: file | [files]}`) replaces `vote.hover`, `vote.pick`, `vote.win`, `vote.last`, `countdown.tick` (three clock ticks), `countdown.go`, `results.show`, `message.in` (radio squelch), `pause.toggle`, `ui.click`, `setup.point`, `setup.done`. `endmessage.in`, `identify` and the three `ambience.*` loops keep S3's defaults. No new hooks are needed; a suggestion for S3: `results.record` (new record) and `results.award` could reuse the Motel's `score.record` / `award.reveal` files.
  - **Not heard by anyone yet:** files were chosen by library, name, length and level (this session cannot listen). Each family needs one listening pass; to swap a file, edit `_sound-src/_tools/curate.py` and run it plus `build_maps.py`, or just remove the file name from the map.
  - **Game-feel findings and the prioritised change list for The Motel (P1-P14):** `research/game-feel.md`.
  - Sources and licences: `vr-arena/_sound-src/LICENSES.md`; per-file origin: `sfx/motel/SOURCES.tsv`, `sfx/lobby/SOURCES.tsv`.
  - (S8, later) `hooks.json` also fills S3's newer hooks `range.shot` (three pistol rounds), `range.hit` (bullet on metal) and `range.best`; `portal.open` and `ambience.hub` keep S3's defaults.
- **2026-11-16, S1 (console), live data in the running view:** the console now reads the server's spectator feed (WebSocket `/tv`: `gameStart`, `game` snapshots, `stop`) while a session is open, for wave, enemies, team score, the next-event cue and per-player score and kills. **Asks of S4:** snapshot `players[]` should carry `deaths` (or `downs`); until then the console counts `down` events. **Asks of S7:** `/tv/?embed=1`: the live picture without the attract screen and broadcast overlay, for the frame in the console's running view (it embeds `/tv/?embed=1` today and shows the full TV page).
