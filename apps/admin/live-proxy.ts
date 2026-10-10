import type { IncomingMessage } from 'node:http';
import type { Plugin, ProxyOptions } from 'vite';
export const liveTargets = {
  vercel: 'https://www.orb-skirmish.com',
  gcp: 'https://shootball-control-test-730016272076.us-central1.run.app',
} as const;
export function liveTarget(name = 'vercel'): string {
  if (name !== 'vercel' && name !== 'gcp') throw new Error('ADMIN_LIVE_TARGET must be vercel or gcp');
  return liveTargets[name];
}
export function localRequestAllowed(req: IncomingMessage): boolean {
  if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress ?? '')) return false;
  const host = req.headers.host ?? '';
  if (!/^(127\.0\.0\.1|localhost|\[::1\]):\d+$/.test(host)) return false;
  if (req.headers['sec-fetch-site'] === 'cross-site') return false;
  return !req.headers.origin || req.headers.origin === 'http://' + host;
}
export function liveGuard(): Plugin {
  return { name: 'local-admin-origin-guard', configureServer(server) {
    // Runs before Vite's proxy; never rewrite an untrusted browser Origin.
    server.middlewares.use((req, res, next) => {
      if (localRequestAllowed(req)) return next();
      res.writeHead(403, { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' });
      res.end('Local same-origin admin access required');
    });
  } };
}
export function liveProxy(target: string): ProxyOptions {
  if (!Object.values(liveTargets).some(value => value === target)) throw new Error('Unapproved admin API target');
  return { target, changeOrigin: true, secure: true, followRedirects: false,
    timeout: 15000, proxyTimeout: 15000,
    configure(proxy) {
      proxy.on('proxyReq', proxyReq => {
        proxyReq.setHeader('Origin', target);
        proxyReq.removeHeader('cookie');
        proxyReq.removeHeader('referer');
      });
    },
  };
}
