# ShootBall Arena

A playable multiplayer target-practice game built with TypeScript, Vite, Phaser
and an authoritative Node.js/Colyseus server. Up to eight anonymous guests share
an arena. No accounts, credentials, database or cloud services are needed.

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
Stop both processes with Ctrl+C.

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

## What works

- **WASD:** move at equal speed in every direction, clamped inside the walls.
- **Mouse:** aim the cannon. **Left click inside the arena:** one projectile.
- Four shared targets take three hits each; all players see damage/destruction.
- Shots have server-owned IDs, ownership, cooldown, collision and lifetime.
- **R:** reset the shared arena for everyone (at most once every two seconds).
- YOU identifies your cyan avatar; peers have blue tint and guest labels.
- A full eight-player room sends new guests to a separate practice room.
- Connection status, leave and retry controls sit above the canvas.

Unexpected disconnect clears server input and owned shots. Peers see a dimmed
avatar for a ten-second reservation. Automatic reconnect or a refresh within
that window restores the same identity and position. The tab stores only its
temporary reconnect token in sessionStorage. Explicit Leave removes the player
and token; expired tokens or a server restart show a retryable error. Join/Retry
then joins fresh. Background/focus loss clears controls; the server also stops
movement after 250 ms without accepted input.

The server owns all gameplay. Clients send validated movement/aim/fire intent
at 30 Hz; the server simulates at 60 Hz and publishes snapshots at 20 Hz.
Rendering currently uses the latest snapshot without prediction/interpolation,
so internet latency will be noticeable. Players cannot damage/block each other.
Keyboard and mouse are required.

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
- Typechecking and both production builds passed; Vite reports a large Phaser
  bundle warning (about 1.37 MB minified / 373 KB gzip).
- Nine tests passed: six original gameplay regressions plus protocol validation,
  shared simulation and a real WebSocket multiplayer integration scenario.
- Integration covers matching snapshots, movement under 200 ms on localhost,
  stale/replayed/malformed input, shared shots/damage/destruction/reset,
  explicit leave, automatic and manual reconnect, refresh-token restoration,
  expired-token retry, ten-second expiry, capacity/isolation, message flooding
  and oversized-payload disconnection. Expected rejection logs appear in tests.
- Two SDK clients also joined the **built** server and received shared state.
- Visual browser verification was unavailable in the implementation session.
  Manual checks still to run: two-tab rendering, resize/aim, focus recovery,
  visible connection states, and the Leave/Retry buttons.

## Structure and scope

```text
apps/web/          Phaser rendering, controls and connection controller
apps/game-server/  Authoritative Colyseus rooms and Node entrypoint
packages/shared/  Platform-neutral simulation, constants and state types
packages/protocol/ Versioned wire types, limits and input validators
docs/specs/       Implementation guide, acceptance criteria and deferred scope
```

The [architecture](shootball-arena-architecture.md) sets the long-term direction;
the [spec index](docs/specs/README.md) defines this implemented slice. Specifications
were updated before implementation. The prior Unity project is reference only.

Deferred: PvP damage/death/respawn, scoring and match outcomes, Supabase
auth/persistence, leaderboards, cosmetics, ads, custom matchmaking, prediction,
Redis and distributed infrastructure. Existing Supabase packages are not used
by gameplay. No cloud changes or deployment were performed. Vercel remains the
planned frontend host; the game server will deploy separately to Compute Engine.
