import type { Snapshot } from '@shootball/protocol';

const DELAY_MS = 100;
const MAX_GAP_MS = 250;
const MAX_SNAPSHOTS = 12;
interface Frame { state: Snapshot; receivedAt: number }
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const angleLerp = (a: number, b: number, t: number) =>
  a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * t;

/** Presentation only: never modifies snapshots or invents gameplay results. */
export class SnapshotBuffer {
  private frames: Frame[] = [];

  clear(): void { this.frames = []; }

  push(state: Snapshot, receivedAt: number): void {
    const last = this.frames.at(-1);
    if (last?.state === state) return;
    if (last && (state.generation !== last.state.generation
      || state.tick < last.state.tick || receivedAt - last.receivedAt > MAX_GAP_MS)) {
      this.clear();
    }
    // Same-time messages contain newer lifecycle state; avoid a zero-length interval.
    if (this.frames.at(-1)?.receivedAt === receivedAt) this.frames.pop();
    this.frames.push({ state, receivedAt });
    if (this.frames.length > MAX_SNAPSHOTS) this.frames.shift();
  }

  sample(now: number): Snapshot | undefined {
    const time = now - DELAY_MS;
    while (this.frames.length > 2 && this.frames[1].receivedAt <= time) this.frames.shift();
    const from = this.frames[0];
    if (!from) return undefined;
    const to = this.frames[1];
    if (!to || time <= from.receivedAt) return from.state;
    if (time >= to.receivedAt) return to.state;
    const t = (time - from.receivedAt) / (to.receivedAt - from.receivedAt);
    const players = new Map(to.state.players.map(p => [p.id, p]));
    const shots = new Map(to.state.projectiles.map(p => [p.id, p]));
    return {
      ...from.state,
      players: from.state.players.map(p => {
        const next = players.get(p.id);
        if (!next || next.connected !== p.connected) return p;
        return { ...p, x: lerp(p.x, next.x, t), y: lerp(p.y, next.y, t), angle: angleLerp(p.angle, next.angle, t) };
      }),
      projectiles: from.state.projectiles.map(p => {
        const next = shots.get(p.id);
        return next ? { ...p, x: lerp(p.x, next.x, t), y: lerp(p.y, next.y, t) } : p;
      }),
    };
  }
}
