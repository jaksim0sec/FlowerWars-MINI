# Tactical terrain: M1–M5 implementation and measured limits

Baseline: `94666f4`. The map remains 144×112, with the existing army limit, combat, role data, movement speeds, navigation engine and order APIs. The 2.5D projection is unchanged.

## Generation order and tactical structures

`battlefield-plan.mjs` first creates a small tactical graph in world coordinates:

- Two deployment grounds, two main routes into a central battle basin.
- Two independently defined outer flank centerlines.
- Four flank-to-center entries with merge aprons.
- Four rear counterattack connections, between the home headlands and forward defensive banks.
- Eight explicit defensive banks: four curved forward bodies and four shorter gate headlands. Their IDs retain team, side and purpose. Independent seeded bends, widths and shore noise vary their forms.

The plan reserves the entire corridor and room footprints before placing impassable terrain. Defensive shorelines cannot close these reservations. The coastline is fitted afterwards, with a three-cell setback around reserved footprints; tests check at least two clear cells beyond sampled flank edges. Thus the route is no longer the incidental gap between a random coast and a random lake.

| Space | Declared width / room size |
| --- | --- |
| Main approach | 16 tiles |
| Flank route | 7 tiles |
| Side entry / rear counterattack connection | 6 tiles |
| Main staging room | 9–10 tile radii |
| Flank staging room | 6 tile radius |
| Side-entry merge apron | 7 tile radius |
| Counterattack merge apron | 5 tile radius |
| Central battle basin | 25×25 tile radii |

Paths use rounded corners, with a declared minimum turn radius of three tiles. Normal cross-sections and sampled heading changes are tested across 32 seeds. A 0.71-tile raster allowance prevents rounding from shaving off the stated corridor width. Staging and merge rooms are reserved as whole areas, not just reachable points. Wider rooms are intentional; narrow transit sections retain the small-force role of the flank.

These structures reproduce the reference's *relationships*: restricted sorties, front/basin, a separate outside approach, lateral entry and rear interception. They do not certify pixel-for-pixel visual agreement with the drawing.

## Existing asset use

Grass, soil and pond retain the required global `1 + (x % 5) + 5 * (y % 2)` phase. Soil adds irregular worn areas around the main staging grounds; soil has the same movement multiplier as grass. No road speed or collision rule changed.

All nine supplied decoration types are packed losslessly into one additional atlas. Placement is deterministic, sparse and terrain-specific: pond details remain on blocked water, small plants/leaves/twigs on ground. A two-cell exclusion around reserved tactical spaces keeps them visually clear. Decorations do not change occupancy or navigation.

Decorations are culled and baked with the terrain into the existing viewport cache. Repeated unchanged frames still perform one cached terrain copy, with no new per-soldier or per-frame placement work. Native source files remain in GitHub; offline prefetch uses the packed files.

## Actual movement comparison

The committed fixtures contain identical starting footprints, roles, counts and target coordinates for both versions. They use cells valid in both maps, with an access gap between main/merge destination formations. The shared-valid-cell restriction is useful for comparison but does not cover every possible deployment in either map.

Each scenario runs three seeds (7, 29, 73), 180 simulated seconds at 20 updates/s, using real `placeGroup`, `orderSquad`, `Board.update` and `updateSquadOrders`. The main force uses mixed squads; small-force scenarios use six-member assault squads, retaining their movement characteristics. Opposing traffic is **same-team** cooperative traffic, not enemies passing through each other. There is no custom mover, teleportation, terrain restriction policy or new pathfinding algorithm in the harness.

| Scenario | Median troop passage p95, before → after | Sum of idle/unarrived troop-seconds, before → after |
| --- | --- | --- |
| Main force, 350 | 87.10 → 64.55 s | 66,247.65 → 59,554.05 |
| Flank, 24 | 29.00 → 27.80 s | 904.05 → 522.20 |
| Opposing traffic, 48 | 52.05 → 52.50 s | 3,318.20 → 2,577.75 |
| Two-sided merge, 96 | 30.90 → 26.95 s | 2,987.10 → 2,411.85 |

All soldiers crossed the measured passage in all 12 cases, with zero occupancy/reservation collisions and no expansion-budget violation. The 24-, 48- and 96-soldier cases also finished all exact formation goals by the end of their runs.

**Passage is not final formation completion.** At 180 seconds the 350-soldier exact-seat totals were 327/221/217 before and 294/233/231 after. Seed 7 therefore regresses in final settlement despite faster passage; some squads continue circulating around their final seats. The sum of idle time decreases, but maximum wait does not improve in every case. Opposing passage p95 is slightly worse in the median and in two individual seeds. These remain open limits; universal decongestion and full completion are not established.

Full timelines, waits, CPU costs, expansions and counts are in [the raw comparison](measurements/battlefield-traffic-comparison.json). CPU measurements are single timed runs per seed in a container, descriptive rather than a statistical performance guarantee.

## Rendering and regressions

A separate Chromium run uses the same 350-soldier seed-73 fixture and real character rendering, with 30 warm-up frames and 120 measured frames. Baseline and current run sequentially without a network listener, via intercepted local file requests.

- FPS: 60.00 → 59.02. Frame CPU p95 (including model/order updates): 12.9 → 13.6 ms. No FPS improvement is claimed.
- Terrain: one cache build, one cached image copy per unchanged frame, 6,361,344-byte viewport backing canvas in both versions. Current view bakes 32 decorations.
- No browser page errors. Source texture phase and material-boundary tests remain passing.
- Focused terrain tests: **11 passed**. The 32-seed checks cover reserved widths, curvature, room clearance, defensive bodies, decor exclusion, actual bot placement of all 350 troops, connectivity and void rejection.
- Full existing suite: baseline 270 tests / 243 passed / 27 failed; current 272 / 247 / 25. No newly failing test names. Existing failures remain, so the complete suite is **not green**. One preparation test was corrected from a hardcoded x=60 target (now friendly territory) to a genuine enemy-territory target; its rejection assertion remains intact.

Actual Canvas overview: [seed 73](measurements/battlefield-overview.png). Geometry, assets and regression checks are implemented; final-seat settlement and consistently faster opposing traffic are not complete.

## Reproduction

```sh
mkdir -p /tmp/flower-terrain-before
git archive 94666f4 | tar -x -C /tmp/flower-terrain-before
BASELINE_ROOT=/tmp/flower-terrain-before node scripts/battlefield-traffic.mjs --fixtures
FLOWER_ROOT=/tmp/flower-terrain-before node scripts/battlefield-traffic.mjs
node scripts/battlefield-traffic.mjs
FLOWER_ROOT=/tmp/flower-terrain-before python3 tests/battlefield-performance-browser.py
python3 tests/battlefield-performance-browser.py
node --test --test-isolation=none tests/*.test.mjs
```

The traffic harness fails on incomplete passage, collisions, budget excess, or incomplete final arrival in the small-force/merge cases. It deliberately reports rather than hides the known main-force final-settlement deficit.
