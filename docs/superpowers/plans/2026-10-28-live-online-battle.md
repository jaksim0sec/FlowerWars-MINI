# Live online battle implementation plan

Goal: complete host-authoritative deployment, battle rendering/commands and active Board/FlagMatch checkpoint recovery in the existing battlefield. Keep the single-server/no-TURN/no-database constraints and preserve single-player mechanics.

Approach: add an explicitly versioned battle adapter. Capture whitelisted durable state (including in-flight actions, formation maps and cooperative references); rebuild class instances, occupancy, reservations and spatial indexes. Only the host advances the existing engine. Guest commands are ownership-checked and acknowledged; compact changed-unit frames update a render-only guest board. Large durable checkpoints use bounded chunk transfers over the existing DataChannel, with flow control. No simulation payload goes through Socket.IO.

- [x] Tests first: actual 176×128 battle snapshots, up to 700 units, attacks/heals/mid-step reservations/formation maps, validation failures and continued battle after restore.
- [x] Adapter + registry restoration: explicit state graph encoding, safe runtime rebuild, human-vs-human FlagMatch mode, existing single-player defaults unchanged.
- [x] Network: chunked checkpoints, compact live frames, validated commands with idempotent sequence acknowledgements, bounded queues and resynchronization after loss.
- [x] Existing app integration: A/B own-team selection/deployment, shared command controls, guest rendering without local simulation, room pause and local-game restoration.
- [x] End-to-end verification: two clients deploy/fight, guest commands affect host, pause/reconnect restores actual units/flags/timers, host restoration from guest backup, frame/snapshot size and CPU measurements, existing suite comparison.
- [x] Independent review, docs/offline cache, one commit and push to main.

Explicit limits retained from the original request: no TURN service and no server-restart recovery without persistent infrastructure. Successful real WebRTC connectivity must be reported only if actually verified; the environment's managed UDP policy remains in force.
