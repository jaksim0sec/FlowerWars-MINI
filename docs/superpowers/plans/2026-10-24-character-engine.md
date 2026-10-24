# Character engine implementation plan

Goal: Board-independent character instances, data-driven rigs, independent equipment and a usable sprout healer.
Architecture: Canvas ES modules; declarative scene graph and animation expressions in rig JSON; manifest-loaded character/equipment catalog. Board only supplies state and position. Preview imports the character engine directly.
Constraints: preserve warrior artwork and silhouette; no forced recommended equipment; left/right/dual/two-hand equip; instance-owned appearance/equipment/state; no backend or packages.

1. Test factory isolation, invalid equipment, equipment replacement, dual wield and shared two-hand ownership before implementation.
2. Implement independent instance/equipment API, expression animation evaluator and scene traversal with socket transforms; configurable secondary grip alignment.
3. Move warrior assembly/animation/layer order into its rig; keep drawWarrior as compatibility adapter. Add healer independent rig, green leaf/robe SVGs and standalone staff.
4. Adapt board rendering to catalog instances; provide healer summon choice and standalone character/equipment preview.
5. Verify unit suite, original warrior pixel regressions, interactive board/mobile checks and new preview loadout/attachment checks. Document registration and API.

Review focus: stale two-hand references, failed equip atomicity, missing assets, independent instances, mirrored/animated grip continuity.
