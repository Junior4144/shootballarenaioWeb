import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route('https://lkgxpgcmspxekggndzih.supabase.co/**', route => route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
});

for (const [width, height] of [[1920,1080], [2560,1440], [390,844], [320,568]]) {
  test(`background continuous across forms and lobby at ${width}x${height}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height });
    const sockets: string[] = []; page.on('websocket', socket => sockets.push(socket.url()));
    await page.goto('/');
    const video = page.locator('#menu-background video');
    await expect(video).toHaveClass('ready');
    await video.evaluate(node => { (node as any).original = true; });
    for (const selector of ['#signup-tab', '#login-tab', '#forgot-password', '#auth-back', '#guest-play', '#lobby-signup']) {
      await page.locator(selector).click();
      expect(await video.evaluate(node => (node as any).original)).toBe(true);
    }
    expect(sockets.filter(url => !url.includes('5189'))).toEqual([]);
    await expect(page.locator('canvas')).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath('account.png') });
    await page.locator('#guest-play').click();
    await page.screenshot({ path: info.outputPath('lobby.png') });
    for (let i = 0; i < 2; i++) {
      await page.locator('#lobby-play').click();
      await expect(video).toHaveCount(0);
      await expect(page.locator('#connection-status')).toContainText('Connected');
      await expect(page.locator('canvas')).toHaveCount(1);
      await page.locator('#game-main-menu').click();
      await expect(video).toHaveCount(1);
      await expect(page.locator('canvas')).toHaveCount(0);
    }
  });
}

test('reduced motion avoids media downloads and updates dynamically', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  let mediaRequests = 0; page.on('request', req => { if (req.url().endsWith('.mp4')) mediaRequests++; });
  await page.goto('/'); await expect(page.locator('#guest-play')).toBeEnabled();
  await expect(page.locator('#menu-background video')).toHaveCount(0); expect(mediaRequests).toBe(0);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await expect(page.locator('#menu-background video')).toHaveClass('ready');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(page.locator('#menu-background video')).toHaveCount(0);
});

for (const failure of ['network', 'autoplay', 'slow']) test(`${failure} retains poster and usable controls`, async ({ page }) => {
  if (failure === 'network') await page.route('**/background/arena.mp4', route => route.abort());
  if (failure === 'slow') await page.route('**/background/arena.mp4', () => new Promise(() => {}));
  if (failure === 'autoplay') await page.addInitScript(() => { HTMLMediaElement.prototype.play = () => Promise.reject(new DOMException('Blocked', 'NotAllowedError')); });
  await page.goto('/'); await page.locator('#guest-play').click();
  await expect(page.locator('#lobby-play')).toBeEnabled();
  expect(await page.locator('#menu-background img').evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
  if (failure !== 'slow') await expect(page.locator('#menu-background video')).toHaveCount(0);
});

test('visibility pauses and resumes the same media; collect browser workload', async ({ page }, info) => {
  await page.goto('/'); const video = page.locator('#menu-background video');
  await expect(video).toHaveClass('ready');
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: true }); document.dispatchEvent(new Event('visibilitychange')); });
  expect(await video.evaluate((v: HTMLVideoElement) => v.paused)).toBe(true);
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: false }); document.dispatchEvent(new Event('visibilitychange')); });
  await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.paused)).toBe(false);
  const cdp = await page.context().newCDPSession(page); await cdp.send('Performance.enable');
  const before = await cdp.send('Performance.getMetrics');
  await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.currentTime), { timeout: 10000 }).toBeGreaterThan(5);
  const after = await cdp.send('Performance.getMetrics');
  const media = await video.evaluate((v: HTMLVideoElement) => ({ time: v.currentTime, quality: v.getVideoPlaybackQuality().toJSON?.() ?? { frames: v.getVideoPlaybackQuality().totalVideoFrames, dropped: v.getVideoPlaybackQuality().droppedVideoFrames } }));
  const metrics = (data: typeof before) => Object.fromEntries(data.metrics.map(m => [m.name, m.value]));
  const a = metrics(before), b = metrics(after);
  console.log('Background performance:', JSON.stringify({ elapsed: b.Timestamp - a.Timestamp, taskMs: (b.TaskDuration - a.TaskDuration) * 1000, scriptMs: (b.ScriptDuration - a.ScriptDuration) * 1000, heapBytes: b.JSHeapUsedSize, media }));
  await info.attach('performance.json', { body: JSON.stringify({ before, after, media }, null, 2), contentType: 'application/json' });
});

test('controller disposal balances listeners and releases media across repeated mounts', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const { MenuBackground } = await import('/src/MenuBackground.ts');
    const add = EventTarget.prototype.addEventListener, remove = EventTarget.prototype.removeEventListener;
    let balance = 0;
    EventTarget.prototype.addEventListener = function(...args) { if (['change', 'visibilitychange'].includes(args[0])) balance++; return add.apply(this, args); };
    EventTarget.prototype.removeEventListener = function(...args) { if (['change', 'visibilitychange'].includes(args[0])) balance--; return remove.apply(this, args); };
    const host = document.createElement('div'); document.body.append(host);
    const media: HTMLVideoElement[] = [];
    try {
      for (let i = 0; i < 5; i++) {
        const controller = new MenuBackground(host);
        media.push(host.querySelector('video')!);
        controller.setActive(false); controller.setActive(true);
        media.push(host.querySelector('video')!);
        controller.destroy();
      }
      return { balance, children: host.childElementCount, released: media.every(v => v.paused && !v.hasAttribute('src') && !v.isConnected) };
    } finally { host.remove(); EventTarget.prototype.addEventListener = add; EventTarget.prototype.removeEventListener = remove; }
  });
  expect(result).toEqual({ balance: 0, children: 0, released: true });
});
