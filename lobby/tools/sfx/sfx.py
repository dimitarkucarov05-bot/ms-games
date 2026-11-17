#!/usr/bin/env python
"""sfx.py: probe, cut and find sound effects for the game.

    python sfx.py probe <file> [--gap ms] [--threshold dB] [--fast] [--json]
    python sfx.py cut   <src> <dst.ogg> [--start s] [--end s] [--fade-in ms] [--fade-out ms]
                        [--peak -1] [--rms dB] [--loop] [--xfade ms] [--channel n]
                        [--trim-db -50] [--no-trim] [--quality 5]
    python sfx.py find  <words...> [--root dir] [--name-only] [--limit n] [--no-duration]
    python sfx.py index [--root dir] [--out file.tsv]

Needs: numpy, imageio-ffmpeg (ships the ffmpeg binary), soundfile (fast header reads for `find`).
No sound is ever synthesized here: `cut` only trims, fades, mixes to mono, resamples and sets the level of a
recording that already exists.
"""
import argparse
import json
import math
import os
import re
import subprocess
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
DEFAULT_ROOT = os.environ.get("SFX_SRC") or os.path.normpath(os.path.join(HERE, "..", "..", "..", "_sound-src"))
AUDIO_EXT = (".wav", ".flac", ".ogg", ".mp3", ".aif", ".aiff", ".m4a", ".opus", ".wv", ".w64", ".bwf")
OUT_RATE = 44100
_FFMPEG = None


def ffmpeg():
    global _FFMPEG
    if _FFMPEG is None:
        import imageio_ffmpeg
        _FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()
    return _FFMPEG


def db(x):
    return 20.0 * math.log10(x) if x > 0 else float("-inf")


def fmt_db(x):
    return "-inf" if x == float("-inf") else f"{x:.1f}"


# ---------------------------------------------------------------- reading

def header(path):
    """Container facts from ffmpeg's own banner: duration, codec, sample rate, channels."""
    p = subprocess.run([ffmpeg(), "-hide_banner", "-i", path], capture_output=True)
    text = p.stderr.decode("utf-8", "replace")
    info = {"duration": None, "codec": None, "rate": None, "channels": None, "layout": None}
    m = re.search(r"Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)", text)
    if m:
        info["duration"] = int(m.group(1)) * 3600 + int(m.group(2)) * 60 + float(m.group(3))
    m = re.search(r"Stream #\d+:\d+.*?Audio:\s*([^,]+),\s*(\d+)\s*Hz,\s*([^,\r\n]+)", text)
    if not m:
        raise SystemExit(f"no audio stream found in {path}\n{text[-400:]}")
    info["codec"] = m.group(1).strip()
    info["rate"] = int(m.group(2))
    layout = m.group(3).strip()
    info["layout"] = layout
    names = {"mono": 1, "stereo": 2, "2.1": 3, "3.0": 3, "quad": 4, "4.0": 4, "5.0": 5, "5.1": 6, "7.1": 8}
    m2 = re.match(r"(\d+)\s*channels", layout)
    info["channels"] = int(m2.group(1)) if m2 else names.get(layout.split("(")[0], None)
    return info


def stream_pcm(path, channels, rate=None, start=None, end=None, block_seconds=2.0, pan=None):
    """Yield float32 blocks shaped (n, channels) decoded by ffmpeg."""
    cmd = [ffmpeg(), "-v", "error", "-nostdin"]
    if start:
        cmd += ["-ss", f"{start:.6f}"]
    if end is not None:
        cmd += ["-to", f"{end:.6f}"]
    cmd += ["-i", path, "-vn", "-map", "0:a:0"]
    if pan:
        cmd += ["-af", pan]
    cmd += ["-ac", str(channels)]
    if rate:
        cmd += ["-ar", str(rate)]
    cmd += ["-f", "f32le", "-acodec", "pcm_f32le", "-"]
    proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    use_rate = rate or 48000
    want = int(use_rate * block_seconds) * channels * 4
    frame = channels * 4
    rest = b""
    while True:
        chunk = proc.stdout.read(want)
        if not chunk:
            break
        chunk = rest + chunk
        usable = len(chunk) - (len(chunk) % frame)
        rest = chunk[usable:]
        if usable:
            yield np.frombuffer(chunk[:usable], dtype="<f4").reshape(-1, channels)
    err = proc.stderr.read().decode("utf-8", "replace").strip()
    if proc.wait() != 0:
        raise SystemExit(f"ffmpeg could not decode {path}: {err[-400:]}")


