/** Independent pointer capture lets both thumbs move and aim at the same time. */
export class TouchControls {
  move = { x: 0, y: 0 };
  aim = { x: 1, y: 0 };
  aiming = false;
  sprint = false;
  private controller = new AbortController();
  private releases: (() => void)[] = [];

  constructor() {
    const options = { signal: this.controller.signal };
    for (const kind of ['move', 'aim'] as const) {
      const pad = document.getElementById(`touch-${kind}`)!;
      let pointer: number | undefined;
      const release = () => {
        const id = pointer; pointer = undefined;
        if (id !== undefined && pad.hasPointerCapture(id)) pad.releasePointerCapture(id);
        pad.style.setProperty('--stick-x', '0px'); pad.style.setProperty('--stick-y', '0px');
        if (kind === 'move') this.move = { x: 0, y: 0 };
        else this.aiming = false;
      };
      this.releases.push(release);
      const update = (event: PointerEvent) => {
        const rect = pad.getBoundingClientRect();
        const radius = rect.width / 2;
        const x = event.clientX - rect.left - radius;
        const y = event.clientY - rect.top - rect.height / 2;
        const length = Math.hypot(x, y);
        const scale = Math.max(radius * .65, length);
        pad.style.setProperty('--stick-x', `${x / scale * radius * .45}px`);
        pad.style.setProperty('--stick-y', `${y / scale * radius * .45}px`);
        // The server accepts eight-way digital movement, matching WASD.
        if (kind === 'move') this.move = length < 8 ? { x: 0, y: 0 } : {
          x: Math.abs(x) / length >= .35 ? Math.sign(x) : 0,
          y: Math.abs(y) / length >= .35 ? Math.sign(y) : 0,
        };
        else {
          this.aiming = length >= 8;
          if (this.aiming) this.aim = { x: x / length, y: y / length };
        }
      };
      pad.addEventListener('pointerdown', event => {
        if (pointer !== undefined || event.button !== 0) return;
        event.preventDefault(); pointer = event.pointerId; pad.setPointerCapture(pointer); update(event);
      }, options);
      pad.addEventListener('pointermove', event => { if (event.pointerId === pointer) update(event); }, options);
      for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) {
        pad.addEventListener(name, event => { if ((event as PointerEvent).pointerId === pointer) release(); }, options);
      }
    }
    document.getElementById('touch-sprint')!.addEventListener('click', () => {
      this.sprint = !this.sprint;
      document.getElementById('touch-sprint')!.setAttribute('aria-pressed', String(this.sprint));
    }, options);
    document.getElementById('touch-radar')!.addEventListener('click', () => document.getElementById('scan')!.click(), options);
    window.addEventListener('resize', () => this.reset(), options);
  }

  reset(): void {
    this.releases.forEach(release => release());
    this.sprint = false;
    document.getElementById('touch-sprint')!.setAttribute('aria-pressed', 'false');
  }

  destroy(): void { this.reset(); this.controller.abort(); }
}
