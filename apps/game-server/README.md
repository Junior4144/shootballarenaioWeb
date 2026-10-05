# Game server

Implemented authoritative Colyseus shared practice. From the repository root,
run `npm run dev:server`; after `npm run build`, run `npm run start:server`.
Default local endpoint: `ws://127.0.0.1:2567`; override `GAME_SERVER_PORT` if needed.

Rooms, validation and reconnect rules are in the
[game-server spec](../../docs/specs/game-server.md).
Production packaging and cloud deployment remain deferred.
