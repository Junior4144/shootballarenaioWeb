import type { Dashboard, Environment } from '@shootball/admin-contracts';
import type { Inventory } from './inventory';
export async function dashboard(environment: Environment, inventory: Inventory): Promise<Dashboard> {
  return {
    environment, generatedAt: new Date().toISOString(), mode: 'local-development', identity: { label: 'Local development session', role: 'local-viewer' }, inventory: await inventory.read(environment),
    metrics: [
      ['humans', 'Humans online', 'humans', 'Server heartbeat'], ['rooms', 'Live matches', 'rooms', 'Server heartbeat'],
      ['dau', 'Daily active subjects', 'subjects / UTC day', 'Gameplay analytics'], ['mau', 'Rolling 30-day MAU', 'distinct subjects / 30 days', 'Gameplay analytics'],
      ['errors', 'Gameplay error rate', 'errors / minute', 'Cloud Monitoring'], ['cost', 'Month-to-date cost', 'USD / month to date', 'Billing export'],
    ].map(([id, label, unit, source]) => ({ id, label, unit, data: { value: null, availability: 'not-configured', source, environment, observedAt: null, staleAfter: 30, message: 'Integration not connected; no measurement available.' } })),
    architecture: [
      { id: 'frontend', name: 'Player frontend', responsibility: 'Static Vite / Phaser app', dependencies: ['routing', 'auth'], status: 'Planned', detail: 'Vercel is the planned host. No deployment or domain is registered.' },
      { id: 'routing', name: 'Gameplay routing / TLS', responsibility: 'Stable WSS entry point', dependencies: ['game'], status: 'Not configured', detail: 'Domain, TLS and stable address strategy remain deployment inputs.' },
      { id: 'game', name: 'Game VM / process / rooms', responsibility: 'Authoritative Colyseus simulation', dependencies: ['auth'], status: 'Unknown', detail: 'Provider inventory is separate from process health, readiness and room occupancy.' },
      { id: 'admin', name: 'Independent admin API', responsibility: 'Protected operational reads', dependencies: ['inventory', 'store'], status: 'Local development', detail: 'This API runs independently of gameplay. Hosted admin authentication and Cloud Run deployment are pending.' },
      { id: 'inventory', name: 'Compute Engine', responsibility: 'Registered VM power state', dependencies: [], status: 'Read-only adapter', detail: 'Pinned project and manifest allowlist. No start, stop, create or delete API is exposed.' },
      { id: 'auth', name: 'Supabase Auth', responsibility: 'Player account authentication', dependencies: [], status: 'Not probed', detail: 'Scoped hosted project exists; this dashboard has not measured its health.' },
      { id: 'store', name: 'Admin persistence', responsibility: 'Memberships, audit, operations and outbox', dependencies: [], status: 'Not implemented', detail: 'Mutations remain disabled until durable authorization, audit and worker infrastructure pass acceptance.' },
      { id: 'telemetry', name: 'Telemetry / billing', responsibility: 'Activity, health and cost aggregates', dependencies: [], status: 'Not connected', detail: 'Missing measurements are unknown, never zero.' },
    ],
    capabilities: ['Start server', 'Drain', 'Resume admissions', 'Restart process', 'Stop VM', 'Force stop', 'Close room', 'Publish config'].map((label, i) => ({ id: String(i), label, enabled: false, reason: 'Requires verified admin membership, durable audit/outbox and operation worker. This milestone is read-only.' })),
  };
}
