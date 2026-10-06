import { test, expect } from '@playwright/test';
import { Client } from '@colyseus/sdk';
import { ROOM_NAME, VERSION, type Snapshot } from '@shootball/protocol';

for (const viewport of [{ width: 2560, height: 1440 }, { width: 1920, height: 1080 }, { width: 1366, height: 768 }, { width: 800, height: 600 }, { width: 390, height: 844 }]) {
  test(`live HUD fits ${viewport.width}x${viewport.height}`, async ({ page }, testInfo) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.setViewportSize(viewport);
    await page.goto('/');
    await page.getByRole('button', { name: 'Play as Guest', exact: true }).click();
    await expect(page.locator('#connection-status')).toContainText('Arena \u00b7 Connected');
    await expect(page.locator('#scoreboard tr.local')).toContainText('YOU');
    await expect(page.locator('#health-value')).toHaveText(/\d+/);
    const geometry = await page.evaluate(() => {
      const box = (selector: string) => {
        const r = document.querySelector(selector)!.getBoundingClientRect();
        return { x: r.x, y: r.y, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
      };
      return { header: box('.game-header'), field: box('#game'), arena: box('.arena-wrap'), sidebar: box('aside'), canvas: box('canvas'), health: box('#health-meter'), mute: box('#mute'),
        width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight };
    });
    expect(geometry.width).toBeLessThanOrEqual(viewport.width);
    expect(geometry.height).toBeLessThanOrEqual(viewport.height);
    // The full available rectangle is used, with no letterboxing or stretched canvas.
    expect(geometry.arena.y - geometry.header.bottom).toBeLessThanOrEqual(8);
    expect(Math.abs(geometry.canvas.x - geometry.field.x)).toBeLessThan(2);
    expect(Math.abs(geometry.canvas.y - geometry.field.y)).toBeLessThan(2);
    expect(Math.abs(geometry.canvas.width - geometry.field.width)).toBeLessThan(2);
    expect(Math.abs(geometry.canvas.height - geometry.field.height)).toBeLessThan(2);
    expect(geometry.arena.bottom - geometry.field.bottom).toBe(48);
    if (viewport.width > 1100) {
      expect(geometry.sidebar.x - geometry.arena.right).toBeLessThanOrEqual(8);
      expect(geometry.sidebar.width).toBeLessThanOrEqual(330);
      expect(Math.abs(geometry.sidebar.y - geometry.arena.y)).toBeLessThan(2);
      expect(Math.abs(geometry.sidebar.bottom - geometry.arena.bottom)).toBeLessThan(2);
      expect(viewport.height - geometry.arena.bottom).toBeLessThanOrEqual(8);
      expect(viewport.width - geometry.sidebar.right).toBeLessThanOrEqual(8);
    } else {
      expect(geometry.sidebar.y).toBeGreaterThanOrEqual(geometry.arena.bottom - 1);
      expect(viewport.height - geometry.sidebar.bottom).toBeLessThanOrEqual(8);
    }
    expect(geometry.health.x).toBeGreaterThanOrEqual(geometry.arena.x);
    expect(geometry.mute.right).toBeLessThanOrEqual(geometry.arena.right + 1);
    const beforeHelp = await page.locator('.arena-wrap').boundingBox();
    await expect(page.locator('#help-widget')).toHaveAttribute('open', '');
    await expect(page.locator('.help-content')).toBeVisible();
    expect(await page.locator('.arena-wrap').boundingBox()).toEqual(beforeHelp);
    await expect(page.locator('#scan')).toBeVisible();
    const overflow = await page.evaluate(() => {
      const selectors = ['aside', '.help-content', '.scores', '.round-panel', '.feed-panel', '.control-list'];
      return selectors.flatMap(selector => {
        const node = document.querySelector<HTMLElement>(selector)!;
        return node.scrollWidth > node.clientWidth + 1 ? [`${selector}: ${node.scrollWidth} > ${node.clientWidth}`] : [];
      });
    });
    expect(overflow).toEqual([]);
    const helpBox = await page.locator('#help-widget').boundingBox();
    if (viewport.width > 1100) {
      expect(helpBox!.x + helpBox!.width).toBeLessThanOrEqual(geometry.arena.x);
      expect(Math.abs(helpBox!.y - geometry.arena.y)).toBeLessThan(2);
    } else {
      expect(helpBox!.y).toBeGreaterThanOrEqual(geometry.arena.bottom);
      const content = await page.locator('.help-content').boundingBox();
      expect(content!.y).toBeGreaterThanOrEqual(geometry.arena.bottom);
    }
    await page.screenshot({ path: testInfo.outputPath('help.png'), fullPage: true });
    await page.getByRole('button', { name: 'Close controls and abilities' }).click();
    await expect(page.locator('.help-content')).toBeHidden();
    expect(await page.locator('.arena-wrap').boundingBox()).toEqual(beforeHelp);
    await page.locator('#help-widget summary').click();
    await expect(page.locator('.help-content')).toBeVisible();
    expect(await page.locator('.arena-wrap').boundingBox()).toEqual(beforeHelp);
    await page.locator('#mute').click();
    await expect(page.locator('#mute')).toHaveAttribute('aria-pressed', 'true');
    await page.screenshot({ path: testInfo.outputPath('arena.png'), fullPage: true });
    expect(errors).toEqual([]);
  });
}

