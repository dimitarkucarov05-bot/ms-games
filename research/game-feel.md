# Game feel for The Motel: what makes arena VR shooters feel great

S8, 2026-11-16. Public sources only (pages, talks, slide decks, reviews). No game files of VEX, Hero Zone or anyone else were opened. Where a claim comes from general craft knowledge and not from a page read for this document, it is marked "(craft)".

The short version: commercial arena shooters do not win on content volume. They win on **rhythm** (tension, peak, relief), on **every event being announced before it happens**, on **three-channel feedback** (sound + haptic + something visible within the same frame), and on a **shared payoff at the end** that the group talks about on the way out. The Motel 3.0 already has most of the content (six enemy types, gates, chest, blackout, barrels, boss). What it lacks is rhythm, announcement and payoff. The priority list at the end is written for S4.

Sound for all of this is delivered: `public/play/assets/sfx/motel/map.json` (event names as in `games/motel/sfx-events.json`, plus the extra events listed in the map's `_added`).

---

## 1. Pacing curves

**What the sources say**

- Left 4 Dead's AI Director tracks an "emotional intensity" per survivor (rises with damage taken, being downed, and enemies dying close by; decays only when nothing is attacking). It cycles four states: **Build Up** (full threat until intensity crosses the peak), **Sustain Peak** (3-5 s more), **Peak Fade** (minimal threat until the fight dies down), **Relax** (30-45 s of almost nothing). Goal in Valve's words: reliable peaks of intensity without overwhelming the team. Bosses ignore the pacing. [Booth, "The AI Systems of Left 4 Dead"](https://cdn.fastly.steamstatic.com/apps/valve/2009/ai_systems_of_l4d_mike_booth.pdf)
- "Structured unpredictability": mobs of 20-30 at random 90-180 s intervals, 75% from behind. (same deck)
- Hero Zone's Dead Ahead: 30 s of preparation, then waves that get faster, 10-12 minutes per level. [herozonevr.com/games](https://www.herozonevr.com/games)
- VEX's Death Squad: an Arcade mode on a timer where the enemies get angrier the longer you stay, and a Survival mode of growing waves. [vex-solutions.com](https://vex-solutions.com/death-squad-is-now-available-on-vex-arena)
- Zero Latency's CEO says the free-roam illusion only fully lands after five to seven minutes. [UploadVR](https://www.uploadvr.com/outbreak-origins-illusion-zero-latency-mastered/) So minute 6-8 is where the strongest moment belongs, not minute 1.
- Horror relies on contrast: Dead Space puts its loudest screech directly after near-silence. [Original Sound Version interview](http://www.originalsoundversion.com/dead-space-sound-design-in-space-no-one-can-hear-interns-scream-they-are-dead-interview/)

**What it means for a 10-minute arena round**

A wave is not "N zombies with gap G". A wave is three beats: **approach** (you hear them, you do not see them: 8-12 s), **fight** (ends in a peak that lasts no more than about 20 s), **release** (silence, music drops to the calm bed, the voice says "clear", 12-15 s to repair and breathe). The session as a whole is a staircase: each peak a little higher, each release a little shorter, with one deliberate dip (the blackout starts silent) before the two biggest peaks (last wave, boss).

The Motel has `heat` (0.75-1.4) that scales wave size per wave. That is slow adaptation. What is missing is the **in-wave** director: when the team is being overwhelmed, stop feeding for a few seconds; when they are bored, send the pack now.

## 2. Enemy variety and telegraphing

- Each L4D special exists to break one habit: the Hunter punishes stragglers, the Smoker pulls tight teams apart, the Boomer punishes shooting everything that moves. [Valve, "Replayable Cooperative Game Design: Left 4 Dead"](https://cdn.fastly.steamstatic.com/apps/valve/2009/GDC2009_ReplayableCooperativeGameDesign_Left4Dead.pdf)
- "Dramatic anticipation": event X implies event Y a few seconds later. The Witch is heard sobbing before she is found; the horde is heard shrieking before it arrives; "many events are preceded by a distinctive piece of music". (same deck)
- DOOM (2016): every demon has a distinct role and silhouette; attacks are rationed with tokens so the player is pressed but never hit from five sides at once; enemies show escalating pain reactions (twitch, falter, stagger). [80.lv, "Cyber Demons: the AI of DOOM"](https://80.lv/articles/cyber-demons-the-ai-of-doom)
- Sandbox VR's zombie titles add a tongue enemy that disables your gun and a weak-point system that punishes spraying. [sandboxvr.com](https://sandboxvr.com/articles/best-sandbox-vr-games) A reviewer of Zero Latency's Outbreak called its enemies "pretty basic", needing little teamwork. [SUPERJUMP](https://superjumpmagazine.com/outbreak-a-vr-zombie-killing-joyride)

**For The Motel.** The roster (walker, runner, creeper, screamer, leaper, digger, brute, boss) is enough. Each one needs (a) **one job**, (b) **its own sound heard 1.5-3 s before it matters**, (c) **one visible tell**. Players in a headset with gunfire around them identify enemies by ear first. Rule: **no enemy may deal its first damage without having made its signature sound at least 1.5 s earlier.** The sound bank has a separate family for each type for exactly this reason.

| Type | Job (habit it breaks) | Audio tell (map event) | Visible tell |
|---|---|---|---|
| walker | pressure on gates | `zombie.idle` | none needed |
| runner / creeper | punishes slow reloads | `zombie.idle.runner` (panting, higher) | hunched, fast |
| screamer | priority target: speeds up the others while alive | `screamer.scream` 1.2 s before the buff | stops, head back |
| leaper | punishes staring at one gate | `leaper.leap` at take-off, `leaper.land` | crouch 0.6 s on the barricade first |
| digger | punishes standing still in the middle | `digger.rise` 2 s before the hand appears, dust | ground cracks, dust |
| brute | forces focus fire | `brute.roar` + lightning, `zombie.step.heavy` | size |
| boss | the exam | `boss.siren`, `stinger.boss`, voice | sign flickers, lights dip |

## 3. Hit feedback: sound layers, haptics, gore and the kids mode

- Meta's haptics guidance: one clear cause per effect, strength matched to the sound, **audio + visual + haptic fired as one event**, pauses between effects, no long overlapping buzz in fast action. Quest 2 controllers are narrow-band (amplitude only); Quest 3 has wide-band actuators that can do sharp clicks. [Meta haptics design guidelines](https://developers.meta.com/horizon/documentation/unity/unity-haptics-design-guidelines/)
- Vlambeer's "Art of Screenshake": a dull shooter becomes a good one through ~30 small additive tweaks (bigger bullets, muzzle flash, impact effects, enemy knock-back, hit pause, permanence of corpses, more bass). [Game Developer summary](https://gamedeveloper.com/design/vlambeer-co-founder-shares-advice-on-building-better-action-games) In VR the camera part is forbidden: Meta's comfort guidance says never move or rotate the user's view. [Meta locomotion comfort](https://developers.meta.com/horizon/resources/locomotion-comfort-usability/) So VR "screenshake" must go into the **world and the hands**: the gun kicks, the light flashes, the enemy jerks, the controller thumps.
- DOOM's staged pain reactions are the model for "my bullets matter": every hit visibly does something. (80.lv, above)
- Family audience: Dead Ahead is rated 6+; VEX markets to kids, teens, families. Arizona Sunshine LB VR is PEGI 18. [herozonevr.com](https://www.herozonevr.com/games), [vex-solutions.com/vex-arena](https://www.vex-solutions.com/vex-arena), [Vertigo Games](https://www.vertigo-games.com/arcade-games/arizona-sunshine-lb-vr-edition/) The developer of Zombie Training Simulator went cartoon and non-gory after tests showed realistic gore was too intense for many arcade customers. [SpringboardVR blog](https://springboardvr.com/blog/zombie-training-simulator-checks-all-the-boxes-for-location-based-vr)

**The hit stack** (all inside the same frame as the server's hit confirmation; the local shot effects must not wait for the server):

1. Shooter's own shot: gun sound (layered, section 4), recoil kick of the model, muzzle flash light 40 ms, haptic on the firing hand.
2. Hit confirm at the shooter's ears, 2D, never spatial: `impact.body` (dull thump) or `impact.head` (higher, wetter). This is the "hit marker" without any drawn marker.
3. At the zombie: flinch (walker: upper body twists away from the shot for 0.15 s; runner: stumbles one step; brute: head snaps only), blood puff (kids: dust puff), and from 3 hits in 1 s a stagger.
4. Kill: `zombie.death` at the zombie, body pushed 0.3-0.6 m along the shot direction, **second haptic tick 60 ms after the shot tick** (a "double tap" means kill; players learn it without being told).
5. Head kill: `impact.headshot` 2D on top, stronger second tick. Normal mode adds `impact.gore` at the head; kids mode plays only the `kids` variants (wood/punch, no wet layer) and the head stays on.
6. Streaks: `player.combo` at 3 kills in 4 s, `player.combo.big` at 5; voice "Nice shot." / "Headshot!" at most once per 25 s.

Haptic table for Quest (amplitude 0-1, ms). Quest 2 cannot do texture, so the difference between events has to be **length and count**, not frequency:

| Event | Hand | Pulse |
|---|---|---|
| pistol / revolver shot | firing | 0.9 for 45 ms / 1.0 for 70 ms |
| smg / lmg round | firing | 0.6 for 22 ms per round (leave at least 25 ms silent between rounds) |
| shotgun / hunting rifle | firing; other hand 0.4 if within 30 cm (two-handed) | 1.0 for 110 ms |
| kill confirm | firing | 0.5 for 20 ms, 60 ms after the shot |
| head kill | firing | 0.8 for 30 ms, 60 ms after the shot |
| dry fire | firing | 0.15 for 15 ms |
| reload: mag out / mag in / rack | that hand | 0.3 for 20 / 0.5 for 30 / 0.7 for 35 ms, on the sounds |
| weapon taken | that hand | 0.7 for 60 ms |
| hammer strike | hammer hand | 0.6 for 28 ms |
| bitten | both | 1.0 for 140 ms |
| heartbeat at low health | both | 0.25 for 40 ms + 0.18 for 40 ms, with `player.heart` |
| boss footstep (within 8 m) | both | 0.2-0.5 by distance for 60 ms |
| barrel explosion (within 6 m) | both | 1.0 for 250 ms, then 0.4 for 200 ms |
| thunder | both | 0.15 for 300 ms |

## 4. Weapon feel

- A gunshot is built from layers: **mechanical** click (sometimes a few ms before the bang), **transient** crack, **body**, **sub** thump around 80 Hz, **tail** (the space; swapped for indoor / outdoor / distance). Small timing offsets between transient and body change how punchy it feels. [Lior Tega, "First person shooter gun sound design"](https://www.liortega.com/post/first-person-shooter-gun-sound-design)
- Half-Life: Alyx's shotgun, as analysed by Road to VR: fewer, bigger reload gestures (two shells per motion), a distinct sound when full, a secondary slide kick in the recoil, a flick to close the breach; the shot is not realistic, it is "deliciously powerful". [Road to VR, Inside XR Design](https://www.roadtovr.com/inside-xr-design-best-shotguns-in-vr-what-makes-them-great-feedback/2/)
- VEX's Death Squad unlocks better weapons as areas open and has a mystery box that gives a random weapon; Sandbox VR hands out a Gatling upgrade and a chain-lightning gun late in the session. [vex-solutions.com](https://vex-solutions.com/death-squad-is-now-available-on-vex-arena), [sandboxvr.com](https://sandboxvr.com/articles/best-sandbox-vr-games)

**For The Motel.** Arena players are first-timers: manual reloads are out, but the **ritual** of a reload must be felt. Keep auto-reload and make it three sounds with three haptic ticks (`gun.reload` is cut as out-pause-in, `gun.loaded` is the rack) and a visible magazine that drops out of the gun and falls to the ground. Each weapon needs its own recoil signature (how far the model kicks, how fast it returns), shells that eject and tinkle (`shell.drop`, `shell.drop.shotgun`), and a clear ladder of power: every new chest must contain one weapon that is obviously louder and stronger than anything before it. The sounds were chosen so that pistol < smg < carbine < rifle < revolver < shotgun < hunting rifle in weight.

Own shots play 2D (in the head, full band). Other players' shots play 3D from their gun at 0.6 gain, so the owner's own gun is always the loudest thing he hears.

## 5. Scripted set pieces

- The strongest moments reviewers remember from free-roam games are not fights: teammates suddenly seen high above on a catwalk, ducking under a doorway, a walkway over a drop, the rescue vehicle arriving while still fighting. [UploadVR](https://www.uploadvr.com/outbreak-origins-illusion-zero-latency-mastered/), [SUPERJUMP](https://superjumpmagazine.com/outbreak-a-vr-zombie-killing-joyride), [Valve deck](https://cdn.fastly.steamstatic.com/apps/valve/2009/GDC2009_ReplayableCooperativeGameDesign_Left4Dead.pdf)
- L4D finales open with the distant shriek of the crowd; anticipation is the set piece. (Valve deck)

The Motel has one location, so its set pieces have to be **events in the sky, the light and the sound**, one per wave, each announced by the voice and each changing how the players must play for 30-60 s:

1. **Prep: the drop-off.** The round opens with the helicopter leaving (`world.heli.away`, wind in the trees, voice "The motel is overrun. Hold the car park until I get back."). It gives the win a face: the helicopter comes back.
2. **Wave 2: the car alarm** (exists: `world.alarm`). Make it the first lesson in listening: the pack comes from where the alarm is, 9 s later.
3. **Wave 3: the fence rattle.** All leapers of the wave shake the fence at one side for 2 s (`fence.rattle`) before the first jumps.
4. **Wave 4: the blackout.** 3 s of full silence first (music out, ambience down 12 dB), then `world.power.off`, then `stinger.blackout`, voice "Power is gone. Flashlights only." Diggers only in this wave. At the end `world.power.on` and the sign buzzing back is the reward.
5. **Last wave: the storm.** Thunder every 6-9 s, rain bed (`ambience.rain`), lightning shows the whole horde at the tree line for one frame before it arrives.
6. **Boss: section 7.**
7. **Win: the pick-up.** `world.heli.in` grows for 10 s, searchlight sweeps the car park, all zombies fall, voice "Get to the chopper!", then the end screen.

## 6. Co-op moments

- L4D: "ensure cooperation is the only winning strategy"; treat the team as the player; being rescued and rescuing are what people remember ("players really enjoy helping each other"); shared scarce resources break the ice between strangers; survivors bark automatically ("Behind you!") so the team feels like a team even when nobody speaks. (Valve deck)
- Dead Ahead's shared job is the barricades; Death Squad's is a shared wallet that opens new areas. [The VR Collective](https://thevrcollective.com/product/dead-ahead/), [vex-solutions.com](https://vex-solutions.com/death-squad-is-now-available-on-vex-arena)

The Motel has gates and revive. Add reasons to **look at each other**:

- **Barks about teammates, with the name**: the announcer voice is positional-free radio, so it can say "Man down! Get to your teammate!" only to the others, and "Right behind you!" only to the player who has a zombie within 2.5 m outside his view cone for over 1 s. These two lines are the highest-value voice lines in the set.
- **Revive is a hero moment**: while reviving, both players get a slow double haptic pulse; on success a bright sting (`player.up`) is heard by the whole team and the voice says "Back on your feet." Score for a revive should equal five kills.
- **Two-player actions**: the last plank of a gate goes in twice as fast with two hammers on it; the ammo crate lid in the final chest needs two hands from two players (optional, later).
- **Covering fire is visible**: when a player nails a gate, zombies at that gate get a faint rim light for the others ("cover him" without text).

## 7. The boss

- L4D bosses "force the survivors to immediately re-evaluate their tactics": the Tank stops forward movement and needs the whole team; it is announced by a music change, distant yells and heavy footfalls before it is seen. (Valve deck)
- DOOM: the bigger the demon, the more it gives back when it dies. (80.lv)
- Sandbox VR builds its souvenir video so that it ends on the final boss moment: the boss is the photograph of the session. [sandboxvr.com](https://sandboxvr.com/articles/dynamic-gameplay-experience)

The Motel's boss (hp 2600, stagger, rage at 40%) is a big zombie that walks in. Make it a three-phase fight of about 90 s:

- **Entrance (10 s, nobody can damage him yet):** all music stops; `boss.siren`; three `zombie.step.heavy` from the dark with rising haptics; the sign flickers; lightning shows the silhouette **behind the motel roof**; voice "Something big is coming."; `stinger.boss`; `boss.roar`; `music.boss` starts on the roar.
- **Phase 1 (100-70%): the gates.** He goes for the strongest gate and tears it off (`gate.smash`). Players learn he staggers when everyone shoots the head.
- **Phase 2 (70-40%): the throw.** He stops outside the fence, lifts a car wreck prop or barrel and throws it into the zone at a marked spot (a 1.2 s red ground flare + rising whoosh `boss.windup`, then `boss.slam`). Players must physically step away. This is the free-roam moment: the arena makes people **move their feet**.
- **Phase 3 (below 40%): rage.** `boss.rage` roar, 6 runners come with him, music gains its top layer (`music.intense` is in the same key and tempo family), he charges one player at a time, always preceded by a 1 s roar toward that player.
- **Weak moments:** each stagger (every 600 dmg x players) drops him to one knee for 3 s with a glowing wound: damage x2. The voice calls it: "Aim for the head!"
- **Death:** 2 s of slow fall, `zombie.death.big`, all other zombies drop, silence for 1 s, then `end.win`. Never cut straight from the last bullet to the score.

## 8. Music intensity layers

- L4D's horde music is three simple stems tied to game state: drums = a horde is attacking, a collage that swells with proximity and number, a figure that answers the players' damage. Simple cues were kept because complex ones lost their meaning. Bright, upbeat material is reserved for positive feedback. [Game Audio Network Guild interview with Mike Morasky](https://www.audiogang.org/interview-with-valves-mike-morasky/)
- Dead Space blends four stereo layers by a fear value fed by "fear emitters" on enemies. (OSV interview, above)

The Motel's `audio.music(layer)` crossfades whole loops: calm, wave, intense, boss. That is horizontal switching, which is enough if the rules for switching are right:

- `calm`: prep and breaks. Almost nothing: a low drone. The night ambience does the work.
- `wave`: starts when the **first zombie reaches a gate**, not when the wave is announced (the approach is carried by groans and the siren alone).
- `intense`: any of: a gate is open; 6+ zombies inside 6 m of any player; any player below 35% health; last 20% of the wave. Hold for at least 8 s (no flapping).
- silence: 2-3 s before every set piece (blackout, boss entrance). Silence is a layer.
- `boss`: from the boss roar to his death.
- Stingers on top (one-shots, never looped): `stinger.wave`, `stinger.blackout`, `stinger.boss`, `stinger.jump` (first digger, first leaper landing behind a player), `riser.10s` in the last 10 s of prep and of each break.

Music gain must sit 10-12 dB under the guns. In an arena the players also hear each other's real voices; that is part of the product.

## 9. The end-of-round payoff

- Sandbox VR generates a personal recap video per group (onboarding, build-up, peak, final boss), plays it in the lounge and sends a link; a reviewer called these trailers the standout. [sandboxvr.com](https://sandboxvr.com/articles/dynamic-gameplay-experience), [World Experience Organization review](https://worldxo.org/sandbox-vr-high-octane-immersive-socialising-that-shoots-scores/)
- Operators: after-game is where the sale of the next game happens; printed individual scorecards made players crowd the printer and raised repeat play; sending a summary by e-mail later is weaker than showing it together now. [The VR Collective](https://thevrcollective.com/elevate-your-virtual-reality-experiences/)
- VEX: global and local leaderboards, a player app with stats, leagues. [vex-solutions.com/vex-arena](https://www.vex-solutions.com/vex-arena) Zero Latency scores individuals on headshots and on dying less. [UploadVR](https://www.uploadvr.com/outbreak-origins-illusion-zero-latency-mastered/)
- Session economics: the average free-roam booking is four tickets; a 12-minute game alone is thin, operators want about an hour of entertainment per visit. [The VR Collective](https://thevrcollective.com/the-vr-time-crunch-crafting-an-experiential-occasion/) The waiting room, the vote and the scorecard are therefore part of the game, not around it.

For The Motel the end has to be **staged**, about 25 s, in this order: victory moment in the world (helicopter light, zombies fall, `end.win`) for 4 s; team score counts up with a tick per step (`score.tick`) and a hit on the final number (`score.final`); rank vs. the venue record ("3rd tonight", "NEW RECORD" with `score.record`); then **one award per player**, revealed one by one with a hit (`award.reveal`): everyone gets one, none is negative. Then the scorecard is printed while they take the headsets off.

Awards from data the rules already keep (`kills, headshots, shots, hits, boards, downs, revives`): Sharpshooter (best accuracy), Headhunter (most head kills), Carpenter (most planks), Medic (most revives), Last One Standing (fewest downs), Bodyguard (most kills within 3 m of a teammate), Demolition (barrel kills), Boss Slayer (most boss damage), Butcher (melee kills). Pick so that each player gets a different one.

## 10. What operators say sells

- Hero Zone: players understand a game "within a minute", staff training takes minutes, sessions run unattended. [herozonevr.com](https://www.herozonevr.com/) The first 60 s of The Motel must teach by doing: pick up, shoot, hammer, each confirmed by the voice.
- VEX adjusts game time from 5 minutes to an hour and markets to all ages. [vex-solutions.com/vex-arena](https://www.vex-solutions.com/vex-arena) The Motel has cuts, kids mode and no-fail respawn already.
- Onboarding friction outside the headset (a long waiver before a short game) is named as a mood killer. [The VR Collective](https://thevrcollective.com/elevate-your-virtual-reality-experiences/)

---

## Prioritised changes for The Motel (for S4)

Ordered by effect per hour of work. "Rules" = `game/motel.js`, "client" = `public/play/games/motel/*`. Sound events named here exist in `sfx/motel/map.json` unless marked (new, in map). Every item needs sound + haptic + visible effect before it counts as done (owner rule).

**P1. Hit stack and kill confirm** (client: `scene.js`, `weapons.js`, `zombies.js`, `fx.js`). Implement section 3 exactly: local shot effects without waiting for the server; on the server's hit: 2D `impact.body` / `impact.head`; flinch per type; on kill the second haptic tick 60 ms after the shot (0.5/20 ms, head 0.8/30 ms), `zombie.death` at the body, push the body 0.3-0.6 m along the shot; on head kill `impact.headshot` (kids variants in kids mode) and in normal mode `impact.gore`. Use the haptic table of section 3 for every weapon (replace `feel.hap` values).

**P2. Wave = approach, fight, release** (rules + client). (a) Approach: for the first 8-12 s of a wave zombies are heard, not seen: play `zombie.idle` from the lanes at 0.5 gain every 1.5-2.5 s from the moment `prime()` starts them; `wave.start` when the first is 12 m out. (b) Release: after the last kill 1.5 s of nothing, then `wave.clear` + voice `wave_clear_a/b/c`, music to `calm`, break of at least 12 s. (c) `riser.10s` 10 s before the break ends, voice `prep_10` at 10 s in the prep.

**P3. In-wave director** (rules). Keep a team intensity `I` in 0..1: +0.12 per bite on a player, +0.25 per down, +0.03 per kill within 4 m of a player, +0.08 per plank lost, decay 0.04/s when no zombie is within 5 m of any player. Spawner: while `I > 0.8` hold new spawns (max 6 s, never during the boss); when `I < 0.25` for 6 s and the wave has zombies left, release the next 4 as one pack from the side with the fewest players looking at it (use head yaw). Put `I` in the snapshot (`heat2`) so the client can drive music.

**P4. Telegraph every special** (rules + client). Enforce "signature sound at least 1.5 s before first damage": screamer stops and plays `screamer.scream` 1.2 s before the buff applies; leaper perches 0.6 s on the barricade with `leaper.leap` on take-off; digger plays `digger.rise` + dust 2 s before emerging and never within 1.5 m of a player; brute `brute.roar` at 14 m; all leapers of a wave share one `fence.rattle` (new, in map) 2 s before the first jump. Attack tokens: at most 2 zombies may be in their attack swing against the same player at once (3 on Hard, 4 on Nightmare); the others circle or bash the nearest gate post.

**P5. Announcer voice** (client: `scene.js`, `audio.js`). Play `voice.<id>` (map: 64 lines; the radio-band version `voice.radio.<id>` is in the map's `alternatives`), 2D, one line at a time with a queue of 1, minimum 4 s between lines, priority: boss/blackout/gate_down > down/behind > wave lines > praise. Triggers: `behind` (zombie within 2.5 m, outside a 100 degree view cone for over 1 s, at most every 20 s per player, only to that player); `down` to the others when a teammate goes down; `gate_down` on `breach`; `gate_hit` on the first `bang` of a wave at a gate with 2 planks or fewer; `reload` on dry fire with ammo in reserve; `low_ammo` at 20% of the last magazine; `wave_n`, `wave_clear_*`, `blackout`, `power_back`, `boss_in`, `boss_seen`, `boss_rage`, `boss_dead`, `five_min/two_min/one_min` from the clock; `nice_shot`/`headshot`/`teamwork` at most once per 25 s. Lower music 6 dB while a line plays. Wrap radio lines in `radio.open` / `radio.close` (new, in map) if the radio set is used.

**P6. Music rules and silence** (client). Switch layers by the rules in section 8 (wave music starts at first gate contact, `intense` by gate open / crowd / low health / `I > 0.7`, 8 s hold, 2-3 s silence before blackout and boss). Stingers `stinger.wave`, `stinger.blackout`, `stinger.boss`, `stinger.jump` (new, in map). Start `ambience.night` at load; add `ambience.rain` (new, in map) for the last wave.

**P7. Boss in three phases** (rules + client). Section 7: 10 s entrance with silence, steps, lightning silhouette; phase 2 throw with a ground marker 1.2 s before impact (`boss.windup`, `boss.slam`, new, in map), damage only inside a 1.6 m radius so stepping away works; rage at 40% with 6 runners; knee-down weak moment after each stagger (3 s, damage x2); 2 s death fall, 1 s silence, then `end.win`.

**P8. Weapon ritual** (client: `weapons.js`). Reload = `gun.reload` (mag out at 0 s, in at about 0.9 s) + `gun.loaded`, with the three haptic ticks and a magazine mesh dropping from the gun; shells eject on every shot of pistol/smg/rifles (pool of 12 instanced shells, `shell.drop` 0.35-0.5 s later at the floor, cooldown 80 ms), shotgun `shell.drop.shotgun`; per-weapon recoil: pistol 6 degrees up / 60 ms return, smg 2.5 / 40, rifle 3.5 / 55, revolver 11 / 140, shotgun 14 / 220 with 3 cm push back, hunting 16 / 300. Other players' shots 3D at 0.6 gain; own shots 2D. The last 3 rounds of a magazine play 6% higher pitch each (players learn "almost empty" by ear; (craft)).

**P9. Staged ending with awards** (rules `results()` + client `hud.js`). Add to each player's `extra`: `accuracy, headshots, boards, revives, nearKills, barrelKills, meleeKills, bossDamage`, and `award: {id, name}` chosen so that every player gets a different positive award (list in section 9). Client: the 25 s sequence of section 9 with `score.tick`, `score.final`, `score.record`, `award.reveal` (new, in map); send the award to the scorecard.

**P10. Opening and closing set pieces** (client `world.js`, `scene.js`). Prep opens with `world.heli.away` + voice `tent_brief`; win closes with `world.heli.in` for 10 s, a searchlight sweeping the zone, voice `win_2`. Blackout: 3 s silence, `world.power.off`, `stinger.blackout`, voice `blackout`; power back with `world.power.on` and the sign flickering on.

**P11. Teach in the first 60 s by doing** (client). Prep script: 0 s voice `prep_weapons`, the chest opens (`chest.open`) with a light on it; when every player holds a gun: voice `prep_gates`, one gate loses a plank audibly (`gate.crack`) so there is something to fix; at 10 s `prep_10` + `riser.10s`. Two slow walkers come alone 5 s before wave 1 as targets (first kill within the first minute for everyone).

**P12. Co-op hooks** (rules + client). Revive: slow double pulse on both players while reviving, `player.up` heard by all, revive scores as 5 kills; two hammers on one gate nail at 1.8x; teammate at a gate under attack gets a rim light on his attackers for the others.

**P13. Environment reacts to the fight** (client; (craft)). Barrel fires flare on nearby explosions; neon sign flickers on every brute/boss step within 10 m; a bullet that misses and hits props plays `bullet.impact.metal` / `bullet.impact.wood` (new, in map) at the hit point with a spark, cooldown 60 ms; lightning within 0.3 s lights the scene and thunder (`world.thunder`) follows 0.8-2.5 s later with the weak both-hands rumble.

**P14. Kids mode sound** (client). Every event that has `kids` files in the map already switches by `setSoft`; additionally drop `impact.gore`, `screamer.scream` gain x0.5, replace `stinger.jump` by nothing, keep music on `calm`/`wave` only (never `intense`) and skip the 3 s blackout silence (go straight to flashlights).

### Not verified
Nothing in this document was tried in a headset. The sound files were chosen by library, file name and measured level and length; they were not listened to (this session has no ears), so each family needs one listening pass by a person.
