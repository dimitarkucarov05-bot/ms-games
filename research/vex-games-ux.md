# VEX Play 13.0.2: games and operator experience

Study of the licensed VEX Play install, done read-only (nothing was run and no server was contacted). It covers the games, the operator screens, headset status, errors, look and languages. The managers and network side (HeadsetManager, SessionManager, DeployManager, VEX.Network) is covered in a separate report. Everything below is described in my own words. Game names, identifiers and numbers are quoted as they appear.

## Sources and how they were read

- `VEX.Text.dll` is not a DLL. It is a CSV string table (1,843 keys × 60 languages) holding every UI label, game, mode, map, setting and error.
- `VEXLibrary.UI.dll` and the core `VEXLibrary.dll` are obfuscated, so REA's member inspector refuses them (scrambled names, encrypted strings, a duplicate metadata stream). A small read-only parser listed the UI DLL's 242 embedded resources: 26 screens, 201 images and 13 fonts. Colours, style names and surviving enum names came from there.
- The JSON files under `localappdata\VEX Solutions\VEX Play\` hold the per-game and per-site defaults.

Outputs are in `rea-run/out/vex-ui-*` (English and Bulgarian text TSVs, resource list, identifiers).

Limit: the per-game catalogue (player counts, price in credits, recommended play area) is not in these files. The launcher downloads it from the VEX server. The player counts below are therefore inferred from settings text, not read from a table.

## 1. The games

VEX sells three product lines, named in enums and logos: **VEX Arena** (older backpack-PC and Vive Pro setup), **VEX Play / Arcade** (standalone headsets, short games) and **VEX Adventure** (story games, run as "kits"). Games are split in the settings into *Arcade games*, *Adventure games* and *Third-party games*. The game picker has category filters: Adventure, Arcade, Competitive, Cooperative, Escape, Family-friendly, Shooter, Zombie.

| Game (id) | Genre, as read from modes and settings | Modes / maps / options the operator sees |
|---|---|---|
| **Mission Z** (`missionz`) | Co-op zombie adventure | Levels: Library, Art Gallery, Vault |
| **Mission Z2** (`missionz2`) | Co-op zombie adventure in an underground mine | Full story, Chapter 1, Chapter 2 |
| **Rush Z** / **Dark Z** | Zombie survival against the same villain's creatures; Dark Z is played in total darkness | — |
| **Death Squad** (`death_global`) | Co-op wave shooter (skeletons and zombies). Players buy weapons and doors unlock as they progress | Arcade (survive a set time), Survival (endless waves, restart if all die), Arcade Sandbox (all doors and weapons open). Maps: Bunker, City, Trenches. Options: starting money, starting wave, time between waves, start with 2 guns, unlimited ammo, doors open at start, bonus chests, death duration (auto-lengthens as deaths pile up in a wave), respawn invulnerability, max simultaneous enemies, player-count difficulty scaling, kids mode (green blood, no head explosions) |
| **Cyberclash** (`cyber_global`) | Competitive arena PvP | Deathmatch, Team Deathmatch, Archery, Team Archery, Domination, Domination Archery, Battle Royale, Games Choice. 11 maps in three tiers (Standard, Advanced, Expert), from Pirate Market to Battle Towers. A per-weapon on/off table (pistol up to rail gun, plus shield and armour) and a per-map round-duration table |
| **Cyberclash Tournament** | Team PvP in rounds | Normal (3 rounds), Express (2 rounds) |
| **Kitchen Panic** (`kitchen_global`) | Co-op cooking | Story, Arcade, Arcade Random, Story Sandbox, Survival. Paris map, levels 1–10 |
| **Kraken Island** | Pirate co-op | Story (full or by chapter), Arcade (defend), Arcade Treasure, Survival, Survival Treasure. Option: torches light themselves |
| **DragonFall** | Bow wave defence at a castle | Arcade/Survival × Easy/Money/Sandbox; the "Money" variants add earning and arrow upgrades |
| **Party Playland** | Family mini-game party | Single Game, Random Games, Games Choice, Adventure, Express, plus a Kids version of each. Mini-games: Trap Dash, Diamond Rush, Octodrop, Chick'n'Fish, Krabby'nvasion |
| **Temple Quest / Temple Party** | Gem-gathering adventure (Party is the short cut) | Levels Magma, Air |
| **Lunarscape** | Escape from a moon base | Normal, Express; a boss laser that can be slowed or switched off |
| **Space Academy** | Educational space quiz | Planet Discovery, Solar Tour, Adventure, Express. Number of questions, question timer, can lock ship rotation |
| **Insanity: The Haunting / Madness Escape** | Horror walk and escape | Full story or by chapter. Jumpscare level (full, no dimming, none), alternate patient look, helper arrows |
| **Meta Escape** | Escape-room series | Alice in Wonderland, School of Magic, Superheroes, Zombie Origins, Zombie Urban Factory |
| Third-party titles | Various | Cops vs Robbers, HunterVR, The BBlock Breakout, The Parvus Box, Pixel Hack, Mansion Of Death, Greenium, Arctic Olympics, The Smurfs |
| **VEX Lobby** | The waiting world between games | Arcade machines with saved high scores (Skitchen Panic, Mission Z All Stars, Whack-a-Doll, Sigur Spinner, Shooting Range). Seasonal themes (Christmas, Birthday, Halloween, Summer). The venue's own logo on the "carpet" and "airship" |

**Players.** There is a "recommended player count per play area" table, plus a switch to allow going above it "on games compatible with 10 players". Errors such as "only N headsets can start on an X play area for this game" show that each game declares a maximum player count per floor size. The ceiling is 10.

**Difficulty.** Easy/Normal/Hard globally (Easy/Medium/Hard on the onboarding screen). Most shooters also have a player-count difficulty-scaling slider.

**Session time.** The operator picks a duration per launch, unless the "hide duration selection" setting removes the choice. A "Phases included in duration" setting decides what the clock covers: game only, training plus game, or avatar selection plus training plus game.

## 2. Per-game setup fields

| Field | Where it lives | Value seen | What it most likely means |
|---|---|---|---|
| `language` | `<Game>/setup_info.json` | 0 | Index into the 60-language list (0 = English). Set per game |
| `setupType` | `Mission Z/setup_info.json` only | 2 | A kit or tracking setup choice for adventure games. Exact meaning unconfirmed (obfuscated enum) |
| `playerIdentity` | `<Game>/station_info.json` | 0 | Probably how players are named (guest name, QR account, self-registration). 0 = default |
| `session_info.json` | per game | `{}` | Runtime scratch, empty at rest |
| `SessionTime` | `headset_settings.json` | 120.0 | Default length of a short (arcade) game, in seconds = 2 min |
| `LongSessionTime` | same | 900.0 | Default length of a long game = 15 min. Both match the "Default duration (short game / long game)" settings, which can be locked |
| `PlayArea` | same | `SIZE_4x4` | Floor size. The enum offers 4x4, 5x5, 6x6, 6x8, 8x8, 8x10 and 10x10 m |
| `HapticEnable`, `MusicVolume`, `HeadsetCount` | same | true, 0, 0 | bHaptics on, idle music volume, number of headsets set up |
| `PrinterIp` | `session_settings.json` | 192.168.3.191 | Network ticket printer |
| `ServerIp`, `PlatformId` | several files | local and cloud | Site identity (licence and cloud side; not studied here) |

## 3. Operator flow, screen by screen

**First run (setup wizard).** Basic or Advanced pre-configuration, switchable later. Then headset type, game language and floor size. Add headsets and deploy over USB (a picture warns against charge-only cables). Optionally make VEX "device owner" for remote reboot, VOIP and firmware lock. Play area: a prep checklist (clear floor, even light, two floor markers at least 2 m apart, patterned surfaces). Then a master headset builds a shared map in VR, the map syncs to every headset, and calibration points are confirmed headset by headset. Leaving early triggers a "did you mean to stop?" check. Last come the registration tablets (kiosk or not) and a done screen.

**Daily use.**
1. **Home / status bar.** Connected-headset count, a balance badge (No credit / Low credit / Trial period), a Status button that turns into Warning or Error, an Advanced toggle and Need help.
2. **Session type.** Single session (one game) or Multi-session. Multi-session is either a Playlist (the operator chooses the games in order) or Vote / Time-based (players spend tokens in the lobby to vote for the next game until the time runs out).
3. **Game selection.** A grid of thumbnails with category tabs. Games that can't run are greyed out, and a short reason is written on the thumbnail: wrong headset model, floor too small, not allowed in a playlist, already full, coming soon.
4. **Mode selection.** Mode cards with one-line descriptions, one tagged "Recommended". This step can be skipped with a default mode.
5. **Player registration.** Add a guest name, scan a QR account or ticket with the webcam, or "add last session players". Scanned players without a headset wait in a *pending players* list that expires after a set time.
6. **Headset selection / assignment.** Three columns: players, headsets, assignment. Auto- or manual assignment. Each headset is shown as Ready / Playing / Offline / Unavailable / No player assigned.
7. **Game settings panel** beside it, with drop-downs for Map, Play area, Mode, Difficulty, Duration and Language. Then Start.
8. **Pre-start check.** If any headset has a warning, a "resolve headset warnings" popup appears with an *Ignore and start* escape. Start errors are specific and show numbers: not enough credit (used / available / needed), too many headsets for this floor, the game isn't on this device.
9. **In game.** The status changes Launching → Playing, with elapsed and remaining time, Stop game, and per-headset state lines ("Launching X", "Playing X", "Game suspended ● …"). A game can auto-start once every chosen headset has connected, and auto-pause when a headset drops (auto-resuming when it is back).
10. **Multi-session view.** A play queue as a timeline (Start → games → End) with "add lobby time" between games. Controls: Pause, End, Restart game, Next or Skip vote, Manage headsets, Manage players. Total and remaining time for the whole playlist, plus estimated cost per player.
11. **End.** Inside the headset, players see their scores for a set number of seconds, then an end message that the operator chooses (remove your headset, wait for staff, thank you, or custom text). The game can auto-stop and send everyone back to the lobby. Players can be left waiting in the lobby, in passthrough or on a black screen.
12. **Scores outside the headset.** Up to three Windows monitors. The main window shows the launcher, and in game the scores plus operator actions. The secondary window shows live in-game cameras, or trailers and e-sports boards when idle. A third window shows trailers only. Registered players are emailed a scoreboard, which feeds e-sports contests and marketing emails.
13. **Printing.** A network ticket printer (`PrinterIp`, `ERR_FAIL_TO_PRINT_TICKET`) prints player tickets with a QR code, which are scanned at registration. No printed score card was found in the strings; scores go by email and to the screens.

**Two-group "kits".** Adventure games can run Kit A and Kit B side by side, plus a Spare kit. **Hot swap** replaces a failing headset mid-game with the spare and moves its haptic vest to the new headset.

**Per-headset popups** cover devices (batteries, haptics, trackers), audio and VOIP, players, server power and config (deploy, play area, 4D effects, updates).

**Licence and activation, in one line.** Starting a game spends prepaid credits or tokens from an online balance, and the system needs to reach the VEX server every few hours. Nothing here was examined beyond that.

## 4. How headsets, errors and tips are shown

- **Status icons** (with inverted versions for selected rows): device type, battery high/middle/low, plugged in, headphones, network good/poor/bad, haptics, a general issue mark.
- **Battery states:** fully charged, charging, discharging, in use. Controller messages name the side ("charge left controller"), and firmware updates refuse to start below 25 % ("charge both controllers, min 25 %").
- **Controller states:** unpaired (left, right or both), turn on, update needed, updating, flashing (do not power off), update failed or succeeded. A one-click *Fix controller pairing* runs on one headset at a time.
- **Per-headset health tooltip:** ping now, plus the minimum and maximum over 30 minutes; counts of Wi-Fi drops (idle versus in game), game and server disconnections, how many Wi-Fi networks are saved on the headset, headset freezes, and "slow headset" detections. Errors are red and warnings amber.
- **System status popup:** each failure type has a code and its own text. Network latency or instability opens a nine-point router checklist: dedicated router, nothing else on it, one saved Wi-Fi, no band merging, wired server, router close to the play area, 5 or 6 GHz, a free channel. A "Need help" popup ranks help options from fastest to slowest: guides and videos, Discord, email.
- **Picture-based fixes:** full-size illustrations for the classic faults (display cable, linkbox, headset cable, restart PC, restart then call support). Each shows numbered steps with the plug circled in red.
- **Playlist warnings** state the cost of a choice. For example, switching off auto-solve or auto-forward "no longer guarantees the session length". A high scent count warns that the cartridge will empty faster.

## 5. Visual language

- **WPF with MaterialDesignInXAML.** The theme is the stock Material **BlueGrey primary + Lime accent**, with ripple feedback on buttons.
- **Dark background:** a radial gradient from deep teal (#033A50-ish) at the centre to near-black navy at the edges, full-screen and made for a touchscreen (touch events are handled throughout).
- **Named colour resources:** DarkBlue, Blue, LightBlue, White, DarkWhite, Grey, LightGrey, Black. Literals found include a bright blue #265CFF for selection, slate #354B5B, status green #7AB16E, amber #E3A324 and red #E72424. Pastel row tints (#D9EAD3, #FCE5CD, #F4CCCC) mark ok, warn and error in tables. Player and team colours are blue, orange, green, red, pink and purple.
- **Fonts:** Montserrat (all weights) for the UI, Righteous for display titles, plus two novelty fonts.
- **Icons:** large flat pale icons on dark (a stopwatch for time-based, a list for playlist, a single card for a single game, tokens and coins).
- **Text style:** bold key nouns, a small grey suffix for context, red or amber tags.
- **Layout:** big cards or thumbnails, a side status bar that opens itself at game launch, and a simplified or complete mode.

## 6. Languages

- **Operator UI and game text:** 60 languages, every key filled for each. Bulgarian is complete. The others include FR, DE, NL, ES, DA, NO, JA, ZH, KO, AR, RU, TR, UK, PL, PT, IT, HE, HI, TH, VI, and smaller ones such as Amharic, Khmer, Lao, Maltese and Turkmen. Each language has a flag icon (and a US flag).
- **Separate language choices:** the system (launcher) language and the game language are set apart. Each game also has its own audio language, text language and subtitles. Subtitles have size, height, background opacity and instant-appear options, and can be hidden by type (narration, instructions, comments).
- **Language packs** are installed onto headsets separately.

Hardware supported: Quest 1–3S, Pico Neo 2–4 Ultra, Vive Focus 3/Vision and backpack Vive Pro. Extras: bHaptics, Ultraleap, and 4D effects (heat, fan, floor vibration, scent, each with a slider).

## 7. The 15 best ideas for our arena (ranked)

For a small arena running a zombie co-op wave shooter (The Motel) and a management game (The Back Room), under MS Games.

1. **Greyed-out games that state the reason.** Show every game, but disable the ones that can't run now and print why on the tile (too few headsets ready, floor too small). Nothing then fails at launch.
2. **Pre-start check with an override.** Before Start, list headset warnings (low battery, controller off, no tracking) in one popup with "fix" and "start anyway".
3. **A clock with a defined scope.** The owner sets whether the paid minutes include the briefing, or only gameplay. The screen shows elapsed and remaining time, so slot pricing is honest.
4. **Auto-pause on disconnect, auto-resume when everyone is back.** A dropped headset in The Motel freezes the wave instead of getting that player killed.
5. **Owner sliders for the wave shooter.** Starting wave, time between waves, max enemies at once, player-count scaling, and a kids mode with no gore. One build then suits both birthday parties and adults.
6. **A respawn-time ramp instead of game over.** Respawn takes longer as a wave goes badly, rather than ending the round. Everyone keeps playing for the full paid time.
7. **A lobby with mini-machines and a high-score board.** Early arrivals shoot targets while others gear up, and the board brings people back.
8. **Playlists with lobby breaks.** Queue "Motel → Back Room → Motel" for a 45-minute booking, and show the total time and price before Start.
9. **Token voting for the next game** in longer sessions. Choosing becomes part of the fun, and the operator has one less decision.
10. **One status card per headset.** Headset and per-side controller battery, ping (now/min/max), Wi-Fi drops and game state on one line, with details on hover.
11. **Picture-based troubleshooting.** Each common fault gets one illustration of our own with numbered steps, opened straight from the error.
12. **Scores in the headset, then a chosen end message.** Show scores for N seconds, then "remove your headset" or "wait for staff", then auto-return to the lobby.
13. **A spectator TV on a second monitor.** It shows live cameras during play and trailers or high scores when idle, which sells the next group at the counter.
14. **QR tickets and a pending-players list.** The till prints a QR ticket; scanning it at the arena adds the name to the next session. "Add last group" works in one tap, and stale entries expire.
15. **Venue logo and seasonal lobby themes** (Christmas, Halloween, birthday). Cheap to build, and a big win for parties.

---
*Summary:* VEX Play is a credit-metered, touchscreen WPF launcher for about 20 arena games (zombie co-op, PvP, family and escape titles) with up to 10 players. Its strengths are operator guard-rails: greyed-out games that state the reason, a pre-start headset check, auto-pause on disconnect, playlists and voting, lobby mini-games, and rich per-headset health.
*For MS Games:* copy the ideas, not the assets. The highest-value picks are explained-disabled game tiles, a pre-start check, a clear clock scope, auto-pause on disconnect, wave-difficulty sliders with a respawn ramp, and a lobby with a high-score board.
