import { GAME, type InputIntent, type Target } from '@shootball/shared';
import { LOOP, type ActorState, type Shot, type Pickup, type MatchState, type ArenaEvent } from '@shootball/shared/content';

export const VERSION = 3;
export const ROOM_NAME = 'arena';
export const NETWORK = {
  maxPlayers: 8, tickMs: 1000 / 60, snapshotMs: 50, inputMs: 1000 / 30,
  inputTimeoutMs: 250, reconnectSeconds: 10,
  maxMessagesPerSecond: 60, maxPayload: 1024,
} as const;
export interface InputMessage extends InputIntent { seq: number; radar: boolean }
export type NetworkPlayer = ActorState;
export type NetworkProjectile = Shot;
export interface Snapshot {
  time: number;
  match: MatchState;
  pickups: Pickup[];
  events: ArenaEvent[];
  tick: number;
  generation: number;
  players: NetworkPlayer[];
  projectiles: NetworkProjectile[];
  targets: Target[];
}
export const neutralInput = (): InputIntent => ({ moveX: 0, moveY: 0, aim: { x: 480, y: 336 }, fire: false, radar: false });

function exact(value: unknown, keys: string[]): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).length === keys.length
    && keys.every(key => Object.hasOwn(value, key));
}
const seq = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
const axis = (value: unknown) => value === -1 || value === 0 || value === 1;
const bounded = (value: unknown, max: number) => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= max;
export function isInput(value: unknown): value is InputMessage {
  return exact(value, ['seq', 'moveX', 'moveY', 'aim', 'fire', 'radar'])
    && seq(value.seq) && axis(value.moveX) && axis(value.moveY)
    && typeof value.radar === 'boolean' && typeof value.fire === 'boolean' && exact(value.aim, ['x', 'y'])
    && bounded(value.aim.x, GAME.width) && bounded(value.aim.y, GAME.height);
}

export const emptySnapshot = (): Snapshot => ({ tick: 0, generation: 0, time: 0, players: [], projectiles: [], targets: [], pickups: [], events: [],
  match: { round: 1, phase: 'playing', remaining: LOOP.matchSeconds, scoreLimit: LOOP.scoreLimit, winnerIds: [], standings: [] } });
