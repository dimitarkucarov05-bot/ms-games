#!/usr/bin/env python
"""RAVEN announcer voice lines for The Motel.

Text (lines.json) -> Kokoro-82M (local, CPU, Apache 2.0) -> real signal processing only
(resampling, trimming, filters, compression, saturation, limiting) -> OGG Vorbis mono 44.1 kHz.

Two sets are written next to each other:
  lobby/public/play/assets/voice/raven/<id>.ogg         full, clean, deep
  lobby/public/play/assets/voice/raven-radio/<id>.ogg   the same take, band-limited like a helicopter radio
Each folder gets a manifest.json. Nothing is ever added to the voice: no tones, beeps or noise.

Usage (any Python works, the script restarts itself inside the voice venv):
  python make.py                 render every line, check every file with Whisper
  python make.py behind reload   render only these ids (the manifests keep the other lines)
  python make.py --check-only    do not render, only measure and transcribe what is on disk
  python make.py --no-check ...  skip the Whisper check (fast)
  python make.py --list          print the ids
"""
import sys
import os
import subprocess
from pathlib import Path

HERE = Path(__file__).resolve().parent
ARENA = HERE.parents[2]                      # .../vr-arena
TOOL = ARENA / "_voice-tool"
VENV = TOOL / "venv"
VENV_PY = VENV / "Scripts" / "python.exe"
MODELS = TOOL / "models"
OUT_ROOT = ARENA / "lobby" / "public" / "play" / "assets" / "voice"
LINES = HERE / "lines.json"

if __name__ == "__main__" and VENV_PY.exists() and Path(sys.prefix).resolve() != VENV.resolve():
    sys.exit(subprocess.call([str(VENV_PY), str(Path(__file__).resolve()), *sys.argv[1:]]))

import argparse
import json
import math
import re
import time
from fractions import Fraction

import numpy as np
import soundfile as sf
from scipy import signal
from scipy.ndimage import minimum_filter1d, uniform_filter1d

# --------------------------------------------------------------------------------------------
# Settings. Per-line overrides: in lines.json a line may be an object instead of a string:
#   "id": {"text": "What the game shows", "say": "what the voice should read", "speed": 1.0,
#          "urgent": true, "voice": "am_fenrir"}
# --------------------------------------------------------------------------------------------
CFG = {
    "model": "Kokoro-82M v1.0 (kokoro-onnx, fp32)",
    "model_file": "kokoro/kokoro-v1.0.onnx",
    "voices_file": "kokoro/voices-v1.0.bin",
    # one voice name, or a blend {"am_onyx": 0.6, "am_fenrir": 0.4}
    "voice": {"am_onyx": 0.5, "am_fenrir": 0.5},
    "lang": "en-us",
    "sr": 44100,
    # Depth: the take is played back slower by this many semitones (pitch and formants drop together,
    # like a slowed tape); the synthesis runs faster by the same ratio so the tempo stays the same.
    "pitch_semitones": -1.5,
    "tempo_calm": 1.00,          # final speaking rate relative to the model's normal rate
    "tempo_urgent": 1.12,        # lines ending with "!"
    "pause_calm": 0.30,          # longest silence left inside a line, seconds
    "pause_urgent": 0.14,
    "tail_calm": 0.06,           # silence kept after the last sound
    "tail_urgent": 0.04,
    "lufs": -14.0,               # equal loudness target for every line (ITU-R BS.1770)
    "ceiling_db": -1.0,          # sample peak of the decoded file never above this
    "vorbis_quality": 0.6,       # 0..1, about 96 kbit/s mono
    "sets": {
        "raven": {
            "highpass": 70.0,
            "low_shelf": (150.0, 3.0),       # Hz, dB: chest
            "mud_cut": (320.0, -1.5, 1.0),   # Hz, dB, Q
            "presence": (3200.0, 3.0, 0.9),  # cuts through gunfire
            "air": (7500.0, 1.5),
            "comp": {"ratio": 4.0, "thr_rel_db": -6.0, "attack": 0.004, "release": 0.09},
            "comp_urgent": {"ratio": 6.0, "thr_rel_db": -8.0, "attack": 0.003, "release": 0.07},
            "drive_db": 3.0,                 # gentle tanh saturation
            "drive_urgent_db": 5.0,
        },
        "raven-radio": {
            "band": (380.0, 3100.0),         # helicopter intercom band
            "mid_peak": (1700.0, 4.0, 1.2),
            "comp": {"ratio": 10.0, "thr_rel_db": -12.0, "attack": 0.002, "release": 0.06},
            "comp_urgent": {"ratio": 12.0, "thr_rel_db": -14.0, "attack": 0.002, "release": 0.05},
            "drive_db": 9.0,                 # an overdriven transmitter
            "drive_urgent_db": 11.0,
        },
    },
    "whisper": "base.en",
}

