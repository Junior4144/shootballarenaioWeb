import { LINKS, type Dashboard, type Environment } from '@shootball/admin-contracts';
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
      { id: 'primary', name: 'Vercel primary website', responsibility: 'Public website and admin entry point', dependencies: ['frontend'], status: 'Configured', detail: LINKS.primary + ' proxies the player site and /admin/ to the GCP origin. This is the primary public URL.' },
      { id: 'frontend', name: 'Player frontend / GCP origin', responsibility: 'Direct Cloud Run origin and fallback link', dependencies: ['routing', 'auth'], status: 'Deployed', detail: 'https://shootball-control-test-730016272076.us-central1.run.app serves the player site and admin panel behind the primary Vercel proxy. Main-branch releases deploy automatically.' },
      { id: 'routing', name: 'Gameplay routing / TLS', responsibility: 'HTTPS and WebSocket entry point', dependencies: ['game'], status: 'Configured', detail: 'Caddy provides TLS at 136.71.64.19.sslip.io using the reserved VM address. Certificate data persists on disk.' },
      { id: 'game', name: 'Game VM / process / rooms', responsibility: 'Authoritative Colyseus simulation', dependencies: ['auth'], status: 'Unknown', detail: 'Provider power state is separate from process readiness. Live matches reads protected process and room telemetry after the game release is deployed.' },
      { id: 'admin', name: 'Independent admin API', responsibility: 'Protected production inventory', dependencies: ['inventory', 'store'], status: 'Deployed', detail: 'Cloud Run hosts the admin API with verified sessions and current membership checks. The primary administrator signs in without a mandatory authenticator.' },
      { id: 'inventory', name: 'Compute Engine', responsibility: 'Registered VM power state', dependencies: [], status: 'Read-only adapter', detail: 'Pinned project and manifest allowlist. No start, stop, create or delete API is exposed.' },
      { id: 'auth', name: 'Supabase Auth', responsibility: 'Player and administrator sign-in', dependencies: [], status: 'Configured', detail: 'The scoped Supabase project authenticates accounts. Admin access is checked on every request. Configuration status is not an uptime measurement.' },
      { id: 'store', name: 'Admin persistence', responsibility: 'Memberships, audit, operations and outbox', dependencies: [], status: 'Memberships and audit', detail: 'Private membership and membership-change audit storage are implemented. Operations, outbox and the worker remain pending.' },
      { id: 'telemetry', name: 'Game telemetry', responsibility: 'Process and room observations', dependencies: ['game'], status: 'Implemented', detail: 'Live matches reads authenticated game telemetry. Health & alerts checks Vercel, GCP origin and gameplay liveness separately. Historical analytics are not connected.' },
      { id: 'billing', name: 'Billing', responsibility: 'Provider cost aggregates', dependencies: [], status: 'Not connected', detail: 'Actual spend and forecasts remain unavailable; no zero-cost estimate is inferred.' },
    ],
    capabilities: ['Start server', 'Drain', 'Resume admissions', 'Restart process', 'Stop VM', 'Force stop', 'Close room', 'Publish config'].map((label, i) => ({ id: String(i), label, enabled: false, reason: 'Requires verified admin membership, durable audit/outbox and operation worker. This milestone is read-only.' })),
  };
}