def read_mono(path, start=None, end=None, channel=None):
    """Whole file (or a part) as mono float64 at 44.1 kHz."""
    pan = None
    if channel is not None:
        pan = f"pan=mono|c0=c{int(channel)}"
    blocks = list(stream_pcm(path, 1, OUT_RATE, start, end, pan=pan))
    if not blocks:
        raise SystemExit(f"no audio decoded from {path} (check --start / --end)")
    return np.concatenate(blocks)[:, 0].astype(np.float64)


# ---------------------------------------------------------------- probe

def loudness(path):
    """Integrated loudness (LUFS), loudness range and true peak from ffmpeg's EBU R128 scanner."""
    p = subprocess.run([ffmpeg(), "-hide_banner", "-nostats", "-nostdin", "-i", path, "-map", "0:a:0",
                        "-af", "ebur128=peak=true:framelog=quiet", "-f", "null", "-"], capture_output=True)
    text = p.stderr.decode("utf-8", "replace")
    tail = text[text.rfind("Summary:"):] if "Summary:" in text else ""
    out = {}
    m = re.search(r"I:\s*(-?[\d.]+|-inf)\s*LUFS", tail)
    if m:
        out["lufs"] = float(m.group(1)) if m.group(1) != "-inf" else float("-inf")
    m = re.search(r"LRA:\s*(-?[\d.]+)\s*LU", tail)
    if m:
        out["lra"] = float(m.group(1))
    m = re.search(r"Peak:\s*(-?[\d.]+|-inf)\s*dBFS", tail)
    if m:
        out["true_peak"] = float(m.group(1)) if m.group(1) != "-inf" else float("-inf")
    return out


def find_takes(env, hop_s, threshold_db, gap_ms, min_ms=15.0):
    """Regions of the envelope above the threshold, merged when the pause between them is shorter than gap."""
    lin = 10 ** (threshold_db / 20.0)
    on = env > lin
    if not on.any():
        return []
    idx = np.flatnonzero(np.diff(np.concatenate(([0], on.view(np.int8), [0]))))
    starts, ends = idx[0::2], idx[1::2]
    gap = max(1, int(round(gap_ms / 1000.0 / hop_s)))
    takes = []
    cs, ce = starts[0], ends[0]
    for s, e in zip(starts[1:], ends[1:]):
        if s - ce < gap:
            ce = e
        else:
            takes.append((cs, ce))
            cs, ce = s, e
    takes.append((cs, ce))
    out = []
    for s, e in takes:
        if (e - s) * hop_s * 1000.0 < min_ms:
            continue
        out.append({"start": round(s * hop_s, 3), "end": round(e * hop_s, 3),
                    "duration": round((e - s) * hop_s, 3), "peak_db": round(db(float(env[s:e].max())), 1)})
    return out


def probe(path, gap_ms=250.0, threshold_db=None, fast=False):
    info = header(path)
    ch = info["channels"] or 2
    rate = info["rate"]
    hop = max(1, int(rate * 0.005))
    peak = 0.0
    sumsq = 0.0
    count = 0
    env_parts = []
    carry = np.zeros((0,), dtype=np.float32)
    ch_peak = np.zeros(ch)
    for block in stream_pcm(path, ch, rate):
        a = np.abs(block)
        ch_peak = np.maximum(ch_peak, a.max(axis=0))
        sumsq += float(np.square(block, dtype=np.float64).sum())
        count += block.size
        mono = np.concatenate((carry, a.max(axis=1)))
        usable = len(mono) - (len(mono) % hop)
        if usable:
            env_parts.append(mono[:usable].reshape(-1, hop).max(axis=1))
        carry = mono[usable:]
    if len(carry):
        env_parts.append(np.array([carry.max()]))
    env = np.concatenate(env_parts) if env_parts else np.zeros(1, dtype=np.float32)
    peak = float(ch_peak.max()) if count else 0.0
    rms = math.sqrt(sumsq / count) if count else 0.0
    frames = count // ch if ch else 0
    hop_s = hop / rate
    peak_db = db(peak)
    if threshold_db is None:
        # 40 dB under the file's own peak, but never lower than -60 dBFS
        threshold_db = max(peak_db - 40.0, -60.0) if peak > 0 else -60.0
    takes = find_takes(env, hop_s, threshold_db, gap_ms)
    result = {
        "file": path,
        "duration": round(frames / rate, 3) if rate else info["duration"],
        "channels": ch, "layout": info["layout"], "sample_rate": rate, "codec": info["codec"],
        "peak_dbfs": round(peak_db, 2) if peak > 0 else None,
        "rms_dbfs": round(db(rms), 2) if rms > 0 else None,
        "channel_peaks_dbfs": [round(db(float(p)), 1) if p > 0 else None for p in ch_peak],
        "take_threshold_db": round(threshold_db, 1), "take_gap_ms": gap_ms, "takes": takes,
    }
    if not fast:
        result.update(loudness(path))
    return result