# Attempts when the Whisper check does not hear the text back. Each is a change to the take.
RETRIES = [
    {},
    {"tempo_mul": 0.94},
    {"tempo_mul": 0.88},
    {"tempo_mul": 0.94, "pitch_add": 0.5},
    {"tempo_mul": 1.0, "no_tighten": True, "tempo_abs": 1.0},
    {"voice": "am_fenrir", "tempo_mul": 0.94},
    {"voice": "am_michael", "tempo_mul": 0.94},
]


# --------------------------------------------------------------------------------------------
# Small helpers
# --------------------------------------------------------------------------------------------
def db(x):
    return 20.0 * math.log10(max(float(x), 1e-12))


def undb(d):
    return 10.0 ** (d / 20.0)


def load_lines():
    data = json.loads(LINES.read_text(encoding="utf-8"))
    out = {}
    for lid, v in data["lines"].items():
        if isinstance(v, str):
            v = {"text": v}
        v = dict(v)
        v.setdefault("say", v["text"])
        v.setdefault("urgent", v["text"].rstrip().endswith("!"))
        out[lid] = v
    return out


# --------------------------------------------------------------------------------------------
# Text to speech
# --------------------------------------------------------------------------------------------
_kokoro = None


def kokoro():
    global _kokoro
    if _kokoro is None:
        from kokoro_onnx import Kokoro
        _kokoro = Kokoro(str(MODELS / CFG["model_file"]), str(MODELS / CFG["voices_file"]))
    return _kokoro


def voice_style(voice):
    k = kokoro()
    if isinstance(voice, str):
        return k.get_voice_style(voice)
    total = sum(voice.values())
    return sum(k.get_voice_style(n) * (w / total) for n, w in voice.items()).astype(np.float32)


def voice_name(voice):
    if isinstance(voice, str):
        return voice
    return "+".join("%s*%g" % (n, w) for n, w in voice.items())


def synth(text, voice, speed):
    """Kokoro: returns float32 mono at 24 kHz."""
    samples, sr = kokoro().create(text, voice=voice_style(voice), speed=float(speed), lang=CFG["lang"])
    return np.asarray(samples, dtype=np.float64), sr


def repitch(x, sr_in, semitones, sr_out):
    """Play the take at a different rate (pitch and length change together) and land on sr_out."""
    ratio = 2.0 ** (semitones / 12.0)                  # < 1 = lower and longer
    frac = Fraction(sr_out / (sr_in * ratio)).limit_denominator(2000)
    return signal.resample_poly(x, frac.numerator, frac.denominator)


# --------------------------------------------------------------------------------------------
# Editing: trim and tighten
# --------------------------------------------------------------------------------------------
def envelope(x, sr, win=0.010):
    n = max(1, int(sr * win))
    return np.sqrt(uniform_filter1d(x * x, n, mode="constant") + 1e-20)


