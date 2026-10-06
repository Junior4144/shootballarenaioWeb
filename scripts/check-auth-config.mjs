// Provider/redirect probe with disposable test-user cleanup. Prints no keys, OAuth state or tokens.
import assert from 'node:assert/strict';
const url = 'https://lkgxpgcmspxekggndzih.supabase.co';
assert.equal(process.env.SUPABASE_URL, url);
const headers = { apikey: process.env.SUPABASE_PUBLISHABLE_KEY };
const settings = await fetch(`${url}/auth/v1/settings`, { headers }).then(r => r.json());
console.log(JSON.stringify({ google: settings.external?.google, email: settings.external?.email, anonymous: settings.external?.anonymous_users, emailAutoconfirm: settings.mailer_autoconfirm }));
for (const target of ['http://127.0.0.1:5173/', 'http://127.0.0.1:5173/?recovery=1', 'http://127.0.0.1:4173/', 'http://127.0.0.1:4173/?recovery=1', 'http://localhost:5173/']) {
  const request = new URL(`${url}/auth/v1/authorize`);
  request.search = new URLSearchParams({ provider: 'google', redirect_to: target, code_challenge: 'a'.repeat(43), code_challenge_method: 's256' }).toString();
  const response = await fetch(request, { headers, redirect: 'manual' });
  const location = response.headers.get('location');
  if (!location) { console.log(JSON.stringify({ requested: target, status: response.status })); continue; }
  const google = new URL(location);
  console.log(JSON.stringify({ requested: target, status: response.status, provider: google.origin, callback: google.searchParams.get('redirect_uri'), clientConfigured: !!google.searchParams.get('client_id') }));
}
// Auth state is opaque. Use non-delivered recovery links for a disposable user to
// verify how the hosted redirect allowlist resolves each actual app URL.
if (process.env.SUPABASE_SECRET_KEY) {
  const { createClient } = await import('@supabase/supabase-js');
  const admin = createClient(url, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const email = `arena-redirect-test-${crypto.randomUUID()}@example.com`;
  const { data, error } = await admin.auth.admin.createUser({ email, email_confirm: true });
  assert.ifError(error);
  try {
    for (const redirectTo of ['http://127.0.0.1:5173/', 'http://127.0.0.1:5173/?recovery=1', 'http://127.0.0.1:4173/', 'http://127.0.0.1:4173/?recovery=1', 'http://localhost:5173/']) {
      const link = await admin.auth.admin.generateLink({ type: 'recovery', email, options: { redirectTo } });
      assert.ifError(link.error);
      console.log(JSON.stringify({ requested: redirectTo, selectedRedirect: link.data.properties.redirect_to, allowed: link.data.properties.redirect_to === redirectTo }));
    }
  } finally { assert.ifError((await admin.auth.admin.deleteUser(data.user.id)).error); }
}
