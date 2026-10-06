# ShootBall Arena

A playable points-based PvP arena game built with TypeScript, Vite, Phaser
and an authoritative Node.js/Colyseus server. Up to eight anonymous guests fight in
an arena with server-controlled bots, cover and collectible upgrades. No accounts, credentials, database or cloud services are needed.

## Run locally

Use Node.js 22.12+ (verified with Node 24.15) and npm. From the repository root:

```sh
npm ci
npm run dev
```

This starts both the game server at `ws://127.0.0.1:2567` and Vite, normally at
`http://127.0.0.1:5173`. Open **the URL Vite prints** in two separate tabs/windows
to play together. If 5173 is occupied, Vite chooses the next available port.
On Windows PowerShell, use `npm.cmd` if execution policy blocks `npm.ps1`.
Stop both processes with Ctrl+C. After updating the game/protocol, restart both
apps and refresh open tabs so client and server versions match.

### Browser acceptance tests

```sh
npx playwright install chromium
npm run test:e2e --workspace @shootball/web
```

Playwright starts an isolated Vite frontend on port 5189 and the real Node/Colyseus
server on port 2569, then stops them after testing. Keep those ports free; the
suite deliberately does not reuse an existing development server. No Docker or
hosted backend is needed. Tests cover four viewport sizes, the live HUD, canvas
alignment, mute, authoritative movement/fire, and leave/rejoin identity. A second
Colyseus client observes snapshots to verify browser inputs reach the server.
Screenshots, failure traces, and the HTML report are in `.test-artifacts/`.

Alternatively, use separate terminals:

```sh
npm run dev:server
```

```sh
npm run dev:web
```

Development runs directly on Node.js/npm. No Docker, Compose, dev container or
local Supabase stack is required. Docker remains reserved for future production
packaging. Future persistence must use hosted project `lkgxpgcmspxekggndzih`.

Optional configuration:
- Server: `GAME_SERVER_PORT` (default 2567). The local server binds to 127.0.0.1.
- Browser: copy `apps/web/.env.example` to `apps/web/.env.local` and set
  `VITE_GAME_SERVER_URL` if changing the server endpoint; restart Vite afterward.
- For example, PowerShell: `$env:GAME_SERVER_PORT='2568'; npm.cmd run dev:server`,
  with `VITE_GAME_SERVER_URL=ws://127.0.0.1:2568` in the frontend env file.
- All `VITE_*` values are public. Never place private credentials there.
  No env file is required with default ports.

## Game loop and controls

Fight humans and bots, collect upgrades and points, scan for the next opportunity,
and compete to win the round. First to **1,000 points** or highest score after
**five minutes** wins. Equal top scores draw. Results stay visible for ten seconds,
then the same room automatically starts a fresh round.

| Action | Control / reward |
| --- | --- |
| Move / aim / fire | WASD / mouse / one left click per shot |
| Radar Pulse | Q or HUD button; 12 s cooldown, frozen nearby markers for 3 s |
| Player elimination | 100 points |
| Bot elimination | 20 points; drops two +5 orbs |
| Score orb | Walk over it for 5 points |
| Shotgun pickup | 8 shots, five 12-damage pellets each |
| Heavy pistol pickup | 6 shots, 50 damage each |
| Health / speed pickups | Heal 35 up to 100 HP / +25% speed for 6 s |
| Sound | HUD toggle; audio unlocks after keyboard/mouse interaction |

Six cover blocks stop players and shots and create alternate routes. Up to four
bots navigate and fight; their count decreases as human seats fill. Bots never
occupy human seats or appear as contestants on the human leaderboard.

The top-right leaderboard shows active humans, points, PvP kills and bot kills,
with YOU highlighted. It moves below the arena on narrow screens. HUD displays
health, protection/death/respawn, timer, loadout/ammo, speed and radar readiness.
Hit flashes, hit confirmation, elimination rings, kill feed and distinct sounds
provide combat feedback. Ground pickups are labelled. Radar shows captured
locations/directions, not continuous tracking or a hidden-information guarantee.

