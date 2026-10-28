# Minimal online foundation

**Status:** working two-participant lobby, chat, peer signaling and versioned fixture recovery. **This is not full battlefield multiplayer.** Board/FlagMatch serialization, live battle replication, deployment and combat-command adapters are deliberately unimplemented. The drawer labels its two-dot demonstration as a connection/recovery test. Existing single-player combat, AI, unit stats and renderer are unchanged; its simulation pauses while an online room is active and resumes on leaving.

## Run / Render Free

- Node **22.x** (`.node-version`, `package.json`, `render.yaml`).
- Build: `npm ci --omit=dev`. Start: `npm start`.
- One HTTP server listens on **0.0.0.0**, `PORT` or **10000**. Health: **GET /health**.
- Create a Render **Free Web Service** from this repository, or use `render.yaml`. No disk, DB, Redis, TURN, paid add-ons or accounts are required. HTTPS/WSS comes from Render.
- Optional `PUBLIC_ORIGIN=https://your-service.onrender.com` pins browser origin. Otherwise same-host origin validation handles Render's HTTPS proxy header.
- Open the Render URL on both devices → **온라인** → create/join code → both ready → host starts **연결 시험**. Touch the fixture to move your own team's dot. Chat and pause are available from the drawer, which can be folded.
- Serving the original static site elsewhere still supports single-player. Online features need this Node server at the same origin. Do not point two clients at different deployments.

Free service cold starts can delay connection. Room metadata is volatile: restart, redeploy or instance loss invalidates existing sessions, even if browser backups remain. Recovery explicitly reports an unavailable room; it never creates a replacement match automatically. Deployability is configured and local HTTP/proxy behavior tested; no Render deployment was performed here.

## Ownership, limits and cleanup

`server/rooms.mjs` owns two authenticated slots: creator is **host/A**, joiner **guest/B**. Codes use cryptographically random uppercase letters; a separate 256-bit reconnect token authenticates a slot. Only its SHA-256 digest is kept on the server. Comparison is timing safe. Public room views never include tokens; a full room cannot be rejoined using its code alone. Active duplicate tabs, wrong identities and stale/expired-room tokens are rejected.

States: `WAITING → READY → PAUSED(initial state synchronization) → PLAYING`, then manual/recovery `PAUSED → PLAYING`, or `EXPIRED / FINISHED`. Only the host initializes, resumes a manual pause or finishes a match. Either participant may pause or leave. Leaving closes the two-player session.

Disconnect detection immediately marks the slot offline, invalidates its synchronization epoch and pauses. The **first server deadline remains in force until both peers authenticate, reconnect and synchronize**; retries and repeated failures cannot renew it. The shared 1-second sweeper expires a room at 300 seconds and clears membership, chat and checkpoint metadata. There are no accumulating per-room timers. Local countdowns use server time; without signaling, their first estimate is corrected on reconnection. Manual pause retains the live peer epoch and sends the host's final frozen fixture state rather than rolling it back.

Default bounds: 100 rooms, 256 Socket.IO connections, six-hour absolute room/token lifetime, 15 seconds for unauthenticated connections, 64 KiB Socket.IO packets, 100 events/10 seconds/socket, 32 KiB SDP, 2 KiB ICE candidate, 50 chat messages, 300 UTF-16 characters/message and four chat messages/four seconds/participant. Chat is rendered using `textContent`. Only public game paths are served; repository internals and server files return 404.

## Protocol

Socket.IO handlers require acknowledgement callbacks and validated payloads. Authentication comes from the socket binding, never a client-provided role or destination. Signals are forwarded only to the other authenticated slot.

| Client → server | Purpose |
| --- | --- |
| `room:create`, `room:join {roomCode}` | Allocate identity or join free guest slot |
| `participant:recover {roomCode,role,clientId,reconnectToken}` | Recover the same slot |
| `participant:ready {ready}` | Lobby readiness |
| `participant:synced {epoch,sequence,hash}` | Confirm locally durable committed state and open peer channel |
| `chat:send {text}` | Rate-limited chat |
| `webrtc:signal {epoch,type,sdp/candidate}` | Host offer, guest answer, bounded ICE |
| `match:start`, `match:pause`, `match:resume`, `match:finish` | Authorized state transitions |
| `peer:lost` | Pause and re-establish the direct connection |
| `snapshot:publish {version,adapter,matchId,sequence,hash}` | Host proposes locally saved checkpoint metadata |
| `snapshot:stored {version,adapter,matchId,sequence,hash}` | Guest confirms durable copy; commit metadata |
| `room:leave` | Close room and invalidate identities |

Server → client: `room:update`, `presence:changed`, `chat:message`, `webrtc:signal`, `match:paused`, `match:resumed`, `snapshot:available`, `snapshot:committed`, `room:expired`, `room:finished`, `room:closed`. Room updates include server time, original deadline and the last mutually committed checkpoint metadata.

