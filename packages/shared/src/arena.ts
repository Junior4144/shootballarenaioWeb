import { ARENA, GAME, type Point } from './index';
export interface Wall { x: number; y: number; width: number; height: number }
export const WALLS: readonly Wall[] = [
  { x: 280, y: 220, width: 64, height: 128 },
  { x: 616, y: 324, width: 64, height: 128 },
  { x: 432, y: 200, width: 96, height: 48 },
  { x: 432, y: 424, width: 96, height: 48 },
  { x: 168, y: 400, width: 80, height: 48 },
  { x: 712, y: 224, width: 80, height: 48 },
  { x: 1000, y: 200, width: 64, height: 128 },
  { x: 1120, y: 440, width: 112, height: 48 },
  { x: 880, y: 584, width: 64, height: 128 },
  { x: 576, y: 664, width: 128, height: 48 },
  { x: 280, y: 624, width: 64, height: 128 },
];
export const SPAWNS: Point[] = [
  { x: 144, y: 160 }, { x: 816, y: 512 }, { x: 816, y: 160 }, { x: 144, y: 512 },
  { x: 480, y: 128 }, { x: 480, y: 544 }, { x: 112, y: 336 }, { x: 848, y: 336 },
  { x: 1232, y: 160 }, { x: 1232, y: 752 }, { x: 1056, y: 624 },
  { x: 752, y: 784 }, { x: 144, y: 752 },
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
export function moveActor(p: Point, dx: number, dy: number, walls: readonly Wall[] = WALLS, slide = true): void {
  const r = GAME.playerRadius;
  const moveAxis = (axis: 'x' | 'y', amount: number) => {
    const start = p[axis];
    let contact: Wall | undefined;
    const next = { ...p, [axis]: start + amount };
    next.x = Math.max(ARENA.left + r, Math.min(ARENA.right - r, next.x));
    next.y = Math.max(ARENA.top + r, Math.min(ARENA.bottom - r, next.y));
    const other = axis === 'x' ? 'y' : 'x';
    const size = axis === 'x' ? 'width' : 'height';
    const otherSize = axis === 'x' ? 'height' : 'width';
    // Only block motion into a face. Tangent and outward motion remain free,
    // even when an actor starts exactly on the expanded wall boundary.
    for (const wall of walls) {
      if (p[other] <= wall[other] - r || p[other] >= wall[other] + wall[otherSize] + r) continue;
      const low = wall[axis] - r, high = wall[axis] + wall[size] + r;
      if (next[axis] > p[axis] && p[axis] <= low && next[axis] >= low) {
        next[axis] = Math.max(p[axis], low - 0.001); contact = wall;
      }
      if (next[axis] < p[axis] && p[axis] >= high && next[axis] <= high) {
        next[axis] = Math.min(p[axis], high + 0.001); contact = wall;
      }
    }
    p[axis] = next[axis];
    return { fraction: amount === 0 ? 1 : Math.min(1, Math.abs((p[axis] - start) / amount)), contact };
  };
  const x = moveAxis('x', dx), y = moveAxis('y', dy);
  if (!slide) return;
  const blockedX = x.fraction < 1 - 1e-8, blockedY = y.fraction < 1 - 1e-8;
  const speed = Math.hypot(dx, dy);
  // Redirect the remaining movement along the wall at full speed. Even a
  // straight-on push glides toward the nearer end instead of sticking.
  // Run the slide through collision checks too: adjoining walls still block it.
  if (blockedX && !blockedY) {
    const middle = x.contact ? x.contact.y + x.contact.height / 2 : (ARENA.top + ARENA.bottom) / 2;
    const direction = Math.sign(dy) || (p.y <= middle ? -1 : 1);
    moveAxis('y', direction * (speed - Math.abs(dy)) * (1 - x.fraction));
  } else if (blockedY && !blockedX) {
    const middle = y.contact ? y.contact.x + y.contact.width / 2 : (ARENA.left + ARENA.right) / 2;
    const direction = Math.sign(dx) || (p.x <= middle ? -1 : 1);
    moveAxis('x', direction * (speed - Math.abs(dx)) * (1 - y.fraction));
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
      // Collision can leave endpoints closer than the navigation safety margin.
      // Use the physical hull there so an actor pressed against cover can leave.
      const clearance = current === 0 || i === 1 ? GAME.playerRadius : GAME.playerRadius + 1;
      if (visited.has(i) || firstWall(nodes[current], nodes[i], clearance, walls) !== Infinity) continue;
      const cost = distances[current] + Math.hypot(nodes[current].x - nodes[i].x, nodes[current].y - nodes[i].y);
      if (cost < distances[i]) { distances[i] = cost; previous[i] = current; }
    }
  }
  const path: Point[] = [];
  for (let i = 1; i > 0; i = previous[i]) { if (previous[i] < 0) return []; path.unshift({ ...nodes[i] }); }
  return path;
}
