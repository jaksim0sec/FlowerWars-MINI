# Purposeful bot armies

**Goal:** Build mutually supporting forces for a mission instead of cycling six squad types.
**Architecture:** Keep the existing player deployment templates and common order API. Cache enemy composition in the strategic survey, commit four-squad operations while spending reserves, and coordinate their actual positions during battle.
**Tech:** Existing JavaScript modules; no dependencies or additional simulation loop.

User has requested minimal discussion, autonomous implementation, and one final commit to main.

## Design

- Prefer deterministic, inspectable rules to random type cycling or an external model.
- Count living enemy shields, mobile infantry, ranged troops and healers in the existing shared survey.
- Each operation receives a persistent purpose, lane and complementary recipe: home defense, main attack, or flank. Every full operation has a screen, damage dealers and healing support.
- Enemy shield concentration adds archers; ranged concentration adds mobile assault; mobile infantry concentration adds shields and protected firepower.
- Keep preparation empty at entry. Both armies use the same templates and deployment validation, with a 500-person cap. Bot places an initial force and commits remaining reserves as player deployment grows; skipping fills reserves using current enemy composition. Already placed units stay in place.
- Combat support follows its own frontline and treats its wounded; it does not focus enemies or charge alone. Frontline pauses when support falls behind. Home defense intercepts flag threats without drawing the entire army back.
- Retreatment takes priority over attacking and persists until recovery. Surviving partners regroup if their original screen dies.

## Tasks

- [x] Add failing tests for opponent-dependent army composition, complementary operations, reserve adaptation and coherent placement.
- [x] Extend `src/bot-strategy.mjs` and integrate operation planning in `src/flag-match.mjs`.
- [x] Add failing tactical tests for close support, regrouping, wounded retreat and limited home defense response.
- [x] Implement shared-order coordination in `src/bot-tactics.mjs`; replace independent bot squad decisions.
- [x] Run the model suite, a short 1,000-soldier performance sample and the existing match entry smoke check. Regenerate offline files and update README.
- [ ] Commit all changes once and push to main.

## Review focus

Small/partial armies still deploy exactly; operations stay inside their half without overlaps; absent/late player deployment leaves adaptable reserves; dead leaders never crash decisions; tactical thinking stays staggered and never bypasses the navigation budget.

## Validation

194 model tests pass. Existing desktop/mobile match-entry flow passes. A 60-second simulation with 500 soldiers per side produced combat and forward movement without overlapping occupied/reserved cells; simulation update p95 approximately 3.9ms, navigation maximum 2048 expansions per tick (not browser FPS). Independent review checked deployment capacity for every army size 1–500. Review findings for banner-only remnants, recovery without healers and orphaned support were fixed with regression tests.