def trim(x, sr, tail, thr_db=-40.0, pre=0.008):
    env = envelope(x, sr)
    thr = env.max() * undb(thr_db)
    idx = np.nonzero(env > thr)[0]
    if len(idx) == 0:
        return x
    a = max(0, idx[0] - int(pre * sr))
    b = min(len(x), idx[-1] + int(tail * sr))
    y = x[a:b].copy()
    fi, fo = int(0.004 * sr), int(min(tail, 0.03) * sr)
    y[:fi] *= np.linspace(0.0, 1.0, fi)
    y[-fo:] *= np.linspace(1.0, 0.0, fo) ** 2
    return y


def silent_runs(x, sr, thr_db=-38.0, min_len=0.05):
    """(start, end) sample ranges inside the line where the level stays under the threshold."""
    env = envelope(x, sr)
    quiet = env < env.max() * undb(thr_db)
    runs, start = [], None
    for i, q in enumerate(np.append(quiet, False)):
        if q and start is None:
            start = i
        elif not q and start is not None:
            if (i - start) / sr >= min_len and start > 0 and i < len(x):
                runs.append((start, i))
            start = None
    return runs


def tighten(x, sr, max_gap):
    """Shorten the pauses inside a line to max_gap seconds (cut from the middle, crossfaded)."""
    xf = int(0.008 * sr)
    out, pos = [], 0
    for a, b in silent_runs(x, sr):
        if (b - a) / sr <= max_gap:
            continue
        keep = int(max_gap * sr)
        cut_a = a + keep // 2
        cut_b = b - (keep - keep // 2)
        left = x[pos:cut_a].copy()
        left[-xf:] *= np.linspace(1.0, 0.0, xf)
        out.append(left)
        pos = cut_b
        head = x[pos:pos + xf] * np.linspace(0.0, 1.0, xf)
        x = np.concatenate([x[:pos], head, x[pos + xf:]])
    out.append(x[pos:])
    return np.concatenate(out)


# --------------------------------------------------------------------------------------------
# Filters (RBJ cookbook biquads) and dynamics
# --------------------------------------------------------------------------------------------
def _biquad(kind, sr, f0, gain_db=0.0, q=0.707):
    a_ = 10.0 ** (gain_db / 40.0)
    w0 = 2.0 * math.pi * f0 / sr
    cw, sw = math.cos(w0), math.sin(w0)
    alpha = sw / (2.0 * q)
    if kind == "peak":
        b = [1 + alpha * a_, -2 * cw, 1 - alpha * a_]
        a = [1 + alpha / a_, -2 * cw, 1 - alpha / a_]
    elif kind == "lowshelf":
        s = 2.0 * math.sqrt(a_) * alpha
        b = [a_ * ((a_ + 1) - (a_ - 1) * cw + s), 2 * a_ * ((a_ - 1) - (a_ + 1) * cw),
             a_ * ((a_ + 1) - (a_ - 1) * cw - s)]
        a = [(a_ + 1) + (a_ - 1) * cw + s, -2 * ((a_ - 1) + (a_ + 1) * cw), (a_ + 1) + (a_ - 1) * cw - s]
    elif kind == "highshelf":
        s = 2.0 * math.sqrt(a_) * alpha
        b = [a_ * ((a_ + 1) + (a_ - 1) * cw + s), -2 * a_ * ((a_ - 1) + (a_ + 1) * cw),
             a_ * ((a_ + 1) + (a_ - 1) * cw - s)]
        a = [(a_ + 1) - (a_ - 1) * cw + s, 2 * ((a_ - 1) - (a_ + 1) * cw), (a_ + 1) - (a_ - 1) * cw - s]
    else:
        raise ValueError(kind)
    return np.array(b) / a[0], np.array(a) / a[0]


def eq(x, sr, kind, f0, gain_db, q=0.707):
    b, a = _biquad(kind, sr, f0, gain_db, q)
    return signal.lfilter(b, a, x)


def highpass(x, sr, f, order=2):
    return signal.sosfilt(signal.butter(order, f, "highpass", fs=sr, output="sos"), x)


def lowpass(x, sr, f, order=4):
    return signal.sosfilt(signal.butter(order, f, "lowpass", fs=sr, output="sos"), x)


def compress(x, sr, ratio, thr_rel_db, attack, release):
    """Feed-forward compressor. The threshold sits thr_rel_db under the line's own peak, so every
    line is squeezed by the same amount whatever level the model produced."""
    peak = np.abs(x).max() + 1e-12
    thr = db(peak) + thr_rel_db
    level = 20.0 * np.log10(np.abs(x) + 1e-9)
    over = np.maximum(level - thr, 0.0)
    want = -over * (1.0 - 1.0 / ratio)                # gain reduction in dB, <= 0
    ca = math.exp(-1.0 / (attack * sr))
    cr = math.exp(-1.0 / (release * sr))
    g = np.empty_like(want)
    cur = 0.0
    for i, w in enumerate(want):
        c = ca if w < cur else cr
        cur = c * cur + (1.0 - c) * w
        g[i] = cur
    return x * (10.0 ** (g / 20.0))


def saturate(x, drive_db):
    """Soft clipping (tanh) at 4x oversampling: adds harmonics of the voice itself, nothing else."""
    peak = np.abs(x).max() + 1e-12
    up = signal.resample_poly(x / peak, 4, 1)
    d = undb(drive_db)
    up = np.tanh(up * d) / math.tanh(d)
    return signal.resample_poly(up, 1, 4)[:len(x)] * peak


def limit(x, sr, ceiling, lookahead=0.004):
    """Look-ahead peak limiter: the result never passes the ceiling (linear)."""
    need = np.minimum(1.0, ceiling / (np.abs(x) + 1e-12))
    n = max(3, int(lookahead * sr) | 1)
    g = minimum_filter1d(need, 2 * n + 1, mode="nearest")
    g = uniform_filter1d(g, n, mode="nearest")
    return x * np.minimum(g, need)


_meters = {}


def lufs(x, sr):
    """Integrated loudness, ITU-R BS.1770-4 (pyloudnorm). Short clips are padded with silence so the
    0.4 s measuring block fits; the gating ignores the padding."""
    import pyloudnorm
    if sr not in _meters:
        _meters[sr] = pyloudnorm.Meter(sr)
    pad = int(0.45 * sr)
    y = np.concatenate([np.zeros(pad), x, np.zeros(pad)])
    return float(_meters[sr].integrated_loudness(y))


def true_peak_db(x):
    return db(np.abs(signal.resample_poly(x, 4, 1)).max())


def normalise(x, sr, target, ceiling_db):
    """Same loudness for every line, peak held under the ceiling by the limiter."""
    c = undb(ceiling_db)
    y = x
    for _ in range(6):
        y = y * undb(target - lufs(y, sr))
        y = limit(y, sr, c)
        if abs(lufs(y, sr) - target) < 0.05:
            break
    return y


# --------------------------------------------------------------------------------------------
# The two looks
# --------------------------------------------------------------------------------------------
def look_clean(x, sr, urgent):
    s = CFG["sets"]["raven"]
    y = highpass(x, sr, s["highpass"])
    y = eq(y, sr, "lowshelf", s["low_shelf"][0], s["low_shelf"][1])
    y = eq(y, sr, "peak", s["mud_cut"][0], s["mud_cut"][1], s["mud_cut"][2])
    y = eq(y, sr, "peak", s["presence"][0], s["presence"][1], s["presence"][2])
    y = eq(y, sr, "highshelf", s["air"][0], s["air"][1])
    y = compress(y, sr, **(s["comp_urgent"] if urgent else s["comp"]))
    y = saturate(y, s["drive_urgent_db"] if urgent else s["drive_db"])
    return highpass(y, sr, 50.0)


def look_radio(x, sr, urgent):
    s = CFG["sets"]["raven-radio"]
    lo, hi = s["band"]
    y = lowpass(highpass(x, sr, lo, 4), sr, hi, 6)
    y = eq(y, sr, "peak", s["mid_peak"][0], s["mid_peak"][1], s["mid_peak"][2])
    y = compress(y, sr, **(s["comp_urgent"] if urgent else s["comp"]))
    y = saturate(y, s["drive_urgent_db"] if urgent else s["drive_db"])
    return lowpass(highpass(y, sr, lo, 4), sr, hi, 8)     # the transmitter passes only its band


LOOKS = {"raven": look_clean, "raven-radio": look_radio}


# --------------------------------------------------------------------------------------------
# One take
# --------------------------------------------------------------------------------------------
def take(line, attempt=None):
    """Synthesize one line and edit it. Returns (audio at CFG sr, facts about the raw take)."""
    attempt = attempt or {}
    urgent = bool(line["urgent"])
    sr = CFG["sr"]
    tempo = line.get("speed") or (CFG["tempo_urgent"] if urgent else CFG["tempo_calm"])
    tempo = attempt.get("tempo_abs", tempo) * attempt.get("tempo_mul", 1.0)
    semis = line.get("pitch", CFG["pitch_semitones"]) + attempt.get("pitch_add", 0.0)
    voice = attempt.get("voice") or line.get("voice") or CFG["voice"]
    speed = tempo / (2.0 ** (semis / 12.0))            # faster synthesis pays for the slower playback
    raw, raw_sr = synth(line["say"], voice, speed)
    # was the model still speaking when its output ended? (a cut-off ending)
    n = int(0.02 * raw_sr)
    end_rel_db = db(np.sqrt(np.mean(raw[-n:] ** 2)) + 1e-9) - db(np.abs(raw).max())
    x = repitch(raw, raw_sr, semis, sr)
    x = trim(x, sr, CFG["tail_urgent"] if urgent else CFG["tail_calm"])
    if not attempt.get("no_tighten"):
        x = tighten(x, sr, CFG["pause_urgent"] if urgent else CFG["pause_calm"])
    facts = {"voice": voice_name(voice), "tempo": round(tempo, 3), "pitch_semitones": semis,
             "synth_speed": round(speed, 3), "raw_end_db": round(end_rel_db, 1)}
    return x, facts


def write_ogg(path, x, sr):
    """Encode, read back, and nudge the gain down if the codec pushed a peak over the ceiling."""
    gain = 1.0
    for _ in range(4):
        sf.write(str(path), (x * gain).astype(np.float32), sr, format="OGG", subtype="VORBIS",
                 compression_level=1.0 - CFG["vorbis_quality"])
        y, _sr = sf.read(str(path), dtype="float64")
        over = db(np.abs(y).max()) - CFG["ceiling_db"]
        if over <= 0.0:
            return y
        gain *= undb(-(over + 0.05))
    return y


def measure(y, sr):
    gaps = silent_runs(y, sr)
    d2 = np.abs(np.diff(y, 2))
    env = envelope(y, sr, 0.003)[1:-1] + 1e-4
    return {
        "seconds": round(len(y) / sr, 3),
        "peak_db": round(db(np.abs(y).max()), 2),
        "true_peak_db": round(true_peak_db(y), 2),
        "lufs": round(lufs(y, sr), 2),
        "longest_pause": round(max([(b - a) / sr for a, b in gaps], default=0.0), 3),
        # a click = one sample-to-sample jump far larger than the local level allows
        "click": round(float((d2 / env).max()), 2),
        "start_db": round(db(np.abs(y[:8]).max()), 1),
        "end_db": round(db(np.abs(y[-8:]).max()), 1),
    }


# --------------------------------------------------------------------------------------------
# The automatic listener
# --------------------------------------------------------------------------------------------
_whisper = None
NUMBERS = {"0": "zero", "1": "one", "2": "two", "3": "three", "4": "four", "5": "five", "6": "six",
           "7": "seven", "8": "eight", "9": "nine", "10": "ten", "30": "thirty", "1st": "first"}
SHORT = {"they're": "they are", "that's": "that is", "he's": "he is", "you're": "you are",
         "don't": "do not", "we're": "we are", "i've": "i have", "it's": "it is", "ok": "okay",
         "evac": "evac", "e-vac": "evac"}


def words(text):
    t = text.lower().replace("’", "'")
    t = re.sub(r"[^a-z0-9' -]", " ", t)
    out = []
    for w in t.replace("-", " ").split():
        w = w.strip("'")
        w = SHORT.get(w, w)
        w = NUMBERS.get(w, w)
        out.extend(w.split())
    return out


def word_errors(ref, hyp):
    """Levenshtein distance in words."""
    prev = list(range(len(hyp) + 1))
    for i, r in enumerate(ref, 1):
        cur = [i]
        for j, h in enumerate(hyp, 1):
            cur.append(min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (r != h)))
        prev = cur
    return prev[-1]


