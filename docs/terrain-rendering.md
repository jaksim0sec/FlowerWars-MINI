# Connected terrain pack

Imported from `FlowerWars_Terrain_Codex_Only.zip`. Original native WebP layers
(30 surfaces, 60 external wall layers) and nine optional decorations are kept
in `assets/world/terrain/`. Decorations are not automatically spawned.

`variant = 1 + (x % 5) + 5 * (y % 2)` uses global zero-based coordinates,
with the same origin for grass, soil and pond. No random variant selection.
Native layers are 144×107 with their 144×84 surface anchored at (72, 42).

Run `python3 scripts/build_terrain_atlas.py` (Pillow) after editing source layers.
It copies their pixels into one lossless WebP, with ten variants per row and
rows grouped by surface/wall_x/wall_y, then grass/soil/pond.
Runtime loads only that atlas, with no image warping or normalization.

Interior cells draw only the surface. +X walls appear only at x=width−1,
and +Y walls only at y=height−1. Different adjacent terrain materials use a
separate batched shoreline/land seam overlay, with each shared edge drawn once.
Forests and blocked cells remain impassable and render as pond, as before.

The existing viewport-sized padded canvas and camera reuse remain in place.
Surface, outer walls and transitions are baked together only on terrain,
viewport or camera invalidation. A stationary frame blits that canvas once.
There is no full-map canvas, per-frame shoreline scan, random placement,
or decoration/terrain animation. Native originals and optional decorations
are omitted from offline precaching; the atlas is included instead.

Verification: tile phase and edge rules have model tests. The real Canvas
cache test on a 128×128 map drew 237 visible cells on cache build, reused
one 4.8 MB backing canvas, and made one terrain draw per stationary frame.
