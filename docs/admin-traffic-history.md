# Traffic explorer

Traffic & engagement has Game activity and Website traffic segments. Each supports 1h, 24h, 7d and 30d windows, an equally sized previous-period comparison, selectable metrics, keyboard interval inspection and an expandable data table. The previous line is aligned by elapsed time within each period. Refreshes preserve the chart, inputs and scroll position.

Game activity combines live connected seats with stored minute snapshots. It shows guests, accounts, active rooms, observed peaks and recorded joins. The game collector runs independently of the admin browser. Boot IDs prevent counter resets from becoming negative traffic. Missing samples are unknown, not zero; averages are sample-weighted, and coverage shows how much of the period was observed. Join deltas after gaps longer than two minutes are omitted rather than attributed to the wrong period. Samples survive game-server restarts in Supabase.

Website traffic is client-reported full-page loads, not HTTP requests or unique people. A random tab session survives reloads and resets after 30 minutes between page loads; no cookies, account IDs, URLs, referrers or emails are sent. Views and session starts are stored by the database's timestamp. In-game screen changes are not additional page views. Tracking runs only on the approved production website hosts; local development does not pollute history. Blockers, disabled JavaScript and automated clients can affect counts. This is operational analytics, not billing-grade or bot-filtered analytics. The views/session card divides period views by sessions that started in the period, which can include different cohorts at the boundaries.

Aggregate history retains 62 days, covering both halves of a 30-day comparison. Website event/session UUIDs are kept for up to two days for deduplication; cleanup runs during ingestion. Tables are private with RLS and no direct client grants. History RPCs recheck the current admin session and membership. Public website ingestion can only submit UUIDs, uses server timestamps, ignores duplicate event IDs, and limits a tab session to 20 page views per minute. It exposes no read access.

## Release setup

1. Apply `20261007162300_admin_traffic_history.sql` to project `lkgxpgcmspxekggndzih` (applied during implementation). Release the frontend and admin API together. Website collection starts with the updated website bundle and its existing scoped publishable key.
2. With explicit approval to create the game collector credential, run `scripts/provision-traffic-writer.ps1`. It creates a write-only token, stores its hash in `admin_private.traffic_writers`, and saves the secret to gitignored `.env.traffic`. It refuses to silently rotate an existing different credential.
3. Install `.env.traffic` on the game VM as `/var/lib/shootball/traffic/collector.env`, owned by root with mode 600. Do not put the token in Git, browser builds, release metadata or logs. Install the updated `deploy/vm/reconcile.sh` through the existing VM release-agent maintenance procedure.
4. Release the game image. The reconciler passes the credential as a server-only environment variable. A read-only active-release marker prevents candidate containers from recording zeros over the serving release. Existing CPU and instance limits are unchanged.
5. Verify minute samples appear in the admin. History cannot backfill traffic that was never collected. Before setup, the game history remains explicitly empty; live metrics continue to work. Website history is independent of the game writer.

Credential registration and production deployment are separate steps; the schema alone does not activate the game collector. Disable a collector by setting `traffic_writers.enabled=false`. No generic Supabase service-role key is needed on the game server.

## Verification

`supabase/tests/traffic_history.sql` tests authorization, duplicates, restarts, aggregation, comparison windows and session counting in a rolled-back transaction. Unit tests cover sample projection, collector failures and shutdown, summary weighting, API validation and browser session identity. Admin Playwright tests cover source/metric/range toggles, missing data, previous-period comparison, retained charts during outages, polling and mobile layout.
