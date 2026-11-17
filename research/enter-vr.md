# Entering VR without a button press (Quest 2/3, any Wi-Fi)

S6, 2026-11-16. Status: **implemented in MSGames-Headset.apk 2.1 (versionCode 11), not yet tried on a headset.** One test on a real headset decides between the two variants of the main path (section 4).

## 1. The problem

A web page may enter VR (`navigator.xr.requestSession('immersive-vr')`) only during a user gesture: a click or a trigger press on the page. The browser enforces this, so an arena page can never put itself into VR from a normal tab. Today:
- the player presses "Enter VR"; or
- the keeper (`lobby-stage/keeper.js`) clicks the button for them through the browser's DevTools over adb.

We want the game to be in VR with no press:
- after power-on;
- after the operator starts a session;
- on any Wi-Fi the PC and headsets share, with no fixed IPs and no DNS set-up per venue.

## 2. What we know for sure (already proven on our headsets)

- **The Quest browser has an immersive custom-tab screen**, `com.oculus.browser.WebXRCustomTabActivity`.
  - It is exported, but no intent routes to it, so it has to be started by component.
  - It needs a Custom Tabs session and the trusted-web-activity extras.
  - A page in that screen may call `requestSession` without a gesture.
  - Proven on R3 on 2026-11-14 with the `bg.arena.vr` app: tap the icon, then the game is in VR, untouched. After a reboot it was also in VR, untouched. The page enters by itself on `?app=1` (`play.js`).
- **The Binder codes** were read from the browser itself (service: warmup = 2, newSession = 3; callback: onNavigationEvent = 2, TAB_SHOWN = 5, TAB_HIDDEN = 6). The hand-written session code in `tools/apk-vr` works.
- **The limit of that proof:** `bg.arena.vr` opened `https://arena.osmantush.com/play/`.
  - That is a public DNS name pointing at 192.168.1.45, so it works only on this venue's LAN.
  - The origin was *verified*: Digital Asset Links at `/.well-known/assetlinks.json`, same signing key. That key is also the key of `bg.arena.play`, whose fingerprint the server already lists.
- **`localhost` is a secure context**, so WebXR works on `http://localhost:47801` through the app's forwarder. This is how `bg.arena.play` has worked on any Wi-Fi since 1.0.
- **Spatial anchors and localStorage belong to an origin.** Moving the game to another origin means one two-point alignment per headset.

## 3. The options

| # | Way | Any network | Survives reboot | Needs the PC's adb | Verdict |
|---|---|---|---|---|---|
| A | **Immersive custom tab at `http://localhost:47801/play/?app=1`** through the forwarder | yes | yes (boot receiver) | no | **Main path (2.1 default)**, if the browser lets an unverified origin enter VR by itself (section 4) |
| B | Immersive custom tab at a **loopback name**, e.g. `https://lo.arena.osmantush.com:47843/play/?app=1`, with the name's A record = 127.0.0.1. The app passes TLS through to the PC untouched, and the PC's real certificate answers by SNI. | yes, unless the router's DNS rebinding guard drops answers of 127.0.0.1 | yes | no | **Ready as the second variant.** Needs one DNS record and one certificate step by the owner |
| C | **Keeper DevTools click** (adb `forward` to `chrome_devtools_remote`, then `Runtime.evaluate(... .click(), userGesture)`) | only where the PC can open TCP 5555 to the headset (no client isolation) | **no:** wireless adb ends when the headset restarts and comes back only after a cable | yes | **Safety net**, already in the keeper and kept |
| D | Quest browser flags or a command-line file | | | | **Rejected:** no flag found that lifts the gesture rule for immersive sessions. Command-line files are a debug feature that browser updates reset. Not tried on a headset |
| E | Our own native app with a WebView | | | | **Rejected:** Android WebView has no WebXR |
| F | Device-owner kiosk (the VEX way) or Meta's business kiosk | | | | **Out of scope:** device owner needs every account removed from the headset, and the business kiosk needs Meta's business subscription. Neither gives a web page a gesture |

**Why not C as the main path:**
- C needs the PC to reach the headset over adb.
- That fails after every headset reboot until someone plugs a cable in.
- It also fails on networks that isolate clients from each other (many guest and venue Wi-Fi networks).
- A and B need nothing from the PC except the game server.

## 4. What 2.1 does, and the one open question

