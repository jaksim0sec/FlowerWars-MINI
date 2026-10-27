# Navigation follow-up: remaining congestion and CPU cost

Comparison baseline: `72a033e`. Measurements use the same existing seed-73 100×100 multi-gate fixture, unchanged speeds and goals, 120 simulated seconds and the existing 2,048-expansion budget. Before/after runs alternate three times; movement/arrival/wait/expansion results matched exactly across repeated runs of each version. CPU values below are medians, not single best samples.

## Applied changes

- Failed occupancy searches remember up to 32 blocking actors and the exact guide. Unchanged, fixed blockades reuse the negative result. Actor movement, reservation completion, death, changed guides or terrain invalidate it. A truncated dependency set expires after one second; truncated 8,192-cell searches are never treated as a complete proof. Movable formation blockers are not cached as immutable obstacles.
- Static A* uses a stable binary heap with the same f / descending-g / FIFO ordering. Walkable neighbor data is cached lazily by obstacle revision in bounded typed arrays. Exact static paths use an LRU limited to 128 paths / 65,536 cells, including source, destination, direction and topology in the key. Returned guides are independent copies; pressure-weighted searches do not reuse static results.
- The route-progress lookup is reused while its guide identity and length are unchanged. Formation settlement indexes are reused and validated against membership, map changes and in-place coordinate edits. Other squads goals are only gathered when an actual foreign stationary occupant needs a replacement seat.
- A completed remote opening can extend its existing cooperation to an approach blocker instead of falsely reporting success and leaving the requester waiting. A requester awaiting its own opening cannot become a helper in a second chain.
- Same-kind vacancy relays now also run during ordinary arrival, at most every 0.2 simulated seconds. A short handoff lets a nearby soldier wait for the vacated cell instead of circling; farther soldiers may still approach concurrently. Commander seats, explicit held troops, strikes and courtesy participants are protected.
- A fortification does not lock its first arrivals before the rest can enter. Holding begins when the full formation is ready. Explicit hold/wait orders keep their original protection.
- Moving immediately after choosing a formation uses the intended reform footprint, not the still-unformed physical positions. Incomplete footprints without a commander anchor safely fall back to current positions.

Existing Board, Navigation, beginStep, reservations and command APIs remain. No movement speeds, troop stats, attack/healing values, dependencies, workers or external algorithms were changed/added.

## Model results

Wait is total stationary, not-yet-arrived troop-seconds, including commandless displaced actors. CPU excludes measurement/invariant overhead. Every before/after run had zero collisions/reservation inconsistencies, and expansion maxima stayed within 2,048 per budget interval.

| Orders | Troops | Arrived before → after | Stationary seconds before → after | CPU median ms before → after | CPU change |
|---|---:|---:|---:|---:|---:|
| individual | 64 | 53 → 56 | 1438.5 → 1326.2 | 293.0 → 279.5 | -4.6% |
| individual | 256 | 141 → 146 | 12151.5 → 11995.5 | 858.0 → 824.6 | -3.9% |
| individual | 700 | 168 → 175 | 57440.1 → 56617.4 | 1536.0 → 1437.1 | -6.4% |
| squads | 64 | 62 → 64 | 1111.5 → 1152.5 | 313.5 → 271.0 | -13.6% |
| squads | 256 | 194 → 211 | 7884.4 → 7374.6 | 1355.0 → 1089.6 | -19.6% |
| squads | 700 | 475 → 524 | 28424.8 → 25239.7 | 3672.7 → 3374.5 | -8.1% |

The 700-person squad case improves arrivals from **475 to 524** (+10.3%), aggregate stationary time by **11.2%**, and model CPU by **8.1%**. Individual movement CPU falls approximately **4–6%**, and squad CPU approximately **8–20%** in these three-run medians.

Remaining limits: 64-person squads now all arrive, but their cumulative stationary time rises **3.7%** (1111.45 → 1152.45). The 700-person test still has 176 actors not in their final seats at 120 seconds. This is a measured improvement, not a claim that all traffic jams are solved or that every map/crowd improves. Approximate neighborhood route sharing was excluded after it worsened arrival throughput; reuse in this patch requires exact static route conditions.

## Browser verification

Same headless Chromium / 1000×760 / DPR 1 harness as the previous report, 30 warm-up plus 150 measured frames, real character and terrain rendering, 0.05-second model slices. A single rendered run per size; this is not a mobile hardware guarantee.

| Troops | FPS before → after | Frame CPU p95 ms before → after |
|---:|---:|---:|
| 64 | 60.0 → 60.0 | 1.0 → 0.9 |
| 256 | 60.0 → 60.0 | 2.1 → 2.0 |
| 700 | 60.0 → 60.0 | 4.2 → 4.0 |

FPS remains near the 60 FPS ceiling; no FPS increase is claimed. Raw samples, repeated model CPU timings, 90-second checkpoints and all remaining failures are stored in `measurements/navigation-followup.json`.

## Tests

Before: **242/258 passed, 16 failed**. After: **256/268 passed, 12 failed**, with no new failures and no old assertions weakened or removed. Ten tests were added for quiet-search reuse/reopening, stable frontier ordering, route copy/invalidation/directional reuse, settlement-cache invalidation, lazy claims, local vacancy handoffs, extending/cycle-proofing cooperation and incomplete reform replacement. Existing collision, same-team-only cooperation, held/casting protection, speed/charge/poise, healing, formation, 1,000-person crossing and deterministic tests were rerun.

Previously failing assertions now passing:

- edge destinations leave access around the formation until every member arrives
- shared destination has one occupant; other commands wait without overlap
- square formation surrounds its commander and assigns distinct valid seats to every role
- the commander receives a safer rear target even when the formation is dense

The following pre-existing failures remain. Several assert earlier balance values, caps, timing or command behavior. They are still reported as failures, not dismissed or changed to manufacture a green suite:

- a real ranged actor acquires an interpolating target across a bucket boundary
- a vertical advance places the commander behind the front instead of beside it
- an isolated long move follows a shortest route without a traffic lane detour
- automatic armies obey the 200 cap and deploy on their own half
- full bot operations pair frontline, firepower and healing in one lane
- healers restore injured allies, respect cooldown and never damage enemies
- home defense intercepts intruders without recalling a distant attack operation
- injury changes neither movement duration nor attack damage
- manual placement spends reserves atomically and rejects overlaps and enemy territory
- squad destinations on a large map start without serial full-map distance fields
- step timing remains exact and simulation does not depend on a renderer
- visible test classes have independent configured health, damage and attack speed

## Reproduce

```sh
FLOWER_ROOT=/path/to/72a033e node scripts/navigation-benchmark.mjs
node scripts/navigation-benchmark.mjs
BASE_URL=http://127.0.0.1:PORT python3 tests/navigation-performance-browser.py
node --test --test-isolation=none tests/*.test.mjs
```