def hear(y, sr, model_name=None):
    global _whisper
    name = model_name or CFG["whisper"]
    if _whisper is None or _whisper[0] != name:
        from faster_whisper import WhisperModel
        _whisper = (name, WhisperModel(name, device="cpu", compute_type="int8",
                                       download_root=str(MODELS / "whisper")))
    y16 = signal.resample_poly(y, 160, 441) if sr == 44100 else y
    segs, _info = _whisper[1].transcribe(y16.astype(np.float32), language="en", beam_size=5,
                                         condition_on_previous_text=False, without_timestamps=True)
    return " ".join(s.text.strip() for s in segs).strip()


# --------------------------------------------------------------------------------------------
# Main
# --------------------------------------------------------------------------------------------
def render_line(lid, line, check=True):
    """Render both sets for one line; retry with other settings until the clean set is heard back."""
    sr = CFG["sr"]
    best = None
    attempts = RETRIES if check else RETRIES[:1]
    for n, attempt in enumerate(attempts):
        x, facts = take(line, attempt)
        clean = normalise(look_clean(x, sr, line["urgent"]), sr, CFG["lufs"], CFG["ceiling_db"] - 0.3)
        heard, errs = "", 0
        if check:
            heard = hear(clean, sr)
            errs = word_errors(words(line["text"]), words(heard))
        cut = facts["raw_end_db"] > -25.0
        score = errs + (1 if cut else 0)
        if best is None or score < best[0]:
            best = (score, n, x, facts, heard)
        if score == 0:
            break
    score, n, x, facts, heard = best
    rows = {}
    for set_name, look in LOOKS.items():
        folder = OUT_ROOT / set_name
        folder.mkdir(parents=True, exist_ok=True)
        y = normalise(look(x, sr, line["urgent"]), sr, CFG["lufs"], CFG["ceiling_db"] - 0.3)
        y = write_ogg(folder / (lid + ".ogg"), y, sr)
        row = {"id": lid, "text": line["text"], "file": lid + ".ogg"}
        row.update(measure(y, sr))
        row.update({"voice": facts["voice"], "model": CFG["model"], "urgent": bool(line["urgent"]),
                    "tempo": facts["tempo"], "pitch_semitones": facts["pitch_semitones"],
                    "attempt": n, "raw_end_db": facts["raw_end_db"]})
        if line["say"] != line["text"]:
            row["say"] = line["say"]
        if check:
            row["heard"] = hear(y, sr)
            row["word_errors"] = word_errors(words(line["text"]), words(row["heard"]))
        rows[set_name] = row
    return rows


