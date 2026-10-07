# GCP, containers and admin setup rundown

Updated 2026-10-06 (America/Chicago). The release flow is now `feature -> dev -> main`. Both branches exist on GitHub; pushing `main` automatically validates, builds production Docker images and deploys to GCP. Development continues directly with Node/npm.

## Hosted environment

- Player site: https://shootball-control-test-730016272076.us-central1.run.app
- Admin sign-in: https://shootball-control-test-730016272076.us-central1.run.app/admin/
- Multiplayer: `wss://136.71.64.19.sslip.io` (temporary HTTPS hostname).
- GCP project: `project-7915787f-37b2-4286-aa7`, operator `gbjunior010@gmail.com`.
- Supabase: `lkgxpgcmspxekggndzih` only. Its site URL and exact live login/recovery redirects are configured; existing development redirects were preserved.

One `e2-micro` VM in `us-central1-a` hosts the game and Caddy TLS proxy. It uses a 20 GiB standard disk and reserved IP `136.71.64.19`. Only TCP 80/443 are public; SSH and raw game port 2567 are closed. Cloud Run independently serves the frontend, admin sign-in and protected admin API with minimum 0 / maximum 1 instance, 0.08 CPU, 256 MiB, concurrency 1 and request-based billing.

## Cost

The combined low-traffic planning estimate is **about $11.75/month before tax**, including the VM, disk, IPv4, 2 GiB outbound traffic, up to 2 GiB image storage and light Cloud Run usage. No compute/disk Free Tier discount is assumed. See [release operations and assumptions](gcp-releases.md) and [VM cost breakdown](gcp-test-instance.md).

The existing $12 project budget alerts at 50%, 75%, 100% actual and 100% forecast remain enabled. This is an estimate, not a hard cap. Traffic, image retention, taxes, other project services and Supabase billing can increase total spending. No extra VM, load balancer or NAT gateway was added.

## GitHub Actions and permissions

[Container validation](../.github/workflows/containers.yml) runs on pushes and pull requests. [Deploy main to GCP](../.github/workflows/deploy-test.yml) runs automatically on main, with a manual rerun option. The `gcp-test` GitHub environment accepts main only. `GCP_DEPLOY_ENABLED` and the committed deployment policy are enabled.

The release validates types, unit tests and admin browser behavior, builds both images, publishes them to Artifact Registry `shootball-test`, rolls out an immutable game digest, waits for trusted HTTPS and the matching revision, then updates the web/admin service and checks a real guest multiplayer session. Deployments serialize. A failed candidate preserves the existing game; successful promotion ends in-memory matches. This test setup is not a zero-downtime production cluster.

GitHub uses short-lived OIDC credentials restricted to this repository, owner, main branch and deployment workflow. No service-account key or Supabase secret key is uploaded. CI can write the one image repository, update metadata on the one VM, update the one Cloud Run service, read deployment operations and act as the two scoped runtime identities. It cannot provision additional VMs through these roles.

The `shootball-game` identity reads only the image repository and has storage-read-only VM OAuth scope. The `shootball-admin` identity reads only the registered VM. Docker images run as non-root. Game container memory/CPU and local logs are bounded; Caddy certificate state persists on disk. Registry cleanup deletes old images after seven days while preserving two recent versions per image.

## Admin account

**`gbjunior014@gmail.com`** is the application admin, separate from the GCP operator account. Its existing verified Supabase user has the **viewer** role for the live `production` environment (and the separate local development fixture). The current panel remains read-only.

Sign in at `/admin/` with email/password. The verified `gbjunior014@gmail.com` account does not require an authenticator, as requested. The exemption checks its immutable user ID and current verified email in the database; it does not trust browser metadata. Other admin memberships retain their existing MFA policy. Admin Google OAuth is not implemented.

The sign-in shell is public. Protected `/admin/v1/*` data requires a verified user, an active session, current environment membership. MFA remains required for accounts without the explicit primary-account exemption. Membership and audit records are in an unexposed RLS-protected schema. Ordinary accounts and anonymous requests cannot read the dashboard. Runtime authentication uses only the publishable key.

## Local development and remaining work

Run `npm.cmd ci` and `npm.cmd run dev:admin` for the admin app at `http://127.0.0.1:5174/admin/`. The launcher reads the existing scoped root `.env`. Use the existing Node/npm game development commands for gameplay. Docker remains production packaging and release validation only.

The hosted admin panel has one fixed Production environment and four sections: Overview, Servers, Architecture and Access. It shows registered VM counts/power state, actual deployment addresses and verified admin access. Local fixtures are available only through the explicit Node/npm development mode; they are not selectable from the live panel. Old environment preferences are ignored. Unimplemented analytics/settings/activity pages and inactive server-control buttons are not shown. Remaining requirements include server start/stop, durable operations worker, configuration publishing, telemetry ingestion, account directory, billing integration and activity browser. See [admin requirements](integrationspec/admin-control-plane.md).

Application deployment status and verification evidence are recorded in [the release document](gcp-releases.md). All GCP operations use `scripts/gcloud.cmd`; account/project targets and the global active CLI configuration are preserved.

Internal GCP resources and the GitHub deployment environment retain their original `test` names to preserve the existing URLs, IAM bindings and cost footprint. They identify the single live production deployment; no second hosted environment exists.
