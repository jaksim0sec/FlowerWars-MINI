# Autonomous failure and CPU reduction

Baseline: main `083d284`. Raw snapshots and regression names:
[`measurements/autonomous-improvement.json`](measurements/autonomous-improvement.json).

## Confirmed causes and changes

1. Regional route and influence calculations were repeated despite unchanged
   terrain. Bounded route caching and revision-scoped influence kernels now
   reuse that work. Returned route arrays remain independent. A direct weighted
   observation test verifies exact values, and terrain changes rebuild caches.
2. The minimum operation-commitment interval still scored all candidates even
   though the decision was constrained to keep the current feasible intent.
   The fast path now validates reachability and dynamic exceptions first.
   Emergency defense, losses, completed advances, terrain changes, and vanished
   counterattack threats still trigger full evaluation.
3. A CPU profile identified navigation, local combat search, spatial queries
   and allocation as major costs. Spatial bucket queries repeatedly constructed
   the same deduplication sets. The index now caches at most 128 query rectangles,
   validates the versions of their constituent buckets, and invalidates on real
   membership changes. It caches IDs only: health, position, team, attack range,
   cooldowns and line of sight remain live checks. Movement within a bucket does
   not invalidate an unchanged ID set. Reservations, death and reset are tested.
4. Protected ranged squads were treated as exposed merely because they were
   attacking, allowing incidental screen motion to interrupt useful combat.
   Rear squads now preserve screened attacks unless a close threat requires a
   redirect. Screen selection has a six-tile hysteresis; ordinary command
   deduplication and emergency overrides remain.
5. Manual mobile sizes incorrectly inherited the ten-member formation's special
   commander seat, overlapping troops at other sizes. Platoon sub-squads also
   reused identical positions. The special seat is now specific to ten members,
   and platoon sub-squads have separate footprints. Default six compositions and
   the required ten-member mobile layout are unchanged.
6. Recruitment's anti-ranged and strike needs both selected the same current
   spear template. The anti-shield force now requests complementary firepower
   instead of that same strike need, using observed shield proportions and the
   existing capability catalog. The existing adaptability regression now passes;
   no character IDs or soldier stat buffs were introduced.

No existing test assertions were edited. No movement/attack timing, damage,
health, navigation budget, collision rules or player commands were changed.

## Reproduction

```sh
mkdir -p /tmp/flower-autonomy-before
git archive 083d284 | tar -x -C /tmp/flower-autonomy-before
FLOWER_ROOT=/tmp/flower-autonomy-before OUTPUT=/tmp/before.json node scripts/benchmark_combat_cohesion.mjs
OUTPUT=/tmp/after.json node scripts/benchmark_combat_cohesion.mjs
node --test --test-isolation=none tests/autonomy-regressions.test.mjs
node --test --test-isolation=none tests/*.test.mjs
```

The before and after benchmarks ran sequentially on the same host. Both use
current utility recruitment/deployment on 176×128 terrain, 350/team, seeds
17/73/191, coordinated archers and flanking attacks, and snapshots at 0/20/60/120s.
All six runs completed without sampled collisions or invalid occupied cells.
These are single-host simulation timings, not browser FPS or universal gains.

## Measured outcome

At 120s, averaged over six scenarios:

| Metric | Before | After |
| --- | ---: | ---: |
| Mean scenario CPU p95 | 6.656 ms | 5.906 ms |
| Cumulative strategic refresh CPU | 327.9 ms | 227.7 ms |
| Issued squad orders | 178.7 | 165.8 |
| Movement-stall samples | 7,451.7 | 7,412.8 |
| Surviving friendly soldiers | 330.3 | 324.5 |
| Surviving enemy soldiers | 330.8 | 325.7 |
| Screened rear squads | 16.2 | 16.2 |

CPU p95 decreased **11.3%**, strategic refresh cost **30.5%**, and orders **7.2%**.
Move-stall reduction is only **0.5%**; it is not a substantive congestion fix.
Enemy losses increased alongside friendly losses: this change did not improve
survival by suppressing combat, but it also does not demonstrate better casualty
exchange or win rate. Existing limits in frontage, progress and physical traffic
remain. Neither a full tactical victory nor complete resolution is claimed.

The exact-cache-only intermediate run reproduced the baseline's six sets of
survivors, power, orders, stalls and operation counters. Cache validation is thus
separate from the intentional firing/recruitment behavior changes. The JSON
includes all four time checkpoints, not just the 120s aggregate, plus a
pre-spatial-cache diagnostic profile. Its sampled self-times are diagnostic,
not the final benchmark timings.

## Regression outcome

Full suite: **294 tests / 257 passed / 37 failed** before;
**299 tests / 269 passed / 30 failed** after. All five new focused tests pass.
Seven previously failing tests now pass, covering edge deployment, local
commander strikes, regrouping, multi-squad platoons, square/general formations,
and recruitment adaptation. No newly failing names were introduced.

The 30 remaining failures are listed verbatim in the raw report. Some refer to
obsolete map dimensions, army sizes, statistics or old compositions; others
still concern movement/formation behavior. They were not hidden by changing
expectations, and this work does not certify them as harmless. Further changes
need to distinguish stale fixtures from real regressions before declaring the
whole suite green.
