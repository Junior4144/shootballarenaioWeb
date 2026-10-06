import { GAME, type InputIntent, type Point } from './index';
import type { ActorState } from './content';
import { SPAWNS, clearPoint, firstWall, moveActor, route, type Wall } from './arena';

export const BOT = { detectRange: 300, loseRange: 380, fireRange: 280, thinkSeconds: 0.2,
  routeSeconds: 0.9, searchSeconds: 2.5, spacing: 64 } as const;
export type BotMode = 'patrol' | 'chase' | 'combat' | 'search' | 'retreat';
export interface BotBrain {
  remaining: number; path: Point[]; targetId?: string; patrolIndex?: number;
  mode?: BotMode; thinkRemaining?: number; memoryRemaining?: number;
  lastSeen?: Point; goal?: Point; visible?: boolean; side?: number;
  targetLifeId?: number; routePosition?: Point;
}
const hashId = (id: string) => [...id].reduce((hash, char) => (hash * 31 + char.charCodeAt(0)) >>> 0, 0);
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
function setMode(brain: BotBrain, mode: BotMode): void {
  if (brain.mode === mode) return;
  brain.mode = mode; brain.path = []; brain.goal = undefined; brain.routePosition = undefined;
}
function forgetTarget(brain: BotBrain): void {
  brain.targetId = undefined; brain.targetLifeId = undefined; brain.lastSeen = undefined;
  brain.memoryRemaining = 0; brain.visible = false;
}

export function botInput(bot: ActorState, humans: ActorState[], brain: BotBrain, dt: number,
  walls: readonly Wall[], actors: readonly ActorState[] = humans): InputIntent {
  if (bot.health <= 0 || !bot.connected) return { moveX: 0, moveY: 0, aim: { x: bot.x, y: bot.y }, fire: false };
  brain.mode ??= 'patrol';
  brain.side ??= hashId(bot.id) % 2 ? 1 : -1;
  brain.remaining -= dt;
  brain.thinkRemaining = (brain.thinkRemaining ?? 0) - dt;
  brain.memoryRemaining = Math.max(0, (brain.memoryRemaining ?? 0) - dt);
  let target = humans.find(p => p.id === brain.targetId && p.health > 0 && p.connected
    && p.lifeId === brain.targetLifeId);
  if (brain.targetId && !target) {
    forgetTarget(brain); setMode(brain, 'patrol');
    brain.thinkRemaining = 0;
  }
  // Expire the old lock before perception so the wider retention radius cannot
  // resurrect a forgotten target. New lives always require fresh detection.
  if (brain.mode === 'search' && brain.memoryRemaining <= 0) {
    forgetTarget(brain); setMode(brain, 'patrol'); target = undefined;
  }
  let visible = !!target && distance(bot, target) <= BOT.loseRange && firstWall(bot, target, 4, walls) === Infinity;
  if (target && !visible) setMode(brain, brain.lastSeen && brain.memoryRemaining > 0 ? 'search' : 'patrol');
  // Perception is 5 Hz; keep the current target to avoid rapid target switching.
  if (brain.thinkRemaining <= 0) {
    brain.thinkRemaining = BOT.thinkSeconds;
    if (!visible) {
      let nearest: number = BOT.detectRange;
      let replacement: ActorState | undefined;
      for (const human of humans) {
        const d = distance(bot, human);
        if (human.health <= 0 || !human.connected || d >= BOT.detectRange || d > nearest || firstWall(bot, human, 4, walls) !== Infinity) continue;
        if (d < nearest || (d === nearest && human.id < (replacement?.id ?? ''))) { replacement = human; nearest = d; }
      }
      if (replacement) {
        if (replacement.id !== brain.targetId) { brain.path = []; brain.goal = undefined; }
        target = replacement; visible = true;
      }
    }
    if (target && visible) {
      brain.lastSeen = { x: target.x, y: target.y }; brain.memoryRemaining = BOT.searchSeconds;
    }
    brain.targetId = target?.id;
    brain.targetLifeId = target?.lifeId;
    const previous = brain.mode;
    if (target && visible) {
      const d = distance(bot, target);
      const retreatDistance = previous === 'retreat' ? 155 : 110;
      const injuredDistance = previous === 'retreat' ? 255 : 230;
      const combatDistance = previous === 'combat' ? BOT.fireRange + 20 : BOT.fireRange;
      setMode(brain, d < retreatDistance || (bot.health <= 25 && d < injuredDistance) ? 'retreat'
        : d <= combatDistance ? 'combat' : 'chase');
    } else setMode(brain, brain.lastSeen && brain.memoryRemaining > 0 ? 'search' : 'patrol');
    if (brain.mode === 'patrol') { target = undefined; visible = false; forgetTarget(brain); }
  }
  brain.visible = visible;

  let dx = 0, dy = 0;
  let aim: Point = brain.lastSeen ?? bot;
  if (target && brain.visible && brain.mode !== 'search' && brain.mode !== 'patrol') {
    const d = Math.max(1, distance(bot, target));
    const nx = (target.x - bot.x) / d, ny = (target.y - bot.y) / d;
    const forward = brain.mode === 'retreat' ? -1 : brain.mode === 'chase' ? 1 : d > 210 ? 0.4 : d < 160 ? -0.4 : 0;
    const strafe = brain.mode === 'chase' ? 0.15 : 0.65;
    dx = nx * forward - ny * brain.side * strafe;
    dy = ny * forward + nx * brain.side * strafe;
    aim = { x: target.x, y: target.y };
  } else {
    if (brain.mode === 'search') {
      brain.goal = brain.lastSeen;
      if (!brain.goal || brain.memoryRemaining <= 0 || distance(bot, brain.goal) < 18) {
        setMode(brain, 'patrol'); forgetTarget(brain); target = undefined;
      }
    }
    if (brain.mode === 'patrol' && (!brain.goal || distance(bot, brain.goal) < 18)) {
      brain.path = []; brain.goal = undefined; brain.routePosition = undefined;
      brain.patrolIndex ??= hashId(bot.id) % SPAWNS.length;
      for (let i = 0; i < SPAWNS.length; i++) {
        const goal = SPAWNS[brain.patrolIndex++ % SPAWNS.length];
        if (distance(bot, goal) > 80 && clearPoint(goal, GAME.playerRadius, walls)) { brain.goal = goal; break; }
      }
    }
    while (brain.path.length && distance(bot, brain.path[0]) < 10) brain.path.shift();
    // At most one visibility-graph route per bot per 0.9 seconds, even if stuck.
    if (brain.goal && brain.remaining <= 0) {
      brain.remaining = BOT.routeSeconds;
      const stalled = brain.routePosition && distance(bot, brain.routePosition) < 8;
      const blocked = brain.path[0] && firstWall(bot, brain.path[0], GAME.playerRadius + 1, walls) !== Infinity;
      if (!brain.path.length || stalled || blocked || brain.mode === 'search') {
        brain.path = firstWall(bot, brain.goal, GAME.playerRadius + 1, walls) === Infinity
          ? [{ ...brain.goal }] : route(bot, brain.goal, walls);
      }
      brain.routePosition = { x: bot.x, y: bot.y };
      if (!brain.path.length && brain.mode === 'patrol') brain.goal = undefined;
    }
    while (brain.path.length && distance(bot, brain.path[0]) < 10) brain.path.shift();
    const waypoint = brain.path[0];
    if (waypoint) { const d = Math.max(1, distance(bot, waypoint)); dx = (waypoint.x - bot.x) / d; dy = (waypoint.y - bot.y) / d; aim = waypoint; }
  }
  // Cheap local steering spreads patrols and firing positions before contact.
  for (const other of actors) {
    if (other.id === bot.id || other.health <= 0 || !other.connected) continue;
    const d = distance(bot, other);
    if (d >= BOT.spacing) continue;
    const direction = bot.id < other.id ? -1 : 1;
    const strength = 2 * (1 - d / BOT.spacing);
    dx += (d > 0.001 ? (bot.x - other.x) / d : direction) * strength;
    dy += (d > 0.001 ? (bot.y - other.y) / d : 0) * strength;
  }
  const length = Math.max(1, Math.hypot(dx, dy));
  return { moveX: dx / length, moveY: dy / length, aim: { x: aim.x, y: aim.y },
    fire: !!target && !!brain.visible && ['chase', 'combat', 'retreat'].includes(brain.mode)
      && distance(bot, target) <= BOT.fireRange };
}

