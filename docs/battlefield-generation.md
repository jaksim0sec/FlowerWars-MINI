# Seeded battlefield generation

The 144×112 board retains the increased distance between kingdoms. The tactical layout follows the user's annotated diagram: two deployment grounds, bounded sortie throats, a large continuous central battle basin, crescent-shaped separating obstacles, and smaller outside flank routes with side entry gaps.

The previous generator produced large lake sectors with a road lattice carved through them. That topology has been replaced. The center now contains over 2,100 grass tiles within a 54×44 central sample, with no road lattice. The physical cross-section at either kingdom's gate contains exactly three openings: a central mouth 14–18 tiles wide and two flank apertures 6 tiles wide. An army can fight in the basin but cannot depart its kingdom in a single full-width front. The outer shoreline prevents bypassing the flank restriction along the map edge.

The separating lakes are polygonal crescent shores and tapered gate banks. Their ends expose flank-entry gaps; troops move around the shores into the central field. Only short kingdom approach roads are surfaced. Safety corridors are ordinary grass rather than bridges cutting through large lakes.

The seed varies gate position and width, flank height, crescent bend and tip positions. Terrain is rasterized in rotational pairs so both sides receive the same tactical opportunities, including exact polygon-edge handling. Generation runs once on match creation. Existing texture phase, terrain batching, viewport caching and movement/combat properties are preserved.

Validation: 32 distinct seeds satisfy connectivity, rotational balance, central battle-space size and actual gate/flank cross-section constraints. All 350 bot troops deploy on each seed. Eight focused terrain tests pass. An additional 100-seed connectivity check found no isolated walkable islands. A local offline overview was composited from the actual terrain atlas to inspect the resulting layout; this is not an in-browser performance measurement.
