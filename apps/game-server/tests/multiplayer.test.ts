import test from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { Client, type Room } from '@colyseus/sdk';
import { createServer } from '../src/server';
import { NETWORK, ROOM_NAME, VERSION, neutralInput, isInput, type Snapshot } from '@shootball/protocol';
import { PracticeConnection } from '../../web/src/network/PracticeConnection';
import { ARENA } from '@shootball/shared';

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
  assert.ok(isInput({ ...valid, aim: { x: ARENA.right, y: ARENA.bottom } }));
  for (const bad of [
    null, [], {}, { ...valid, seq: -1 }, { ...valid, seq: 0.5 },
    { ...valid, seq: Number.MAX_SAFE_INTEGER + 1 },
    { ...valid, moveX: 2 }, { ...valid, moveY: NaN },
    { ...valid, aim: { x: Infinity, y: 0 } }, { ...valid, aim: { x: -1, y: 0 } },
    { ...valid, aim: { x: 0, y: ARENA.bottom + 1 } }, { ...valid, aim: { x: ARENA.right + 1, y: 0 } }, { ...valid, fire: 1 }, { ...valid, radar: 1 }, { ...valid, sprint: 1 }, { ...valid, stamina: 999 }, { ...valid, points: 999 },
    { ...valid, x: 900 }, { ...valid, health: 99 },
  ]) assert.equal(isInput(bad), false);
});