def cmd_probe(a):
    r = probe(a.file, a.gap, a.threshold, a.fast)
    if a.json:
        print(json.dumps(r, indent=1))
        return
    print(f"file        {r['file']}")
    print(f"duration    {r['duration']:.3f} s")
    print(f"channels    {r['channels']} ({r['layout']})   sample rate {r['sample_rate']} Hz   codec {r['codec']}")
    print(f"peak        {fmt_db(r['peak_dbfs'] if r['peak_dbfs'] is not None else float('-inf'))} dBFS"
          f"   (per channel: {', '.join('-inf' if p is None else str(p) for p in r['channel_peaks_dbfs'])})")
    print(f"rms         {fmt_db(r['rms_dbfs'] if r['rms_dbfs'] is not None else float('-inf'))} dBFS")
    if "lufs" in r:
        print(f"loudness    {fmt_db(r['lufs'])} LUFS integrated"
              + (f"   range {r['lra']} LU" if 'lra' in r else "")
              + (f"   true peak {fmt_db(r['true_peak'])} dBFS" if 'true_peak' in r else ""))
    print(f"takes       {len(r['takes'])}  (level above {r['take_threshold_db']} dBFS, pauses under "
          f"{r['take_gap_ms']:.0f} ms joined)")
    for i, t in enumerate(r["takes"][: a.max_takes], 1):
        print(f"  {i:3d}  start {t['start']:9.3f}  end {t['end']:9.3f}  length {t['duration']:8.3f}  "
              f"peak {t['peak_db']:6.1f} dBFS")
    if len(r["takes"]) > a.max_takes:
        print(f"  ... {len(r['takes']) - a.max_takes} more (use --max-takes or --json)")


# ---------------------------------------------------------------- cut

def trim_silence(x, trim_db, lead_s, tail_s):
    """Cut everything before the first and after the last sample louder than trim_db under the peak."""
    peak = float(np.abs(x).max())
    if peak <= 0:
        return x, 0, len(x)
    lin = peak * 10 ** (trim_db / 20.0)
    loud = np.flatnonzero(np.abs(x) > lin)
    first = max(0, int(loud[0]) - int(lead_s * OUT_RATE))
    last = min(len(x), int(loud[-1]) + 1 + int(tail_s * OUT_RATE))
    return x[first:last], first, last


