import type { InputIntent, Point } from './index';
import type { ActorState } from './content';
import { firstWall, route, type Wall } from './arena';
export interface BotBrain { remaining: number; path: Point[]; targetId?: string }
export function botInput(bot: ActorState, humans: ActorState[], brain: BotBrain, dt: number, walls: readonly Wall[]): InputIntent {
  const target = humans.filter(p => p.health > 0).sort((a, b) =>
    Math.hypot(a.x - bot.x, a.y - bot.y) - Math.hypot(b.x - bot.x, b.y - bot.y) || a.id.localeCompare(b.id))[0];
  if (!target) return { moveX: 0, moveY: 0, aim: bot, fire: false };
  brain.remaining -= dt;
  if (brain.remaining <= 0 || target.id !== brain.targetId) {
    brain.remaining = 0.6; brain.targetId = target.id; brain.path = route(bot, target, walls);
  }
  while (brain.path.length && Math.hypot(brain.path[0].x - bot.x, brain.path[0].y - bot.y) < 10) brain.path.shift();
  const visible = firstWall(bot, target, 4, walls) === Infinity;
  const distance = Math.hypot(target.x - bot.x, target.y - bot.y);
  const waypoint = visible ? target : brain.path[0] ?? bot;
  const dx = waypoint.x - bot.x, dy = waypoint.y - bot.y, length = Math.max(1, Math.hypot(dx, dy));
  const stop = visible && distance < 210;
  // Internal bot direction is continuous; human wire axes remain strictly -1/0/1.
  return { moveX: stop ? 0 : dx / length, moveY: stop ? 0 : dy / length,
    aim: { x: target.x, y: target.y }, fire: visible && distance < 440 };
}
