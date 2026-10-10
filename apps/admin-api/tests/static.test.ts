import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { staticSite } from '../src/static';

test('production static handler serves the advertised sitemap and robots for GET and HEAD', async t => {
  const serve = staticSite(fileURLToPath(new URL('../../web/public/', import.meta.url)));
  const server = createServer((req, res) => { void serve(req, res, new URL(req.url!, 'http://localhost').pathname); });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise<void>(resolve => server.close(() => resolve())));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const base = `http://127.0.0.1:${address.port}`;
  const robots = await fetch(`${base}/robots.txt`);
  assert.equal(robots.status, 200);
  assert.match(robots.headers.get('content-type')!, /^text\/plain/);
  const advertised = (await robots.text()).match(/^Sitemap: (.+)$/m)?.[1];
  assert.equal(advertised, 'https://www.orb-skirmish.com/sitemap.xml');
  const sitemap = await fetch(`${base}${new URL(advertised!).pathname}`);
  assert.equal(sitemap.status, 200);
  assert.match(sitemap.headers.get('content-type')!, /^application\/xml/);
  assert.match(await sitemap.text(), /<loc>https:\/\/www\.orb-skirmish\.com\/<\/loc>/);
  const head = await fetch(`${base}/sitemap.xml`, { method: 'HEAD' });
  assert.equal(head.status, 200);
  assert.equal(await head.text(), '');
  assert.equal(head.headers.get('content-length'), sitemap.headers.get('content-length'));
  for (const path of ['/missing.xml', '/.env', '/%2e%2e%2findex.html']) {
    assert.equal((await fetch(`${base}${path}`)).status, 404);
  }
});