// Fixed passes resolve residual overlap without a physics engine. Only bots
// are displaced; wall sweeps keep the correction out of cover.
export function separateBots(actors: readonly ActorState[], walls: readonly Wall[]): void {
  const gap = GAME.playerRadius * 2 + 2;
  const pushBot = (bot: ActorState, dx: number, dy: number) => {
    const start = { x: bot.x, y: bot.y }, push = Math.hypot(dx, dy);
    moveActor(bot, dx, dy, walls, false);
    if (push < 0.01 || distance(start, bot) >= push * 0.5) return;
    // A wall can block the normal separation direction. Try a bounded set of
    // alternate directions, choosing the one with the least crowd overlap.
    const cost = (point: Point) => actors.reduce((sum, other) => other.id === bot.id || other.health <= 0 || !other.connected
      ? sum : sum + Math.max(0, gap - distance(point, other)) ** 2, 0);
    let best: Point = { x: bot.x, y: bot.y }, bestCost = cost(best);
    for (let i = 0; i < 8; i++) {
      const candidate = { ...start }, angle = i * Math.PI / 4;
      moveActor(candidate, Math.cos(angle) * push, Math.sin(angle) * push, walls, false);
      const score = cost(candidate);
      if (score < bestCost - 1e-8) { best = candidate; bestCost = score; }
    }
    bot.x = best.x; bot.y = best.y;
  };
  for (let pass = 0; pass < 4; pass++) for (let i = 0; i < actors.length; i++) {
    const a = actors[i];
    if (a.health <= 0 || !a.connected) continue;
    for (let j = i + 1; j < actors.length; j++) {
      const b = actors[j];
      if ((!a.bot && !b.bot) || b.health <= 0 || !b.connected) continue;
      const d = distance(a, b);
      if (d >= gap) continue;
      const angle = (hashId([a.id, b.id].sort().join(':')) % 360) * Math.PI / 180;
      const nx = d > 0.001 ? (a.x - b.x) / d : Math.cos(angle);
      const ny = d > 0.001 ? (a.y - b.y) / d : Math.sin(angle);
      const push = (gap - d) / (a.bot && b.bot ? 2 : 1);
      if (a.bot) pushBot(a, nx * push, ny * push);
      if (b.bot) pushBot(b, -nx * push, -ny * push);
    }
  }
}
