import test from 'node:test';
import assert from 'node:assert/strict';
import { ARENA, GAME, type InputIntent } from '@shootball/shared';
import { createWorld, stepWorld } from '../src/game/simulation';

const idle: InputIntent = { moveX: 0, moveY: 0, aim: { x: 800, y: 336 }, fire: false };

test('diagonal movement has the same speed and whole player stays inside every wall', () => {
  const straight = createWorld(), diagonal = createWorld();
  stepWorld(straight, { ...idle, moveX: 1 }, 0.05);
  stepWorld(diagonal, { ...idle, moveX: 1, moveY: 1 }, 0.05);
  assert.ok(Math.abs(straight.player.x - 240 - Math.hypot(diagonal.player.x - 240, diagonal.player.y - 336)) < 0.00001);
  for (const direction of [-1, 1]) {
    for (let i = 0; i < 200; i++) stepWorld(diagonal, { ...idle, moveX: direction, moveY: direction }, 0.05);
    assert.equal(diagonal.player.x, direction < 0 ? ARENA.left + GAME.playerRadius : ARENA.right - GAME.playerRadius);
    assert.equal(diagonal.player.y, direction < 0 ? ARENA.top + GAME.playerRadius : ARENA.bottom - GAME.playerRadius);
  }
});

test('aim controls shot direction, each click spawns once, and cooldown limits repeated fire', () => {
  const world = createWorld();
  const up = { ...idle, aim: { x: 240, y: 0 }, fire: true };
  stepWorld(world, up, 0);
  assert.equal(world.player.angle, -Math.PI / 2);
  assert.equal(world.projectiles.length, 1);
  assert.equal(world.projectiles[0].y, 336 - GAME.muzzleOffset);
  assert.equal(world.projectiles[0].vy, -GAME.shotSpeed);
  stepWorld(world, up, 0.01);
  assert.equal(world.projectiles.length, 1);
  stepWorld(world, idle, 0.05);
  assert.equal(world.projectiles.length, 1);
});

test('three hits destroy a dummy; shots hit only the nearest target', () => {
  const world = createWorld();
  world.targets = [{ id: 0, x: 310, y: 336, health: 3 }, { id: 1, x: 320, y: 336, health: 3 }];
  for (let shot = 0; shot < 3; shot++) {
    stepWorld(world, { ...idle, fire: true }, 0.05);
    for (let i = 0; i < 5; i++) stepWorld(world, idle, 0.05);
  }
  assert.equal(world.targets.length, 1);
  assert.equal(world.targets[0].id, 1);
  assert.equal(world.targets[0].health, 3);
  assert.equal(world.projectiles.length, 0);
});

test('swept collisions catch a target even when a shot crosses it in one frame', () => {
  const world = createWorld();
  world.targets = [{ id: 0, x: 400, y: 336, health: 3 }];
  world.projectiles = [{ id: 0, x: 300, y: 336, vx: 4000, vy: 0, life: 1 }];
  stepWorld(world, idle, 0.05);
  assert.equal(world.targets[0].health, 2);
  assert.equal(world.projectiles.length, 0);
});

test('projectiles disappear at every wall and on lifetime expiration', () => {
  for (const [x, y, vx, vy] of [[55, 300, -520, 0], [905, 300, 520, 0], [300, 87, 0, -520], [300, 585, 0, 520]]) {
    const world = createWorld();
    world.projectiles = [{ id: 0, x, y, vx, vy, life: 1 }];
    stepWorld(world, idle, 0.05);
    assert.equal(world.projectiles.length, 0);
  }
  const world = createWorld();
  world.projectiles = [{ id: 0, x: 100, y: 100, vx: 1, vy: 0, life: 0.01 }];
  stepWorld(world, idle, 0.02);
  assert.equal(world.projectiles.length, 0);
});

test('outward shots at the wall are removed and long pauses do not teleport the player', () => {
  const world = createWorld();
  world.player.x = ARENA.left + GAME.playerRadius;
  stepWorld(world, { ...idle, aim: { x: 0, y: 336 }, fire: true }, 0);
  assert.equal(world.projectiles.length, 0);
  const start = world.player.x;
  stepWorld(world, { ...idle, moveX: 1 }, 10);
  assert.equal(world.player.x - start, GAME.playerSpeed * 0.05);
  const fresh = createWorld();
  assert.equal(fresh.targets.length, 4);
  assert.equal(fresh.projectiles.length, 0);
  assert.equal(fresh.cooldown, 0);
});
