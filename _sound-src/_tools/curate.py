"""Cut the chosen library recordings into the game's sound bank and write the sound maps.

    python curate.py            build everything
    python curate.py shot gate  build only events whose name starts with one of these words (maps are rewritten whole)

Writes  lobby-stage/public/play/assets/sfx/motel/<family>/*.ogg + map.json + SOURCES.tsv
        lobby-stage/public/play/assets/sfx/lobby/*.ogg + hooks.json + SOURCES.tsv
Only editing is done here: trimming, fades, level, mono/stereo fold, crossfaded loops, and laying recordings after or
over each other (a reload = magazine out, then magazine in). Nothing is synthesized.
Source files are named by a unique part of their path under _sound-src.
"""
import json
import math
import os
import subprocess
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.dirname(HERE)
ARENA = os.path.dirname(SRC)
sys.path.insert(0, os.path.join(ARENA, "lobby", "tools", "sfx"))
import sfx  # noqa: E402  (the arena's own cutter: ffmpeg decode, trim, loop)

SR = sfx.OUT_RATE
OUT_MOTEL = os.path.join(ARENA, "lobby-stage", "public", "play", "assets", "sfx", "motel")
OUT_LOBBY = os.path.join(ARENA, "lobby-stage", "public", "play", "assets", "sfx", "lobby")

# ------------------------------------------------------------------ source lookup
_all = None


def src(part):
    global _all
    if _all is None:
        _all = []
        for root in ("sonniss-gdc", "kenney", "incompetech", "2015", "2016", "2017", "2018"):
            for d, _, fs in os.walk(os.path.join(SRC, root)):
                for f in fs:
                    if f.lower().endswith((".wav", ".ogg", ".mp3")):
                        _all.append(os.path.relpath(os.path.join(d, f), SRC).replace("\\", "/"))
    hits = [p for p in _all if part.lower() in p.lower()]
    if len(hits) > 1:
        pref = [p for p in hits if p.startswith(("sonniss-gdc", "kenney", "incompetech"))]
        hits = pref if len(pref) == 1 else hits
    if len(hits) != 1:
        raise SystemExit(f"source '{part}' matches {len(hits)} files: {hits[:4]}")
    return hits[0]


def read(part, a=None, b=None, stereo=False):
    path = os.path.join(SRC, src(part))
    ch = 2 if stereo else 1
    blocks = list(sfx.stream_pcm(path, ch, SR, a, b))
    if not blocks:
        raise SystemExit(f"nothing decoded from {part} {a}-{b}")
    x = np.concatenate(blocks).astype(np.float64)
    return x if stereo else x[:, 0]


# ------------------------------------------------------------------ editing
def env_of(x, ms=2.0):
    m = np.abs(x if x.ndim == 1 else x.mean(axis=1))
    n = max(1, int(SR * ms / 1000))
    return np.convolve(m, np.ones(n) / n, mode="same")


def trim(x, db=-50.0, lead=0.003, tail=0.01):
    e = np.abs(x if x.ndim == 1 else x.mean(axis=1))
    pk = e.max()
    if pk <= 0:
        return x
    loud = np.flatnonzero(e > pk * 10 ** (db / 20))
    a = max(0, int(loud[0]) - int(lead * SR))
    b = min(len(x), int(loud[-1]) + 1 + int(tail * SR))
    return x[a:b]


