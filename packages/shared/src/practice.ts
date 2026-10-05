import { createWorld, stepActor, stepProjectiles, type World } from './simulation';
import type { InputIntent, Player, Projectile, Target } from './index';

export interface PracticePlayer extends Player {
  id: string;
  connected: boolean;
  slot: number;
  cooldown: number;
}
export interface OwnedProjectile extends Projectile { ownerId: string }
export class Practice {
  players = new Map<string, PracticePlayer>();
  targets: Target[] = createWorld().targets;
  projectiles: OwnedProjectile[] = [];
  tick = 0;
  generation = 0;
  private nextId = 0;

  add(id: string): void {
    const slots = new Set([...this.players.values()].map(p => p.slot));
    let slot = 0;
    while (slots.has(slot)) slot++;
    this.players.set(id, { id, slot, x: 240, y: 140 + slot * 56, angle: 0, connected: true, cooldown: 0 });
  }
  disconnect(id: string): void {
    const player = this.players.get(id);
    if (player) player.connected = false;
    this.projectiles = this.projectiles.filter(p => p.ownerId !== id);
  }
  remove(id: string): void { this.disconnect(id); this.players.delete(id); }
  reset(): void {
    this.targets = createWorld().targets;
    this.projectiles = [];
    this.generation++;
    for (const player of this.players.values()) {
      Object.assign(player, { x: 240, y: 140 + player.slot * 56, angle: 0, cooldown: 0 });
    }
  }
  step(inputs: ReadonlyMap<string, InputIntent>, dt: number): void {
    for (const p of this.players.values()) {
      if (!p.connected) continue;
      const input = inputs.get(p.id) ?? { moveX: 0, moveY: 0, aim: p, fire: false };
      const actor: World = { player: p, targets: this.targets, projectiles: [], cooldown: p.cooldown, nextId: this.nextId };
      stepActor(actor, input, dt);
      p.cooldown = actor.cooldown;
      this.nextId = actor.nextId;
      this.projectiles.push(...actor.projectiles.map(shot => ({ ...shot, ownerId: p.id })));
    }
    // Advance shared shots once, regardless of how many players are present.
    stepProjectiles(this, dt);
    this.tick++;
  }
  snapshot() {
    return {
      tick: this.tick, generation: this.generation,
      players: [...this.players.values()].map(({ id, x, y, angle, connected }) => ({ id, x, y, angle, connected })),
      targets: this.targets.map(p => ({ ...p })),
      projectiles: this.projectiles.map(p => ({ ...p })),
    };
  }
}
