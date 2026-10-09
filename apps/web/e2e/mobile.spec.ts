import { test, expect } from '@playwright/test';
import { Client } from '@colyseus/sdk';
import { ROOM_NAME, VERSION, type Snapshot } from '@shootball/protocol';

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

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
