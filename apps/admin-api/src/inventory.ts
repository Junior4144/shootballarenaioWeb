import { GoogleAuth } from 'google-auth-library';
import { GCP_PROJECT, parseManifest, type Environment, type Manifest, type Observation, type Server } from '@shootball/admin-contracts';
export interface Inventory { read(environment: Environment): Promise<Observation<Server[]>> }
export type ComputeGet = (url: string) => Promise<{ name?: string; status?: string }>;
export function unknownInventory(environment: Environment, source: string, message: string, availability: Observation<Server[]>['availability'] = 'unavailable'): Observation<Server[]> {
  return { value: null, availability, source, environment, observedAt: null, staleAfter: 30, message };
}
export class FixtureInventory implements Inventory {
  async read(environment: Environment): Promise<Observation<Server[]>> {
    if (environment !== 'local') return unknownInventory(environment, 'GCP connector', 'Live inventory is not enabled. Register existing resources and configure application default credentials.', 'not-configured');
    return { value: [{ id: 'fixture-game-01', name: 'fixture-game-01', zone: 'Local fixture', providerState: 'RUNNING', processState: 'unknown', readiness: 'unknown', admission: 'unknown', rooms: null, humans: null, reservedSeats: null }], availability: 'available', environment, source: 'Local fixture • not live gameplay', observedAt: new Date().toISOString(), staleAfter: 30, message: 'Sample provider response. A running VM does not establish game readiness.' };
  }
}
export class GcpInventory implements Inventory {
  private manifest: Manifest;
  private cache = new Map<Environment, { expires: number; result: Observation<Server[]> }>();
  private pending = new Map<Environment, Promise<Observation<Server[]>>>();
  constructor(manifest: unknown, private get: ComputeGet, private now = Date.now) { this.manifest = structuredClone(parseManifest(manifest)); }
  async read(environment: Environment): Promise<Observation<Server[]>> {
    if (environment === 'local') return new FixtureInventory().read(environment);
    const cached = this.cache.get(environment);
    if (cached && cached.expires > this.now()) return cached.result;
    const pending = this.pending.get(environment);
    if (pending) return pending;
    const task = this.observe(environment).then(result => {
      this.cache.set(environment, { result, expires: this.now() + 15_000 }); return result;
    }).finally(() => this.pending.delete(environment));
    this.pending.set(environment, task); return task;
  }
  private async observe(environment: Environment): Promise<Observation<Server[]>> {
    const resources = this.manifest.resources.filter(r => r.environment === environment);
    if (!resources.length) return unknownInventory(environment, 'Deployment manifest', 'No existing VMs registered for this environment. This does not prove the project has no VMs.', 'not-configured');
    try {
      const value: Server[] = [];
      // Bounded registry; no project-wide discovery or browser-supplied URLs.
      for (const r of resources) {
        const data = await this.get(`https://compute.googleapis.com/compute/v1/projects/${GCP_PROJECT}/zones/${r.zone}/instances/${r.instance}`);
        if (data.name !== r.instance || typeof data.status !== 'string' || !['PROVISIONING', 'STAGING', 'RUNNING', 'STOPPING', 'SUSPENDING', 'SUSPENDED', 'REPAIRING', 'TERMINATED'].includes(data.status)) throw new Error('Invalid provider response');
        value.push({ id: r.id, name: r.instance, zone: r.zone, providerState: data.status, processState: 'unknown', readiness: 'unknown', admission: 'unknown', rooms: null, humans: null, reservedSeats: null });
      }
      return { value, availability: 'available', environment, source: 'Compute Engine API • registered resources only', observedAt: new Date(this.now()).toISOString(), staleAfter: 30, message: 'Provider power state only. Heartbeats and game readiness are not connected.' };
    } catch (error) {
      const status = (error as { response?: { status?: number } })?.response?.status;
      return unknownInventory(environment, 'Compute Engine API', status === 403 ? 'Inventory denied. Check API enablement and compute.instances.get permission.' : 'Inventory unavailable. Check credentials, registered targets and provider connectivity.', status === 403 ? 'permission-denied' : 'unavailable');
    }
  }
}
export function googleComputeGet(): ComputeGet {
  const auth = new GoogleAuth({ projectId: GCP_PROJECT, scopes: ['https://www.googleapis.com/auth/compute.readonly'] });
  return async url => (await auth.request<{ name?: string; status?: string }>({ url, method: 'GET', timeout: 5000, retry: false })).data;
}
