# Command reliability implementation plan

**Goal:** Make squad orders interrupt obsolete orders, execute the named tactics, and expose who is receiving each order.
**Architecture:** Keep static browser modules and the conservative one-step reservation model. Squad orders own formation goals and tactical waypoints; Board accepts explicit replacement commands; navigation recovers around stationary crowds within the existing expansion budget.
**Tech stack:** JavaScript ES modules, Node tests, Python Playwright.

## Constraints and decisions
- Preserve ongoing step reservations; a replacement takes effect at the next safe step, without teleporting or overlapping units.
- Keep the existing individual neutral demo behavior.
- Flanking must use a lateral staging waypoint before approaching the destination; fortification must form a defensive line before holding it.
- User approved proceeding with: additive friendly selection, platoon selection, shared orders, visible members and destinations, desktop right click and touch buttons.
- Work in the existing clean `work` checkout. No deployment, push, or merge is required.

## Tasks
- [x] 1. Add failing regressions for replacement while walking/attacking, repeated same orders, and team movement surviving damage. Add explicit replacement support to Board and use it when squad orders change. Run squad, navigation, health and combat tests.
- [x] 2. Reproduce stationary crowd blocking an open bypass. Add bounded resumable recovery without exceeding 2048 expansions per navigation tick. Verify collision invariants and existing movement scenarios.
- [x] 3. Replace tactical aliases with flanking waypoints, defensive formation goals, and stationary firing positions. Validate targets before mutating an existing order; preserve distinct squad destinations in shared orders. Test actual paths, arrival and holding behavior.
- [x] 4. Implement approved selection/UI direction in app, HTML, CSS and renderer. Verify desktop and mobile input, selected units, target cancellation, multi-squad destinations and stale selection after reset.
- [x] 5. Run all Node tests and relevant browser scenarios, regenerate offline cache, review diff and document controls and limitations.

## Review focus
- Retarget during an in-flight step or strike must never lose occupancy/reservations.
- Targets occupied by friendly units must not permanently pin a formation.
- Multiple squads must not receive overlapping final slots.
- Dead commanders and reset selections must not silently receive commands.
- Camera drags, pinch gestures and target cancellation must not issue accidental orders.

## Execution evidence
- Initial regressions: all 7 failed against the original implementation; movement, targeting, damage, duplicates, stationary rank bypass, fortification and flank behavior reproduced.
- Extended regressions: moving follow targets, newcomer occupancy, in-flight strike cancellation, corner access and shared corner destinations.
- Independent review found corner deadlocks and UI-focus shortcut failure; both reproduced and covered by passing regressions.
- Decisions: preserve physical in-flight steps; fit whole formations and shared anchors inward near edges; retain legacy controls in debug with separate space above them.
- Verification commands and outcomes are recorded in the task completion response. No publishing, merging or external messages.
