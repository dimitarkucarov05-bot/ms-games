# VEX Play 13.0.2: how the machinery works

Scope: the server-side programs of VEX Play (`HeadsetManager`, `SessionManager`, `DeployManager`, `LauncherManager`, `AutoDeploy`) and the libraries `VEX.Network`, `VEX.API.Session`, `VEX.API.Effect`, `VEXLibrary`, `VEXLibrary.Frame`, plus `RUN SERVER.bat`, the installer's `firewall.bat` and the default settings in LocalAppData. The UI/games side (`VEXLibrary.UI`, `VEX.Text`) is covered in a separate report.

## How this was studied, and its limits

Nothing was run and no VEX server was contacted. Nine of the ten binaries are protected by an obfuscator. It plants a second, fake `#GUID` metadata stream, and that makes REA's `inspect-managed-members` refuse them ("Duplicate metadata stream #GUID"). Only `VEX.API.Effect.dll` (17 KB, not protected) went through REA cleanly. For the other nine I wrote a small read-only reader for the .NET metadata tables. It gives every type, field, method, property, enum value, imported API call, P/Invoke import and embedded resource name.

Public types, enum values, calls into outside libraries and embedded resources survive the obfuscation. Private names are scrambled, and all string literals (URLs, ports, file names, messages) have been moved out of the `#US` heap. They are encrypted, so **port numbers and URL paths cannot be recovered statically.**

Where I infer behaviour rather than see it, I say so.

## 1. The five programs and how they talk

| Program | Role | Evidence |
|---|---|---|
| **LauncherManager.exe** | Tiny entry point that hosts the operator console. It is started with the argument `clean_start` and links `HeadsetManager` and `VEXLibrary.UI` as libraries. | 15 types; references `HeadsetManager`, `VEXLibrary.Global.PlatformTypes` (VEX_ADVENTURE, VEX_ARENA, VEX_ARCADE, VEX_LAUNCHER, VEX_DASH). |
| **HeadsetManager.exe** | The real operator console: headsets, kits, play area, calibration, playlists, games, effects, camera check-in. It links `AutoDeploy` and `DeployManager` in as libraries. | 1003 types; settings `ConfigStep, StationId, HapticEnable, ScannerPort, AdminPin, PlayArea, IsDoubleKit, HeadsetCount, SpareHeadsetCount, SessionTime, LongSessionTime, CameraName, CameraEnable, PlayerAssignationMode, LobbyEnable`. |
| **SessionManager.exe** | Session and player database server, ticket printer, cloud sync of players and scores. | References `QRCoder`, `System.IO.Ports.SerialPort`, raw `Socket`, `HttpClient.PostAsync`, WMI, registry; resource `SessionManager.Printer.logo.bmp`; settings `ServerIp, ServerIpBackup, PrinterIp, PlatformId`. |
| **DeployManager.exe** | Software updates: download from the cloud, share over the LAN, unpack, install on PC, headsets and tablets. | Enum `DOWNLOAD, TRANSFER, UNPACK, UPDATE_HEADSET_FIRMWARE, INSTALL, INSTALL_HEADSET, UPDATE_HEADSET_FIRMWARE_OFFLINE, INSTALL_TABLET`; DotNetZip with progress events. |
| **AutoDeploy.exe** | USB/adb provisioning of headsets and tablets. | SharpAdbClient 2.2; embeds `adb.exe`, `AdbWinApi.dll`, `AdbWinUsbApi.dll`, `headset_settings.json`, `station_info.json`, `system_key.prop`. |

`RUN SERVER.bat` restarts itself with admin rights. It then kills and restarts `LauncherManager`, `SessionManager` and `DeployManager`, each with `clean_start`, and gives each one two attempts to die. The installer's `firewall.bat` adds inbound Windows Firewall rules for TCP and UDP **per program, not per port**, for Session, Station, Deploy, Headset and Launcher managers. (`StationManager` is not shipped in this build and looks like a leftover.) The managers are therefore separate processes, all listening on the LAN, all talking through the shared `VEX.Network` library.

## 2. Network layer (`VEX.Network`, `VEXLibrary.Network`)

There are two generations of the network layer:

