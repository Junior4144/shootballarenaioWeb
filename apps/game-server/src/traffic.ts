import { readFile } from 'node:fs/promises';
import type { GameTelemetry } from '../../../packages/admin-contracts/src/operations';
import { PROJECT_URL } from './accountAuth';

export function trafficSample(snapshot: GameTelemetry) {
  return { at: snapshot.observedAt, bootId: snapshot.bootId, players: snapshot.totals.humans,
    guests: snapshot.totals.guests, accounts: snapshot.totals.accounts, rooms: snapshot.totals.rooms,
    joins: snapshot.joinsSinceBoot, completed: snapshot.roomsCompletedSinceBoot, uptime: snapshot.uptimeSeconds };
}
/** One non-overlapping write per minute. Failures never block gameplay. */
export function startTrafficCollector(snapshot: () => GameTelemetry, options: {
  write: (sample: ReturnType<typeof trafficSample>) => Promise<void>;
  active?: () => Promise<boolean>; intervalMs?: number; onError?: () => void;
}) {
  let stopped = false, running = false;
  const tick = async () => {
    if (stopped || running) return;
    running = true;
    try { if (!options.active || await options.active()) await options.write(trafficSample(snapshot())); }
    catch { options.onError?.(); }
    finally { running = false; }
  };
  const timer = setInterval(() => void tick(), options.intervalMs ?? 60_000);
  timer.unref();
  void tick();
  return () => { stopped = true; clearInterval(timer); };
}
export function productionTrafficCollector(snapshot: () => GameTelemetry) {
  const token = process.env.TRAFFIC_HISTORY_TOKEN;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (process.env.NODE_ENV !== 'production' || !token) return () => {};
  if (!/^[a-f0-9]{64}$/.test(token) || process.env.SUPABASE_URL !== PROJECT_URL || !key) throw new Error('Invalid traffic collector configuration');
  const activeFile = process.env.TRAFFIC_ACTIVE_RELEASE_FILE;
  return startTrafficCollector(snapshot, {
    // Candidate containers must not write zeros over the serving release.
    active: activeFile ? async () => (await readFile(activeFile,'utf8')).startsWith(process.env.RELEASE_SHA+'|') : undefined,
    write: async sample => {
      const response = await fetch(PROJECT_URL+'/rest/v1/rpc/record_game_traffic', {
        method:'POST', headers:{apikey:key,'Content-Type':'application/json'},
        body:JSON.stringify({p_token:token,p_sample:sample}), signal:AbortSignal.timeout(5000), redirect:'error',
      });
      if (!response.ok) throw new Error('Traffic write failed');
    },
    onError: () => console.warn('Traffic history sample could not be stored; collection will retry next minute.'),
  });
}
