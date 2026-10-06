# Protocol

Version 3 wire types and strict intent validation for the authoritative arena.
Input adds a boolean radar pulse; server snapshots include round state, points,
bots, pickups, weapon/ammo/boost state, captured radar markers and sequenced events.
No reset or client-authored outcome messages. See [networking](../../docs/specs/networking.md)
and [GL-01 contracts](../../docs/integrationspec/game-loop.md).
