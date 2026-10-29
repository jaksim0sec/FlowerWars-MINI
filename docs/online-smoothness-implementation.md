# Participant smoothness implementation — 2026-10-29

Branch: fix/online-stutter-presentation-20261028. Baseline78fd680; no main merge or new branch. No AGENTS.md found in repository/parents. Gameplay, collision/reservation semantics, stats, map art, unit rigs and authoritative commands are unchanged.

## Confirmed causes and changes

1. Single-step extrapolation reached its destination and froze until the next packet; packet corrections could snap displayed units backward. Added bounded per-actor authoritative sample history (five samples, WeakMaps), delayed interpolation across real step boundaries and sampled attack/death/facing/strike presentation. A monotonic render cursor never advances beyond received positions and never updates engine state. Recovery/full frames reset history. This deliberately trades approximately150–350ms of presentation buffering for continuity; commands and authoritative health remain immediate.
2. Failed live sends mutated delta history and reset it to a full army. Transactional frame building now commits history only when queuing succeeds. Skipped updates accumulate changes and tombstones instead of amplifying congestion with700 created actors. A focused test reproduces dropped tombstone delivery without full retransmission.
3. Up to256KiB of checkpoint chunks could queue in front of live messages. Bulk writes now stop at32KiB and yield every four chunks. Ordinary live/control packets retain their original bounds, authentication and byte limits. Checkpoint durability/acknowledgements and reconnection behavior are preserved. No new transport or server-side soldier simulation.
4. Small live encode/decode jobs shared a Worker with multi-megabyte snapshot work. Two bounded Worker lanes now isolate small frame jobs from heavy checkpoint processing. Failures reject/fallback only jobs in the affected lane. A focused test verifies that a live frame completes while checkpoint work is pending. Large live/full frames may still use the heavy lane; this is not a universal QoS guarantee.
5. Frame deadlines now retain their150ms phase rather than repeatedly slipping to200ms when the50ms host timer slightly misses the threshold. No catch-up burst is queued.

## Evidence

Local Chromium, seed73, actual176×128 terrain, current700-soldier recruitment/equipment/combat, two browser contexts,20s measured. Real Socket.IO, IndexedDB, browser Workers, rendering and engine. The existing ordered RTC stand-in uses Python/Playwright bindings; these data **are not real WebRTC bandwidth, Internet RTT or physical mobile measurements**. Delivery of chunks through that stand-in adds serialization/IPC overhead.

Raw before/after: `measurements/online-smoothness-before.json`, `online-smoothness-after.json`. Participant receive gap p95 **492.7→251.4ms**, maximum **869.7→407.2ms**. Receive routine p95 **23.9→24.0ms**: compression/processing was not magically eliminated. Participant >50ms long tasks **7→3**, remaining53/54/54ms in this run. RAF p95 stays about33.3ms; the game deliberately caps Canvas drawing at30fps. After-change median rendered rate is about29.6fps (window range27.5–30.4), independent of sparse state arrivals. Diagnostics measure RAF and actual Canvas calls separately. Additional initial unseeded experiments are not used as controlled before/after evidence.

`online-smoothness-mobile.json` uses a390×844 Chromium viewport and a synthetic20ms delay per transport message/chunk. This is a stress model, **not20ms network RTT**, a phone, or a loss/reordering test. It exercises the same full700-unit engine and actual presentation module. No visual-quality reduction was used to improve performance.

Node22: online regression suite passed96 tests before the final Worker-lane test; final full suite **402 tests /373 pass /29 known failures**, no new failing names relative to documented main failures. New tests cover cross-step interpolation, immutable engine state, attack/death/recovery boundaries, retained unsent deltas/tombstones, and independent Worker lanes. Existing enabled/disabled perf-HUD tests pass. Subsequent metric-only adjustment includes presentation-history insertion in frame-apply timing.

700-soldier two-browser E2E passed: owned deployment, guest commands, actual combat damage, pause/resume, durable checkpoint, host recovery from guest IndexedDB after deleting host backup, guest reload, final victory/defeat, mobile bounds, leave and single-player resume. This uses the documented test-only RTC; no page errors.

## Remaining limitations / concrete blockers

**Full resolution on real participants is not established.** Local runs still have occasional long tasks and receive gaps up to407ms. The buffer can drain during longer stalls; it freezes at known state rather than inventing future movement. Synchronous consistent snapshot capture measured25–44ms on host, and ordered bulk traffic/stand-in delivery can still delay frames. Attributing remaining guest53–54ms tasks to one function requires a browser CPU trace; they are not proven to be rendering, GC or packet parsing individually. Closely zoomed rig performance is not certified by the overview benchmark.

Native RTC probe in this managed Chromium returned **zero ICE candidates, gathering complete**, after5s with the existing STUN configuration. Consequently native WAN/NAT/bandwidth/jitter verification cannot be completed here. No TURN/service infrastructure or browser security-policy bypass was added. Physical Samsung/Android/iOS verification remains outstanding. Claiming complete mobile or Internet resolution from these tests would be incorrect.

## Reproduce and investigate further

1. Node22: `npm ci`, `npm start`.
2. `CHROMIUM_EXECUTABLE=/usr/bin/chromium OUTPUT=/tmp/result.json python3 scripts/diagnose_online_stutter.py`. Script fixes seed73, fills both current armies to350 each and runs real commands. Optional `VIEW_WIDTH=390 VIEW_HEIGHT=844 SIM_LATENCY_MS=20 MEASURE_MS=20000`. The script's RTC stand-in is test-only. Run baseline78fd680 on another port and point `BASE_URL` there for an equivalent comparison.
3. On two real devices open `/?perf=1`, create/join a room, deploy350 each and attack. Record normal and close-up views with checkpoints enabled. Export `JSON.stringify(window.__flowerWarsPerf.read())` and a60s browser Performance trace covering a visible stall. Keep device/browser/zoom/DPR/connection details with the report.
4. HUD/reports include actual render FPS, interpolation buffer/lag, skipped sends, RTC buffered bytes, TX/RX apply gaps, frame age, apply time, terrain/overlay/unit/loop cost. `read()` retains up to120 bounded reporting windows. Disabled HUD allocates no samples/DOM or observers; presentation sampling is functional gameplay rendering, not diagnostic overhead.
5. Correlate a stall with frame age/buffer exhaustion, Worker checkpoint stages and the CPU trace before changing algorithms. Extend impairment experiments for real constrained uplinks/long packet loss only after native transport access is available. Do not infer real-network success from the stand-in.

Final focused rerun after the metric adjustment: **97 online tests passed**, no failures. Diagnostics additionally time the actual packed-IndexedDB write path in the browser harness.
