import { ARENA, GAME, type InputIntent, type Player, type Point, type Projectile, type Target } from '@shootball/shared';

export interface World {
  player: Player;
  targets: Target[];
  projectiles: Projectile[];
  cooldown: number;
  nextId: number;
}

export function createWorld(): World {
  return {
    player: { x: 240, y: 336, angle: 0 },
    targets: [{ x: 530, y: 220 }, { x: 740, y: 220 }, { x: 530, y: 450 }, { x: 740, y: 450 }]
      .map((position, id) => ({ ...position, id, health: GAME.targetHealth })),
    projectiles: [], cooldown: 0, nextId: 0,
  };
}

const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));
const inside = (p: Point, r: number) => p.x >= ARENA.left + r && p.x <= ARENA.right - r && p.y >= ARENA.top + r && p.y <= ARENA.bottom - r;

// First contact along the segment, including shots that start inside a target.
function hitFraction(from: Point, to: Point, target: Point, radius: number): number | undefined {
  const dx = to.x - from.x, dy = to.y - from.y;
  const ox = from.x - target.x, oy = from.y - target.y;
  const c = ox * ox + oy * oy - radius * radius;
  if (c <= 0) return 0;
  const a = dx * dx + dy * dy;
  if (a === 0) return undefined;
  const b = 2 * (ox * dx + oy * dy);
  const discriminant = b * b - 4 * a * c;
  if (discriminant < 0) return undefined;
  const t = (-b - Math.sqrt(discriminant)) / (2 * a);
  return t >= 0 && t <= 1 ? t : undefined;
}

export function stepWorld(world: World, input: InputIntent, deltaSeconds: number): void {
  const dt = clamp(deltaSeconds, 0, 0.05);
  const p = world.player;
  const length = Math.max(1, Math.hypot(input.moveX, input.moveY));
  p.x = clamp(p.x + input.moveX / length * GAME.playerSpeed * dt, ARENA.left + GAME.playerRadius, ARENA.right - GAME.playerRadius);
  p.y = clamp(p.y + input.moveY / length * GAME.playerSpeed * dt, ARENA.top + GAME.playerRadius, ARENA.bottom - GAME.playerRadius);
  if (input.aim.x !== p.x || input.aim.y !== p.y) p.angle = Math.atan2(input.aim.y - p.y, input.aim.x - p.x);
  world.cooldown = Math.max(0, world.cooldown - dt);
  if (input.fire && world.cooldown <= 0) {
    const cos = Math.cos(p.angle), sin = Math.sin(p.angle);
    const shot = { id: world.nextId++, x: p.x + cos * GAME.muzzleOffset, y: p.y + sin * GAME.muzzleOffset, vx: cos * GAME.shotSpeed, vy: sin * GAME.shotSpeed, life: GAME.shotLifetime };
    if (inside(shot, GAME.shotRadius)) world.projectiles.push(shot);
    world.cooldown = GAME.shotCooldown;
  }
  world.projectiles = world.projectiles.filter(shot => {
    const travelTime = Math.min(dt, shot.life);
    const next = { x: shot.x + shot.vx * travelTime, y: shot.y + shot.vy * travelTime };
    let firstTarget: Target | undefined;
    let firstTime = Infinity;
    for (const target of world.targets) {
      if (target.health <= 0) continue;
      const t = hitFraction(shot, next, target, GAME.targetRadius + GAME.shotRadius);
      if (t !== undefined && t < firstTime) { firstTarget = target; firstTime = t; }
    }
    if (firstTarget) { firstTarget.health--; return false; }
    shot.x = next.x; shot.y = next.y; shot.life -= dt;
    return shot.life > 0 && inside(shot, GAME.shotRadius);
  });
  world.targets = world.targets.filter(target => target.health > 0);
}
