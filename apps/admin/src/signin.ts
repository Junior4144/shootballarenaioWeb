import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Environment } from '@shootball/admin-contracts';
export type AuthConfig = { mode: 'local' | 'supabase'; supabaseUrl?: string; publishableKey?: string; environment?: Environment };
let client: SupabaseClient | undefined;
let config: AuthConfig;
export async function loadAuth(): Promise<AuthConfig> {
  const response = await fetch('/admin/config', { cache: 'no-store' });
  if (!response.ok) throw new Error('Admin service unavailable');
  config = await response.json();
  if (config.mode === 'supabase') {
    if (config.supabaseUrl !== 'https://lkgxpgcmspxekggndzih.supabase.co' || !config.publishableKey?.startsWith('sb_publishable_')) throw new Error('Invalid admin authentication configuration');
    client = createClient(config.supabaseUrl, config.publishableKey, { auth: { persistSession: false, autoRefreshToken: true, detectSessionInUrl: false } });
  } else if (config.mode !== 'local') throw new Error('Invalid authentication mode');
  return config;
}
export async function accessToken(): Promise<string | null> {
  return client ? (await client.auth.getSession()).data.session?.access_token ?? null : null;
}
export async function signOut() { if (client) await client.auth.signOut({ scope: 'local' }); }
const text = (element: HTMLElement, value: string) => { element.textContent = value; };
export function renderSignIn(root: HTMLElement, environment: Environment, completed: (token: string) => void, initialError = '') {
  root.innerHTML = `<main class="login panel"><p class="eyebrow">SHOOTBALL / ADMINISTRATION</p><h1>Admin sign in</h1><p>Use your existing account. Access requires an admin membership and an authenticator code.</p><form id="admin-login"><label>Email<input name="email" type="email" autocomplete="username" required></label><label>Password<input name="password" type="password" autocomplete="current-password" required></label><button class="primary">Sign in</button></form><div id="mfa"></div><p id="auth-error" role="alert"></p><a href="/">Back to game</a></main>`;
  const message = root.querySelector<HTMLElement>('#auth-error')!;
  text(message, initialError);
  const form = root.querySelector<HTMLFormElement>('form')!;
  form.onsubmit = async event => {
    event.preventDefault(); const submit = form.querySelector<HTMLButtonElement>('button')!; submit.disabled = true;
    text(message, 'Signing in…');
    try {
      const values = new FormData(form);
      const result = await client!.auth.signInWithPassword({ email: String(values.get('email')), password: String(values.get('password')) });
      (form.elements.namedItem('password') as HTMLInputElement).value = '';
      if (result.error || !result.data.session) throw new Error('Sign-in failed. Check your email and password.');
      const response = await fetch(`/admin/v1/session?environment=${environment}`, { headers: { Authorization: `Bearer ${result.data.session.access_token}` } });
      const access = await response.json();
      if (!response.ok) { await signOut(); throw new Error(response.status === 403 ? 'This account does not have admin access to this environment.' : 'Admin access check unavailable. Retry shortly.'); }
      if (access.status === 'allowed') { completed(result.data.session.access_token); return; }
      if (access.status !== 'mfa-required') throw new Error('Access denied');
      form.hidden = true; text(message, '');
      await renderMfa(root.querySelector<HTMLElement>('#mfa')!, message, completed);
    } catch (error) { text(message, error instanceof Error ? error.message : 'Sign-in unavailable'); }
    finally { submit.disabled = false; }
  };
}
async function renderMfa(root: HTMLElement, message: HTMLElement, completed: (token: string) => void) {
  const { data, error } = await client!.auth.mfa.listFactors();
  if (error) throw new Error('Unable to load authenticator settings. Reload and retry.');
  let factorId = data.totp.find(f => f.status === 'verified')?.id;
  root.innerHTML = '<h2>Authenticator verification</h2><p id="instructions"></p><div id="enroll"></div><form><label>Six-digit code<input name="code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6" required></label><button class="primary">Verify and open admin</button></form><button id="cancel" type="button">Cancel sign in</button>';
  if (!factorId) {
    root.querySelector('#instructions')!.textContent = 'Set up your authenticator app using this QR code, then enter its six-digit code.';
    // Remove only abandoned, unverified enrollments from this dedicated flow.
    for (const factor of data.all.filter(f => f.factor_type === 'totp' && f.status === 'unverified' && f.friendly_name === 'ShootBall admin')) await client!.auth.mfa.unenroll({ factorId: factor.id });
    const enrollment = await client!.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'ShootBall admin', issuer: 'ShootBall Arena' });
    if (enrollment.error) throw new Error('Authenticator enrollment unavailable. Reload and retry.');
    factorId = enrollment.data.id;
    const image = document.createElement('img'); image.alt = 'Scan with your authenticator app'; image.width = 240;
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(enrollment.data.totp.qr_code)}`;
    root.querySelector('#enroll')!.append(image);
  } else root.querySelector('#instructions')!.textContent = 'Enter the current code from your authenticator app.';
  root.querySelector<HTMLButtonElement>('#cancel')!.onclick = async () => { await signOut(); location.reload(); };
  root.querySelector('form')!.onsubmit = async event => {
    event.preventDefault(); const form = event.currentTarget as HTMLFormElement; const button = form.querySelector('button')!; button.disabled = true;
    try {
      const result = await client!.auth.mfa.challengeAndVerify({ factorId: factorId!, code: String(new FormData(form).get('code')) });
      if (result.error) throw new Error('Code not accepted. Try the current authenticator code.');
      const token = await accessToken(); if (!token) throw new Error('Session expired. Reload and sign in again.');
      root.replaceChildren(); completed(token);
    } catch (error) { text(message, error instanceof Error ? error.message : 'Verification unavailable'); }
    finally { button.disabled = false; }
  };
}
