# Minimal Online Multiplayer Implementation Plan

**Goal:** Two authenticated participants can connect, chat, pause and recover a small authoritative fixture without changing the combat engine.

**Architecture:** Express and Socket.IO share one HTTP server. An in-memory room store owns identities, deadlines and synchronization metadata; only WebRTC transports fixture commands and snapshots. IndexedDB stores versioned checkpoints independently of room metadata. Full Board/FlagMatch synchronization is explicitly outside this implementation.

**Constraints:** Node 22; 300-second nonrenewable recovery deadline; two slots; 50 chat messages; 300-character messages; bounded rooms/payloads; no database, TURN, simulation server or balance changes. One final commit to main as requested.

**Review focus:** Duplicate tabs cannot steal roles; retries cannot extend grace; a reconnecting host cannot initialize a replacement match; a peer failure pauses even with signaling connected; snapshots must be durable on both clients before synchronization permits resume.

- [x] Room store: fake-clock tests first, then authenticated transitions, chat, limits and cleanup.
- [x] HTTP/Socket.IO transport: integration tests first, same-origin signaling and static-file allowlist; no repository-root exposure.
- [x] Snapshot/identity/peer adapters: versioned minimal state fixture, SHA-256 contract, IndexedDB and expiring identity storage, bounded reliable DataChannel.
- [x] Vanilla UI: online entry/lobby, presence/readiness, safe chat, pause/reconnect countdown; isolated fixture demonstration and single-player pause gate.
- [x] Verify Node 22 tests, browser connection/recovery if available, existing suite against baseline; document failures and limitations; rebuild offline cache and commit/push once.
