import test from 'node:test';
import assert from 'node:assert/strict';
import { Encoder, Decoder } from '@colyseus/schema';
import { ArenaState, updateArenaState, snapshotFromState, emptySnapshot, type Snapshot } from '@shootball/protocol';
import { createActor } from '@shootball/shared/content';
import { SnapshotBuffer } from '../../web/src/network/SnapshotBuffer';
import { Practice } from '@shootball/shared/practice';

test('Schema patches preserve exact public state, lifecycle, optional fields and old interpolation frames', () => {
  const state = new ArenaState();
  const encoder = new Encoder(state);
  const mirror = new ArenaState();
  const decoder = new Decoder(mirror);
  const snapshot: Snapshot = {
    ...emptySnapshot(), identities: { a: { kind: 'account', displayName: 'Pilot' } },
    players: [{ ...createActor('a'), x: 240, health: 100 }, createActor('b')],
    projectiles: [{ id: 1, x: 268, y: 0, vx: 520, vy: 0, life: 1, ownerId: 'a', damage: 25 }],
    events: [{ id: 1, x: 0, y: 0, time: 0, kind: 'hit', actorId: 'a', targetId: 'b', targetBot: false, value: 25 }],
  };
  updateArenaState(state, snapshot);
  decoder.decode(encoder.encodeAll());
  encoder.discardChanges();
  const before = snapshotFromState(mirror);
  assert.deepEqual(before, snapshot);
  const frozen = structuredClone(before);
  const originalPlayer = state.players.get('a');
  const buffer = new SnapshotBuffer();
  buffer.push(before, 0);
  snapshot.tick = 3; snapshot.time = .05; snapshot.players[0].x = 251;
  snapshot.projectiles[0].x = 279;
  snapshot.players[0].radar.markers.push({ id: 'b', kind: 'player', x: 10, y: 20 });
  updateArenaState(state, snapshot);
  assert.equal(state.players.get('a'), originalPlayer);
  const patch = Uint8Array.from(encoder.encode());
  assert.ok(patch.byteLength < encoder.encodeAll().byteLength / 2);
  decoder.decode(patch); encoder.discardChanges();
  const after = snapshotFromState(mirror);
  assert.deepEqual(after, snapshot);
  assert.deepEqual(before, frozen, 'later patches cannot mutate saved frames');
  buffer.push(after, 50);
  assert.equal(buffer.sample(125)!.players[0].x, 245.5);
  // Reorder persistent players; delete and add entities; clear optional fields.
  snapshot.players.reverse();
  snapshot.projectiles = [];
  snapshot.events = [{ id: 1, x: 0, y: 0, time: 0, kind: 'shot', actorId: 'a' }];
  snapshot.identities = { a: { kind: 'guest' } };
  snapshot.match.standings = [{ id: 'b', points: 2, kills: 0, botKills: 0, deaths: 0 }, { id: 'a', points: 1, kills: 0, botKills: 0, deaths: 0 }];
  updateArenaState(state, snapshot);
  decoder.decode(encoder.encode()); encoder.discardChanges();
  assert.deepEqual(snapshotFromState(mirror), snapshot);
  snapshot.players.splice(0, 1); snapshot.events = []; snapshot.identities = {};
  snapshot.match.standings.reverse(); snapshot.match.winnerIds = ['a'];
  updateArenaState(state, snapshot);
  decoder.decode(encoder.encode()); encoder.discardChanges();
  assert.deepEqual(snapshotFromState(mirror), snapshot);
  updateArenaState(state, snapshot);
  assert.equal(encoder.encode().byteLength, 0, 'unchanged state emits no patch');
});

test('batched joins, disconnects and bot replacements decode to the exact simulation state', () => {
  const world = new Practice();
  world.add('observer');
  const state = new ArenaState(), mirror = new ArenaState();
  const encoder = new Encoder(state), decoder = new Decoder(mirror);
  const sync = () => {
    const snapshot = { ...world.snapshot(), identities: {} };
    updateArenaState(state, snapshot);
    return snapshot;
  };
  sync(); decoder.decode(encoder.encodeAll()); encoder.discardChanges();
  for (let i = 0; i < 30; i++) {
    world.add(`guest:${i}`); sync();
    if (i > 0) { world.disconnect(`guest:${i - 1}`); sync(); }
    if (i > 1) { world.remove(`guest:${i - 2}`); sync(); }
    world.step(new Map(), 1 / 60);
    const expected = sync();
    // A late join can receive full state before pending mutations are flushed.
    const late = new ArenaState(), lateDecoder = new Decoder(late);
    lateDecoder.decode(encoder.encodeAll());
    const patch = Uint8Array.from(encoder.encode());
    lateDecoder.decode(patch);
    assert.deepEqual(snapshotFromState(late), expected, `late join batch ${i}`);
    decoder.decode(patch); encoder.discardChanges();
    assert.deepEqual(snapshotFromState(mirror), expected, `lifecycle batch ${i}`);
  }
});
