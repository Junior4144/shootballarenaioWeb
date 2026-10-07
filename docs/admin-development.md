# Admin control plane development

The control plane supports verified Supabase sessions, current membership and MFA.
It remains read-only. See [the setup rundown](gcp-admin-setup.md) for actual cloud
resources, budget gates and deployment status.

## Local UI with deployed data (recommended for admin UI work)

```powershell
npm.cmd ci
npm.cmd run dev:admin:live
```

Open http://127.0.0.1:5174/admin/ and sign in with your existing administrator
account. This runs the same admin source as the deployed panel, with hot reload.
The login screen and dashboard show **Local UI · Production data**. No local
API, Docker, GCP credentials or environment file is required. Stop with Ctrl+C.

The local Vite proxy forwards only /admin/config and /admin/v1/ to the primary
https://shootball-arena.vercel.app endpoint. That endpoint proxies to GCP.
The public authentication configuration comes from the deployed API; the existing
Supabase password login, current membership checks and optional MFA remain in use.
Sessions stay in browser memory. There is no service-role key or authorization bypass.
The proxy binds to loopback, rejects foreign browser origins before rewriting Origin,
verifies upstream TLS, and does not follow redirects or forward browser cookies.
See [Vite proxy configuration](https://vite.dev/config/server-options#server-proxy).

To explicitly use the direct GCP endpoint instead:

```powershell
$env:ADMIN_LIVE_TARGET='gcp'
npm.cmd run dev:admin:live
# After stopping, restore the default for later sessions:
Remove-Item Env:ADMIN_LIVE_TARGET
```

Only `vercel` (default) and `gcp` are accepted. Direct GCP uses
https://shootball-control-test-730016272076.us-central1.run.app. Both reach the
same production architecture. Upstream failures stay visible; there is no silent
fallback to fixtures or a different host. Restart Vite to change the target.

Traffic history is an explicit exception to HTTP proxying in live UI development:
it calls the scoped Supabase `admin_traffic_history` RPC using the signed-in admin's
bearer token and the existing publishable key. The RPC rechecks session, membership,
and environment on every read. This lets new traffic UI work before the matching
HTTP route is deployed. Production builds use `/admin/v1/traffic` as usual.

UI-only changes can be developed against the existing deployed API and released
later through the normal main-branch CI/CD pipeline. Production builds exclude
the local mode marker and use same-origin API paths as before. No separate admin
codebase or deployment is required. New endpoints or database features require
compatible backend changes too; deploy backward-compatible API support first, or
use the local API workflow below while developing it. Local UI code is new while
the live API remains at its deployed version. Settings drafts remain browser-only.

## Local UI and local API

```powershell
npm.cmd run dev:admin
```

This starts the API on port 2570 and Vite on port 5174. Root .env supplies the
scoped Supabase URL and publishable key; live GCP inventory also needs application
default credentials as described below. Restart after API changes. This mode is
useful when modifying the backend alongside the UI.

## Fixture development

```powershell
npm.cmd run dev:admin:fixture
```

Use the token printed in the terminal. This explicitly starts a local API with
sample inventory and local authentication. It requires no hosted services and
cannot run in production. All modes use port 5174, so run one at a time.

The panel has eleven tabs; current feature coverage and remaining work are tracked
in [admin implementation](admin-implementation.md). Production data cannot be
selected from fixture mode. Polling pauses while hidden or editing settings.

## GCP adapter

In local mode, `ADMIN_INVENTORY_PROVIDER=fixture` supplies one clearly labeled local
sample VM. It never supplies sample values to GCP test or production. Even a
fixture VM reported as running has **unknown** process health, admissions,
players and rooms. Metrics remain unknown until their real producers exist.

For live reads, register **existing** VMs in [the manifest](../deploy/environments.json):

```json
{
  "schemaVersion": 1,
  "project": "project-7915787f-37b2-4286-aa7",
  "supabaseProject": "lkgxpgcmspxekggndzih",
  "resources": [
    {
      "id": "game-test",
      "environment": "gcp-test",
      "project": "project-7915787f-37b2-4286-aa7",
      "zone": "REPLACE_WITH_EXISTING_VM_ZONE",
      "instance": "REPLACE_WITH_EXISTING_VM_NAME"
    }
  ]
}
```

The example placeholders deliberately fail validation. Supply actual identities;
the committed registry contains the provisioned `shootball-game-test` VM. Duplicate target
identities, cross-project references, unknown keys and URL/path injection fail
startup. The registry is bounded to 20 entries; it is not a scaling entitlement.

Set `ADMIN_INVENTORY_PROVIDER=gcp` in the launching process. Supply application
default credentials externally for a narrowly scoped identity with
`compute.instances.get` on the intended resources. Never add service-account
keys to this repository or browser settings. The reader uses Google's
[authentication library](https://github.com/googleapis/google-auth-library-nodejs)
and the [Compute Engine instances.get endpoint](https://docs.cloud.google.com/compute/docs/reference/rest/v1/instances/get).
It requests the read-only Compute scope and fixes the project in every URL.
The CLI account is **not** automatically an application default identity.

API reads expose only registered names, zones and power states; provider metadata,
addresses and credentials are discarded. Concurrent refreshes share one pending
read per environment; results, including unavailable results, are cached for
15 seconds. Each SDK request has a five-second HTTP timeout and retries disabled.
An observation is stale after 30 seconds. Permission errors, missing targets,
disabled APIs and credential failures produce unknown inventory, not an empty
or healthy server pool. A failed refresh clears the UI's old observations.

Operator/CI GCP commands must go through `scripts/gcloud.cmd`, preserving its
account/project selection. Run the specific command's leaf-level help before
adding new CLI automation. Runtime application code does not invoke gcloud.

## Verification and next increment

```powershell
npm.cmd run typecheck
npm.cmd run test:admin
npm.cmd run build
```

`npm test` includes admin API tests alongside the existing gameplay tests.
Browser acceptance uses isolated frontend port 5191 and API port 2570; stop
`dev:admin` first. Screenshots and traces go to `.test-artifacts/admin/`.
Build artifacts are `apps/admin/dist` and `apps/admin-api/dist/index.js`. The API
build still requires npm runtime dependencies and the deployment manifest.
The combined static build places the admin bundle under `apps/web/dist/admin`.
Production containers run the API with Supabase authentication and static assets.

For deployment requirements and remaining operations work, see the
[setup rundown](gcp-admin-setup.md) and [ADM-01](integrationspec/admin-control-plane.md).