test('browser inputs reach authority; HUD and leave/rejoin reflect server state', async ({ page }, testInfo) => {
  const observer = await new Client('ws://127.0.0.1:2569').joinOrCreate(ROOM_NAME, { version: VERSION });
  let snapshot: Snapshot | undefined;
  observer.onMessage<Snapshot>('snapshot', value => { snapshot = value; });
  try {
    await page.goto('/');
    await page.getByRole('button', { name: 'Play as Guest', exact: true }).click();
    await expect(page.locator('#connection-status')).toContainText('Arena \u00b7 Connected');
    await expect(page.locator('#active-count')).toHaveText('2/8 players');
    await expect.poll(() => snapshot?.players.filter(p => !p.bot && p.connected).length).toBe(2);
    const player = () => snapshot!.players.find(p => !p.bot && p.id !== observer.sessionId && p.connected)!;
    const id = player().id;
    const before = { x: player().x, y: player().y };
    await page.keyboard.down('d');
    try {
      await expect.poll(() => Math.hypot(player().x - before.x, player().y - before.y), { timeout: 3000 }).toBeGreaterThan(10);
    } finally { await page.keyboard.up('d'); }
    await expect(page.locator('#stamina')).toBeHidden();
    await page.keyboard.down('Shift');
    await page.keyboard.down('d');
    try {
      await expect.poll(() => player().sprinting).toBe(true);
      await expect(page.locator('#stamina')).toBeVisible();
      await expect.poll(() => player().stamina).toBeLessThan(100);
      await expect.poll(async () => Number(await page.locator('#stamina-meter').getAttribute('aria-valuenow'))).toBeLessThan(100);
      const bar = await page.locator('#stamina').boundingBox();
      const stage = await page.locator('.arena-wrap').boundingBox();
      expect(Math.abs(bar!.x + bar!.width / 2 - (stage!.x + stage!.width / 2))).toBeLessThan(2);
      expect(bar!.y).toBeGreaterThan(stage!.y + stage!.height * 0.7);
      await page.screenshot({ path: testInfo.outputPath('sprint-stamina.png'), fullPage: true });
    } finally { await page.keyboard.up('Shift'); await page.keyboard.up('d'); }
    await expect.poll(() => player().sprinting).toBe(false);
    await expect(page.locator('#stamina')).toBeHidden();
    const arena = await page.locator('.arena-wrap').boundingBox();
    await page.mouse.click(arena!.x + arena!.width * .6, arena!.y + arena!.height * .5);
    await expect.poll(() => snapshot?.events.some(e => e.kind === 'shot' && e.actorId === id)).toBe(true);
    await expect.poll(async () => Number(await page.locator('#health-meter').getAttribute('aria-valuenow'))).toBeGreaterThan(0);
    await page.locator('#leave').click();
    await expect(page.locator('#connection-status')).toContainText('Paused');
    await expect(page.locator('#join')).toBeVisible();
    await expect.poll(() => snapshot?.players.find(p => p.id === id)?.connected).toBe(false);
    await page.locator('#join').click();
    await expect(page.locator('#connection-status')).toContainText('Arena \u00b7 Connected');
    await expect.poll(() => snapshot?.players.find(p => p.id === id)?.connected).toBe(true);
    await expect(page.locator('#scoreboard tr.local')).toContainText('YOU');
  } finally { await observer.leave(); }
});

test('live gameplay fills its container after resizing without reconnecting', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  let sockets = 0;
  page.on('websocket', socket => { if (new URL(socket.url()).port === '2569') sockets++; });
  await page.goto('/'); await page.locator('#guest-play').click();
  await expect(page.locator('#connection-status')).toContainText('Connected');
  for (const viewport of [{ width: 1920, height: 1080 }, { width: 2560, height: 1440 }, { width: 390, height: 844 }, { width: 800, height: 600 }]) {
    await page.setViewportSize(viewport);
    await expect.poll(async () => page.evaluate(() => {
      const parent = document.querySelector('#game')!.getBoundingClientRect();
      const canvas = document.querySelector('canvas')!.getBoundingClientRect();
      return Math.max(Math.abs(parent.width - canvas.width), Math.abs(parent.height - canvas.height));
    })).toBeLessThan(2);
    await expect(page.locator('#connection-status')).toContainText('Connected');
    await expect(page.locator('#scoreboard tr.local')).toContainText('YOU');
  }
  expect(sockets).toBe(1);
  expect(errors).toEqual([]);
});
