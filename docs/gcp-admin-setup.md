# GCP, containers and admin setup rundown

Updated 2026-10-06. This records what was actually configured, not a production-readiness claim.

Implementation branch: `feat/gcp-admin-pipeline` (pushed, not merged into `main`).
[Successful GitHub Actions run](https://github.com/Junior4144/shootballarenaioWeb/actions/runs/37551725220) verifies implementation commit `3c923ab`: validation and both container jobs passed.

## Current status and budget

The container build pipeline is implemented. **One test VM is now running:** `shootball-game-test` in `us-central1-a`. Its estimated monthly cost is about **$11 before tax**, without Free Tier discounts. See [the instance rundown](gcp-test-instance.md) for the cost breakdown. The application containers are not deployed yet; there is no public game/admin URL and no Cloud Run service.

Your clarified requirement is an **estimated instance cost of $13/month or less**. I created a **$12/month project budget** with alerts at 50%, 75%, 100%, and forecast 100%. GCP budgets are alerts, not spending limits; delayed usage reporting and network charges prevent an absolute bill guarantee. You subsequently authorized instance creation on that estimated-cost basis. The VM is now running; the application release switch remains off. This does not cap unrelated existing account spending or Supabase charges.

Google documents this distinction in [budgets](https://docs.cloud.google.com/billing/docs/how-to/budgets) and [spend caps](https://docs.cloud.google.com/billing/docs/how-to/budgets-spend-caps). Spend caps do not provide a universal hard cap for this proposed Compute Engine game architecture. VM provisioning is complete. Public application deployment remains a separate unfinished step.

## Resources configured

| Item | Actual configuration |
| --- | --- |
| GCP operator account | `gbjunior010@gmail.com` |
| Project | `project-7915787f-37b2-4286-aa7` (number `730016272076`) |
| Region | `us-central1` |
| APIs | Compute Engine, Cloud Run, Artifact Registry, IAM Credentials, Security Token Service, Billing Budgets |
| Budget | `shootball-test-12usd`, project-scoped, $12/month |
| Artifact Registry | `shootball-test`, Docker repository, currently empty; paid vulnerability scanning disabled |
| Image retention | Delete images older than 7 days, preserve the 2 most recent versions per image |
| CI identity | `shootball-github@project-7915787f-37b2-4286-aa7.iam.gserviceaccount.com` |
| Runtime identity | `shootball-admin@project-7915787f-37b2-4286-aa7.iam.gserviceaccount.com` |
| GitHub federation | Pool `shootball-github`, provider `github`; no service-account JSON keys |
| Live compute | One `e2-micro` VM, 20 GiB standard boot disk, ephemeral IPv4; no Cloud Run service, reserved IP, NAT gateway or load balancer |

GitHub federation is restricted to repository ID `1384258088`, owner ID `94208651`, branch `main`, and this repository's `deploy-test.yml` workflow. CI can write images only to the named repository. It has no deployment or Compute Engine mutation permissions. The runtime identity has no broad project role.

GitHub variables `GCP_WORKLOAD_IDENTITY_PROVIDER`, `GCP_CI_SERVICE_ACCOUNT`, `GCP_REGION` are configured. `GCP_DEPLOY_ENABLED=false`. A second committed gate, `deploy/gcp/test-policy.json`, also has deployment disabled.

## Container build and release pipeline

[Build workflow](../.github/workflows/containers.yml) runs on pushes and pull requests. It checks types, runs unit and admin browser tests, builds the app, and builds two production images. It starts both images as the non-root `node` user, checks `/healthz`, and verifies that an unauthenticated admin API request receives 401. Browser evidence expires after 3 days.

- `deploy/docker/game-server.Dockerfile`: authoritative game server, port 2567, production runtime dependencies, health check.
- `deploy/docker/control-plane.Dockerfile`: static player site plus `/admin/` and the admin API, port 8080, real Supabase authorization.
- `.dockerignore`: excludes local credentials, environment files, development caches and Git metadata.

The [release workflow](../.github/workflows/deploy-test.yml) is manual, main-only, and disabled by the two cost gates. Its prepared path tests the code, uses short-lived GitHub OIDC credentials to publish images, and deploys the control plane by immutable digest through `scripts/gcloud.cmd`. The initial Cloud Run service would be private, minimum zero instances, maximum one, 256 MiB, fractional CPU, request-based billing. **That deployment path has not been exercised.** It still needs scoped deploy/runtime permissions, real public application inputs and a game-hosting decision. Merely flipping the variable is not a complete deployment.

The test VM was provisioned through the scoped repository CLI and registered in `deploy/environments.json`. No automated VM application rollout is implemented yet. The control-plane deployment script does not install a game server on this VM.

## Admin account and access

Application admin: **`gbjunior014@gmail.com`**. This is separate from the GCP operator account.

The existing verified Supabase user was granted the `viewer` role for `local` and `gcp-test`. It cannot administer production or perform mutations. An automatic approval review rejected an initial broader owner grant as excessive; the implemented grant is the narrower read-only role appropriate to the current panel.

Applied migration: `supabase/migrations/20261006235615_admin_access.sql`, on project `lkgxpgcmspxekggndzih` only. Membership and membership-change audit records live in an unexposed, RLS-protected schema. The API checks a verified user, active session, current membership/environment, and MFA on each request. Membership revocation does not wait for token expiry. Ordinary accounts cannot enter the protected dashboard.

TOTP enrollment and verification are enabled on the hosted project. On first admin sign-in, scan the displayed QR code with your authenticator and enter its code. Your actual authenticator factor is intentionally enrolled by you; no factor or recovery secret was generated for your account by automation. Browser sessions stay in memory. The current admin login supports email/password, not Google OAuth.

`/admin` serves the sign-in shell; protected data is under `/admin/v1/*` and requires authorization. The shell itself is public, so hiding its URL is not the access control.

## Run it now without Docker

```powershell
npm.cmd ci
npm.cmd run dev:admin
```

Open `http://127.0.0.1:5174/admin/`. Sign in using `gbjunior014@gmail.com`, then enroll/verify the authenticator. The launcher reads the scoped Supabase URL and publishable key from the existing root `.env`; no service-role key is used by the admin runtime. Stop with Ctrl+C.

For an isolated local fixture instead:

```powershell
$env:ADMIN_AUTH_MODE = 'local'
npm.cmd run dev:admin
```

Use the printed local token. Remove that environment override to return to real authentication. Node/npm remain the development path; Docker is production packaging and release validation only.

## What is implemented and what remains

Implemented: read-only overview/inventory/architecture, environment scoping, live Supabase membership and MFA gates, private membership audit, safe static serving, production packaging and CI. GCP inventory uses only the explicit resource registry, now containing the test VM. Runtime credentials with instance-read permission are still required to observe it. No fabricated metrics represent live cloud activity.

Not implemented: server start/stop operations, durable worker/outbox, configuration publishing, telemetry ingestion, account directory, billing integration, activity browser and public hosting. These remain work in [the admin requirements](integrationspec/admin-control-plane.md).

Verification: local typecheck, complete build, admin API tests and Chromium admin tests pass. A disposable hosted account successfully enrolled and verified TOTP, and remained denied admin access even after MFA. The account was then removed. Hosted MFA config was read back as enabled. GitHub Actions built both production images and verified non-root startup, health endpoints, the admin shell and anonymous API denial. Docker is not installed locally. `npm audit --omit=dev` reported zero runtime dependency vulnerabilities at verification time.

Existing Supabase advisories include an unrelated public `rls_auto_enable` function exposure and disabled leaked-password protection; these were not silently changed as part of this deployment setup. Production release should resolve those and audit runtime dependencies before exposure.
