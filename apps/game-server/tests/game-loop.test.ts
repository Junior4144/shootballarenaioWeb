import test from 'node:test';
import assert from 'node:assert/strict';
import { Practice, type ArenaRules } from '@shootball/shared/practice';
import { ARENA, GAME } from '@shootball/shared';
import { LOOP, WEAPONS } from '@shootball/shared/content';
import { WALLS, SPAWNS, clearPoint, firstWall, moveActor, route } from '@shootball/shared/arena';
import { neutralInput } from '@shootball/protocol';
import { botInput, type BotBrain } from '@shootball/shared/bots';
import { createActor } from '@shootball/shared/content';
const idle = new Map();
test('wall contact redirects diagonal movement at full speed and allows escape on all four faces', () => {
  const walls = [{ x: 300, y: 300, width: 100, height: 100 }];
  const slide = 340 + Math.hypot(10, 20);
  for (const [x, y, dx, dy, expectedX, expectedY] of [
    [284, 340, 10, 20, 284, slide], [416, 340, -10, 20, 416, slide],
    [340, 284, 20, 10, slide, 284], [340, 416, 20, -10, slide, 416],
    [284, 340, -20, 0, 264, 340], [416, 340, 20, 0, 436, 340],
    [340, 284, 0, -20, 340, 264], [340, 416, 0, 20, 340, 436],
  ]) {
    const p = { x, y }; moveActor(p, dx, dy, walls);
    assert.deepEqual(p, { x: expectedX, y: expectedY });
  }
});

test('straight-on hits glide toward a wall end, including arena edges', () => {
  const walls = [{ x: 300, y: 300, width: 100, height: 100 }];
  for (const [x, y, dx, dy, expectedX, expectedY] of [
    [284, 340, 10, 0, 284, 330], [416, 380, -10, 0, 416, 390],
    [340, 284, 0, 10, 330, 284], [380, 416, 0, -10, 390, 416],
    [ARENA.left + 16, 300, -10, 0, ARENA.left + 16, 290],
  ]) {
    const p = { x, y }; moveActor(p, dx, dy, walls);
    assert.deepEqual(p, { x: expectedX, y: expectedY });
  }
  const p = { x: 284, y: 310 };
  for (let i = 0; i < 30; i++) moveActor(p, 4, 0, walls);
  assert.ok(p.x > 300 && p.y < 284, 'continued input glides around the end');
  const stopped = { ...p }; moveActor(p, 0, 0, walls);
  assert.deepEqual(p, stopped, 'releasing input stops movement');
});

test('sliding respects adjoining cover and never adds more than the input distance', () => {
  const walls = [{ x: 300, y: 300, width: 100, height: 100 }, { x: 200, y: 400, width: 100, height: 50 }];
  const p = { x: 283.999, y: 380 };
  moveActor(p, 20, 20, walls);
  assert.ok(clearPoint(p, GAME.playerRadius, walls));
  assert.ok(p.y < 384);
  for (const [dx, dy] of [[40, 10], [10, 40], [40, 0]]) {
    const start = { x: 275, y: 340 }, next = { ...start };
    moveActor(next, dx, dy, walls);
    assert.ok(Math.hypot(next.x - start.x, next.y - start.y) <= Math.hypot(dx, dy) + 1e-8);
    assert.ok(clearPoint(next, GAME.playerRadius, walls));
  }
});

