# Gameplay

## Purpose
Prove that moving, aiming, and shooting a ball feels clear in a browser arena.

## Scope and responsibilities
Up to eight guests share an arena, projectiles, stationary targets and reset. The server owns movement, boundaries, hits, health and projectile lifetime.

## Technical decisions and assumptions
- Fixed 960 x 640 logical canvas; arena interior spans (48, 80) to (912, 592).
- WASD movement at 220 units/second; normalize diagonals and clamp the entire player circle inside the arena. No inertia.
- Mouse aims independently of movement. Each left click fires one shot; no held-button autofire. A 150 ms cooldown limits firing.
- Player radius 16; cannon muzzle 28 units from center; projectile radius 4, speed 520 units/second, lifetime 1.2 seconds.
- Four stationary dummies, radius 20, three health each. A projectile deals one damage and disappears on the first hit. Destroyed targets disappear; remaining count updates.
- Dummies and players do not block movement or attack players. No player damage/death. R requests room-wide reset, limited to once per two seconds.
- Shared simulation uses plain TypeScript state, separate from Phaser rendering. Swept segment/circle hits prevent shots skipping targets. No physics engine. Server assigns shot IDs/owners.
- Server advances fixed 1/60-second ticks with bounded catch-up. Background clients stop input; the room continues. Input expires after 250 ms. Original simulation tests remain regression coverage.

## Initial MVP requirements
Move in every direction at equal speed; stop at each wall; aim through 360 degrees; fire from the attached cannon; remove shots at the boundary or timeout; damage and destroy all four targets; reset repeatedly without stale shots or state.

## Out of scope now
PvP, AI, scoring, custom matchmaking, pickups, complex physics, procedural maps, Unity ports, sound, and effects systems.

## Future upgrades
Tune movement and weapons after playtesting. Competitive play needs a separate specification for damage, death, respawn and match outcomes.
