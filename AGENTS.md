# Cloud project scope

- GCP account: `gbjunior010@gmail.com`.
- GCP project: `project-7915787f-37b2-4286-aa7`.
- Run GCP commands through `scripts/gcloud.cmd` from this repository. It selects
  the `shootball-arena` configuration and pins the account and project per process.
  Do not override these targets or change the global active configuration.
- Supabase project reference: `lkgxpgcmspxekggndzih`.
- Supabase URL: `https://lkgxpgcmspxekggndzih.supabase.co`.
- Only link or operate on that Supabase project for this repository. Do not use
  another accessible project as a fallback. Where supported, pass the explicit
  project reference; otherwise verify the local link before running commands.
- Supabase linking and SQL access were verified on 2026-10-05. The CLI connects
  as `postgres`, with CREATE permission in `public` and read/write transactions.

# Development and production

## Vercel scope

- Account: `junior4144`; team: `jrxsoftware` (`team_wcBcg21IdtA6TZyO0dRea5Di`).
- Only use project `shootball-arena` (`prj_zml6Wx0SyKQ2315FK7OOmhhGWDmW`).
- Canonical domain: `https://www.orb-skirmish.com/`.
- Use `npm.cmd run vercel -- <command>` from this repository. The wrapper pins
  the team, project and `deploy/vercel` working directory per process.
- Vercel hosts the proxy to GCP. Do not deploy the repository root or change
  the global Vercel team. Application releases use the existing GitHub Actions
  workflow; Vercel proxy releases use `npm.cmd run vercel -- deploy --prod`.
- Scope IDs are recorded in `deploy/vercel-project.json`; `.vercel` links and
  authentication credentials must remain untracked.

## Runtime

- Run development directly with Node.js/npm. Do not require Docker, Compose,
  dev containers, or a local Supabase container stack for development.
- Use the scoped hosted Supabase project when backend integration is needed.
- Reserve Docker for production game-server packaging and release validation.
  The frontend builds to static assets; the game server and its
  production image are not implemented yet.
