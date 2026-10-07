# GCP releases: dev to main

The release flow is `feature branch -> dev -> main`. Pushes and pull requests validate types, application tests, admin browser behavior and production Docker containers. **Only pushes to `main` deploy to GCP.** A `dev` push never changes the running game. To release, merge the tested `dev` commit into `main` and push `main`; there is no manual deploy button required. A manual rerun on main is also available.

## Deployment sequence

1. Validate the main commit and deployment policy.
2. Build the web/admin and game images on GitHub, then publish commit-tagged images to the existing Artifact Registry repository using GitHub OIDC.
3. Pass the immutable game image digest to the single VM's release metadata. Its systemd timer checks roughly every 30–90 seconds, pulls with the VM's read-only identity, and tests a candidate container before replacing the running process.
4. Verify the game's publicly trusted HTTPS endpoint reports the requested commit.
5. Deploy the matching web/admin image digest to the independent Cloud Run service.
6. Verify the player site, admin sign-in shell, unauthenticated admin rejection, matching release revision and a guest multiplayer connection receiving live state.

The release workflow serializes deployments and does not cancel an in-progress rollout. A failed candidate leaves the existing game running. The previous game container/image is retained for manual rollback. **Promoting a game release ends current in-memory matches**, so this single-VM test environment is not a zero-downtime production cluster. Cloud Run failure after a game update can leave the prior frontend revision live; inspect the failed run before retrying or rolling back.

## Endpoints and identities

- [Player site](https://shootball-control-test-730016272076.us-central1.run.app) and [admin sign-in](https://shootball-control-test-730016272076.us-central1.run.app/admin/): Cloud Run service `shootball-control-test`, region `us-central1`.
- Game WebSocket endpoint: `wss://136.71.64.19.sslip.io`; Caddy provides HTTPS on the existing game VM.
- Reserved address: `136.71.64.19`, retained across VM restarts. Static IPv4 continues to incur charges when the VM is stopped.
- CI identity: `shootball-github`, restricted by OIDC to this repository, owner, main branch and release workflow. It writes the one image repository and receives scoped instance metadata/service-update permissions.
- Game identity: `shootball-game`, only Artifact Registry reader on `shootball-test`, with storage read-only OAuth scope. No service-account key is stored in GitHub or on disk.
- Admin identity: `shootball-admin`, reads only the registered game VM. Application admin authorization checks live Supabase membership and sessions; the verified primary account is exempt from MFA by request; public Cloud Run invocation serves the player site/sign-in shell, not unrestricted admin data.

The VM permits public TCP 80/443 only. SSH and raw game port 2567 are not exposed. Caddy certificate state persists on the existing disk. Application container logs are bounded locally. The temporary hostname relies on the third-party sslip.io DNS service; replace it with an owned domain for production.

The web service reports its revision at `/health`; the VM reports at `/healthz`. Cloud Run reserves some paths ending in `z`, so the public web smoke check deliberately uses `/health` ([Google's documented restriction](https://docs.cloud.google.com/run/docs/known-issues#reserved-url-paths)). The proxy runs as UID 1000 with only `NET_BIND_SERVICE`, which its official executable requires, and no new privileges.

## Low-traffic cost estimate

Planning estimate: **about $11.75/month before tax**, with no compute/disk Free Tier discount assumed, based on:

- Existing VM, disk and in-use IPv4: about $10.77 for 744 hours.
- 2 GiB combined outbound traffic: reserve $0.46 (using $0.23/GiB).
- Up to 2 GiB of retained registry storage: reserve $0.21, ignoring the free allowance.
- Cloud Run: minimum 0 / maximum 1 instance, 0.08 CPU, 256 MiB, concurrency 1, request-based billing; assume 1 hour total active time and 10,000 requests per month, about $0.02 before free allowances, plus startup contingency.

Sources: [VM/disk/network breakdown](gcp-test-instance.md), [Cloud Run rates](https://cloud.google.com/run/pricing), [Artifact Registry rates](https://cloud.google.com/artifact-registry/pricing). No extra VM, NAT gateway or load balancer is added. The $12 project budget alerts remain active. Increased traffic, longer admin usage, larger image retention, taxes and unrelated services can increase the bill; this is not a hard spending cap.

## Operations

Start development with Node/npm as before. Docker is for release validation and production packaging only. `scripts/gcloud.cmd` remains the required CLI entry point and preserves project/account configuration.

Change application code through dev, then main. The VM release agent itself is bootstrapped from the reviewed `deploy/vm` scripts; changes to that agent require updating the VM metadata and restarting its bootstrap process, not merely publishing a new game image. A stopped VM is not automatically started by the release workflow, and deployment will fail its health timeout rather than silently provisioning another VM.

To roll back, revert the application change through dev/main and push main; the pipeline builds and verifies the reverted code. Do not force-push or point the VM at an unreviewed image. The retained previous container is an additional operator recovery option, not an automatic rollback promise.

## Verification evidence

On 2026-10-06 (America/Chicago), [automatic main release 37555512551](https://github.com/Junior4144/shootballarenaioWeb/actions/runs/37555512551) passed validation, image publication, VM rollout, Cloud Run update and the live multiplayer smoke test. This upgraded an already-running game from commit `61df5c0` to `52ed863`, verifying subsequent main pushes as well as initial provisioning. [Container validation](https://github.com/Junior4144/shootballarenaioWeb/actions/runs/37555512628) also passed.

A separate Chromium session opened the real player site, selected Play as Guest, entered the arena and reached `Arena · Connected` with no page errors. The hosted admin sign-in screen loaded with real Supabase configuration. Anonymous admin API requests returned 401. The primary administrator subsequently requested normal sign-in without an authenticator. That account-specific database exemption is covered by `supabase/tests/admin_primary_access.sql`; revoked membership, expired sessions, forbidden environments and spoofed email claims remain denied. Multiplayer capacity has not been load-tested.

The hosted admin uses only the `production` application scope. The existing VM registration and live admin memberships were migrated from `gcp-test`; API requests for local/test environments are rejected on the hosted service. Existing infrastructure resource names remain unchanged.
