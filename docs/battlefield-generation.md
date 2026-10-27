# Seeded battlefield generation

The match board is 144×112 (previously 100×100). Flag separation increases from 91 to 133 tiles. Unit counts, speeds, combat ranges and formation spacing remain in tiles, unchanged.

`createBattlefield()` builds a bounded central oval, broad opposing approaches (9–11 tiles), two flanking roads (about 5 tiles), and four narrow side entries (about 3 tiles). Six irregular lake lobes partially surround the central clearing. Protected roads, clearing and deployment grounds override lake placement; the lake boundary never randomly closes a required route. Open peripheral ground remains available, so these are guaranteed options rather than mandatory scripted paths.

A seeded PRNG varies the outer road height, central clearing dimensions, main approach bend/width, side entry position and lake shape. Features are paired with 180-degree rotational symmetry to balance both kingdoms while avoiding one unchanging layout. The same seed reproduces the board. The reference image is a tactical reference, not an exact template.

Generation runs once on match creation, using a bounded number of segment/ellipse checks per tile. Existing viewport terrain caching, global 5×2 texture variant phase and boundary rendering are unchanged. No new frame-loop terrain work or dependencies were added. Bot strategy coordinates, territory boundaries, overlay and camera fitting now use board dimensions; doctrine lane selection follows generated flank heights.

Validation: 32 seeds have distinct, rotationally balanced terrain; all walkable tiles, both flags and protected routes are connected; all 350 bot troops deploy in each seed. Eight terrain generation/rendering tests pass. This checks generation constraints, not live battle balance or mobile FPS.
