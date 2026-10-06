import { Room, ServerError, type Client } from '@colyseus/core';
import { Practice } from '@shootball/shared/practice';
import { CONFIG, type InputIntent } from '@shootball/shared';
import { VERSION, NETWORK, isInput, type InputMessage } from '@shootball/protocol';
import { authenticate, verifyAccount, type Identity, type VerifyAccount } from './accountAuth';

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
  protected verifyAccount: VerifyAccount = verifyAccount;
  private identities = new Map<string, Identity>();
  private publicIdentities = new Map<string, { kind: 'guest' | 'account'; displayName?: string }>();
  private refreshing = new Set<string>();

  onCreate(): void {
    this.maxClients = NETWORK.maxPlayers;
    this.onMessage('refreshAuth', (client, token: unknown) => { void this.refreshAuth(client, token); });
    this.clock.setInterval(() => {
      for (const client of this.clients) {
        const identity = this.identities.get(client.sessionId);
        if (identity?.kind === 'account' && identity.expiresAt <= Date.now()) this.rejectAccount(client);
      }
    }, 500);
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
          const identity = this.identities.get(id);
          if (identity && (identity.kind === 'guest' || identity.expiresAt > Date.now()) && control.input && now - control.receivedAt <= NETWORK.inputTimeoutMs) {
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
  async onAuth(_client: Client, options: unknown): Promise<Identity> {
    if (!options || typeof options !== 'object' || !('version' in options) || options.version !== VERSION) {
      throw new ServerError(400, 'Protocol mismatch. Refresh the client.');
    }
    return authenticate(options, this.verifyAccount);
  }
  onJoin(client: Client, _options: unknown, identity: Identity): void {
    this.identities.set(client.sessionId, identity);
    this.publicIdentities.set(client.sessionId, identity.kind === 'account' ? { kind: 'account', displayName: identity.displayName } : { kind: 'guest' });
    this.world.add(client.sessionId);
    this.newControl(client.sessionId);
    this.publish();
  }
  onDrop(client: Client): void {
    const identity = this.identities.get(client.sessionId);
    if (!identity || (identity.kind === 'account' && identity.expiresAt <= Date.now())) return;
    this.world.disconnect(client.sessionId);
    this.controls.delete(client.sessionId);
    const seconds = identity.kind === 'guest' ? NETWORK.reconnectSeconds : Math.min(NETWORK.reconnectSeconds, (identity.expiresAt - Date.now()) / 1000);
    void this.allowReconnection(client, seconds).catch(() => { /* Expiry/disposal completes onLeave. */ });
    this.publish();
  }
  async onReconnect(client: Client): Promise<void> {
    const identity = this.identities.get(client.sessionId);
    if (!identity) throw new ServerError(401, 'Session ended.');
    if (identity.kind === 'account') {
      const verified = await this.verifyAccount(identity.token);
      if (this.identities.get(client.sessionId) !== identity || verified.userId !== identity.userId || verified.expiresAt <= Date.now()) throw new ServerError(401, 'Session expired.');
      this.identities.set(client.sessionId, verified);
    }
    const player = this.world.players.get(client.sessionId);
    if (player) player.connected = true;
    this.newControl(client.sessionId);
    this.publish();
  }
  onLeave(client: Client): void {
    this.identities.delete(client.sessionId);
    this.refreshing.delete(client.sessionId);
    this.world.remove(client.sessionId);
    this.controls.delete(client.sessionId);
    this.publish();
  }
  private newControl(id: string): void {
    this.controls.set(id, { seq: -1, receivedAt: 0, windowAt: performance.now(), count: 0 });
  }
  private accept(client: Client, seq: number): boolean {
    const identity = this.identities.get(client.sessionId);
    if (!identity || (identity.kind === 'account' && identity.expiresAt <= Date.now())) return false;
    const control = this.controls.get(client.sessionId);
    if (!control || seq <= control.seq) return false;
    const now = performance.now();
    if (now - control.windowAt >= 1000) { control.windowAt = now; control.count = 0; }
    if (++control.count > NETWORK.maxMessagesPerSecond) return false;
    control.seq = seq;
    return true;
  }
  private rejectAccount(client: Client): void {
    this.controls.delete(client.sessionId);
    this.identities.delete(client.sessionId);
    client.send('authError', 'Account session ended. Return to accounts and log in again.');
    client.leave(4001);
  }
  private async refreshAuth(client: Client, token: unknown): Promise<void> {
    const previous = this.identities.get(client.sessionId);
    if (previous?.kind !== 'account' || typeof token !== 'string' || !token || token.length > 16000) { this.rejectAccount(client); return; }
    if (this.refreshing.has(client.sessionId) || token === previous.token) return;
    this.refreshing.add(client.sessionId);
    try {
      const next = await this.verifyAccount(token);
      if (this.identities.get(client.sessionId) !== previous) return;
      if (next.userId !== previous.userId) { this.rejectAccount(client); return; }
      this.identities.set(client.sessionId, next);
      this.publicIdentities.set(client.sessionId, { kind: 'account', displayName: next.displayName });
    } catch { if (this.identities.get(client.sessionId) === previous) this.rejectAccount(client); }
    finally { this.refreshing.delete(client.sessionId); }
  }
  private publish(): void {
    const snapshot = this.world.snapshot();
    // Explicit projection: UUIDs, email addresses and tokens never enter gameplay snapshots.
    const referenced = new Set([...snapshot.players.map(p => p.id), ...snapshot.match.standings.map(p => p.id), ...snapshot.events.flatMap(e => [e.actorId, e.targetId])]);
    for (const id of this.publicIdentities.keys()) if (!referenced.has(id)) this.publicIdentities.delete(id);
    const identities = Object.fromEntries(this.publicIdentities);
    this.broadcast('snapshot', { ...snapshot, identities });
  }
}
