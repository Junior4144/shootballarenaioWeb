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
      { id: 'frontend', name: 'Player frontend', responsibility: 'Player site on Cloud Run', dependencies: ['routing', 'auth'], status: 'Deployed', detail: 'https://shootball-control-test-730016272076.us-central1.run.app serves the player site and admin panel. Main-branch releases deploy automatically.' },
      { id: 'routing', name: 'Gameplay routing / TLS', responsibility: 'HTTPS and WebSocket entry point', dependencies: ['game'], status: 'Configured', detail: 'Caddy provides TLS at 136.71.64.19.sslip.io using the reserved VM address. Certificate data persists on disk.' },
      { id: 'game', name: 'Game VM / process / rooms', responsibility: 'Authoritative Colyseus simulation', dependencies: ['auth'], status: 'Unknown', detail: 'Provider inventory is separate from process health, readiness and room occupancy.' },
      { id: 'admin', name: 'Independent admin API', responsibility: 'Protected production inventory', dependencies: ['inventory', 'store'], status: 'Deployed', detail: 'Cloud Run hosts the admin API with verified sessions and current membership checks. The primary administrator signs in without a mandatory authenticator.' },
      { id: 'inventory', name: 'Compute Engine', responsibility: 'Registered VM power state', dependencies: [], status: 'Read-only adapter', detail: 'Pinned project and manifest allowlist. No start, stop, create or delete API is exposed.' },
      { id: 'auth', name: 'Supabase Auth', responsibility: 'Player and administrator sign-in', dependencies: [], status: 'Configured', detail: 'The scoped Supabase project authenticates accounts. Admin access is checked on every request. Configuration status is not an uptime measurement.' },
      { id: 'store', name: 'Admin persistence', responsibility: 'Memberships, audit, operations and outbox', dependencies: [], status: 'Memberships and audit', detail: 'Private membership and membership-change audit storage are implemented. Operations, outbox and the worker remain pending.' },
      { id: 'telemetry', name: 'Telemetry / billing', responsibility: 'Activity, health and cost aggregates', dependencies: [], status: 'Not connected', detail: 'Missing measurements are unknown, never zero.' },
    ],
    capabilities: ['Start server', 'Drain', 'Resume admissions', 'Restart process', 'Stop VM', 'Force stop', 'Close room', 'Publish config'].map((label, i) => ({ id: String(i), label, enabled: false, reason: 'Requires verified admin membership, durable audit/outbox and operation worker. This milestone is read-only.' })),
  };
}
