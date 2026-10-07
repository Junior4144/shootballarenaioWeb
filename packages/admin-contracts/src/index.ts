export const GCP_PROJECT = 'project-7915787f-37b2-4286-aa7' as const;
export const SUPABASE_PROJECT = 'lkgxpgcmspxekggndzih' as const;
export const environments = ['local', 'gcp-test', 'production'] as const;
export type Environment = typeof environments[number];
export type Observation<T> = {
  value: T | null; availability: 'available' | 'unavailable' | 'permission-denied' | 'not-configured';
  source: string; environment: Environment; observedAt: string | null; staleAfter: number; message: string;
};
export function isStale(observation: Observation<unknown>, now = Date.now()): boolean {
  return observation.observedAt !== null && now - Date.parse(observation.observedAt) > observation.staleAfter * 1000;
}
export type Resource = { id: string; environment: 'gcp-test' | 'production'; project: typeof GCP_PROJECT; zone: string; instance: string };
export type Manifest = { schemaVersion: 1; project: typeof GCP_PROJECT; supabaseProject: typeof SUPABASE_PROJECT; resources: Resource[] };
export type Server = {
  id: string; name: string; zone: string; providerState: string;
  processState: 'unknown'; readiness: 'unknown'; admission: 'unknown'; rooms: null; humans: null; reservedSeats: null;
};
export type ArchitectureNode = { id: string; name: string; responsibility: string; dependencies: string[]; status: string; detail: string };
export type Dashboard = {
  environment: Environment; generatedAt: string; mode: 'local-development' | 'supabase';
  identity: { label: string; role: string }; inventory: Observation<Server[]>;
  metrics: { id: string; label: string; unit: string; data: Observation<number> }[];
  architecture: ArchitectureNode[];
  capabilities: { id: string; label: string; enabled: false; reason: string }[];
};
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const exact = (v: Record<string, unknown>, keys: string[]) => Object.keys(v).every(k => keys.includes(k)) && keys.every(k => k in v);
export function parseManifest(input: unknown): Manifest {
  if (!object(input) || !exact(input, ['schemaVersion', 'project', 'supabaseProject', 'resources']) || input.schemaVersion !== 1 || input.project !== GCP_PROJECT || input.supabaseProject !== SUPABASE_PROJECT || !Array.isArray(input.resources) || input.resources.length > 20) throw new Error('Invalid deployment manifest or project scope');
  const ids = new Set<string>(); const targets = new Set<string>();
  for (const r of input.resources) {
    if (!object(r) || !exact(r, ['id', 'environment', 'project', 'zone', 'instance']) || typeof r.id !== 'string' || !/^[a-z][a-z0-9-]{0,62}$/.test(r.id) || !['gcp-test', 'production'].includes(String(r.environment)) || r.project !== GCP_PROJECT || typeof r.zone !== 'string' || !/^[a-z]+-[a-z]+[0-9]-[a-z]$/.test(r.zone) || typeof r.instance !== 'string' || !/^[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(r.instance)) throw new Error('Invalid registered resource');
    const target = `${r.zone}/${r.instance}`;
    if (ids.has(r.id) || targets.has(target)) throw new Error('Duplicate resource identity');
    ids.add(r.id); targets.add(target);
  }
  return input as Manifest;
}
