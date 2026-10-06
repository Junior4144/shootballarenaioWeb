import type { WinCondition } from './config';
import { hitFraction, inside } from './simulation';
import { CONFIG, GAME, type InputIntent, type Point } from './index';
import { LOOP, WEAPONS, createActor, rankPlayers, type ActorState, type Shot, type Pickup, type PickupKind, type MatchState, type ArenaEvent } from './content';
import { WALLS, SPAWNS, clearPoint, firstWall, moveActor, type Wall } from './arena';
import { botInput, separateBots, type BotBrain } from './bots';

export interface PracticePlayer extends ActorState {
  cooldown: number; brain: BotBrain; staminaDelay: number; sprintExhausted: boolean;
}
export type OwnedProjectile = Shot;
// Server construction only: never read these settings from join options/messages.
export interface ArenaRules { bots?: boolean; walls?: readonly Wall[]; scoreLimit?: number; winCondition?: WinCondition; killsToWin?: number }
const PADS = CONFIG.map.pickupPads;
export class Practice {
  players = new Map<string, PracticePlayer>();
  projectiles: Shot[] = [];
  pickups: Pickup[] = [];
  events: ArenaEvent[] = [];
  match: MatchState;
  tick = 0;
  generation = 0;
  time = 0;
  readonly walls: readonly Wall[];
  private nextId = 0;
  private nextEvent = 0;
  private nextPickup = 0;
  private nextBot = 0;
  private readonly rules: Required<ArenaRules>;