test('real clients synchronize authority, PvP, disabled reset, reconnect, capacity and expiry', { timeout: 45000 }, async () => {
  const server = createServer({ bots: false, walls: [] });
  const rooms: Room[] = [];
  let ui: PracticeConnection | undefined;
  const external: string | undefined = undefined;
  if (!external) await server.listen(0, '127.0.0.1');
  const endpoint = external ?? `ws://127.0.0.1:${(server.transport.server!.address() as AddressInfo).port}`;
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
    const b = await join(); let bState = observe(b);
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
    await pause(100);
    assert.equal(aState.latest!.generation, 0, 'reset cannot change an active fight');
    // Move into range using real validated client input.
    const approachDeadline = performance.now() + 10000;
    while (true) {
      const self = aState.latest!.players.find(p => p.id === a.sessionId)!;
      const opponent = aState.latest!.players.find(p => p.id === b.sessionId)!;
      if (Math.hypot(opponent.x - self.x, opponent.y - self.y) < 400) break;
      assert.ok(performance.now() < approachDeadline, 'players close distance across the larger arena');
      input({ moveX: Math.sign(opponent.x - self.x), moveY: Math.sign(opponent.y - self.y) });
      await pause(180);
    }
    input();
    await pause(500); // Both initial spawn shields have expired.
    let activeB = b;
    const target = () => aState.latest!.players.find(p => p.id === b.sessionId)!;
    const shooter = () => bState.latest!.players.find(p => p.id === a.sessionId)!;
    for (let hit = 1; hit <= 4; hit++) {
      input({ fire: true, aim: { x: target().x, y: target().y } });
      await until(() => target().health === 100 - hit * 25, 'shared opponent damage');
      if (hit === 1) {
        const hurtToken = activeB.reconnectionToken;
        activeB.connection.close();
        await until(() => !target().connected, 'hurt disconnect');
        activeB = await client.reconnect(hurtToken);
        rooms.push(activeB); activeB.reconnection.enabled = false;
        bState = observe(activeB);
        await until(() => !!bState.latest, 'hurt reconnect snapshot');
        assert.equal(target().health, 75, 'reconnect never heals');
        assert.equal(target().protectionRemaining, 0, 'reconnect never grants protection');
      }
    }
    assert.equal(target().deaths, 1);
    assert.equal(shooter().kills, 1);
    const deadPosition = { x: target().x, y: target().y };
    activeB.send('input', { ...neutralInput(), seq: 0, moveX: -1, fire: true });
    await pause(150);
    assert.equal(target().x, deadPosition.x, 'dead movement ignored');
    assert.equal(target().health, 0);
    // Reconnect while dead: death and score survive, with no immediate heal.
    const bToken = activeB.reconnectionToken;
    activeB.connection.close();
    await until(() => !target().connected, 'dead disconnect');
    const bResumed = await client.reconnect(bToken);
    rooms.push(bResumed); bResumed.reconnection.enabled = false;
    const brState = observe(bResumed);
    await until(() => !!brState.latest, 'dead reconnect snapshot');
    assert.equal(brState.latest!.players.find(p => p.id === b.sessionId)!.health, 0);
    await until(() => aState.latest!.players.find(p => p.id === b.sessionId)!.health === 100, 'respawn', 4000);
    const respawned = aState.latest!.players.find(p => p.id === b.sessionId)!;
    assert.equal(respawned.deaths, 1);
    assert.equal(respawned.lifeId, 2);
    assert.ok(respawned.protectionRemaining > 0);
    bState = brState;
    const common = [...aState.history.keys()].reverse().find(tick => bState.history.has(tick))!;
    assert.deepEqual(aState.history.get(common), bState.history.get(common), 'identical authoritative snapshots');
    const token = a.reconnectionToken;
    const oldId = a.sessionId;
    a.connection.close();
    await until(() => bState.latest!.players.find(p => p.id === oldId)?.connected === false, 'peer sees disconnect');
    const frozen = bState.latest!.players.find(p => p.id === oldId)!;
    bResumed.send('input', { ...neutralInput(), seq: 1, moveY: -1 });
    const resumed = await client.reconnect(token);
    rooms.push(resumed); resumed.reconnection.enabled = false;
    const resumedState = observe(resumed);
    assert.equal(resumed.sessionId, oldId);
    await until(() => resumedState.latest?.players.find(p => p.id === oldId)?.connected === true, 'same identity reconnect');
    assert.equal(resumedState.latest!.players.find(p => p.id === oldId)!.x, frozen.x);
    assert.equal(resumedState.latest!.players.find(p => p.id === oldId)!.kills, 1, 'reconnect preserves score');
    await until(() => bState.latest!.players.find(p => p.id === b.sessionId)!.y < respawned.y, 'peer keeps playing');
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
    await until(() => bState.latest!.players.find(p => p.id === uiId)?.connected === false, 'UI pause reserves avatar');
    await ui.join();
    assert.equal(ui.sessionId, uiId, 'Leave/Join resumes same identity');
    await ui.room!.leave();
    await until(() => !bState.latest!.players.some(p => p.id === uiId), 'controller cleanup');
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
    assert.equal(values.size, 1, 'UI Leave retains resume token');
    await until(() => bState.latest!.players.find(p => p.id === refreshId)?.connected === false, 'refresh avatar paused');
    await ui.join();
    assert.equal(ui.sessionId, refreshId);
    await ui.room!.leave();
    await until(() => ui!.state === 'disconnected', 'consented SDK cleanup');
    // A stale guest token automatically falls back to a fresh join.
    saved.forEach(([key, value]) => storage.setItem(key, value));
    await ui.join();
    assert.equal(values.size, 1);
    assert.equal(ui.state, 'connected');
    await ui.room!.leave();
    await until(() => bState.latest!.players.length === 1, 'controllers clean up');
    // Fill first room, verify the ninth guest goes into an isolated room.
    for (let i = 0; i < 7; i++) observe(await join());
    const overflow = await join(), overflowState = observe(overflow);
    assert.notEqual(overflow.roomId, b.roomId);
    await until(() => overflowState.latest?.players.length === 1, 'overflow room isolation');
    assert.equal(overflowState.latest!.targets.length, 0);
    const victim = rooms.find(r => r !== a && r !== b && r !== resumed && r !== activeB && r !== bResumed && r.roomId === b.roomId)!;
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
    if (!external) await server.gracefullyShutdown(false);
  }
});


test('17 guests fill three independent rooms with at most eight human seats', { timeout: 15000 }, async () => {
  const server = createServer({ bots: false });
  await server.listen(0, '127.0.0.1');
  const client = new Client(`ws://127.0.0.1:${(server.transport.server!.address() as AddressInfo).port}`);
  const rooms: Room[] = [];
  try {
    for (let i = 0; i < 17; i++) {
      const room = await client.joinOrCreate(ROOM_NAME, { version: VERSION, mode: 'guest' });
      room.reconnection.enabled = false; observe(room); rooms.push(room);
    }
    const counts = new Map<string, number>();
    for (const room of rooms) counts.set(room.roomId, (counts.get(room.roomId) ?? 0) + 1);
    assert.deepEqual([...counts.values()].sort((a, b) => b - a), [8, 8, 1]);
  } finally {
    for (const room of rooms) if (room.connection.isOpen) await room.leave();
    await server.gracefullyShutdown(false);
  }
});
