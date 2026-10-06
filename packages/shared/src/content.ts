import type { Player, Point, Projectile } from './index';

export const LOOP = {
  matchSeconds: 300, scoreLimit: 1000, resultsSeconds: 10,
  humanKillPoints: 100, botKillPoints: 20, orbPoints: 5,
  radarCooldown: 12, radarDuration: 3, radarRange: 360,
  pickupRadius: 28, speedDuration: 6, speedMultiplier: 1.25,
} as const;
export const WEAPONS = {
  basic: { damage: 25, cooldown: 0.15, speed: 520, life: 1.2, pellets: 1, spread: 0, ammo: 0 },
  shotgun: { damage: 12, cooldown: 0.6, speed: 450, life: 0.65, pellets: 5, spread: 0.24, ammo: 8 },
  heavy: { damage: 50, cooldown: 0.55, speed: 650, life: 1, pellets: 1, spread: 0, ammo: 6 },
} as const;
export type Weapon = keyof typeof WEAPONS;
export type PickupKind = 'score' | 'shotgun' | 'heavy' | 'speed' | 'health';
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
  scoreLimit: number; winnerIds: string[]; standings: Standing[];
}
export interface ArenaEvent extends Point {
  id: number; time: number; kind: 'shot' | 'hit' | 'elimination' | 'pickup';
  actorId: string; targetId?: string; targetBot?: boolean; value?: number;
}
export const rankPlayers = <T extends Standing>(players: T[]): T[] => [...players].sort((a, b) =>
  b.points - a.points || b.kills - a.kills || a.deaths - b.deaths || a.id.localeCompare(b.id));
