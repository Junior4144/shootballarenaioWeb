import test from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { Client, type Room } from '@colyseus/sdk';
import { createServer } from '../src/server';
import { neutralInput, ROOM_NAME, VERSION, type Snapshot } from '@shootball/protocol';
import { firstWall, route, WALLS } from '@shootball/shared/arena';

const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
async function until(check: () => boolean, label: string, timeout = 3000) {
  const start = performance.now();
  while (!check()) { if (performance.now() - start > timeout) assert.fail(label); await pause(10); }
}
function observe(room: Room) {
  let latest: Snapshot | undefined; const history = new Map<number, Snapshot>();
  room.onMessage<Snapshot>('snapshot', s => { latest = s; history.set(s.tick, s); if (history.size > 200) history.delete(history.keys().next().value!); });
  return { get latest() { return latest!; }, history };
}

test('GL-F: real clients collect, scan, reconnect, see results and start a fresh round', { timeout: 15000 }, async () => {
  const server = createServer({ matchSeconds: 4, resultsSeconds: 1 });
  await server.listen(0, '127.0.0.1');
  const client = new Client(`ws://127.0.0.1:${(server.transport.server!.address() as AddressInfo).port}`);
  const rooms: Room[] = [];
  try {
    const a = await client.joinOrCreate(ROOM_NAME, { version: VERSION, scoreLimit: 1, bots: false }); rooms.push(a); a.reconnection.enabled = false;
    const sa = observe(a);
    const b = await client.joinOrCreate(ROOM_NAME, { version: VERSION }); rooms.push(b); b.reconnection.enabled = false;
    const sb = observe(b);
    await until(() => sa.latest?.players.filter(p => !p.bot).length === 2 && !!sb.latest, 'two humans');
    assert.equal(sa.latest.players.filter(p => p.bot).length, 6, 'two humans leave six NPC slots; join options cannot disable bots');
    assert.equal(sa.latest.match.scoreLimit, 1000, 'join cannot override rules');
    a.send('input', { ...neutralInput(), seq: 0, moveX: 1 });
    await until(() => sb.latest.players.find(p => p.id === a.sessionId)!.points === 5, 'ground collectible score');
    a.send('input', { ...neutralInput(), seq: 1, radar: true });
    await until(() => sa.latest.players.find(p => p.id === a.sessionId)!.radarCooldown > 0, 'radar authoritative activation');
    const scanned = sa.latest.players.find(p => p.id === a.sessionId)!;
    assert.ok(scanned.radar.markers.length > 0);
    assert.ok(scanned.radar.markers.every(m => Math.hypot(m.x - scanned.radar.origin.x, m.y - scanned.radar.origin.y) <= 360));
    const captured = structuredClone(scanned.radar.markers);
    a.send('input', { ...neutralInput(), seq: 2, radar: true });
    await pause(100); assert.deepEqual(sa.latest.players.find(p => p.id === a.sessionId)!.radar.markers, captured);
    const token = a.reconnectionToken; a.connection.close();
    await until(() => !sb.latest.players.find(p => p.id === a.sessionId)!.connected, 'drop reserved identity');
    const resumed = await client.reconnect(token); rooms.push(resumed); resumed.reconnection.enabled = false;
    const sr = observe(resumed); await until(() => !!sr.latest, 'resumed snapshot');
    const restored = sr.latest.players.find(p => p.id === a.sessionId)!;
    assert.equal(restored.points, 5); assert.ok(restored.radarCooldown > 10 && restored.radarCooldown < scanned.radarCooldown);
    await until(() => sr.latest.match.phase === 'results' && sb.latest.match.phase === 'results', 'round results', 5000);
    assert.ok(sr.latest.match.standings.some(p => p.id === a.sessionId && p.points >= 5));
    const final = structuredClone(sr.latest.match.standings);
    resumed.send('input', { ...neutralInput(), seq: 0, fire: true, radar: true, moveX: 1 });
    await pause(100); assert.deepEqual(sr.latest.match.standings, final); assert.equal(sr.latest.projectiles.length, 0);
    await until(() => sr.latest.match.round === 2 && sb.latest.match.round === 2, 'automatic rematch', 2000);
    const fresh = sr.latest.players.find(p => p.id === a.sessionId)!;
    assert.equal(sr.latest.generation, 1); assert.equal(fresh.points, 0); assert.equal(fresh.kills, 0); assert.equal(fresh.radarCooldown, 0);
    const common = [...sr.history.keys()].reverse().find(t => sb.history.has(t))!;
    assert.deepEqual(sr.history.get(common), sb.history.get(common));
  } finally {
    for (const r of rooms) if (r.connection.isOpen) await r.leave();
    await server.gracefullyShutdown(false);
  }
});

test('GL-F: default-content real clients fight bots and receive shared combat events', { timeout: 30000 }, async () => {
  const external = process.env.ARENA_TEST_ENDPOINT;
  const server = external ? undefined : createServer();
  if (server) await server.listen(0, '127.0.0.1');
  const endpoint = external ?? `ws://127.0.0.1:${(server!.transport.server!.address() as AddressInfo).port}`;
  const client = new Client(endpoint); const rooms: Room[] = [];
  let interval: ReturnType<typeof setInterval> | undefined;
  try {
    const a = await client.joinOrCreate(ROOM_NAME, { version: VERSION }); rooms.push(a); a.reconnection.enabled = false;
    const sa = observe(a);
    const b = await client.joinOrCreate(ROOM_NAME, { version: VERSION }); rooms.push(b); b.reconnection.enabled = false;
    const sb = observe(b);
    await until(() => !!sa.latest && !!sb.latest, 'default content snapshots');
    assert.equal(sa.latest.match.scoreLimit, 1000); assert.ok(sa.latest.pickups.some(p => p.kind === 'shotgun'));
    let seq = 0;
    interval = setInterval(() => {
      const me = sa.latest.players.find(p => p.id === a.sessionId)!;
      const target = sa.latest.players.filter(p => p.bot && p.health > 0)
        .sort((x, y) => Math.hypot(x.x - me.x, x.y - me.y) - Math.hypot(y.x - me.x, y.y - me.y))[0];
      // Seek combat across the expanded map instead of waiting at the spawn.
      const visible = !!target && firstWall(me, target, 4) === Infinity;
      const approach = target && (!visible || Math.hypot(target.x - me.x, target.y - me.y) > 220);
      const waypoint = approach ? route(me, target, WALLS)[0] : undefined;
      a.send('input', { ...neutralInput(), seq: seq++,
        moveX: waypoint && Math.abs(waypoint.x - me.x) > 8 ? Math.sign(waypoint.x - me.x) : 0,
        moveY: waypoint && Math.abs(waypoint.y - me.y) > 8 ? Math.sign(waypoint.y - me.y) : 0,
        aim: target ? { x: target.x, y: target.y } : neutralInput().aim, fire: visible, radar: seq === 1 });
    }, 170);
    await until(() => sb.latest.players.find(p => p.id === a.sessionId)!.botKills > 0, 'human earns bot kill in live default arena', 20000);
    const me = sb.latest.players.find(p => p.id === a.sessionId)!;
    assert.ok(me.points >= 20); assert.equal(me.kills, 0);
    assert.ok(sb.latest.events.some(e => e.kind === 'elimination' && e.actorId === a.sessionId && e.targetBot));
    assert.ok(sb.latest.pickups.some(p => p.dropped));
    clearInterval(interval); interval = undefined;
  } finally {
    clearInterval(interval);
    for (const r of rooms) if (r.connection.isOpen) await r.leave();
    if (server) await server.gracefullyShutdown(false);
  }
});
