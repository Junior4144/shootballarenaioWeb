import { createClient } from '@supabase/supabase-js';
import { ServerError } from '@colyseus/core';

export const PROJECT_URL = 'https://lkgxpgcmspxekggndzih.supabase.co';
export type Identity = { kind: 'guest' } | {
  kind: 'account'; userId: string; displayName: string; token: string; expiresAt: number;
};
export type VerifyAccount = (token: string) => Promise<Extract<Identity, { kind: 'account' }>>;
export const validDisplayName = (name: unknown): name is string =>
  typeof name === 'string' && /^[A-Za-z0-9][A-Za-z0-9 _-]{2,19}$/.test(name);

// A fresh client per verification: no shared session, privileged key or mutable headers.
export const verifyAccount: VerifyAccount = async token => {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (url !== PROJECT_URL || !key) throw new ServerError(503, 'Account service is not configured.');
  const client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { Authorization: `Bearer ${token}` }, fetch: (url, init) => fetch(url, { ...init, signal: AbortSignal.timeout(8000) }) },
  });
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user || data.user.is_anonymous) throw new ServerError(401, 'Account session is invalid. Log in again.');
  // Only read expiry after the Auth server has verified this exact token.
  let expiresAt = 0;
  try { expiresAt = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString()).exp * 1000; } catch { /* rejected below */ }
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) throw new ServerError(401, 'Account session expired. Log in again.');
  const profile = await client.from('profiles').select('display_name').eq('id', data.user.id).single();
  if (profile.error || !validDisplayName(profile.data?.display_name)) throw new ServerError(403, 'Set your display name before playing.');
  return { kind: 'account', userId: data.user.id, displayName: profile.data.display_name, token, expiresAt };
};

export async function authenticate(options: unknown, verify: VerifyAccount = verifyAccount): Promise<Identity> {
  if (!options || typeof options !== 'object') throw new ServerError(401, 'Choose guest or account access.');
  const value = options as Record<string, unknown>;
  // Legacy protocol clients without a mode remain guests; any credential makes this an account attempt.
  if (value.mode === 'account' || Object.hasOwn(value, 'accessToken')) {
    if (value.mode !== 'account' || typeof value.accessToken !== 'string' || !value.accessToken || value.accessToken.length > 16000)
      throw new ServerError(401, 'Invalid account credentials.');
    return verify(value.accessToken);
  }
  if (value.mode !== undefined && value.mode !== 'guest') throw new ServerError(401, 'Invalid access mode.');
  return { kind: 'guest' };
}
