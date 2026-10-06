import type { Snapshot } from '@shootball/protocol';
import type { ArenaEvent } from '@shootball/shared/content';
/** Skip backlog on join/reconnect; process each authoritative event only once. */
export class EventCursor {
  private last = -1;
  private generation = -1;
  clear(): void { this.last = -1; this.generation = -1; }
  take(state: Snapshot): ArenaEvent[] {
    const newest = state.events.at(-1)?.id ?? this.last;
    if (this.last < 0 || state.generation !== this.generation) {
      this.last = Math.max(0, newest); this.generation = state.generation; return [];
    }
    const result = state.events.filter(e => e.id > this.last && state.time - e.time <= 0.5);
    this.last = Math.max(this.last, newest);
    return result;
  }
}
