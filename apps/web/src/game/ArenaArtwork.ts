import Phaser from 'phaser';
import { CONFIG, ARENA, GAME } from '@shootball/shared';
import { WALLS } from '@shootball/shared/arena';

// Shared by the live arena and the offline menu-film capture.
export function drawArena(scene: Phaser.Scene): void {
    const floor = scene.add.graphics();
    floor.fillStyle(0x1b2c39).fillRect(ARENA.left, ARENA.top, ARENA.right - ARENA.left, ARENA.bottom - ARENA.top);
    floor.lineStyle(1, 0x243745);
    for (let x = ARENA.left; x <= ARENA.right; x += CONFIG.map.gridSize) floor.lineBetween(x, ARENA.top, x, ARENA.bottom);
    for (let y = ARENA.top; y <= ARENA.bottom; y += CONFIG.map.gridSize) floor.lineBetween(ARENA.left, y, ARENA.right, y);
    floor.lineStyle(8, 0x415867).strokeRect(ARENA.left - 4, ARENA.top - 4, ARENA.right - ARENA.left + 8, ARENA.bottom - ARENA.top + 8);
    for (const wall of WALLS) {
      floor.fillStyle(0x405563).fillRect(wall.x, wall.y, wall.width, wall.height);
      floor.lineStyle(2, 0x78909d).strokeRect(wall.x, wall.y, wall.width, wall.height);
      floor.fillStyle(0x526979).fillRect(wall.x + 4, wall.y + 4, wall.width - 8, 5);
    }
}

export function createArenaTextures(scene: Phaser.Scene): void {
    const ball = (key: string, radius: number, color: number, highlight: number) => {
      if (scene.textures.exists(key)) return;
      const size = radius * 2;
      const g = scene.make.graphics({ x: 0, y: 0 });
      // Fill a coarse pixel grid to make a circular, deliberately stepped silhouette.
      for (let y = 0; y < size; y += 2) for (let x = 0; x < size; x += 2) {
        const d = Math.hypot(x + 1 - radius, y + 1 - radius);
        if (d <= radius) g.fillStyle(d > radius - 3 ? 0x0c1823 : color).fillRect(x, y, 2, 2);
      }
      g.fillStyle(highlight).fillRect(radius - 6, radius - 8, 6, 4);
      g.generateTexture(key, size, size); g.destroy();
    };
    ball('player', GAME.playerRadius, 0x69d8c6, 0xb4f3e4);
    if (!scene.textures.exists('cannon')) {
      const g = scene.make.graphics({ x: 0, y: 0 });
      g.fillStyle(0x0c1823).fillRect(0, 0, 28, 12);
      g.fillStyle(0xd3e5e6).fillRect(2, 2, 24, 8);
      g.fillStyle(0x789ba9).fillRect(22, 2, 4, 8);
      g.generateTexture('cannon', 28, 12); g.destroy();
    }
    if (!scene.textures.exists('shot')) {
      const g = scene.make.graphics({ x: 0, y: 0 });
      const size = GAME.shotRadius * 2;
      g.fillStyle(0xffd87c).fillRect(0, 0, size, size);
      g.fillStyle(0xfff2be).fillRect(size / 4, size / 4, size / 2, size / 2);
      g.generateTexture('shot', size, size); g.destroy();
    }
}
