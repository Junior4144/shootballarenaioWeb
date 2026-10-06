# ADM-01 foundation verification

Date: 2026-10-06. Scope: first local read-only development increment.

Completed verification:

- `npm run typecheck`: all four applications pass.
- `npm test`: 75 tests pass (15 web, 54 game server, 6 admin API).
- `npm run test:admin`: 6 API tests and 4 Chromium acceptance tests pass.
- `npm run build`: player, game server, admin API and admin frontend build.
- Desktop server view and narrow architecture screenshots visually reviewed;
  screenshots for all three target sizes are in `.test-artifacts/admin/`.
- Player bundle search found no admin UI/provider-library markers.

The existing player bundle size warning remains. Admin browser output is about
10.8 kB JavaScript and 5.2 kB CSS before compression, separate from the player app.

Implemented portions: ADM-01A resource/observation contracts; ADM-01B separate
admin app/API with explicit local development authentication; ADM-01D fixture
and GCP inventory adapters; ADM-01F logical architecture and unavailable states.
These do not complete the corresponding workstreams or hosted acceptance gates.

GCP evidence: the repository wrapper initially returned `SERVICE_DISABLED` for
Compute Engine. After the user enabled the API, the same pinned-account/project
read completed successfully and returned an empty instance list. No resources
were created, started, stopped or otherwise changed. The live SDK adapter cannot
be exercised against an actual VM until one is registered and an appropriate
runtime identity is configured; its transport is tested with injected responses.

Tests cover manifest scope/injection/duplicate rejection, local-only startup,
concurrent inventory caching, unavailable/denied provider responses, explicit
fixture isolation, anonymous requests, Host/Origin rejection, invalid environment
selection and disabled mutation routes. Browser tests cover sign-in/out,
credential non-persistence, environment persistence, unavailable/error states,
server controls, architecture selection and layouts at 1920x1080, 2560x1440 and
390x844. These are local tests, not proof of hosted Auth, IAM or cloud operations.

Remaining acceptance: ADM-AC-01/02 need real membership and database policy tests;
03–14 and 17–19/21 need the operations/config/analytics implementations; 15/16
have unknown-state presentation only; 20 has local browser coverage; 22 has
application manifest coverage but cloud IAM/database isolation is not verified.

Dependency review: npm reported existing `concurrently`/`shell-quote` and
`source-map-js` advisories. The new Google authentication dependency was not in
that advisory report. This increment does not perform unrelated dependency
upgrades. Resolve the existing toolchain advisories before release.
