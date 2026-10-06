import { CONFIG } from './config';
import { validateConfig } from './config-validation';
export { CONFIG, type GameConfig } from './config';
export { validateConfig } from './config-validation';
const configErrors = validateConfig(CONFIG);
if (configErrors.length) throw new Error(`Invalid game config:\n${configErrors.join('\n')}`);
// Compatibility views. All editable values live in config.ts.
export const ARENA = {
  left: CONFIG.map.left, top: CONFIG.map.top,
  right: CONFIG.map.left + CONFIG.map.width, bottom: CONFIG.map.top + CONFIG.map.height,
};
export const GAME = {
  width: CONFIG.presentation.viewport.width, height: CONFIG.presentation.viewport.height,
  playerRadius: CONFIG.player.radius, playerSpeed: CONFIG.player.speed,
  muzzleOffset: CONFIG.projectile.muzzleOffset, shotRadius: CONFIG.projectile.radius,
  shotSpeed: CONFIG.weapons.basic.speed, shotLifetime: CONFIG.weapons.basic.life,
  playerHealth: CONFIG.player.health, shotDamage: CONFIG.weapons.basic.damage,
  respawnDelay: CONFIG.player.respawnSeconds, spawnProtection: CONFIG.player.spawnProtectionSeconds,
  shotCooldown: CONFIG.weapons.basic.cooldown,
  targetRadius: CONFIG.practiceTargets.radius, targetHealth: CONFIG.practiceTargets.health,
};

export interface Point { x: number; y: number }
export interface Player extends Point { angle: number }
export interface InputIntent { moveX: number; moveY: number; aim: Point; fire: boolean; radar?: boolean }
export interface Projectile extends Point { id: number; vx: number; vy: number; life: number }
export interface Target extends Point { id: number; health: number }
