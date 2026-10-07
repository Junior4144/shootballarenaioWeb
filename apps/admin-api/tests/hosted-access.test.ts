import assert from 'node:assert/strict';
import { test } from 'node:test';
import { once } from 'node:events';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createAdminServer } from '../src/server';
import { FixtureInventory } from '../src/inventory';
import type { Access } from '../src/auth';

test('hosted API checks current membership and MFA on every read, fails closed on outage', async () => {
  let access: Access = { status: 'denied' }; let calls = 0; let unavailable = false;
  const server = createAdminServer({ inventory: new FixtureInventory(), allowedHosts: [], allowedOrigins: [], authorize: async () => { calls++; if (unavailable) throw new Error('private database error'); return access; } });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}/admin/v1/`;
  const headers = { Authorization: 'Bearer fixture-user-token' };
  try {
    assert.equal((await fetch(base + 'dashboard?environment=local', { headers })).status, 400);
    assert.equal((await fetch(base + 'dashboard?environment=gcp-test', { headers })).status, 400);
    assert.equal((await fetch(base + 'dashboard?environment=production')).status, 401);
    assert.equal((await fetch(base + 'dashboard?environment=production', { headers })).status, 403);
    access = { status: 'mfa-required' };
    assert.equal((await fetch(base + 'dashboard?environment=production', { headers })).status, 403);
    assert.deepEqual(await (await fetch(base + 'session?environment=production', { headers })).json(), { status: 'mfa-required', error: 'Complete administrator MFA' });
    access = { status: 'allowed', userId: 'verified-user', roles: ['viewer'], environment: 'production' };
    const allowed = await (await fetch(base + 'dashboard?environment=production', { headers })).json();
    assert.equal(allowed.mode, 'supabase'); assert.equal(allowed.identity.role, 'viewer');
    access = { status: 'denied' }; // Same bearer token, membership revoked.
    assert.equal((await fetch(base + 'dashboard?environment=production', { headers })).status, 403);
    unavailable = true;
    const failed = await fetch(base + 'dashboard?environment=production', { headers });
    assert.equal(failed.status, 503); assert.ok(!(await failed.text()).includes('private database'));
    assert.equal(calls, 6);
  } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
});

test('production static /admin serves only public assets and does not bypass API auth', async () => {
  const root = await mkdtemp(join(tmpdir(), 'shootball-admin-'));
  await mkdir(join(root, 'admin')); await writeFile(join(root, 'admin/index.html'), '<title>Admin sign in</title>');
  await writeFile(join(root, '.env'), 'DO_NOT_EXPOSE');
  const server = createAdminServer({ inventory: new FixtureInventory(), allowedHosts: [], allowedOrigins: [], authorize: async () => ({ status: 'denied' }), staticRoot: root });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  try {
    const redirect = await fetch(base + '/admin', { redirect: 'manual' }); assert.equal(redirect.status, 308);
    const health = await fetch(base + '/health');
    assert.equal(health.status, 200);
    assert.equal((await health.json()).status, 'live');
    assert.equal(await (await fetch(base + '/admin/')).text(), '<title>Admin sign in</title>');
    assert.equal((await fetch(base + '/.env')).status, 404);
    assert.equal((await fetch(base + '/%2e%2e%2f.env')).status, 404);
    assert.equal((await fetch(base + '/admin/v1/dashboard?environment=production')).status, 401);
  } finally {
    server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()));
    // Exact test-owned directory returned by mkdtemp, never an input path.
    await rm(root, { recursive: true });
  }
});


test('production proxy origin is exact and never replaces administrator authorization', async () => {
  let calls = 0;
  const origin = 'https://shootball-arena.vercel.app';
  const server = createAdminServer({ inventory: new FixtureInventory(), allowedHosts: [], allowedOrigins: [origin], authorize: async () => { calls++; return { status: 'denied' }; } });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const base = 'http://127.0.0.1:' + (server.address() as { port: number }).port + '/admin/v1/session?environment=production';
  try {
    assert.equal((await fetch(base, { headers: { Origin: origin } })).status, 401);
    const denied = await fetch(base, { headers: { Origin: origin, Authorization: 'Bearer unprivileged' } });
    assert.equal(denied.status, 403);
    assert.equal((await denied.json()).error, 'Administrator access required');
    assert.equal(denied.headers.get('cache-control'), 'no-store');
    for (const untrusted of ['https://shootball-arena.vercel.app.attacker.example', 'https://preview.vercel.app', 'http://shootball-arena.vercel.app']) {
      const response = await fetch(base, { headers: { Origin: untrusted, 'X-Forwarded-Host': 'shootball-arena.vercel.app', Authorization: 'Bearer unprivileged' } });
      assert.equal(response.status, 403);
      assert.equal((await response.json()).error, 'Origin denied');
    }
    assert.equal(calls, 1);
  } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
});
