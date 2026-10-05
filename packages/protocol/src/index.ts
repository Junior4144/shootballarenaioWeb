import { GAME, type InputIntent, type Player, type Projectile, type Target } from '@shootball/shared';

export const VERSION = 1;
export const ROOM_NAME = 'practice';
export const NETWORK = {
  maxPlayers: 8, tickMs: 1000 / 60, snapshotMs: 50, inputMs: 1000 / 30,
  inputTimeoutMs: 250, reconnectSeconds: 10, resetCooldownMs: 2000,
  maxMessagesPerSecond: 60, maxPayload: 1024,
} as const;
export interface InputMessage extends InputIntent { seq: number }
export interface ResetMessage { seq: number }
export interface NetworkPlayer extends Player { id: string; connected: boolean }
export interface NetworkProjectile extends Projectile { ownerId: string }
export interface Snapshot {
  tick: number;
  generation: number;
  players: NetworkPlayer[];
  projectiles: NetworkProjectile[];
  targets: Target[];
}
export const neutralInput = (): InputIntent => ({ moveX: 0, moveY: 0, aim: { x: 480, y: 336 }, fire: false });

function exact(value: unknown, keys: string[]): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).length === keys.length
    && keys.every(key => Object.hasOwn(value, key));
}
const seq = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
const axis = (value: unknown) => value === -1 || value === 0 || value === 1;
const bounded = (value: unknown, max: number) => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= max;
export function isInput(value: unknown): value is InputMessage {
  return exact(value, ['seq', 'moveX', 'moveY', 'aim', 'fire'])
    && seq(value.seq) && axis(value.moveX) && axis(value.moveY)
    && typeof value.fire === 'boolean' && exact(value.aim, ['x', 'y'])
    && bounded(value.aim.x, GAME.width) && bounded(value.aim.y, GAME.height);
}
export function isReset(value: unknown): value is ResetMessage {
  return exact(value, ['seq']) && seq(value.seq);
}
