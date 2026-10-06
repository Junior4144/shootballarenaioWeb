import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js';
import { clearResumeTokens, type PlayIdentity } from '../network/PracticeConnection';

const PROJECT = 'https://lkgxpgcmspxekggndzih.supabase.co';
const el = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
type Mode = 'login' | 'signup' | 'reset' | 'recovery';
export function callbackError(url: URL): string | undefined {
  const error = url.searchParams.get('error') || new URLSearchParams(url.hash.slice(1)).get('error');
  if (!error) return;
  return error === 'access_denied' ? 'Sign-in cancelled. Choose another way to play.' : 'The sign-in link failed or expired. Please try again or request a new link.';
}

export class AccountScreen {
  private client?: SupabaseClient;
  private session: Session | null = null;
  private mode: Mode = 'login';
  private busy = false;
  private cancelled = false;
  private ready = false;
  private profileReady = false;
  private profileGeneration = 0;
  private storage?: Storage;
  private recovery = false;
  constructor(private play: (identity: PlayIdentity) => void, private stop: () => void, private refresh: () => void) {
    try { this.storage = sessionStorage; } catch { /* Optional storage. */ }
    const url = import.meta.env.VITE_SUPABASE_URL, key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
    if (url === PROJECT && key?.startsWith('sb_publishable_')) {
      this.client = createClient(url, key, {
        auth: { flowType: 'pkce', detectSessionInUrl: false, persistSession: true, autoRefreshToken: true },
        global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(15000) }) },
      });
      this.client.auth.onAuthStateChange((event) => {
        // Leave the SDK's session lock before making further Auth calls.
        setTimeout(() => {
          if (event === 'PASSWORD_RECOVERY') { this.recovery = true; this.mode = 'recovery'; this.stop(); }
          if (this.ready && !this.busy) void this.client!.auth.getSession().then(({ data }) => this.accept(data.session)).catch(() => this.show('Could not load your profile. Retry or sign out.', true));
          if (event === 'TOKEN_REFRESHED') this.refresh();
        }, 0);
      });
    }
    el<HTMLFormElement>('account-form').onsubmit = event => { event.preventDefault(); void this.submit(); };
    const selectMode = (mode: 'signup' | 'login') => {
      if (this.busy || !this.ready || !this.client) return;
      this.mode = mode;
      el<HTMLInputElement>('confirm-password').value = '';
      el('confirm-password').removeAttribute('aria-invalid');
      this.show(''); this.render();
    };
    for (const mode of ['signup', 'login'] as const) {
      el(`${mode}-tab`).onclick = () => selectMode(mode);
      el(`${mode}-tab`).onkeydown = event => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        const next = event.key === 'Home' ? 'signup' : event.key === 'End' ? 'login' : mode === 'signup' ? 'login' : 'signup';
        selectMode(next); el(`${next}-tab`).focus();
      };
    }
    el('confirm-password').oninput = () => el('confirm-password').removeAttribute('aria-invalid');
    el('forgot-password').onclick = () => { this.mode = 'reset'; this.show(''); this.render(); };
    el('auth-back').onclick = () => { this.mode = 'login'; this.show(''); this.render(); };
    el('auth-cancel').onclick = () => { this.cancelled = true; this.show('Cancelling… The current request may still complete. Please wait.'); };
    el('google-login').onclick = () => { void this.run(async () => {
      const { data, error } = await this.api().auth.signInWithOAuth({ provider: 'google', options: { redirectTo: this.redirect(), skipBrowserRedirect: true } });
      if (error) throw error;
      if (!this.cancelled && data.url) location.assign(data.url);
    }); };
    el('guest-play').onclick = () => { if (!this.busy && this.ready && !this.session) this.play({ kind: 'guest' }); };
    el('account-play').onclick = () => { void this.run(async () => {
      const userId = this.session!.user.id;
      await this.token(userId);
      if (!this.cancelled) this.play({ kind: 'account', userId, getToken: () => this.token(userId) });
    }); };
    el('account-signout').onclick = () => { void this.run(async () => {
      this.stop(); clearResumeTokens(this.storage);
      const { error } = await this.api().auth.signOut({ scope: 'local' });
      if (error) throw error;
      this.recovery = false; this.mode = 'login'; await this.accept(null);
      this.show('Signed out on this browser.');
    }); };
    el<HTMLFormElement>('profile-form').onsubmit = event => { event.preventDefault(); void this.run(async () => {
      const name = el<HTMLInputElement>('display-name').value.trim();
      if (!/^[A-Za-z0-9][A-Za-z0-9 _-]{2,19}$/.test(name)) throw new Error('Use 3–20 letters, numbers, spaces, hyphens or underscores. Start with a letter or number.');
      const { error } = await this.api().from('profiles').update({ display_name: name }).eq('id', this.session!.user.id).select('display_name').single();
      if (error) throw new Error('Could not save your display name. Please retry.');
      this.profileReady = true; el('account-identity').textContent = `ACCOUNT / ${name}`;
      this.show('Display name saved.');
    }); };
    el('retry-profile').onclick = () => { void this.run(() => this.loadProfile()); };
    el('cancel-recovery').onclick = () => { el('account-signout').click(); };
    this.render(); void this.initialize();
  }
  private redirect(recovery = false): string { return `${location.origin}/${recovery ? '?recovery=1' : ''}`; }
  private api(): SupabaseClient {
    if (!this.client) throw new Error('Accounts are not configured yet. Guest play is available.');
    return this.client;
  }
  private async initialize(): Promise<void> {
    const url = new URL(location.href), errorText = callbackError(url), code = url.searchParams.get('code');
    this.recovery = url.searchParams.get('recovery') === '1';
    if (this.recovery) this.mode = 'recovery';
    if (code || errorText || url.hash || this.recovery) history.replaceState(null, '', url.pathname);
    try {
      if (!this.client) { this.show(errorText || 'Accounts are not configured yet. You can still play as a guest.', !!errorText); return; }
      if (errorText) { this.recovery = false; this.mode = 'login'; this.show(errorText, true); }
      else if (code) {
        const result = await this.client.auth.exchangeCodeForSession(code);
        if (result.error) throw new Error('This link expired or was opened in a different browser. Request a new link here.');
      }
      const { data, error } = await this.client.auth.getSession();
      if (error) throw error;
      if (this.recovery && !data.session) { this.mode = 'reset'; this.recovery = false; throw new Error('Request a new password-reset link.'); }
      await this.accept(data.session);
    } catch (error) {
      this.recovery = false; this.mode = 'login';
      this.show(error instanceof Error ? error.message : 'Could not restore your session. Please try again.', true);
    } finally { this.ready = true; this.render(); }
  }
  private async accept(session: Session | null): Promise<void> {
    const next = session?.user.id ?? 'guest';
    try {
      const previous = this.storage?.getItem('shootball:identity');
      if ((previous && previous !== next) || (!previous && next !== 'guest')) clearResumeTokens(this.storage);
      this.storage?.setItem('shootball:identity', next);
    } catch { clearResumeTokens(this.storage); }
    if (this.session?.user.id !== session?.user.id) {
      this.stop(); this.profileReady = false; ++this.profileGeneration;
      el('account-identity').textContent = 'ACCOUNT / Loading profile…';
      el<HTMLInputElement>('display-name').value = '';
    }
    this.session = session;
    this.render();
    if (session && !this.profileReady) await this.loadProfile();
    this.render();
  }
  private async loadProfile(): Promise<void> {
    if (!this.session) return;
    const id = this.session.user.id, generation = ++this.profileGeneration, client = this.api();
    let result = await client.from('profiles').select('display_name').eq('id', id).maybeSingle();
    if (!result.error && !result.data) {
      result = await client.from('profiles').upsert({ id, display_name: `Player_${id.slice(0, 8)}` }, { onConflict: 'id', ignoreDuplicates: true }).select('display_name').maybeSingle();
      if (!result.error && !result.data) result = await client.from('profiles').select('display_name').eq('id', id).single();
    }
    if (generation !== this.profileGeneration || this.session?.user.id !== id) return;
    if (result.error || !result.data) { this.profileReady = false; this.render(); throw new Error('Could not load your profile. Retry or sign out.'); }
    el<HTMLInputElement>('display-name').value = result.data.display_name;
    el('account-identity').textContent = `ACCOUNT / ${result.data.display_name}`;
    this.profileReady = true;
  }
  private async token(userId: string): Promise<string> {
    const client = this.api();
    let result: { data: { session: Session | null }; error: Error | null } = await client.auth.getSession();
    if (result.error || !result.data.session || result.data.session.user.id !== userId) throw new Error('Your session ended. Log in again.');
    if ((result.data.session.expires_at ?? 0) * 1000 < Date.now() + 60_000) result = await client.auth.refreshSession();
    if (result.error || !result.data.session || result.data.session.user.id !== userId || (result.data.session.expires_at ?? 0) * 1000 <= Date.now()) throw new Error('Your session expired. Log in again.');
    return result.data.session.access_token;
  }
  private async submit(): Promise<void> {
    if (this.mode === 'signup' && el<HTMLInputElement>('password').value !== el<HTMLInputElement>('confirm-password').value) {
      el('confirm-password').setAttribute('aria-invalid', 'true');
      this.show('Passwords do not match. Please enter the same password twice.', true);
      el('confirm-password').focus(); return;
    }
    await this.run(async () => {
      const client = this.api(), email = el<HTMLInputElement>('email').value.trim(), password = el<HTMLInputElement>('password').value;
      if (this.mode === 'reset') {
        const { error } = await client.auth.resetPasswordForEmail(email, { redirectTo: this.redirect(true) });
        if (error) throw error;
        this.show('If this account exists, a password-reset link has been sent. Open it in this browser.');
      } else if (this.mode === 'recovery') {
        const { error } = await client.auth.updateUser({ password });
        if (error) throw error;
        this.recovery = false; this.mode = 'login'; this.show('Password updated. You can now play.');
      } else if (this.mode === 'signup') {
        const { data, error } = await client.auth.signUp({ email, password });
        if (error) throw error;
        if (!data.session) throw new Error('Could not sign in after signup. Try logging in or resetting your password.');
        this.show('Account created. Choose Play when ready.');
      } else {
        const { error } = await client.auth.signInWithPassword({ email, password });
        if (error) throw error;
        this.show('Signed in. Choose Play when ready.');
      }
      el<HTMLInputElement>('password').value = '';
      el<HTMLInputElement>('confirm-password').value = '';
    });
  }
  private async run(action: () => Promise<void>): Promise<void> {
    if (this.busy || !this.ready) return;
    this.busy = true; this.cancelled = false; this.render(); this.show('Working…');
    try {
      await action();
      if (this.cancelled) {
        // Finish the in-flight request, then discard any resulting browser session.
        const { error } = await this.api().auth.signOut({ scope: 'local' });
        if (error) throw error;
        this.stop(); clearResumeTokens(this.storage); this.show('Cancelled.');
      }
    } catch (error) { this.show(error instanceof Error ? error.message : 'Request failed. Please retry.', true); }
    finally {
      if (this.client) {
        try { const { data } = await this.client.auth.getSession(); await this.accept(data.session); }
        catch { this.show('Could not load your profile. Retry or sign out.', true); }
      }
      this.busy = false; this.render();
    }
  }
  private show(message: string, error = false): void {
    el('auth-message').textContent = message; el('auth-message').classList.toggle('auth-error', error);
  }
  private render(): void {
    const signed = !!this.session && !this.recovery;
    el('signed-in').hidden = !signed; el('signed-out').hidden = signed;
    el('auth-loading').hidden = this.ready; el('account-form').hidden = !this.client;
    el('email-field').hidden = this.mode === 'recovery'; el<HTMLInputElement>('email').required = this.mode !== 'recovery';
    el('password-field').hidden = this.mode === 'reset';
    const password = el<HTMLInputElement>('password');
    password.required = this.mode !== 'reset'; password.minLength = this.mode === 'login' ? 1 : 8;
    password.autocomplete = this.mode === 'login' ? 'current-password' : 'new-password';
    el('auth-submit').textContent = ({ login: 'Log in', signup: 'Create account', reset: 'Send reset link', recovery: 'Save new password' })[this.mode];
    const tabsVisible = this.mode === 'signup' || this.mode === 'login';
    el('auth-tabs').hidden = !tabsVisible || !this.client;
    for (const mode of ['signup', 'login'] as const) {
      el(`${mode}-tab`).setAttribute('aria-selected', String(this.mode === mode));
      el(`${mode}-tab`).tabIndex = this.mode === mode ? 0 : -1;
    }
    if (tabsVisible) { el('account-form').setAttribute('aria-labelledby', `${this.mode}-tab`); el('account-form').removeAttribute('aria-label'); }
    else { el('account-form').removeAttribute('aria-labelledby'); el('account-form').setAttribute('aria-label', 'Password reset'); }
    el('confirm-password-field').hidden = this.mode !== 'signup';
    el<HTMLInputElement>('confirm-password').required = this.mode === 'signup';
    el('auth-divider').hidden = this.recovery;
    el('forgot-password').hidden = this.mode !== 'login'; el('auth-back').hidden = this.mode !== 'reset';
    el('google-login').hidden = this.recovery; el('guest-play').hidden = this.recovery; el('cancel-recovery').hidden = !this.recovery;
    el('auth-cancel').hidden = !this.busy; el('retry-profile').hidden = this.profileReady;
    document.querySelectorAll<HTMLButtonElement | HTMLInputElement>('#account-screen button, #account-screen input').forEach(control => { control.disabled = this.busy || !this.ready; });
    el<HTMLButtonElement>('auth-cancel').disabled = !this.busy;
    el<HTMLButtonElement>('google-login').disabled ||= !this.client;
    el<HTMLButtonElement>('signup-tab').disabled ||= !this.client;
    el<HTMLButtonElement>('login-tab').disabled ||= !this.client;
    el<HTMLButtonElement>('forgot-password').disabled ||= !this.client;
    el<HTMLButtonElement>('account-play').disabled ||= !this.profileReady;
    el('account-screen').setAttribute('aria-busy', String(this.busy || !this.ready));
  }
}
