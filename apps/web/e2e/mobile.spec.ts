import { test, expect } from '@playwright/test';
import { Client } from '@colyseus/sdk';
import { ROOM_NAME, VERSION, type Snapshot } from '@shootball/protocol';
import { CONFIG } from '@shootball/shared';

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

test('mouse hold and touch aim share firing cadence and stop on release or cancellation', async ({ page }) => {
  const observer = await new Client('ws://127.0.0.1:2569').joinOrCreate(ROOM_NAME, { version: VERSION });
  let snapshot: Snapshot | undefined;
  const shots = new Map<number, { actorId: string; time: number }>();
  observer.onMessage<Snapshot>('snapshot', value => {
    snapshot = value;
    for (const event of value.events) if (event.kind === 'shot') shots.set(event.id, event);
  });
  try {
    await page.goto('/');
    await page.locator('#guest-play').tap(); await page.locator('#lobby-play').tap();
    await expect(page.locator('#game-loading')).toBeHidden();
    await expect.poll(() => snapshot?.players.filter(p => !p.bot && p.connected).length).toBe(2);
    const id = snapshot!.players.find(p => !p.bot && p.id !== observer.sessionId && p.connected)!.id;
    const ownShots = () => [...shots.values()].filter(s => s.actorId === id);
    const field = (await page.locator('#game').boundingBox())!;
    const aim = (await page.locator('#touch-aim').boundingBox())!;
    const cdp = await page.context().newCDPSession(page);
    const point = { id: 1, x: aim.x + aim.width / 2, y: aim.y + aim.height / 2 - 28 };
    const cadences: number[] = [];
    for (const mode of ['mouse', 'touch'] as const) {
      const before = ownShots().length;
      if (mode === 'mouse') {
        await page.mouse.move(field.x + field.width * .4, field.y + field.height * .45);
        await page.mouse.down();
      } else await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
      await expect.poll(() => ownShots().length - before).toBeGreaterThanOrEqual(4);
      if (mode === 'mouse') {
        // Release outside the canvas must stop firing too.
        await page.mouse.move(2, 2); await page.mouse.up();
      } else await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
      const burst = ownShots().slice(before, before + 4);
      for (let i = 1; i < burst.length; i++) expect(burst[i].time - burst[i - 1].time).toBeGreaterThanOrEqual(CONFIG.weapons.basic.cooldown - .001);
      cadences.push((burst[3].time - burst[0].time) / 3);
      // Allow in-flight input and snapshots to settle, then verify no new shots.
      await page.waitForTimeout(200);
      const stopped = ownShots().length;
      await page.waitForTimeout(400);
      expect(ownShots().length).toBe(stopped);
    }
    expect(Math.abs(cadences[0] - cadences[1])).toBeLessThan(.06);
  } finally { await page.mouse.up(); await observer.leave(); }
});

