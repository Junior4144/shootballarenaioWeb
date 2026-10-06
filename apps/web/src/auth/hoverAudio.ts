/** Quiet arcade feedback. Browsers unlock audio after a click or key press. */
export function attachHoverAudio(root: HTMLElement): () => void {
  let context: AudioContext | undefined;
  let lastTone = -Infinity;
  let keyboard = false;
  const unlock = () => {
    try {
      context ??= new AudioContext();
      if (context.state === 'suspended') void context.resume().catch(() => {});
    } catch { /* Sound is optional; controls must work without audio support. */ }
  };
  const pointerDown = () => { keyboard = false; unlock(); };
  const keyDown = () => { keyboard = true; unlock(); };
  const play = (target: EventTarget | null, related: EventTarget | null = null) => {
    const button = target instanceof Element ? target.closest('button') : null;
    if (!button || !root.contains(button) || button.disabled || !button.getClientRects().length) return;
    if (related instanceof Node && button.contains(related)) return;
    if (!context || context.state !== 'running' || document.hidden) return;
    if (document.getElementById('mute')?.getAttribute('aria-pressed') === 'true') return;
    const now = context.currentTime;
    if (now - lastTone < 0.075) return;
    lastTone = now;
    const tone = context.createOscillator(), gain = context.createGain();
    tone.type = 'triangle';
    tone.frequency.setValueAtTime(740, now);
    tone.frequency.exponentialRampToValueAtTime(980, now + 0.035);
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.025, now + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.055);
    tone.connect(gain); gain.connect(context.destination);
    tone.onended = () => { tone.disconnect(); gain.disconnect(); };
    tone.start(now); tone.stop(now + 0.06);
  };
  const hover = (event: PointerEvent) => {
    if (event.pointerType !== 'touch') play(event.target, event.relatedTarget);
  };
  const focus = (event: FocusEvent) => { if (keyboard) play(event.target); };
  document.addEventListener('pointerdown', pointerDown, true);
  document.addEventListener('keydown', keyDown, true);
  root.addEventListener('pointerover', hover);
  root.addEventListener('focusin', focus);
  return () => {
    document.removeEventListener('pointerdown', pointerDown, true);
    document.removeEventListener('keydown', keyDown, true);
    root.removeEventListener('pointerover', hover);
    root.removeEventListener('focusin', focus);
    void context?.close().catch(() => {});
  };
}
