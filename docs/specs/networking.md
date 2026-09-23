# Networking (deferred)

## Purpose
Define the future boundary between client intent and authoritative server state.

## Scope and responsibilities
Future `packages/protocol` owns versioned message definitions. The browser will connect directly to the game server over WSS; networking will handle connection state and synchronization.

## Technical decisions and assumptions
- Follow the architecture: `wss://game.shootballarena.com` routes to the Compute Engine VM through Caddy or nginx, not Vercel functions.
- Send movement, aim, and fire intent; receive authoritative world state. The present local input type is not a wire protocol.
- Do not choose tick/snapshot rates, prediction, serialization details, or reconnect semantics without multiplayer requirements and measurements.

## Initial MVP requirements
Current slice runs entirely locally with no network gameplay traffic or protocol dependencies. Before multiplayer work, specify message validation, payload/rate limits, version compatibility, disconnect handling, and latency acceptance tests.

## Out of scope now
Colyseus client, sockets, matchmaking, prediction/reconciliation, interpolation, room discovery, Redis, multi-region routing, and dedicated networking abstractions.

## Future upgrades
Add interpolation and then prediction if latency measurements justify them. Preserve per-process room ownership when later designing multi-server routing.
