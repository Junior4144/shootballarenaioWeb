import { readFile, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
const types: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.png': 'image/png', '.mp4': 'video/mp4', '.ico': 'image/x-icon' };
export function staticSite(root: string) {
  const base = resolve(root);
  return async (req: IncomingMessage, res: ServerResponse, pathname: string) => {
    if (!['GET', 'HEAD'].includes(req.method ?? '')) { res.writeHead(405); res.end(); return; }
    if (pathname === '/admin') { res.writeHead(308, { Location: '/admin/' }); res.end(); return; }
    let decoded: string;
    try { decoded = decodeURIComponent(pathname); } catch { res.writeHead(400); res.end(); return; }
    const relative = decoded === '/' ? 'index.html' : decoded === '/admin/' ? 'admin/index.html' : decoded.slice(1);
    const target = resolve(base, relative);
    if (!target.startsWith(base + sep) || relative.split(/[\\/]/).some(part => part.startsWith('.'))) { res.writeHead(404); res.end(); return; }
    try {
      const info = await stat(target);
      if (!info.isFile() || !types[extname(target)]) throw new Error('Not public asset');
      const contents = await readFile(target);
      res.setHeader('Content-Type', types[extname(target)]);
      res.setHeader('Content-Length', contents.length);
      res.setHeader('Cache-Control', extname(target) === '.html' ? 'no-store' : 'public, max-age=3600');
      res.writeHead(200); res.end(req.method === 'HEAD' ? undefined : contents);
    } catch { res.writeHead(404); res.end(); }
  };
}
