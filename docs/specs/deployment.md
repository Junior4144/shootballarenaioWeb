# Deployment

## Purpose
Keep local development and static frontend builds reproducible without provisioning early infrastructure.

## Scope and responsibilities
Root npm workspaces install shared dependencies. Scripts start Vite and the Colyseus server directly on Node, typecheck both, run gameplay/network tests and build static frontend plus Node server output. Keep a lockfile and ignore generated output.

## Technical decisions and assumptions
- Use Node.js 22.12+ or a supported newer LTS and npm; this slice is verified with Node 24.
- Run `npm install` initially (`npm ci` from the committed lockfile), `npm run dev`, `npm run typecheck`, `npm test`, and `npm run build` at repository root.
- Development runs directly on Node.js/npm. Docker, Compose, dev containers, and a local Supabase stack are not development prerequisites.
- Use hosted Supabase project `lkgxpgcmspxekggndzih` for accounts and profiles. The frontend and game server integrate with Auth; the profile migration is applied. See [account setup](../auth-setup.md) for public environment variables, callback URLs and production checks.
- Reserve Docker for the future production game-server image and release validation. Docker Engine availability does not imply that an application image or deployment pipeline already exists.
- Planned static host: Vercel, project root `apps/web`, Vite framework preset, output `dist`. Include workspace files outside the project root so `packages/shared` resolves; install from the repository workspace root.
- No deployment is performed. Optional public `VITE_GAME_SERVER_URL` selects the server; `GAME_SERVER_PORT` defaults to 2567. Guest play needs no credentials. Accounts use the Supabase URL/publishable key on both frontend and server. All `VITE_*` variables are public, never secrets.
- Future game server deploys separately to Compute Engine; never run it in Vercel functions.

## Initial MVP requirements
Clean dependency install and production build succeed locally; preview serves the game. README gives controls and run commands. No cloud credentials or paid services required.

Implemented: `npm run dev` launches both apps; separate `dev:web` and
`dev:server` scripts are available. Build outputs `apps/web/dist` and
`apps/game-server/dist/index.js`; the latter bundles workspace code and keeps
Colyseus as installed runtime dependencies. `npm run start:server` runs the built
server; `npm run preview` serves the built frontend. Both bind to loopback for
local verification. Production host binding/TLS/packaging remain deployment work.
Game-loop typechecking, 33 automated tests and both production builds pass on
2026-10-05. Real SDK clients verify combat, pickups, radar, reconnect, results and new-match routing. See ../integrationspec/verification.md for evidence. Vite's large-bundle warning remains; no deployment was performed.

## Out of scope now
Cloud provisioning, deployment workflows, Docker/Terraform, Redis, load balancers, Kubernetes, scaling infrastructure, and secret management integrations.

## Future upgrades
Add independent frontend/server pipelines with shared-package path triggers when deployment is requested. Package the implemented game server in a production Docker image, publish it to Artifact Registry, and run it on one Compute Engine VM. Use GCP project `project-7915787f-37b2-4286-aa7` through `scripts/gcloud.cmd`. Scale on measurements.

Room overflow is implemented and tested on one Node process. It creates another in-memory room, not another server process. Multi-process or multi-machine deployment requires shared matchmaking storage/presence and routing; see [matchmaking and scaling](matchmaking.md). No scaling infrastructure is configured or deployed by this change.
