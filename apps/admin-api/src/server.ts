import { createServer } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { environments, LINKS, parseGameTelemetry, type Environment } from '@shootball/admin-contracts';
import { dashboard } from './dashboard';
import type { Inventory } from './inventory';
import type { Authorize } from './auth';
import { staticSite } from './static';
import type { HealthMonitor } from './health';
import type { ReadRecords } from './records';
export function assertLocalRuntime(env: NodeJS.ProcessEnv) {
  if (env.NODE_ENV === 'production' || env.K_SERVICE || env.ADMIN_AUTH_MODE !== 'local' || !env.ADMIN_LOCAL_TOKEN || env.ADMIN_LOCAL_TOKEN.length < 32) throw new Error('Local auth requires explicit development mode and a strong token; hosted local auth is disabled.');
}
export type AdminOptions = {
  health?: HealthMonitor; readRecords?: ReadRecords; telemetryFetch?: typeof fetch;
  token?: string; authorize?: Authorize; inventory: Inventory;
  allowedHosts: string[]; allowedOrigins: string[]; staticRoot?: string;
  publicConfig?: { supabaseUrl: string; publishableKey: string; environment: Environment };
};
export function createAdminServer(options: AdminOptions) {
  const hosted = !!options.authorize;
  if (!hosted && (!options.token || options.token.length < 32)) throw new Error('Local token required');
  const serve = options.staticRoot ? staticSite(options.staticRoot) : undefined;
  let windowStarted = Date.now(); let requests = 0;
  return createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store'); res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin'); res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    const send = (status: number, data: unknown) => { res.writeHead(status); res.end(JSON.stringify(data)); };
    let url: URL;
    try { url = new URL(req.url ?? '/', 'http://127.0.0.1'); } catch { return send(400, { error: 'Invalid URL' }); }
    if (!hosted && (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress ?? '') || !options.allowedHosts.includes(req.headers.host ?? ''))) return send(403, { error: 'Local origin required' });
    if (req.headers.origin) {
      let sameOrigin = false;
      try { const origin = new URL(req.headers.origin); sameOrigin = hosted && origin.protocol === 'https:' && origin.host === req.headers.host; } catch {}
      if (!sameOrigin && !options.allowedOrigins.includes(req.headers.origin)) return send(403, { error: 'Origin denied' });
    }
    if (['/health', '/healthz'].includes(url.pathname) && req.method === 'GET') return send(200, { status: 'live', mode: hosted ? 'supabase' : 'local-development', revision: process.env.RELEASE_SHA ?? 'development' });
    if (url.pathname === '/admin/config' && req.method === 'GET') return send(200, { ...options.publicConfig, mode: hosted ? 'supabase' : 'local', environment: hosted ? 'production' : 'local' });
    if (!url.pathname.startsWith('/admin/v1/')) {
      if (serve) return serve(req, res, url.pathname);
      return send(404, { error: 'Not found' });
    }
    if (Date.now() - windowStarted >= 60_000) { windowStarted = Date.now(); requests = 0; }
    if (++requests > 120) { res.setHeader('Retry-After', '60'); return send(429, { error: 'Request limit reached; retry in one minute' }); }
    const bearer = req.headers.authorization;
    if (!bearer?.startsWith('Bearer ') || bearer.length > 8192) return send(401, { error: 'Sign in required' });
    const environment = url.searchParams.get('environment');
    if (!environments.includes(environment as Environment)) return send(400, { error: 'Explicit valid environment required' });
    if (hosted && environment !== 'production') return send(400, { error: 'Only the production environment is available' });
    let identity = { label: 'Local development session', role: 'local-viewer' };
    if (options.authorize) {
      try {
        const access = await options.authorize(bearer.slice(7), environment as Environment);
        if (access.status === 'denied') return send(403, { error: 'Administrator access required', status: 'denied' });
        if (access.status === 'mfa-required') return send(url.pathname === '/admin/v1/session' ? 200 : 403, { status: 'mfa-required', error: 'Complete administrator MFA' });
        identity = { label: access.label ?? access.userId, role: access.roles.join(', ') };
      } catch { return send(503, { error: 'Authorization service unavailable' }); }
    } else {
      const actual = Buffer.from(bearer); const expected = Buffer.from('Bearer ' + options.token);
      if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return send(401, { error: 'Local development session required' });
    }
    if (req.method !== 'GET') return send(405, { error: 'Read-only milestone; mutations are disabled' });
    if (url.pathname === '/admin/v1/session') return send(200, { status: 'allowed', identity });
    if (url.pathname === '/admin/v1/health') {
      try { return send(200, { checks: await options.health?.read(environment as Environment) ?? [], source: 'Server-side HTTPS liveness probes; cached for 60 seconds' }); }
      catch { return send(503, { error: 'Health observations unavailable' }); }
    }
    if (url.pathname === '/admin/v1/telemetry') {
      if (!hosted || !options.telemetryFetch) return send(503, { error: 'Game telemetry is not connected in this environment' });
      try {
        const response = await options.telemetryFetch(LINKS.game + '/ops/telemetry', { headers: { Authorization: bearer }, signal: AbortSignal.timeout(9000), redirect: 'error', cache: 'no-store' });
        if (!response.ok) return send(503, { error: 'Game telemetry unavailable; check game release and administrator access' });
        const text = await response.text();
        if (text.length > 500_000) throw new Error();
        const body = parseGameTelemetry(JSON.parse(text));
        return send(200, body);
      } catch { return send(503, { error: 'Game telemetry unavailable or timed out' }); }
    }
    const view = url.pathname.slice('/admin/v1/'.length);
    if (['accounts', 'activity', 'memberships'].includes(view)) {
      const search = url.searchParams.get('search') ?? '';
      const offset = Number(url.searchParams.get('offset') ?? 0);
      if (search.length > 100 || !Number.isSafeInteger(offset) || offset < 0 || offset > 100_000) return send(400, { error: 'Invalid search or page' });
      if (!hosted || !options.readRecords) return send(503, { error: 'Database directory is not connected in this environment' });
      try { return send(200, await options.readRecords(bearer.slice(7), view as 'accounts' | 'activity' | 'memberships', search, offset)); }
      catch { return send(503, { error: 'Directory unavailable; verify database migration and access' }); }
    }
    if (url.pathname !== '/admin/v1/dashboard') return send(404, { error: 'Not found' });
    try {
      const body = await dashboard(environment as Environment, options.inventory);
      body.identity = identity; body.mode = hosted ? 'supabase' : 'local-development';
      send(200, body);
    } catch { send(503, { error: 'Observation unavailable' }); }
  });
}