  constructor(rules: ArenaRules = {}) {
    this.rules = { bots: CONFIG.npc.enabled, winCondition: CONFIG.match.winCondition, killsToWin: CONFIG.match.killsToWin, walls: WALLS, scoreLimit: LOOP.scoreLimit, ...rules };
    this.walls = this.rules.walls;
    this.match = { phase: 'playing', elapsedSeconds: 0, scoreLimit: this.rules.scoreLimit, winCondition: this.rules.winCondition, killsToWin: this.rules.killsToWin, winnerIds: [], standings: [] };
    this.resetPickups();
  }
  add(id: string, bot = false): void {
    if (this.players.has(id)) return;
    const player = { ...createActor(id, bot), cooldown: 0, staminaDelay: 0, sprintExhausted: false, brain: { remaining: 0, path: [] } };
    this.players.set(id, player);
    if (this.match.phase === 'playing') this.spawn(player);
    if (!bot) this.balanceBots();
  }
  disconnect(id: string): void { const p = this.players.get(id); if (p) { p.connected = false; p.sprinting = false; } }
  remove(id: string): void { this.players.delete(id); this.balanceBots(); }
  private balanceBots(): void {
    const humans = [...this.players.values()].filter(p => !p.bot);
    const desired = this.rules.bots && humans.length ? Math.min(CONFIG.npc.maxCount, Math.max(0, CONFIG.npc.targetPopulation - humans.length)) : 0;
    const bots = [...this.players.values()].filter(p => p.bot);
    for (const p of bots.slice(desired)) {
      this.players.delete(p.id); this.projectiles = this.projectiles.filter(s => s.ownerId !== p.id);
    }
    for (let i = bots.length; i < desired; i++) this.add(`bot:${++this.nextBot}`, true);
  }
  private spawn(p: PracticePlayer): void {
    const danger: Point[] = [...this.players.values()].filter(other => other.id !== p.id && other.health > 0);
    danger.push(...this.projectiles);
    const distance = (point: Point) => Math.min(...danger.map(other => Math.hypot(other.x - point.x, other.y - point.y)));
    const candidates = SPAWNS.filter(point => clearPoint(point, GAME.playerRadius, this.walls));
    if (!candidates.length) throw new Error('No valid spawn: check map.spawns, map dimensions, walls and player.radius in config.ts');
    const point = candidates.reduce((best, candidate) => distance(candidate) > distance(best) ? candidate : best);
    Object.assign(p, point, { health: p.bot ? CONFIG.npc.health : GAME.playerHealth, cooldown: 0, angle: 0,
      stamina: CONFIG.player.sprint.maxStamina, sprinting: false, staminaDelay: 0, sprintExhausted: false,
      respawnRemaining: 0, protectionRemaining: GAME.spawnProtection, lifeId: p.lifeId + 1,
      weapon: 'basic', ammo: 0, speedRemaining: 0, brain: { remaining: 0, path: [] } });
  }
  private emit(kind: ArenaEvent['kind'], actor: string, point: Point, extra: Partial<ArenaEvent> = {}): void {
    this.events.push({ id: ++this.nextEvent, time: this.time, kind, actorId: actor, x: point.x, y: point.y, ...extra });
    if (this.events.length > CONFIG.simulation.eventHistoryLimit) this.events.shift();
  }
  private hit(shot: Shot, from: Point, to: Point): boolean {
    let victim: PracticePlayer | undefined;
    let nearest = firstWall(from, to, GAME.shotRadius, this.walls);
    for (const p of this.players.values()) {
      if (p.id === shot.ownerId || p.health <= 0) continue;
      const fraction = hitFraction(from, to, p, GAME.playerRadius + GAME.shotRadius);
      if (fraction !== undefined && fraction < nearest) { nearest = fraction; victim = p; }
    }
    if (!victim) return nearest !== Infinity;
    if (victim.protectionRemaining > 0) return true;
    victim.health = Math.max(0, victim.health - shot.damage);
    this.emit('hit', shot.ownerId, victim, { targetId: victim.id, targetBot: victim.bot, value: shot.damage });
    if (victim.health === 0) {
      victim.sprinting = false;
      victim.deaths++;
      victim.respawnRemaining = victim.bot ? CONFIG.npc.respawnSeconds : GAME.respawnDelay;
      victim.protectionRemaining = 0; victim.speedRemaining = 0; victim.weapon = 'basic'; victim.ammo = 0;
      victim.radar = { remaining: 0, origin: { x: victim.x, y: victim.y }, markers: [] };
      const owner = this.players.get(shot.ownerId);
      if (owner && !owner.bot) {
        if (victim.bot) owner.botKills++; else owner.kills++;
        owner.points += victim.bot ? LOOP.botKillPoints : LOOP.humanKillPoints;
      }
      this.emit('elimination', shot.ownerId, victim, { targetId: victim.id, targetBot: victim.bot });
      if (victim.bot) this.dropOrbs(victim);
    }
    return true;
  }
  private fire(p: PracticePlayer): void {
    const weapon = WEAPONS[p.weapon];
    p.cooldown = p.bot ? CONFIG.npc.shotCooldownSeconds : weapon.cooldown;
    p.protectionRemaining = 0;
    this.emit('shot', p.id, p);
    for (let i = 0; i < weapon.pellets; i++) {
      const angle = p.angle + (weapon.pellets === 1 ? 0 : -weapon.spread + 2 * weapon.spread * i / (weapon.pellets - 1));
      const cos = Math.cos(angle), sin = Math.sin(angle);
      const shot: Shot = { id: this.nextId++, ownerId: p.id, x: p.x + cos * GAME.muzzleOffset, y: p.y + sin * GAME.muzzleOffset,
        vx: cos * weapon.speed, vy: sin * weapon.speed, life: weapon.life, damage: p.bot ? CONFIG.npc.shotDamage : weapon.damage };
      if (!this.hit(shot, p, shot) && inside(shot, GAME.shotRadius)) this.projectiles.push(shot);
    }
    if (p.weapon !== 'basic' && --p.ammo <= 0) { p.weapon = 'basic'; p.ammo = 0; }
  }
  private resetPickups(): void {
    this.pickups = PADS.filter(p => clearPoint(p, CONFIG.pickups.placementRadius, this.walls)).map(p => ({ ...p, id: this.nextPickup++, available: true, respawnRemaining: 0, dropped: false, lifetime: 0 }));
  }
  private dropOrbs(p: Point): void {
    for (const offset of CONFIG.pickups.npcDrops.offsetsX) {
      if (this.pickups.filter(item => item.dropped).length >= CONFIG.pickups.npcDrops.maxCount) break;
      const candidate = { x: p.x + offset, y: p.y };
      const point = clearPoint(candidate, CONFIG.pickups.npcDrops.placementRadius, this.walls) ? candidate : p;
      this.pickups.push({ ...point, id: this.nextPickup++, kind: 'score', available: true, respawnRemaining: 0, dropped: true, lifetime: CONFIG.pickups.npcDrops.lifetimeSeconds });
    }
  }
  private collect(dt: number): void {
    for (const item of this.pickups) {
      if (item.dropped) { item.lifetime -= dt; if (item.lifetime <= 0) continue; }
      if (!item.available) {
        item.respawnRemaining = Math.max(0, item.respawnRemaining - dt);
        if (item.respawnRemaining <= 1e-9) item.available = true;
      }
      if (!item.available) continue;
      const p = [...this.players.values()].filter(p => !p.bot && p.connected && p.health > 0
        && (item.kind !== 'health' || p.health < GAME.playerHealth)
        && Math.hypot(p.x - item.x, p.y - item.y) <= LOOP.pickupRadius
        && firstWall(p, item, 0, this.walls) === Infinity)
        .sort((a, b) => Math.hypot(a.x - item.x, a.y - item.y) - Math.hypot(b.x - item.x, b.y - item.y) || a.id.localeCompare(b.id))[0];
      if (!p) continue;
      if (item.kind === 'score') p.points += LOOP.orbPoints;
      else if (item.kind === 'health') p.health = Math.min(GAME.playerHealth, p.health + CONFIG.pickups.healAmount);
      else if (item.kind === 'speed') p.speedRemaining = LOOP.speedDuration;
      else { p.weapon = item.kind; p.ammo = WEAPONS[item.kind].ammo; }
      this.emit('pickup', p.id, item, { value: item.kind === 'score' ? LOOP.orbPoints : 0 });
      item.available = false; item.respawnRemaining = item.kind === 'score' ? CONFIG.pickups.scoreRespawnSeconds : CONFIG.pickups.upgradeRespawnSeconds;
      if (item.dropped) item.lifetime = 0;
    }
    this.pickups = this.pickups.filter(item => !item.dropped || item.lifetime > 0);
  }
  private scan(p: PracticePlayer): void {
    p.radarCooldown = LOOP.radarCooldown;
    const markers = [...this.players.values()].filter(other => other.id !== p.id && other.health > 0)
      .map(other => ({ id: other.id, x: other.x, y: other.y, kind: other.bot ? 'bot' as const : 'player' as const }));
    p.radar = { remaining: LOOP.radarDuration, origin: { x: p.x, y: p.y }, markers: [
      ...markers, ...this.pickups.filter(item => item.available).map(item => ({ id: `pickup:${item.id}`, x: item.x, y: item.y, kind: item.kind })),
    ].filter(other => Math.hypot(other.x - p.x, other.y - p.y) <= LOOP.radarRange) };
  }
  private finishMatch(): void {
    for (const player of this.players.values()) player.sprinting = false;
    const standings = rankPlayers([...this.players.values()].filter(p => !p.bot), this.rules.winCondition).map(({ id, points, kills, botKills, deaths }) => ({ id, points, kills, botKills, deaths }));
    const metric = (p: { points: number; kills: number }) => this.rules.winCondition === 'kills' ? p.kills : p.points;
    const top = standings[0] ? metric(standings[0]) : 0;
    this.match = { ...this.match, phase: 'results', standings,
      winnerIds: top > 0 ? standings.filter(p => metric(p) === top).map(p => p.id) : [] };
    this.projectiles = [];
  }
  step(inputs: ReadonlyMap<string, InputIntent>, deltaSeconds: number): void {
    const dt = Math.max(0, Math.min(deltaSeconds, CONFIG.simulation.maxStepSeconds));
    this.time += dt; this.tick++;
    this.events = this.events.filter(event => this.time - event.time <= CONFIG.simulation.eventRetentionSeconds);
    if (this.match.phase === 'results') return;
    this.match.elapsedSeconds += dt;
    const actors = [...this.players.values()];
    const humans = actors.filter(p => !p.bot);
    const firing: PracticePlayer[] = [];
    for (const p of this.players.values()) {
      p.sprinting = false;
      p.protectionRemaining = Math.max(0, p.protectionRemaining - dt);
      p.speedRemaining = Math.max(0, p.speedRemaining - dt);
      p.radarCooldown = Math.max(0, p.radarCooldown - dt);
      p.radar.remaining = Math.max(0, p.radar.remaining - dt);
      if (p.radar.remaining <= 0) p.radar.markers = [];
      if (p.health === 0) {
        p.respawnRemaining = Math.max(0, p.respawnRemaining - dt);
        if (p.respawnRemaining <= 1e-9 && p.connected) this.spawn(p);
        continue;
      }
      if (!p.connected) continue;
      const input = p.bot ? botInput(p, humans, p.brain, dt, this.walls, actors) : inputs.get(p.id) ?? { moveX: 0, moveY: 0, aim: p, fire: false };
      const length = Math.max(1, Math.hypot(input.moveX, input.moveY));
      let speed = p.bot ? CONFIG.npc.speed : GAME.playerSpeed * (p.speedRemaining > 0 ? LOOP.speedMultiplier : 1);
      if (!p.bot) {
        const sprint = CONFIG.player.sprint;
        if (p.stamina >= sprint.resumeStamina) p.sprintExhausted = false;
        const requested = input.sprint && (input.moveX !== 0 || input.moveY !== 0);
        if (requested && !p.sprintExhausted && p.stamina > 0 && dt > 0) {
          const sprintSeconds = Math.min(dt, p.stamina / sprint.drainPerSecond);
          speed *= 1 + (sprint.speedMultiplier - 1) * sprintSeconds / dt;
          p.stamina = Math.max(0, p.stamina - sprint.drainPerSecond * dt);
          if (p.stamina < 1e-9) p.stamina = 0;
          p.sprinting = p.stamina > 0;
          p.sprintExhausted = p.stamina === 0;
          p.staminaDelay = sprint.regenDelaySeconds;
        } else {
          const recoverySeconds = Math.max(0, dt - p.staminaDelay);
          p.staminaDelay = Math.max(0, p.staminaDelay - dt);
          p.stamina = Math.min(sprint.maxStamina, p.stamina + sprint.regenPerSecond * recoverySeconds);
        }
      }
      moveActor(p, input.moveX / length * speed * dt, input.moveY / length * speed * dt, this.walls);
      if (input.aim.x !== p.x || input.aim.y !== p.y) p.angle = Math.atan2(input.aim.y - p.y, input.aim.x - p.x);
      p.cooldown = Math.max(0, p.cooldown - dt);
      if (input.radar && !p.bot && p.radarCooldown <= 0) this.scan(p);
      if (input.fire && p.cooldown <= 0) { p.protectionRemaining = 0; firing.push(p); }
    }
    separateBots(actors, this.walls);
    // Fire from actors alive at the start of the tick; simultaneous trades are valid.
    for (const p of firing) this.fire(p);
    this.projectiles = this.projectiles.filter(shot => {
      const travel = Math.min(dt, shot.life);
      const next = { x: shot.x + shot.vx * travel, y: shot.y + shot.vy * travel };
      if (this.hit(shot, shot, next)) return false;
      shot.x = next.x; shot.y = next.y; shot.life -= dt;
      return shot.life > 0 && inside(shot, GAME.shotRadius);
    });
    this.collect(dt);
    if (humans.some(p => this.rules.winCondition === 'kills' ? p.kills >= this.rules.killsToWin : p.points >= this.rules.scoreLimit)) this.finishMatch();
  }
  snapshot() {
    return {
      tick: this.tick, generation: this.generation, time: this.time,
      players: [...this.players.values()].map(({ cooldown: _cooldown, brain: _brain, staminaDelay: _delay, sprintExhausted: _exhausted, ...p }) => ({ ...p, radar: { ...p.radar, origin: { ...p.radar.origin }, markers: p.radar.markers.map(m => ({ ...m })) } })),
      targets: [], projectiles: this.projectiles.map(p => ({ ...p })),
      pickups: this.pickups.map(p => ({ ...p })), events: this.events.map(e => ({ ...e })),
      match: { ...this.match, winnerIds: [...this.match.winnerIds], standings: this.match.standings.map(p => ({ ...p })) },
    };
  }
}
