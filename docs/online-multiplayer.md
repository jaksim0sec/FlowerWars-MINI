# Online 1v1 battles

**Implemented:** the existing 176×128 battlefield is now playable by host/A and guest/B. Both directly deploy their own armies (350 each), select their own squads, change formations and issue move/focus/flank/hold/rally or individual commands. The host runs the existing Board/FlagMatch combat, movement, healing, charge and flag-destruction rules. There is no bot in an online match. The guest only renders authoritative updates. Single-player still uses its original bot and mechanics and is restored after leaving the room.

## Start / Render Free

Node **22.x**. Build **`npm ci --omit=dev`**; start **`npm start`**. One HTTP server listens on `0.0.0.0`, `PORT` or `10000`. Health: **GET `/health`**. `render.yaml` configures one Free Web Service. No database, Redis, paid service, server disk state or server-side soldier simulation is required. Optional `PUBLIC_ORIGIN=https://your-service.onrender.com` pins browser origin; same-host HTTPS proxy validation works without it.

Open the same server URL on both devices → **온라인** → create/join six-letter code → both **준비** → host **대전 시작**. The real battlefield opens in five-minute preparation. Choose a unit type and touch your side to deploy. Only the host can skip preparation using the battlefield's **전투 시작**; the preparation timer also starts combat automatically. The existing roster, gestures and command controls work for each player's own team. Open **온라인** for chat or pause/resume. On victory/defeat, **방 나가기** returns to the original single-player game.

Serving the frontend statically still supports single-player; online features need this Node server at the same origin. No Render deployment was performed during development.

## Connection and authentication

Two authenticated slots per room. Invite codes are cryptographically random public identifiers; each slot receives a separate private 256-bit reconnect token, hashed server-side and timing-safe compared. Role/team come from the authenticated socket, never a client claim. Wrong tokens, full rooms and duplicate active sockets are rejected. A reconnect racing the old socket's timeout preserves identity/backups and retries; a retransmitted authenticated recovery is idempotent.

Identity (`roomCode`, `role`, `clientId`, `reconnectToken`, `expiresAt`) uses sessionStorage with an expiring localStorage fallback. Reload/reopen automatically attempts the same room and identity. Storage denial is reported; it never silently creates another match.

States: WAITING → READY → PAUSED(initial synchronization) → PLAYING; recovery/manual PAUSED → PLAYING, or FINISHED/EXPIRED. Either detected disconnect immediately pauses the host engine and timers. Socket.IO presence and DataChannel close/heartbeat detection both trigger pause. The server's original **300-second grace deadline** remains until both participants reconnect and validate the same committed checkpoint. Retry attempts cannot extend it. Countdown uses server time. Manual pause preserves live state rather than rolling back. Finished results remain visible and chat remains available until leaving.

The room's shared one-second sweeper removes expired membership, token hashes, chat and metadata. Bounds: 100 rooms, 256 Socket.IO connections, six-hour absolute lifetime, 15-second unauthenticated connection timeout, 64KiB Socket.IO packet limit, 100 events/10 seconds/socket. Chat retains 50 messages, 300 UTF-16 characters each and permits four messages/four seconds/participant. All chat uses `textContent`. Static serving excludes server/repository internals.

## Actual battle synchronization

`battle-commands.mjs` validates team ownership, payloads, phase, territory and target legality before calling existing engine APIs. Guest sequence numbers provide acknowledgement and idempotence; mixed-team squad selections reject atomically. The guest never invokes local gameplay mutations through the UI. Host commands use the same validation adapter.

`battle-wire.mjs` sends changed actor poses/HP/actions, changed squad orders/formation goals, new deployments, equipment changes, removals, match clocks and flags. The receiving board is presentation-only. Frames are sampled around 6.7Hz; there is no client combat prediction. A full frame after backpressure resets replaces actor membership, preventing ghost units after a missed death/removal. Large live frames skip under pressure while the next full frame repairs them. Final state is installed on the guest before acknowledging the final checkpoint, so both result effects receive their correct victory/defeat.

All commands, live frames and checkpoints use the reliable ordered **WebRTC DataChannel**. Socket.IO carries only room/presence/readiness/chat, bounded offer/answer/ICE, pause/resume, authentication and checkpoint metadata. The server never imports or advances the battle engine.

Both peers advertise native gzip support in `hello`. `wire-codec.mjs` uses CompressionStream/DecompressionStream when both support it, otherwise raw JSON. It validates exact envelope/base64/UTF8 and bounds streaming decompression to the advertised size (8MiB maximum). No worker, WASM or extra dependency was added. Large messages use ≤16KiB chunk envelopes with 12,000-byte payloads, one bounded incoming/outgoing transfer, 256KiB channel buffering, 30-second transfer timeout and flow control. Ordinary small gameplay packets can interleave with checkpoints. Live bulk transfers cannot race a new checkpoint into a false disconnect. Frame building, native compression and sending share an ordered promise chain, so a pause delta cannot overtake its preceding full frame. Advertised decompressed bytes consume the same receive budget before asynchronous decoding is queued. Native-gzip messages must save at least 10% to be used.

