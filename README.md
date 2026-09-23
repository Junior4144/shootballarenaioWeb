# ShootBall Arena

A small browser-based, top-down target practice prototype built with TypeScript,
Vite, and Phaser. No backend or accounts are required.

## Run locally

Use Node.js 22.12+ (Node 24 LTS recommended) and npm. From the repository root:

```sh
npm ci
npm run dev
```

Open the local URL printed by Vite. On Windows PowerShell, use `npm.cmd` if script
execution policy blocks `npm.ps1`.

- **WASD:** move; diagonal movement has the same speed.
- **Mouse:** aim the attached cannon.
- **Left click inside the arena:** fire one projectile.
- **R:** reset the player, targets, and projectiles.

Four stationary targets take three hits each. Shots disappear on a hit, at a wall,
or after 1.2 seconds. Keyboard and mouse are required; touch is not implemented.

## Verify and build

```sh
npm run typecheck
npm test
npm run build
npm run preview
```

The production build is written to `apps/web/dist`. Tests exercise movement,
boundary clamping, aiming, cooldown, collision ordering, target destruction,
projectile cleanup, and frame-delta clamping.

Browser smoke check: move against all walls, aim around the player, click each
target three times, clear the arena, press R, resize the window and aim again,
then switch tabs while moving and return to confirm keys do not remain held.

## Structure and specifications

The [architecture document](shootball-arena-architecture.md) defines the long-term
technical direction. The [spec index](docs/specs/README.md) defines the current
slice and deferred systems. Update the relevant spec before implementing a major
system, and record new assumptions there.

```text
apps/web/          Phaser frontend and local gameplay simulation
apps/game-server/  Reserved; no server implementation
packages/shared/  Platform-neutral game constants and state/input types
packages/protocol/ Reserved; no network implementation
docs/specs/       Practical specifications for seven project areas
```

Gameplay state is independent of Phaser rendering, but is currently local to the
frontend. Multiplayer, Colyseus, Supabase, auth, Redis, matchmaking, ads,
leaderboards, cosmetics, and cloud infrastructure are deliberately deferred.
The prior Unity project is historical reference only.

Vercel is the planned static frontend host; see the
[deployment spec](docs/specs/deployment.md). Nothing is deployed by this prototype.
