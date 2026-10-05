# Game server

## First multiplayer slice
Shared target practice preserves the existing movement, aiming, shot and dummy
rules. Node.js and Colyseus run directly through npm in one process.

## Authority and lifecycle
- `practice` rooms admit eight anonymous guests via join-or-create; full rooms
  cause another room to be created. No persistent identity is claimed.
- Simulate at 60 Hz; publish full snapshots at 20 Hz. Fixed steps cap catch-up at
  three ticks per callback; overload slows simulation.
- Shared plain TypeScript simulation owns positions, aim, cooldowns, shots,
  swept collisions, dummy health and reset. Clients submit intent only.
- Distinct spawn slots along the left side. Players do not collide or damage
  each other. Four shared dummies. Server-issued shot IDs and owner IDs.
- R requests a room-wide reset of positions, cooldowns, shots and targets,
  limited to once per two seconds per room. Connected identities are preserved.
- Unexpected disconnect clears input and owned shots and dims the avatar.
  Reserve identity/position for ten seconds. Reconnect resumes with neutral
  input. Explicit leave or expiry removes the avatar. Empty rooms dispose.
- Input expires after 250 ms without accepted packets. Timers are disposed with
  rooms. Server restart loses rooms; clients can explicitly join a new room.

## Validation
Require protocol version on admission. Accept exact input/reset shapes only.
Reject nonfinite/out-of-range numbers, unknown keys, invalid flags and stale
sequence numbers. Axes are -1/0/1; aim stays within the logical canvas.
Payload limit 1 KiB; 60 accepted messages/second/client; shared monotonically
increasing safe integer sequence. Fire is consumed once per tick, never queued
in an unbounded buffer. Cooldown is server-owned.

## Acceptance
Test simulation, validation, two real WebSocket clients observing matching state,
shared damage, capacity/isolation, reset, stale input, explicit leave, reconnect
and expiry. Typecheck and build both apps. No cloud deployment.

## Deferred
PvP damage/death/respawn, scoring, match outcomes, auth, persistence, custom
matchmaking, bots, Redis, distributed rooms and production packaging.

## Implementation status (2026-10-05)
Implemented in `apps/game-server` with shared simulation in `packages/shared`.
Typechecking, simulation/protocol tests, real-client lifecycle/capacity tests and
production build passed. Two clients also verified the built server artifact.
Local startup: root `npm ci`, then `npm run dev` (both apps), or
`npm run dev:server` alone. After building, `npm run start:server`.