## Active battle recovery

`match-state.mjs` dispatches versioned `fixture-v1` and **`battle-v1`** save/restore/validate contracts. The original fixture remains only for regression tests; the online UI starts actual battles.

The durable battle schema explicitly selects fields, then uses a bounded data-only graph to preserve aliases, Maps/Sets and typed arrays. It saves actual terrain and geometry, both flags, all unit identities/HP/stats/equipment, in-flight movement durations and elapsed progress, attacks/healing/cooldowns/charge state, original commands, squad and group IDs/counters, formation goals/travel offsets/handoffs, cooperative chains, preparation/battle phase and clocks. Character animation's renderer-induced cycles, catalog images, DOM and live class instances are excluded. Runtime animation, Board/FlagMatch, occupancy/reservations, spatial indexes, registries and movement policy are reconstructed safely; art-backed character factories are rebound when installing the restored battle. Navigation search caches rebuild cold, so resumed path-search scheduling need not be bit-for-bit identical, while orders, current steps and positions persist.

Every five seconds the host saves an authoritative checkpoint to IndexedDB, sends it to the guest and commits server metadata only after the guest validates and saves it. Both retain three checkpoints per match (30 device records maximum). Key-only pruning/exact-checkpoint lookup avoids copying all large snapshots during every write/read. Tokens are not in the snapshot database. Hashes detect corruption; host authority is not an anti-cheat system.

On reconnect both restore the exact mutually committed sequence/hash, from their own backup or from the other peer. A closed host tab can recover its full army from the guest even after its own IndexedDB backup is deleted. No engine/timer resumes until both synchronize. Missing, invalid or incompatible state leaves the room paused with an error. Recovery can discard roughly five seconds after the last successful checkpoint; lossless command replay is not implemented. Finished battle state is also committed before the room transitions to FINISHED.

## Verification

- **Node 22.23.4:** online tests **65 passed / 0 failed**. Full suite **365 tests: 335 passed / same 30 pre-existing failures**. No existing combat test assertions were changed. Exact names: [existing failures](online-existing-failures.md).
- `FIXTURE_TRANSPORT=1 BASE_URL=http://127.0.0.1:10000 python tests/online-battle-browser.py`: real battlefield, own-side UI deployment/selection/hold, real HP damage, pause/frozen clocks, host army recovery from guest backup, guest reload, durable final outcomes, mobile bounds and leaving. Zero page errors. `FILL_ARMIES=1` additionally fills and synchronizes the full 700-soldier roster through owned commands.
- `scripts/benchmark_online_battle.mjs`: real current equipment/stats/blueprints, 176×128 seed73, 350/team and 20 simulated seconds. [Recorded measurements](measurements/online-battle-700.json): zero occupancy/reservation collisions, host step p95 **5.66ms**, frame encode/decode/apply p95 **14.07ms** (both sides combined). Application-frame bytes **633,914→90,335 bytes/s** using native gzip (−85.7%); checkpoints around **3.50MB→373KB**. Snapshot save ~79–116ms during the run, initial restore ~85ms. These are local CPU/encoding measurements, not browser FPS or measured Internet bandwidth; chunk overhead is additional.
- Structural/security/recovery regressions cover duplicate slots, original grace deadlines, host/guest ownership, idempotent commands, chunk bounds/replay/timeout/backpressure, decompression bombs, malformed graphs/hashes, all 700 soldiers, movement reservations, ongoing strikes/heals, formations, courtesy identities, late asynchronous restore/start, final results and dropped tombstones.

## Limits retained from the free MVP

**Real WebRTC success across networks remains unverified here:** managed Chromium policy disables non-proxied UDP, so no usable ICE candidates can be gathered. Real signaling and honest connection-failure handling were tested; browser end-to-end recovery uses an explicitly test-only ordered RTC transport, with actual Socket.IO, IndexedDB, combat and renderer. That shim lives under tests and is never served by the application. Run the browser script without FIXTURE_TRANSPORT on an unrestricted browser to test actual WebRTC.

Public STUN is configured; **TURN remains excluded by the original scope**, so some NAT/firewall combinations cannot connect. Render restart/redeploy loses in-memory room metadata; browser backups do not resurrect a missing room. Restart recovery requires persistence outside this database-free service and remains explicitly excluded. Free-service cold starts and local browser CPU/storage/network limits still apply. No claim of universal network compatibility or measured 700-unit browser FPS is made.
