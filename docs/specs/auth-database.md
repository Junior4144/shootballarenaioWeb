# Accounts, guests and profiles

The account implementation supersedes the former deferred-auth scope. Gameplay,
round scores and match history remain in memory. Development uses Node/npm and
hosted Supabase project `lkgxpgcmspxekggndzih`; no local containers are needed.

## Entry and browser sessions

The pixel entry screen offers email/password login and signup, Google OAuth and
temporary guest play. Phaser and the game connection are created only after a
Play choice. Restoring a registered session displays its public name, a name
editor, Play and Sign out; restoration never joins a room automatically.

Supabase JS owns persistent browser sessions and token refresh. Email/password
signup returns a session immediately: hosted `mailer_autoconfirm` is true and
`auth.email.enable_confirmations` is false. No verification email is required.
OAuth and password recovery use PKCE with code exchange on `/`. Callback credentials
are removed from browser history. Errors and denied OAuth requests return to a
usable entry screen. Reset-link requests and the `/?recovery=1` password-update
screen are implemented. PKCE password-reset links must open
in the browser that requested them. No arbitrary `next` URL is accepted.

Requests show loading and errors. Cancel waits for an outstanding Auth request,
then signs out its resulting local session; it cannot undo a signup, delivered
email, profile edit or password update already processed by Supabase. Requests
have a 15-second timeout. Sign out closes gameplay and clears resume tokens before
attempting local-session signout; failure is visible and retryable. Local signout
affects this browser's session, not every device.

## Game-server trust boundary

Protocol v7 distinguishes guest and account joins. Registered joins carry an
access token, never an authoritative user ID. The server uses a fresh Supabase
client with a publishable key and `auth.getUser(token)` to validate against the
scoped project. It rejects anonymous Supabase accounts, expired/invalid
credentials, missing profiles and account-service failures. Failed account
verification never falls back to guest. V7 test clients without a mode are guests
only if they send no credentials.

The private server identity contains the verified subject, access token and
expiry. Profile reads use that user's token and ownership RLS. Only the public
`{ kind, displayName? }` projection, keyed by Colyseus session ID, is broadcast.
Account UUIDs, emails, access/refresh tokens and privileged keys are absent from
snapshots and leaderboards. Names permit 3–20 ASCII letters, numbers, spaces,
hyphens and underscores, beginning with a letter or number. Names are public
labels, not unique identifiers or authorization claims. Public names for departed
players remain only while referenced by current snapshots/events/standings.

Registered clients forward refreshed access tokens to the room. The server
revalidates them and rejects a changed subject. Each simulation tick stops using
input after expiry; a periodic check closes the connection within 500ms.
Verification happens outside the simulation loop. Revoking a Supabase session
does not retroactively invalidate every issued JWT: other devices may retain
access until expiry; this phase has no global session revocation feed. Local
signout explicitly leaves the active room.

## Reconnection and identity changes

Guest play never creates an Auth user or profile. Its existing ten-second
reconnect window and tab-local sessionStorage token remain intact. Leave Match
pauses transport; Join / Retry resumes where possible. Refreshing the page still
requires choosing Play as Guest before reconnecting. Accounts / Exit intentionally
ends the identity and its reservation.

Resume-token keys include endpoint, protocol and guest/account subject. Identity
transitions and logout erase all arena resume tokens. A tab-local marker permits
same-account restoration while preventing reuse after a different login. Auth
changes from another tab stop the game. In-flight joins are invalidated on exit;
late successful joins immediately leave.

Colyseus skips `onAuth` during reconnection, so `onReconnect` revalidates the
server-held access token and its subject before restoring input. An account seat
lasts at most ten seconds and never beyond its token expiry. An expired seat
requires a new authenticated join using a refreshed token. Joins time out after
15 seconds and report a retryable error. The WebSocket payload ceiling is 18 KiB
to carry bounded (16,000-character max) access tokens in refresh messages; input
shape and rate validation remain in effect.

## Database and authorization

Migration `20261006192534_account_profiles.sql` creates only
`public.profiles(id uuid primary key references auth.users on delete cascade,
display_name text not null)`. The browser creates a default `Player_<suffix>`
after authentication and can update its display name. No email/provider metadata
is copied into profiles or used for authorization.

RLS is enabled. Authenticated, non-anonymous users can select/insert only their
own row and update only their own display name. UPDATE includes USING and WITH
CHECK ownership predicates; column grants also prevent changing the owner.
Guests cannot access the table. Clients cannot delete profiles. Account deletion
via trusted administration cascades to the profile. No security-definer function,
trigger, public directory, stats or match-history table was added.

See [account setup and verification](../auth-setup.md) for environment examples,
hosted configuration, tests and remaining release checks.
