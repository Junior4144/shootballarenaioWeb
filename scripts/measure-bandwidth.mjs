import { observeSnapshots } from '@shootball/protocol';
// Usage: node --import tsx scripts/measure-bandwidth.mjs <game-server-url> [seconds=60]
// Joins one public guest session and measures received application payloads.
import { writeFile } from 'node:fs/promises';
import WebSocket from 'ws';
import { ROOM_NAME, VERSION } from '@shootball/protocol';
import { getMessageBytes, Protocol } from '@colyseus/core';

let endpoint = process.argv[2];
const seconds = Number(process.argv[3] ?? 60);
if (!endpoint || !Number.isFinite(seconds) || seconds < 1 || seconds > 300) {
  throw new Error('Usage: node --import tsx scripts/measure-bandwidth.mjs <game-server-url> [seconds=60; max=300]');
}
// Use ws so negotiated compression extensions are available for the report.
globalThis.WebSocket = WebSocket;
const { Client } = await import('@colyseus/sdk');
let room;
let localServer;
let progress;
const deadline = setTimeout(() => {
  console.error('Measurement timed out');
  room?.connection.close();
  process.exit(1);
}, (seconds + 30) * 1000);
try {
  if (endpoint === '--local') {
    const { createServer } = await import('../apps/game-server/src/server.ts');
    localServer = createServer();
    await localServer.listen(0, '127.0.0.1');
    endpoint = `ws://127.0.0.1:${localServer.transport.server.address().port}`;
  }
  room = await new Client(endpoint).joinOrCreate(ROOM_NAME, { mode: 'guest', version: VERSION });
  room.reconnection.enabled = false;
  const frames = [];
  const snapshots = [];
  let currentFrame;
  let previous;
  let unchangedTopLevelFields = 0;
  let comparedTopLevelFields = 0;
  let equivalentFullSnapshotBytes = 0;
  let initialStatePayloadBytes = 0;
  const field = 'respawnRemaining';
  const started = performance.now();
  const original = room.connection.events.onmessage;
  room.connection.events.onmessage = event => {
    const bytes = Buffer.from(event.data);
    if (bytes[0] === Protocol.ROOM_STATE) {
      initialStatePayloadBytes += bytes.byteLength;
      currentFrame = undefined;
      original(event);
      return;
    }
    currentFrame = {
      at: performance.now() - started,
      bytes: bytes.byteLength,
      repeatedFieldOccurrences: bytes.toString('latin1').split(field).length - 1,
    };
    frames.push(currentFrame);
    original(event);
  };
  observeSnapshots(room, snapshot => {
    if (!currentFrame) return; // Exclude initial state, matching the steady-state baseline.
    equivalentFullSnapshotBytes += getMessageBytes.raw(Protocol.ROOM_DATA, 'snapshot', snapshot).byteLength;
    snapshots.push({
      ...currentFrame,
      humans: snapshot.players.filter(p => !p.bot).length,
      bots: snapshot.players.filter(p => p.bot).length,
      keys: Object.keys(snapshot),
    });
    if (previous) for (const key of Object.keys(snapshot)) {
      comparedTopLevelFields++;
      if (JSON.stringify(snapshot[key]) === JSON.stringify(previous[key])) unchangedTopLevelFields++;
    }
    previous = snapshot;
  });
  room.onError((code, message) => console.error('Room error:', code, message));
  console.log(`Joined as one idle guest; measuring for ${seconds}s.`);
  progress = setInterval(() => console.log(`${Math.round((performance.now() - started) / 1000)}s: ${snapshots.length} snapshots`), 15000);
  await new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, seconds * 1000);
    room.onLeave(code => { clearTimeout(timer); reject(new Error(`Room closed early (${code})`)); });
  });
  const elapsedSeconds = (performance.now() - started) / 1000;
  if (!snapshots.length) throw new Error('No snapshots received');
  const totalBytes = frames.reduce((sum, frame) => sum + frame.bytes, 0);
  const snapshotBytes = snapshots.reduce((sum, frame) => sum + frame.bytes, 0);
  const report = {
    measuredAt: new Date().toISOString(), endpoint, protocolVersion: VERSION,
    scenario: 'One test guest, idle, no movement/fire input; regular joinOrCreate matchmaking',
    elapsedSeconds,
    receivedMessages: frames.length, snapshots: snapshots.length,
    snapshotsPerSecond: snapshots.length / elapsedSeconds,
    snapshotBytes: { min: Math.min(...snapshots.map(s => s.bytes)), mean: snapshotBytes / snapshots.length, max: Math.max(...snapshots.map(s => s.bytes)) },
    totalReceivedPayloadBytes: totalBytes,
    initialStatePayloadBytes,
    receivedKBPerSecond: totalBytes / elapsedSeconds / 1000,
    projectedMBPerMinute: totalBytes / elapsedSeconds * 60 / 1e6,
    equivalentFullSnapshotMBPerMinute: equivalentFullSnapshotBytes / elapsedSeconds * 60 / 1e6,
    reductionVersusSameStateFullSnapshotsPercent: (1 - totalBytes / equivalentFullSnapshotBytes) * 100,
    humanPlayers: { min: Math.min(...snapshots.map(s => s.humans)), max: Math.max(...snapshots.map(s => s.humans)) },
    botPlayers: { min: Math.min(...snapshots.map(s => s.bots)), max: Math.max(...snapshots.map(s => s.bots)) },
    snapshotFields: snapshots[0].keys,
    repeatedField: field,
    snapshotsContainingRepeatedField: snapshots.filter(s => s.repeatedFieldOccurrences > 0).length,
    repeatedFieldOccurrences: snapshots.reduce((sum, s) => sum + s.repeatedFieldOccurrences, 0),
    unchangedTopLevelFieldComparisons: unchangedTopLevelFields,
    totalTopLevelFieldComparisons: comparedTopLevelFields,
    negotiatedWebSocketExtensions: room.connection.transport.ws.extensions || '(none)',
    limitations: 'WebSocket message payload bytes, including Colyseus envelope; excludes initial join, assets, outbound traffic, WebSocket/TLS/TCP overhead. Not a physical mobile or carrier measurement.',
  };
  console.log(JSON.stringify(report, null, 2));
  if (process.env.BANDWIDTH_REPORT) await writeFile(process.env.BANDWIDTH_REPORT, JSON.stringify(report, null, 2) + '\n');
} finally {
  clearInterval(progress);
  if (room) await room.leave();
  if (localServer) await localServer.gracefullyShutdown(false);
  clearTimeout(deadline);
}