test('bots patrol without a nearby opponent, engage nearby humans, and resume patrol', () => {
  const bot = createActor('bot:1', true); Object.assign(bot, { x: 144, y: 160, health: 75 });
  const human = createActor('human', false); Object.assign(human, { x: 1232, y: 752, health: 100 });
  const brain: BotBrain = { remaining: 0, path: [] };
  const start = { x: bot.x, y: bot.y };
  for (let i = 0; i < 600; i++) {
    const input = botInput(bot, [], brain, 1 / 60, WALLS);
    assert.equal(input.fire, false);
    moveActor(bot, input.moveX * 165 / 60, input.moveY * 165 / 60);
    assert.ok(clearPoint(bot, GAME.playerRadius));
  }
  assert.ok(Math.hypot(bot.x - start.x, bot.y - start.y) > 80);
  Object.assign(bot, start);
  assert.equal(botInput(bot, [human], brain, 1 / 60, WALLS).fire, false);
  Object.assign(human, { x: 200, y: 160 });
  brain.thinkRemaining = 0;
  assert.equal(botInput(bot, [human], brain, 1 / 60, WALLS).fire, true);
  human.connected = false;
  brain.remaining = 0;
  const input = botInput(bot, [human], brain, 1 / 60, WALLS);
  assert.equal(input.fire, false); assert.equal(brain.targetId, undefined);
  assert.ok(Math.hypot(input.moveX, input.moveY) > 0);
});
function advance(w: Practice, seconds: number) { for (let i = 0; i < Math.round(seconds * 60); i++) w.step(idle, 1 / 60); }
function world(rules: ArenaRules = {}) {
  const w = new Practice({ bots: false, walls: [], ...rules }); w.add('a'); w.add('b');
  const a = w.players.get('a')!, b = w.players.get('b')!;
  Object.assign(a, { x: 200, y: 300, protectionRemaining: 0 }); Object.assign(b, { x: 400, y: 300, protectionRemaining: 0 });
  return { w, a, b };
}
function lethal(w: Practice, target: string) {
  const victim = w.players.get(target)!;
  w.projectiles.push({ id: 500, ownerId: 'a', x: victim.x - 30, y: victim.y, vx: 1000, vy: 0, life: 1, damage: 100 });
  w.step(idle, 0.05);
}

test('GL-A: points distinguish human/bot/orb, death preserves score, bot drops bounded orbs', () => {
  const { w, a, b } = world(); b.points = 55;
  lethal(w, 'b'); assert.equal(a.points, 100); assert.equal(a.kills, 1); assert.equal(b.points, 55);
  w.add('bot:99', true); const bot = w.players.get('bot:99')!;
  Object.assign(bot, { x: 500, y: 300, health: 75, protectionRemaining: 0 });
  lethal(w, bot.id); assert.equal(a.points, 120); assert.equal(a.botKills, 1); assert.equal(a.kills, 1);
  assert.equal(w.pickups.filter(p => p.dropped).length, 2);
  const orb = w.pickups.find(p => p.kind === 'score' && !p.dropped)!;
  Object.assign(a, { x: orb.x, y: orb.y }); w.step(idle, 1 / 60); assert.equal(a.points, 125);
  assert.equal(orb.available, false); w.step(idle, 1 / 60); assert.equal(a.points, 125);
});

test('GL-A: threshold freezes immutable results, joins cannot restart, rematch resets retained identities', () => {
  const { w, a, b } = world({ scoreLimit: 100, resultsSeconds: 0.2 });
  lethal(w, 'b'); assert.equal(w.match.phase, 'results'); assert.deepEqual(w.match.winnerIds, ['a']);
  const results = structuredClone(w.match.standings); const x = a.x;
  w.step(new Map([['a', { ...neutralInput(), moveX: 1, fire: true, radar: true }]]), 0.05);
  assert.equal(a.x, x); assert.equal(w.projectiles.length, 0); assert.equal(a.radarCooldown, 0);
  w.add('late'); assert.equal(w.players.get('late')!.health, 0); assert.deepEqual(w.match.standings, results);
  w.disconnect('b'); advance(w, 0.15);
  assert.equal(w.match.phase, 'playing'); assert.equal(w.match.round, 2); assert.equal(w.generation, 1);
  assert.equal(a.points, 0); assert.equal(a.kills, 0); assert.equal(a.health, 100); assert.equal(a.lifeId, 2);
  assert.equal(b.connected, false); assert.equal(b.health, 0); assert.equal(w.players.get('late')!.health, 100);
});

test('GL-A: time limit handles ties and empty scores without arbitrary winner', () => {
  const { w, a, b } = world({ matchSeconds: 0.1 }); a.points = 20; b.points = 20;
  advance(w, 0.1); assert.deepEqual(w.match.winnerIds, ['a', 'b']);
  const empty = world({ matchSeconds: 0.1 }).w; advance(empty, 0.1); assert.deepEqual(empty.match.winnerIds, []);
});