def fades(x, fin=2.0, fout=30.0):
    x = x.copy()
    n1 = min(int(SR * fin / 1000), len(x) // 2)
    n2 = min(int(SR * fout / 1000), len(x) // 2)
    if n1 > 1:
        r = np.linspace(0, 1, n1, endpoint=False)
        x[:n1] = (x[:n1].T * r).T
    if n2 > 1:
        r = np.cos(np.linspace(0, math.pi / 2, n2)) ** 2
        x[-n2:] = (x[-n2:].T * r).T
    return x


def level(x, peak=-1.0):
    pk = np.abs(x).max()
    return x if pk <= 0 else x * (10 ** (peak / 20) / pk)


def drive_to(x, target, ceiling=-1.0, most=14.0):
    """Raise the loudness of a recording to an RMS target with a soft ceiling (tanh), the way gunshots and beds are
    levelled for a game. Nothing is added: it is gain and limiting only."""
    c = 10 ** (ceiling / 20)
    x = level(x, ceiling)
    for _ in range(4):
        rms = math.sqrt(float((x ** 2).mean())) or 1e-9
        need = target - 20 * math.log10(rms)
        if need <= 0.3:
            break
        g = 10 ** (min(need, most) / 20)
        x = c * np.tanh(x * g / c)
        most -= min(need, most)
        if most <= 0.1:
            break
    return x


# RMS targets by event prefix (dBFS): families that must sit at one loudness whatever the microphone was
TARGET = {"shot.pistol": -19, "range.shot": -19, "shot.smg": -18, "shot.carbine": -18, "shot.rifle": -17, "shot.revolver": -16,
          "shot.shotgun": -15, "shot.hunting": -15, "shot.lmg": -17, "ambience.": -24, "music.": -22,
          "world.neon": -26, "world.thunder": -19, "world.heli": -20, "impact.gore": -22, "impact.head": -20,
          "impact.body": -20, "gun.reload": -24, "gun.mag": -24, "gun.dry": -26, "zombie.step": -22,
          "gate.hammer": -19, "gate.crack": -20, "zombie.idle": -18, "player.hurt": -18, "melee.chop": -18}


def onsets(x, n=None, min_gap=0.08, thr=0.3):
    """Sample positions where a new hit starts (envelope crossing thr x peak, at least min_gap apart)."""
    e = env_of(x, 1.5)
    t = e.max() * thr
    out, last = [], -10 ** 9
    above = e > t
    idx = np.flatnonzero(above & ~np.roll(above, 1))
    for i in idx:
        if i - last >= min_gap * SR:
            out.append(int(i))
            last = i
    return out[:n] if n else out


def loop(x, xfade_ms=400.0):
    if x.ndim == 1:
        return sfx.make_loop(x, xfade_ms)[0]
    l, _ = sfx.make_loop(x[:, 0].copy(), xfade_ms)
    r, _ = sfx.make_loop(x[:, 1].copy(), xfade_ms)
    return np.stack([l, r], axis=1)


def lay(parts, stereo=False):
    """Mix recordings at their start times: [(samples, seconds, gain), ...]."""
    n = max(int(at * SR) + len(p) for p, at, _ in parts)
    out = np.zeros((n, 2) if stereo else n)
    for p, at, g in parts:
        a = int(at * SR)
        out[a:a + len(p)] += p * g
    return out


def write(x, dst, q=5):
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    ch = 1 if x.ndim == 1 else 2
    cmd = [sfx.ffmpeg(), "-v", "error", "-nostdin", "-y", "-f", "f32le", "-ar", str(SR), "-ac", str(ch), "-i", "-",
           "-c:a", "libvorbis", "-q:a", str(q), "-map_metadata", "-1", dst]
    p = subprocess.run(cmd, input=x.astype("<f4").tobytes(), capture_output=True)
    if p.returncode != 0:
        raise SystemExit("ffmpeg: " + p.stderr.decode("utf-8", "replace")[-300:])


# ------------------------------------------------------------------ recipes
class Bank:
    def __init__(self, out_dir, only):
        self.out, self.only = out_dir, only
        self.events, self.sources, self.stats = {}, [], []

    def want(self, event):
        return not self.only or any(event.startswith(o) for o in self.only)

    def put(self, event, name, make, kids=False, note_src=""):
        """make() -> samples. Registers <name>.ogg under the event (or its kids list)."""
        rel = name + ".ogg"
        e = self.events.setdefault(event, {"files": [], "kids": []})
        (e["kids"] if kids else e["files"]).append(rel)
        self.sources.append((rel, note_src))
        dst = os.path.join(self.out, *rel.split("/"))
        if self.want(event):
            x = make()
            for k, t in TARGET.items():
                if event.startswith(k):
                    x = drive_to(x, t, -1.0 if not event.startswith(("ambience", "music", "world.neon")) else -3.0)
                    break
            write(x, dst)
            pk = np.abs(x).max()
            rms = math.sqrt(float((x ** 2).mean()))
            self.stats.append((rel, len(x) / SR, 20 * math.log10(max(pk, 1e-9)), 20 * math.log10(max(rms, 1e-9))))

    # one region of one file
    def cut(self, event, name, part, a=None, b=None, fout=30.0, peak=-1.0, maxlen=None, kids=False, db=-50.0,
            stereo=False, lp=False, xf=400.0, fin=2.0):
        def make():
            x = read(part, a, b, stereo)
            if not lp:
                x = trim(x, db)
            if maxlen and len(x) > maxlen * SR:
                x = x[: int(maxlen * SR)]
            x = loop(x, xf) if lp else fades(x, fin, fout)
            return level(x, peak)
        self.put(event, name, make, kids, f"{src(part)}\t{a if a is not None else 0}-{b if b is not None else 'end'}" + ("\tloop" if lp else ""))

    # the hits inside one region, each as its own file: picks = which onsets (0-based), length = seconds kept
    def hits(self, event, stem, part, a, b, picks, length, min_gap=0.08, thr=0.3, fout=40.0, peak=-1.0, kids=False, first=1):
        def one(k):
            def make():
                x = read(part, a, b)
                on = onsets(x, None, min_gap, thr)
                if k >= len(on):
                    raise SystemExit(f"{part}: only {len(on)} onsets in {a}-{b}, wanted #{k}")
                s = max(0, on[k] - int(0.004 * SR))
                e = min(len(x), s + int(length * SR))
                if k + 1 < len(on):
                    e = min(e, on[k + 1] - int(0.006 * SR)) if length > 9 else e
                return level(fades(trim(x[s:e], -55.0), 1.0, fout), peak)
            return make
        for i, k in enumerate(picks):
            self.put(event, f"{stem}_{i + first:02d}", one(k), kids, f"{src(part)}\t{a}-{b} hit #{k + 1}")

    def shots(self, event, stem, close, far, rc, rf, picks, length, far_gain=0.7, min_gap=0.08, first=1):
        """One round per file from two microphones of the same take: the close one (crack) over the far one
        (body and tail of the place), each cut at its own onset so they start together."""
        def one(k):
            def make():
                out = []
                for part, (a, b), g in ((close, rc, 1.0), (far, rf, far_gain)):
                    x = read(part, a, b)
                    on = onsets(x, None, min_gap, 0.3)
                    if k >= len(on):
                        raise SystemExit(f"{part}: only {len(on)} onsets in {a}-{b}, wanted #{k}")
                    s0 = max(0, on[k] - int(0.004 * SR))
                    out.append((level(fades(x[s0:s0 + int(length * SR)], 1.0, 60.0), -1.0), 0.0, g))
                return level(lay(out), -1.0)
            return make
        for i, k in enumerate(picks):
            self.put(event, f"{stem}_{i + first:02d}", one(k), False, f"{src(close)} [{rc[0]}-{rc[1]}] + {src(far)} [{rf[0]}-{rf[1]}]	hit #{k + 1}, two microphones laid together")

    def mix(self, event, name, layers, peak=-1.0, fout=60.0, kids=False, stereo=False, lp=False, xf=600.0, total=None):
        """layers: [(part, a, b, at_seconds, gain, maxlen)]"""
        def make():
            parts = []
            for part, a, b, at, g, ml in layers:
                x = read(part, a, b, stereo)
                x = x if lp else trim(x)
                if ml:
                    x = x[: int(ml * SR)]
                parts.append((level(x if lp else fades(x, 2.0, 40.0), -1.0), at, g))
            x = lay(parts, stereo)
            if total:
                x = x[: int(total * SR)]
            x = loop(x, xf) if lp else fades(x, 2.0, fout)
            return level(x, peak)
        self.put(event, name, make, kids, " + ".join(f"{src(l[0])} [{l[1]}-{l[2]} at {l[3]}s]" for l in layers))

    def meta(self, event, **kw):
        self.events.setdefault(event, {"files": [], "kids": []}).update(kw)


def motel(only):
    B = Bank(OUT_MOTEL, only)
    G = "Pole Position Production - "
    # ---------------- guns: every shot is the close microphone, one round per file
    B.shots("shot.pistol", "guns/pistol", "SIG_P229_9mm_1m_left", "SIG_P229_9mm_50m_behind", (0.1, 1.5), (0.15, 1.7), [2, 0], 0.8)
    B.shots("shot.pistol", "guns/pistol", "SIG_P229_9mm_1m_left", "SIG_P229_9mm_50m_behind", (3.0, 4.5), (3.1, 4.7), [2, 1], 0.8, first=3)
    B.cut("shot.pistol", "guns/pistol_05", "Hand Gun 6")
    B.shots("shot.pistol", "guns/pistol", "Glock_18_1m_left", "Glock_18_75m_behind", (0.0, 2.2), (0.1, 2.4), [5], 0.8, first=6)
    B.meta("shot.pistol", gain=1.0, pitch=[0.96, 1.04], space="2d own / 3d others")
    B.shots("shot.smg", "guns/smg", "Uzi_9mm_1m_right", "Uzi_9mm_75m_behind", (0.15, 2.2), (0.25, 2.4), [0, 1, 2, 3, 4], 0.45, min_gap=0.07)
    B.meta("shot.smg", gain=0.85, pitch=[0.96, 1.05], space="2d own / 3d others")
    B.hits("shot.revolver", "guns/revolver", "M29_.44_Magnum_1.5m_behind_right", 0.0, 0.95, [0], 1.1)
    B.hits("shot.revolver", "guns/revolver", "M29_.44_Magnum_1.5m_behind_right", 3.9, 4.95, [0], 1.1, first=2)
    B.hits("shot.revolver", "guns/revolver", "M66_.357_Magnum_1m_left", 0.0, 1.6, [1], 1.2, min_gap=0.15, first=3)
    B.cut("shot.revolver", "guns/revolver_04", "gun_revolver_pistol_shot_04", maxlen=1.2)
    B.meta("shot.revolver", gain=1.0, pitch=[0.95, 1.03], space="2d own / 3d others")
    B.cut("shot.shotgun", "guns/shotgun_01", "SAIGA-12_12g_solid_slug_1m_left", 7.95, 9.2)
    B.cut("shot.shotgun", "guns/shotgun_02", "SAIGA-12_12g_solid_slug_1m_left", 11.95, 13.2)
    B.cut("shot.shotgun", "guns/shotgun_03", "SAIGA-12_12g_solid_slug_1m_left", 27.95, 29.2)
    B.cut("shot.shotgun", "guns/shotgun_04", "Shotgun_Fire_Slug_01", 0.0, 2.2, fout=400)
    B.meta("shot.shotgun", gain=1.0, pitch=[0.95, 1.03], space="2d own / 3d others", note="blast only; play shotgun.pump 0.35 s later")
    B.hits("shot.carbine", "guns/carbine", "HK_416_5.56mm_on_gun", 0.0, 3.0, [0, 2, 4, 6], 0.5, min_gap=0.1)
    B.meta("shot.carbine", gain=0.9, pitch=[0.96, 1.04], space="2d own / 3d others")
    B.shots("shot.rifle", "guns/rifle", "AKM_7.62x39mm_1m_left", "AKM_7.62x39mm_55m_in_front", (0.1, 1.4), (0.0, 1.5), [0, 1, 2], 0.6, min_gap=0.1)
    B.cut("shot.rifle", "guns/rifle_04", "EFX EXT M4 Shots 02 B", 1.0, 2.7, maxlen=1.3, fout=300)
    B.cut("shot.rifle", "guns/rifle_05", "EFX EXT M4 Shots 02 B", 6.45, 7.8, maxlen=1.3, fout=300)
    B.meta("shot.rifle", gain=0.95, pitch=[0.96, 1.04], space="2d own / 3d others")
    B.cut("shot.hunting", "guns/hunting_01", "Barrett_M98B_.338_Lapua_2m_right", 0.0, 1.6)
    B.cut("shot.hunting", "guns/hunting_02", "Barrett_M98B_.338_Lapua_2m_right", 6.98, 8.6)
    B.cut("shot.hunting", "guns/hunting_03", "Barrett_M98B_.338_Lapua_2m_right", 14.98, 16.6)
    B.meta("shot.hunting", gain=1.0, pitch=[0.96, 1.02], space="2d own / 3d others")
    B.shots("shot.lmg", "guns/lmg", "M1919A4_Browning_Machine_Gun_.30cal_5m_behind", "M1919A4_Browning_Machine_Gun_.30cal_200m", (0.0, 1.5), (0.0, 1.8), [0, 1, 2], 0.5, min_gap=0.07)
    B.hits("shot.lmg", "guns/lmg", "Browning_M2_.50_Machine_Gun_03m", 0.8, 2.0, [0], 0.5, min_gap=0.07, first=4)
    B.meta("shot.lmg", gain=0.9, pitch=[0.95, 1.04], space="2d own / 3d others")
    T = "Steyr_TMP_9mm_foley_distant"
    for i, t in enumerate([1.95, 6.91, 15.61]):
        B.cut("gun.dry", f"guns/dry_{i + 1:02d}", T, t, t + 0.25, peak=-6)
    B.meta("gun.dry", gain=0.6, pitch=[0.97, 1.05], space="2d")
    M = "G36C_5.56mm_foley_close_up"
    for i, (o, n) in enumerate([((3.74, 4.46), (6.32, 6.80)), ((9.12, 9.74), (11.28, 11.74)), ((14.09, 14.52), (15.70, 16.28))]):
        B.mix("gun.reload", f"guns/reload_{i + 1:02d}", [(M, o[0], o[1], 0.0, 1.0, None), (M, n[0], n[1], 0.9, 1.0, None)], peak=-3)
        B.cut("gun.mag.out", f"guns/mag_out_{i + 1:02d}", M, o[0], o[1], peak=-3)
        B.cut("gun.mag.in", f"guns/mag_in_{i + 1:02d}", M, n[0], n[1], peak=-3)
    B.meta("gun.reload", gain=0.8, pitch=[0.97, 1.03], space="2d", note="magazine out at 0 s, in at 0.9 s (about 1.4 s)")
    B.meta("gun.mag.out", gain=0.8, space="2d", added="the two halves of gun.reload on their own, for reloads of another length")
    B.meta("gun.mag.in", gain=0.8, space="2d", added="see gun.mag.out")
    B.cut("gun.loaded", "guns/loaded_01", "gun_semi_auto_rifle_cock_02", peak=-3)
    B.cut("gun.loaded", "guns/loaded_02", T, 4.02, 4.62, peak=-3)
    B.cut("gun.loaded", "guns/loaded_03", "SAIGA-12_12g_solid_slug_foley", 2.28, 3.08, peak=-3)
    B.meta("gun.loaded", gain=0.8, pitch=[0.97, 1.03], space="2d")
    B.cut("gun.pickup", "guns/pickup_01", "AssaultRifle_PickUp_004", peak=-3)
    B.cut("gun.pickup", "guns/pickup_02", "foley_object_grab_pickup_04", peak=-3)
    B.cut("gun.pickup", "guns/pickup_03", "foley_soldier_gear_equipment", peak=-3)
    B.meta("gun.pickup", gain=0.8, pitch=[0.95, 1.05], space="2d")
    B.cut("gun.take", "guns/take_01", "Mechanism - Source - Metallic Auto Gun", 0.0, 0.62, peak=-3)
    B.cut("gun.take", "guns/take_02", "Mechanism - Source - Metallic Auto Gun", 1.04, 1.68, peak=-3)
    B.meta("gun.take", gain=0.8, pitch=[0.95, 1.05], space="2d")
    B.cut("shotgun.pump", "guns/pump_01", "Shotgun_Quick Pump_01", 0.0, 0.5, peak=-3)
    B.cut("shotgun.pump", "guns/pump_02", "Shotgun_Quick Pump_01", 1.02, 1.5, peak=-3)
    B.cut("shotgun.pump", "guns/pump_03", "0019_Shotgun_Pump_Action_1", peak=-3)
    B.meta("shotgun.pump", gain=0.8, pitch=[0.97, 1.03], space="2d", added="pump after every shotgun blast (0.35 s later)")
    B.cut("shell.drop", "guns/shell_01", "Bullet_Drop_Wood_04", peak=-6)
    for i in range(4):
        B.cut("shell.drop", f"guns/shell_{i + 2:02d}", f"impactMetal_light_00{i}", peak=-6)
    B.meta("shell.drop", gain=0.35, pitch=[1.1, 1.5], cooldown=0.08, space="3d at the floor", added="a spent case landing, 0.35-0.5 s after a shot")
    B.cut("shell.drop.shotgun", "guns/shell_shotgun_01", "ShotgunShell_Land_Concrete_02", peak=-6)
    B.cut("shell.drop.shotgun", "guns/shell_shotgun_02", "ShotgunShell_Land_Lino_03", peak=-6)
    B.meta("shell.drop.shotgun", gain=0.45, pitch=[0.95, 1.1], space="3d at the floor", added="shotgun shell landing")
    B.cut("bullet.impact.metal", "impact/bullet_metal_01", "bullet_impact_metal_heavy_08", peak=-3)
    B.cut("bullet.impact.metal", "impact/bullet_metal_02", "metal_hit_004", peak=-3)
    B.cut("bullet.impact.wood", "impact/bullet_wood_01", "Bullet Impact 16 - Light Version", peak=-3)
    B.cut("bullet.impact.wood", "impact/bullet_wood_02", "bullet_impact_concrete_brick_01", peak=-3)
    B.cut("bullet.impact.wood", "impact/bullet_wood_03", "PM_BBI_Bullet_Impact_Dirt_3", peak=-3, maxlen=0.8)
    for n in ("bullet.impact.metal", "bullet.impact.wood"):
        B.meta(n, gain=0.5, pitch=[0.9, 1.15], cooldown=0.06, space="3d at the hit point", added="a missed bullet hitting a prop / the ground")

    # ---------------- hits on zombies
    B.cut("impact.body", "impact/body_01", "bullet_impact_body_thump_02", peak=-3)
    B.cut("impact.body", "impact/body_02", "PM_BBI_Bullet_Impact_Hit_Body_Flesh_25", peak=-3)
    B.hits("impact.body", "impact/body", "EFX SD GORE Punch 02", 0.0, 3.1, [0, 1, 2], 0.3, min_gap=0.3, peak=-3, first=3)
    B.cut("impact.body", "impact/body_06", "punch_grit_wet_impact_05", peak=-3)
    for i in range(4):
        B.cut("impact.body", f"impact/body_kids_{i + 1:02d}", f"impactPunch_medium_00{i}", peak=-3, kids=True)
    B.meta("impact.body", gain=0.7, pitch=[0.93, 1.07], cooldown=0.03, space="2d")
    B.hits("impact.head", "impact/head", "EFX SD GORE Chop 02", 0.0, 2.7, [0, 1, 2], 0.35, min_gap=0.3, peak=-3)
    B.cut("impact.head", "impact/head_04", "crunchy flesh impact and blood squirt - hard -  8", peak=-3, maxlen=0.7)
    B.cut("impact.head", "impact/head_05", "Punch_Spurt Blood_Fienup_001", peak=-3)
    for i in range(3):
        B.cut("impact.head", f"impact/head_kids_{i + 1:02d}", f"impactPunch_heavy_00{i}", peak=-3, kids=True)
    B.meta("impact.head", gain=0.8, pitch=[0.95, 1.08], cooldown=0.03, space="2d")
    B.mix("impact.headshot", "impact/headshot_01", [("Bone Cracking 18", None, None, 0.0, 1.0, None), ("flesh and bone crunch wet - hard - 4", 0.1, 1.0, 0.02, 0.8, None)], peak=-2)
    B.cut("impact.headshot", "impact/headshot_02", "flesh and bone crunch - hard - 5", peak=-2, maxlen=0.8)
    B.hits("impact.headshot", "impact/headshot", "HEADBUTT Crack", 0.0, 6.1, [0, 2], 0.6, min_gap=0.8, peak=-2, first=3)
    for i in range(3):
        B.cut("impact.headshot", f"impact/headshot_kids_{i + 1:02d}", f"impactWood_heavy_00{i}", peak=-3, kids=True)
    B.meta("impact.headshot", gain=0.85, pitch=[0.95, 1.05], space="2d")
    B.cut("impact.gore", "impact/gore_01", "blood squirt wet - medium - 104", peak=-3, maxlen=1.0)
    B.cut("impact.gore", "impact/gore_02", "blood squirt wet - hard - 49", 0.0, 0.7, peak=-3)
    B.cut("impact.gore", "impact/gore_03", "Borax,Impact,Slime,Gore,Various05", peak=-3)
    B.cut("impact.gore", "impact/gore_04", "Jelly,Movement,Gore,Liquid,Splat", peak=-3)
    B.meta("impact.gore", gain=0.8, pitch=[0.92, 1.08], space="3d at the zombie's head", note="never in kids mode")

    # ---------------- melee
    B.cut("melee.chop", "melee/chop_01", "medium metal blade wet impact in to flesh", peak=-2, maxlen=0.8)
    B.cut("melee.chop", "melee/chop_02", "PM_BB_DESIGNED_CINEMATIC_CHOPS_25", 0.0, 1.0, peak=-2)
    B.cut("melee.chop", "melee/chop_03", "PM_BB_DESIGNED_CINEMATIC_CHOPS_19", 0.0, 1.2, peak=-2, maxlen=1.0)
    B.cut("melee.chop", "melee/chop_04", "stab_medium_10", peak=-2)
    for i in range(3):
        B.cut("melee.chop", f"melee/chop_kids_{i + 1:02d}", f"impactWood_medium_00{i}", peak=-3, kids=True)
    B.meta("melee.chop", gain=0.9, pitch=[0.93, 1.07], space="2d")
    B.cut("melee.swing", "melee/swing_01", "metal knife swing - 4", peak=-4)
    B.cut("melee.swing", "melee/swing_02", "metal knife swing - 5", peak=-4)
    B.cut("melee.swing", "melee/swing_03", "Whoosh_Rod_Pole_022", peak=-4)
    B.cut("melee.swing", "melee/swing_04", "whoosh_weapon_knife_swing_04", peak=-4)
    B.meta("melee.swing", gain=0.6, pitch=[0.9, 1.15], cooldown=0.15, space="2d", added="axe / machete swing through the air (tip speed over 2.2 m/s)")
    B.cut("melee.saw.idle", "melee/saw_idle", "chainsaw gas big engine idle mono", 6.0, 8.0, lp=True, xf=150, peak=-6)
    B.meta("melee.saw.idle", gain=0.6, pitch=[1.0, 1.0], cooldown=1.6, space="2d", note="1.85 s seamless slice: play as a loop while held")
    B.cut("melee.saw.cut", "melee/saw_cut_01", "gas pressing and sawing high rpm", 12.0, 13.6, lp=True, xf=120, peak=-3)
    B.cut("melee.saw.cut", "melee/saw_cut_02", "gas pressing and sawing high rpm", 22.0, 23.6, lp=True, xf=120, peak=-3)
    B.meta("melee.saw.cut", gain=0.8, pitch=[0.98, 1.02], cooldown=1.3, space="2d", note="1.5 s seamless slices")
    B.cut("melee.saw.start", "melee/saw_start", "chainsaw gas big engine turn on and off", 0.0, 1.8, peak=-3, fout=200)
    B.meta("melee.saw.start", gain=0.8, space="2d", added="the chainsaw is taken / the trigger is first pulled")

    # ---------------- zombies
    Z = "ZombieVocalizationsGeneral_003"
    for i, (a, b) in enumerate([(0.0, 1.5), (2.28, 4.62), (5.32, 7.42), (8.26, 10.42), (11.33, 12.86)]):
        B.cut("zombie.idle", f"zombie/idle_{i + 1:02d}", Z, a, b, peak=-3, fout=80)
    B.cut("zombie.idle", "zombie/idle_06", "Aggressive Zombie 02 C", 4.55, 6.28, peak=-3, fout=80)
    B.cut("zombie.idle", "zombie/idle_07", "Aggressive Zombie 02 C", 6.64, 7.96, peak=-3, fout=80)
    B.cut("zombie.idle", "zombie/idle_08", "Aggressive Zombie 32 C", 3.12, 4.5, peak=-3, fout=80)
    B.cut("zombie.idle", "zombie/idle_09", "Aggressive Zombie 32 C", 4.82, 6.4, peak=-3, fout=80)
    B.cut("zombie.idle", "zombie/idle_10", "Zombie Groan Pitched Down (6)", peak=-3, fout=80)
    B.cut("zombie.idle", "zombie/idle_11", "Zombie Subject B Groan (8)", peak=-3, fout=80)
    B.cut("zombie.idle", "zombie/idle_12", "ZOMBIE Idle 04", peak=-3, fout=80)
    B.meta("zombie.idle", gain=0.8, pitch=[0.88, 1.08], cooldown=0.4, space="3d")
    F = "Female Ragging Creature 03"
    for i, (a, b) in enumerate([(0.2, 1.26), (1.6, 3.25), (4.08, 6.0), (6.82, 8.3)]):
        B.cut("zombie.idle.runner", f"zombie/runner_{i + 1:02d}", F, a, b, peak=-3, fout=80, maxlen=1.6)
    B.cut("zombie.idle.runner", "zombie/runner_05", "Zombie Subject B Hiss (1)", peak=-3, fout=80)
    B.cut("zombie.idle.runner", "zombie/runner_06", "Hisses Dry 11", peak=-3, fout=80)
    B.meta("zombie.idle.runner", gain=0.85, pitch=[0.95, 1.12], cooldown=0.35, space="3d")
    B.cut("zombie.idle.big", "zombie/big_01", "Monster Voices 11 A", 0.02, 2.45, peak=-2, fout=120)
    B.cut("zombie.idle.big", "zombie/big_02", "Monster Growls 4", 0.1, 2.2, peak=-2, fout=120)
    B.cut("zombie.idle.big", "zombie/big_03", "Monster Growls 4", 2.55, 4.6, peak=-2, fout=120)
    B.cut("zombie.idle.big", "zombie/big_04", "troll_monster_growl_long_05", peak=-2, fout=120)
    B.cut("zombie.idle.big", "zombie/big_05", "Growl Dry 14", peak=-2, fout=120)
    B.meta("zombie.idle.big", gain=1.0, pitch=[0.82, 0.96], cooldown=0.8, space="3d")
    B.hits("zombie.step", "zombie/step", "Gravel_Loafers_Loops_Walk_Normal", 0.0, 13.4, [0, 2, 4, 6, 9, 12], 0.3, min_gap=0.2, thr=0.25, peak=-6)
    B.meta("zombie.step", gain=0.45, pitch=[0.88, 1.1], cooldown=0.09, space="3d")
    B.hits("zombie.step.heavy", "zombie/step_heavy", "Rocks_Sneaker_Jump_Land_On_Two_Feet", 0.0, 9.7, [0, 2], 0.5, min_gap=0.6, peak=-3)
    B.cut("zombie.step.heavy", "zombie/step_heavy_03", "creature_footstep_damp_015", peak=-3)
    B.cut("zombie.step.heavy", "zombie/step_heavy_04", "creature_wood_footstep_medium_004", peak=-3, maxlen=1.0)
    B.meta("zombie.step.heavy", gain=1.0, pitch=[0.7, 0.85], cooldown=0.2, space="3d", note="pitched down on purpose: weight")
    B.cut("zombie.attack", "zombie/attack_01", "BEAST 01 Attack 08", peak=-3)
    B.cut("zombie.attack", "zombie/attack_02", "Creature_Monster_Attack_09", peak=-3)
    B.cut("zombie.attack", "zombie/attack_03", "MR - Orc Attack VO 04", peak=-3)
    B.cut("zombie.attack", "zombie/attack_04", "Sounds Great - Orc Creature Library/attack_7", peak=-3)
    B.cut("zombie.attack", "zombie/attack_05", "Monster_Struggle_Grunt_240", peak=-3)
    B.cut("zombie.attack", "zombie/attack_06", "BEAST 01 Threaten Short 06", peak=-3)
    B.meta("zombie.attack", gain=0.9, pitch=[0.9, 1.08], cooldown=0.25, space="3d")
    B.cut("zombie.attack.big", "zombie/attack_big_01", "Hunter - Fley_Attack02", peak=-2)
    B.cut("zombie.attack.big", "zombie/attack_big_02", "Large Beast - Taunt2Stun03", peak=-2)
    B.cut("zombie.attack.big", "zombie/attack_big_03", "creature_attack_whoosh_impact_003", peak=-2)
    B.meta("zombie.attack.big", gain=1.0, pitch=[0.85, 1.0], cooldown=0.5, space="3d")
    B.cut("zombie.death", "zombie/death_01", "Monster_Pain_Death_121", peak=-3)
    B.cut("zombie.death", "zombie/death_02", "Creature_Monster_Pain_01", peak=-3)
    B.cut("zombie.death", "zombie/death_03", "hit_injured_5", peak=-3)
    B.cut("zombie.death", "zombie/death_04", "MR - Swamp Fish Creature Damage VO 08", peak=-3)
    B.cut("zombie.death", "zombie/death_05", "Creature_Alien_Death_01", peak=-3)
    B.cut("zombie.death", "zombie/death_06", "Zombie Subject C Zombie Brat Groan (9)", peak=-3)
    for i in range(3):
        B.cut("zombie.death", f"zombie/death_kids_{i + 1:02d}", f"impactSoft_heavy_00{i}", peak=-3, kids=True)
    B.meta("zombie.death", gain=0.85, pitch=[0.88, 1.06], cooldown=0.08, space="3d", note="kids: only the soft body fall")
    for i in range(4):
        B.cut("zombie.bodyfall", f"zombie/bodyfall_{i + 1:02d}", f"impactSoft_heavy_00{i + 1}", peak=-4)
    B.meta("zombie.bodyfall", gain=0.6, pitch=[0.8, 1.0], cooldown=0.08, space="3d", added="the body reaching the ground, 0.4-0.6 s after zombie.death")
    B.cut("zombie.death.big", "zombie/death_big_01", "troll_monster_death_01", peak=-1)
    B.mix("zombie.death.big", "zombie/death_big_02", [("Bearer - Vocal_TakeDamage03", None, None, 0.0, 1.0, None), ("creature_wood_attack_impact_dust_006", None, None, 1.4, 0.9, None)])
    B.meta("zombie.death.big", gain=1.0, pitch=[0.85, 0.95], space="3d")
    B.cut("screamer.scream", "zombie/scream_01", "Female_Scream_005", peak=-1, fout=150)
    B.cut("screamer.scream", "zombie/scream_02", "SH101_Human_Female_Scream_Alien", peak=-1, fout=150)
    B.cut("screamer.scream", "zombie/scream_03", "Creature Screeches 12", peak=-1, fout=150, maxlen=2.8)
    B.cut("screamer.scream", "zombie/scream_kids_01", "Screeching Monster 2-1", peak=-6, kids=True)
    B.meta("screamer.scream", gain=1.0, pitch=[0.95, 1.05], cooldown=2.0, space="3d")
    B.cut("brute.roar", "zombie/brute_roar_01", "Creature Roar 13", peak=-1, fout=150)
    B.cut("brute.roar", "zombie/brute_roar_02", "Monster_Roar_Growl_009", peak=-1, fout=200, maxlen=3.5)
    B.meta("brute.roar", gain=1.0, pitch=[0.85, 0.95], cooldown=3.0, space="3d")
    B.cut("leaper.leap", "zombie/leap_01", "MR - Insect Creature Attack VO 02", peak=-3)
    B.mix("leaper.leap", "zombie/leap_02", [("Roar Dry 5", None, None, 0.0, 0.9, 1.0), ("Whoosh_Cloth_Leather_Fight_174", None, None, 0.25, 0.8, None)], peak=-3)
    B.mix("leaper.leap", "zombie/leap_03", [("Hisses Dry 16", None, None, 0.0, 0.9, 0.9), ("Whoosh_Fast_02", None, None, 0.3, 0.8, None)], peak=-3)
    B.meta("leaper.leap", gain=0.95, pitch=[0.95, 1.1], space="3d")
    B.hits("leaper.land", "zombie/land", "Rocks_Sneaker_Jump_Land_On_Two_Feet", 0.0, 9.7, [4, 6, 8], 0.5, min_gap=0.6, peak=-3)
    B.meta("leaper.land", gain=0.9, pitch=[0.85, 1.0], space="3d")
    B.cut("digger.rise", "zombie/dig_01", "creature_texture_mud_006", peak=-3, fout=200)
    B.cut("digger.rise", "zombie/dig_02", "creature_wood_texture_crack_heavy_rumble_006", peak=-3, fout=300, maxlen=3.0)
    B.cut("digger.rise", "zombie/dig_03", "debris_falling_rock_dust_002", peak=-3, fout=200)
    B.meta("digger.rise", gain=0.9, pitch=[0.9, 1.05], space="3d")
    B.cut("fence.rattle", "world/fence_rattle_01", "Chain Link Fence 04", peak=-3, fout=150)
    B.cut("fence.rattle", "world/fence_rattle_02", "Creepy Door, Metal Light Rattle_05", 0.15, 2.6, peak=-3, fout=300)
    B.cut("fence.rattle", "world/fence_rattle_03", "Metal_Jolt_Rattle_Scrape_52", peak=-3, fout=150)
    B.meta("fence.rattle", gain=0.9, pitch=[0.9, 1.05], cooldown=1.0, space="3d at the fence side", added="leapers shake the fence 2 s before the first one jumps")

    # ---------------- boss
    B.cut("boss.siren", "boss/siren", "Braam 004 (D)", 0.0, 7.0, peak=-2, fout=1500)
    B.meta("boss.siren", gain=0.75, pitch=[1.0, 1.0], space="2d")
    B.cut("boss.roar", "boss/roar_01", "Rage Monster 13 B", peak=-1, fout=200)
    B.cut("boss.roar", "boss/roar_02", "troll_monster_taunt_03", peak=-1, fout=200)
    B.meta("boss.roar", gain=1.0, pitch=[0.8, 0.9], cooldown=2.0, space="3d")
    B.cut("boss.rage", "boss/rage", "Fire Monster Vocals_6", 0.1, 4.6, peak=-1, fout=400)
    B.meta("boss.rage", gain=1.0, pitch=[0.82, 0.88], space="3d", added="the roar at 40 % health (once)")
    B.cut("boss.hurt", "boss/hurt_01", "troll_monster_hurt_pain_01", peak=-2)
    B.cut("boss.hurt", "boss/hurt_02", "pain_scream_5", peak=-2, maxlen=1.6, fout=200)
    B.meta("boss.hurt", gain=0.95, pitch=[0.75, 0.85], cooldown=1.5, space="3d", added="each stagger")
    B.cut("boss.windup", "boss/windup", "Whoosh,Sound Design,Whip By,Airy,Thick,Release to Choppy", 1.1, 3.4, peak=-3, fin=300, fout=80)
    B.meta("boss.windup", gain=0.8, space="3d", added="rising whoosh while the thrown thing is in the air (about 1.2 s before boss.slam)")
    B.mix("boss.slam", "boss/slam_01", [("heavy_metal_impact_steel_barrel_01", None, None, 0.0, 1.0, None), ("Boom 040", None, None, 0.0, 0.8, 2.5)], fout=400)
    B.mix("boss.slam", "boss/slam_02", [("heavy_metal_impact_large_tank_01_03", None, None, 0.0, 1.0, 3.0), ("Boom 091", None, None, 0.0, 0.8, 2.5)], fout=400)
    B.meta("boss.slam", gain=1.0, pitch=[0.9, 1.0], space="3d", added="the thrown wreck / the ground smash landing")

    # ---------------- player
    B.hits("player.hurt", "player/hurt", "BiteCreakBloodJuicy_002", 0.0, 8.6, [0, 2, 4], 0.6, min_gap=0.6, peak=-2)
    B.cut("player.hurt", "player/hurt_04", "Monster Bite 3", peak=-2)
    for i in range(2):
        B.cut("player.hurt", f"player/hurt_kids_{i + 1:02d}", f"impactPunch_heavy_00{i + 3}", peak=-3, kids=True)
    B.meta("player.hurt", gain=0.95, pitch=[0.92, 1.06], space="2d")
    B.cut("player.down", "player/down_01", "Downer 111", peak=-2, fout=600)
    B.cut("player.down", "player/down_02", "Downer 087", peak=-2, fout=800, maxlen=3.5)
    B.meta("player.down", gain=0.8, pitch=[1.0, 1.0], space="2d")
    B.cut("player.up", "player/up_01", "Electric_Energy_Ambient_Warble_Powerup_03", peak=-3)
    B.cut("player.up", "player/up_02", "Riser 088", peak=-3, fout=200)
    B.meta("player.up", gain=0.7, pitch=[1.0, 1.0], space="2d")
    B.cut("player.heart", "player/heart_01", "Heartbeat,Sound Design,Pulse", 0.0, 0.9, peak=-3)
    B.cut("player.heart", "player/heart_02", "Heartbeat,Sound Design,Pulse", 3.25, 4.15, peak=-3)
    B.meta("player.heart", gain=0.8, pitch=[0.98, 1.02], space="2d")
    B.cut("player.combo", "player/combo_01", "Metal_Ringout_MKH8060_14", peak=-6)
    B.cut("player.combo", "player/combo_02", "Metal_Ringout_DPA4060_10", peak=-6, maxlen=0.8)
    B.meta("player.combo", gain=0.5, pitch=[1.0, 1.12], space="2d")
    B.cut("player.combo.big", "player/combo_big", "Bluezone-BC0224-impact-016", peak=-3, fout=400)
    B.meta("player.combo.big", gain=0.55, pitch=[1.0, 1.0], space="2d")

    # ---------------- waves, stingers, end
    B.cut("wave.start", "world/wave_siren", "Emergency Siren 10 B", peak=-3, fout=300)
    B.meta("wave.start", gain=0.7, pitch=[1.0, 1.0], space="2d (or 3d far outside the fence)")
    B.cut("wave.clear", "world/wave_clear", "Ping 020", peak=-3, fout=800)
    B.meta("wave.clear", gain=0.6, pitch=[1.0, 1.0], space="2d")
    B.cut("stinger.wave", "stinger/wave_01", "Hits & Impacts/Dramatic E", peak=-2, fout=600)
    B.cut("stinger.wave", "stinger/wave_02", "Hits & Impacts/Angry E", peak=-2, fout=600)
    B.meta("stinger.wave", gain=0.6, space="2d", added="a hit under the WAVE n title")
    B.cut("stinger.blackout", "stinger/blackout", "Stinger-Low13", peak=-2, fout=800)
    B.meta("stinger.blackout", gain=0.7, space="2d", added="right after world.power.off")
    B.cut("stinger.boss", "stinger/boss", "CHT2_Cinematic_Hit_096", peak=-1, fout=1200)
    B.meta("stinger.boss", gain=0.75, space="2d", added="when the boss is first seen")
    B.cut("stinger.jump", "stinger/jump_01", "Stinger-String5", peak=-2)
    B.cut("stinger.jump", "stinger/jump_02", "sick6_stinger_beast_15", peak=-2)
    B.cut("stinger.jump", "stinger/jump_03", "Scary ghost impact effect", peak=-2, maxlen=2.0, fout=400)
    B.meta("stinger.jump", gain=0.65, cooldown=20, space="2d", added="first digger, a leaper landing behind a player; never in kids mode")
    B.cut("riser.10s", "stinger/riser_10s", "Riser 027", 8.2, 18.3, peak=-3, fin=1500, fout=60)
    B.meta("riser.10s", gain=0.5, space="2d", added="last 10 s of the prep and of each break; ends on the wave start")
    B.cut("end.win", "stinger/end_win", "CHT2_Cinematic_Hit_214", peak=-1, fout=1500)
    B.meta("end.win", gain=0.8, pitch=[1.0, 1.0], space="2d")
    B.cut("end.lose", "stinger/end_lose", "Downer 049", peak=-1, fout=1200)
    B.meta("end.lose", gain=0.8, pitch=[1.0, 1.0], space="2d")
    C = "Clocks/Clock 070"
    for i in range(3):
        B.cut("score.tick", f"ui/score_tick_{i + 1:02d}", C, i * 1.0, i * 1.0 + 0.55, peak=-6)
    B.meta("score.tick", gain=0.4, pitch=[1.0, 1.25], cooldown=0.05, space="2d", added="score counting up on the end screen (raise the pitch as it climbs)")
    B.cut("score.final", "ui/score_final", "Timpani_Hit_Fienup_001", peak=-2, fout=800)
    B.meta("score.final", gain=0.8, space="2d", added="the final number lands")
    B.cut("score.record", "ui/score_record", "Hits & Impacts/Smash B", peak=-1, fout=900)
    B.meta("score.record", gain=0.85, space="2d", added="NEW RECORD")
    B.cut("award.reveal", "ui/award_01", "Bluezone-BC0226-hit-impact-004", peak=-3, fout=500)
    B.cut("award.reveal", "ui/award_02", "Bluezone-BC0224-impact-003", peak=-3, fout=500)
    B.meta("award.reveal", gain=0.6, pitch=[0.96, 1.04], space="2d", added="each player's award appearing")

    # ---------------- gates, chest, barrels
    B.hits("gate.bang", "gate/bang", "Door,Wood,Bathroom,Exterior POV,Hit,Pound", 0.0, 1.8, [0, 1, 2, 3], 0.22, min_gap=0.12, thr=0.35, peak=-2)
    for i in range(2):
        B.cut("gate.bang", f"gate/bang_{i + 5:02d}", f"impactWood_heavy_00{i + 3}", peak=-2)
    B.meta("gate.bang", gain=1.0, pitch=[0.8, 0.95], cooldown=0.1, space="3d")
    B.cut("gate.crack", "gate/crack_01", "Wooden Tearing 09", peak=-2)
    B.cut("gate.crack", "gate/crack_02", "Destruction_Wooden_2", peak=-2, fout=120)
    B.cut("gate.crack", "gate/crack_03", "wood_crushing_branches_001_001", peak=-2)
    B.cut("gate.crack", "gate/crack_04", "Impacts Soft - Short, Crack", peak=-2)
    B.meta("gate.crack", gain=1.0, pitch=[0.9, 1.08], space="3d")
    B.mix("gate.smash", "gate/smash_01", [("Small Wood Pile, Smash", None, None, 0.0, 1.0, None), ("creature_wood_attack_impact_dust_006", None, None, 0.05, 0.9, None)], fout=200)
    B.mix("gate.smash", "gate/smash_02", [("Destruction_Wooden_2", None, None, 0.0, 1.0, None), ("Dropping_WoodPanel_Multi_6", None, None, 0.25, 0.9, None), ("Boom 036", None, None, 0.0, 0.5, 2.0)], fout=300)
    B.meta("gate.smash", gain=1.0, pitch=[0.88, 1.0], space="3d")
    B.hits("gate.hammer", "gate/hammer", "Hammer_Multiple_Exterior_Fienup_013", 0.0, 5.4, [0, 2, 4, 6], 0.22, min_gap=0.15, thr=0.35, peak=-3)
    B.meta("gate.hammer", gain=0.85, pitch=[0.94, 1.08], cooldown=0.1, space="3d")
    B.cut("gate.sealed", "gate/sealed", "door_big_close_001", peak=-3)
    B.meta("gate.sealed", gain=0.8, pitch=[1.0, 1.0], space="3d")
    B.cut("plank.drop", "gate/plank_drop_01", "Drop Soft - Single Plank, Drop 02", peak=-4)
    B.cut("plank.drop", "gate/plank_drop_02", "Dropping_WoodPile_79", peak=-4)
    B.cut("plank.drop", "gate/plank_drop_03", "wood_falling_log_002_006", peak=-4)
    B.meta("plank.drop", gain=0.7, pitch=[0.9, 1.1], space="3d", added="a torn plank landing inside the zone")
    B.cut("barrel.boom", "world/boom_01", "explosion_large_08", peak=-1, fout=500)
    B.cut("barrel.boom", "world/boom_02", "explosion_outdoors_large_005", peak=-1, fout=500)
    B.cut("barrel.boom", "world/boom_03", "DeepExplosion02", peak=-1, fout=700, maxlen=3.5)
    B.meta("barrel.boom", gain=1.0, pitch=[0.92, 1.04], space="3d")
    B.mix("chest.open", "chest/open", [("metalLatch", None, None, 0.0, 0.8, None), ("UCnS_CupboardDoor_01_Squeaks_09", 0.08, 1.1, 0.12, 0.8, None), ("IMPACT METAL Short Slam_03", None, None, 1.05, 1.0, None)], peak=-2, fout=200)
    B.meta("chest.open", gain=1.0, pitch=[0.97, 1.03], space="3d", note="latch, hinge creak, lid slam at 1.05 s")
    B.cut("chest.drop", "chest/drop_01", "Knife_Sword_Drop_Wood_Fienup_001", 0.0, 0.5, peak=-3)
    B.cut("chest.drop", "chest/drop_02", "Knife_Sword_Drop_Wood_Fienup_001", 1.02, 1.6, peak=-3)
    B.cut("chest.drop", "chest/drop_03", "Sawblade Drop", peak=-3)
    B.cut("chest.drop", "chest/drop_04", "Metal_Hit_Crash_199", peak=-3, maxlen=0.8)
    B.meta("chest.drop", gain=0.8, pitch=[0.85, 1.05], space="3d")
    B.hits("chest.fly", "chest/fly", "Action Swish_HW 02", 0.0, 4.5, [0, 1, 2, 3], 0.3, min_gap=0.4, peak=-6)
    B.meta("chest.fly", gain=0.5, pitch=[0.9, 1.2], space="3d", added="each weapon leaving the chest")

    # ---------------- world
    B.cut("world.thunder", "world/thunder_01", "Thunder_Crack_Fienup_016", 0.7, 7.5, peak=-1, fout=3000)
    B.cut("world.thunder", "world/thunder_02", "Thunder_Boom_Fienup_005", 0.25, 7.0, peak=-1, fout=3000)
    B.cut("world.thunder", "world/thunder_03", "Thunder_Rumble_Mid_Fienup_024", peak=-2, fout=1200)
    B.meta("world.thunder", gain=0.85, pitch=[0.92, 1.04], space="2d")
    B.mix("world.power.off", "world/power_off", [("Switch,ElectricalPanelBreaker,On", None, None, 0.0, 1.0, None), ("Downer 013", None, None, 0.06, 0.9, 3.6)], fout=900)
    B.meta("world.power.off", gain=0.9, pitch=[1.0, 1.0], space="2d")
    B.mix("world.power.on", "world/power_on", [("Switch,ElectricalPanelBreaker,On", None, None, 0.0, 1.0, None), ("Electric, Switch ON OFF, power, turn-on", None, None, 0.12, 0.8, None), ("Electric,Buzz,Resonant,Frayed Buzz", None, None, 0.5, 0.6, None)], fout=300)
    B.meta("world.power.on", gain=0.9, pitch=[1.0, 1.0], space="2d")
    B.cut("world.neon.hum", "world/neon_hum", "HumBuzz-Buzz-03", 1.0, 7.0, lp=True, xf=500, peak=-6)
    B.meta("world.neon.hum", gain=0.35, loop=True, space="3d at the MOTEL sign", added="loop: the sign buzzing; stop it in the blackout")
    B.cut("world.spark", "world/spark_01", "Electric_Arc_Reverberant_Shock_Long_05", peak=-3, maxlen=1.5, fout=300)
    B.cut("world.spark", "world/spark_02", "Electric,Arc,Buzz,Resonant,Fizzle", 0.0, 1.4, peak=-3, fout=300)
    B.meta("world.spark", gain=0.7, pitch=[0.95, 1.1], space="3d at the sign", added="the sign flickering (boss steps, power failing)")
    B.mix("world.alarm", "world/alarm", [("Alarms/Foreboding E", None, None, 0.0, 1.0, None)], peak=-3, lp=True, xf=80)
    B.meta("world.alarm", gain=0.8, pitch=[1.0, 1.0], cooldown=3.5, space="3d far out on the path", note="4 s seamless alarm figure: repeat it while the alarm lasts")
    H = "10 Chopper starting up and taking off"
    B.cut("world.heli.away", "world/heli_away", H, 78.0, 94.0, peak=-3, fin=1200, fout=6000, db=-90)
    B.meta("world.heli.away", gain=0.7, space="2d", added="16 s: the helicopter leaving at the start of the prep (take-off part of the recording)")
    B.cut("world.heli.in", "world/heli_in", H, 44.0, 56.0, peak=-3, fin=5000, fout=1200, db=-90)
    B.meta("world.heli.in", gain=0.8, space="2d", added="12 s: rotor growing for the pick-up at the win (rotor at speed, long fade-in)")
    B.cut("radio.open", "voice/radio_open", "Cobra MicroTalk,Radio Communication,End,Noise Squelch", 0.12, 0.53, peak=-8)
    B.cut("radio.close", "voice/radio_close", "Cobra MicroTalk,Radio Communication,End,Noise Squelch", 1.5, 1.83, peak=-8)
    for n in ("radio.open", "radio.close"):
        B.meta(n, gain=0.5, space="2d", added="walkie-talkie squelch around a voice.radio.* line")

    # ---------------- beds (stereo loops). Music: recordings from the trailer / horror libraries, no credit needed.
    B.mix("ambience.night", "amb/night", [("forest_alpine_crickets_01_60_loop", 0.0, 32.0, 0.0, 0.55, None), ("Wind_Trees_Cattails_Fienup_004", 4.0, 36.0, 0.0, 0.8, None)], peak=-6, stereo=True, lp=True, xf=2000)
    B.meta("ambience.night", gain=0.55, loop=True, space="2d", note="crickets + wind in trees, 30 s seamless")
    B.cut("ambience.rain", "amb/rain", "rain_shower of rain_steady rain_forest_leaves", 0.5, 22.0, peak=-6, stereo=True, lp=True, xf=1500)
    B.meta("ambience.rain", gain=0.5, loop=True, space="2d", added="loop for the storm of the last wave")
    B.cut("ambience.fire", "amb/fire", "FireCracklingInAWoodstove", 0.1, 14.9, peak=-6, lp=True, xf=700)
    B.meta("ambience.fire", gain=0.6, loop=True, space="3d at each fire barrel", added="loop: barrel fire crackle")
    B.cut("music.calm", "music/calm", "Drone 037 (C#)", 4.0, 26.0, peak=-6, stereo=True, lp=True, xf=2500)
    B.meta("music.calm", gain=0.3, loop=True, space="2d")
    P = "Drone,Cyber,Deep,Pulse,Disturbing,Invasive,Loop"
    B.cut("music.wave", "music/wave", P, 0.0, 25.87, peak=-6, stereo=True, lp=True, xf=60)
    B.meta("music.wave", gain=0.36, loop=True, space="2d", note="the library's own seamless pulse loop")
    B.mix("music.intense", "music/intense", [(P, 0.0, 25.87, 0.0, 1.0, None), ("Tension - low oscillating distortion 3", 0.3, 15.0, 0.0, 0.55, None), ("Clocks/Clock 025", 0.0, 7.9, 0.0, 0.35, None), ("Clocks/Clock 025", 0.0, 7.9, 8.0, 0.35, None), ("Clocks/Clock 025", 0.0, 7.9, 16.0, 0.35, None)], peak=-5, stereo=True, lp=True, xf=60, total=25.87)
    B.meta("music.intense", gain=0.42, loop=True, space="2d", note="music.wave with two more layers on top, same length: crossfades cleanly from music.wave")
    B.mix("music.boss", "music/boss", [("Cinematic - Macabre Iii", 8.0, 38.0, 0.0, 1.0, None), (P, 0.0, 25.87, 0.0, 0.6, None)], peak=-5, stereo=True, lp=True, xf=60, total=25.87)
    B.meta("music.boss", gain=0.45, loop=True, space="2d", note="the pulse of music.wave under a darker cinematic layer, same length")
    # the same four names from Kevin MacLeod's music (CC BY 4.0: the credit lines in LICENSES.md are then required)
    for ev, track, a, b in (("music.calm", "Gathering Darkness", 20.0, 65.0), ("music.wave", "Unseen Horrors", 30.0, 75.0),
                            ("music.intense", "Volatile Reaction", 10.0, 55.0), ("music.boss", "Killers", 15.0, 60.0)):
        B.cut(ev + ".ccby", "music/ccby_" + ev.split(".")[1], "incompetech/" + track, a, b, peak=-4, stereo=True, lp=True, xf=3000)
        B.meta(ev + ".ccby", gain=0.4, loop=True, space="2d", added=f"alternative bed: \"{track}\" by Kevin MacLeod, CC BY 4.0, credit required; to use it, put this file first in {ev}")
    B.cut("end.win.ccby", "music/ccby_win", "incompetech/Heroic Age", 0.0, 22.0, peak=-3, fout=4000)
    B.meta("end.win.ccby", gain=0.6, space="2d", added="alternative victory music: \"Heroic Age\" by Kevin MacLeod, CC BY 4.0, credit required")
    return B


def lobby(only):
    B = Bank(OUT_LOBBY, only)
    C = "Clocks/Clock 070"
    B.cut("vote.hover", "hover_01", "UI_Mechanical_Move_40", peak=-8)
    B.cut("vote.hover", "hover_02", "switch_button_click_small_005", peak=-8)
    B.cut("vote.pick", "pick_01", "switch_button_click_high_tech_mechanical_007_01", peak=-3)
    B.cut("vote.pick", "pick_02", "switch_button_click_ignition_002_03", peak=-3)
    B.cut("vote.win", "vote_win", "Bluezone-BC0226-whoosh-impact-012", peak=-2, fout=400)
    for i in range(3):
        B.cut("vote.last", f"tick_{i + 1:02d}", C, i * 1.0, i * 1.0 + 0.55, peak=-4)
        B.cut("countdown.tick", f"count_{i + 1:02d}", C, 4.0 + i * 1.0, 4.55 + i * 1.0, peak=-2)
    B.mix("countdown.go", "go", [("Bluezone-BC0226-hit-impact-004", None, None, 0.0, 1.0, None), ("Boom 005", None, None, 0.0, 0.7, 2.5)], peak=-1, fout=500)
    B.mix("results.show", "results", [("Timpani_Hit_Fienup_001", None, None, 0.0, 1.0, 3.5), ("Impact_Drum Hit_03", None, None, 0.0, 0.6, 3.5)], peak=-2, fout=900)
    B.cut("message.in", "radio_01", "Cobra MicroTalk,Radio Communication,End,Noise Squelch", 0.12, 0.53, peak=-6)
    B.cut("message.in", "radio_02", "Cobra MicroTalk,Radio Communication,End,Noise Squelch", 2.92, 3.33, peak=-6)
    B.cut("pause.toggle", "pause", "Wall_Light_Double_Switch_Off-004", peak=-4)
    B.cut("ui.click", "click_01", "Button_Press-007", peak=-6)
    B.cut("ui.click", "click_02", "light_switch_019", peak=-6)
    B.cut("setup.point", "point", "door_lock_007", peak=-4)
    B.cut("setup.done", "setup_done", "UI_Mechanical_Turning-On_03_Raw", peak=-3)
    # the shooting range of the hub (S3's hooks range.*)
    B.shots("range.shot", "range_shot", "SIG_P229_9mm_1m_left", "SIG_P229_9mm_50m_behind", (0.1, 1.5), (0.15, 1.7), [2, 0], 0.8)
    B.shots("range.shot", "range_shot", "SIG_P229_9mm_1m_left", "SIG_P229_9mm_50m_behind", (3.0, 4.5), (3.1, 4.7), [2], 0.8, first=3)
    B.cut("range.hit", "range_hit_01", "bullet_impact_metal_heavy_08", peak=-3)
    B.cut("range.hit", "range_hit_02", "metal_hit_004", peak=-3)
    B.cut("range.best", "range_best", "Bluezone-BC0224-impact-003", peak=-3, fout=500)
    return B


def report(B, title):
    with open(os.path.join(B.out, "SOURCES.tsv"), "w", encoding="utf-8") as f:
        f.write("file\tsource under vr-arena/_sound-src\tpart (seconds)\n")
        for rel, s in B.sources:
            f.write(f"{rel}\t{s}\n")
    print(title, len(B.sources), "files,", len(B.events), "events")
    for rel, secs, pk, rms in B.stats:
        print(f"  {rel:34s} {secs:6.2f} s  peak {pk:6.1f}  rms {rms:6.1f}")


if __name__ == "__main__":
    only = [a for a in sys.argv[1:] if not a.startswith("-")]
    M = motel(only)
    L = lobby(only)
    report(M, "motel")
    report(L, "lobby")
    json.dump({"motel": M.events, "lobby": L.events}, open(os.path.join(HERE, "events.json"), "w", encoding="utf-8"), indent=1)
