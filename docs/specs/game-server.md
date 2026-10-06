# Authoritative game server

Node.js/Colyseus directly through npm. Eight guest/account human seats per arena;
bots do not consume seats. Overflow creates another room. Shared TypeScript owns
movement, cover collisions, weapons, damage/death, respawn/protection, pickups,
bot navigation/combat, points, radar and match/results/rematch phases.

60 Hz simulation with three catch-up steps maximum; 20 Hz full snapshots and
lifecycle publication. Timers use simulation time. Inputs expire after 250 ms.
Unexpected disconnect clears controls but retains vulnerable avatars and fired
shots for a ten-second reservation. Reconnect never restores health or resets
scores/loadout/cooldowns. Dead away avatars wait for reconnect before spawning.
Empty rooms dispose; gameplay state is in memory. Account verification/profile
reads use hosted Supabase; see [auth](auth-database.md).

Protocol v7 admission, strict finite/bounded intent, monotonic sequences, 18 KiB
transport payload cap (for Auth refresh tokens), 60 accepted inputs/second. Fire and radar are consumed once
per tick, without unbounded queues. No reset handler. Test-only rule overrides
are supplied in server constructors, never read from join options or messages.

Rules/dependencies: [GL-01](../integrationspec/game-loop.md).
Evidence and remaining verification limits: [log](../integrationspec/verification.md).
Account tokens are verified at join, refresh and reconnect. Credentials never
fall back to guest on failure, and input stops at token expiry. Only public
identity labels enter snapshots. No cloud deployment, Docker, persistent match
data or distributed infrastructure in this slice.
