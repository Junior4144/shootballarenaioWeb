import { GAME_HEALTH_TARGET, probeHealth, type Environment, type HealthCheck } from '@shootball/admin-contracts';
export class HealthMonitor {
  private cached?: { at: number; value: HealthCheck[] };
  private pending?: Promise<HealthCheck[]>;
  constructor(private request: typeof fetch = fetch, private now = Date.now) {}
  async read(environment: Environment): Promise<HealthCheck[]> {
    if (environment !== 'production') return [];
    if (this.cached && this.now() - this.cached.at < 60_000) return this.cached.value;
    if (this.pending) return this.pending;
    // Never probe this Cloud Run service from its own handler: concurrency is 1.
    // The browser probes both public website URLs after this response completes.
    this.pending = probeHealth(GAME_HEALTH_TARGET, this.request, this.now)
      .then(check => { const value = [check]; this.cached = { at: this.now(), value }; return value; })
      .finally(() => { this.pending = undefined; });
    return this.pending;
  }
}
