# Master game configuration

Edit **`packages/shared/src/config.ts`**. The server and browser import this same
configuration. Existing `GAME`, `ARENA`, `LOOP`, `WEAPONS`, `BOT`, and `NETWORK`
exports are compatibility views; edit the master file, not those views.

| Section | Controls |
| --- | --- |
| `player` | Health, collision radius, speed, respawn and protection |
| `npc` | NPC health, speed, damage, fire rate, population and AI behavior |
| `match` | Duration, results screen duration, win condition and scoring |
| `weapons` / `projectile` | Weapon damage, cooldown, speed, life, pellets, spread, ammo, projectile radius and muzzle offset |
| `pickups` / `radar` | Healing, boosts, pickup timers, NPC drops and radar |
| `map` | Playable size, origin, walls, spawn points, pickup positions and grid |
| `practiceTargets` | Legacy target drill settings, separate from NPCs |
| `simulation` | Step cap, catch-up ticks, event retention and navigation clearance |
| `network` / `server` | Player capacity, tick/snapshot/input timing, reconnection, payload limits, host and default port |
| `presentation` | Viewport, camera smoothing, low-health threshold, effects, audio and kill feed |

Distances are world pixels, speeds are pixels/second, and times are seconds
unless the name ends in `Ms`. Weapon spread is radians. Player and NPC health
are independent; NPCs currently share the player's collision radius and base
weapon trajectory, with their own damage and fire cooldown.

## Common edits

- Player health: `player.health`.
- Sprint: `player.sprint` controls speed multiplier, stamina capacity, drain,
  regeneration, recovery delay and exhaustion recovery threshold. Defaults give
  1.25× speed for four seconds, with recovery starting after 0.8 seconds and
  restoring 20 stamina per second. Exhaustion requires 25 stamina to resume.
  Hold Shift while moving; the bottom-center stamina bar appears during sprint
  and hides when sprinting stops. Sprint stacks with speed pickups. Only human
  players sprint; stamina and movement are controlled by the server.
- NPC health: `npc.health`.
- Map size: `map.width` and `map.height` (currently 1600 by 1200).
- Point-based victory: `match.winCondition: 'points'` and `match.scoreLimit`.
- Kill-based victory: `match.winCondition: 'kills'` and `match.killsToWin`.
  Only human-player kills count toward this target; NPC kills still award points.
  The timer also ends the round. Winners and leaderboard order use the chosen
  metric; equal leading metrics produce a draw. Zero leading score/kills has no winner.
- Disable NPCs: `npc.enabled: false`. With NPCs enabled, they fill toward
  `targetPopulation`, up to `maxCount`, and appear only when humans are present.
  Defaults fill eight total slots: 1 human + 7 NPCs, 4 humans + 4 NPCs, or
  8 humans + no NPCs. Reconnecting humans keep their reserved slots until expiry.

The default 1600 by 1200 map includes 12 health pads and 8 speed pads, spread
throughout the arena. Their positions are editable under `map.pickupPads`.

NPC behavior variation is under `npc.ai.variation`: patrol destination offsets
and recent-area avoidance, decision/planning timer variation, and combat
maneuver duration, strafe strength and preferred-distance variation. NPCs pick
random patrol areas rather than following the spawn list in order. Combat
maneuvers hold for 0.8–2.2 seconds before choosing a new strafe direction,
strength and distance offset. Each life gets an independent random stream;
visibility, collision, retreat thresholds and weapon cooldowns still apply.

Walls, spawns and pickup pads use absolute coordinates. Resizing the map does
not stretch or relocate them. Update their positions too when shrinking it.
Blocked pickup pads are skipped. At least one spawn must be clear of walls.
Viewport dimensions control the canvas separately from the world; CSS/HTML
layout and decorative drawing details remain in the frontend.

## Applying changes and future editor integration

Restart both development processes after editing (`npm run dev`), and refresh
the browser. For production, rebuild and release both the server and frontend
from the same configuration (`npm run build`). `GAME_SERVER_PORT` and
`VITE_GAME_SERVER_URL` remain deployment environment overrides. There is no
live settings endpoint or settings UI yet.

`CONFIG` is serializable data and `GameConfig` is its TypeScript type. A future
editor can create a draft with `structuredClone(CONFIG)`, edit nested fields,
and call `validateConfig(draft)` from `@shootball/shared` to show field errors.
Validation checks finite/nonnegative numbers, key positive/integer limits,
timing relationships, viewport bounds and map/spawn viability. It runs at
startup too. The validator expects a typed config; an eventual HTTP endpoint
must also validate the incoming JSON shape and authorize changes on the server.
Do not mutate the running global config: compatibility views and existing
rooms are initialized at startup. Save an approved config and restart both
processes. Config values are public to clients; never put credentials here.

`npm run typecheck`, `npm test`, and `npm run build` verify changes. Numerical
collision tolerances, mathematical constants, protocol identifiers, colors,
and decorative artwork are implementation details, not gameplay settings.
