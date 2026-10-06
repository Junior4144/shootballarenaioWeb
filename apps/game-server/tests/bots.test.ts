import test from 'node:test';
import assert from 'node:assert/strict';
import { BOT, botInput, separateBots, type BotBrain } from '@shootball/shared/bots';
import { createActor } from '@shootball/shared/content';
import { clearPoint, WALLS, route } from '@shootball/shared/arena';
import { ARENA, GAME } from '@shootball/shared';
import { Practice } from '@shootball/shared/practice';

const actor = (id: string, x: number, y: number, bot = true) => ({ ...createActor(id, bot), x, y, health: 75 });
const brain = (): BotBrain => ({ remaining: 0, path: [], randomState: 123456789 });

test('randomized patrols are repeatable by seed, diverse across seeds, and clear of cover', () => {
  const b = actor('bot:1', 144, 160);
  const a = brain(), replay = brain();
  assert.deepEqual(botInput(b, [], a, 0.01, WALLS), botInput(b, [], replay, 0.01, WALLS));
  assert.deepEqual(a, replay);
  const destinations = new Set<string>();
  for (let i = 1; i <= 20; i++) {
    const memory = { ...brain(), randomState: i * 9876543 };
    botInput(b, [], memory, 0.01, WALLS);
    assert.ok(memory.goal && clearPoint(memory.goal, GAME.playerRadius, WALLS));
    assert.ok(memory.path.length > 0);
    destinations.add(JSON.stringify(memory.goal));
  }
  assert.ok(destinations.size > 10, 'same bot ID does not fix its patrol');
});

test('patrol choices avoid recently visited areas and stay cached between plans', () => {
  const b = actor('bot:1', 144, 160), memory = brain();
  for (let i = 0; i < 20; i++) {
    const recent = [...(memory.recentPatrols ?? [])];
    memory.goal = undefined; memory.remaining = 0;
    botInput(b, [], memory, 0.01, WALLS);
    assert.ok(!recent.includes(memory.recentPatrols!.at(-1)!));
    const goal = memory.goal, path = memory.path;
    botInput(b, [], memory, 0.01, WALLS);
    assert.equal(memory.goal, goal); assert.equal(memory.path, path);
    assert.ok(memory.remaining >= BOT.routeSeconds - 0.01);
  }
});

test('combat maneuvers hold steady between decisions but vary direction and distance over time', () => {
  const b = actor('bot:1', 200, 300), h = actor('human', 400, 300, false), memory = brain();
  const sides = new Set<number>(), offsets = new Set<number>();
  for (let i = 0; i < 20; i++) {
    memory.maneuverRemaining = 0;
    const input = botInput(b, [h], memory, 0.01, []);
    assert.equal(input.fire, true);
    assert.ok(memory.maneuverRemaining! >= BOT.variation.maneuverMinSeconds);
    assert.ok(memory.maneuverRemaining! <= BOT.variation.maneuverMaxSeconds);
    assert.ok(Math.abs(memory.combatDistanceOffset!) <= BOT.variation.combatDistanceJitter);
    assert.ok(Math.abs(memory.strafeScale! - 1) <= BOT.variation.strafeStrengthJitter);
    sides.add(memory.side!); offsets.add(memory.combatDistanceOffset!);
    assert.deepEqual(botInput(b, [h], memory, 0.01, []), input, 'no random twitch each tick');
  }
  assert.equal(sides.size, 2); assert.ok(offsets.size > 10);
});

test('smaller perception range, chase, strafing combat, and retreat use explicit states', () => {
  const b = actor('bot:1', 200, 160), h = actor('human', 550, 160, false), memory = brain();
  const think = () => botInput(b, [h], memory, BOT.thinkSeconds + 0.001, []);
  assert.equal(think().fire, false); assert.equal(memory.mode, 'patrol');
  h.x = 490; assert.equal(think().fire, false); assert.equal(memory.mode, 'chase');
  h.x = 400; const combat = think(); assert.equal(memory.mode, 'combat');
  assert.equal(combat.fire, true); assert.ok(Math.abs(combat.moveY) > 0.1);
  h.x = 280; assert.ok(think().moveX < 0); assert.equal(memory.mode, 'retreat');
  h.x = 400; b.health = 20; assert.ok(think().moveX < 0); assert.equal(memory.mode, 'retreat');
  h.x = 700; assert.equal(think().fire, false); assert.equal(memory.mode, 'search');
});

