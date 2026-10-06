# Networking

Colyseus WebSockets; protocol v3; room arena. Default ws://127.0.0.1:2567,
configurable through public VITE_GAME_SERVER_URL. Join with version 3.

Exact input: seq, moveX, moveY, aim { x, y }, fire, radar. Axes are -1/0/1,
fire/radar are booleans, aim is finite and inside the logical canvas, sequence
is a nonnegative safe integer increasing per connection. Never accept client
positions, health, hits, scores, equipment, bot decisions or pickup claims.

Full snapshots include simulation time/tick/generation, players (including bot
flag, HP/life/protection/respawn, points/kills/botKills/deaths, weapon/ammo/speed,
radar cooldown/captured markers), owned damaging projectiles, pickups, bounded
sequenced events and match state/results. Legacy targets array remains empty.
Static cover is a shared versioned map. Radar is guidance, not fog-of-war security;
full arena positions are already replicated.

30 Hz intent, 60 Hz simulation, 20 Hz snapshots. Preserve bounded 100 ms interpolation,
shortest-angle rotation, no extrapolation, focus/connection clearing and 250 ms
input expiry. Discrete gameplay/events share the delayed shot timeline. Life
changes hold then snap; round generation changes clear interpolation history.
Events are deduplicated and historical feedback is skipped on connection recovery.

Auto-reconnect/refresh/Leave-Join preserve the tab's reserved identity and combat
state for ten seconds. Expired tokens yield a visible error then allow fresh retry.
Never log tokens or place them in URLs. No persistent identity is claimed.

Contracts and acceptance: [GL-01](../integrationspec/game-loop.md).
Verification evidence: [log](../integrationspec/verification.md).
