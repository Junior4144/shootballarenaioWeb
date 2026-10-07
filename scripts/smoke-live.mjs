import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { Client } from '@colyseus/sdk';
import { ROOM_NAME, VERSION } from '@shootball/protocol';
const web = process.env.WEB_BASE_URL;
const game = process.env.GAME_SERVER_URL;
assert(web?.startsWith('https://') && game?.startsWith('wss://'), 'HTTPS endpoints required');
assert.match(process.env.RELEASE_SHA ?? '', /^[a-f0-9]{40}$/, 'Release commit required');
const request = path => fetch(new URL(path, web), { signal: AbortSignal.timeout(30000) });
// Cloud Run readiness can precede propagation of public URL traffic routing.
let observedRevision;
let matches = 0;
const rolloutDeadline = Date.now() + 300000;
while (Date.now() < rolloutDeadline) {
  try {
    const response = await fetch(new URL('/health', web), { signal: AbortSignal.timeout(5000) });
    if (response.ok) observedRevision = (await response.json()).revision;
    matches = response.ok && observedRevision === process.env.RELEASE_SHA ? matches + 1 : 0;
    if (matches >= 3) break;
  } catch { matches = 0; }
  console.log('Waiting for the public web revision to converge...');
  await delay(5000);
}
assert.equal(observedRevision, process.env.RELEASE_SHA, 'Public web revision did not converge');
assert.equal(matches, 3, 'Public web revision did not stabilize');
assert.equal((await request('/')).status, 200);
assert.equal((await request('/admin/')).status, 200);
assert.equal((await (await request('/admin/config')).json()).environment, 'production');
assert.equal((await request('/admin/v1/dashboard?environment=production')).status, 401);
const healthResponse = await request('/health');
assert.equal(healthResponse.status, 200);
const health = await healthResponse.json();
assert.equal(health.revision, process.env.RELEASE_SHA);
const client = new Client(game);
let room;
const deadline = setTimeout(() => { console.error('Multiplayer smoke timed out'); process.exit(1); }, 45000);
try {
  room = await client.joinOrCreate(ROOM_NAME, { mode: 'guest', version: VERSION });
  room.reconnection.enabled = false;
  await new Promise((resolve, reject) => {
    room.onMessage('snapshot', snapshot => {
      if (Number.isFinite(snapshot.tick) && snapshot.players.some(player => player.id === room.sessionId)) resolve();
    });
    room.onError((code, message) => reject(new Error(`Room ${code}: ${message}`)));
  });
  console.log('Live HTTPS, admin denial, matching revision and guest multiplayer state verified');
} finally {
  if (room) await room.leave();
  clearTimeout(deadline);
}
