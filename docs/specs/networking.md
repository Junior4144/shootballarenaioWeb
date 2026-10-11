# Networking

Colyseus WebSockets; protocol v9; room arena. Default ws://127.0.0.1:2567,
configurable through public VITE_GAME_SERVER_URL. Join with version 9 and mode
guest/account. Account joins include an accessToken validated by the server;
client-supplied user IDs are never trusted. No connection precedes a Play choice.

Exact input: seq, moveX, moveY, aim { x, y }, fire, radar, sprint. Axes are -1/0/1,
fire/radar/sprint are booleans, aim is finite and inside the arena bounds, sequence
is a nonnegative safe integer increasing per connection. Never accept client
positions, health, hits, scores, equipment, bot decisions or pickup claims.

Schema state includes simulation time/tick/generation, players (including bot
flag, HP/life/protection/respawn, points/kills/botKills/deaths, weapon/ammo/speed,
radar cooldown/captured markers), owned damaging projectiles, pickups, bounded
sequenced events and match state/results. Optional identities map session IDs to
guest/account labels and public names; no account UUIDs, emails or credentials
are broadcast. Legacy targets array remains empty.
Static cover is a shared versioned map. Radar is guidance, not fog-of-war security;
full arena positions are already replicated.

30 Hz intent, 60 Hz simulation, 20 Hz Schema patches. Preserve bounded 100 ms interpolation,
shortest-angle rotation, no extrapolation, focus/connection clearing and 250 ms
input expiry. Discrete gameplay/events share the delayed shot timeline. Life
changes hold then snap; snapshot generation changes clear interpolation history.
Events are deduplicated and historical feedback is skipped on connection recovery.

Protocol v9 replaces full MessagePack snapshot broadcasts with Colyseus Schema.
Join/reconnect receives full state; subsequent patches contain changed properties.
The server reconciles public simulation snapshots into stable Schema entities in
onBeforePatch. The client converts each complete state update to independent plain
objects before buffering it, preserving previous interpolation frames. Bounded
event history and public identities remain part of state. No precision reduction
or change to simulation/input/update cadence is included.

Release matching server and frontend builds together; v8 clients fail the protocol
check and must refresh. Smoke clients use observeSnapshots instead of the removed
snapshot message. Measure locally with
`node --import tsx scripts/measure-bandwidth.mjs --local 60`, or replace --local
with the game endpoint. The report compares received payload bytes against the old
MessagePack format encoded from exactly the same states; it excludes initial
handshake/full state, assets, outbound traffic, and transport overhead.

Auto-reconnect/refresh/Leave-Join preserve the tab's reserved identity and combat
state for ten seconds (account seats also end at access-token expiry). Page
refresh waits for another Play choice. Account resume revalidates the saved
server token; `refreshAuth` verifies new tokens against the same subject and
`authError` ends rejected sessions. Identity changes/signout clear all resume
tokens. Expired seats yield a visible error and fresh retry. Never log tokens.
See [accounts](auth-database.md) for token lifetime and privacy boundaries.

Contracts and acceptance: [GL-01](../integrationspec/game-loop.md).
Verification evidence: [log](../integrationspec/verification.md).

If an explicitly chosen guest session cannot resume (for example, after a server
restart or room disposal), discard its stale token and attempt one fresh guest
join within the same Play action. Both requests have bounded timeouts; a failed
fresh join returns an actionable error with Join / Retry. Cancellation or an
identity change prevents the fallback. Account reconnection failures never use
this guest fallback.

Protocol v8 replaces round/remaining/durationSeconds with match.elapsedSeconds. Matches never end on time or restart automatically. Match standings remain frozen through player departures. See [matchmaking](matchmaking.md).
