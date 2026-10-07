import { LINKS, type Environment, type HealthCheck } from '@shootball/admin-contracts';
export class HealthMonitor {
  private cached?: { at: number; value: HealthCheck[] };
  private pending?: Promise<HealthCheck[]>;
  constructor(private request: typeof fetch = fetch, private now = Date.now) {}
  async read(environment: Environment): Promise<HealthCheck[]> {
    // Local work never probes production implicitly.
    if (environment !== 'production') return [];
    if (this.cached && this.now() - this.cached.at < 60_000) return this.cached.value;
    if (this.pending) return this.pending;
    this.pending = Promise.all([
      ['primary', 'Vercel primary website', LINKS.primary + '/health'],
      ['origin', 'GCP direct origin', LINKS.origin + '/health'],
      ['game', 'Gameplay process', LINKS.game + '/healthz'],
    ].map(async ([id, name, url]): Promise<HealthCheck> => {
      const started = this.now();
      try {
        const response = await this.request(url, { signal: AbortSignal.timeout(4000), redirect: 'error', cache: 'no-store' });
        if (!response.ok) throw new Error();
        const body = await response.json();
        if (body.status !== 'live' || typeof body.revision !== 'string') throw new Error();
        return { id, name, url, status: 'healthy', checkedAt: new Date(this.now()).toISOString(), latencyMs: this.now() - started, revision: body.revision.slice(0,100), message: 'HTTPS liveness check passed. This does not prove matchmaking readiness.' };
      } catch {
        return { id, name, url, status: 'unavailable', checkedAt: new Date(this.now()).toISOString(), latencyMs: this.now() - started, revision: null, message: 'Liveness check failed, timed out, or returned an unexpected response.' };
      }
    })).then(value => { this.cached = { at: this.now(), value }; return value; }).finally(() => { this.pending = undefined; });
    return this.pending;
  }
}
