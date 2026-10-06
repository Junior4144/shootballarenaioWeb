import { CONFIG, type WinCondition } from './config';
import type { Player, Point, Projectile } from './index';
export type { PickupKind } from './config';
import type { PickupKind } from './config';
export const LOOP = {
  matchSeconds: CONFIG.match.durationSeconds, scoreLimit: CONFIG.match.scoreLimit, resultsSeconds: CONFIG.match.resultsSeconds,
  humanKillPoints: CONFIG.match.humanKillPoints, botKillPoints: CONFIG.match.npcKillPoints, orbPoints: CONFIG.match.orbPoints,
  radarCooldown: CONFIG.radar.cooldownSeconds, radarDuration: CONFIG.radar.durationSeconds, radarRange: CONFIG.radar.range,
  pickupRadius: CONFIG.pickups.collectRadius, speedDuration: CONFIG.pickups.speedDurationSeconds, speedMultiplier: CONFIG.pickups.speedMultiplier,
};
export const WEAPONS = CONFIG.weapons;
export type Weapon = keyof typeof WEAPONS;
export interface RadarMarker extends Point { id: string; kind: 'player' | 'bot' | PickupKind }
export interface RadarScan { remaining: number; origin: Point; markers: RadarMarker[] }
export interface ActorState extends Player {
  id: string; connected: boolean; bot: boolean;
  health: number; kills: number; botKills: number; deaths: number; points: number;
  respawnRemaining: number; protectionRemaining: number; lifeId: number;
  weapon: Weapon; ammo: number; speedRemaining: number; radarCooldown: number;
  radar: RadarScan;
}
export const createActor = (id: string, bot = false): ActorState => ({
  id, bot, connected: true, x: 0, y: 0, angle: 0,
  health: 0, kills: 0, botKills: 0, deaths: 0, points: 0,
  respawnRemaining: 0, protectionRemaining: 0, lifeId: 0,
  weapon: 'basic', ammo: 0, speedRemaining: 0, radarCooldown: 0,
  radar: { remaining: 0, origin: { x: 0, y: 0 }, markers: [] },
});
export interface Shot extends Projectile { ownerId: string; damage: number }
export interface Pickup extends Point {
  id: number; kind: PickupKind; available: boolean; respawnRemaining: number;
  dropped: boolean; lifetime: number;
}
export interface Standing { id: string; points: number; kills: number; botKills: number; deaths: number }
export interface MatchState {
  round: number; phase: 'playing' | 'results'; remaining: number;
  durationSeconds: number; scoreLimit: number; winCondition: WinCondition; killsToWin: number; winnerIds: string[]; standings: Standing[];
}
export interface ArenaEvent extends Point {
  id: number; time: number; kind: 'shot' | 'hit' | 'elimination' | 'pickup';
  actorId: string; targetId?: string; targetBot?: boolean; value?: number;
}
export const rankPlayers = <T extends Standing>(players: T[], mode: WinCondition = CONFIG.match.winCondition): T[] => [...players].sort((a, b) =>
  (mode === 'kills' ? b.kills - a.kills || b.points - a.points : b.points - a.points || b.kills - a.kills) || a.deaths - b.deaths || a.id.localeCompare(b.id));
