# Doragami — Gynari Warrior prototype assets

Transparent image layers cut from an original generated sprite sheet, prepared for the FlowerWars-MINI remake.

## Structure

- `assets/units/gynari-warrior/`: head, head_deco, torso with built-in yellow sleeves, separate wrist/hand sources, alternate wrist poses, separate feet, shadow, and `rig.json`.
- `assets/equipment/weapons/basic_sword.webp`: standalone sword. Do **not** merge sword pixels into the hand asset.
- `.webp` files are the existing approved game-use layers; their pixels are unchanged.

## Rendering

- Treat the **bottom of the feet** as the board cell pivot.
- `rig.json` v4 matches the supplied character motif on a 1000×1500 artboard: a head slightly smaller than the reference relative to the tunic, a steeper leaf, compact cuffs and a wider short-boot stance. Preserve source image aspect ratios when resizing parts. Canvas assembly lives in `src/render.mjs`.
- The torso already has yellow sleeves. Hand source images also contain a yellow sleeve: the normalized `clip` polygons keep only the cuff/palm so no duplicate shoulder is drawn.
- `hand_back` and `hand_front` identify assembly roles; each role chooses the source image whose wrist points outward on that side.
- Wrists rotate at their sleeve attachment; the weapon forearm passes behind the tunic and the free cuff overlaps its front edge. The separate sword rotates around the palm grip and inherits the same arm transformation. The face and leaf hair share one neck transformation.
- Head decoration is drawn behind the face, then its `front_clip` region is drawn over the crown. This keeps the rear petal/stem behind the head without changing the artwork or leaf size.
- Boots are partly covered by the tunic; walk rotation and lift keep their roots inside it. Shadow stays on the foot contact plane.
- Runtime states `idle`, `walk`, `attack`, `hit` animate this rig; the board model owns positions and impact timing.
- Render board tilt separately. Do **not** skew characters with the board.

Validate both facings and enlarged idle/walk/attack/hit poses when changing these coordinates. `tests/rig.test.mjs` covers motif silhouette proportions and arm order, head decoration occlusion, sleeve masks, shoulder/neck attachments, boot overlap and sword grip continuity. There is no separate rear-view artwork.
