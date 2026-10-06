# Authoritative game server

Node.js/Colyseus directly through npm. Eight anonymous human seats per arena;
bots do not consume seats. Overflow creates another room. Shared TypeScript owns
movement, cover collisions, weapons, damage/death, respawn/protection, pickups,
bot navigation/combat, points, radar and match/results/rematch phases.

60 Hz simulation with three catch-up steps maximum; 20 Hz full snapshots and
lifecycle publication. Timers use simulation time. Inputs expire after 250 ms.
Unexpected disconnect clears controls but retains vulnerable avatars and fired
shots for a ten-second reservation. Reconnect never restores health or resets
scores/loadout/cooldowns. Dead away avatars wait for reconnect before spawning.
Empty rooms dispose; all state is in memory.

Protocol v3 admission, strict finite/bounded intent, monotonic sequences, 1 KiB
input payload cap, 60 accepted messages/second. Fire and radar are consumed once
per tick, without unbounded queues. No reset handler. Test-only rule overrides
are supplied in server constructors, never read from join options or messages.

Rules/dependencies: [GL-01](../integrationspec/game-loop.md).
Evidence and remaining verification limits: [log](../integrationspec/verification.md).
No cloud deployment, Docker, persistence or distributed infrastructure in this slice.
