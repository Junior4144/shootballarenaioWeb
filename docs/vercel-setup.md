# Vercel setup

This repository uses the `junior4144` login and the `jrxsoftware` team. Its
existing Vercel project is `shootball-arena`, serving `www.orb-skirmish.com`.
The exact team and project IDs are in `deploy/vercel-project.json`.

Run these commands from the repository root in PowerShell:

```powershell
npm.cmd run vercel -- whoami
npm.cmd run vercel -- status
npm.cmd run vercel -- domains
npm.cmd run vercel -- analytics
```

The repository installs an exact Vercel CLI version with `npm ci`. Authentication
uses the existing Vercel CLI login; no token is stored in the repository. On a
new machine, run `npx.cmd --no-install vercel login`, then
`npm.cmd run vercel -- link` to link the existing project.

The wrapper pins the team, project and working directory for each process and
rejects conflicting local project links. It does not change your global team.
Use the wrapper instead of running a bare `vercel` command from the root.

Vercel serves the public frontend from `deploy/vercel/public`. Only `/admin`,
`/admin/*`, `/health`, and `/healthz` proxy to the existing GCP control-plane
service. Public HTML and assets no longer wait for a Cloud Run instance.
It does not build the monorepo. Application releases continue through GitHub
Actions: the container workflow extracts the exact tested frontend into an
artifact; the deployment workflow publishes it after updating GCP.

The `gcp-test` GitHub environment must contain `VERCEL_TOKEN`, scoped to this
Vercel project/team. The workflow fails before changing runtime services when
the secret is missing. A local CLI OAuth login is not a durable CI credential.
Create a deployment token in Vercel account settings and save it directly in
GitHub environment secrets; never commit it. Renew it before its expiry.
When `VERCEL_TOKEN` is supplied, the wrapper uses Vercel's deployment API:
project-scoped tokens cannot read the user-account endpoint required by the CLI.
Interactive local deployments continue to use the existing CLI login.

For a manual release, build the frontend with production public inputs first.
Set `RELEASE_SHA` to the full commit matching those artifacts, then prepare and
deploy only the public output:

```powershell
$env:RELEASE_SHA = '<40-character release commit>'
node scripts/prepare-vercel-static.mjs
npm.cmd run vercel -- deploy
# After reviewing the preview:
npm.cmd run vercel -- deploy --prod
```

The default deployment is a preview. `.vercel` links, generated public files and
downloaded environment files are ignored by Git. The legacy
`scripts/deploy-vercel-proxy.mjs` delegates to the same scoped CLI wrapper and
requires prepared static files too, preventing accidental proxy-only releases.

`/release.json` identifies the static frontend revision separately from the
backend `/health` revision. Release smoke tests require both to match. Hashed
assets use immutable caching; HTML revalidates. Missing public files return 404
without waking Cloud Run. Admin responses retain their origin cache policies.

Rollback through Vercel to the preceding deployment if a static release fails;
coordinate backend rollback when reverting a release with protocol changes.

## Web Analytics

Web Analytics is enabled on this existing Vercel project. The game entry point
loads `@vercel/analytics` once through `apps/web/src/vercel-analytics.ts`.
It runs only in production builds on the public domain or the legacy production
Vercel alias. Local development, previews, the direct GCP origin and admin pages
are excluded. Only page views are collected; query strings and URL fragments
are removed before sending, including OAuth codes and recovery tokens.

The tracking script is served by Vercel at `/_vercel/insights/script.js`.
Enabling analytics in the dashboard requires a new **proxy deployment** to
activate its reserved routes, followed by an application release to include
the SDK. Do not forward these reserved routes to a separate analytics provider.
Vercel's generated analytics routes remain enabled; verify the script returns
JavaScript with HTTP 200 after deployment.

`npm.cmd run vercel -- analytics` reads aggregate production page views for this
project over the last day. `analytics-schema` lists supported metrics. These
counts are separate from the admin dashboard's PostHog and Supabase traffic
sources; they should not be added together. Speed Insights is a separate product
and is not installed by this Web Analytics integration.
