import test from 'node:test';
import assert from 'node:assert/strict';
import { SnapshotBuffer } from '../src/network/SnapshotBuffer';
import { emptySnapshot, type Snapshot } from '@shootball/protocol';
import { createActor } from '@shootball/shared/content';

function frame(tick: number, x: number, angle = 0): Snapshot {
  return {
    ...emptySnapshot(), tick, generation: 0,
    players: [{ ...createActor('a'), x, y: 140, angle, connected: true, health: 100, kills: 0, deaths: 0, respawnRemaining: 0, protectionRemaining: 0, lifeId: 1 }],
    projectiles: [{ id: 1, ownerId: 'a', damage: 25, x: x + 28, y: 140, vx: 520, vy: 0, life: 1 }],
    targets: [{ id: 0, x: 530, y: 220, health: 3 }],
  };
}

test('20 Hz snapshots produce intermediate display frames without mutating authority', () => {
  const buffer = new SnapshotBuffer();
  const a = frame(0, 240), b = frame(3, 251), c = frame(6, 262);
  const original = structuredClone([a, b, c]);
  buffer.push(a, 0); buffer.push(b, 50); buffer.push(c, 100);
  assert.equal(buffer.sample(125)!.projectiles[0].x, 273.5);
  const positions = [100, 110, 120, 130, 140, 150].map(t => buffer.sample(t)!.players[0].x);
  assert.deepEqual(positions, [240, 242.2, 244.4, 246.6, 248.8, 251]);
  assert.deepEqual([a, b, c], original);
});

test('angles follow shortest path across wrap and underruns hold instead of extrapolate', () => {
  const buffer = new SnapshotBuffer();
  buffer.push(frame(0, 240, Math.PI - 0.1), 0);
  buffer.push(frame(3, 251, -Math.PI + 0.1), 50);
  assert.ok(Math.abs(buffer.sample(125)!.players[0].angle - Math.PI) < 1e-10);
  assert.equal(buffer.sample(1000)!.players[0].x, 251);
});

test('hits and entity lifecycle share the delayed timeline; resets snap immediately', () => {
  const buffer = new SnapshotBuffer();
  const a = frame(0, 240), b = frame(3, 251);
  b.projectiles = [];
  b.targets[0].health = 2;
  buffer.push(a, 0); buffer.push(b, 50);
  assert.equal(buffer.sample(149)!.projectiles.length, 1);
  assert.equal(buffer.sample(149)!.targets[0].health, 3);
  assert.equal(buffer.sample(150)!.projectiles.length, 0);
  assert.equal(buffer.sample(150)!.targets[0].health, 2);
  const reset = { ...frame(4, 240), generation: 1 };
  buffer.push(reset, 60);
  assert.equal(buffer.sample(60), reset);
  buffer.clear();
  assert.equal(buffer.sample(100), undefined);
});

test('uneven arrivals stay continuous and long gaps/new rooms discard old motion', () => {
  const buffer = new SnapshotBuffer();
  buffer.push(frame(0, 240), 0);
  buffer.push(frame(3, 251), 65);
  buffer.push(frame(6, 262), 105);
  let previous = 240;
  for (let t = 100; t <= 205; t += 5) {
    const x = buffer.sample(t)!.players[0].x;
    assert.ok(x >= previous && x - previous < 2);
    previous = x;
  }
  const recovery = frame(90, 500);
  buffer.push(recovery, 1500);
  assert.equal(buffer.sample(1500), recovery);
  const newRoom = frame(0, 240);
  buffer.push(newRoom, 1510);
  assert.equal(buffer.sample(1510), newRoom);
});

test('death and life changes hold then snap without interpolating across the arena', () => {
  const buffer = new SnapshotBuffer();
  const alive = frame(0, 240), dead = frame(3, 260), respawn = frame(6, 816);
  dead.players[0].health = 0; dead.players[0].deaths = 1;
  respawn.players[0].lifeId = 2; respawn.players[0].deaths = 1;
  buffer.push(alive, 0); buffer.push(dead, 50); buffer.push(respawn, 100);
  assert.equal(buffer.sample(125)!.players[0].x, 240);
  assert.equal(buffer.sample(150)!.players[0].health, 0);
  assert.equal(buffer.sample(175)!.players[0].x, 260);
  assert.equal(buffer.sample(199)!.players[0].health, 0);
  assert.equal(buffer.sample(200)!.players[0].x, 816);
  assert.equal(buffer.sample(200)!.players[0].health, 100);
});
