# Account setup

## Local configuration

Use Node 22.12+ and npm. Copy root `.env.example` to `.env` without replacing
existing credentials, and `apps/web/.env.example` to `apps/web/.env.local`.

| Process | Required values for account play |
| --- | --- |
| Vite frontend | `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` |
| Game server | `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` |
| Hosted verification scripts only | Also `SUPABASE_SECRET_KEY` |

The URL must be `https://lkgxpgcmspxekggndzih.supabase.co`. Use the project's
`sb_publishable_…` key. The browser rejects secret/legacy key formats. All VITE
values are public and compiled into static assets. Never put service-role keys,
secret keys, Google client secrets or access tokens into VITE variables or git.
The game server itself needs no privileged Supabase key. Root `.env` is loaded
by the dev/start npm scripts; Vite reads `apps/web/.env.local`. Old
`NEXT_PUBLIC_*` variables are not used by this Vite application.

Run `npm ci` then `npm run dev`. The entry screen at `http://127.0.0.1:5173/`
waits for a Play choice. Guest play works when account configuration is absent.
Restart Vite after env changes and rebuild for production changes. Use `npm.cmd`
in PowerShell if needed. Any alternate frontend port must be allowlisted in Auth.

## Hosted schema

The profile migration is applied to the scoped project and its local filename
matches hosted migration history. For future migrations, first verify
`supabase/.temp/project-ref` is `lkgxpgcmspxekggndzih`, inspect the installed CLI's
`db push --help`, review the migration, and push only to this linked project.
Do not provision another project or a Docker stack as a fallback.

## Google and redirects

On 2026-10-06, live checks confirmed:

- Hosted Google and email providers are enabled; anonymous Auth signup is disabled.
- Email confirmation is disabled (`mailer_autoconfirm: true`), so signup returns
  a session immediately. Keep `auth.email.enable_confirmations = false`.
- Google authorization redirects to `accounts.google.com` with a configured
  client ID and callback `https://lkgxpgcmspxekggndzih.supabase.co/auth/v1/callback`.
- Non-delivered recovery-link probes accept `http://127.0.0.1:5173/`,
  `http://127.0.0.1:5173/?recovery=1`, `http://127.0.0.1:4173/`,
  `http://127.0.0.1:4173/?recovery=1` and `http://localhost:5173/`.

Those settings were already present when rechecked during implementation; no
OAuth credentials were overwritten. Probes verify launch/callback selection and
redirect acceptance, not Google consent completion or the client secret.
No deployed frontend URL was found in the repository, and no authenticated
console/browser surface or Google OAuth credentials were available to inspect
Google-side settings. No real Google user was signed in.

Before production release:

1. In existing GCP project `project-7915787f-37b2-4286-aa7`, open Google Auth
   Platform with `gbjunior010@gmail.com`. Verify the Web OAuth client used by
   Supabase has the hosted callback above as an authorized redirect URI. Verify
   the consent audience/testing users and `openid`, email and profile scopes.
2. In [Supabase URL configuration](https://supabase.com/dashboard/project/lkgxpgcmspxekggndzih/auth/url-configuration),
   set Site URL to the actual production HTTPS origin. Add exact production
   `https://www.orb-skirmish.com/` and `https://www.orb-skirmish.com/?recovery=1` redirects. Retain only
   development URLs you use. Do not guess a hostname or use a broad production
   wildcard. Add the production origin to the Google Web client.
3. In [Supabase providers](https://supabase.com/dashboard/project/lkgxpgcmspxekggndzih/auth/providers),
   confirm Google is enabled and its existing client ID/secret match that Web
   client. Keep its secret exclusively in hosted provider configuration.
4. Deploy with public frontend env values and the server's public key/URL. Use
   HTTPS/WSS and route `/` with OAuth query parameters to the static app.
5. Run a real Continue with Google flow through consent and back to the entry
   screen. Confirm Play, reload restoration, Sign out, cancellation and profile
   naming. This remains a manual release check.
6. Verify password-reset messages arrive at a real inbox. Signup needs no verification email.
   Configure custom SMTP if needed for public delivery and sending limits. The
   automated hosted tests deliberately do not send email.

PKCE password-reset links must open in the requesting browser. For expired,
reused or cross-browser links, request a new link from that browser. Guests have
no password or saved profile and do not need anonymous Auth enabled.

## Verification

```sh
npm run typecheck
npm test
npm run test:e2e --workspace @shootball/web
npm run build
```

The browser suite runs isolated ports 5189/2569 with a fixture publishable key.
Auth HTTP responses are mocked in account UI tests; gameplay uses the real local
server. Coverage includes choice gating, responsive pixel panels, immediate signup
without verification, reset/recovery, cancellation, restoration, logout,
identity isolation, and Google denial/code-exchange errors. These fixtures do not
constitute a real Google login or SMTP test.

Server tests use real WebSockets with a controlled verifier: invalid credentials,
verified-subject identity, safe snapshots, refresh, account switch rejection,
reconnect revalidation and expiry. Guest lifecycle, reconnection, validation and
gameplay tests remain in the suite.

Optional hosted tests (root `.env` must include the test-only secret key):

```sh
node --env-file=.env --import tsx scripts/auth-hosted-smoke.ts
node --env-file=.env scripts/check-auth-config.mjs
```

These scripts use only the pinned project. They create uniquely named disposable
users, test immediate signup or generate recovery links without sending mail, and delete
those exact users in `finally` (profiles cascade). The smoke verifies real
signup without email verification, password login, own-profile creation/update,
cross-user read/write denial, immutable ownership, guest denial, name constraints,
server token verification, refresh, snapshot privacy and logout. Never use a
production user's credentials for these tests.

Set `ARENA_TEST_ENDPOINT` to an isolated built server to repeat the live smoke
against the production artifact. Source-server and built-server live smokes
passed on 2026-10-06; generated users were cleaned up. Do not expose test keys in
output, screenshots or committed fixtures.

The security advisor reported no profile/RLS finding. It reported two existing
execute-grant warnings for the pre-existing `public.rls_auto_enable()` event
trigger function, which this migration does not create or alter. See the
[anonymous execution advisory](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable)
and [authenticated execution advisory](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable).

## Official references

- [Google OAuth setup](https://supabase.com/docs/guides/auth/social-login/auth-google)
- [Password and recovery flows](https://supabase.com/docs/guides/auth/passwords)
- [PKCE](https://supabase.com/docs/guides/auth/sessions/pkce-flow)
- [Server-side getUser verification](https://supabase.com/docs/reference/javascript/auth-getuser)
- [Redirect allowlists](https://supabase.com/docs/guides/auth/redirect-urls)
- [Ownership-based RLS](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Colyseus authentication](https://docs.colyseus.io/auth/room)