def make_loop(x, xfade_ms):
    """Blend the last part of the sound into its first part, so the end runs straight into the start."""
    n = int(OUT_RATE * xfade_ms / 1000.0)
    n = min(n, len(x) // 4)
    if n < 8:
        return x, 0
    head, tail = x[:n], x[-n:]
    t = np.linspace(0.0, 1.0, n, endpoint=False)
    # the more alike the two ends are, the closer to a plain linear blend; unlike ends get equal power
    denom = float(np.sqrt((head ** 2).sum() * (tail ** 2).sum()))
    corr = float((head * tail).sum() / denom) if denom > 0 else 0.0
    corr = min(1.0, max(0.0, corr))
    lin_in, lin_out = t, 1.0 - t
    pow_in, pow_out = np.sin(t * math.pi / 2), np.cos(t * math.pi / 2)
    fin = corr * lin_in + (1 - corr) * pow_in
    fout = corr * lin_out + (1 - corr) * pow_out
    out = x[: len(x) - n].copy()
    out[:n] = head * fin + tail * fout
    return out, n


def encode(samples, dst, quality):
    os.makedirs(os.path.dirname(os.path.abspath(dst)) or ".", exist_ok=True)
    ext = os.path.splitext(dst)[1].lower()
    cmd = [ffmpeg(), "-v", "error", "-nostdin", "-y", "-f", "f32le", "-ar", str(OUT_RATE), "-ac", "1", "-i", "-"]
    if ext == ".ogg":
        cmd += ["-c:a", "libvorbis", "-q:a", str(quality)]
    elif ext == ".wav":
        cmd += ["-c:a", "pcm_s16le"]
    else:
        raise SystemExit("destination must end in .ogg (or .wav for a check copy)")
    cmd += ["-map_metadata", "-1", dst]
    p = subprocess.run(cmd, input=samples.astype("<f4").tobytes(), capture_output=True)
    if p.returncode != 0:
        raise SystemExit("ffmpeg could not write " + dst + ": " + p.stderr.decode("utf-8", "replace")[-400:])


def cmd_cut(a):
    if os.path.abspath(a.src) == os.path.abspath(a.dst):
        raise SystemExit("source and destination are the same file")
    x = read_mono(a.src, a.start, a.end, a.channel)
    src_len = len(x) / OUT_RATE
    x = x - 0.0
    lead = (a.fade_in + 1.0) / 1000.0
    if not a.no_trim:
        tail = 0.0 if a.loop else a.fade_out / 1000.0 * 0.25
        x, first, last = trim_silence(x, a.trim_db, 0.0 if a.loop else lead, tail)
    if len(x) < 16:
        raise SystemExit("nothing left after trimming: is the chosen part silent?")
    xf = 0
    if a.loop:
        x, xf = make_loop(x, a.xfade)
    else:
        n_in = min(int(OUT_RATE * a.fade_in / 1000.0), len(x) // 2)
        n_out = min(int(OUT_RATE * a.fade_out / 1000.0), len(x) // 2)
        if n_in > 1:
            x[:n_in] *= np.linspace(0.0, 1.0, n_in, endpoint=False)
        if n_out > 1:
            x[-n_out:] *= np.cos(np.linspace(0.0, math.pi / 2, n_out)) ** 2
    peak = float(np.abs(x).max())
    if peak <= 0:
        raise SystemExit("the chosen part is digital silence")
    gain = 1.0
    note = ""
    if a.rms is not None:
        rms = math.sqrt(float((x ** 2).mean()))
        gain = 10 ** (a.rms / 20.0) / rms
        if a.peak is not None and peak * gain > 10 ** (a.peak / 20.0):
            gain = 10 ** (a.peak / 20.0) / peak
            note = "  (rms target not reached: held back by the peak ceiling)"
    elif a.peak is not None:
        gain = 10 ** (a.peak / 20.0) / peak
    x = x * gain
    encode(x, a.dst, a.quality)
    # read the written file back and report what is really in it
    y = read_mono(a.dst)
    out_peak = float(np.abs(y).max())
    out_rms = math.sqrt(float((y ** 2).mean()))
    line = (f"{a.dst}: {len(y) / OUT_RATE:.3f} s (from {src_len:.3f} s), mono {OUT_RATE} Hz, "
            f"peak {db(out_peak):.2f} dBFS, rms {db(out_rms):.2f} dBFS, gain {db(gain):+.1f} dB, "
            f"{os.path.getsize(a.dst)} bytes{note}")
    if a.loop:
        # seam check on the decoded file: the step from the last sample to the first, against the usual step
        step = abs(float(y[0] - y[-1]))
        usual = float(np.percentile(np.abs(np.diff(y)), 99)) or 1e-9
        line += (f", loop crossfade {xf / OUT_RATE * 1000:.0f} ms, seam step {step:.4f} "
                 f"(99th percentile step inside the file {usual:.4f})")
    print(line)


# ---------------------------------------------------------------- find / index

def quick_info(path):
    """Duration, channels, rate without decoding the file. soundfile first, ffmpeg banner as fallback."""
    try:
        import soundfile
        i = soundfile.info(path)
        return i.frames / i.samplerate if i.samplerate else 0.0, i.channels, i.samplerate
    except Exception:
        try:
            h = header(path)
            return h["duration"] or 0.0, h["channels"] or 0, h["rate"] or 0
        except SystemExit:
            return 0.0, 0, 0


def walk_audio(root):
    for base, dirs, files in os.walk(root):
        dirs[:] = [d for d in dirs if not d.startswith("_")]
        for f in files:
            if f.lower().endswith(AUDIO_EXT) and not f.startswith("._"):
                yield os.path.join(base, f)


def cmd_find(a):
    words = [w.lower() for w in a.words]
    root = a.root
    index = os.path.join(root, "_index", "files.tsv")
    rows = []
    if os.path.isfile(index) and not a.scan:
        with open(index, encoding="utf-8") as f:
            for line in f:
                parts = line.rstrip("\n").split("\t")
                if len(parts) >= 4 and parts[0] != "seconds":
                    rows.append((os.path.join(root, parts[3]), float(parts[0])))
    else:
        rows = [(p, None) for p in walk_audio(root)]
    hits = 0
    for path, dur in rows:
        rel = os.path.relpath(path, root).replace("\\", "/")
        hay = (os.path.basename(rel) if a.name_only else rel).lower()
        if not all(w in hay for w in words):
            continue
        if any(w in hay for w in (a.exclude or [])):
            continue
        hits += 1
        if hits > a.limit:
            continue
        if a.no_duration:
            print(path.replace("\\", "/"))
        else:
            if dur is None:
                dur = quick_info(path)[0]
            print(f"{dur:9.2f} s  {path.replace(chr(92), '/')}")
    extra = f" (showing the first {a.limit}; raise --limit)" if hits > a.limit else ""
    print(f"{hits} file(s) match{extra}", file=sys.stderr)


def cmd_index(a):
    root = a.root
    out = a.out or os.path.join(root, "_index", "files.tsv")
    os.makedirs(os.path.dirname(out), exist_ok=True)
    n = 0
    total = 0.0
    with open(out + ".tmp", "w", encoding="utf-8") as f:
        f.write("seconds\tchannels\trate\tpath\n")
        for path in walk_audio(root):
            dur, ch, rate = quick_info(path)
            rel = os.path.relpath(path, root).replace("\\", "/")
            f.write(f"{dur:.3f}\t{ch}\t{rate}\t{rel}\n")
            n += 1
            total += dur
    os.replace(out + ".tmp", out)
    print(f"{n} audio files, {total / 3600:.1f} hours, index written to {out}")


# ---------------------------------------------------------------- command line

def main(argv=None):
    ap = argparse.ArgumentParser(description="Probe, cut and find sound effects.")
    sub = ap.add_subparsers(dest="cmd", required=True)

    p = sub.add_parser("probe", help="measure a file and list the separate takes inside it")
    p.add_argument("file")
    p.add_argument("--gap", type=float, default=250.0, help="pause in ms that separates two takes (default 250)")
    p.add_argument("--threshold", type=float, default=None,
                   help="level in dBFS that counts as sound (default: 40 dB under the file's peak, at least -60)")
    p.add_argument("--fast", action="store_true", help="skip the EBU R128 loudness pass")
    p.add_argument("--json", action="store_true")
    p.add_argument("--max-takes", type=int, default=60)
    p.set_defaults(fn=cmd_probe)

    c = sub.add_parser("cut", help="cut a part of a file to a mono 44.1 kHz OGG Vorbis file")
    c.add_argument("src")
    c.add_argument("dst")
    c.add_argument("--start", type=float, default=None, help="seconds")
    c.add_argument("--end", type=float, default=None, help="seconds")
    c.add_argument("--fade-in", type=float, default=2.0, help="ms (default 2)")
    c.add_argument("--fade-out", type=float, default=30.0, help="ms (default 30)")
    c.add_argument("--peak", type=lambda s: None if s.lower() == "none" else float(s), default=-1.0,
                   help="peak level in dBFS after the cut (default -1; 'none' keeps the level)")
    c.add_argument("--rms", type=float, default=None,
                   help="aim for this RMS level in dBFS instead (never above --peak): matches loudness in a family")
    c.add_argument("--loop", action="store_true", help="make a seamless loop: crossfade the end into the start")
    c.add_argument("--xfade", type=float, default=150.0, help="loop crossfade in ms (default 150)")
    c.add_argument("--channel", type=int, default=None,
                   help="take only this channel (0 = first) instead of mixing all channels")
    c.add_argument("--trim-db", type=float, default=-50.0,
                   help="silence is anything this many dB under the peak of the part (default -50)")
    c.add_argument("--no-trim", action="store_true")
    c.add_argument("--quality", type=float, default=5.0, help="Vorbis quality (default 5)")
    c.set_defaults(fn=cmd_cut)

    f = sub.add_parser("find", help="search the raw library by words in the path")
    f.add_argument("words", nargs="+")
    f.add_argument("--root", default=DEFAULT_ROOT)
    f.add_argument("--name-only", action="store_true", help="match the file name only, not its folders")
    f.add_argument("--exclude", nargs="*", type=str.lower, help="drop paths that hold any of these words")
    f.add_argument("--limit", type=int, default=200)
    f.add_argument("--no-duration", action="store_true")
    f.add_argument("--scan", action="store_true", help="walk the folders even when an index exists")
    f.set_defaults(fn=cmd_find)

    i = sub.add_parser("index", help="write _index/files.tsv (seconds, channels, rate, path) for the whole library")
    i.add_argument("--root", default=DEFAULT_ROOT)
    i.add_argument("--out", default=None)
    i.set_defaults(fn=cmd_index)

    a = ap.parse_args(argv)
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass
    a.fn(a)


if __name__ == "__main__":
    main()
