# Game server (deferred)

## Purpose
Eventually own authoritative realtime gameplay, following the root architecture.

## Scope and responsibilities
Future `apps/game-server`: Node.js, TypeScript, Colyseus rooms and in-memory simulation. The server will validate movement and firing and own collisions, damage, death, respawn, score, and match outcomes.

## Technical decisions and assumptions
One Google Compute Engine VM initially. Clients submit intent, never trusted positions or hit results. Active room state stays in server memory, not the persistent database. Current local simulation is provisional, not multiplayer authority. Room size, tick rate, and match rules remain undecided.

## Initial MVP requirements
For this slice: a reserved directory and this spec only. Before the multiplayer MVP: specify room lifecycle, input validation/rate limits, disconnect behavior, authoritative simulation, and tests before implementing them.

## Out of scope now
All server runtime code and Colyseus dependencies; matchmaking, Redis, distributed rooms, bots, load balancing, Kubernetes, and scaling infrastructure.

## Future upgrades
Measure CPU, bandwidth, and latency; scale the single VM vertically first. Introduce Redis/room discovery and multiple servers only after measured need. Production deployment can later use Docker and Artifact Registry.
