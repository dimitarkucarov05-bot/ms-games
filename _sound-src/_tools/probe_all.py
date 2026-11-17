"""Probe every downloaded file: duration, channels, peak, and the separate takes inside it (start-end seconds).
Writes _index/probe.tsv:  path <TAB> seconds <TAB> channels <TAB> peak dB <TAB> takes "s-e:peak,..."
    python probe_all.py
"""
import os, sys, json, subprocess
from concurrent.futures import ThreadPoolExecutor
HERE = os.path.dirname(os.path.abspath(__file__)); SRC = os.path.dirname(HERE)
SFX = os.path.normpath(os.path.join(SRC, "..", "lobby", "tools", "sfx", "sfx.py"))
OUT = os.path.join(SRC, "_index", "probe.tsv")
done = {}
if os.path.exists(OUT):
    for l in open(OUT, encoding="utf-8"):
        done[l.split("\t")[0]] = l
files = []
for root in ("sonniss-gdc", "kenney", "incompetech", "2015", "2016", "2017", "2018"):
    for d, _, fs in os.walk(os.path.join(SRC, root)):
        for f in fs:
            if f.lower().endswith((".wav", ".ogg", ".mp3", ".flac", ".aif", ".aiff")):
                files.append(os.path.relpath(os.path.join(d, f), SRC).replace("\\", "/"))
def one(rel):
    if rel in done: return done[rel]
    p = subprocess.run([sys.executable, "-I", SFX, "probe", os.path.join(SRC, rel), "--fast", "--json", "--max-takes", "40"], capture_output=True)
    try:
        j = json.loads(p.stdout.decode("utf-8", "replace"))
    except Exception:
        return f"{rel}\tERR\t\t\t{p.stderr.decode('utf-8','replace')[-120:].strip()}\n".replace("\r", " ")
    takes = ",".join(f"{t.get('start',0):.2f}-{t.get('end',0):.2f}:{t.get('peak_db', t.get('peak', 0)):.0f}" for t in j.get("takes", []))
    return f"{rel}\t{j.get('duration',0):.2f}\t{j.get('channels','')}\t{j.get('peak_dbfs','')}\t{takes}\n"
with ThreadPoolExecutor(6) as pool, open(OUT + ".new", "w", encoding="utf-8") as out:
    for line in pool.map(one, sorted(files)):
        out.write(line)
os.replace(OUT + ".new", OUT)
print(len(files), "files")