test('whole gameplay screen blocks accidental zoom and permits recovery from a zoomed menu', async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto('/');
  // Account screens retain browser zoom; no global user-scalable=no restriction.
  await expect(page.locator('meta[name="viewport"]')).not.toHaveAttribute('content', /user-scalable=no|maximum-scale=1/);
  expect(await page.locator('#account-screen').evaluate(el => getComputedStyle(el).touchAction)).toBe('auto');
  await page.locator('#guest-play').tap(); await page.locator('#lobby-play').tap();
  await expect(page.locator('#game-loading')).toBeHidden();
  const cdp = await page.context().newCDPSession(page);
  const scale = () => page.evaluate(() => visualViewport!.scale);
  const pinch = async (x: number, y: number, inward = false) => {
    const points = (distance: number) => [{ id: 10, x: x - distance, y }, { id: 11, x: x + distance, y }];
    const distances = inward ? Array.from({ length: 28 }, (_, i) => 116 - i * 4) : Array.from({ length: 16 }, (_, i) => 12 + i * 4);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: points(inward ? 120 : 8) });
    for (const distance of distances) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: points(distance) });
      await page.waitForTimeout(20);
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForTimeout(100);
  };
  const initialScale = await scale();
  for (const selector of ['#game', '.gameplay-leaderboard', '#touch-aim', '#touch-sprint', '.status-strip', '.play-layout', '.game-header', '.match-actions']) {
    const box = (await page.locator(selector).boundingBox())!;
    // Start on the bottom padding for the layout case, not its canvas center.
    await pinch(box.x + box.width / 2, selector === '.play-layout' ? box.y + box.height - 2 : box.y + box.height / 2);
    expect(await scale(), selector).toBeCloseTo(initialScale, 2);
  }
  // Simulate a bottom safe-area inset outside the play viewport.
  await page.locator('#arena-app').evaluate(el => { el.style.paddingBottom = '24px'; });
  await pinch(195, 840);
  expect(await scale()).toBeCloseTo(initialScale, 2);
  await page.locator('#arena-app').evaluate(el => { el.style.paddingBottom = ''; });
  await page.locator('#scoreboard').evaluate(el => {
    el.innerHTML = Array.from({ length: 30 }, (_, i) => `<tr><td>Player ${i}</td><td>0</td></tr>`).join('');
  });
  const board = page.locator('.gameplay-leaderboard');
  const rect = (await board.boundingBox())!;
  const scrollPoint = { id: 12, x: rect.x + 20, y: rect.y + rect.height - 12 };
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [scrollPoint] });
  for (let dy = 10; dy <= 80; dy += 10) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ ...scrollPoint, y: scrollPoint.y - dy }] });
    await page.waitForTimeout(20);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect.poll(() => board.evaluate(el => el.scrollTop)).toBeGreaterThan(0);
  await page.locator('#touch-sprint').tap();
  await expect(page.locator('#touch-sprint')).toHaveAttribute('aria-pressed', 'true');
  // Positive control: the same native gesture really zooms an ordinary page.
  // This prevents a no-op gesture injector from making the test pass falsely.
  await page.locator('#game-main-menu').tap();
  await expect(page.locator('#lobby-screen')).toBeVisible();
  await pinch(195, 420);
  expect(await scale()).toBeGreaterThan(initialScale + .2);
  // Enter while already zoomed: gameplay must let the player pinch back out.
  await page.locator('#lobby-play').evaluate(el => (el as HTMLButtonElement).click());
  await expect(page.locator('#game-loading')).toBeHidden();
  await expect(page.locator('html')).toHaveClass(/gameplay-zoomed/);
  for (let attempt = 0; attempt < 3 && await scale() > 1.01; attempt++) await pinch(195, 240, true);
  await expect.poll(scale).toBeCloseTo(initialScale, 2);
  await expect(page.locator('html')).not.toHaveClass(/gameplay-zoomed/);
  await pinch(195, 840);
  expect(await scale()).toBeCloseTo(initialScale, 2);
  await page.locator('#touch-sprint').tap();
  await expect(page.locator('#touch-sprint')).toHaveAttribute('aria-pressed', 'true');
  await page.goto('/');
  await expect(page.locator('#account-screen')).toBeVisible();
  await pinch(195, 420);
  expect(await scale()).toBeGreaterThan(initialScale + .2);
});

