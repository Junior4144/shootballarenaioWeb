# Admin monitoring and configuration increment

Updated October 7, 2026 (America/Chicago).

Primary website: https://shootball-arena.vercel.app

Primary admin: https://shootball-arena.vercel.app/admin/

Direct GCP origin: https://shootball-control-test-730016272076.us-central1.run.app

Vercel remains the public entry point and proxies to the same Cloud Run application. The admin uses same-origin API paths, so both URLs work without separate builds. Gameplay remains on https://136.71.64.19.sslip.io. No hosting resources or cloud IAM permissions were added.

## Implemented

- Overview: registered VMs plus authenticated live game counters when the updated game process is deployed.
- Live matches: room identity, phase, connected humans split by guest/account, bots, reserved reconnect seats, seat limits, admission state, elapsed time and simulation tick p95.
- Process telemetry: release, protocol, boot ID, uptime and resident memory. Join/completed-room counts are explicitly since process start, not unique users or historical analytics.
- Traffic: current population and since-boot activity with explicit measurement definitions.
- Game settings: every gameplay category from the shared build configuration; searchable fields, complete JSON editing, bounded import, strict shape/semantic validation, draft diff, map preview and JSON download. Server host/port are deployment-only. Drafts stay in browser memory and clear at sign-out. Polling pauses during editing.
- Accounts: searchable pages of registered account IDs, display names, creation/last-sign-in dates and email-verification state. No email addresses, tokens, credentials or user metadata are returned. Auth sign-in is not gameplay activity; accounts are project-wide because the existing Auth store is shared.
- Admin activity: searchable production membership-change audit pages. This is not a general operations history.
- Access directory: production membership roles, scope, grant/revocation dates and reasons; read-only.
- Health: independently measured Vercel primary, GCP origin and game HTTPS liveness; timestamps, latency, release IDs, failure states and proxy/origin version disagreement. Fixed targets, no redirects, bounded timeout, concurrent-read deduplication and 60-second cache. No production probes in local fixture mode.
- Architecture includes the Vercel proxy before the GCP origin. Configuration labels are distinct from measured health.

## Security and deployment

The admin API verifies current session/membership before each read. The game endpoint independently verifies the same administrator and production membership. Both retain no-store responses. Telemetry is projected into an explicit contract and contains no player session IDs, account IDs, email or credentials. No shared management secret or service-role key is introduced.

Migration `20261007134156_admin_readonly_records.sql` was applied to `lkgxpgcmspxekggndzih` via the Supabase connector. Its filename matches the version assigned by hosted migration history. The CLI could not initialize its telemetry file in the Windows sandbox, so hosted migration history was used. The private implementation rechecks access, fixes search_path, bounds searches/pages and exposes only an invoker wrapper. Existing table privileges, memberships and MFA rules are unchanged.

The frontend/API and game changes still require the normal application release. Deploy both images so /ops/telemetry exists on the game process. Existing game Supabase environment values are sufficient. The Vercel proxy requires no route changes for these same-origin admin endpoints. This increment has not pushed or triggered an application deployment.

## Verification

- All application type checks and full static/server builds passed.
- 12 admin API tests and 55 game tests passed, including real-client telemetry authentication and safe projection. A focused follow-up also verifies disconnect reservations, reconnect counters and disposed-room removal.
- Eight browser tests passed in installed Chrome, covering 1920x1080, 2560x1440 and 390x844, section navigation, authentication, config drafts, both deployment URLs, health failures, account pagination and HTML escaping.
- Hosted SQL authorization tests passed for anonymous denial, environment restrictions, revocation, page bounds and credential exclusion. Test sessions and revocations were rolled back.
- This Windows sandbox needed a test-only OS-user-info preload for tsx and an explicit installed Chrome path. Those compatibility files are under ignored .test-artifacts, not application code. PLAYWRIGHT_CHANNEL can optionally select an installed browser in the checked-in test config.
- Hosted authenticated UI and game telemetry after deployment still need release verification. Local tests do not establish live production health.

## Still required

Durable operation intents/outbox/worker, start/drain/resume/restart/stop/close-room controls, config revision storage/publication/rollback and client synchronization, deterministic map generation/connectivity validation, persistent guest/activity ingestion, DAU/MAU/funnels/playtime, billing/forecasts, operational log ingestion, background alerts/notifications and role-editing workflows. No inactive buttons claim these actions exist.
