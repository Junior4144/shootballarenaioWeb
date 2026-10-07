import type { Plugin } from 'vite';
import { TRAFFIC_RANGES, type TrafficRange } from '../../packages/admin-contracts/src/traffic';
import { posthogReader } from '../admin-api/src/posthog';
import { localRequestAllowed } from './live-proxy';

/** Local development bridge; hosted auth is rechecked before every cached analytics read. */
export function posthogLive(target: string): Plugin {
  const read = posthogReader();
  return { name: 'posthog-local-admin', configureServer(server) {
    server.middlewares.use(async (req, res, next) => {
      const url = new URL(req.url ?? '/', 'http://localhost');
      if (url.pathname !== '/admin/v1/traffic' || url.searchParams.get('source') !== 'posthog') return next();
      const send = (status: number, data: unknown) => {
        res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(data));
      };
      if (!localRequestAllowed(req)) return send(403, { error: 'Local same-origin access required' });
      if (req.method !== 'GET') return send(405, { error: 'Read only' });
      const bearer = req.headers.authorization;
      if (!bearer?.startsWith('Bearer ') || bearer.length > 8192) return send(401, { error: 'Sign in required' });
      const range = url.searchParams.get('range') ?? '24h', scope = url.searchParams.get('scope') ?? 'production';
      if (url.searchParams.get('environment') !== 'production' || !Object.hasOwn(TRAFFIC_RANGES, range) || !['production','development'].includes(scope)) return send(400, { error: 'Invalid traffic request' });
      try {
        const access = await fetch(target + '/admin/v1/session?environment=production', {
          headers: { Authorization: bearer, Origin: target }, redirect: 'error', signal: AbortSignal.timeout(8000),
        });
        if (access.status === 401 || access.status === 403) return send(access.status, { error: 'Administrator access required' });
        if (!access.ok) return send(503, { error: 'Authorization unavailable' });
        if ((await access.json()).status !== 'allowed') return send(403, { error: 'Complete administrator MFA' });
        send(200, await read(range as TrafficRange, scope as 'production'|'development'));
      } catch { send(503, { error: 'PostHog unavailable; verify CLI login and project query access' }); }
    });
  } };
}