test('search uses last seen position, stops firing behind cover, then returns to patrol', () => {
  const b = actor('bot:1', 200, 300), h = actor('human', 250, 300, false), memory = brain();
  const walls = [{ x: 300, y: 200, width: 40, height: 200 }];
  botInput(b, [h], memory, 0.21, walls);
  h.x = 400;
  assert.equal(botInput(b, [h], memory, 0.01, walls).fire, false, 'fire checks cover between decisions');
  botInput(b, [h], memory, 0.21, walls);
  assert.equal(memory.mode, 'search'); assert.deepEqual(memory.goal, { x: 250, y: 300 });
  h.y = 350;
  for (let i = 0; i < 15; i++) botInput(b, [h], memory, 0.21, walls);
  assert.equal(memory.mode, 'patrol'); assert.equal(memory.targetId, undefined);
  assert.equal(memory.lastSeen, undefined);
});

test('route calculations are cached between decision intervals', () => {
  const b = actor('bot:1', 144, 160), memory = brain();
  botInput(b, [], memory, 1 / 60, WALLS);
  const path = memory.path;
  for (let i = 0; i < 30; i++) botInput(b, [], memory, 1 / 60, WALLS);
  assert.equal(memory.path, path, 'route stays cached between planning intervals');
});

test('losing sight stops live aim tracking before the next perception update', () => {
  const b = actor('bot:1', 200, 300), h = actor('human', 250, 300, false), memory = brain();
  const walls = [{ x: 300, y: 200, width: 40, height: 200 }];
  botInput(b, [h], memory, 0.01, walls);
  h.x = 400; h.y = 350;
  const input = botInput(b, [h], memory, 0.01, walls);
  assert.equal(input.fire, false);
  assert.notDeepEqual(input.aim, { x: h.x, y: h.y });
  assert.equal(memory.mode, 'search');
});

test('a hidden target does not prevent engaging a different visible human', () => {
  const b = actor('bot:1', 200, 300), hidden = actor('old', 250, 300, false);
  const visible = actor('new', 200, 480, false), memory = brain();
  const walls = [{ x: 300, y: 200, width: 40, height: 200 }];
  botInput(b, [hidden, visible], memory, 0.21, walls);
  hidden.x = 400;
  const input = botInput(b, [hidden, visible], memory, 0.21, walls);
  assert.equal(memory.targetId, visible.id); assert.equal(input.fire, true);
});

test('respawning target loses its old lock and must enter detection range again', () => {
  const b = actor('bot:1', 200, 300), h = actor('human', 400, 300, false), memory = brain();
  botInput(b, [h], memory, 0.01, []);
  h.lifeId++; h.x = 550;
  const input = botInput(b, [h], memory, 0.01, []);
  assert.equal(memory.targetId, undefined); assert.equal(memory.lastSeen, undefined);
  assert.equal(memory.mode, 'patrol'); assert.equal(input.fire, false);
});

test('expired search cannot reacquire an unseen target outside detection range', () => {
  const b = actor('bot:1', 200, 300), h = actor('human', 400, 300, false), memory = brain();
  botInput(b, [h], memory, 0.01, []);
  const walls = [{ x: 300, y: 200, width: 40, height: 200 }];
  botInput(b, [h], memory, 0.21, walls);
  memory.memoryRemaining = 0.01; memory.thinkRemaining = 0;
  h.x = 550;
  botInput(b, [h], memory, 0.02, []);
  assert.equal(memory.targetId, undefined); assert.equal(memory.mode, 'patrol');
});

test('arriving near a patrol goal discards the previous final waypoint', () => {
  const b = actor('bot:1', 144, 160), memory = brain();
  Object.assign(memory, { mode: 'patrol', goal: { x: 156, y: 160 }, path: [{ x: 156, y: 160 }], remaining: 0.7 });
  botInput(b, [], memory, 0.01, []);
  assert.notDeepEqual(memory.goal, { x: 156, y: 160 });
  assert.equal(memory.path.some(p => p.x === 156 && p.y === 160), false);
});

test('stalled patrol replans only when the route timer permits', () => {
  const b = actor('bot:1', 144, 160), memory = brain();
  botInput(b, [], memory, 0.01, WALLS);
  const path = memory.path;
  for (let i = 0; i < 100; i++) botInput(b, [], memory, 1 / 60, WALLS);
  assert.notEqual(memory.path, path);
  assert.ok(memory.path.length > 0);
});