Humans have 100 HP; the basic gun deals 25 damage with a 150 ms cooldown. Shots
never damage their owner and use swept collision against cover and opponents,
including the muzzle path. Death keeps points but removes temporary upgrades.
Respawn takes three seconds; a gold ring/SHIELD label marks 1.5 seconds of spawn
protection. Firing ends it. Rematches reset round stats and upgrades. No R reset.

All gameplay is server-authoritative: 30 Hz validated intent, 60 Hz simulation,
20 Hz snapshots and a 100 ms presentation buffer. Ordinary movement/aim interpolate;
death, respawn and round changes do not slide across the arena. No prediction.

Unexpected disconnect clears input but leaves the avatar vulnerable for a ten-second
reservation. Shots continue. Reconnect/refresh preserves health, points, kills,
loadout and cooldowns. Dead disconnected players wait to reconnect before spawning.
**Leave** pauses transport and retains the tab-local resume token; **Join / Retry**
resumes within the reservation. Expired tokens/server restarts show a retryable
error. New tabs are new anonymous identities; preventing identity evasion requires
future authentication. All state is in memory. Focus loss clears controls; input
expires after 250 ms. Keyboard and mouse required.

## Verify and build

```sh
npm run typecheck
npm test
npm run build
```

Build output: `apps/web/dist` (static frontend) and
`apps/game-server/dist/index.js` (Node server with shared workspace code bundled).
Installed npm dependencies are still required by the built server.

To test the production artifacts, stop the development server first, then run
these in separate terminals:

```sh
npm run start:server
```

```sh
npm run preview
```

Open the preview URL printed by Vite (normally `http://127.0.0.1:4173`) in two
tabs. The frontend endpoint is selected at build time.

Verification on 2026-10-05:
- Typechecking, 33 automated tests and both production builds pass. Existing Phaser
  bundle warning remains (about 1.38 MB minified / 376 KB gzip).
- Simulation covers scoring, ties, results freeze, rematch, cover collision and
  navigation, bots, collection contention/respawn, weapons/ammo, boosts, radar,
  death/reconnect preservation, and bounded immutable event snapshots.
- Real WebSocket clients verify PvP and lifecycle regressions, pickup points,
  radar and cooldown-preserving reconnect, results/rematch synchronization and
  bot combat. Default-content bot combat also passes against the built server.
- Presentation tests cover interpolation, respawn/round snapping and event deduplication.
- Browser discovery reports no available surface. Two-browser visual play, responsive
  layout, aim/focus recovery, sound quality and overall balance remain manual checks.
  See [verification log](docs/integrationspec/verification.md) for exact coverage.

For a built-server smoke, start it on a spare port and point the default-content
network test at it. PowerShell, in separate terminals:

~~~powershell
$env:GAME_SERVER_PORT='2568'; npm.cmd run start:server
~~~

~~~powershell
$env:ARENA_TEST_ENDPOINT='ws://127.0.0.1:2568'; npm.cmd test
~~~

Other tests still start isolated ephemeral servers, including a short test round.
The endpoint is test-runner configuration; browser join options cannot alter rules.

## Structure and scope

```text
apps/web/          Phaser rendering, controls and connection controller
apps/game-server/  Authoritative Colyseus rooms and Node entrypoint
packages/shared/  Platform-neutral simulation, constants and state types
packages/protocol/ Versioned wire types, limits and input validators
docs/specs/       Core gameplay and technical direction
docs/integrationspec/ Multi-system work tracker, contracts and verification evidence
```

The [architecture](shootball-arena-architecture.md) sets the long-term direction;
the [spec index](docs/specs/README.md) describes core ideas. The
[integration tracker](docs/integrationspec/README.md) records workstream dependencies,
status, concrete rules and acceptance evidence. GL-01 was specified before implementation. The prior Unity project is reference only.

Deferred: additional maps/weapons, Supabase
auth/persistence, persistent leaderboards, cosmetics, ads, custom matchmaking, prediction,
Redis and distributed infrastructure. Existing Supabase packages are not used
by gameplay. No cloud changes or deployment were performed. Vercel remains the
planned frontend host; the game server will deploy separately to Compute Engine.
