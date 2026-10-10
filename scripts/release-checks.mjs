import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
export const PRIMARY_WEB = 'https://www.orb-skirmish.com';
export const ORIGIN_WEB = 'https://shootball-control-test-730016272076.us-central1.run.app';
export const GAME_URL = 'wss://136.71.64.19.sslip.io';
export async function verifyWebRelease(base, sha, { request = fetch, sleep = delay, now = Date.now, timeoutMs = 300000 } = {}) {
  assert([PRIMARY_WEB, ORIGIN_WEB].includes(base), 'Unregistered website');
  assert.match(sha ?? '', /^[a-f0-9]{40}$/, 'Release commit required');
  const get = (path, options = {}) => request(new URL(path, base), { signal: AbortSignal.timeout(10000), ...options });
  let matches = 0;
  const deadline = now() + timeoutMs;
  while (now() < deadline) {
    try {
      const response = await get('/health');
      const health = response.ok ? await response.json() : null;
      matches = health?.status === 'live' && health.revision === sha ? matches + 1 : 0;
      if (matches === 3) break;
    } catch { matches = 0; }
    await sleep(5000);
  }
  assert.equal(matches, 3, base + ': release revision did not stabilize');
  for (const path of ['/', '/admin', '/admin/']) assert.equal((await get(path)).status, 200, base + path);
  const session = await get('/admin/v1/session?environment=production', { headers: { Origin: new URL(base).origin } });
  assert.equal(session.status, 401, base + ': origin must reach authentication');
  assert.equal(session.headers.get('cache-control'), 'no-store');
  const configResponse = await get('/admin/config');
  assert.equal(configResponse.status, 200);
  const config = await configResponse.json();
  assert.equal(config.mode, 'supabase');
  assert.equal(config.environment, 'production');
  assert.equal(config.supabaseUrl, 'https://lkgxpgcmspxekggndzih.supabase.co');
  assert.match(config.publishableKey ?? '', /^sb_publishable_/);
  for (const route of ['dashboard', 'health', 'telemetry', 'traffic', 'accounts', 'activity', 'memberships']) {
    const response = await get('/admin/v1/' + route + '?environment=production');
    assert.equal(response.status, 401, base + ': ' + route + ' must be protected');
    assert.equal(response.headers.get('cache-control'), 'no-store');
  }
}
export async function verifyGameRelease(game, sha, request = fetch) {
  assert.equal(game, GAME_URL, 'Unregistered game endpoint');
  const base = game.replace('wss://', 'https://');
  const response = await request(base + '/healthz', { signal: AbortSignal.timeout(15000) });
  assert.equal(response.status, 200);
  const health = await response.json();
  assert.equal(health.status, 'live');
  assert.equal(health.revision, sha, 'Game must run the requested release');
  assert.equal((await request(base + '/ops/telemetry', { signal: AbortSignal.timeout(15000) })).status, 401);
}
