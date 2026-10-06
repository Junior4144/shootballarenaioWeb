import test from 'node:test';
import assert from 'node:assert/strict';
import { emptySnapshot } from '@shootball/protocol';
import { EventCursor } from '../src/network/EventCursor';
import { SnapshotBuffer } from '../src/network/SnapshotBuffer';

test('GL-E: feedback skips backlog, deduplicates and resets across reconnect/rematch', () => {
  const cursor = new EventCursor(); const s = emptySnapshot(); s.time = 1;
  const event = { id: 1, time: 1, kind: 'hit' as const, actorId: 'a', x: 100, y: 100 };
  s.events = [event]; assert.deepEqual(cursor.take(s), []);
  s.events.push({ ...event, id: 2 }); assert.equal(cursor.take(s).length, 1); assert.deepEqual(cursor.take(s), []);
  cursor.clear(); s.events.push({ ...event, id: 3 }); assert.deepEqual(cursor.take(s), []);
  s.generation++; s.events.push({ ...event, id: 4 }); assert.deepEqual(cursor.take(s), []);
  s.time = 4; s.events.push({ ...event, id: 5 }); assert.deepEqual(cursor.take(s), []);
});

test('GL-E: round resets clear the interpolation timeline and results remain authoritative', () => {
  const buffer = new SnapshotBuffer(); const old = emptySnapshot(); old.match.phase = 'results';
  buffer.push(old, 0); const next = emptySnapshot(); next.generation = 1; next.match.round = 2;
  buffer.push(next, 50); assert.equal(buffer.sample(50)!.match.round, 2); assert.equal(buffer.sample(50)!.match.phase, 'playing');
});