- **v2 (`VEX.Network.v2.PacketBase`)** runs over WebSockets (websocket-sharp). It has a server side (`WebSocketServer`, `WebSocketBehavior` OnOpen/OnClose/OnMessage, `Sessions.Broadcast`) and a client side. TLS is optional: the server loads an `X509Certificate2`, and the client has a certificate-validation callback and checks the certificate's expiry date and serial number. Packets are JSON (Newtonsoft) with type tagging (`TypeNameHandling`), so the receiver knows which packet class arrived. Each packet has a `PacketId`.
- **v1 (`VEX.Network.v1.Client/PacketBase`)** is the older format. It is still used by the effects controller (section 7).
- **Service discovery** uses UDP. `ServiceDiscoveryPackets.ServiceAdvertisement` carries `ServiceName, ServiceAddress, ServicePort, ServerId` and is written as compact binary (`ReadFromBinary/WriteToBinary`). `VEX.Network` opens a `UdpClient`, sets a socket option (broadcast), binds and receives asynchronously. So the server announces itself on the LAN and clients find it without typing an IP. `ServerId` keeps two arenas on one network apart.
- **Base packets**:
  - `Ping/Pong` (with `PingTime/PongTime`) for latency and liveness;
  - `AuthClient` (`ClientId, Data, Token`);
  - a generic `Response` with `State` (SUCCESS/WARNING/ERROR), a numeric `Code` and a `Message`.
- **Client roles** (`ClientType`): GAME, MANAGER, KIOSK, TABLET, DEBUG, SERVICE, TERMINAL, LOBBY, STATION, MASTER_GAME.
- **Remote database access**: `SelectPacket`, `SelectAllPacket` (with a `Condition` tree: AND, OR, EQUAL, NOT_EQUAL, GREATER/LESS, IN, NOT_IN, IS_NULL), `AddPacket`, `BulkAddPacket`, `RemovePacket`. SessionManager exposes its database as remote create/read/delete over the socket. Kiosks and the console query it directly.
- **Legacy command set** (`PacketCommand`) includes START/STOP_EXPERIENCE, SECURITY_VIDEO, CALL_OPERATOR, RESTART_VR, HARDSTOP_VR, POWEROFF_CONTROLLERS and ANY/NO_HEADSET_MOUNTED.
- **Station protocol** (PC-tethered stations): `RegisterClient` (TABLET, ADVENTURE_MANAGER, OVERLAY_VR, LAUNCHER_VR) and `StationInfo` (State, ExperienceId, LanguageIndex, DevicesStatus, with a `GetDifference` method, so only changes are sent). The station also gets a **resource hash table** (`ResourceHash` = resource + MD5) and `RequestResource/UpdateResource`, so it pulls only the images, configs and videos it lacks. Then come `StartExperience` and `StartVR(Seconds)`. Station states: LOADING, READY, LAUNCHING, FOCUSING, PLAYING, CLOSING, EXIT, SHUTDOWN, RESTART.
- **Tracking packets** (binary, small, sent often): `UpdateHeadsetPosition(HeadsetId, HeadsetKit, PosXYZ, RotWXYZ, CaptureTime)`, `UpdateStatus`, and `TrackingState` (NO_DATA, OFF, VISIBLE, NOT_VISIBLE, RESET_VR, STEAMVR_ERROR). This is for the Vive-tracker mode, where a PC running SteamVR streams each headset's true pose to it.

Ports: not recoverable (encrypted literals), and the firewall rules do not name them.

## 3. Finding, connecting and auto-starting headsets

Headsets are first met over **USB/adb**. AutoDeploy uses SharpAdbClient: `GetDevices` (serial, state, model), `SyncService.Push/Pull`, `PackageManager.InstallRemotePackage/UninstallPackage`, `ExecuteRemoteCommand` (shell). It runs its own bundled `adb.exe`.

The operator console walks each device through these states: PLUG_DEVICE → PLUG_DEVICE_ASSIGNED / PLUG_DEVICE_TO_KIT → UNAUTHORIZED (USB debugging not yet accepted) → ASSIGN_DEVICE → DEPLOY / ASSIGN_AND_DEPLOY → DEPLOY_IN_PROGRESS → COMPLETED or DEPLOY_FAILED. You can assign manually or let it assign the next free number (`MANUAL_ASSIGN/AUTO_ASSIGN`).

