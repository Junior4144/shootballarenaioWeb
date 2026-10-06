import { ARENA, GAME, type Point } from './index';
export interface Wall { x: number; y: number; width: number; height: number }
export const WALLS: readonly Wall[] = [
  { x: 280, y: 220, width: 64, height: 128 },
  { x: 616, y: 324, width: 64, height: 128 },
  { x: 432, y: 200, width: 96, height: 48 },
  { x: 432, y: 424, width: 96, height: 48 },
  { x: 168, y: 400, width: 80, height: 48 },
  { x: 712, y: 224, width: 80, height: 48 },
];
export const SPAWNS: Point[] = [
  { x: 144, y: 160 }, { x: 816, y: 512 }, { x: 816, y: 160 }, { x: 144, y: 512 },
  { x: 480, y: 128 }, { x: 480, y: 544 }, { x: 112, y: 336 }, { x: 848, y: 336 },
];
// Swept point against expanded rectangle. Conservative square hull for circles.
export function wallFraction(from: Point, to: Point, wall: Wall, radius: number): number | undefined {
  let entry = 0, exit = 1;
  for (const [start, delta, low, high] of [
    [from.x, to.x - from.x, wall.x - radius, wall.x + wall.width + radius],
    [from.y, to.y - from.y, wall.y - radius, wall.y + wall.height + radius],
  ]) {
    if (Math.abs(delta) < 1e-10) { if (start < low || start > high) return; }
    else {
      const a = (low - start) / delta, b = (high - start) / delta;
      entry = Math.max(entry, Math.min(a, b)); exit = Math.min(exit, Math.max(a, b));
      if (entry > exit) return;
    }
  }
  return entry;
}
export function firstWall(from: Point, to: Point, radius: number, walls: readonly Wall[] = WALLS): number {
  return Math.min(Infinity, ...walls.map(w => wallFraction(from, to, w, radius) ?? Infinity));
}
export function clearPoint(p: Point, radius: number, walls: readonly Wall[] = WALLS): boolean {
  return p.x >= ARENA.left + radius && p.x <= ARENA.right - radius && p.y >= ARENA.top + radius
    && p.y <= ARENA.bottom - radius && firstWall(p, p, radius, walls) === Infinity;
}
export function moveActor(p: Point, dx: number, dy: number, walls: readonly Wall[] = WALLS): void {
  const r = GAME.playerRadius;
  for (const axis of ['x', 'y'] as const) {
    const next = { ...p, [axis]: p[axis] + (axis === 'x' ? dx : dy) };
    next.x = Math.max(ARENA.left + r, Math.min(ARENA.right - r, next.x));
    next.y = Math.max(ARENA.top + r, Math.min(ARENA.bottom - r, next.y));
    const t = firstWall(p, next, r, walls);
    p[axis] += (next[axis] - p[axis]) * (t === Infinity ? 1 : Math.max(0, t - 0.001));
  }
}
// Visibility graph keeps navigation off expanded wall corners and out of cover.
export function route(from: Point, goal: Point, walls: readonly Wall[] = WALLS): Point[] {
  const r = GAME.playerRadius + 3;
  const nodes = [from, goal, ...walls.flatMap(w => [
    { x: w.x - r, y: w.y - r }, { x: w.x + w.width + r, y: w.y - r },
    { x: w.x - r, y: w.y + w.height + r }, { x: w.x + w.width + r, y: w.y + w.height + r },
  ]).filter(p => clearPoint(p, GAME.playerRadius, walls))];
  const distances = nodes.map(() => Infinity), previous = nodes.map(() => -1), visited = new Set<number>();
  distances[0] = 0;
  while (visited.size < nodes.length) {
    let current = -1;
    for (let i = 0; i < nodes.length; i++) if (!visited.has(i) && (current < 0 || distances[i] < distances[current])) current = i;
    if (current < 0 || distances[current] === Infinity) return [];
    if (current === 1) break;
    visited.add(current);
    for (let i = 1; i < nodes.length; i++) {
      if (visited.has(i) || firstWall(nodes[current], nodes[i], GAME.playerRadius + 1, walls) !== Infinity) continue;
      const cost = distances[current] + Math.hypot(nodes[current].x - nodes[i].x, nodes[current].y - nodes[i].y);
      if (cost < distances[i]) { distances[i] = cost; previous[i] = current; }
    }
  }
  const path: Point[] = [];
  for (let i = 1; i > 0; i = previous[i]) { if (previous[i] < 0) return []; path.unshift({ ...nodes[i] }); }
  return path;
}
