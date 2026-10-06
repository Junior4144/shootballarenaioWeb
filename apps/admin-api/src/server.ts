import { createServer } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { environments, type Environment } from '@shootball/admin-contracts';
import { dashboard } from './dashboard';
import type { Inventory } from './inventory';
export function assertLocalRuntime(env: NodeJS.ProcessEnv) {
  if (env.NODE_ENV === 'production' || env.K_SERVICE || env.ADMIN_AUTH_MODE !== 'local' || !env.ADMIN_LOCAL_TOKEN || env.ADMIN_LOCAL_TOKEN.length < 32) throw new Error('Only explicit local development auth is implemented. Set ADMIN_AUTH_MODE=local and a token of at least 32 characters; hosted startup is disabled.');
}
export function createAdminServer(options: { token: string; inventory: Inventory; allowedHosts: string[]; allowedOrigins: string[] }) {
  let windowStarted = Date.now();
  let requests = 0;
  return createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store'); res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('Content-Type', 'application/json; charset=utf-8');
    const send = (status: number, data: unknown) => { res.writeHead(status); res.end(JSON.stringify(data)); };
    if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress ?? '') || !options.allowedHosts.includes(req.headers.host ?? '') || (req.headers.origin && !options.allowedOrigins.includes(req.headers.origin))) return send(403, { error: 'Local origin required' });
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    if (url.pathname === '/healthz' && req.method === 'GET') return send(200, { status: 'live', mode: 'local-development' });
    if (Date.now() - windowStarted >= 60_000) { windowStarted = Date.now(); requests = 0; }
    if (++requests > 120) { res.setHeader('Retry-After', '60'); return send(429, { error: 'Local request limit reached; retry in one minute' }); }
    const actual = Buffer.from(req.headers.authorization ?? ''); const expected = Buffer.from(`Bearer ${options.token}`);
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return send(401, { error: 'Local development session required' });
    if (req.method !== 'GET') return send(405, { error: 'Read-only milestone; mutations are disabled' });
    if (url.pathname !== '/admin/v1/dashboard') return send(404, { error: 'Not found' });
    const environment = url.searchParams.get('environment');
    if (!environments.includes(environment as Environment)) return send(400, { error: 'Explicit valid environment required' });
    try { send(200, await dashboard(environment as Environment, options.inventory)); }
    catch { send(503, { error: 'Observation unavailable' }); }
  });
}
