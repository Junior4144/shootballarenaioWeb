import { Client } from '@colyseus/sdk';
import { ROOM_NAME, VERSION } from '@shootball/protocol';
import assert from 'node:assert/strict';
import { PRIMARY_WEB, ORIGIN_WEB, verifyWebRelease, verifyGameRelease } from './release-checks.mjs';
const web = process.env.WEB_BASE_URL;
const game = process.env.GAME_SERVER_URL;
const sha = process.env.RELEASE_SHA;
assert.equal(web, PRIMARY_WEB, 'Orb-skirmish must be the primary website');
await Promise.all([verifyWebRelease(web, sha), verifyWebRelease(ORIGIN_WEB, sha), verifyGameRelease(game, sha)]);
console.log('Orb-skirmish primary, direct GCP origin and game release verified');
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
