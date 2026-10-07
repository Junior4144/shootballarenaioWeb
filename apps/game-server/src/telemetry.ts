import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { VERSION } from '@shootball/protocol';
import { PROJECT_URL } from './accountAuth';
import type { GameTelemetry, RoomTelemetry } from '../../../packages/admin-contracts/src/operations';
export class Telemetry {
  readonly bootId = randomUUID();
  private started = Date.now();
  private rooms = new Map<string, () => RoomTelemetry>();
  joins = 0;
  completed = 0;
  register(id: string, read: () => RoomTelemetry) { this.rooms.set(id, read); }
  remove(id: string) { this.rooms.delete(id); }
  snapshot(): GameTelemetry {
    const rooms = [...this.rooms.values()].map(read => read());
    const totals = { humans: 0, guests: 0, accounts: 0, reservedSeats: 0, bots: 0, rooms: rooms.length };
    for (const room of rooms) for (const key of ['humans','guests','accounts','reservedSeats','bots'] as const) totals[key] += room[key];
    return { observedAt: new Date().toISOString(), bootId: this.bootId, revision: process.env.RELEASE_SHA ?? 'development', protocol: VERSION, uptimeSeconds: (Date.now() - this.started) / 1000, memoryRssBytes: process.memoryUsage().rss, rooms, totals, joinsSinceBoot: this.joins, roomsCompletedSinceBoot: this.completed };
  }
}
export async function verifyTelemetryAccess(token: string): Promise<boolean> {
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (process.env.SUPABASE_URL !== PROJECT_URL || !key) return false;
  const client = createClient(PROJECT_URL, key, { auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { Authorization: 'Bearer ' + token }, fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(4000) }) } });
  const user = await client.auth.getUser(token);
  if (user.error || !user.data.user || user.data.user.is_anonymous) return false;
  const { data, error } = await client.rpc('admin_access', { p_environment: 'production' });
  return !error && data?.status === 'allowed' && data.userId === user.data.user.id && data.environment === 'production';
}
