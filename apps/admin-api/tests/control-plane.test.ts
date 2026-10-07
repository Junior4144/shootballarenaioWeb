import assert from 'node:assert/strict';
import { once } from 'node:events';
import { test } from 'node:test';
import { request } from 'node:http';
import { GCP_PROJECT, SUPABASE_PROJECT, isStale, parseManifest } from '@shootball/admin-contracts';
import { FixtureInventory, GcpInventory } from '../src/inventory';
import { assertLocalRuntime, createAdminServer } from '../src/server';
const resource = { id: 'game-test', environment: 'gcp-test', project: GCP_PROJECT, zone: 'us-central1-a', instance: 'game-test' };
const manifest = { schemaVersion: 1, project: GCP_PROJECT, supabaseProject: SUPABASE_PROJECT, resources: [resource] };
const token = 'local-test-token-not-a-hosted-credential';

test('manifest rejects project escapes, duplicate targets, unknown fields and arbitrary paths', () => {
  assert.equal(parseManifest(manifest).resources.length, 1);
  for (const bad of [ { ...manifest, project: 'other-project' }, { ...manifest, supabaseProject: 'other' }, { ...manifest, shell: 'whoami' }, { ...manifest, resources: [resource, { ...resource, id: 'another' }] }, { ...manifest, resources: [{ ...resource, instance: '../other' }] }, { ...manifest, resources: [{ ...resource, environment: 'local' }] }, { ...manifest, resources: [{ ...resource, project: 'other' }] } ]) assert.throws(() => parseManifest(bad));
});
test('local auth refuses missing credentials and hosted/production startup', () => {
  const env = { ADMIN_AUTH_MODE: 'local', ADMIN_LOCAL_TOKEN: token };
  assert.doesNotThrow(() => assertLocalRuntime(env));
  for (const bad of [{}, { ...env, ADMIN_LOCAL_TOKEN: 'weak' }, { ...env, NODE_ENV: 'production' }, { ...env, K_SERVICE: 'admin' }, { ...env, ADMIN_AUTH_MODE: 'supabase' }]) assert.throws(() => assertLocalRuntime(bad));
});
test('provider resolves only registered targets; deduplicates concurrent reads; separates VM power and process readiness', async () => {
  let calls = 0;
  let now = 100_000;
  const provider = new GcpInventory(manifest, async url => {
    calls++; assert.equal(url, `https://compute.googleapis.com/compute/v1/projects/${GCP_PROJECT}/zones/us-central1-a/instances/game-test`);
    return { name: 'game-test', status: 'RUNNING', metadata: 'never exposed' };
  }, () => now);
  const [a, b] = await Promise.all([provider.read('gcp-test'), provider.read('gcp-test')]);
  assert.equal(calls, 1); assert.deepEqual(a, b); assert.equal(a.value![0].providerState, 'RUNNING');
  assert.equal(a.value![0].readiness, 'unknown'); assert.equal(a.value![0].humans, null); assert.ok(!JSON.stringify(a).includes('metadata'));
  assert.equal((await provider.read('production')).value, null); assert.equal(calls, 1);
  now += 31_000; assert.equal(isStale(a, now), true);
  await provider.read('gcp-test'); assert.equal(calls, 2);
});
test('provider failures and denied permissions never become empty inventory or leak raw errors', async () => {
  for (const status of [403, 404, 500]) {
    const provider = new GcpInventory(manifest, async () => { throw { response: { status }, secret: 'DO_NOT_EXPOSE' }; });
    const result = await provider.read('gcp-test');
    assert.equal(result.value, null); assert.equal(result.observedAt, null);
    assert.equal(result.availability, status === 403 ? 'permission-denied' : 'unavailable');
    assert.ok(!JSON.stringify(result).includes('DO_NOT_EXPOSE'));
  }
});
test('fixture inventory never masquerades as test or production observations', async () => {
  const provider = new FixtureInventory();
  assert.match((await provider.read('local')).source, /fixture/);
  for (const env of ['gcp-test', 'production'] as const) assert.equal((await provider.read(env)).value, null);
});
test('API rejects anonymous access, wrong origins, invalid environments and every mutation', async () => {
  const hosts: string[] = [];
  const server = createAdminServer({ token, inventory: new FixtureInventory(), allowedHosts: hosts, allowedOrigins: ['http://127.0.0.1:5174'] });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const address = server.address() as { port: number }; hosts.push(`127.0.0.1:${address.port}`);
  const base = `http://127.0.0.1:${address.port}`;
  const path = '/admin/v1/dashboard?environment=local';
  const headers = { Authorization: `Bearer ${token}` };
  try {
    assert.equal((await fetch(base + path)).status, 401);
    assert.equal((await fetch(base + path, { headers: { Authorization: 'Bearer invalid' } })).status, 401);
    assert.equal((await fetch(base + path, { headers: { ...headers, Origin: 'https://evil.example' } })).status, 403);
    const reboundStatus = await new Promise<number | undefined>((resolve, reject) => {
      const req = request(base + path, { headers: { ...headers, Host: 'evil.example' } }, res => { res.resume(); resolve(res.statusCode); });
      req.on('error', reject); req.end();
    });
    assert.equal(reboundStatus, 403);
    assert.equal((await fetch(base + '/admin/v1/dashboard?environment=wrong', { headers })).status, 400);
    assert.equal((await fetch(base + '/admin/v1/dashboard', { headers })).status, 400);
    for (const method of ['POST', 'PUT', 'DELETE']) assert.equal((await fetch(base + '/admin/v1/servers/game-test/actions?environment=local', { method, headers })).status, 405);
    const response = await fetch(base + path, { headers }); assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    const body = await response.json(); assert.equal(body.environment, 'local');
    assert.ok(body.metrics.every((m: { data: { value: unknown } }) => m.data.value === null));
    assert.ok(body.capabilities.every((c: { enabled: boolean }) => !c.enabled));
  } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
});
