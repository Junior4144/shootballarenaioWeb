import { execFile } from 'node:child_process';
import { createRequire } from 'node:module';
import { promisify } from 'node:util';
import { TRAFFIC_RANGES, type TrafficHistory, type TrafficPoint, type TrafficRange, type TrafficScope } from '../../../packages/admin-contracts/src/traffic';

const run = promisify(execFile);
const require = createRequire(import.meta.url);
export const POSTHOG_PROJECT_ID = '651980';
const HOST = 'https://us.posthog.com';
const WEB_URL = 'https://us.posthog.com/project/651980/web';
type Call = (tool: string, input: Record<string, unknown>) => Promise<any>;
export type ReadPosthog = (range: TrafficRange, scope: TrafficScope) => Promise<TrafficHistory>;

/** Server-only CLI access. Never place personal API keys or arbitrary queries in browser requests. */
export const callPosthog: Call = async (tool, input) => {
  try {
    const { stdout } = await run(process.execPath, [require.resolve('@posthog/cli/run-posthog-cli.js'),
      '--host', HOST, 'api', 'call', '--json', tool, JSON.stringify(input)], {
      env: { ...process.env, POSTHOG_CLI_PROJECT_ID: POSTHOG_PROJECT_ID },
      timeout: 9000, maxBuffer: 512_000, windowsHide: true,
    });
    return JSON.parse(stdout);
  } catch {
    // CLI errors can contain command details; never return them to the browser.
    throw new Error('PostHog unavailable');
  }
};

/** Fixed rolling UTC buckets plus whole-period distinct totals (bucket uniques cannot be summed). */
export function posthogQuery(range: TrafficRange, scope: TrafficScope, end: number) {
  const { seconds, bucket } = TRAFFIC_RANGES[range];
  const start = end - seconds * 2;
  const hosts = scope === 'production'
    ? "['shootball-arena.vercel.app', 'shootball-control-test-730016272076.us-central1.run.app']"
    : "['localhost', '127.0.0.1']";
  const base = `FROM events WHERE event = '$pageview' AND timestamp >= toDateTime(${start}) AND timestamp < toDateTime(${end}) AND splitByChar(':' , toString(properties.$host))[1] IN ${hosts}`;
  // Only server-generated numbers and fixed literals enter the query.
  return `SELECT floor((toUnixTimestamp(timestamp) - ${start}) / ${bucket}) AS slot, count() AS views, uniqExact(distinct_id) AS visitors, uniqExactIf(toString($session_id), notEmpty(toString($session_id))) AS sessions ${base} GROUP BY slot
UNION ALL
SELECT if(timestamp < toDateTime(${end - seconds}), -2, -1) AS slot, count() AS views, uniqExact(distinct_id) AS visitors, uniqExactIf(toString($session_id), notEmpty(toString($session_id))) AS sessions ${base} GROUP BY slot
ORDER BY slot LIMIT 400`;
}

export function parsePosthogRows(response: any): number[][] {
  // CLI's execute-sql --json returns a pipe-delimited table, unlike the raw query API.
  const value = response?.results;
  if (typeof value !== 'string') throw new Error('Invalid PostHog response');
  const lines = value.trim().split('\n');
  if (lines.shift()?.trim() !== 'slot|views|visitors|sessions') throw new Error('Invalid PostHog columns');
  if (lines.length > 400) throw new Error('Too many PostHog rows');
  return lines.filter(Boolean).map(line => {
    const cells = line.split('|');
    if (cells.length !== 4 || cells.some(cell => !/^-?\d+(?:\.0+)?$/.test(cell.trim()))) throw new Error('Invalid PostHog counts');
    const row = cells.map(Number);
    if (row.some(n => !Number.isSafeInteger(n)) || row.slice(1).some(n => n < 0)) throw new Error('Invalid PostHog counts');
    return row;
  });
}

export function posthogHistory(range: TrafficRange, scope: TrafficScope, end: number, rows: number[][], now: number): TrafficHistory {
  const { seconds, bucket } = TRAFFIC_RANGES[range];
  const count = seconds / bucket, start = end - seconds * 2;
  const bySlot = new Map<number, number[]>();
  for (const row of rows) {
    if (row[0] < -2 || row[0] >= count * 2 || bySlot.has(row[0])) throw new Error('Invalid PostHog slot');
    bySlot.set(row[0], row);
  }
  const totals = (slot: number) => { const row = bySlot.get(slot); return { views: row?.[1] ?? 0, visitors: row?.[2] ?? 0, sessions: row?.[3] ?? 0 }; };
  const points = (offset: number): TrafficPoint[] => Array.from({ length: count }, (_, i) => {
    const row = bySlot.get(i + offset);
    return { at: new Date((start + (i + offset) * bucket) * 1000).toISOString(), samples: 0,
      players: null, guests: null, accounts: null, rooms: null, peak: null, joins: null, completed: null,
      views: row?.[1] ?? 0, visitors: row?.[2] ?? 0, sessions: row?.[3] ?? 0 };
  });
  return { source: 'posthog', range, bucketSeconds: bucket, generatedAt: new Date(now).toISOString(),
    current: points(count), previous: points(0), latestSampleAt: null, retentionDays: 0,
    analytics: { provider: 'PostHog', scope, url: WEB_URL, stale: false, current: totals(-1), previous: totals(-2) } };
}

export function posthogReader(call: Call = callPosthog, clock = Date.now): ReadPosthog {
  const cache = new Map<string, { data: TrafficHistory; at: number }>();
  const pending = new Map<string, Promise<TrafficHistory>>();
  let verified = false;
  let failedAt = -Infinity;
  return async (range, scope) => {
    if (!Object.hasOwn(TRAFFIC_RANGES, range) || !['production', 'development'].includes(scope)) throw new Error('Invalid PostHog request');
    const key = range + ':' + scope, previous = cache.get(key), now = clock();
    if (previous && now - previous.at < 60_000) return previous.data;
    if (pending.has(key)) return pending.get(key)!;
    const fallback = () => {
      if (previous && now - previous.at < 15 * 60_000) return { ...previous.data, analytics: { ...previous.data.analytics!, stale: true } };
      throw new Error('PostHog unavailable');
    };
    if (now - failedAt < 30_000) return fallback();
    const request = (async () => {
      try {
        if (!verified) {
          const project = await call('project-get', {});
          if (String(project.id) !== POSTHOG_PROJECT_ID || project.name.toLowerCase() !== 'shootballarena') throw new Error('Unexpected PostHog project');
          verified = true;
        }
        const end = Math.floor(now / 60_000) * 60;
        const result = await call('execute-sql', { query: posthogQuery(range, scope, end), context: 'ShootBallArena admin: custom UTC buckets and period-wide distinct totals. governed catalog consulted: no match' });
        const data = posthogHistory(range, scope, end, parsePosthogRows(result), clock());
        cache.set(key, { data, at: clock() });
        return data;
      } catch { failedAt = clock(); return fallback(); }
      finally { pending.delete(key); }
    })();
    pending.set(key, request);
    return request;
  };
}
