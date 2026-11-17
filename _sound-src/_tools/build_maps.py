"""Write sfx/motel/map.json and sfx/lobby/hooks.json from events.json (made by curate.py) and the voice manifests."""
import json, os
HERE = os.path.dirname(os.path.abspath(__file__)); ARENA = os.path.dirname(os.path.dirname(HERE))
SFX = os.path.join(ARENA, "lobby-stage", "public", "play", "assets", "sfx")
ev = json.load(open(os.path.join(HERE, "events.json"), encoding="utf-8"))
known = set(json.load(open(os.path.join(ARENA, "lobby-stage", "public", "play", "games", "motel", "sfx-events.json"), encoding="utf-8"))["events"])

events, added, alt = {}, [], {}
for name, e in ev["motel"].items():
    for f in e["files"] + e["kids"]:
        assert os.path.exists(os.path.join(SFX, "motel", *f.split("/"))), f
    o = {"files": e["files"]}
    if e["kids"]:
        o["kids"] = e["kids"]
    o["gain"] = e.get("gain", 1)
    o["pitch"] = e.get("pitch", [1.0, 1.0] if e.get("loop") else [0.97, 1.03])
    if e.get("cooldown"):
        o["cooldown"] = e["cooldown"]
    if e.get("loop"):
        o["loop"] = True
    o["space"] = e.get("space", "2d")
    if e.get("note"):
        o["note"] = e["note"]
    if name.endswith(".ccby"):
        o["added"] = e.get("added", "")
        alt[name] = o
        continue
    if name not in known:
        o["added"] = e.get("added", "not in sfx-events.json")
        added.append(name)
    events[name] = o

voices = {}
for set_name, prefix in (("raven", "voice."), ("raven-radio", "voice.radio.")):
    man = json.load(open(os.path.join(SFX, "motel", "voice", set_name, "manifest.json"), encoding="utf-8"))
    for l in man["lines"]:
        f = f"voice/{set_name}/{l['file']}"
        assert os.path.exists(os.path.join(SFX, "motel", *f.split("/"))), f
        (events if prefix == "voice." else alt)[prefix + l["id"]] = {"files": [f], "gain": 1.0, "pitch": [1.0, 1.0], "space": "2d", "text": l["text"],
                                    "seconds": round(l["seconds"], 2), "added": "announcer line (RAVEN)" if prefix == "voice." else "the same take through a radio band"}
        voices[l["id"]] = l["text"]
missing = sorted(known - set(events))
import sys
sys.path.insert(0, os.path.join(ARENA, "lobby", "tools", "sfx"))
import sfx
def secs(f):
    i = sfx.header(os.path.join(SFX, "motel", *f.split("/")))
    return i["duration"] * (i["channels"] or 1)
total = sum(secs(f) for e in events.values() for f in e["files"] + e.get("kids", []))
MB = round(total * 48000 * 4 / 2 ** 20)
out = {
    "_note": "Sound bank of The Motel (S8, 2026-11-16). Format as in games/motel/sfx-events.json: events[name] = {files (random pick), kids (softer set for kids mode), gain, pitch [min, max] playback rate, cooldown s, loop}. Paths are relative to this file. Extra fields are advice for the player code: space = where it should sound ('3d' = at the thing, through the panner; '2d' = in the head), note, added = an event that sfx-events.json does not have yet (S4 wires it when the feature exists), text/seconds for voice lines. All files are OGG Vorbis 44.1 kHz; one-shots mono, beds and stingers stereo (play stereo files 2D only). Every file is a cut of a downloaded recording (SOURCES.tsv); nothing is synthesized. Chosen by name and measurement, not by ear: each family needs one listening pass.",
    "_levels": "One-shots peak at -1 to -6 dBFS; gun families are levelled to one RMS each (pistol -19 ... shotgun -15), so 'gain' is the mix: guns 0.85-1.0, impacts 0.7-0.85, zombies 0.8-1.0 (3D distance does the rest), music 0.3-0.45, ambience 0.5-0.6, voice 1.0 (duck music by 6 dB under a line).",
    "_music": "music.calm/wave/intense/boss are beds cut from Sonniss trailer and horror libraries (no credit needed). music.wave and music.intense have the same length and pulse, so they crossfade without a bump. The *.ccby events are full music alternatives by Kevin MacLeod (CC BY 4.0): they may be used only together with the credit lines in vr-arena/_sound-src/LICENSES.md on a credits screen of the product.",
    "_added": added + ["voice.<id> (%d lines)" % len(voices)],
    "_memory": "The player code decodes every file under 'events' at load: about %d MB of decoded audio at 48 kHz. Beds (music.*, ambience.*, world.heli.*) are the big ones; decode them on first use or play them through an <audio> element if memory is tight on Quest 2. 'alternatives' is NOT loaded: copy an entry into 'events' to use it." % MB,
    "_missing": missing,
    "events": events,
    "alternatives": alt,
}
json.dump(out, open(os.path.join(SFX, "motel", "map.json"), "w", encoding="utf-8"), indent=1)
hooks = {}
for name, e in ev["lobby"].items():
    for f in e["files"]:
        assert os.path.exists(os.path.join(SFX, "lobby", f)), f
    hooks[name] = e["files"][0] if len(e["files"]) == 1 else e["files"]
json.dump(hooks, open(os.path.join(SFX, "lobby", "hooks.json"), "w", encoding="utf-8"), indent=1)
print(len(events), "motel events;", len(added), "added;", "missing from the bank:", missing)
print(json.dumps(hooks))
