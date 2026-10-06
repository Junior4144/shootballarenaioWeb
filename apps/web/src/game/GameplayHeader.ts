/** Small disclosure panels keep account/settings actions out of the playfield. */
export function attachGameplayHeader(): { close: () => void; destroy: () => void } {
  const pairs = ['account', 'settings'].map(name => ({
    button: document.getElementById(`${name}-toggle`) as HTMLButtonElement,
    panel: document.getElementById(`${name}-menu`)!,
  }));
  const close = () => pairs.forEach(({ button, panel }) => {
    button.setAttribute('aria-expanded', 'false'); panel.hidden = true;
  });
  const controller = new AbortController();
  const options = { signal: controller.signal };
  for (const { button, panel } of pairs) {
    button.addEventListener('click', () => {
      const open = panel.hidden; close();
      panel.hidden = !open; button.setAttribute('aria-expanded', String(open));
    }, options);
    button.addEventListener('keydown', event => {
      if (event.key !== 'ArrowDown') return;
      event.preventDefault(); close(); panel.hidden = false;
      button.setAttribute('aria-expanded', 'true'); panel.querySelector('button')?.focus();
    }, options);
  }
  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    const opened = pairs.find(({ panel }) => !panel.hidden);
    if (opened) { event.preventDefault(); close(); opened.button.focus(); }
  }, options);
  const outside = (event: Event) => {
    if (event.target instanceof Node && !pairs.some(({ button, panel }) => button.contains(event.target as Node) || panel.contains(event.target as Node))) close();
  };
  document.addEventListener('pointerdown', outside, options);
  document.addEventListener('focusin', outside, options);
  const mute = document.getElementById('mute')!;
  const sound = document.getElementById('settings-sound')!;
  const syncSound = () => {
    const muted = mute.getAttribute('aria-pressed') === 'true';
    sound.setAttribute('aria-pressed', String(muted)); sound.textContent = muted ? 'Unmute sound' : 'Mute sound';
  };
  sound.addEventListener('click', () => mute.click(), options);
  const observer = new MutationObserver(syncSound);
  observer.observe(mute, { attributes: true, attributeFilter: ['aria-pressed'] });
  syncSound();
  document.getElementById('settings-guide')!.addEventListener('click', () => {
    const guide = document.getElementById('help-widget') as HTMLDetailsElement;
    guide.open = !guide.open; close(); guide.querySelector('summary')!.focus();
  }, options);
  return { close, destroy: () => { controller.abort(); observer.disconnect(); } };
}
