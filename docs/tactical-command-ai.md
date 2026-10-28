# Tactical command AI

The game now creates `FlagMatch` with `aiImplementation: 'utility'`. `?ai=legacy`
selects the original commander for regression comparisons. The simulation
constructor retains its legacy default so existing integrations and tests keep
working. Original tests and their assertions are unchanged. Legacy decision
modules are isolated behind this flag, retained until the outstanding regression
suite failures and broader tactical acceptance work are resolved.

## Runtime

- `ai/observer.mjs`: one terrain-revision-cached regional graph from actual rooms,
  sampled route centerlines and defensive banks. A multi-source walkable flood
  links regions; cached graph distances reject disconnected goals. Squad
  centroids inside lakes resolve to nearby walkable regions. Region health,
  base DPS, range, healing, congestion and reachable support are shared once per
  0.75 simulation seconds. No three-lane assumptions.
- `ai/principles.mjs`: independently scored concentration, penetration, flanking,
  counterattack, elastic defense, reserve commitment and recovery utility. These
  are estimates using existing combat data, not additional game mechanics.
- `ai/planner.mjs`: feasible HOLD / ADVANCE / BREAKTHROUGH / FLANK /
  COUNTERATTACK / DEFEND / REGROUP / CAPTURE candidates. Travel cost, regional
  resistance along the approach, traffic, existing commitments and destination
  allocation affect selection. An eight-second commitment and score hysteresis
  suppress oscillation; real flag threats and stale topology override commitment.
- `ai/operations.mjs`: persistent goals, route waypoints, lead squad, measured
  progress, arrival and twelve-second stall detection. Stalls penalize the old
  destination and cause bounded replanning. Visible straight sections skip
  redundant regional waypoints; Navigation still handles all physical movement.
- `ai/commands.mjs`: validates ownership, target life and reachability. Similar
  positional orders, existing attacks and cooldowns suppress redundant orders.
  Emergency defense can bypass the cooldown.
- `ai/controller.mjs`: capability-based recruitment from shared blueprints,
  unique task-force membership, proportional nearest-force reinforcement,
  secondary staging and a mobile reserve. Delayed support follows real fighters
  without stopping them; orphaned medics join a surviving force. Recovery is
  bounded even without healing. Tactical dispatch uses the existing staggered
  FlagMatch schedule and `orderSquad` API.

Board, Navigation, Combat, movement speed, army cap, healing, formations,
reservation rules and player commands are unchanged. The old guard-only
movement leash applies only to legacy AI; new defense is ordinary squad orders.

## Reproduction

```sh
node --test --test-isolation=none tests/tactical-ai.test.mjs
AI=legacy SECONDS=180 OUTPUT=/tmp/legacy.json node scripts/benchmark_tactical_ai.mjs
AI=utility SECONDS=180 OUTPUT=/tmp/utility.json node scripts/benchmark_tactical_ai.mjs
AI=utility SEEDS=73 SCENARIOS=flank,feint,rear,support-loss,target-changes,topology node scripts/benchmark_tactical_ai.mjs
python3 tests/tactical-ai-browser.py
```

The comparative benchmark deliberately recruits and places with the legacy
commander **for both implementations**, then swaps only the decision controller.
Roster hashes include IDs, types, positions, health, damage, attack period, range
and speed. This separates decisions from recruitment changes. New recruitment
is tested separately against actual shared blueprints and ranged/shield armies.

Both sides have 350 units on 144×112 terrain. Seeds 17, 73 and 191 face the same
mixed or ranged player army, which receives the same opening charge. Movement
runs at .05 simulation seconds; ordinary squad orders update at .1 seconds.
Additional scripted scenarios use normal player orders to send a flank force,
feint, rear attack and changing targets; remove bot healers; or open twelve
existing blocked terrain cells. These are reproducible stimuli, not assertions
that every requested maneuver completes within sixty seconds.

Measurements and the summarized results are in
`measurements/tactical-ai-comparison.json`. Runtime p95 values are host timings,
not deterministic gameplay outputs. The browser test uses local Playwright
request interception; no HTTP server or external resource is involved.

## Measured comparison

Fixed sixty-second runs, six identical-roster seed/composition pairs:

| Metric (scenario mean) | Legacy | Utility |
| --- | ---: | ---: |
| Squad orders issued, including initial orders | 178.3 | 104.8 |
| Accepted unit movement resets | 3,715.3 | 2,709.8 |
| Stationary unit-seconds | 9,652.5 | 6,196.0 |
| Sampled tile displacement | 10,421.6 | 15,657.1 |
| Raw direction reversals | 401.5 | 586.7 |
| Reversals per 1,000 travelled tiles | 38.53 | 37.47 |
| Navigation expansions | 1,004,531 | 980,705 |
| Mean scenario CPU p95 (ms) | 5.53 | 5.64 |

Orders decreased 41.2%, accepted resets 27.1%, and stationary time 35.8%.
The commander moved more troops farther; raw reversals increased 46.1%, while
reversals per travelled tile decreased only 2.7%. This is **not** a claim that
all local movement oscillation is fixed. CPU p95 increased about 2.1% on this
host, alongside 50.2% more displacement.

In the up-to-180-second runs, the bot won 0/6 with the original commander and
4/6 with Utility. Weighted enemy-killed / bot-lost ratios were 0.428 and 0.431:
flag outcomes improved in these samples, but casualty efficiency barely changed.
Games ended at different times; their raw movement totals are not comparable to
fixed-duration throughput. Utility lost two of the six games.

A separate short Chromium run with 700 real character sprites measured
56.6→60.0 FPS and frame CPU p95 12.5→9.1 ms. This is a host-dependent short
sample, not a sustained or multi-device FPS guarantee. It reported no JS errors.

Focused AI tests: 16 passed. Full unchanged legacy-compatible suite plus those
tests: 288 total, 263 passed, the same 25 pre-existing failing names. No existing
test assertion was changed.

## Limits and interpretation

The original full suite already had 25 failures before this change, including
stale map coordinates, old army-cap/stat expectations and formation/timing
failures. They are listed in the measurement artifact. The final suite retains
that same set; passing focused AI tests do not make the complete suite green.

Stationary time samples non-healing, non-attacking bot units at 1 Hz, including
intentional reserves. Distance is net displacement between those samples.
Reversals count negative dot products between consecutive displacement vectors;
combat dodging and legitimate turns also count. Raw reversals must be read with
travelled distance and battle duration, rather than advertised as universally
reduced oscillation. Collision/invalid-cell checks in the benchmark are sampled;
the maximum-size focused test additionally checks every simulation tick. A
forty-second opposing-force fixture also checks reservations every tick in a
four-tile corridor and verifies forward progress and active combat. It does not
measure collision-free bypass throughput against a living enemy blockade.

The 180-second runs stop at victory. Compare objective outcomes there; use the
fixed sixty-second samples for like-duration movement/cost comparison. Six
seed/composition pairs do not establish universal tactical superiority. Casualty
exchange can worsen despite a flag victory. There is no claim that all physical
traffic bottlenecks have disappeared, or that every narrow opposing passage has
been throughput-validated under this commander. The existing movement engine is
responsible for those cases. Strategic stalls are measured and replanned, not
hidden by holding the whole task force for a late support squad.

Opening twelve terrain cells measured sub-millisecond to low-millisecond
invalidation costs on this host. This does not justify changing Navigation or
introducing a new terrain batching subsystem; the observer rebuilds once when
it sees the resulting terrain revision. Physically disconnected objectives are
recorded as `objective-unreachable` and receive no invalid movement commands.