def check_file(set_name, lid, line, old):
    y, sr = sf.read(str(OUT_ROOT / set_name / (lid + ".ogg")), dtype="float64")
    row = dict(old or {"id": lid, "text": line["text"], "file": lid + ".ogg"})
    row.update(measure(y, sr))
    row["heard"] = hear(y, sr)
    row["word_errors"] = word_errors(words(line["text"]), words(row["heard"]))
    return row


def read_manifest(set_name):
    p = OUT_ROOT / set_name / "manifest.json"
    if not p.exists():
        return {}
    return {r["id"]: r for r in json.loads(p.read_text(encoding="utf-8"))["lines"]}


def write_manifest(set_name, rows, lines):
    ordered = [rows[i] for i in lines if i in rows and (OUT_ROOT / set_name / rows[i]["file"]).exists()]
    data = {
        "set": set_name,
        "persona": "RAVEN",
        "model": CFG["model"],
        "voice": voice_name(CFG["voice"]),
        "licence": "Kokoro-82M: Apache 2.0 (model and voices); the audio is free to use commercially",
        "format": "OGG Vorbis, mono, 44100 Hz",
        "loudness_target_lufs": CFG["lufs"],
        "peak_ceiling_db": CFG["ceiling_db"],
        "made": time.strftime("%Y-%m-%d %H:%M"),
        "lines": ordered,
    }
    (OUT_ROOT / set_name / "manifest.json").write_text(json.dumps(data, indent=1), encoding="utf-8")
    return ordered


