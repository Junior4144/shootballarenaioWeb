import { CONFIG } from '@shootball/shared';
import type { ArenaEvent } from '@shootball/shared/content';

export class CombatAudio {
  private context?: AudioContext;
  muted = false;
  unlock(): void {
    try { this.context ??= new AudioContext(); void this.context.resume().catch(() => {}); } catch { /* Audio is optional. */ }
  }
  play(event: ArenaEvent, localId?: string): void {
    if (this.muted || !this.context || this.context.state !== 'running') return;
    if (event.kind === 'hit' && event.actorId !== localId && event.targetId !== localId) return;
    if (event.kind === 'pickup' && event.actorId !== localId) return;
    const ctx = this.context, now = ctx.currentTime;
    const tone = ctx.createOscillator(), volume = ctx.createGain();
    const settings = CONFIG.presentation.audio.tones[event.kind];
    tone.type = event.kind === 'pickup' ? 'sine' : 'triangle';
    tone.frequency.setValueAtTime(settings[0], now);
    tone.frequency.exponentialRampToValueAtTime(settings[1], now + settings[2]);
    volume.gain.setValueAtTime(CONFIG.presentation.audio.volume, now); volume.gain.exponentialRampToValueAtTime(CONFIG.presentation.audio.endVolume, now + settings[2]);
    tone.connect(volume); volume.connect(ctx.destination); tone.start(now); tone.stop(now + settings[2]);
    tone.onended = () => { tone.disconnect(); volume.disconnect(); };
  }
  destroy(): void { void this.context?.close(); }
}
