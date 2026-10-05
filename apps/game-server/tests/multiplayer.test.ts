import test from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { Client, type Room } from '@colyseus/sdk';
import { createServer } from '../src/server';
import { NETWORK, ROOM_NAME, VERSION, neutralInput, isInput, isReset, type Snapshot } from '@shootball/protocol';
import { Practice } from '@shootball/shared/practice';
import { PracticeConnection } from '../../web/src/network/PracticeConnection';

const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
async function until(check: () => boolean, message: string, timeout = 2500): Promise<void> {
  const end = performance.now() + timeout;
  while (!check()) {
    if (performance.now() >= end) assert.fail(message);
    await pause(10);
  }
}
function observe(room: Room) {
  const history = new Map<number, Snapshot>();
  let latest: Snapshot | undefined;
  room.onMessage<Snapshot>('snapshot', state => { latest = state; history.set(state.tick, state); });
  return { get latest() { return latest; }, history };
}

test('wire validation rejects nonfinite, injected and malformed intent', () => {
  const valid = { ...neutralInput(), seq: 0 };
  assert.ok(isInput(valid));
  for (const bad of [
    null, [], {}, { ...valid, seq: -1 }, { ...valid, seq: 0.5 },
    { ...valid, seq: Number.MAX_SAFE_INTEGER + 1 },
    { ...valid, moveX: 2 }, { ...valid, moveY: NaN },
    { ...valid, aim: { x: Infinity, y: 0 } }, { ...valid, aim: { x: -1, y: 0 } },
    { ...valid, aim: { x: 0, y: 641 } }, { ...valid, fire: 1 },
    { ...valid, x: 900 }, { ...valid, health: 99 },
  ]) assert.equal(isInput(bad), false);
  assert.ok(isReset({ seq: 4 }));
  assert.equal(isReset({ seq: 4, targets: [] }), false);
});

test('shared simulation advances shots once and preserves ownership/reset identity', () => {
  const world = new Practice();
  world.add('one'); world.add('two');
  const p = world.players.get('one')!;
  world.step(new Map([['one', { ...neutralInput(), aim: { x: 900, y: p.y }, fire: true }]]), 1 / 60);
  assert.equal(world.projectiles.length, 1);
  assert.equal(world.projectiles[0].ownerId, 'one');
  assert.ok(Math.abs(world.projectiles[0].x - (240 + 28 + 520 / 60)) < 1e-6);
  world.disconnect('one');
  assert.equal(world.projectiles.length, 0);
  assert.equal(p.connected, false);
  world.reset();
  assert.equal(world.players.size, 2);
  assert.equal(world.targets.length, 4);
  assert.equal(p.connected, false);
  world.remove('one');
  world.add('three');
  assert.notEqual(world.players.get('three')!.y, world.players.get('two')!.y);
});

