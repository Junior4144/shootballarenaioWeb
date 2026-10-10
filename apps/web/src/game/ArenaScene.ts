import Phaser from 'phaser';
import { CONFIG, ARENA, GAME } from '@shootball/shared';
import { NETWORK, neutralInput, emptySnapshot, type Snapshot } from '@shootball/protocol';
import { PracticeConnection, type PlayIdentity } from '../network/PracticeConnection';
import { SnapshotBuffer } from '../network/SnapshotBuffer';
import { EventCursor } from '../network/EventCursor';
import { drawArena, createArenaTextures } from './ArenaArtwork';
import type { ArenaEvent } from '@shootball/shared/content';
import { ArenaHud, actorName } from './ArenaHud';
import { CombatAudio } from './CombatAudio';
import { TouchControls } from './TouchControls';
import posthog from '../posthog';
import { posthogLogs } from '../posthogLogs';

export class ArenaScene extends Phaser.Scene {
  private world: Snapshot = emptySnapshot();
  connection!: PracticeConnection;
  private snapshots = new SnapshotBuffer();
  private sendElapsed = 0;
  private focused = true;
  private connectionState = '';
  private keys!: Record<'W' | 'A' | 'S' | 'D' | 'Q' | 'SHIFT', Phaser.Input.Keyboard.Key>;
  private players = new Map<string, { ball: Phaser.GameObjects.Image; cannon: Phaser.GameObjects.Image; label: Phaser.GameObjects.Text }>();
  private health!: Phaser.GameObjects.Graphics;
  private shots = new Map<number, Phaser.GameObjects.Image>();
  private fireQueued = false;
  private fireHeld = false;
  private radarQueued = false;
  private touch!: TouchControls;
  private hud = new ArenaHud();
  private audio = new CombatAudio();
  private eventCursor = new EventCursor();
  private effects: { event: ArenaEvent; until: number }[] = [];
  private details!: Phaser.GameObjects.Graphics;
  private pickupLabels = new Map<number, Phaser.GameObjects.Text>();
  private cameraLife = '';
  private matchConnectedCaptured = false;
  private radarUsedCaptured = false;
  private matchResultCaptured = false;

  private revealed = false;
  constructor(private identity: PlayIdentity = { kind: 'guest' }, private onReady: () => void = () => {}) { super('arena'); }

