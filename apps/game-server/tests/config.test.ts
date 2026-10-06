import test from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG, validateConfig } from '@shootball/shared';
import { Practice } from '@shootball/shared/practice';

test('default config is valid; editor drafts reject invalid timing and map layouts', () => {
  assert.deepEqual(validateConfig(CONFIG), []);
  const draft = structuredClone(CONFIG);
  draft.network.tickMs = 1000;
  draft.map.spawns = [];
  draft.map.gridSize = 0;
  draft.player.health = NaN;
  draft.weapons.shotgun.pellets = 1.5;
  const errors = validateConfig(draft);
  for (const path of ['network.tickMs', 'map.spawns', 'map.gridSize', 'player.health', 'weapons.shotgun.pellets']) {
    assert.ok(errors.some(error => error.includes(path)), path);
  }
});

test('kills mode ignores points and NPC kills, ends on PvP kills, and preserves rules after rematch', () => {
  const world = new Practice({ bots: false, walls: [], winCondition: 'kills', killsToWin: 2, resultsSeconds: 0.01 });
  world.add('a'); world.add('b');
  const a = world.players.get('a')!, b = world.players.get('b')!;
  a.points = 10000; a.botKills = 100;
  world.step(new Map(), 0.01);
  assert.equal(world.match.phase, 'playing');
  b.kills = 2;
  world.step(new Map(), 0.01);
  assert.equal(world.match.phase, 'results');
  assert.deepEqual(world.match.winnerIds, ['b']);
  assert.equal(world.match.standings[0].id, 'b');
  world.step(new Map(), 0.02);
  assert.equal(world.match.phase, 'playing');
  assert.equal(world.match.winCondition, 'kills');
  assert.equal(world.match.killsToWin, 2);
  assert.equal(b.kills, 0);
});

test('kills-mode timeout draws on equal kills regardless of points', () => {
  const world = new Practice({ bots: false, winCondition: 'kills', matchSeconds: 0.01 });
  world.add('a'); world.add('b');
  world.players.get('a')!.kills = 1;
  world.players.get('b')!.kills = 1;
  world.players.get('b')!.points = 500;
  world.step(new Map(), 0.01);
  assert.deepEqual(new Set(world.match.winnerIds), new Set(['a', 'b']));
});

test('point mode does not end early on the kill target', () => {
  const world = new Practice({ bots: false, winCondition: 'points', scoreLimit: 100 });
  world.add('a');
  const player = world.players.get('a')!;
  player.kills = CONFIG.match.killsToWin;
  world.step(new Map(), 0.01);
  assert.equal(world.match.phase, 'playing');
  player.points = 100;
  world.step(new Map(), 0.01);
  assert.deepEqual(world.match.winnerIds, ['a']);
});
