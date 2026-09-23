# Frontend

## Purpose
Deliver the smallest playable browser version of ShootBall Arena.

## Scope and responsibilities
`apps/web` owns bootstrap, Phaser scene, keyboard/mouse input, local simulation, and readable UI. `packages/shared` owns only platform-neutral constants and basic state/input types used today.

## Technical decisions and assumptions
- TypeScript strict mode, Vite, Phaser 3, HTML/CSS; npm workspaces (allowed by the architecture). No UI framework or monorepo build orchestrator.
- One game scene maps input to intent, advances plain local state, and synchronizes visuals. Keep local simulation in the frontend until a server actually exists.
- Fixed logical resolution with Phaser FIT scaling and centered canvas; desktop keyboard and mouse are the supported controls. Resize must preserve pointer accuracy.
- Generate small pixel textures in code. No downloaded art, Unity assets, or asset pipeline required.
- Handle focus loss by clearing keys and queued firing. R resets practice; on-screen instructions explain controls and remaining targets.
- Reserve `apps/game-server` and `packages/protocol` with README files only; no dummy server, transport interface, or speculative network implementation.

## Initial MVP requirements
Root install/dev/typecheck/test/build commands work. Production output is `apps/web/dist`. The game starts immediately without login, credentials, external APIs, or loading assets from third-party hosts. Verify movement, aiming after resize, shooting, target destruction, reset, and focus recovery.

## Out of scope now
Authentication UI, menus, ads, cosmetics, leaderboards, mobile/touch controls, multiplayer clients, advanced effects, and frontend framework abstractions.

## Future upgrades
Add loading/menu scenes only when needed. Replace local authority with server state and add presentation interpolation once networking is specified. Revisit bundle size and accessible alternative controls before public release.

## API references
[Phaser scaling](https://docs.phaser.io/phaser/concepts/scale-manager), [Phaser input](https://docs.phaser.io/phaser/concepts/input), [Vite setup](https://vite.dev/guide/).
