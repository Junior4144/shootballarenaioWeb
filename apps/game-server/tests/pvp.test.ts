import test from 'node:test';
import assert from 'node:assert/strict';
import { Practice } from '@shootball/shared/practice';
import { GAME } from '@shootball/shared';
import { neutralInput } from '@shootball/protocol';

function duel() {
  const world = new Practice({ bots: false, walls: [] }); world.add('a'); world.add('b');
  const a = world.players.get('a')!, b = world.players.get('b')!;
  Object.assign(a, { x: 200, y: 300, protectionRemaining: 0 });
  Object.assign(b, { x: 400, y: 300, protectionRemaining: 0 });
  return { world, a, b };
}
const idle = new Map();
function advance(world: Practice, seconds: number) {
  for (let i = 0; i < Math.ceil(seconds * 60); i++) world.step(idle, 1 / 60);
}
function shot(world: Practice, x = 200, speed = 10000) {
  world.projectiles.push({ id: 999, ownerId: 'a', damage: 25, x, y: 300, vx: speed, vy: 0, life: 1 });
  world.step(idle, 0.05);
}

test('swept shots skip owner, hit nearest opponent once, and cannot hit dead players', () => {
  const { world, a, b } = duel(); world.add('c');
  const c = world.players.get('c')!; Object.assign(c, { x: 500, y: 300, protectionRemaining: 0 });
  shot(world);
  assert.equal(a.health, 100); assert.equal(b.health, 75); assert.equal(c.health, 100);
  assert.equal(world.projectiles.length, 0);
  for (let i = 0; i < 3; i++) shot(world);
  assert.equal(b.health, 0); assert.equal(b.deaths, 1); assert.equal(a.kills, 1);
  shot(world); assert.equal(c.health, 75); assert.equal(b.deaths, 1); assert.equal(a.kills, 1);
});

test('close-range muzzle sweep hits and protection absorbs; actual firing ends shield', () => {
  const { world, a, b } = duel(); b.x = 215;
  b.protectionRemaining = 1;
  const fire = new Map([['a', { ...neutralInput(), aim: { x: 900, y: 300 }, fire: true }]]);
  a.protectionRemaining = 1; world.step(fire, 1 / 60);
  assert.equal(b.health, 100); assert.equal(a.protectionRemaining, 0); assert.equal(world.projectiles.length, 0);
  advance(world, 1.1); world.step(fire, 1 / 60); assert.equal(b.health, 75);
});

test('death suppresses inputs; respawn restores only health and picks a distant protected point', () => {
  const { world, a, b } = duel();
  for (let i = 0; i < 4; i++) shot(world);
  const pos = { x: b.x, y: b.y }; const life = b.lifeId;
  world.step(new Map([['b', { ...neutralInput(), moveX: 1, fire: true }]]), 0.05);
  assert.equal(b.x, pos.x); assert.equal(b.y, pos.y); assert.equal(world.projectiles.length, 0);
  advance(world, 2.8); assert.equal(b.health, 0);
  advance(world, 0.2); assert.equal(b.health, 100); assert.equal(b.lifeId, life + 1);
  assert.equal(b.deaths, 1); assert.equal(a.kills, 1); assert.ok(b.protectionRemaining > 1.3);
  assert.ok(Math.hypot(b.x-a.x,b.y-a.y) > 600);
});

test('disconnect does not clear shots, heal, protect or reset score; dead away players wait', () => {
  const { world, a, b } = duel();
  world.projectiles.push({ id: 1, ownerId: 'a', damage: 25, x: 350, y: 300, vx: 1000, vy: 0, life: 1 });
  world.disconnect('a'); world.disconnect('b');
  assert.equal(world.projectiles.length, 1);
  world.step(idle, 0.05); assert.equal(b.health, 75);
  for (let i = 0; i < 3; i++) shot(world);
  advance(world, 4); assert.equal(b.health, 0); assert.equal(b.respawnRemaining, 0);
  assert.equal(a.kills, 1); assert.equal(b.deaths, 1);
  b.connected = true; world.step(idle, 1 / 60);
  assert.equal(b.health, GAME.playerHealth); assert.equal(b.deaths, 1);
});

test('shots expire at walls/lifetime and firing retains server cooldown', () => {
  const { world, a } = duel();
  const fire = new Map([['a', { ...neutralInput(), aim: { x: 200, y: 0 }, fire: true }]]);
  world.step(fire, 1 / 60); world.step(fire, 1 / 60);
  assert.equal(world.projectiles.length, 1); assert.equal(world.projectiles[0].ownerId, a.id);
  advance(world, 1.3); assert.equal(world.projectiles.length, 0);
});