def summary(set_name, rows):
    checked = [r for r in rows if "word_errors" in r]
    n_ref = sum(len(words(r["text"])) for r in checked)
    n_err = sum(r["word_errors"] for r in checked)
    print("\n== %s: %d files" % (set_name, len(rows)))
    print("%-14s %6s %7s %7s %6s %5s  %s" % ("id", "sec", "peak", "LUFS", "pause", "errs", "heard"))
    for r in rows:
        print("%-14s %6.2f %7.2f %7.2f %6.2f %5s  %s" % (
            r["id"], r["seconds"], r["peak_db"], r["lufs"], r["longest_pause"],
            r.get("word_errors", "-"), r.get("heard", "")))
    if rows:
        l = [r["lufs"] for r in rows]
        p = [r["peak_db"] for r in rows]
        print("loudness %.2f .. %.2f LUFS, peak %.2f .. %.2f dBFS, total %.1f s" % (
            min(l), max(l), min(p), max(p), sum(r["seconds"] for r in rows)))
    if checked:
        print("word error rate (%s): %d / %d = %.2f %%, lines with an error: %s" % (
            CFG["whisper"], n_err, n_ref, 100.0 * n_err / max(n_ref, 1),
            [r["id"] for r in checked if r["word_errors"]] or "none"))


