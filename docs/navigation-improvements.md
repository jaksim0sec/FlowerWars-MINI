# Team identification and navigation changes

Historical results for `72a033e`. See [the follow-up report](navigation-followup.md) for subsequent fixes and measurements.

## Scope and safeguards

Close views use blue allied / red hostile filled feet markers and small head dots. Below scale 0.22 these individual team markers disappear; each living squad gets one solid team-color flag. The old translucent army-center flags are removed. Flag centers are cached for 0.2 simulated seconds and culled by the viewport. Selected squads retain a gold flag outline.

No combat values, troop data, movement speeds, attack/healing timing, orders or dependencies were changed. Board / Navigation / beginStep and single-step reservations remain the movement engine.

- Cooperative requests try local avoidance first, then bounded same-team vacancy chains (priority inheritance / backtracking inspired, not a claim of complete PIBT). Search is limited to depth 5 / 32 visited actors and the existing 2,048-expansion shared budget; at most 16 chains are active. Tail actors finish their real steps before a predecessor enters. Priority age is inherited from the blocked requester; existing seeded tie-breaking and rotating scheduling remain.
- Courtesy destinations are temporary state, never replacement player commands. Explicit hold/stop, attacking, casting, moving, hostile and dead actors cannot be pushed. An unrelated actor already at a completed destination is treated as an anchor; an owning formation can open/restores its own seats through the coordinated path.
- Temporary displacement, cancel, hit, death, condition hooks and commit-time races revalidate commands, ownership and reservations. Standalone helpers retain their return destination, including same-team cyclic returns. Formation helpers restore through the formation order, avoiding a duplicate return controller.
- Local congestion summaries are invalidated only around source/destination changes. Crowded local forks use congestion ordering; a persistent direct-route stall can trigger weighted reevaluation, rate-limited to once per 10 simulated seconds per actor. Static fields still share the existing bounded cache.
- A squad caches its long static trunk per march and obstacle revision. Valid translated trunks preserve the formation footprint; blocked offsets use short local entry/exit routes around the shared trunk. The original per-role goals are restored after the choke.
- The previous independent forced passing-bay orders and reform buffer moves are removed. Both normal movement and formation recovery use the protected Navigation cooperation. Same-kind seat settlement does not reassign active courtesy participants.

## Reproduction

Baseline is an unchanged archive of `d5a1e06`. Model fixture: seed 73, 100×100 map, fixed multi-gate barrier, unique goals, same-team noncombat movement, sizes 64/256/700, 120 simulated seconds at 0.05 seconds per update. Both individual orders and actual squad orders are measured. This is a stress fixture, not a guarantee for all maps.

```sh
FLOWER_ROOT=/path/to/baseline node scripts/navigation-benchmark.mjs
node scripts/navigation-benchmark.mjs
BASE_URL=http://127.0.0.1:PORT python3 tests/navigation-performance-browser.py
BASE_URL=http://127.0.0.1:PORT python3 tests/team-markers-browser.py
node --test --test-isolation=none tests/*.test.mjs
```

Arrivals are actual final-seat occupancy. Waiting includes every not-yet-arrived stationary actor, even a temporarily displaced actor without a command; it is not derived from navigation wait labels. Maximum waiting is actual consecutive stationary time. Model CPU excludes metrics/invariant checking and is separate from congestion outcomes. All measured before/after runs had zero occupied/reserved-cell collisions; the maximum expansion count per budget interval stayed at 2,048. Raw measurements are in `measurements/navigation-comparison.json`.

## Model results at 120 seconds

