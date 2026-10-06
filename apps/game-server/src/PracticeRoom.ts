import { Room, ServerError, type Client } from '@colyseus/core';
import { Practice } from '@shootball/shared/practice';
import { CONFIG, type InputIntent } from '@shootball/shared';
import { VERSION, NETWORK, isInput, type InputMessage } from '@shootball/protocol';

interface Control {
  seq: number;
  input?: InputMessage;
  receivedAt: number;
  windowAt: number;
  count: number;
}
export class PracticeRoom extends Room {
  maxMessagesPerSecond = NETWORK.roomMaxMessagesPerSecond;
  protected world = new Practice();
  private controls = new Map<string, Control>();
  private accumulator = 0;

  onCreate(): void {
    this.maxClients = NETWORK.maxPlayers;
    this.onMessage('input', (client, data: unknown) => {
      if (!isInput(data) || !this.accept(client, data.seq)) return;
      const control = this.controls.get(client.sessionId)!;
      // A click survives later packets until the next tick, without a shot queue.
      control.input = { ...data, aim: { ...data.aim }, fire: data.fire || !!control.input?.fire, radar: data.radar || !!control.input?.radar };
      control.receivedAt = performance.now();
    });
    this.onMessage('*', () => {});
    let previous = performance.now();
    this.setSimulationInterval(() => {
      const current = performance.now();
      const delta = current - previous;
      previous = current;
      this.accumulator = Math.min(this.accumulator + delta, NETWORK.tickMs * CONFIG.simulation.maxCatchUpTicks);
      while (this.accumulator >= NETWORK.tickMs) {
        const inputs = new Map<string, InputIntent>();
        const now = performance.now();
        for (const [id, control] of this.controls) {
          if (control.input && now - control.receivedAt <= NETWORK.inputTimeoutMs) {
            inputs.set(id, { ...control.input });
            control.input.fire = false;
            control.input.radar = false;
          } else control.input = undefined;
        }
        this.world.step(inputs, NETWORK.tickMs / 1000);
        this.accumulator -= NETWORK.tickMs;
      }
    }, NETWORK.tickMs);
    this.patchRate = null;
    this.clock.setInterval(() => this.publish(), NETWORK.snapshotMs);
  }
  onAuth(_client: Client, options: unknown): boolean {
    if (!options || typeof options !== 'object' || !('version' in options) || options.version !== VERSION) {
      throw new ServerError(400, 'Protocol mismatch. Refresh the client.');
    }
    return true;
  }
  onJoin(client: Client): void {
    this.world.add(client.sessionId);
    this.newControl(client.sessionId);
    this.publish();
  }
  onDrop(client: Client): void {
    this.world.disconnect(client.sessionId);
    this.controls.delete(client.sessionId);
    this.allowReconnection(client, NETWORK.reconnectSeconds);
    this.publish();
  }
  onReconnect(client: Client): void {
    const player = this.world.players.get(client.sessionId);
    if (player) player.connected = true;
    this.newControl(client.sessionId);
    this.publish();
  }
  onLeave(client: Client): void {
    this.world.remove(client.sessionId);
    this.controls.delete(client.sessionId);
    this.publish();
  }
  private newControl(id: string): void {
    this.controls.set(id, { seq: -1, receivedAt: 0, windowAt: performance.now(), count: 0 });
  }
  private accept(client: Client, seq: number): boolean {
    const control = this.controls.get(client.sessionId);
    if (!control || seq <= control.seq) return false;
    const now = performance.now();
    if (now - control.windowAt >= 1000) { control.windowAt = now; control.count = 0; }
    if (++control.count > NETWORK.maxMessagesPerSecond) return false;
    control.seq = seq;
    return true;
  }
  private publish(): void { this.broadcast('snapshot', this.world.snapshot()); }
}
