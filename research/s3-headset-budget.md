# S3 headset: frame budget per state (desktop page, to repeat on a Quest)

How to measure (any page, desktop or Quest through `chrome://inspect` → the headset tab → Console):

```js
__arena.budget()
// { state: 'hub'|'vote'|'intro'|'loading'|'game', calls, tris, lights, shadowLights, meshes, geometries, textures, programs, fps, inVR, build }
```

`calls` and `tris` are the last rendered frame. In VR three.js renders both eyes in that frame, so on a Quest
expect about twice the desktop numbers unless multiview is on. `lights` counts the visible lights every lit
material pays for (hemisphere included); `fps` is the page's own counter (0 on the desktop page while the pane is hidden).

Budget we aim at on Quest 2 (72-90 fps): under ~100 draw calls and ~150k triangles per eye in the lobby states,
at most 1 shadow-casting light, at most ~6 lights.

## Desktop measurements (BUILD 43, 2026-11-16, dev server with S2's engine, real zone of data-dev-s3)

| State | calls | tris | lights | shadow lights | meshes | programs | notes |
|---|---|---|---|---|---|---|---|
| hub (idle, first load) | 22 | 26.6k | 6* | 0 | 36 | 5 | station shell merged per material; range + displays + mark |
| hub + vote (4 crates with kits) | 32 | 28.0k | 6* | 0 | 73 | 7 | crates and weapons are separate meshes (not merged) |
| Motel intro (night camp) | 33 | 28.2k | 6 | 1 | 145 | 7 | fire point light casts the only shadow, map rendered once |
| game (The Motel, desktop map) | 156 | 468k | 12 | 1 | 185 | 38 | S4's world: the Quest uses motel-lite.bin, measure there |

\* counted while the intro camp was being built hidden; see the back-in-hub row below for the clean hub count.

| hub, back after a full game | 29 | 27.4k | 5 | 0 | 38 | 38 | lights: hemisphere, 3 spots (zone pool, portal, range), the range's hit flash |

Observation for the Quest: after one game `renderer.info.memory.textures` is 177 against 11 before it (geometries 52
against 17). Part of it is the shared asset cache on purpose (the next game loads faster), but if a Quest 2 runs low on
memory after a few rounds, check that The Motel's dispose frees its own textures (S4).

## Flow verified against S2's server (dev server 47933, 2026-11-16)

Party with one game (difficulty vote): `flow/open party` → `party/start` → lobby → vote (How hard is round 1?) → my vote
counted by the server (normal: 1) → voteEnd → countdown 3 (gameId motel) → the headset goes through the portal into the
night camp, the gate opens on GO → gameStart → S7's loading module → playing. Quick Play (10 min cut, the server clamps
minutes to the cuts) ran to the end on the server: results (team, score, rank 1, new record, player row) shown for 20 s →
stop → endMessage remove → lobby → back in the hub, the board shows the new score. Shots: research/shots/s3/60-64.

## What to check on the Quest

1. Hub idle and hub + vote: `__arena.budget()` in each, and the fps counter over 20 s.
2. The countdown into the intro (light count changes from the hub set to the camp set: one shader recompile in the dark of the fade; watch for a hitch).
3. The game itself (S4).

## The Motel (S4, 2026-11-16, game version 3.2.0 + leak and budget fixes)

Measured on the desktop page of dev server 47934 with `?lite=1`, which makes `world.js` use the Quest map (`motel-lite.bin`,
fewer props, no muzzle light, no blast or alarm light, no searchlight). Fast rounds, the page's aim bot alternating
with the camera turning a full circle so every side of the map is drawn; `__arena.budget()` sampled every 200 ms.
Per-eye numbers: in VR without multiview the calls are about doubled.

| State (lite map) | calls p50 / p90 / max | tris p50 / max | lights max | shadow lights |
|---|---|---|---|---|
| before the fixes, waves 1-3 | 78 / 112 / 172 | 141k / 249k | 6 (9 with the camp, see below) | 1 (camp) |
| after the fixes, waves 1-3 | 72 / 87 / 92 | 135k / 238k | 6 | 0 |
| after the fixes, boss with runners | 75 / 87 / 96 | 151k / 247k | 6 | 0 |

Lights in the game on the lite map: sign neon, two barrel fires, the flashlight (4 dynamic) plus the hemisphere and the
moon. No Motel light casts a shadow on the Quest. The whole lite world is 348k triangles; frustum culling keeps the view
at or under 250k. Desktop map for comparison (not the Quest): 186-195 calls, 554-668k triangles, 12 lights.

What changed:
- Effect shards (blood, dust, dirt, sparks) and shell casings were one mesh each; a single burst added 10-15 draw calls.
  They are now one InstancedMesh per kind (`fx.js`): 6 calls at most for every particle in the game.
- Weapons lying by the chest were their separate parts twice (gun plus a flattened shadow copy); each is now merged into
  one mesh per material plus one shadow mesh (`chest.js`), 2-3 calls per weapon instead of about 10.
- The win searchlight is PC only (on the Quest it would be a fifth light and recompile shaders at the very end).

Biggest remaining items: the world (45-51 calls in view: baked map chunks, merged props, instanced planks), up to 14
zombies plus the boss and up to 5 corpses (one call each), other players' bodies and guns. Worst case with 6 players
is estimated at about 115 calls; not measured with real players.

**For S3:** the intro camp (`mini-lobby`) stays visible during the game in some runs: its fire point light (which casts the
only shadow, a 6-face cube map), and two spot lights add 3 lights and 1 shadow to the game's budget (seen as 9 lights
in the game state). Hiding the camp root during the game removes them.

### Memory after a game (leak fix)

`scene.dispose()` now collects everything under the game root plus the off-graph models (zombie body pool, weapon
prototypes) and frees every geometry, material, texture, skeleton bone texture and light shadow. Shared asset-cache
textures are only released from the GPU (three.js uploads them again if the hub uses them). The audio bank is cleared
and streamed music elements are released.

| Moment | textures | geometries | programs |
|---|---|---|---|
| hub, before any game | 14 | 36 | 10 |
| hub after 1 game, before the fix | 73 | 83 | 90 |
| hub after round 1 / 2 / 3, after the fix (desktop map) | 24 / 24 / 24 | 53 / 53 / 53 | 85 / 124 / 124 |
| hub after rounds on the lite map (2 / 3) | 26 / 26 | 54 / 54 | 118 / 122 |

Textures and geometries return to the same level after every round (no growth). The step from the very first hub
(14 -> 24) is what stays cached outside the game: the intro camp props and its fire shadow cube, the loading card
(`cover.jpg`), two canvases. Shader programs drift by a few per round (materials of the hub and camp compiled under
another light set); they are not textures or buffers.
