#!/usr/bin/env bash
set -euo pipefail
: "${IMAGE:?Image kind required}"
: "${IMAGE_REF:?Image reference required}"
: "${SHA:?Commit required}"
[[ "$IMAGE" == "game-server" || "$IMAGE" == "control-plane" ]]
[[ "$SHA" =~ ^[a-f0-9]{40}$ ]]
test "$(docker image inspect --format '{{.Config.User}}' "$IMAGE_REF")" = node
docker run -d --name smoke -p 127.0.0.1:18080:8080 -p 127.0.0.1:12567:2567 \
  -e RELEASE_SHA="$SHA" \
  -e SUPABASE_URL=https://lkgxpgcmspxekggndzih.supabase.co \
  -e SUPABASE_PUBLISHABLE_KEY=sb_publishable_ci_fixture "$IMAGE_REF"
if [ "$IMAGE" = control-plane ]; then PORT=18080; else PORT=12567; fi
export PORT
for i in $(seq 1 30); do
  if curl --max-time 2 -fsS "http://127.0.0.1:$PORT/healthz" > /dev/null; then break; fi
  sleep 1
done
node --input-type=module <<'NODE'
import assert from 'node:assert/strict';
const base = 'http://127.0.0.1:' + process.env.PORT;
const get = path => fetch(base + path, { signal: AbortSignal.timeout(5000) });
const health = await get('/healthz');
assert.equal(health.status, 200);
assert.deepEqual(await health.json(), process.env.IMAGE === 'control-plane'
  ? { status: 'live', mode: 'supabase', revision: process.env.SHA }
  : { status: 'live', revision: process.env.SHA });
if (process.env.IMAGE === 'control-plane') {
  assert.equal((await get('/')).status, 200);
  assert.match(await (await get('/admin/')).text(), /Control room/);
  for (const route of ['dashboard', 'health', 'telemetry', 'accounts', 'activity', 'memberships']) {
    const response = await get('/admin/v1/' + route + '?environment=production');
    assert.equal(response.status, 401, route + ' must require authentication');
    assert.equal(response.headers.get('cache-control'), 'no-store');
  }
} else {
  assert.equal((await get('/ops/telemetry')).status, 401);
}
NODE
docker stop --time 15 smoke
