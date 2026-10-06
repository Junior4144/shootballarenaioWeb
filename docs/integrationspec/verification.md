# GL-01 verification log

Date: 2026-10-05. Code is implemented. Automated gates pass; visual/audio gate is open.

## Commands and results

| Check | Result |
| --- | --- |
| npm.cmd run typecheck | Passed: web and server |
| npm.cmd test | Passed: 33 tests (13 web, 20 server) |
| npm.cmd run build | Passed: static Vite frontend and bundled Node server |
| ARENA_TEST_ENDPOINT=ws://127.0.0.1:2568 with npm.cmd test | Passed: default-content real-client test against built server; other tests use isolated servers |
| git diff --check | Passed |
| Browser surface discovery | No apps/browsers available; cannot verify visual or audible behavior |

Tests require an unrestricted local shell in this agent environment because tsx
cannot read Windows user information in the filesystem sandbox. No test changes
cloud resources. Expected mismatch/expired-token/flood/oversize rejection logs
are part of transport tests. Production test server was local and stopped afterward.
Vite retains its Phaser bundle-size warning: about 1.38 MB minified / 376 KB gzip.

## Traceability

| Gate | Evidence |
| --- | --- |
| GL-01A | game-loop.test.ts: distinct point sources, score retention, threshold, frozen results, late joins, rematch, timer/ties/no winner |
| GL-01B | game-loop.test.ts: swept cover movement, axis sliding, clear/connected spawns, wall and muzzle collision precedence |
| GL-01C | game-loop.test.ts: solo bots move/shoot/damage, population scaling, kill rewards/drops, eligible collection and respawn/expiry |
| GL-01D | game-loop.test.ts: capped healing, timed nonstacking boost, death clears loadout but retains scan cooldown, weapon damage/ammo/spread/fallback, captured radar/range/repeat protection |
| GL-01E | feedback.test.ts and interpolation.test.ts: event replay prevention and round/life discontinuities; code/build verification for UI/audio |
| GL-01F | game-loop-network.test.ts: two human SDK clients with bots/cover, collectible points, radar, reconnect preservation, frozen results, synchronized rematch; default rules cannot be overridden by join options |
| Production artifact | game-loop-network.test.ts default-content case: two real SDK clients on built server, human shoots moving bots, points/drop/events replicated |
| Existing PvP | multiplayer.test.ts and pvp.test.ts: real human damage/death/respawn, score/hurt/dead reconnect, reset injection, input validation, auto reconnect, Leave/Join, refresh, expiry/capacity/transport limits |

Deterministic legacy PvP transport tests disable bots and cover only through a
server constructor, so background AI cannot invalidate exact HP assertions. The
separate default-content transport test exercises the actual arena. The round
transition transport test uses a four-second round and one-second results phase;
unit tests exercise the same rules. No five-minute browser session is claimed.

## Open manual checks

- Two browsers: desktop leaderboard at top right; narrow layout moves below arena;
  labels/HP/weapon ammo/scan cooldown/results remain readable.
- Fight around each cover block, collect each item, use Q, and verify frozen radar
  markers and objective hints. Check click aiming, resize and blur/focus behavior.
- Listen to shot/hit/death/pickup sounds after user interaction; toggle mute.
  Judge hit confirmation, death rings and kill-feed clarity during busy combat.
- Finish full-length rounds with 1, 2 and 4+ humans. Tune bot difficulty, pickup
  placement and point economy based on play, not automated-test success.
- Latency/jitter and long-session soak testing remain outside this local run.

## Known design limits

Anonymous new tabs can create unrelated identities. State expires with the room
or server. Radar is an information aid; full positions are already replicated.
Collision hulls around cover are conservatively square for circular avatars.
Bots use deterministic waypoint navigation; no advanced tactical AI is claimed.