  create(): void {
    this.createTextures();
    this.cameras.main.setBounds(ARENA.left - 4, ARENA.top - 4, ARENA.right - ARENA.left + 8, ARENA.bottom - ARENA.top + 8);
    drawArena(this);
    const resize = () => {
      const camera = this.cameras.main;
      camera.setSize(this.scale.width, this.scale.height);
      // Uniform zoom fills every aspect ratio without stretching pixel sprites.
      camera.setZoom(Math.max(this.scale.width / 960, this.scale.height / 640));
      this.cameraLife = '';
    };
    resize();
    this.scale.on(Phaser.Scale.Events.RESIZE, resize);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.scale.off(Phaser.Scale.Events.RESIZE, resize));
    this.health = this.add.graphics().setDepth(4);
    this.details = this.add.graphics().setDepth(6);
    this.keys = this.input.keyboard!.addKeys('W,A,S,D,Q,SHIFT') as typeof this.keys;
    this.touch = new TouchControls();
    const fire = (pointer: Phaser.Input.Pointer) => {
      if (pointer.leftButtonDown() && pointer.x >= 0 && pointer.x <= this.scale.width && pointer.y >= 0 && pointer.y <= this.scale.height) {
        this.fireQueued = true;
        // Touch auto-fire belongs to the aim pad; mouse hold uses the same cadence.
        this.fireHeld = !pointer.wasTouch;
      }
    };
    const releaseFire = (event: PointerEvent) => { if (event.pointerType !== 'touch' && (event.buttons & 1) === 0) this.fireHeld = false; };
    const cancelFire = () => { this.fireHeld = false; this.fireQueued = false; };
    const clearInput = () => { cancelFire(); this.radarQueued = false; this.input.keyboard!.resetKeys(); this.touch.reset(); };
    const neutral = () => {
      clearInput();
      this.focused = false;
      this.connection.send(neutralInput());
    };
    const focus = () => { clearInput(); this.snapshots.clear(); this.cameraLife = ''; this.focused = !document.hidden; };
    const visibility = () => { if (document.hidden) neutral(); else focus(); };
    const status = document.querySelector<HTMLElement>('#connection-status')!;
    const join = document.querySelector<HTMLButtonElement>('#join')!;
    const leave = document.querySelector<HTMLButtonElement>('#leave')!;
    let storage: Storage | undefined;
    try { storage = sessionStorage; } catch { /* Storage is optional. */ }
    this.connection = new PracticeConnection(import.meta.env.VITE_GAME_SERVER_URL || `ws://${CONFIG.server.host}:${CONFIG.server.port}`, () => {
      const connection = this.connection;
      if (connection.state !== this.connectionState) {
        clearInput();
        this.snapshots.clear();
        this.eventCursor.clear(); this.effects = [];
        this.connectionState = connection.state;
        this.cameraLife = '';
        if (connection.state === 'connected' && !this.matchConnectedCaptured) {
          this.matchConnectedCaptured = true;
          posthog.capture('match_connected', { player_type: this.identity.kind });
          posthogLogs.arenaMatchConnected(this.identity.kind);
        }
      }
      this.world = connection.snapshot ?? emptySnapshot();
      if (connection.snapshot && connection.state === 'connected') {
        this.snapshots.push(connection.snapshot, performance.now());
      }
      status.textContent = connection.state === 'connected'
        ? 'Arena \u00b7 Connected'
        : connection.message;
      if (['error', 'disconnected'].includes(connection.state)) this.onReady();
      join.hidden = !['error', 'disconnected'].includes(connection.state);
      leave.hidden = ['error', 'disconnected'].includes(connection.state);
    }, storage, this.identity);
    const scan = document.getElementById('scan')!;
    const mute = document.getElementById('mute')!;
    this.audio.muted = mute.getAttribute('aria-pressed') === 'true';
    const onScan = () => { this.radarQueued = true; this.audio.unlock(); };
    const unlock = () => this.audio.unlock();
    const onMute = () => { this.audio.muted = !this.audio.muted; mute.setAttribute('aria-label', this.audio.muted ? 'Unmute sound' : 'Mute sound'); mute.setAttribute('title', this.audio.muted ? 'Sound off' : 'Sound on'); mute.setAttribute('aria-pressed', String(this.audio.muted)); };
    scan.addEventListener('click', onScan); mute.addEventListener('click', onMute);
    document.addEventListener('pointerdown', unlock); document.addEventListener('keydown', unlock);
    const onJoin = () => { void this.connection.join(); };
    const onLeave = () => {
      if (this.connection.state === 'connected') {
        posthog.capture('match_left', { player_type: this.identity.kind });
        posthogLogs.arenaMatchLeft(this.identity.kind);
      }
      this.connection.leave();
    };
    join.addEventListener('click', onJoin);
    leave.addEventListener('click', onLeave);
    this.input.on('pointerdown', fire);
    window.addEventListener('pointerup', releaseFire);
    window.addEventListener('pointercancel', cancelFire);
    window.addEventListener('resize', clearInput);
    this.game.events.on(Phaser.Core.Events.BLUR, neutral);
    this.game.events.on(Phaser.Core.Events.FOCUS, focus);
    document.addEventListener('visibilitychange', visibility);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.input.off('pointerdown', fire);
      window.removeEventListener('pointerup', releaseFire);
      window.removeEventListener('pointercancel', cancelFire);
      window.removeEventListener('resize', clearInput);
      this.game.events.off(Phaser.Core.Events.BLUR, neutral);
      this.game.events.off(Phaser.Core.Events.FOCUS, focus);
      document.removeEventListener('visibilitychange', visibility);
      join.removeEventListener('click', onJoin);
      leave.removeEventListener('click', onLeave);
      scan.removeEventListener('click', onScan); mute.removeEventListener('click', onMute);
      document.removeEventListener('pointerdown', unlock); document.removeEventListener('keydown', unlock);
      this.touch.destroy(); this.audio.destroy(); this.connection.leave();
    });
    this.syncVisuals();
    void this.connection.join();
  }

  update(_time: number, delta: number): void {
    if (Phaser.Input.Keyboard.JustDown(this.keys.Q)) this.radarQueued = true;
    const pointer = this.input.activePointer;
    // Convert logical canvas coordinates through the scrolling world camera.
    const aim = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
    const me = this.world.players.find(player => player.id === this.connection.sessionId);
    if (this.touch.aiming && me) {
      aim.set(me.x + this.touch.aim.x * 500, me.y + this.touch.aim.y * 500);
    }
    this.sendElapsed += delta;
    if (this.sendElapsed >= NETWORK.inputMs && this.connection.state === 'connected' && this.focused) {
      this.sendElapsed %= NETWORK.inputMs;
      if (this.radarQueued && !this.radarUsedCaptured) {
        this.radarUsedCaptured = true;
        posthog.capture('radar_used', { player_type: this.identity.kind });
      }
      this.connection.send({
      moveX: Phaser.Math.Clamp(Number(this.keys.D.isDown) - Number(this.keys.A.isDown) + this.touch.move.x, -1, 1),
      moveY: Phaser.Math.Clamp(Number(this.keys.S.isDown) - Number(this.keys.W.isDown) + this.touch.move.y, -1, 1),
      aim: { x: Phaser.Math.Clamp(aim.x, ARENA.left, ARENA.right), y: Phaser.Math.Clamp(aim.y, ARENA.top, ARENA.bottom) },
      fire: this.fireQueued || this.fireHeld || this.touch.aiming, radar: this.radarQueued, sprint: this.keys.SHIFT.isDown || this.touch.sprint,
      });
      this.fireQueued = false; this.radarQueued = false;
    }
    if (this.connection.state !== 'connected' || !this.focused) { this.fireQueued = false; this.radarQueued = false; }
    this.world = this.snapshots.sample(performance.now()) ?? this.world;
    this.syncVisuals(delta);
    if (!this.revealed && this.world.players.some(player => player.id === this.connection.sessionId)) {
      this.revealed = true;
      this.game.events.once(Phaser.Core.Events.POST_RENDER, this.onReady);
    }
  }

  private syncVisuals(delta = 0): void {
    this.health.clear(); this.details.clear();
    const now = performance.now();
    for (const event of this.eventCursor.take(this.world)) {
      this.effects.push({ event, until: now + (event.kind === 'elimination' ? CONFIG.presentation.eliminationEffectMs : CONFIG.presentation.effectMs) });
      const me = this.world.players.find(p => p.id === this.connection?.sessionId);
      if (me && Math.hypot(event.x - me.x, event.y - me.y) < CONFIG.presentation.audioRange) this.audio.play(event, me.id);
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
        this.health.fillStyle(p.health <= (p.bot ? CONFIG.npc.health : GAME.playerHealth) * CONFIG.presentation.lowHealthFraction ? 0xf18d7e : 0x69e2ce).fillRect(p.x - 20, p.y - 30, 40 * p.health / (p.bot ? CONFIG.npc.health : GAME.playerHealth), 5);
        if (p.protectionRemaining > 0) this.health.lineStyle(2, 0xffd87c).strokeCircle(p.x, p.y, 22);
      }
      v.ball.setPosition(p.x, p.y).setTint(this.effects.some(e => e.event.kind === 'hit' && e.event.targetId === p.id) ? 0xff5555 : local ? 0xffffff : p.bot ? 0xffc080 : 0x86b8ff).setAlpha(alpha);
      v.cannon.setPosition(p.x, p.y).setRotation(p.angle).setAlpha(alpha);
      v.label.setPosition(p.x, p.y + 28).setText(actorName(p.id, this.connection?.sessionId, this.world.identities) + (!alive ? ' RESPAWN ' + Math.ceil(p.respawnRemaining) : p.protectionRemaining > 0 ? ' SHIELD' : '') + (p.connected ? '' : ' (away)')).setAlpha(alpha);
    }
    for (const [id, image] of this.shots) {
      if (!this.world.projectiles.some(shot => shot.id === id)) { image.destroy(); this.shots.delete(id); }
    }
    for (const shot of this.world.projectiles) {
      if (!this.shots.has(shot.id)) this.shots.set(shot.id, this.add.image(shot.x, shot.y, 'shot').setDepth(5));
      this.shots.get(shot.id)!.setPosition(shot.x, shot.y);
    }
    const me = this.world.players.find(p => p.id === this.connection?.sessionId);
    if (me && this.world.match.phase === 'results' && !this.matchResultCaptured) {
      this.matchResultCaptured = true;
      const winners = this.world.match.winnerIds;
      const outcome = !winners.length ? 'empty' : winners.length > 1 ? 'draw' : winners.includes(me.id) ? 'win' : 'loss';
      const matchDurationSeconds = Math.round(this.world.match.elapsedSeconds);
      posthog.capture('match_completed', {
        player_type: this.identity.kind,
        outcome,
        match_duration_seconds: matchDurationSeconds,
      });
      posthogLogs.arenaMatchCompleted(this.identity.kind, outcome, matchDurationSeconds);
    }
    if (me) {
      const camera = this.cameras.main;
      const life = `${this.world.generation}:${me.id}:${me.lifeId}`;
      // Ease over about a tenth of a second, independently of frame rate.
      // Clamp the destination first so edges do not build up camera lag.
      const halfWidth = camera.width / camera.zoom / 2, halfHeight = camera.height / camera.zoom / 2;
      const x = Phaser.Math.Clamp(me.x, ARENA.left - 4 + halfWidth, ARENA.right + 4 - halfWidth);
      const y = Phaser.Math.Clamp(me.y - CONFIG.presentation.cameraOffsetY, ARENA.top - 4 + halfHeight, ARENA.bottom + 4 - halfHeight);
      const blend = life === this.cameraLife ? 1 - Math.exp(-Math.max(0, delta) / CONFIG.presentation.cameraEaseMs) : 1;
      camera.centerOn(camera.midPoint.x + (x - camera.midPoint.x) * blend, camera.midPoint.y + (y - camera.midPoint.y) * blend);
      this.cameraLife = life;
    }
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
        item.kind === 'score' ? `+${CONFIG.match.orbPoints}` : item.kind.toUpperCase(), { fontFamily: 'monospace', fontSize: '9px', color: '#c6d9e2' }).setOrigin(0.5).setDepth(6));
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
      this.details.lineStyle(2, event.kind === 'hit' ? 0xffeeee : 0xffd87c, Math.min(1, (until - now) / CONFIG.presentation.effectMs));
      if (event.kind === 'elimination') this.details.strokeCircle(event.x, event.y, 22 + (CONFIG.presentation.eliminationEffectMs - (until - now)) / 10);
      else if (event.kind === 'hit' && event.actorId === this.connection?.sessionId) {
        this.details.lineBetween(event.x - 7, event.y - 7, event.x + 7, event.y + 7);
        this.details.lineBetween(event.x + 7, event.y - 7, event.x - 7, event.y + 7);
      } else if (event.kind === 'pickup') this.details.strokeCircle(event.x, event.y, 18);
    }
  }

  private createTextures(): void {
    createArenaTextures(this);
  }
}