test('dead or disconnected bots produce neutral input', () => {
  const b = actor('bot:1', 200, 300), h = actor('human', 400, 300, false), memory = brain();
  for (const update of [{ health: 0, connected: true }, { health: 75, connected: false }]) {
    Object.assign(b, update);
    const input = botInput(b, [h], memory, 0.21, []);
    assert.equal(input.fire, false); assert.equal(input.moveX, 0); assert.equal(input.moveY, 0);
  }
});

test('combat and low-health retreat do not oscillate at their range thresholds', () => {
  const b = actor('bot:1', 200, 300), h = actor('human', 475, 300, false), memory = brain();
  botInput(b, [h], memory, 0.21, []); assert.equal(memory.mode, 'combat');
  h.x = 485; botInput(b, [h], memory, 0.21, []); assert.equal(memory.mode, 'combat');
  b.health = 20; h.x = 425; botInput(b, [h], memory, 0.21, []); assert.equal(memory.mode, 'retreat');
  h.x = 435; botInput(b, [h], memory, 0.21, []); assert.equal(memory.mode, 'retreat');
});

test('overlapping bots separate, respect walls, and do not push humans', () => {
  for (const start of [{ x: 500, y: 336 }, { x: 263.999, y: 280 },
    { x: ARENA.left + GAME.playerRadius, y: ARENA.top + GAME.playerRadius },
    { x: ARENA.right - GAME.playerRadius, y: ARENA.bottom - GAME.playerRadius }]) {
    const human = actor('human', start.x, start.y, false);
    const bots = Array.from({ length: 4 }, (_, i) => actor('bot:' + i, start.x, start.y));
    for (let step = 0; step < 30; step++) separateBots([human, ...bots], WALLS);
    assert.equal(human.x, start.x); assert.equal(human.y, start.y);
    for (const b of bots) {
      assert.ok(clearPoint(b, GAME.playerRadius, WALLS));
      for (const other of [human, ...bots]) if (other !== b) {
        assert.ok(Math.hypot(b.x - other.x, b.y - other.y) >= GAME.playerRadius * 2 - 0.01);
      }
    }
  }
});

test('navigation can leave a wall after collision or spacing pushes a bot against it', () => {
  for (const from of [{ x: 263.999, y: 280 }, { x: 360.001, y: 280 }]) {
    const path = route(from, { x: 480, y: 336 });
    assert.ok(path.length > 0);
  }
});

test('target death or disconnect clears search memory immediately', () => {
  for (const change of [{ health: 0 }, { connected: false }]) {
    const b = actor('bot:1', 200, 300), h = actor('human', 400, 300, false), memory = brain();
    botInput(b, [h], memory, 0.01, []);
    Object.assign(h, change);
    const input = botInput(b, [h], memory, 0.01, []);
    assert.equal(memory.mode, 'patrol'); assert.equal(memory.targetId, undefined);
    assert.equal(memory.lastSeen, undefined); assert.equal(input.fire, false);
  }
});

test('unreachable patrol destinations do not trigger pathfinding every tick', () => {
  const b = actor('bot:1', 200, 300), memory = brain();
  const walls = [{ x: 100, y: 200, width: 20, height: 200 }, { x: 300, y: 200, width: 20, height: 200 },
    { x: 100, y: 200, width: 220, height: 20 }, { x: 100, y: 380, width: 220, height: 20 }];
  botInput(b, [], memory, 0.01, walls);
  const remaining = memory.remaining;
  for (let i = 0; i < 10; i++) {
    const input = botInput(b, [], memory, 0.01, walls);
    assert.ok(Number.isFinite(input.moveX) && Number.isFinite(input.moveY));
    assert.equal(input.fire, false);
  }
  assert.ok(Math.abs(memory.remaining - (remaining - 0.1)) < 1e-8);
});

test('server tick keeps converging combat bots apart over time', () => {
  const world = new Practice({ walls: [], matchSeconds: 1000 }); world.add('human');
  const human = world.players.get('human')!;
  Object.assign(human, { x: 600, y: 400, health: 100000 });
  const bots = [...world.players.values()].filter(p => p.bot);
  bots.forEach(b => Object.assign(b, { x: 440, y: 400 }));
  for (let i = 0; i < 600; i++) {
    world.step(new Map(), 1 / 60);
    if (i < 10) continue;
    for (const b of bots) for (const other of bots) if (b !== other) {
      assert.ok(Math.hypot(b.x - other.x, b.y - other.y) >= GAME.playerRadius * 2 - 0.1);
    }
  }
});
