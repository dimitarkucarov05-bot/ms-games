"""Choose files from the crawled mirror index by keyword and write a download list.

    python mirror_select.py <index.tsv> <out-list.tsv> [--show]

A whole library folder is taken when its name does not match LIBDROP and its name, or one of its file names
(not ruled out by DROP), matches WANT. Single files above SIZE_CAP are left out.
Sizes in the index are rounded by the mirror's listing.
"""
import collections
import re
import sys

WANT = r"""
gun|pistol|rifle|shotgun|revolver|firearm|gunshot|shot\b|shots\b|smg|\buzi|ak-?47|\bak\b|m4\b|m16|ar-?15|glock|
beretta|9mm|\.45|\.38|\.22|\.50|12.?gauge|machine.?gun|lmg|m249|m60|carbine|sniper|bolt.?action|magazine|
\bmag\b|reload|cock|slide|shell|casing|brass|bullet|ricochet|whiz|fly.?by|flyby|pass.?by|impact|
zombie|monster|creature|growl|snarl|roar|screech|shriek|scream|moan|groan|gurgle|hiss|beast|undead|ghoul|demon|
gore|blood|flesh|bone|squish|splat|stab|slash|guts|wet|slime|vomit|retch|spit|puke|
whoosh|swish|swing|sword|blade|machete|axe|knife|melee|punch|hit\b|hits\b|blunt|body.?fall|bodyfall|
chainsaw|chain.?saw|hammer|nail|plank|wood|timber|crack|break|smash|destruct|debris|crash|rubble|
explosion|explode|blast|grenade|mortar|bomb|
metal|clang|clank|rattle|fence|chain|gate|door|creak|squeak|latch|lock|chest|crate|thud|drop|
helicopter|chopper|rotor|parachute|flap|cloth|canvas|tarp|
fire|flame|crackle|burn|torch|
electric|spark|zap|arc\b|neon|buzz|hum\b|power|generator|transformer|shutdown|power.?down|short.?circuit|fuse|
thunder|lightning|storm|wind|gust|
heartbeat|heart.?beat|breath|gasp|pain|grunt|
footstep|foot.?step|asphalt|concrete|gravel|shuffle|stomp|
dog|wolf|howl|bark|yelp|owl|cricket|night|forest|insects|
siren|alarm|horn|stinger|braam|brass.?hit|riser|rise\b|tension|suspense|horror|scare|jump.?scare|cinematic|trailer|
drone|dark|eerie|haunt|boom|sub.?drop|downer|transition|clock|tick|geiger|radio.?active|acid|sizzle|toxic|
bow\b|arrow|crossbow|archery|flashlight|switch|click
"""
DROP = r"""
\bcar\b|cars\b|\bcar_|vehicle|engine(?!er)|motorcycle|motorbike|train\b|trains\b|tram|subway|metro|airport|aircraft|airplane|boeing|jet\b|
traffic|street|city|urban|market|restaurant|cafe|crowd|walla|office|kitchen|household|bathroom|toilet|
ocean|sea\b|beach|wave|river|stream|waterfall|underwater|rain(?!ger)|snow|ice\b|
bird(?!shot)|sheep|cow\b|horse|pig\b|chicken|camel|elephant|cat\b|frog|bee\b|
sci.?fi|scifi|space|laser|robot|alien|spaceship|futur|synth|glitch|ui\b|interface|menu|8.?bit|chiptune|arcade|
magic|spell|fantasy|cartoon|comedy|toy|squeaky|music.?box|piano|guitar|violin|cello|flute|drum(?!s?.?hit)|
ambisonic|quad\b|5\.1|surround|binaural|room.?tone|roomtone|
football|soccer|tennis|golf|sport|skate|bicycle|bike|ski\b|
church|bell|temple|prayer|school|children|baby|
drill|sewing|printer|typewriter|keyboard|coffee|vending|washing|vacuum|fridge|
tokyo|berlin|london|paris|moscow|india|china|japan|africa|bali|dubai|crimea|
medieval|dragon|engine|factory|industrial.?amb|construction
"""

