import Phaser from 'phaser';
import { ARENA, GAME } from '@shootball/shared';
import { NETWORK, emptySnapshot, type Snapshot } from '@shootball/protocol';
import { PracticeConnection } from '../network/PracticeConnection';
import { SnapshotBuffer } from '../network/SnapshotBuffer';
import { EventCursor } from '../network/EventCursor';
import { WALLS } from '@shootball/shared/arena';
import type { ArenaEvent } from '@shootball/shared/content';
import { ArenaHud, actorName } from './ArenaHud';
import { CombatAudio } from './CombatAudio';

export class ArenaScene extends Phaser.Scene {
  private world: Snapshot = emptySnapshot();
  private connection!: PracticeConnection;
  private snapshots = new SnapshotBuffer();
  private sendElapsed = 0;
  private focused = true;
  private connectionState = '';
  private keys!: Record<'W' | 'A' | 'S' | 'D' | 'Q', Phaser.Input.Keyboard.Key>;
  private players = new Map<string, { ball: Phaser.GameObjects.Image; cannon: Phaser.GameObjects.Image; label: Phaser.GameObjects.Text }>();
  private health!: Phaser.GameObjects.Graphics;
  private status!: Phaser.GameObjects.Text;
  private shots = new Map<number, Phaser.GameObjects.Image>();
  private fireQueued = false;
  private radarQueued = false;
  private hud = new ArenaHud();
  private audio = new CombatAudio();
  private eventCursor = new EventCursor();
  private effects: { event: ArenaEvent; until: number }[] = [];
  private details!: Phaser.GameObjects.Graphics;
  private pickupLabels = new Map<number, Phaser.GameObjects.Text>();
  private cameraLife = '';

  constructor() { super('arena'); }

