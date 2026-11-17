# MSGames-Headset.apk (bg.arena.play): changes

This folder is outside git; this file is its history. Build: `powershell -ExecutionPolicy Bypass -File build.ps1` (defaults to the current version). The v10 sources and APK are kept in `_backup-v10/`.

## 2.1 (versionCode 11), 2026-11-16, S6

**Starts by itself**
- New `BootReceiver`. It fires:
  - at power-on (`BOOT_COMPLETED`, after 12 s);
  - after an update (`MY_PACKAGE_REPLACED`);
  - on `bg.arena.play.START`, the installer's broadcast, which returns at once (`am start` can hang while the headset is not worn).
- The receiver starts `ForwardService` with `ACTION_BOOT`. With no screen, the service:
  1. finds the computer (beacon, last address, subnet scan, now in `Locator`), or uses the `pc` extra first;
  2. starts the forwarder;
  3. opens the game.

  It retries every 15 s for 30 min.
- Autostart can be turned off per headset with `"autostart": false` in the identity file.

**Identity**
- New `Identity`, which reads `/sdcard/msgames/id.json`: `{id, number, color, name}`. Optional fields:
  - `vr` (`xr` | `tab`);
  - `origin` (see `research/enter-vr.md`, variant B);
  - `autostart`.
- If the file cannot be read, the copy passed as extras by the installer (`--es id`, `--ei number`, `--es color`, `--es name`) is used; the app saves it. Without either: the old `Q2-<ANDROID_ID>` id and the device name.
- The page gets `?id=&name=&n=&color=`.

**Opens straight into VR (to be confirmed on a headset)**
- New `GameOpener`. It opens the game in the browser's immersive custom tab (`WebXRCustomTabActivity`), with a hand-written Custom Tabs session, at `http://localhost:47801/play/?...&app=1`.
- A normal tab is the fallback, and `--es vr tab` forces it.
- Same origin as before, so anchors and storage carry over.
- Findings and the test: `vr-arena/research/enter-vr.md`.

**Keeps the game in front**
- While the computer says a session or the waiting room is on (`GET /api/keep?id=`, falling back to `run`/`flow` in `/api/state`), a game that has not been in front for 5 s is opened again, at most once per 15 s.
- What is in front is read from the system's usage events, or from the session's TAB_SHOWN/TAB_HIDDEN when usage access is missing.
- Nothing happens while the headset sleeps or is not worn.

**https origin (variant B):** when the identity's `origin` is `https://<name>:<port>`, the forwarder also listens on that local port and passes TLS bytes untouched to the computer's same port.

**Start screen:** it hands the opening to the service, so there is one way of opening.

**Manifest:**
- new `RECEIVE_BOOT_COMPLETED`, `SYSTEM_ALERT_WINDOW`, `PACKAGE_USAGE_STATS`, `MANAGE_EXTERNAL_STORAGE`, `READ_EXTERNAL_STORAGE` (max 32), `requestLegacyExternalStorage`;
- hand tracking allowed (no "controllers required" block);
- Custom Tabs query.

**What the installer grants over adb** (`lobby-stage/keeper.js`, `installHeadset`): `appops set bg.arena.play SYSTEM_ALERT_WINDOW|GET_USAGE_STATS|MANAGE_EXTERNAL_STORAGE allow`, and `cmd deviceidle whitelist +bg.arena.play`.

**Build:** `build.ps1` defaults to 11 / 2.1 and writes `MSGames-Headset.json` (`{package, versionCode, versionName}`), which the installer reads to skip an install when the headset already has this version.

**Not done in this version:** the passthrough waiting room (design section 7, last line). That belongs to the page (S3), not to this app.

## 2.0 (versionCode 10)

The English copy of the Arena app:
- UDP beacon 47810, last address or subnet scan;
- forwarder on headset localhost:47801;
- a plain browser tab.
