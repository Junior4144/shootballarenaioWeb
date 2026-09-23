import Phaser from 'phaser';
import { ARENA, GAME } from '@shootball/shared';
import { createWorld, stepWorld } from './simulation';

export class ArenaScene extends Phaser.Scene {
  private world = createWorld();
  private keys!: Record<'W' | 'A' | 'S' | 'D' | 'R', Phaser.Input.Keyboard.Key>;
  private ball!: Phaser.GameObjects.Image;
  private cannon!: Phaser.GameObjects.Image;
  private health!: Phaser.GameObjects.Graphics;
  private status!: Phaser.GameObjects.Text;
  private targets = new Map<number, Phaser.GameObjects.Image>();
  private shots = new Map<number, Phaser.GameObjects.Image>();
  private fireQueued = false;

  constructor() { super('arena'); }

  create(): void {
    this.createTextures();
    const floor = this.add.graphics();
    floor.fillStyle(0x1b2c39).fillRect(ARENA.left, ARENA.top, ARENA.right - ARENA.left, ARENA.bottom - ARENA.top);
    floor.lineStyle(1, 0x243745);
    for (let x = ARENA.left; x <= ARENA.right; x += 32) floor.lineBetween(x, ARENA.top, x, ARENA.bottom);
    for (let y = ARENA.top; y <= ARENA.bottom; y += 32) floor.lineBetween(ARENA.left, y, ARENA.right, y);
    floor.lineStyle(8, 0x415867).strokeRect(ARENA.left - 4, ARENA.top - 4, ARENA.right - ARENA.left + 8, ARENA.bottom - ARENA.top + 8);
    this.add.text(48, 30, '01 / PRACTICE ARENA', { fontFamily: 'monospace', fontSize: '16px', color: '#9db2bf' });
    this.status = this.add.text(912, 30, '', { fontFamily: 'monospace', fontSize: '16px', color: '#69e2ce' }).setOrigin(1, 0);
    this.add.text(48, 610, 'WASD  MOVE     /     MOUSE  AIM     /     CLICK  FIRE', { fontFamily: 'monospace', fontSize: '12px', color: '#819dab' });
    this.ball = this.add.image(0, 0, 'player').setDepth(2);
    this.cannon = this.add.image(0, 0, 'cannon').setOrigin(0, 0.5).setDepth(3);
    this.health = this.add.graphics().setDepth(4);
    this.keys = this.input.keyboard!.addKeys('W,A,S,D,R') as typeof this.keys;
    const fire = (pointer: Phaser.Input.Pointer) => {
      if (pointer.leftButtonDown() && pointer.x >= ARENA.left && pointer.x <= ARENA.right && pointer.y >= ARENA.top && pointer.y <= ARENA.bottom) this.fireQueued = true;
    };
    const clearInput = () => { this.fireQueued = false; this.input.keyboard!.resetKeys(); };
    this.input.on('pointerdown', fire);
    this.game.events.on(Phaser.Core.Events.BLUR, clearInput);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.input.off('pointerdown', fire);
      this.game.events.off(Phaser.Core.Events.BLUR, clearInput);
    });
    this.syncVisuals();
  }

  update(_time: number, delta: number): void {
    if (Phaser.Input.Keyboard.JustDown(this.keys.R)) {
      this.world = createWorld();
      for (const image of this.shots.values()) image.destroy();
      this.shots.clear();
      this.fireQueued = false;
    }
    const pointer = this.input.activePointer;
    // FIT scaling already converts pointer positions into logical canvas coordinates.
    stepWorld(this.world, {
      moveX: Number(this.keys.D.isDown) - Number(this.keys.A.isDown),
      moveY: Number(this.keys.S.isDown) - Number(this.keys.W.isDown),
      aim: pointer.position,
      fire: this.fireQueued,
    }, delta / 1000);
    this.fireQueued = false;
    this.syncVisuals();
  }

  private syncVisuals(): void {
    const p = this.world.player;
    this.ball.setPosition(p.x, p.y);
    this.cannon.setPosition(p.x, p.y).setRotation(p.angle);
    this.health.clear();
    for (const [id, image] of this.targets) {
      if (!this.world.targets.some(target => target.id === id)) { image.destroy(); this.targets.delete(id); }
    }
    for (const target of this.world.targets) {
      if (!this.targets.has(target.id)) this.targets.set(target.id, this.add.image(target.x, target.y, 'target').setDepth(1));
      for (let i = 0; i < GAME.targetHealth; i++) {
        this.health.fillStyle(i < target.health ? 0xf18d7e : 0x40515b).fillRect(target.x - 18 + i * 13, target.y - 32, 10, 4);
      }
    }
    for (const [id, image] of this.shots) {
      if (!this.world.projectiles.some(shot => shot.id === id)) { image.destroy(); this.shots.delete(id); }
    }
    for (const shot of this.world.projectiles) {
      if (!this.shots.has(shot.id)) this.shots.set(shot.id, this.add.image(shot.x, shot.y, 'shot').setDepth(5));
      this.shots.get(shot.id)!.setPosition(shot.x, shot.y);
    }
    this.status.setText(this.world.targets.length ? `TARGETS LEFT  ${this.world.targets.length} / 4` : 'ARENA CLEAR!  /  R TO RESET');
  }

  private createTextures(): void {
    const ball = (key: string, radius: number, color: number, highlight: number) => {
      if (this.textures.exists(key)) return;
      const size = radius * 2;
      const g = this.make.graphics({ x: 0, y: 0 });
      // Fill a coarse pixel grid to make a circular, deliberately stepped silhouette.
      for (let y = 0; y < size; y += 2) for (let x = 0; x < size; x += 2) {
        const d = Math.hypot(x + 1 - radius, y + 1 - radius);
        if (d <= radius) g.fillStyle(d > radius - 3 ? 0x0c1823 : color).fillRect(x, y, 2, 2);
      }
      g.fillStyle(highlight).fillRect(radius - 6, radius - 8, 6, 4);
      g.generateTexture(key, size, size); g.destroy();
    };
    ball('player', GAME.playerRadius, 0x69d8c6, 0xb4f3e4);
    ball('target', GAME.targetRadius, 0xd87569, 0xf9b195);
    if (!this.textures.exists('cannon')) {
      const g = this.make.graphics({ x: 0, y: 0 });
      g.fillStyle(0x0c1823).fillRect(0, 0, 28, 12);
      g.fillStyle(0xd3e5e6).fillRect(2, 2, 24, 8);
      g.fillStyle(0x789ba9).fillRect(22, 2, 4, 8);
      g.generateTexture('cannon', 28, 12); g.destroy();
    }
    if (!this.textures.exists('shot')) {
      const g = this.make.graphics({ x: 0, y: 0 });
      g.fillStyle(0xffd87c).fillRect(0, 0, 8, 8);
      g.fillStyle(0xfff2be).fillRect(2, 2, 4, 4);
      g.generateTexture('shot', 8, 8); g.destroy();
    }
  }
}
