"""Fetch chosen libraries of the Sonniss #GameAudioGDC bundles (2015-2020) file by file from the official
Your.Org mirror (linked from sonniss.com/gameaudiogdc), using the index made by lobby/tools/sfx/mirror_index.py.

    python fetch_sonniss.py [--dry]

Saved as _sound-src/sonniss-gdc/<year>/<library>/<file>; the licence of each year is saved in its year folder.
Only whole libraries named in LIBS are taken (plus the single files in FILES); single files above CAP are left out.
"""
import os
import re
import sys
import threading
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.dirname(HERE)
INDEX = os.path.join(SRC, "_index", "sonniss-mirror-files.tsv")
OUT = os.path.join(SRC, "sonniss-gdc")
BASE = "https://ftpmirror.your.org/pub/misc/"
YEARS = {"2015": "sonniss", "2016": "sonniss2016", "2017": "sonniss2017", "2018": "sonniss2018",
         "2019": "sonniss2019", "2020": "sonniss2020"}
LICENCE = {"2015": "individual/sonniss - please read.txt", "2016": "Licensing.pdf", "2017": "Licensing.pdf",
           "2018": "License.pdf", "2019": "License.pdf", "2020": "License.pdf"}
UA = {"User-Agent": "sfx-library-fetch/1.0"}
CAP = 60 * 2 ** 20

LIBS = r"""
Coll Anderson - Guns|Audiobeast|Gun Locker|Heckler & Koch (HK416|MP5)|Glock 18c|Sig P229|AKM 7|Smith & Wesson|
Saiga-12|SPAS-12|- Uzi 9mm|Various Gun Foley|M1919A4 Browning Machine Gun \.30cal$|Barrett|Beretta 93R|
Stuart Duffield - Bullet|TS Sound - 12 Gauge|Gun Sound Pack|Bullet Impact Sounds|Guns, Bullets and Explosions|
Olivier Girardot - (Guns|Hand Guns|Monster)|SoundMorph - MECHANISM|SoundMorph - INTERVENTION|
Wav Junction Sound Effects - (Shotguns|Footsteps|Ambience|Wind|Controller Buttons|Doors)|PMSFX - Bullet Bys|MG 42|
Monster Zombie Vocal|INFECTED ZONE|Glitchedtones - Zombie|SmartSoundFX - (Monsters|Impacts)|Screams & Shouts 2|
RDGSFX002|Troll Monster|Monster Within|Membrans - (Monster|Bone)|Bottle Rocket Fx - (Scream|Impact|The Drone)|
Human Vocalizations|Monster Roars|Orc Creature|Bluezone - (Cave|Forest) Creature|Fight Vocalizations|CREATURES ZONE|
House of Horrors|Creature Footstep|Yeti Monster|
Coll Anderson - (Gore|Metal Plate|Car Destruction|Traditional Sirens)|Gorification|Gore Toolkit HD|Borax|
Sound Spark LLC.*(Gore|Metal Hits|Electric Arcs|Whooshes Impacts)|BLOODBATH|Bloody Nightmare|
Wood Impacts and Debris|Tools and Wood|Wooden Staffs|Tools:Construction 01|Robert Cordova - Base|Black Metal|
Just Impacts|Creepy Door|Unsettling Creaks|Heavy Metal!|Wooden Fence Destruction|BlueZone - (Wood Sound|Heavy Metal)|
Matt Script - Squeaks|Conor Bradley - Metal Chains|Shapeforms - Hit & Punch|Punch and Combat|
Rock The Speakerbox - Melee|Hong Kong Action|Cinematic Metal Impacts|HAUNTED DOORS|Resonant Rusty Door|
2019/3maze - Doors|Footstep and Foley|Extended Footsteps|Ultimate Footstep|SoundBits - Rummage|
Explosion Sound Pack|Distant Blast|War Zone|Stefano Cremona - Explosions|Bluezone - Tank|
Natures Fury_Thunder|Invisible - Storm|Soundholder - Rain & Thunder|Effective Trailer|
SoundHolder - Chainsaw|Soundopolis - Blades|Just Whoosh|Hits Whoosh|Whoosh Pack 1|Swipes And Whooshes|
Airborne Sound - (Human|Electric-Magnetic|Power Accents|Eclectic Whooshes$)|Breathing In Hell|STETHOSCOPE|
Sick 6|Bedlam Stingers|SoundMorph - (Sinematic|TENSION)|Cinematic Tension|Cinematic Trailer Sound Effects|Titanium|
Dark Skies|PARANOIA|Cinematic Hits|Scary Ambiences|Nightfall|Cinematic Dark|Dark Cinematic Soundscapes|
Invasion Cinematic|Ultimate Trailer|Thorium|Scare Tactics|Complex Cinematic Horror|Industrial Terror|Digital Horror|
3maze - (FINAL IMPACT|IMPACTUS|High Impact|UI FX)|Halloween 101|Dark Materials|Light and Dark Drones|
Soundopolis - Percussion 01|HumBuzz|Sound Sower - Electric Field|Buttons and Switches|Bart Kamski - Clicks|
Switch And Button|InspectorJ - UI - Mechanical|Handheld Tranceivers|Voice of God|Soundrangers - Nature Ambience|
EmptySea - UI1|Kpow Sounds - UI|L\.A\. Sounds - Game|Scoba|UI SOUNDS - MUSICAL|The Cabin Audio Playset
"""
# single files from libraries that are otherwise not taken
FILES = r"""
Sounds of New York City/10 Chopper|Airborne Sound - Household/Door,Wood,Bathroom,Exterior POV,Hit,Pound|
Natures Fury_Wind_01/Wind_Trees_Cattails|Hzandbits - Howling Winds - Interior/Wind,Raindrops
"""
SKIP = r"Jackhammer|Thunderstorm_Distant|quad L|quad R|5\.1|\.L\.wav$|\.R\.wav$"


