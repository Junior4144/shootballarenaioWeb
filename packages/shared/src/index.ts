export const ARENA = { left: 48, top: 80, right: 912, bottom: 592 } as const;
export const GAME = {
  width: 960, height: 640, playerRadius: 16, playerSpeed: 220,
  muzzleOffset: 28, shotRadius: 4, shotSpeed: 520, shotLifetime: 1.2,
  shotCooldown: 0.15, targetRadius: 20, targetHealth: 3,
} as const;

export interface Point { x: number; y: number }
export interface Player extends Point { angle: number }
export interface InputIntent { moveX: number; moveY: number; aim: Point; fire: boolean }
export interface Projectile extends Point { id: number; vx: number; vy: number; life: number }
export interface Target extends Point { id: number; health: number }
