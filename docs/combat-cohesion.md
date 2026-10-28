# Combat cohesion correction — 176×128

Baseline: `f148b2a` on main. Both versions recruit and deploy with the **current
Utility controller**, six current squad blueprints, actual 176×128 seeded terrain
and 350 soldiers per side. No legacy placement or controller substitution is
used. Seeds 17, 73 and 191 each run coordinated archer and archer-plus-flanking
scenarios for 120 simulated seconds. The opponent deploys shield screens,
archers, medics and, in the latter scenario, mobile detachments. Enemy orders
use ordinary `orderSquad` calls; at 20 and 60 seconds the mobile detachments
receive terrain-derived merge and rear objectives. All initial orders must be
accepted. Dead enemy squads are skipped when updating objectives.

## Changes

- Observer records surviving shields, charge-capable spears and effective range.
  Controller and progress tracking share role-based leader selection: shields
  screen frontal actions; viable spear assault/mobile squads lead penetration.
  Wounded or recovering squads are avoided when a viable leader survives.
- Ranged and medical squads seek reachable nearby protection rather than all
  clustering on the operation's largest melee squad. Rear distance reflects
  attack/healing range, offset direction reflects nearby enemies, lateral slots
  separate cooperating squads, and ordinary terrain/route checks still apply.
  Fighting squads retain separate operation destinations.
- Recruitment ranks staging regions by route cost, committed load versus region
  frontage capacity and supporting distance. Physical footprint validation is unchanged;
  newly placed operations must connect to the existing operation network within
  30 tiles. This allows a chain of independently commanded operations, not a
  global prescribed battle formation. The first operation has no fictitious
  ally-coverage penalty for being away from its own flag.
- Every intent uses consistent diminishing superiority benefit and risk cost,
  without counting the whole operation's strength twice as local support.
  Strategic progress is discounted by map-relative route length. Old 48/65/320
  travel cutoffs are removed; connectivity and choke capacity remain constraints.
  Candidate utility also considers allied coverage left behind and unsupported
  destinations. Reachability-to-allies is shared per observation, not recomputed
  for every operation/candidate pair.
- Completed intermediate advances relinquish their commitment bonus; reserves,
  recovery and objective defense retain their persistent intent. Attrition over
  an eight-second window with no recent progress invalidates an operation even
  if some soldiers are still striking. The first distance sample no longer
  counts as physical progress.
- Necessary defense, exposed rear-unit and failing-operation redirects may pass
  the command gateway during combat. Position tolerance, cooldowns, target
  validation and duplicate suppression are retained.

Navigation, reservations, combat, soldier statistics, speeds and player commands
are unchanged. No new runtime subsystem or dependency was added.

## Reproduction and measurement

```sh
mkdir -p /tmp/flower-collapse-before
git archive f148b2a | tar -x -C /tmp/flower-collapse-before
FLOWER_ROOT=/tmp/flower-collapse-before OUTPUT=/tmp/before.json node scripts/benchmark_combat_cohesion.mjs
OUTPUT=/tmp/after.json node scripts/benchmark_combat_cohesion.mjs
node --test --test-isolation=none tests/combat-cohesion.test.mjs
node --test --test-isolation=none tests/*.test.mjs
```

`measurements/combat-cohesion.json` contains all four snapshots (0, 20, 60, 120
seconds) for every scenario, averages, collision checks and regression names.
Initial total combat power remains identical. Recruitment composition comes from
existing blueprints in both versions, but operation placement intentionally
changes. This is an end-to-end test of deployment and decisions, not an
identical-position experiment isolating only utility weights.

Protection counts rear-containing squads with a surviving shield squad within
14 tiles and forward of them. Isolation means no other live allied squad center
within 18 tiles. Frontage is the lateral span of surviving shield-squad centers;
a larger span alone does not imply a continuous or effective defensive line.
These snapshot diagnostics are geometric proxies, not an encirclement detector.
Combat power is a common health-weighted base-health/DPS estimate, without
changing or simulating new buffs. Progress counters are not directly comparable:
the correction removes first-sample and leader-change inflation, and re-evaluates completed milestones.

Idle unit-seconds sample non-healing, non-attacking stationary bot units at 1 Hz,
including deliberate reserves and defenders. Movement-stall samples count the
subset still holding a move command and no committed physical step. CPU p95
includes Board, match decisions and squad orders, measured on the same host;
it is not browser FPS. Collision and invalid-cell checks run at 1 Hz in this
harness, supplemented by existing per-tick reservation regression tests.



## Recorded averages across six scenarios

| Time | Alive B before → after | Combat power before → after | Protected rear before → after | Orders before → after | Move-stall samples before → after | CPU p95 ms before → after |
| --- | --- | --- | --- | --- | --- | --- |
| 0s | 350.0 → 350.0 | 461.2 → 461.2 | 17.0 → 17.0 | 0.0 → 0.0 | 0.0 → 0.0 | 0.00 → 0.00 |
| 20s | 350.0 → 349.8 | 461.2 → 460.7 | 14.3 → 16.3 | 76.5 → 74.3 | 381.8 → 570.0 | 4.27 → 4.85 |
| 60s | 316.5 → 343.2 | 412.1 → 449.3 | 15.3 → 16.8 | 208.5 → 137.7 | 1501.8 → 2318.0 | 5.11 → 5.74 |
| 120s | 265.3 → 330.3 | 343.0 → 431.8 | 13.2 → 16.2 | 306.5 → 178.7 | 4262.8 → 7451.7 | 5.69 → 6.81 |

At 120s, enemy survivors were 291.0 → 330.8; shield-center frontage 43.4 → 17.3 tiles; isolated squads 0.50 → 0.33. Own casualties decreased alongside less damage to the enemy and a narrower defensive footprint. These are material remaining limits, not a declaration of full success.

Full suite: baseline 250 passed / 38 failed; after 257 passed / 37 failed (six added focused tests pass). No new failing names; all remaining failures are recorded individually in the JSON.

## Acceptance limits

This correction improves preservation of the army and rear protection in the
recorded scenarios, but is **not a complete resolution of combat collapse**.
Reduced exposure can reduce casualties while also reducing pressure on the
opponent. Narrower frontage, slower progress, additional idle time and CPU costs
must remain visible beside survival gains; they are not hidden as optimization.
There is no claim of universally improved encirclement resistance, offensive
throughput, casualty exchange or objective success. No battle outcome is forced.

Six new focused regressions cover role choice, consistent strength incentives,
losses during ongoing combat, real maximum-size deployment connectivity,
combat redirects/deduplication and map-relative travel. Existing tests were not
rewritten or weakened. The baseline suite already fails on many old formation,
stat, army-size, terrain and timing assumptions; the measurement file separates
those names from any new failures.
