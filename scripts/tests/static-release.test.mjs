import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { verifyWebRelease, PRIMARY_WEB } from '../release-checks.mjs';

const config = JSON.parse(await readFile(new URL('../../deploy/vercel/vercel.json', import.meta.url), 'utf8'));
function upstream(path) {
  return config.routes.find(route => route.dest?.startsWith('https:') && new RegExp('^' + route.src + '$').test(path));
}
test('public entry and assets never route to the sleeping origin; admin APIs still do', () => {
  for (const path of ['/', '/index.html', '/release.json', '/assets/index-abc.js', '/background/arena.mp4', '/missing.js']) assert.equal(upstream(path), undefined, path);
  for (const path of ['/admin', '/admin/', '/admin/config', '/admin/v1/session', '/admin/assets/main.js', '/health', '/healthz']) assert(upstream(path), path);
  assert.equal(config.outputDirectory, 'public');
});
test('release verification rejects stale static frontend even when the API is current', async () => {
  const sha = 'a'.repeat(40);
  await assert.rejects(verifyWebRelease(PRIMARY_WEB, sha, {
    sleep: async () => {},
    request: async url => new URL(url).pathname === '/health'
      ? Response.json({ status: 'live', revision: sha })
      : Response.json({ hosting: 'vercel-static', revision: 'b'.repeat(40) }),
  }), /Static frontend must match/);
});
