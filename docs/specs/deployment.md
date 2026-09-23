# Deployment

## Purpose
Keep local development and static frontend builds reproducible without provisioning early infrastructure.

## Scope and responsibilities
Root npm workspaces install shared dependencies; frontend scripts start Vite, typecheck, test gameplay, and produce static output. Keep a lockfile and ignore generated output.

## Technical decisions and assumptions
- Use Node.js 22.12+ or a supported newer LTS and npm; this slice is verified with Node 24.
- Run `npm install` initially (`npm ci` from the committed lockfile), `npm run dev`, `npm run typecheck`, `npm test`, and `npm run build` at repository root.
- Planned static host: Vercel, project root `apps/web`, Vite framework preset, output `dist`. Include workspace files outside the project root so `packages/shared` resolves; install from the repository workspace root.
- No deployment is performed for this slice. No environment variables are needed. Any future `VITE_*` variables are public, never secrets.
- Future game server deploys separately to Compute Engine; never run it in Vercel functions.

## Initial MVP requirements
Clean dependency install and production build succeed locally; preview serves the game. README gives controls and run commands. No cloud credentials or paid services required.

## Out of scope now
Cloud provisioning, deployment workflows, Docker/Terraform, Redis, load balancers, Kubernetes, scaling infrastructure, and secret management integrations.

## Future upgrades
Add independent frontend/server pipelines with shared-package path triggers when deployment is requested. Start with one VM and a service manager; adopt Docker/Artifact Registry for reproducible server releases later. Scale on measurements.