def main():
    ap = argparse.ArgumentParser(description="Render RAVEN's voice lines (see the top of this file).")
    ap.add_argument("ids", nargs="*", help="line ids to render; none = every line")
    ap.add_argument("--no-check", action="store_true", help="skip the Whisper transcription check")
    ap.add_argument("--check-only", action="store_true", help="measure and transcribe the files on disk")
    ap.add_argument("--list", action="store_true", help="print the line ids and stop")
    args = ap.parse_args()

    lines = load_lines()
    if args.list:
        for lid, line in lines.items():
            print("%-14s %s" % (lid, line["text"]))
        return 0
    unknown = [i for i in args.ids if i not in lines]
    if unknown:
        print("not in lines.json:", ", ".join(unknown))
        return 2
    ids = args.ids or list(lines)
    manifests = {s: read_manifest(s) for s in LOOKS}
    t0 = time.time()
    for n, lid in enumerate(ids, 1):
        if args.check_only:
            for s in LOOKS:
                if (OUT_ROOT / s / (lid + ".ogg")).exists():
                    manifests[s][lid] = check_file(s, lid, lines[lid], manifests[s].get(lid))
        else:
            rows = render_line(lid, lines[lid], check=not args.no_check)
            for s in LOOKS:
                manifests[s][lid] = rows[s]
        print("[%d/%d] %s  %.0f s" % (n, len(ids), lid, time.time() - t0), flush=True)
    bad = 0
    for s in LOOKS:
        ordered = write_manifest(s, manifests[s], lines)
        shown = [r for r in ordered if r["id"] in ids]
        summary(s, shown)
        bad += sum(1 for r in shown if r.get("word_errors"))
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
