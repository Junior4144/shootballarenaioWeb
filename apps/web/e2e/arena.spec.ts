import { test, expect } from '@playwright/test';
import { Client } from '@colyseus/sdk';
import { ROOM_NAME, VERSION, type Snapshot } from '@shootball/protocol';

for (const viewport of [{ width: 1920, height: 1080 }, { width: 1366, height: 768 }, { width: 800, height: 600 }, { width: 390, height: 844 }]) {
  test(`live HUD fits ${viewport.width}x${viewport.height}`, async ({ page }, testInfo) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.setViewportSize(viewport);
    await page.goto('/');
    await expect(page.locator('#connection-status')).toContainText('You are cyan');
    await expect(page.locator('#scoreboard tr.local')).toContainText('YOU');
    await expect(page.locator('#health-value')).toHaveText(/\d+/);
    const geometry = await page.evaluate(() => {
      const box = (selector: string) => {
        const r = document.querySelector(selector)!.getBoundingClientRect();
        return { x: r.x, y: r.y, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
      };
      return { arena: box('.arena-wrap'), sidebar: box('aside'), canvas: box('canvas'), health: box('#health-meter'), mute: box('#mute'),
        width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight };
    });
    expect(geometry.width).toBeLessThanOrEqual(viewport.width);
    expect(geometry.height).toBeLessThanOrEqual(viewport.height);
    expect(geometry.arena.width / geometry.arena.height).toBeCloseTo(1.35, 2);
    // The only clipped pixels must be the original 48px blank canvas rails.
    expect(geometry.arena.x - geometry.canvas.x).toBeCloseTo(geometry.canvas.width * .05, 0);
    expect(geometry.canvas.right - geometry.arena.right).toBeCloseTo(geometry.canvas.width * .05, 0);
    if (viewport.width > 700) {
      expect(Math.abs(geometry.sidebar.x - geometry.arena.right)).toBeLessThan(2);
      expect(geometry.sidebar.width).toBeLessThanOrEqual(220);
      const playfieldTop = geometry.canvas.y + geometry.canvas.height * (80 / 640);
      const playfieldBottom = geometry.canvas.y + geometry.canvas.height * (592 / 640);
      expect(Math.abs(geometry.sidebar.y - playfieldTop)).toBeLessThan(2);
      expect(Math.abs(geometry.sidebar.bottom - playfieldBottom)).toBeLessThan(2);
    } else {
      expect(geometry.sidebar.y).toBeGreaterThanOrEqual(geometry.arena.bottom - 1);
    }
    expect(geometry.health.x).toBeGreaterThanOrEqual(geometry.arena.x);
    expect(geometry.mute.right).toBeLessThanOrEqual(geometry.arena.right + 1);
    await page.locator('#mute').click();
    await expect(page.locator('#mute')).toHaveAttribute('aria-pressed', 'true');
    await page.screenshot({ path: testInfo.outputPath('arena.png'), fullPage: true });
    expect(errors).toEqual([]);
  });
}

test('browser inputs reach authority; HUD and leave/rejoin reflect server state', async ({ page }) => {
  const observer = await new Client('ws://127.0.0.1:2569').joinOrCreate(ROOM_NAME, { version: VERSION });
  let snapshot: Snapshot | undefined;
  observer.onMessage<Snapshot>('snapshot', value => { snapshot = value; });
  try {
    await page.goto('/');
    await expect(page.locator('#connection-status')).toContainText('You are cyan');
    await expect(page.locator('#active-count')).toHaveText('2/8 players');
    await expect.poll(() => snapshot?.players.filter(p => !p.bot && p.connected).length).toBe(2);
    const player = () => snapshot!.players.find(p => !p.bot && p.id !== observer.sessionId && p.connected)!;
    const id = player().id;
    const before = { x: player().x, y: player().y };
    await page.keyboard.down('d');
    try {
      await expect.poll(() => Math.hypot(player().x - before.x, player().y - before.y), { timeout: 3000 }).toBeGreaterThan(10);
    } finally { await page.keyboard.up('d'); }
    const arena = await page.locator('.arena-wrap').boundingBox();
    await page.mouse.click(arena!.x + arena!.width * .6, arena!.y + arena!.height * .5);
    await expect.poll(() => snapshot?.events.some(e => e.kind === 'shot' && e.actorId === id)).toBe(true);
    await expect.poll(async () => Number(await page.locator('#health-meter').getAttribute('aria-valuenow'))).toBeGreaterThan(0);
    await page.locator('#leave').click();
    await expect(page.locator('#connection-status')).toContainText('Paused');
    await expect(page.locator('#join')).toBeVisible();
    await expect.poll(() => snapshot?.players.find(p => p.id === id)?.connected).toBe(false);
    await page.locator('#join').click();
    await expect(page.locator('#connection-status')).toContainText('You are cyan');
    await expect.poll(() => snapshot?.players.find(p => p.id === id)?.connected).toBe(true);
    await expect(page.locator('#scoreboard tr.local')).toContainText('YOU');
  } finally { await observer.leave(); }
});
