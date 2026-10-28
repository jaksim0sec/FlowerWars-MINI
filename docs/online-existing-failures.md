# Existing suite failures

All 30 names below fail before and after the multiplayer foundation. Original tests and combat behavior were not altered. Prior classification is in [targeted deployment report](targeted-deployment-fix.md); timing/configuration and genuine combat/formation failures remain unresolved.

- touching a flag does not win; soldiers must land real attacks and destroy its health
- automatic attacks acquire enemy flags without counting flags as soldiers
- simultaneous killing impacts draw in the same combat batch, without waiting for the status poll
- seeded enlarged battlefield keeps bases, central approaches and side entries connected
- full bot operations pair frontline, firepower and healing in one lane
- home defense intercepts intruders without recalling a distant attack operation
- rear breach promotes existing squads to guard within the flag leash
- mobile reserves exploit a gap, then react only to a serious home breach
- a middle front advances when there is no wing army to wait for
- emergency guard destinations stay inside the flag leash
- lost emergency guards are replaced with existing living squads
- clipped deployment A accepts half, retains a commander and charges only actual troops
- clipped deployment B accepts half, retains a commander and charges only actual troops
- retreat interrupts an unlanded strike without releasing an ongoing step reservation
- squad destinations on a large map start without serial full-map distance fields
- visible test classes have independent configured health, damage and attack speed
- automatic armies obey the 200 cap and deploy on their own half
- manual placement spends reserves atomically and rejects overlaps and enemy territory
- a vertical advance places the commander behind the front instead of beside it
- reform finds a clear footprint beside X rather than circling across blocked seats
- distant soldiers resume budgeted reform searches across ticks
- group template edits never mutate another group or future defaults
- healers restore injured allies, respect cooldown and never damage enemies
- injury changes neither movement duration nor attack damage
- step timing remains exact and simulation does not depend on a renderer
- an isolated long move follows a shortest route without a traffic lane detour
- a real ranged actor acquires an interpolating target across a bucket boundary
- 350 soldier armies keep one commander per squad and compact defense ranks
- partial troop previews exactly match actual soldiers, equipment and offsets
- assault template replaces shields and sword scouts with spear scouts