test('GL-B: high-speed movement cannot cross cover, slides on free axis, and map routes connect spawns', () => {
  const p = { x: 240, y: 280 }; moveActor(p, 400, 10);
  assert.ok(p.x < 264 && p.x > 260); assert.ok(p.y > 290);
  assert.ok(clearPoint(p, GAME.playerRadius));
  for (const spawn of SPAWNS) assert.ok(clearPoint(spawn, GAME.playerRadius));
  for (const a of SPAWNS) for (const b of SPAWNS) {
    const path = route(a, b); assert.ok(path.length > 0);
    let previous = a;
    for (const next of path) { assert.equal(firstWall(previous, next, GAME.playerRadius), Infinity); previous = next; }
  }
});

test('GL-B: wall blocks swept shots and muzzle shots; opponent in front of wall takes hit', () => {
  const { w, a, b } = world({ walls: WALLS });
  Object.assign(a, { x: 200, y: 280 }); Object.assign(b, { x: 400, y: 280 });
  w.projectiles.push({ id: 1, ownerId: 'a', damage: 25, x: 230, y: 280, vx: 10000, vy: 0, life: 1 });
  w.step(idle, 0.05); assert.equal(b.health, 100); assert.equal(w.projectiles.length, 0);
  a.x = 263;
  w.step(new Map([['a', { ...neutralInput(), fire: true, aim: b }]]), 0.05);
  assert.equal(w.projectiles.length, 0); assert.equal(b.health, 100);
  a.x = 200; b.x = 250; w.projectiles.push({ id: 2, ownerId: 'a', damage: 25, x: 220, y: 280, vx: 10000, vy: 0, life: 1 });
  w.step(idle, 0.05); assert.equal(b.health, 75);
});

test('GL-C: bot population scales without consuming human slots; bot navigation and combat work solo', () => {
  const w = new Practice(); w.add('human');
  assert.equal([...w.players.values()].filter(p => p.bot).length, 4);
  // Start one bot in sight; distant bots now patrol instead of pursuing globally.
  Object.assign(w.players.get('bot:1')!, { x: 208, y: 160 });
  const before = w.snapshot(); advance(w, 3);
  assert.ok(w.events.some(e => e.kind === 'shot' && e.actorId.startsWith('bot:')));
  assert.ok(w.players.get('human')!.health < 100 || w.players.get('human')!.deaths > 0);
  assert.ok(before.players.filter(p => p.bot).some(p => Math.hypot(p.x - w.players.get(p.id)!.x, p.y - w.players.get(p.id)!.y) > 20));
  for (let i = 1; i < 8; i++) w.add('human' + i);
  assert.equal([...w.players.values()].filter(p => p.bot).length, 0);
  assert.equal(w.players.size, 8);
  for (let i = 1; i < 8; i++) w.remove('human' + i);
  assert.equal([...w.players.values()].filter(p => p.bot).length, 4);
  w.remove('human'); assert.equal(w.players.size, 0);
});

test('GL-C: only nearest living connected human collects, pads respawn and dropped orbs expire', () => {
  const { w, a, b } = world();
  const orb = w.pickups.find(p => p.kind === 'score')!;
  Object.assign(a, { x: orb.x, y: orb.y, connected: false }); Object.assign(b, { x: orb.x + 5, y: orb.y });
  w.step(idle, 1 / 60); assert.equal(a.points, 0); assert.equal(b.points, 5);
  b.x = 400; advance(w, 8); assert.equal(orb.available, true);
  a.connected = true; a.health = 0; a.respawnRemaining = 3; w.step(idle, 1 / 60); assert.equal(a.points, 0);
  w.pickups.push({ ...orb, id: 1000, dropped: true, lifetime: 0.01 });
  w.step(idle, 1 / 60); assert.equal(w.pickups.some(p => p.id === 1000), false);
});

test('GL-D: pickups give capped healing and nonstacking timed speed, death clears loadout', () => {
  const { w, a } = world();
  const health = w.pickups.find(p => p.kind === 'health')!, speed = w.pickups.find(p => p.kind === 'speed')!;
  Object.assign(a, { x: health.x, y: health.y }); w.step(idle, 1 / 60); assert.equal(health.available, true);
  a.health = 80; w.step(idle, 1 / 60); assert.equal(a.health, 100); assert.equal(health.available, false);
  Object.assign(a, { x: speed.x, y: speed.y }); w.step(idle, 1 / 60); assert.equal(a.speedRemaining, 6);
  const x = a.x; w.step(new Map([['a', { ...neutralInput(), moveX: 1 }]]), 0.05);
  assert.ok(Math.abs(a.x - x - 220 * 1.25 * 0.05) < 1e-8);
  speed.available = true; w.step(idle, 1 / 60); assert.equal(a.speedRemaining, 6);
  a.x = 200; a.y = 300; advance(w, 6.1); assert.equal(a.speedRemaining, 0);
  a.weapon = 'heavy'; a.ammo = 6; a.speedRemaining = 6; a.radarCooldown = 9;
  w.projectiles.push({ id: 99, ownerId: 'b', x: 170, y: 300, vx: 1000, vy: 0, damage: 100, life: 1 });
  w.step(idle, 0.05);
  assert.equal(a.health, 0); assert.equal(a.weapon, 'basic'); assert.equal(a.ammo, 0); assert.equal(a.speedRemaining, 0);
  assert.ok(a.radarCooldown > 8, 'death does not refresh radar');
});

