# Standing brief for helpers: MS Games / "The Motel" (free-roam VR arena, Meta Quest 2)

Read this whole file before you do anything. It is the same for every helper today (2026-11-13).

## The product
- A free-roam VR arena (location-based entertainment). Players wear Meta Quest 2 headsets and WALK in a real room
  ("the zone"); there is no joystick movement. Launcher product: **MS Games**. Lobby server on a PC, headset page in
  the Quest browser (three.js r187, WebXR). Games are web modules.
- Today's subject: the zombie wave shooter **The Motel** (abandoned motel car park of Synty's Woodland Apocalypse Map,
  night). 1-6 players, about 10 minutes, 5 waves + boss, gates the zombies break and players repair, shared weapon chest.
- The owner (Martin) played version 2.3.0 on two real headsets this morning and called it "the worst game I have played".
  His words are in `owner-feedback.md` next to this file: read it, it is the measure of everything.

## Where things are (Windows, Git Bash; use forward slashes)
- `C:/Users/Martiness/Downloads/vr-arena/lobby` = the LIVE lobby (port 47801, version 2.3.0, what the owner played).
- `C:/Users/Martiness/Downloads/vr-arena/lobby-stage` = staging copy of the code (dev server port 47901).
  `lobby-stage/node_modules` and `lobby-stage/public/play/assets` are JUNCTIONS into the live folder.
- Game rules (server side): `game/motel.js` (+ `motel.test.js`, `motel.live.test.js`, `motel.game.json`, `motel.map.json`).
- Game client: `public/play/games/motel/` (`scene.js`, `world.js`, `zombies.js`, `weapons.js`, `chest.js`, `hud.js`,
  `fx.js`, `audio.js`, `synty-kinds.js`, `assets.json`), shared page `public/play/play.js`, `public/play/lib/`.
- Lobby server: `server.js`; operator console `public/index.html` + `public/console.js`; launcher (C#) `launcher/`.
- Asset tools: `lobby/tools/synty/` (`build.mjs`, `characters.mjs`, `want/*.json`, `index/*.json|txt`), Blender 3.6 at
  `C:/Users/Martiness/Downloads/blender-3.6.23-windows-x64/blender.exe`.
- Synty library (the ONLY source of models, textures and animations): SMB share `//192.168.1.40/synty` (read only,
  already reachable from this PC with plain file commands). `README.txt` there explains the layout. Short version:
  `GLB/<category>/<pack>/<name>.glb` + a `.png` picture of every model next to it; `Animations/<pack>/polygon/*.glb`;
  `Originals/<series>/<pack>/Source/...` (FBX + textures). A local copy of the catalogue (59,616 rows: id, category,
  series, pack, name, slot, rig, tris, seconds, approved, not_for_kids, glb, url) is at
  `C:/Users/Martiness/Downloads/vr-arena/_work/catalog.csv`.
- Work folder for today: `C:/Users/Martiness/Downloads/vr-arena/_work/` (write your long reports under `_work/recon/`).
- Python 3.12 (`python`), Node 24, Pillow, numpy, scipy are installed. There is NO ffmpeg on the PATH.

## Hard rules (breaking one of these ruins the day)
1. **Never change, move or delete an existing file under `lobby/`**, never stop or restart anything on ports 47801 or
   47843, never kill a process you did not start. You MAY create NEW files in NEW folders under
   `lobby/public/play/assets/` and `lobby/tools/` (they are not referenced by the live game).
2. **Never use `adb`, never talk to the headsets**, never open `http://localhost:47801` pages that act (reading
   `GET /api/state` is fine).
3. **No accounts, no passwords, no API keys, no payments, no sign-ups.** If a site or tool needs any of these, skip it
   and use another one. Do not use the owner's paid services (Higgsfield and the like).
4. **Downloads**: only from well-known reputable sources, only what the task needs. No executables or installers
   (Python packages from PyPI for well-known projects are fine). Unpack archives in their own new empty folder.
   Record the source URL and the licence of everything you download.
5. **Synty licence**: nothing from the Synty library is uploaded anywhere or sent through any online or AI tool.
6. **The owner's art rules**: only original Synty models and textures at their natural size (never stretched), nothing
   self-made (no procedural textures, no home-made meshes), no boards, panels, icons, emoji or canvas-drawn screens
   inside the game world. Text in the world appears only as big bold titles. All game text is English.
7. **Sound rule (new today)**: no synthesized sounds (no WebAudio oscillators or noise). Every sound is a real
   recording or a professionally made library sound that was downloaded, with a licence that allows commercial use.
   The only AI-made audio allowed is the announcer's voice lines from a free local text-to-speech tool.
8. Shell pitfalls here: Windows Python cannot open `/c/...` paths (use `C:/...`); bash heredocs mangle backslashes and
   choke on apostrophes (write scripts and long texts to a file with your file-writing tool, then run the file);
   `node --test` needs explicit file names.
9. Report honestly. If you could not verify something, say so. Never claim a sound "sounds good": nobody here can
   listen; say what you measured (duration, peak, loudness) and where the file came from.
10. Other helpers work at the same time. Stay inside the files and folders your task names. Do not start servers on
    ports 47801, 47843 or 47901.
