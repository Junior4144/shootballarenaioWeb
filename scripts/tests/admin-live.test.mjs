import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { transform } from 'esbuild';
const source = await readFile(new URL('../../apps/admin/live-proxy.ts', import.meta.url), 'utf8');
const { code } = await transform(source, { loader: 'ts', format: 'esm' });
const { liveTarget, liveTargets, localRequestAllowed, liveProxy, liveGuard } = await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));
const request = (headers = {}, address = '127.0.0.1') => ({ socket: { remoteAddress: address }, headers: { host: '127.0.0.1:5174', ...headers } });
test('live proxy defaults to Vercel and permits only the explicit GCP alternative', () => {
  assert.equal(liveTarget(), liveTargets.vercel);
  assert.equal(liveTarget('gcp'), liveTargets.gcp);
  for (const value of ['https://attacker.test', '', 'production']) assert.throws(() => liveTarget(value));
  assert.throws(() => liveProxy('http://127.0.0.1:9000'));
});
test('local proxy rejects cross-origin, rebinding and non-loopback requests before forwarding', () => {
  assert.equal(localRequestAllowed(request()), true);
  assert.equal(localRequestAllowed(request({ origin: 'http://127.0.0.1:5174' })), true);
  for (const headers of [{ origin: 'https://attacker.test' }, { origin: 'null' }, { host: 'attacker.test:5174' }, { 'sec-fetch-site': 'cross-site' }, { origin: 'http://127.0.0.1:9999' }]) assert.equal(localRequestAllowed(request(headers)), false);
  assert.equal(localRequestAllowed(request({}, '192.168.1.1')), false);
  let handler; liveGuard().configureServer({ middlewares: { use: fn => { handler = fn; } } });
  let forwarded = false, status;
  handler(request({ origin: 'https://attacker.test' }), { writeHead: value => { status = value; }, end() {} }, () => { forwarded = true; });
  assert.equal(status, 403); assert.equal(forwarded, false);
});
test('proxy preserves bearer auth, checks TLS and never follows credential-bearing redirects', () => {
  const options = liveProxy(liveTarget());
  assert.equal(options.secure, true); assert.equal(options.followRedirects, false);
  let handler; options.configure({ on: (event, fn) => { if (event === 'proxyReq') handler = fn; } });
  const headers = new Map([['authorization', 'Bearer test-session'], ['cookie', 'unrelated'], ['referer', 'local-page']]);
  handler({ setHeader: (key, value) => headers.set(key.toLowerCase(), value), removeHeader: key => headers.delete(key) });
  assert.equal(headers.get('authorization'), 'Bearer test-session');
  assert.equal(headers.get('origin'), liveTargets.vercel);
  assert.equal(headers.has('cookie'), false); assert.equal(headers.has('referer'), false);
});
