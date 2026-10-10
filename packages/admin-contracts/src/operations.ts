export const LINKS = {
  primary: 'https://www.orb-skirmish.com',
  origin: 'https://shootball-control-test-730016272076.us-central1.run.app',
  game: 'https://136.71.64.19.sslip.io',
} as const;
// Exact trusted proxy origins; the previous deployment URL remains usable.
export const PRODUCTION_WEB_ORIGINS = [LINKS.primary, 'https://orb-skirmish.com', 'https://shootball-arena.vercel.app'] as const;
export type HealthCheck = { id: string; name: string; url: string; status: 'healthy' | 'unavailable'; checkedAt: string; latencyMs: number; revision: string | null; message: string };
export type RoomTelemetry = { id: string; phase: string; humans: number; guests: number; accounts: number; reservedSeats: number; bots: number; maxPlayers: number; elapsedSeconds: number; tickP95Ms: number; admission: 'open' | 'locked' };
export type GameTelemetry = { observedAt: string; bootId: string; revision: string; protocol: number; uptimeSeconds: number; memoryRssBytes: number; rooms: RoomTelemetry[]; totals: { humans: number; guests: number; accounts: number; reservedSeats: number; bots: number; rooms: number }; joinsSinceBoot: number; roomsCompletedSinceBoot: number };
export type RecordPage = { rows: Record<string, unknown>[]; hasMore: boolean; offset: number; limit: number; source: string };

/** Validate and explicitly project upstream telemetry; never forward unknown fields. */
export function parseGameTelemetry(value: unknown): GameTelemetry {
  const record = (v: unknown): Record<string, unknown> => { if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error('Invalid telemetry object'); return v as Record<string, unknown>; };
  const number = (v: unknown, integer = false): number => { if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || (integer && !Number.isSafeInteger(v))) throw new Error('Invalid telemetry number'); return v; };
  const text = (v: unknown): string => { if (typeof v !== 'string' || !v || v.length > 200) throw new Error('Invalid telemetry text'); return v; };
  const input = record(value), counts = record(input.totals);
  if (!Array.isArray(input.rooms) || input.rooms.length > 2000) throw new Error('Invalid room list');
  const rooms = input.rooms.map(value => {
    const r=record(value);
    if (!['playing','results'].includes(String(r.phase)) || !['open','locked'].includes(String(r.admission))) throw new Error('Invalid room state');
    return { id:text(r.id),phase:text(r.phase),humans:number(r.humans,true),guests:number(r.guests,true),accounts:number(r.accounts,true),reservedSeats:number(r.reservedSeats,true),bots:number(r.bots,true),maxPlayers:number(r.maxPlayers,true),elapsedSeconds:number(r.elapsedSeconds),tickP95Ms:number(r.tickP95Ms),admission:r.admission as 'open'|'locked' };
  });
  const totals={humans:number(counts.humans,true),guests:number(counts.guests,true),accounts:number(counts.accounts,true),reservedSeats:number(counts.reservedSeats,true),bots:number(counts.bots,true),rooms:number(counts.rooms,true)};
  if (totals.rooms!==rooms.length || rooms.some(r=>r.humans!==r.guests+r.accounts)) throw new Error('Inconsistent telemetry counts');
  for (const key of ['humans','guests','accounts','reservedSeats','bots'] as const) if(totals[key]!==rooms.reduce((sum,r)=>sum+r[key],0)) throw new Error('Inconsistent telemetry totals');
  const observedAt=text(input.observedAt); if(!Number.isFinite(Date.parse(observedAt))) throw new Error('Invalid telemetry timestamp');
  return {observedAt,bootId:text(input.bootId),revision:text(input.revision),protocol:number(input.protocol,true),uptimeSeconds:number(input.uptimeSeconds),memoryRssBytes:number(input.memoryRssBytes,true),rooms,totals,joinsSinceBoot:number(input.joinsSinceBoot,true),roomsCompletedSinceBoot:number(input.roomsCompletedSinceBoot,true)};
}
