# Online stutter diagnosis

This is a diagnosis; no gameplay, rendering, transport or checkpoint code was changed.

700 actual soldiers, 176×128 terrain, existing UI/rendering/combat, host and guest in Chromium, 20 seconds of moving armies. Socket.IO is real and local. WebRTC is replaced with the existing ordered test transport because this environment blocks native RTC UDP. These measurements demonstrate local causes, not the latency or throughput of the deployed Render service, real NAT links, or mobile devices. The two runs use separately generated maps; this is not a controlled same-seed combat benchmark.

## Confirmed causes

1. **Guest presentation advances only when network state arrives.** `OnlineSession.tick()` attempts frames at intervals >=150ms, checked by a 50ms timer. `receive()` immediately applies authoritative `visualX`, `visualY`, elapsed and board time; the app does not interpolate or animate between received states. In the baseline, median frame interval was **197.5ms**, p95 **327.6ms**, maximum **410.4ms**. The guest sampled a moving soldier on 1,162 animation callbacks, but its displayed movement state changed only **102 times in 20 seconds**. Rendering more often cannot fix repeated identical state. The host itself advances at 20 simulation ticks/second, also without presentation interpolation.
2. **Periodic full checkpoints block both browser main threads.** Every ~5 seconds the host encodes a multi-megabyte object graph, stringifies/hashes it, validates it again in `SnapshotBackup.put()`, writes IndexedDB, then encodes/compresses/transmits. The guest validates, decodes/inspects the graph, then validates again in `put()`. Baseline long tasks were **232–256ms on host** and **206–258ms on guest**. In a runtime-only ablation disabling periodic checkpoints after initial synchronization, both sides had **zero >50ms long tasks** and maximum animation-callback intervals of **16.8ms**. The guest still changed movement only **102 times in 20 seconds**, with **199ms median** packet intervals: checkpoint stalls and low presentation rate are distinct issues. Checkpoints must not simply be removed in production; recovery depends on them.
3. **Recovery and live traffic share queues.** Reliable ordered DataChannel chunks can delay frames on constrained links. The guest also serializes frame handling behind checkpoint validation and storage via `this.messages`. The first is a code-level risk, not a measured WAN bottleneck here. Additionally, host tick dt is capped at 50ms, so time lost in long stalls is discarded rather than caught up; this can slow authoritative simulation under load.

Ordinary browser animation callbacks were inexpensive in this overview scenario: p95 **3.3ms host / 3.5ms guest**; host engine update p95 **6.1ms**. This does not rule out expensive close-up rendering on mobile. It rules out treating all observed stepping as a low render-FPS problem.

## Evidence and next correction

- [Baseline](measurements/online-stutter-baseline.json)
- [Periodic-checkpoint ablation](measurements/online-stutter-no-checkpoint.json)
- Reproduce: `python3 scripts/diagnose_online_stutter.py`; repeat with `DIAG_NO_CHECKPOINT=1`. This ablation modifies only the test session in browser memory.

Correct presentation with bounded render interpolation independent of authoritative state. Reduce repeated checkpoint traversal/validation and schedule bounded work so recovery does not block live presentation or frame application. Preserve durable acknowledgements and restore validation. Do not address this by blindly increasing network frame frequency, deleting backups or changing unit speeds. Actual Internet/WebRTC throughput and zoomed mobile performance still require device-side measurements.
