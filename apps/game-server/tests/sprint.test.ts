import test from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG, GAME, type InputIntent } from '@shootball/shared';
import { Practice } from '@shootball/shared/practice';
import { neutralInput } from '@shootball/protocol';

const settings = CONFIG.player.sprint;
function setup() {
  const world = new Practice({ bots: false, walls: [] });
  world.add('human'); world.pickups = [];
  const player = world.players.get('human')!;
  Object.assign(player, { x: 500, y: 500 });
  return { world, player };
}
function advance(world: Practice, seconds: number, input: InputIntent = neutralInput()) {
  for (let remaining = seconds; remaining > 1e-9; remaining -= 0.05) {
    world.step(new Map([['human', input]]), Math.min(0.05, remaining));
  }
}
const run = { ...neutralInput(), moveX: 1, sprint: true };

test('sprint is faster, drains stamina, stacks with pickups and normalizes diagonal movement', () => {
  for (const boosted of [false, true]) {
    const a = setup(), b = setup();
    if (boosted) a.player.speedRemaining = b.player.speedRemaining = 2;
    advance(a.world, 0.05, run);
    advance(b.world, 0.05, { ...run, moveY: 1 });
    const expected = GAME.playerSpeed * settings.speedMultiplier * (boosted ? CONFIG.pickups.speedMultiplier : 1) * 0.05;
    assert.ok(Math.abs(a.player.x - 500 - expected) < 1e-8);
    assert.ok(Math.abs(Math.hypot(b.player.x - 500, b.player.y - 500) - expected) < 1e-8);
    assert.equal(a.player.stamina, settings.maxStamina - settings.drainPerSecond * 0.05);
    assert.equal(a.player.sprinting, true);
  }
});

test('release or missing input stops sprint and regeneration waits for its delay', () => {
  const { world, player } = setup();
  advance(world, 0.5, run);
  const drained = player.stamina;
  world.step(new Map(), 0.05);
  assert.equal(player.sprinting, false);
  advance(world, settings.regenDelaySeconds - 0.05);
  assert.ok(Math.abs(player.stamina - drained) < 1e-8);
  advance(world, 0.5);
  assert.ok(Math.abs(player.stamina - (drained + settings.regenPerSecond * 0.5)) < 1e-8);
  advance(world, 10, { ...neutralInput(), sprint: true });
  assert.equal(player.stamina, settings.maxStamina, 'Shift alone does not drain stamina');
  assert.equal(player.sprinting, false);
});

test('exhaustion clamps stamina and prevents repeated free sprint bursts while recovering', () => {
  const { world, player } = setup();
  player.stamina = settings.drainPerSecond * 0.01;
  advance(world, 0.05, run);
  const expected = GAME.playerSpeed * (0.04 + 0.01 * settings.speedMultiplier);
  assert.ok(Math.abs(player.x - 500 - expected) < 1e-8, 'partial stamina only grants a partial sprint tick');
  assert.equal(player.stamina, 0); assert.equal(player.sprinting, false);
  advance(world, settings.regenDelaySeconds + 0.5, run);
  assert.equal(player.sprinting, false);
  assert.ok(player.stamina < settings.resumeStamina);
  advance(world, 2);
  advance(world, 0.05, run);
  assert.equal(player.sprinting, true);
});

test('disconnect, death, respawn and results clear sprint state', () => {
  const { world, player } = setup();
  advance(world, 0.1, run);
  const stamina = player.stamina;
  world.disconnect('human'); advance(world, 0.1, run);
  assert.equal(player.sprinting, false); assert.equal(player.stamina, stamina);
  player.connected = true; player.health = 0; player.respawnRemaining = 0.1;
  advance(world, 0.05, run); assert.equal(player.sprinting, false);
  advance(world, 0.05); assert.equal(player.stamina, settings.maxStamina);
  advance(world, 0.05, run); player.points = CONFIG.match.scoreLimit;
  advance(world, 0.05, run);
  assert.equal(world.match.phase, 'results'); assert.equal(player.sprinting, false);
  assert.equal('staminaDelay' in world.snapshot().players[0], false);
});