test('two thumbs move and fire; release, cancellation and rotation clear inputs', async ({ page }, testInfo) => {
  const observer = await new Client('ws://127.0.0.1:2569').joinOrCreate(ROOM_NAME, { version: VERSION });
  let snapshot: Snapshot | undefined;
  observer.onMessage<Snapshot>('snapshot', value => { snapshot = value; });
  try {
    await page.goto('/');
    await page.locator('#guest-play').tap(); await page.locator('#lobby-play').tap();
    await expect(page.locator('#game-loading')).toBeHidden();
    await expect.poll(() => snapshot?.players.filter(p => !p.bot && p.connected).length).toBe(2);
    const player = () => snapshot!.players.find(p => !p.bot && p.id !== observer.sessionId && p.connected)!;
    const id = player().id;
    const cdp = await page.context().newCDPSession(page);
    const move = (await page.locator('#touch-move').boundingBox())!;
    const aim = (await page.locator('#touch-aim').boundingBox())!;
    const direction = player().x > 0 ? -1 : 1;
    const points = [
      { id: 1, x: move.x + move.width / 2 + direction * 28, y: move.y + move.height / 2 },
      { id: 2, x: aim.x + aim.width / 2, y: aim.y + aim.height / 2 - 28 },
    ];
    await page.locator('#touch-sprint').tap();
    const before = { x: player().x, y: player().y };
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: points });
    await expect.poll(() => Math.hypot(player().x - before.x, player().y - before.y)).toBeGreaterThan(10);
    await expect.poll(() => snapshot?.events.some(e => e.kind === 'shot' && e.actorId === id)).toBe(true);
    await expect.poll(() => player().sprinting).toBe(true);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect.poll(() => player().sprinting).toBe(false);
    const stopped = { x: player().x, y: player().y, tick: snapshot!.tick };
    await expect.poll(() => snapshot!.tick).toBeGreaterThan(stopped.tick + 10);
    expect(Math.hypot(player().x - stopped.x, player().y - stopped.y)).toBeLessThan(3);
    await page.locator('#touch-radar').tap();
    await expect(page.locator('#touch-radar')).toBeDisabled();
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: points });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
    await expect.poll(() => player().sprinting).toBe(false);
    await expect.poll(async () => page.locator('#touch-move').evaluate(el => el.style.getPropertyValue('--stick-x'))).toBe('0px');
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: points });
    await page.setViewportSize({ width: 844, height: 390 });
    await expect(page.locator('#touch-sprint')).toHaveAttribute('aria-pressed', 'false');
    await expect.poll(() => player().sprinting).toBe(false);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect(page.locator('#game-loading')).toBeHidden();
    await expect(page.locator('#scoreboard tr.local')).toContainText('YOU');
    await page.screenshot({ path: testInfo.outputPath('mobile-landscape.png') });
  } finally { await observer.leave(); }
});

for (const viewport of [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 844, height: 390 }]) {
  test(`mobile menus and full leaderboard fit ${viewport.width}x${viewport.height}`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport);
    await page.goto('/');
    await expect(page.locator('#signed-out')).toBeVisible();
    for (const tab of ['login', 'signup']) {
      await page.locator(`#${tab}-tab`).tap();
      expect(await page.locator('#account-screen').evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
      await page.locator('#guest-play').scrollIntoViewIfNeeded();
      await expect(page.locator('#guest-play')).toBeInViewport();
    }
    await page.locator('#guest-play').tap();
    expect(await page.locator('#lobby-screen').evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    await page.locator('#lobby-play').tap();
    await expect(page.locator('#game-loading')).toBeHidden();
    // Stress the compact HUD independently of how many people joined this match.
    await page.evaluate(() => {
      document.getElementById('scoreboard')!.innerHTML = Array.from({ length: 8 }, (_, i) => `<tr><td>Long player name ${i}</td><td>1000</td></tr>`).join('');
      document.getElementById('loadout')!.textContent = 'SHOTGUN';
      document.getElementById('ammo')!.textContent = '100 / 100';
    });
    const geometry = await page.evaluate(() => {
      const field = document.querySelector('#game')!.getBoundingClientRect();
      const board = document.querySelector('.gameplay-leaderboard')!.getBoundingClientRect();
      const mute = document.querySelector('#mute')!.getBoundingClientRect();
      return { fieldBottom: field.bottom, boardBottom: board.bottom, muteRight: mute.right, width: innerWidth };
    });
    expect(geometry.boardBottom).toBeLessThan(geometry.fieldBottom);
    expect(geometry.muteRight).toBeLessThanOrEqual(geometry.width);
    await page.screenshot({ path: testInfo.outputPath('mobile.png') });
  });
}
