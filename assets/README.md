# Doragami — Gynari Warrior prototype assets

Transparent image layers cut from an original generated sprite sheet, prepared for the FlowerWars-MINI remake.

## Structure

- `assets/units/gynari-warrior/`: head, head_deco, torso with built-in yellow sleeves, separate wrist/hand sources, alternate wrist poses, separate feet, shadow, and `rig.json`.
- `assets/equipment/weapons/basic_sword.webp`: standalone sword. Do **not** merge sword pixels into the hand asset.
- `.webp` files retain the approved painted artwork. `hand_back.webp` has an alpha-only trim to remove the duplicate sleeve and the two protruding wrist outline ends, preserving its dimensions and retained pixels in lossless WebP.

## Rendering

- Treat the **bottom of the feet** as the board cell pivot.
- `rig.json` v5 matches the supplied character motif on a 1000×1500 artboard: a head slightly smaller than the reference relative to the tunic, a steeper leaf, compact cuffs and a wider short-boot stance. Preserve source image aspect ratios when resizing parts. Canvas assembly lives in `src/render.mjs`.
- The torso already has yellow sleeves. The weapon-hand source still includes a yellow sleeve, while the free-hand source is trimmed to the wrist. Normalized `clip` polygons keep both draws within the cuff/palm boundary so no duplicate shoulder is drawn.
- The free wrist mask also trims the two protruding ends of the old sleeve outline. Its image is tucked farther under the torso sleeve while its pivot stays at the same sleeve attachment, keeping the trimmed edge covered during motion.
- `hand_back` and `hand_front` identify assembly roles; each role chooses the source image whose wrist points outward on that side.
- Wrists rotate at their sleeve attachment; the weapon forearm passes behind the tunic and the free cuff overlaps its front edge. The separate sword rotates around the palm grip and inherits the same arm transformation. The face and leaf hair share one neck transformation.
- Head decoration is drawn behind the face, then its `front_clip` region is drawn over the crown. This keeps the rear petal/stem behind the head without changing the artwork or leaf size.
- The decoration is registered inward and downward so the small rear petal's inner edge overlaps the head outline instead of leaving a transparent wedge at the join.
- Boots are partly covered by the tunic; walk rotation and lift keep their roots inside it. Shadow stays on the foot contact plane.
- Runtime states `idle`, `walk`, `attack`, `hit` animate this rig; the board model owns positions and impact timing.
- Render board tilt separately. Do **not** skew characters with the board.

Validate both facings and enlarged idle/walk/attack/hit poses when changing these coordinates. `tests/rig.test.mjs` covers motif silhouette proportions and arm order, head decoration occlusion, sleeve masks, shoulder/neck attachments, boot overlap and sword grip continuity. `tests/rig-browser.py` checks actual rendered pixels at the ornament seam and wrist outline in both facings and all four states. There is no separate rear-view artwork.
