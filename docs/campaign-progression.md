# FlowerWars MINI: campaign progression MVP

Branch: feat/campaign-progression-20261029  
Base: fix/online-stutter-presentation-20261028 at c68c66d  
Scope: single-player progression only. Do not merge into main without mobile verification.

## Player loop

1. Open **야영지** from the top left.
2. Own three starter squad types. Select up to four eligible types for deployment.
3. Improve one squad type with acorns and training materials. Choose one of two free-to-swap specialties.
4. Start a three-stage expedition. Battles use the existing FlagMatch and squad deployment UI (180 units per side).
5. Only the chosen types can be deployed during an expedition. Training, specialties, equipped banner and one-time supplies modify player units after deployment. Enemy units and multiplayer do not receive buffs.
6. Complete a match to earn acorns, materials, chest credits and one-time quest rewards. The next stage and resources save automatically.
7. Return to camp through the battle result panel. A lost battle ends that expedition, but persistent resources, cards and records stay.

A normal practice/debug match is unchanged (350 units per side). Online battle networking, P2P snapshots, AI and navigation are not modified.

## Economy (prototype tuning)

- Start: 90 acorns, 2 materials; defense/ranged/mixed squad types unlocked.
- Squad unlock: 100 acorns + 2 materials, or barracks chest.
- Training: levels 1–4. Next level costs 30 × current level acorns and current level materials. Each trained level above 1 gives +2.5% damage.
- Banner crafting: 95 acorns each. The effects have explicit tradeoffs.
- Chests: 65 acorns each; battle stages also award them. No purchases with real money, no paid randomness. The chest category determines a predictable reward.
- Victory: 35 + 10 × stage acorns, 2 materials. Defeat/draw: 12 acorns, 1 material.
- Each winning stage before the final grants 45 expedition supplies and 1 chest. Clearing stage 3 grants an additional 90 acorns, 2 chests and a medal.
- Expedition-only supplies can be spent once per upcoming battle: attack +7%, or health +8%, at a cost of 35 supplies.
- Quest rewards: first victory (+40 acorns), high flag health (+45), or deploy 3 distinct squad types (+40).

## Code ownership

- src/progression/core.mjs: persistent data, capped stat modifiers, three-stage state machine, idempotent settlement.
- src/progression/ui.mjs and ui.css: responsive camp interface. No framework and no render loop polling.
- src/app.mjs: small single-player battle adapter; only alters deployment and finished-result UI when campaignMode is enabled.
- tests/campaign-progression.test.mjs: model progression, reload, buff and duplicate-reward tests.
- tests/campaign-browser.py: 390px browser flow and deployment restrictions.
- .github/workflows/campaign-regression.yml: targeted CI; unrelated existing failing full-suite tests are not declared fixed.
- sw.js: campaign assets added to cache manifest. Regenerate with python3 scripts/build_offline.py when preparing a release.

## Known limits / next phase

- Progress is stored in browser localStorage only; browser data deletion loses progress. No server account, cloud sync, tamper-proof economy or cross-device transfer.
- There is no distinct new map, scenario, weather system, supply wagon or boss AI yet. Stage names provide the mission structure, but all three stages use the existing flag-siege victory condition and terrain generation.
- Card collection is presently squad-type based rather than individual named divisions. Advanced commander naming, per-division veteran history, equipment cards, tactical cards, cosmetics and animations are not implemented.
- The title/asset naming follows the existing game. Future work should consolidate the game's identity before production rollout.
- Validate on real Android hardware and two-peer multiplayer before release. Browser smoke is not a substitute for device performance testing.

## Manual acceptance

- Unlock a previously locked type, include it in lineup and verify the deployment button becomes available during the next campaign match.
- Choose each specialty, compare a deployed member's statistics, and confirm no campaign bonuses apply in a practice match.
- Complete three battles and verify one-time rewards, expedition stage persistence and medals.
- Lose a match and verify that only current expedition progress resets.
- Reopen the tab after one completed stage; verify resources and next stage persist.
- Create a host/guest match, ensure both remain at standard statistics and no campaign reward is granted.
