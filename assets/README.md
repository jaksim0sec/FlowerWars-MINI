# Doragami — Gynari Warrior prototype assets

Transparent image layers cut from an original generated sprite sheet, prepared for the FlowerWars-MINI remake.

## Structure

- `assets/units/gynari-warrior/`: head, head_deco, body without arms, two separate short cuffs/hands, alternate wrist poses, separate feet, shadow, and `rig.json`.
- `assets/equipment/weapons/basic_sword.webp`: standalone sword. Do **not** merge sword pixels into the hand asset.
- `.png` are archival full-resolution crops, `.webp` are optimized game-use layers.

## Rendering

- Treat the **bottom of the feet** as the board cell pivot.
- Use normalized coordinates from `rig.json` on a 1000×1500 artboard. Keep each layer in absolute position.
- Change `font-size` on the containing unit to scale the whole rig (em coordinates).
- CSS states `idle`, `walk`, `attack`, `hit` animate individual layers; JS owns board coords, collision, combat and state changes.
- Move weapon and wrist independently, but keep their animation keyframes in sync around the grip anchor.
- Render board tilt separately. Do **not** skew characters with the board.

**Limitation:** This first-generation sheet uses independent cut assets and approximate assembly placements. It is not an animation-ready bone rig with tested pivots. Validate pose and seams in-browser before finalizing the rig.
