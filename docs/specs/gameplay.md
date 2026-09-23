# Gameplay

## Purpose
Prove that moving, aiming, and shooting a ball feels clear in a browser arena.

## Scope and responsibilities
One local player, a rectangular arena, projectiles, stationary targets, and a reset action. Gameplay owns movement, boundary checks, hits, health, and projectile lifetime.

## Technical decisions and assumptions
- Fixed 960 x 640 logical canvas; arena interior spans (48, 80) to (912, 592).
- WASD movement at 220 units/second; normalize diagonals and clamp the entire player circle inside the arena. No inertia.
- Mouse aims independently of movement. Each left click fires one shot; no held-button autofire. A 150 ms cooldown limits firing.
- Player radius 16; cannon muzzle 28 units from center; projectile radius 4, speed 520 units/second, lifetime 1.2 seconds.
- Four stationary dummies, radius 20, three health each. A projectile deals one damage and disappears on the first hit. Destroyed targets disappear; remaining count updates.
- Dummies do not block movement or attack. Player has no damage/death behavior. R resets the entire practice arena.
- Local simulation uses plain TypeScript state and input intent, separate from Phaser rendering. Simple swept segment/circle hits prevent fast projectiles skipping targets. No physics engine.
- Clamp a frame's simulation delta to 50 ms; background tabs pause instead of catching up.

## Initial MVP requirements
Move in every direction at equal speed; stop at each wall; aim through 360 degrees; fire from the attached cannon; remove shots at the boundary or timeout; damage and destroy all four targets; reset repeatedly without stale shots or state.

## Out of scope now
Multiplayer, AI, scoring, matchmaking, pickups, complex physics, procedural maps, Unity ports, sound, and effects systems.

## Future upgrades
Tune movement and weapon values after playtesting. Move gameplay authority to the planned server before competitive play; decide tick rate and prediction in the networking spec first.
