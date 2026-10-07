# Admin refresh and health observations

The admin polls every 15 seconds while visible. Background refreshes patch changed DOM nodes and keep the previous observation during loading or temporary errors. Inputs, focus, and table scroll positions survive updates. Polling skips active section requests and focused inputs. Authentication failures clear privileged data.

The Cloud Run deployment allows one concurrent request on one instance. Probing either its public origin or the Vercel proxy from inside an admin request blocks those probes behind the calling request. The protected health API now probes only the separate gameplay service (cached for 60 seconds). After that API request completes, the browser probes the fixed public Vercel and GCP liveness URLs. Public GET /health and /healthz permit cross-origin reads; probes omit credentials. Admin endpoints retain origin checks and authorization. HTTP errors, timeout, invalid liveness JSON, and network/CORS failures have separate messages. Browser observations reflect the administrator's network, not a global uptime monitor.

Release the admin frontend and admin API together for the browser health checks. This change does not require increasing CPU, concurrency, or instance limits.

Migration 20261007160149_admin_account_details adds email, phone, account type, linked provider names, update and verification timestamps, and ban expiry to the existing administrator-only directory. Search includes email and phone. Anonymous Supabase Auth users are included; temporary gameplay guests without an Auth record have no persistent account details. No passwords, tokens, or unrestricted metadata are projected. Existing session and membership checks remain in effect.

Validation: admin API tests, Playwright admin suite, both admin builds, and supabase/tests/admin_records.sql against the scoped hosted project. The SQL test rolls back its fixture session, anonymous user, and membership revocation.
