# Vercel implementation review

Reviewed October 9, 2026, for `jrxsoftware/shootball-arena` and
`https://www.orb-skirmish.com/`.

## Findings and corrections

1. **Web Analytics was enabled but not implemented in the app.** The existing
   frontend had PostHog and Supabase traffic collection, but no Vercel Analytics
   SDK. Vercel's production page-view query returned no data for the last day.
   Added the pinned `@vercel/analytics` 2.0.1 SDK once at the game entry point.
2. **The live tracking script returned HTTP 404.** Enabling Web Analytics had
   not been followed by a proxy deployment. A new preview served the script
   with HTTP 200 and JavaScript content; the verified proxy was then deployed
   to production, where the script also returned HTTP 200.
3. **Authentication URLs need redaction.** The integration removes query
   strings and fragments before sending page views. Tests cover OAuth codes,
   recovery parameters and access-token fragments. It does not identify users
   or send custom events.
4. **Production scope is explicit.** Local development, preview deployments,
   the direct GCP origin and admin URLs are excluded. The main domain and the
   legacy production Vercel alias are accepted.
5. **CLI and proxy scope are consistent.** Both local links match the intended
   team/project IDs. The wrapper rejects scope/path overrides, deploys only
   `deploy/vercel`, and uses a shared scope file with the API deploy script.
   Downloaded environment files and local Vercel metadata are excluded from Git
   and proxy uploads. GCP still builds and serves the application.

## Verification

- Frontend type-check/build passed.
- URL-redaction and production-origin tests passed.
- GitHub's application, API, release-script and admin-browser tests passed.
- Preview and production analytics script: HTTP 200, JavaScript content.
- Production dependency audit: zero reported advisories.
- Application revision `67d32d1435290a5d0c717ee37c78739f6c55e4f3`
  deployed successfully; production API and multiplayer smoke checks passed.
- Final deployed browser check passed: one tracking script, one page-view
  request, collector HTTP 200, SDK 2.0.1, URL
  `https://www.orb-skirmish.com/`, and no identified user. This was one
  controlled smoke-test visit, so it may appear in the analytics totals.
- Vercel's aggregate production metrics subsequently reported **1 page view**,
  confirming the controlled visit was ingested, not merely accepted by HTTP.

## Separate systems and remaining observations

Vercel Web Analytics is separate from the admin dashboard's PostHog and Supabase
traffic sources. Their totals must not be added together. This review did not
audit PostHog's hosted settings or event history.

Speed Insights is a separate product; its project settings reported no data,
and this repository has no Speed Insights client integration. It is not needed
for Web Analytics page views.

The full development-dependency audit reported 37 advisories, including Vercel
CLI transitive dependencies. The deployed production dependency audit reported
zero. No broad dependency downgrade or forced audit fix was applied; development
tooling advisories remain a separate maintenance item.

## Operating checks

```powershell
npm.cmd run vercel -- status
npm.cmd run vercel -- analytics
```

Reference: [Vercel Web Analytics setup](https://vercel.com/docs/analytics/quickstart)
and [analytics URL filtering](https://vercel.com/docs/analytics/package#beforesend).