test('GL-D: heavy/shotgun pickups enforce ammo, damage, cooldown and basic fallback', () => {
  const { w, a, b } = world();
  const heavy = w.pickups.find(p => p.kind === 'heavy')!;
  Object.assign(a, { x: heavy.x, y: heavy.y }); w.step(idle, 1 / 60);
  assert.equal(a.weapon, 'heavy'); assert.equal(a.ammo, 6);
  Object.assign(a, { x: 200, y: 300 }); Object.assign(b, { x: 250, y: 300 });
  const fire = new Map([['a', { ...neutralInput(), aim: { x: 900, y: 300 }, fire: true }]]);
  w.step(fire, 0.05); assert.equal(a.ammo, 5); assert.equal(b.health, 50);
  w.step(fire, 0.05); assert.equal(a.ammo, 5);
  for (let i = 0; i < 5; i++) { advance(w, 0.56); w.step(fire, 1 / 60); }
  assert.equal(a.weapon, 'basic'); assert.equal(a.ammo, 0);
  const shotgun = w.pickups.find(p => p.kind === 'shotgun')!;
  Object.assign(a, { x: shotgun.x, y: shotgun.y }); w.step(idle, 1 / 60);
  assert.equal(a.weapon, 'shotgun'); assert.equal(a.ammo, 8);
  a.cooldown = 0; a.x = 200; a.y = 300; b.x = 800; b.y = 500; w.projectiles = [];
  w.step(fire, 1 / 60); assert.equal(w.projectiles.length, 5); assert.equal(a.ammo, 7);
  assert.ok(w.projectiles.every(p => p.damage === WEAPONS.shotgun.damage));
  assert.ok(new Set(w.projectiles.map(p => p.vy)).size === 5);
});

test('GL-D: radar samples only in range, stays frozen, rejects cooldown repeats, survives disconnect', () => {
  const { w, a, b } = world();
  const scan = new Map([['a', { ...neutralInput(), radar: true }]]);
  w.step(scan, 1 / 60); assert.equal(a.radarCooldown, LOOP.radarCooldown);
  const marker = a.radar.markers.find(p => p.id === b.id)!; assert.equal(marker.x, 400);
  b.x = 800; w.step(scan, 1 / 60); assert.equal(marker.x, 400); assert.ok(a.radarCooldown < 12);
  w.disconnect('a'); advance(w, 1); a.connected = true;
  assert.ok(a.radarCooldown > 10 && a.radarCooldown < 11); assert.equal(a.radar.markers.find(p => p.id === b.id)!.x, 400);
  advance(w, 2.1); assert.equal(a.radar.remaining, 0); assert.equal(a.radar.markers.length, 0);
  advance(w, 9); w.step(scan, 1 / 60); assert.equal(a.radar.markers.some(p => p.id === b.id), false);
});

test('GL-E: snapshots are independent and event history is bounded with monotonic IDs', () => {
  const { w, a } = world();
  const old = w.snapshot(); a.points = 10; a.radar.markers.push({ id: 'x', kind: 'bot', x: 1, y: 1 });
  assert.equal(old.players[0].points, 0); assert.equal(old.players[0].radar.markers.length, 0);
  for (let i = 0; i < 200; i++) { a.cooldown = 0; w.step(new Map([['a', { ...neutralInput(), aim: { x: 200, y: 0 }, fire: true }]]), 1 / 60); }
  assert.ok(w.events.length <= 128); assert.ok(w.events.every((e, i) => i === 0 || e.id > w.events[i-1].id));
});
