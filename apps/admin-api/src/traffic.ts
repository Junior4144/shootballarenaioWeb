import { createClient } from '@supabase/supabase-js';
import { SUPABASE_PROJECT, type TrafficHistory, type TrafficRange, type TrafficSource } from '@shootball/admin-contracts';
export type ReadTraffic = (token: string, range: TrafficRange, source: TrafficSource) => Promise<TrafficHistory>;
export function trafficReader(url: string, key: string): ReadTraffic {
  if (url !== `https://${SUPABASE_PROJECT}.supabase.co`) throw new Error('Invalid project');
  return async (token, range, source) => {
    const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false }, global: {
      headers: { Authorization: 'Bearer ' + token },
      fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(8000) }),
    } });
    const { data, error } = await client.rpc('admin_traffic_history', { p_environment: 'production', p_range: range, p_source: source });
    if (error || !data || !Array.isArray(data.current) || !Array.isArray(data.previous)) throw new Error('Traffic history unavailable');
    return data as TrafficHistory;
  };
}