  create(): void {
    this.createTextures();
    this.cameras.main.setBounds(0, 0, ARENA.right + 48, ARENA.bottom + 48);
    const floor = this.add.graphics();
    floor.fillStyle(0x1b2c39).fillRect(ARENA.left, ARENA.top, ARENA.right - ARENA.left, ARENA.bottom - ARENA.top);
    floor.lineStyle(1, 0x243745);
    for (let x = ARENA.left; x <= ARENA.right; x += 32) floor.lineBetween(x, ARENA.top, x, ARENA.bottom);
    for (let y = ARENA.top; y <= ARENA.bottom; y += 32) floor.lineBetween(ARENA.left, y, ARENA.right, y);
    floor.lineStyle(8, 0x415867).strokeRect(ARENA.left - 4, ARENA.top - 4, ARENA.right - ARENA.left + 8, ARENA.bottom - ARENA.top + 8);
    for (const wall of WALLS) {
      floor.fillStyle(0x405563).fillRect(wall.x, wall.y, wall.width, wall.height);
      floor.lineStyle(2, 0x78909d).strokeRect(wall.x, wall.y, wall.width, wall.height);
      floor.fillStyle(0x526979).fillRect(wall.x + 4, wall.y + 4, wall.width - 8, 5);
    }
    // Keep the original 864 x 512 play window and HUD while the world scrolls.
    this.add.graphics().setScrollFactor(0).setDepth(20).fillStyle(0x0c1823)
      .fillRect(0, 0, GAME.width, 80).fillRect(0, 592, GAME.width, 48)
      .fillRect(0, 80, 48, 512).fillRect(912, 80, 48, 512);
    this.add.text(48, 30, '01 / FREE-FOR-ALL', { fontFamily: 'monospace', fontSize: '16px', color: '#9db2bf' }).setScrollFactor(0).setDepth(21);
    this.status = this.add.text(912, 30, '', { fontFamily: 'monospace', fontSize: '16px', color: '#69e2ce' }).setOrigin(1, 0).setScrollFactor(0).setDepth(21);
    this.add.text(48, 610, 'WASD  MOVE     /     MOUSE  AIM     /     CLICK  FIRE     /     Q  SCAN', { fontFamily: 'monospace', fontSize: '12px', color: '#819dab' }).setScrollFactor(0).setDepth(21);
    this.health = this.add.graphics().setDepth(4);
    this.details = this.add.graphics().setDepth(6);
    this.keys = this.input.keyboard!.addKeys('W,A,S,D,Q') as typeof this.keys;
    const fire = (pointer: Phaser.Input.Pointer) => {
      if (pointer.leftButtonDown() && pointer.x >= 48 && pointer.x <= 912 && pointer.y >= 80 && pointer.y <= 592) this.fireQueued = true;
    };
    const clearInput = () => { this.fireQueued = false; this.radarQueued = false; this.input.keyboard!.resetKeys(); };
    const neutral = () => {
      clearInput();
      this.focused = false;
      this.connection.send({ moveX: 0, moveY: 0, aim: { x: 480, y: 336 }, fire: false });
    };
    const focus = () => { clearInput(); this.snapshots.clear(); this.cameraLife = ''; this.focused = !document.hidden; };
    const visibility = () => { if (document.hidden) neutral(); else focus(); };
    const status = document.querySelector<HTMLElement>('#connection-status')!;
    const join = document.querySelector<HTMLButtonElement>('#join')!;
    const leave = document.querySelector<HTMLButtonElement>('#leave')!;
    let storage: Storage | undefined;
    try { storage = sessionStorage; } catch { /* Storage is optional. */ }
    this.connection = new PracticeConnection(import.meta.env.VITE_GAME_SERVER_URL || 'ws://127.0.0.1:2567', () => {
      const connection = this.connection;
      if (connection.state !== this.connectionState) {
        clearInput();
        this.snapshots.clear();
        this.eventCursor.clear(); this.effects = [];
        this.connectionState = connection.state;
        this.cameraLife = '';
      }
      this.world = connection.snapshot ?? emptySnapshot();
      if (connection.snapshot && connection.state === 'connected') {
        this.snapshots.push(connection.snapshot, performance.now());
      }
      const count = this.world.players.filter(p => !p.bot && p.connected).length;
      status.textContent = connection.state === 'connected'
        ? `Room ${connection.room?.roomId} · ${count}/8 players · You are cyan`
        : connection.message;
      join.hidden = !['error', 'disconnected'].includes(connection.state);
      leave.hidden = ['error', 'disconnected'].includes(connection.state);
    }, storage);
    const scan = document.getElementById('scan')!;
    const mute = document.getElementById('mute')!;
    const onScan = () => { this.radarQueued = true; this.audio.unlock(); };
    const unlock = () => this.audio.unlock();
    const onMute = () => { this.audio.muted = !this.audio.muted; mute.textContent = this.audio.muted ? 'Sound off' : 'Sound on'; mute.setAttribute('aria-pressed', String(this.audio.muted)); };
    scan.addEventListener('click', onScan); mute.addEventListener('click', onMute);
    document.addEventListener('pointerdown', unlock); document.addEventListener('keydown', unlock);
    const onJoin = () => { void this.connection.join(); };
    const onLeave = () => this.connection.leave();
    join.addEventListener('click', onJoin);
    leave.addEventListener('click', onLeave);
    this.input.on('pointerdown', fire);
    this.game.events.on(Phaser.Core.Events.BLUR, neutral);
    this.game.events.on(Phaser.Core.Events.FOCUS, focus);
    document.addEventListener('visibilitychange', visibility);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.input.off('pointerdown', fire);
      this.game.events.off(Phaser.Core.Events.BLUR, neutral);
      this.game.events.off(Phaser.Core.Events.FOCUS, focus);
      document.removeEventListener('visibilitychange', visibility);
      join.removeEventListener('click', onJoin);
      leave.removeEventListener('click', onLeave);
      scan.removeEventListener('click', onScan); mute.removeEventListener('click', onMute);
      document.removeEventListener('pointerdown', unlock); document.removeEventListener('keydown', unlock);
      this.audio.destroy(); this.connection.leave();
    });
    this.syncVisuals();
    void this.connection.join();
  }

  update(_time: number, delta: number): void {
    if (Phaser.Input.Keyboard.JustDown(this.keys.Q)) this.radarQueued = true;
    const pointer = this.input.activePointer;
    // Convert logical canvas coordinates through the scrolling world camera.
    const aim = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
    this.sendElapsed += delta;
    if (this.sendElapsed >= NETWORK.inputMs && this.connection.state === 'connected' && this.focused) {
      this.sendElapsed %= NETWORK.inputMs;
      this.connection.send({
      moveX: Number(this.keys.D.isDown) - Number(this.keys.A.isDown),
      moveY: Number(this.keys.S.isDown) - Number(this.keys.W.isDown),
      aim: { x: Phaser.Math.Clamp(aim.x, ARENA.left, ARENA.right), y: Phaser.Math.Clamp(aim.y, ARENA.top, ARENA.bottom) },
      fire: this.fireQueued, radar: this.radarQueued,
      });
      this.fireQueued = false; this.radarQueued = false;
    }
    if (this.connection.state !== 'connected' || !this.focused) { this.fireQueued = false; this.radarQueued = false; }
    this.world = this.snapshots.sample(performance.now()) ?? this.world;
    this.syncVisuals(delta);
  }

  private syncVisuals(delta = 0): void {
    this.health.clear(); this.details.clear();
    const now = performance.now();
    for (const event of this.eventCursor.take(this.world)) {
      this.effects.push({ event, until: now + (event.kind === 'elimination' ? 450 : 160) });
      const me = this.world.players.find(p => p.id === this.connection?.sessionId);
      if (me && Math.hypot(event.x - me.x, event.y - me.y) < 600) this.audio.play(event, me.id);
    }
    this.effects = this.effects.filter(e => e.until > now);
    for (const [id, visual] of this.players) {
      if (!this.world.players.some(p => p.id === id)) {
        visual.ball.destroy(); visual.cannon.destroy(); visual.label.destroy();
        this.players.delete(id);
      }
    }
    for (const p of this.world.players) {
      if (!this.players.has(p.id)) {
        this.players.set(p.id, {
          ball: this.add.image(0, 0, 'player').setDepth(2),
          cannon: this.add.image(0, 0, 'cannon').setOrigin(0, 0.5).setDepth(3),
          label: this.add.text(0, 0, '', { fontFamily: 'monospace', fontSize: '11px', color: '#dbe8ed' }).setOrigin(0.5).setDepth(4),
        });
      }
      const v = this.players.get(p.id)!;
      const local = p.id === this.connection?.sessionId;
      const alive = p.health > 0;
      const alpha = p.connected ? 1 : 0.35;
      v.ball.setVisible(alive); v.cannon.setVisible(alive);
      if (alive) {
        this.health.fillStyle(0x40515b).fillRect(p.x - 20, p.y - 30, 40, 5);
        this.health.fillStyle(p.health <= 25 ? 0xf18d7e : 0x69e2ce).fillRect(p.x - 20, p.y - 30, 40 * p.health / (p.bot ? 75 : GAME.playerHealth), 5);
        if (p.protectionRemaining > 0) this.health.lineStyle(2, 0xffd87c).strokeCircle(p.x, p.y, 22);
      }
      v.ball.setPosition(p.x, p.y).setTint(this.effects.some(e => e.event.kind === 'hit' && e.event.targetId === p.id) ? 0xff5555 : local ? 0xffffff : p.bot ? 0xffc080 : 0x86b8ff).setAlpha(alpha);
      v.cannon.setPosition(p.x, p.y).setRotation(p.angle).setAlpha(alpha);
      v.label.setPosition(p.x, p.y + 28).setText(actorName(p.id, this.connection?.sessionId) + (!alive ? ' RESPAWN ' + Math.ceil(p.respawnRemaining) : p.protectionRemaining > 0 ? ' SHIELD' : '') + (p.connected ? '' : ' (away)')).setAlpha(alpha);
    }
    for (const [id, image] of this.shots) {
      if (!this.world.projectiles.some(shot => shot.id === id)) { image.destroy(); this.shots.delete(id); }
    }
    for (const shot of this.world.projectiles) {
      if (!this.shots.has(shot.id)) this.shots.set(shot.id, this.add.image(shot.x, shot.y, 'shot').setDepth(5));
      this.shots.get(shot.id)!.setPosition(shot.x, shot.y);
    }
    const me = this.world.players.find(p => p.id === this.connection?.sessionId);
    if (me) {
      const camera = this.cameras.main;
      const life = `${this.world.generation}:${me.id}:${me.lifeId}`;
      // Ease over about a tenth of a second, independently of frame rate.
      // Clamp the destination first so edges do not build up camera lag.
      const x = Phaser.Math.Clamp(me.x - GAME.width / 2, 0, ARENA.right + 48 - GAME.width);
      const y = Phaser.Math.Clamp(me.y - 16 - GAME.height / 2, 0, ARENA.bottom + 48 - GAME.height);
      const blend = life === this.cameraLife ? 1 - Math.exp(-Math.max(0, delta) / 110) : 1;
      camera.setScroll(camera.scrollX + (x - camera.scrollX) * blend, camera.scrollY + (y - camera.scrollY) * blend);
      this.cameraLife = life;
    }
    this.status.setText(!me ? 'JOIN TO PLAY' : me.health <= 0
      ? 'ELIMINATED / RESPAWN ' + me.respawnRemaining.toFixed(1) + 's'
      : 'HP ' + me.health + ' / 100' + (me.protectionRemaining > 0 ? ' / SHIELD ' + me.protectionRemaining.toFixed(1) + 's' : ''));
    this.hud.render(this.world, this.connection?.sessionId);
    for (const [id, label] of this.pickupLabels) {
      if (!this.world.pickups.some(p => p.id === id && p.available)) { label.destroy(); this.pickupLabels.delete(id); }
    }
    const colors = { score: 0xffd87c, shotgun: 0xe3a4ff, heavy: 0xffaa77, speed: 0x78bfff, health: 0x78efab };
    for (const item of this.world.pickups.filter(p => p.available)) {
      this.details.lineStyle(2, colors[item.kind]);
      if (item.kind === 'score') this.details.strokeTriangle(item.x, item.y - 7, item.x - 7, item.y + 6, item.x + 7, item.y + 6);
      else {
        this.details.strokeRect(item.x - 9, item.y - 9, 18, 18);
        if (item.kind === 'health') { this.details.lineBetween(item.x - 5, item.y, item.x + 5, item.y); this.details.lineBetween(item.x, item.y - 5, item.x, item.y + 5); }
      }
      if (!this.pickupLabels.has(item.id)) this.pickupLabels.set(item.id, this.add.text(item.x, item.y + 14,
        item.kind === 'score' ? '+5' : item.kind.toUpperCase(), { fontFamily: 'monospace', fontSize: '9px', color: '#c6d9e2' }).setOrigin(0.5).setDepth(6));
    }
    if (me && me.radar.remaining > 0) {
      for (const marker of me.radar.markers) {
        this.details.lineStyle(2, marker.kind === 'player' ? 0xff7777 : marker.kind === 'bot' ? 0xffc080 : 0xe3a4ff);
        this.details.strokeCircle(marker.x, marker.y, 24);
        const angle = Math.atan2(marker.y - me.y, marker.x - me.x);
        this.details.lineBetween(me.x + Math.cos(angle) * 30, me.y + Math.sin(angle) * 30, me.x + Math.cos(angle) * 44, me.y + Math.sin(angle) * 44);
      }
    }
    for (const { event, until } of this.effects) {
      this.details.lineStyle(2, event.kind === 'hit' ? 0xffeeee : 0xffd87c, Math.min(1, (until - now) / 160));
      if (event.kind === 'elimination') this.details.strokeCircle(event.x, event.y, 22 + (450 - (until - now)) / 10);
      else if (event.kind === 'hit' && event.actorId === this.connection?.sessionId) {
        this.details.lineBetween(event.x - 7, event.y - 7, event.x + 7, event.y + 7);
        this.details.lineBetween(event.x + 7, event.y - 7, event.x - 7, event.y + 7);
      } else if (event.kind === 'pickup') this.details.strokeCircle(event.x, event.y, 18);
    }
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
