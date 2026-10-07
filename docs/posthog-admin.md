# PostHog website analytics

The verified project is **ShootBallArena**, ID **651980**, in the US region.
Open <https://us.posthog.com/project/651980/web> or the existing
[Analytics basics dashboard](https://us.posthog.com/project/651980/dashboard/2183756).
Existing gameplay insights and event names are preserved.

## Local setup

1. Run `posthog-cli login` and select ShootBallArena. The admin reader pins the project ID and checks the project before reading data.
2. Set the public project token in `apps/web/.env.local` as `VITE_POSTHOG_KEY`, and set `VITE_POSTHOG_HOST=https://us.i.posthog.com`. The existing local configuration already contains the verified token.
3. Run `npm run dev:web` and `npm run dev:admin:live` in separate terminals.
4. Visit the website at `http://127.0.0.1:5173`. Sign into `http://127.0.0.1:5174/admin/` with your existing administrator account.
5. Open **Traffic & engagement → PostHog analytics → Development** to see local website visits. Production selects only the approved Vercel and Cloud Run hostnames. Host ports are normalized before filtering.

The browser uses `posthog-js` to capture pageviews and the previously implemented
guest selection, profile update, match connection/completion/exit and radar events.
Existing identity linking, exception capture, and dedicated gameplay logs remain.
Automatic click text and element attributes are masked; pageviews capture History
API navigation. No PostHog tracking is installed on the admin UI.

## Admin data path

The protected `/admin/v1/traffic?source=posthog&range=24h&scope=production&environment=production`
endpoint runs `posthog-cli api call --json execute-sql` with a fixed, server-generated
query. The only browser-selectable inputs are four allowlisted ranges and two scopes.
It never accepts SQL, project IDs, tokens, or hosts from the browser.

The server returns numeric aggregates only. Every request checks current admin
membership and MFA before accessing the shared cache. In local live mode, the Vite
bridge checks the deployed admin session before using your local CLI login. Normal
hosted mode uses the API's existing authorizer. No private CLI credentials enter
the client bundle, response, or URL.

Results are cached for 60 seconds with concurrent requests coalesced. On failure,
cached observations up to 15 minutes old remain visible with a stale notice and
their original timestamp. Failed reads without a cache return an error, not zeros.
Successful reads with no matching events return zero recorded counts. PostHog
ingestion latency means those zeros are not proof that nobody visited.

Charts compare two adjacent rolling periods, ending at the most recent completed
UTC minute. Bucket widths are 1 minute / 15 minutes / 1 hour / 6 hours for the
1h / 24h / 7d / 30d controls. Visitors count distinct visitor IDs; sessions count
distinct nonempty session IDs with a pageview. Whole-period totals are queried
separately; never sum interval visitors or sessions. These are custom admin
definitions, not saved governed metrics or exact replicas of every PostHog Web
Analytics filter. Project-internal/test-user filters are not applied automatically.

History and live game requests render independently. Background updates retain
chart controls, comparison choice, table expansion, and existing observations.

## Production release

- Set repository/build variables `VITE_POSTHOG_KEY` and `VITE_POSTHOG_HOST` to the
  public configuration. The control-plane Dockerfile and container workflow pass
  these through at build time. Any separate Vercel frontend build needs the same
  two values in its build environment.
- The runtime needs a **server-only** `POSTHOG_CLI_API_KEY` with query and project
  read access to project 651980, delivered through the existing secret-management
  workflow. Do not put a personal read key in any `VITE_` variable or image build arg.
  `POSTHOG_CLI_PROJECT_ID` is pinned by code. Local CLI login is not copied into images.
- If using the repository's deployment workflow, set `POSTHOG_API_KEY_SECRET_VERSION`
  to an existing Secret Manager `secret-name:version` reference. The runtime service
  account must already have access. The script references the secret; it does not
  create credentials or grant permissions.
- Deploy the web and admin API changes together using the normal immutable release
  process. A local Vite bridge cannot make the currently deployed API gain this route.
- Production stack traces still need the existing source-map upload workflow wired
  to PostHog if readable minified error traces are desired.

No production release, new API credential, or cloud permission grant was performed
as part of this local integration. AI observability was not added: this traffic
integration has no LLM call path. Existing dedicated gameplay logging was preserved.