The reliable ordered **WebRTC DataChannel** carries `command`, `state`, `checkpoint`, `recovery:request`, `recovery:state`, `hello` and heartbeat messages. Commands are checked against guest/B ownership by the host's fixture adapter. State/checkpoint traffic never goes through Socket.IO. The host alone steps the fixture; the guest only applies validated received state. Channel messages are limited to 64 KiB and 60/second, with a 256 KiB outgoing buffer threshold, bounded early ICE, a 20-second establishment timeout and heartbeat loss detection. Socket.IO reconnects with randomized 0.8–10-second backoff. Public Google STUN is used; **no TURN fallback exists**. Failed direct connections remain paused and show an error rather than pretending to be connected.

## Checkpoints and recovery contract

`src/online/match-state.mjs` exports **saveMatchState**, **restoreMatchState**, **validateMatchState**. Version 1 supports only `fixture-v1`: match ID, phase, elapsed/remaining time, positions, HP/max HP, orders and formations. Runtime lookup maps are rebuilt explicitly. Unknown adapters, incompatible versions, malformed states, invalid bounds and SHA-256 integrity mismatches fail validation. Hashing is an integrity check, not an anti-cheat system; the host is authoritative.

The host proposes a checkpoint every five seconds after saving it locally. The guest validates and saves its copy before acknowledging through Socket.IO. Only then does the server commit metadata. Both clients retain their latest three checkpoints per match, bounded to 30 total IndexedDB records. Reconnection requests the **exact server-committed sequence/hash**, rather than an arbitrary newer uncommitted backup. A host with lost JavaScript memory can restore from its own IndexedDB or request that checkpoint from the guest. Missing/inconsistent backups leave the room paused. An interruption may discard up to roughly five seconds since the last successful mutually durable checkpoint; this is checkpoint recovery, not lossless command replay.

Identity fields `roomCode`, `role`, `clientId`, `reconnectToken`, `expiresAt` use sessionStorage first and an expiring localStorage fallback. Backups contain no reconnect tokens. Storage denial/quota failure blocks recovery safely. Browsers need a secure context for WebRTC, IndexedDB and Web Crypto; HTTPS or localhost is suitable.

## Verification

Node **22.23.4**:

- `npm run test:online`: **26 passed, 0 failed** (fake-clock deadlines, identities, chat retention/rate limits, host/guest recovery, pause/resume, transient old-socket conflicts, late-restore/start races, duplicate slots, cleanup, HTTP isolation, HTTPS proxy origin validation, signaling, ownership, snapshot integrity, IndexedDB and recovery failure paths).
- Full `npm test`: baseline **300 / 270 passed / 30 failed**; after **326 / 296 passed / same 30 failed**. No existing assertion was changed. Exact pre-existing failure names: [online-existing-failures.md](online-existing-failures.md).
- `FIXTURE_TRANSPORT=1 BASE_URL=http://127.0.0.1:10000 python tests/online-browser.py`: desktop host + 390px mobile guest, real Socket.IO and real IndexedDB; plain-text chat, start, guest ownership, checkpoint, frozen timers, host tab reopening, guest reload, retry while the old host socket remains active, manual pause/resume, guest recovery from host, **host recovery from guest with host backup deleted**, layout bounds, leave and resumed single-player timer. Zero page errors.
- Without `FIXTURE_TRANSPORT`, that script uses actual WebRTC. Here Chromium's managed `WebRtcIPHandling=disable_non_proxied_udp` policy produces no usable ICE candidates. Real offer/answer signaling and visible timeout/pause were verified, **but a successful real DataChannel and cross-network NAT compatibility were not verified**. The explicit test-only RTC shim lives under tests and is never served by the application. It proves coordination, not real P2P transport.
- Production dependency audit: zero reported vulnerabilities. Offline asset manifest regenerated; Socket.IO transport/client script retains network semantics and is not cached as an offline game asset.

## Changed files

- `server/index.mjs`, `server/rooms.mjs`: HTTP, transport, rooms and authenticated lifecycle.
- `src/online/{session,peer,match-state,backup,identity,game-gate,ui}.mjs`: client coordination, adapter, storage and drawer.
- `index.html`, `src/style.css`, `src/app.mjs`, `sw.js`: entry/UI and reversible local simulation gate.
- `package.json`, `package-lock.json`, `.node-version`, `render.yaml`, `.gitignore`: dependencies and deployment.
- `tests/online-*.test.mjs`, `tests/online-browser.py`, `tests/fixtures/online-rtc.mjs`: regressions and explicit fixture transport.

Remaining work is full battle serialization/replication and a tested adapter to existing team commands/rendering. This implementation does not claim 700-unit live recovery, real network interoperability, server-restart recovery or production-scale performance.