# Library folders that are never wanted, judged by the folder name alone (vehicles, places, crowds, toys).
LIBDROP = r"""
cadillac|camaro|dodge|plymouth|porsche|williams fw|t-34|corbitt|alfa romeo|bmw|chrysler|pantera|crown victoria|
saab|ural|volvo|wellcraft|renault|audi|tractor|excavator|moped|massey|mini-?cooper|jeep|ktm|halftrack|
messerschmitt|mustang|sherman|spitfire|fokker|curtiss|mig-15|trawler|b-25|javelin|barge|blenheim|case puma|
ferrari|ford |gaz-69|man lion|mazda|mercedes|narrowboat|opel|peugeot|pontiac|skot|skp m42|lada|lamborghini|
lotus|mitsubishi|nissan|peterbilt|polaris|tankietka|valentine mark|aston martin|corvette|fiat|fsc lublin|
harley|cigarette 39|motor glider|jaguar|royal enfield|land rover|honda|lexus|subaru|volkswagen|seat ibiza|
mini countryman|mg tf|scooter|kangoo|vehicles|motorsport|race cars|jet ski|steam trains|passingtrains|
fun rides|quadcopter|drone dji|airshow|planes|aircraft|boeing|gondola|chain ferry|
moscow|st petersburg|kamchatka|rwanda|senegal|indonesia|colombia|jersey shore|oregon - lava|new zealand|
ethiopia|bolivia|morocco|mediterrania|inland port|laos|singapore|madrid|berlin|istanbul|scottish|new york|
sonoma|balkan|restaurant|cityscapes|pedestrian|protesting|construction amb|slush|seaside|the beach|the park|
towns & villages|asian countrysides|nature in the city|american public|bali|dubai|hotel|worldwide ambience|
kitchen|household|bathroom|office|books|snacks|eats and drinks|mugs|glassware|bowling|coins|coinage|money|
playing cards|umbrella|zipper|printing press|letterpress|cash register|laundry|sewing|cameras|vhs|tape machine|
cuckoo|singing bowls|crystal glasses|prepared piano|double bass|cymbal|zither|music|
sci-?fi|space|cyborg|spaceship|battlecruiser|futur|alien|galaxy|portals|kosmonaut|hyperdrive|mothership|
ui|ui |interface|casual|8 and 16-bit|video game sfx|infographic|explainer|cartoon|comedy|toy|fart|burp|
party pack|audience|cheer|crowd|we are the people|soldier voices|voice of god|little fighter|
magic|sorcery|medieval|dino|camel|pig|deer|stags|ravens|birds|sea ?monsters|aqua|water|bubbles|hydrology|
seashell|watermill|frying|rain loops|winter textures|snow steps|dry ice|vegetable|vegecide|gym|
ambisonic|quad |5\.0|5\.1|surround|silentscapes|room tones|hvac|fans,|domestic drones|household drones|
wind turbine|windturbines|lawn mower|electric motors|antique|grinders|mills|elevator|filing cabinets|
polystyrene|paper|fishing|marbles|cloth|rustle|sponges|bag foley|closet|haircut|breaths
"""

# Words that make a library worth taking (looked for in the folder name and in every file name of the library).
SIZE_CAP = 260 * 2 ** 20  # single files above this are long surround ambiences: left out


def compile_words(text):
    return re.compile("|".join(p for p in text.replace("
", "").split("|") if p), re.I)


def choose(index_path):
    want, drop, libdrop = compile_words(WANT), compile_words(DROP), compile_words(LIBDROP)
    libs = collections.defaultdict(list)
    for line in open(index_path, encoding="utf-8"):
        year, size, path = line.rstrip("
").split("	", 2)
        if "/" not in path or not path.lower().endswith((".wav", ".aif", ".aiff", ".flac")):
            continue
        libs[year + "/" + path.split("/")[0]].append((year, int(size), path))
    chosen, left = [], []
    for lib, files in sorted(libs.items()):
        name = lib.split("/", 1)[1]
        if libdrop.search(name):
            left.append(lib)
            continue
        hit = want.search(name) or any(want.search(p.split("/", 1)[1]) and not drop.search(p.split("/", 1)[1])
                                       for _, _, p in files)
        if not hit:
            left.append(lib)
            continue
        chosen += [f for f in files if f[1] <= SIZE_CAP]
    return chosen, left


def main():
    index_path, out_path = sys.argv[1], sys.argv[2]
    chosen, left = choose(index_path)
    libs = collections.defaultdict(lambda: [0, 0])
    for year, size, path in chosen:
        k = year + "/" + path.split("/")[0]
        libs[k][0] += size
        libs[k][1] += 1
    with open(out_path, "w", encoding="utf-8") as f:
        for year, size, path in chosen:
            f.write(f"{year}\t{size}\t{path}\n")
    total = sum(s for _, s, _ in chosen)
    print(f"{len(chosen)} files in {len(libs)} libraries, {total / 2 ** 30:.1f} GiB")
    if "--left" in sys.argv:
        print(" | ".join(left))
    if "--show" in sys.argv:
        for k, (s, n) in sorted(libs.items()):
            print(f"{s / 2 ** 20:7.0f} MB {n:4d}  {k}")


if __name__ == "__main__":
    main()
