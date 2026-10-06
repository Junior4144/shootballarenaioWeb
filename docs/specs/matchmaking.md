# Matchmaking and main menu

## Implemented behavior

Account or guest entry opens the local main-menu lobby. It is not a network room and does not consume a player seat. Play calls Colyseus joinOrCreate for the arena type. Guest and account players share the same pool; the server verifies account credentials independently.

Open rooms are selected by connected/reserved human seats, fullest first. Each allows eight humans; bots occupy no human seats and shrink as humans arrive. Player nine creates another room when all eight seats in the first are occupied. More players continue to allocate rooms as needed. Reconnecting seats retain the existing ten-second reservation.

A match ends only when a human reaches the server-configured score threshold (1,000 points in production). No time limit and no automatic rematch. Simulation freezes and the room explicitly locks against new entrants. Final standings are immutable, including after participants leave. Clients see their own placement and select Return to main menu. Leaving clears the old token; the next Play chooses an open match. Empty rooms dispose automatically.

Protocol v8 carries elapsedSeconds instead of a round number, remaining countdown or duration. Deploy matching client/server versions together; old clients are rejected.

## Rooms versus servers

Current development uses a single Node/Colyseus process with in-memory presence and room listing. It can host multiple isolated rooms. Room overflow does not provision another VM, container or process, and does not prove a particular concurrent-user capacity.

Multi-process production scaling is still deployment work: shared Redis presence and a shared matchmaking driver, an externally reachable address for each game process, WebSocket-aware routing, health checks, graceful drain and measured autoscaling limits. Start additional processes behind that routing only after sharing their room listings/presence; independently starting default local servers does not create a global matchmaking pool. Redis/cluster credentials and production routing are not configured here.

References: [Colyseus matchmaking](https://docs.colyseus.io/matchmaker), [room locking](https://docs.colyseus.io/matchmaker/visibility), [shared driver](https://docs.colyseus.io/server/driver).

## Verification

Simulation tests cover play beyond five minutes, score threshold, frozen standings and no restart. Real SDK tests cover capacity overflow, state isolation, preserved reconnection, completed-room exclusion and zero scores in a new match. Browser tests cover lobby gating/account actions, placement presentation, returning to the menu and playing again at desktop/mobile sizes. Browser results use explicit presentation fixtures; server match completion is tested with real SDK clients and server-side test fixtures, without a production debug endpoint.
