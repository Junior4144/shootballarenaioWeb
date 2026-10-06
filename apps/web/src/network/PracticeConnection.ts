import { Client, type Room } from '@colyseus/sdk';
import { NETWORK, ROOM_NAME, VERSION, type Snapshot } from '@shootball/protocol';
import type { InputIntent } from '@shootball/shared';

export type ConnectionState = 'connecting' | 'connected' | 'reconnecting' | 'disconnected' | 'error';
export type PlayIdentity = { kind: 'guest' } | { kind: 'account'; userId: string; getToken: () => Promise<string> };
export function clearResumeTokens(storage?: Storage): void {
  try { for (let i = (storage?.length ?? 0) - 1; i >= 0; i--) {
    const key = storage!.key(i); if (key?.startsWith('shootball:v')) storage!.removeItem(key);
  } } catch { /* Storage is optional. */ }
}
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

  constructor(endpoint: string, private changed: () => void, private storage?: Storage, private identity: PlayIdentity = { kind: 'guest' }) {
    this.client = new Client(endpoint);
    this.storageKey = `shootball:v${VERSION}:${endpoint}:${identity.kind === 'guest' ? 'guest' : `account:${identity.userId}`}`;
  }
  get sessionId(): string | undefined { return this.room?.sessionId; }

  async join(): Promise<void> {
    if (this.state === 'connecting' || this.state === 'connected' || this.state === 'reconnecting') return;
    const attempt = ++this.attempt;
    this.setState('connecting', 'Connecting to PvP arena…');
    try {
      const accessToken = this.identity.kind === 'account' ? await this.identity.getToken() : undefined;
      if (attempt !== this.attempt) return;
      const token = this.readToken();
      const waitForRoom = (pending: Promise<Room>) => new Promise<Room>((resolve, reject) => {
        let expired = false;
        const timer = setTimeout(() => { expired = true; reject(new Error('Join timed out')); }, 15000);
        pending.then(room => {
          clearTimeout(timer);
          if (expired) { room.reconnection.enabled = false; void room.leave(); }
          else resolve(room);
        }, error => { clearTimeout(timer); reject(error); });
      });
      const joinFresh = () => waitForRoom(this.client.joinOrCreate(ROOM_NAME, { version: VERSION, mode: this.identity.kind, ...(accessToken ? { accessToken } : {}) }));
      let room: Room;
      if (token) {
        try { room = await waitForRoom(this.client.reconnect(token)); }
        catch (error) {
          if (attempt !== this.attempt) return;
          // A guest reservation dies with its room (including server restarts).
          // Recover once with a new guest, never downgrade account credentials.
          if (this.identity.kind !== 'guest') throw error;
          this.saveToken();
          this.setState('connecting', 'Previous guest session ended. Joining a new arena...');
          room = await joinFresh();
        }
      } else room = await joinFresh();
      if (attempt !== this.attempt) { void room.leave(); return; }
      this.room = room;
      this.sequence = 0;
      Object.assign(room.reconnection, { minUptime: 0, minDelay: NETWORK.reconnectMinDelayMs, maxDelay: NETWORK.reconnectMaxDelayMs, delay: NETWORK.reconnectMinDelayMs, maxRetries: NETWORK.reconnectMaxRetries, maxEnqueuedMessages: 0 });
      this.saveToken(room.reconnectionToken);
      room.onMessage('authError', () => {
        if (this.room !== room) return;
        this.endIdentity();
        this.setState('error', 'Account session ended. Return to accounts and log in again.');
      });
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
        void this.refreshAccount();
      }));
      room.onLeave(() => { if (this.room === room) this.finish('Disconnected. Join again.'); });
      room.onError(() => {
        if (this.room !== room) return;
        this.message = 'Connection error; waiting for recovery.';
        this.changed();
      });
      this.setState('connected', 'Connected');
      if (accessToken) room.send('refreshAuth', accessToken);
    } catch {
      if (attempt !== this.attempt) return;
      this.saveToken();
      this.snapshot = undefined;
      this.setState('error', this.identity.kind === 'account' ? 'Account join failed. Check your session and display name, then retry or return to accounts.' : 'Could not connect or resume. Check the game server, then retry.');
    }
  }
  send(input: InputIntent): void {
    if (this.state === 'connected') this.room?.send('input', { ...input, radar: input.radar ?? false, sprint: input.sprint ?? false, seq: this.sequence++ });
  }
  leave(): void {
    const room = this.room;
    if (room) { this.saveToken(room.reconnectionToken); room.reconnection.enabled = false; }
    ++this.attempt;
    this.finish(`Paused. Join within ${NETWORK.reconnectSeconds} seconds to resume; your avatar remains vulnerable.`, true);
    if (room) room.connection.close();
  }
  async refreshAccount(): Promise<void> {
    if (this.identity.kind !== 'account') return;
    const room = this.room;
    try {
      const token = await this.identity.getToken();
      if (room && this.room === room && this.state === 'connected') room.send('refreshAuth', token);
    } catch {
      if (room && this.room === room) {
        this.endIdentity();
        this.setState('error', 'Account session expired. Return to accounts and log in again.');
      }
    }
  }
  endIdentity(): void {
    const room = this.room;
    ++this.attempt;
    if (room) room.reconnection.enabled = false;
    this.finish('Choose how to play.');
    if (room) void room.leave();
    clearResumeTokens(this.storage);
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
