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

Vercel serves the proxy in `deploy/vercel`, forwarding to the existing GCP
control-plane service. It does not build the monorepo. Application releases
continue through GitHub Actions. To release a proxy configuration change:

```powershell
npm.cmd run vercel -- deploy
# After reviewing the preview:
npm.cmd run vercel -- deploy --prod
```

The default deployment is a preview. `.vercel` links and downloaded environment
files are ignored by Git. The API-based `scripts/deploy-vercel-proxy.mjs` uses
the same scope file and still requires an explicit `VERCEL_TOKEN`.

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
The existing catch-all proxy is compatible with Vercel's generated analytics
routes; verify the script returns JavaScript with HTTP 200 after deployment.

`npm.cmd run vercel -- analytics` reads aggregate production page views for this
project over the last day. `analytics-schema` lists supported metrics. These
counts are separate from the admin dashboard's PostHog and Supabase traffic
sources; they should not be added together. Speed Insights is a separate product
and is not installed by this Web Analytics integration.