test('real clients synchronize authority, damage, reset, reconnect, capacity and expiry', { timeout: 30000 }, async () => {
  const server = createServer();
  const rooms: Room[] = [];
  let ui: PracticeConnection | undefined;
  await server.listen(0, '127.0.0.1');
  const port = (server.transport.server!.address() as AddressInfo).port;
  const endpoint = `ws://127.0.0.1:${port}`;
  const client = new Client(endpoint);
  const join = async () => {
    const room = await client.joinOrCreate(ROOM_NAME, { version: VERSION });
    rooms.push(room);
    room.reconnection.enabled = false;
    return room;
  };
  try {
    await assert.rejects(client.joinOrCreate(ROOM_NAME, { version: 999 }), /Protocol mismatch/);
    const a = await join(), aState = observe(a);
    const b = await join(), bState = observe(b);
    assert.equal(a.roomId, b.roomId);
    await until(() => aState.latest?.players.length === 2 && bState.latest?.players.length === 2, 'two players');
    const spawn = aState.latest!.players.find(p => p.id === a.sessionId)!;
    let seq = 0;
    const input = (extra = {}) => a.send('input', { ...neutralInput(), seq: seq++, ...extra });
    const started = performance.now();
    input({ moveX: 1 });
    await until(() => bState.latest!.players.find(p => p.id === a.sessionId)!.x > spawn.x, 'peer sees movement', 1000);
    assert.ok(performance.now() - started < 200, 'localhost intent-to-peer latency below 200ms');
    await pause(400);
    const stopped = bState.latest!.players.find(p => p.id === a.sessionId)!.x;
    await pause(120);
    assert.equal(bState.latest!.players.find(p => p.id === a.sessionId)!.x, stopped, 'stale movement stops');
    input({ moveX: 100, x: 900 });
    a.send('input', { ...neutralInput(), seq: 0, moveX: 1 });
    await pause(120);
    assert.equal(bState.latest!.players.find(p => p.id === a.sessionId)!.x, stopped, 'invalid/replayed input ignored');
    a.send('reset', { seq: seq++ });
    await until(() => aState.latest?.generation === 1 && bState.latest?.generation === 1, 'shared reset');
    b.send('reset', { seq: 0 });
    await pause(100);
    assert.equal(aState.latest!.generation, 1, 'room reset cooldown');
    // Three real shots from spawn to the first target.
    for (let hit = 1; hit <= 3; hit++) {
      input({ fire: true, aim: { x: 530, y: 220 } });
      if (hit === 1) await until(() => bState.latest!.projectiles.some(p => p.ownerId === a.sessionId), 'peer sees owned shot');
      await until(() => (bState.latest!.targets.find(t => t.id === 0)?.health ?? 0) === 3 - hit, 'shared target damage');
    }
    const common = [...aState.history.keys()].reverse().find(tick => bState.history.has(tick))!;
    assert.deepEqual(aState.history.get(common), bState.history.get(common), 'identical authoritative snapshots');
    const token = a.reconnectionToken;
    const oldId = a.sessionId;
    a.connection.close();
    await until(() => bState.latest!.players.find(p => p.id === oldId)?.connected === false, 'peer sees disconnect');
    const frozen = bState.latest!.players.find(p => p.id === oldId)!;
    b.send('input', { ...neutralInput(), seq: 1, moveY: 1 });
    const resumed = await client.reconnect(token);
    rooms.push(resumed); resumed.reconnection.enabled = false;
    const resumedState = observe(resumed);
    assert.equal(resumed.sessionId, oldId);
    await until(() => resumedState.latest?.players.find(p => p.id === oldId)?.connected === true, 'same identity reconnect');
    assert.equal(resumedState.latest!.players.find(p => p.id === oldId)!.x, frozen.x);
    assert.equal(resumedState.latest!.targets.length, 3, 'reconnect does not reset targets');
    await until(() => bState.latest!.players.find(p => p.id === b.sessionId)!.y > 196, 'peer keeps playing');
    await resumed.leave();
    await until(() => !bState.latest!.players.some(p => p.id === oldId), 'explicit leave removes player');
    // Exercise the actual browser connection controller, including SDK auto-reconnect.
    const transitions: string[] = [];
    ui = new PracticeConnection(endpoint, () => { if (ui) transitions.push(ui.state); });
    await ui.join();
    await until(() => ui!.snapshot !== undefined, 'UI connection snapshot');
    const uiId = ui.sessionId;
    ui.room!.connection.close();
    await until(() => transitions.includes('reconnecting'), 'UI reconnecting state');
    await until(() => ui!.state === 'connected', 'UI automatic reconnect', 5000);
    assert.equal(ui.sessionId, uiId);
    ui.leave();
    await until(() => !bState.latest!.players.some(p => p.id === uiId), 'UI leave cleanup');
    // Simulate refresh: a new frontend controller gets only tab-local storage.
    const values = new Map<string, string>();
    const storage: Storage = {
      get length() { return values.size; },
      clear: () => values.clear(), key: n => [...values.keys()][n] ?? null,
      getItem: key => values.get(key) ?? null,
      setItem: (key, value) => { values.set(key, value); },
      removeItem: key => { values.delete(key); },
    };
    const beforeRefresh = new PracticeConnection(endpoint, () => {}, storage);
    await beforeRefresh.join();
    const refreshId = beforeRefresh.sessionId;
    beforeRefresh.room!.reconnection.enabled = false;
    // Copy sessionStorage as a reload would retain it; the old JS context is gone.
    const saved = [...values.entries()];
    beforeRefresh.room!.connection.close();
    await until(() => beforeRefresh.state === 'disconnected', 'old context closes');
    saved.forEach(([key, value]) => storage.setItem(key, value));
    ui = new PracticeConnection(endpoint, () => {}, storage);
    await ui.join();
    assert.equal(ui.sessionId, refreshId, 'refresh resumes same identity');
    assert.equal(ui.state, 'connected');
    ui.leave();
    assert.equal(values.size, 0, 'explicit leave clears token');
    // A stale token yields a visible error; retry is a fresh, successful join.
    saved.forEach(([key, value]) => storage.setItem(key, value));
    await ui.join();
    assert.equal(ui.state, 'error');
    assert.equal(values.size, 0);
    await ui.join();
    assert.equal(ui.state, 'connected');
    ui.leave();
    await until(() => bState.latest!.players.length === 1, 'controllers clean up');
    // Fill first room, verify the ninth guest goes into an isolated room.
    for (let i = 0; i < 7; i++) observe(await join());
    const overflow = await join(), overflowState = observe(overflow);
    assert.notEqual(overflow.roomId, b.roomId);
    await until(() => overflowState.latest?.players.length === 1, 'overflow room isolation');
    assert.equal(overflowState.latest!.targets.length, 4);
    const victim = rooms.find(r => r !== a && r !== b && r !== resumed && r.roomId === b.roomId)!;
    const expiredToken = victim.reconnectionToken;
    victim.connection.close();
    await until(() => bState.latest!.players.find(p => p.id === victim.sessionId)?.connected === false, 'reserved avatar');
    await until(() => !bState.latest!.players.some(p => p.id === victim.sessionId), 'reservation expiry removes avatar', 12000);
    await assert.rejects(client.reconnect(expiredToken));
    const fresh = await join(); observe(fresh);
    assert.equal(fresh.roomId, b.roomId, 'expired slot is reusable');
    // Floods are bounded by the transport/room, never converted into movement.
    const flood = await join(); observe(flood);
    for (let i = 0; i < 150; i++) flood.send('input', { ...neutralInput(), seq: i });
    await until(() => !flood.connection.isOpen, 'excessive message rate disconnected');
    const oversized = await join(); observe(oversized);
    oversized.send('input', { padding: 'x'.repeat(NETWORK.maxPayload * 2) });
    await until(() => !oversized.connection.isOpen, 'oversized payload disconnected');
  } finally {
    ui?.leave();
    for (const room of rooms) {
      room.reconnection.enabled = false;
      if (room.connection.isOpen) await room.leave();
    }
    await server.gracefullyShutdown(false);
  }
});

