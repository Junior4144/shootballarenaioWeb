# Admin control plane development

The control plane supports verified Supabase sessions, current membership and MFA.
It remains read-only. See [the setup rundown](gcp-admin-setup.md) for actual cloud
resources, budget gates and deployment status.

## Run

```powershell
npm.cmd ci
npm.cmd run dev:admin
```

Open `http://127.0.0.1:5174/admin/` and sign in using an authorized admin account.
The root `.env` supplies the scoped Supabase URL and publishable key. Enroll or
verify your authenticator when prompted. Sessions stay in browser memory.
The launcher starts the API at port 2570 and admin Vite at 5174. Stop with Ctrl+C.
No Docker is required. Restart the launcher after API changes.

For fixture-only development, explicitly set `ADMIN_AUTH_MODE=local` before
starting and use the printed token. This mode is loopback-only and cannot run
in production. Hosted authentication defaults to the GCP inventory provider;
local mode defaults to fixtures.

All ten navigation destinations exist. Overview, server inventory, interactive
architecture components and integration status have working read-only views.
The remaining destinations explain their missing integrations. Server controls
are disabled. The filter searches server rows and architecture components.
Environment selection persists; credential storage does not. Polling pauses
when hidden or while editing a filter/environment input.

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

Operations, telemetry and public hosting remain release gates. See the
[setup rundown](gcp-admin-setup.md) and [ADM-01](integrationspec/admin-control-plane.md).
