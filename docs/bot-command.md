# Scenario command hierarchy

The bot uses the same placement, movement, healing, collision and squad-order APIs as the player. It cannot cross X terrain or spawn reinforcements during battle.

`src/bot-doctrines.mjs` contains editable scenario ratios, openings, timing and capability requirements:

- Envelopment: central hold, deployed wings advance in steps; absent wings never block a small army.
- Breakthrough: a larger spearhead advances ahead of the line, with a shorter reserve-release delay.
- Counterstroke: an opening defensive pause, followed by exploitation when the opponent commits; a timeout prevents indefinite mutual waiting.

Each match uses a recorded `board.seed`. The app varies seeds between matches; supplying a seed and scenario reproduces a run.

## IDs and recruitment

`match.command.registry` owns disjoint sets of living squad IDs for guard, front, breach, mobile and support. `botOperations` owns operation IDs and actual squad ID lists. Losing a guard operation reassigns an existing nearby operation. No unit is respawned or teleported. Temporary defenders can return to their original assignment after danger clears and a minimum hold time.

Blueprints come from the shared player formation registry; `FlagMatch({blueprints,unitProfiles})` can provide updated definitions. Recruitment scores current roles, health, movement, range and healing capabilities. Bot code does not contain character IDs or lists of fixed squad types. Reserve debit and final partial placements use actual template membership, including smaller templates.

## Battle stages

The shared half-second survey caches squad health/positions, sector pressure, real contact pressure, supported gaps and flag threats. A terrain connectivity flood is reused until obstacles change. Front goals are staggered per operation; they advance only as the force reaches its previous line. Mobile forces wait for a sustained supported gap, then penetrate, turn behind the enemy front, and proceed toward the flag. Firepower and healers cover the entry behind the moving raiders without blocking the passage.

Flag defense always exists, including small armies. Defenders have a 16-cell movement leash; only the forward screen intercepts an individual intruder. Other defenders retain flag approach coverage. Reinforcements receive nonoverlapping compact destinations inside the same leash. A home breach contracts the defensive perimeter and prioritizes guard decisions.

All searches and movements retain the shared navigation budget. Decisions remain staggered; changed occupancy is checked periodically instead of restarting every squad's paths every frame. `match.command.events` is a bounded event log for testing/replay inspection.

## Verification

`node --test --test-isolation=none tests/*.test.mjs`

`SCENARIO=envelopment CHARGE=0 node scripts/benchmark_bot.mjs`

The benchmark measures simulation time, checks terrain/collision invariants and reports scenario events and role membership. These timings are not browser FPS.
