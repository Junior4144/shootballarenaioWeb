# Deployment

## Purpose
Keep local development and static frontend builds reproducible without provisioning early infrastructure.

## Scope and responsibilities
Root npm workspaces install shared dependencies. Scripts start Vite and the Colyseus server directly on Node, typecheck both, run gameplay/network tests and build static frontend plus Node server output. Keep a lockfile and ignore generated output.

## Technical decisions and assumptions
- Use Node.js 22.12+ or a supported newer LTS and npm; this slice is verified with Node 24.
- Run `npm install` initially (`npm ci` from the committed lockfile), `npm run dev`, `npm run typecheck`, `npm test`, and `npm run build` at repository root.
- Development runs directly on Node.js/npm. Docker, Compose, dev containers, and a local Supabase stack are not development prerequisites.
- Use hosted Supabase project `lkgxpgcmspxekggndzih` when backend integration is implemented. The CLI is linked and SQL access is verified; the frontend prototype does not yet use it.
- Reserve Docker for the future production game-server image and release validation. Docker Engine availability does not imply that an application image or deployment pipeline already exists.
- Planned static host: Vercel, project root `apps/web`, Vite framework preset, output `dist`. Include workspace files outside the project root so `packages/shared` resolves; install from the repository workspace root.
- No deployment is performed. Optional public `VITE_GAME_SERVER_URL` selects the server; `GAME_SERVER_PORT` defaults to 2567. No credentials are required. All `VITE_*` variables are public, never secrets.
- Future game server deploys separately to Compute Engine; never run it in Vercel functions.

## Initial MVP requirements
Clean dependency install and production build succeed locally; preview serves the game. README gives controls and run commands. No cloud credentials or paid services required.

Implemented: `npm run dev` launches both apps; separate `dev:web` and
`dev:server` scripts are available. Build outputs `apps/web/dist` and
`apps/game-server/dist/index.js`; the latter bundles workspace code and keeps
Colyseus as installed runtime dependencies. `npm run start:server` runs the built
server; `npm run preview` serves the built frontend. Both bind to loopback for
local verification. Production host binding/TLS/packaging remain deployment work.
Typecheck, nine tests, build and a built-server two-client smoke passed on
2026-10-05. Vite's large-bundle warning remains; no deployment was performed.

## Out of scope now
Cloud provisioning, deployment workflows, Docker/Terraform, Redis, load balancers, Kubernetes, scaling infrastructure, and secret management integrations.

## Future upgrades
Add independent frontend/server pipelines with shared-package path triggers when deployment is requested. Package the implemented game server in a production Docker image, publish it to Artifact Registry, and run it on one Compute Engine VM. Use GCP project `project-7915787f-37b2-4286-aa7` through `scripts/gcloud.cmd`. Scale on measurements.