def rx(text):
    return re.compile("|".join(p for p in text.replace("\n", "").split("|") if p), re.I)


def main():
    dry = "--dry" in sys.argv
    libs, files, skip = rx(LIBS), rx(FILES), rx(SKIP)
    todo, per = [], {}
    for line in open(INDEX, encoding="utf-8"):
        year, size, path = line.rstrip("\n").split("\t", 2)
        if "/" not in path or not path.lower().endswith((".wav", ".aif", ".aiff", ".flac")):
            continue
        key = year + "/" + path
        lib = year + "/" + path.split("/")[0]
        if not (libs.search(lib) or files.search(key)) or skip.search(path) or int(size) > CAP:
            continue
        todo.append((year, int(size), path))
        per.setdefault(lib, [0, 0])
        per[lib][0] += int(size)
        per[lib][1] += 1
    total = sum(s for _, s, _ in todo)
    print(f"{len(todo)} files, {len(per)} libraries, {total / 2 ** 30:.2f} GiB")
    if dry:
        for k, (s, n) in sorted(per.items()):
            print(f"{s / 2 ** 20:6.0f} MB {n:3d}  {k}")
        return
    lock, bad = threading.Lock(), []

    def get(url, dst):
        if os.path.exists(dst) and os.path.getsize(dst) > 0:
            return
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        last = None
        for _ in range(4):
            try:
                with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=180) as r:
                    data = r.read()
                with open(dst + ".part", "wb") as f:
                    f.write(data)
                os.replace(dst + ".part", dst)
                return
            except Exception as e:
                last = e
        with lock:
            bad.append((url, str(last)))

    def one(item):
        year, _, path = item
        safe = "/".join(re.sub(r'[<>:"|?*]', "_", p).rstrip(" .") for p in path.split("/"))
        get(BASE + YEARS[year] + "/individual/" + urllib.parse.quote(path), os.path.join(OUT, year, *safe.split("/")))

    for y, rel in LICENCE.items():
        get(BASE + YEARS[y] + "/" + urllib.parse.quote(rel), os.path.join(OUT, y, "LICENSE - " + os.path.basename(rel)))
    with ThreadPoolExecutor(8) as pool:
        list(pool.map(one, todo))
    print("failed:", len(bad))
    for u, e in bad:
        print("  ", u, e)


if __name__ == "__main__":
    main()
