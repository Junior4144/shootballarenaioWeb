# GL-01: Points-based arena loop

> Match lifecycle update (2026-10-06): the timed rounds and automatic rematches below are historical and superseded by [matchmaking and main menu](../specs/matchmaking.md). Production now uses first to 1,000 points with no time limit, permanent results, explicit Return to main menu and protocol v8. Combat/pickup/radar rules below remain applicable.

Status: implemented and automated acceptance verified; browser/audio playtesting remains open. Date: 2026-10-05.

## Scope and initial values
- Core loop: fight humans/bots, collect points/upgrades, scan for opportunities,
  win on points, view results, automatically rematch.
- 300 simulation seconds or 1,000 points. At end of a tick freeze combat and
  pickups, publish immutable human standings, and count down 10 seconds to rematch.
  Highest points wins; equal top points is a draw. Zero points = no winner.
  Bots never enter the human leaderboard or win. Humans joining during results
  wait for the next match. Reserved disconnected humans remain eligible.
- Human kill = 100 points; bot kill = 20; score orb = 5. Player kills and bot kills
  are separate counters. Death retains points and loses weapon/speed boost.
  Full rematch resets scores, health, life, pickups, radar, shots and timers for all
  retained identities. Round/generation prevents interpolation across resets.
- 100 HP, base weapon 25 damage, 150 ms cooldown, 520 speed, 1.2 s life. Preserve
  220 movement speed, owner immunity, three-second respawn and 1.5 s shield.
- Arena: fixed 960x640 with six cover blocks, open perimeter lanes, center crossings.
  Server movement uses swept expanded rectangles and axis sliding; conservative
  square collision hull around the circular avatar. Shots use swept wall and
  player collision, earliest contact wins; walls win ties. Muzzle sweep too.
- Bots: min(4, max(0, 6 - reserved human count)). No bots in empty rooms. Server
  steers through a visibility waypoint graph around expanded cover, seeks nearest
  living human, fires only within 440 units and line of sight, 850 ms cooldown,
  12 damage, 165 movement speed. Four-second respawn, 75 HP, same spawn shield.
  Bots cannot collect pickups, score or scan. Population changes never award kills.
- Fixed score orbs respawn in 8 s. Weapon/boost/health pads respawn in 15 s.
  Bot death drops two score orbs, lasting 12 s, capped at 32 dropped orbs.
  Human-only proximity collection (radius 28); nearest wins, ID breaks ties.
  Dead/away actors cannot collect; full-health players leave health packs untouched.
- Shotgun: 5 pellets x 12 damage, spread +/-0.24 radians, 0.6 s cooldown,
  450 projectile speed, 0.65 s lifetime, 8 shots of ammo.
- Heavy pistol: 50 damage, 0.55 s cooldown, 650 projectile speed, 1.0 s life,
  6 shots. Pickups replace the weapon/refill ammo; empty ammo returns to base gun.
- Speed pickup: +25% for 6 s, refresh rather than stack. Health pickup: +35,
  capped at 100. Weapon/speed/health pads have distinct labels and silhouettes.
- Q Radar Pulse: 12 s cooldown, 360-unit range, 3 s display. Server captures
  nearby living humans/bots and available pickups at activation. Show frozen
  positions/directions, never continuous tracking. Ready prompt plus nearest
  scanned objective hint. Cooldown persists through death/reconnect; rematch resets.
- Top-right HUD: human leaderboard with points, PvP kills, bot kills, active count,
  local highlight, away status. Side panel avoids blocking shots/canvas. Responsive
  layout moves panel below on small screens. Timer/goal, weapon/ammo/speed,
  HP/protection/death and Q readiness visible. Results include winner/draw and ranks.
- Feedback: authoritative sequenced bounded shot/hit/elimination/pickup events,
  brief hit flash, local hit confirmation, elimination ring, kill feed. Synthesized
  shooting/hit/death sounds unlocked on interaction, optional mute, no audio assets.

## Contracts and dependencies
- Protocol v3; exact input adds boolean radar, consumed once like fire. Clients
  never send score, bot decisions, pickups, damage, weapon state or radar results.
- Shared content types define match, pickup, radar and event payloads. Snapshot
  extends players with bot flag/points/botKills/weapon/ammo/speed/radar cooldown;
  adds match, pickups, events. Static cover is a versioned shared map.
- Radar samples belong to each actor; snapshots may contain them because this is
  an open-arena game with full positions already replicated. No secrecy claim.
- Timers run on authoritative fixed simulation time; results freeze combat. All
  events have monotonic IDs and simulation timestamps; presentation deduplicates,
  skips historical audio on first/reconnected snapshot, and expires effects.
- Maintain 60 Hz sim, 20 Hz snapshots, 30 Hz intent and 100 ms interpolation.
  Normal motion interpolates; life/round changes snap. Existing reconnect policy
  preserves all combat state. Bots do not occupy Colyseus human seats.
- Test-only rule overrides exist only in server constructors, never client join
  options. Deterministic PvP regressions can disable bots/cover; integration tests
  must separately exercise default content and both real client transports.

## Acceptance gates
A: point sources differ; no double credit; expiry/threshold/tie/results/rematch;
   no actions during results, scores frozen, joins/reconnects don't restart round.
B: cannot move/fire through cover at speed; closest collision; clear spawn/pickup
   positions and connected navigation graph; bot can route around cover.
C: population scales with humans; solo bot fights and yields points/orbs; collection
   occurs once, respawns, expires, never granted to dead/away actors.
D: weapon damage/ammo/cooldowns, nonstacking timed boost, capped health, radar
   range/frozen markers/cooldown and reconnect preservation; malformed input rejected.
E: top-right leaderboard, results, pickups, radar, effects/audio wired to server
   state; no lifecycle sliding or duplicate feedback on repeated snapshots.
F: typecheck, meaningful tests, both production builds; real clients exercise
   shared content and lifecycle; document browser/audio verification honestly.

## Implementation checkpoint
- A-D: implemented in shared/content.ts, arena.ts, bots.ts and practice.ts; server
  consumes strict v3 intent. Test-only constructor rules cannot be set by clients.
- E: implemented in ArenaHud, ArenaScene, CombatAudio and EventCursor. Automated
  timeline/deduplication checks pass; visual/audio assessment remains limited.
- F: 33 tests pass, including real WebSocket clients and default-content combat
  against the built Node artifact. Typechecking and both builds pass.
- Follow-up gate: manually play two browser clients, inspect desktop/narrow layouts,
  validate focus/aim/sound, and tune point economy/bot difficulty from play sessions.
- No scope was deferred from the accepted feature list; visual/audio verification
  and gameplay balance are not claimed complete. Accounts/persistence remain out of scope.