`GameOpener` opens the game in the immersive tab with a Custom Tabs session:
- **Address:** `http://localhost:<listen>/play/?id=<id>&name=<name>&n=<number>&color=<hex>&app=1`.
- **Launch flags:** `NEW_TASK | CLEAR_TASK`, so there is only ever one game screen.
- **Fallback:** if the immersive screen cannot be started, it opens a normal tab without `app=1`, the way of 1.0-2.0.
- **Override for a test:** `--es vr tab` forces the normal tab; `--es vr xr` undoes it.

**Open question:** does the Quest browser let the page enter VR by itself when the origin is *not verified*? An `http://localhost` origin cannot be verified by Digital Asset Links. The two proofs we have used a verified origin.
- **If yes:** variant A is the answer on any network. It needs nothing else, and the origin is the same as the old tab's, so anchors and storage carry over.
- **If no:** variant B. The app is ready for it; nothing more is needed in the APK:
  1. The owner adds a DNS record `lo.arena.osmantush.com A 127.0.0.1` (Cloudflare, DNS only).
  2. `tools/acme.mjs` issues a certificate that covers that name. This is one more TXT step, the same as the renewal.
  3. The server's SNI hands out that certificate for that name. Contract request to S2 below; today `domainSni` matches only the one name in `domain.txt`.
  4. The identity file gets `"origin": "https://lo.arena.osmantush.com:47843"`. The installer can write it, or it can be set per test with `--es origin`.
  5. The app's forwarder also listens on localhost:47843 and passes the bytes to the PC's port 47843.

  Risks of B:
  - **The port is part of the origin.** Apps cannot listen below 1024, so the origin carries `:47843`. Digital Asset Links compares whole origins, so this should verify, but it is not yet proven.
  - **DNS rebinding guards.** Some routers (OpenWrt with rebind protection, Fritz!Box) drop DNS answers of 127.0.0.1. On such a network B fails and the keeper's click (C) is what is left.
  - **New origin.** Each headset needs one two-point alignment.

**Afterwards, in either case:**
- **Keeping the game in front:** the app re-opens the same immersive screen when needed (see `CHANGES.md`).
- **The keeper stays the safety net.** When it sees the page open but not in VR for 25 s, it clicks Enter VR for it. It also closes extra game tabs, and keeps the immersive one (`app=1`) over the others.

## 5. The test on a real headset (needs the owner's yes)

With one headset on the USB cable, worn or with the proximity sensor covered:

```
cd C:\Users\Martiness\Downloads\vr-arena\lobby-stage
node keeper.js install <serial> 1 "#e8b33d" "Headset 1"
```

What to look for:
1. **The install steps:** the command prints check, install, identity, permissions, start, wifi, done, each with ok, skip or warn.
2. **In the headset:** within about 15 s the game opens without a press.
   - It opens **in VR**: variant A works. Done.
   - It opens as a flat panel with an "Enter VR" button: the unverified immersive tab does not auto-enter. Note the exact look. Then run variant B, or rely on C for now.
3. **The read-only check:** `node keeper.js check <serial>` shows:
   - `app: 11`;
   - all three grants `allow`;
   - the identity file;
   - the front activity: `com.oculus.browser/...WebXRCustomTabActivity` when the immersive tab is in front;
   - the app's last log lines ("opened (immersive tab, session) ...").
4. **Reboot test:** reboot the headset (`adb reboot` or power button) and leave it untouched. About 12 s after the home screen appears, the game should open by itself.

The live lobby (47801) must be running for the game to load. Nothing in this test restarts it.

## 6. Pitfalls met on the way

- `am start` of a 2D app hangs while the browser is in immersive VR or the headset is not worn. The installer and the keeper start 2.1 with `am broadcast` to the app's own receiver, which returns at once.
- `adb tcpip 5555` restarts adbd and drops the USB link for a moment. The installer turns on Wi-Fi adb **last**, after the start.
- Reading `/sdcard/msgames/id.json` on Android 11+ needs all-files access (`appops ... MANAGE_EXTERNAL_STORAGE allow`). The installer grants it and also passes the identity as extras, which the app saves. On Android 10, legacy storage covers it.
- Never `adb reverse tcp:47801` on a headset that is on Wi-Fi. The keeper removes a stale one.
- Never clear guardian or space data. Nothing here does: the tests check every command against a forbidden list (`pm clear`, uninstall, `rm`, reboot, `settings put`, guardian, `reverse tcp`).
