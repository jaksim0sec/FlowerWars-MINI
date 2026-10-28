# Targeted deployment correction

**Baseline:** `f6e4f02701fcd263539c65d8db0668d885235eff`.
**Retained runtime change:** one eligibility expression in `recruit()`. Legal
B-side **staging** areas are no longer excluded merely for lying forward of
`width * .6`. Capacity scoring, footprint checks, territory, connectivity,
350-unit rosters, reserves, and the existing operation-link rule are preserved.

No unit stats, abilities, timing, player commands, navigation, reservations or
combat code changed. No new congestion/pathfinding subsystem was introduced.
Full evidence, including every checkpoint and all 30 classified failures:
[`measurements/targeted-deployment-fix.json`](measurements/targeted-deployment-fix.json).

## Deployment ablation

Every variant changes only the specified deployment policy on an archived
baseline. Rotation means the previous distance-sorted cyclic allocation,
**without** the subsequent greedy capacity sort. All variants retain the
30-tile link constraint. `all B regions` admits both forward staging and merge
nodes; `staging only` retains the old merge eligibility and expands only staging.
All six scenarios have identical roster/stat hashes, initial player-placement
hashes and verified terrain hashes.

Mean of seeds 17/73/191 × coordinated archers/flanking, at 120s:

| Policy | Initial shield span | 120s span | Move-stall samples | Sampled displacement | Engagement unit-seconds | Enemy / friendly losses |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Current main | 33.0 | 14.9 | 7,413 | 20,592 | 176.0 | 24.3 / 25.5 |
| Restore rotation only | 52.7 | 18.7 | 7,105 | 19,176 | 173.0 | 24.2 / 21.2 |
| Admit all B regions only | 83.0 | 66.9 | 4,178 | 20,752 | 395.0 | 50.8 / 71.0 |
| Rotation + all B regions | 79.0 | 59.1 | 4,124 | 24,422 | 439.3 | 49.5 / 74.8 |
| **Admit B staging only** | **48.3** | **49.7** | **6,076** | **22,638** | **167.7** | **25.0 / 22.5** |

Rotation restores initial span but does not sustain it or increase offensive
contact. It is **not retained**. Admitting all merges increases contact but
substantially worsens pooled casualty exchange; that expansion is also rejected.
The staging-only exception is the smallest tested correction with repeated
traffic improvement and a better 120s pooled casualty exchange.

These results establish a deployment-admission contribution, not proof that
all greedy allocation is wrong. Shield span remains a geometric proxy, not a
verified continuous battle line. The link rule was held constant, so its
independent effect is still unverified.

## Isolated paired validation through 300s

A separate sequential run compared archived current main and the retained
exception without competing benchmark jobs. It preserves the opponent fixture
and records 0/20/60/120/180/240/300s. CPU below is the mean of each scenario's
simulation CPU p95, not browser FPS. Exploratory ablation timings had overlapping
diagnostic jobs and are not used to claim CPU gains.

| Checkpoint | Move stalls before → after | Sampled displacement before → after | CPU p95 ms before → after |
| --- | ---: | ---: | ---: |
| 20s | 552 → 488 | 5,660 → 5,906 | 4.26 → 3.94 |
| 60s | 2,339 → 1,973 | 14,837 → 14,708 | 5.20 → 5.14 |
| 120s | 7,413 → 6,076 | 20,592 → 22,638 | 5.99 → 5.84 |
| 180s | 12,285 → 10,235 | 24,224 → 28,594 | 6.26 → 6.21 |
| 240s | 16,526 → 13,867 | 27,510 → 33,543 | 6.41 → 6.39 |
| 300s | 20,584 → 17,527 | 30,070 → 36,390 | 6.47 → 6.54 |

At 120s: stalls **−18.0%**, displacement **+9.9%**, enemy losses
24.3→25.0, friendly losses 25.5→22.5. CPU p95 decreased 2.4% in this sample.
At 300s: stalls **−14.9%**, displacement **+21.0%**, enemy losses
41.5→39.3, friendly losses 29.0→29.3. CPU p95 increased **1.1%**; zero CPU
regression is not claimed. Pooled casualty exchange at 300s is about 6.3% worse,
not a universal tactical improvement. Seed 17's flanking case worsens from
80 enemy/54 friendly losses to 72/68 at 300s; individual scenarios do not all win.

**Neither side destroys or damages a flag in any of these 300s runs.** There is
no verified objective-outcome improvement. Regional completion counts increase,
but late replans also increase (34.2→102.7 at 300s); these counters must not be
advertised as successful objective progress. Late goal churn remains unresolved.
The retained benefit is reduced traffic waiting and recovered deployment span,
not proof that the commander can finish the battle.

## Conditional fixes and limits

No corridor-demand mechanism was added: deployment alone improves the measured
traffic, while residual waiting has not been isolated as aggregate corridor
oversubscription rather than formation/repositioning/intent issues. A new delay
or route penalty would need its own controlled evidence.

Follower telemetry was added to the benchmark, not the runtime. At 120s,
stationary separated follower squads average 3.67→3.0; at 300s, 5.0→4.5.
A separated squad is counted when its center is more than 24 tiles from the
selected leader squad and at least one living, non-attacking member has stayed
on the same logical cell for 12 seconds. This is not proof that the whole squad
is blocked. “Leader-only advance” means a separated follower exists while the
operation recently recorded progress. These diagnostics cannot distinguish every
intentional support hold from an erroneous blockage and do not justify freezing
an operation. Leader-progress and rear-screen behavior were left unchanged;
forward-screen correctness is **not newly proven or claimed fixed** here.

Distance is the sum of 1Hz net-displacement segments, not an exact integrated
path length. Engagement is sampled attacking-unit time. Performance comparisons
sample collisions at 1Hz; a separate retained-patch verification additionally
checks occupancy/reservations/blocked cells after **every .05s update** in all
six full 300s scenarios. It observes zero collisions/invalid occupied cells and
reproduces the paired gameplay snapshots exactly; its timings are excluded.

## Reproduction and regressions

```sh
# Full independent deployment-policy ablation; defaults to 120s.
OUTPUT=/tmp/ablation.json node scripts/benchmark_deployment_ablation.mjs
# Archived baseline versus exactly the retained correction, extended outcomes.
VARIANTS=baseline,staging-only HORIZON=300 OUTPUT=/tmp/paired.json node scripts/benchmark_deployment_ablation.mjs
# Per-update physical invariants; verification timing is not a CPU comparison.
VERIFY_EVERY_STEP=1 HORIZON=300 OUTPUT=/tmp/invariants.json node scripts/benchmark_combat_cohesion.mjs
node --test --test-isolation=none tests/deployment-approaches.test.mjs tests/combat-cohesion.test.mjs tests/tactical-ai.test.mjs tests/autonomy-regressions.test.mjs
node --test --test-isolation=none tests/*.test.mjs
```

Focused: **28/28 pass**. The new deployment regression fails on the archived
baseline and passes with the correction; it checks actual flank-stage selection,
full legal footprints, complete army recruitment, reachable terrain and retained
support-link constraints. Full suite: **299/269/30** total/pass/fail before,
**300/270/30** after. No existing assertions changed and no new failures.

All 30 failures remain individually named and classified in the JSON:
11 changed-specification/roster fixtures, 7 legacy-AI policy/coordinate fixtures,
3 invalid legacy siege fixtures, 4 timing/configuration contracts needing review,
and 5 unresolved combat/formation/throughput regressions. Classification is not
an exemption: those tests still fail, and neither they nor the remaining
strategic limitations are declared solved by this one-line correction.
