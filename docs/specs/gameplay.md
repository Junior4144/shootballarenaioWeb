# Gameplay

The game is a points-based free-for-all: fight humans and bots, collect upgrades,
scan for opportunities, reach 1,000 points, view final placement, and return to the main menu.

Human kills award 100 points, bot kills 20, ground orbs 5. Matches have no time limit. Reaching the score threshold freezes gameplay and final standings; no automatic restart occurs. Simultaneous tied top scores share victory. Death preserves points; choosing Play from the lobby after results enters a new match with fresh stats.

Keep independent movement/aim, click-to-fire, 100 HP, owner immunity, swept hits,
three-second human respawn, and brief spawn protection. Cover blocks movement
and shots. Bots navigate around it and fight humans; population shrinks as the
room fills. Human-only pickups supply score, limited-ammo weapons, healing and
speed boosts. Q scans nearby actors/pickups with a cooldown and frozen markers.

All outcomes remain server-authoritative. Disconnected avatars remain vulnerable;
reconnect preserves points, loadout, health and cooldowns in the existing reservation.
No client arena reset. Accounts retain a public display name; match history and persistent leaderboards remain out of scope.

Concrete values, implementation dependencies and acceptance tests live in
[GL-01](../integrationspec/game-loop.md); progress is in the [integration tracker](../integrationspec/README.md).
