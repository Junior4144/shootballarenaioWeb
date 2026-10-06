import { CONFIG, ARENA, type InputIntent, type Target } from '@shootball/shared';
import { LOOP, type ActorState, type Shot, type Pickup, type MatchState, type ArenaEvent } from '@shootball/shared/content';

export const VERSION = 5;
export const ROOM_NAME = 'arena';
export const NETWORK = CONFIG.network;
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
export const neutralInput = (): InputIntent => ({ moveX: 0, moveY: 0, aim: { x: CONFIG.map.left + CONFIG.map.width / 2, y: CONFIG.map.top + CONFIG.map.height / 2 }, fire: false, radar: false });

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
    && bounded(value.aim.x, ARENA.right) && bounded(value.aim.y, ARENA.bottom);
}

export const emptySnapshot = (): Snapshot => ({ tick: 0, generation: 0, time: 0, players: [], projectiles: [], targets: [], pickups: [], events: [],
  match: { round: 1, phase: 'playing', remaining: LOOP.matchSeconds, durationSeconds: LOOP.matchSeconds, scoreLimit: LOOP.scoreLimit, winCondition: CONFIG.match.winCondition, killsToWin: CONFIG.match.killsToWin, winnerIds: [], standings: [] } });
