# Launcher, installer and packaging for MS Games 2 (S9, 2026-11-16)

This folder is not in git. The version-1 sources are kept in `_v1-2026-11-16/` (MSGames.cs, Setup.cs, build.ps1, msgames.ico).

## Build

    powershell -ExecutionPolicy Bypass -File launcher\package-v2.ps1          # build + pack
    powershell -ExecutionPolicy Bypass -File launcher\package-v2.ps1 -NoBuild # pack with the exe already in dist2

Result: `dist2\MS-Games-Setup-2.0.0.exe` (165 MB) and the packed folder `dist2\MS Games\` (356 MB).
`package-v2.ps1` never writes to `dist\` (the live arena's launcher runs from there) and stops if `dist\MS Games.exe`
changed while it ran. `build.ps1` defaults to `dist2\`; the live folder is written only with an explicit `-OutDir dist`.

## What changed

- **Brand** (`brand2/`): `brand.ps1` draws `lobby-stage\public\brand\mark.svg` and `logo.svg` with headless Edge into
  `msgames.ico` (16, 24, 32, 48, 64, 256), `logo.png` and `art.png` (installer welcome page). `build.ps1` embeds them
  and redraws them when one is missing or with `-Brand`. If the owner picks another logo: replace the SVGs, run
  `build.ps1 -Brand -OutDir dist2`.
- **MSGames.cs** (2.0.0): green/white/yellow splash with the logo; the name is `Program.AppName` (one constant here,
  one in Setup.cs; `build.ps1 -AppName` names the exe); `GameRunning` also sees the new engine's `run`.
  - Packed copies pass `ADB` and `HEADSET_APK` (the bundled `app\headset\`) to the server, and copy
    `app\tls-default` into the data folder when the PC has no OpenSSL. lobby-stage needed no change.
  - Firewall on first run (packed copy, port 47801 only): looks for the rules `MS Games (TCP)` and `MS Games (UDP)`
    for its own `runtime\node.exe`; when missing it asks Windows once (UAC) to add TCP 47801,47843 and UDP 47810.
    The answer is remembered in `%LOCALAPPDATA%\MS Games\firewall-asked.txt`; after a No the launcher carries on,
    shows a tray note, and the console's Diagnose page has Fix (`POST /api/firewall/fix`).
  - New switches: `--data <folder>` (everything it writes goes there), `--tls-port <n>` (a test port gets port + 42
    by itself), `--no-firewall`, `--firewall-status` (logs what it finds and the command, no prompt),
    `--shot <png>` (draws the splash to a file).
- **Setup.cs** (2.0.0): new palette and artwork, a line about the firewall prompt on the last page, `/shots=<folder>`
  (draws the four pages to PNG files). Stopping a running copy now compares long path names (a copy started through
  `C:\Users\MARTIN~1\...` was not found before, so uninstall left files) and also stops the bundled adb.
- **package-v2.ps1** + **v2-prune.mjs**: see the header of the script. Synty packs, maps and `assets\ui` are kept
  only when the packed code (or a kept map's JSON) names them; today 11 packs and `maps\woodland-apocalypse` stay,
  9 packs, `maps\shopping-plaza` and `assets\ui` stay out. The five CC BY music files (`alternatives` `*.ccby`) are
  removed from the copy and from its `map.json`. `app\BUILD.txt` says what was packed.

## Testing an installed copy next to the live arena

    $env:NO_PLAY_BEACON='1'; $env:NO_KEEPER='1'; $env:ADB='C:\Android\sdk\platform-tools\adb.exe'
    & "<folder>\MS Games.exe" --port 47955 --data <temp folder> --no-window --no-firewall

Without `NO_PLAY_BEACON` the test server would announce itself to the arena's headsets, and without `NO_KEEPER` it
would drive them over adb. From Git Bash, `/silent` and `/dir=` are rewritten into paths: start the installer from
PowerShell.

## Open

- The firewall prompt itself was not clicked through (it needs a person at the UAC prompt); the check and the exact
  command were verified with `--firewall-status`.
- Later the same day, NOT in the 03:02 installer (goes in with the next package-v2 run): uninstall removes the
  firewall rules. When `MS Games (TCP)` / `MS Games (UDP)` exist for this copy's `runtime\node.exe`, one UAC prompt
  runs `netsh advfirewall firewall delete rule name=...`. Rules of another copy are left alone and give no prompt.
  A declined prompt or a failure is written to `%LOCALAPPDATA%\MS Games\logs\uninstall.log` and the uninstall
  carries on. Compiled only: not run against real rules (needs a person at the UAC prompt).
- `Alpine_GroundCover_01 1.png` answers 404 from the server although the file is there: the static handler does not
  decode `%20`. Same on the dev servers; it is in lobby-stage `server.js`, not in the package.
- Not tried on a PC without Node, OpenSSL and the Android SDK.
