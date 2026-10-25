# Tactical foundation implementation

Implement the previously agreed engine improvements, using squad proposal as architectural guidance only. No squad UI/orders or healing/summoning added. Rally remains banner capability metadata for a future upper command layer. Preserve individual controls/rigs/offline support.

- [x] Fairness: seed-neutral priorities, collect/resolve/commit movement intents, aging conflict priority, batch scenario orders. Reproducible seed and mirror test controls. Canonical mirrored neighbor/lane ordering. Keep conservative source+destination locks.
- [x] Combat: retained valid targets, staggered acquisition, spatial buckets for ranged candidates, optional LOS after filtering, seeded equal-distance ties. Data ranges for archer/mage, local spacing behavior.
- [x] Traits: peractor movement timings/wait/yield from data, common routes unchanged; banner rally capability metadata only.
- [x] Verify full suite, mirror/name-swap fairness, 1000 actor movement/combat and offline browser, regenerate cache, review and main push.

Verification: 110 Node tests passed; randomized tie seeds choose both contenders, mirrored/name-swapped battle outcomes match at3seeds. Independent reviews found spacing-policy/manual-override/metric/stale-intent and obstacle-mirror issues: all reproduced and fixed with regressions. Batch reset also reproduced/fixed. 1000 actor movement/combat benchmark collision checks passed. Browser/offline verification and final cache regeneration follow before authorized push.

Final browser runs passed: tactics seed/mirror/ranged UI, navigation, combat, offline, standard desktop/touch, health, immersive rendering, five mobile sizes. Final spacing-hook damage continuation regression also RED→GREEN.
