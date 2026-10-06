# Admin control plane development

The first ADM-01 increment is a **local, read-only foundation**. It includes an
independent API, separate browser bundle, environment contracts, manifest
validation, an injectable fixture provider and a scoped Compute Engine reader.
It is not the hosted administrator authentication or operations release.

## Run

```powershell
npm.cmd ci
npm.cmd run dev:admin
```

Open `http://127.0.0.1:5174` and paste the local session token printed in that
terminal. The launcher starts the API at `127.0.0.1:2570` and the admin app at
`127.0.0.1:5174`. It does not start or require the game server. Stop with Ctrl+C.
No Docker or Supabase container is needed.
The frontend supports Vite hot reload; restart the launcher after API changes.

The token is generated for this development process, retained only in browser
memory, and cleared on sign-out/reload. Restarting with a newly generated token
invalidates the previous token. A supplied `ADMIN_LOCAL_TOKEN` persists until you
change it. This is a local development credential, not an administrator account.
The API requires explicit local mode, binds only to loopback, restricts Host and
Origin, rejects mutations, rate-limits requests and refuses production/Cloud Run
startup. Do not publish or tunnel the development servers.

All ten navigation destinations exist. Overview, server inventory, interactive
architecture components and integration status have working read-only views.
The remaining destinations explain their missing integrations. Server controls
are disabled. The filter searches server rows and architecture components.
Environment selection persists; credential storage does not. Polling pauses
when hidden or while editing a filter/environment input.

## GCP adapter

The default `ADMIN_INVENTORY_PROVIDER=fixture` supplies one clearly labeled local
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
the committed registry is empty because no VMs are provisioned. Duplicate target
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
The compiled API retains the same local-only startup guard.

Next: verified Supabase admin sessions, MFA and current membership checks;
restricted schema and audited owner bootstrap; transactional operations/outbox;
game readiness/admissions and authenticated heartbeats; then a durable GCP
worker. Configuration publication, account directory, analytics, billing,
logs/alerts and hosted deployment remain separate workstreams in
[ADM-01](integrationspec/admin-control-plane.md).

Before provisioning, resolve region/zone, VM size, domains/stable endpoints,
budget and verified initial owner UUID. Cloud Run must host the admin API and
worker independently of game VMs, but this local-auth build is intentionally
not deployable. No cloud resources, IAM grants or database migrations were
created by this increment.
