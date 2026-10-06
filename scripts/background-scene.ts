import Phaser from 'phaser';
import { Practice } from '../packages/shared/src/practice';
import { botInput } from '../packages/shared/src/bots';
import { ARENA } from '../packages/shared/src/index';
import { createArenaTextures, drawArena } from '../apps/web/src/game/ArenaArtwork';

// Offline only. Never imported by the application or included in its build.
let seed = 7915787;
Math.random = () => ((seed = (1664525 * seed + 1013904223) >>> 0) / 4294967296);
const match = new Practice({ bots: false, scoreLimit: 100000 });
for (let i = 0; i < 6; i++) match.add(`staged-${i}`);
function tick() {
  const actors = [...match.players.values()];
  const inputs = new Map(actors.map(p => [p.id, botInput(p, actors.filter(a => a !== p), p.brain, 1 / 30, match.walls, actors)]));
  match.step(inputs, 1 / 30);
}
for (let i = 0; i < 240; i++) tick();
class Capture extends Phaser.Scene {
  private actors: { ball: Phaser.GameObjects.Image; cannon: Phaser.GameObjects.Image }[] = [];
  private shots: Phaser.GameObjects.Image[] = [];
  create() {
    createArenaTextures(this); drawArena(this);
    this.cameras.main.setZoom(960 / (ARENA.right - ARENA.left + 8));
    this.cameras.main.centerOn((ARENA.left + ARENA.right) / 2, (ARENA.top + ARENA.bottom) / 2);
    this.actors = [...match.players].map(() => ({ ball: this.add.image(0, 0, 'player').setDepth(2), cannon: this.add.image(0, 0, 'cannon').setOrigin(0, .5).setDepth(3) }));
    const pickups = this.add.graphics().setDepth(1);
    for (const p of match.pickups) { pickups.lineStyle(2, 0xffd87c).strokeTriangle(p.x, p.y - 7, p.x - 7, p.y + 6, p.x + 7, p.y + 6); }
    (window as any).captureFrame = async () => {
      tick(); // One distinct simulation step per frame: 30 Hz simulation, 30 fps film.
      [...match.players.values()].forEach((p, i) => {
        this.actors[i].ball.setPosition(p.x, p.y).setVisible(p.health > 0).setTint(i % 2 ? 0xffc080 : 0x86b8ff);
        this.actors[i].cannon.setPosition(p.x, p.y).setRotation(p.angle).setVisible(p.health > 0);
      });
      this.shots.forEach(p => p.destroy());
      this.shots = match.projectiles.map(p => this.add.image(p.x, p.y, 'shot').setDepth(4));
      await new Promise(resolve => this.game.events.once(Phaser.Core.Events.POST_RENDER, resolve));
      return this.game.canvas.toDataURL('image/png').split(',')[1];
    };
  }
}
new Phaser.Game({ type: Phaser.WEBGL, width: 960, height: 540, backgroundColor: '#131e2a', pixelArt: true, roundPixels: true, render: { preserveDrawingBuffer: true }, audio: { noAudio: true }, input: { keyboard: false, mouse: false, touch: false, gamepad: false }, fps: { target: 30, forceSetTimeOut: true }, scene: Capture });
