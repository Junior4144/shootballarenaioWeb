# Networking

## Contract
Colyseus over WebSockets. `packages/protocol` owns version 1, room name,
input/reset validators and authoritative snapshot types. Default local endpoint:
`ws://127.0.0.1:2567`; public `VITE_GAME_SERVER_URL` overrides it.
Production requires WSS through the architecture's separate game host.

Join `practice` with `{ version: 1 }`. Input contains exactly `seq`,
`moveX`, `moveY`, `aim: { x, y }`, `fire`. Reset contains `seq`.
Both share a monotonically increasing sequence. Never accept client positions,
hits or health. Snapshots contain tick, reset generation, players (ID, position,
angle, connected), targets and projectiles (ID, owner). Full snapshots are
Colyseus messages at 20 Hz and on join/reconnect; schema patches are unnecessary
for this small bounded initial arena.

Client sends input at 30 Hz, consumes queued clicks once and sends neutral input
on blur/hidden tab. Server expires input after 250 ms. Render latest snapshots;
no prediction or interpolation yet. Localhost movement should appear within
200 ms. Measure internet latency before implementing prediction.

Unexpected loss disables input and displays reconnecting. Retry within the
ten-second reservation with the SDK token, stored only in tab-local session
storage (never URLs/logs). Refresh can reclaim the same avatar. Expired
reservation/server restart shows retry to join fresh. Explicit leave clears
token and state. Join failures are visible/retryable. No local-authority fallback.

## Acceptance
Two clients see matching room/player/shot/target state; peer play continues
during disconnect. Verify identity-preserving reconnect, expiry, fresh join,
protocol mismatch and malformed inputs. Payload cap 1 KiB.
Regional routing, prediction and delta compression remain deferred.

## Implementation status (2026-10-05)
Colyseus core 0.18.18, WS transport 0.18.4 and SDK 0.18.5 are installed and locked.
Real WebSocket tests passed for synchronization, shared damage, input validation,
sub-200ms localhost movement visibility, reconnect/refresh, stale-token retry,
expiry, capacity, rate flooding and payload limits. The actual frontend connection
controller is exercised in integration tests. No live browser surface was
available for visual verification; UI rendering/resize/focus checks remain manual.
API reference: [Colyseus reconnection](https://docs.colyseus.io/room/reconnection).
