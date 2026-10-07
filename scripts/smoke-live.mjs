import assert from 'node:assert/strict';
import { Client } from '@colyseus/sdk';
const web = process.env.WEB_BASE_URL;
const game = process.env.GAME_SERVER_URL;
assert(web?.startsWith('https://') && game?.startsWith('wss://'), 'HTTPS endpoints required');
const request = path => fetch(new URL(path, web), { signal: AbortSignal.timeout(30000) });
assert.equal((await request('/')).status, 200);
assert.equal((await request('/admin/')).status, 200);
assert.equal((await request('/admin/v1/dashboard?environment=gcp-test')).status, 401);
const health = await (await request('/healthz')).json();
assert.equal(health.revision, process.env.RELEASE_SHA);
const client = new Client(game);
let room;
const deadline = setTimeout(() => { console.error('Multiplayer smoke timed out'); process.exit(1); }, 45000);
try {
  room = await client.joinOrCreate('arena', { mode: 'guest' });
  await new Promise((resolve, reject) => {
    room.onStateChange.once(() => resolve());
    room.onError((code, message) => reject(new Error(`Room ${code}: ${message}`)));
  });
  console.log('Live HTTPS, admin denial, matching revision and guest multiplayer state verified');
} finally {
  if (room) await room.leave();
  clearTimeout(deadline);
}
