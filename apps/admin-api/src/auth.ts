import { createClient } from '@supabase/supabase-js';
import { SUPABASE_PROJECT, type Environment } from '@shootball/admin-contracts';
export type Access = { status: 'allowed'; userId: string; roles: string[]; environment: Environment } | { status: 'denied' } | { status: 'mfa-required' };
export type Authorize = (token: string, environment: Environment) => Promise<Access>;
export class AuthUnavailable extends Error {}
export function supabaseAuthorizer(url: string, publishableKey: string): Authorize {
  if (url !== `https://${SUPABASE_PROJECT}.supabase.co` || !publishableKey.startsWith('sb_publishable_')) throw new Error('Scoped Supabase URL and publishable key required');
  return async (token, environment) => {
    const client = createClient(url, publishableKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { headers: { Authorization: `Bearer ${token}` }, fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(8000) }) },
    });
    const { data: user, error: userError } = await client.auth.getUser(token);
    if (userError) {
      if (!userError.status || userError.status >= 500 || userError.status === 429) throw new AuthUnavailable();
      return { status: 'denied' };
    }
    if (!user.user || user.user.is_anonymous) return { status: 'denied' };
    const { data, error } = await client.rpc('admin_access', { p_environment: environment });
    if (error) throw new AuthUnavailable();
    if (data?.status === 'mfa-required') return { status: 'mfa-required' };
    if (data?.status !== 'allowed' || data.userId !== user.user.id || data.environment !== environment || !Array.isArray(data.roles) || !data.roles.every((r: unknown) => typeof r === 'string')) return { status: 'denied' };
    return data as Access;
  };
}
