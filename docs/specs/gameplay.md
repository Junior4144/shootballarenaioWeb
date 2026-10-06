# Gameplay

The game is a points-based free-for-all: fight humans and bots, collect upgrades,
scan for opportunities, win the round, and automatically rematch.

Human kills award 100 points, bot kills 20, ground orbs 5. A round ends at
1,000 points or five simulation minutes, followed by immutable results and a
ten-second rematch countdown. Equal top points is a draw; zero points has no
winner. Death preserves points; rematch resets round stats for retained identities.

Keep independent movement/aim, click-to-fire, 100 HP, owner immunity, swept hits,
three-second human respawn, and brief spawn protection. Cover blocks movement
and shots. Bots navigate around it and fight humans; population shrinks as the
room fills. Human-only pickups supply score, limited-ammo weapons, healing and
speed boosts. Q scans nearby actors/pickups with a cooldown and frozen markers.

All outcomes remain server-authoritative. Disconnected avatars remain vulnerable;
reconnect preserves points, loadout, health and cooldowns in the existing reservation.
No client arena reset. No accounts or persistent identity/persistent leaderboards.

Concrete values, implementation dependencies and acceptance tests live in
[GL-01](../integrationspec/game-loop.md); progress is in the [integration tracker](../integrationspec/README.md).