| Orders | Troops | Arrived before → after | Stationary troop-seconds before → after | Longest stationary wait, s | Model CPU, ms | Expansions |
|---|---:|---:|---:|---:|---:|---:|
| individual | 64 | 49 → 53 | 1533.2 → 1438.5 | 37.5 → 52.5 | 228.2 → 305.7 | 542,926 → 655,500 |
| individual | 256 | 117 → 141 | 13682.5 → 12151.5 | 85.0 → 78.0 | 741.2 → 866.3 | 1,594,780 → 1,517,086 |
| individual | 700 | 134 → 168 | 58563.9 → 57440.1 | 63.4 → 55.3 | 982.0 → 1557.2 | 1,775,966 → 1,963,275 |
| squads | 64 | 56 → 62 | 987.1 → 1111.5 | 75.2 → 29.5 | 3284.8 → 278.4 | 1,113,009 → 205,192 |
| squads | 256 | 187 → 194 | 8649.1 → 7884.4 | 91.5 → 40.1 | 3621.5 → 1425.7 | 1,826,230 → 1,328,463 |
| squads | 700 | 336 → 475 | 43324.3 → 28424.8 | 80.0 → 52.1 | 3804.2 → 3730.4 | 2,040,749 → 1,894,774 |

The 700-person squad fixture improves arrivals from 336 to 475 (+41%), stationary waiting by about 34%, and longest continuous waiting from 80.05 to 52.10 seconds. These are measured reductions, not elimination of all congestion.

Tradeoffs remain visible: 64-person squads have more aggregate stationary time despite more arrivals and a shorter worst stall; individual-order CPU cost increases. At 90 seconds the 256-person squad fixture has fewer arrivals (173 → 163), while at 120 seconds it has more (187 → 194). Do not claim every case is faster, that every actor always arrives, or that FPS improved.

## Browser results

Headless Chromium, `/usr/bin/chromium`, 1,000×760 viewport, DPR 1, rendered character/terrain caches, 30 warm-up frames followed by 150 measured requestAnimationFrame intervals; model step is fixed at 0.05 seconds. This is a desktop container measurement, not a mobile-device guarantee.

| Troops | FPS before → after | Frame CPU p95, ms before → after |
|---:|---:|---:|
| 64 | 60.0 → 60.0 | 0.8 → 1.0 |
| 256 | 60.0 → 60.0 | 1.8 → 2.0 |
| 700 | 60.0 → 60.0 | 3.2 → 3.9 |

The browser remains near its 60 FPS ceiling. No FPS increase was demonstrated. Frame CPU is slightly higher, with the 700-person p95 still below 4 ms in this sample. Team-marker browser verification confirms both colors in close views and cached per-squad flags in distant views.

## Regression status

Full suite: before **234/250 passed, 16 failed**; after **242/258 passed, the same 16 failed**. The eight added navigation tests pass. Existing tests for mixed-speed cooperation, local avoidance, forbidden hostile/held/casting displacement, death/cancel/hooks, deterministic simulation, shared squad routes, role/formation restoration, spear charge/poise, healer following and the 1,000-person crossing fixture were exercised.

The pre-existing failures include stale balance/cap/formation expectations and genuine unresolved edge/arrival assertions. They were not removed, skipped, or relabeled as passing. No new suite failures were introduced:

- a real ranged actor acquires an interpolating target across a bucket boundary
- a vertical advance places the commander behind the front instead of beside it
- an isolated long move follows a shortest route without a traffic lane detour
- automatic armies obey the 200 cap and deploy on their own half
- edge destinations leave access around the formation until every member arrives
- full bot operations pair frontline, firepower and healing in one lane
- healers restore injured allies, respect cooldown and never damage enemies
- home defense intercepts intruders without recalling a distant attack operation
- injury changes neither movement duration nor attack damage
- manual placement spends reserves atomically and rejects overlaps and enemy territory
- shared destination has one occupant; other commands wait without overlap
- squad destinations on a large map start without serial full-map distance fields
- square formation surrounds its commander and assigns distinct valid seats to every role
- step timing remains exact and simulation does not depend on a renderer
- the commander receives a safer rear target even when the formation is dense
- visible test classes have independent configured health, damage and attack speed
