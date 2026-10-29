# UI restore and autumn map integration

Target: `fix/online-stutter-presentation-20261028` at `492f2d4`.
Map/UI reference: main at `0d4e7a5`.

- Reversed only UI revision `2342416`, restoring index, styles and online menu exactly to main. Removed its dedicated stylesheet, snapshots and UI-only test.
- Applied the main autumn terrain/assets/cache/tests and its transient route-planner snapshot projection. Preserved the target's capture/seal Worker pipeline, Map handoff transfer, compression negotiation, background checkpoint handling, incremental spatial updates, guest presentation and performance diagnostics.
- Regenerated the offline manifest for this combined module set; no unresolved conflicts.
- Node22 targeted online/terrain/scenery/recovery tests: **109 passed, 0 failed**.
- Existing two-browser battle E2E passed: A/B deployment through UI, guest hold, actual combat HP, pause, host recovery from guest IndexedDB, guest recovery, both final outcomes, mobile bounds, room leave and single-player resume. This uses the documented ordered RTC test transport; native WAN/WebRTC connectivity was not measured.
- Main's terrain/combat measurements remain historical evidence, not new performance measurements of the combined branch. Its existing formation/performance limitations remain documented in `autumn-battlefield.md`.

Follow-up: removed the distant autumn forest background and its runtime image request, decoded image and offline cache entry. Battlefield terrain, rim props and online improvements remain unchanged.
