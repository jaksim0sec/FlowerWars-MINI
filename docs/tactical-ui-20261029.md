# Tactical interface revision

Based on requested branch `fix/online-stutter-presentation-20261028` at c68c66d, not main. Only interface files changed. Navigation, simulation, unit data, checkpoint Worker, storage, network sessions, peer transport and rendering/extrapolation were left intact.

Consolidated hundreds of historical HUD/roster/order/deployment overrides into `src/tactical-ui.css`. Cream surfaces, restrained gold targeting/selection and a small wood-colored platoon heading replace dark blurred panels and repeated round buttons. Stable commander cards retain live portraits, type badges, actual troops and action. Touch controls are generally 44px; information uses rem units. Formation editing replaces the command panel; five orders remain open after issuing. Targeting and current action have separate feedback. Deployment shows the selected blueprint count and reserve, without fixed troop assumptions. Explicit camera fit measures visible interface bounds. Online readiness explanations and visible command rejection/pending feedback use existing session information without altering transport.

## Validation

- Node 22 online suite: 89 passed, zero failed. This is not a claim that the pre-existing full-suite failures were resolved.
- `tests/tactical-ui-browser.py`: preparation, actual deployed roster, selection, rally, formation replacement, target and cancel at 320×568, 390×844, 568×320, 1280×800; no page errors or horizontal page overflow. Captures in `ui-captures/`. The fixture installs an existing real Board/FlagMatch via its view bridge; it does not fake card data.
- Two-client lobby/invite regression run against the local server.
- `ui-captures/performance.json`: existing c68c66d on port10003 vs new UI on port10002, same seed73/700 real soldiers advancing in battle, 5 seconds RAF sampling per viewport. Mobile-sized Chromium p95 16.7→16.8ms; desktop 33.3→16.8ms. Short local smoke measurements, not statistically established performance gains, GPU frame times, Internet latency, or actual phone results.
- Offline bundle regenerated. No new dependency or external asset.

## Limits

The two uploaded files contained a design handoff and asset README, not the referenced PNG sheets or four original reference images. Existing game art and SVG assets were reused. Samsung Internet and physical Galaxy S22 validation were unavailable. Sustained 700-unit combat, real WebRTC, reconnect races, full offline gameplay and every victory/death state were not revalidated for this UI-only task. Existing unrelated development defects were intentionally left untouched.
