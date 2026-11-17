# MS Games / VR arena: development package (2026-11-17)

Everything needed to keep developing the arena on another machine (MacBook or Windows).
The code is plain Node.js (no build step), so it runs on macOS as it is.

## What is where

| Folder | What it is |
|---|---|
| `lobby-stage/` | **MS Games 2: the current code. Develop here.** It is a git repo with the full history (`git log`). |
| `lobby/` | The live arena as it runs today (old version), plus the shared assets, tools and the Windows launcher/installer sources. |
| `lobby/public/play/assets/` | Shared 3D models (Synty), maps, sounds. `lobby-stage` uses them through a link (see Setup). |
| `lobby/launcher/` | Windows launcher and installer sources (C#), `package-v2.ps1` (builds the installer, Windows only). |
| `lobby/tools/apk-lan/` | Headset app (Android) sources and the built `MSGames-Headset.apk`. |
| `research/` | Hero Zone and VEX analysis, the MS Games 2 design (`ms-games-2-design.md`), game feel, budgets, screenshots. |
| `_archive/` | The Back Room (pizzeria), removed from MS Games and zipped. |
| `_sound-src/` | Licences and scripts of the sound libraries. The raw libraries (3.4 GB) are not included; see below. |

## Setup on a Mac

1. Install Node.js 24 (nodejs.org).
2. In a terminal, from this folder:

       cd lobby-stage
       ln -s ../lobby/node_modules node_modules
       ln -s ../../../lobby/public/play/assets public/play/assets
       node tools/dev-server.mjs --port 47901 --data data-dev

3. Open these pages:
   - `http://localhost:47901`: the console.
   - `http://localhost:47901/play/?desktop=1&id=DEV&name=DEV`: the game without a headset. Keys: W A S D walk, right mouse looks, left mouse grabs, space is the trigger.
   - `http://localhost:47901/tv/`: the spectator TV.

   On Windows, use `mklink /J` instead of `ln -s`.

## Tests

    cd lobby-stage
    node --test lib/*.test.js game/*.test.js keeper.test.js        # 98 unit tests
    node tools/s2-e2e.mjs 47901                                      # full flow with simulated headsets (dev server must run)

## Building the Windows installer (on a Windows PC)

    powershell -ExecutionPolicy Bypass -File lobby\launcher\package-v2.ps1

The installer is written to `lobby\launcher\dist2\MS-Games-Setup-2.0.0.exe`. Read `lobby/launcher/CHANGES-v2.md`.

## Left out of this package (still on the arena PC)

- `_voice-tool/` (4.2 GB): the offline voice generator, Windows only.
- `_sound-src/` raw libraries (3.4 GB: Sonniss GDC bundles, Kenney). The game's own sounds are already in `lobby/public/play/assets/sfx/`.
- `_synty-local/` and `lobby/tools/synty/maps/` (the Synty source packs and scene extracts). The packs are in Google Drive, "Synty (SyntyPass)".
- `lobby/launcher/dist*` (built installers), test data folders `data-dev*`, `_work/recon`.
- TLS private keys.

## Licence note

The Synty models are licensed to the LabCoin team only. Keep this package private: do not share it publicly and do not feed the models to AI tools.
