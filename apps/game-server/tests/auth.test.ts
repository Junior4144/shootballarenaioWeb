import test from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { Client, type Room } from '@colyseus/sdk';
import { authenticate, type VerifyAccount } from '../src/accountAuth';
import { createServer } from '../src/server';
import { ROOM_NAME, VERSION, type Snapshot } from '@shootball/protocol';

const wait = (ms: number) => new Promise(r => setTimeout(r, ms));
async function until(check: () => boolean) { for (let i = 0; i < 150; i++) { if (check()) return; await wait(20); } assert.fail('Timed out'); }
test('invalid credentials cannot fall back to guest and user IDs are not trusted', async () => {
  const verify: VerifyAccount = async token => {
    if (token !== 'valid') throw new Error('invalid');
    return { kind: 'account', userId: 'verified-user', displayName: 'Pixel Ace', token, expiresAt: Date.now() + 10000 };
  };
  assert.deepEqual(await authenticate({ mode: 'guest', userId: 'spoof' }, verify), { kind: 'guest' });
  for (const options of [{ mode: 'account' }, { mode: 'account', accessToken: '' }, { mode: 'guest', accessToken: 'valid' }, { accessToken: 'valid' }, { mode: 'account', accessToken: 'invalid' }]) await assert.rejects(authenticate(options, verify));
  const identity = await authenticate({ mode: 'account', accessToken: 'valid', userId: 'spoof' }, verify);
  assert.equal(identity.kind === 'account' && identity.userId, 'verified-user');
});

test('account joins, safe snapshots, refresh, reconnect revalidation, identity switch and expiry', { timeout: 15000 }, async () => {
  let calls = 0;
  const deadlines = new Map<string, number>();
  const verify: VerifyAccount = async token => {
    calls++;
    if (!['first', 'refresh', 'other', 'short', 'drop'].includes(token)) throw new Error('Invalid');
    const expiresAt = deadlines.get(token) ?? Date.now() + (token === 'short' || token === 'drop' ? 750 : token === 'first' ? 1600 : 6000);
    deadlines.set(token, expiresAt);
    if (expiresAt <= Date.now()) throw new Error('Expired');
    return { kind: 'account', userId: token === 'other' ? 'private-other-id' : 'private-account-id', displayName: 'Pixel Ace', token, expiresAt };
  };
  const server = createServer(undefined, verify);
  await server.listen(0, '127.0.0.1');
  const client = new Client(`ws://127.0.0.1:${(server.transport.server!.address() as AddressInfo).port}`);
  const rooms: Room[] = [];
  const join = async (accessToken: string) => { const room = await client.joinOrCreate(ROOM_NAME, { version: VERSION, mode: 'account', accessToken, userId: 'spoof' }); room.reconnection.enabled = false; rooms.push(room); return room; };
  try {
    await assert.rejects(join('invalid'));
    const guest = await client.joinOrCreate(ROOM_NAME, { version: VERSION, mode: 'guest' }); rooms.push(guest); guest.reconnection.enabled = false;
    let snapshot: Snapshot | undefined;
    guest.onMessage<Snapshot>('snapshot', value => { snapshot = value; });
    const account = await join('first'); account.onMessage('snapshot', () => {}); account.onMessage('authError', () => {});
    await until(() => snapshot?.identities?.[account.sessionId]?.kind === 'account');
    assert.deepEqual(snapshot!.identities![account.sessionId], { kind: 'account', displayName: 'Pixel Ace' });
    assert.equal(JSON.stringify(snapshot).includes('private-account-id'), false);
    assert.equal(JSON.stringify(snapshot).includes('accessToken'), false);
    account.send('refreshAuth', 'refresh'); await until(() => calls >= 3);
    await wait(1800); assert.equal(account.connection.isOpen, true, 'refresh extends access past the original token expiry');
    const token = account.reconnectionToken, id = account.sessionId;
    account.connection.close(); await until(() => snapshot?.players.find(p => p.id === id)?.connected === false);
    const before = calls;
    const resumed = await client.reconnect(token); rooms.push(resumed); resumed.reconnection.enabled = false;
    resumed.onMessage('snapshot', () => {}); resumed.onMessage('authError', () => {});
    assert.equal(resumed.sessionId, id); assert.ok(calls > before, 'reconnection reverified by server');
    let left = false; resumed.onLeave(() => { left = true; });
    resumed.send('refreshAuth', 'other'); await until(() => left);
    const expiring = await join('short'); expiring.onMessage('snapshot', () => {}); expiring.onMessage('authError', () => {});
    let expired = false; expiring.onLeave(() => { expired = true; }); await until(() => expired);
    await assert.rejects(client.reconnect(expiring.reconnectionToken));
    const dropped = await join('drop'); dropped.onMessage('snapshot', () => {});
    const droppedToken = dropped.reconnectionToken;
    dropped.connection.close(); await wait(1100);
    await assert.rejects(client.reconnect(droppedToken), 'disconnected accounts cannot resume after token expiry');
  } finally { for (const room of rooms) { room.reconnection.enabled = false; if (room.connection.isOpen) await room.leave(); } await server.gracefullyShutdown(false); }
});