AutoDeploy writes two templates into each headset (I read them from the exe's embedded resources):
- `headset_settings.json`: `headsetId`, `serverIp`, `altEnvironment`, `altPlacement`.
- `station_info.json` (one per game, next to `setup_info.json` and `session_info.json`): `playerIdentity` (= headset number), `ipServer`, `autoConfig: true`, `autoStart: true`, `isServer: false`, `useVRHeadset`, `useDissonance` (voice chat), `displayScorePanel`, `displayAdminPanel`, `useExternalCamera`, `useTrailerCamera`, `serverAudio`.

So every headset gets a **fixed identity and the server address written to disk**. On launch the game reads the file, configures itself and connects. The PC runs the same game as `isServer: true`, as the authority and the spectator screen.

Auto-start and lock-down (inferred from the settings):
- `DeviceOwnerMode` / `TabletDeviceOwnerMode`: the Android device-owner mode is what allows lock-task kiosk mode and launch-on-boot.
- The setup flow has pictures for removing Android, Meta and Vive accounts (`remove-android-accounts.jpg`, `account_step_*_meta/vive.jpg`). Device owner can only be set on a headset with no accounts on it.
- `ViveLBEMode` (NON_LBE/LBE/LBE_VEX).
- `WifiName/WifiPass/WifiAutoFillDisabled` are pushed to the headset.
- For Pico, `system_key.prop` **remaps the Home button**: a single tap sends a broadcast to the app, a double tap recenters, and the system Home menu needs a 15-second long press. Players cannot leave the game by accident.

Supported devices (`DeviceTypes`): Pico Neo 2/3/4/4 Ultra, Quest 1/2/3/3S, Vive Pro, Vive Focus 3, Vive Focus Vision.

Each headset reports its link state (CONNECTED, RESTARTING, FAILING and so on) and whether it is being worn. Controller re-pairing has its own guided five-step flow.

## 4. Deploying games and updates

**AutoDeploy (per device, over USB):** global states are WAITING_DEVICES → READY_TO_DEPLOY → DEPLOYING → DEPLOY_SUCCESS/ERROR. Each device is READY, DEPLOYING, SUCCESS or ERROR and is either a HEADSET or a TABLET. Assist modes are INSTALL_RELEASE, UPDATE_FIRMWARE and UPDATE_FIRMWARE_OFFLINE. Files are checked with MD5, and some payloads are AES-encrypted. A global keyboard hook (`SetWindowsHookEx`) provides operator hotkeys.

Firmware gating checks the conditions first: UPDATE_REQUIRED_BUT_MISSING_CONTROLLER, BUT_NOT_ENOUGH_BATTERY, BUT_NO_NETWORK, then STARTED/IN_PROGRESS/FAILED/FINISHED.

**`TrackingType`** (the only key in `VEX Deploy\auto_deplay_settings.json`, default 0 = UNDEFINED) picks the tracking setup written into the deployment:
1. TYPE_3DOF_ANTILATENCY
2. TYPE_6DOF_VIVE_TRACKER
3. TYPE_6DOF_DOCKING
4. TYPE_6DOF_SHARED_MAP
5. TYPE_6DOF_ANTILATENCY

AutoDeploy's settings also carry `HeadsetType`, `Headsets`, `HeadsetsKitA`, `HeadsetsKitB`, `HeadsetsSpare`, `Tablets`, `AltEnvironment`, `AltPlacement`, `AudioLanguages`, `ForcedAudioLanguages`.

**DeployManager (whole site, over the network):**
- Release data per app: `Version, Checksum, Size, FileCount, URL, Targets, ProcessList` (programs to close before installing), `InstallHeadsetNeeded`, `InstallTabletNeeded`, `UpdateHeadsetFirmwareNeeded` + `TargetHeadsetFirmware`, `ForceRelease` + `ForceReleaseDate`, `ImportantRelease`, `ReleaseMessage`, `RebootNeeded`, public and private changelogs, `BackupCount` and `VersionHistory` (rollback).
- Release channels DEV, BETA, PREVIEW, PROD, OPT_OUT; disk-space checks before download, unpack and install.
- One PC is the **master** (`master_deploy_settings.json`: cloud `ServerIp`, `StationCount`, `PlatformId`). It downloads from the cloud. Every other PC's DeployManager (`deploy_settings.json`, `ServerIp: 127.0.0.1` by default) gets the files from the master over the LAN (`TRANSFER_SENDING/RECEIVING`, deploy mode WEB vs LAN).
- The console shows `ExpectedDeployManagers` vs `ConnectedDeployManagers` and a "missing managers" warning.

## 5. Sessions across several headsets

`VEX.API.Session` defines the shared vocabulary:
- **Session state**: LAUNCHING → LOBBY → PLAYING → FINISHED.
- **End reason**: SESSION_FINISHED, STOP_BY_GAME, STOP_BY_MANAGER, STOP_UNEXPECTED.
- **Rounds** inside a session, and **scores with ranks** (`SubmitScores`; the error ERR_WRONG_SCORES_AND_RANKS_COUNT shows that the counts are checked).
- **Players**: name, gender, colour (BLACK, BLUE, ORANGE, GREEN, RED, PINK, PURPLE, WHITE), team, optional email. Anonymous or "dummy" users are pre-loaded so a walk-in group can start with no registration.
- The **response codes** spell out the rules, for example WARN_PREVIOUS_SESSION_NOT_ENDED, WARN_USER_ALREADY_ADDED_TO_SESSION, WARN_INDEX_ALREADY_OCCUPIED_BY_OTHER_USER (two players on one headset slot), ERR_NO_FUTURE_SESSION (bookings), ERR_FAIL_TO_PRINT_TICKET.

Flow (pieced together from the enums):
1. The operator or a kiosk adds players (the kiosk steps are WELCOME, USER, VIDEO_SAFETY, VIDEO_WATCH_SAFETY, SELECT, VIDEO_TUTORIAL, READY, SCORE, PICTURE, PICTURE_CONFIRM).
2. Players are assigned to headset slots, and the assignment can be locked (`LOCK_USER_ASSIGNATION`).
3. The console launches the game on the PC as server and on every headset.
4. Each headset moves OFFLINE → WAITING → READY → LAUNCHING → PLAYING → CLOSING.
5. If a headset does not reach the game, or drops, the console raises GAME_NOT_LAUNCHING or HEADSET_DISCONNECTED (fail kinds MANUAL_FAIL, LAUNCH_FAIL, PLAY_FAIL), within `HEADSET_CONNECTION_TIMEOUT`.
6. The session runs for `SessionTime` (default 120 s) or `LongSessionTime` (900 s), with `AUTO_PAUSE`, `AUTO_STOP` + `AUTO_STOP_TIMER`, and `DEMO_MODE/DEMO_TIME`.
7. At the end each headset shows an end message chosen from REMOVE_HEADSET, THANK_YOU, WAIT_STAFF, WAIT_OPERATOR or CUSTOM.

`VEX.API.Session` can also kill a stuck game process on the PC (`OpenProcess/TerminateProcess`).

Live game settings travel as one schema, `VEX_BaseSettings`, in three groups:
- **Session**: PLAYERS, DIFFICULTY, DURATION, MODE, MAP, audio and text language, subtitles, PLAY_AREA_OVERRIDE.
- **Setup**: SERVER_ID, PLAY_AREA, OPERATOR_LANGUAGE.
- **Game**: about 50 keys, such as server and client volumes, subtitle layout, GRAPHIC_QUALITY_PROFILE, EXTERNAL_CAMERA_MODE, SECURITY_FENCE_VISIBILITY_DISTANCE, PLAY_AREA_ROTATION, USE_HANDTRACKING, plus Arcade (selection timers, end-score duration) and Adventure (entrance, short version, effect factors) subgroups.

Games subscribe through `SettingLocalProvider` (`SubscribeSettings / UpdateSettings`). The safety flow can be NONE, SAFETY_GAME, SAFETY or GAME, with matching SKIP_* options.

**Playlists** chain games into one booked session in three modes: TIMELINE (a fixed order), VOTE (players vote for the next game) and TIME_BASED. Ready-made playlists are embedded (`playlists_timeline_arena.data`, `playlists_vote_play.data`, and so on).

**Double kit**: `IsDoubleKit` with kits A and B plus spares. One group plays while the next group is kitted up, and a spare headset can replace a failed one.

## 6. Play area, co-location and calibration

- **`PlayArea`** is stored as `SIZE_WxD`, encoded as 10000 + 100·W + D: SIZE_4x4 = 10404, 5x5, 6x6, 6x8, 8x8, 8x10, SIZE_10x10 = 11010 (metres). The default is SIZE_4x4, and games can override it. The entrance side is RIGHT, LEFT or MIDDLE, and the area can be rotated 0/90/180/270°.
- **Setup wizard** steps (`ConfigStep`): SYSTEM_CONFIG 100, SYSTEM_UPDATE 110, BASIC_UI_CONFIG 190, LBE_LICENSE_CONFIG 200, DEVICE_OWNER_CONFIG 210, HEADSET_DEPLOY 300, PLAY_AREA_PREPARATION 400, PLAY_AREA_SHARED_MAP_CREATION 405, PLAY_AREA_SHARED_MAP_SYNCHRONIZATION 406, PLAY_AREA_CONFIGURATION 410, PLAY_AREA_SYNCHRONIZATION 420, then TABLET_*, CONGRATULATION 900, COMPLETED 1000. The wizard can be entered as FIRST_CONFIG, RESET_SERVER_CONFIG, ADD_HEADSET or ADD_TABLET.
- **Shared map** (6DOF_SHARED_MAP): one headset builds a spatial map, guided step by step: READY_MAP_CREATION, DEFINE_ARUCO_CODE (a printed ArUco marker), START_MAP_CREATION, CLEAR_MAP_DATA, WALK_TO_BLOCK, SCAN_BLOCK, RESET_BLOCK, WALK_TO_MAP_CENTER, DEFINE_MAP_CENTER, DEFINE_MAP_SIZE, DEFINE_MAP_FLOOR, FINISH_MAP_CREATION. The console then **exports the map from that headset, downloads it to the PC, uploads it to every other headset and imports it** (IDLE, EXPORT, DOWNLOAD, UPLOAD, IMPORT, UPDATE, RESET). The map is checked for corruption (NOT_CORRUPTED, RESOLVING, CORRUPTED; errors SHARED_MAP_IO_ERROR, SHARED_MAP_TOB_ERROR). Data kinds: SHARED_MAP, SHARED_ZONE, LOCAL_DOCKING. Re-sync options: DEFAULT, RESET_PLAY_AREA_ONLY, SYNC_SHARED_MAP_ONLY.
- **Calibration**: TWO_POINTS or ONE_POINT, with progress DISABLED, FIRST_POINT, SECOND_POINT, COMPLETED, FAIL. The player touches two known floor points, so every headset agrees on origin and heading.
- **Docking** (6DOF_DOCKING, `docking_step_1.jpg`): each headset is set in a physical dock at a known pose to set its origin.
- **Antilatency / Vive tracker**: external optical tracking. In the Vive-tracker mode the PC streams poses to headsets with the binary tracking packets in section 2.

## 7. Effects (`VEX.API.Effect`) and haptics

`VEX.API.Effect` is a client (`EffectClient : VEX.Network.v1.Client`) for a separate **4D effects controller**. HeadsetManager creates `AdventurePlatform` and calls `StartEffect, KillEffect, StartLight, StopLight`, using `WindEffect`, `VibrationEffect` and `SmokeEffect`.

- Effect types: WIND, HEAT, VIBRATION, SMOKE. Fans and heaters are devices D1–D4, the vibrating floor has zones Z1–Z8.
- Each effect has an **envelope**: `Intensity, Duration, DelayIn, FadeIn, IntensityIn, FadeOut, IntensityOut, DelayOut`. The controller reports progress back: START, FADE_IN, STAY, FADE_OUT, END, EXIT.
- **Smell**: 10 scent slots. **Lights**: lines COLUMN, BARS, MOVING_HEAD, with a scene catalogue (red/blue team splits, full colours, per-player on/off, WARNING, FIGHT).

Game-side multipliers: `VIBRATION_FACTOR, HEAT_FACTOR, WIND_FACTOR, SCENT_FIRE_COUNT`.

**bHaptics**: `Bhaptics.Tact.dll`, `LeapCSharp.NET4.5.dll` and `openvr_api.dll` are shipped in `lib`, but **none of the ten binaries references them**. The managers only carry a `HapticEnable` switch (default true), which is passed to the games. The vests must be driven by the games themselves, or by a component outside this set.

## 8. Printing, QR codes, cameras and media

- **Ticket printer** (`PrinterIp`, default 192.168.3.191): SessionManager opens a raw `Socket` (connect, send, receive, poll, timeouts) or a `SerialPort` (connection kind SERIAL or LAN). Printer status is ON, OFF or COVER_OPEN. The alignment values 48/49/50 are ASCII '0','1','2', the standard ESC/POS "justify" argument, so this is an ordinary ESC/POS receipt printer. It prints a logo bitmap and a **QR code** made with QRCoder, probably linking each ticket to the player's online result. The error code is ERR_FAIL_TO_PRINT_TICKET.
- **Camera check-in**: HeadsetManager lists webcams with FlashCap (name, resolution, fps), grabs frames and runs **OpenCV `QRCodeDetector.DetectAndDecode`** on them. This is a webcam QR scanner for tickets or bookings (`CameraName, CameraEnable`), with a serial barcode scanner (`ScannerPort`) as the alternative. The kiosk's PICTURE / PICTURE_CONFIRM steps take player photos.
- **Pay-per-play**: `VEXLibrary` has an arcade card-reader setting (type NONE or INTERCARD, `SerialPort`, `SwipeValue`, and `ExperiencesPrice` as a list of `ExperienceId + CoinPrice`).
- **VEXLibrary.Frame**: a fading media layer for screens. It has a video player (ffme/FFmpeg; states IDLE, LOADING, SEEKING, READY, FADING_IN, PLAYING, FADING_OUT, ENDED), an embedded Chromium browser (CefSharp 114) for web content, and NAudio output with audio-device selection. Security and tutorial videos and trailers play through it.
- **Windows control**: VEXLibrary keeps the game window in front (EnumWindows, SetForegroundWindow, SetWindowPos, mouse_event) and stops or disables Windows services (ChangeServiceConfig).

## 9. The cloud server (described only, not contacted)

`session_settings.json` and `master_deploy_settings.json` point to `18.197.3.64` (it looks like an AWS Frankfurt address), and `ServerIpBackup` holds the same address. The site is identified by a `PlatformId` (a placeholder in these files). From the code paths, the cloud is used for:
1. release metadata and downloads for the master DeployManager (`RequestUpdateInfo(CurrVersion, ExperienceList, PlatformId)`, `UpdateDeployStatus`);
2. players, sessions, scores and bookings sync from SessionManager over HTTPS POST (JSON and form-encoded);
3. site and machine identity, which uses WMI hardware queries and registry values.

**Licence/activation:** a licence step (`LBE_LICENSE_CONFIG`), signed and encrypted data (RSA and AES with BouncyCastle) and per-game states ENABLED, DISABLED, LOCKED, COMINGSOON, DEMO decide which experiences a site may run, and whether in full or demo form.

## 10. The 15 most valuable ideas for MS Games (ranked)

1. **One session state machine with recorded end reasons** (launching, lobby, playing, finished; ended by the game, by the operator or unexpectedly), stored per session, so every problem is countable afterwards.
2. **Per-headset status with automatic alerts**: "game did not start in N seconds" and "headset dropped", with one operator button to retry or swap in a spare.
3. **Shared-space alignment for co-located players**: align once (two floor points or a printed marker), then sync the result to every headset through the server, with a check that it is not corrupted.
4. **Live settings bus**: one typed settings schema (session, setup, game) that every game subscribes to, so the console can change volume, difficulty, fence distance or play time mid-game.
5. **Headset-on/headset-off events** to start the briefing when a player puts the headset on and pause when it comes off.
6. **Guided setup wizard** with numbered steps and the entry points "first setup", "add headset", "reset", so a new staff member can bring up the arena alone.
7. **Printed ticket at the end** with score, rank and a QR to an online result page, on the thermal printer the owner already has.
8. **Double kit plus spares**: two groups of headsets so the next group is briefed while the current one plays.
9. **Playlists for booked sessions**: a fixed sequence, a player vote for the next game, or "play until the time is up".
10. **Fixed identity per headset written by the server** (headset number, server address, auto-start), so a headset that reboots rejoins as the same player slot without anyone touching it.
11. **Safety and tutorial step before each game**, with an operator choice to skip it for returning players.
12. **End-of-game message presets** in the headset (take off the headset, thank you, wait for staff, custom text).
13. **Webcam QR check-in plus a player photo** at the counter, so players and scores are tied to a booking with no typing.
14. **Update channels with forced deadlines, rollback history and disk-space checks**, with the main PC sharing new builds to the others over the LAN.
15. **An effects API built around envelopes** (delay, fade-in, hold, fade-out, with progress callbacks, zones and team light scenes), ready for fans, vibration floors or DMX lights if the arena adds 4D hardware.

---

VEX Play splits the job into separate LAN services that talk JSON over WebSockets and find each other by UDP broadcast: a console, a session/print/cloud server, a deploy server and USB provisioning. Each headset gets its identity and server address written to it over adb, and auto-starts locked into the game.
Its strongest ideas are operational: strict session and headset state machines with alerts, shared play-area alignment synced to all headsets, a live settings bus, double kits, playlists and printed QR tickets. Ports and URLs are hidden by an obfuscator and could not be read statically.
