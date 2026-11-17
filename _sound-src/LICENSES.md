# Sound sources and licences (vr-arena/_sound-src)

S8, 2026-11-16. Everything here was downloaded without an account, a payment or a click-through agreement.
Nothing comes from VEX, Hero Zone or any other game. The curated game files are in
`lobby-stage/public/play/assets/sfx/{motel,lobby}`; each of those folders has a `SOURCES.tsv` naming the source
recording and the seconds used for every file.

| Folder | What | Licence | Credit needed | Commercial use in a game |
|---|---|---|---|---|
| `sonniss-gdc/<year>/` | Sonniss.com #GameAudioGDC bundles 2015-2020, 735 files of about 190 chosen libraries (3.2 GB), fetched file by file from the official Your.Org mirror (`ftpmirror.your.org/pub/misc/sonniss*`, linked from sonniss.com/gameaudiogdc) | Sonniss GDC bundle licence: royalty-free, commercial use, unlimited projects. Text: `sonniss-gdc/<year>/LICENSE - *.pdf` (2016-2020), `sonniss-gdc/2015/LICENSE - sonniss - please read.txt`; current wording at sonniss.com/gdc-bundle-license | No | Yes |
| `2015/ 2016/ 2017/ 2018/` (top level) | 15 files of the same Sonniss bundles that S3 fetched earlier for the waiting room | the same Sonniss licence (texts in `sonniss-gdc/<year>/`) | No | Yes |
| `kenney/` | Kenney.nl: Impact Sounds, Interface Sounds, UI Audio, RPG Audio (334 files, 7 MB) | Creative Commons Zero (CC0 1.0). Text: `kenney/<pack>/License.txt` | No (optional) | Yes |
| `incompetech/` | 8 music tracks by Kevin MacLeod (55 MB) | CC BY 4.0. Text and credit lines: `incompetech/LICENSE.txt` | **Yes, on a credits screen** | Yes, with the credit |
| (not a download) voice lines | RAVEN announcer, made offline with Kokoro-82M in `vr-arena/_voice-tool` (`_sound-src/_tools/voice_render.py`) | Kokoro-82M model and voices: Apache 2.0; the generated audio is ours to use | No | Yes |

## What the Sonniss licence allows and forbids (their page, read 2026-11-16)

- Allowed: use and modify the sounds in personal and commercial projects, on an unlimited number of projects, without
  attribution; share the files inside the team that builds the project.
- Forbidden: handing out or selling the sounds as sounds (a sound pack, a library), claiming authorship of the
  recordings, and using them to train AI. A game that plays them is fine. Do not publish `_sound-src` itself.

## Used by the default sound bank

Only Sonniss and Kenney recordings and the Kokoro voice: **no credit is required anywhere**.
The Kevin MacLeod tracks are only in the `alternatives` block of `sfx/motel/map.json` (`*.ccby`). If they are switched
on, these lines must be shown on a credits screen (launcher About page or the end of the scorecard page):

    "Gathering Darkness", "Unseen Horrors", "Volatile Reaction", "Killers", "Heroic Age"
    Kevin MacLeod (incompetech.com)
    Licensed under Creative Commons: By Attribution 4.0
    https://creativecommons.org/licenses/by/4.0/

## Not fetched: needs the owner

- **Sonniss GDC bundles 2021-2024**: on sonniss.com/gameaudiogdc as whole archives of 20-40 GB each (no per-file
  mirror); same licence. Worth it only if a listening pass finds gaps.
- **Freesound.org** (CC0 and CC BY recordings, the best source for a real car alarm, single brass casings on concrete
  and more zombie voices): downloads need a free account.
- **Pixabay / Mixkit / Zapsplat sound effects**: free for commercial use, but their terms are click-through and
  Zapsplat needs an account.
- **Paid, if the owner wants the commercial-arena level of gun and creature sound**: BOOM Library (Zombies, Guns),
  Soundmorph, A Sound Effect bundles; or a composer for a layered score. Music is the weakest part of what free
  libraries offer: the default beds are drones and pulses, not a score.
- 28 files of the 2019 Sonniss bundle (the "Sound Spark LLC" folders) could not be fetched: the mirror serves their
  folder names in a broken encoding.

## Rebuilding

    python _tools/fetch_sonniss.py      # libraries listed in LIBS, from _index/sonniss-mirror-files.tsv
    python _tools/probe_all.py          # _index/probe.tsv: length and takes of every file
    python _tools/curate.py             # cuts everything, writes SOURCES.tsv
    python _tools/build_maps.py         # sfx/motel/map.json, sfx/lobby/hooks.json
    ..\_voice-tool\venv\Scripts\python.exe _tools/voice_render.py --no-check   # voice lines (lobby/tools/voice/lines.json)

Needs Python with numpy and imageio-ffmpeg (ffmpeg is not installed system-wide on this PC; the tools use the
binary that imageio-ffmpeg ships).
