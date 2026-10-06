import { Client, type Room } from '@colyseus/sdk';
import { NETWORK, ROOM_NAME, VERSION, type Snapshot } from '@shootball/protocol';
import type { InputIntent } from '@shootball/shared';

export type ConnectionState = 'connecting' | 'connected' | 'reconnecting' | 'disconnected' | 'error';
export class PracticeConnection {
  state: ConnectionState = 'disconnected';
  message = 'Disconnected';
  snapshot?: Snapshot;
  room?: Room;
  private client: Client;
  private sequence = 0;
  private attempt = 0;
  private deadline?: ReturnType<typeof setTimeout>;
  private storageKey: string;
  private token?: string;

  constructor(endpoint: string, private changed: () => void, private storage?: Storage) {
    this.client = new Client(endpoint);
    this.storageKey = `shootball:v${VERSION}:${endpoint}`;
  }
  get sessionId(): string | undefined { return this.room?.sessionId; }

  async join(): Promise<void> {
    if (this.state === 'connecting' || this.state === 'connected' || this.state === 'reconnecting') return;
    const attempt = ++this.attempt;
    this.setState('connecting', 'Connecting to PvP arena…');
    try {
      const token = this.readToken();
      const room = token
        ? await this.client.reconnect(token)
        : await this.client.joinOrCreate(ROOM_NAME, { version: VERSION });
      if (attempt !== this.attempt) { void room.leave(); return; }
      this.room = room;
      this.sequence = 0;
      Object.assign(room.reconnection, { minUptime: 0, minDelay: NETWORK.reconnectMinDelayMs, maxDelay: NETWORK.reconnectMaxDelayMs, delay: NETWORK.reconnectMinDelayMs, maxRetries: NETWORK.reconnectMaxRetries, maxEnqueuedMessages: 0 });
      this.saveToken(room.reconnectionToken);
      room.onMessage<Snapshot>('snapshot', snapshot => {
        if (this.room !== room) return;
        this.snapshot = snapshot;
        this.changed();
      });
      room.onDrop(() => {
        if (this.room !== room) return;
        this.setState('reconnecting', `Connection lost — reconnecting (up to ${NETWORK.reconnectSeconds} seconds)…`);
        this.deadline = setTimeout(() => {
          if (this.room !== room) return;
          room.reconnection.enabled = false;
          this.finish('Connection expired. Join again.');
          void room.leave();
        }, NETWORK.reconnectSeconds * 1000);
      });
      // SDK rotates its token immediately after invoking onReconnect.
      room.onReconnect(() => queueMicrotask(() => {
        if (this.room !== room) return;
        clearTimeout(this.deadline);
        this.sequence = 0;
        this.saveToken(room.reconnectionToken);
        this.setState('connected', 'Connected');
      }));
      room.onLeave(() => { if (this.room === room) this.finish('Disconnected. Join again.'); });
      room.onError(() => {
        if (this.room !== room) return;
        this.message = 'Connection error; waiting for recovery.';
        this.changed();
      });
      this.setState('connected', 'Connected');
    } catch {
      if (attempt !== this.attempt) return;
      this.saveToken();
      this.snapshot = undefined;
      this.setState('error', 'Could not connect or resume. Check the game server, then retry.');
    }
  }
  send(input: InputIntent): void {
    if (this.state === 'connected') this.room?.send('input', { ...input, radar: input.radar ?? false, seq: this.sequence++ });
  }
  leave(): void {
    const room = this.room;
    if (room) { this.saveToken(room.reconnectionToken); room.reconnection.enabled = false; }
    ++this.attempt;
    this.finish(`Paused. Join within ${NETWORK.reconnectSeconds} seconds to resume; your avatar remains vulnerable.`, true);
    if (room) room.connection.close();
  }
  private finish(message: string, retainToken = false): void {
    clearTimeout(this.deadline);
    this.room = undefined;
    this.snapshot = undefined;
    if (!retainToken) this.saveToken();
    this.setState('disconnected', message);
  }
  private setState(state: ConnectionState, message: string): void {
    this.state = state;
    this.message = message;
    this.changed();
  }
  private readToken(): string | undefined {
    try { return this.token ?? this.storage?.getItem(this.storageKey) ?? undefined; } catch { return undefined; }
  }
  private saveToken(token?: string): void {
    this.token = token;
    try {
      if (token) this.storage?.setItem(this.storageKey, token);
      else this.storage?.removeItem(this.storageKey);
    } catch { /* Private browsing can disable storage; live reconnect still works. */ }
  }
}
