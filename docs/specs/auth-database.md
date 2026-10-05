# Auth and database (deferred)

## Purpose
Reserve persistent identity and application data for the Supabase direction established in the architecture.

## Scope and responsibilities
Eventually Supabase Auth identifies players; Postgres stores profiles, stats, and match history. The game server verifies login tokens. Server-owned results become the source for persistent competitive stats.

## Technical decisions and assumptions
The current player is an anonymous Colyseus session held in memory for a ten-second reconnect window. No database schema, migration or account setup is needed in this slice; existing Supabase dependencies are unused by gameplay. Never store realtime positions, projectiles, collisions, or active rooms in Supabase. Future browser configuration is public; service credentials belong only on the backend.

## Initial MVP requirements
Multiplayer runs without accounts, credentials or persistence. An optional public game-server endpoint is the only frontend configuration. Before database integration, specify token verification, access policies, ownership, and a minimal schema with authorization tests.

## Out of scope now
Supabase integration, authentication, profiles, persistence, leaderboards, cosmetics, inventory, ads, purchases, and database provisioning.

## Future upgrades
Add identity and only the persistence required by an agreed feature. Define retention, deletion, and trusted match-result writes before collecting player data.
