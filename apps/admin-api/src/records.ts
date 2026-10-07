import { createClient } from '@supabase/supabase-js';
import { SUPABASE_PROJECT, type RecordPage } from '@shootball/admin-contracts';
export type ReadRecords = (token: string, view: 'accounts' | 'activity' | 'memberships', search: string, offset: number) => Promise<RecordPage>;
export function recordReader(url: string, key: string): ReadRecords {
  if (url !== 'https://' + SUPABASE_PROJECT + '.supabase.co') throw new Error('Invalid project');
  return async (token, view, search, offset) => {
    const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { Authorization: 'Bearer ' + token }, fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(8000) }) } });
    const { data, error } = await client.rpc('admin_records', { p_environment: 'production', p_view: view, p_search: search, p_offset: offset });
    if (error || !data || !Array.isArray(data.rows)) throw new Error('Records unavailable');
    return data as RecordPage;
  };
}
